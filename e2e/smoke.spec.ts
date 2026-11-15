/**
 * E2E 冒烟：真实 Electron 进程启动与主窗口渲染（ET-11）
 *
 * 覆盖链路：out/main/index.js → app.whenReady → createWindow → preload contextBridge →
 * 渲染层 Vue 挂载。单元测试全部在 jsdom/mock 下运行，无法发现以下问题：
 * - preload 构建产物缺失或 sandbox 下 require 路径异常；
 * - BrowserWindow webPreferences 与渲染层入口不匹配；
 * - contextBridge 未注入 / 渲染层首个 Vue 组件挂载失败。
 *
 * 运行：npx electron-vite build && npm run test:e2e
 * 需桌面环境（Windows/macOS/Linux GUI）。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const MAIN_ENTRY = path.join(ROOT, 'out', 'main', 'index.js')

test.describe('Electron 主窗口冒烟', () => {
    test('应启动主进程、创建窗口并注入 preload 桥', async () => {
        test.skip(
            !fs.existsSync(MAIN_ENTRY),
            '缺少 out/main/index.js：请先执行 npx electron-vite build'
        )

        // 本会话/CI 可能继承 ELECTRON_RUN_AS_NODE=1（Electron 会以纯 Node 模式运行、
        // 不创建窗口），启动时剔除该变量，确保以 GUI 模式启动。
        const env = Object.fromEntries(
            Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')
        ) as Record<string, string>

        const app = await electron.launch({ args: [MAIN_ENTRY], env })
        try {
            const window = await app.firstWindow()
            await window.waitForLoadState('domcontentloaded')

            // 1) 窗口已创建且有标题
            expect(await window.title()).toBeTruthy()

            // 2) 渲染层已挂载：body 有可见内容
            await expect(window.locator('body')).not.toBeEmpty()

            // 3) preload 桥存在（主窗口应暴露 window.electron / window.api）
            const bridge = await window.evaluate(() => ({
                hasElectron:
                    typeof (window as unknown as { electron?: unknown }).electron === 'object',
                hasApi: typeof (window as unknown as { api?: unknown }).api === 'object'
            }))
            expect(bridge.hasElectron).toBe(true)
            expect(bridge.hasApi).toBe(true)
        } finally {
            await app.close()
        }
    })
})
