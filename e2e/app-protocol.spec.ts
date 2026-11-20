/**
 * E2E：app:// 协议迁移（2026-11-20 renderer file:// → app://，关闭 file 协议特权 fuse）
 *
 * 背景：`grantFileProtocolExtraPrivileges` 关闭后 file:// 页面/子资源不可用（实测
 * ERR_FILE_NOT_FOUND / ERR_FAILED），**发布产物** renderer 改由自定义标准安全协议加载：
 * - 页面/静态资源/Monaco worker：app://baize（严格限定 renderer 构建产物根内）；
 * - 本地用户文件（Markdown 预览图片、HTML 查看器相对 CSS/图片/字体）：app://local，
 *   由主进程 Path Guard（受信根/用户选择路径/临时目录）白名单校验；
 * - PlantUML 隐藏渲染窗：app://plantuml（打包手工探针覆盖，见迁移报告）。
 *
 * 为什么用打包产物而不是 dev 构建：app:// 仅用于打包/生产路径（未打包 dev 构建保留
 * file://，见 src/main/index.ts 注释——Electron 43 上游 CDP preload 竞态在自定义协议首导航
 * 下高发，不影响发布产物）。因此本 spec 直接对 `out/build/dist/win-unpacked` 产物验证：
 * 1. renderer 由 app:// 加载：全部构建资源走 app://、file:// 不可用、越界路径被拒绝、
 *    Monaco editor worker 从 app:// 成功加载；
 * 2. Markdown 预览本地图片经 app://local 真实渲染（Path Guard 放行临时工作区）；
 * 3. HTML 查看器 srcdoc 的 base href 为 app://local，相对 CSS/图片真实生效（报告页链路）；
 * 4. PDF 查看器经 pdf.js worker 渲染（worker 脚本同源 app:// 加载，无 fake worker 回退）。
 *
 * 运行前提：`npm run build:unpack`（或 E2E 口径 `ELECTRON_BUILDER_E2E=1 npm run build:unpack:e2e`），
 * 缺产物时整文件跳过。打包版 userData/session 与 home 配置隔离策略同 packaged-launch.spec.ts。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    PACKAGED_EXE,
    createConfigSandbox,
    createTempProfile,
    launchPackagedApp,
    seedFileState,
    seedUserDataConfig,
    waitForRendererReady
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import { openRecentViaApi, recordStartupMetrics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(PACKAGED_EXE),
    '缺少打包产物 out/build/dist/win-unpacked/BaiZeNotes.exe：请先执行 npm run build:unpack'
)

/** 1×1 PNG（本地图片渲染断言用，避免依赖仓库二进制资产） */
const PNG_1PX = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
)

/** 打包版日志目录（日志写 win-unpacked/log，用例后清理测试新增文件） */
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

/** 关闭应用并等待文件句柄/单实例锁释放 */
async function closeApp(app: ElectronApplication | undefined): Promise<void> {
    await app?.close().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
}

/** 写入仅含 ASCII 对象的合法最小 PDF（pdf.js 需要可解析的 xref 偏移表） */
function buildMinimalPdf(text = 'Baize PDF worker'): Buffer {
    const objects: string[] = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
        '',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
    ]
    const stream = `BT /F1 18 Tf 20 100 Td (${text}) Tj ET`
    objects[3] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`
    let pdf = '%PDF-1.4\n'
    const offsets: number[] = []
    for (let index = 0; index < objects.length; index += 1) {
        offsets.push(pdf.length)
        pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`
    }
    const xrefStart = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const offset of offsets) {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
    }
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
    return Buffer.from(pdf, 'latin1')
}

/** 创建临时工作区 + 全新配置（打包版隔离策略同 packaged-launch.spec.ts） */
function createWorkspace(prefix: string): {
    profile: TempProfile
    sandbox: ConfigSandbox
    workspaceDir: string
    logSnapshot: LogDirSnapshot
} {
    const profile = createTempProfile(prefix)
    const sandbox = createConfigSandbox(profile)
    const logSnapshot = snapshotLogDir()
    sandbox.seed()
    seedUserDataConfig(profile, 'show-welcome', false)
    fs.mkdirSync(profile.userData, { recursive: true })
    const workspaceDir = path.join(profile.root, 'workspace')
    fs.mkdirSync(workspaceDir, { recursive: true })
    return { profile, sandbox, workspaceDir, logSnapshot }
}

/** 启动打包产物并等待渲染层就绪（app:// 页面 + preload 桥 + IPC + Vue 挂载） */
async function launchPackagedToReady(
    profile: TempProfile,
    testInfo: Parameters<typeof recordStartupMetrics>[1],
    label: string
): Promise<{ app: ElectronApplication; page: Page }> {
    const startedAt = Date.now()
    const app = await launchPackagedApp(profile.userData)
    const page = await app.firstWindow()
    await waitForRendererReady(page, { timeout: 90_000 })
    recordStartupMetrics(
        { launchAttempts: 1, reloadRecoveries: 0, launchFailures: [] },
        testInfo,
        label,
        { readyMs: Date.now() - startedAt }
    )
    return { app, page }
}

/** 在资源管理器中展开根目录并点击指定文件节点（HTML/PDF 查看器入口） */
async function clickFileTreeNode(page: Page, rootName: string, fileName: string): Promise<void> {
    const fileTree = page.locator('#file-tree')
    await expect(fileTree).toContainText(rootName, { timeout: 30_000 })
    const node = fileTree.locator('.file-manager-node').filter({ hasText: fileName })
    if (!(await node.isVisible().catch(() => false))) {
        await fileTree.locator('.node-content button').first().click()
    }
    await expect(node).toBeVisible({ timeout: 15_000 })
    await fileTree.locator('.node-content').filter({ hasText: fileName }).first().click()
}

test.describe('app:// 协议迁移（打包产物）', () => {
    test('renderer 由 app:// 加载：资源同源、file:// 不可用、越界拒绝、Monaco worker 正常', async () => {
        const testInfo = test.info()
        const { profile, sandbox, workspaceDir, logSnapshot } =
            createWorkspace('baize-e2e-appproto-')
        const sourceFile = path.join(workspaceDir, 'app-protocol.md')
        fs.writeFileSync(sourceFile, '# app 协议\n\nrenderer 由 app:// 加载。\n', 'utf-8')
        seedFileState(profile, { recentFiles: [sourceFile] })
        const consoleErrors: string[] = []
        let app: ElectronApplication | undefined
        try {
            const launched = await launchPackagedToReady(profile, testInfo, 'app:// 协议渲染层')
            app = launched.app
            const { page } = launched
            page.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text())
                }
            })

            // 1) 页面协议与全部构建资源均为 app://（无 file: 子资源）
            // 说明：自定义 scheme 的 Resource Timing 条目在打包产物（webSecurity=true）下
            // 不被 Chromium 暴露，故以真实 DOM 资源引用 + 已加载样式表作为同源证据。
            const layer = await page.evaluate(() => {
                const assetUrls = [
                    ...Array.from(document.scripts)
                        .map((script) => script.src)
                        .filter((url) => url.length > 0),
                    ...Array.from(document.styleSheets)
                        .map((sheet) => sheet.href)
                        .filter((href): href is string => typeof href === 'string')
                ]
                return {
                    href: location.href,
                    protocol: location.protocol,
                    origin: location.origin,
                    assetUrls,
                    fileUrls: assetUrls.filter((url) => url.startsWith('file:'))
                }
            })
            expect(layer.protocol).toBe('app:')
            expect(layer.origin).toBe('app://baize')
            expect(layer.href).toMatch(/^app:\/\/baize\/index\.html/)
            expect(layer.assetUrls.length, '应存在 app:// 加载的脚本/样式资源').toBeGreaterThan(0)
            expect(
                layer.assetUrls.every((url) => url.startsWith('app://baize/')),
                `构建资源应由 app:// 协议提供：${layer.assetUrls.join(' | ')}`
            ).toBe(true)
            expect(layer.fileUrls, 'app:// 页面不应再请求 file: 子资源').toEqual([])

            // 2) 应用代码来自 app.asar（协议 handler 读取 asar 内 renderer 资源）
            const appPath = await app.evaluate(({ app: electronApp }) => electronApp.getAppPath())
            expect(appPath.replace(/\\/g, '/')).toMatch(/app\.asar$/)

            // 3) 协议安全探针：renderer 资源 200；越界路径 403/404；file:// 不可用
            const probes = await page.evaluate(async () => {
                const probe = async (url: string): Promise<number> => {
                    try {
                        const response = await fetch(url)
                        return response.status
                    } catch {
                        return -1
                    }
                }
                return {
                    rendererAsset: await probe('app://baize/index.html'),
                    traversalEncoded: await probe('app://baize/%2e%2e/%2e%2e/%2e%2e/package.json'),
                    traversalBackslash: await probe('app://baize/assets/..\\..\\package.json'),
                    fileProtocol: await probe('file:///C:/Windows/win.ini')
                }
            })
            expect(probes.rendererAsset).toBe(200)
            expect([403, 404]).toContain(probes.traversalEncoded)
            // 反斜杠形态：Chromium 对 standard 自定义 scheme 会按前端安全语义归一为 `/`
            // （等价于已折叠到根内的普通路径，不再越界），最终由文件存在性返回 404；
            // 主进程 handler 侧仍有独立 403 拒绝（单测覆盖），此处接受 403/404 两种拒绝态。
            expect([403, 404]).toContain(probes.traversalBackslash)
            expect(probes.fileProtocol).toBe(-1)

            // 4) Monaco editor worker：通过 MonacoEnvironment.getWorker 真实构造（脚本从
            //    app:// worker chunk 加载），观察 1.5s 内无 Worker error 事件
            const openResult = await openRecentViaApi(page, {
                kind: 'file',
                path: sourceFile
            })
            expect(openResult.ok, `打开最近文件失败：${openResult.message ?? '未知原因'}`).toBe(
                true
            )
            await expect(
                page.locator('#monaco-editor-container .monaco-editor .view-lines').first()
            ).toBeVisible({ timeout: 30_000 })
            const workerProbe = await page.evaluate(async () => {
                const env = (
                    window as unknown as {
                        MonacoEnvironment?: { getWorker?: (id: number, label: string) => Worker }
                    }
                ).MonacoEnvironment
                if (!env || typeof env.getWorker !== 'function') {
                    return { ok: false, reason: 'MonacoEnvironment.getWorker 缺失' }
                }
                let worker: Worker
                try {
                    worker = env.getWorker(1, 'editorWorkerService')
                } catch (error) {
                    return { ok: false, reason: `构造失败：${String(error)}` }
                }
                const usable = typeof worker.postMessage === 'function'
                const noError = await new Promise<boolean>((resolve) => {
                    let errored = false
                    worker.onerror = () => {
                        errored = true
                    }
                    setTimeout(() => {
                        try {
                            worker.terminate()
                        } catch {
                            /* ignore */
                        }
                        resolve(!errored)
                    }, 1500)
                })
                return { ok: usable && noError, usable, noError }
            })
            expect(workerProbe.ok, `Monaco worker 未正常加载：${JSON.stringify(workerProbe)}`).toBe(
                true
            )
            // 渲染层不应出现 Worker 相关错误（CSP/协议拦截会在此暴露）
            expect(
                consoleErrors.filter((text) => /worker|csp|app:\/\//i.test(text)),
                `渲染层 Worker/CSP 错误：${consoleErrors.join(' | ')}`
            ).toEqual([])
        } finally {
            await closeApp(app)
            sandbox.restore()
            restoreLogDir(logSnapshot)
            profile.cleanup()
        }
    })

    test('Markdown 预览本地图片经 app://local 真实渲染（Path Guard 放行）', async () => {
        const testInfo = test.info()
        const { profile, sandbox, workspaceDir, logSnapshot } =
            createWorkspace('baize-e2e-appproto-img-')
        fs.writeFileSync(path.join(workspaceDir, 'pic.png'), PNG_1PX)
        const sourceFile = path.join(workspaceDir, 'preview-image.md')
        fs.writeFileSync(sourceFile, '# 本地图片\n\n![pic](./pic.png)\n', 'utf-8')
        seedFileState(profile, { recentFiles: [sourceFile] })
        let app: ElectronApplication | undefined
        try {
            const launched = await launchPackagedToReady(
                profile,
                testInfo,
                'Markdown 本地图片 app://local'
            )
            app = launched.app
            const { page } = launched
            const openResult = await openRecentViaApi(page, { kind: 'file', path: sourceFile })
            expect(openResult.ok, `打开最近文件失败：${openResult.message ?? '未知原因'}`).toBe(
                true
            )

            const previewImage = page.locator('#markdown-preview-html img').first()
            await expect(previewImage).toBeVisible({ timeout: 30_000 })
            const src = await previewImage.getAttribute('src')
            expect(src, '预览本地图片应转换为 app://local URL').toMatch(/^app:\/\/local\//)
            // 真实加载成功（协议 handler + Path Guard + CSP img-src app: 全链路生效）
            await expect
                .poll(
                    () =>
                        previewImage.evaluate(
                            (element) => (element as HTMLImageElement).naturalWidth
                        ),
                    { timeout: 15_000, message: '本地图片未加载成功（app://local 链路失败）' }
                )
                .toBeGreaterThan(0)
        } finally {
            await closeApp(app)
            sandbox.restore()
            restoreLogDir(logSnapshot)
            profile.cleanup()
        }
    })

    test('HTML 查看器静态报告页：base href 为 app://local，相对 CSS/图片真实生效', async () => {
        const testInfo = test.info()
        const { profile, sandbox, workspaceDir, logSnapshot } = createWorkspace(
            'baize-e2e-appproto-html-'
        )
        const siteDir = path.join(workspaceDir, 'report-site')
        fs.mkdirSync(path.join(siteDir, 'assets'), { recursive: true })
        fs.writeFileSync(path.join(siteDir, 'assets', 'pic.png'), PNG_1PX)
        fs.writeFileSync(
            path.join(siteDir, 'assets', 'report.css'),
            'html, body { background-color: rgb(1, 2, 3); margin: 0; }',
            'utf-8'
        )
        fs.writeFileSync(
            path.join(siteDir, 'README.html'),
            [
                '<!doctype html>',
                '<html><head><meta charset="utf-8">',
                '<link rel="stylesheet" href="assets/report.css">',
                '</head><body><h1>报告首页</h1><img id="logo" src="assets/pic.png" alt="logo"></body></html>'
            ].join('\n'),
            'utf-8'
        )
        seedUserDataConfig(profile, 'recent-folders', [siteDir])
        let app: ElectronApplication | undefined
        try {
            const launched = await launchPackagedToReady(
                profile,
                testInfo,
                'HTML 查看器 app://local'
            )
            app = launched.app
            const { page } = launched
            const openResult = await openRecentViaApi(page, { kind: 'folder', path: siteDir })
            expect(openResult.ok, `打开最近文件夹失败：${openResult.message ?? '未知原因'}`).toBe(
                true
            )
            await clickFileTreeNode(page, 'report-site', 'README.html')
            await expect(page.locator('#html-containers')).toBeVisible({ timeout: 30_000 })

            const frame = page.frameLocator('#html-containers iframe.html-iframe')
            // base href：迁移后应为 app://local/<工作区绝对路径>/（而非 file://）
            const baseHref = await frame
                .locator('base')
                .first()
                .getAttribute('href', { timeout: 30_000 })
            expect(baseHref, 'HTML 查看器 base href 应由 app://local 提供').toMatch(
                /^app:\/\/local\//
            )
            // 相对样式表生效（背景色来自 assets/report.css）
            await expect
                .poll(
                    () =>
                        frame
                            .locator('body')
                            .evaluate((element) => getComputedStyle(element).backgroundColor),
                    { timeout: 15_000, message: 'HTML 查看器相对 CSS 未生效（app://local 被拦截）' }
                )
                .toBe('rgb(1, 2, 3)')
            // 相对图片真实加载
            await expect
                .poll(
                    () =>
                        frame
                            .locator('#logo')
                            .evaluate((element) => (element as HTMLImageElement).naturalWidth),
                    { timeout: 15_000, message: 'HTML 查看器相对图片未加载（app://local 被拦截）' }
                )
                .toBeGreaterThan(0)
        } finally {
            await closeApp(app)
            sandbox.restore()
            restoreLogDir(logSnapshot)
            profile.cleanup()
        }
    })

    test('PDF 查看器：pdf.js worker 从 app:// 加载并渲染页面（无 fake worker 回退）', async () => {
        const testInfo = test.info()
        const { profile, sandbox, workspaceDir, logSnapshot } =
            createWorkspace('baize-e2e-appproto-pdf-')
        const pdfDir = path.join(workspaceDir, 'pdf-site')
        fs.mkdirSync(pdfDir, { recursive: true })
        const pdfFile = path.join(pdfDir, 'sample.pdf')
        fs.writeFileSync(pdfFile, buildMinimalPdf())
        seedUserDataConfig(profile, 'recent-folders', [pdfDir])
        const consoleMessages: string[] = []
        let app: ElectronApplication | undefined
        try {
            const launched = await launchPackagedToReady(
                profile,
                testInfo,
                'PDF 查看器 app:// worker'
            )
            app = launched.app
            const { page } = launched
            page.on('console', (message) => {
                consoleMessages.push(message.text())
            })
            const openResult = await openRecentViaApi(page, { kind: 'folder', path: pdfDir })
            expect(openResult.ok, `打开最近文件夹失败：${openResult.message ?? '未知原因'}`).toBe(
                true
            )
            await clickFileTreeNode(page, 'pdf-site', 'sample.pdf')
            await expect(page.locator('#pdf-containers .pdf-canvas')).toBeVisible({
                timeout: 30_000
            })
            // 页数解析成功（pdf.js 真实解析 + worker 渲染）
            await expect(page.locator('#pdf-containers .page-indicator')).toContainText('1 / 1', {
                timeout: 30_000
            })
            const canvasSize = await page
                .locator('#pdf-containers .pdf-canvas')
                .evaluate((element) => {
                    const canvas = element as HTMLCanvasElement
                    return { width: canvas.width, height: canvas.height }
                })
            expect(canvasSize.width).toBeGreaterThan(0)
            expect(canvasSize.height).toBeGreaterThan(0)
            // worker 加载失败时 pdf.js 会打印 "Setting up fake worker" 并回退主线程
            expect(
                consoleMessages.filter((text) => /fake worker/i.test(text)),
                `pdf.js worker 回退主线程（app:// worker 加载失败）：${consoleMessages.join(' | ')}`
            ).toEqual([])
        } finally {
            await closeApp(app)
            sandbox.restore()
            restoreLogDir(logSnapshot)
            profile.cleanup()
        }
    })
})
