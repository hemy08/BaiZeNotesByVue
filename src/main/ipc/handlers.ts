/**
 * IPC 处理器模块
 * 集中管理主进程的所有 IPC 处理函数
 *
 * MEM-10：全部 ipcMain 直连注册迁移至 ipcListenerManager 统一管理：
 * - ipcMain.on 通道 → ipcListenerManager.registerOnce（全局一次性注册，防 ARC-06 重复注册）；
 * - ipcMain.handle 通道 → ipcListenerManager.registerHandleOnce（重复 handle 时跳过而非抛错）；
 * - 模块级副作用注册（dialog-broadcast-theme）同样经管理器登记，纳入库存清单。
 *
 * CQ-05：异步 ipcMain.on 回调统一 try/catch（logger.error + 状态栏通道提示），
 * 会抛错的 ipcMain.handle 通道补错误日志（异常语义不变，仍抛给 invoke 调用方）。
 */

import { BrowserWindow, dialog } from 'electron'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { HandleBaiZeMenuAction } from './menu-handle'
import { getMonacoThemeData } from '../config'
import { getEditorSetting } from '../config'
// P1-FE-04：快捷链接设置保存（渲染层设置对话框 → 主进程 quickLinks 唯一数据源）
import { normalizeQuickLinkItems, saveQuickLinks } from '../config/quick-link-config'
import {
    CreateFileFolder,
    GetCurrentFileDirectory,
    SelectDirectory,
    StartAutoSaveFileTime,
    StopAutoSaveFileTime,
    ReloadDirFromDisk,
    OpenSelectFile,
    ParserFileName
} from '../utils/file-utils'
import { ImportCreateNewFile } from '../utils/file-utils'
import { saveLastOpenedDirectory } from '../utils/file-state'
import { appState } from '../utils/app-state'
import { ipcListenerManager } from './ipc-listener-manager'
// P1/N-05：IPC 发送方授权校验（主窗口 webContents 归属判定）
import { setTrustedMainWindow, withSenderCheck } from '../utils/ipc-security'
// AS-2：工作区根目录校验公共实现（P2-6：提取到 utils/workspace-root 供启动恢复复用）
import { validateWorkspaceRoot } from '../utils/workspace-root'
// P1-AS-1：对话框选择路径登记（受信来源）——欢迎页打开的单文件/目录可能在工作区外，
// 登记后 file-operations 的路径守卫（security.ts）才会允许读取（task-13/task-15 交接）。
import {
    isPathAllowed,
    isSafeFileName,
    registerTrustedDirectory,
    registerTrustedPath
} from '../utils/security'
import { IPC } from '../../shared/ipc-channels'
// ARC-13：FileProperties 已收敛到 src/shared/types/file.ts（唯一真源）
import type { FileProperties } from '../../shared/types'
import { tMain } from '../utils/i18n'
import { logger } from '../utils/logger'

// MEM-10：本模块所有注册均归属的组件 ID（进程级全局注册）
const GLOBAL_IPC_COMPONENT_ID = 'global-ipc-handlers'

/**
 * CQ-05：异步 ipcMain.on 回调异常兜底——主进程留错误日志，并经现有状态栏通道
 * （status-bar-console-update，见 logger.ts / file-operations.ts 同款用法）
 * 向渲染层提示，避免 rejection 变成 unhandledRejection 后静默丢失。
 */
function notifyIpcAsyncError(mainWindow: BrowserWindow, channel: string, error: unknown): void {
    logger.error(`[IPC] 通道 "${channel}" 异步处理失败:`, error)
    try {
        // 窗口已销毁或（测试桩）缺少 isDestroyed 时跳过提示，不影响主流程
        if (typeof mainWindow.isDestroyed === 'function' && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.operationFailed', {
                    message: error instanceof Error ? error.message : String(error)
                }),
                type: 'error'
            })
        }
    } catch (notifyError) {
        logger.error('[IPC] 状态栏错误提示发送失败:', notifyError)
    }
}

/**
 * CQ-05：invoke/handle 通道错误日志包装——保持"异常抛给渲染层 invoke 调用方"
 * 的语义（调用方可 try/catch），仅在主进程补一条带通道名的错误日志，避免失败静默。
 */
function withHandleErrorLog<TArgs extends unknown[]>(
    channel: string,
    handler: (...args: TArgs) => unknown
): (...args: TArgs) => Promise<unknown> {
    return async (...args: TArgs) => {
        try {
            return await handler(...args)
        } catch (error) {
            logger.error(`[IPC] 通道 "${channel}" 处理失败:`, error)
            throw error
        }
    }
}

/* ============================================================================
 * AS-6：窗口 bounds 数值校验（防 NaN/字符串/超大值导致 setBounds 抛错或窗口移出屏幕）
 * ========================================================================== */

/** 窗口坐标绝对值上限（覆盖多显示器/超宽屏，同时挡住 1e9 级异常值） */
export const WINDOW_COORDINATE_LIMIT = 100000
/** 窗口尺寸上限/下限（下限取 1：真正的可用尺寸由渲染层拖拽约束与系统窗口管理器决定） */
export const WINDOW_MIN_SIZE = 1
export const WINDOW_MAX_SIZE = 32768

/** AS-6：合法窗口坐标——有限整数且绝对值不超过上限 */
export function isValidWindowCoordinate(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Number.isInteger(value) &&
        Math.abs(value) <= WINDOW_COORDINATE_LIMIT
    )
}

/** AS-6：合法窗口尺寸——有限整数且在 [WINDOW_MIN_SIZE, WINDOW_MAX_SIZE] 内 */
export function isValidWindowSize(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isFinite(value) &&
        Number.isInteger(value) &&
        value >= WINDOW_MIN_SIZE &&
        value <= WINDOW_MAX_SIZE
    )
}

/**
 * FE-01：欢迎页 → 主界面的数据事件时序修复。
 *
 * 渲染层 App.vue 用 `v-if="showWelcome"` 切换界面，主界面组件（编辑器、资源管理器、
 * 状态栏）只有在收到 WELCOME_ENTER_MAIN 之后才会在 Vue 挂载周期里注册 IPC 监听器。
 * 旧实现先发送 CLEAR_EDITOR_PREVIEW / FILE_SYSTEM_DATA / SHOW_SELECTED_FILE_CONTEXT
 * 等数据事件、最后才发送 WELCOME_ENTER_MAIN：数据事件在监听器注册前到达而被丢弃，
 * 表现为首次从欢迎页打开文件/文件夹后编辑器与目录树空白，并存在用空内容覆盖原文件的
 * 数据丢失风险（P0-FE-01）。
 *
 * 修复策略（主进程最小改动）：先 send WELCOME_ENTER_MAIN，再在下一个事件循环 tick
 * （setImmediate）发送数据事件。Vue 挂载在渲染层处理 WELCOME_ENTER_MAIN 后的微任务中
 * 完成（onMounted 注册监听器），setImmediate 只让出主进程一个 tick，确保
 * WELCOME_ENTER_MAIN 已投递后再发数据；不使用固定 sleep，额外延迟通常 < 1 ms，
 * 远低于 500 ms 上限。
 */
/**
 * 启动恢复流程（src/main/utils/startup-restore.ts）复用的同一投递时序：
 * 先 send WELCOME_ENTER_MAIN，再在下一个事件循环 tick 发送数据事件。
 */
export function runAfterMainViewEntered(task: () => Promise<void> | void): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        setImmediate(() => {
            void (async () => {
                try {
                    await task()
                    resolve()
                } catch (error) {
                    reject(error)
                }
            })()
        })
    })
}

/** AS-2：拒绝非法工作区根目录时记录安全日志并经状态栏提示，不执行目录遍历 */
function notifyWorkspaceRootRejected(
    mainWindow: BrowserWindow,
    channel: string,
    reason: string,
    rejectedPath: unknown
): void {
    logger.warn(`[Security] 已拒绝 ${channel} 的工作区根目录（${reason}）：`, rejectedPath)
    try {
        // 窗口已销毁或（测试桩）缺少 isDestroyed 时跳过提示，不影响主流程
        if (typeof mainWindow.isDestroyed === 'function' && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain('mainMsg.status.operationFailed', {
                    message: `工作区目录无效：${reason}`
                }),
                type: 'error'
            })
        }
    } catch (error) {
        logger.error('[Security] 工作区根目录拒绝提示发送失败:', error)
    }
}

/* ============================================================================
 * P1-FE-03：插入图片对话框「本地文件」浏览
 *
 * 背景：InsertImageDialog 的本地文件路径输入框为 readonly，唯一填值途径是
 * 「浏览」按钮 emit('browseFile')；原实现父组件未绑定该事件、主进程也没有
 * 「选择图片」能力，导致本地图片插入完全不可用（路径永远为空、插入按钮禁用）。
 *
 * 修复：新增 IPC.FILE.SELECT_IMAGE（handle + sender 校验），主进程弹出系统
 * 图片选择框并把用户选择登记为受信路径；随后尽力把图片复制到当前文档同目录的
 * images/（与粘贴图片的 IPC.RENDER.INSERT_IMAGE 落盘位置一致），返回可直接写入
 * Markdown 的相对引用 `./images/<name>.<ext>`；无活动文件或复制失败时回退为选中
 * 图片的绝对路径（保留对话框原有「插入路径文本」语义，不阻断插入）。
 * ========================================================================== */

/** 图片选择框允许的扩展名（与 InsertImageDialog 支持的网络图片格式一致） */
const IMAGE_FILE_EXTENSIONS: string[] = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']

/** 允许复制的图片扩展名（小写带点；扩展名不在白名单时按 .png 处理） */
const ALLOWED_IMAGE_EXTENSIONS: ReadonlySet<string> = new Set(
    IMAGE_FILE_EXTENSIONS.map((extension) => `.${extension}`)
)

/** SELECT_IMAGE 通道返回结构（渲染层按此回填插入图片对话框） */
interface SelectImageResult {
    /** 用户是否取消了选择 */
    canceled: boolean
    /** 选中图片的绝对路径；取消时为 null */
    filePath: string | null
    /** 写入 Markdown 的图片地址：复制到 images/ 后为相对引用，回退时为绝对路径；取消时为 null */
    imageSrc: string | null
}

/**
 * 生成复制到 images/ 下的安全文件名：中文等非 ASCII 字符替换为 '-'，
 * 追加时间戳 + 随机后缀避免同名覆盖；扩展名沿用原图片格式（白名单外回退 .png）。
 */
function buildLocalImageFileName(sourcePath: string): string {
    const rawExtension = path.extname(sourcePath).toLowerCase()
    const extension = ALLOWED_IMAGE_EXTENSIONS.has(rawExtension) ? rawExtension : '.png'
    const rawBaseName = path.basename(sourcePath, path.extname(sourcePath))
    const safeBaseName =
        rawBaseName
            .replace(/[^A-Za-z0-9_-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 40) || 'image'
    const uniqueSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
    const fileName = `${safeBaseName}-${uniqueSuffix}${extension}`
    return isSafeFileName(fileName) ? fileName : `image-${uniqueSuffix}${extension}`
}

/**
 * 复制本地图片到当前活动文件同目录的 images/，返回 Markdown 相对引用。
 * 无活动文件、目标目录不在受信路径范围或复制失败时返回 null（调用方回退绝对路径）。
 */
async function copyLocalImageToImagesDir(sourcePath: string): Promise<string | null> {
    try {
        const activeFile = appState.currentActiveFile
        if (!activeFile || typeof activeFile.path !== 'string' || activeFile.path.length === 0) {
            return null
        }
        const imagesDirectory = path.join(path.dirname(path.resolve(activeFile.path)), 'images')
        // P1-AS-1：图片写入必须位于受信范围（活动文件目录/工作区/临时目录/对话框选择路径）
        if (!isPathAllowed(imagesDirectory)) {
            logger.warn('[Security] 已拒绝写入不受信的图片目录：', imagesDirectory)
            return null
        }
        await fs.promises.mkdir(imagesDirectory, { recursive: true })
        const fileName = buildLocalImageFileName(sourcePath)
        await fs.promises.copyFile(sourcePath, path.join(imagesDirectory, fileName))
        return `./images/${fileName}`
    } catch (error) {
        // 复制失败不阻断插入：调用方回退为选中图片的绝对路径
        logger.error('[IPC] 本地图片复制到 images 目录失败:', error)
        return null
    }
}

/**
 * 弹出图片选择框并准备插入所需的路径信息。
 * 选中的图片经系统对话框（用户显式选择）登记为受信路径，供路径守卫放行后续读取。
 */
async function selectLocalImageFile(mainWindow: BrowserWindow): Promise<SelectImageResult> {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openFile'],
        filters: [{ name: 'Images', extensions: IMAGE_FILE_EXTENSIONS }]
    })
    if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, filePath: null, imageSrc: null }
    }
    const filePath = result.filePaths[0]
    registerTrustedPath(filePath)
    const copiedImageSrc = await copyLocalImageToImagesDir(filePath)
    return {
        canceled: false,
        filePath,
        imageSrc: copiedImageSrc ?? filePath
    }
}

/**
 * 注册所有 IPC 处理器
 * @param mainWindow 主窗口实例
 */
export function registerIpcHandlers(mainWindow: BrowserWindow): void {
    // P1/N-05：注册即把该窗口登记为受信主窗口（index.ts 在 createWindow 中已调用
    // setMainWindow 同步；此处再同步一次，保证单测/异常启动顺序下 sender 校验有依据）
    setTrustedMainWindow(mainWindow)

    // 窗口控制 IPC
    // AS-6：窗口控制通道此前无 sender 校验——窗口是主窗口唯一 UI 载体，一律只接受
    // 主窗口发送方（handle 通道拒绝时返回统一错误对象）。
    ipcListenerManager.registerOnce(
        IPC.WINDOW.MINIMIZE,
        withSenderCheck(IPC.WINDOW.MINIMIZE, () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.minimize()
        }),
        GLOBAL_IPC_COMPONENT_ID
    )
    ipcListenerManager.registerOnce(
        IPC.WINDOW.MAXIMIZE,
        withSenderCheck(IPC.WINDOW.MAXIMIZE, () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.maximize()
        }),
        GLOBAL_IPC_COMPONENT_ID
    )
    ipcListenerManager.registerOnce(
        IPC.WINDOW.CLOSE,
        withSenderCheck(IPC.WINDOW.CLOSE, () => {
            if (mainWindow && !mainWindow.isDestroyed()) mainWindow.close()
        }),
        GLOBAL_IPC_COMPONENT_ID
    )
    ipcListenerManager.registerOnce(
        IPC.WINDOW.TOGGLE_MAXIMIZE,
        withSenderCheck(IPC.WINDOW.TOGGLE_MAXIMIZE, () => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize()
            } else {
                mainWindow.maximize()
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )
    ipcListenerManager.registerHandleOnce(
        IPC.WINDOW.GET_BOUNDS,
        withSenderCheck(
            IPC.WINDOW.GET_BOUNDS,
            () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    return mainWindow.getBounds()
                }
                return null
            },
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )
    ipcListenerManager.registerHandleOnce(
        IPC.WINDOW.IS_MAXIMIZED,
        withSenderCheck(
            IPC.WINDOW.IS_MAXIMIZED,
            () => {
                if (mainWindow && !mainWindow.isDestroyed()) {
                    return mainWindow.isMaximized()
                }
                return false
            },
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )
    // CQ-14：START_DRAG 是"拖动开始"的历史握手通道，主进程无需处理——窗口拖动由
    // 渲染层 useWindowManagement.ts 在 mousedown 后自行计算坐标，经 WINDOW.MOVE
    // 下发 setBounds 完成。渲染层仍在发送本通道，故保留空 handler 消费频道；
    // 若删除发送点，可连同本注册一并移除。
    ipcListenerManager.registerOnce(
        IPC.WINDOW.START_DRAG,
        withSenderCheck(IPC.WINDOW.START_DRAG, () => {
            void 0
        }),
        GLOBAL_IPC_COMPONENT_ID
    )
    // AS-6：MOVE/SET_SIZE 增加数值类型/范围校验 + setBounds 异常兜底——
    // 渲染层传 NaN/字符串/超大值时不再抛未捕获异常，也不会把窗口移出屏幕外无法恢复。
    ipcListenerManager.registerOnce(
        IPC.WINDOW.MOVE,
        withSenderCheck(IPC.WINDOW.MOVE, (_, x: unknown, y: unknown) => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            if (!isValidWindowCoordinate(x) || !isValidWindowCoordinate(y)) {
                logger.warn('[IPC] 已拒绝非法窗口坐标（AS-6）：', x, y)
                return
            }
            try {
                const [currentWidth, currentHeight] = mainWindow.getSize()
                mainWindow.setBounds({ x, y, width: currentWidth, height: currentHeight })
            } catch (error) {
                logger.warn('[IPC] 应用窗口坐标失败（已忽略）：', error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )
    ipcListenerManager.registerOnce(
        IPC.WINDOW.SET_SIZE,
        withSenderCheck(IPC.WINDOW.SET_SIZE, (_, width: unknown, height: unknown) => {
            if (!mainWindow || mainWindow.isDestroyed()) return
            if (!isValidWindowSize(width) || !isValidWindowSize(height)) {
                logger.warn('[IPC] 已拒绝非法窗口尺寸（AS-6）：', width, height)
                return
            }
            try {
                const [x, y] = mainWindow.getPosition()
                mainWindow.setBounds({ x, y, width, height })
            } catch (error) {
                logger.warn('[IPC] 应用窗口尺寸失败（已忽略）：', error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // P1/N-05：菜单动作为高风险通道（可触发文件读写/外部链接/对话框），仅主窗口可信
    ipcListenerManager.registerOnce(
        IPC.MENU.ACTION,
        withSenderCheck(IPC.MENU.ACTION, (_, action) => {
            HandleBaiZeMenuAction(action, mainWindow)
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // 打开特定文件夹（欢迎页「最近文件夹」入口）
    // CQ-05：async on 回调补 try/catch，失败经状态栏提示，避免 unhandledRejection
    // AS-2：渲染层传入的 folderPath 不再直接作为工作区根——先做绝对路径/存在性/目录性/
    // 危险根（磁盘根、系统目录、用户主目录等）校验，非法路径仅状态栏提示并 return，
    // 避免被注入的渲染层把根目录指向任意路径后递归遍历整树回传（DoS/信息泄露）。
    ipcListenerManager.registerOnce(
        IPC.FILE.OPEN_SPECIFIC_FOLDER,
        withSenderCheck(IPC.FILE.OPEN_SPECIFIC_FOLDER, async (_, folderPath: string) => {
            try {
                const validation = await validateWorkspaceRoot(folderPath)
                if (!validation.ok) {
                    notifyWorkspaceRootRejected(
                        mainWindow,
                        IPC.FILE.OPEN_SPECIFIC_FOLDER,
                        validation.reason,
                        folderPath
                    )
                    return
                }
                mainWindow.webContents.send(IPC.FILE.CLEAR_EDITOR_PREVIEW)
                appState.rootPath = validation.path
                await ReloadDirFromDisk()
                saveLastOpenedDirectory(validation.path)
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.FILE.OPEN_SPECIFIC_FOLDER, error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // 欢迎界面 - 打开文件夹
    ipcListenerManager.registerOnce(
        IPC.FILE.WELCOME_OPEN_DIRECTORY,
        withSenderCheck(IPC.FILE.WELCOME_OPEN_DIRECTORY, async () => {
            try {
                const result = await dialog.showOpenDialog(mainWindow, {
                    properties: ['openDirectory']
                })

                if (!result.canceled && result.filePaths.length > 0) {
                    const dirPath = result.filePaths[0]
                    // 目录来自系统对话框（用户显式选择），登记为受信目录子树并跳过 AS-2 入参校验
                    registerTrustedDirectory(dirPath)
                    appState.rootPath = dirPath
                    // FE-01：先通知渲染层进入主界面（触发主界面组件挂载并注册 IPC 监听），
                    // 再在下一 tick 发送 CLEAR_EDITOR_PREVIEW / FILE_SYSTEM_DATA 等数据事件，
                    // 避免数据事件早于监听器注册而丢失（空白目录树/编辑器）。
                    mainWindow.webContents.send(IPC.FILE.WELCOME_ENTER_MAIN, {
                        type: 'directory',
                        path: dirPath
                    })
                    await runAfterMainViewEntered(async () => {
                        mainWindow.webContents.send(IPC.FILE.CLEAR_EDITOR_PREVIEW)
                        await ReloadDirFromDisk()
                        saveLastOpenedDirectory(dirPath)
                    })
                }
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.FILE.WELCOME_OPEN_DIRECTORY, error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // 欢迎界面 - 打开文件
    ipcListenerManager.registerOnce(
        IPC.FILE.WELCOME_OPEN_FILE,
        withSenderCheck(IPC.FILE.WELCOME_OPEN_FILE, async () => {
            try {
                const result = await dialog.showOpenDialog(mainWindow, {
                    properties: ['openFile'],
                    filters: [{ name: 'Markdown Files', extensions: ['md'] }]
                })

                if (!result.canceled && result.filePaths.length > 0) {
                    const filePath = result.filePaths[0]
                    // 文件来自系统对话框（用户显式选择）：登记为受信精确路径——首次启动尚无
                    // rootPath（或文件在工作区外）时，AS-1 路径守卫据此放行 OpenSelectFile。
                    registerTrustedPath(filePath)
                    // ARC-13：显式标注 shared 的 FileProperties，保持 type 字面量收窄（原全局声明为字面量联合）
                    const fileProperties: FileProperties = {
                        name: ParserFileName(filePath),
                        path: filePath,
                        type: 'file',
                        content: ''
                    }
                    // FE-01：先通知渲染层进入主界面，再在下一 tick 读取并推送文件内容/路径
                    // （SHOW_SELECTED_FILE_CONTEXT / USER_SELECT_FILE），避免数据事件早于
                    // 主界面编辑器监听器注册而丢失（空白编辑器 + 空内容覆盖原文件风险）。
                    mainWindow.webContents.send(IPC.FILE.WELCOME_ENTER_MAIN, {
                        type: 'file',
                        path: filePath
                    })
                    await runAfterMainViewEntered(async () => {
                        await OpenSelectFile(fileProperties)
                    })
                }
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.FILE.WELCOME_OPEN_FILE, error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // CQ-05：以下 handle 通道会调 async 文件操作，异常保持抛给 invoke 调用方（可 catch），
    // 主进程侧仅补带通道名的错误日志，避免失败静默。
    // P1/N-05：文件导入（落盘）为高风险写通道，仅主窗口可信；拒绝时返回统一错误对象。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.IMPORT_NEW_FILE,
        withSenderCheck(
            IPC.FILE.IMPORT_NEW_FILE,
            withHandleErrorLog(IPC.FILE.IMPORT_NEW_FILE, async (_, content: string) => {
                return await ImportCreateNewFile(mainWindow, content)
            }),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // P1/N-05：创建文件/文件夹（文件系统写）高风险，仅主窗口可信。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.CREATE_FILE_FOLDER,
        withSenderCheck(
            IPC.FILE.CREATE_FILE_FOLDER,
            withHandleErrorLog(
                IPC.FILE.CREATE_FILE_FOLDER,
                async (_, name: string, dirPath: string, isFolder: boolean, extension: string) => {
                    await CreateFileFolder(name, dirPath, isFolder, extension)
                    return { success: true }
                }
            ),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // AS-6：以下查询类 handle 通道补发送方校验（此前无 sender 校验，打破 N-05 不变量）
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.GET_CURRENT_FILE_PATH,
        withSenderCheck(IPC.FILE.GET_CURRENT_FILE_PATH, () => GetCurrentFileDirectory(), {
            kind: 'handle'
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // P1/N-05：目录选择会拉起系统对话框（读取用户选择结果 → 文件系统读取），仅主窗口可信。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.SELECT_DIRECTORY,
        withSenderCheck(
            IPC.FILE.SELECT_DIRECTORY,
            withHandleErrorLog(IPC.FILE.SELECT_DIRECTORY, async () => {
                return await SelectDirectory(mainWindow)
            }),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // P1-FE-03：插入图片对话框「本地文件」浏览（系统图片选择 → 受信登记 → 尽量复制到
    // 当前文档 images/）。会拉起系统对话框并读写磁盘，按高风险通道仅主窗口可信。
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.SELECT_IMAGE,
        withSenderCheck(
            IPC.FILE.SELECT_IMAGE,
            withHandleErrorLog(
                IPC.FILE.SELECT_IMAGE,
                async () => await selectLocalImageFile(mainWindow)
            ),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // AS-6：系统信息/主题/编辑器设置查询通道补发送方校验
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.SYSTEM_INFO,
        withSenderCheck(IPC.FILE.SYSTEM_INFO, () => `${os.type()} ${os.arch()} ${os.release()}`, {
            kind: 'handle'
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerHandleOnce(
        IPC.THEME.LOAD_MONACO_THEME,
        withSenderCheck(
            IPC.THEME.LOAD_MONACO_THEME,
            (_: Electron.IpcMainInvokeEvent, themeName: string) => getMonacoThemeData(themeName),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerHandleOnce(
        IPC.EDITOR.GET_SETTING,
        withSenderCheck(IPC.EDITOR.GET_SETTING, () => getEditorSetting(), { kind: 'handle' }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // D-2/FUN-04：修复自动保存开关反转——按 payload 值正确启动/停止定时器，
    // 间隔变更时通过 StartAutoSaveFileTime 内部先停后启实现重启。
    // P0-B：本通道经 ipcMain.handle 注册（渲染层必须 invoke 才能触达），
    // 返回 { ok } 成功标志供渲染层判断，间隔参数校验逻辑保持不变。
    // P1/N-05：自动保存开关影响落盘策略，按配置写类高风险通道处理，仅主窗口可信。
    ipcListenerManager.registerHandleOnce(
        IPC.DIALOG.AUTO_SAVE_CHANGED,
        withSenderCheck(
            IPC.DIALOG.AUTO_SAVE_CHANGED,
            (_event, payload?: { autoSaveEnabled?: boolean; autoSaveInterval?: number }) => {
                if (!payload || typeof payload !== 'object') {
                    return { ok: false, reason: 'invalid-payload' }
                }
                if (payload.autoSaveEnabled) {
                    const intervalSec =
                        typeof payload.autoSaveInterval === 'number' &&
                        payload.autoSaveInterval >= 5
                            ? payload.autoSaveInterval
                            : 60
                    StartAutoSaveFileTime(intervalSec * 1000)
                    return { ok: true, autoSaveEnabled: true, autoSaveInterval: intervalSec }
                }
                StopAutoSaveFileTime()
                return { ok: true, autoSaveEnabled: false }
            },
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // ============ P1-FE-04：快捷链接设置数据源统一 ============
    // 背景：QuickLinkSettingDialog.vue 原经 window.api.config.write('quickLinks') 写入
    // quick-link-config.json 的 rendererQuickLinks 键（形状 {name,url,icon,description}），
    // 而 NaviTab 经 QUICK_LINKS.GET 读取同一文件的 quickLinks 键（QuickLinkItem[]），
    // 两套形状互不消费，导致「设置保存后导航栏不生效」。
    //
    // 修复：设置对话框改为 invoke 本通道提交 QuickLinkItem[]，主进程归一化校验后
    // 写入 quickLinks 键（与 GET 同源），保存成功后向主窗口广播 QUICK_LINKS.UPDATED，
    // NaviTab 监听后即时刷新。GET handler 保留在 utils.ts 的 MainWindowListenUtilsEvent
    // （历史注册位置，行为不变）；SAVE/UPDATED 通道常量与广播均在此模块收口。
    ipcListenerManager.registerHandleOnce(
        IPC.QUICK_LINKS.SAVE,
        withSenderCheck(
            IPC.QUICK_LINKS.SAVE,
            withHandleErrorLog(IPC.QUICK_LINKS.SAVE, (_event, links: unknown) => {
                const normalized = normalizeQuickLinkItems(links)
                if (normalized === null) {
                    return { ok: false, reason: 'invalid-payload' }
                }
                saveQuickLinks(normalized)
                try {
                    if (typeof mainWindow.isDestroyed === 'function' && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send(IPC.QUICK_LINKS.UPDATED, normalized)
                    }
                } catch (error) {
                    // 广播失败不影响已落盘的保存结果，仅记录日志
                    logger.error('[IPC] 快捷链接更新广播失败:', error)
                }
                return { ok: true, links: normalized }
            }),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )
}

// P2 死代码清理：原模块级副作用注册 THEME.DIALOG_BROADCAST_THEME（主题设置
// JSDOM 对话框经 preload broadcastTheme 广播主题）已随该对话框删除——通道
// 发送方/监听方双端移除，preload 的 broadcastTheme 辅助函数同步删除。

/**
 * 获取当前主窗口实例
 * 注意：这是一个简单的方式，在实际应用中可能需要更复杂的管理
 */
let currentMainWindow: BrowserWindow | null = null

export function setMainWindow(window: BrowserWindow): void {
    currentMainWindow = window
    // P1/N-05：同步 IPC 授权校验使用的主窗口引用（macOS activate 重建窗口后以最新窗口为准）
    setTrustedMainWindow(window)
}

export function getMainWindow(): BrowserWindow | null {
    return currentMainWindow
}
