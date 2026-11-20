/**
 * E2E：编辑器底部光标可见性（用户反馈：页面满时回车后新行被状态栏遮挡）
 *
 * 回归链路（真实主进程 + 真实窗口 + 隔离用户数据）：
 *   启动即主界面 → 在 Monaco 输入足量行填满视口 → Ctrl+End 后回车
 *   → 断言编辑器视口/光标行都位于状态栏上方（不再被 `.workspace-area` 裁剪）
 *
 * 说明：本用例锁定的是「布局几何」，jsdom/单测无法验证真实视口裁剪；
 * 源码级契约见 tests/unit/viewer-layout-contract.test.ts。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedUserDataConfig
} from './helpers/electron-profile'
import { launchToMainView, recordStartupMetrics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 等待 Monaco 编辑器就绪并聚焦 */
async function focusEditor(page: Page): Promise<void> {
    const editor = page.locator('#monaco-editor-container .monaco-editor').first()
    await expect(editor).toBeVisible({ timeout: 60_000 })
    await editor.click({ position: { x: 120, y: 40 } })
}

test.describe('编辑器底部光标可见性', () => {
    test('页面满时回车，新行与光标必须位于状态栏上方', async () => {
        const profile = createTempProfile('baize-e2e-editor-bottom-')
        const sandbox = createConfigSandbox(profile)
        let app: ElectronApplication | undefined
        try {
            sandbox.seed()
            seedUserDataConfig(profile, 'show-welcome', false)
            const launched = await launchToMainView(profile)
            app = launched.app
            recordStartupMetrics(launched.launched, test.info(), '编辑器底部可见性', {
                compensationReloads: launched.compensationReloads
            })
            const { page } = launched

            await focusEditor(page)
            // 填满视口：100 行足以超过任何常见窗口高度
            await page.keyboard.press('Control+A')
            await page.keyboard.insertText(
                Array.from({ length: 100 }, (_, i) => `第 ${i + 1} 行内容`).join('\n')
            )
            // 光标到文档末尾并回车，触发 Monaco 自动滚动
            await page.keyboard.press('Control+End')
            await page.keyboard.press('Enter')
            await page.waitForTimeout(600)

            const geometry = await page.evaluate(() => {
                const editor = document.querySelector(
                    '#monaco-editor-container'
                ) as HTMLElement | null
                const workspace = document.querySelector('#workspace-area') as HTMLElement | null
                const status = document.querySelector('#status-bar') as HTMLElement | null
                const cursors = Array.from(
                    document.querySelectorAll('.monaco-editor .cursors-layer .cursor')
                ) as HTMLElement[]
                const cursor = cursors.length > 0 ? cursors[cursors.length - 1] : null
                const rect = (el: HTMLElement | null) => (el ? el.getBoundingClientRect() : null)
                return {
                    editor: rect(editor),
                    workspace: rect(workspace),
                    status: rect(status),
                    cursor: rect(cursor)
                }
            })

            expect(geometry.editor, '编辑器容器应存在').not.toBeNull()
            expect(geometry.status, '状态栏应存在').not.toBeNull()
            // 根因：编辑器/工作区底部不得越过状态栏顶部（此前 calc(100vh-62px) 导致底部被裁）
            expect(geometry.editor!.bottom).toBeLessThanOrEqual(geometry.status!.top + 1)
            expect(geometry.workspace!.bottom).toBeLessThanOrEqual(geometry.status!.top + 1)
            // 输入后光标必须落在可见区域内（位于状态栏上方）
            expect(geometry.cursor, '输后应存在光标元素').not.toBeNull()
            expect(geometry.cursor!.bottom).toBeLessThanOrEqual(geometry.status!.top + 1)
        } finally {
            await app?.close().catch(() => undefined)
            sandbox.restore()
            profile.cleanup()
        }
    })
})
