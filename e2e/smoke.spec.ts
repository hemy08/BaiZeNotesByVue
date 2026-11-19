/**
 * E2E 冒烟：真实 Electron 进程启动与主窗口渲染（ET-11）
 *
 * 覆盖链路：out/main/index.js → app.whenReady → createWindow → preload contextBridge →
 * 渲染层 Vue 挂载 + IPC 往返。单元测试全部在 jsdom/mock 下运行，无法发现以下问题：
 * - preload 构建产物缺失或 sandbox 下 require 路径异常；
 * - BrowserWindow webPreferences 与渲染层入口不匹配；
 * - contextBridge 未注入 / 渲染层首个 Vue 组件挂载失败。
 *
 * 运行：npx electron-vite build && npm run test:e2e
 * 需桌面环境（Windows/macOS/Linux GUI）；CI 见 .github/workflows/ci.yml 的 e2e job。
 * 说明：页面的 index.html 未声明 <title>，窗口标题由主进程 BrowserWindow.title 提供，
 * 因此标题断言走 app.evaluate 读取原生窗口标题，而不是 page.title()。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '..')
const MAIN_ENTRY = path.join(ROOT, 'out', 'main', 'index.js')

// 未构建时整文件跳过，避免误报（构建命令见 CI 的 e2e job / 本地 npx electron-vite build）
test.skip(!fs.existsSync(MAIN_ENTRY), '缺少 out/main/index.js：请先执行 npx electron-vite build')

test.describe('Electron 主窗口冒烟', () => {
    let app: ElectronApplication
    let page: Page

    test.beforeAll(async () => {
        // 本会话/CI 可能继承 ELECTRON_RUN_AS_NODE=1（Electron 会以纯 Node 模式运行、
        // 不创建窗口），启动时剔除该变量，确保以 GUI 模式启动。
        const env = Object.fromEntries(
            Object.entries(process.env).filter(([key]) => key !== 'ELECTRON_RUN_AS_NODE')
        ) as Record<string, string>

        app = await electron.launch({ args: [MAIN_ENTRY], env })
        page = await app.firstWindow()
        await page.waitForLoadState('domcontentloaded')
    })

    test.afterAll(async () => {
        await app?.close()
    })

    test('主窗口已创建：原生标题、菜单与窗口可见状态均正常', async () => {
        const state = await app.evaluate(({ BrowserWindow, Menu }) => {
            const windows = BrowserWindow.getAllWindows()
            const menu = Menu.getApplicationMenu()
            return {
                windowCount: windows.length,
                title: windows[0]?.getTitle() ?? '',
                menuItemCount: menu?.items.length ?? 0
            }
        })

        // 主进程 createWindow 只创建一个主窗口
        expect(state.windowCount).toBe(1)

        // 窗口标题：默认语言 zh-CN / en-US 下均为「白泽笔记 / BaiZe Notes -- Markdown Editor ...」
        expect(state.title).toMatch(/白泽笔记|BaiZe Notes/)
        expect(state.title).toContain('Markdown Editor')

        // 原生菜单栏存在（File/Edit/View/Window 等），菜单栏样式设置依赖该基础
        expect(state.menuItemCount).toBeGreaterThan(0)

        // ready-to-show 后才 show()：等待窗口可见（CI 冷启动可能略慢）
        await expect
            .poll(
                () =>
                    app.evaluate(
                        ({ BrowserWindow }) =>
                            BrowserWindow.getAllWindows()[0]?.isVisible() ?? false
                    ),
                { timeout: 15_000 }
            )
            .toBe(true)
    })

    test('欢迎页渲染与 preload 桥注入（含 IPC 往返）', async () => {
        // 1) 渲染层已加载 electron-vite 构建产物（file:// 指向 out/renderer/index.html）
        await expect(page).toHaveURL(/\/out\/renderer\/index\.html$/)

        // 2) 启动默认界面为欢迎页，且已挂载可见
        await expect(page.locator('.welcome-screen')).toBeVisible()
        await expect(page.locator('.welcome-title')).toBeVisible()
        await expect(page.locator('.welcome-btn')).toHaveCount(2)

        // 3) 欢迎页自带的自定义标题栏窗口控制按钮（最小化/最大化/关闭）
        await expect(page.locator('.window-btn.minimize')).toBeVisible()
        await expect(page.locator('.window-btn.maximize')).toBeVisible()
        await expect(page.locator('.window-btn.close')).toBeVisible()

        // 4) preload contextBridge 注入（sandbox: true + 单文件 preload 的回归防线）
        const bridge = await page.evaluate(() => {
            const electronBridge = (window as unknown as { electron?: Record<string, unknown> })
                .electron
            const api = (window as unknown as { api?: Record<string, unknown> }).api
            return {
                hasElectron: typeof electronBridge === 'object' && electronBridge !== null,
                hasApi: typeof api === 'object' && api !== null,
                hasIpcRenderer:
                    typeof (electronBridge as { ipcRenderer?: { send?: unknown } } | undefined)
                        ?.ipcRenderer?.send === 'function',
                hasApiConfigRead:
                    typeof (api as { config?: { read?: unknown } } | undefined)?.config?.read ===
                    'function',
                hasApiGetVersion:
                    typeof (api as { app?: { getVersion?: unknown } } | undefined)?.app
                        ?.getVersion === 'function',
                hasApiConfigWrite:
                    typeof (api as { config?: { write?: unknown } } | undefined)?.config?.write ===
                    'function'
            }
        })
        expect(bridge.hasElectron).toBe(true)
        expect(bridge.hasApi).toBe(true)
        expect(bridge.hasIpcRenderer).toBe(true)
        expect(bridge.hasApiConfigRead).toBe(true)
        expect(bridge.hasApiConfigWrite).toBe(true)
        expect(bridge.hasApiGetVersion).toBe(true)

        // 5) 真实 IPC 往返：渲染层 → preload → 主进程（SYSTEM.APP_VERSION 处理器）
        const version = await page.evaluate(async () => {
            const api = (
                window as unknown as {
                    api: { app: { getVersion: () => Promise<Record<string, string>> } }
                }
            ).api
            return api.app.getVersion()
        })
        expect(version.electronVersion).toBeTruthy()
        expect(version.chromeVersion).toBeTruthy()
        expect(version.nodeVersion).toBeTruthy()
    })
})
