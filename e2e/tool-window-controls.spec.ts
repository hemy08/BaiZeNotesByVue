/**
 * E2E：非模态工具窗「最小化 / 最大化 / 还原」按钮（用户反馈 2026-11-27）。
 *
 * 覆盖（真实 Electron + 真实主进程 + 隔离临时工作区）：
 *   打开示例 .md → 点击 Monaco 使活动编辑器就绪 → 工具 → Markdown表格
 *   → 表格编辑器工具窗弹出 → 断言标题栏出现 [最小化][最大化] 按钮
 *   → 点击最小化：容器高度 ≈ 标题栏高（< 80px）、正文隐藏；再点还原：高度恢复
 *   → 点击最大化：容器宽高 ≈ 视口 − 32（±8）、左上角 16（±4）；再点还原：尺寸回原值。
 *
 * 说明：jsdom 单测（tests/unit/vue/tool-window-controls.test.ts）只能断言 class/内联样式，
 * 真实像素几何（标题栏高度、视口撑满、恢复原尺寸）必须由真实窗口验证，故单独成 spec。
 * 启动/打开链路复用 e2e/helpers 的临时 profile + 配置沙箱 + 渲染就绪等待。
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
import {
    launchToMainView,
    openMenuSubmenu,
    openRecentViaApi,
    recordStartupMetrics
} from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 工具窗容器真实几何（css px）与状态属性 */
interface ToolWindowGeometry {
    width: number
    height: number
    left: number
    top: number
    state: string | null
    classes: string
}

/** 读取当前工具窗容器几何（真实渲染矩形，四舍五入到整数 px） */
async function readToolWindowGeometry(page: Page): Promise<ToolWindowGeometry> {
    return page.evaluate(() => {
        const container = document.querySelector('.dialog-container--tool-window')
        if (!container) {
            return { width: 0, height: 0, left: 0, top: 0, state: null, classes: '' }
        }
        const rect = container.getBoundingClientRect()
        return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            state: container.getAttribute('data-tool-window-state'),
            classes: container.className
        }
    })
}

/** 插件工具面板（#plugin-tools-container）真实高度（css px） */
async function readPluginPanelHeight(page: Page): Promise<number> {
    return page.evaluate(() => {
        const panel = document.querySelector('#plugin-tools-container')
        return panel ? Math.round(panel.getBoundingClientRect().height) : 0
    })
}

/**
 * 插件工具内容真实宽度：工具组件根节点 `.plugin-tools-theme` 的宽度由 PluginTools 的
 * `work-area-width` 注入（正常态「总宽 - 100」/ 最大化态「总宽 - 16」），是「内容是否
 * 真正变宽」的可测口径。
 */
async function readPluginToolWidth(page: Page): Promise<number> {
    return page.evaluate(() => {
        const tool = document.querySelector('#plugin-tools-container .plugin-tools-theme')
        return tool ? Math.round(tool.getBoundingClientRect().width) : 0
    })
}

test.describe('工具窗最小化 / 最大化按钮', () => {
    test('表格编辑器工具窗：最小化 → 还原；最大化 → 还原（真实视口几何）', async () => {
        test.setTimeout(180_000)
        const profile = createTempProfile('baize-e2e-tool-window-controls-')
        const sandbox = createConfigSandbox(profile)
        let app: ElectronApplication | undefined
        try {
            sandbox.seed()
            seedUserDataConfig(profile, 'show-welcome', false)
            const workspaceDir = path.join(profile.root, 'workspace')
            fs.mkdirSync(workspaceDir, { recursive: true })
            const targetFile = path.join(workspaceDir, 'tool-window-controls-e2e.md')
            fs.writeFileSync(
                targetFile,
                '# 工具窗窗口控制回归\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
                'utf-8'
            )
            seedFileState(profile, { recentFiles: [targetFile] })

            const launched = await launchToMainView(profile)
            app = launched.app
            recordStartupMetrics(launched.launched, test.info(), '工具窗窗口控制', {
                compensationReloads: launched.compensationReloads
            })
            const { page } = launched

            const openResult = await openRecentViaApi(page, { kind: 'file', path: targetFile })
            expect(openResult.ok, `打开文件失败：${openResult.message ?? '未知'}`).toBe(true)
            await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 })
            await page
                .locator('.monaco-editor .view-lines')
                .first()
                .click({ position: { x: 40, y: 22 } })
            await page.keyboard.press('Escape')
            await page.waitForTimeout(300)

            // 打开表格编辑器工具窗（非模态工具窗统一壳）
            await openMenuSubmenu(page, '工具', 'Markdown表格')
            const toolWindow = page.locator('.dialog-container--tool-window').first()
            await expect(toolWindow).toBeVisible({ timeout: 15_000 })
            await expect(
                page.locator('.dialog-container--tool-window .table-editor-grid').first()
            ).toBeVisible({ timeout: 15_000 })

            // ---- 按钮存在且 aria-label 正确（默认 zh-CN 界面） ----
            const minButton = toolWindow.locator('.tool-window-control-btn').nth(0)
            const maxButton = toolWindow.locator('.tool-window-control-btn').nth(1)
            await expect(minButton).toBeVisible()
            await expect(maxButton).toBeVisible()
            await expect(minButton).toHaveAttribute('aria-label', '最小化')
            await expect(maxButton).toHaveAttribute('aria-label', '最大化')

            // 按钮视觉与关闭按钮一致（28×28），且标题栏右侧顺序为 [最小化][最大化][关闭]
            const minBox = await minButton.boundingBox()
            const maxBox = await maxButton.boundingBox()
            const closeBox = await toolWindow.locator('.close-btn').boundingBox()
            expect(minBox, '最小化按钮应有尺寸').not.toBeNull()
            expect(maxBox, '最大化按钮应有尺寸').not.toBeNull()
            expect(closeBox, '关闭按钮应有尺寸').not.toBeNull()
            expect(Math.round(minBox!.width)).toBe(28)
            expect(Math.round(minBox!.height)).toBe(28)
            expect(Math.round(maxBox!.width)).toBe(28)
            expect(Math.round(maxBox!.height)).toBe(28)
            expect(minBox!.x).toBeLessThan(maxBox!.x)
            expect(maxBox!.x).toBeLessThan(closeBox!.x)

            // 标题栏高度令牌（默认密度 40；最小化态高度应等于它，content-box 另有 2px 边框）
            const titleBarHeight = await page.evaluate(() => {
                const raw = getComputedStyle(document.documentElement).getPropertyValue(
                    '--ui-titlebar-height'
                )
                const parsed = Number.parseFloat(raw)
                return Number.isFinite(parsed) ? parsed : 40
            })

            const viewport = await page.evaluate(() => ({
                width: window.innerWidth,
                height: window.innerHeight
            }))
            const normal = await readToolWindowGeometry(page)
            console.log(
                '[tool-window-controls] viewport/normal',
                JSON.stringify({ viewport, normal })
            )
            expect(normal.state).toBe('normal')
            expect(normal.width).toBeGreaterThan(300)
            expect(normal.height).toBeGreaterThan(200)

            // ---- 最小化：容器高度 ≈ 标题栏高（密度令牌 36/40/44，门限 < 80），正文隐藏 ----
            await minButton.click()
            await expect(toolWindow).toHaveClass(/dialog-container--minimized/)
            await expect(
                page.locator('.dialog-container--tool-window .table-editor-grid').first()
            ).toBeHidden()
            await expect
                .poll(async () => (await readToolWindowGeometry(page)).height)
                .toBeLessThan(80)
            const minimized = await readToolWindowGeometry(page)
            console.log('[tool-window-controls] minimized', JSON.stringify(minimized))
            expect(minimized.state).toBe('minimized')
            expect(minimized.height).toBeLessThan(80)
            expect(minimized.height).toBeGreaterThan(20)
            // 高度 = 标题栏高度令牌（content-box 下 +2px 上下边框）
            expect(
                Math.abs(minimized.height - (titleBarHeight + 2)),
                `最小化高度应=标题栏高（token=${titleBarHeight}，实测=${minimized.height}）`
            ).toBeLessThanOrEqual(4)
            await expect(minButton).toHaveAttribute('aria-label', '还原')

            // 还原：高度恢复原值
            await minButton.click()
            await expect(toolWindow).not.toHaveClass(/dialog-container--minimized/)
            await expect(
                page.locator('.dialog-container--tool-window .table-editor-grid').first()
            ).toBeVisible()
            await expect
                .poll(async () => (await readToolWindowGeometry(page)).height)
                .toBeGreaterThan(normal.height - 40)
            const restoredFromMin = await readToolWindowGeometry(page)
            console.log('[tool-window-controls] restored-from-min', JSON.stringify(restoredFromMin))
            expect(Math.abs(restoredFromMin.height - normal.height)).toBeLessThanOrEqual(4)

            // ---- 最大化：宽高 ≈ 视口 − 32（±8），左上 16（±4） ----
            await maxButton.click()
            await expect(toolWindow).toHaveClass(/dialog-container--maximized/)
            await expect
                .poll(async () => (await readToolWindowGeometry(page)).width)
                .toBeGreaterThan(viewport.width - 40)
            await expect
                .poll(async () => (await readToolWindowGeometry(page)).height)
                .toBeGreaterThan(viewport.height - 40)
            const maximized = await readToolWindowGeometry(page)
            console.log('[tool-window-controls] maximized', JSON.stringify(maximized))
            expect(maximized.state).toBe('maximized')
            expect(
                Math.abs(maximized.width - (viewport.width - 32)),
                `最大化宽度应≈视口-32（viewport=${viewport.width}，实测=${maximized.width}）`
            ).toBeLessThanOrEqual(8)
            expect(
                Math.abs(maximized.height - (viewport.height - 32)),
                `最大化高度应≈视口-32（viewport=${viewport.height}，实测=${maximized.height}）`
            ).toBeLessThanOrEqual(8)
            expect(Math.abs(maximized.left - 16)).toBeLessThanOrEqual(4)
            expect(Math.abs(maximized.top - 16)).toBeLessThanOrEqual(4)
            await expect(maxButton).toHaveAttribute('aria-label', '还原')

            // 还原：恢复原尺寸与位置
            await maxButton.click()
            await expect(toolWindow).not.toHaveClass(/dialog-container--maximized/)
            await expect
                .poll(async () => (await readToolWindowGeometry(page)).width)
                .toBeLessThan(viewport.width - 40)
            const restoredFromMax = await readToolWindowGeometry(page)
            console.log('[tool-window-controls] restored-from-max', JSON.stringify(restoredFromMax))
            expect(Math.abs(restoredFromMax.width - normal.width)).toBeLessThanOrEqual(4)
            expect(Math.abs(restoredFromMax.height - normal.height)).toBeLessThanOrEqual(4)
            expect(Math.abs(restoredFromMax.left - normal.left)).toBeLessThanOrEqual(4)
            expect(Math.abs(restoredFromMax.top - normal.top)).toBeLessThanOrEqual(4)
        } finally {
            await app?.close().catch(() => undefined)
            await new Promise((resolve) => setTimeout(resolve, 800))
            sandbox.restore()
            profile.cleanup()
        }
    })
})

test.describe('插件工具面板最小化 / 最大化按钮', () => {
    test('插件工具面板：44px 工具条 / 最小化折叠 / 最大化加宽 / 返回编辑器', async () => {
        test.setTimeout(180_000)
        const profile = createTempProfile('baize-e2e-plugin-panel-controls-')
        const sandbox = createConfigSandbox(profile)
        let app: ElectronApplication | undefined
        try {
            sandbox.seed()
            seedUserDataConfig(profile, 'show-welcome', false)
            const launched = await launchToMainView(profile)
            app = launched.app
            recordStartupMetrics(launched.launched, test.info(), '插件工具面板窗口控制', {
                compensationReloads: launched.compensationReloads
            })
            const { page } = launched

            // 三级菜单：插件 → 加解密插件（hover 展开二级组）→ 令牌生成器
            await page.locator('.menu-bar .menu-item').filter({ hasText: '插件' }).first().click()
            const groupItem = page
                .locator('.submenu-container .menu-submenu-item')
                .filter({ hasText: '加解密插件' })
                .first()
            await expect(groupItem).toBeVisible()
            await groupItem.hover()
            const toolItem = page
                .locator('.nested-submenu .menu-submenu-item')
                .filter({ hasText: '令牌生成器' })
                .first()
            await expect(toolItem).toBeVisible({ timeout: 10_000 })
            await toolItem.click()

            const panel = page.locator('#plugin-tools-container')
            await expect(panel).toBeVisible({ timeout: 15_000 })
            await expect(panel.locator('.plugin-tools-bar-title')).toHaveText('插件工具')

            // 顶部工具条高度 44px；右侧按钮组 [最小化][最大化][返回编辑器]
            const barHeight = await page.evaluate(() => {
                const bar = document.querySelector('.plugin-tools-bar')
                return bar ? Math.round(bar.getBoundingClientRect().height) : 0
            })
            console.log('[tool-window-controls] plugin-bar', JSON.stringify({ barHeight }))
            expect(barHeight).toBe(44)
            const controls = panel.locator('.plugin-tools-control-btn')
            await expect(controls).toHaveCount(2)
            await expect(controls.nth(0)).toHaveAttribute('aria-label', '最小化')
            await expect(controls.nth(1)).toHaveAttribute('aria-label', '最大化')
            await expect(panel.locator('#plugin-tool-close button')).toHaveText('返回编辑器')

            const normalToolWidth = await readPluginToolWidth(page)
            expect(normalToolWidth).toBeGreaterThan(200)

            // ---- 最小化：面板折叠为仅 44px 工具条，内容隐藏；再次点击还原 ----
            await controls.nth(0).click()
            await expect(panel).toHaveClass(/plugin-tools-container--minimized/)
            await expect(panel.locator('.plugin-tool-content')).toBeHidden()
            await expect.poll(async () => readPluginPanelHeight(page)).toBeLessThan(60)
            const minimizedHeight = await readPluginPanelHeight(page)
            console.log(
                '[tool-window-controls] plugin-minimized',
                JSON.stringify({ minimizedHeight })
            )
            expect(minimizedHeight).toBe(44)
            await expect(controls.nth(0)).toHaveAttribute('aria-label', '还原')

            await controls.nth(0).click()
            await expect(panel).not.toHaveClass(/plugin-tools-container--minimized/)
            await expect(panel.locator('.plugin-tool-content')).toBeVisible()
            await expect.poll(async () => readPluginPanelHeight(page)).toBeGreaterThan(200)

            // ---- 最大化：内容区加宽（工具工作区宽度预留 100 → 16）；再次点击还原 ----
            await controls.nth(1).click()
            await expect(panel).toHaveClass(/plugin-tools-container--maximized/)
            await expect
                .poll(async () => readPluginToolWidth(page))
                .toBeGreaterThan(normalToolWidth + 40)
            const maximizedToolWidth = await readPluginToolWidth(page)
            console.log(
                '[tool-window-controls] plugin-maximized',
                JSON.stringify({ normalToolWidth, maximizedToolWidth })
            )
            // 收窄留白 100 → 16：工具内容应恰好加宽 84px
            expect(maximizedToolWidth).toBe(normalToolWidth + 84)
            await expect(controls.nth(1)).toHaveAttribute('aria-label', '还原')

            await controls.nth(1).click()
            await expect(panel).not.toHaveClass(/plugin-tools-container--maximized/)
            await expect.poll(async () => readPluginToolWidth(page)).toBe(normalToolWidth)

            // ---- 返回编辑器：既有链路不变（工作区切回 md），折叠/最大化态复位 ----
            await panel.locator('#plugin-tool-close').click()
            await expect(page.locator('#editor-container')).toBeVisible()
            await expect(panel).not.toHaveClass(/plugin-tools-container--minimized/)
            await expect(panel).not.toHaveClass(/plugin-tools-container--maximized/)
        } finally {
            await app?.close().catch(() => undefined)
            await new Promise((resolve) => setTimeout(resolve, 800))
            sandbox.restore()
            profile.cleanup()
        }
    })
})
