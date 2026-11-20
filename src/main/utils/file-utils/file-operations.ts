/**
 * 文件读写与文件系统操作模块（主进程）
 *
 * CQ-7：原约 2,390 行单文件按职责拆分为多模块，本文件保留「文件 / 文件夹」核心操作：
 * - 保存、另存为、打开（含编码菜单）、新建、重命名、删除、资源管理器定位；
 * - 编码转换 / 以指定编码重新打开等面向当前活动文件的操作；
 * - 通过文件末尾的显式 re-export 保持原有 import 路径与公开 API 不变。
 *
 * 拆分后的职责边界：
 * - file-encoding.ts：编码探测/解码/编码、大文件流式读取、文件系统错误文案；
 * - directory-tree.ts：目录扫描与树构建、fs.watch 监听、目录刷新（含当前文件重读）；
 * - shared.ts：路径守卫提示、自身写入抑制窗口、当前文件磁盘签名等跨模块共享小工具。
 *
 * 对话框交互统一走 dialog-helpers（showErrorMessageBox 等），日志统一走 logger。
 */

import path from 'path'
import { promises as fs } from 'fs'
import { BrowserWindow, dialog, shell } from 'electron'
// ARC-13：FileItem / FileProperties 已收敛到 src/shared/types/file.ts（唯一真源）
import type { FileProperties } from '../../../shared/types'
// 公共接口归位第 2 批：随机串 / 文件大小格式化 / 扩展名清单统一引用 shared 真源
import { randomAlnum } from '../../../shared/utils/random'
import { formatFileSize } from '../../../shared/utils/format'
import { MARKDOWN_EXTENSIONS } from '../../../shared/constants/file-extensions'
// ARC-11：直接依赖无反向边的 file-state-store（避免 file-state → file-utils 循环依赖）
import { saveLastOpenedDirectory, saveLastOpenedFile } from '../file-state-store'
import { logger } from '../logger'
import { ParseDirectoryPath, ParserFileName } from './path-utils'
import * as fileExport from './export'
import { showErrorMessageBox } from './dialog-helpers'
// P2 非空断言治理：主窗口安全访问统一由 app-state 提供（判空 + isDestroyed + 发送异常兜底）
import { appState, getLiveMainWindow, sendToMainWindow } from '../app-state'
import { IPC } from '../../../shared/ipc-channels'
import { tMain } from '../i18n'
// P1-1（工作区受信根来源收敛）：原生目录选择器 return 的目录登记为受信工作区根；
// 最近文件夹为主进程专属配置，写入实现经 providers 注入（utils 不反向 import config）
import { approveWorkspaceRoot } from '../workspace-approval'
import { recordRecentFolderFromProvider } from '../providers'
// P1-AS-1：文件 IPC 路径守卫——工作区/临时目录/用户选择过的路径之外一律拒绝
import {
    isPathAllowed,
    isSafeFileExtension,
    isSafeFileName,
    PathAccessDeniedError,
    registerTrustedDirectory,
    registerTrustedPath
} from '../security'
// CQ-7：编码探测/读写与大文件流式读取（实现已迁移到 file-encoding.ts）
import {
    DescribeFileSystemError,
    encodeFileContent,
    LARGE_FILE_THRESHOLD,
    normalizeEncoding,
    ReadFileContentAdaptive
} from './file-encoding'
// CQ-7：目录刷新调度/目录树遍历（实现已迁移到 directory-tree.ts）
import { ReloadDirFromDisk, ScheduleReloadFromDisk, stopDirectoryWatcher } from './directory-tree'
// CQ-7：路径守卫提示 / 自身写入窗口 / 当前文件磁盘签名（实现已迁移到 shared.ts）
import {
    beginSelfWrite,
    endSelfWrite,
    notifyInvalidFileName,
    notifyPathAccessDenied,
    refreshActiveFileDiskStamp,
    rememberActiveFileDiskStamp
} from './shared'

// ARC-13：FileProperties 已收敛到 src/shared/types/file.ts（唯一真源）。
// 此处 re-export 保持既有 `import { FileProperties } from './file-operations'` 引用路径不变。
export type { FileProperties } from '../../../shared/types'

/**
 * 生成随机ID
 * 公共接口归位第 2 批：实现改为 shared/utils/random.randomAlnum（字符集
 * `A-Z a-z 0-9` 与循环语义逐字一致）；保留本导出名以兼容既有调用/测试。
 * @param maxLength 最大长度
 * @returns 随机ID字符串
 */
export function getMathRandom(maxLength: number): string {
    return randomAlnum(maxLength)
}

/**
 * 保存当前激活的文件
 * @returns 保存是否成功
 */
export async function SaveActiveFile(): Promise<boolean> {
    const curFile = appState.currentActiveFile
    if (!curFile) {
        // FE-08：无活动文件时不再 `throw new Error('No active file')`——
        // 菜单「文件 → 保存」是 async handler，异常若无人 await 就会成为主进程
        // 未处理 Promise 拒绝（且用户看不到任何提示）。改为状态栏提示 + 返回 false。
        sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
            message: tMain('mainMsg.status.noActiveFileSave'),
            type: 'warning'
        })
        return false
    }
    // P1-AS-1：落盘目标必须是当前工作区/临时目录/用户选择过的受信路径；
    // 越界时只提示不写盘（currentActiveFile 由本次运行期校验过的入口设置，正常不会越界）
    if (!isPathAllowed(curFile.path)) {
        notifyPathAccessDenied(curFile.path, 'mainMsg.status.saveFailed')
        return false
    }
    try {
        // D-4/FUN-02：按当前文件的原始编码写回（UTF-8 无 BOM / GBK 等），空内容也写盘
        const encoding = curFile.encoding || 'utf-8'
        const buffer = encodeFileContent(curFile.content ?? '', encoding)
        // PF-05：标记自身写盘，抑制 watcher 由此产生的回环刷新（保存不改变目录树）
        beginSelfWrite()
        try {
            await fs.writeFile(curFile.path, buffer)
        } finally {
            endSelfWrite()
        }

        // D-1/FUN-05：保存成功后记录快照并清除脏标记
        appState.markSaved()
        // PF-17：写盘后刷新磁盘签名，避免下一次目录刷新因旧签名而重读刚保存的内容
        await refreshActiveFileDiskStamp(curFile.path)

        logger.info('The file has been saved successfully', curFile.path)

        // 通知所有窗口
        BrowserWindow.getAllWindows().forEach((window: Electron.BrowserWindow) => {
            window.webContents.send(IPC.EVENTS.FILE_SAVED_SUCCESS)
        })
        return true
    } catch (error: unknown) {
        logger.error('Failed to save the file', curFile.path, error)
        // FUN-27：用户可见提示统一中文（CMP-30：文案走 mainMsg 词典）
        showErrorMessageBox(tMain('mainMsg.file.saveFailed', { message: (error as Error).message }))
        // D-1/FUN-05：保存失败通过现有状态栏事件通知渲染层，用户可见
        appState.mainWindow?.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
            message: tMain('mainMsg.status.saveFailed', { message: (error as Error).message }),
            type: 'error'
        })
        return false
    }
}

/**
 * 另存为当前文件
 */
/**
 * 另存为功能
 * 支持多种格式：md、txt、word、html、json、pdf
 */
export async function SaveActiveFileAs(): Promise<void> {
    const curFile = appState.currentActiveFile
    if (!curFile || !curFile.content) {
        showErrorMessageBox(tMain('mainMsg.file.noActiveFileForSaveAs'))
        return
    }
    const currentContent = appState.currentActiveFile?.content || ''

    // 显示另存为对话框
    // P2 非空断言治理：主窗口可能在"另存为"触发后、对话框弹出前被销毁，
    // 这里取存活窗口；窗口不可用时无法展示保存对话框，记日志后直接返回。
    const saveDialogWindow = getLiveMainWindow()
    if (!saveDialogWindow) {
        logger.warn('主窗口已销毁，取消另存为操作')
        return
    }
    const result = await dialog.showSaveDialog(saveDialogWindow, {
        title: tMain('mainMsg.dialog.saveAsTitle'),
        defaultPath: curFile.name || 'untitled',
        filters: [
            { name: tMain('mainMsg.filters.markdown'), extensions: ['md'] },
            { name: tMain('mainMsg.filters.word'), extensions: ['docx'] },
            { name: tMain('mainMsg.filters.text'), extensions: ['txt'] },
            { name: tMain('mainMsg.filters.html'), extensions: ['html', 'htm'] },
            { name: tMain('mainMsg.filters.json'), extensions: ['json'] },
            { name: tMain('mainMsg.filters.pdf'), extensions: ['pdf'] }
        ]
    })

    if (result.canceled || !result.filePath) {
        return
    }

    const filePath = result.filePath
    // P1-AS-1：另存为目标是用户在系统保存对话框中显式选择的路径，登记为受信路径后
    // 再做一次守卫校验（拒绝 UNC 共享根/设备路径等异常形态，正常对话框返回必然通过）
    registerTrustedPath(filePath)
    if (!isPathAllowed(filePath)) {
        notifyPathAccessDenied(filePath, 'mainMsg.status.operationFailed')
        return
    }
    const ext = path.extname(filePath).toLowerCase()
    const content = curFile.content

    try {
        switch (ext) {
            case '.md':
            case '.txt':
                // D-4：另存为时按当前文件编码写回
                await fs.writeFile(
                    filePath,
                    encodeFileContent(content ?? '', curFile.encoding || 'utf-8')
                )
                break

            case '.docx':
                // 导出为 Word 文档
                await fileExport.ToWord(currentContent, filePath)
                return

            case '.html':
            case '.htm':
                // 导出为 HTML 文件
                await fileExport.ToHtml(currentContent, filePath)
                return

            case '.json':
                // 导出为 JSON 文件
                await fileExport.ToJson(currentContent, filePath)
                return

            case '.pdf':
                // 导出为 PDF 文件
                await fileExport.ToPdf(currentContent, filePath)
                return

            default:
                showErrorMessageBox(tMain('mainMsg.file.unsupportedFormat', { ext }))
                return
        }

        // 更新当前文件信息（仅对 md 和 txt）
        appState.currentActiveFile = {
            name: path.basename(filePath),
            path: filePath,
            type: 'file',
            content: content,
            encoding: curFile.encoding || 'utf-8'
        }

        // D-1：另存为成功后重置脏标记
        appState.markSaved()
        // PF-17：另存为切换了活动文件路径，重新记录新文件的磁盘签名
        await refreshActiveFileDiskStamp(filePath)

        // 通知渲染进程
        sendToMainWindow(IPC.DIALOG.OPEN_VUE_DIALOG, 'message', {
            title: tMain('mainMsg.dialog.saveAsSuccessTitle'),
            type: 'success',
            message: tMain('mainMsg.dialog.saveAsSuccessMessage', { path: filePath })
        })
    } catch (err) {
        logger.error('文件另存为失败', filePath, err)
        sendToMainWindow(IPC.DIALOG.OPEN_VUE_DIALOG, 'message', {
            // FUN-16：另存为失败提示标题原误写为"另存为成功"，修正为"另存为失败"
            title: tMain('mainMsg.dialog.saveAsFailedTitle'),
            type: 'error',
            message: tMain('mainMsg.dialog.saveAsFailedMessage', { error: String(err) })
        })
    }
}

/**
 * 创建文件或文件夹
 * @param name 名称
 * @param dirPath 目录路径
 * @param isFolder 是否为文件夹
 * @param extension 文件扩展名
 */
export async function CreateFileFolder(
    name: string,
    dirPath: string,
    isFolder: boolean,
    extension: string
): Promise<void> {
    // P1-AS-1：目录必须在受信范围内、name/extension 必须通过文件名白名单
    // （渲染层原样传参，name 含 ..\\ 或路径分隔符可写出目标目录，见 AS-1 证据）
    if (!isPathAllowed(dirPath)) {
        notifyPathAccessDenied(dirPath, 'mainMsg.status.operationFailed')
        return
    }
    if (!isSafeFileName(name)) {
        notifyInvalidFileName(name)
        return
    }
    if (!isFolder && extension.length > 0 && !isSafeFileExtension(extension)) {
        logger.warn('[Security] 已拒绝非法文件扩展名（P1-AS-1）：', extension)
        notifyPathAccessDenied(extension, 'mainMsg.status.operationFailed')
        return
    }
    const baseDir = path.resolve(dirPath)
    const fullName = isFolder ? path.join(baseDir, name) : path.join(baseDir, name + extension)
    // 归一化后再次校验完整目标路径（防 name/. 组合导致的越界/设备路径）
    if (!isPathAllowed(fullName)) {
        notifyPathAccessDenied(fullName, 'mainMsg.status.operationFailed')
        return
    }
    if (isFolder) {
        try {
            await fs.access(fullName)
            showErrorMessageBox(tMain('mainMsg.file.alreadyExists', { path: fullName }))
        } catch {
            // PF-05：标记自身改目录，watcher 回环事件合并到下方 ScheduleReloadFromDisk
            beginSelfWrite()
            try {
                await fs.mkdir(fullName, { recursive: true })
            } finally {
                endSelfWrite()
            }
        }
    } else {
        // D-7/FUN-17：新建文件前检查同名文件是否已存在，存在则报错不覆盖
        try {
            await fs.access(fullName)
            showErrorMessageBox(tMain('mainMsg.file.alreadyExists', { path: fullName }))
            return
        } catch {
            // 文件不存在，继续创建
        }
        const lastIndex = name.lastIndexOf('.')
        let fileContent: string
        if (lastIndex === -1) {
            fileContent = '# ' + name + '\r\n'
        } else {
            const fileHeader = name.substring(0, lastIndex)
            fileContent = '# ' + fileHeader + '\r\n'
        }
        beginSelfWrite()
        try {
            await fs.writeFile(fullName, fileContent)
        } finally {
            endSelfWrite()
        }

        // 打开当前文件
        appState.currentActiveFile = {
            name: name,
            path: fullName,
            type: 'file',
            content: fileContent,
            encoding: 'utf-8'
        }
        // D-1：新建文件磁盘与内存内容一致，重置脏标记
        appState.markFileLoaded(fileContent)
        // PF-17：记录新文件的磁盘签名（写盘后 stat），避免下次目录刷新无谓重读
        await refreshActiveFileDiskStamp(fullName)
        // P2 非空断言治理：新建文件是异步流程，发送前窗口可能已销毁，统一安全发送
        sendToMainWindow(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT, fileContent)
        sendToMainWindow(IPC.FILE.USER_SELECT_FILE, fullName)
        // FUN-29：状态栏编码显示为 utf-8（新建文件统一 UTF-8 写入）
        sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
            message: tMain('mainMsg.status.fileCreatedUtf8'),
            type: 'success',
            encoding: 'utf-8'
        })
    }

    // 重新加载文件资源管理器
    // PF-05：统一走 ScheduleReloadFromDisk，合并同一批目录变更，避免事件风暴下重复全量重扫
    ScheduleReloadFromDisk()
}

/**
 * 打开选定的文件
 * @param fileProperties 文件属性
 */
export async function OpenSelectFile(fileProperties: FileProperties): Promise<void> {
    // P1-AS-1：FileProperties 来自渲染层 IPC 载荷，先做结构与路径范围校验。
    // 允许范围：工作区根、临时目录、用户经对话框选择过的路径（含最近打开历史）；
    // 越界（如 C:\\Windows\\win.ini、..\\.. 逃逸、UNC 共享根）只提示并 return，不改动任何状态。
    if (!fileProperties || typeof fileProperties !== 'object') {
        notifyPathAccessDenied('(invalid FileProperties)', 'mainMsg.status.openFileFailed')
        return
    }
    const requestedPath = (fileProperties as { path?: unknown }).path
    if (!isPathAllowed(requestedPath)) {
        notifyPathAccessDenied(requestedPath, 'mainMsg.status.openFileFailed')
        return
    }
    // 归一化后写回（折叠 ../ 与大小写差异），后续 stat/读取/落盘/保存历史均使用规范化绝对路径
    fileProperties.path = path.resolve(requestedPath as string)

    // 在打开新文件前,保存当前文件
    const currentFile = appState.currentActiveFile
    if (
        currentFile &&
        currentFile.path &&
        MARKDOWN_EXTENSIONS.some((extension) => currentFile.path.endsWith(extension))
    ) {
        // P1-AS-1：切换文件前的自动保存同样受路径约束（活动文件路径失效时跳过而非越权写盘）
        if (!isPathAllowed(currentFile.path)) {
            logger.warn('[Security] 已跳过越界活动文件的自动保存（P1-AS-1）：', currentFile.path)
        } else {
            try {
                // D-4：切换文件时按原编码写回
                const encoding = currentFile.encoding || 'utf-8'
                // PF-05：标记自身写盘，避免切换文件时的保存触发 watcher 回环刷新
                beginSelfWrite()
                try {
                    await fs.writeFile(
                        currentFile.path,
                        encodeFileContent(currentFile.content ?? '', encoding)
                    )
                } finally {
                    endSelfWrite()
                }
                appState.markSaved()
                // PF-17：切换前自动保存写盘后刷新旧文件签名（若随后取消打开，旧文件仍是活动文件，
                // 避免下一次目录刷新因旧签名而重复重读刚保存的内容）
                await refreshActiveFileDiskStamp(currentFile.path)
                logger.info('The file has been saved automatically', currentFile.path)
            } catch (err) {
                logger.error('Failed to automatically save the file', currentFile.path, err)
            }
        }
    }

    // 检测文件大小（PF-10：已知大小传给自适应读取，避免重复 stat）
    // PF-17：同时缓存 mtime，读取成功后作为当前文件的磁盘签名（避免再 stat 一次）
    let knownFileSize: number | undefined
    let knownFileMtimeMs: number | undefined
    try {
        const stats = await fs.stat(fileProperties.path)
        const fileSize = stats.size
        knownFileSize = fileSize
        knownFileMtimeMs = stats.mtimeMs

        if (fileSize > LARGE_FILE_THRESHOLD) {
            // 公共接口归位第 2 批：日志内联大小格式化改为 shared 的 formatFileSize
            logger.warn('Open Large File ', formatFileSize(fileSize), fileProperties.path)
            // FUN-30：大文件确认改为异步对话框，不再用 showMessageBoxSync 阻塞主进程；
            // 文案统一中文。注意：对话框文案模板 `largeFileMessage` 自带固定的 `MB`
            // 单位占位（`文件大小为 {size} MB`），因此这里仍传「MB 数值」，不能直接
            // 换成带单位的 formatFileSize（否则会输出「5.00 MB MB」）。
            const messageBoxOptions = {
                type: 'warning' as const,
                title: tMain('mainMsg.dialog.largeFileTitle'),
                message: tMain('mainMsg.dialog.largeFileMessage', {
                    size: (fileSize / 1024 / 1024).toFixed(2)
                }),
                buttons: [
                    tMain('mainMsg.dialog.largeFileContinue'),
                    tMain('mainMsg.dialog.cancel')
                ],
                defaultId: 0,
                cancelId: 1
            }
            // P2 非空断言治理：取存活主窗口作为对话框父窗口；窗口已销毁时退化为
            // 无父窗口对话框（Electron 支持无父窗口调用），避免 TypeError 崩溃主进程。
            const dialogWindow = getLiveMainWindow()
            const result = dialogWindow
                ? await dialog.showMessageBox(dialogWindow, messageBoxOptions)
                : await dialog.showMessageBox(messageBoxOptions)

            if (result.response === 1) {
                logger.info('用户取消打开大文件 ', fileProperties.path)
                return
            }
        }
    } catch (err) {
        logger.error('check file size failed ', fileProperties.path, err)
    }

    logger.info('loading file ', fileProperties.path)

    try {
        // D-4/FUN-02：先用 jschardet 探测文件编码，非 UTF-8 用 iconv-lite 转码读取；
        // 记录当前文件编码，保存时按原编码写回。
        // PF-10：按文件大小自适应读取——超过 5MB 阈值走 fs.createReadStream 分块解码，
        // 避免一次性 Buffer 峰值；本轮仍保持"单次 IPC 发送完整内容"（分块 IPC 协议、
        // 渲染端增量注入 Monaco 不在本轮范围，后续可在 ReadFileContentAdaptive 内扩展）。
        const decoded = await ReadFileContentAdaptive(fileProperties.path, {
            fileSize: knownFileSize
        })
        const data = decoded.content
        fileProperties.content = data
        fileProperties.encoding = decoded.encoding
        appState.currentActiveFile = fileProperties

        // D-1：以磁盘内容为基准重置脏标记
        appState.markFileLoaded(data)
        // PF-17：记录磁盘签名（复用打开前的 stat 结果；stat 失败时补一次 stat，失败则置空）
        if (knownFileMtimeMs !== undefined && knownFileSize !== undefined) {
            rememberActiveFileDiskStamp(fileProperties.path, {
                mtimeMs: knownFileMtimeMs,
                size: knownFileSize
            })
        } else {
            await refreshActiveFileDiskStamp(fileProperties.path)
        }

        // FUN-29：空文件保持空内容展示（不再注入 '\r\n' 污染空文件）
        logger.info(
            'File loaded successfully',
            fileProperties.path,
            decoded.streamed ? '(streamed)' : ''
        )
        sendToMainWindow(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT, data)
        sendToMainWindow(IPC.FILE.USER_SELECT_FILE, fileProperties.path)
        // FUN-29：状态栏编码显示实际编码（探测结果）
        sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
            message: tMain('mainMsg.status.fileOpened', { encoding: decoded.encoding }),
            type: 'success',
            encoding: decoded.encoding
        })
        saveLastOpenedFile(fileProperties.path)
        // P1-AS-1：成功打开即把该路径纳入本次会话受信集合——切换工作区后，
        // 重新从「最近文件」打开/保存同一文件不会因 rootPath 变化而被误拒
        registerTrustedPath(fileProperties.path)
    } catch (err) {
        logger.error('File loading failed', fileProperties.path, err)
        // PF-10：读取失败/流式半途错误给出清晰中文提示（状态栏），不再静默失败
        sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
            message: tMain('mainMsg.status.openFileFailed', {
                message: (err as Error)?.message || String(err)
            }),
            type: 'error'
        })
    }
}

/**
 * FUN-02：按指定编码重新打开当前文件（编码菜单"以指定编码打开"）。
 * 复用 decodeFileContent 的 preferredEncoding 参数按指定编码解码，
 * 更新 appState 当前文件内容与编码，并同步编辑器与状态栏。
 * PF-10：大文件同样走流式读取（preferredEncoding 透传）。
 */
export async function ReopenActiveFileWithEncoding(encoding: string): Promise<void> {
    const curFile = appState.currentActiveFile
    if (!curFile || !curFile.path) {
        throw new Error(tMain('mainMsg.file.noActiveFileReopen'))
    }
    // P1-AS-1：读盘前校验活动文件路径仍在受信范围内（受控错误 + 状态栏提示，不崩溃）
    if (!isPathAllowed(curFile.path)) {
        notifyPathAccessDenied(curFile.path, 'mainMsg.status.openFileFailed')
        throw new PathAccessDeniedError(curFile.path)
    }
    const { content, encoding: normalized } = await ReadFileContentAdaptive(curFile.path, {
        preferredEncoding: encoding
    })
    curFile.content = content
    curFile.encoding = normalized
    appState.markFileLoaded(content)
    // PF-17：按指定编码重读后刷新磁盘签名（磁盘未变，但保证签名与当前读取结果对应）
    await refreshActiveFileDiskStamp(curFile.path)
    // P2 非空断言治理：读盘完成后窗口可能已销毁，统一安全发送
    sendToMainWindow(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT, content)
    sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
        message: tMain('mainMsg.status.reopenedWithEncoding', { encoding: normalized }),
        type: 'success',
        encoding: normalized
    })
}

/**
 * FUN-02：把当前文件内容按指定编码转码并写盘（编码菜单"转换编码"）。
 * 复用 encodeFileContent 纯函数；成功后更新当前文件编码与保存快照。
 */
export async function ConvertActiveFileEncoding(encoding: string): Promise<void> {
    const curFile = appState.currentActiveFile
    if (!curFile || !curFile.path) {
        throw new Error(tMain('mainMsg.file.noActiveFileConvert'))
    }
    // P1-AS-1：转码写盘前校验活动文件路径仍在受信范围内
    if (!isPathAllowed(curFile.path)) {
        notifyPathAccessDenied(curFile.path, 'mainMsg.status.saveFailed')
        throw new PathAccessDeniedError(curFile.path)
    }
    const normalized = normalizeEncoding(encoding)
    const buffer = encodeFileContent(curFile.content ?? '', normalized)
    // PF-05：标记自身写盘（转码不改变目录树），抑制 watcher 回环刷新
    beginSelfWrite()
    try {
        await fs.writeFile(curFile.path, buffer)
    } finally {
        endSelfWrite()
    }
    curFile.encoding = normalized
    appState.markSaved()
    // PF-17：转码写盘后刷新磁盘签名（磁盘字节已变化）
    await refreshActiveFileDiskStamp(curFile.path)
    logger.info('The file has been converted and saved', curFile.path, normalized)
    BrowserWindow.getAllWindows().forEach((window: Electron.BrowserWindow) => {
        window.webContents.send(IPC.EVENTS.FILE_SAVED_SUCCESS)
    })
    // P2 非空断言治理：写盘完成后窗口可能已销毁，统一安全发送
    sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
        message: tMain('mainMsg.status.convertedEncoding', { encoding: normalized }),
        type: 'success',
        encoding: normalized
    })
}

/**
 * 打开文件对话框
 * @param mainWindow 主窗口
 */
export async function OpenFile(mainWindow: BrowserWindow): Promise<void> {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [{ name: 'Markdown Files', extensions: ['md'] }]
        })
        if (result.canceled) return
        const selectedPath = result.filePaths[0]
        // P1-AS-1：对话框返回值是用户显式选择，登记为受信精确文件（单文件模式可位于工作区外）；
        // 同时让打开单个文件后同目录的图片写入/新建等操作可用（活动文件目录派生受信根）
        registerTrustedPath(selectedPath)
        const fileProperties: FileProperties = {
            name: ParserFileName(selectedPath),
            path: selectedPath,
            type: 'file',
            content: ''
        }
        await OpenSelectFile(fileProperties)
    } catch (err) {
        logger.error('Error reading file:', err)
    }
}

/**
 * 创建文件
 * @param dirPath 目录路径
 * @param name 文件名
 * @param extension 扩展名
 */
export async function CreateFile(dirPath: string, name: string, extension: string): Promise<void> {
    // P1-AS-1：目录/文件名/扩展名白名单校验（原实现直接字符串拼接渲染层入参）
    if (!isPathAllowed(dirPath)) {
        notifyPathAccessDenied(dirPath, 'mainMsg.status.operationFailed')
        return
    }
    if (!isSafeFileName(name) || !isSafeFileExtension(extension)) {
        notifyInvalidFileName(name)
        return
    }
    const fullName = path.join(path.resolve(dirPath), name + extension)
    if (!isPathAllowed(fullName)) {
        notifyPathAccessDenied(fullName, 'mainMsg.status.operationFailed')
        return
    }
    // FUN-29：磁盘内容为空（只写一次空内容），内存内容同样为空，
    // 保存快照同步为空——三者一致，杜绝"自动保存把标题写进文件"的历史缺陷。
    // PF-05：标记自身写盘，watcher 回环事件合并到下方 ScheduleReloadFromDisk
    beginSelfWrite()
    try {
        await fs.writeFile(fullName, '')
    } finally {
        endSelfWrite()
    }

    // PF-05：统一走 ScheduleReloadFromDisk，同一批目录变更只触发一次全量刷新
    ScheduleReloadFromDisk()

    appState.currentActiveFile = {
        name: name,
        path: fullName,
        type: 'file',
        content: '',
        encoding: 'utf-8'
    }
    appState.markFileLoaded('')
    // PF-17：记录新文件的磁盘签名（写盘后 stat），避免下次目录刷新无谓重读
    await refreshActiveFileDiskStamp(fullName)
    // P2 非空断言治理：建文件是异步流程，发送前窗口可能已销毁，统一安全发送
    sendToMainWindow(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT, '')
    sendToMainWindow(IPC.FILE.USER_SELECT_FILE, fullName)
    sendToMainWindow(IPC.EVENTS.STATUS_BAR_UPDATE, {
        message: tMain('mainMsg.status.fileCreatedUtf8'),
        type: 'success',
        encoding: 'utf-8'
    })
}

/**
 * 打开目录对话框
 * @param mainWindow 主窗口
 */
export async function OpenDirectory(mainWindow: BrowserWindow): Promise<void> {
    try {
        const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        if (result.canceled) return

        const selectedDirectory = result.filePaths[0]
        // P1-AS-1：对话框返回目录 = 用户显式选择，登记为受信目录子树；
        // 工作区根合法性仍由 ReloadDirFromDisk 的形状校验兜底
        registerTrustedDirectory(selectedDirectory)
        // P1-1：原生目录选择器结果 = 用户显式确认 → 登记为受信工作区根（realpath 归一化），
        // 状态栏/欢迎页「最近文件夹」等入口据此判定来源合法性
        await approveWorkspaceRoot(selectedDirectory)

        mainWindow.webContents.send(IPC.FILE.CLEAR_EDITOR_PREVIEW)

        // PF-05：目录切换前先关闭旧目录的 watcher（ReloadDirFromDisk 内会为新目录重新建立监听）
        stopDirectoryWatcher()
        appState.rootPath = selectedDirectory
        await ReloadDirFromDisk()

        saveLastOpenedDirectory(selectedDirectory)

        // P1-1：最近文件夹由主进程自行维护（渲染层 config:write('recent-folders') 已拒绝）；
        // 放在目录树刷新之后，写入失败仅记日志、不影响目录打开主流程
        try {
            await recordRecentFolderFromProvider(selectedDirectory)
        } catch (recordError) {
            logger.warn('[FileOperations] 更新最近文件夹历史失败（不影响打开）:', recordError)
        }
    } catch (err) {
        // FUN-27：用户可见提示统一中文
        showErrorMessageBox(tMain('mainMsg.file.openDirectoryDialogFailed', { error: String(err) }))
    }
}

/**
 * 获取选定的目录
 * @param mainWindow 主窗口
 * @param cb 回调函数
 */
export function GetSelectDir(mainWindow: BrowserWindow, cb: (path: string | null) => void): void {
    dialog
        .showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        })
        .then((result) => {
            if (result.canceled) {
                cb(null)
            } else {
                const selectedDirectory = result.filePaths[0]
                // P1-AS-1：用户经目录选择框显式选择 → 登记为受信目录子树
                registerTrustedDirectory(selectedDirectory)
                cb(selectedDirectory)
            }
        })
        .catch((err) => {
            // FUN-27：用户可见提示统一中文
            showErrorMessageBox(
                tMain('mainMsg.file.openDirectoryDialogFailed', { error: String(err) })
            )
            cb(null)
        })
}

/**
 * 创建目录
 * @param dirPath 目录路径
 * @param name 目录名
 */
export async function CreateDirectory(dirPath: string, name: string): Promise<void> {
    // P1-AS-1：目录/名称白名单校验
    if (!isPathAllowed(dirPath)) {
        notifyPathAccessDenied(dirPath, 'mainMsg.status.operationFailed')
        return
    }
    if (!isSafeFileName(name)) {
        notifyInvalidFileName(name)
        return
    }
    const fullName = path.join(path.resolve(dirPath), name)
    if (!isPathAllowed(fullName)) {
        notifyPathAccessDenied(fullName, 'mainMsg.status.operationFailed')
        return
    }
    try {
        await fs.access(fullName)
        showErrorMessageBox(tMain('mainMsg.file.alreadyExists', { path: fullName }))
    } catch {
        // PF-05：标记自身改目录，watcher 回环事件合并到下方 ScheduleReloadFromDisk
        beginSelfWrite()
        try {
            await fs.mkdir(fullName, { recursive: true })
        } finally {
            endSelfWrite()
        }
    }

    // PF-05：统一走 ScheduleReloadFromDisk，同一批目录变更只触发一次全量刷新
    ScheduleReloadFromDisk()
}

/**
 * 重命名文件或文件夹
 * @param name 原名称
 * @param newName 新名称
 * @param isFile 是否为文件
 */
export async function Rename(name: string, newName: string, isFile: boolean): Promise<void> {
    await RenameFileFolder(name, newName, isFile)
}

/**
 * 删除文件或文件夹
 * @param name 名称
 * @param isFile 是否为文件
 */
export async function Delete(name: string, isFile: boolean): Promise<void> {
    await DeleteFileFolder(name, isFile)
}

/**
 * 重命名文件或文件夹（内部实现）
 * @param name 原名称
 * @param newName 新名称
 * @param isFile 是否为文件
 */
async function RenameFileFolder(name: string, newName: string, isFile: boolean): Promise<void> {
    // P1-AS-1：源路径必须在受信范围；newName 必须通过文件名白名单（防 ../ 逃逸到目录外）
    if (!isPathAllowed(name)) {
        notifyPathAccessDenied(name, 'mainMsg.status.operationFailed')
        return
    }
    if (!isSafeFileName(newName)) {
        notifyInvalidFileName(newName)
        return
    }
    const dirPath = ParseDirectoryPath(name)
    let newFullPath: string
    if (!isFile) {
        newFullPath = path.join(dirPath, newName)
    } else {
        const extension = name.substring(name.lastIndexOf('.'))
        newFullPath = path.join(dirPath, newName + extension)
    }
    // 目标路径同样校验（目录解析/点号等历史边界行为下仍保证不逃逸受信根）
    if (!isPathAllowed(newFullPath)) {
        notifyPathAccessDenied(newFullPath, 'mainMsg.status.operationFailed')
        return
    }

    // PF-05：标记自身改目录，watcher 回环事件合并到下方 ScheduleReloadFromDisk
    beginSelfWrite()
    try {
        await fs.rename(name, newFullPath)
    } finally {
        endSelfWrite()
    }

    // PF-05：统一走 ScheduleReloadFromDisk，同一批目录变更只触发一次全量刷新
    ScheduleReloadFromDisk()

    if (isFile) {
        const fileProperties: FileProperties = {
            name: ParserFileName(newFullPath),
            path: newFullPath,
            type: 'file',
            content: ''
        }
        await OpenSelectFile(fileProperties)
    }
}

/**
 * 删除文件或文件夹（内部实现）
 * @param name 名称
 * @param isFile 是否为文件
 */
async function DeleteFileFolder(name: string, isFile: boolean): Promise<void> {
    // P1-AS-1：删除目标必须在受信范围内，越界直接提示并 return（不触碰文件系统）
    if (!isPathAllowed(name)) {
        notifyPathAccessDenied(name, 'mainMsg.status.operationFailed')
        return
    }
    // PF-05：标记自身改目录，watcher 回环事件合并到下方 ScheduleReloadFromDisk
    beginSelfWrite()
    try {
        if (!isFile) {
            try {
                await fs.rm(name, { recursive: true })
            } catch (err) {
                // FE-32：删除失败统一映射中文原因（未知错误保留原文+错误码），不再直出英文原始错误
                showErrorMessageBox(
                    tMain('mainMsg.file.deleteFailed', { message: DescribeFileSystemError(err) })
                )
            }
        } else {
            try {
                await fs.unlink(name)
            } catch (err) {
                showErrorMessageBox(
                    tMain('mainMsg.file.deleteFailed', { message: DescribeFileSystemError(err) })
                )
            }
        }
    } finally {
        endSelfWrite()
    }

    // PF-05：统一走 ScheduleReloadFromDisk，同一批目录变更只触发一次全量刷新
    ScheduleReloadFromDisk()
}

/**
 * 在资源管理器中显示文件位置
 * @param filePath 文件路径
 */
export function OpenFolderExplorer(filePath: string): void {
    // P1-AS-1/AS-8：资源管理器定位同样是文件系统信息暴露面（可探测任意路径是否存在），
    // 仅允许受信范围内的路径；越界时状态栏提示并 return。
    if (!isPathAllowed(filePath)) {
        notifyPathAccessDenied(filePath, 'mainMsg.status.operationFailed')
        return
    }
    if (filePath.lastIndexOf('.') === -1) {
        // 第 4 批 P3 清理：原手写 `Math.max(lastIndexOf('//'), lastIndexOf('\\')) + substring`
        // （'//' 为历史笔误，单个正斜杠路径算不出父目录）统一改用 Node `path.dirname`；
        // Windows 下 `\` 与 `/` 分隔符行为一致，POSIX 下由 path 模块按平台语义处理。
        shell.showItemInFolder(path.dirname(filePath))
    } else {
        shell.showItemInFolder(filePath)
    }
}

/* ==================== CQ-7：拆分后保持公开 API / import 路径不变 ==================== */
// 路径工具（原文件即 re-export，调用方仍从 './file-operations' 或 file-utils/index 引用）
export {
    GetCurrentFileDirectory,
    ParseDirectoryPath,
    ParserFileName,
    SelectDirectory
} from './path-utils'

// 内部使用但需要被外部引用的重命名/删除实现
export { DeleteFileFolder, RenameFileFolder }

// 目录树遍历 / 目录监听 / 目录刷新（实现已迁移到 directory-tree.ts）
export {
    CleanupDirectoryWatch,
    DegradeDirectoryWatch,
    GetDirectoryReloadStats,
    GetDirectoryWatchStatus,
    ReloadDirFromDisk,
    ScheduleReloadFromDisk,
    TraverseDirectory
} from './directory-tree'
export type {
    DirectoryReloadStats,
    DirectoryWatchStatus,
    ReloadDirFromDiskOptions
} from './directory-tree'

// 编码探测 / 读写转换（实现已迁移到 file-encoding.ts）
export {
    decodeFileContent,
    DescribeFileSystemError,
    encodeFileContent,
    normalizeEncoding,
    ReadFileContentAdaptive
} from './file-encoding'
export type { AdaptiveReadOptions, AdaptiveReadResult } from './file-encoding'

// 路径守卫提示（实现已迁移到 shared.ts）
export { notifyPathAccessDenied } from './shared'
