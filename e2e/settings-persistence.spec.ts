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
 * 首开回填（已修复的 P0 缺陷）：设置对话框由 lazyDialog 包装（首次 visible=true 时才挂载
 * 异步组件），首次挂载时 visible 已经是 true。修复前 SystemSettingDialog 的
 * `watch(() => props.visible, ...)` 未设置 immediate，首挂不触发 loadSettings()，
 * 首次打开展示默认值、关闭后第二次打开才回填。修复后 visible watch 为 immediate，
 * 首挂即读取主进程配置——本文件两个用例都按「第一次打开即回填」断言，无 test.fixme 遗留。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    launchDevAppWithRenderer,
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

/** 启动应用并等待渲染进程就绪（preload 桥 + IPC 往返 + Vue 挂载）后进入主界面 */
async function launchToMainView(
    profile: TempProfile
): Promise<{ app: ElectronApplication; page: Page }> {
    // 真源就绪等待：firstWindow 只代表窗口创建，不代表 preload 注入完成/页面已加载
    const { app, page } = await launchDevAppWithRenderer(profile)
    // 2026-11-20（Electron 45 稳定性）：极少数启动仍落在欢迎页（show-welcome 读取/时序竞态）；
    // 若检测到欢迎页，重写隔离 userData 中的 show-welcome=false 并 reload，再等待主界面。
    if (
        !(await page
            .locator('#editor-container')
            .isVisible({ timeout: 3_000 })
            .catch(() => false))
    ) {
        const welcomeVisible = await page
            .getByRole('button', { name: '打开文件' })
            .isVisible()
            .catch(() => false)
        if (welcomeVisible) {
            seedUserDataConfig(profile, 'show-welcome', false)
            await page.reload()
        }
    }
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
                // 2026-11-20（Electron 45 稳定性）：真实配置目录可能残留上次失败用例的
                // autoOpenLastFile=true（ConfigSandbox 恢复竞态）；不假设初始 false，
                // 归一化为 true 后再保存，保证持久化断言与初始状态无关。
                if (!(await checkbox.isChecked())) {
                    await checkbox.click()
                }
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

            // 2) 界面回填：首次打开即回填持久化值（首开回填修复回归；
            //    修复前需关闭后二次打开才回填，见文件头说明）
            const firstDialog = await openSystemSettingDialog(page)
            await expect(settingCheckbox(firstDialog, AUTO_OPEN_LAST_FILE_LABEL)).toBeChecked({
                timeout: 15_000
            })
            await firstDialog.locator('button.btn-cancel').click()
            await expect(firstDialog).toBeHidden({ timeout: 15_000 })
        } finally {
            await app2?.close().catch(() => undefined)
            sandbox.restore()
            profile.cleanup()
        }
    })

    /**
     * 首开回填回归（原 test.fixme 缺陷用例，已随业务修复转正）：
     * ConfigSandbox 预置 autoOpenLastFile=true，**第一次**打开设置对话框即应回填
     * （lazyDialog 首挂时 visible 已为 true，依赖 SystemSettingDialog 的 immediate 加载）。
     */
    test('设置对话框首次打开即回填持久化值（首开回填回归）', async () => {
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
