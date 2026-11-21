/**
 * E2E：通用应用内消息/确认对话框链路（2026-11-21 原生 dialog.showMessageBox → 应用内）
 *
 * 覆盖链路（真实主进程 + 真实窗口 + 隔离临时工作区，无需网络/原生对话框）：
 *   临时「大文件」（>5MB）→ 最近文件白名单链路真实触发打开（OPEN_RECENT → 读盘前大小检查）
 *   → 主进程 showAppMessageBox() 经 IPC.DIALOG.APP_MESSAGE_REQUEST 请求渲染层
 *   → 应用内 BaseDialog（AppMessageDialog）出现（标题/正文/双按钮/默认焦点）
 *   → Esc = 取消（cancelId）：文件不打开、应用内框收起（应用继续可用）
 *   → 再次触发 →「继续打开」：文件真实读取并显示在状态栏（链路放行）。
 *
 * 为什么选大文件打开：该确认由真实业务链路触发（不依赖更新服务器网络、不依赖原生文件
 * 选择框），且可重复触发；自动更新「未配置更新源」提示依赖 dev-app-update.yml 指向真实
 * GitHub 地址（会发起网络请求），不适合作为稳定 E2E 触发源。
 *
 * 隔离：Electron userData 重定向临时目录（show-welcome=false 种子）；大文件与打开记录都在
 * 临时目录，用例结束整体删除；home 下真实配置目录由 ConfigSandbox 备份/恢复。
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

/** 大文件阈值（LARGE_FILE_THRESHOLD = 5MB）；+1 字节确保进入确认分支 */
const LARGE_FILE_SIZE = 5 * 1024 * 1024 + 1
/** 大文件首行标记（确认「继续打开」后 Monaco 应加载到该内容） */
const FILE_MARKER = 'BAIZE_E2E_APP_MESSAGE_BOX_LARGE_FILE_20261121'

interface AppMessageScenario {
    app: ElectronApplication
    page: Page
    largeFile: string
    profile: TempProfile
    sandbox: ConfigSandbox
}

/** 启动应用进入主界面，种入一个 >5MB 的最近文件（暂不打开） */
async function prepareLargeRecentFile(description: string): Promise<AppMessageScenario> {
    const profile = createTempProfile('baize-e2e-app-message-')
    const sandbox = createConfigSandbox(profile)
    sandbox.seed()

    const workspaceDir = path.join(profile.root, 'workspace')
    fs.mkdirSync(workspaceDir, { recursive: true })
    const largeFile = path.join(workspaceDir, 'note-large-file-e2e.md')
    // 首行标记 + 填充至超过 5MB（超大单行会让 Monaco/预览压力过大，用等宽行铺满）
    const line = `${FILE_MARKER} 大文件确认链路填充行 0123456789 abcdefghij\n`
    const repeat = Math.ceil(LARGE_FILE_SIZE / Buffer.byteLength(line, 'utf-8')) + 1
    fs.writeFileSync(largeFile, line.repeat(repeat), 'utf-8')
    expect(fs.statSync(largeFile).size).toBeGreaterThan(LARGE_FILE_SIZE)

    seedUserDataConfig(profile, 'show-welcome', false)
    seedFileState(profile, { recentFiles: [largeFile] })

    const { app, page, launched, compensationReloads } = await launchToMainView(profile)
    recordStartupMetrics(launched, test.info(), description, { compensationReloads })
    return { app, page, largeFile, profile, sandbox }
}

/** 触发打开最近文件（不 await：主进程会等待应用内确认框选择，invoke 选择后才返回） */
function triggerOpenRecentFile(page: Page, filePath: string): Promise<{ ok: boolean }> {
    return openRecentViaApi(page, { kind: 'file', path: filePath })
}

/** 等待应用内消息框出现 */
async function waitForAppMessageDialog(page: Page) {
    const dialog = page.locator('.app-message-dialog')
    await expect(dialog).toBeVisible({ timeout: 30_000 })
    return dialog
}

/** 清理启动场景（应用可能已退出，close 需容错） */
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

test.describe('应用内消息/确认对话框（大文件打开确认链路）', () => {
    test('大文件确认框展示 + Esc 取消：文件不打开，应用继续可用', async () => {
        const scenario = await prepareLargeRecentFile('应用内消息框-取消')
        const { app, page, largeFile } = scenario
        try {
            const openPromise = triggerOpenRecentFile(page, largeFile)
            const dialog = await waitForAppMessageDialog(page)

            // 1) 应用内 BaseDialog（非原生框）语义：标题/正文/双按钮/ARIA
            await expect(dialog.locator('.title-text')).toHaveText('大文件提示')
            await expect(dialog.locator('.message')).toContainText('文件大小为')
            await expect(dialog.locator('[data-button-id="continue"]')).toHaveText('继续打开')
            await expect(dialog.locator('[data-button-id="cancel"]')).toHaveText('取消')
            await expect(dialog).toHaveAttribute('role', 'dialog')
            await expect(dialog).toHaveAttribute('aria-modal', 'true')

            // 默认焦点在「继续打开」（与历史原生框 defaultId=0 语义一致）
            await expect
                .poll(
                    () =>
                        page.evaluate(
                            () => document.activeElement?.getAttribute('data-button-id') ?? null
                        ),
                    { timeout: 10_000 }
                )
                .toBe('continue')

            // 2) Esc = 取消（cancelId）：应用内框收起，文件未打开，应用继续运行
            await page.keyboard.press('Escape')
            await expect(dialog).toHaveCount(0)
            await expect(openPromise).resolves.toEqual({ ok: true })
            await expect(page.locator('#status-bar-file-path')).not.toContainText(
                'note-large-file-e2e.md'
            )
            const windowsAfterCancel = await app.evaluate(({ BrowserWindow }) => {
                const windows = BrowserWindow.getAllWindows()
                return { count: windows.length, destroyed: windows[0]?.isDestroyed() ?? true }
            })
            expect(windowsAfterCancel.count).toBe(1)
            expect(windowsAfterCancel.destroyed).toBe(false)
        } finally {
            await cleanupScenario(app, scenario.sandbox, scenario.profile)
        }
    })

    test('再次触发并选择「继续打开」：文件真实打开（确认结果放行业务动作）', async () => {
        const scenario = await prepareLargeRecentFile('应用内消息框-继续打开')
        const { app, page, largeFile } = scenario
        try {
            const openPromise = triggerOpenRecentFile(page, largeFile)
            const dialog = await waitForAppMessageDialog(page)

            await dialog.locator('[data-button-id="continue"]').click()
            await expect(dialog).toHaveCount(0)
            await expect(openPromise).resolves.toEqual({ ok: true })

            // 确认结果被主进程消费：文件读取完成并显示在状态栏
            await expect(page.locator('#status-bar-file-path')).toContainText(
                'note-large-file-e2e.md',
                { timeout: 60_000 }
            )
        } finally {
            await cleanupScenario(app, scenario.sandbox, scenario.profile)
        }
    })
})
