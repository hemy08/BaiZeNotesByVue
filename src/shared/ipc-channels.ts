/**
 * IPC 通道常量（ARC-03：全项目唯一真源）
 *
 * 规则：
 * - 主进程 / preload / 渲染层的 ipcMain、ipcRenderer、webContents.send、
 *   ipcListenerManager 注册一律引用本文件常量，禁止再写通道字符串字面量；
 * - 通道字符串统一为 `baize:<domain>:<name>`（2026-11-15 命名统一后 100% 带 `baize:`
 *   前缀，domain 限定 17 个白名单，见 tests/unit/ipc-channel-naming.test.ts）；
 * - 常量分组与通道 domain 一一对应（2026-11-18 遗留清单 #3/#7 修复：原 CQ-13 的
 *   10 个「域错配」通道已归位——编码类 4 通道并入 FILE 组、系统类 3 通道新建 SYSTEM 组、
 *   设置类 2 通道新建 SETTING 组、Monaco 类 2 通道并入 MONACO 组）；
 *   **例外：EVENTS 组**收纳跨 domain 的渲染层事件通知（file:/fs:/status-bar:），
 *   属方向性分组而非 domain 分组（2026-11-19 注释澄清）；
 * - 同名通道只定义一份（如 get-quick-links 统一放 QUICK_LINKS 组）。
 *
 * 防回归：tests/unit/ipc-channel-constants.test.ts 用 fs 解析本文件与
 * src 下全部 IPC 调用点做交叉核对。
 */
export const IPC = {
    // ============ 窗口控制 ============
    WINDOW: {
        MINIMIZE: 'baize:window:minimize',
        MAXIMIZE: 'baize:window:maximize',
        CLOSE: 'baize:window:close',
        TOGGLE_MAXIMIZE: 'baize:window:toggle-maximize',
        GET_BOUNDS: 'baize:window:get-bounds',
        IS_MAXIMIZED: 'baize:window:is-maximized',
        MOVE: 'baize:window:move',
        SET_SIZE: 'baize:window:set-size'
    } as const,

    // ============ 配置文件 API（config-manager，渲染层经 window.api.config.*） ============
    CONFIG: {
        READ: 'baize:config:read',
        WRITE: 'baize:config:write'
    } as const,

    // ============ 主题 ============
    THEME: {
        UPDATE_THEME: 'baize:theme:update',
        THEME_UPDATED: 'baize:theme:updated',
        LOAD_MONACO_THEME: 'baize:theme:load-monaco',
        GET_CURRENT_THEME_STYLES: 'baize:theme:get-current-styles',
        GET_ALL_THEMES: 'baize:theme:get-all',
        GET_ALL_MONACO_THEMES: 'baize:theme:get-all-monaco'
    } as const,

    // ============ 菜单 ============
    MENU: {
        ACTION: 'baize:menu:action'
    } as const,

    // ============ 编辑器 ============
    EDITOR: {
        GET_SETTING: 'baize:editor:get-setting',
        INIT_SETTING: 'baize:editor:init-setting',
        UPDATE_OPTIONS: 'baize:editor:update-options',
        // D-3/FUN-03：关闭/退出落盘协议（主进程 → 渲染层 → 回执）
        FLUSH_CONTENT: 'baize:editor:flush-content',
        FLUSH_CONTENT_DONE: 'baize:editor:flush-content-done'
    } as const,

    // ============ 文件 ============
    FILE: {
        OPEN_SPECIFIC_FOLDER: 'baize:file:open-specific-folder',
        WELCOME_OPEN_DIRECTORY: 'baize:file:welcome-open-directory',
        WELCOME_OPEN_FILE: 'baize:file:welcome-open-file',
        WELCOME_ENTER_MAIN: 'baize:file:welcome-enter-main',
        OPEN_SELECT_FILE: 'baize:file:open-select-file',
        IMPORT_NEW_FILE: 'baize:file:import',
        CREATE_FILE_FOLDER: 'baize:file:create-entry',
        GET_CURRENT_FILE_PATH: 'baize:file:get-current-path',
        SELECT_DIRECTORY: 'baize:file:select-directory',
        // P1-FE-03：插入图片对话框「本地文件」浏览——主进程弹出系统图片选择框，
        // 返回选中文件绝对路径，并尽力复制到当前文档同目录的 images/ 下，
        // 返回可直接写入 Markdown 的相对引用（无活动文件/复制失败时回退绝对路径）。
        SELECT_IMAGE: 'baize:file:select-image',
        CLEAR_EDITOR_PREVIEW: 'baize:file:clear-editor-preview',
        SAVE_TO_DISK: 'baize:file:save-content-to-disk',
        UPDATE_SELECT_FILE_CONTENT: 'baize:file:update-content',
        CHECK_EXISTS: 'baize:file:check-exists',
        READ_HTML: 'baize:file:read-html',
        // 2026-11-18（遗留清单 #9）：PDF 预览改走 pdf.js 方案，需要读取原始二进制。
        // 主进程经 Path Guard 校验后返回 Uint8Array（IPC 结构化克隆支持），
        // 渲染层交给 pdf.js 解析渲染（不再依赖 Electron 内置 PDF 查看器/iframe）。
        READ_BINARY: 'baize:file:read-binary',
        // 2026-11-18（遗留清单 #1）：HTML 查看器「在浏览器中打开」本地 .html 文件专用通道。
        // 本地文件不走 http/https 白名单（原 OPEN_EXTERNAL_LINK 已随第 5 批 5.1 删除）；
        // 主进程做「扩展名 + Path Guard」校验后再交给系统默认浏览器。
        OPEN_IN_BROWSER: 'baize:file:open-in-browser',
        USER_SELECT_FILE: 'baize:file:user-select-file',
        // 「文件」菜单 → 最近文件/最近文件夹：渲染层 invoke 拉取两个列表（各最多 20 项）
        RECENT_LIST: 'baize:file:recent-list',
        // 「文件」菜单 → 点击最近项：渲染层 invoke 请求主进程打开（主进程做最近列表白名单
        // 校验后复用 OpenSelectFile / 目录打开链路；渲染层不直接持有打开文件能力）
        OPEN_RECENT: 'baize:file:open-recent',
        // FUN-02：编码菜单链路——主进程下发编码名（open/convert）与渲染层请求
        // 按指定编码重开/转码保存（reopen/convert-save）
        OPEN_WITH_ENCODING: 'baize:file:open-with-encoding',
        CONVERT_TO_ENCODING: 'baize:file:convert-to-encoding',
        REOPEN_WITH_ENCODING: 'baize:file:reopen-with-encoding',
        // 2026-11-19（命名统一）：原值 `file:convert-encoding` 与 CONVERT_TO_ENCODING
        // （`file:convert-to-encoding`）仅差 "to"，语义易混——改为 convert-save-encoding
        // （按指定编码转码保存），全端同步（utils.ts / preload 白名单 / 渲染层 / 文档）。
        CONVERT_SAVE_ENCODING: 'baize:file:convert-save-encoding',
        // A2（2026-11-21）：全工作区搜索/替换（默认开启）。
        // 两个通道均为 invoke：主进程只搜索 appState.rootPath 工作区根（不信任渲染层传入根路径），
        // 递归 .md/.markdown/.txt 并做上限/忽略目录/符号链接防护；替换由主进程重新读取文件并写盘。
        // Quick Open 的文件清单复用 SEARCH_WORKSPACE 的 listFilesOnly 选项（不额外新增通道）。
        SEARCH_WORKSPACE: 'baize:file:search-workspace',
        REPLACE_WORKSPACE: 'baize:file:replace-workspace'
    } as const,

    // ============ 文件管理器右键菜单 ============
    FILE_MANAGER: {
        COPY_RELATIVE_PATH: 'baize:fs:copy-relative-path',
        COPY_IMAGELINK: 'baize:fs:copy-image-link',
        COPY_FILELINK: 'baize:fs:copy-file-link',
        COPY_FILE: 'baize:fs:copy-file',
        CUT: 'baize:fs:cut',
        PASTE: 'baize:fs:paste',
        OPEN_IN_EXPLORER: 'baize:fs:open-in-explorer',
        RELOAD_FROM_DISK: 'baize:fs:reload-from-disk',
        CREATE_FILE: 'baize:fs:create-file',
        RENAME: 'baize:fs:rename',
        DELETE: 'baize:fs:delete',
        IMPORT_FROM: 'baize:fs:import-from',
        FIND_IN: 'baize:fs:find-in',
        FILE_SYSTEM_DATA: 'baize:fs:file-system-data'
    } as const,

    // ============ 插件工具（加解密/生成器） ============
    PLUGIN: {
        RSA_GENERATE: 'baize:plugin:rsa-generate',
        RSA_RESULT: 'baize:plugin:rsa-result',
        HASH_TEXT: 'baize:plugin:hash-text',
        HMAC_TEXT: 'baize:plugin:hmac-text',
        CRYPTO_ENCRYPT: 'baize:plugin:crypto-encrypt',
        CRYPTO_DECRYPT: 'baize:plugin:crypto-decrypt'
    } as const,

    // ============ 渲染（Markdown 预览本地渲染与图片插入） ============
    // PF-02：原 PRE_RENDER / POST_RENDER / PRE_RENDER_RESULT / POST_RENDER_RESULT 四个
    // 主进程渲染通道已随"预览本地单跳渲染"重构移除（渲染层 preview-local-render.ts 完成）。
    RENDER: {
        INSERT_IMAGE: 'baize:render:insert-image',
        // PF-08：PlantUML 本地离线渲染（主进程隐藏窗口），渲染层 invoke 调用
        PLANTUML_LOCAL: 'baize:render:plantuml-local',
        // P2-5：渲染层就绪握手（App.vue onMounted 完成后经 preload 发送，
        // 主进程收到后才执行启动恢复，避免恢复消息早于渲染层监听器注册被丢弃）
        READY: 'baize:render:ready'
    } as const,

    // ============ 对话框 ============
    // 结构优化第 2 批 2.1（H3）：原主进程 JSDOM 对话框体系收敛为渲染层 Vue + BaseDialog，
    // 主进程只保留「请求渲染层打开对话框」与「对话框确认后执行动作」两类通道：
    // - OPEN_VUE_DIALOG：主进程 → 渲染层（open-vue），请求打开 Vue 对话框；
    // - RENAME_FILE_FOLDER_SUBMIT / DELETE_FILE_FOLDER_CONFIRM：渲染层 → 主进程（invoke），
    //   用户在 Vue 对话框确认后提交重命名/删除动作（替代原 JSDOM 对话框 preload 的
    //   CREATE_FILE_FOLDER_ENTER / RENAME_FILE_FOLDER_ENTER 两个回车通道；
    //   新建文件/文件夹统一复用既有 IPC.FILE.CREATE_FILE_FOLDER invoke 动作）。
    // 2026-11-20（关闭确认应用内对话框）：关闭/退出时的「未保存修改」确认由主进程原生
    // dialog.showMessageBox 改为应用内 BaseDialog，采用显式双通道协议：
    // - UNSAVED_CLOSE_REQUEST：主进程 → 渲染层，请求显示应用内确认框（载荷含托盘语义）；
    // - UNSAVED_CLOSE_SUBMIT：渲染层 → 主进程（invoke），回传用户选择（save/discard/cancel），
    //   「保存并关闭」在 handler 内执行保存并回传成功/失败（失败保留对话框供重试）。
    DIALOG: {
        RENAME_FILE_FOLDER_SUBMIT: 'baize:dialog:rename-file-folder-submit',
        DELETE_FILE_FOLDER_CONFIRM: 'baize:dialog:delete-file-folder-confirm',
        OPEN_VUE_DIALOG: 'baize:dialog:open-vue',
        UNSAVED_CLOSE_REQUEST: 'baize:dialog:unsaved-close-request',
        UNSAVED_CLOSE_SUBMIT: 'baize:dialog:unsaved-close-submit',
        // 2026-11-21（应用内消息/确认对话框通用服务）：替换主进程全部用户可见原生
        // dialog.showMessageBox（关闭确认的原生兜底除外）。四通道显式双通道协议：
        // - APP_MESSAGE_REQUEST（主进程 → 渲染层）：请求展示应用内消息框（含 requestId /
        //   kind / 标题 / 正文 / 详情 / 按钮列表 / 默认/取消按钮 / 超时）；
        // - APP_MESSAGE_SUBMIT（渲染层 → 主进程 invoke）：回传用户选择（requestId + choiceId）；
        // - APP_MESSAGE_DISMISS（主进程 → 渲染层）：超时回退原生前撤销应用内框
        //   （避免「应用内框 + 原生框」双弹）；
        // - APP_MESSAGE_HOST_READY（渲染层 → 主进程 send）：消息框宿主挂载/卸载握手，
        //   宿主未就绪（欢迎页未进入主界面）时主进程直接回退原生框，不白等超时。
        APP_MESSAGE_REQUEST: 'baize:dialog:app-message-request',
        APP_MESSAGE_SUBMIT: 'baize:dialog:app-message-submit',
        APP_MESSAGE_DISMISS: 'baize:dialog:app-message-dismiss',
        APP_MESSAGE_HOST_READY: 'baize:dialog:app-message-host-ready'
    } as const,

    // ============ 导航 ============
    NAVIGATION: {
        OPEN_EXE: 'baize:navigation:open-exe'
    } as const,

    // ============ 视图 ============
    VIEW: {
        EDIT_MODE: 'baize:view:edit-mode',
        PREVIEW_MODE: 'baize:view:preview-mode',
        EDIT_PREVIEW_MODE: 'baize:view:edit-preview-mode',
        TOGGLE_RES_MANAGER: 'baize:view:toggle-resource-manager'
    } as const,

    // ============ Monaco 编辑器命令（插入文本块/光标插入/撤销重做） ============
    // 2026-11-18（遗留清单 #3/#7）：原 MONACO_INSERT 组并入本组；
    // UNDO_REDO 原域错配在 VIEW 组（domain=monaco），一并归位。
    MONACO: {
        TEXT_BLOCK_TEMPLATES: 'baize:monaco:insert-text-block',
        AFTER_CURSOR: 'baize:monaco:insert-after-cursor',
        // FUN-09：编辑菜单撤销/重做/剪切/复制/粘贴由主进程下发 Monaco action id
        UNDO_REDO: 'baize:monaco:undo-redo'
    } as const,

    // ============ 系统设置变更（domain=setting） ============
    // 2026-11-18（遗留清单 #3/#7）：原 SYSTEM_SETTING_UPDATE 域错配在 EDITOR 组、
    // AUTO_SAVE_CHANGED 域错配在 DIALOG 组，均归位到本组。
    SETTING: {
        // 系统设置变更广播（菜单形态/语言/远程图片等）
        SYSTEM_SETTING_UPDATE: 'baize:setting:updated',
        // 自动保存开关/间隔变更通知（渲染层 invoke → 主进程启停定时器）
        AUTO_SAVE_CHANGED: 'baize:setting:auto-save-changed'
    } as const,

    // ============ 系统级能力（domain=system） ============
    // 2026-11-18（遗留清单 #3/#7）：原 3 个域错配在 FILE 组，归位到本组。
    // 结构优化第 5 批 5.1（L1）：原 OPEN_EXTERNAL_LINK（`baize:system:open-external-link`）
    // 已删除——全库无发送方（渲染层统一走 window.open 由主窗口 setWindowOpenHandler 兜底，
    // 本地 HTML 走 FILE.OPEN_IN_BROWSER），仅存主进程注册的空转通道。
    SYSTEM: {
        // 系统信息（OS/架构/版本，关于对话框）
        SYSTEM_INFO: 'baize:system:get-info',
        // 应用版本信息（version.json + 运行时 electron/chrome/node 版本）
        APP_VERSION: 'baize:system:app-version'
    } as const,

    // ============ 快速链接（get 收口到本组） ============
    QUICK_LINKS: {
        GET: 'baize:quick-links:get',
        // P1-FE-04：设置对话框保存（渲染层 invoke → 主进程快速链接 store）；
        // 主进程归一化为 QuickLinkItem[] 后写入 quickLinks 键，并向主窗口广播
        // UPDATED，NaviTab 监听后刷新——设置对话框与导航栏共用同一数据源。
        SAVE: 'baize:quick-links:save',
        UPDATED: 'baize:quick-links:updated'
    } as const,

    // ============ 主进程 → 渲染层广播事件 ============
    EVENTS: {
        STATUS_BAR_UPDATE: 'baize:status-bar:update',
        FILE_SAVED_SUCCESS: 'baize:file:saved',
        FILE_CONTENT_RELOADED: 'baize:file:content-reloaded',
        SHOW_SELECTED_FILE_CONTEXT: 'baize:fs:show-selected-file-context'
    } as const
} as const
