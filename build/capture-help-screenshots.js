#!/usr/bin/env node
/**
 * 帮助文档截图采集脚本（1.5.6 REQ-07：可复跑的 22 张帮助截图）
 *
 * ## 定位
 * `docs/help/usage-guide.md` 的 22 个 `<figure>` 使用真实界面截图；UI 每次升级（如 1.5.6 的
 * 工具窗最大化/最小化按钮）都需要重采集。本脚本用 Playwright 启动**真实 Electron 应用**
 * （`out/build/main/index.js` + `--user-data-dir` 隔离临时用户目录），真实操作菜单/对话框后
 * 截图，替代此前「并行会话一次性手工截图、脚本未入库」的做法，做到长期可复跑。
 *
 * ## 设计要点
 * 1. **不 mock 产品行为**：菜单展开、对话框打开、非模态开关切换全部走真实渲染层交互；
 *    打开示例文档走 `window.api.file.openRecent`（真实主进程打开链路，与 E2E 同口径）。
 * 2. **隔离**：临时 userData（`--user-data-dir`）+ 真实 `~/.baizenotes/config` 备份/清空/恢复
 *    （系统设置/主题配置不在 userData 下，必须单独沙箱；结束无论成败都恢复原样）。
 * 3. **窗口尺寸**：产品默认主窗口 1280×800（无边框窗口，页面视口即 1280×800）；
 *    截图裁剪规则见 `capture`/`captureMenuScene` 注释，文档图宽度不超过 1280。
 * 4. **稳定化**：禁用过渡/动画与光标闪烁、隐藏状态栏瞬时提示、等待字体与 UI 就绪、
 *    截图前清空鼠标悬停残留（菜单场景保留悬停态）、固定的示例文档路径（避免状态栏路径随机）。
 * 5. **格式与 PDF 打印链**：应用内 HTML 图默认 WebP（q=85）：先截 PNG buffer，再用应用页面内
 *    canvas 转 WebP，失败自动回退 JPEG（`--format jpeg` 可强制），并在日志中标注回退；
 *    同时把**无损 PNG** 写到 `docs/help/images/print/`，专供 `generate-help-docs.js` 生成 PDF。
 *    原因：Chromium `printToPDF` 会把页面图片以无损 Flate 流嵌入 PDF，WebP 有损噪点会被
 *    完整记录导致 PDF 反向膨胀（实测 1.8MB→2.8MB）；无损 PNG 打印更小更清晰。
 *    该 print/ 子目录不进入 renderer public，因此不增加安装包体积。
 * 6. **幂等**：先采集到 `out/tmp/help-capture/pending/`，全部成功后统一发布到
 *    `docs/help/images/`，并删除同名旧 PNG/JPEG，避免目录里同时存在两种格式；
 *    可重复执行、结果覆盖。
 * 7. **标注**：`entry-*` 与 `entry-settings-switch` 图带红框+编号（与 usage-guide.md 图注
 *    的 ①②③ 对应），由脚本注入临时 DOM 叠加层后截图，截图后移除，不改产品代码。
 *
 * ## 用法
 *   node build/capture-help-screenshots.js            # 采集全部 22 张并发布
 *   node build/capture-help-screenshots.js --list     # 列出场景名
 *   node build/capture-help-screenshots.js --only entry-top-menu,insert-menu
 *   node build/capture-help-screenshots.js --out out/tmp/help-capture-preview --quality 80
 *   node build/capture-help-screenshots.js --format jpeg
 *
 * 前置：已构建 `out/build`（`npm run build:unpack` 或 `npm run build:unpack:e2e`），
 * 且 `node_modules/electron/dist` 存在。脚本会复用/准备 `out/tmp/e2e-electron-runtime/`
 * 的 electron 副本（与 E2E helper 同一策略，避免受限环境直接执行 node_modules 内 exe）。
 *
 * 产物结构：
 *   docs/help/images/<name>.webp          22 张显示用 WebP（usage-guide.md 引用）
 *   docs/help/images/print/<name>.png     22 张打印专用无损 PNG（仅 PDF 生成链引用）
 *   out/tmp/help-capture/manifest.json    采集清单（尺寸/体积/sha256；out/ 不入库，可作报告证据）
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.resolve(__dirname, '..')
/** electron-vite 构建产物主进程入口（与 E2E helper 同路径） */
const MAIN_ENTRY = path.join(ROOT, 'out', 'build', 'main', 'index.js')
/** 主窗口默认视口（产品默认 1280×800；无边框窗口下页面视口即窗口内容区） */
const VIEWPORT = { width: 1280, height: 800 }
/** 截图工作目录（全部不入库） */
const WORK_DIR = path.join(ROOT, 'out', 'tmp', 'help-capture')
const PENDING_DIR = path.join(WORK_DIR, 'pending')
/** 待发布的「PDF 打印专用无损 PNG」（随 help 图一起生成；不进安装包，仅用于生成 PDF） */
const PENDING_PRINT_DIR = path.join(PENDING_DIR, 'print')
const FIXTURE_DIR = path.join(WORK_DIR, 'fixtures')
const FIXTURE_PATH = path.join(FIXTURE_DIR, '插入工具示例.md')
const MANIFEST_PATH = path.join(WORK_DIR, 'manifest.json')
/** 帮助截图源目录（默认发布目标；usage-guide.md 以 images/ 相对引用） */
const DEFAULT_OUT_DIR = path.join(ROOT, 'docs', 'help', 'images')
/** 旧版帮助截图总体积参考（22 张 PNG 实测 1,541,300 B ≈ 1.47 MiB，用于报告回收比例） */
const LEGACY_TOTAL_BYTES = 1541300

/** 真实用户配置根目录（产品代码固定 home/.baizenotes；不在 userData 内，需单独沙箱） */
const BAIZE_HOME_DIR = path.join(os.homedir(), '.baizenotes')
const BAIZE_CONFIG_DIR = path.join(BAIZE_HOME_DIR, 'config')

/** Electron 运行时副本目录（与 e2e/helpers/electron-profile.ts 同策略） */
const ELECTRON_DIST_DIR = path.join(ROOT, 'node_modules', 'electron', 'dist')
const ELECTRON_RUNTIME_DIR = path.join(ROOT, 'out', 'tmp', 'e2e-electron-runtime')

/** 被本脚本接管的旧截图扩展名（发布时删除同名旧文件，避免双份体积） */
const LEGACY_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg']

/* ============================================================================================
 * 通用工具
 * ========================================================================================== */

/** 同步睡眠（仅用于关闭进程/清理的极短退避；UI 等待一律用条件轮询） */
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** 异步睡眠（等待过渡动画结束等短稳定窗口） */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

function ensureDir(dir) {
    fs.mkdirSync(dir, { recursive: true })
}

/** 递归删除（Windows 下句柄释放延迟时重试） */
function removeDirWithRetry(dir) {
    for (let attempt = 1; attempt <= 10; attempt++) {
        try {
            fs.rmSync(dir, { recursive: true, force: true })
            return
        } catch (error) {
            if (attempt === 10) {
                throw error
            }
            sleepSync(200)
        }
    }
}

function writeJson(file, data) {
    ensureDir(path.dirname(file))
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex')
}

function formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`
    return `${(bytes / 1024 / 1024).toFixed(2)} MiB`
}

/** 断言（失败即抛错，脚本退出码 1） */
function assert(condition, message) {
    if (!condition) {
        throw new Error(message)
    }
}

/** 描述 PNG buffer 的宽高（直接解析 IHDR，避免引入图像库） */
function pngSize(buffer) {
    const signature = '89504e470d0a1a0a'
    assert(buffer.length > 24, 'PNG buffer 过短')
    assert(buffer.subarray(0, 8).toString('hex') === signature, '截图为非 PNG 格式')
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
}

/* ============================================================================================
 * Electron 可执行文件准备（与 E2E helper 同一策略：复制到 out/tmp 再启动）
 * ========================================================================================== */

function resolveElectronExecutable() {
    const override = process.env.E2E_ELECTRON_EXECUTABLE
    if (override && fs.existsSync(override)) {
        return override
    }
    if (process.platform !== 'win32') {
        // 非 Windows：交给 Playwright 默认解析（node_modules/electron/dist）
        return undefined
    }
    const source = path.join(ELECTRON_DIST_DIR, 'electron.exe')
    if (!fs.existsSync(source)) {
        throw new Error(
            `未找到 Electron 可执行文件：${source}\n请先执行 npm install（以及 npm run build:unpack）`
        )
    }
    const target = path.join(ELECTRON_RUNTIME_DIR, 'electron.exe')
    const needCopy =
        !fs.existsSync(target) ||
        fs.statSync(target).size !== fs.statSync(source).size ||
        fs.statSync(target).mtimeMs < fs.statSync(source).mtimeMs
    if (needCopy) {
        // 并行进程可能正在使用旧副本（EBUSY），重试后仍失败则回退直接使用 node_modules 内 exe
        for (let attempt = 1; attempt <= 5; attempt++) {
            try {
                removeDirWithRetry(ELECTRON_RUNTIME_DIR)
                ensureDir(path.dirname(ELECTRON_RUNTIME_DIR))
                fs.cpSync(ELECTRON_DIST_DIR, ELECTRON_RUNTIME_DIR, { recursive: true })
                break
            } catch (error) {
                if (attempt === 5) {
                    console.warn(
                        `[help-shots] Electron 运行时副本准备失败（改用 node_modules 内的 exe）：${
                            error instanceof Error ? error.message : String(error)
                        }`
                    )
                    return source
                }
                sleepSync(500)
            }
        }
    }
    return target
}

/** 加载 Playwright Electron 驱动（playwright-core 为 @playwright/test 的依赖） */
function loadElectronDriver() {
    try {
        return require('playwright-core')._electron
    } catch (error) {
        try {
            return require('@playwright/test')._electron
        } catch {
            throw new Error(
                `未找到 Playwright（playwright-core / @playwright/test）：${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    }
}

/* ============================================================================================
 * 临时用户目录与真实配置沙箱
 * ========================================================================================== */

function createTempProfile(prefix = 'baize-help-shots-') {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    const userData = path.join(root, 'userData')
    ensureDir(userData)
    return {
        root,
        userData,
        cleanup() {
            try {
                removeDirWithRetry(root)
            } catch {
                console.warn(`[help-shots] 临时目录清理失败（系统临时目录可回收）：${root}`)
            }
        }
    }
}

/**
 * `~/.baizenotes/config` 沙箱：备份 → 清空（得到默认主题/系统设置）→ 结束时恢复。
 * 产品代码把系统设置/主题配置放在 home 目录而非 userData，必须单独处理。
 */
function createConfigSandbox(profile) {
    const homeExisted = fs.existsSync(BAIZE_HOME_DIR)
    const homeEntries = homeExisted ? fs.readdirSync(BAIZE_HOME_DIR) : []
    const configExisted = fs.existsSync(BAIZE_CONFIG_DIR)
    const backupDir = path.join(profile.root, 'real-config-backup')
    if (configExisted) {
        fs.cpSync(BAIZE_CONFIG_DIR, backupDir, { recursive: true })
    }
    return {
        configDir: BAIZE_CONFIG_DIR,
        seed() {
            fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
            ensureDir(BAIZE_CONFIG_DIR)
        },
        restore() {
            fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
            if (configExisted) {
                fs.cpSync(backupDir, BAIZE_CONFIG_DIR, { recursive: true })
            }
            if (!homeExisted) {
                fs.rmSync(BAIZE_HOME_DIR, { recursive: true, force: true })
                return
            }
            if (!fs.existsSync(BAIZE_HOME_DIR)) return
            for (const entry of fs.readdirSync(BAIZE_HOME_DIR)) {
                if (!homeEntries.includes(entry)) {
                    fs.rmSync(path.join(BAIZE_HOME_DIR, entry), { recursive: true, force: true })
                }
            }
        }
    }
}

/** 准备启动种子：关闭欢迎页 + 预置示例文档到「最近文件」（脚本随后经真实链路打开） */
function seedLaunchState(profile) {
    writeJson(path.join(profile.userData, 'config', 'show-welcome.json'), false)
    writeJson(path.join(profile.userData, 'fileState.json'), {
        lastOpenedFile: null,
        lastOpenedDirectory: null,
        recentFiles: [FIXTURE_PATH]
    })
}

/** 写入截图用的示例 Markdown（固定路径，状态栏不出现随机临时目录） */
function writeSampleDocument() {
    ensureDir(FIXTURE_DIR)
    fs.writeFileSync(
        FIXTURE_PATH,
        [
            '# 插入工具示例',
            '',
            '这是一篇用于帮助文档截图的示例笔记。',
            '',
            '插入工具让 Markdown 写作更顺手：表格、公式、图片、链接都可以从菜单直接插入。',
            ''
        ].join('\n'),
        'utf-8'
    )
}

/* ============================================================================================
 * 渲染进程就绪等待（与 e2e/helpers/electron-profile.ts 同口径）
 * ========================================================================================== */

function isAppEntryUrl(url) {
    return url.protocol === 'app:' || url.protocol === 'file:'
}

/** 读取 preload contextBridge 注入快照（失败诊断/恢复判定共用） */
async function readRendererBridgeSnapshot(page) {
    return page.evaluate(() => {
        const bridge = window
        const ipc = bridge.electron?.ipcRenderer
        const api = bridge.api
        return {
            url: window.location.href,
            hasElectron: typeof bridge.electron === 'object' && bridge.electron !== null,
            hasApi: typeof api === 'object' && api !== null,
            hasIpcInvoke: typeof ipc?.invoke === 'function',
            hasConfigRead: typeof api?.config?.read === 'function',
            hasGetVersion: typeof api?.app?.getVersion === 'function'
        }
    })
}

/** 等待 preload 桥 + IPC 往返 + Vue 根节点就绪 */
async function waitForRendererReady(page, timeout = 30_000) {
    try {
        await page.waitForURL(isAppEntryUrl, { timeout })
        await page.waitForLoadState('domcontentloaded')
        await page.waitForFunction(
            () => {
                const bridge = window
                const ipc = bridge.electron?.ipcRenderer
                const api = bridge.api
                return (
                    typeof ipc?.on === 'function' &&
                    typeof ipc?.send === 'function' &&
                    typeof ipc?.invoke === 'function' &&
                    typeof api?.config?.read === 'function' &&
                    typeof api?.config?.write === 'function' &&
                    typeof api?.app?.getVersion === 'function'
                )
            },
            undefined,
            { timeout }
        )
        await page.waitForFunction(
            async () => {
                try {
                    const version = await window.api?.app?.getVersion?.()
                    return typeof version?.electronVersion === 'string'
                } catch {
                    return false
                }
            },
            undefined,
            { timeout }
        )
        await page.waitForFunction(
            () => {
                const root = document.getElementById('app-root')
                return root !== null && root.childElementCount > 0
            },
            undefined,
            { timeout }
        )
    } catch (error) {
        const snapshot = await readRendererBridgeSnapshot(page).catch(() => null)
        throw new Error(
            `渲染进程未就绪（${timeout}ms）：` +
                (snapshot ? JSON.stringify(snapshot) : '页面不可读（未导航或渲染进程崩溃）'),
            { cause: error }
        )
    }
}

/** 判定「首次导航 preload 未注入」签名（可在同一进程内 reload 恢复） */
function isPreloadMissingSignature(snapshot) {
    return (
        snapshot !== null &&
        (snapshot.url.startsWith('app:') || snapshot.url.startsWith('file:')) &&
        !snapshot.hasElectron &&
        !snapshot.hasApi
    )
}

/**
 * 启动应用到主界面（含 Electron 43.x sandboxed preload 启动竞态的 reload 恢复与整进程重试）。
 *
 * 背景：`_electron.launch` 的 CDP 早期 attach 会放大上游 #54155 竞态（首次导航的文档不执行
 * preload），表现为页面渲染完成但 `window.electron/window.api` 缺失；新导航会重新推送启动
 * 数据，因此 `page.reload()` 一次即可恢复。这与 E2E helper 的处理口径一致。
 */
async function launchMainView(profile) {
    const electron = loadElectronDriver()
    const executablePath = resolveElectronExecutable()
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const maxAttempts = 3
    const failures = []
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const app = await electron.launch({
            executablePath,
            args: [`--user-data-dir=${profile.userData}`, MAIN_ENTRY],
            env,
            timeout: 60_000
        })
        try {
            const page = await app.firstWindow()
            await page.setViewportSize(VIEWPORT).catch(() => undefined)
            await waitForRendererReadyMaybeReload(page)
            return { app, page }
        } catch (error) {
            failures.push(
                `第 ${attempt}/${maxAttempts} 次启动失败：${
                    error instanceof Error ? error.message : String(error)
                }`
            )
            await app.close().catch(() => undefined)
            if (attempt < maxAttempts) {
                await delay(500)
            }
        }
    }
    throw new Error(`应用启动 ${maxAttempts} 次仍未就绪：\n${failures.join('\n')}`)
}

/** 就绪等待：preload 缺失签名时先 reload 一次恢复，再走完整就绪等待 */
async function waitForRendererReadyMaybeReload(page) {
    try {
        await waitForRendererReady(page, 8_000)
        return
    } catch (error) {
        const snapshot = await readRendererBridgeSnapshot(page).catch(() => null)
        if (isPreloadMissingSignature(snapshot)) {
            console.warn('[help-shots] 命中首次导航 preload 未注入，执行 page.reload() 恢复')
            await page.reload({ timeout: 15_000 })
            await waitForRendererReady(page, 25_000)
            return
        }
        throw error
    }
}

/** 等待主界面（#editor-container）；极少数启动落在欢迎页时写 show-welcome=false 并 reload 补偿 */
async function waitMainView(page, profile) {
    const editorVisible = await page
        .locator('#editor-container')
        .isVisible({ timeout: 5_000 })
        .catch(() => false)
    if (!editorVisible) {
        writeJson(path.join(profile.userData, 'config', 'show-welcome.json'), false)
        await page.reload()
        await waitForRendererReady(page, 30_000)
    }
    await page.locator('#editor-container').waitFor({ state: 'visible', timeout: 60_000 })
}

/* ============================================================================================
 * 页面稳定化 / 通用 UI 操作
 * ========================================================================================== */

/** 截图稳定化注入：禁用过渡动画与光标闪烁、隐藏状态栏瞬时消息 */
async function stabilize(page) {
    await page.addStyleTag({
        content:
            '*, *::before, *::after {' +
            ' transition: none !important;' +
            ' animation: none !important;' +
            ' caret-color: transparent !important; }' +
            // 状态栏瞬时提示（启动/操作消息）会自动重置，同一状态两次截图可能不一致
            ' #status-bar-console { visibility: hidden !important; }'
    })
    // 等待字体加载 + 外观管道（data-style / data-density）就绪，避免截到半成品样式
    await page.evaluate(() => document.fonts.ready).catch(() => undefined)
    await page
        .waitForFunction(
            () =>
                document.documentElement.dataset.style !== undefined &&
                document.documentElement.dataset.density !== undefined,
            undefined,
            { timeout: 15_000 }
        )
        .catch(() => undefined)
    await page.waitForTimeout(300)
}

/** 经真实主进程链路打开示例文档，并把焦点放进 Monaco（表格编辑器依赖活动编辑器） */
async function openSampleDocument(page) {
    const result = await page.evaluate(
        (file) => window.api.file.openRecent({ kind: 'file', path: file }),
        FIXTURE_PATH
    )
    assert(result && result.ok, `打开示例文档失败：${result?.message ?? '未知原因'}`)
    await page.locator('.monaco-editor').first().waitFor({ state: 'visible', timeout: 30_000 })
    await page.waitForTimeout(400)
}

/** 点击编辑器正文，确保活动编辑器注册且焦点在 Monaco 内（工具窗以「插入模式」打开） */
async function focusEditorBody(page) {
    const editor = page.locator('.monaco-editor .view-lines').first()
    await editor.waitFor({ state: 'visible', timeout: 15_000 })
    await editor.click({ position: { x: 60, y: 30 } }).catch(() => undefined)
    await page
        .waitForFunction(
            () => document.activeElement?.closest('.monaco-editor') !== null,
            undefined,
            {
                timeout: 10_000
            }
        )
        .catch(() => undefined)
    await page.waitForTimeout(200)
}

/** 菜单项定位：level 0 = 顶层下拉的一级项；level 1+ = 已展开的嵌套层 */
function menuItemLocator(page, level, index) {
    return page
        .locator(
            `.submenu-list[data-menu-level="${level}"] > .menu-submenu-item[data-item-index="${index}"]`
        )
        .first()
}

/** 原生坐标悬停（比 locator.hover 更稳：菜单展开会重渲染节点，坐标悬停不参与命中检测重试） */
async function hoverByLocator(page, locator, settleMs = 420) {
    await locator.waitFor({ state: 'visible', timeout: 10_000 })
    const box = await locator.boundingBox()
    assert(box !== null, '菜单项不可见，无法悬停')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.waitForTimeout(settleMs)
}

/** 关闭全部菜单（Esc + 鼠标移到中性位置） */
async function closeMenus(page) {
    await page.keyboard.press('Escape').catch(() => undefined)
    await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2).catch(() => undefined)
    await page.waitForTimeout(220)
}

/** 关闭所有浮层（对话框/工具窗/菜单），供场景切换时复位 */
async function closeAllFloating(page) {
    for (let attempt = 0; attempt < 8; attempt++) {
        const menuCount = await page.locator('.submenu-container').count()
        if (menuCount > 0) {
            await closeMenus(page)
            continue
        }
        const dialogs = page.locator('.dialog-overlay .dialog-container')
        const dialogCount = await dialogs.count()
        if (dialogCount === 0) {
            await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2).catch(() => undefined)
            await page.waitForTimeout(120)
            return
        }
        // 优先点最上层对话框的关闭按钮；点不到再 Esc（非模态工具窗 Esc 需要焦点在窗内）
        const closeButtons = page.locator('.dialog-overlay .dialog-container .title-bar .close-btn')
        const closeCount = await closeButtons.count()
        let clicked = false
        if (closeCount > 0) {
            clicked = await closeButtons
                .nth(closeCount - 1)
                .click({ timeout: 2_000 })
                .then(() => true)
                .catch(() => false)
        }
        if (!clicked) {
            await page.keyboard.press('Escape').catch(() => undefined)
        }
        await page.waitForTimeout(320)
    }
    throw new Error('无法关闭残留浮层（对话框/菜单）')
}

/** 打开顶层菜单（先清理残留浮层；点击顶层菜单项） */
async function openTopMenu(page, label) {
    await closeAllFloating(page)
    await page.locator('.menu-bar .menu-item').filter({ hasText: label }).first().click()
    await page.locator('.submenu-container').waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForTimeout(250)
}

/** 在当前展开的顶层下拉中点击叶子菜单项（按文本） */
async function clickLeafItem(page, text) {
    const locator = page
        .locator('.submenu-list[data-menu-level="0"] > .menu-submenu-item')
        .filter({ hasText: text })
        .first()
    await locator.click()
}

/** 在当前展开的嵌套层（level 1）中点击叶子项 */
async function clickNestedItem(page, text) {
    const locator = page
        .locator('.nested-submenu .submenu-list[data-menu-level="1"] > .menu-submenu-item')
        .filter({ hasText: text })
        .first()
    await locator.click()
}

/** 等待对话框/工具窗出现（可附加内容选择器，证明是目标窗口而非残留浮层） */
async function waitForDialog(page, contentSelector, timeout = 20_000) {
    await page.locator('.dialog-overlay .dialog-container').last().waitFor({
        state: 'visible',
        timeout
    })
    if (contentSelector) {
        await page.locator(contentSelector).first().waitFor({ state: 'visible', timeout })
    }
    // 对话框缩放/内容异步渲染（Mermaid 预览等）稳定窗口
    await page.waitForTimeout(700)
}

/** 读取最上层对话框的视口矩形 */
async function topDialogRect(page) {
    const handles = page.locator('.dialog-overlay .dialog-container')
    const count = await handles.count()
    assert(count > 0, '当前没有打开的对话框')
    const box = await handles.nth(count - 1).boundingBox()
    assert(box !== null, '对话框不可见')
    return { x: box.x, y: box.y, w: box.width, h: box.height }
}

/* ============================================================================================
 * 图片裁剪与标注
 * ========================================================================================== */

/** 裁剪矩形收敛到视口内（并去掉亚像素） */
function clampClip(rect) {
    const x = Math.max(0, Math.round(rect.x))
    const y = Math.max(0, Math.round(rect.y))
    const right = Math.min(VIEWPORT.width, Math.round(rect.x + rect.w))
    const bottom = Math.min(VIEWPORT.height, Math.round(rect.y + rect.h))
    return { x, y, width: Math.max(1, right - x), height: Math.max(1, bottom - y) }
}

/** 对话框截图裁剪：对话框外扩 1px（含边框），收敛到视口 */
function dialogClip(rect) {
    return clampClip({ x: rect.x - 1, y: rect.y - 1, w: rect.w + 2, h: rect.h + 2 })
}

/**
 * 对话框局部裁剪（帮助图体积优化 + 语义裁剪）：
 * - `topOffset`：从对话框顶边向下跳过的高度（如 41px 标题栏，用于「页签底部」类截图）；
 * - `leftOffset`：从对话框左边向右跳过的宽度（如 200px 页签栏，只保留设置内容面板）。
 */
function dialogPartialClip(rect, { topOffset = 0, leftOffset = 0 } = {}) {
    return clampClip({
        x: rect.x - 1 + leftOffset,
        y: rect.y - 1 + topOffset,
        w: rect.w + 2 - leftOffset,
        h: rect.h + 2 - topOffset
    })
}

/**
 * 在页面上绘制标注（红框 + 编号圆标），与 usage-guide.md 图注的 ①②③ 一一对应。
 * 叠加层只存在于截图期间，截图后立即移除，不修改产品代码。
 */
async function annotate(page, groups, clip) {
    // groups: [{ index, rects: [{x,y,w,h}] }]，坐标为视口绝对坐标
    const payload = groups.map((group) => {
        const x1 = Math.min(...group.rects.map((r) => r.x))
        const y1 = Math.min(...group.rects.map((r) => r.y))
        const x2 = Math.max(...group.rects.map((r) => r.x + r.w))
        const y2 = Math.max(...group.rects.map((r) => r.y + r.h))
        return { index: group.index, x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
    })
    await page.evaluate(
        ({ items, bounds }) => {
            document.querySelectorAll('.__help-capture-callout').forEach((el) => el.remove())
            const root = document.createElement('div')
            root.className = '__help-capture-callout'
            root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483647'
            const badgeSize = 20
            // 编号圆标默认放在红框左上角外侧；若超出本次截图裁剪范围则收进边界，
            // 避免「1」被裁掉一半（如设置在对话框最左侧的页签项）。
            const clampX = (value) => {
                const min = bounds ? bounds.x + 2 : 0
                const max = bounds ? bounds.x + bounds.width - badgeSize - 2 : 1e9
                return Math.min(Math.max(value, min), Math.max(min, max))
            }
            const clampY = (value) => {
                const min = bounds ? bounds.y + 2 : 0
                const max = bounds ? bounds.y + bounds.height - badgeSize - 2 : 1e9
                return Math.min(Math.max(value, min), Math.max(min, max))
            }
            for (const item of items) {
                const box = document.createElement('div')
                box.style.cssText =
                    `position:fixed;left:${item.x - 2}px;top:${item.y - 2}px;` +
                    `width:${item.w + 4}px;height:${item.h + 4}px;` +
                    'border:2px solid #e53935;border-radius:4px;box-sizing:border-box;pointer-events:none'
                root.appendChild(box)
                const badge = document.createElement('div')
                badge.style.cssText =
                    `position:fixed;left:${clampX(item.x - 2 - badgeSize / 2)}px;` +
                    `top:${clampY(item.y - 2 - badgeSize / 2)}px;` +
                    `width:${badgeSize}px;height:${badgeSize}px;background:#e53935;color:#fff;` +
                    'border-radius:50%;font:700 12px/20px sans-serif;text-align:center;' +
                    'pointer-events:none'
                badge.textContent = String(item.index)
                root.appendChild(badge)
            }
            document.body.appendChild(root)
        },
        { items: payload, bounds: clip ?? null }
    )
    await page.waitForTimeout(120)
}

async function clearAnnotations(page) {
    await page.evaluate(() =>
        document.querySelectorAll('.__help-capture-callout').forEach((el) => el.remove())
    )
}

/** 取 locator 的视口矩形（列表取并集） */
async function unionRect(locator) {
    const count = await locator.count()
    const rects = []
    for (let index = 0; index < count; index++) {
        const box = await locator.nth(index).boundingBox()
        if (box) rects.push({ x: box.x, y: box.y, w: box.width, h: box.height })
    }
    assert(rects.length > 0, '标注目标不可见')
    return rects
}

/* ============================================================================================
 * 截图 + WebP 转码
 * ========================================================================================== */

/**
 * 转 WebP：把 PNG buffer 转 data URL → 应用页面内 canvas 绘制 → toDataURL('image/webp')。
 * 为什么用页面 canvas：不引入 sharp 等原生依赖，Electron/Chromium 自带 WebP 编码器。
 * @returns {Promise<Buffer|null>} WebP 字节；不支持时返回 null（调用方回退 JPEG）
 */
async function encodeWebp(page, pngBuffer, quality, maxWidth) {
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`
    let result
    try {
        result = await page.evaluate(
            async ({ dataUrl: source, quality: q, maxWidth: limit }) => {
                const image = new Image()
                image.src = source
                await image.decode()
                // 超宽图按帮助 HTML 正文列宽等比缩小（浏览器里最终也是这个显示宽度），
                // 避免把 1280px 对话窗原样塞进 908px 正文列造成无谓体积
                const scale =
                    typeof limit === 'number' && image.naturalWidth > limit
                        ? limit / image.naturalWidth
                        : 1
                const canvas = document.createElement('canvas')
                canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
                canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
                const context = canvas.getContext('2d')
                if (!context) return { ok: false, dataUrl: '', reason: 'canvas 2d 不可用' }
                context.imageSmoothingEnabled = true
                context.imageSmoothingQuality = 'high'
                context.drawImage(image, 0, 0, canvas.width, canvas.height)
                const encoded = canvas.toDataURL('image/webp', q)
                return {
                    ok: encoded.startsWith('data:image/webp'),
                    dataUrl: encoded,
                    width: canvas.width,
                    height: canvas.height
                }
            },
            { dataUrl, quality, maxWidth }
        )
    } catch (error) {
        return { buffer: null, reason: error instanceof Error ? error.message : String(error) }
    }
    if (!result.ok) {
        return { buffer: null, reason: result.reason ?? 'canvas 不支持 WebP 编码' }
    }
    const buffer = Buffer.from(result.dataUrl.split(',')[1], 'base64')
    if (buffer.length < 4 || buffer.subarray(0, 4).toString('ascii') !== 'RIFF') {
        return { buffer: null, reason: 'WebP 文件头非法' }
    }
    return { buffer, width: result.width, height: result.height, reason: '' }
}

/**
 * 生成 PDF 打印专用的**无损 PNG**（缩放规则与 WebP 一致）。
 *
 * 为什么需要单独一份：Chromium `printToPDF` 会把页面图片以无损 Flate 流嵌入 PDF，
 * WebP 有损压缩产生的量化噪点会被 Flate 完整记录 → PDF 反向膨胀（实测 1.8MB→2.8MB）。
 * 因此 PDF 用干净的无损 PNG 打印（体积更小、观感更清晰），而应用内 HTML 用 WebP。
 * 该目录只在仓库 `docs/help/images/print/`，`generate-help-docs.js` 会将其排除在
 * renderer public 副本之外，不进入安装包。
 */
async function renderPrintPng(page, pngBuffer, maxWidth) {
    const dimensions = pngSize(pngBuffer)
    if (!maxWidth || dimensions.width <= maxWidth) {
        return pngBuffer
    }
    const dataUrl = `data:image/png;base64,${pngBuffer.toString('base64')}`
    const result = await page.evaluate(
        async ({ source, limit }) => {
            const image = new Image()
            image.src = source
            await image.decode()
            const scale = image.naturalWidth > limit ? limit / image.naturalWidth : 1
            const canvas = document.createElement('canvas')
            canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
            canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
            const context = canvas.getContext('2d')
            if (!context) return ''
            context.imageSmoothingEnabled = true
            context.imageSmoothingQuality = 'high'
            context.drawImage(image, 0, 0, canvas.width, canvas.height)
            return canvas.toDataURL('image/png')
        },
        { source: dataUrl, limit: maxWidth }
    )
    assert(
        result.startsWith('data:image/png'),
        `打印专用 PNG 生成失败：${pngDimensionsLabel(dimensions)}`
    )
    return Buffer.from(result.split(',')[1], 'base64')
}

/** PNG 尺寸诊断文案 */
function pngDimensionsLabel(dimensions) {
    return `${dimensions.width}×${dimensions.height}`
}

/**
 * 截图并写入 pending 目录（PNG → WebP / JPEG 回退），返回 manifest 条目。
 * 同时写出一份无损 PNG 到 `pending/print/`（仅用于生成 PDF，不随应用分发）。
 * @param {object} ctx 场景上下文
 * @param {string} name 截图文件名（不含扩展名，需与 usage-guide.md 引用一致）
 * @param {object} [clip] 裁剪矩形；省略时整窗截图
 * @param {object} [captureOptions] 单图覆盖项：`quality`（0-100）、`maxWidth`（缩放上限）
 */
async function capture(ctx, name, clip, captureOptions = {}) {
    const { page, options } = ctx
    const quality = captureOptions.quality ?? options.quality
    const maxWidth = captureOptions.maxWidth ?? options.maxWidth
    const screenshotOptions = {
        animations: 'disabled',
        caret: 'hide',
        ...(clip ? { clip } : {})
    }
    const pngBuffer = await page.screenshot(screenshotOptions)
    const pngDimensions = pngSize(pngBuffer)
    // PDF 打印专用无损图（先于有损转码生成，保证像素干净）
    const printBuffer = await renderPrintPng(page, pngBuffer, maxWidth)
    fs.writeFileSync(path.join(PENDING_PRINT_DIR, `${name}.png`), printBuffer)
    let buffer = null
    let format = options.format
    let fallbackReason = ''
    let width = pngDimensions.width
    let height = pngDimensions.height
    if (options.format === 'webp') {
        const encoded = await encodeWebp(page, pngBuffer, quality / 100, maxWidth)
        if (encoded.buffer) {
            buffer = encoded.buffer
            width = encoded.width
            height = encoded.height
        } else {
            fallbackReason = encoded.reason
            format = 'jpeg'
        }
    }
    if (!buffer) {
        // JPEG 回退（或 --format jpeg 强制）：直接让 Playwright 编码，质量 90
        buffer = await page.screenshot({
            ...screenshotOptions,
            type: 'jpeg',
            quality: 90
        })
    }
    const extension = format === 'webp' ? '.webp' : '.jpg'
    const file = path.join(PENDING_DIR, `${name}${extension}`)
    fs.writeFileSync(file, buffer)
    const record = {
        name,
        file,
        width,
        height,
        bytes: buffer.length,
        format,
        sha256: sha256(buffer),
        fallbackReason,
        printBytes: printBuffer.length
    }
    console.log(
        `[help-shots] 截图 ${name}.${format}  ${width}×${height}  ${formatBytes(buffer.length)}` +
            `（打印 PNG ${formatBytes(printBuffer.length)}）` +
            (fallbackReason ? `  （WebP 失败回退 JPEG：${fallbackReason}）` : '')
    )
    return record
}

/** 带标注的截图（截图后自动清除标注层） */
async function captureAnnotated(ctx, name, clip, groups, captureOptions) {
    await annotate(ctx.page, groups, clip)
    try {
        return await capture(ctx, name, clip, captureOptions)
    } finally {
        await clearAnnotations(ctx.page)
    }
}

/* ============================================================================================
 * 场景实现
 * ========================================================================================== */

/**
 * 菜单场景通用流程：打开顶层菜单 → 逐级悬停展开 → 计算菜单区域裁剪 →（可选）标注 → 截图。
 *
 * 裁剪规则：x=0/y=0 起（保留标题栏与菜单栏，含窗口上下文），宽度取
 * 「完整菜单栏右边界（最后一项 + 12px）」「菜单面板右边界 + 16px」「700」三者最大（≤1280），
 * 高度取「菜单面板底边 + 16px」（≤800）。这样不同菜单图的宽度基本一致，且文档中不出现
 * 被截断的菜单名。
 */
async function captureMenuScene(ctx, name, spec) {
    const { page, geometry } = ctx
    const { top, chain = [], annotate: annotationGroups } = spec
    await openTopMenu(page, top)
    for (let depth = 0; depth < chain.length; depth++) {
        const locator = menuItemLocator(page, depth, chain[depth])
        await hoverByLocator(page, locator, depth === 0 ? 420 : 480)
        if (depth === 0 && chain.length > 1) {
            await page
                .locator('.submenu-list[data-menu-level="1"]')
                .first()
                .waitFor({ state: 'visible', timeout: 10_000 })
            await page.waitForTimeout(250)
        }
    }
    const union = await page.evaluate(() => {
        const rects = []
        document.querySelectorAll('.submenu-container, .nested-submenu').forEach((element) => {
            const rect = element.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
                rects.push(rect)
            }
        })
        if (rects.length === 0) return null
        const left = Math.min(...rects.map((rect) => rect.x))
        const top = Math.min(...rects.map((rect) => rect.y))
        const right = Math.max(...rects.map((rect) => rect.right))
        const bottom = Math.max(...rects.map((rect) => rect.bottom))
        return { x: left, y: top, w: right - left, h: bottom - top }
    })
    assert(union !== null, `菜单未展开，无法截图：${name}`)
    // 菜单图从菜单栏顶边开始裁剪：窗口标题栏与菜单内容无关（entry-top-menu 需要标注菜单栏
    // 本身，由专用场景保留标题栏），去掉后可省约 9% 图高且画面更聚焦。
    const cropTop = geometry.menuBar ? Math.round(geometry.menuBar.y) : 0
    const clip = clampClip({
        x: 0,
        y: cropTop,
        w: Math.max(
            680,
            Math.ceil(geometry.menuBarLastRight + 12),
            Math.ceil(union.x + union.w) + 16
        ),
        h: Math.ceil(union.y + union.h) + 16 - cropTop
    })
    let record
    if (annotationGroups) {
        const groups = []
        for (const group of annotationGroups) {
            const rects = []
            for (const target of group.targets) {
                let locator = page.locator(target.selector)
                if (target.text) locator = locator.filter({ hasText: target.text })
                if (target.hasNotText) locator = locator.filter({ hasNotText: target.hasNotText })
                rects.push(...(await unionRect(locator.first())))
            }
            groups.push({ index: group.index, rects })
        }
        record = await captureAnnotated(ctx, name, clip, groups)
    } else {
        record = await capture(ctx, name, clip)
    }
    await ctx.closeAllFloating()
    return record
}

/**
 * 工具窗/对话框场景通用流程：确保菜单关闭 → 打开目标窗口 → 等待内容可见 → 按对话框矩形截图。
 * 工具窗都是非模态（系统设置默认开启），标题栏包含 1.5.6 新增的最小化/最大化按钮，
 * 截图裁剪只取窗口本身，突出结构而非背景。
 */
async function captureToolWindow(ctx, name, open, contentSelector) {
    await ctx.closeAllFloating()
    await focusEditorBody(ctx.page)
    await open(ctx.page)
    await waitForDialog(ctx.page, contentSelector)
    const rect = await topDialogRect(ctx.page)
    const record = await capture(ctx, name, dialogClip(rect))
    await ctx.closeAllFloating()
    return record
}

/** 系统设置 →「功能」页签（滚动位置由调用方决定） */
async function openSystemFeatures(page) {
    await openTopMenu(page, '设置')
    await clickLeafItem(page, '系统设置')
    await waitForDialog(page, '.dialog-container .sidebar')
    await page
        .locator('.dialog-container .sidebar-item')
        .filter({ hasText: '功能' })
        .first()
        .click()
    await page.waitForTimeout(500)
}

/** 把系统设置「功能」页内容区滚动到底部（非模态开关位于可选能力底部） */
async function scrollFeaturesToBottom(page) {
    await page.evaluate(() => {
        const content = document.querySelector('.dialog-container .content-area')
        if (content) content.scrollTop = content.scrollHeight
    })
    await page.waitForTimeout(400)
}

/** 设置「非模态工具对话框」开关（真实 UI：勾选 → 应用 → 取消关闭） */
async function setNonModalDialogs(page, enabled) {
    await closeAllFloating(page)
    await openSystemFeatures(page)
    await scrollFeaturesToBottom(page)
    const checkbox = page
        .locator('.dialog-container .setting-row')
        .filter({ hasText: '非模态工具对话框' })
        .locator('input[type=checkbox]')
        .first()
    const checked = await checkbox.isChecked()
    if (checked !== enabled) {
        await checkbox.click()
        await page.waitForTimeout(200)
        await page.locator('.dialog-container .btn-apply').first().click()
        await page.waitForTimeout(800)
    }
    await page.locator('.dialog-container .btn-cancel').first().click()
    await page.waitForTimeout(500)
    await closeAllFloating(page)
    // 等待主进程广播 → 渲染层 useFeatureFlags 生效（按需开启/关闭的运行时开关）
    await page
        .waitForFunction(
            (expected) => {
                const shell = document.querySelector('.dialog-container--tool-window')
                return expected ? true : shell === null
            },
            enabled,
            { timeout: 5_000 }
        )
        .catch(() => undefined)
    await page.waitForTimeout(300)
}

/** 打开表格编辑器工具窗（需要活动编辑器；光标不在表格内时以插入模式打开） */
async function openTableEditor(page) {
    await focusEditorBody(page)
    await openTopMenu(page, '工具')
    await clickLeafItem(page, 'Markdown表格')
    await waitForDialog(page, '.table-editor-grid')
}

/** 非模态对比合成：左右并排两张整窗截图 + 标题 + 边框（canvas 合成，输出 WebP） */
async function composeNonModalCompare(ctx, bufferEnabled, bufferDisabled) {
    const { page, options } = ctx
    const toDataUrl = (buffer) => `data:image/png;base64,${buffer.toString('base64')}`
    const composed = await page.evaluate(
        async ({ sourceEnabled, sourceDisabled, quality }) => {
            const load = async (source) => {
                const image = new Image()
                image.src = source
                await image.decode()
                return image
            }
            const [enabled, disabled] = await Promise.all([
                load(sourceEnabled),
                load(sourceDisabled)
            ])
            const shotWidth = 570
            const shotHeight = Math.round(
                (shotWidth / enabled.naturalWidth) * enabled.naturalHeight
            )
            const gap = 12
            const titleHeight = 34
            const padding = 8
            const canvas = document.createElement('canvas')
            canvas.width = shotWidth * 2 + gap + padding * 2
            canvas.height = titleHeight + shotHeight + padding
            const context = canvas.getContext('2d')
            if (!context) return ''
            context.fillStyle = '#ffffff'
            context.fillRect(0, 0, canvas.width, canvas.height)
            context.font = '600 17px "Microsoft YaHei", sans-serif'
            context.textBaseline = 'middle'
            context.fillStyle = '#2e9e4f'
            context.fillText('开启：遮罩透明、可点击/编辑背景', padding, titleHeight / 2 + 2)
            context.fillStyle = '#d32f2f'
            context.fillText(
                '关闭：遮罩变暗、背景被拦截',
                padding + shotWidth + gap,
                titleHeight / 2 + 2
            )
            const leftX = padding
            const rightX = padding + shotWidth + gap
            context.drawImage(enabled, leftX, titleHeight, shotWidth, shotHeight)
            context.drawImage(disabled, rightX, titleHeight, shotWidth, shotHeight)
            context.lineWidth = 2
            context.strokeStyle = '#2e9e4f'
            context.strokeRect(leftX, titleHeight, shotWidth, shotHeight)
            context.strokeStyle = '#d32f2f'
            context.strokeRect(rightX, titleHeight, shotWidth, shotHeight)
            return {
                webp: canvas.toDataURL('image/webp', quality),
                png: canvas.toDataURL('image/png')
            }
        },
        {
            sourceEnabled: toDataUrl(bufferEnabled),
            sourceDisabled: toDataUrl(bufferDisabled),
            quality: options.quality / 100
        }
    )
    assert(composed.webp.startsWith('data:image/webp'), '非模态对比图合成失败（WebP 编码不可用）')
    const buffer = Buffer.from(composed.webp.split(',')[1], 'base64')
    const name = 'nonmodal-compare'
    const extension = '.webp'
    const file = path.join(PENDING_DIR, `${name}${extension}`)
    fs.writeFileSync(file, buffer)
    const printBuffer = Buffer.from(composed.png.split(',')[1], 'base64')
    fs.writeFileSync(path.join(PENDING_PRINT_DIR, `${name}.png`), printBuffer)
    const size = pngSize(bufferEnabled)
    const record = {
        name,
        file,
        width: 570 * 2 + 12 + 8 * 2,
        height: 34 + Math.round((570 / size.width) * size.height) + 8,
        bytes: buffer.length,
        format: 'webp',
        sha256: sha256(buffer),
        fallbackReason: '',
        printBytes: printBuffer.length
    }
    console.log(
        `[help-shots] 截图 ${name}.webp  ${record.width}×${record.height}  ${formatBytes(
            buffer.length
        )}（打印 PNG ${formatBytes(printBuffer.length)}）`
    )
    return record
}

/* ============================================================================================
 * 场景清单（22 张，与 docs/help/usage-guide.md 的 <figure> 一一对应）
 * ========================================================================================== */

const ENTRY_INSERT_GROUPS = [
    {
        index: 1,
        targets: [
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: 'Mermaid 绘图'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: 'PlantUML 绘图'
            }
        ]
    },
    {
        index: 2,
        targets: [
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: '写作模板'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: '来自文件'
            }
        ]
    },
    {
        index: 3,
        targets: [
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: 'Material'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: 'Mermaid',
                hasNotText: '绘图'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: 'PlantUML',
                hasNotText: '绘图'
            }
        ]
    }
]

const ENTRY_TOOLS_GROUPS = [
    {
        index: 1,
        targets: [
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: 'mermaid绘图'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: '配图制作'
            }
        ]
    },
    {
        index: 2,
        targets: [
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: '特殊字体'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: '数学公式'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: 'Markdown表格'
            },
            {
                selector: '.submenu-list[data-menu-level="0"] > .menu-submenu-item',
                text: '网页链接'
            }
        ]
    }
]

/** 场景清单（顺序即采集顺序：先菜单、再工具窗、最后设置与非模态对比） */
const SCENES = [
    {
        name: 'entry-top-menu',
        description: '图 1-1 顶层菜单入口（①插入 ②设置 ③工具，带红框标注）',
        async run(ctx) {
            await openTopMenu(ctx.page, '插入')
            const labelRects = []
            for (const label of ['插入', '设置', '工具']) {
                const rects = await unionRect(
                    ctx.page.locator('.menu-bar .menu-item').filter({ hasText: label }).first()
                )
                labelRects.push({ index: labelRects.length + 1, rects })
            }
            const union = await ctx.menuUnion()
            const clip = await ctx.menuClip(union, 680)
            const record = await captureAnnotated(ctx, this.name, clip, labelRects)
            await ctx.closeAllFloating()
            return record
        }
    },
    {
        name: 'entry-insert-menu',
        description:
            '图 1-2 插入菜单分组标注（①绘图 ②模板/文本块/来自文件 ③Material/Mermaid/PlantUML）',
        run(ctx) {
            return captureMenuScene(ctx, this.name, {
                top: '插入',
                annotate: ENTRY_INSERT_GROUPS
            })
        }
    },
    {
        name: 'entry-tools-menu',
        description: '图 1-3 工具菜单内容工具标注（①mermaid绘图/配图制作 ②特殊字体等）',
        run(ctx) {
            return captureMenuScene(ctx, this.name, {
                top: '工具',
                annotate: ENTRY_TOOLS_GROUPS
            })
        }
    },
    {
        name: 'entry-toolbar',
        description: '图 1-4 编辑器工具栏入口标注（①标题 ②行内格式 ③列表/引用 ④插入按钮）',
        async run(ctx) {
            const { page } = ctx
            await ctx.closeAllFloating()
            const buttons = await page.evaluate(() =>
                Array.from(document.querySelectorAll('.toolbar-container .tool-btn')).map(
                    (button) => {
                        const rect = button.getBoundingClientRect()
                        return {
                            id: button.id,
                            x: rect.x,
                            y: rect.y,
                            w: rect.width,
                            h: rect.height
                        }
                    }
                )
            )
            const pick = (ids) => {
                const rects = []
                for (const id of ids) {
                    const rect = buttons.find((item) => item.id === id)
                    assert(rect, `工具栏按钮不存在：${id}`)
                    rects.push(rect)
                }
                return rects
            }
            const groups = [
                {
                    index: 1,
                    rects: pick([
                        'header-1',
                        'header-2',
                        'header-3',
                        'header-4',
                        'header-5',
                        'header-6'
                    ])
                },
                {
                    index: 2,
                    rects: pick([
                        'font-bold',
                        'font-italic',
                        'font-delete',
                        'font-under',
                        'font-quote',
                        'font-super',
                        'font-sub'
                    ])
                },
                {
                    index: 3,
                    rects: pick(['list-numbered', 'list-bulleted', 'line-scan', 'line-enter'])
                },
                {
                    index: 4,
                    rects: pick([
                        'code-line',
                        'code-block',
                        'math-line',
                        'math-block',
                        'web-links',
                        'task-lists',
                        'insert-images',
                        'insert-table',
                        'insert-emoji',
                        'insert-symbol',
                        'insert-mermaid',
                        'insert-plantuml'
                    ])
                }
            ]
            const clip = clampClip({ x: 0, y: 0, w: VIEWPORT.width, h: 280 })
            const record = await captureAnnotated(ctx, this.name, clip, groups)
            await ctx.closeAllFloating()
            return record
        }
    },
    {
        name: 'insert-menu',
        description: '图 3-1 插入菜单（绘图入口 / 写作模板 / Material 分组）',
        run(ctx) {
            return captureMenuScene(ctx, this.name, { top: '插入' })
        }
    },
    {
        name: 'tools-menu',
        description: '图 3-2 工具菜单（特殊字体、数学公式、Markdown 表格、网页链接）',
        run(ctx) {
            return captureMenuScene(ctx, this.name, { top: '工具' })
        }
    },
    {
        name: 'insert-writing-templates',
        description: '图 3-5 插入 → 写作模板子菜单',
        run(ctx) {
            return captureMenuScene(ctx, this.name, { top: '插入', chain: [3] })
        }
    },
    {
        name: 'insert-from-file-menu',
        description: '图 3-6 插入 → 来自文件子菜单',
        run(ctx) {
            return captureMenuScene(ctx, this.name, { top: '插入', chain: [5] })
        }
    },
    {
        name: 'insert-material-menu',
        description: '图 3-3 插入 → Material 子菜单（Admonition + 15 项语法）',
        run(ctx) {
            return captureMenuScene(ctx, this.name, { top: '插入', chain: [7] })
        }
    },
    {
        name: 'insert-mermaid-templates',
        description: '图 3-4 插入 → Mermaid → 第一部分三级子菜单',
        run(ctx) {
            return captureMenuScene(ctx, this.name, { top: '插入', chain: [8, 0] })
        }
    },
    {
        name: 'special-text-dialog',
        description: '图 3-7 特殊文字编辑工具窗（含 1.5.6 最大化/最小化按钮）',
        run(ctx) {
            return captureToolWindow(
                ctx,
                this.name,
                async (page) => {
                    await openTopMenu(page, '工具')
                    await clickLeafItem(page, '特殊字体')
                },
                '.dialog-container .main-content'
            )
        }
    },
    {
        name: 'math-dialog',
        description: '图 3-8 数学公式工具窗（KaTeX 预览 + 源码）',
        run(ctx) {
            return captureToolWindow(
                ctx,
                this.name,
                async (page) => {
                    await openTopMenu(page, '工具')
                    await clickLeafItem(page, '数学公式')
                },
                '.dialog-container .main-content .preview-container'
            )
        }
    },
    {
        name: 'table-editor-dialog',
        description: '图 3-9 Markdown 表格编辑器工具窗',
        run(ctx) {
            return captureToolWindow(ctx, this.name, openTableEditor, '.table-editor-grid')
        }
    },
    {
        name: 'mermaid-dialog',
        description: '图 3-10 Mermaid 图表编辑器工具窗（源码 + SVG 预览）',
        run(ctx) {
            return captureToolWindow(
                ctx,
                this.name,
                async (page) => {
                    await openTopMenu(page, '工具')
                    await clickLeafItem(page, 'mermaid绘图')
                },
                '.dialog-container .main-container .preview-area'
            )
        }
    },
    {
        name: 'admonition-dialog',
        description: '图 3-11 Admonition 提示块工具窗',
        run(ctx) {
            return captureToolWindow(
                ctx,
                this.name,
                async (page) => {
                    await openTopMenu(page, '插入')
                    await hoverByLocator(page, menuItemLocator(page, 0, 7), 480)
                    await page
                        .locator('.submenu-list[data-menu-level="1"]')
                        .first()
                        .waitFor({ state: 'visible', timeout: 10_000 })
                    await clickNestedItem(page, 'Admonition')
                },
                '.dialog-container .content .type-grid'
            )
        }
    },
    {
        name: 'insert-image-dialog',
        description: '图 3-12 插入图片工具窗',
        run(ctx) {
            return captureToolWindow(
                ctx,
                this.name,
                async (page) => {
                    await openTopMenu(page, '工具')
                    await clickLeafItem(page, '配图制作')
                },
                '.dialog-container .content .tabs'
            )
        }
    },
    {
        name: 'web-link-dialog',
        description: '图 3-13 插入网页链接工具窗',
        run(ctx) {
            return captureToolWindow(
                ctx,
                this.name,
                async (page) => {
                    await openTopMenu(page, '工具')
                    await clickLeafItem(page, '网页链接')
                },
                '.dialog-container .content'
            )
        }
    },
    {
        name: 'command-palette',
        description: '图 9-2 命令面板（按功能域分组 + 快捷键）',
        async run(ctx) {
            const { page } = ctx
            await ctx.closeAllFloating()
            await focusEditorBody(page)
            await openTopMenu(page, '编辑')
            await clickLeafItem(page, '命令面板')
            await waitForDialog(page, '.palette-input')
            await page.waitForTimeout(400)
            const rect = await topDialogRect(page)
            const clip = clampClip({
                x: rect.x - 14,
                y: rect.y - 14,
                w: rect.w + 28,
                h: rect.h + 28
            })
            const record = await capture(ctx, this.name, clip)
            await ctx.closeAllFloating()
            return record
        }
    },
    {
        name: 'settings-features',
        description: '图 12-2 系统设置 → 功能页签（默认能力 + 可选能力）',
        async run(ctx) {
            const { page } = ctx
            await ctx.closeAllFloating()
            await openSystemFeatures(page)
            const rect = await topDialogRect(page)
            // 文字密集的设置页说明图按 q80 编码（常规图保持 q85），在清晰度与体积间取平衡
            const record = await capture(ctx, this.name, dialogClip(rect), { quality: 80 })
            await ctx.closeAllFloating()
            return record
        }
    },
    {
        name: 'settings-nonmodal-switch',
        description: '图 12-3 功能页底部「非模态工具对话框」开关',
        async run(ctx) {
            const { page } = ctx
            await ctx.closeAllFloating()
            await openSystemFeatures(page)
            await scrollFeaturesToBottom(page)
            const rect = await topDialogRect(page)
            // 跳过标题栏（41px）只保留页签栏 + 设置内容：图注关注「功能」页底部开关，
            // 与图 12-2 同壳但滚动到底部，避免重复整窗而增大体积
            const record = await capture(
                ctx,
                this.name,
                dialogPartialClip(rect, { topOffset: 41 }),
                { quality: 80 }
            )
            await ctx.closeAllFloating()
            return record
        }
    },
    {
        name: 'entry-settings-switch',
        description: '图 12-1 设置路径与红框非模态开关（①「功能」页签 ②非模态开关）',
        async run(ctx) {
            const { page } = ctx
            await ctx.closeAllFloating()
            await openSystemFeatures(page)
            await scrollFeaturesToBottom(page)
            const rect = await topDialogRect(page)
            const sidebarFeatures = await unionRect(
                page.locator('.dialog-container .sidebar-item').filter({ hasText: '功能' }).first()
            )
            const nonModalRow = await unionRect(
                page
                    .locator('.dialog-container .setting-row')
                    .filter({ hasText: '非模态工具对话框' })
                    .first()
            )
            // 跳过标题栏（41px，与「设置路径」语义无关），保留左侧页签栏供 ① 标注
            const record = await captureAnnotated(
                ctx,
                this.name,
                dialogPartialClip(rect, { topOffset: 41 }),
                [
                    { index: 1, rects: sidebarFeatures },
                    { index: 2, rects: nonModalRow }
                ],
                { quality: 78 }
            )
            await ctx.closeAllFloating()
            return record
        }
    },
    {
        name: 'nonmodal-compare',
        description: '图 9-1 非模态开关开/关左右对比（合成图）',
        async run(ctx) {
            const { page } = ctx
            // 1) 开启态（默认）：工具窗遮罩透明，背景可见/可操作
            await ctx.closeAllFloating()
            await setNonModalDialogs(page, true)
            await openTableEditor(page)
            await page.waitForTimeout(600)
            const toolWindowCount = await page.locator('.dialog-container--tool-window').count()
            assert(toolWindowCount > 0, '非模态开启时表格编辑器应为非模态工具窗')
            const enabledBuffer = await page.screenshot({
                animations: 'disabled',
                caret: 'hide'
            })
            await ctx.closeAllFloating()
            // 2) 关闭态：弹窗遮罩变暗、背景被拦截
            await setNonModalDialogs(page, false)
            await openTableEditor(page)
            await page.waitForTimeout(900)
            const modalShellCount = await page.locator('.dialog-container--tool-window').count()
            assert(modalShellCount === 0, '非模态关闭后表格编辑器应为模态对话框')
            const disabledBuffer = await page.screenshot({
                animations: 'disabled',
                caret: 'hide'
            })
            await ctx.closeAllFloating()
            // 3) 恢复开关（配置沙箱结束也会整体恢复；这里保持会话内状态干净）
            await setNonModalDialogs(page, true)
            return composeNonModalCompare(ctx, enabledBuffer, disabledBuffer)
        }
    }
]

/* ============================================================================================
 * 采集上下文 / 命令行参数 / 发布
 * ========================================================================================== */

function parseArgs(argv) {
    const options = {
        outDir: process.env.HELP_CAPTURE_OUT
            ? path.resolve(ROOT, process.env.HELP_CAPTURE_OUT)
            : DEFAULT_OUT_DIR,
        quality: Number(process.env.HELP_CAPTURE_QUALITY ?? 85),
        maxWidth: Number(process.env.HELP_CAPTURE_MAX_WIDTH ?? 908),
        format: 'webp',
        only: null,
        list: false,
        help: false
    }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]
        const next = () => {
            const value = argv[index + 1]
            assert(value && !value.startsWith('--'), `参数缺少取值：${arg}`)
            index++
            return value
        }
        if (arg === '--out') options.outDir = path.resolve(ROOT, next())
        else if (arg === '--quality') options.quality = Number(next())
        else if (arg.startsWith('--quality=')) options.quality = Number(arg.split('=')[1])
        else if (arg === '--format') options.format = next()
        else if (arg.startsWith('--format=')) options.format = arg.split('=')[1]
        else if (arg === '--only')
            options.only = next()
                .split(',')
                .map((name) => name.trim())
        else if (arg === '--list') options.list = true
        else if (arg === '--help' || arg === '-h') options.help = true
        else throw new Error(`未知参数：${arg}`)
    }
    assert(
        options.format === 'webp' || options.format === 'jpeg',
        `--format 仅支持 webp / jpeg（收到 ${options.format}）`
    )
    assert(
        Number.isFinite(options.quality) && options.quality >= 40 && options.quality <= 100,
        `--quality 需在 40~100（收到 ${options.quality}）`
    )
    return options
}

function printUsage() {
    console.log(
        [
            '用法：node build/capture-help-screenshots.js [选项]',
            '',
            '  --out <dir>        输出目录（默认 docs/help/images）',
            '  --quality <40-100> WebP/JPEG 质量（默认 85）',
            '  --format <webp|jpeg> 图片格式（默认 webp；WebP 编码不可用时自动回退 jpeg）',
            '  --only <name,...>  只采集指定场景（逗号分隔）',
            '  --list             列出全部场景名',
            '  -h, --help         显示帮助'
        ].join('\n')
    )
}

/** 计算菜单面板并集（用于菜单场景裁剪） */
async function measureMenuUnion(page) {
    return page.evaluate(() => {
        const rects = []
        document.querySelectorAll('.submenu-container, .nested-submenu').forEach((element) => {
            const rect = element.getBoundingClientRect()
            if (rect.width > 0 && rect.height > 0) {
                rects.push({ x: rect.x, y: rect.y, w: rect.width, h: rect.height })
            }
        })
        if (rects.length === 0) return null
        const left = Math.min(...rects.map((rect) => rect.x))
        const top = Math.min(...rects.map((rect) => rect.y))
        const right = Math.max(...rects.map((rect) => rect.x + rect.w))
        const bottom = Math.max(...rects.map((rect) => rect.y + rect.h))
        return { x: left, y: top, w: right - left, h: bottom - top }
    })
}

/** 菜单场景裁剪（供 entry-top-menu 复用；规则见 captureMenuScene 注释） */
async function menuClipFor(page, geometry, union, minWidth) {
    assert(union !== null, '菜单未展开，无法计算裁剪区域')
    return clampClip({
        x: 0,
        y: 0,
        w: Math.max(
            minWidth,
            Math.ceil(geometry.menuBarLastRight + 12),
            Math.ceil(union.x + union.w) + 16
        ),
        h: Math.ceil(union.y + union.h) + 16
    })
}

/** 读取菜单栏/工具栏几何信息（每次启动后读取一次） */
async function measureGeometry(page) {
    const menuBar = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('.menu-bar .menu-item')).map(
            (element) => {
                const rect = element.getBoundingClientRect()
                return { right: rect.right }
            }
        )
        const lastRight = items.length > 0 ? Math.max(...items.map((item) => item.right)) : 700
        const bar = document.querySelector('#menu-bar')?.getBoundingClientRect()
        return {
            lastRight,
            bar: bar ? { x: bar.x, y: bar.y, w: bar.width, h: bar.height } : null
        }
    })
    return { menuBarLastRight: menuBar.lastRight, menuBar: menuBar.bar }
}

function createCaptureContext(page, options, geometry) {
    const ctx = {
        page,
        options,
        geometry,
        capture,
        captureAnnotated,
        closeAllFloating: () => closeAllFloating(page),
        menuUnion: () => measureMenuUnion(page),
        menuClip: (union, minWidth) => menuClipFor(page, geometry, union, minWidth)
    }
    return ctx
}

/** 发布：pending → 目标目录（删除同名旧 PNG/JPEG，保持单一格式；同步打印专用 PNG 子目录） */
function publishImages(options) {
    ensureDir(options.outDir)
    const entries = fs.readdirSync(PENDING_DIR)
    const published = []
    const removed = []
    for (const entry of entries) {
        const source = path.join(PENDING_DIR, entry)
        if (!fs.statSync(source).isFile()) continue
        const basename = path.basename(entry, path.extname(entry))
        // 清理同名旧扩展名（PNG → WebP 迁移时避免双份体积）
        for (const legacyExtension of LEGACY_IMAGE_EXTENSIONS) {
            const legacy = path.join(options.outDir, `${basename}${legacyExtension}`)
            if (fs.existsSync(legacy) && path.extname(entry).toLowerCase() !== legacyExtension) {
                fs.rmSync(legacy, { force: true })
                removed.push(`${basename}${legacyExtension}`)
            }
        }
        const target = path.join(options.outDir, entry)
        fs.copyFileSync(source, target)
        published.push(entry)
    }
    // 打印专用 PNG 子目录（PDF 生成链输入；generate-help-docs 不会把它复制进 renderer public）。
    // 只覆盖本次采集到的文件而不清空目录：`--only` 局部采集时保留其它场景的打印图，
    // 避免把 PDF 生成链输入改成残缺集合。
    const printTargetDir = path.join(options.outDir, 'print')
    ensureDir(printTargetDir)
    const printFiles = []
    for (const entry of fs.readdirSync(PENDING_PRINT_DIR)) {
        if (!entry.toLowerCase().endsWith('.png')) continue
        fs.copyFileSync(path.join(PENDING_PRINT_DIR, entry), path.join(printTargetDir, entry))
        printFiles.push(entry)
    }
    return { published, removed, printFiles }
}

/** 汇总并打印/写出清单 */
function writeManifest(options, records, publishedInfo) {
    const totalBytes = records.reduce((sum, record) => sum + record.bytes, 0)
    const printTotalBytes = records.reduce((sum, record) => sum + (record.printBytes ?? 0), 0)
    const legacyBytes = LEGACY_TOTAL_BYTES
    const manifest = {
        generatedAt: new Date().toISOString(),
        viewport: VIEWPORT,
        quality: options.quality,
        format: options.format,
        outDir: path.relative(ROOT, options.outDir).split(path.sep).join('/'),
        totalBytes,
        legacyBytes,
        savedBytes: Math.max(0, legacyBytes - totalBytes),
        savedRatio: Number(((1 - totalBytes / legacyBytes) * 100).toFixed(1)),
        printImages: {
            dir: `${path.relative(ROOT, options.outDir).split(path.sep).join('/')}/print`,
            count: records.length,
            totalBytes: printTotalBytes,
            note: 'PDF 打印专用无损 PNG，仅用于 build/generate-help-docs.js 生成 PDF，不进入安装包'
        },
        images: records.map((record) => ({
            name: record.name,
            file: `${record.name}.${record.format}`,
            printFile: `print/${record.name}.png`,
            width: record.width,
            height: record.height,
            bytes: record.bytes,
            printBytes: record.printBytes ?? 0,
            format: record.format,
            sha256: record.sha256,
            fallbackReason: record.fallbackReason
        })),
        removedLegacyFiles: publishedInfo.removed
    }
    ensureDir(WORK_DIR)
    writeJson(MANIFEST_PATH, manifest)
    return manifest
}

function printSummary(manifest) {
    const records = manifest.images
    console.log('\n================ 帮助文档截图采集完成 ================')
    console.log(`输出目录：${manifest.outDir}`)
    console.log('文件名'.padEnd(26) + '尺寸'.padEnd(12) + '格式'.padEnd(8) + '大小')
    for (const record of records) {
        const size = `${record.width}×${record.height}`
        console.log(
            `${record.file}`.padEnd(26) +
                `${size}`.padEnd(12) +
                `${record.format}`.padEnd(8) +
                formatBytes(record.bytes)
        )
    }
    console.log('-----------------------------------------------------')
    console.log(`共 ${records.length} 张，总计 ${formatBytes(manifest.totalBytes)}`)
    console.log(
        `旧版 PNG 参考 ${formatBytes(manifest.legacyBytes)} → 回收 ${formatBytes(
            manifest.savedBytes
        )}（${manifest.savedRatio}%）`
    )
    console.log(
        `PDF 打印专用无损 PNG：${manifest.printImages.count} 张 / ${formatBytes(
            manifest.printImages.totalBytes
        )}（仅用于生成 PDF，不随安装包分发）`
    )
    if (manifest.removedLegacyFiles.length > 0) {
        console.log(`已删除同名旧图：${manifest.removedLegacyFiles.join('、')}`)
    }
    console.log(`清单：${path.relative(ROOT, MANIFEST_PATH)}`)
}

/* ============================================================================================
 * 主流程
 * ========================================================================================== */

async function main() {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
        printUsage()
        return
    }
    if (options.list) {
        for (const scene of SCENES) {
            console.log(`${scene.name.padEnd(28)} ${scene.description}`)
        }
        return
    }
    assert(fs.existsSync(MAIN_ENTRY), `缺少构建产物：${MAIN_ENTRY}，请先执行 npm run build:unpack`)
    const selected = options.only
        ? SCENES.filter((scene) => options.only.includes(scene.name))
        : SCENES
    assert(selected.length > 0, `未匹配到场景：${options.only?.join(',') ?? ''}`)
    if (options.only) {
        const unknown = options.only.filter((name) => !SCENES.some((scene) => scene.name === name))
        assert(unknown.length === 0, `未知场景：${unknown.join(',')}（可用 --list 查看）`)
    }

    // 工作目录与示例文档（固定路径 → 状态栏路径稳定，截图可复现）
    removeDirWithRetry(PENDING_DIR)
    ensureDir(PENDING_DIR)
    ensureDir(PENDING_PRINT_DIR)
    writeSampleDocument()

    const profile = createTempProfile()
    const sandbox = createConfigSandbox(profile)
    let app = null
    const records = []
    try {
        sandbox.seed()
        seedLaunchState(profile)
        console.log('[help-shots] 启动真实 Electron 应用（临时 userData + 配置沙箱）…')
        const launched = await launchMainView(profile)
        app = launched.app
        const page = launched.page
        await waitMainView(page, profile)
        await stabilize(page)
        await openSampleDocument(page)
        const geometry = await measureGeometry(page)
        console.log(
            `[help-shots] 主窗口视口 ${VIEWPORT.width}×${VIEWPORT.height}，菜单栏右边界 ${Math.round(
                geometry.menuBarLastRight
            )}px，开始采集 ${selected.length} 个场景`
        )
        const ctx = createCaptureContext(page, options, geometry)
        for (const scene of selected) {
            const startedAt = Date.now()
            console.log(`\n[help-shots] ▶ ${scene.name}（${scene.description}）`)
            const record = await scene.run(ctx)
            if (record) records.push(record)
            console.log(`[help-shots] ✔ ${scene.name}（${Date.now() - startedAt}ms）`)
        }
        await closeAllFloating(page)
    } finally {
        if (app) {
            await app.close().catch(() => undefined)
            // 等待 Electron 释放单实例锁/文件句柄（Windows 下偶发延迟）
            await delay(1_000)
        }
        sandbox.restore()
        profile.cleanup()
    }

    // 全部成功才发布（避免中途失败在 docs 里留下半套图）
    const publishedInfo = publishImages(options)
    const manifest = writeManifest(options, records, publishedInfo)
    printSummary(manifest)
    if (manifest.totalBytes > 500 * 1024) {
        console.warn(
            `[help-shots] ⚠ 截图总体积 ${formatBytes(
                manifest.totalBytes
            )} 超过 500 KiB 目标，可降低 --quality 或缩小菜单裁剪区域`
        )
    }
    if (manifest.images.some((image) => image.format === 'jpeg')) {
        console.warn(
            '[help-shots] ⚠ 有图片回退为 JPEG：请同步把 docs/help/usage-guide.md 与 ' +
                'tests/unit/help-docs.test.ts 中的 .webp 引用改为 .jpg'
        )
    }
}

main().catch((error) => {
    console.error('[help-shots] 采集失败：', error)
    process.exitCode = 1
})
