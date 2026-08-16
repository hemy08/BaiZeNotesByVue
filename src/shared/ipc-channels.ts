export const IPC = {
  WINDOW: {
    MINIMIZE: 'window-minimize',
    MAXIMIZE: 'window-maximize',
    UNMAXIMIZE: 'window-unmaximize',
    CLOSE: 'window-close',
    TOGGLE_MAXIMIZE: 'window-toggle-maximize',
    GET_BOUNDS: 'window-get-bounds',
    IS_MAXIMIZED: 'window-is-maximized',
    START_DRAG: 'window-start-drag',
    MOVE: 'window-move',
    SET_SIZE: 'window-set-size',
  } as const,

  CONFIG: {
    READ: 'config:read',
    WRITE: 'config:write',
    DELETE: 'config:delete',
    LIST: 'config:list',
    ENSURE_DIR: 'config:ensure-dir',
  } as const,

  THEME: {
    UPDATE_THEME: 'baize-notes:update-theme',
    THEME_UPDATED: 'baize-notes:theme-updated',
    THEME_UPDATE: 'baize-notes:theme-update',
    INIT_THEME_STYLES: 'baize-notes:init-theme-styles',
    INIT_EDITOR_SETTING: 'baize-notes:init-editor-setting',
    LOAD_MONACO_THEME: 'baize-notes:load-monaco-theme',
    GET_CURRENT_THEME: 'get-current-theme',
    GET_CURRENT_THEME_STYLES: 'get-current-theme-styles',
    GET_ALL_THEMES: 'get-all-themes',
    GET_ALL_MONACO_THEMES: 'get-all-monaco-themes',
    GET_SEPARATE_EDITOR_THEME: 'get-separate-editor-theme',
    GET_MONACO_THEME: 'get-monaco-theme',
    DIALOG_BROADCAST_THEME: 'dialog-broadcast-theme',
  } as const,

  MENU: {
    ACTION: 'baize-notes:menu-action',
  } as const,

  EDITOR: {
    GET_SETTING: 'baize-notes:get-editor-setting',
    SETTING_UPDATED: 'baize-notes:editor-setting-updated',
    RELAYOUT: 'baize-notes:editor-relayout',
    UPDATE_OPTIONS: 'baize-notes:monaco-editor-update-options',
    UPDATE_FONT: 'baize-notes:update-editor-font',
    SYSTEM_SETTING_UPDATE: 'baize-notes:system-setting-update',
  } as const,

  FILE: {
    OPEN_SPECIFIC_FOLDER: 'baize:notes:open-specific-folder',
    WELCOME_OPEN_DIRECTORY: 'baize:notes:welcome:open-directory',
    WELCOME_OPEN_FILE: 'baize:notes:welcome:open-file',
    WELCOME_ENTER_MAIN: 'baize:notes:welcome:enter-main',
    OPEN_SELECT_FILE: 'baize:notes:open-select-file',
    IMPORT_NEW_FILE: 'baize-notes:import-new-file',
    CREATE_FILE_FOLDER: 'baize-notes:create-file-folder',
    GET_CURRENT_FILE_PATH: 'baize-notes:get-current-file-path',
    SELECT_DIRECTORY: 'baize-notes:select-directory',
    CLEAR_EDITOR_PREVIEW: 'clear-editor-and-preview',
    SAVE_TO_DISK: 'save-file-content-to-disk',
    UPDATE_SELECT_FILE_CONTENT: 'update-select-file-content',
    CHECK_EXISTS: 'check-file-exists',
    READ_HTML: 'read-html-file',
    OPEN_EXTERNAL_LINK: 'open-external-link',
    SYSTEM_INFO: 'get-system-info',
    APP_VERSION: 'app:get-version',
  } as const,

  FILE_MANAGER: {
    COPY_RELATIVE_PATH: 'file-manager-context-menu-copy-relative-path',
    COPY_IMAGELINK: 'file-manager-context-menu-copy-imagelink',
    COPY_FILELINK: 'file-manager-context-menu-copy-filelink',
    COPY_FILE: 'file-manager-context-menu-copy-file',
    CUT: 'file-manager-context-menu-cut',
    PASTE: 'file-manager-context-menu-paste',
    OPEN_IN_EXPLORER: 'file-manager-context-menu-open-in-explorer',
    RELOAD_FROM_DISK: 'file-manager-context-menu-reload-from-disk',
    FILE_SYSTEM_DATA: 'baize:notes:resource:manager:file-system-data',
  } as const,

  PLUGIN: {
    RSA_GENERATE: 'plugin-tools-generator-rsa-key-pairs',
    RSA_RESULT: 'plugin-tools-generator-rsa-result',
    HASH_TEXT: 'plugin-tools-generator-hash-text',
    HMAC_TEXT: 'plugin-tools-generator-hmac-text',
    CRYPTO_ENCRYPT: 'plugin-tools-crypto-encrypt',
    CRYPTO_DECRYPT: 'plugin-tools-crypto-decrypt',
    SHOW: 'CHANNEL_PLUGIN_TOOL_SHOW',
  } as const,

  RENDER: {
    PRE_RENDER: 'pre-render-monaco-editor-content',
    POST_RENDER: 'post-render-monaco-editor-content',
    PRE_RENDER_RESULT: 'pre-render-monaco-editor-content-result',
    POST_RENDER_RESULT: 'post-render-monaco-editor-content-result',
    INSERT_IMAGE: 'monaco-editor-container-insert-image',
  } as const,

  DIALOG: {
    CREATE_FILE_FOLDER_ENTER: 'dialog-create-file-folder-enter',
    RENAME_FILE_FOLDER_ENTER: 'dialog-rename-file-folder-enter',
    SYSTEM_SETTING_APPLY: 'dialog-system-setting-apply',
    SYSTEM_SETTING_CONFIRM: 'dialog-system-setting-confirm',
    SYSTEM_SETTING_CANCEL: 'dialog-system-setting-cancel',
    SAVE_QUICK_LINKS: 'baize-notes:save-quick-links',
    RESET_QUICK_LINKS: 'baize-notes:reset-quick-links',
    FONT_SELECT_INSERT: 'dialog-user-font-select-btn-insert',
    FONT_SELECT_CANCEL: 'dialog-user-font-select-btn-cancel',
    MERMAID_RENDER_RESULT: 'dialog-mermaid-render-svg-result',
    OPEN_VUE_DIALOG: 'open-vue-dialog',
    OPEN_PLUGIN_TOOL: 'open-plugin-tool',
    QUICK_LINKS_UPDATED: 'baize-notes:quick-links-updated',
    INIT_QUICK_LINKS: 'baize-notes:init-quick-links',
    AUTO_SAVE_CHANGED: 'system-setting-auto-save-changed',
  } as const,

  NAVIGATION: {
    OPEN_EXE: 'navi-tab-open-exe',
    GET_QUICK_LINKS: 'baize-notes:get-quick-links',
    KEYDOWN: 'keydown',
  } as const,

  VIEW: {
    EDIT_MODE: 'markdown-edit-model',
    PREVIEW_MODE: 'markdown-preview-model',
    EDIT_PREVIEW_MODE: 'markdown-edit-preview-model',
    TOGGLE_RES_MANAGER: 'menu-view-hide-display-res-manager',
    GO_TO_LINE: 'editor-go-to-line',
    FIND: 'editor-find',
    REPLACE: 'editor-replace',
    FOLD_ALL: 'editor-fold-all',
    EXPAND_ALL: 'editor-expand-all',
    FOLD_LEVEL: 'editor-fold-level',
    UNDO_REDO: 'monaco-editor-trigger-undo-redo',
  } as const,

  MONACO_INSERT: {
    WRITING_TEMPLATES: 'monaco-insert-writing-templates',
    TEXT_BLOCK_TEMPLATES: 'monaco-insert-text-block-templates',
    AFTER_CURSOR: 'monaco-editor-insert-after-cursor',
  } as const,

  QUICK_LINKS: {
    GET: 'baize-notes:get-quick-links',
    SAVE: 'baize-notes:save-quick-links',
    RESET: 'baize-notes:reset-quick-links',
    UPDATED: 'baize-notes:quick-links-updated',
    INIT: 'baize-notes:init-quick-links',
  } as const,

  OVERLAY: {
    UPDATE_MERMAID_GRAPH: 'update-mermaid-render-graph',
    MERMAID_GRAPH_DEF: 'mermaid-graph-definition',
    OPEN_URL: 'open-url-in-web-browser-window',
    OPEN_WITH_ENCODING: 'open-with-encoding',
    CONVERT_TO_ENCODING: 'convert-to-encoding',
  } as const,

  EVENTS: {
    STATUS_BAR_UPDATE: 'status-bar-console-update',
    FILE_SAVED_SUCCESS: 'file-saved-success',
    FILE_CONTENT_RELOADED: 'file-content-reloaded',
    SHOW_SELECTED_FILE_CONTEXT: 'baize:notes:show-selected-file-context',
  } as const,
} as const
