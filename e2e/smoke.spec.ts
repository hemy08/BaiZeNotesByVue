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

    /**
     * 性能改造（主界面按需异步加载）的真实产物契约：
     * - 入口只加载欢迎页所需的少量 JS（改造前入口 chunk ≈ 9.86MB，含 Monaco/highlight.js/KaTeX）；
     * - 主界面（BaiZeNotes.vue → Monaco 等）改为独立异步 chunk，入口 HTML 不预载该 chunk，
     *   否则动态 import 失去「欢迎页首屏更快」的意义。
     * 说明：该用例只读构建产物，不需要额外启动 Electron（describe 的 beforeAll 已启动一次）。
     */
    test('构建产物契约：入口 JS 小于 4MB，主界面大依赖在未预载的异步 chunk 中', () => {
        const rendererDir = path.join(ROOT, 'out', 'renderer')
        const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf-8')
        const assetPath = (href: string): string =>
            path.join(rendererDir, href.replace(/^(\.\/)+/, ''))
        const assetSize = (href: string): number => fs.statSync(assetPath(href)).size

        // 1) 入口脚本 + modulepreload 的初始 JS 总量 < 4MB（验收线；改造前单入口 chunk 即 9.86MB）
        const scriptSrc = html.match(/<script[^>]+src="([^"]+)"/)?.[1]
        expect(scriptSrc, 'index.html 应包含入口 module 脚本').toBeTruthy()
        const preloadHrefs = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
            (match) => match[1]
        )
        const initialJsBytes = [scriptSrc as string, ...preloadHrefs].reduce(
            (sum, href) => sum + assetSize(href),
            0
        )
        expect(initialJsBytes).toBeLessThan(4 * 1024 * 1024)

        // 2) 入口 JS 不含 Monaco / highlight.js 运行时标记：大依赖确实不在首屏解析
        const entryCode = fs.readFileSync(assetPath(scriptSrc as string), 'utf-8')
        expect(entryCode).not.toContain('MonacoEnvironment')
        expect(entryCode).not.toContain('hljs')

        // 3) 主界面异步 chunk 存在且含 Monaco（入口 chunk 通过动态 import 引用），
        //    并且入口 HTML 不把它放进 modulepreload（按需加载而非预载）
        const asyncChunkMatch = entryCode.match(/import\("\.\/([^"]+\.js)"\)\.then/)
        expect(asyncChunkMatch, '入口 chunk 应通过动态 import 引用主界面异步 chunk').toBeTruthy()
        const asyncChunkName = asyncChunkMatch?.[1] as string
        expect(html).not.toContain(asyncChunkName)
        const asyncChunkCode = fs.readFileSync(
            path.join(rendererDir, 'assets', asyncChunkName),
            'utf-8'
        )
        expect(asyncChunkCode).toContain('MonacoEnvironment')
        expect(fs.statSync(path.join(rendererDir, 'assets', asyncChunkName)).size).toBeGreaterThan(
            5 * 1024 * 1024
        )
    })

    /**
     * 主界面异步分块的真实加载验证（改造前该组件随入口 chunk 静态加载，无此路径）。
     *
     * 通过真实 config:write 写入 show-welcome=false 后刷新页面，模拟「启动即主界面」路径：
     * App.vue 会在 READY 前预加载主界面分块并等待其挂载；这里断言主界面根节点、状态栏与
     * Monaco 编辑器 DOM 均出现，且整条链路没有渲染层未捕获异常。
     */
    test('主界面异步分块可加载：show-welcome=false 时直接进入主界面', async () => {
        type ConfigApi = {
            config: {
                read: <T = unknown>(name: string) => Promise<T | null>
                write: <T = unknown>(name: string, data: T) => Promise<boolean>
            }
        }
        const readShowWelcome = () =>
            page.evaluate(() =>
                (window as unknown as { api: ConfigApi }).api.config.read<boolean>('show-welcome')
            )
        const writeShowWelcome = (value: boolean) =>
            page.evaluate(
                (next) =>
                    (window as unknown as { api: ConfigApi }).api.config.write(
                        'show-welcome',
                        next
                    ),
                value
            )

        const originalShowWelcome = await readShowWelcome()
        const pageErrors: string[] = []
        const collectPageError = (error: Error): void => {
            pageErrors.push(String(error))
        }
        page.on('pageerror', collectPageError)

        try {
            expect(await writeShowWelcome(false)).toBe(true)
            await page.reload()

            // 欢迎页不再显示，主界面根节点与状态栏已挂载
            await expect(page.locator('.welcome-screen')).toHaveCount(0)
            await expect(page.locator('#editor-container')).toBeVisible()
            await expect(page.locator('#status-bar')).toBeVisible()
            // Monaco 异步 chunk 加载完成：编辑器容器内出现 Monaco 根 DOM
            await expect(page.locator('#monaco-editor-container .monaco-editor')).toBeVisible({
                timeout: 30_000
            })
            expect(pageErrors).toEqual([])
        } finally {
            page.off('pageerror', collectPageError)
            // 还原配置：未设置过（null）时恢复为默认的「显示欢迎页」
            await writeShowWelcome(originalShowWelcome !== false)
        }
    })
})
