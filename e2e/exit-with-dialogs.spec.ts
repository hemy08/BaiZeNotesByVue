/**
 * E2E：对话框 / 工具窗的关闭与「应用退出时清理」验证（用户反馈 2026-11-27）。
 *
 * 覆盖两条链路（真实主进程 + 真实窗口 + 隔离临时工作区）：
 * 1. 各类浮层自身能正常关闭：主题设置对话框（关闭按钮）、命令面板（Esc）、
 *    非模态工具窗（关闭按钮）——关闭后 overlay 彻底移除、无残留拦截层；
 * 2. 多浮层同时打开时退出应用（`app.quit()` → before-quit flush 协议）：
 *    应用必须在超时内正常退出，不挂起、不阻塞（退出与浮层状态解耦）。
 *
 * 隔离：Electron userData 重定向临时目录（show-welcome=false 种子）；home 下真实配置目录
 * 由 ConfigSandbox 备份/恢复；临时 profile 用例结束删除。
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedUserDataConfig
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import { launchToMainView, openMenuSubmenu, recordStartupMetrics } from './helpers/app-ui'
import type { MainViewLaunch } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 应用退出超时（含 before-quit flush + 窗口销毁；通常 < 3s，留足余量） */
const EXIT_TIMEOUT_MS = 15_000

/** 启动主界面 + 隔离配置；返回清理函数 */
async function launchIsolated(description: string): Promise<{
    launch: MainViewLaunch
    profile: TempProfile
    sandbox: ConfigSandbox
    cleanup: () => Promise<void>
}> {
    const profile = createTempProfile('baize-e2e-exit-dialogs-')
    const sandbox = createConfigSandbox(profile)
    sandbox.seed()
    seedUserDataConfig(profile, 'show-welcome', false)
    const launch = await launchToMainView(profile)
    recordStartupMetrics(launch.launched, test.info(), description, {
        compensationReloads: launch.compensationReloads
    })
    const cleanup = async (): Promise<void> => {
        await launch.app.close().catch(() => undefined)
        // 等待 Electron 释放单实例锁（与既有 spec 同口径）
        await new Promise((resolve) => setTimeout(resolve, 1_000))
        sandbox.restore()
        profile.cleanup()
    }
    return { launch, profile, sandbox, cleanup }
}

/** 断言当前没有可见的对话框遮罩层 */
async function expectNoVisibleOverlay(page: import('@playwright/test').Page): Promise<void> {
    await expect.poll(() => page.locator('.dialog-overlay').count(), { timeout: 10_000 }).toBe(0)
}

test.describe('对话框与工具窗关闭 / 退出清理', () => {
    test('各类浮层可正常关闭且无残留（关闭按钮 / Esc）', async () => {
        test.setTimeout(120_000)
        const { launch, cleanup } = await launchIsolated('浮层关闭-浅色')
        const { page } = launch
        try {
            // 1) 对话框：设置 → 主题设置，点关闭按钮
            await openMenuSubmenu(page, '设置', '主题设置')
            await expect(page.locator('.dialog-overlay .dialog-container').first()).toBeVisible({
                timeout: 15_000
            })
            await page.locator('.dialog-overlay .close-btn').first().click()
            await expectNoVisibleOverlay(page)

            // 2) 命令面板：编辑 → 命令面板，Esc 关闭
            await openMenuSubmenu(page, '编辑', '命令面板')
            await expect(page.locator('.command-palette')).toBeVisible({ timeout: 10_000 })
            await page.keyboard.press('Escape')
            await expect
                .poll(() => page.locator('.command-palette').count(), { timeout: 10_000 })
                .toBe(0)

            // 3) 非模态工具窗：工具 → 特殊字体，关闭按钮关闭（Esc 在工具窗焦点语义下也可关）
            await openMenuSubmenu(page, '工具', '特殊字体')
            const toolWindow = page.locator(
                '.dialog-container--tool-window, [data-dialog-shell="tool-window"]'
            )
            await expect(toolWindow.first()).toBeVisible({ timeout: 15_000 })
            await page.locator('.dialog-overlay .close-btn').last().click()
            await expectNoVisibleOverlay(page)

            // 关闭后主界面仍可交互（无幽灵拦截层）
            await expect(page.locator('.menu-bar .menu-item').first()).toBeVisible({
                timeout: 10_000
            })
        } finally {
            await cleanup()
        }
    })

    test('多浮层同时打开时退出应用：正常退出、无挂起', async () => {
        test.setTimeout(120_000)
        const { launch, cleanup } = await launchIsolated('退出清理-多浮层')
        const { app, page } = launch
        let quitIssued = false
        try {
            // 依次打开 3 类浮层（后开覆盖前开；真实菜单链路）
            await openMenuSubmenu(page, '设置', '主题设置')
            await expect(page.locator('.dialog-overlay .dialog-container').first()).toBeVisible({
                timeout: 15_000
            })

            await page.keyboard.press('Escape')
            await openMenuSubmenu(page, '编辑', '命令面板')
            await expect(page.locator('.command-palette')).toBeVisible({ timeout: 10_000 })
            await page.keyboard.press('Escape')

            await openMenuSubmenu(page, '工具', '特殊字体')
            await expect(
                page
                    .locator('.dialog-container--tool-window, [data-dialog-shell="tool-window"]')
                    .first()
            ).toBeVisible({ timeout: 15_000 })

            // 真实退出链路：app.quit() → before-quit flush → 窗口 close 放行
            quitIssued = true
            // 退出前捕获子进程句柄（app 关闭后 app.process() 会失效）
            const appProcess = app.process()
            // Playwright 的 evaluate 在应用退出瞬间可能因连接断开而 reject，属预期
            await app.evaluate(({ app: electronApp }) => electronApp.quit()).catch(() => undefined)
            const closed = await Promise.race([
                app.waitForEvent('close').then(() => true),
                new Promise<boolean>((resolve) => setTimeout(() => resolve(false), EXIT_TIMEOUT_MS))
            ])
            expect(closed, `应用在 ${EXIT_TIMEOUT_MS}ms 内未正常退出（疑似浮层阻塞退出链路）`).toBe(
                true
            )
            // 进程应已退出（无残留后台进程）
            expect(appProcess.exitCode, '应用进程应已退出').not.toBeNull()
        } finally {
            if (!quitIssued) {
                await cleanup()
            }
        }
    })
})
