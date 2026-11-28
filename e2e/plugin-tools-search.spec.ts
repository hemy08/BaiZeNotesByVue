/**
 * E2E：插件工具面板可发现性（1.5.6 批次 B / REQ-04 搜索 + REQ-05 最近使用 / 收藏）
 *      与插件菜单「插件搜索」入口视图（1.5.6 新增，用户需求 2026-11-28）
 *
 * 覆盖真实 Electron + 真实主进程链路（单测只覆盖 jsdom 状态与纯函数）：
 *   ① 菜单「插件 → 加解密插件 → 令牌生成器」打开面板（同时写入「最近使用」）
 *      → 面板工具条搜索框输入「哈希」→ 搜索结果命中哈希文本 → 无匹配空态 → 回车打开工具
 *      → 工具条星标收藏 → 本地存储写入 → 「工具列表」默认视图分区顺序（收藏 → 最近 → 全部）
 *      → 最小化后搜索框不显示/还原 → 页面重载后收藏与最近使用仍从 localStorage 恢复。
 *   ② 先打开 2 个工具制造最近记录 → 菜单「插件 → 插件搜索」（首项）→ 工作区搜索入口视图
 *      （内容区大搜索框可见且自动聚焦）→ 空白查询显示最近使用 2 项 + 全部工具
 *      → 输入「哈希」回车 → 打开哈希文本工具并记录最近使用。
 *
 * 运行前提：先构建开发产物 `npx electron-vite build`（缺失时整文件 skip，不假绿）。
 * 启动/菜单/指标复用 e2e/helpers（临时 profile + 配置沙箱 + 启动指标 annotation）。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedUserDataConfig,
    waitForRendererReady
} from './helpers/electron-profile'
import { launchToMainView, recordStartupMetrics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 真实菜单动作 id（与 shared/constants/plugin-tools-manifest.ts 一致） */
const HASH_ACTION_ID = 'baize:menu:plugins:encrypt:hash-text'
const TOKEN_ACTION_ID = 'baize:menu:plugins:encrypt:token-generator'
const RECENT_KEY = 'baize:plugin-tools:recent'
const FAVORITES_KEY = 'baize:plugin-tools:favorites'

/** 通过渲染层三级菜单打开插件工具（插件 → 分组 → 工具） */
async function openPluginTool(page: Page, groupLabel: string, toolLabel: string): Promise<void> {
    await page.locator('.menu-bar .menu-item').filter({ hasText: '插件' }).first().click()
    const groupItem = page
        .locator('.submenu-container .menu-submenu-item')
        .filter({ hasText: groupLabel })
        .first()
    await expect(groupItem).toBeVisible({ timeout: 15_000 })
    await groupItem.hover()
    const toolItem = page
        .locator('.nested-submenu .menu-submenu-item')
        .filter({ hasText: toolLabel })
        .first()
    await expect(toolItem).toBeVisible({ timeout: 15_000 })
    await toolItem.click()
}

/**
 * 点击「插件」菜单首项「插件搜索」（1.5.6 入口，动作 id：baize:menu:plugins:search）。
 * 语义：打开插件工具面板并进入搜索入口视图（不是打开某个具体工具）。
 */
async function openPluginSearch(page: Page): Promise<void> {
    await page.locator('.menu-bar .menu-item').filter({ hasText: '插件' }).first().click()
    const searchItem = page
        .locator('.submenu-container .menu-submenu-item')
        .filter({ hasText: '插件搜索' })
        .first()
    await expect(searchItem).toBeVisible({ timeout: 15_000 })
    await searchItem.click()
}

/** 读取渲染层 localStorage（真实 userData 分区，非 mock） */
async function readStorage(page: Page, key: string): Promise<unknown> {
    return page.evaluate((storageKey) => {
        const raw = window.localStorage.getItem(storageKey)
        return raw === null ? null : (JSON.parse(raw) as unknown)
    }, key)
}

test.describe('插件工具面板可发现性（搜索 / 最近使用 / 收藏）', () => {
    test('搜索「哈希」打开工具 → 收藏 → 默认视图分区 → 重载后保持', async () => {
        test.setTimeout(180_000)
        const profile = createTempProfile('baize-e2e-plugin-tools-search-')
        const sandbox = createConfigSandbox(profile)
        let app: ElectronApplication | undefined
        try {
            sandbox.seed()
            seedUserDataConfig(profile, 'show-welcome', false)
            const launched = await launchToMainView(profile)
            app = launched.app
            recordStartupMetrics(launched.launched, test.info(), '插件工具可发现性', {
                compensationReloads: launched.compensationReloads
            })
            const { page } = launched

            // ---- 经菜单打开插件工具：面板可见 + 最近使用已记录 ----
            await openPluginTool(page, '加解密插件', '令牌生成器')
            const panel = page.locator('#plugin-tools-container')
            await expect(panel).toBeVisible({ timeout: 15_000 })
            await expect(panel.locator('.plugin-tools-bar-title')).toHaveText('插件工具')
            const searchInput = panel.locator('.plugin-tools-search-input')
            await expect(searchInput).toBeVisible()
            await expect(searchInput).toHaveAttribute('placeholder', '搜索工具名称 / 分类 / 关键词')
            expect(await readStorage(page, RECENT_KEY)).toEqual([TOKEN_ACTION_ID])

            // ---- 工具列表（默认视图）：最近使用分区可见 ----
            await panel.locator('.plugin-tools-home-btn').click()
            await expect(panel.locator('[data-plugin-tool-view="home"]')).toBeVisible()
            await expect(
                panel.locator(
                    `[data-plugin-tool-section="recent"] [data-tool-action-id="${TOKEN_ACTION_ID}"]`
                )
            ).toBeVisible()

            // ---- REQ-04：中文名称搜索命中 + 分类展示 ----
            await searchInput.fill('哈希')
            await expect(panel.locator('[data-plugin-tool-view="search"]')).toBeVisible()
            const searchResultRow = panel.locator(
                `[data-plugin-tool-section="search"] [data-tool-action-id="${HASH_ACTION_ID}"]`
            )
            await expect(searchResultRow).toBeVisible()
            await expect(searchResultRow.locator('.plugin-tool-item-name')).toHaveText('哈希文本')
            await expect(searchResultRow.locator('.plugin-tool-item-category')).toHaveText(
                '加解密插件'
            )
            await expect(
                panel.locator('[data-plugin-tool-view="search"] .plugin-tool-section-title')
            ).toHaveText('找到 1 个工具')

            // ---- REQ-04：无结果空态 ----
            await searchInput.fill('不存在的工具 zzz')
            await expect(panel.locator('.plugin-tool-search-empty')).toBeVisible()
            await expect(panel.locator('.plugin-tool-search-empty-title')).toHaveText(
                '没有找到匹配的工具'
            )

            // ---- REQ-04：键盘 Enter 打开高亮结果，打开后清空搜索 ----
            await searchInput.fill('哈希')
            await expect(searchResultRow).toBeVisible()
            await searchInput.press('Enter')
            const toolContent = panel.locator('.plugin-tool-content')
            await expect(toolContent).toBeVisible({ timeout: 20_000 })
            await expect(toolContent).toHaveAttribute('id', `plugin-tool-${HASH_ACTION_ID}`)
            await expect(searchInput).toHaveValue('')
            expect(await readStorage(page, RECENT_KEY)).toEqual([HASH_ACTION_ID, TOKEN_ACTION_ID])

            // ---- REQ-05：工具条星标收藏（当前工具）并写本机 localStorage ----
            const favoriteButton = panel.locator('.plugin-tools-favorite-btn')
            await expect(favoriteButton).toHaveAttribute('aria-pressed', 'false')
            await favoriteButton.click()
            await expect(favoriteButton).toHaveAttribute('aria-pressed', 'true')
            expect(await readStorage(page, FAVORITES_KEY)).toEqual([HASH_ACTION_ID])

            // ---- REQ-05：默认视图分区顺序 收藏 → 最近使用 → 全部工具 ----
            await panel.locator('.plugin-tools-home-btn').click()
            const sections = panel.locator('[data-plugin-tool-section]')
            await expect(sections.first()).toHaveAttribute('data-plugin-tool-section', 'favorites')
            await expect(
                panel.locator(
                    `[data-plugin-tool-section="favorites"] [data-tool-action-id="${HASH_ACTION_ID}"]`
                )
            ).toBeVisible()
            const sectionKeys = await panel
                .locator('[data-plugin-tool-section]')
                .evaluateAll((elements) =>
                    elements.map((element) => element.getAttribute('data-plugin-tool-section'))
                )
            expect(sectionKeys).toEqual(['favorites', 'recent', 'all'])

            // ---- 最小化：搜索框不显示；还原后恢复 ----
            const minimizeButton = panel.locator('.plugin-tools-control-btn').nth(0)
            await minimizeButton.click()
            await expect(panel).toHaveClass(/plugin-tools-container--minimized/)
            await expect(searchInput).toHaveCount(0)
            await minimizeButton.click()
            await expect(panel).not.toHaveClass(/plugin-tools-container--minimized/)
            await expect(searchInput).toBeVisible()

            // ---- 重载（模拟重开会话）：收藏 / 最近使用仍从 localStorage 恢复 ----
            await page.reload()
            await waitForRendererReady(page)
            await expect(page.locator('#editor-container')).toBeVisible({ timeout: 60_000 })
            await openPluginTool(page, '加解密插件', '哈希文本')
            await expect(panel).toBeVisible({ timeout: 15_000 })
            await panel.locator('.plugin-tools-home-btn').click()
            await expect(
                panel.locator(
                    `[data-plugin-tool-section="favorites"] [data-tool-action-id="${HASH_ACTION_ID}"]`
                )
            ).toBeVisible()
            expect(await readStorage(page, FAVORITES_KEY)).toEqual([HASH_ACTION_ID])
            // 重载后经菜单打开工具会再次记录最近使用（去重置顶）
            expect(await readStorage(page, RECENT_KEY)).toEqual([HASH_ACTION_ID, TOKEN_ACTION_ID])
        } finally {
            await app?.close().catch(() => undefined)
            await new Promise((resolve) => setTimeout(resolve, 800))
            sandbox.restore()
            profile.cleanup()
        }
    })

    // 1.5.6（用户需求 2026-11-28）：插件菜单首项「插件搜索」→ 工作区搜索入口视图
    // （内容区大搜索框自动聚焦 / 空白查询展示最近使用 ≤20 + 全部工具 / 输入关键词回车跳转工具）。
    test('菜单「插件 → 插件搜索」打开搜索入口视图 → 最近使用 → 搜索回车打开工具', async () => {
        test.setTimeout(180_000)
        const profile = createTempProfile('baize-e2e-plugin-search-entry-')
        const sandbox = createConfigSandbox(profile)
        let app: ElectronApplication | undefined
        try {
            sandbox.seed()
            seedUserDataConfig(profile, 'show-welcome', false)
            const launched = await launchToMainView(profile)
            app = launched.app
            recordStartupMetrics(launched.launched, test.info(), '插件搜索入口', {
                compensationReloads: launched.compensationReloads
            })
            const { page } = launched

            // ---- 先打开 2 个工具制造「最近使用」记录 ----
            await openPluginTool(page, '加解密插件', '令牌生成器')
            const panel = page.locator('#plugin-tools-container')
            await expect(panel).toBeVisible({ timeout: 15_000 })
            await openPluginTool(page, '加解密插件', '哈希文本')
            expect(await readStorage(page, RECENT_KEY)).toEqual([HASH_ACTION_ID, TOKEN_ACTION_ID])

            // ---- 菜单「插件 → 插件搜索」：面板打开并进入搜索入口视图 ----
            await openPluginSearch(page)
            await expect(panel).toBeVisible({ timeout: 15_000 })
            await expect(panel.locator('[data-plugin-tool-view="search-entry"]')).toBeVisible()
            // 工作区（内容区）大搜索框可见且自动聚焦
            const entryInput = panel.locator('.plugin-tools-entry-search-input')
            await expect(entryInput).toBeVisible()
            await expect(entryInput).toBeFocused()
            // 入口视图只保留内容区大搜索框（工具条搜索框隐藏）
            await expect(panel.locator('.plugin-tools-search-input')).toHaveCount(0)

            // ---- 空白查询：最近使用分区（2 项）+ 全部工具分区 ----
            const recentRows = panel.locator(
                '[data-plugin-tool-section="recent"] [data-tool-action-id]'
            )
            await expect(recentRows).toHaveCount(2)
            await expect(
                panel.locator(
                    `[data-plugin-tool-section="recent"] [data-tool-action-id="${TOKEN_ACTION_ID}"]`
                )
            ).toBeVisible()
            await expect(panel.locator('[data-plugin-tool-section="all"]')).toBeVisible()

            // ---- 输入关键词 → 结果 → Enter 跳转打开工具 ----
            await entryInput.fill('哈希')
            const searchRow = panel.locator(
                `[data-plugin-tool-section="search"] [data-tool-action-id="${HASH_ACTION_ID}"]`
            )
            await expect(searchRow).toBeVisible()
            await entryInput.press('Enter')
            const toolContent = panel.locator('.plugin-tool-content')
            await expect(toolContent).toBeVisible({ timeout: 20_000 })
            await expect(toolContent).toHaveAttribute('id', `plugin-tool-${HASH_ACTION_ID}`)
            // 打开工具后退出入口视图并记录最近使用（哈希文本已存在 → 去重置顶，顺序不变）
            await expect(panel.locator('[data-plugin-tool-view="search-entry"]')).toHaveCount(0)
            expect(await readStorage(page, RECENT_KEY)).toEqual([HASH_ACTION_ID, TOKEN_ACTION_ID])
        } finally {
            await app?.close().catch(() => undefined)
            await new Promise((resolve) => setTimeout(resolve, 800))
            sandbox.restore()
            profile.cleanup()
        }
    })
})
