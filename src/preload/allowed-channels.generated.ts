/**
 * ⚠️ 本文件由 build/generate-preload-whitelist.js 自动生成，禁止手工编辑。
 *
 * 真源：
 * - 主窗口 send/invoke：src/shared/types/ipc.ts 的 IpcRequests 键集合；
 * - 主窗口 on/once：同文件 IpcEvents 键集合；
 * - window.api.* 直连通道：同文件 IpcPreloadApiRequests 键集合（不经窗口白名单）；
 * - 对话框 preload：src/main/dialogs 内 `ipcRenderer.send/on('${IPC.X.Y}')` 实际调用。
 *
 * 生成命令：node build/generate-preload-whitelist.js
 * 一致性守护：tests/unit/preload-whitelist.test.ts（--check 模式，产物漂移即失败）。
 */
import { IPC } from '../shared/ipc-channels'
import type { IpcEventChannel, IpcPreloadApiRequests, IpcSendChannel } from '../shared/types/ipc'

/** IPC 常量表类型（用于校验生成通道都来自常量真源） */
type IpcConstantTable = typeof IPC

/** 全部合法通道字符串联合（IPC 常量表中任意组的任意值） */
type AllIpcChannel = {
    [Group in keyof IpcConstantTable]: IpcConstantTable[Group][keyof IpcConstantTable[Group]]
}[keyof IpcConstantTable]

/** window.api.* 直连通道键类型（来源 IpcPreloadApiRequests） */
type PreloadApiChannel = keyof IpcPreloadApiRequests

/** 渲染层 → 主进程（send / invoke）白名单：来源 IpcRequests，共 58 个 */
export const RENDERER_SEND_CHANNELS = [
    IPC.WINDOW.MINIMIZE,
    IPC.WINDOW.MAXIMIZE,
    IPC.WINDOW.CLOSE,
    IPC.WINDOW.TOGGLE_MAXIMIZE,
    IPC.WINDOW.GET_BOUNDS,
    IPC.WINDOW.IS_MAXIMIZED,
    IPC.WINDOW.MOVE,
    IPC.WINDOW.SET_SIZE,
    IPC.THEME.UPDATE_THEME,
    IPC.THEME.LOAD_MONACO_THEME,
    IPC.THEME.GET_CURRENT_THEME_STYLES,
    IPC.THEME.GET_ALL_THEMES,
    IPC.THEME.GET_ALL_MONACO_THEMES,
    IPC.MENU.ACTION,
    IPC.EDITOR.GET_SETTING,
    IPC.EDITOR.FLUSH_CONTENT_DONE,
    IPC.FILE.OPEN_SELECT_FILE,
    IPC.FILE.OPEN_SPECIFIC_FOLDER,
    IPC.FILE.WELCOME_OPEN_DIRECTORY,
    IPC.FILE.WELCOME_OPEN_FILE,
    IPC.FILE.IMPORT_NEW_FILE,
    IPC.FILE.CREATE_FILE_FOLDER,
    IPC.FILE.GET_CURRENT_FILE_PATH,
    IPC.FILE.SELECT_DIRECTORY,
    IPC.FILE.SELECT_IMAGE,
    IPC.FILE.UPDATE_SELECT_FILE_CONTENT,
    IPC.FILE.SAVE_TO_DISK,
    IPC.FILE.CHECK_EXISTS,
    IPC.FILE.READ_HTML,
    IPC.FILE.READ_BINARY,
    IPC.FILE.OPEN_IN_BROWSER,
    IPC.FILE.REOPEN_WITH_ENCODING,
    IPC.FILE.CONVERT_SAVE_ENCODING,
    IPC.FILE_MANAGER.COPY_RELATIVE_PATH,
    IPC.FILE_MANAGER.COPY_IMAGELINK,
    IPC.FILE_MANAGER.COPY_FILELINK,
    IPC.FILE_MANAGER.COPY_FILE,
    IPC.FILE_MANAGER.CUT,
    IPC.FILE_MANAGER.PASTE,
    IPC.FILE_MANAGER.OPEN_IN_EXPLORER,
    IPC.FILE_MANAGER.RELOAD_FROM_DISK,
    IPC.FILE_MANAGER.CREATE_FILE,
    IPC.FILE_MANAGER.RENAME,
    IPC.FILE_MANAGER.DELETE,
    IPC.FILE_MANAGER.IMPORT_FROM,
    IPC.FILE_MANAGER.FIND_IN,
    IPC.PLUGIN.RSA_GENERATE,
    IPC.PLUGIN.HASH_TEXT,
    IPC.PLUGIN.HMAC_TEXT,
    IPC.PLUGIN.CRYPTO_ENCRYPT,
    IPC.PLUGIN.CRYPTO_DECRYPT,
    IPC.RENDER.INSERT_IMAGE,
    IPC.RENDER.PLANTUML_LOCAL,
    IPC.NAVIGATION.OPEN_EXE,
    IPC.SETTING.AUTO_SAVE_CHANGED,
    IPC.SYSTEM.SYSTEM_INFO,
    IPC.QUICK_LINKS.GET,
    IPC.QUICK_LINKS.SAVE
] as const satisfies readonly IpcSendChannel[]

/** 主进程 → 渲染层（on / once）白名单：来源 IpcEvents，共 25 个 */
export const RENDERER_RECEIVE_CHANNELS = [
    IPC.DIALOG.OPEN_VUE_DIALOG,
    IPC.EDITOR.FLUSH_CONTENT,
    IPC.EDITOR.INIT_SETTING,
    IPC.EDITOR.UPDATE_OPTIONS,
    IPC.SETTING.SYSTEM_SETTING_UPDATE,
    IPC.EVENTS.FILE_CONTENT_RELOADED,
    IPC.EVENTS.FILE_SAVED_SUCCESS,
    IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT,
    IPC.EVENTS.STATUS_BAR_UPDATE,
    IPC.FILE.CLEAR_EDITOR_PREVIEW,
    IPC.FILE.USER_SELECT_FILE,
    IPC.FILE.WELCOME_ENTER_MAIN,
    IPC.FILE.OPEN_WITH_ENCODING,
    IPC.FILE.CONVERT_TO_ENCODING,
    IPC.FILE_MANAGER.FILE_SYSTEM_DATA,
    IPC.MONACO.AFTER_CURSOR,
    IPC.MONACO.TEXT_BLOCK_TEMPLATES,
    IPC.MONACO.UNDO_REDO,
    IPC.PLUGIN.RSA_RESULT,
    IPC.QUICK_LINKS.UPDATED,
    IPC.THEME.THEME_UPDATED,
    IPC.VIEW.EDIT_MODE,
    IPC.VIEW.PREVIEW_MODE,
    IPC.VIEW.EDIT_PREVIEW_MODE,
    IPC.VIEW.TOGGLE_RES_MANAGER
] as const satisfies readonly IpcEventChannel[]

/** window.api.* 直连通道（不经窗口白名单）：来源 IpcPreloadApiRequests，共 6 个 */
export const PRELOAD_API_CHANNELS = [
    IPC.CONFIG.READ,
    IPC.CONFIG.WRITE,
    IPC.RENDER.READY,
    IPC.SYSTEM.APP_VERSION,
    IPC.FILE.RECENT_LIST,
    IPC.FILE.OPEN_RECENT
] as const satisfies readonly PreloadApiChannel[]

/** 对话框 preload send 白名单：来源 src/main/dialogs 实际调用，共 2 个 */
export const DIALOG_SEND_CHANNELS = [
    IPC.DIALOG.CREATE_FILE_FOLDER_ENTER,
    IPC.DIALOG.RENAME_FILE_FOLDER_ENTER
] as const satisfies readonly AllIpcChannel[]

/** 对话框 preload on/once 白名单：来源 src/main/dialogs 实际调用，共 1 个 */
export const DIALOG_RECEIVE_CHANNELS = [
    IPC.THEME.THEME_UPDATED
] as const satisfies readonly AllIpcChannel[]

/* ==========================================================================
 * 编译期穷尽性断言（H2「新增 IPC 漏登记即静默丢弃」的编译期兜底）
 *
 * 契约新增通道但未重新执行生成器时，下面的 Exclude<契约通道, 已生成通道> 不为 never，
 * 断言类型解析为 never，= true 赋值会让 tsc 直接编译失败。
 * 运行期兜底：tests/unit/preload-whitelist.test.ts 的「生成产物 ↔ 契约」双向核对。
 * ========================================================================== */

type AssertRendererSendExhaustive =
    Exclude<IpcSendChannel, (typeof RENDERER_SEND_CHANNELS)[number]> extends never ? true : never

/** 编译期断言常量（恒为 true；测试同时做运行期断言） */
export const ASSERT_RENDERER_SEND_EXHAUSTIVE: AssertRendererSendExhaustive = true

type AssertRendererReceiveExhaustive =
    Exclude<IpcEventChannel, (typeof RENDERER_RECEIVE_CHANNELS)[number]> extends never
        ? true
        : never

/** 编译期断言常量（恒为 true；测试同时做运行期断言） */
export const ASSERT_RENDERER_RECEIVE_EXHAUSTIVE: AssertRendererReceiveExhaustive = true

type AssertPreloadApiExhaustive =
    Exclude<PreloadApiChannel, (typeof PRELOAD_API_CHANNELS)[number]> extends never ? true : never

/** 编译期断言常量（恒为 true；测试同时做运行期断言） */
export const ASSERT_PRELOAD_API_EXHAUSTIVE: AssertPreloadApiExhaustive = true
