#!/usr/bin/env node
/**
 * 内存与生命周期静态回归检查（无头、不启动 Electron / 不依赖 GUI）
 *
 * 背景（P3 稳定性治理）：
 * - 全量扫描（out/tool-results/scan-perf.md §5）确认「无确认的累积内存泄漏」，但
 *   「监听/定时器/缓存上限」的清理是否正确实现只靠人工审查，缺少可重复执行的回归门禁；
 * - 内存泄漏类缺陷通常不是一次写成错，而是**后续改动漏掉配对的清理**（新增 ipcRenderer.on
 *   忘记 removeListener、新增 setInterval 忘记 clearInterval、新增缓存忘记上限、退出清理
 *   清单漏项）。本脚本用源码静态约定把这些配对关系固化为可执行断言。
 *
 * 检查项（全部为静态源码检查）：
 * 1. 渲染层 `ipcRenderer.on(...)` 必须在同文件有同通道的 `removeListener(...)`
 *    （App 生命周期订阅以显式白名单登记，必须写明原因）；
 * 2. 任何源码文件使用 `setInterval(...)` 必须在同文件调用 `clearInterval(...)`；
 * 3. 声明了 *Timer / *Interval / *Timeout 计时器句柄的文件，必须在同文件调用
 *    `clearTimeout(...)` / `clearInterval(...)`（防止「起了 timer 不保存句柄」回归）；
 * 4. 任何渲染层文件使用 `addEventListener(...)` 必须在同文件出现
 *    `removeEventListener(...)`（iframe 文档级一次性绑定等以白名单登记）；
 * 5. 主进程退出清理清单（`cleanupApp`）必须覆盖全部生命周期资源；
 * 6. 预览/图表/KaTeX 缓存上限常量必须存在且有界（防止缓存改回无上限 Map）；
 * 7. 2026-11-20「内存与生命周期治理」修复锚点（卸载后异步链路丢弃、拖拽监听摘除、
 *    重排计时器清理、Word worker 退出回收）必须保留，防止被后续重构改回。
 *
 * 用法：
 *   node build/check-memory-lifecycle.js            # 人类可读输出，失败退出码 1
 *   node build/check-memory-lifecycle.js --json     # 输出 JSON（CI/报告用）
 *
 * 约束：只读源码，不写任何文件、不联网、不启动子进程。
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')

/** 渲染层文件级白名单：{ 相对路径: 原因 } */
const RENDERER_IPC_LIFETIME_ALLOWLIST = {
    'src/renderer/src/common/i18n.ts':
        '语言变更订阅为 App 生命周期级（i18n 初始化一次，进程存活期间常驻）'
}

/** addEventListener 白名单：非「绑定后随元素/文档销毁」的活监听 */
const RENDERER_ADD_EVENT_ALLOWLIST = {
    'src/renderer/src/main.ts': 'dragover/drop 全局拖拽拦截为 App 生命周期级（入口只执行一次）',
    'src/renderer/src/components/HemyTools/ShowHtmlView.vue':
        'iframe contentDocument 上的锚点守卫监听：随 srcdoc 文档销毁而回收（非活监听）'
}

/** 主进程退出清理清单（cleanupApp 必须逐项引用） */
const MAIN_CLEANUP_CHECKS = [
    ['StopAutoSaveFileTime', '自动保存定时器'],
    ['clearStartupRestorePending', '启动恢复兜底计时器/握手等待'],
    ['CleanupDirectoryWatch', '目录 fs.watch 监听与批次计时器'],
    ['CleanupMainWindowDialogsEvent', '主窗口对话框事件'],
    ['disposePlantumlLocalWindows', 'PlantUML 隐藏渲染窗口'],
    ['disposePersistence', '窗口边界持久化防抖计时器'],
    ['stopSystemThemeWatcher', 'nativeTheme 跟随监听'],
    ['stopAutoBackupTimer', '自动备份递归定时器'],
    ['disposeTray', '托盘系统资源'],
    ['disposeWordWorkerClient', 'Word 转换 worker 线程与空闲回收计时器'],
    ['ipcListenerManager.cleanupAll', 'IPC 监听台账'],
    ['window.destroy', '窗口/WebContents 销毁']
]

/** 必须存在且有界的缓存上限常量（文件 → 常量 → 最大值） */
const CACHE_BOUND_CHECKS = [
    ['src/shared/constants/render.ts', 'MERMAID_RENDER_CACHE_MAX', 500],
    ['src/shared/constants/render.ts', 'RENDERER_PLANTUML_CACHE_MAX', 500],
    ['src/shared/constants/render.ts', 'PLANTUML_RENDER_CACHE_MAX', 500],
    [
        'src/renderer/src/components/Markdown/preview-local-render.ts',
        'KATEX_CACHE_MAX_ENTRIES',
        1000
    ],
    [
        'src/renderer/src/components/Markdown/preview-large-doc.ts',
        'PREVIEW_RENDER_CACHE_MAX_ENTRIES',
        8
    ]
]

/** 修复锚点：文件 → 必须同时包含的片段（防止生命周期修复被重构回退） */
const LIFECYCLE_ANCHORS = [
    [
        'src/renderer/src/components/Markdown/MarkdownEditComponent.vue',
        [
            ['relayoutTimers', '重排通知计时器句柄登记'],
            ['function clearRelayoutTimers', '重排计时器清理函数'],
            ['detachResizeListeners', '拖拽期间 document 监听成对摘除'],
            ['clearRelayoutTimers()', '卸载路径清理重排计时器'],
            ['detachResizeListeners()', '卸载路径摘除拖拽监听']
        ]
    ],
    [
        'src/renderer/src/components/Markdown/MarkdownPreviewComponent.vue',
        [
            ['isPreviewUnmounted', '预览卸载标志'],
            ['isPreviewUnmounted = true', '卸载时置位'],
            ['function isStaleRender', '异步链路过期判定入口'],
            ['isStaleRender(sequence, sourceContent)', '渲染写回前过期校验']
        ]
    ],
    [
        'src/main/utils/file-utils/word-worker-client.ts',
        [
            ['export function disposeWordWorkerClient', 'Word worker 显式清理入口'],
            ['wordWorkerClient.dispose()', '清理实现']
        ]
    ]
]

/** 读取文件（不存在返回 null） */
function readFile(relPath) {
    try {
        return fs.readFileSync(path.join(ROOT, relPath), 'utf8')
    } catch {
        return null
    }
}

/** 递归收集指定扩展名的源文件（相对路径，统一用 / 分隔） */
function walkDir(relDir, extensions, acc = []) {
    const absDir = path.join(ROOT, relDir)
    let entries
    try {
        entries = fs.readdirSync(absDir, { withFileTypes: true })
    } catch {
        return acc
    }
    for (const entry of entries) {
        const relPath = `${relDir}/${entry.name}`.replace(/\\/g, '/')
        if (entry.isDirectory()) {
            walkDir(relPath, extensions, acc)
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
            acc.push(relPath)
        }
    }
    return acc
}

/** 提取指定 ipcRenderer 方法的通道表达式（去空白后比较；无法静态识别的调用直接跳过） */
function collectIpcChannels(content, method) {
    const channels = []
    const regex = new RegExp(`ipcRenderer\\s*\\.\\s*${method}\\s*\\(\\s*([^,]{1,120}?),`, 'g')
    let match
    while ((match = regex.exec(content)) !== null) {
        const channel = match[1].replace(/\s+/g, ' ').trim()
        // 只接受可静态比较的通道表达式（IPC.X.Y / 字符串字面量）；其余动态通道忽略
        if (/^(IPC\.[\w.]+|'[^']+'|"[^"]+")$/.test(channel)) {
            channels.push(channel)
        }
    }
    return channels
}

/** 统计 `name(` 调用次数（允许 `obj.name(` 形式；避免匹配到更长标识符） */
function countCalls(content, name) {
    const regex = new RegExp(`(?<![\\w$])${name}\\s*\\(`, 'g')
    return (content.match(regex) || []).length
}

const failures = []
const metrics = {
    scanned: { rendererFiles: 0, mainFiles: 0, sharedFiles: 0 },
    ipcSubscriptions: 0,
    ipcRemovals: 0,
    addEventListeners: 0,
    removeEventListeners: 0,
    intervals: 0,
    timerHandles: 0
}

function addFailure(check, message) {
    failures.push({ check, message })
}

/* ==================== 检查 1：渲染层 IPC 订阅/退订配对 ==================== */
const rendererFiles = walkDir('src/renderer/src', ['.ts', '.vue'])
metrics.scanned.rendererFiles = rendererFiles.length
for (const file of rendererFiles) {
    const content = readFile(file)
    if (content === null) continue
    const onChannels = collectIpcChannels(content, 'on')
    if (onChannels.length === 0) continue
    const offChannels = collectIpcChannels(content, 'removeListener')
    metrics.ipcSubscriptions += onChannels.length
    metrics.ipcRemovals += offChannels.length
    for (const channel of onChannels) {
        if (!offChannels.includes(channel)) {
            if (RENDERER_IPC_LIFETIME_ALLOWLIST[file]) continue
            addFailure(
                'IPC 订阅配对',
                `${file}: 订阅 ${channel} 但同文件未找到 removeListener(${channel})`
            )
        }
    }
}

/* ==================== 检查 2：setInterval 必须有 clearInterval ==================== */
const allSourceFiles = [
    ...walkDir('src/main', ['.ts']),
    ...walkDir('src/renderer/src', ['.ts', '.vue']),
    ...walkDir('src/preload', ['.ts']),
    ...walkDir('src/shared', ['.ts'])
]
metrics.scanned.mainFiles = allSourceFiles.filter((file) => file.startsWith('src/main')).length
metrics.scanned.sharedFiles = allSourceFiles.filter((file) => file.startsWith('src/shared')).length
for (const file of allSourceFiles) {
    const content = readFile(file)
    if (content === null) continue
    const intervals = countCalls(content, 'setInterval')
    metrics.intervals += intervals
    if (intervals > 0 && countCalls(content, 'clearInterval') === 0) {
        addFailure('setInterval 清理', `${file}: 使用 setInterval 但未调用 clearInterval`)
    }
}

/* ==================== 检查 3：计时器句柄必须可被 clearTimeout/clearInterval 回收 ============ */
// 精确识别「计时器句柄」声明：带 ReturnType<typeof setTimeout>/NodeJS.Timeout 注解，
// 或直接以 setTimeout()/setInterval() 初始化。排除 autoSaveInterval 之类的配置数值。
const TIMER_HANDLE_DECL =
    /(?:let|const)\s+[a-z]\w*(?:timer|interval|timeout)\w*\s*:\s*[^=\n]*(?:ReturnType<typeof setTimeout>|ReturnType<typeof setInterval>|NodeJS\.Timeout)/i
const TIMER_HANDLE_INIT =
    /(?:let|const)\s+[a-z]\w*(?:timer|interval|timeout)?\s*=\s*(?:setTimeout|setInterval)\s*\(/i
for (const file of allSourceFiles) {
    const content = readFile(file)
    if (content === null) continue
    if (!TIMER_HANDLE_DECL.test(content) && !TIMER_HANDLE_INIT.test(content)) continue
    metrics.timerHandles += 1
    if (countCalls(content, 'clearTimeout') === 0 && countCalls(content, 'clearInterval') === 0) {
        addFailure(
            '计时器句柄清理',
            `${file}: 声明了计时器句柄但全文件没有 clearTimeout/clearInterval 调用`
        )
    }
}

/* ==================== 检查 4：addEventListener 必须有 removeEventListener ==================== */
const rendererDomFiles = [
    ...walkDir('src/renderer/src', ['.ts']),
    ...walkDir('src/renderer/src', ['.vue'])
]
for (const file of rendererDomFiles) {
    const content = readFile(file)
    if (content === null) continue
    const added = countCalls(content, 'addEventListener')
    const removed = countCalls(content, 'removeEventListener')
    metrics.addEventListeners += added
    metrics.removeEventListeners += removed
    if (added > 0 && removed === 0 && !RENDERER_ADD_EVENT_ALLOWLIST[file]) {
        addFailure('DOM 监听清理', `${file}: 使用 addEventListener 但未调用 removeEventListener`)
    }
}

/* ==================== 检查 5：主进程退出清理清单 ==================== */
const MAIN_ENTRY = 'src/main/index.ts'
const mainEntry = readFile(MAIN_ENTRY)
if (mainEntry === null) {
    addFailure('退出清理清单', `${MAIN_ENTRY}: 文件不存在`)
} else {
    const cleanupStart = mainEntry.indexOf('function cleanupApp(')
    const cleanupEnd = cleanupStart < 0 ? -1 : mainEntry.indexOf('\n}', cleanupStart)
    const cleanupBody =
        cleanupStart < 0 || cleanupEnd < 0 ? '' : mainEntry.slice(cleanupStart, cleanupEnd)
    if (cleanupBody.length === 0) {
        addFailure('退出清理清单', `${MAIN_ENTRY}: 未找到 cleanupApp() 函数体`)
    } else {
        for (const [symbol, description] of MAIN_CLEANUP_CHECKS) {
            if (!cleanupBody.includes(symbol)) {
                addFailure('退出清理清单', `cleanupApp 缺少「${description}」清理（${symbol}）`)
            }
        }
    }
}

/* ==================== 检查 6：缓存上限常量有界 ==================== */
for (const [file, constant, maxValue] of CACHE_BOUND_CHECKS) {
    const content = readFile(file)
    if (content === null) {
        addFailure('缓存上限', `${file}: 文件不存在`)
        continue
    }
    const regex = new RegExp(`(?:const|export const)\\s+${constant}\\s*=\\s*(\\d+)`)
    const match = content.match(regex)
    if (!match) {
        addFailure('缓存上限', `${file}: 未找到有界缓存常量 ${constant}`)
        continue
    }
    const value = Number(match[1])
    if (!Number.isFinite(value) || value <= 0 || value > maxValue) {
        addFailure('缓存上限', `${file}: ${constant}=${match[1]} 超出允许范围 (0, ${maxValue}]`)
    }
}

/* ==================== 检查 7：本轮修复锚点 ==================== */
for (const [file, anchors] of LIFECYCLE_ANCHORS) {
    const content = readFile(file)
    if (content === null) {
        addFailure('修复锚点', `${file}: 文件不存在`)
        continue
    }
    for (const [fragment, description] of anchors) {
        if (!content.includes(fragment)) {
            addFailure('修复锚点', `${file}: 缺少「${description}」（${fragment}）`)
        }
    }
}

/* ==================== 输出 ==================== */
const summary = {
    ok: failures.length === 0,
    failureCount: failures.length,
    metrics,
    failures
}

if (process.argv.includes('--json')) {
    console.log(JSON.stringify(summary, null, 2))
} else {
    console.log('[memory-lifecycle] 内存与生命周期静态回归检查')
    console.log(
        `[memory-lifecycle] 扫描：渲染层 ${metrics.scanned.rendererFiles} / 主进程 ${metrics.scanned.mainFiles} / shared ${metrics.scanned.sharedFiles} 个源文件`
    )
    console.log(
        `[memory-lifecycle] 计量：IPC 订阅 ${metrics.ipcSubscriptions} · IPC 退订 ${metrics.ipcRemovals} · ` +
            `DOM 监听 +${metrics.addEventListeners}/-${metrics.removeEventListeners} · 计时器句柄文件 ${metrics.timerHandles} · setInterval ${metrics.intervals}`
    )
    if (failures.length === 0) {
        console.log(
            '[memory-lifecycle] ✅ 通过：IPC/DOM 监听、定时器、缓存上限与退出清理清单均有配对/有界约束'
        )
    } else {
        console.error(`[memory-lifecycle] ❌ 未通过（${failures.length} 项）：`)
        for (const failure of failures) {
            console.error(`  - [${failure.check}] ${failure.message}`)
        }
    }
}

process.exit(failures.length === 0 ? 0 : 1)
