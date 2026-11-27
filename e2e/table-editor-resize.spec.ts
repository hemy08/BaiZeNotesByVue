/**
 * E2E：非模态工具窗（表格编辑器）的拖拽调整大小回归（用户反馈 2026-11-27：不能拖动调整大小）。
 *
 * 覆盖：真实 Electron + 真实主进程 + 隔离临时工作区
 *   打开示例 .md → 点击 Monaco 使活动编辑器就绪 → 工具 → Markdown表格
 *   → 表格编辑器工具窗弹出 → 拖拽右下角 .resize-grip → 断言 .dialog-container 宽高增大。
 *
 * 诊断：若拖拽无效，输出窗口宽高、resize-grip 的 boundingBox/可见性/pointer-events
 * 与 grip 中心 elementFromPoint 命中元素，便于定位遮挡或事件丢失。
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedFileState,
    seedUserDataConfig
} from './helpers/electron-profile'
import { launchToMainView, openMenuSubmenu, openRecentViaApi } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 容器当前宽高（css px） */
async function readContainerSize(page: Page): Promise<{ width: number; height: number }> {
    return page.evaluate(() => {
        const container = document.querySelector('.dialog-container--tool-window')
        if (!container) return { width: 0, height: 0 }
        const rect = container.getBoundingClientRect()
        return { width: Math.round(rect.width), height: Math.round(rect.height) }
    })
}

test.describe('工具窗拖拽调整大小', () => {
    test('表格编辑器右下角 resize-grip 可拖拽改变窗口尺寸', async () => {
        test.setTimeout(180_000)
        const profile = createTempProfile('baize-e2e-table-resize-')
        const sandbox = createConfigSandbox(profile)
        sandbox.seed()
        seedUserDataConfig(profile, 'show-welcome', false)
        const workspaceDir = path.join(profile.root, 'workspace')
        fs.mkdirSync(workspaceDir, { recursive: true })
        const targetFile = path.join(workspaceDir, 'resize-e2e.md')
        fs.writeFileSync(
            targetFile,
            '# 表格尺寸回归\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n',
            'utf-8'
        )
        seedFileState(profile, { recentFiles: [targetFile] })

        const { app, page } = await launchToMainView(profile)
        try {
            const openResult = await openRecentViaApi(page, { kind: 'file', path: targetFile })
            expect(openResult.ok, `打开文件失败：${openResult.message ?? '未知'}`).toBe(true)
            await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 })
            await page
                .locator('.monaco-editor .view-lines')
                .first()
                .click({ position: { x: 40, y: 22 } })
            await page.keyboard.press('Escape')
            await page.waitForTimeout(300)

            await openMenuSubmenu(page, '工具', 'Markdown表格')
            const grid = page.locator('.dialog-container--tool-window .table-editor-grid').first()
            await expect(grid).toBeVisible({ timeout: 15_000 })

            const before = await readContainerSize(page)
            const grip = page.locator('.dialog-container--tool-window .resize-grip').first()
            await expect(grip).toHaveCount(1)
            const gripBox = await grip.boundingBox()
            expect(gripBox, 'resize-grip 应可见且有尺寸').not.toBeNull()
            if (!gripBox) return

            // 诊断信息（拖拽前）
            const diag = await page.evaluate(() => {
                const container = document.querySelector('.dialog-container--tool-window')!
                const grip = container.querySelector('.resize-grip') as HTMLElement | null
                if (!grip) return { found: false } as Record<string, unknown>
                const style = getComputedStyle(grip)
                const rect = grip.getBoundingClientRect()
                const cx = rect.left + rect.width / 2
                const cy = rect.top + rect.height / 2
                const hit = document.elementFromPoint(cx, cy)
                return {
                    found: true,
                    opacity: style.opacity,
                    pointerEvents: style.pointerEvents,
                    display: style.display,
                    zIndex: style.zIndex,
                    rect: {
                        x: Math.round(rect.x),
                        y: Math.round(rect.y),
                        w: Math.round(rect.width),
                        h: Math.round(rect.height)
                    },
                    hit: hit ? `${hit.tagName}.${hit.className}` : 'null',
                    hitIsGripOrChild: Boolean(hit && (grip.contains(hit) || hit === grip)),
                    containerOverflow: getComputedStyle(container).overflow
                }
            })
            console.log('[resize-diag]', JSON.stringify({ before, gripBox, diag }))

            // 真实拖拽：从 grip 中心向右下拖 160,120
            const startX = gripBox.x + gripBox.width / 2
            const startY = gripBox.y + gripBox.height / 2
            await page.mouse.move(startX, startY)
            await page.mouse.down()
            await page.mouse.move(startX + 160, startY + 120, { steps: 10 })
            await page.mouse.up()
            await page.waitForTimeout(400)

            const after = await readContainerSize(page)
            console.log('[resize-after]', JSON.stringify({ before, after }))
            expect(after.width, `拖拽后宽度应增大（before=${before.width}）`).toBeGreaterThan(
                before.width + 60
            )
            expect(after.height, `拖拽后高度应增大（before=${before.height}）`).toBeGreaterThan(
                before.height + 40
            )
        } finally {
            await app.close().catch(() => undefined)
            await new Promise((resolve) => setTimeout(resolve, 800))
            sandbox.restore()
            profile.cleanup()
        }
    })
})
