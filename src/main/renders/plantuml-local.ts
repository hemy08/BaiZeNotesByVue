/**
 * PF-08：PlantUML 本地离线渲染（主进程侧）
 *
 * 背景：
 * 原实现由渲染层 markdown-it-plantuml 无参插件生成
 * `https://www.plantuml.com/plantuml/svg/...` 远程图片，离线/弱网时图表全部裂图，
 * 且每次预览刷新都要联网。`resources/plantuml/` 内已随包分发完整离线渲染环境
 * （index.html + teaVM 版 plantuml.js + viz-global.js 等），但此前从未被引用。
 *
 * 本模块方案（参考第一轮 Mermaid 隐藏窗口本地化思路，但不再需要 preload/IPC 回传）：
 * 1. 隐藏 BrowserWindow 加载本地 `resources/plantuml/index.html`（file:// 本地页）；
 * 2. 通过 `webContents.executeJavaScript` 注入 diagram 源码，调用页面暴露的
 *    `window.plantumlRender(lines, 'out')` 把 SVG 渲染到 #out 容器；
 * 3. 从页面取回 `#out.innerHTML`（SVG 字符串），经 IPC 返回渲染层插入预览 HTML。
 *
 * 可靠性设计：
 * - 窗口复用 + 空闲销毁：进程内单例隐藏窗口，首次渲染创建、后续复用；渲染完成 60s
 *   无新渲染请求自动销毁释放渲染进程资源（SVG 结果仍在 LRU 缓存，下次按需重建）；
 * - 串行队列：teaVM 渲染非重入且共享同一页面全局状态，所有请求单队列串行执行；
 *   渲染层仍按并发 3 发起 invoke，主进程侧排队，耗时可控且不会互相污染；
 * - 内容 hash 缓存：同一份源码只渲染一次（LRU，上限 50），避免重复渲染；
 * - 超时兜底：单图 10 秒超时返回 error（渲染层回显源码 + 错误提示，预览不卡死），
 *   隐藏窗口整体加载/teaVM 初始化另有 20 秒超时；
 * - 资源缺失降级：找不到 resources/plantuml 关键文件时返回 unstable 的
 *   `unavailable` 结果，渲染层保留原始围栏/交给 markdown-it-plantuml 远程渲染，
 *   离线资源缺失也不丢功能；
 * - 退出清理：首次成功渲染后挂接主窗口 `closed` 事件，主窗口关闭时一并销毁隐藏
 *   窗口，避免隐藏窗口阻止 `window-all-closed` 触发导致应用无法退出。
 *
 * 打包/开发资源定位：
 * 统一复用 `src/main/utils/app-paths.ts` 的 `getPlantumlPath()`：
 * 开发环境 = `<项目根>/resources/plantuml`，打包后 = `<process.resourcesPath>/plantuml`
 * （electron-builder.yml 的 extraResources 已把 resources/plantuml 复制到该目录）。
 *
 * 接线说明（2026-11-19：通道已收敛，以下为现状）：
 * - 通道常量收敛到 `src/shared/ipc-channels.ts` 的 `IPC.RENDER.PLANTUML_LOCAL`，
 *   本文件导出 `PLANTUML_LOCAL_RENDER_CHANNEL` 作为别名，渲染层引用同一常量；
 * - 主进程入口 `src/main/index.ts` 的 `app.whenReady()` 内调用
 *   `registerPlantumlLocalRenderIpc()` 注册 invoke 处理器；
 * - `cleanupApp()` 内调用 `disposePlantumlLocalWindows()` 兜底销毁隐藏窗口。
 */

import { BrowserWindow } from 'electron'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { getPlantumlPath } from '../utils/app-paths'
import { logger } from '../utils/logger'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'
// AS-6：PlantUML 本地渲染通道补发送方校验（仅主窗口可触发隐藏窗口渲染）
import { withSenderCheck } from '../utils/ipc-security'
import { IPC } from '../../shared/ipc-channels'
// 公共接口归位第 2 批：渲染超时/缓存上限常量与 LRU 缓存统一引用 shared 真源
import {
    PLANTUML_IDLE_DISPOSE_MS as SHARED_PLANTUML_IDLE_DISPOSE_MS,
    PLANTUML_PAGE_RENDER_WAIT_MS,
    PLANTUML_RENDER_CACHE_MAX,
    PLANTUML_RENDER_TIMEOUT_MS as SHARED_PLANTUML_RENDER_TIMEOUT_MS,
    PLANTUML_WINDOW_LOAD_TIMEOUT_MS as SHARED_PLANTUML_WINDOW_LOAD_TIMEOUT_MS
} from '../../shared/constants/render'
import { LRUCache } from '../../shared/utils/lru-cache'
import { tMain } from '../utils/i18n'

/**
 * PF-08 本地渲染 IPC 通道（单真源：src/shared/ipc-channels.ts 的 IPC.RENDER.PLANTUML_LOCAL）。
 * 渲染层 src/renderer/src/components/Markdown/hemy-editor-render.ts 引用同一常量。
 */
export const PLANTUML_LOCAL_RENDER_CHANNEL = IPC.RENDER.PLANTUML_LOCAL

/**
 * 单张图本地渲染总超时（毫秒）——超时返回 error，预览侧回显源码+错误提示。
 * 公共接口归位第 2 批：数值真源为 shared/constants/render.PLANTUML_RENDER_TIMEOUT_MS，
 * 保留本导出名以兼容既有测试/调用方（值引用 shared 常量）。
 */
export const PLANTUML_RENDER_TIMEOUT_MS = SHARED_PLANTUML_RENDER_TIMEOUT_MS

/**
 * 隐藏窗口首次加载 + teaVM 初始化超时（毫秒）。
 * 公共接口归位第 2 批：值引用 shared/constants/render.PLANTUML_WINDOW_LOAD_TIMEOUT_MS。
 */
export const PLANTUML_WINDOW_LOAD_TIMEOUT_MS = SHARED_PLANTUML_WINDOW_LOAD_TIMEOUT_MS

/** 渲染结果缓存上限（LRU 按源码 sha1）——数值真源为 shared/constants/render.PLANTUML_RENDER_CACHE_MAX */
export const PLANTUML_CACHE_MAX = PLANTUML_RENDER_CACHE_MAX

/** 本地渲染结果状态：ok=成功出 SVG；error=渲染失败/超时；unavailable=离线资源缺失需远程降级 */
export type PlantumlRenderStatus = 'ok' | 'error' | 'unavailable'

/** 本地渲染返回给渲染层的结构（经 IPC 结构化克隆传输） */
export interface PlantumlRenderResponse {
    status: PlantumlRenderStatus
    /** status === 'ok' 时的 SVG 字符串（含 <svg> 根节点） */
    svg?: string
    /** status === 'error' 时的错误信息 */
    message?: string
    /** status === 'unavailable' 时的降级原因 */
    reason?: string
}

/** 渲染结果 LRU 缓存：源码 sha1 → SVG 字符串（公共接口归位第 2 批：改用 shared 的 LRUCache） */
const plantumlSvgCache = new LRUCache<string>(PLANTUML_CACHE_MAX)

/** 复用的隐藏渲染窗口（null 表示尚未创建或已销毁） */
let renderWindow: BrowserWindow | null = null

/** 正在创建中的隐藏窗口，避免并发请求重复创建窗口 */
let pendingRenderWindow: Promise<BrowserWindow> | null = null

/** 串行渲染队列尾指针：保证同一时间只有一个 executeJavaScript 在渲染页执行 */
let renderQueueTail: Promise<void> = Promise.resolve()

/** 主窗口 closed 清理是否已挂接（防重复挂接） */
let ownerWindowCleanupHooked = false

/**
 * 2026-11-18（遗留清单 #13）：隐藏渲染窗空闲销毁定时器。
 * 渲染完成后启动计时，超时无新渲染请求则销毁隐藏窗口释放渲染进程资源；
 * SVG 结果仍由 LRU 缓存保留，下次渲染按需重建窗口。
 */
let idleDisposeTimer: NodeJS.Timeout | null = null

/** 空闲销毁超时（60s；渲染完成后的空闲期；导出供测试引用）。
 * 公共接口归位第 2 批：值引用 shared/constants/render.PLANTUML_IDLE_DISPOSE_MS。 */
export const PLANTUML_IDLE_DISPOSE_MS = SHARED_PLANTUML_IDLE_DISPOSE_MS

/** 清除空闲销毁定时器（销毁/重建/新任务时调用） */
function cancelIdleDispose(): void {
    if (idleDisposeTimer !== null) {
        clearTimeout(idleDisposeTimer)
        idleDisposeTimer = null
    }
}

/** 渲染完成后启动空闲销毁计时（超时销毁隐藏窗；unref 不阻塞进程退出） */
function scheduleIdleDispose(): void {
    cancelIdleDispose()
    idleDisposeTimer = setTimeout(() => {
        idleDisposeTimer = null
        if (pendingRenderWindow !== null) {
            // 2026-11-19 修复：正在创建窗口时**重新计时**（原实现直接 return，
            // 该次空闲销毁被永久丢弃——pending 结束后不会再有回调）。
            scheduleIdleDispose()
            return
        }
        logger.info('[PlantUML] 隐藏渲染窗口空闲超时，销毁以释放渲染进程资源（下次渲染时重建）')
        disposePlantumlLocalWindows()
    }, PLANTUML_IDLE_DISPOSE_MS)
    idleDisposeTimer.unref?.()
}

/** 隐藏窗口初始化失败原因（仅用于诊断日志，不缓存失败状态，允许后续重试） */
let lastWindowError: string | null = null

/**
 * 计算 PlantUML 源码的内容 hash（sha1，仅作缓存键；碰撞概率可忽略）。
 */
export function hashPlantumlSource(source: string): string {
    return createHash('sha1').update(source, 'utf8').digest('hex')
}

/**
 * 解析本地 PlantUML 渲染页 index.html 的绝对路径。
 *
 * 关键脚本 index.html / plantuml.js / viz-global.js 任一缺失即视为"离线资源不可用"，
 * 返回 null 让上层降级为远程方案（与 getPlantumlPath 的开发/打包双分支一致）。
 */
export function resolvePlantumlIndexHtmlPath(): string | null {
    try {
        const plantumlDir = getPlantumlPath()
        const indexPath = path.join(plantumlDir, 'index.html')
        const requiredFiles = [
            indexPath,
            path.join(plantumlDir, 'plantuml.js'),
            path.join(plantumlDir, 'viz-global.js')
        ]
        for (const filePath of requiredFiles) {
            if (!fs.existsSync(filePath)) {
                return null
            }
        }
        return indexPath
    } catch (error) {
        logger.warn('[PlantUML] 解析本地渲染资源路径失败:', error)
        return null
    }
}

/** 清空渲染结果缓存（测试与诊断用） */
export function clearPlantumlRenderCache(): void {
    plantumlSvgCache.clear()
}

/**
 * 页面内初始化探测脚本：等待 teaVM 启动完成并暴露 window.plantumlRender。
 *
 * 注意：resources/plantuml/index.html 加载后会先用自带示例调用一次 renderNow()，
 * 该渲染是异步的（先返回、随后把 SVG 写入 #out）。若不等示例图落定就开始注入
 * 渲染，可能与示例渲染竞争同一 #out/teaVM 全局状态，故就绪判定为：
 * "plantumlRender 已暴露 + #out 已有内容（示例图完成）"，
 * 示例渲染失败时最多等 3 秒后放行，避免永远无法就绪。
 *
 * 返回 true 表示渲染页就绪；false 表示 15 秒内未就绪（由主进程按加载失败处理）。
 */
const RENDER_PAGE_READY_SCRIPT = `
new Promise((resolve) => {
    const startedAt = Date.now()
    const timer = setInterval(() => {
        const out = document.getElementById('out')
        const apiReady = typeof window.plantumlRender === 'function' && !!out
        const demoRenderSettled = !!(out && (out.childElementCount > 0 || (out.textContent || '').trim().length > 0))
        if (apiReady && (demoRenderSettled || Date.now() - startedAt > 3000)) {
            clearInterval(timer)
            resolve(true)
            return
        }
        if (Date.now() - startedAt > 15000) {
            clearInterval(timer)
            resolve(false)
        }
    }, 50)
})
`

/**
 * 构造页面内渲染脚本：清空 #out → 传入源码调用 plantumlRender → 取回 SVG。
 * 源码经 JSON.stringify 注入（并转义 U+2028/U+2029，避免 JS 字符串字面量被截断）。
 */
function buildPlantumlRenderScript(source: string): string {
    const sourceLiteral = JSON.stringify(source)
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
    return `(async () => {
    try {
        const out = document.getElementById('out')
        if (!out) {
            return { status: 'error', message: ${JSON.stringify(tMain('mainMsg.plantuml.missingOutContainer'))} }
        }
        out.innerHTML = ''
        const lines = ${sourceLiteral}.split(/\\r\\n|\\r|\\n/)
        const maybePromise = window.plantumlRender(lines, 'out')
        if (maybePromise && typeof maybePromise.then === 'function') {
            await maybePromise
        }
        const startedAt = Date.now()
        while (Date.now() - startedAt < ${PLANTUML_PAGE_RENDER_WAIT_MS}) {
            if (out.querySelector && out.querySelector('svg')) {
                break
            }
            if (out.textContent && out.textContent.trim().length > 0) {
                break
            }
            await new Promise((resolveTick) => setTimeout(resolveTick, 20))
        }
        const svg = out.querySelector ? out.querySelector('svg') : null
        if (!svg) {
            const detail = (out.textContent || '').trim()
            return { status: 'error', message: detail.length > 0 ? detail.slice(0, 200) : ${JSON.stringify(tMain('mainMsg.plantuml.missingSvg'))} }
        }
        return { status: 'ok', svg: out.innerHTML }
    } catch (error) {
        return { status: 'error', message: String((error && error.message) || error) }
    }
})()`
}

/** 把页面返回的原始结果规整为带类型的渲染结果 */
function normalizeRenderPayload(raw: unknown): PlantumlRenderResponse {
    if (!raw || typeof raw !== 'object') {
        return { status: 'error', message: tMain('mainMsg.plantuml.invalidResult') }
    }
    const record = raw as Record<string, unknown>
    if (record.status === 'ok' && typeof record.svg === 'string' && record.svg.includes('<svg')) {
        return { status: 'ok', svg: record.svg }
    }
    const message =
        typeof record.message === 'string' && record.message.length > 0
            ? record.message
            : tMain('mainMsg.plantuml.renderFailed')
    return { status: 'error', message }
}

/**
 * 创建隐藏 PlantUML 渲染窗口并等待渲染页就绪。
 *
 * 安全配置：不加载 preload、关闭 Node 集成、开启 contextIsolation/sandbox，
 * 仅加载随包分发的本地可信页面；同时禁止该窗口打开新窗口与导航跳转。
 */
function createRenderWindow(): Promise<BrowserWindow> {
    return new Promise((resolve, reject) => {
        const indexPath = resolvePlantumlIndexHtmlPath()
        if (!indexPath) {
            reject(new Error(tMain('mainMsg.plantuml.resourceNotFound')))
            return
        }

        const win = new BrowserWindow({
            show: false,
            width: 1024,
            height: 768,
            title: 'PlantUML Render',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                // 隐藏窗口不参与可见性节流，避免后台渲染被降频拖慢首图
                backgroundThrottling: false
            }
        })
        renderWindow = win

        let settled = false
        const settleResolve = (): void => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(loadTimer)
            resolve(win)
        }
        const settleReject = (error: Error): void => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(loadTimer)
            lastWindowError = error.message
            logger.warn('[PlantUML] 隐藏渲染窗口初始化失败:', error.message)
            try {
                if (!win.isDestroyed()) {
                    win.destroy()
                }
            } catch (destroyError) {
                logger.warn('[PlantUML] 销毁隐藏渲染窗口失败:', destroyError)
            }
            renderWindow = null
            reject(error)
        }
        const loadTimer = setTimeout(() => {
            settleReject(
                new Error(
                    tMain('mainMsg.plantuml.windowInitTimeout', {
                        ms: PLANTUML_WINDOW_LOAD_TIMEOUT_MS
                    })
                )
            )
        }, PLANTUML_WINDOW_LOAD_TIMEOUT_MS)

        // 窗口关闭（主动销毁/渲染页崩溃）后置空引用，下次渲染按需重建
        win.once('closed', () => {
            if (renderWindow === win) {
                renderWindow = null
            }
        })

        // 安全加固：隐藏窗口只加载本地渲染页，不允许打开新窗口或导航
        win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
        win.webContents.on('will-navigate', (event) => {
            event.preventDefault()
        })

        win.webContents.once('did-finish-load', () => {
            void (async () => {
                try {
                    const ready = await win.webContents.executeJavaScript(RENDER_PAGE_READY_SCRIPT)
                    if (ready !== true) {
                        settleReject(new Error(tMain('mainMsg.plantuml.pageNotReady')))
                        return
                    }
                    settleResolve()
                } catch (error) {
                    settleReject(error instanceof Error ? error : new Error(String(error)))
                }
            })()
        })
        win.webContents.once('did-fail-load', (_event, errorCode, errorDescription) => {
            settleReject(
                new Error(
                    tMain('mainMsg.plantuml.pageLoadFailed', {
                        description: errorDescription,
                        code: errorCode
                    })
                )
            )
        })

        // 渲染进程崩溃/被系统回收：销毁窗口，下一次渲染请求会按需重建，避免后续请求全部超时
        win.webContents.on('render-process-gone', (_event, details) => {
            const reason = details?.reason ?? 'unknown'
            logger.warn(`[PlantUML] 隐藏渲染窗口渲染进程异常退出（${reason}），下次渲染将重建窗口`)
            if (!settled) {
                settleReject(new Error(tMain('mainMsg.plantuml.processGone', { reason })))
                return
            }
            try {
                if (!win.isDestroyed()) {
                    win.destroy()
                }
            } catch (destroyError) {
                logger.warn('[PlantUML] 销毁异常渲染窗口失败:', destroyError)
            }
        })

        void win.loadFile(indexPath).catch((error: unknown) => {
            settleReject(error instanceof Error ? error : new Error(String(error)))
        })
    })
}

/** 获取（必要时创建）复用的隐藏渲染窗口 */
async function ensureRenderWindow(): Promise<BrowserWindow> {
    // 新渲染任务：取消空闲销毁计时
    cancelIdleDispose()
    if (renderWindow && !renderWindow.isDestroyed()) {
        return renderWindow
    }
    if (!pendingRenderWindow) {
        // 2026-11-19 修复：仅清空「本次创建」对应的 pending 引用——
        // dispose 后新建窗口时，旧创建 promise 的迟到 finally 不得清空新引用。
        pendingRenderWindow = (() => {
            const wrapped: Promise<BrowserWindow> = createRenderWindow().finally(() => {
                if (pendingRenderWindow === wrapped) {
                    pendingRenderWindow = null
                }
            })
            return wrapped
        })()
    }
    return await pendingRenderWindow
}

/** 在渲染页执行一次 PlantUML 渲染并取回 SVG（调用方需自行保证串行） */
async function executePlantumlRender(source: string): Promise<PlantumlRenderResponse> {
    const win = await ensureRenderWindow()
    const rawResult = (await win.webContents.executeJavaScript(
        buildPlantumlRenderScript(source)
    )) as unknown
    return normalizeRenderPayload(rawResult)
}

/** 超时后丢弃隐藏窗口：防止仍在执行的旧渲染与后续请求在同一页面内互相污染 */
function resetRenderWindowAfterTimeout(): void {
    if (renderWindow && !renderWindow.isDestroyed()) {
        logger.warn('[PlantUML] 本地渲染超时，销毁隐藏渲染窗口，下次渲染时重建')
        try {
            renderWindow.destroy()
        } catch (error) {
            logger.warn('[PlantUML] 销毁超时隐藏渲染窗口失败:', error)
        }
    }
    renderWindow = null
}

/** 单图渲染（含 10 秒超时兜底） */
async function renderSingleDiagram(source: string): Promise<PlantumlRenderResponse> {
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<PlantumlRenderResponse>((resolve) => {
        timeoutTimer = setTimeout(() => {
            resetRenderWindowAfterTimeout()
            resolve({
                status: 'error',
                message: tMain('mainMsg.plantuml.renderTimeout', { ms: PLANTUML_RENDER_TIMEOUT_MS })
            })
        }, PLANTUML_RENDER_TIMEOUT_MS)
    })

    try {
        return await Promise.race([executePlantumlRender(source), timeoutPromise])
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return {
            status: 'error',
            message: tMain('mainMsg.plantuml.renderException', { message })
        }
    } finally {
        if (timeoutTimer) {
            clearTimeout(timeoutTimer)
        }
        // 2026-11-18（遗留清单 #13）：渲染结束进入空闲期，超时后销毁隐藏窗释放资源
        scheduleIdleDispose()
    }
}

/**
 * 本地渲染单张 PlantUML 图（主进程内部入口，已含缓存与串行队列）。
 *
 * @param source PlantUML 源码（可带 @startuml/@enduml，也可由调用方补全）
 * @returns ok 时携带 SVG 字符串；error/unavailable 时由渲染层做降级展示
 */
export async function renderPlantumlDiagram(source: string): Promise<PlantumlRenderResponse> {
    if (typeof source !== 'string' || source.trim().length === 0) {
        return { status: 'error', message: tMain('mainMsg.plantuml.emptySource') }
    }

    // 离线资源缺失：直接返回 unavailable，渲染层保留原文走远程降级（不创建窗口）
    if (!resolvePlantumlIndexHtmlPath()) {
        return {
            status: 'unavailable',
            reason: '未找到 resources/plantuml 离线渲染资源（index.html/plantuml.js/viz-global.js）'
        }
    }

    const cacheKey = hashPlantumlSource(source)
    const cachedSvg = plantumlSvgCache.get(cacheKey)
    if (cachedSvg !== undefined) {
        return { status: 'ok', svg: cachedSvg }
    }

    // 串行队列：teaVM 渲染非重入，所有请求按到达顺序逐张渲染
    const task = renderQueueTail.then(async () => {
        const result = await renderSingleDiagram(source)
        if (result.status === 'ok' && typeof result.svg === 'string') {
            plantumlSvgCache.set(cacheKey, result.svg)
        }
        return result
    })
    renderQueueTail = task.then(
        () => undefined,
        () => undefined
    )
    return await task
}

/**
 * 挂接主窗口关闭清理：主窗口关闭时销毁隐藏渲染窗口，
 * 避免隐藏窗口让 `window-all-closed` 无法触发、应用无法退出。
 */
function hookOwnerWindowCleanup(event: Electron.IpcMainInvokeEvent): void {
    if (ownerWindowCleanupHooked) {
        return
    }
    try {
        if (typeof BrowserWindow.fromWebContents !== 'function') {
            return
        }
        const sender = event?.sender
        if (!sender) {
            return
        }
        const ownerWindow = BrowserWindow.fromWebContents(sender)
        if (!ownerWindow || typeof ownerWindow.once !== 'function') {
            return
        }
        ownerWindowCleanupHooked = true
        ownerWindow.once('closed', () => {
            disposePlantumlLocalWindows()
        })
    } catch (error) {
        logger.warn('[PlantUML] 挂接主窗口关闭清理失败:', error)
    }
}

/**
 * 注册 PlantUML 本地渲染 IPC 处理器（主进程启动时调用一次，可重复调用）。
 *
 * 渲染层经 `window.electron.ipcRenderer.invoke(通道, 源码)` 调用，
 * 返回 PlantumlRenderResponse（ok/error/unavailable）。
 */
export function registerPlantumlLocalRenderIpc(): void {
    ipcListenerManager.registerHandleOnce(
        PLANTUML_LOCAL_RENDER_CHANNEL,
        withSenderCheck(
            PLANTUML_LOCAL_RENDER_CHANNEL,
            async (event: Electron.IpcMainInvokeEvent, source: unknown) => {
                hookOwnerWindowCleanup(event)
                if (typeof source !== 'string') {
                    return {
                        status: 'error',
                        message: tMain('mainMsg.plantuml.invalidSourceParam')
                    }
                }
                return await renderPlantumlDiagram(source)
            },
            { kind: 'handle' }
        ),
        'plantuml-local-render'
    )
}

/**
 * 销毁隐藏渲染窗口并复位窗口相关状态（应用退出/主窗口关闭时调用）。
 * 注意：不清理 SVG 缓存（进程退出即回收），也不影响已注册的 IPC 处理器。
 */
export function disposePlantumlLocalWindows(): void {
    cancelIdleDispose()
    pendingRenderWindow = null
    ownerWindowCleanupHooked = false
    if (renderWindow && !renderWindow.isDestroyed()) {
        try {
            renderWindow.destroy()
        } catch (error) {
            logger.warn('[PlantUML] 销毁隐藏渲染窗口失败:', error)
        }
    }
    renderWindow = null
}

/** 读取最近一次隐藏窗口初始化失败原因（诊断用；无失败返回 null） */
export function getLastPlantumlWindowError(): string | null {
    return lastWindowError
}
