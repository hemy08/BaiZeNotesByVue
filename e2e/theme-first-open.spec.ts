/**
 * E2E：主题设置（P2 关键链路补齐）
 *
 * 覆盖链路（真实主进程 + 真实窗口 + 隔离用户数据）：
 * 1. 首开列表回归：进入主界面 → 菜单「设置 → 主题设置」→ 断言左侧 3 个页签、
 *    3 个分类标题与 28 张主题卡片在**第一次打开**时即渲染（回归 2026-11-20 修复的
 *    `watch(() => props.visible, ..., { immediate: true })` 首开空列表缺陷）；关闭后二次
 *    打开仍能重新加载（重载语义保留）。
 * 2. 取消回滚：打开对话框 → 切到「编辑器主题」→ 点选非当前编辑器主题（只更新对话框草稿，
 *    不写盘）→ 点「取消」→ 主进程配置未被改写 → 重新打开时选中项恢复初始值。
 *
 * 明确未覆盖（不写假绿，详见报告 out/tool-results/fix-e2e2.md）：
 * - **应用主题「取消」回滚**：HEAD 语义为「点选应用主题即 emit('change') → 立即应用并防抖
 *   写盘，取消只 resetSettings 本地草稿」，即取消**不回滚**已应用/已落盘的应用主题
 *   （扫描报告 P2 #17 / F-11 遗留缺陷）。E2E 不把该缺陷断言成通过，留给产品修复后补测。
 * - 主题列表加载失败错误态/重试按钮需要注入主进程 IPC 故障，E2E 不 mock 产品行为，
 *   由既有单测覆盖（tests/unit/vue2/complex-dialogs.test.ts）。
 *
 * 隔离：Electron userData 重定向到临时目录；home 下真实配置目录（theme-config.json 等）
 * 由 ConfigSandbox 备份 → 清空默认值 → finally 恢复。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Locator, Page } from '@playwright/test'
import * as fs from 'fs'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedUserDataConfig
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import {
    launchToMainView,
    launchToMainViewZeroRecovery,
    openMenuSubmenu,
    readMainConfig,
    recordLaunchDiagnostics
} from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 应用主题分类（与 shared/constants/theme.ts 的 THEME_GROUPS 单一真源一致：14 / 7 / 7） */
const EXPECTED_CATEGORY_TITLES = ['浅色主题', '深色主题', '护眼主题']
const EXPECTED_CATEGORY_CARD_COUNTS = [14, 7, 7]
const EXPECTED_APP_THEME_CARD_TOTAL = 28
/** 默认应用主题（主进程 theme-config 默认 currentTheme='baize'）的 i18n 显示名 */
const DEFAULT_APP_THEME_NAME = '白泽紫韵'
/** 默认编辑器主题（内置 vs）的显示名 */
const DEFAULT_MONACO_THEME_NAME = 'Visual Studio Light'

/** 主题相关主进程配置形状（config:read('theme') 返回的 ThemeConfig） */
interface ThemeConfigShape {
    currentTheme: string
    separateEditorTheme: boolean
    editorTheme: string
}

/** 打开「设置 → 主题设置」对话框并等待容器可见 */
async function openThemeSettingDialog(page: Page): Promise<Locator> {
    await openMenuSubmenu(page, '设置', '主题设置')
    const dialog = page
        .locator('.dialog-overlay .dialog-container')
        .filter({ hasText: '主题设置' })
        .first()
    await expect(dialog).toBeVisible({ timeout: 15_000 })
    return dialog
}

/** 关闭应用并等待文件句柄/单实例锁释放（Electron 关闭后延迟释放，后续清理更稳） */
async function closeApp(app: ElectronApplication | undefined): Promise<void> {
    await app?.close().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
}

test.describe('主题设置首开与取消回滚', () => {
    test('首次打开主题设置：3 个页签 / 3 个分类 / 28 张主题卡片即时渲染（首开回归）', async () => {
        const testInfo = test.info()
        const profile: TempProfile = createTempProfile('baize-e2e-theme-first-open-')
        const sandbox: ConfigSandbox = createConfigSandbox(profile)
        sandbox.seed()
        // 启动即主界面：欢迎页无菜单栏，主题设置需在主界面打开
        seedUserDataConfig(profile, 'show-welcome', false)

        let app: ElectronApplication | undefined
        try {
            // Q-01：至少一条新用例硬断言启动零恢复（命中已知上游竞态时记录并重试，
            // 见 helpers/app-ui.ts 的 launchToMainViewZeroRecovery 注释）
            const {
                app: electronApp,
                page,
                launched,
                recoveryNotes
            } = await launchToMainViewZeroRecovery(profile)
            app = electronApp
            for (const note of recoveryNotes) {
                testInfo.annotations.push({ type: 'known-issue', description: note })
            }
            expect(
                launched.launchAttempts,
                `首次启动发生进程级重试（launchAttempts=${launched.launchAttempts}）`
            ).toBe(1)
            expect(
                launched.reloadRecoveries,
                `启动发生 reload 恢复（reloadRecoveries=${launched.reloadRecoveries}），非零恢复基线不成立`
            ).toBe(0)

            const dialog = await openThemeSettingDialog(page)

            // 1) 左侧 3 个页签（应用主题 / 编辑器主题 / 字体设置）
            const sidebarItems = dialog.locator('.sidebar-item')
            await expect(sidebarItems).toHaveCount(3)
            await expect(sidebarItems.nth(0)).toContainText('应用主题')
            await expect(sidebarItems.nth(1)).toContainText('编辑器主题')
            await expect(sidebarItems.nth(2)).toContainText('字体设置')

            // 2) 首开即加载完成：3 个分类标题（浅色 / 深色 / 护眼）
            await expect(dialog.locator('.theme-category')).toHaveCount(3, { timeout: 15_000 })
            await expect(dialog.locator('.category-title')).toHaveText(EXPECTED_CATEGORY_TITLES)

            // 3) 28 张主题卡片按 14 / 7 / 7 分组渲染（首开空列表缺陷的回归防线）
            await expect(dialog.locator('.theme-list .theme-card')).toHaveCount(
                EXPECTED_APP_THEME_CARD_TOTAL
            )
            const cardCounts = await dialog
                .locator('.theme-list .theme-category')
                .evaluateAll((categories) =>
                    categories.map((category) => category.querySelectorAll('.theme-card').length)
                )
            expect(cardCounts).toEqual(EXPECTED_CATEGORY_CARD_COUNTS)

            // 4) 当前主题 `baize` 唯一选中（选中态与主进程默认主题一致）
            const selectedCards = dialog.locator('.theme-list .theme-card.selected')
            await expect(selectedCards).toHaveCount(1)
            await expect(selectedCards.first().locator('.theme-name')).toContainText(
                DEFAULT_APP_THEME_NAME
            )

            // 5) 取消关闭后二次打开仍重新加载（首开修复未破坏既有重载语义）
            await dialog.locator('.btn-cancel').click()
            await expect(dialog).toBeHidden({ timeout: 15_000 })
            const reopened = await openThemeSettingDialog(page)
            await expect(reopened.locator('.theme-category')).toHaveCount(3, { timeout: 15_000 })
            await expect(reopened.locator('.theme-list .theme-card')).toHaveCount(
                EXPECTED_APP_THEME_CARD_TOTAL
            )
            await reopened.locator('.btn-cancel').click()
            await expect(reopened).toBeHidden({ timeout: 15_000 })
        } finally {
            await closeApp(app)
            sandbox.restore()
            profile.cleanup()
        }
    })

    test('取消回滚：编辑器主题草稿选择后取消 → 不写主进程配置，重新打开恢复初始选中', async () => {
        const testInfo = test.info()
        const profile: TempProfile = createTempProfile('baize-e2e-theme-cancel-')
        const sandbox: ConfigSandbox = createConfigSandbox(profile)
        sandbox.seed()
        seedUserDataConfig(profile, 'show-welcome', false)

        let app: ElectronApplication | undefined
        try {
            const { app: electronApp, page, launched } = await launchToMainView(profile)
            app = electronApp
            recordLaunchDiagnostics(launched, testInfo, '主题取消回滚')

            const dialog = await openThemeSettingDialog(page)
            // 切到「编辑器主题」页签
            await dialog.locator('.sidebar-item').filter({ hasText: '编辑器主题' }).click()
            const monacoCards = dialog.locator('.monaco-theme-list .theme-card')
            await expect(monacoCards.first()).toBeVisible({ timeout: 15_000 })
            expect(await monacoCards.count()).toBeGreaterThanOrEqual(3)

            // 初始选中 = 配置中的内置 vs 主题
            const initialSelected = dialog.locator('.monaco-theme-list .theme-card.selected')
            await expect(initialSelected).toHaveCount(1)
            await expect(initialSelected).toContainText(DEFAULT_MONACO_THEME_NAME)
            const configBefore = await readMainConfig<ThemeConfigShape>(page, 'theme')
            expect(configBefore?.editorTheme).toBe('vs')

            // 点选非当前编辑器主题：仅更新对话框草稿（选中态移动，不写盘/不即时应用）
            const targetCard = monacoCards.nth(1)
            await targetCard.click()
            await expect(targetCard).toHaveClass(/selected/)
            await expect(dialog.locator('.monaco-theme-list .theme-card.selected')).toHaveCount(1)
            const configAfterSelect = await readMainConfig<ThemeConfigShape>(page, 'theme')
            expect(configAfterSelect?.editorTheme).toBe('vs')

            // 取消：关闭对话框，主进程配置保持初始值
            await dialog.locator('.btn-cancel').click()
            await expect(dialog).toBeHidden({ timeout: 15_000 })
            const configAfterCancel = await readMainConfig<ThemeConfigShape>(page, 'theme')
            expect(configAfterCancel?.editorTheme).toBe('vs')

            // 重新打开 → 选中项恢复初始（取消回滚对话框草稿）
            const reopened = await openThemeSettingDialog(page)
            await reopened.locator('.sidebar-item').filter({ hasText: '编辑器主题' }).click()
            const restoredSelected = reopened.locator('.monaco-theme-list .theme-card.selected')
            await expect(restoredSelected).toHaveCount(1)
            await expect(restoredSelected).toContainText(DEFAULT_MONACO_THEME_NAME)
            await reopened.locator('.btn-cancel').click()
            await expect(reopened).toBeHidden({ timeout: 15_000 })
        } finally {
            await closeApp(app)
            sandbox.restore()
            profile.cleanup()
        }
    })
})
