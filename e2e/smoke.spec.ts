/**
 * E2E 冒烟：真实 Electron 进程启动与主窗口渲染（ET-11）
 *
 * 覆盖链路：out/build/main/index.js → app.whenReady → createWindow → preload contextBridge →
 * 渲染层 Vue 挂载 + IPC 往返。单元测试全部在 jsdom/mock 下运行，无法发现以下问题：
 * - preload 构建产物缺失或 sandbox 下 require 路径异常；
 * - BrowserWindow webPreferences 与渲染层入口不匹配；
 * - contextBridge 未注入 / 渲染层首个 Vue 组件挂载失败。
 *
 * 运行：npx electron-vite build && npm run test:e2e
 * 需桌面环境（Windows/macOS/Linux GUI）；CI 见 .github/workflows/ci.yml 的 e2e job。
 * 说明：页面的 index.html 未声明 <title>，窗口标题由主进程 BrowserWindow.title 提供，
 * 因此标题断言走 app.evaluate 读取原生窗口标题，而不是 page.title()。
 *
 * P0 E2E 补齐（本轮）：启动统一走 e2e/helpers/electron-profile.ts——
 * userData 经 `-r` 夹具重定向到临时目录；home 下真实配置目录（~/.baizenotes/config）由
 * ConfigSandbox 备份 → 隔离 → 恢复，用例结束整体清理；
 * Windows 下使用 out/tmp 的 Electron 运行时副本（受限沙箱内 node_modules 的 electron.exe
 * 会以 Low 完整性级别运行而无法创建 GUI 窗口），本地与 CI 行为一致。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    ROOT,
    createConfigSandbox,
    createTempProfile,
    launchDevAppWithRenderer,
    waitForRendererReady
} from './helpers/electron-profile'
import type { ConfigSandbox, LaunchedDevApp, TempProfile } from './helpers/electron-profile'
import { recordStartupMetrics } from './helpers/app-ui'

// 未构建时整文件跳过，避免误报（构建命令见 CI 的 e2e job / 本地 npx electron-vite build）
test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

test.describe('Electron 主窗口冒烟', () => {
    let app: ElectronApplication
    let page: Page
    let profile: TempProfile
    let sandbox: ConfigSandbox
    let launched: LaunchedDevApp

    test.beforeAll(async () => {
        // 隔离用户数据：userData 用临时目录，真实配置目录用 ConfigSandbox 备份/恢复
        profile = createTempProfile('baize-e2e-smoke-')
        sandbox = createConfigSandbox(profile)
        sandbox.seed()
        // 统一就绪等待：首窗口 → preload 桥注入 → IPC 往返 → Vue 根节点挂载
        //（替代 firstWindow + domcontentloaded 的不可靠组合，避免 preload 未注入时误操作）
        launched = await launchDevAppWithRenderer(profile)
        app = launched.app
        page = launched.page
    })

    test.afterAll(async () => {
        await app?.close()
        sandbox?.restore()
        profile?.cleanup()
    })

    // P1-4：每个用例都消费启动指标（annotation + console）；默认容错只记录，
    // E2E_STRICT_LAUNCH=1 时零恢复硬失败。beforeAll 内不可调用 test.info()，故放在 beforeEach。
    test.beforeEach(() => {
        recordStartupMetrics(launched, test.info(), '主窗口冒烟')
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
        // 1) 渲染层已加载 electron-vite 构建产物（未打包 dev 构建走 file://；
        //    打包产物走 app://baize/index.html，见 packaged-launch/app-protocol spec）
        await expect(page).toHaveURL(/\/out\/build\/renderer\/index\.html$/)

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
     * 结构优化第 2 批 2.2（H4）的真实产物契约：主界面二级分块。
     *
     * 背景：第 1 批把整个主界面（BaiZeNotes.vue）改为异步 chunk（9.44 MB，含 Monaco/
     * highlight.js/KaTeX）；本批次再做二级拆分——主界面壳（页面框架/工具栏/编辑器编排）
     * 首个 chunk ≤2 MB，Monaco 与预览渲染管线各自独立成按需 chunk，由壳 chunk 动态 import
     * 引用，入口 HTML 不预载，从而保证「进入主界面先渲染壳/骨架，重型依赖随后加载」。
     *
     * 断言口径（只读构建产物，不额外启动 Electron；describe 的 beforeAll 已启动一次）：
     * 1. 入口 chunk ≤150 KB，入口 + modulepreload 的初始 JS <1 MB；
     * 2. 入口仅通过动态 import 引用主界面壳 chunk，HTML 不预载该 chunk；
     * 3. 壳 chunk ≤2 MB，且不含 Monaco / highlight.js / KaTeX 运行时标记（未同步求值）；
     * 4. Monaco（editor.api + MarkdownMonacoEditor，合计 >5 MB）与预览
     *    （MarkdownPreviewComponent，>1 MB）是独立 chunk，均由壳 chunk 动态 import；
     * 5. 上述大依赖 chunk 既不出现在入口 HTML 的 modulepreload 中，也不出现在入口代码中。
     */
    test('构建产物契约：主界面壳 ≤2MB，Monaco/预览为未预载的二级异步 chunk', () => {
        const rendererDir = path.join(ROOT, 'out', 'build', 'renderer')
        const assetsDir = path.join(rendererDir, 'assets')
        const html = fs.readFileSync(path.join(rendererDir, 'index.html'), 'utf-8')
        const assetPath = (href: string): string =>
            path.join(rendererDir, href.replace(/^(\.\/)+/, ''))
        const assetSize = (href: string): number => fs.statSync(assetPath(href)).size
        const readAsset = (name: string): string =>
            fs.readFileSync(path.join(assetsDir, name), 'utf-8')
        const allJsAssets = fs.readdirSync(assetsDir).filter((name) => name.endsWith('.js'))
        /** 按依赖独有的运行时标记定位 chunk（构建产物无 sourcemap，标记比文件名稳定） */
        const findChunksByMarker = (marker: string): string[] =>
            allJsAssets.filter((name) => readAsset(name).includes(marker))
        /** 解析某 chunk 代码中动态 import 的目标 chunk 文件名集合 */
        const dynamicImportsOf = (code: string): Set<string> =>
            new Set([...code.matchAll(/import\("\.\/([^"]+\.js)"\)/g)].map((match) => match[1]))

        // 1) 入口脚本 + modulepreload 的初始 JS 总量 < 1MB，且入口 chunk 自身 ≤150 KB
        const scriptSrc = html.match(/<script[^>]+src="([^"]+)"/)?.[1]
        expect(scriptSrc, 'index.html 应包含入口 module 脚本').toBeTruthy()
        const preloadHrefs = [...html.matchAll(/rel="modulepreload"[^>]*href="([^"]+)"/g)].map(
            (match) => match[1]
        )
        expect(assetSize(scriptSrc as string)).toBeLessThanOrEqual(150 * 1024)
        const initialJsBytes = [scriptSrc as string, ...preloadHrefs].reduce(
            (sum, href) => sum + assetSize(href),
            0
        )
        expect(initialJsBytes).toBeLessThan(1024 * 1024)

        // 2) 入口只含欢迎页依赖：不含大依赖运行时；通过动态 import 引用主界面壳 chunk
        const entryCode = readAsset(path.basename(assetPath(scriptSrc as string)))
        expect(entryCode).not.toContain('MonacoEnvironment')
        expect(entryCode).not.toContain('hljs.highlight')
        expect(entryCode).not.toContain('katex.renderToString')
        const entryDynamicImports = dynamicImportsOf(entryCode)
        const shellChunkName = [...entryDynamicImports].find((name) =>
            /^BaiZeNotes-.*\.js$/.test(name)
        )
        expect(shellChunkName, '入口 chunk 应通过动态 import 引用主界面壳 chunk').toBeTruthy()
        expect(html).not.toContain(shellChunkName as string)

        // 3) 主界面壳 chunk ≤2 MB，且不含 Monaco / highlight.js / KaTeX 运行时
        const shellCode = readAsset(shellChunkName as string)
        expect(assetSize(`assets/${shellChunkName as string}`)).toBeLessThanOrEqual(2 * 1024 * 1024)
        expect(shellCode).not.toContain('MonacoEnvironment')
        expect(shellCode).not.toContain('hljs.highlight')
        expect(shellCode).not.toContain('katex.renderToString')

        // 4) Monaco / 预览均为独立按需 chunk，且由壳 chunk 动态 import 引用
        const monacoChunkNames = findChunksByMarker('MonacoEnvironment')
        expect(monacoChunkNames.length, '应存在独立的 Monaco 分块').toBeGreaterThan(0)
        const monacoBytes = monacoChunkNames.reduce(
            (sum, name) => sum + fs.statSync(path.join(assetsDir, name)).size,
            0
        )
        expect(monacoBytes, 'Monaco 分块合计应 >5 MB（未被打散进壳 chunk）').toBeGreaterThan(
            5 * 1024 * 1024
        )

        // 预览管线以 highlight.js 的运行时方法为标记（i18n 文案里出现过 highlightAuto 字样，
        // 用 hljs.* 运行时调用点更精确）
        const previewChunkNames = findChunksByMarker('hljs.highlight')
        expect(previewChunkNames.length, '应存在独立的预览分块').toBeGreaterThan(0)
        const shellDynamicImports = dynamicImportsOf(shellCode)
        for (const name of [...monacoChunkNames, ...previewChunkNames]) {
            expect(shellDynamicImports.has(name), `${name} 应由主界面壳 chunk 动态按需加载`).toBe(
                true
            )
            // 5) 未预载：既不进入入口 HTML 的 modulepreload，也不被入口 chunk 静态/动态引用
            expect(html).not.toContain(name)
            expect(entryCode).not.toContain(name)
        }
    })

    /**
     * 主界面二级分块的真实加载验证（结构优化第 2 批 2.2 / H4）。
     *
     * 通过真实 config:write 写入 show-welcome=false 后刷新页面，模拟「启动即主界面」路径：
     * App.vue 会在 READY 前预加载主界面壳并等待其挂载（壳首帧不含 Monaco/预览）；
     * 随后 Monaco（MarkdownMonacoEditor）与预览（MarkdownPreviewComponent）各自按需加载。
     * 这里断言主界面根节点、状态栏、工具栏、Monaco 编辑器与预览容器均出现，
     * 且整条链路没有渲染层未捕获异常。
     */
    test('主界面二级分块可加载：show-welcome=false 时壳先挂载、Monaco/预览随后就位', async () => {
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
            // reload 后同样做完整就绪等待（preload 重新注入 + 渲染层重新挂载）
            await waitForRendererReady(page)

            // 欢迎页不再显示，主界面根节点与状态栏已挂载
            await expect(page.locator('.welcome-screen')).toHaveCount(0)
            await expect(page.locator('#editor-container')).toBeVisible()
            await expect(page.locator('#status-bar')).toBeVisible()
            // 二级分块 A：编辑器工具栏（独立 chunk）加载完成
            await expect(page.locator('.toolbar-container')).toBeVisible({ timeout: 30_000 })
            // 二级分块 B：Monaco 编辑器 chunk 加载完成，容器内出现 Monaco 根 DOM
            await expect(page.locator('#monaco-editor-container .monaco-editor')).toBeVisible({
                timeout: 30_000
            })
            // 二级分块 C：预览管线 chunk 加载完成，预览容器就位
            await expect(page.locator('#markdown-preview-html')).toBeVisible({ timeout: 30_000 })
            expect(pageErrors).toEqual([])
        } finally {
            page.off('pageerror', collectPageError)
            // 还原配置：未设置过（null）时恢复为默认的「显示欢迎页」
            await writeShowWelcome(originalShowWelcome !== false)
        }
    })
})
