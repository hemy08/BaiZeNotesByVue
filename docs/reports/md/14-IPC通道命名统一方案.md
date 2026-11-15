# IPC 通道命名统一方案（含完整通道清单）

- **制定日期**：2026-11-15
- **依据**：`src/shared/ipc-channels.ts`（123 个通道 · 16 分组）+ [IPC 通信矩阵](2026-11-15-IPC通信矩阵.md) + [通信检查报告](2026-11-15-通信检查报告.md)
- **配套产物**：机器可读映射 `out\tool-results\ipc-channel-rename-map.json`（group/key/old/new/direction/dead）
- **一句话建议**：统一为 **`baize:<domain>:<name>`** 三段式；由于通道引用已 100% 走常量真源，**改名只需修改 `ipc-channels.ts` 的 123 个字符串值，1341 个调用点零改动**，成本极低。

## 一、现状盘点

### 1.1 规模

| 指标 | 数量 |
|---|---|
| 通道常量 | **123**（16 分组：WINDOW 10 / CONFIG 5 / THEME 13 / MENU 1 / EDITOR 14 / FILE 18 / FILE_MANAGER 14 / PLUGIN 6 / RENDER 2 / DIALOG 14 / NAVIGATION 2 / VIEW 5 / MONACO_INSERT 3 / QUICK_LINKS 5 / OVERLAY 7 / EVENTS 4） |
| 前缀分布 | `baize-notes:` **25** · `baize:notes:` **7** · 其他/无前缀 **91**（如 `window-*`、`config:*`、`file-manager-*`、`dialog-*`、`get-*`） |
| 已知方向数据 | 113/123（来自通信矩阵） |
| 计划删除的死通道 | 16（见明细表「计划删除」标记） |

### 1.2 发现的六类命名问题

| # | 问题 | 典型例子 |
|---|---|---|
| A | **前缀四套并存** | `baize-notes:update-theme`、`baize:notes:welcome:open-file`、`config:read`、`window-minimize`、`get-current-theme` |
| B | **分隔符/层级混用** | `baize:notes:welcome:open-file`（4 段）vs `baize-notes:update-theme`（2 段）；`file-manager-context-menu-*` 13 个超长前缀 |
| C | **动词/事件语义不统一** | 命令式 `window-minimize`、`get-current-theme`、`update-*`、`dialog-*-enter` 混用；事件型 `*-updated`、`*-changed`、`*-result` 未统一 |
| D | **拼写/语义错误** | `markdown-edit-model` / `markdown-preview-model`（model→**mode**）；`monaco-insert-text-block-templates` 实为通用文本插入；`open-plugin-tool` 为死通道 |
| E | **方向不可辨** | 同一前缀下混有 R→M send/on、invoke/handle、M→R 推送，仅看名称无法区分 |
| F | **通道名与常量名不一致** | 常量 `TEXT_BLOCK_TEMPLATES` ↔ 通道 `monaco-insert-text-block-templates`；`COPY_IMAGELINK` ↔ `...copy-imagelink`（缺连字符） |

## 二、统一命名规范（建议）

### 2.1 格式

```
baize:<domain>:<name>
```

- 固定三段，全小写 kebab-case；`<domain>` 取白名单（18 个）；`<name>` 为动作/实体 + 可选细节；
- 示例：`baize:window:minimize`、`baize:config:read`、`baize:theme:updated`、`baize:fs:copy-relative-path`、`baize:file:open-with-encoding`。

### 2.2 领域白名单（18）

`window` · `config` · `setting` · `theme` · `editor` · `monaco` · `view` · `menu` · `file` · `fs` · `navigation` · `dialog` · `plugin` · `render` · `quick-links` · `overlay` · `status-bar` · `system`

### 2.3 命名细则（5 条）

| 规则 | 内容 | 示例 |
|---|---|---|
| R1 动作语义 | 请求-响应（invoke/handle）与 R→M 命令用**动词原形**开头 | `baize:window:minimize`、`baize:config:read` |
| R2 事件语义 | 主进程→渲染层推送/结果事件用**过去式或结果后缀**（`-updated`/`-changed`/`-reloaded`/`-result`） | `baize:theme:updated`、`baize:setting:auto-save-changed` |
| R3 单数实体 | 实体一律单数，冗余词删除（`file-manager-context-menu-` → `fs:`） | `file-manager-context-menu-rename` → `baize:fs:rename` |
| R4 拼写与语义 | 修正 `model`→`mode` 等拼写；名称须与用途一致 | `markdown-edit-model` → `baize:view:edit-mode` |
| R5 常量命名不变 | **不改 `IPC.<GROUP>.<KEY>` 常量名与分组**（改动 1341 个调用点不经济）；仅统一通道字符串值，并用测试锁定格式 | `IPC.WINDOW.MINIMIZE` 值改为 `baize:window:minimize` |

> 可选增强：在 `ipc-channels.ts` 增加 `CHANNEL_DOMAINS` 常量与通道方向元数据（`CHANNEL_META`），供测试与矩阵自动生成使用；不影响调用点。

### 2.4 格式校验正则

```regex
^baize:[a-z][a-z-]*:[a-z][a-z0-9-]*$
```

并断言 domain ∈ 18 个白名单。建议新增 `tests/unit/ipc-channel-naming.test.ts` 固化。

## 三、完整通道清单（123 个）

| 分组 | 常量 | 当前通道 | 方向/模式 | 建议通道 | 标记 |
|---|---|---|---|---|---|
| CONFIG | `DELETE` | `config:delete` | R→M invoke ❌ | `baize:config:delete` | 🗑️ 计划删除 |
| CONFIG | `ENSURE_DIR` | `config:ensure-dir` | R→M invoke ❌ | `baize:config:ensure-dir` | 🗑️ 计划删除 |
| CONFIG | `LIST` | `config:list` | R→M invoke ❌ | `baize:config:list` | 🗑️ 计划删除 |
| CONFIG | `READ` | `config:read` | R→M invoke | `baize:config:read` |  |
| CONFIG | `WRITE` | `config:write` | R→M invoke | `baize:config:write` |  |
| DIALOG | `AUTO_SAVE_CHANGED` | `system-setting-auto-save-changed` | R→M ⚠️ | `baize:setting:auto-save-changed` |  |
| DIALOG | `CREATE_FILE_FOLDER_ENTER` | `dialog-create-file-folder-enter` | D→M send | `baize:dialog:create-file-folder-enter` |  |
| DIALOG | `FONT_SELECT_CANCEL` | `dialog-user-font-select-btn-cancel` | D→M send | `baize:dialog:font-select-cancel` |  |
| DIALOG | `FONT_SELECT_INSERT` | `dialog-user-font-select-btn-insert` | D→M send | `baize:dialog:font-select-insert` |  |
| DIALOG | `IMPORT_OPTION_CONFIRM` | `import-option-confirm` | D→M send | `baize:dialog:import-option-confirm` |  |
| DIALOG | `LOAD_SAVED_SETTINGS` | `load-saved-settings` | M→D send | `baize:dialog:load-saved-settings` |  |
| DIALOG | `MERMAID_RENDER_RESULT` | `dialog-mermaid-render-svg-result` | D→M send | `baize:dialog:mermaid-render-result` |  |
| DIALOG | `OPEN_PLUGIN_TOOL` | `open-plugin-tool` | M→R send ❌ | `baize:dialog:open-plugin-tool` | 🗑️ 计划删除 |
| DIALOG | `OPEN_VUE_DIALOG` | `open-vue-dialog` | M→R send | `baize:dialog:open-vue` |  |
| DIALOG | `RENAME_FILE_FOLDER_ENTER` | `dialog-rename-file-folder-enter` | D→M send | `baize:dialog:rename-file-folder-enter` |  |
| DIALOG | `SAVE_SUCCESS` | `baize-notes:save-success` | M→D send | `baize:file:save-success` |  |
| DIALOG | `SYSTEM_SETTING_APPLY` | `dialog-system-setting-apply` | D→M send | `baize:dialog:system-setting-apply` |  |
| DIALOG | `SYSTEM_SETTING_CANCEL` | `dialog-system-setting-cancel` | D→M send | `baize:dialog:system-setting-cancel` |  |
| DIALOG | `SYSTEM_SETTING_CONFIRM` | `dialog-system-setting-confirm` | D→M send | `baize:dialog:system-setting-confirm` |  |
| EDITOR | `DIALOG_SETTING_APPLY` | `dialog-editor-setting-apply` | D→M send | `baize:dialog:editor-setting-apply` |  |
| EDITOR | `DIALOG_SETTING_CANCEL` | `dialog-editor-setting-cancel` | D→M send | `baize:dialog:editor-setting-cancel` |  |
| EDITOR | `DIALOG_SETTING_OK` | `dialog-editor-setting-ok` | D→M send | `baize:dialog:editor-setting-ok` |  |
| EDITOR | `DIALOG_SETTING_RESET` | `dialog-editor-setting-reset` | D→M send | `baize:dialog:editor-setting-reset` |  |
| EDITOR | `FLUSH_CONTENT` | `editor:flush-content` | M→R send | `baize:editor:flush-content` |  |
| EDITOR | `FLUSH_CONTENT_DONE` | `editor:flush-content-done` | R→M send | `baize:editor:flush-content-done` |  |
| EDITOR | `GET_SETTING` | `baize-notes:get-editor-setting` | R→M invoke | `baize:editor:get-setting` |  |
| EDITOR | `INIT_SETTING` | `baize-notes:init-editor-setting` | M→R send | `baize:editor:init-setting` |  |
| EDITOR | `LOAD_SAVED_SETTINGS` | `load-saved-editor-settings` | M→D send | `baize:editor:load-saved-settings` |  |
| EDITOR | `RELAYOUT` | `baize-notes:editor-relayout` | M→R send ❌ | `baize:editor:relayout` | 🗑️ 计划删除 |
| EDITOR | `SETTING_UPDATED` | `baize-notes:editor-setting-updated` | M→R send | `baize:editor:setting-updated` |  |
| EDITOR | `SYSTEM_SETTING_UPDATE` | `baize-notes:system-setting-update` | M→R send | `baize:setting:updated` |  |
| EDITOR | `UPDATE_FONT` | `baize-notes:update-editor-font` | R→M send ❌ | `baize:editor:update-font` | 🗑️ 计划删除 |
| EDITOR | `UPDATE_OPTIONS` | `baize-notes:monaco-editor-update-options` | M→R send（另有无接收的 R→M 分支） | `baize:editor:update-options` |  |
| EVENTS | `FILE_CONTENT_RELOADED` | `file-content-reloaded` | M→R send | `baize:file:content-reloaded` |  |
| EVENTS | `FILE_SAVED_SUCCESS` | `file-saved-success` | M→R send | `baize:file:saved` |  |
| EVENTS | `SHOW_SELECTED_FILE_CONTEXT` | `baize:notes:show-selected-file-context` | M→R send | `baize:fs:show-selected-file-context` |  |
| EVENTS | `STATUS_BAR_UPDATE` | `status-bar-console-update` | M→R send | `baize:status-bar:update` |  |
| FILE | `APP_VERSION` | `app:get-version` | R→M invoke | `baize:system:app-version` |  |
| FILE | `CHECK_EXISTS` | `check-file-exists` | R→M invoke | `baize:file:check-exists` |  |
| FILE | `CLEAR_EDITOR_PREVIEW` | `clear-editor-and-preview` | M→R send | `baize:file:clear-editor-preview` |  |
| FILE | `CREATE_FILE_FOLDER` | `baize-notes:create-file-folder` | R→M invoke | `baize:file:create-entry` |  |
| FILE | `GET_CURRENT_FILE_PATH` | `baize-notes:get-current-file-path` | R→M invoke | `baize:file:get-current-path` |  |
| FILE | `IMPORT_NEW_FILE` | `baize-notes:import-new-file` | R→M invoke | `baize:file:import` |  |
| FILE | `OPEN_EXTERNAL_LINK` | `open-external-link` | R→M send | `baize:system:open-external-link` |  |
| FILE | `OPEN_SELECT_FILE` | `baize:notes:open-select-file` | R→M send | `baize:file:open-select-file` |  |
| FILE | `OPEN_SPECIFIC_FOLDER` | `baize:notes:open-specific-folder` | R→M send | `baize:file:open-specific-folder` |  |
| FILE | `READ_HTML` | `read-html-file` | R→M invoke | `baize:file:read-html` |  |
| FILE | `SAVE_TO_DISK` | `save-file-content-to-disk` | R→M send | `baize:file:save-content-to-disk` |  |
| FILE | `SELECT_DIRECTORY` | `baize-notes:select-directory` | R→M invoke | `baize:file:select-directory` |  |
| FILE | `SYSTEM_INFO` | `get-system-info` | R→M invoke | `baize:system:get-info` |  |
| FILE | `UPDATE_SELECT_FILE_CONTENT` | `update-select-file-content` | R→M send | `baize:file:update-content` |  |
| FILE | `USER_SELECT_FILE` | `monaco-editor-user-select-file` | M→R send | `baize:file:user-select-file` |  |
| FILE | `WELCOME_ENTER_MAIN` | `baize:notes:welcome:enter-main` | M→R send | `baize:file:welcome-enter-main` |  |
| FILE | `WELCOME_OPEN_DIRECTORY` | `baize:notes:welcome:open-directory` | R→M send | `baize:file:welcome-open-directory` |  |
| FILE | `WELCOME_OPEN_FILE` | `baize:notes:welcome:open-file` | R→M send | `baize:file:welcome-open-file` |  |
| FILE_MANAGER | `COPY_FILE` | `file-manager-context-menu-copy-file` | R→M send | `baize:fs:copy-file` |  |
| FILE_MANAGER | `COPY_FILELINK` | `file-manager-context-menu-copy-filelink` | R→M send | `baize:fs:copy-file-link` |  |
| FILE_MANAGER | `COPY_IMAGELINK` | `file-manager-context-menu-copy-imagelink` | R→M send | `baize:fs:copy-image-link` |  |
| FILE_MANAGER | `COPY_RELATIVE_PATH` | `file-manager-context-menu-copy-relative-path` | R→M send | `baize:fs:copy-relative-path` |  |
| FILE_MANAGER | `CREATE_FILE` | `file-manager-context-menu-create-file` | R→M send | `baize:fs:create-file` |  |
| FILE_MANAGER | `CUT` | `file-manager-context-menu-cut` | R→M send | `baize:fs:cut` |  |
| FILE_MANAGER | `DELETE` | `file-manager-context-menu-delete` | R→M invoke ❌ | `baize:fs:delete` |  |
| FILE_MANAGER | `FILE_SYSTEM_DATA` | `baize:notes:resource:manager:file-system-data` | M→R send | `baize:fs:file-system-data` |  |
| FILE_MANAGER | `FIND_IN` | `file-manager-context-menu-find-in` | R→M send | `baize:fs:find-in` |  |
| FILE_MANAGER | `IMPORT_FROM` | `file-manager-context-menu-import-from` | R→M send | `baize:fs:import-from` |  |
| FILE_MANAGER | `OPEN_IN_EXPLORER` | `file-manager-context-menu-open-in-explorer` | R→M send | `baize:fs:open-in-explorer` |  |
| FILE_MANAGER | `PASTE` | `file-manager-context-menu-paste` | R→M send | `baize:fs:paste` |  |
| FILE_MANAGER | `RELOAD_FROM_DISK` | `file-manager-context-menu-reload-from-disk` | R→M send | `baize:fs:reload-from-disk` |  |
| FILE_MANAGER | `RENAME` | `file-manager-context-menu-rename` | R→M send | `baize:fs:rename` |  |
| MENU | `ACTION` | `baize-notes:menu-action` | R→M send | `baize:menu:action` |  |
| MONACO_INSERT | `AFTER_CURSOR` | `monaco-editor-insert-after-cursor` | — | `baize:monaco:insert-after-cursor` |  |
| MONACO_INSERT | `TEXT_BLOCK_TEMPLATES` | `monaco-insert-text-block-templates` | — | `baize:monaco:insert-text-block` |  |
| MONACO_INSERT | `WRITING_TEMPLATES` | `monaco-insert-writing-templates` | — | `baize:monaco:insert-writing-templates` | 🗑️ 计划删除 |
| NAVIGATION | `KEYDOWN` | `keydown` | — | `baize:navigation:keydown` | 🗑️ 计划删除 |
| NAVIGATION | `OPEN_EXE` | `navi-tab-open-exe` | — | `baize:navigation:open-exe` |  |
| OVERLAY | `CONVERT_SAVE_ENCODING` | `file-convert-encoding` | R→M invoke | `baize:file:convert-encoding` |  |
| OVERLAY | `CONVERT_TO_ENCODING` | `convert-to-encoding` | M→R send | `baize:file:convert-to-encoding` |  |
| OVERLAY | `MERMAID_GRAPH_DEF` | `mermaid-graph-definition` | M→R send ❌ | `baize:overlay:mermaid-graph-definition` | 🗑️ 计划删除 |
| OVERLAY | `OPEN_URL` | `open-url-in-web-browser-window` | M→R send ❌ | `baize:overlay:open-url` | 🗑️ 计划删除 |
| OVERLAY | `OPEN_WITH_ENCODING` | `open-with-encoding` | M→R send | `baize:file:open-with-encoding` |  |
| OVERLAY | `REOPEN_WITH_ENCODING` | `file-reopen-with-encoding` | R→M invoke | `baize:file:reopen-with-encoding` |  |
| OVERLAY | `UPDATE_MERMAID_GRAPH` | `update-mermaid-render-graph` | M→D send ❌ | `baize:overlay:update-mermaid-graph` | 🗑️ 计划删除 |
| PLUGIN | `CRYPTO_DECRYPT` | `plugin-tools-crypto-decrypt` | R→M invoke | `baize:plugin:crypto-decrypt` |  |
| PLUGIN | `CRYPTO_ENCRYPT` | `plugin-tools-crypto-encrypt` | R→M invoke | `baize:plugin:crypto-encrypt` |  |
| PLUGIN | `HASH_TEXT` | `plugin-tools-generator-hash-text` | R→M invoke | `baize:plugin:hash-text` |  |
| PLUGIN | `HMAC_TEXT` | `plugin-tools-generator-hmac-text` | R→M invoke | `baize:plugin:hmac-text` |  |
| PLUGIN | `RSA_GENERATE` | `plugin-tools-generator-rsa-key-pairs` | R→M send | `baize:plugin:rsa-generate` |  |
| PLUGIN | `RSA_RESULT` | `plugin-tools-generator-rsa-result` | M→R send | `baize:plugin:rsa-result` |  |
| QUICK_LINKS | `GET` | `baize-notes:get-quick-links` | R→M invoke | `baize:quick-links:get` |  |
| QUICK_LINKS | `INIT` | `baize-notes:init-quick-links` | M→D send | `baize:quick-links:init` |  |
| QUICK_LINKS | `RESET` | `baize-notes:reset-quick-links` | D→M send | `baize:quick-links:reset` |  |
| QUICK_LINKS | `SAVE` | `baize-notes:save-quick-links` | D→M send | `baize:quick-links:save` |  |
| QUICK_LINKS | `UPDATED` | `baize-notes:quick-links-updated` | M→R send | `baize:quick-links:updated` |  |
| RENDER | `INSERT_IMAGE` | `monaco-editor-container-insert-image` | R→M send | `baize:render:insert-image` |  |
| RENDER | `PLANTUML_LOCAL` | `baize-notes:plantuml-local-render` | R→M invoke | `baize:render:plantuml-local` |  |
| THEME | `DIALOG_BROADCAST_THEME` | `dialog-broadcast-theme` | D→M send | `baize:theme:dialog-broadcast` |  |
| THEME | `GET_ALL_MONACO_THEMES` | `get-all-monaco-themes` | R→M invoke | `baize:theme:get-all-monaco` |  |
| THEME | `GET_ALL_THEMES` | `get-all-themes` | R→M invoke | `baize:theme:get-all` |  |
| THEME | `GET_CURRENT_THEME` | `get-current-theme` | R→M invoke ❌ | `baize:theme:get-current` | 🗑️ 计划删除 |
| THEME | `GET_CURRENT_THEME_STYLES` | `get-current-theme-styles` | R→M invoke | `baize:theme:get-current-styles` |  |
| THEME | `GET_MONACO_THEME` | `get-monaco-theme` | R→M sendSync ❌ | `baize:theme:get-monaco` | 🗑️ 计划删除 |
| THEME | `GET_SEPARATE_EDITOR_THEME` | `get-separate-editor-theme` | R→M sendSync ❌ | `baize:theme:get-separate-editor` | 🗑️ 计划删除 |
| THEME | `INIT_THEME_STYLES` | `baize-notes:init-theme-styles` | M→D（另有 M→R 空转） | `baize:theme:init-styles` |  |
| THEME | `LOAD_MONACO_THEME` | `baize-notes:load-monaco-theme` | R→M invoke | `baize:theme:load-monaco` |  |
| THEME | `THEME_UPDATE` | `baize-notes:theme-update` | D→M send | `baize:theme:update-from-dialog` |  |
| THEME | `THEME_UPDATED` | `baize-notes:theme-updated` | M→R / M→D send | `baize:theme:updated` |  |
| THEME | `UPDATE_MONACO_THEME` | `baize-notes:update-monaco-theme` | R→M send ❌ | `baize:theme:update-monaco` | 🗑️ 计划删除 |
| THEME | `UPDATE_THEME` | `baize-notes:update-theme` | R→M send | `baize:theme:update` |  |
| VIEW | `EDIT_MODE` | `markdown-edit-model` | — | `baize:view:edit-mode` |  |
| VIEW | `EDIT_PREVIEW_MODE` | `markdown-edit-preview-model` | — | `baize:view:edit-preview-mode` |  |
| VIEW | `PREVIEW_MODE` | `markdown-preview-model` | — | `baize:view:preview-mode` |  |
| VIEW | `TOGGLE_RES_MANAGER` | `menu-view-hide-display-res-manager` | — | `baize:view:toggle-resource-manager` |  |
| VIEW | `UNDO_REDO` | `monaco-editor-trigger-undo-redo` | — | `baize:monaco:undo-redo` |  |
| WINDOW | `CLOSE` | `window-close` | R→M send | `baize:window:close` |  |
| WINDOW | `GET_BOUNDS` | `window-get-bounds` | R→M invoke | `baize:window:get-bounds` |  |
| WINDOW | `IS_MAXIMIZED` | `window-is-maximized` | R→M invoke | `baize:window:is-maximized` |  |
| WINDOW | `MAXIMIZE` | `window-maximize` | R→M send | `baize:window:maximize` |  |
| WINDOW | `MINIMIZE` | `window-minimize` | R→M send | `baize:window:minimize` |  |
| WINDOW | `MOVE` | `window-move` | R→M send | `baize:window:move` |  |
| WINDOW | `SET_SIZE` | `window-set-size` | R→M send | `baize:window:set-size` |  |
| WINDOW | `START_DRAG` | `window-start-drag` | R→M send | `baize:window:start-drag` |  |
| WINDOW | `TOGGLE_MAXIMIZE` | `window-toggle-maximize` | R→M send | `baize:window:toggle-maximize` |  |
| WINDOW | `UNMAXIMIZE` | `window-unmaximize` | R→M send ❌ | `baize:window:unmaximize` | 🗑️ 计划删除 |
> 方向数据来自通信矩阵（113/123 命中，其余未解析到的以「—」表示，实施前以重新扫描为准）；「计划删除」为通信检查报告判定的 16 个死通道。

## 四、迁移方案（成本极低）

### 4.1 关键前提（已核实）

- 通道引用 100% 走常量：`src/main`、`src/preload`、`src/renderer` 均 `IPC.*` 引用；**HTML 对话框内联脚本通过模板插值注入常量**（如 `ipcRenderer.send('${IPC.EDITOR.DIALOG_SETTING_APPLY}', …)`）；preload 对话框 send 白名单也引用常量；
- 因此**无需逐个改调用点**，只改常量值即可全局生效。

### 4.2 改动清单

| # | 文件/对象 | 改动 | 说明 |
|---|---|---|---|
| 1 | `src/shared/ipc-channels.ts` | 123 个字符串值替换为建议值 | 唯一真源，风险集中一处 |
| 2 | `tests/unit/ipc-channel-constants.test.ts` 等 | 若有硬编码旧值断言则同步 | 预计少量 |
| 3 | `tests/unit/ipc-channel-naming.test.ts`（新增） | 格式正则 + domain 白名单 + 唯一性 | 防回归 |
| 4 | `docs/reports/md|html/2026-11-15-IPC通信矩阵.md/html` | 重生成（脚本或人工） | 报告同步 |
| 5 | `out/tool-results/ipc-channel-rename-map.json` | 作为执行依据 | 已生成 |

### 4.3 与死通道清理合并执行（推荐）

建议把本方案并入 [13-IPC通信问题修复计划](13-IPC通信问题修复计划.md) 的**批次 3（清理）**一起执行：

1. 先删除 16 个死通道（常量 + 收发端 + 测试）；
2. 对剩余 107 个通道一次性套用新命名（改常量值）；
3. 重生成通信矩阵，更新检查报告中的通道名；
4. 跑门禁 + 新增命名测试。

预期收益：通道数 123 → 107，命名 100% 符合 `baize:<domain>:<name>`，报告/日志/排障 grep 一致。

### 4.4 不建议的做法

- ❌ **保留旧值别名**：内部闭环应用无外部消费者，别名会增加"双轨"认知负担（与 CMP-30 双轨问题同类）；
- ❌ **逐个调用点改名**：徒增风险，且失去常量真源的意义；
- ❌ **在通道名中加入方向后缀**（如 `:req`/`:evt`）：徒增噪音，方向由调用位置与矩阵文档区分，测试可校验两端模式一致性（见修复计划回归测试建设）。

## 五、验证方案

| 验证 | 方法 | 通过标准 |
|---|---|---|
| 格式 | 新增命名测试 | 100% 匹配 `^baize:[a-z][a-z-]*:[a-z][a-z0-9-]*$` 且 domain 白名单 |
| 唯一性 | 现有 `ipc-channel-constants.test.ts` | 无重复值 |
| 无字面量绕过 | 现有测试 | src 内无通道字符串直接调用 |
| 旧值零残留 | `grep` 旧通道值（src/tests） | 0 命中 |
| 功能回归 | typecheck + npm test + eslint + build | 全部通过 |
| 报告一致 | 重生成通信矩阵 | 与常量文件一致 |

## 六、风险与决策点

| 项 | 说明 | 建议 |
|---|---|---|
| 常量名是否同步改为英文域名（如 `FILE_MANAGER`→`FS`） | 需改 1341 处调用点，收益低 | **不改**，仅统一字符串值 |
| 是否本轮同时删除死通道 | 与命名改动叠加在同一文件 | 推荐合并（批次 3），一次验证 |
| 历史报告中的旧通道名 | 已发布报告属历史存档 | 保留历史，仅更新"当前状态"版矩阵/报告 |
| 与主进程 HTML 对话框的耦合 | 已确认常量注入 | 无额外风险 |

## 七、结论与下一步

1. **通道清单**：见第三节 123 行明细（最新版以 `out\tool-results\ipc-channel-rename-map.json` 为准）；
2. **建议方案**：`baize:<domain>:<name>` 三段式 + 18 个 domain 白名单 + 5 条命名细则；
3. **实施路径**：并入 13 号修复计划批次 3（先删 16 死通道 → 改名 → 重生成矩阵 → 新增命名测试 → 门禁）；
4. 若需立即执行命名统一（不等待其余 IPC 修复），可单列"批次 0"，预计 1 个子智能体一轮完成 + 验证。

## 八、执行状态（2026-11-15 已完成）

- ✅ **通道值统一**：`src/shared/ipc-channels.ts` 123 个通道全部改为 `baize:<domain>:<name>`（旧值零残留）；
- ✅ **测试用例更新**：46 个测试文件共 216 处硬编码旧通道名同步为新值（`keydown` 歧义单独处理），全部通过；
- ✅ **顺带收口**：`src/renderer/src/common/templates.ts` 的通道字面量副本改为引用 `IPC` 常量（通信检查报告 P3-2 / ARC-03 收口）；
- ✅ **新增防回归测试**：`tests/unit/ipc-channel-naming.test.ts`（格式正则/domain 白名单/唯一性/历史前缀 6 用例）；
- ✅ **文档同步**：IPC 通信矩阵与通信检查报告的通道名已更新，并加统一说明注记；
- ✅ **门禁**：typecheck 双绿 · 测试 **116 文件 / 1849 用例**全过 · ESLint 0 error · electron-vite build 通过。

> 说明：死通道（16 个）本轮仅统一命名、未删除（删除属 [13-IPC通信问题修复计划](13-IPC通信问题修复计划.md) 批次 3 范围）。