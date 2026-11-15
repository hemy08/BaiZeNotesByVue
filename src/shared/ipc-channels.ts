/**
 * IPC 通道常量（ARC-03：全项目唯一真源）
 *
 * 规则：
 * - 主进程 / preload / 渲染层的 ipcMain、ipcRenderer、webContents.send、
 *   ipcListenerManager 注册一律引用本文件常量，禁止再写通道字符串字面量；
 * - 通道字符串统一为 `baize:<domain>:<name>`（2026-11-15 命名统一后，本文件 89 个
 *   通道 100% 带 `baize:` 前缀，domain 限定 18 个白名单，见
 *   tests/unit/ipc-channel-naming.test.ts；历史前缀 baize-notes:* / baize:notes:*
 *   与无前缀通道已全部清理）；
 * - 常量分组沿用历史归属：个别常量所在组与通道 domain 不一致（CQ-13 的 5 处域错配，
 *   已在各组内就地注明）。为避免 IPC.X.Y 全仓引用大改，只补注释、不移动常量；
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
        START_DRAG: 'baize:window:start-drag',
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
        INIT_THEME_STYLES: 'baize:theme:init-styles',
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
        // CQ-13 域错配：通道 domain 是 setting（系统设置变更广播），历史放在 EDITOR 组；
        // 引用点为 IPC.EDITOR.SYSTEM_SETTING_UPDATE，移动需全仓改引用，故仅注明保留原位。
        SYSTEM_SETTING_UPDATE: 'baize:setting:updated',
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
        // CQ-13 域错配：以下 3 个通道的 domain 是 system（系统信息/外链），历史放在 FILE 组；
        // 引用点为 IPC.FILE.*，移动需全仓改引用，故仅注明保留原位。
        OPEN_EXTERNAL_LINK: 'baize:system:open-external-link',
        SYSTEM_INFO: 'baize:system:get-info',
        APP_VERSION: 'baize:system:app-version',
        USER_SELECT_FILE: 'baize:file:user-select-file'
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
    DIALOG: {
        CREATE_FILE_FOLDER_ENTER: 'baize:dialog:create-file-folder-enter',
        RENAME_FILE_FOLDER_ENTER: 'baize:dialog:rename-file-folder-enter',
        OPEN_VUE_DIALOG: 'baize:dialog:open-vue',
        // CQ-13 域错配：通道 domain 是 setting（自动保存开关变更通知），历史放在 DIALOG 组；
        // 引用点为 IPC.DIALOG.AUTO_SAVE_CHANGED，故仅注明保留原位。
        AUTO_SAVE_CHANGED: 'baize:setting:auto-save-changed'
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
        TOGGLE_RES_MANAGER: 'baize:view:toggle-resource-manager',
        // CQ-13 域错配：通道 domain 是 monaco（撤销/重做由编辑器执行），历史放在 VIEW 组；
        // 引用点为 IPC.VIEW.UNDO_REDO，故仅注明保留原位。
        UNDO_REDO: 'baize:monaco:undo-redo'
    } as const,

    // ============ Monaco 插入 ============
    MONACO_INSERT: {
        TEXT_BLOCK_TEMPLATES: 'baize:monaco:insert-text-block',
        AFTER_CURSOR: 'baize:monaco:insert-after-cursor'
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

    // ============ 覆盖层窗口（Mermaid / 编码 / 在线页面） ============
    OVERLAY: {
        // CQ-13 域错配：以下 4 个通道的 domain 是 file（编码转换/重开），历史放在 OVERLAY 组；
        // 引用点为 IPC.OVERLAY.*，移动需全仓改引用，故仅注明保留原位。
        OPEN_WITH_ENCODING: 'baize:file:open-with-encoding',
        CONVERT_TO_ENCODING: 'baize:file:convert-to-encoding',
        // FUN-02：渲染层收到编码菜单事件（open-with-encoding/convert-to-encoding）
        // 后 invoke 本通道，请求主进程按指定编码重新打开 / 转码保存当前文件
        REOPEN_WITH_ENCODING: 'baize:file:reopen-with-encoding',
        CONVERT_SAVE_ENCODING: 'baize:file:convert-encoding'
    } as const,

    // ============ 主进程 → 渲染层广播事件 ============
    EVENTS: {
        STATUS_BAR_UPDATE: 'baize:status-bar:update',
        FILE_SAVED_SUCCESS: 'baize:file:saved',
        FILE_CONTENT_RELOADED: 'baize:file:content-reloaded',
        SHOW_SELECTED_FILE_CONTEXT: 'baize:fs:show-selected-file-context'
    } as const
} as const
