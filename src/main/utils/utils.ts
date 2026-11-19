import { globalInitialize } from './global'
import * as FileUtils from './file-utils/index'
import {
    CreateHash,
    CreateHmac,
    CreateRsaKeyPair,
    CryptoDecrypt,
    CryptoEncrypt
} from './encrypt-decrypt'
import { shell, dialog } from 'electron'
// 结构优化 1.1（H1）：配置读取依赖倒置——utils 不再静态 import config，
// 主题/快速链接读取由 main/index.ts 启动早期注入（见 utils/providers.ts）
import { getQuickLinksFromProvider, getThemeApiFromProvider } from './providers'
import { appState } from './app-state'
import { isPathAllowed, isSafeExternalUrl, openExternalSafely } from './security'
import { getAppResourcesPath } from './app-paths'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'
// P1/N-05：IPC 发送方授权校验（文件系统/外部链接等高风险通道仅接受主窗口发送方）
import { assertTrustedSender, setTrustedMainWindow, withSenderCheck } from './ipc-security'
import * as fs from 'fs'
import * as path from 'path'
import { pathToFileURL } from 'url'
import { IPC } from '../../shared/ipc-channels'
// 公共接口归位第 2 批：文件读取大小上限与大小格式化统一引用 shared 真源
import { MAX_READ_BINARY_SIZE } from '../../shared/constants/limits'
import { formatFileSize } from '../../shared/utils/format'
// ARC-13：CryptoData / FileProperties 已收敛到 src/shared/types（唯一真源）；
// 第 2 批：版本信息返回结构统一引用 shared AppVersionInfo（与 preload index.d.ts、
// 渲染层 HelpAboutDialog.vue 的消费形状同一契约）
import type { AppVersionInfo, CryptoData, FileProperties, ThemeType } from '../../shared/types'
import { tMain } from './i18n'
import { logger } from './logger'

export {
    globalInitialize,
    FileUtils,
    CreateRsaKeyPair,
    CreateHash,
    CreateHmac,
    CryptoEncrypt,
    CryptoDecrypt
}

// MEM-10：本模块所有注册均归属的组件 ID（进程级全局注册）
const GLOBAL_IPC_COMPONENT_ID = 'global-utils-ipc'

/**
 * CQ-05：异步 ipcMain.on 回调异常兜底——主进程留错误日志，并经现有状态栏通道
 * （status-bar-console-update，见 logger.ts / file-operations.ts 同款用法）
 * 向渲染层提示，避免 rejection 变成 unhandledRejection 后静默丢失。
 */
function notifyIpcAsyncError(
    mainWindow: Electron.BrowserWindow,
    channel: string,
    error: unknown
): void {
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
 * AS-6：插件/加密类 IPC 的输入校验（防止异常 payload 造成主进程 CPU/内存耗尽）
 * ========================================================================== */

/** RSA 密钥长度白名单：仅允许业界常用档位（拒绝 1e6/1e9 等超大 modulusLength） */
export const ALLOWED_RSA_BITS: readonly number[] = [1024, 2048, 3072, 4096]
/** RSA bits 缺省/非法时的安全默认值 */
export const DEFAULT_RSA_BITS = 2048

/**
 * AS-6：归一化 RSA bits——非整数/白名单外的值回退默认 2048，
 * 防止渲染层传入超大 modulusLength 让主进程 CPU/内存耗尽（自伤型 DoS）。
 */
export function sanitizeRsaBits(input: unknown): number {
    if (typeof input === 'number' && Number.isInteger(input) && ALLOWED_RSA_BITS.includes(input)) {
        return input
    }
    return DEFAULT_RSA_BITS
}

/** 字符串入参校验：非字符串时抛出可被 invoke 调用方捕获的受控错误 */
function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
        throw new TypeError(`非法 IPC 入参：${field} 必须是字符串`)
    }
    return value
}

/** CryptoData 最小结构校验（algorithm/context 必填字符串，其余编码字段可选字符串） */
function requireCryptoData(value: unknown): CryptoData {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('非法 IPC 入参：加密数据必须是对象')
    }
    const data = value as Record<string, unknown>
    if (typeof data.algorithm !== 'string' || data.algorithm.length === 0) {
        throw new TypeError('非法 IPC 入参：algorithm 必须是非空字符串')
    }
    if (typeof data.context !== 'string') {
        throw new TypeError('非法 IPC 入参：context 必须是字符串')
    }
    for (const field of [
        'secretKey',
        'secretKeyEncoding',
        'inputEncoding',
        'outputEncoding',
        'iv'
    ]) {
        const fieldValue = data[field]
        if (fieldValue !== undefined && typeof fieldValue !== 'string') {
            throw new TypeError(`非法 IPC 入参：${field} 必须是字符串`)
        }
    }
    // CQ-15：上一段已逐字段做运行时校验（algorithm/context 必填、5 个可选字段类型），
    // 但 TS 无法把 Record<string, unknown> 收窄为 CryptoData（字段间无判别式）；
    // 双重断言表达"校验通过即视为 CryptoData"，不改写运行时对象（保留未知可选字段）。
    return data as unknown as CryptoData
}

// ARC-01：受信可执行目录列表（系统程序目录，防大小写/.. 混用绕过）。
// AS-7：用户可写的 %LOCALAPPDATA%\Programs 不再视为"免确认"受信目录（见
// getUserWritableExecutableDirs），其内程序一律走确认框。
function getTrustedExecutableDirs(): string[] {
    const candidates = [
        process.env.ProgramFiles,
        process.env['ProgramFiles(x86)'],
        process.env.ProgramW6432,
        process.env.SystemRoot
    ]
    return candidates.filter((dir): dir is string => !!dir && path.isAbsolute(dir))
}

/**
 * AS-7：用户可写的"伪受信"目录——%LOCALAPPDATA%\Programs 是 NSIS 等安装器的
 * 默认用户级安装位置，普通用户可写。保留其可被快速链接打开的能力（用户主动配置），
 * 但不得免确认执行（目录内的程序需用户显式确认后才交给 shell）。
 */
function getUserWritableExecutableDirs(): string[] {
    const candidates = [
        process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs') : undefined
    ]
    return candidates.filter((dir): dir is string => !!dir && path.isAbsolute(dir))
}

const DIRECT_EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set(['.exe', '.com'])
const CONFIRM_EXECUTABLE_EXTENSIONS: ReadonlySet<string> = new Set([
    '.bat',
    '.cmd',
    '.lnk',
    '.msi',
    '.ps1',
    '.vbs',
    '.js',
    '.jse',
    '.wsf',
    '.wsh',
    '.hta'
])

/**
 * AS-7：可执行文件扩展名白名单判定。
 * - 'direct'：系统受信目录内可直接打开（仅 .exe/.com）；
 * - 'confirm'：脚本/快捷方式/安装包（.bat/.cmd/.lnk/.msi/.ps1 等），无论位于哪个目录都必须确认；
 * - 'reject'：白名单外扩展名（.txt/.py/.url 等）一律不交给 shell.openPath。
 */
export function getExecutableExtensionDecision(input: unknown): 'direct' | 'confirm' | 'reject' {
    if (typeof input !== 'string' || input.trim().length === 0) {
        return 'reject'
    }
    const extension = path.extname(input.trim()).toLowerCase()
    if (DIRECT_EXECUTABLE_EXTENSIONS.has(extension)) {
        return 'direct'
    }
    if (CONFIRM_EXECUTABLE_EXTENSIONS.has(extension)) {
        return 'confirm'
    }
    return 'reject'
}

// ARC-01：判断目标路径是否位于受信目录内（path.relative 结果不得为绝对路径或以 .. 开头）
function isUnderDirectories(filePath: string, directories: string[]): boolean {
    const normalized = path.resolve(filePath)
    return directories.some((dir) => {
        const relative = path.relative(path.resolve(dir), normalized)
        return (
            relative !== '' &&
            relative !== '..' &&
            !relative.startsWith(`..${path.sep}`) &&
            !path.isAbsolute(relative)
        )
    })
}

function isTrustedExecutablePath(filePath: string): boolean {
    return isUnderDirectories(filePath, getTrustedExecutableDirs())
}

/** AS-7：是否位于用户可写目录（用于确认提示/审计日志，不再免确认） */
function isUserWritableExecutablePath(filePath: string): boolean {
    return isUnderDirectories(filePath, getUserWritableExecutableDirs())
}

/**
 * P1-AS-1：文件路径越界的用户提示（状态栏）。
 * 使用现有状态词条组合出「打开文件失败：没有读取权限: <path>」，不新增 i18n 词条。
 */
function notifyFilePathDenied(
    mainWindow: Electron.BrowserWindow,
    channel: string,
    filePath: unknown,
    actionKey: string
): void {
    const display = typeof filePath === 'string' ? filePath : String(filePath)
    logger.warn(`[Security] 通道 "${channel}" 已拒绝受信范围外的路径（P1-AS-1）：${display}`)
    try {
        if (typeof mainWindow.isDestroyed === 'function' && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message: tMain(actionKey, {
                    message: `${tMain('mainMsg.file.readError.eacces')}: ${display}`
                }),
                type: 'error'
            })
        }
    } catch (notifyError) {
        logger.error('[Security] 路径越界状态栏提示发送失败:', notifyError)
    }
}

/**
 * MEM-10：本函数内所有 ipcMain 直连注册均迁移至 ipcListenerManager 统一管理
 * （registerOnce / registerHandleOnce，全局一次性注册，防 ARC-06 重复注册）。
 */
export function MainWindowListenUtilsEvent(mainWindow: Electron.BrowserWindow) {
    // P1/N-05：注册即登记受信主窗口（sender 校验依据；与 setMainWindow 同源）
    setTrustedMainWindow(mainWindow)

    // FUN-18：无活动文件时的保存提示状态——同一段"无活动文件"期间只提示一次，
    // 恢复活动文件后重置，避免每次按键都向状态栏重复发送提示。
    let noActiveFileSaveHintShown = false

    // P1/N-05：打开文件（读取用户选择后的本地文件）仅主窗口可信
    ipcListenerManager.registerOnce(
        IPC.FILE.OPEN_SELECT_FILE,
        withSenderCheck(
            IPC.FILE.OPEN_SELECT_FILE,
            async (_: Electron.IpcMainEvent, message: FileProperties) => {
                try {
                    await FileUtils.OpenSelectFile(message)
                } catch (error) {
                    notifyIpcAsyncError(mainWindow, IPC.FILE.OPEN_SELECT_FILE, error)
                }
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // PF-02：预览渲染已收敛到渲染层单跳链路（preview-local-render.ts），
    // 不再注册 PRE_RENDER / POST_RENDER 主进程渲染通道。

    // P1/N-05：文件管理器右键动作（路径复制/剪切/粘贴/定位）与文件系统相关，
    // 统一仅接受主窗口发送方（send 通道：非法 sender 直接 return）。
    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_RELATIVE_PATH,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_RELATIVE_PATH,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.CopyRelativePath(path)
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_IMAGELINK,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_IMAGELINK,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.CopyImageLink(path)
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_FILELINK,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_FILELINK,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.CopyFileLink(path)
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.COPY_FILE,
        withSenderCheck(
            IPC.FILE_MANAGER.COPY_FILE,
            (_: Electron.IpcMainEvent, path: string, isFile: boolean) => {
                FileUtils.FileManagerContextMenuCopy(path, isFile)
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.CUT,
        withSenderCheck(
            IPC.FILE_MANAGER.CUT,
            (_: Electron.IpcMainEvent, path: string, isFile: boolean) => {
                FileUtils.FileManagerContextMenuCut(path, isFile)
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.PASTE,
        withSenderCheck(
            IPC.FILE_MANAGER.PASTE,
            (_: Electron.IpcMainEvent, value: string, isFile: boolean) => {
                FileUtils.FileManagerContextMenuPaste(value, isFile)
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.OPEN_IN_EXPLORER,
        withSenderCheck(
            IPC.FILE_MANAGER.OPEN_IN_EXPLORER,
            (_: Electron.IpcMainEvent, path: string) => {
                FileUtils.OpenFolderExplorer(path)
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerOnce(
        IPC.FILE_MANAGER.RELOAD_FROM_DISK,
        withSenderCheck(IPC.FILE_MANAGER.RELOAD_FROM_DISK, async () => {
            try {
                await FileUtils.ReloadDirFromDisk()
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.FILE_MANAGER.RELOAD_FROM_DISK, error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // P1/N-05：插入图片会写入 ./images/ 磁盘文件，仅主窗口可信
    ipcListenerManager.registerOnce(
        IPC.RENDER.INSERT_IMAGE,
        withSenderCheck(IPC.RENDER.INSERT_IMAGE, async (_, context: string) => {
            try {
                const imageName = await FileUtils.InsertImagesToFile(context)
                if (imageName.length !== 0) {
                    mainWindow.webContents.send(
                        IPC.MONACO.TEXT_BLOCK_TEMPLATES,
                        '\r\n\r\n![](./images/' + imageName + ')\r\n\r\n'
                    )
                }
            } catch (error) {
                notifyIpcAsyncError(mainWindow, IPC.RENDER.INSERT_IMAGE, error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // AS-6：RSA 密钥生成通道补发送方校验 + bits 白名单（仅 1024/2048/3072/4096，
    // 非法值回退 2048；否则渲染层可传超大 modulusLength 让主进程长时间占用 CPU/内存）
    ipcListenerManager.registerOnce(
        IPC.PLUGIN.RSA_GENERATE,
        withSenderCheck(IPC.PLUGIN.RSA_GENERATE, (_: Electron.IpcMainEvent, bits: unknown) => {
            CreateRsaKeyPair(sanitizeRsaBits(bits))
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // CQ-10 / PF-11 / ARC-21：加密工具四个通道由 sendSync 同步应答（event.returnValue）
    // 改为 ipcMain.handle + 渲染层 invoke 异步应答，避免大文本计算期间冻结渲染进程。
    // 计算逻辑（CreateHash/CreateHmac/CryptoEncrypt/CryptoDecrypt）与返回结构保持不变；
    // 异常走 reject 交给 invoke 调用方 catch，主进程侧仅补日志（CQ-05）。
    // AS-6：四个通道均为主窗口专属能力（含密钥材料往返），补发送方校验 + 入参类型校验。
    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.HASH_TEXT,
        withSenderCheck(
            IPC.PLUGIN.HASH_TEXT,
            withHandleErrorLog(
                IPC.PLUGIN.HASH_TEXT,
                (_event: Electron.IpcMainInvokeEvent, context: unknown, encType: unknown) =>
                    CreateHash(requireString(context, 'context'), requireString(encType, 'encType'))
            ),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.HMAC_TEXT,
        withSenderCheck(
            IPC.PLUGIN.HMAC_TEXT,
            withHandleErrorLog(
                IPC.PLUGIN.HMAC_TEXT,
                (
                    _event: Electron.IpcMainInvokeEvent,
                    context: unknown,
                    secKey: unknown,
                    encType: unknown
                ) =>
                    CreateHmac(
                        requireString(context, 'context'),
                        requireString(secKey, 'secKey'),
                        requireString(encType, 'encType')
                    )
            ),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.CRYPTO_ENCRYPT,
        withSenderCheck(
            IPC.PLUGIN.CRYPTO_ENCRYPT,
            withHandleErrorLog(
                IPC.PLUGIN.CRYPTO_ENCRYPT,
                (_event: Electron.IpcMainInvokeEvent, data: unknown) =>
                    CryptoEncrypt(requireCryptoData(data))
            ),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.CRYPTO_DECRYPT,
        withSenderCheck(
            IPC.PLUGIN.CRYPTO_DECRYPT,
            withHandleErrorLog(
                IPC.PLUGIN.CRYPTO_DECRYPT,
                (_event: Electron.IpcMainInvokeEvent, data: unknown) =>
                    CryptoDecrypt(requireCryptoData(data))
            ),
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // ARC-01：navi-tab-open-exe 为"能力型"通道（执行任意本地程序），必须多重校验：
    // 1) 发送方必须是主窗口（远程网页/对话框窗口一律拒绝）；
    // 2) 路径必须是绝对路径、存在且为普通文件（AS-7 增加 isFile 校验，排除目录/设备）；
    // 3) AS-7 扩展名白名单：仅 .exe/.com 可在系统受信目录内免确认；脚本/快捷方式/安装包
    //    （.bat/.cmd/.lnk/.msi/.ps1 等）一律弹确认；白名单外扩展名直接拒绝；
    // 4) 系统受信目录内直接放行；用户可写的 %LOCALAPPDATA%\Programs 与非受信目录必须确认。
    ipcListenerManager.registerOnce(
        IPC.NAVIGATION.OPEN_EXE,
        async (event: Electron.IpcMainEvent, exePath: string) => {
            try {
                // 1) 发送方校验统一走 ipc-security（主窗口 webContents 严格匹配；
                //    其他窗口/远程页面一律拒绝并 console.warn）
                if (!assertTrustedSender(event, { channel: IPC.NAVIGATION.OPEN_EXE })) {
                    return
                }

                // 2) 路径校验：拒绝相对路径、不存在的路径与非字符串入参
                if (
                    typeof exePath !== 'string' ||
                    !path.isAbsolute(exePath) ||
                    !fs.existsSync(exePath)
                ) {
                    logger.warn('[Security] navi-tab-open-exe：拒绝非法路径', exePath)
                    return
                }
                let stats: fs.Stats
                try {
                    stats = fs.statSync(exePath)
                } catch (error) {
                    logger.warn(
                        '[Security] navi-tab-open-exe：无法读取路径状态，已拒绝',
                        exePath,
                        error
                    )
                    return
                }
                if (!stats.isFile()) {
                    logger.warn('[Security] navi-tab-open-exe：目标不是普通文件，已拒绝', exePath)
                    return
                }

                // 3) AS-7 扩展名白名单：白名单外扩展名不交给系统 shell
                const extensionDecision = getExecutableExtensionDecision(exePath)
                if (extensionDecision === 'reject') {
                    logger.warn('[Security] navi-tab-open-exe：拒绝白名单外的可执行扩展名', exePath)
                    return
                }

                // 4) 受信目录校验：系统程序目录内且免确认扩展名（.exe/.com）直接放行；
                //    其余情况（非受信目录、用户可写目录、脚本/快捷方式类扩展名）需用户显式确认。
                const userWritable = isUserWritableExecutablePath(exePath)
                const trustedSystemPath = isTrustedExecutablePath(exePath)
                const requiresConfirm =
                    !trustedSystemPath || userWritable || extensionDecision !== 'direct'
                if (requiresConfirm) {
                    if (userWritable) {
                        logger.warn(
                            '[Security] navi-tab-open-exe：目标位于用户可写目录，需用户确认',
                            exePath
                        )
                    }
                    const { response } = await dialog.showMessageBox(mainWindow, {
                        type: 'warning',
                        buttons: [
                            tMain('mainMsg.dialog.cancel'),
                            tMain('mainMsg.security.openExeConfirm')
                        ],
                        defaultId: 0,
                        cancelId: 0,
                        noLink: true,
                        title: tMain('mainMsg.security.openExeTitle'),
                        message: tMain('mainMsg.security.openExeMessage'),
                        detail: tMain('mainMsg.security.openExeDetail', { path: exePath })
                    })
                    if (response !== 1) {
                        return
                    }
                }

                await shell.openPath(exePath)
            } catch (error) {
                // CQ-05：对话框/打开程序异常统一兜底，避免 unhandledRejection
                notifyIpcAsyncError(mainWindow, IPC.NAVIGATION.OPEN_EXE, error)
            }
        },
        GLOBAL_IPC_COMPONENT_ID
    )

    // 快速链接配置相关IPC
    // AS-6：快速链接含 exe 路径（可被后续 OPEN_EXE 消费），补发送方校验
    ipcListenerManager.registerHandleOnce(
        IPC.QUICK_LINKS.GET,
        withSenderCheck(IPC.QUICK_LINKS.GET, () => getQuickLinksFromProvider(), {
            kind: 'handle'
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // 主题配置相关IPC
    // AS-6：主题数据决定渲染层外观，补发送方校验（handle 拒绝返回统一错误对象）
    ipcListenerManager.registerHandleOnce(
        IPC.THEME.GET_CURRENT_THEME_STYLES,
        withSenderCheck(
            IPC.THEME.GET_CURRENT_THEME_STYLES,
            (_event: Electron.IpcMainInvokeEvent, themeType?: string) => {
                const themeApi = getThemeApiFromProvider()
                if (themeType) {
                    return themeApi.getThemeStylesByType(themeType as ThemeType)
                }
                return themeApi.getCurrentThemeStyles()
            },
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerHandleOnce(
        IPC.THEME.GET_ALL_THEMES,
        withSenderCheck(IPC.THEME.GET_ALL_THEMES, () => getThemeApiFromProvider().getAllThemes(), {
            kind: 'handle'
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    ipcListenerManager.registerHandleOnce(
        IPC.THEME.GET_ALL_MONACO_THEMES,
        withSenderCheck(
            IPC.THEME.GET_ALL_MONACO_THEMES,
            () => getThemeApiFromProvider().getAllMonacoThemes(),
            {
                kind: 'handle'
            }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )

    // P2 死代码清理：THEME.GET_CURRENT_THEME / GET_SEPARATE_EDITOR_THEME /
    // GET_MONACO_THEME 三个通道主进程有监听但全仓零发送方（渲染层实际使用
    // GET_CURRENT_THEME_STYLES + THEME_UPDATED 广播），已随通道常量一并删除。

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
        GLOBAL_IPC_COMPONENT_ID
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
        GLOBAL_IPC_COMPONENT_ID
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
        GLOBAL_IPC_COMPONENT_ID
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
        GLOBAL_IPC_COMPONENT_ID
    )

    // 读取 HTML 文件内容
    // P1/N-05：可读取任意路径文件内容，仅主窗口可信（handle 拒绝返回错误对象）。
    // P1-AS-1：路径必须位于受信范围（工作区/临时目录/用户选择过的路径），
    // 防止渲染层借该通道读取任意文件（如 SSH 密钥、浏览器配置）。
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
        GLOBAL_IPC_COMPONENT_ID
    )

    // 读取本地二进制文件（2026-11-18，遗留清单 #9：PDF 预览改走 pdf.js 需要原始字节）
    // P1-AS-1：仅允许受信范围路径（Path Guard），越界拒绝并提示。
    // 2026-11-19 收紧边界：
    // ① 仅允许 .pdf（不区分大小写）——本通道唯一调用方是 PDF 预览，防止被借道读取任意二进制；
    // ② 单文件大小上限 128MB——stat 超限直接拒绝，避免超大文件一次性读入主/渲染进程造成卡顿或 OOM；
    // ③ Buffer 本身是 Uint8Array 子类，IPC 结构化克隆后渲染层可直接使用，去掉多余拷贝（原 new Uint8Array(buffer)）。
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
                let fileSize = 0
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
        GLOBAL_IPC_COMPONENT_ID
    )

    // 在外部浏览器中打开链接
    // P0 安全：统一走 shell 协议白名单封装，仅允许 http/https；
    // 非白名单协议直接拒绝（console.warn），打开失败仍按 CQ-05 经状态栏提示。
    // P1/N-05：外部链接打开属高风险通道（钓鱼/协议利用），仅主窗口可信。
    ipcListenerManager.registerOnce(
        IPC.SYSTEM.OPEN_EXTERNAL_LINK,
        withSenderCheck(IPC.SYSTEM.OPEN_EXTERNAL_LINK, async (_, url: string) => {
            if (!isSafeExternalUrl(url)) {
                logger.warn(`[Security] 已拒绝打开非 http/https 协议的外部链接：${url}`)
                return
            }
            try {
                const opened = await openExternalSafely(url)
                if (!opened) {
                    // openExternalSafely 已记录具体失败原因；这里抛错以复用 CQ-05 的状态栏提示
                    throw new Error(url)
                }
            } catch (error) {
                // CQ-05：打开失败时主进程留日志并经状态栏提示，不再只打 console.error
                notifyIpcAsyncError(mainWindow, IPC.SYSTEM.OPEN_EXTERNAL_LINK, error)
            }
        }),
        GLOBAL_IPC_COMPONENT_ID
    )

    // 在外部浏览器中打开本地 HTML 文件（2026-11-18，遗留清单 #1）
    // 背景：HTML 查看器「在浏览器中打开」此前复用 OPEN_EXTERNAL_LINK，该通道按设计
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
        GLOBAL_IPC_COMPONENT_ID
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
        GLOBAL_IPC_COMPONENT_ID
    )

    // 获取应用版本信息
    // AS-6：版本信息读取（含 resources/config/version.json 内容）补发送方校验
    // 第 2 批契约重构：返回形状显式标注 shared AppVersionInfo（唯一真源），
    // preload 的 window.api.app.getVersion() 类型声明与渲染层 HelpAboutDialog 同源。
    ipcListenerManager.registerHandleOnce(
        IPC.SYSTEM.APP_VERSION,
        withSenderCheck(
            IPC.SYSTEM.APP_VERSION,
            async (): Promise<AppVersionInfo> => {
                try {
                    const versionFilePath = path.join(
                        getAppResourcesPath(),
                        'config',
                        'version.json'
                    )
                    if (fs.existsSync(versionFilePath)) {
                        // version.json 由构建脚本（build/generate-version-config.js）生成，
                        // 字段形状即 shared AppVersionInfo；electron/chrome/node 版本可能为空，
                        // 在 Electron 主进程中用 process.versions 补齐。
                        const versionData = JSON.parse(
                            fs.readFileSync(versionFilePath, 'utf-8')
                        ) as AppVersionInfo
                        if (!versionData.electronVersion) {
                            versionData.electronVersion = process.versions.electron || ''
                        }
                        if (!versionData.chromeVersion) {
                            versionData.chromeVersion = process.versions.chrome || ''
                        }
                        if (!versionData.nodeVersion) {
                            versionData.nodeVersion = process.versions.node || ''
                        }
                        return versionData
                    }
                } catch (error) {
                    logger.error('读取版本配置文件失败:', error)
                }
                return {
                    appVersion: '',
                    electronVersion: process.versions.electron || '',
                    chromeVersion: process.versions.chrome || '',
                    nodeVersion: process.versions.node || '',
                    vueVersion: '',
                    viteVersion: '',
                    typescriptVersion: '',
                    monacoEditorVersion: '',
                    markdownItVersion: ''
                }
            },
            { kind: 'handle' }
        ),
        GLOBAL_IPC_COMPONENT_ID
    )
}
