/**
 * E2E：系统设置保存与跨重启持久化
 *
 * 覆盖链路（真实主进程 + 真实窗口 + 隔离用户数据）：
 *   启动即主界面（预置 show-welcome=false）→ 打开「设置 → 系统设置」对话框
 *   → 勾选「启动时自动打开上次文件」→ 点「确定」→ 主进程 config:write('system')
 *   → electron-store 落盘 systemSetting.json → 关闭应用
 *   → 重新启动 → 经 preload 桥读取主进程配置，并再次打开设置对话框校验界面上回填的值。
 *
 * 隔离：
 * - Electron userData（show-welcome 等裸 JSON、fileState）重定向到临时目录；
 * - home 下真实配置目录（systemSetting.json）由 ConfigSandbox 备份 → 清空 → finally 恢复。
 *
 * 已知遗留缺陷（P0 E2E 探测发现，属业务代码问题、本轮不改业务代码）：
 * 设置对话框由 lazyDialog 包装（首次 visible=true 时才挂载异步组件），而
 * SystemSettingDialog 的 `watch(() => props.visible, ...)` 未设置 immediate——组件首次挂载时
 * visible 已经是 true，watch 不会触发 loadSettings()，导致**首次打开对话框展示的是默认值**
 * 而非持久化值；关闭后第二次打开才会回填。本用例的持久化断言以「主进程 store 真源 +
 * 磁盘文件 + 第二次打开的回填」为准，首个「首次打开即回填」的期望以 test.fixme 记录，待业务修复。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    launchDevApp,
    seedSystemSetting,
    seedUserDataConfig
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 设置项在「通用设置」页签中的文案（与 zh-CN i18n 真源一致） */
const AUTO_OPEN_LAST_FILE_LABEL = '启动时自动打开上次文件'
/** 系统设置对话框底部「确定」按钮（common.ok） */
const DIALOG_CONFIRM_SELECTOR = 'button.btn-confirm'

/** 打开「设置 → 系统设置」对话框，返回对话框容器 */
async function openSystemSettingDialog(page: Page): Promise<Locator> {
    await page.locator('.menu-bar .menu-item').filter({ hasText: '设置' }).first().click()
    await page
        .locator('.submenu-container .menu-submenu-item')
        .filter({ hasText: '系统设置' })
        .first()
        .click()
    const dialog = page
        .locator('.dialog-overlay .dialog-container')
        .filter({ hasText: '系统设置' })
        .first()
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    return dialog
}

/** 按设置项文案定位复选框 */
function settingCheckbox(dialog: Locator, label: string): Locator {
    return dialog
        .locator('.setting-row')
        .filter({ hasText: label })
        .locator('input.setting-checkbox')
}

/** 读取磁盘上的系统设置（真实配置目录内的 systemSetting.json） */
function readSystemSettingFile(sandbox: ConfigSandbox): Record<string, unknown> | null {
    const file = path.join(sandbox.configDir, 'systemSetting.json')
    if (!fs.existsSync(file)) {
        return null
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
    } catch {
        return null
    }
}

/** 启动应用并等待主界面（预置 show-welcome=false，便于操作菜单/对话框） */
async function launchToMainView(
    profile: TempProfile
): Promise<{ app: ElectronApplication; page: Page }> {
    const app = await launchDevApp(profile)
    const page = await app.firstWindow()
    await page.waitForLoadState('domcontentloaded')
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 60_000 })
    return { app, page }
}

test.describe('系统设置保存与持久化', () => {
    test('修改设置 → 确定 → 落盘 → 重启后主进程配置与对话框均持久化', async () => {
        const profile = createTempProfile('baize-e2e-settings-')
        const sandbox = createConfigSandbox(profile)
        let app2: ElectronApplication | undefined
        try {
            sandbox.seed()
            // 启动即主界面：欢迎页不提供菜单栏，设置对话框需在主界面打开
            seedUserDataConfig(profile, 'show-welcome', false)

            // ===== 第一次启动：打开设置 → 修改 → 确定 → 落盘 =====
            let app: ElectronApplication | undefined
            try {
                const launched = await launchToMainView(profile)
                app = launched.app
                const { page } = launched

                const dialog = await openSystemSettingDialog(page)
                const checkbox = settingCheckbox(dialog, AUTO_OPEN_LAST_FILE_LABEL)
                await expect(checkbox).not.toBeChecked()
                await checkbox.click()
                await expect(checkbox).toBeChecked()
                await dialog.locator(DIALOG_CONFIRM_SELECTOR).click()
                await expect(dialog).toBeHidden({ timeout: 15_000 })

                // 落盘断言：主进程 electron-store 同步写 systemSetting.json
                await expect
                    .poll(() => readSystemSettingFile(sandbox)?.autoOpenLastFile, {
                        timeout: 15_000,
                        message: 'systemSetting.json 未落盘 autoOpenLastFile=true'
                    })
                    .toBe(true)
            } finally {
                await app?.close().catch(() => undefined)
            }

            // ===== 第二次启动：验证跨重启持久化 =====
            const launched = await launchToMainView(profile)
            app2 = launched.app
            const { page } = launched

            // 1) preload 桥读取主进程 store 真源（config:read('system')）应返回修改后的值
            const persisted = await page.evaluate(async () => {
                const api = (
                    window as unknown as {
                        api: { config: { read: (name: string) => Promise<unknown> } }
                    }
                ).api
                return (await api.config.read('system')) as { autoOpenLastFile?: boolean }
            })
            expect(persisted.autoOpenLastFile).toBe(true)

            // 2) 界面回填：首次打开存在「懒加载首挂未触发 loadSettings」已知缺陷，
            //    关闭后再次打开会触发 visible watch → loadSettings，此时应回填持久化值。
            const firstDialog = await openSystemSettingDialog(page)
            await firstDialog.locator('button.btn-cancel').click()
            await expect(firstDialog).toBeHidden({ timeout: 15_000 })
            const reopenedDialog = await openSystemSettingDialog(page)
            await expect(settingCheckbox(reopenedDialog, AUTO_OPEN_LAST_FILE_LABEL)).toBeChecked({
                timeout: 15_000
            })
        } finally {
            await app2?.close().catch(() => undefined)
            sandbox.restore()
            profile.cleanup()
        }
    })

    /**
     * 期望行为：设置对话框「第一次打开」就应回填持久化值。
     *
     * 现状：由于 lazyDialog 首次挂载时 visible 已为 true，SystemSettingDialog 的 visible watch
     * 不触发 loadSettings（未设置 immediate），首开显示默认值。该缺陷已在本轮 P0 E2E 中确认，
     * 业务代码修复后把本用例改回 test()（断言方式：ConfigSandbox 预置 autoOpenLastFile=true，
     * 首次打开即 expect(checkbox).toBeChecked()）。
     */
    test.fixme('设置对话框首次打开即回填持久化值（已知缺陷：懒加载首挂未触发 loadSettings）', async () => {
        const profile = createTempProfile('baize-e2e-settings-first-open-')
        const sandbox = createConfigSandbox(profile)
        sandbox.seed()
        seedUserDataConfig(profile, 'show-welcome', false)
        seedSystemSetting(sandbox, { autoOpenLastFile: true })

        let app: ElectronApplication | undefined
        try {
            const launched = await launchToMainView(profile)
            app = launched.app
            const dialog = await openSystemSettingDialog(launched.page)
            await expect(settingCheckbox(dialog, AUTO_OPEN_LAST_FILE_LABEL)).toBeChecked({
                timeout: 15_000
            })
        } finally {
            await app?.close().catch(() => undefined)
            sandbox.restore()
            profile.cleanup()
        }
    })
})
