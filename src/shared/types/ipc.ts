/**
 * IPC 载荷契约（第 2 批契约重构：渲染层 ↔ 主进程通道参数/返回值/广播载荷的唯一类型真源）
 *
 * ## 三张契约表
 * - `IpcRequests`：渲染层 → 主进程（send / invoke）通道 → **参数元组**。
 *   键集合与 preload 的 `ALLOWED_RENDERER_SEND_CHANNELS` 白名单**完全相等**（60 个通道）；
 * - `IpcResponses`：invoke（ipcMain.handle）通道 → 返回类型。
 *   键集合 = IpcRequests 中「主进程以 registerHandleOnce 注册」的通道（28 个）；
 * - `IpcEvents`：主进程 → 渲染层广播（ipcRenderer.on/once）通道 → 监听回调参数元组
 *   （单载荷即一元元组）。键集合与 preload 的 `ALLOWED_RENDERER_RECEIVE_CHANNELS`
 *   白名单**完全相等**（25 个通道）。
 *
 * ## 键的写法（可静态校验）
 * 三张表统一用计算属性名 `[IPC.<组>.<键>]` 引用 `src/shared/ipc-channels.ts` 常量，
 * 不在本文件重复书写通道字符串——通道字符串仍是 ipc-channels.ts 的唯一真源。
 * `tests/unit/ipc-payload-contract.test.ts` 直接解析本文件中的 `[IPC.X.Y]` 引用映射为
 * 通道值，再与 IPC 常量表 / preload 白名单 / 主进程注册点做双向交叉核对。
 *
 * ## 类型依据（逐一读取主进程实现，不修改任何 handler）
 * - `src/main/ipc/handlers.ts`、`src/main/ipc/{file-editor,crypto,theme,system}-ipc.ts`
 *   （原 `utils/utils.ts` 的 29 处注册已按域迁入）、`src/main/config/config-manager.ts`、
 *   `src/main/renders/plantuml-local.ts`：31 个 handle 注册点的入参/返回值；
 * - `src/main/ipc/*`（menu-*）、`src/main/utils/file-utils/*`、`src/main/dialogs/*`、
 *   `src/main/utils/encrypt-decrypt.ts`：on 通道的入参与广播载荷；
 * - `src/renderer/**` 的 75 处实际调用点：确认渲染层实参个数与类型。
 *
 * ## 契约漂移记录（本轮只记录、不修改运行时）
 * 1. `FILE_MANAGER.RELOAD_FROM_DISK`：主进程 handler 无参，渲染层仍多传一个被忽略的
 *    `''`——本文件按「可选忽略参数」标注，后续替换调用点时可去掉该实参；
 * 2. `THEME.UPDATE_THEME`：主进程三个参数均按可选处理（缺省回退 store 当前值），
 *    渲染层固定传 3 个——本文件按主进程实际接受能力标注为可选；
 * 3. `FILE.CREATE_FILE_FOLDER`：handler 成功恒返回 `{ success: true }`（失败路径由
 *    主进程内部弹框并静默 return，或抛异常由 invoke 侧 catch），故返回类型用字面量；
 * 4. `MONACO.*` 与 `EDITOR.UPDATE_OPTIONS` 的字符串参数实为 Monaco action id / 选项名，
 *    主进程不校验枚举，本文件按 string 标注，枚举收敛留待渲染层 Monaco 契约批次。
 */
import type { IPC } from '../ipc-channels'
import type { ConfigName, ConfigReadMap, ConfigWriteMap } from './config'
import type { CryptoData, CryptoResult } from './crypto'
import type { MainProcessDialogData, MainProcessDialogName } from './dialog'
import type { EditorSetting } from './editor'
import type { FileProperties, OpenRecentPayload, OpenRecentResult, RecentListResult } from './file'
import type { QuickLinkItem } from './quick-link'
import type { StatusBarUpdatePayload } from './status-bar'
import type { SystemSetting, WindowBounds } from './system'
// 第 2 批契约重构：主题领域类型以 shared/types/theme.ts 为唯一真源，本表只做 IPC 载荷引用
import type {
    MonacoThemeData,
    MonacoThemeListItem,
    ThemeListItem,
    ThemeStyles,
    ThemeUpdateData
} from './theme'

/* ============================================================================
 * 一、请求/响应/事件共用的载荷结构（按主进程实际实现镜像，仅类型）
 * ========================================================================== */

/**
 * window.api.app.getVersion() 的返回结构（SYSTEM.APP_VERSION 的响应）。
 * 字段来源为主进程读取 resources/config/version.json 后补运行时版本，
 * 缺字段时回退空字符串。
 */
export interface AppVersionInfo {
    appVersion: string
    electronVersion: string
    chromeVersion: string
    nodeVersion: string
    vueVersion: string
    viteVersion: string
    typescriptVersion: string
    monacoEditorVersion: string
    markdownItVersion: string
}

/** FILE.SELECT_IMAGE 的返回结构（插入图片对话框「本地文件 → 浏览」） */
export interface SelectImageResult {
    /** 用户是否取消了选择 */
    canceled: boolean
    /** 选中图片的绝对路径；取消时为 null */
    filePath: string | null
    /** 写入 Markdown 的图片地址（复制到 images/ 后为相对引用，回退绝对路径）；取消时为 null */
    imageSrc: string | null
}

/** FILE.IMPORT_NEW_FILE（导入内容另存为新文件）的返回结构 */
export interface ImportNewFileResult {
    /** 是否成功落盘 */
    success: boolean
    /** 落盘后的文件绝对路径（取消保存时缺省） */
    filePath?: string
}

/** FILE.CREATE_FILE_FOLDER 的返回结构（handler 成功分支恒为 true，失败由主进程自行提示） */
export interface CreateFileFolderResult {
    /** 创建流程已执行（真正的失败/已存在由主进程弹框提示，不体现在返回值） */
    success: true
}

/**
 * 对话框确认动作（重命名/删除）的返回结构（结构优化第 2 批 2.1）。
 *
 * 消费方：渲染层 RenameFileFolderDialog / ConfirmDeleteDialog 确认后的 invoke 回调。
 * - `ok: true`：主进程已完成动作（渲染层可关闭对话框）；
 * - `ok: false`：动作失败（error 为可直接展示的失败原因；主进程同时已按既有方式
 *   经 Vue 消息对话框/状态栏提示，渲染层保留对话框供用户重试）。
 * 未受信发送方被 withSenderCheck 拒绝时返回 `{ ok: false, error }`（不会执行文件操作）。
 */
export interface DialogActionResult {
    /** 动作是否成功 */
    ok: boolean
    /** 失败原因（ok=false 时可能存在；文案由主进程生成） */
    error?: string
}

/**
 * THEME.GET_ALL_THEMES / THEME.GET_ALL_MONACO_THEMES / THEME.LOAD_MONACO_THEME 的
 * 返回项与返回结构分别位于 shared/types/theme.ts：
 * - ThemeListItem（{ type, styles }）、ThemeListResult（ThemeListItem[]）；
 * - MonacoThemeListItem（{ type, config }）、MonacoThemeConfig；
 * - MonacoThemeData（可直接交给 monaco.editor.defineTheme）。
 * 第 2 批前这里另有一份 partial 镜像（ThemeListItem / MonacoThemeConfigData /
 * MonacoThemeListItem / MonacoThemeData），与主题领域类型重复，已删除并统一引用。
 */

/** THEME.UPDATE_THEME 请求负载（渲染层应用主题成功后请求主进程广播最新主题） */
export interface ThemeUpdateRequest {
    /** 最新应用主题标识（可选，缺省回退主进程 store） */
    themeType?: string
    /** 最新 Monaco 主题标识（可选，缺省回退主进程 store） */
    monacoTheme?: string
    /** 编辑器是否使用独立主题（可选，缺省回退主进程 store） */
    separateEditorTheme?: boolean
}

/**
 * SETTING.AUTO_SAVE_CHANGED 请求负载（渲染层系统设置对话框同步自动保存开关/间隔）。
 * 主进程要校验 payload 必须是对象，字段均为可选。
 */
export interface AutoSaveChangedPayload {
    /** 是否启用自动保存 */
    autoSaveEnabled?: boolean
    /** 自动保存间隔（秒，主进程钳制最小 5、非法值回退 60） */
    autoSaveInterval?: number
}

/**
 * SETTING.AUTO_SAVE_CHANGED 返回结构（主进程三种分支的联合）：
 * - payload 非法：{ ok: false, reason }；
 * - 开启：{ ok: true, autoSaveEnabled: true, autoSaveInterval }；
 * - 关闭：{ ok: true, autoSaveEnabled: false }。
 */
export type AutoSaveChangedResult =
    | { ok: false; reason: string }
    | { ok: true; autoSaveEnabled: true; autoSaveInterval: number }
    | { ok: true; autoSaveEnabled: false }

/** PLUGIN.HASH_TEXT / PLUGIN.HMAC_TEXT 返回结构（算法名 → 摘要字符串） */
export interface HashResult {
    [algorithm: string]: string
}

/**
 * QUICK_LINKS.SAVE 返回结构：
 * - 主进程归一化校验通过：{ ok: true, links }（已落盘并已广播 UPDATED）；
 * - 入参非法（非数组/超上限）：{ ok: false, reason }。
 */
export type QuickLinksSaveResult =
    { ok: true; links: QuickLinkItem[] } | { ok: false; reason: string }

/**
 * RENDER.PLANTUML_LOCAL 返回状态（第 2 批契约重构：主进程 plantuml-local.ts 与渲染层
 * hemy-editor-render.ts 共用本类型，两端不再各自维护同构定义）：
 * - ok=成功出 SVG；error=渲染失败/超时；unavailable=离线资源缺失需远程降级。
 */
export type PlantumlRenderStatus = 'ok' | 'error' | 'unavailable'

/**
 * RENDER.PLANTUML_LOCAL 返回结构（主进程 renderPlantumlDiagram 的实际返回形状）。
 * 字段语义：ok 必须携带含 <svg> 根节点的 svg；error 携带 message；
 * unavailable 携带 reason（渲染层据此降级为远程/代码块显示）。
 */
export interface PlantumlRenderResponse {
    status: PlantumlRenderStatus
    /** status === 'ok' 时的 SVG 字符串（含 <svg> 根节点） */
    svg?: string
    /** status === 'error' 时的错误信息 */
    message?: string
    /** status === 'unavailable' 时的降级原因 */
    reason?: string
}

/** EVENTS.FILE_CONTENT_RELOADED 广播载荷（目录刷新重读当前文件后下发） */
export interface FileContentReloadedPayload {
    /** 当前活动文件绝对路径 */
    path: string
    /** 磁盘最新内容 */
    content: string
}

/** FILE.WELCOME_ENTER_MAIN 广播载荷（欢迎页/启动恢复进入主界面） */
export interface WelcomeEnterMainPayload {
    /** 进入来源类型：打开文件 / 打开文件夹 */
    type: 'file' | 'directory'
    /** 文件或文件夹绝对路径 */
    path: string
}

/* ============================================================================
 * 二、渲染层 → 主进程（send / invoke）请求参数元组
 *
 * 键集合 == preload ALLOWED_RENDERER_SEND_CHANNELS（58 个，双向核对见测试）。
 * 元组即 ipcRenderer.send/invoke 除通道名之外的实参列表（可为空元组）。
 * ========================================================================== */
export interface IpcRequests {
    // ============ 窗口控制 ============
    [IPC.WINDOW.MINIMIZE]: []
    [IPC.WINDOW.MAXIMIZE]: []
    [IPC.WINDOW.CLOSE]: []
    [IPC.WINDOW.TOGGLE_MAXIMIZE]: []
    /** 查询窗口 bounds（invoke） */
    [IPC.WINDOW.GET_BOUNDS]: []
    /** 查询是否最大化（invoke） */
    [IPC.WINDOW.IS_MAXIMIZED]: []
    /** 移动窗口到指定屏幕坐标（x, y 必须是有限整数，主进程校验） */
    [IPC.WINDOW.MOVE]: [x: number, y: number]
    /** 设置窗口尺寸（width, height 必须是有限整数，主进程校验） */
    [IPC.WINDOW.SET_SIZE]: [width: number, height: number]

    // ============ 主题 ============
    /** 请求主进程向所有窗口广播最新主题（3 个参数均可选，主进程缺省回退 store） */
    [IPC.THEME.UPDATE_THEME]: [
        themeType?: string,
        monacoTheme?: string,
        separateEditorTheme?: boolean
    ]
    /** 读取并定义扩展 Monaco 主题（invoke） */
    [IPC.THEME.LOAD_MONACO_THEME]: [themeName: string]
    /** 读取主题样式（invoke；themeType 缺省取当前主题） */
    [IPC.THEME.GET_CURRENT_THEME_STYLES]: [themeType?: string]
    /** 读取全部应用主题（invoke） */
    [IPC.THEME.GET_ALL_THEMES]: []
    /** 读取全部 Monaco 主题（invoke） */
    [IPC.THEME.GET_ALL_MONACO_THEMES]: []

    // ============ 菜单 ============
    /** 菜单动作 id（形如 baize:menu:<域>:<动作>，主进程解析后分发） */
    [IPC.MENU.ACTION]: [action: string]

    // ============ 编辑器 ============
    /** 读取主进程 Monaco 唯一真源编辑器设置（invoke） */
    [IPC.EDITOR.GET_SETTING]: []
    /** 关闭/退出落盘协议回执：渲染层已把最新内容同步给主进程 */
    [IPC.EDITOR.FLUSH_CONTENT_DONE]: []

    // ============ 文件 ============
    /** 打开选定的文件（send；参数为文件属性） */
    [IPC.FILE.OPEN_SELECT_FILE]: [fileProperties: FileProperties]
    /** 打开欢迎页「最近文件夹」指定目录（send） */
    [IPC.FILE.OPEN_SPECIFIC_FOLDER]: [folderPath: string]
    /** 欢迎页「打开文件夹」（send） */
    [IPC.FILE.WELCOME_OPEN_DIRECTORY]: []
    /** 欢迎页「打开文件」（send） */
    [IPC.FILE.WELCOME_OPEN_FILE]: []
    /** 导入内容另存为新文件（invoke） */
    [IPC.FILE.IMPORT_NEW_FILE]: [content: string]
    /** 创建文件/文件夹（invoke） */
    [IPC.FILE.CREATE_FILE_FOLDER]: [
        name: string,
        dirPath: string,
        isFolder: boolean,
        extension: string
    ]
    /** 读取当前活动文件所在目录（invoke） */
    [IPC.FILE.GET_CURRENT_FILE_PATH]: []
    /** 目录选择框（invoke；取消返回空字符串） */
    [IPC.FILE.SELECT_DIRECTORY]: []
    /** 图片选择框（invoke；插入图片对话框「本地文件 → 浏览」） */
    [IPC.FILE.SELECT_IMAGE]: []
    /** 编辑器内容同步（send；主进程写入 currentActiveFile.content） */
    [IPC.FILE.UPDATE_SELECT_FILE_CONTENT]: [content: string]
    /** 保存内容到磁盘（send；主进程先写入当前文件再落盘） */
    [IPC.FILE.SAVE_TO_DISK]: [content: string]
    /** 检查文件是否存在（invoke；受信范围外返回 false） */
    [IPC.FILE.CHECK_EXISTS]: [filePath: string]
    /** 读取 HTML 文件内容（invoke；受信范围 + 大小校验） */
    [IPC.FILE.READ_HTML]: [filePath: string]
    /** 读取本地二进制（invoke；仅 .pdf 且 ≤128MB，返回 Uint8Array） */
    [IPC.FILE.READ_BINARY]: [filePath: string]
    /** 在系统默认浏览器打开本地 HTML 文件（send；仅 .html/.htm + Path Guard） */
    [IPC.FILE.OPEN_IN_BROWSER]: [filePath: string]
    /** 按指定编码重新打开当前文件（invoke） */
    [IPC.FILE.REOPEN_WITH_ENCODING]: [encoding: string]
    /** 按指定编码转码保存当前文件（invoke） */
    [IPC.FILE.CONVERT_SAVE_ENCODING]: [encoding: string]

    // ============ 文件管理器右键动作（全部为 send） ============
    [IPC.FILE_MANAGER.COPY_RELATIVE_PATH]: [path: string]
    [IPC.FILE_MANAGER.COPY_IMAGELINK]: [path: string]
    [IPC.FILE_MANAGER.COPY_FILELINK]: [path: string]
    [IPC.FILE_MANAGER.COPY_FILE]: [path: string, isFile: boolean]
    [IPC.FILE_MANAGER.CUT]: [path: string, isFile: boolean]
    [IPC.FILE_MANAGER.PASTE]: [value: string, isFile: boolean]
    [IPC.FILE_MANAGER.OPEN_IN_EXPLORER]: [path: string]
    /**
     * 从磁盘重新加载（send）。主进程 handler 不读取任何参数，但渲染层历史调用
     * 仍会多传一个空字符串——按「可选忽略参数」标注（契约漂移记录见文件头）。
     */
    [IPC.FILE_MANAGER.RELOAD_FROM_DISK]: [ignoredArg?: string]
    [IPC.FILE_MANAGER.CREATE_FILE]: [dirPath: string, isFolder: boolean, fileExtension: string]
    [IPC.FILE_MANAGER.RENAME]: [path: string, isFile: boolean]
    [IPC.FILE_MANAGER.DELETE]: [path: string, isFile: boolean]
    [IPC.FILE_MANAGER.IMPORT_FROM]: [fileType: string]
    [IPC.FILE_MANAGER.FIND_IN]: [targetPath: string]

    // ============ 对话框确认动作（结构优化第 2 批 2.1：Vue 对话框替代 JSDOM 对话框） ============
    /** 重命名确认（invoke；用户在 Vue 重命名对话框确认后提交新名称） */
    [IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT]: [path: string, isFile: boolean, newName: string]
    /** 删除确认（invoke；用户在 Vue 删除确认对话框点击确认后执行删除） */
    [IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM]: [path: string, isFile: boolean]

    // ============ 插件工具 ============
    /** 生成 RSA 密钥对（send；bits 仅接受 1024/2048/3072/4096，非法回退 2048） */
    [IPC.PLUGIN.RSA_GENERATE]: [bits: number]
    /** 计算多种摘要（invoke） */
    [IPC.PLUGIN.HASH_TEXT]: [context: string, encType: string]
    /** 计算多种 HMAC（invoke） */
    [IPC.PLUGIN.HMAC_TEXT]: [context: string, secKey: string, encType: string]
    /** 对称加密（invoke） */
    [IPC.PLUGIN.CRYPTO_ENCRYPT]: [data: CryptoData]
    /** 对称解密（invoke；返回明文字符串） */
    [IPC.PLUGIN.CRYPTO_DECRYPT]: [data: CryptoData]

    // ============ 渲染 ============
    /** 插入图片（send；context 为图片 data URL 或粘贴载荷，主进程写入 images/） */
    [IPC.RENDER.INSERT_IMAGE]: [context: string]
    /** PlantUML 本地离线渲染（invoke；source 为图表源码） */
    [IPC.RENDER.PLANTUML_LOCAL]: [source: string]

    // ============ 导航 ============
    /** 打开本地可执行程序（send；主进程做路径/扩展名/受信目录多重校验） */
    [IPC.NAVIGATION.OPEN_EXE]: [exePath: string]

    // ============ 设置 ============
    /** 同步自动保存开关/间隔（invoke） */
    [IPC.SETTING.AUTO_SAVE_CHANGED]: [payload?: AutoSaveChangedPayload]

    // ============ 系统 ============
    /** 读取操作系统信息（invoke；返回 `${os.type()} ${os.arch()} ${os.release()}`） */
    [IPC.SYSTEM.SYSTEM_INFO]: []

    // ============ 快速链接 ============
    /** 读取快速链接（invoke；主进程唯一数据源 quickLinks 键） */
    [IPC.QUICK_LINKS.GET]: []
    /** 保存快速链接（invoke；主进程归一化后落盘并广播 UPDATED） */
    [IPC.QUICK_LINKS.SAVE]: [links: QuickLinkItem[]]
}

/* ============================================================================
 * 三、invoke 通道返回类型
 *
 * 键集合 = IpcRequests 中由主进程 registerHandleOnce 注册的通道（26 个）。
 * send 通道无返回值，故不在此表。
 * ========================================================================== */
export interface IpcResponses {
    // ============ 窗口控制 ============
    [IPC.WINDOW.GET_BOUNDS]: WindowBounds | null
    [IPC.WINDOW.IS_MAXIMIZED]: boolean

    // ============ 主题 ============
    [IPC.THEME.LOAD_MONACO_THEME]: MonacoThemeData | null
    [IPC.THEME.GET_CURRENT_THEME_STYLES]: ThemeStyles
    [IPC.THEME.GET_ALL_THEMES]: ThemeListItem[]
    [IPC.THEME.GET_ALL_MONACO_THEMES]: MonacoThemeListItem[]

    // ============ 编辑器 ============
    [IPC.EDITOR.GET_SETTING]: EditorSetting

    // ============ 文件 ============
    [IPC.FILE.IMPORT_NEW_FILE]: ImportNewFileResult
    [IPC.FILE.CREATE_FILE_FOLDER]: CreateFileFolderResult
    [IPC.FILE.GET_CURRENT_FILE_PATH]: string
    [IPC.FILE.SELECT_DIRECTORY]: string
    [IPC.FILE.SELECT_IMAGE]: SelectImageResult
    [IPC.FILE.CHECK_EXISTS]: boolean
    [IPC.FILE.READ_HTML]: string
    [IPC.FILE.READ_BINARY]: Uint8Array
    [IPC.FILE.REOPEN_WITH_ENCODING]: void
    [IPC.FILE.CONVERT_SAVE_ENCODING]: void

    // ============ 对话框确认动作 ============
    [IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT]: DialogActionResult
    [IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM]: DialogActionResult

    // ============ 插件工具 ============
    [IPC.PLUGIN.HASH_TEXT]: HashResult
    [IPC.PLUGIN.HMAC_TEXT]: HashResult
    [IPC.PLUGIN.CRYPTO_ENCRYPT]: CryptoResult
    [IPC.PLUGIN.CRYPTO_DECRYPT]: string

    // ============ 渲染 ============
    [IPC.RENDER.PLANTUML_LOCAL]: PlantumlRenderResponse

    // ============ 设置 ============
    [IPC.SETTING.AUTO_SAVE_CHANGED]: AutoSaveChangedResult

    // ============ 系统 ============
    [IPC.SYSTEM.SYSTEM_INFO]: string

    // ============ 快速链接 ============
    [IPC.QUICK_LINKS.GET]: QuickLinkItem[]
    [IPC.QUICK_LINKS.SAVE]: QuickLinksSaveResult
}

/* ============================================================================
 * 四、主进程 → 渲染层广播（on / once）监听回调参数元组
 *
 * 键集合 == preload ALLOWED_RENDERER_RECEIVE_CHANNELS（25 个，双向核对见测试）。
 * 元组即 ipcRenderer.on 回调除 event 之外的参数列表（单载荷 = 一元元组）。
 * ========================================================================== */
export interface IpcEvents {
    // ============ 对话框 ============
    /** 打开 Vue 对话框（dialogName + 可选 data，data 形状见 shared/types/dialog.ts） */
    [IPC.DIALOG.OPEN_VUE_DIALOG]: [dialogName: MainProcessDialogName, data?: MainProcessDialogData]

    // ============ 编辑器 ============
    /** 关闭/退出落盘协议：主进程请求渲染层立即同步内容（渲染层回发 FLUSH_CONTENT_DONE） */
    [IPC.EDITOR.FLUSH_CONTENT]: []
    /** 编辑器设置初始化/变更广播（完整 EditorSetting，Monaco 按值应用） */
    [IPC.EDITOR.INIT_SETTING]: [settings: EditorSetting]
    /** 编辑器选项 toggle 广播（Monaco 选项名 + 可选新值） */
    [IPC.EDITOR.UPDATE_OPTIONS]: [option: string, newValue?: string | number]

    // ============ 设置 ============
    /** 系统设置变更广播（完整 SystemSetting） */
    [IPC.SETTING.SYSTEM_SETTING_UPDATE]: [setting: SystemSetting]

    // ============ 事件 ============
    /** 从磁盘重载当前文件内容 */
    [IPC.EVENTS.FILE_CONTENT_RELOADED]: [payload: FileContentReloadedPayload]
    /** 文件保存成功（无载荷，渲染层清除未保存标记） */
    [IPC.EVENTS.FILE_SAVED_SUCCESS]: []
    /** 选中文件上下文（正文内容，渲染层载入编辑器） */
    [IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT]: [content: string]
    /** 状态栏更新（消息/类型/可选编码） */
    [IPC.EVENTS.STATUS_BAR_UPDATE]: [payload: StatusBarUpdatePayload]

    // ============ 文件 ============
    /** 清空编辑器预览（切目录/新建文件等场景） */
    [IPC.FILE.CLEAR_EDITOR_PREVIEW]: []
    /** 当前活动文件路径变更（状态栏/复制粘贴等消费） */
    [IPC.FILE.USER_SELECT_FILE]: [filePath: string]
    /** 进入主界面（欢迎页/启动恢复） */
    [IPC.FILE.WELCOME_ENTER_MAIN]: [payload: WelcomeEnterMainPayload]
    /** 以指定编码打开（编码菜单下发，渲染层随后 invoke REOPEN_WITH_ENCODING） */
    [IPC.FILE.OPEN_WITH_ENCODING]: [encoding: string]
    /** 转码保存（编码菜单下发，渲染层随后 invoke CONVERT_SAVE_ENCODING） */
    [IPC.FILE.CONVERT_TO_ENCODING]: [encoding: string]

    // ============ 文件管理器 ============
    /** 目录树数据（JSON 字符串，渲染层解析为 FileSysItem[]，含稳定 id 与展开态） */
    [IPC.FILE_MANAGER.FILE_SYSTEM_DATA]: [fileTreeJson: string]

    // ============ Monaco ============
    /** 光标处插入文本 */
    [IPC.MONACO.AFTER_CURSOR]: [content: string]
    /** 光标处插入文本块模板 */
    [IPC.MONACO.TEXT_BLOCK_TEMPLATES]: [content: string]
    /** 触发 Monaco 动作（undo/redo/剪贴板 action id 等） */
    [IPC.MONACO.UNDO_REDO]: [action: string]

    // ============ 插件工具 ============
    /** RSA 密钥对生成结果（两个独立参数：公钥、私钥） */
    [IPC.PLUGIN.RSA_RESULT]: [publicKey: string, privateKey: string]

    // ============ 快速链接 ============
    /** 快速链接保存成功后的最新列表（NaviTab 监听刷新） */
    [IPC.QUICK_LINKS.UPDATED]: [links: QuickLinkItem[]]

    // ============ 主题 ============
    /** 主题更新广播（载荷为 shared 唯一契约 ThemeUpdateData） */
    [IPC.THEME.THEME_UPDATED]: [data: ThemeUpdateData]

    // ============ 视图 ============
    /** 切换为纯编辑模式（主进程固定发送 null 占位） */
    [IPC.VIEW.EDIT_MODE]: [payload: null]
    /** 切换为纯预览模式 */
    [IPC.VIEW.PREVIEW_MODE]: [payload: null]
    /** 切换为编辑+预览模式 */
    [IPC.VIEW.EDIT_PREVIEW_MODE]: [payload: null]
    /** 切换资源管理器显隐 */
    [IPC.VIEW.TOGGLE_RES_MANAGER]: [payload: null]
}

/* ============================================================================
 * 五、preload 受限高层 API（window.api.*）直连通道契约
 *
 * 这些通道不经过渲染层白名单（preload 在自身闭包内直接用原始 ipcRenderer 调用，
 * 不向渲染层暴露），单独建表以完整覆盖「渲染层 → 主进程」方向的全部通道；
 * 不计入 IpcRequests 的 58 通道统计（白名单键集合以第 2 节为准）。
 * 对应实现：src/preload/index.ts 的 api.config / api.app / api.file。
 * ========================================================================== */
export interface IpcPreloadApiRequests {
    /** 读取配置（窗口白名单之外的受限 API 面） */
    [IPC.CONFIG.READ]: [configName: ConfigName]
    /** 写入配置（data 已由 preload 归一化为可结构化克隆的纯 JSON 值） */
    [IPC.CONFIG.WRITE]: [configName: ConfigName, data: ConfigWriteMap[ConfigName]]
    /** 渲染层就绪握手（App.vue onMounted 后通知主进程执行启动恢复） */
    [IPC.RENDER.READY]: []
    /** 读取应用/运行时版本信息 */
    [IPC.SYSTEM.APP_VERSION]: []
    /** 拉取最近文件/最近文件夹列表 */
    [IPC.FILE.RECENT_LIST]: []
    /** 打开最近项（主进程重新做最近列表白名单校验） */
    [IPC.FILE.OPEN_RECENT]: [payload: OpenRecentPayload]
}

export interface IpcPreloadApiResponses {
    /** 配置读取结果：按配置名的联合返回（调用方实际拿到的具体形状取决于 configName） */
    [IPC.CONFIG.READ]: ConfigReadMap[ConfigName] | null
    /** 配置写入是否成功（主进程失败返回 false，不抛异常） */
    [IPC.CONFIG.WRITE]: boolean
    [IPC.RENDER.READY]: void
    [IPC.SYSTEM.APP_VERSION]: AppVersionInfo
    [IPC.FILE.RECENT_LIST]: RecentListResult
    [IPC.FILE.OPEN_RECENT]: OpenRecentResult
}

/* ============================================================================
 * 六、按通道类别取形的便捷别名（供后续把渲染层调用点灰度替换为强类型封装）
 * ========================================================================== */

/** 全部 send / invoke 通道名 */
export type IpcSendChannel = keyof IpcRequests
/** 全部 invoke 通道名 */
export type IpcInvokeChannel = keyof IpcResponses
/** 全部广播事件通道名 */
export type IpcEventChannel = keyof IpcEvents

/** 取某 invoke 通道的请求参数元组 */
export type IpcInvokeArgs<K extends IpcInvokeChannel> = IpcRequests[K]
/** 取某 invoke 通道的返回类型 */
export type IpcInvokeResult<K extends IpcInvokeChannel> = IpcResponses[K]
/** 取某 send 通道的请求参数元组 */
export type IpcSendArgs<K extends IpcSendChannel> = IpcRequests[K]
/** 取某广播事件的监听回调参数元组 */
export type IpcEventArgs<K extends IpcEventChannel> = IpcEvents[K]
