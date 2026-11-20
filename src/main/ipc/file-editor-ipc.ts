/**
 * IPC 注册收口（P2 架构债）：文件编辑 / 落盘 / 读取域
 *
 * 从 `src/main/utils/utils.ts` 的 `MainWindowListenUtilsEvent` 按域拆出：
 * - FILE.UPDATE_SELECT_FILE_CONTENT：编辑器内容同步（FUN-18 无活动文件时只提示一次）；
 * - FILE.REOPEN_WITH_ENCODING / CONVERT_SAVE_ENCODING：编码菜单重新打开/转码保存（FUN-02）；
 * - FILE.SAVE_TO_DISK：保存内容到磁盘；
 * - FILE.READ_HTML / READ_BINARY：文本/HTML 与 PDF 二进制读取（P1-AS-1 路径守卫 +
 *   P3 文本扩展名白名单 + 128MB 二进制上限）；
 * - FILE.OPEN_IN_BROWSER：本地 HTML 交系统浏览器打开；
 * - FILE.CHECK_EXISTS：受信范围内存在性探测。
 *
 * 注册顺序、sender 校验、错误兜底（CQ-05）、日志与返回契约与拆分前完全一致。
 */
import { shell } from 'electron'
import type { BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import * as FileUtils from '../utils/file-utils/index'
import { appState } from '../utils/app-state'
import { isAllowedReadHtmlExtension, isPathAllowed } from '../utils/security'
import { IPC } from '../../shared/ipc-channels'
// 公共接口归位第 2 批：文件读取大小上限与大小格式化统一引用 shared 真源
import { MAX_READ_BINARY_SIZE } from '../../shared/constants/limits'
import { formatFileSize } from '../../shared/utils/format'
import { tMain } from '../utils/i18n'
import { logger } from '../utils/logger'
// 4.4（M2）：异步 IPC 异常兜底 / 状态栏提示统一 helper
import { notifyIpcAsyncError } from '../utils/error-report'
import { notifyStatus } from '../utils/status-notify'
import { withSenderCheck } from '../utils/ipc-security'
import { ipcListenerManager } from './ipc-listener-manager'
import { withHandleErrorLog } from './handle-error-log'

/**
 * P1-AS-1：文件路径越界的用户提示（状态栏）。
 * 使用现有状态词条组合出「打开文件失败：没有读取权限: <path>」，不新增 i18n 词条。
 * 4.4：发送统一走 notifyStatus（窗口判活/异常兜底不再手写）。
 */
function notifyFilePathDenied(
    mainWindow: BrowserWindow,
    channel: string,
    filePath: unknown,
    actionKey: string
): void {
    const display = typeof filePath === 'string' ? filePath : String(filePath)
    logger.warn(`[Security] 通道 "${channel}" 已拒绝受信范围外的路径（P1-AS-1）：${display}`)
    notifyStatus(
        {
            message: tMain(actionKey, {
                message: `${tMain('mainMsg.file.readError.eacces')}: ${display}`
            }),
            type: 'error'
        },
        mainWindow
    )
}

/**
 * 注册文件编辑/落盘/读取域 IPC。
 *
 * @param mainWindow 主窗口（内容同步、状态栏提示与浏览器打开的错误兜底目标）
 * @param componentId 监听台账组件 ID（拆分前统一为 `global-utils-ipc`，保持不变）
 */
export function registerFileEditorIpc(mainWindow: BrowserWindow, componentId: string): void {
    // FUN-18：无活动文件时的保存提示状态——同一段"无活动文件"期间只提示一次，
    // 恢复活动文件后重置，避免每次按键都向状态栏重复发送提示。
    // 状态位于注册函数闭包内（拆分前为 MainWindowListenUtilsEvent 的局部变量），
    // 注册函数只执行一次，语义不变；重复调用注册函数会重新初始化该提示状态。
    let noActiveFileSaveHintShown = false

    // FUN-18：无活动文件时忽略该次保存请求（原实现每次按键调用 SaveActiveFileAs
    // 弹出错误框），改为通过状态栏提示一次；恢复活动文件后重置提示状态。
    // P1/N-05：编辑器内容同步会影响后续落盘内容，仅主窗口可信。
    ipcListenerManager.registerOnce(
        IPC.FILE.UPDATE_SELECT_FILE_CONTENT,
        withSenderCheck(
            IPC.FILE.UPDATE_SELECT_FILE_CONTENT,
            async (_: Electron.IpcMainEvent, content: string) => {
                try {
                    if (appState.currentActiveFile != null) {
                        appState.currentActiveFile.content = content
                        noActiveFileSaveHintShown = false
                    } else if (!noActiveFileSaveHintShown) {
                        noActiveFileSaveHintShown = true
                        mainWindow.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
                            message: tMain('mainMsg.status.noActiveFileUnsaved'),
                            type: 'warning'
                        })
                    }
                } catch (error) {
                    notifyIpcAsyncError(mainWindow, IPC.FILE.UPDATE_SELECT_FILE_CONTENT, error)
                }
            }
        ),
        componentId
    )

    // FUN-02：编码菜单接线——渲染层收到 open-with-encoding / convert-to-encoding
    // 菜单事件后 invoke 以下通道，由主进程按指定编码重新打开 / 转码保存当前文件
    // （复用 file-operations 的 normalizeEncoding / decodeFileContent / encodeFileContent）。
    // P1/N-05：重新打开（读盘）与转码保存（写盘）均为文件系统高风险通道，仅主窗口可信。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.REOPEN_WITH_ENCODING,
        withSenderCheck(
            IPC.FILE.REOPEN_WITH_ENCODING,
            withHandleErrorLog(
                IPC.FILE.REOPEN_WITH_ENCODING,
                async (_event: Electron.IpcMainInvokeEvent, encoding: string) => {
                    await FileUtils.ReopenActiveFileWithEncoding(encoding)
                }
            ),
            { kind: 'handle' }
        ),
        componentId
    )

    ipcListenerManager.registerHandleOnce(
        IPC.FILE.CONVERT_SAVE_ENCODING,
        withSenderCheck(
            IPC.FILE.CONVERT_SAVE_ENCODING,
            withHandleErrorLog(
                IPC.FILE.CONVERT_SAVE_ENCODING,
                async (_event: Electron.IpcMainInvokeEvent, encoding: string) => {
                    await FileUtils.ConvertActiveFileEncoding(encoding)
                }
            ),
            { kind: 'handle' }
        ),
        componentId
    )

    // P2 死代码清理：NAVIGATION.KEYDOWN（'baize:navigation:keydown'）主进程监听
    // 全仓零发送方（原用于渲染层上报 Ctrl+S 再转主进程保存，现保存走
    // FILE.SAVE_TO_DISK / EDITOR.FLUSH_CONTENT 链路），随通道常量一并删除。

    // P1/N-05：保存内容到磁盘（文件系统写）仅主窗口可信。
    ipcListenerManager.registerOnce(
        IPC.FILE.SAVE_TO_DISK,
        withSenderCheck(
            IPC.FILE.SAVE_TO_DISK,
            async (_: Electron.IpcMainEvent, content: string) => {
                try {
                    if (appState.currentActiveFile != null) {
                        appState.currentActiveFile.content = content
                        await FileUtils.SaveActiveFile()
                    }
                } catch (error) {
                    notifyIpcAsyncError(mainWindow, IPC.FILE.SAVE_TO_DISK, error)
                }
            }
        ),
        componentId
    )

    // 读取文本/HTML 文件内容
    // P1/N-05：可读取任意路径文件内容，仅主窗口可信（handle 拒绝返回错误对象）。
    // P1-AS-1：路径必须位于受信范围（工作区/临时目录/用户选择过的路径），
    // 防止渲染层借该通道读取任意文件（如 SSH 密钥、浏览器配置）。
    // P3 安全剩余项：受信范围内再收窄到文本/文档扩展名白名单（`.html/.htm/.md/.txt/.json`
    // 等，口径见 shared `READ_HTML_TEXT_EXTENSIONS`），拒绝 .exe/.dll/.pdf 等二进制与无扩展名
    // 文件——本通道唯一消费方是 HTML 查看器与 Markdown snippets，二者均只读取文本。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.READ_HTML,
        withSenderCheck(
            IPC.FILE.READ_HTML,
            async (_, filePath: string) => {
                if (!isPathAllowed(filePath)) {
                    notifyFilePathDenied(
                        mainWindow,
                        IPC.FILE.READ_HTML,
                        filePath,
                        'mainMsg.status.openFileFailed'
                    )
                    throw new Error(tMain('mainMsg.file.readError.eacces'))
                }
                if (!isAllowedReadHtmlExtension(filePath)) {
                    logger.warn(
                        `[Security] 已拒绝通过 READ_HTML 读取非文本扩展名文件：${String(filePath)}`
                    )
                    throw new Error(tMain('mainMsg.file.readError.eacces'))
                }
                try {
                    const content = await fs.promises.readFile(filePath, 'utf-8')
                    return content
                } catch (error) {
                    logger.error('读取 HTML 文件失败:', error)
                    throw error
                }
            },
            { kind: 'handle' }
        ),
        componentId
    )

    // 读取本地二进制文件（2026-11-18，遗留清单 #9：PDF 预览改走 pdf.js 需要原始字节）
    // P1-AS-1：仅允许受信范围路径（Path Guard），越界拒绝并提示。
    // 2026-11-19 收紧边界：
    // ① 仅允许 .pdf（不区分大小写）——本通道唯一调用方是 PDF 预览，防止被借道读取任意二进制；
    // ② 单文件大小上限 128MB——stat 超限直接拒绝，避免超大文件一次性读入主/渲染进程造成卡顿或 OOM；
    // ③ Buffer 本身是 Uint8Array 子类，IPC 结构化克隆后渲染层可直接使用，去掉多余拷贝。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.READ_BINARY,
        withSenderCheck(
            IPC.FILE.READ_BINARY,
            async (_, filePath: string) => {
                if (typeof filePath !== 'string' || filePath.trim() === '') {
                    throw new Error(tMain('mainMsg.file.readError.eacces'))
                }
                if (!isPathAllowed(filePath)) {
                    notifyFilePathDenied(
                        mainWindow,
                        IPC.FILE.READ_BINARY,
                        filePath,
                        'mainMsg.status.openFileFailed'
                    )
                    throw new Error(tMain('mainMsg.file.readError.eacces'))
                }
                if (!filePath.toLowerCase().endsWith('.pdf')) {
                    logger.warn(`[Security] 已拒绝通过 READ_BINARY 读取非 PDF 文件：${filePath}`)
                    throw new Error(tMain('mainMsg.file.readError.eacces'))
                }
                let fileSize: number
                try {
                    fileSize = (await fs.promises.stat(filePath)).size
                } catch (error) {
                    logger.error('读取二进制文件失败（无法获取文件大小）:', error)
                    throw error
                }
                if (fileSize > MAX_READ_BINARY_SIZE) {
                    logger.warn(
                        `[Security] 已拒绝读取超过 ${MAX_READ_BINARY_SIZE} 字节上限的 PDF：${filePath}`
                    )
                    // 公共接口归位第 2 批：大小文案统一走 shared 的 formatFileSize（1024 进制、
                    // 两位小数、单位与数值间有空格），数值口径与旧 `${size / 1024 / 1024}MB` 一致
                    throw new Error(
                        `文件过大，无法预览：${filePath} 超过 ${formatFileSize(MAX_READ_BINARY_SIZE)} 上限`
                    )
                }
                try {
                    // Buffer 是 Uint8Array 子类，可被 IPC 结构化克隆，直接返回避免额外拷贝
                    return await fs.promises.readFile(filePath)
                } catch (error) {
                    logger.error('读取二进制文件失败:', error)
                    throw error
                }
            },
            { kind: 'handle' }
        ),
        componentId
    )

    // 在外部浏览器中打开本地 HTML 文件（2026-11-18，遗留清单 #1）
    // 背景：HTML 查看器「在浏览器中打开」此前复用已删除的 OPEN_EXTERNAL_LINK（该通道按设计
    // 仅放行 http/https，本地路径必被拒绝（按钮点击无效）。本通道专门处理本地文件：
    // ① 仅允许 .html/.htm；② 必须命中 Path Guard（工作区/受信目录，防任意文件外带）；
    // ③ 通过后经 pathToFileURL 交给系统默认浏览器打开。
    ipcListenerManager.registerOnce(
        IPC.FILE.OPEN_IN_BROWSER,
        withSenderCheck(IPC.FILE.OPEN_IN_BROWSER, async (_, filePath: string) => {
            if (typeof filePath !== 'string' || filePath.trim() === '') {
                return
            }
            const resolved = path.resolve(filePath)
            if (!/\.html?$/i.test(resolved)) {
                logger.warn(`[Security] 已拒绝在浏览器打开非 HTML 文件：${resolved}`)
                return
            }
            if (!isPathAllowed(resolved)) {
                notifyFilePathDenied(
                    mainWindow,
                    IPC.FILE.OPEN_IN_BROWSER,
                    resolved,
                    'mainMsg.status.openFileFailed'
                )
                return
            }
            try {
                await shell.openExternal(pathToFileURL(resolved).href)
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.FILE.OPEN_IN_BROWSER, error)
            }
        }),
        componentId
    )

    // 检查文件是否存在
    // P1/N-05：任意路径存在性探测（路径预言机），仅主窗口可信。
    // P1-AS-1：只允许在受信范围内探测；越界返回 false（不做路径预言机）。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.CHECK_EXISTS,
        withSenderCheck(
            IPC.FILE.CHECK_EXISTS,
            async (_, filePath: string) => {
                if (!isPathAllowed(filePath)) {
                    logger.warn(
                        `[Security] 已拒绝探测受信范围外的路径（P1-AS-1）：${String(filePath)}`
                    )
                    return false
                }
                try {
                    const exists = fs.existsSync(filePath)
                    return exists
                } catch (error) {
                    logger.error('检查文件存在失败:', error)
                    return false
                }
            },
            { kind: 'handle' }
        ),
        componentId
    )
}
