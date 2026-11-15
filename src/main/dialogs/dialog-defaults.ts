import { BrowserWindow, BrowserWindowConstructorOptions, WebPreferences } from 'electron'
import { join } from 'path'
// CQ-10：主进程统一日志出口（写文件 + 控制台镜像），错误路径统一走 logger
import { logger } from '../utils/logger'

const DIALOG_PRELOAD = join(__dirname, '../preload/dialog.js')

export const DIALOG_WEB_PREFERENCES: WebPreferences = {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: DIALOG_PRELOAD
}

export function createDialogOptions(
    overrides?: Partial<BrowserWindowConstructorOptions>
): BrowserWindowConstructorOptions {
    return {
        frame: false,
        autoHideMenuBar: true,
        ...overrides,
        webPreferences: {
            ...DIALOG_WEB_PREFERENCES,
            ...(overrides?.webPreferences || {})
        }
    }
}

/**
 * CQ-06：将 HTML 字符串编码为 data: URL 并加载到对话框窗口。
 * 各 Show*Dialog 中重复的 `loadURL(\`data:text/html;charset=utf-8,...\`)` 样板统一收口到此处。
 */
export function createDialogHtmlUrl(htmlContent: string): string {
    return `data:text/html;charset=utf-8,${encodeURIComponent(htmlContent)}`
}

/**
 * CQ-06：向对话框窗口加载 HTML 内容（主进程 JSDOM 拼 HTML + data:URL 加载模式的公共入口）。
 * 其余对话框可按需逐步迁移到该公共函数，消除逐字重复的 loadURL 样板。
 */
export function loadDialogHtml(window: BrowserWindow, htmlContent: string): Promise<void> {
    return window.loadURL(createDialogHtmlUrl(htmlContent))
}

// ============================ PF-07：jsdom 惰性加载 ============================
// jsdom 及其依赖体积约 9.3MB，原先 14 个对话框文件在顶层静态 import，
// 主进程启动即 eager 加载；这里改为首次真正生成对话框 HTML 时 require 并缓存模块实例，
// 之后复用（保持调用方同步 API 不变，避免把 15 个对话框全部异步化）。
let jsdomModule: typeof import('jsdom') | null = null

/**
 * PF-07：获取 jsdom 模块（首次调用时按需加载并缓存）。
 * 全 src/main 仅允许此处出现对 jsdom 的运行时引用，其余文件统一通过 createJSDOM 使用。
 */
export function getJSDOM(): typeof import('jsdom') {
    if (jsdomModule === null) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports -- PF-07：按需 require jsdom，避免启动期 eager 加载
        jsdomModule = require('jsdom') as typeof import('jsdom')
    }
    return jsdomModule
}

/**
 * PF-07：创建 JSDOM 实例的公共入口（同步 API，内部惰性加载 jsdom）。
 * 调用方式与 `new JSDOM(html)` 完全一致，各 Show*Dialog 统一改用本函数。
 */
export function createJSDOM(html: string): import('jsdom').JSDOM {
    const { JSDOM } = getJSDOM()
    return new JSDOM(html)
}

/**
 * CQ-06：对话框操作完成后的“延迟刷新资源管理器”样板公共函数。
 * 原调用点重复书写 `setTimeout(async () => { try { await ReloadDirFromDisk() }
 * catch (err) { console.error(...) } }, N)`，现统一收口到此。
 *
 * 采用动态 import 惰性加载文件工具模块：dialog-defaults 被全部对话框引用，
 * 静态 import 会把整条 file-utils 依赖链提前带入模块加载期（也影响单测隔离）。
 *
 * @param delay 延迟毫秒数，默认 0（下一个宏任务执行，不阻塞当前操作）
 * @returns 刷新完成（失败时记录日志后）resolve，调用方可 await 保持原有时序
 */
export function notifyReloadDirFromDisk(delay = 0): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(() => {
            // 动态 import 显式 .js 扩展：主进程按 CJS 产物构建（与 ipc/menu-help.ts 的 auto-updater 惰性加载一致）
            void import('../utils/file-utils/file-operations.js')
                .then(({ ReloadDirFromDisk }) => ReloadDirFromDisk())
                .catch((err: unknown) => {
                    logger.error('Failed to reload from disk:', err)
                })
                .finally(() => resolve())
        }, delay)
    })
}
