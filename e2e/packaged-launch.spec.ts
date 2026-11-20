/**
 * E2E：打包产物直接启动（electron-builder --dir 的 win-unpacked）
 *
 * 与开发构建冒烟的区别：验证真正会交付给用户的产物——app.asar 内主进程/预加载/渲染层、
 * extraResources（config/icon/themes/plantuml）、打包后的单文件 preload 与 sandbox 配置。
 * 这些链路在 `electron-vite build`（未打包）产物上无法覆盖：asar 内 require 路径、
 * 资源目录解析（app.isPackaged 分支）、生产环境 CSP/安全告警行为都不同。
 *
 * 隔离策略（打包版与开发版不同）：
 * - 打包版 Electron 忽略 `-r` 预加载注入（实测），无法重定向 userData 派生路径；
 *   因此 Electron userData 走 `--user-data-dir=<临时目录>`；
 * - home 下真实配置目录 `~/.baizenotes/config` 由 ConfigSandbox 备份 → 清空为全新配置
 *   （保证启动显示欢迎页的确定性场景）→ finally 恢复；测试期间新建的 `.baizenotes`
 *   顶层条目与 win-unpacked/log 日志文件一并清理。
 *
 * 运行的构建前提：`npm run build:unpack`（或 `node build/prepare-build-dirs.js` +
 * `npx electron-builder --dir`），缺产物时整文件跳过。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    PACKAGED_EXE,
    createConfigSandbox,
    createTempProfile,
    launchPackagedApp,
    waitForRendererReady
} from './helpers/electron-profile'
import { recordStartupMetrics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(PACKAGED_EXE),
    '缺少打包产物 out/build/dist/win-unpacked/BaiZeNotes.exe：请先执行 npm run build:unpack'
)

/** win-unpacked/log：打包版日志回退目录（日志会写入构建产物目录，测试后清理测试新增文件） */
const PACKAGED_LOG_DIR = path.join(path.dirname(PACKAGED_EXE), 'log')

interface LogDirSnapshot {
    existed: boolean
    entries: string[]
}

function snapshotLogDir(): LogDirSnapshot {
    const existed = fs.existsSync(PACKAGED_LOG_DIR)
    return { existed, entries: existed ? fs.readdirSync(PACKAGED_LOG_DIR) : [] }
}

function restoreLogDir(snapshot: LogDirSnapshot): void {
    if (!snapshot.existed) {
        fs.rmSync(PACKAGED_LOG_DIR, { recursive: true, force: true })
        return
    }
    if (!fs.existsSync(PACKAGED_LOG_DIR)) {
        return
    }
    for (const entry of fs.readdirSync(PACKAGED_LOG_DIR)) {
        if (!snapshot.entries.includes(entry)) {
            fs.rmSync(path.join(PACKAGED_LOG_DIR, entry), { recursive: true, force: true })
        }
    }
}

test.describe('打包产物启动', () => {
    test('直接启动 BaiZeNotes.exe：主窗口创建/可见、渲染层从 asar 加载且无白屏', async () => {
        const profile = createTempProfile('baize-e2e-packaged-')
        const sandbox = createConfigSandbox(profile)
        const logSnapshot = snapshotLogDir()
        let app: ElectronApplication | undefined

        try {
            // 全新空配置：打包版启动后应显示欢迎页（确定性场景，避免受真实用户配置影响）
            sandbox.seed()
            const userDataDir = path.join(profile.root, 'userData')
            fs.mkdirSync(userDataDir, { recursive: true })

            app = await launchPackagedApp(userDataDir)
            const page = await app.firstWindow()
            // 统一就绪等待：页面已从 about:blank 导航到 asar 入口 + preload 桥注入 +
            // IPC 往返可用 + Vue 根节点挂载（比 domcontentloaded 可靠，冷启动更慢故放宽超时）
            const startedAt = Date.now()
            await waitForRendererReady(page, { timeout: 90_000 })
            // P1-4：打包启动路径没有 reload/进程重启兜底（launchPackagedApp 直接启动），
            // 成功即代表首启就绪；仍记录统一指标，保证所有 spec 的启动数据口径一致。
            recordStartupMetrics(
                { launchAttempts: 1, reloadRecoveries: 0, launchFailures: [] },
                test.info(),
                '打包产物启动',
                { readyMs: Date.now() - startedAt }
            )

            // 1) 主进程侧：确为打包版、只创建一个主窗口、窗口最终可见
            const state = await app.evaluate(({ app: electronApp, BrowserWindow }) => {
                const windows = BrowserWindow.getAllWindows()
                return {
                    isPackaged: electronApp.isPackaged,
                    windowCount: windows.length,
                    userData: electronApp.getPath('userData')
                }
            })
            expect(state.isPackaged).toBe(true)
            expect(state.windowCount).toBe(1)
            // --user-data-dir 必须生效，否则 fileState/缓存会写真实 %APPDATA%
            expect(path.resolve(state.userData)).toBe(path.resolve(userDataDir))
            await expect
                .poll(
                    () =>
                        app!.evaluate(
                            ({ BrowserWindow }) =>
                                BrowserWindow.getAllWindows()[0]?.isVisible() ?? false
                        ),
                    { timeout: 30_000, message: '打包版主窗口未变为可见' }
                )
                .toBe(true)

            // 2) 渲染层来自打包后的 asar（production 资源路径分支，区别于开发构建的 out/build/renderer）
            await expect(page).toHaveURL(
                /resources[\\/]app\.asar[\\/]out[\\/]build[\\/]renderer[\\/]index\.html$/
            )

            // 3) 无白屏：欢迎页与主界面至少一个可见，且根节点有文本内容
            await expect
                .poll(
                    async () => {
                        const welcomeVisible = await page
                            .locator('.welcome-screen')
                            .isVisible()
                            .catch(() => false)
                        const mainViewVisible = await page
                            .locator('#editor-container')
                            .isVisible()
                            .catch(() => false)
                        return welcomeVisible || mainViewVisible
                    },
                    { timeout: 30_000, message: '打包版窗口白屏：欢迎页与主界面均不可见' }
                )
                .toBe(true)
            const rootText = (await page.locator('#app-root').innerText()).trim()
            expect(rootText.length, '打包版根节点无文本内容（白屏）').toBeGreaterThan(0)

            // 4) 打包后 preload 仍为单文件并完成 contextBridge 注入（sandbox: true 回归防线）
            const bridge = await page.evaluate(() => {
                const api = (window as unknown as { api?: { config?: { read?: unknown } } }).api
                return {
                    hasApi: typeof api === 'object' && api !== null,
                    hasConfigRead: typeof api?.config?.read === 'function'
                }
            })
            expect(bridge.hasApi).toBe(true)
            expect(bridge.hasConfigRead).toBe(true)
        } finally {
            await app?.close().catch(() => undefined)
            sandbox.restore()
            restoreLogDir(logSnapshot)
            profile.cleanup()
        }
    })
})
