/**
 * IPC 载荷契约（第 2 批契约重构：渲染层 ↔ 主进程通道参数/返回值/广播载荷的唯一类型真源）
 *
 * ## 三张契约表
 * - `IpcRequests`：渲染层 → 主进程（send / invoke）通道 → **参数元组**。
 *   键集合与 preload 的 `ALLOWED_RENDERER_SEND_CHANNELS` 白名单**完全相等**（65 个通道）；
 * - `IpcResponses`：invoke（ipcMain.handle）通道 → 返回类型。
 *   键集合 = IpcRequests 中「主进程以 registerHandleOnce 注册」的通道（32 个）；
 * - `IpcEvents`：主进程 → 渲染层广播（ipcRenderer.on/once）通道 → 监听回调参数元组
 *   （单载荷即一元元组）。键集合与 preload 的 `ALLOWED_RENDERER_RECEIVE_CHANNELS`
 *   白名单**完全相等**（28 个通道）。
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

/* ----------------------------------------------------------------------------
 * 关闭/退出「未保存修改」确认（2026-11-20：原生 dialog.showMessageBox → 应用内 BaseDialog）
 *
 * 通信链路（双通道协议，对齐 IPC-05 的 FLUSH_CONTENT / FLUSH_CONTENT_DONE 先例）：
 *   1. 主进程关闭/退出协议检测到脏文件后 `webContents.send(IPC.DIALOG.UNSAVED_CLOSE_REQUEST, payload)`；
 *   2. 渲染层主界面常驻的 UnsavedCloseConfirmHost 打开 BaseDialog 风格的
 *      UnsavedChangesDialog，用户选择后 `invoke(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, choice)` 回传；
 *   3. 主进程 handler 对 save 分支执行真实保存并回传 ok/失败（失败保留对话框供重试），
 *      随后关闭协议据此放行或中止。
 * 主进程侧有 30s 超时 / 窗口销毁 / 渲染进程退出兜底（统一按 cancel 安全侧处理），
 * 渲染层不可用时回退原生确认框并记录原因（见 src/main/utils/close-confirm.ts）。
 * -------------------------------------------------------------------------- */

/** 用户在「未保存修改」确认框中的选择（主进程与渲染层共用唯一真源） */
export type UnsavedCloseChoice = 'save' | 'discard' | 'cancel'

/**
 * UNSAVED_CLOSE_REQUEST 广播载荷（主进程 → 渲染层）。
 * 仅承载展示语义；文案由渲染层按当前语言装配。
 */
export interface UnsavedCloseRequestPayload {
    /**
     * 本次「关闭」动作实际是隐藏到系统托盘（minimizeToTray 开启且非显式退出）：
     * 渲染层据此把「保存并关闭」改为「保存并隐藏」并使用托盘说明文案。
     */
    minimizeToTray: boolean
}

/**
 * UNSAVED_CLOSE_SUBMIT 返回结构（渲染层 invoke → 主进程）。
 * - `ok: true`：选择已受理（save 表示已成功保存并放行关闭；discard/cancel 表示选择已生效）；
 * - `ok: false, stale: true`：主进程侧等待已结束（超时/窗口销毁等），渲染层应直接收起对话框，
 *   本次关闭不会发生（用户可重新触发关闭）；
 * - `ok: false`（其余）：动作失败（save 保存失败；含未受信发送方拒绝对象，按失败处理），
 *   渲染层保留对话框并展示错误，用户可重试 / 改选「不保存」/「取消」。
 */
export interface UnsavedCloseSubmitResult {
    ok: boolean
    /** true = 主进程已无等待中的关闭确认（超时/窗口销毁兜底后），对话框应直接收起 */
    stale?: boolean
}

/** PLUGIN.HASH_TEXT / PLUGIN.HMAC_TEXT 返回结构（算法名 → 摘要字符串） */
export interface HashResult {
    [algorithm: string]: string
}

/* ----------------------------------------------------------------------------
 * 通用应用内消息/确认对话框服务（2026-11-21：替换主进程全部用户可见原生
 * dialog.showMessageBox，关闭确认的原生兜底除外）
 *
 * 通信链路（显式双通道协议，复用关闭确认已建立模式；见 src/main/utils/app-message-box.ts）：
 *   1. 主进程 `showAppMessageBox()` 经 `webContents.send(IPC.DIALOG.APP_MESSAGE_REQUEST, payload)`
 *      请求渲染层展示 BaseDialog 风格消息框（requestId 关联本次请求）；
 *   2. 渲染层 `AppMessageBoxHost` 驱动 `AppMessageDialog.vue`，用户选择后
 *      `invoke(IPC.DIALOG.APP_MESSAGE_SUBMIT, requestId, choiceId)` 回传；
 *   3. 主进程在超时（默认 30s）/ 窗口销毁 / 渲染进程崩溃 / 重复回执等场景统一兜底：
 *      超时先发 `APP_MESSAGE_DISMISS` 撤销应用内框再回退原生 `dialog.showMessageBox`；
 *   4. 宿主挂载/卸载经 `IPC.DIALOG.APP_MESSAGE_HOST_READY` 发送 ready 握手，
 *      宿主未就绪（欢迎页/加载中）时主进程直接回退原生框并记录 warn。
 * -------------------------------------------------------------------------- */

/** 应用内消息框类型（对应原生 MessageBox type） */
export type AppMessageBoxKind = 'info' | 'warning' | 'error' | 'confirm'

/** 按钮语义样式：primary=主操作（强调色）/ danger=破坏性操作（危险色）/ default=普通 */
export type AppMessageBoxButtonKind = 'primary' | 'danger' | 'default'

/** 应用内消息框按钮（id 为回传选择的稳定标识，不随语言变化） */
export interface AppMessageBoxButton {
    /** 按钮稳定标识（回传主进程的 choiceId；同一次请求内唯一） */
    id: string
    /** 按钮文案（主进程已按当前语言本地化） */
    label: string
    /** 视觉语义（可选；缺省为普通按钮） */
    kind?: AppMessageBoxButtonKind
}

/**
 * APP_MESSAGE_REQUEST 广播载荷（主进程 → 渲染层）。
 *
 * 渲染层只负责展示与回传 choiceId；语义动作（打开可执行程序 / 继续打开大文件 /
 * 安装更新等）始终由主进程在拿到结果后执行。
 */
export interface AppMessageBoxRequestPayload {
    /** 请求唯一标识（回执必须原样带回，用于匹配等待中的请求） */
    requestId: string
    /** 消息框类型（决定视觉语义与原生兜底的 type） */
    kind: AppMessageBoxKind
    /** 标题（主进程已本地化） */
    title: string
    /** 正文（主进程已本地化） */
    message: string
    /** 补充说明（可选，支持换行） */
    detail?: string
    /** 按钮列表（至少 1 个；支持单按钮 info/error 与双/三按钮 confirm） */
    buttons: AppMessageBoxButton[]
    /** 默认聚焦/回车触发的按钮 id（缺省取第一个按钮） */
    defaultId: string
    /** 取消语义按钮 id：Esc / 标题栏关闭 / 超时兜底均映射到它（缺省取最后一个按钮） */
    cancelId: string
    /** 等待渲染层回执的超时（毫秒，可选；主进程另有默认 30s 与钳制） */
    timeoutMs?: number
}

/**
 * APP_MESSAGE_SUBMIT 返回结构（渲染层 invoke → 主进程）。
 * - `ok: true`：选择已受理并结算等待中的请求；
 * - `ok: false, stale: true`：主进程侧等待已结束（超时/窗口销毁/重复回执），
 *   渲染层应直接收起对话框（本次请求已由主进程兜底处理）。
 */
export interface AppMessageBoxSubmitResult {
    ok: boolean
    /** true = 主进程已无匹配的等待中请求（过期/重复回执） */
    stale?: boolean
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

/* ----------------------------------------------------------------------------
 * A2 全工作区搜索/替换（2026-11-21，默认开启）
 *
 * 通信链路（IPC-17 六步链路）：
 *   1. 常量：shared/ipc-channels.ts 的 IPC.FILE.SEARCH_WORKSPACE / REPLACE_WORKSPACE；
 *   2. 契约：本段 WorkspaceSearch* / WorkspaceReplace* 类型 + 三表登记；
 *   3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 *   4. 主进程：ipc/workspace-search-ipc.ts（registry 编排 + withSenderCheck）→
 *      utils/workspace-search.ts（搜索/替换服务，只信任 appState.rootPath 工作区根）；
 *   5. 渲染层：composables/useWorkspaceSearch.ts + components/search/**；
 *   6. 测试：通道命名/契约/白名单/注册 + 服务边界 + 组件交互。
 *
 * 安全边界：
 * - 工作区根只由主进程持有（appState.rootPath），渲染层不传根路径；
 * - 递归跳过 node_modules/.git 等依赖、VCS 与敏感目录，跳过符号链接（防逃逸/循环）；
 * - 单文件大小、匹配总数、文件清单数均有上限并用 truncated 标记；
 * - 替换前重新读取文件、逐路径做「工作区内 + 非符号链接 + realpath 不逃逸」校验，
 *   任一失败整体拒绝；错误以结构化 code 返回（不向渲染层泄漏堆栈）。
 * -------------------------------------------------------------------------- */

/** 工作区搜索查询选项（FILE.SEARCH_WORKSPACE 请求载荷） */
export interface WorkspaceSearchOptions {
    /** 查询文本；listFilesOnly=true 时可缺省/为空 */
    query?: string
    /** 是否区分大小写（默认 false） */
    caseSensitive?: boolean
    /** 是否整词匹配（默认 false） */
    wholeWord?: boolean
    /** 是否按正则解释查询（默认 false；非法正则返回 INVALID_REGEX） */
    useRegex?: boolean
    /** 仅列出工作区文本文件（Quick Open 复用，不执行内容搜索） */
    listFilesOnly?: boolean
    /** 期望的匹配结果上限（主进程钳制到实现上限，默认 500） */
    maxResults?: number
}

/** 单条匹配（行/列均为 1-based） */
export interface WorkspaceSearchMatch {
    /** 匹配所在行号（1-based） */
    line: number
    /** 匹配起始列号（1-based） */
    column: number
    /** 该行预览文本（可能被截断） */
    preview: string
}

/** 工作区文本文件条目（搜索列表/文件清单/替换结果共用） */
export interface WorkspaceFileEntry {
    /** 文件绝对路径（主进程生成，可直接用于打开/替换） */
    filePath: string
    /** 相对工作区根的路径（正斜杠归一化，用于展示） */
    relativePath: string
}

/** 单个文件的搜索结果 */
export interface WorkspaceSearchFileResult extends WorkspaceFileEntry {
    /** 该文件内的匹配列表（按行号/列号升序） */
    matches: WorkspaceSearchMatch[]
}

/** 工作区搜索结构化错误码（渲染层按 code 映射 i18n 文案） */
export type WorkspaceSearchErrorCode =
    'NO_WORKSPACE' | 'INVALID_QUERY' | 'INVALID_REGEX' | 'SEARCH_FAILED' | 'INTERNAL_ERROR'

/** FILE.SEARCH_WORKSPACE 返回结构 */
export interface WorkspaceSearchResult {
    /** 是否成功（安全失败不抛异常，返回 ok=false + code） */
    ok: boolean
    /** 失败原因（ok=false 时存在） */
    code?: WorkspaceSearchErrorCode
    /** 命中文件列表（listFilesOnly=true 时为空数组） */
    files: WorkspaceSearchFileResult[]
    /** 工作区文本文件清单（仅 listFilesOnly=true 时返回） */
    fileList?: WorkspaceFileEntry[]
    /** 是否因匹配/文件/扫描上限被截断 */
    truncated: boolean
    /** 实际收集到的匹配总数 */
    matchCount: number
    /** 实际扫描的文本文件数 */
    scannedFiles: number
}

/** 工作区替换选项（FILE.REPLACE_WORKSPACE 请求载荷） */
export interface WorkspaceReplaceOptions {
    /** 查询文本（与搜索同口径） */
    query: string
    /** 是否区分大小写（默认 false） */
    caseSensitive?: boolean
    /** 是否整词匹配（默认 false） */
    wholeWord?: boolean
    /** 是否按正则解释查询（默认 false） */
    useRegex?: boolean
    /** 替换文本（可为空串 = 删除匹配；正则模式支持 $1/$&/$$ 回填） */
    replacement: string
    /**
     * 待替换文件绝对路径列表（必须位于工作区根内）。
     * 单处替换时传一个文件；全部替换时传搜索结果中的全部文件。
     */
    filePaths: string[]
    /** 单处替换目标行（1-based）；缺省 = 替换 filePaths 中全部匹配 */
    line?: number
    /** 单处替换目标列（1-based，匹配起始列）；缺省 = 替换该行全部匹配 */
    column?: number
}

/** 单文件替换结果 */
export interface WorkspaceReplaceFileResult extends WorkspaceFileEntry {
    /** 该文件实际替换次数 */
    replacements: number
}

/** 工作区替换结构化错误码（渲染层按 code 映射 i18n 文案） */
export type WorkspaceReplaceErrorCode =
    | 'NO_WORKSPACE'
    | 'INVALID_QUERY'
    | 'INVALID_REGEX'
    | 'INVALID_INPUT'
    | 'PATH_DENIED'
    | 'FILE_CHANGED'
    | 'WRITE_FAILED'
    | 'NO_MATCH'
    | 'INTERNAL_ERROR'

/** FILE.REPLACE_WORKSPACE 返回结构（安全失败返回 ok=false + code） */
export interface WorkspaceReplaceResult {
    /** 是否成功 */
    ok: boolean
    /** 失败原因（ok=false 时存在） */
    code?: WorkspaceReplaceErrorCode
    /** 已写入的文件与次数（WRITE_FAILED 时可能部分写入） */
    files: WorkspaceReplaceFileResult[]
    /** 实际写入的替换总数 */
    totalReplacements: number
}

/* ============================================================================
 * 二、渲染层 → 主进程（send / invoke）请求参数元组
 *
 * 键集合 == preload ALLOWED_RENDERER_SEND_CHANNELS（65 个，双向核对见测试）。
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
    /** A2 搜索工作区文本文件（invoke；只搜主进程持有的工作区根） */
    [IPC.FILE.SEARCH_WORKSPACE]: [options: WorkspaceSearchOptions]
    /** A2 替换工作区文本文件内容（invoke；主进程重校验路径后重新读取并写盘） */
    [IPC.FILE.REPLACE_WORKSPACE]: [options: WorkspaceReplaceOptions]

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
    /**
     * 关闭/退出「未保存修改」确认结果（invoke；渲染层应用内对话框 → 主进程）。
     * save 分支由主进程执行保存并返回 ok/失败（失败保留对话框供重试）。
     */
    [IPC.DIALOG.UNSAVED_CLOSE_SUBMIT]: [choice: UnsavedCloseChoice]
    /** 通用应用内消息框选择回执（invoke；requestId 用于匹配等待中的请求） */
    [IPC.DIALOG.APP_MESSAGE_SUBMIT]: [requestId: string, choiceId: string]
    /** 通用应用内消息框宿主就绪握手（send；挂载 true / 卸载 false） */
    [IPC.DIALOG.APP_MESSAGE_HOST_READY]: [ready: boolean]

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
 * 键集合 = IpcRequests 中由主进程 registerHandleOnce 注册的通道（32 个）。
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
    /** A2 工作区搜索（invoke；安全失败返回 ok=false + code，不抛异常） */
    [IPC.FILE.SEARCH_WORKSPACE]: WorkspaceSearchResult
    /** A2 工作区替换（invoke；安全失败返回 ok=false + code，不抛异常） */
    [IPC.FILE.REPLACE_WORKSPACE]: WorkspaceReplaceResult

    // ============ 对话框确认动作 ============
    [IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT]: DialogActionResult
    [IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM]: DialogActionResult
    [IPC.DIALOG.UNSAVED_CLOSE_SUBMIT]: UnsavedCloseSubmitResult
    [IPC.DIALOG.APP_MESSAGE_SUBMIT]: AppMessageBoxSubmitResult

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
 * 键集合 == preload ALLOWED_RENDERER_RECEIVE_CHANNELS（26 个，双向核对见测试）。
 * 元组即 ipcRenderer.on 回调除 event 之外的参数列表（单载荷 = 一元元组）。
 * ========================================================================== */
export interface IpcEvents {
    // ============ 对话框 ============
    /** 打开 Vue 对话框（dialogName + 可选 data，data 形状见 shared/types/dialog.ts） */
    [IPC.DIALOG.OPEN_VUE_DIALOG]: [dialogName: MainProcessDialogName, data?: MainProcessDialogData]
    /**
     * 关闭/退出「未保存修改」确认请求（主进程 → 渲染层）：渲染层收到后打开应用内
     * UnsavedChangesDialog，用户选择经 UNSAVED_CLOSE_SUBMIT invoke 回传。
     */
    [IPC.DIALOG.UNSAVED_CLOSE_REQUEST]: [payload: UnsavedCloseRequestPayload]
    /**
     * 通用应用内消息/确认框请求（主进程 → 渲染层）：渲染层收到后打开
     * AppMessageDialog，用户选择经 APP_MESSAGE_SUBMIT invoke 回传。
     */
    [IPC.DIALOG.APP_MESSAGE_REQUEST]: [payload: AppMessageBoxRequestPayload]
    /**
     * 撤销应用内消息框（主进程 → 渲染层）：主进程等待超时、即将回退原生框或
     * 渲染层宿主卸载时发送，渲染层按 requestId 关闭对应消息框（无匹配则忽略）。
     */
    [IPC.DIALOG.APP_MESSAGE_DISMISS]: [requestId: string]

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
