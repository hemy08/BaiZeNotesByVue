/**
 * E2E：关闭窗口时的「未保存修改」应用内确认框（2026-11-20 原生 dialog → BaseDialog 改造）
 *
 * 覆盖链路（真实主进程 + 真实窗口 + 隔离临时工作区）：
 *   临时 md 文件 → 最近文件白名单链路真实打开（OPEN_RECENT → 读盘 → Monaco 显示）
 *   → 在 Monaco 中真实键入编辑（未保存）→ 主进程 BrowserWindow.close() 触发关闭协议
 *   → 渲染层应用内确认框出现（标题/三按钮/默认焦点）
 *   → 「取消」保持窗口与编辑状态 → 再次关闭 →「不保存」退出且磁盘未写入修改；
 *   另一用例验证「保存并关闭」：退出且磁盘写入修改。
 *
 * 为什么可自动化：关闭事件经 Electron 主进程 `BrowserWindow.close()` 驱动（与用户点窗口
 * 关闭按钮走同一 close 协议）；未保存状态由 Monaco 真实键入产生（与 file-open-save 用例
 * 同一链路），不依赖原生文件对话框/原生确认框，因此可稳定断言。
 *
 * 隔离：Electron userData 重定向临时目录（show-welcome=false 种子）；md 文件与打开记录
 * 都在临时目录，用例结束整体删除；home 下真实配置目录由 ConfigSandbox 备份/恢复。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedFileState,
    seedUserDataConfig
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import { launchToMainView, openRecentViaApi, recordStartupMetrics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 初始文件内容（磁盘基线） */
const INITIAL_MARKER = 'BAIZE_E2E_CLOSE_CONFIRM_INITIAL_20261120'
/** 编辑后键入标记（未保存修改；仅「保存并关闭」后应出现在磁盘） */
const EDITED_MARKER = 'BAIZE_E2E_CLOSE_CONFIRM_EDITED_20261120'

interface CloseConfirmScenario {
    app: ElectronApplication
    page: Page
    targetFile: string
    description: string
}

/** 启动应用进入主界面、打开临时 md 并在 Monaco 中键入未保存修改 */
async function prepareUnsavedDocument(
    description: string
): Promise<CloseConfirmScenario & { profile: TempProfile; sandbox: ConfigSandbox }> {
    const profile = createTempProfile('baize-e2e-close-confirm-')
    const sandbox = createConfigSandbox(profile)
    sandbox.seed()

    const workspaceDir = path.join(profile.root, 'workspace')
    fs.mkdirSync(workspaceDir, { recursive: true })
    const targetFile = path.join(workspaceDir, 'note-close-confirm-e2e.md')
    fs.writeFileSync(
        targetFile,
        `# 关闭确认样例\n\n${INITIAL_MARKER}\n\n- 关闭时未保存修改应弹应用内确认框\n`,
        'utf-8'
    )
    seedUserDataConfig(profile, 'show-welcome', false)
    seedFileState(profile, { recentFiles: [targetFile] })

    const { app, page, launched, compensationReloads } = await launchToMainView(profile)
    // P1-4：所有功能 spec 启动后统一记录启动指标（annotation + console）
    recordStartupMetrics(launched, test.info(), description, { compensationReloads })

    try {
        const openResult = await openRecentViaApi(page, { kind: 'file', path: targetFile })
        expect(openResult.ok, `打开最近文件失败：${openResult.message ?? '未知原因'}`).toBe(true)

        await expect(page.locator('#status-bar-file-path')).toContainText(
            'note-close-confirm-e2e.md',
            { timeout: 30_000 }
        )
        const monacoLines = page.locator('#monaco-editor-container .monaco-editor .view-lines')
        await expect(monacoLines.first()).toBeVisible({ timeout: 30_000 })
        await expect(monacoLines.first()).toContainText(INITIAL_MARKER, { timeout: 30_000 })

        // 真实键入未保存修改（内容经编辑器同步通道到达主进程 → appState 脏标记）
        await monacoLines.first().click()
        await page.keyboard.press('End')
        await page.keyboard.type(` ${EDITED_MARKER} `)
        await expect(monacoLines.first()).toContainText(EDITED_MARKER, { timeout: 15_000 })
        await expect(page.locator('#status-bar-file-path')).toHaveClass(/unsaved/, {
            timeout: 15_000
        })

        return { app, page, targetFile, description, profile, sandbox }
    } catch (error) {
        await app.close().catch(() => undefined)
        sandbox.restore()
        profile.cleanup()
        throw error
    }
}

/** 经主进程触发窗口关闭（与用户点关闭按钮同一 close 协议） */
async function triggerWindowClose(app: ElectronApplication): Promise<void> {
    await app.evaluate(({ BrowserWindow }) => {
        BrowserWindow.getAllWindows()[0]?.close()
    })
}

/** 读取磁盘文件内容 */
function readDiskFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
}

/** 清理启动场景（应用可能已随「保存/不保存」退出，close 需容错） */
async function cleanupScenario(
    app: ElectronApplication | undefined,
    sandbox: ConfigSandbox | undefined,
    profile: TempProfile | undefined
): Promise<void> {
    await app?.close().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    sandbox?.restore()
    profile?.cleanup()
}

test.describe('关闭窗口未保存确认（应用内对话框）', () => {
    test('取消保持窗口；再次关闭选择不保存后退出且磁盘未写入修改', async () => {
        const scenario = await prepareUnsavedDocument('关闭确认-取消与不保存')
        const { app, page, targetFile } = scenario
        try {
            // 1) 主进程关闭协议 → 渲染层应用内对话框（非原生框）
            await triggerWindowClose(app)
            const dialog = page.locator('.unsaved-close-dialog')
            await expect(dialog).toBeVisible({ timeout: 20_000 })
            await expect(dialog.locator('.title-text')).toHaveText('未保存的修改')
            await expect(dialog.locator('.btn-save')).toHaveText('保存并关闭')
            await expect(dialog.locator('.btn-discard')).toHaveText('不保存')
            await expect(dialog.locator('.btn-cancel')).toHaveText('取消')

            // 默认焦点在「保存并关闭」（与旧原生框 defaultId=0 语义一致）
            await expect
                .poll(
                    () =>
                        page.evaluate(
                            () => document.activeElement?.classList.contains('btn-save') ?? false
                        ),
                    { timeout: 10_000 }
                )
                .toBe(true)

            // 2) 「取消」= 不关闭：对话框收起、窗口仍存在且可见
            await dialog.locator('.btn-cancel').click()
            await expect(dialog).toHaveCount(0)
            const windowAfterCancel = await app.evaluate(({ BrowserWindow }) => {
                const windows = BrowserWindow.getAllWindows()
                return {
                    count: windows.length,
                    visible: windows[0]?.isVisible() ?? false,
                    destroyed: windows[0]?.isDestroyed() ?? true
                }
            })
            expect(windowAfterCancel.count).toBe(1)
            expect(windowAfterCancel.visible).toBe(true)
            expect(windowAfterCancel.destroyed).toBe(false)

            // 3) 再次触发关闭 → 选择「不保存」→ 应用退出；磁盘保持初始内容（丢弃修改）
            await triggerWindowClose(app)
            await expect(dialog).toBeVisible({ timeout: 20_000 })
            const closed = app.waitForEvent('close')
            await dialog.locator('.btn-discard').click()
            await closed

            const diskContent = readDiskFile(targetFile)
            expect(diskContent).toContain(INITIAL_MARKER)
            expect(diskContent).not.toContain(EDITED_MARKER)
        } finally {
            await cleanupScenario(app, scenario.sandbox, scenario.profile)
        }
    })

    test('「保存并关闭」：先保存成功再退出，磁盘写入修改', async () => {
        const scenario = await prepareUnsavedDocument('关闭确认-保存并关闭')
        const { app, page, targetFile } = scenario
        try {
            await triggerWindowClose(app)
            const dialog = page.locator('.unsaved-close-dialog')
            await expect(dialog).toBeVisible({ timeout: 20_000 })

            const closed = app.waitForEvent('close')
            await dialog.locator('.btn-save').click()
            await closed

            // 退出后磁盘内容包含编辑标记（保存动作在主进程 close 协议内完成）
            await expect
                .poll(() => readDiskFile(targetFile), { timeout: 15_000 })
                .toContain(EDITED_MARKER)
            const diskContent = readDiskFile(targetFile)
            expect(diskContent).toContain(INITIAL_MARKER)
        } finally {
            await cleanupScenario(app, scenario.sandbox, scenario.profile)
        }
    })

    test('退出流程（before-quit）语义一致：同样弹应用内对话框，取消后应用继续运行', async () => {
        const scenario = await prepareUnsavedDocument('关闭确认-退出流程')
        const { app, page } = scenario
        try {
            // 主进程退出（app.quit）→ before-quit 协议拦截并请求渲染层确认
            await app.evaluate(({ app: electronApp }) => {
                electronApp.quit()
            })
            const dialog = page.locator('.unsaved-close-dialog')
            await expect(dialog).toBeVisible({ timeout: 20_000 })

            // 取消退出：应用继续运行（isQuitting 已复位），窗口仍在
            await dialog.locator('.btn-cancel').click()
            await expect(dialog).toHaveCount(0)
            const stateAfterCancel = await app.evaluate(({ BrowserWindow }) => {
                const windows = BrowserWindow.getAllWindows()
                return { count: windows.length, visible: windows[0]?.isVisible() ?? false }
            })
            expect(stateAfterCancel.count).toBe(1)
            expect(stateAfterCancel.visible).toBe(true)

            // 再走窗口关闭 +「不保存」正常退出（证明取消后关闭协议的放行链路仍可用）
            await triggerWindowClose(app)
            await expect(dialog).toBeVisible({ timeout: 20_000 })
            const closed = app.waitForEvent('close')
            await dialog.locator('.btn-discard').click()
            await closed
        } finally {
            await cleanupScenario(app, scenario.sandbox, scenario.profile)
        }
    })
})
