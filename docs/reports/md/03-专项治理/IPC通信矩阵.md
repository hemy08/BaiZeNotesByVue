<!-- report-nav:start -->
> 🧭 **报告导航**：[🏠 报告首页](../../README.md) ｜ [01-检查与扫描](../01-检查与扫描/) ｜ [02-修复与实施](../02-修复与实施/) ｜ [03-专项治理](../03-专项治理/) ｜ 当前：**IPC通信矩阵**（03-专项治理）
<!-- report-nav:end -->

# IPC 通信矩阵（当前口径 + 历史快照）

> **合并归档报告**：由以下历史报告合并而成（保留原文，按时间顺序成章）：`2026-11-18-IPC通信矩阵.md`、`2026-11-15-IPC通信矩阵.md`。
> 内容为历史快照；当前口径见 [报告总索引](../../README.md) 与 [IPC通信矩阵](IPC通信矩阵.md)（v1.3.6 基线：158 测试文件 / 2,877 用例 / 92 IPC 通道）。

## 一、当前通信矩阵（2026-11-19 复核，92 通道）

- **编制日期**：2026-11-18 首次编制，2026-11-19 补录 `FILE.OPEN_IN_BROWSER` / `FILE.READ_BINARY` 后复核（基于当前工作区源码；取代 `2026-11-15-IPC通信矩阵.md` 历史快照）
- **唯一真源**：`src/shared/ipc-channels.ts`（**92 个通道常量 / 17 个分组**，全部以 `baize:<domain>:<name>` 命名；分组与 domain 一一对应，域错配已随遗留清单 #3/#7 统一）
- **方法**：对每个通道常量在 `src/main/**`、`src/preload/**`、`src/renderer/**` 全量 grep 实际发送点/接收点，只按源码事实填写；行号均为当前源码行号
- **统计摘要**：92 通道 / 17 组 ｜ 4 个 BrowserWindow 创建点 ｜ 2 个 preload 入口 ｜ 对话框 send 白名单 2 通道 ｜ 异常已清零（见 §五）

#### 一、方向记号

| 记号 | 含义 |
| --- | --- |
| M | 主进程 `src/main/**` |
| R | 主窗口渲染进程 `src/renderer/**` |
| D | HTML 对话框窗口（主进程 JSDOM 生成 data:URL 页面，独立渲染进程） |
| H | 隐藏窗口（PlantUML 渲染窗、PDF 导出窗） |

| 模式 | 含义 |
| --- | --- |
| R→M send | `ipcRenderer.send` → 主进程 `ipcListenerManager.register/registerOnce`（ipcMain.on） |
| R→M invoke | `ipcRenderer.invoke` → 主进程 `registerHandleOnce`（ipcMain.handle） |
| M→R send | 主进程 `webContents.send` → 渲染层 `ipcRenderer.on` |
| M→D send | 主进程向 HTML 对话框窗口 send |
| D→M send | HTML 对话框窗口经 dialog preload 白名单 send |
| M→M | 主进程内部事件（当前无） |

> 全仓已无 `ipcMain.on/handle` 直连：所有注册经 `ipcListenerManager`（仅 `ipc-listener-manager.ts:75/125/166` 为封装处）。R→M 高风险通道统一 `withSenderCheck`（或 `assertTrustedSender`）。

#### 二、统计摘要

| 指标 | 数量 | 说明 |
| --- | --- | --- |
| IPC 通道常量 | **92** | WINDOW 8 / CONFIG 2 / THEME 6 / MENU 1 / EDITOR 5 / FILE 24 / FILE_MANAGER 14 / PLUGIN 6 / RENDER 3 / DIALOG 3 / NAVIGATION 1 / VIEW 4 / MONACO 3 / SETTING 2 / SYSTEM 3 / QUICK_LINKS 3 / EVENTS 4 |
| BrowserWindow 创建点 | **4** | 主窗口、windowManager 通用容器（5 个 JSDOM 对话框 + 在线网页窗口）、PDF 导出隐藏窗、PlantUML 渲染隐藏窗 |
| preload 入口 | **2** | `src/preload/index.ts`（主窗口）、`src/preload/dialog.ts`（对话框/隐藏窗） |
| `window.electron` 成员 | **1 对象（受限）** | 受限 `ipcRenderer`：`send`/`invoke` 白名单 **58** 通道、`on`/`once` 白名单 **25** 通道（未知通道丢弃/拒绝并告警；`removeListener`/`removeAllListeners` 不限制）+ `webFrame`{insertCSS,setZoomFactor,setZoomLevel}、`webUtils`{getPathForFile}、`process`{platform,versions,env}；`sendTo`/`sendSync`/`sendToHost`/`postMessage` 不暴露 |
| `window.api` 成员 | **6 方法 / 3 组** | `config.read/write`、`app.notifyRendererReady/getVersion`、`file.recentList/openRecent` |
| 对话框 send 白名单 | **2** | `baize:dialog:create-file-folder-enter`、`baize:dialog:rename-file-folder-enter` |
| 发现异常 | **0 类** | 语义错用（#1）、载荷不一致（#2）、域错配 10 通道（#3/#7）均已修复，见 §五修复记录 |
| 死通道（双端全无） | **0** | 92 个通道均有至少一端引用；2026-11-18 已清理 2 个空转/空实现通道（START_DRAG、INIT_THEME_STYLES）与 2 处死分支 |

#### 三、进程模型与通信拓扑

```text
                 ┌──────────────────────────── 主进程 M ────────────────────────────┐
                 │ index.ts（窗口/生命周期/单实例锁/退出 flush 协议）                │
                 │ ipc/handlers.ts（全局 register/handle）                            │
                 │ ipc/menu-*.ts（菜单动作树：file/edit/view/tools/online/help…）     │
                 │ ipc/ipc-listener-manager.ts（监听台账）                            │
                 │ config/*（config-manager / theme / system / editor / quick-link）  │
                 │ dialogs/*（JSDOM 对话框 HTML 生成）                                │
                 │ renders/plantuml-local.ts（隐藏窗渲染）                            │
                 │ utils/*（file-utils、security、auto-backup、tray、startup-restore）│
                 └───┬──────────────────────┬────────────────────┬──────────────────┘
         preload/index.js        preload/dialog.js                      无 preload
         （electron + api）      （electronAPI 受限）                   （executeJavaScript/loadFile）
          ┌────────────▼──┐    ┌────────▼──────────┐        ┌───────────────▼────────┐
          │ 主窗口 R      │    │ D: 5 个 JSDOM 对话框│        │ H: PlantUML 渲染窗        │
          │ Vue 应用      │    │ + 在线网页窗口      │        │    PDF 导出窗             │
          │ Monaco/预览/  │    │ data:URL / 远程 URL │        │    （隐藏，show:false）   │
          │ 自绘菜单/状态栏│    │ send 白名单 2 通道  │        │                          │
          └───────────────┘    └────────────────────┘        └──────────────────────────┘
```

- **单主进程**，每个 BrowserWindow 一个渲染进程；未使用 utilityProcess / MessageChannelMain / MessagePort / BrowserView / WebContentsView。
- **preload 单文件约束**：`electron.vite.config.ts` 的 `isolatedEntries: true` + `externalizeDeps: false`，产物 `out/preload/index.js` / `dialog.js`（主窗口与对话框均 `sandbox:true`，preload 必须自包含）。

#### 四、通道矩阵（92 通道 / 17 组）

##### 4.1 WINDOW（8）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| MINIMIZE | `baize:window:minimize` | R→M send | 最小化主窗口 | handlers.ts:420 registerOnce | useWindowManagement.ts:128、WelcomeScreen.vue:130 |
| MAXIMIZE | `baize:window:maximize` | R→M send | 最大化主窗口 | handlers.ts:427 registerOnce | App.vue:59/87、useWindowManagement.ts:133、WelcomeScreen.vue:134 |
| CLOSE | `baize:window:close` | R→M send | 请求关闭主窗口（触发 close 拦截→flush 协议；无活动文件时快速关闭） | handlers.ts:434 registerOnce | useWindowManagement.ts:138、WelcomeScreen.vue:138 |
| TOGGLE_MAXIMIZE | `baize:window:toggle-maximize` | R→M send | 双击标题栏切换最大化/还原 | handlers.ts:441 registerOnce | useWindowManagement.ts:191 |
| GET_BOUNDS | `baize:window:get-bounds` | R→M invoke | 取窗口边界（拖动/缩放起点） | handlers.ts:453 registerHandleOnce | useWindowManagement.ts:148/201 |
| IS_MAXIMIZED | `baize:window:is-maximized` | R→M invoke | 查询是否最大化 | handlers.ts:467 registerHandleOnce | useWindowManagement.ts:150/197 |
| MOVE | `baize:window:move` | R→M send | 设置窗口位置（AS-6 范围校验） | handlers.ts:494 registerOnce | useWindowManagement.ts:58/87/158（rAF 合帧） |
| SET_SIZE | `baize:window:set-size` | R→M send | 设置窗口尺寸（AS-6 校验） | handlers.ts:511 registerOnce | useWindowManagement.ts:88 |

##### 4.2 CONFIG（2）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| READ | `baize:config:read` | R→M invoke | 按名读配置（system/theme/editor/quick-links 路由到 electron-store 真源，其余读裸 JSON；backup 返回备份状态） | config-manager.ts:522 registerHandleOnce | preload `api.config.read`（preload/index.ts:30）；useConfigStore.ts:307-312、WelcomeScreen.vue:101-102、App.vue:69/130、i18n.ts:46、MenuBar.vue:143、ThemeSettingDialog.vue:541、SystemSettingDialog.vue:606/660/745/766、MarkdownPreviewComponent.vue:302 |
| WRITE | `baize:config:write` | R→M invoke | 按名写配置并触发副作用（theme 广播 THEME_UPDATED；system 应用副作用+广播 SYSTEM_SETTING_UPDATE；editor 广播 INIT_SETTING；backup 备份/恢复命令） | config-manager.ts:536 registerHandleOnce | preload `api.config.write`（index.ts:34）；useConfigStore.ts:272、App.vue:78、EditorSettingDialog.vue:570、SystemSettingDialog.vue:737/772/792 |

##### 4.3 THEME（6）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| UPDATE_THEME | `baize:theme:update` | R→M send | 主题变更后请求主进程向所有窗口广播 | index.ts:411 registerOnce | BaiZeNotes.vue:286-291 |
| THEME_UPDATED | `baize:theme:updated` | M→R send | 主题热更新广播（样式 + Monaco 主题） | theme-broadcast.ts:44（被 index.ts:429、system-theme.ts:59 调用）、config-manager.ts:245 | BaiZeNotes.vue:588、MenuBar.vue:161；对话框内联脚本 ShowCreateFileFolderDialog.ts:354、ShowRenameDialog.ts:226 |
| LOAD_MONACO_THEME | `baize:theme:load-monaco` | R→M invoke | 按主题名读 Monaco 主题定义 | handlers.ts:767 registerHandleOnce | BaiZeNotes.vue:521-524 |
| GET_CURRENT_THEME_STYLES | `baize:theme:get-current-styles` | R→M invoke | 取当前/指定主题 ThemeStyles | utils.ts:576 registerHandleOnce | BaiZeNotes.vue:269/597 |
| GET_ALL_THEMES | `baize:theme:get-all` | R→M invoke | 全部应用主题列表 | utils.ts:591 registerHandleOnce | ThemeSettingDialog.vue:476、SystemSettingDialog.vue:608 |
| GET_ALL_MONACO_THEMES | `baize:theme:get-all-monaco` | R→M invoke | 全部 Monaco 主题列表 | utils.ts:597 registerHandleOnce | ThemeSettingDialog.vue:527 |

##### 4.4 MENU（1）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| ACTION | `baize:menu:action` | R→M send | 菜单/右键动作字符串 → 主进程动作树分发（`HandleBaiZeMenuAction`，要求 `baize:menu:` 前缀且命中菜单树） | handlers.ts:530 registerOnce（withSenderCheck） | menu-actions.ts:370、resource-manager.ts:496 |

##### 4.5 EDITOR（5）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| GET_SETTING | `baize:editor:get-setting` | R→M invoke | 读编辑器配置真源 | handlers.ts:777 registerHandleOnce | MarkdownMonacoEditor.vue:602 |
| INIT_SETTING | `baize:editor:init-setting` | M→R send | 下发完整 EditorSetting（启动/保存/视图开关） | index.ts:223、config-manager.ts:258、menu-view.ts:53 | MarkdownMonacoEditor.vue:632 |
| UPDATE_OPTIONS | `baize:editor:update-options` | M→R send（另有 R→M 死分支） | 主进程通知 Monaco 单项选项（lineNumbers/renderWhitespace） | menu-view.ts:85/89 | MarkdownMonacoEditor.vue:106/663；BaiZeNotes.vue:476 的 R→M 发送无接收（§五-2） |
| FLUSH_CONTENT | `baize:editor:flush-content` | M→R send | 关闭/退出落盘协议第 1 步（请求 flush 全文） | index.ts:111（close 拦截 :176、before-quit :539 调用），2s 超时兜底 | MarkdownEditComponent.vue:359/393、App.vue:126/148 |
| FLUSH_CONTENT_DONE | `baize:editor:flush-content-done` | R→M send | 渲染层回执（主进程收到后才继续关闭） | index.ts:101 register（组件 main-window-flush，finish 时注销） | MarkdownEditComponent.vue:195 |

##### 4.6 FILE（24）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| OPEN_SPECIFIC_FOLDER | `baize:file:open-specific-folder` | R→M send | 打开指定工作区目录（AS-2 根校验 → 清空编辑器 → 重扫目录 → 存最近目录） | handlers.ts:543 registerOnce | App.vue:61 |
| WELCOME_OPEN_DIRECTORY | `baize:file:welcome-open-directory` | R→M send | 欢迎页「打开文件夹」→系统选择→进主界面 | handlers.ts:616 registerOnce | App.vue:52 |
| WELCOME_OPEN_FILE | `baize:file:welcome-open-file` | R→M send | 欢迎页「打开文件」→系统选择（仅 md）→进主界面 | handlers.ts:650 registerOnce | App.vue:46 |
| WELCOME_ENTER_MAIN | `baize:file:welcome-enter-main` | M→R send | 通知渲染层离开欢迎页进入主界面（FE-01 先发本通道再下一 tick 发数据事件） | handlers.ts:632/674、startup-restore.ts:55 | App.vue:124/146 |
| OPEN_SELECT_FILE | `baize:file:open-select-file` | R→M send | 请求打开/切换文件（Path Guard → 读盘 → 回发内容/路径事件；切换前保存旧文件） | utils.ts:270 registerOnce | FileTreeNode.vue:122、MarkdownPreviewComponent.vue:364、resource-manager.ts:466 |
| IMPORT_NEW_FILE | `baize:file:import` | R→M invoke | 导入内容另存为新文件 | handlers.ts:692 registerHandleOnce | BaiZeNotes.vue:420 |
| CREATE_FILE_FOLDER | `baize:file:create-entry` | R→M invoke | 新建文件/文件夹（Vue 对话框提交） | handlers.ts:705 registerHandleOnce | BaiZeNotes.vue:441 |
| GET_CURRENT_FILE_PATH | `baize:file:get-current-path` | R→M invoke | 取当前活动文件目录（新建默认目录） | handlers.ts:722 registerHandleOnce | menu-actions.ts:205 |
| SELECT_DIRECTORY | `baize:file:select-directory` | R→M invoke | 系统目录选择框返回绝对路径 | handlers.ts:731 registerHandleOnce | CreateFileFolderDialog.vue:128、SystemSettingDialog.vue:698 |
| SELECT_IMAGE | `baize:file:select-image` | R→M invoke | 插入图片「浏览」：系统图片框→受信登记→复制到 images/→返回引用 | handlers.ts:745 registerHandleOnce | BaiZeNotes.vue:386 |
| CLEAR_EDITOR_PREVIEW | `baize:file:clear-editor-preview` | M→R send | 清空编辑器/预览（切目录/进入主界面前） | handlers.ts:557/637、startup-restore.ts:85、file-operations.ts:682 | MarkdownEditComponent.vue:354/389 |
| SAVE_TO_DISK | `baize:file:save-content-to-disk` | R→M send | 保存编辑器全文（菜单/Ctrl+S） | utils.ts:675 registerOnce | MarkdownEditComponent.vue:184 |
| UPDATE_SELECT_FILE_CONTENT | `baize:file:update-content` | R→M send | 编辑内容 500ms 防抖同步到主进程（不落盘） | utils.ts:612 registerOnce | MarkdownEditComponent.vue:161 |
| CHECK_EXISTS | `baize:file:check-exists` | R→M invoke | 探测文件是否存在（PDF 加载前） | utils.ts:752 registerHandleOnce | ShowPdfEditor.vue:144 |
| READ_HTML | `baize:file:read-html` | R→M invoke | 读文本/HTML 内容（Path Guard） | utils.ts:697 registerHandleOnce | ShowHtmlView.vue:111、MarkdownPreviewComponent.vue:264（snippets） |
| READ_BINARY | `baize:file:read-binary` | R→M invoke | 读取本地 PDF 二进制（pdf.js 预览数据源）：Path Guard + 仅 `.pdf` + 单文件 **128MB** 上限校验后返回 Uint8Array（Buffer 结构化克隆），交由 pdf.js 解析渲染（遗留清单 #9） | utils.ts:734 registerHandleOnce（2026-11-18 新增；2026-11-19 收紧 `.pdf`/128MB 边界） | ShowPdfEditor.vue:233 |
| OPEN_IN_BROWSER | `baize:file:open-in-browser` | R→M send | 本地 HTML 交系统默认浏览器打开：仅 `.html`/`.htm` + Path Guard 校验 → `pathToFileURL` → `shell.openExternal`（替代误用 `OPEN_EXTERNAL_LINK`，遗留清单 #1） | utils.ts:813 registerOnce（2026-11-18 新增） | ShowHtmlView.vue:158 |
| USER_SELECT_FILE | `baize:file:user-select-file` | M→R send | 当前活动文件切换广播（打开/新建/另存为/重命名后） | file-operations.ts:343/490/658 | StatusBar.vue:161、resource-manager.ts:410/465、MarkdownPreviewComponent.vue:373 |
| RECENT_LIST | `baize:file:recent-list` | R→M invoke | 「文件」菜单拉取最近文件/最近文件夹（各≤20） | handlers.ts:570 registerHandleOnce（2026-11-18 新增） | preload `api.file.recentList`（index.ts:65）→ MenuBar.vue:107/112 |
| OPEN_RECENT | `baize:file:open-recent` | R→M invoke | 打开最近项（最近列表严格白名单 → 文件走 OpenSelectFile / 目录走 openDirectoryInMainView） | handlers.ts:586 registerHandleOnce（2026-11-18 新增） | preload `api.file.openRecent`（index.ts:69）→ menu-actions.ts:81/87 |
| OPEN_WITH_ENCODING | `baize:file:open-with-encoding` | M→R send | 编码菜单「以指定编码打开」下发编码名 | menu-file.ts:14（9 种编码） | MarkdownEditComponent.vue:361/395 |
| CONVERT_TO_ENCODING | `baize:file:convert-to-encoding` | M→R send | 编码菜单「转换编码」下发编码名 | menu-file.ts:21（9 种） | MarkdownEditComponent.vue:362/399 |
| REOPEN_WITH_ENCODING | `baize:file:reopen-with-encoding` | R→M invoke | 按指定编码重读活动文件 | utils.ts:640 registerHandleOnce | MarkdownEditComponent.vue:324 |
| CONVERT_SAVE_ENCODING | `baize:file:convert-save-encoding` | R→M invoke | 按指定编码转码写盘（广播 FILE_SAVED_SUCCESS） | utils.ts:655 registerHandleOnce | MarkdownEditComponent.vue:333 |

##### 4.7 FILE_MANAGER（14，右键菜单）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| COPY_RELATIVE_PATH | `baize:fs:copy-relative-path` | R→M send | 复制相对路径（反斜杠→正斜杠） | utils.ts:290 registerOnce | resource-manager.ts:505 |
| COPY_IMAGELINK | `baize:fs:copy-image-link` | R→M send | 复制 Markdown 图片链接 | utils.ts:301 registerOnce | resource-manager.ts:507 |
| COPY_FILELINK | `baize:fs:copy-file-link` | R→M send | 复制 Markdown 文件链接 | utils.ts:312 registerOnce | resource-manager.ts:509 |
| COPY_FILE | `baize:fs:copy-file` | R→M send | 记录复制源（供粘贴） | utils.ts:323 registerOnce | resource-manager.ts:511 |
| CUT | `baize:fs:cut` | R→M send | 记录剪切源 | utils.ts:334 registerOnce | resource-manager.ts:520 |
| PASTE | `baize:fs:paste` | R→M send | 粘贴（同名提示；cut 复制后删源） | utils.ts:345 registerOnce | resource-manager.ts:524 |
| OPEN_IN_EXPLORER | `baize:fs:open-in-explorer` | R→M send | 在资源管理器中定位 | utils.ts:356 registerOnce | resource-manager.ts:541、ShowPdfEditor.vue:197 |
| RELOAD_FROM_DISK | `baize:fs:reload-from-disk` | R→M send | 从磁盘重扫目录树（→ FILE_SYSTEM_DATA） | utils.ts:367 registerOnce | resource-manager.ts:545 |
| CREATE_FILE | `baize:fs:create-file` | R→M send | 右键新建 → 打开主进程 JSDOM 新建对话框 | dialogs.ts:50 register | resource-manager.ts:369 |
| RENAME | `baize:fs:rename` | R→M send | 右键重命名 → 打开 JSDOM 重命名对话框 | dialogs.ts:94 register | resource-manager.ts:537 |
| DELETE | `baize:fs:delete` | R→M send | 右键删除（确认框 → 递归/单文件删除） | dialogs.ts:71 register | resource-manager.ts:528 |
| IMPORT_FROM | `baize:fs:import-from` | R→M send | 右键导入（复用文本导入流程） | dialogs.ts:58 register | resource-manager.ts:378 |
| FIND_IN | `baize:fs:find-in` | R→M send | 在文件夹中显示（AS-8 校验） | dialogs.ts:79 register | resource-manager.ts:533 |
| FILE_SYSTEM_DATA | `baize:fs:file-system-data` | M→R send | 推送整棵目录树（sha256 去重） | directory-tree.ts:927 | ResourceManager.vue:181/186 |

##### 4.8 PLUGIN（6）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| RSA_GENERATE | `baize:plugin:rsa-generate` | R→M send | 生成 RSA 密钥对（bits 白名单 1024/2048/3072/4096） | utils.ts:400 registerOnce | RSAGenerator.vue:61 |
| RSA_RESULT | `baize:plugin:rsa-result` | M→R send | 回投生成的公私钥 | encrypt-decrypt.ts:44（sendToMainWindow） | RSAGenerator.vue:70/74 |
| HASH_TEXT | `baize:plugin:hash-text` | R→M invoke | 计算 9 种摘要 | utils.ts:413 registerHandleOnce | HashText.vue:143 |
| HMAC_TEXT | `baize:plugin:hmac-text` | R→M invoke | 计算 HMAC | utils.ts:427 registerHandleOnce | HmacGenerator.vue:129 |
| CRYPTO_ENCRYPT | `baize:plugin:crypto-encrypt` | R→M invoke | 对称加密 | utils.ts:450 registerHandleOnce | CryptoEncDec.vue:355 |
| CRYPTO_DECRYPT | `baize:plugin:crypto-decrypt` | R→M invoke | 对称解密 | utils.ts:464 registerHandleOnce | CryptoEncDec.vue:388 |

##### 4.9 RENDER（3）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| INSERT_IMAGE | `baize:render:insert-image` | R→M send | 粘贴图片请求落盘 images/（结果经 MONACO_INSERT.TEXT_BLOCK_TEMPLATES 回投） | utils.ts:380 registerOnce | hemy-editor-common.ts:361 |
| PLANTUML_LOCAL | `baize:render:plantuml-local` | R→M invoke | PlantUML 本地离线渲染（隐藏窗，10s/12s 超时，LRU 50） | plantuml-local.ts:520 registerHandleOnce（index.ts:473 调用） | hemy-editor-render.ts:475（常量 :230） |
| READY | `baize:render:ready` | R→M send | 渲染层就绪握手（主进程收到后才执行启动恢复；3s 超时兜底） | index.ts:445 registerOnce（withSenderCheck） | preload `api.app.notifyRendererReady`（index.ts:43）→ App.vue:141 |

##### 4.10 DIALOG（3）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| CREATE_FILE_FOLDER_ENTER | `baize:dialog:create-file-folder-enter` | D→M send | 新建对话框提交名称 | ShowCreateFileFolderDialog.ts:92 register（scope=dialog）；dialog preload 白名单 | 内联脚本 ShowCreateFileFolderDialog.ts:336 |
| RENAME_FILE_FOLDER_ENTER | `baize:dialog:rename-file-folder-enter` | D→M send | 重命名对话框提交新名 | ShowRenameDialog.ts:75 register（scope=dialog）；dialog preload 白名单 | 内联脚本 ShowRenameDialog.ts:207 |
| OPEN_VUE_DIALOG | `baize:dialog:open-vue` | M→R send | 主进程请求渲染层打开 Vue 对话框（17 个发送点：菜单/快捷键/导入/另存为/消息框等） | menu-file.ts:26/31、menu-tools.ts:57-66、menu-view.ts:103-113、short-key-register.ts:124、import.ts:313、file-operations.ts:241/248、dialog-helpers.ts:28/44/61 | BaiZeNotes.vue:589（handleOpenVueDialog）/625 |

##### 4.11 NAVIGATION（1）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| OPEN_EXE | `baize:navigation:open-exe` | R→M send | 快速链接启动本地程序（sender/绝对路径/isFile/扩展名白名单/受信目录/用户确认多层校验） | utils.ts:484 registerOnce（assertTrustedSender） | NaviTab.vue:149 |

##### 4.12 VIEW（4）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| EDIT_MODE | `baize:view:edit-mode` | M→R send | 切换纯编辑视图 | menu-view.ts:63、short-key-register.ts:91（F9） | MarkdownEditComponent.vue:355/390 |
| PREVIEW_MODE | `baize:view:preview-mode` | M→R send | 切换纯预览视图 | menu-view.ts:66、short-key-register.ts:95（F10） | MarkdownEditComponent.vue:356 |
| EDIT_PREVIEW_MODE | `baize:view:edit-preview-mode` | M→R send | 切换编辑+预览分栏 | menu-view.ts:69、short-key-register.ts:99（F11） | MarkdownEditComponent.vue:357 |
| TOGGLE_RES_MANAGER | `baize:view:toggle-resource-manager` | M→R send | 切换资源管理器显隐 | menu-view.ts:81 | WorkSpace.vue:213/220 |

##### 4.13 MONACO（3）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| TEXT_BLOCK_TEMPLATES | `baize:monaco:insert-text-block` | M→R send | 下发给编辑器插入的文本块（如插入图片后的 markdown） | utils.ts:386-389 | MarkdownMonacoEditor.vue:102/659 |
| AFTER_CURSOR | `baize:monaco:insert-after-cursor` | M→R send | 在光标后插入内容（导入文件非新建模式） | import.ts:315 | MarkdownMonacoEditor.vue:101/655 |

| UNDO_REDO | `baize:monaco:undo-redo` | M→R send | 触发 Monaco 命令（undo/redo/cut/copy/paste，payload=action id） | menu-edit.ts:4/7/15/18/21 | MarkdownMonacoEditor.vue:107/664 |

##### 4.14 SETTING（2）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| SYSTEM_SETTING_UPDATE | `baize:setting:updated` | M→R send | 系统设置变更广播（菜单形态/语言/远程图片等） | config-manager.ts:211 | BaiZeNotes.vue:587、MarkdownPreviewComponent.vue:375、i18n.ts:56 |
| AUTO_SAVE_CHANGED | `baize:setting:auto-save-changed` | R→M invoke | 自动保存开关/间隔变更（启停定时器，返回状态） | handlers.ts:788 registerHandleOnce | SystemSettingDialog.vue:714-720 |

##### 4.15 SYSTEM（3）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| OPEN_EXTERNAL_LINK | `baize:system:open-external-link` | R→M send | 系统浏览器打开外部链接（仅 http/https；本地 HTML 走 FILE.OPEN_IN_BROWSER） | utils.ts:728 registerOnce | 主窗口 window.open 兜底（index.ts）；dialog preload 白名单 |
| SYSTEM_INFO | `baize:system:get-info` | R→M invoke | 系统描述（OS/架构/版本） | handlers.ts:759 registerHandleOnce | HelpAboutDialog.vue:187 |
| APP_VERSION | `baize:system:app-version` | R→M invoke | 版本信息（version.json + 运行时 electron/chrome/node） | utils.ts:778 registerHandleOnce | preload `api.app.getVersion`（index.ts:57）→ HelpAboutDialog.vue:155 |

##### 4.16 QUICK_LINKS（3）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| GET | `baize:quick-links:get` | R→M invoke | 读快速链接列表（主进程唯一数据源） | utils.ts:568 registerHandleOnce | NaviTab.vue:122、QuickLinkSettingDialog.vue:239 |
| SAVE | `baize:quick-links:save` | R→M invoke | 保存快速链接（归一化校验，≤50 条；广播 UPDATED） | handlers.ts:823 registerHandleOnce | QuickLinkSettingDialog.vue:281 |
| UPDATED | `baize:quick-links:updated` | M→R send | 广播保存后的列表（导航栏即时刷新） | handlers.ts:835 | NaviTab.vue:184/190 |


##### 4.17 EVENTS（4，M→R 广播集合）

| 常量 | 字符串 | 方向 | 作用 | 主进程侧 | 渲染层侧 |
| --- | --- | --- | --- | --- | --- |
| STATUS_BAR_UPDATE | `baize:status-bar:update` | M→R send（30 处） | 状态栏消息（成功/警告/错误、日志镜像、启动恢复、备份/菜单/保存提示） | handlers.ts:80/161/233、menu-handle.ts:122、auto-backup.ts:446/458、auto-save.ts:39、logger.ts:420、directory-tree.ts:828/984/1029/1039、startup-restore.ts:114/127/141/162、file-operations.ts:89/130/345/492/504/539/578/659、utils.ts:60/245/623、image-operations.ts:23、shared.ts:115/130 | StatusBar.vue:163/176 |
| FILE_SAVED_SUCCESS | `baize:file:saved` | M→R send | 保存成功通知（清除未保存标记，全窗口广播） | file-operations.ts:122/575 | StatusBar.vue:162/175 |
| FILE_CONTENT_RELOADED | `baize:file:content-reloaded` | M→R send | 磁盘内容变化且非脏时重载编辑器 | directory-tree.ts:1024 | MarkdownEditComponent.vue:351/388 |
| SHOW_SELECTED_FILE_CONTEXT | `baize:fs:show-selected-file-context` | M→R send | 推送当前活动文件内容（新建/打开/重载/清空） | file-operations.ts:342/489/538/657 | MarkdownEditComponent.vue:350/384 |

#### 五、异常与风险清单（已清零）

> **统计口径**：92 通道 / 17 组（2026-11-19 复核；含 2026-11-18 补录的 `FILE.OPEN_IN_BROWSER`、`FILE.READ_BINARY`）。

> **2026-11-18 复核：异常清单已清零**。历史已处理项：① 空转/死分支 4 项（`WINDOW.START_DRAG` 空实现、`THEME.INIT_THEME_STYLES` 半死、`EDITOR.UPDATE_OPTIONS` R→M 死分支、`EVENTS.STATUS_BAR_UPDATE` 反向 send）；② 语义错用 1 项（`SYSTEM.OPEN_EXTERNAL_LINK` 的本地文件调用已改走 `FILE.OPEN_IN_BROWSER`，遗留清单 #1）；③ 载荷不一致 1 项（`THEME.THEME_UPDATED`，MenuBar 改读配置，遗留清单 #2）；④ 域错配 10 通道 / 5 组（分组与 domain 已统一为 17 组，遗留清单 #3/#7）。详见 [当前遗留问题清单](当前遗留问题清单.md)。

#### 六、窗口容器与 preload 矩阵

##### 6.1 BrowserWindow 容器（4 个创建点）

| # | 窗口 | 创建位置 | 加载方式 | preload | webPreferences 关键项 | 生命周期 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 主窗口 | `index.ts:137-155` | dev `loadURL(devServerUrl)` / prod `loadFile(../renderer/index.html)` | `index.js` | nodeIntegration:false、contextIsolation:true、sandbox:true、webSecurity:!is.dev | 单例锁 + 模块级单例；ready-to-show 注入主题/字体/编辑器设置并 armStartupRestore；close 拦截 flush→保存→minimizeToTray 隐藏或真关；bounds 持久化；导航/新窗口安全拦截；window-all-closed/cleanupApp/before-quit 统一清理 |
| 2 | windowManager 通用容器 | `window-manager.ts:47 createWindow` | JSDOM HTML → `data:text/html`；在线网页 `loadURL(远程 http/https)` | `dialog.js`（对话框）；在线网页**无 preload** | nodeIntegration:false、contextIsolation:true、sandbox:true、frame:false | 单例参数控制（对话框 true / 在线网页 false）；closed → cleanupComponent + 删除映射；`closeAll` 全仓零调用 |
| 3 | PDF 导出隐藏窗 | `export.ts:327-335` | `loadURL(data:text/html)` | 无 | nodeIntegration:false、contextIsolation:true（sandbox 默认） | 每次导出新建；printToPDF 后 finally close（防泄漏） |
| 4 | PlantUML 渲染隐藏窗 | `plantuml-local.ts:268-281` | `loadFile(resources/plantuml/index.html)` | 无 | nodeIntegration:false、contextIsolation:true、sandbox:true、webSecurity:true、backgroundThrottling:false | 单例复用 + 并发去重 + 串行队列 + SVG LRU 50；20s 加载超时 / did-fail-load / render-process-gone 销毁；主窗口 closed 与 cleanupApp 释放 |

**5 个 JSDOM 对话框**（均单例、`frame:false`、`dialog.js` preload）：`create-file-folder`（ShowCreateFileFolderDialog，450×230）、`rename-file-folder`（ShowRenameDialog，500×220）、`release-notes-dialog-<version>`（ShowReleaseNotesDialog，800×650）、`shortcut-keys-dialog`（ShowShortcutKeysDialog，620×640）、`update-log-dialog`（ShowUpdateLogDialog，900×700）。在线网页窗口 `online-web-page`（1280×960，可多开，无 IPC 桥）。

##### 6.2 preload 暴露成员

| 入口 | 全局对象 | 成员 |
| --- | --- | --- |
| `src/preload/index.ts` | `window.electron` | 受限 electronAPI：ipcRenderer（send/invoke 白名单 **58** 通道、on/once 白名单 **25** 通道；sendTo/sendSync/sendToHost/postMessage 不暴露）+ webFrame / webUtils / process |
| `src/preload/index.ts` | `window.api` | config{read,write}、app{notifyRendererReady,getVersion}、file{recentList,openRecent} |
| `src/preload/dialog.ts` | `window.electronAPI` | ipcRenderer{send(白名单),on,removeListener}、shell{openExternal(仅 http/https)} |

##### 6.3 dialog preload send 白名单（2）

1. `baize:dialog:create-file-folder-enter`
2. `baize:dialog:rename-file-folder-enter`

> 白名单外 send 被丢弃并告警；`on`/`removeListener` 不做通道白名单；`shell.openExternal` 协议白名单仅 http/https。

#### 七、校验覆盖汇总

| 层 | 覆盖 |
| --- | --- |
| sender 校验 | 全部 R→M 通道（含 D→M 对话框通道，scope=dialog）经 `withSenderCheck` / `assertTrustedSender`；仅 `OPEN_EXE` 为手写 `assertTrustedSender`（多层路径校验） |
| Path Guard | OPEN_SELECT_FILE、IMPORT_NEW_FILE、CREATE_FILE_FOLDER、CHECK_EXISTS、READ_HTML、REOPEN_WITH_ENCODING、CONVERT_SAVE_ENCODING、RECENT 目标；FILE_MANAGER 复制/剪切/粘贴/删除/定位/重命名全链路 |
| 配置 schema | CONFIG.READ/WRITE：配置名正则白名单 + `isAllowedConfigName` + `validateConfigData` 字段级校验（AS-4） |
| 数值范围 | WINDOW.MOVE/SET_SIZE（AS-6 坐标/尺寸上限）、RSA bits 白名单、AUTO_SAVE_CHANGED interval 校验 |
| 最近项白名单 | OPEN_RECENT：payload 结构校验 + 当前最近列表严格相等白名单 + recentMenuLimit=20 |
| 对话框白名单 | dialog preload 仅 2 个 send 通道；shell 仅 http/https |

#### 八、与历史报告的差异

| 项 | 2026-11-15 快照 | 当前（本报告） |
| --- | --- | --- |
| 通道数 | 123 | **92**（死通道清理 + PF-02 渲染通道移除 + HTML 对话框大量下线；2026-11-18 新增最近文件 2 通道与 `OPEN_IN_BROWSER`/`READ_BINARY` 等） |
| HTML 对话框 | 14 个可见 | 5 个（新建/重命名/发布说明/快捷键/更新日志）+ 在线网页窗口 |
| 隐藏窗口 | 3（Mermaid/PlantUML/PDF） | 2（PlantUML/PDF；Mermaid 隐藏窗链路已删） |
| 渲染通道 | 4 个 PRE/POST | 0（预览本地单跳渲染） |
| 新增通道 | — | `RENDER.READY`、`FILE.RECENT_LIST`、`FILE.OPEN_RECENT`、`FILE.OPEN_IN_BROWSER`、`FILE.READ_BINARY`、`QUICK_LINKS.SAVE/UPDATED`、`FILE.SELECT_IMAGE`、`EDITOR.SYSTEM_SETTING_UPDATE` 等 |
| 2026-11-18 死通道清理 | — | 删除 `WINDOW.START_DRAG`、`THEME.INIT_THEME_STYLES`（常量+发送+注册+测试断言）；删除 `EDITOR.UPDATE_OPTIONS` 的 R→M 死分支与 `STATUS_BAR_UPDATE` 反向 send；历史报告 16 个死通道此前已全部清理（当前 0 个零引用常量） |
| preload 暴露 | 27 成员 | 受限 electronAPI（ipcRenderer send/invoke 白名单 58 通道、on/once 白名单 25 通道，sendTo/sendSync/sendToHost/postMessage 不暴露 + webFrame/webUtils/process）+ api 6 方法 + dialog 受限 API |

> 本报告基于当前工作区源码（含未提交的最近文件菜单改动）；历史快照 `2026-11-15-IPC通信矩阵.md` 保留作归档。

## 二、历史快照（2026-11-15，123 通道口径）

- 编制日期：2026-11-15
- 扫描依据：`src/shared/ipc-channels.ts`（通道常量唯一真源，ARC-03）+ `src/main/**`、`src/preload/**`、`src/renderer/src/**` 全量交叉检索
- 覆盖范围：**123 个 IPC 通道**（16 个分组）、**18 类 BrowserWindow 容器**、**27 个 preload 暴露成员**、**17 个对话框 send 白名单通道**、**25 个 EventBus 事件**
- 方法：对每个通道常量 grep 实际发送点/接收点，只按源码事实填写，不按命名猜测

#### 一、方向记号

| 记号 | 含义 |
| --- | --- |
| M | 主进程（`src/main/**`） |
| R | 主窗口渲染进程（`src/renderer/**`） |
| D | HTML 对话框窗口渲染进程（`src/main/dialogs/**` 生成的 HTML） |
| H | 隐藏渲染/工具窗口（Mermaid 隐藏窗、PlantUML 渲染窗、PDF 导出窗） |
| sys | Electron 系统级对话框 / 外部系统（浏览器、资源管理器、全局快捷键） |

| 方向/模式 | 含义 |
| --- | --- |
| R→M send | 渲染层单向通知主进程（`ipcRenderer.send` → `ipcMain.on`） |
| R→M invoke | 渲染层请求-响应（`ipcRenderer.invoke` → `ipcMain.handle`） |
| M→R send | 主进程向主窗口广播/推送（`webContents.send`） |
| M→D send | 主进程向 HTML 对话框窗口推送 |
| D→M send | HTML 对话框窗口向主进程发送（经 preload 白名单） |
| M→R sendSync | 主进程同步应答（`event.returnValue`，全项目已无调用点） |

#### 二、统计摘要

| 指标 | 数量 | 说明 |
| --- | --- | --- |
| IPC 通道常量 | **123** | WINDOW 10 / CONFIG 5 / THEME 13 / MENU 1 / EDITOR 14 / FILE 18 / FILE_MANAGER 14 / PLUGIN 6 / RENDER 2 / DIALOG 14 / NAVIGATION 2 / VIEW 5 / MONACO_INSERT 3 / QUICK_LINKS 5 / OVERLAY 7 / EVENTS 4（PF-02 重构后原 RENDER 组 4 个 pre/post 渲染通道已移除） |
| BrowserWindow 容器类型 | **18** | 主窗口 1 + 可见 HTML 对话框 14 + 隐藏窗口 3 |
| preload 构建入口 | **2** | `preload/index.ts`（主窗口）、`preload/dialog.ts`（对话框/隐藏窗） |
| preload 暴露成员 | **27** | `window.electron` 17 + `window.api` 5 + `window.electronAPI` 5 |
| 对话框 send 白名单 | **17** | `src/preload/dialog.ts`（ARC-01） |
| EventBus 事件 | **25** | 23 个正常、1 个有发无收、1 个有收无发 |
| `ipcListenerManager` 公共成员 | **10** | 注册 3 + 注销/清理 4 + 统计 2 + 单例入口 1 |
| 疑似死通道 | **16** | A 组 10 + B 组 6（详见第八节） |
| 机制层风险 | **10 条** | C-01 ～ C-10（详见第八节） |

#### 三、进程模型与通信拓扑

##### 3.1 进程模型

- **单主进程**：窗口创建、菜单动作分发、文件/配置读写、Markdown 预/后渲染、隐藏渲染（PlantUML）、快捷键。
- **多渲染进程**：每个 `BrowserWindow` 一个渲染进程；主窗口与 HTML 对话框彼此隔离。
- **无额外进程形态**：全仓库未使用 `utilityProcess`、`MessageChannelMain`、`MessagePort`、`BrowserView`、`WebContentsView`。
- **preload 两套**（`electron.vite.config.ts:13-23`）：
  - `src/preload/index.ts` → 主窗口：完整 `electronAPI` + 自定义 `api`（配置/版本）
  - `src/preload/dialog.ts` → HTML 对话框与 Mermaid 隐藏窗：受限 `electronAPI`（send 白名单 17 通道）

<!-- SVG:topology -->
##### 3.2 通信拓扑（图形视图与文字图）

```text
                            ┌──────────────────────────────────────────────┐
                            │                 主进程 M                      │
                            │  src/main/index.ts                           │
                            │  ├─ ipc/handlers.ts      全局 send/handle     │
                            │  ├─ ipc/menu-*.ts        菜单动作树           │
                            │  ├─ config/*             配置/主题/快捷键      │
                            │  ├─ dialogs/*            JSDOM→data:URL 对话框 │
                            │  ├─ renders/*            预/后渲染、PlantUML   │
                            │  └─ ipc/ipc-listener-manager.ts（监听器台账） │
                            └───┬───────────┬──────────────┬───────────────┘
              preload/index.js  │           │ preload/dialog.js              │ 无 preload
              ipcMain.handle/on │           │ webContents.send / ipcMain.on  │ executeJavaScript
                    ┌───────────▼──┐   ┌────▼─────────────┐        ┌────────▼─────────┐
                    │ 主窗口 R     │   │ 14 个 HTML 对话框 │        │ 隐藏窗口 H        │
                    │ renderer/    │   │ D（独立渲染进程）  │        │ plantuml/pdf     │
                    │ index.html   │   │ data:URL HTML     │        │ （渲染即可见性无关）│
                    └───┬──────────┘   └────▲─────────────┘        └──────────────────┘
                        │                   │
      Vue 组件对话框     │  window.open ──► setWindowOpenHandler ──► shell.openExternal（外部浏览器）
      （同进程容器）     │
      EventBus（进程内） │◄── IPC 往返：MENU.ACTION / OPEN_VUE_DIALOG / THEME.* / EDITOR.* / FILE.* / EVENTS.*
                        │
   iframe HTML 预览（srcdoc，sandbox）   <webview> PDF 预览（webviewTag 未启用，不可用）
```

##### 3.3 分层职责

| 层 | 主要文件 | 职责 | 通信手段 |
| --- | --- | --- | --- |
| 主进程 | `src/main/index.ts`、`ipc/**`、`dialogs/**`、`renders/**`、`utils/**` | 窗口、配置与文件状态、菜单动作树、JSDOM 生成对话框 HTML、渲染管线、隐藏窗口托管 | `ipcMain.on/handle`、`webContents.send`、`executeJavaScript`、直接调用 |
| 主窗口渲染进程 | `src/renderer/src/**` | Vue 应用：Monaco 编辑器、预览、资源管理器、自绘菜单栏、Vue 组件对话框 | `window.electron.ipcRenderer.*`、`window.api.*`、EventBus（进程内） |
| HTML 对话框渲染进程 | `src/main/dialogs/*.ts` 内 HTML/脚本字符串 | 主进程拼 HTML → `data:` URL 加载；脚本经 `window.electronAPI` 收发 | `ipcRenderer.send/on`、`shell.openExternal`、`broadcastTheme` |
| 隐藏渲染窗口 | `plantuml-local.ts`、`OpenMermaidRenderFrame.ts`、`export.ts:ToPdf` | PlantUML 出 SVG、Mermaid 出 SVG（遗留）、PDF 导出打印 | `executeJavaScript` / dialog preload / `printToPDF` |

##### 3.4 BrowserWindow 容器全表（18 个）

> 全部窗口 `contextIsolation: true`、`nodeIntegration: false`；`webviewTag` 全项目未开启（`<webview>` 均不可用）。

| # | 容器类型 | 创建文件 | 加载方式 | preload | 备注 |
| --- | --- | --- | --- | --- | --- |
| 1 | 主窗口 | `src/main/index.ts:createWindow` | dev `loadURL` / prod `loadFile` | `index.js` | 无框 900×650；关闭前 flush→保存；唯一 |
| 2 | `create-file-folder` | `ShowCreateFileFolderDialog.ts` | HTML 字符串 | `dialog.js` | 450×150 单例 |
| 3 | `rename-file-folder` | `ShowRemaneDialog.ts` | HTML 字符串 | `dialog.js` | 500×160 单例 |
| 4 | `import-option-dialog` | `ShowImportOptionDialog.ts` | HTML 字符串 | `dialog.js` | 500×400 模态；主进程零调用（不可达） |
| 5 | `font-select-dialog` | `ShowFontSelectDialog.ts` | HTML 字符串 | `dialog.js` | 1280×800 可缩放 |
| 6 | `system-setting-dialog` | `ShowSystemSettingDialog.ts` | HTML 字符串 | `dialog.js` | 800×700；与 Vue 版双轨 |
| 7 | `theme-setting-dialog` | `ShowThemeSettingDialog.ts` | HTML 字符串 | `dialog.js` | 1200×600；模块级 ipcMain.on 未随窗口清理 |
| 8 | `editor-setting-dialog` | `ShowEditorSettingDialog.ts` | HTML 字符串 | **无 preload** | 风险 C-01；单例 |
| 9 | `quick-link-setting-dialog` | `ShowQuickLinkSettingDialog.ts` | HTML 字符串 | `dialog.js` | 900×600 |
| 10 | `help-about-dialog` | `ShowHelpAboutDialog.ts` | HTML 字符串 | `dialog.js` | 750×600 |
| 11 | `help-contact-us-dialog` | `ShowHelpContactUsDialog.ts` | HTML 字符串 | `dialog.js` | 600×400 |
| 12 | `tech-stack-dialog` | `ShowTechStackDialog.ts` | HTML 字符串 | `dialog.js` | 900×700 |
| 13 | `update-log-dialog` | `ShowUpdateLogDialog.ts` | HTML 字符串 | `dialog.js` | 900×700 |
| 14 | `release-notes-dialog-<version>` | `ShowReleaseNotesDialog.ts` | HTML 字符串 | `dialog.js` | 按版本单例 |
| 15 | `online-web-page` | `OpenOnlineWebPages.ts` | **`loadURL(远程 URL)`** | `dialog.js` | 非单例；风险 C-08 |
| 16 | `mermaid-render-frame`（隐藏） | `OpenMermaidRenderFrame.ts` | HTML 字符串 | `dialog.js` | `show:false`；链路半死（C-07） |
| 17 | PlantUML 渲染窗（隐藏） | `src/main/renders/plantuml-local.ts` | `loadFile(resources/plantuml/index.html)` | 无 | 导航全拦截；进程内单例复用 |
| 18 | PDF 导出窗（隐藏） | `export.ts:ToPdf` | `loadURL(data:text/html)` | 无 | 每次导出临时创建，`finally` 关闭 |

> **HTML 对话框可达性**：14 个可见 HTML 对话框中，实际有 UI 入口的约 5–6 个（release-notes、update-log、help-contact-us、create/rename-file-folder、online-web-page）；其余与 Vue 组件对话框双轨并存，主进程菜单树中已不可达（C-05/C-06）。运行期应以"Vue 组件对话框为主路径"理解。

#### 四、preload API 矩阵

| 全局对象 | 注入窗口 | 暴露文件 | 成员数 |
| --- | --- | --- | --- |
| `window.electron` | 主窗口 | `src/preload/index.ts` | 17（ipcRenderer 10 + webFrame 3 + webUtils 1 + process 3） |
| `window.api` | 主窗口 | `src/preload/index.ts` | 5（config 4 + app 1） |
| `window.electronAPI` | HTML 对话框 / Mermaid 隐藏窗 | `src/preload/dialog.ts` | 5（ipcRenderer 3 + shell 1 + broadcastTheme 1） |

##### 4.1 `window.api`（业务 API）

| 成员 | 底层通道 | 预览/响应 | 实际使用点 |
| --- | --- | --- | --- |
| `config.read<T>(name)` | `baize:config:read`（invoke） | 配置对象 / `null` | App.vue、useConfigStore、i18n、MenuBar、各 Vue 对话框 |
| `config.write<T>(name, data)` | `baize:config:write`（invoke） | `boolean` | App.vue、useConfigStore、EditorSettingDialog、SystemSettingDialog、QuickLinkSettingDialog |
| `config.delete(name)` | `baize:config:delete`（invoke） | `boolean` | 渲染层**未使用**（死通道） |
| `config.list()` | `baize:config:list`（invoke） | `string[]` | 渲染层**未使用**（死通道） |
| `app.getVersion()` | `baize:system:app-version`（invoke） | 版本信息对象 | HelpAboutDialog |

##### 4.2 `window.electron`（`@electron-toolkit/preload` electronAPI）

| 成员 | 使用情况 |
| --- | --- |
| `ipcRenderer.send` / `invoke` / `on` / `removeListener` | ✅ 高频使用（窗口控制、主题、文件、渲染结果、状态栏等） |
| `ipcRenderer.once` / `removeAllListeners` / `postMessage` / `sendToHost` | ⬜ 暴露但未使用 |
| `ipcRenderer.sendSync` / `sendTo` | ⛔ 未使用且测试禁止（`ipc-channel-constants.test.ts`） |
| `webFrame.insertCSS` / `setZoomFactor` / `setZoomLevel` | ⬜ 暴露但未使用 |
| `webUtils.getPathForFile` | ⬜ 暴露但未使用 |
| `process.versions` | ✅ `Versions.vue` 展示技术栈版本 |
| `process.platform` / `process.env` | ⬜ 暴露但未使用 |

##### 4.3 `window.electronAPI`（对话框受限 API）

| 成员 | 实现细节 |
| --- | --- |
| `ipcRenderer.send(channel, ...args)` | **ARC-01 白名单**：17 个通道内放行，否则 `console.warn` 丢弃 |
| `ipcRenderer.on(channel, cb)` | 剥离 `IpcRendererEvent` 首参；无白名单；**无退订返回值** |
| `ipcRenderer.removeListener(channel, cb)` | 引用不一致，实际无法移除（C-02） |
| `shell.openExternal(url)` | 直接转发 |
| `broadcastTheme(themeData)` | `send('baize:theme:dialog-broadcast', themeData)` |

##### 4.4 对话框 send 白名单（17 个，按源码顺序）

| # | 通道 | 发送者 |
| --- | --- | --- |
| 1-4 | `baize:dialog:editor-setting-apply/cancel/reset/ok` | editor-setting 对话框脚本 |
| 5 | `baize:dialog:mermaid-render-result` | Mermaid 隐藏窗脚本 |
| 6-7 | `baize:dialog:create-file-folder-enter`、`baize:dialog:rename-file-folder-enter` | 新建/重命名对话框 |
| 8-9 | `baize:dialog:font-select-insert/cancel` | 字体选择对话框 |
| 10 | `baize:dialog:import-option-confirm` | 导入选项对话框 |
| 11-12 | `baize:quick-links:save`、`baize:quick-links:reset` | 快捷链接对话框 |
| 13-15 | `baize:dialog:system-setting-apply/confirm/cancel` | 系统设置对话框 |
| 16 | `baize:theme:update-from-dialog` | 主题设置对话框 |
| 17 | `baize:theme:dialog-broadcast` | `broadcastTheme()` 辅助函数 |

> 白名单**仅约束 send**，不约束 on；远程页（online-web-page）也持有该 preload，白名单是其主要能力闸门。暴露面使用率：**12/27 被实际调用**，15 个暴露未使用。

#### 五、通信安全与生命周期

| 机制 | 实现 | 说明 |
| --- | --- | --- |
| contextIsolation | 全窗口 `true`、`nodeIntegration:false` | `preload/dialog.ts` 额外 `if (process.contextIsolated)` 守卫，非隔离时不暴露 API |
| send 白名单 | `src/preload/dialog.ts` | 17 通道；未知通道丢弃并告警（ARC-01） |
| 导航拦截 | 主窗口 `setWindowOpenHandler → shell.openExternal + deny`；PlantUML 窗口全拦截 | `online-web-page` 未设置（C-08） |
| 监听器台账 | `ipcListenerManager` | `register/registerOnce/registerHandleOnce`、`unregister/cleanupComponent/cleanupChannel/cleanupAll`、`getStats/getInventory`；防重复注册（ARC-06） |
| 窗口生命周期 | `WindowManager` 单例 | 窗口 `closed` → `cleanupComponent(componentId)` 自动清理该窗口注册的监听器 |
| 关闭落盘协议 | `baize:editor:flush-content` → `baize:baize:editor:flush-content-done` | 主进程等待渲染层回执（2s 超时兜底）后关闭窗口/退出 |
| 防回归 | `tests/unit/ipc-channel-constants.test.ts`、`preload-dialog.test.ts`、`main-index.test.ts` | 常量唯一性、无字面量绕过、无死常量、白名单放行/丢弃 |

#### 六、通道矩阵 A 组（WINDOW / CONFIG / THEME / MENU / EDITOR / FILE，61 个）

> 路径缩写：`main/` = `src/main/`；`renderer/` = `src/renderer/src/`；`preload/` = `src/preload/`。`(R)` 主窗口渲染层，`(D)` 对话框窗口。

##### 6.1 WINDOW（窗口控制，10 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| MINIMIZE | baize:window:minimize | R→M send | useWindowManagement.ts:minimizeWindow；WelcomeScreen.vue | main/ipc/handlers.ts | 无 | 最小化主窗口 |
| MAXIMIZE | baize:window:maximize | R→M send | App.vue:handleOpenRecentFolder；useWindowManagement.ts；WelcomeScreen.vue | main/ipc/handlers.ts | 无 | 最大化主窗口 |
| UNMAXIMIZE | baize:window:unmaximize | R→M send ❌ | 无发送点（死通道） | main/ipc/handlers.ts | 无 | 还原窗口（实际由 TOGGLE_MAXIMIZE 分支完成） |
| CLOSE | baize:window:close | R→M send | useWindowManagement.ts:closeWindow；WelcomeScreen.vue | main/ipc/handlers.ts | 无 | 关闭主窗口（走 flush 落盘协议） |
| TOGGLE_MAXIMIZE | baize:window:toggle-maximize | R→M send | useWindowManagement.ts:onTitleBarDblClick | main/ipc/handlers.ts | 无 | 双击标题栏切换最大化/还原 |
| GET_BOUNDS | baize:window:get-bounds | R→M invoke | useWindowManagement.ts:onTitleBarMouseDown/onResizeMouseDown | main/ipc/handlers.ts | 返回 `{x,y,width,height}` | 拖动/缩放前取窗口边界 |
| IS_MAXIMIZED | baize:window:is-maximized | R→M invoke | useWindowManagement.ts | main/ipc/handlers.ts | 返回 `boolean` | 判断最大化状态 |
| START_DRAG | baize:window:start-drag | R→M send | useWindowManagement.ts:onTitleBarMouseDown | main/ipc/handlers.ts | 无 | 拖动开始标记（主进程空实现） |
| MOVE | baize:window:move | R→M send | useWindowManagement.ts:onDragMouseMove/onResizeMouseMove | main/ipc/handlers.ts | `x, y` | 移动窗口（保持尺寸） |
| SET_SIZE | baize:window:set-size | R→M send | useWindowManagement.ts:onResizeMouseMove | main/ipc/handlers.ts | `width, height` | 调整窗口尺寸（保持位置） |

##### 6.2 CONFIG（配置 API，5 个，经 `window.api.config.*` 代理）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| READ | baize:config:read | R→M invoke | preload/index.ts:api.config.read（调用方：App.vue、useConfigStore、i18n、MenuBar、ThemeSettingDialog 等） | main/config/config-manager.ts | `configName`；返回配置或 null | 读取配置（system/theme/editor/quick-links 走 electron-store，其余走 userData/config） |
| WRITE | baize:config:write | R→M invoke | preload/index.ts:api.config.write（App.vue、useConfigStore 防抖、EditorSettingDialog、SystemSettingDialog、QuickLinkSettingDialog） | main/config/config-manager.ts | `configName, data`；返回 boolean | 写入配置；写 theme 触发全窗口广播，写 system 触发自动保存/字体/设置广播 |
| DELETE | baize:config:delete | R→M invoke ❌ | 无渲染层调用（死通道） | main/config/config-manager.ts | `configName`；返回 boolean | 删除配置文件 |
| LIST | baize:config:list | R→M invoke ❌ | 无渲染层调用（死通道） | main/config/config-manager.ts | 返回 `string[]` | 列出配置名 |
| ENSURE_DIR | baize:config:ensure-dir | R→M invoke ❌ | 无调用（preload 未暴露，死通道） | main/config/config-manager.ts | 返回 true | 确保配置目录（内部已各自 ensure） |

##### 6.3 THEME（主题，13 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| UPDATE_THEME | baize:theme:update | R→M send | BaiZeNotes.vue:handleThemeChange | main/index.ts | `{themeType?, monacoTheme?, separate?}` | 请求向所有窗口广播 THEME_UPDATED |
| THEME_UPDATED | baize:theme:update-from-dialogd | M→R / M→D send | main/index.ts、config-manager.ts、handlers.ts（DIALOG_BROADCAST_THEME 回调） | (R) BaiZeNotes.vue、MenuBar.vue；(D) 11 个对话框脚本 | `{themeStyles, monacoTheme, separateEditorTheme}`；对话框路径多 `themeType` | 全窗口主题热同步 |
| THEME_UPDATE | baize:theme:update-from-dialog | D→M send | ShowThemeSettingDialog.ts 内联脚本（3 处，经白名单） | ShowThemeSettingDialog.ts 模块级 ipcMain.on | `{themeType, separateEditorTheme, monacoTheme}` | 主题对话框即时写 store 并触发广播 |
| INIT_THEME_STYLES | baize:theme:init-styles | M→D（另有 M→R 空转） | 11 个 Show*Dialog；main/index.ts:ready-to-show | 4 个对话框内联脚本 | 多为裸 ThemeStyles；主题对话框为 `{theme, separateEditorTheme, monacoTheme}` | 对话框/主窗口初始主题注入 |
| LOAD_MONACO_THEME | baize:theme:load-monaco | R→M invoke | BaiZeNotes.vue:loadMonacoTheme | main/ipc/handlers.ts | `themeName`；返回主题定义 | 读取并 defineTheme 扩展 Monaco 主题 |
| UPDATE_MONACO_THEME | baize:theme:update-monaco | R→M send ❌ | ThemeSettingDialog.vue:selectMonacoTheme | 无接收点（死通道） | `monacoTheme` | 立即应用编辑器主题（实际走 emit change 链） |
| GET_CURRENT_THEME | baize:theme:get-current | R→M invoke ❌ | 无调用（死通道） | main/utils/utils.ts | 返回 ThemeType | 取当前主题类型（改走 baize:config:read） |
| GET_CURRENT_THEME_STYLES | baize:theme:get-current-styles | R→M invoke | BaiZeNotes.vue:handleThemeChange/onMounted | main/utils/utils.ts | `themeType?`；返回 ThemeStyles | 取主题样式并入 CSS 变量 |
| GET_ALL_THEMES | baize:theme:get-all | R→M invoke | ThemeSettingDialog.vue:loadThemes | main/utils/utils.ts | 返回主题列表 | 渲染应用主题卡片 |
| GET_ALL_MONACO_THEMES | baize:theme:get-all-monaco | R→M invoke | ThemeSettingDialog.vue:loadThemes | main/utils/utils.ts | 返回 Monaco 主题列表 | 渲染编辑器主题卡片 |
| GET_SEPARATE_EDITOR_THEME | baize:theme:get-separate-editor | R→M sendSync ❌ | 无 sendSync 调用（死通道） | main/utils/utils.ts（event.returnValue） | 返回 boolean | 是否启用独立编辑器主题（遗留） |
| GET_MONACO_THEME | baize:theme:get-monaco | R→M sendSync ❌ | 无 sendSync 调用（死通道） | main/utils/utils.ts（event.returnValue） | 返回 MonacoThemeType | 当前 Monaco 主题（遗留） |
| DIALOG_BROADCAST_THEME | baize:theme:dialog-broadcast | D→M send | ShowThemeSettingDialog.ts 内联脚本 → preload broadcastTheme | main/ipc/handlers.ts | themeData 透传 | 对话框发起主题变更广播 |

##### 6.4 MENU（菜单，1 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| ACTION | baize:menu:action | R→M send | menu-actions.ts:HandleMenuAction；resource-manager.ts:onHandleExport | main/ipc/handlers.ts → menu-handle.ts | `action`：`baize:menu:<主>:<子>:<动作>` | 渲染层菜单/右键动作路由到主进程动作树 |

##### 6.5 EDITOR（编辑器，14 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET_SETTING | baize:editor:get-setting | R→M invoke | MarkdownMonacoEditor.vue:onMounted | main/ipc/handlers.ts | 返回 EditorSetting | 编辑器挂载后拉取配置（兜底时序） |
| SETTING_UPDATED | baize:editor:setting-updated | M→R send | ShowEditorSettingDialog.ts（APPLY/OK 回调） | MarkdownMonacoEditor.vue | `settings` | 设置保存后 Monaco 立即套用 |
| INIT_SETTING | baize:editor:init-setting | M→R send | main/index.ts:ready-to-show | MarkdownMonacoEditor.vue | `editorSetting` | 启动下发初始设置 |
| RELAYOUT | baize:editor:relayout | M→R send ❌ | 无发送点（死通道） | BaiZeNotes.vue:EditorReLayout | 无 | 重排布局（改走 EventBus MONACO_RELAYOUT） |
| UPDATE_OPTIONS | baize:editor:update-options | M→R send（另有无接收的 R→M 分支） | menu-view.ts:viewMenuHandlers；BaiZeNotes.vue:updateMonacoEditorTheme（R→M 分支） | MarkdownMonacoEditor.vue:handleUpdateOptions | `option: 'lineNumbers'\|'renderWhitespace'` | 菜单切换行号/空白字符 |
| UPDATE_FONT | baize:editor:update-font | R→M send ❌ | BaiZeNotes.vue:handleFontApply | 无接收点（死通道） | `htmlContent` | 应用编辑器字体（实际走配置写入） |
| SYSTEM_SETTING_UPDATE | baize:setting:updated | M→R send | config-manager.ts:applySystemSettings；ShowSystemSettingDialog.ts | BaiZeNotes.vue；i18n.ts | `setting: SystemSetting` | 系统设置广播（菜单栏形态/语言） |
| FLUSH_CONTENT | baize:editor:flush-content | M→R send | main/index.ts:flushEditorContent（close/before-quit） | MarkdownEditComponent.vue | 无 | 关闭前请求同步编辑器内容（D-3） |
| FLUSH_CONTENT_DONE | baize:baize:editor:flush-content-done | R→M send | MarkdownEditComponent.vue | main/index.ts（2s 超时兜底） | 无 | flush 完成回执 |
| DIALOG_SETTING_APPLY | baize:dialog:editor-setting-apply | D→M send | editor-setting-script.ts（"应用"） | ShowEditorSettingDialog.ts | `settings` | 应用（不关窗）+ 通知主窗口 |
| DIALOG_SETTING_CANCEL | baize:dialog:editor-setting-cancel | D→M send | editor-setting-script.ts（"取消"/关闭） | ShowEditorSettingDialog.ts | 无 | 关闭对话框 |
| DIALOG_SETTING_RESET | baize:dialog:editor-setting-reset | D→M send | editor-setting-script.ts（"重置"） | ShowEditorSettingDialog.ts | 无 | 重置默认并回推设置 |
| DIALOG_SETTING_OK | baize:dialog:editor-setting-ok | D→M send | editor-setting-script.ts（"确定"） | ShowEditorSettingDialog.ts | `settings` | 保存并关闭 |
| LOAD_SAVED_SETTINGS | baize:editor:load-saved-settings | M→D send | ShowEditorSettingDialog.ts（did-finish-load / RESET 回调） | editor-setting-script.ts | `savedSettings / defaultSettings` | 回填表单 |

##### 6.6 FILE（文件，18 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| OPEN_SPECIFIC_FOLDER | baize:file:open-specific-folder | R→M send | App.vue:handleOpenRecentFolder | main/ipc/handlers.ts | `folderPath` | 打开最近目录 |
| WELCOME_OPEN_DIRECTORY | baize:file:welcome-open-directory | R→M send | App.vue:handleOpenFolder | main/ipc/handlers.ts | 无 | 欢迎页打开文件夹 → 发 WELCOME_ENTER_MAIN |
| WELCOME_OPEN_FILE | baize:file:welcome-open-file | R→M send | App.vue:handleOpenFile | main/ipc/handlers.ts | 无 | 欢迎页打开文件 → 发 WELCOME_ENTER_MAIN |
| WELCOME_ENTER_MAIN | baize:file:welcome-enter-main | M→R send | main/ipc/handlers.ts | App.vue:handleEnterMain | `{type, path}` | 通知退出欢迎界面 |
| OPEN_SELECT_FILE | baize:file:open-select-file | R→M send | FileTreeNode.vue；MarkdownPreviewComponent.vue | main/utils/utils.ts | `fileInfo` | 打开选中的 md 文件 |
| IMPORT_NEW_FILE | baize:file:import | R→M invoke | BaiZeNotes.vue:handleImportOptionConfirm | main/ipc/handlers.ts | `content` | 导入内容建新文件 |
| CREATE_FILE_FOLDER | baize:file:create-entry | R→M invoke | BaiZeNotes.vue:handleCreateFileFolder | main/ipc/handlers.ts | `name, dirPath, isFolder, extension`；返回 `{success}` | 新建文件/文件夹 |
| GET_CURRENT_FILE_PATH | baize:file:get-current-path | R→M invoke | menu-actions.ts（file:new） | main/ipc/handlers.ts | 返回当前文件目录 | 新建对话框默认目录 |
| SELECT_DIRECTORY | baize:file:select-directory | R→M invoke | CreateFileFolderDialog.vue | main/ipc/handlers.ts | 返回选中目录 | 选择目录 |
| CLEAR_EDITOR_PREVIEW | baize:file:clear-editor-preview | M→R send | handlers.ts；file-operations.ts:OpenDirectory | MarkdownEditComponent.vue | 无 | 切换目录时清空编辑器/预览 |
| SAVE_TO_DISK | baize:file:save-content-to-disk | R→M send | MarkdownEditComponent.vue（Ctrl+S） | main/utils/utils.ts | `content` | 保存当前文件到磁盘 |
| UPDATE_SELECT_FILE_CONTENT | baize:file:update-content | R→M send | MarkdownEditComponent.vue:syncContentToMain（500ms 防抖） | main/utils/utils.ts | `content` | 仅同步内存内容（不落盘） |
| CHECK_EXISTS | baize:file:check-exists | R→M invoke | ShowPdfEditor.vue:loadPdfFile | main/utils/utils.ts | `filePath`；返回 boolean | 判断文件是否存在 |
| READ_HTML | baize:file:read-html | R→M invoke | ShowHtmlVIew.vue:loadHtmlFile | main/utils/utils.ts | `filePath`；返回 HTML 文本 | HTML 查看器读文件 |
| OPEN_EXTERNAL_LINK | baize:system:open-external-link | R→M send | ShowHtmlVIew.vue；ShowPdfEditor.vue（openInBrowser） | main/utils/utils.ts | `url` | `shell.openExternal` 外开 |
| SYSTEM_INFO | baize:system:get-info | R→M invoke | HelpAboutDialog.vue:onMounted | main/ipc/handlers.ts | 返回 `os.type + arch + release` | 关于对话框系统信息 |
| APP_VERSION | baize:system:app-version | R→M invoke | preload api.app.getVersion；HelpAboutDialog | main/utils/utils.ts | 返回版本信息对象 | 版本信息 |
| USER_SELECT_FILE | baize:file:user-select-file | M→R send | file-operations.ts:CreateFileFolder/OpenSelectFile/CreateFile | StatusBar.vue:handleUserSelectFile | `filePath` | 状态栏路径更新 |

##### 6.7 A 组统计

| 分组 | 通道数 | 正常接线 | 疑似死通道 |
| --- | --- | --- | --- |
| WINDOW | 10 | 9 | 1（UNMAXIMIZE） |
| CONFIG | 5 | 2 | 3（DELETE/LIST/ENSURE_DIR） |
| THEME | 13 | 9 | 4（UPDATE_MONACO_THEME、GET_CURRENT_THEME、GET_SEPARATE_EDITOR_THEME、GET_MONACO_THEME） |
| MENU | 1 | 1 | 0 |
| EDITOR | 14 | 12 | 2（RELAYOUT、UPDATE_FONT） |
| FILE | 18 | 18 | 0 |
| **合计** | **61** | **51** | **10** |

#### 七、通道矩阵 B 组（其余 10 组，62 个）

##### 7.1 FILE_MANAGER（文件管理器右键菜单，14 个）

> 全部由 `resource-manager.ts` 右键菜单发起；主进程分两处接收：`utils.ts:MainWindowListenUtilsEvent`（剪贴板/打开/重载）与 `dialogs.ts:MainWindowListenDialogsEvent`（新建/重命名/删除/导入/定位）。`FILE_SYSTEM_DATA` 反向推送文件树。

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| COPY_RELATIVE_PATH | baize:fs:copy-relative-path | R→M send | resource-manager.ts:onHandleCopy | utils.ts → CopyRelativePath | `path` | 复制相对当前文件路径 |
| COPY_IMAGELINK | baize:fs:copy-image-link | R→M send | 同上 | utils.ts → CopyImageLink | `path` | 复制 Markdown 图片链接 |
| COPY_FILELINK | baize:fs:copy-filelink | R→M send | 同上 | utils.ts → CopyFileLink | `path` | 复制 Markdown 文件链接 |
| COPY_FILE | baize:fs:copy-file | R→M send | 同上 | utils.ts → FileManagerContextMenuCopy | `path, isFile` | 记录复制源 |
| CUT | baize:fs:cut | R→M send | resource-manager.ts:onHandleCut | utils.ts → FileManagerContextMenuCut | `path, isFile` | 记录剪切源 |
| PASTE | baize:fs:paste | R→M send | resource-manager.ts:onHandlePaste | utils.ts → FileManagerContextMenuPaste | `toPath, isFile` | 复制/移动到目标目录 |
| OPEN_IN_EXPLORER | baize:fs:open-in-explorer | R→M send | resource-manager.ts:onHandleOpenExplorer | utils.ts → OpenFolderExplorer | `path` | 在资源管理器中定位 |
| RELOAD_FROM_DISK | baize:fs:reload-from-disk | R→M send | resource-manager.ts:onHandleReloadFromDisk | utils.ts → ReloadDirFromDisk | `''` 占位 | 重载目录树 |
| CREATE_FILE | baize:fs:create-file | R→M send | resource-manager.ts:onHandleCreateFolder | dialogs.ts → ShowCreateFileFolderDialog | `dirPath, isFolder, fileExtension` | 打开新建对话框 |
| RENAME | baize:fs:rename | R→M send | resource-manager.ts:onHandleRename | dialogs.ts → ShowFileFolderRenameDialog | `path, isFile` | 打开重命名对话框 |
| DELETE | baize:fs:delete | R→M send | resource-manager.ts:onHandleDelete | dialogs.ts → ShowConfirmDeleteDialog | `value, isFile` | 确认后删除 |
| IMPORT_FROM | baize:fs:import-from | R→M send | resource-manager.ts:onHandleImport | dialogs.ts → InsertImportFormFile | `fileType` | 导入 Word/HTML |
| FIND_IN | baize:fs:find-in | R→M send | resource-manager.ts:onHandleFind | dialogs.ts → shell.showItemInFolder | `targetPath` | 在文件夹中显示 |
| FILE_SYSTEM_DATA | baize:fs:file-system-data | M→R send | file-operations.ts:ReloadDirFromDisk | ResourceManager.vue | `treeJson` | 推送文件树刷新资源管理器 |

##### 7.2 PLUGIN（插件工具，6 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| RSA_GENERATE | baize:plugin:rsa-generate | R→M send | RSAGenerator.vue:refreshKeyPair | utils.ts → CreateRsaKeyPair | `bits` | 请求生成 RSA 密钥对 |
| RSA_RESULT | baize:plugin:rsa-result | M→R send | encrypt-decrypt.ts:CreateRsaKeyPair | RSAGenerator.vue:onRsaResult | `(publicKey, privateKey)` | 回传 PEM 公私钥 |
| HASH_TEXT | baize:plugin:hash-text | R→M invoke | HashText.vue:getHashTextResult | utils.ts → CreateHash | `(context, encType)` | 计算多种哈希 |
| HMAC_TEXT | baize:plugin:hmac-text | R→M invoke | HmacGenerator.vue:getHmacTextResult | utils.ts → CreateHmac | `(context, secKey, encType)` | 计算多种 HMAC |
| CRYPTO_ENCRYPT | baize:plugin:crypto-encrypt | R→M invoke | CryptoEncDec.vue:CryptoEncryptResult | utils.ts → CryptoEncrypt | `CryptoData` | 对称加密 |
| CRYPTO_DECRYPT | baize:plugin:crypto-decrypt | R→M invoke | CryptoEncDec.vue:CryptoDecryptResult | utils.ts → CryptoDecrypt | `CryptoData` | 对称解密 |

##### 7.3 RENDER（图片插入与 PlantUML 本地渲染，2 个）

> PF-02 重构：原 `PRE_RENDER` / `POST_RENDER` / `PRE_RENDER_RESULT` / `POST_RENDER_RESULT` 四个通道已移除，Markdown 预览改为渲染层本地单跳渲染（`preview-local-render.ts`），不再经主进程中转。

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| INSERT_IMAGE | baize:render:insert-image | R→M send | hemy-editor-common.ts（Ctrl+V 粘贴图片） | utils.ts → InsertImagesToFile | `context`（DataURL） | 粘贴图片存 `./images` 并回插 Markdown |
| PLANTUML_LOCAL | baize:render:plantuml-local | R→M invoke | hemy-editor-render.ts:invokePlantumlLocalRender | renders/plantuml-local.ts | `source`；返回 `{status, svg?/message?}` | PlantUML 本地离线渲染（隐藏窗口） |

##### 7.4 DIALOG（对话框，14 个）

> 组内多为 HTML 对话框通路：D→M 全走 `ipcRenderer.send` 且逐个命中 `dialog.ts` 白名单；M→D 用 `webContents.send`。`OPEN_VUE_DIALOG` 是主进程→**主窗口**渲染层。

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| CREATE_FILE_FOLDER_ENTER | baize:dialog:create-file-folder-enter | D→M send | ShowCreateFileFolderDialog.ts 脚本（Enter） | 同文件 processCreateFileFolder | `name` | 新建文件/文件夹 |
| RENAME_FILE_FOLDER_ENTER | baize:dialog:rename-file-folder-enter | D→M send | ShowRemaneDialog.ts 脚本 | 同文件 processRenameFileFolder | `newName` | 重命名 |
| SYSTEM_SETTING_APPLY | baize:dialog:system-setting-apply | D→M send | ShowSystemSettingDialog.ts 脚本 | 同文件 processApplySysSetting | `SystemSetting` | 应用系统设置（不关窗） |
| SYSTEM_SETTING_CONFIRM | baize:dialog:system-setting-confirm | D→M send | 同上 | processConfirmSysSetting | `SystemSetting` | 保存并关闭 |
| SYSTEM_SETTING_CANCEL | baize:dialog:system-setting-cancel | D→M send | 同上 | processCancelSysSetting | 无 | 取消关闭 |
| FONT_SELECT_INSERT | baize:dialog:font-select-insert | D→M send | ShowFontSelectDialog.ts 脚本 | processCustomFontDialogApply | `fontStyle` | 拼字体样式 HTML 插入编辑器 |
| FONT_SELECT_CANCEL | baize:dialog:font-select-cancel | D→M send | 同上 | processCustomFontDialogCancel | 无 | 取消关闭 |
| MERMAID_RENDER_RESULT | baize:dialog:mermaid-render-result | D→M send | OpenMermaidRenderFrame.ts 隐藏窗脚本 | processMermaidRenderResult（临时监听） | `chartHtml` | 回传 Mermaid SVG |
| OPEN_VUE_DIALOG | baize:dialog:open-vue | M→R send | menu-file.ts、menu-view.ts、menu-tools.ts、short-key-register.ts、dialog-helpers.ts、file-operations.ts、import.ts | BaiZeNotes.vue:handleOpenVueDialog | `(dialogName, data?)` | 主进程 → 渲染层打开 Vue 对话框 |
| OPEN_PLUGIN_TOOL | baize:dialog:open-plugin-tool | M→R send ❌ | menu-tools.ts:pluginsMenuHandlers（26 处） | 无监听（死通道，插件菜单改走 EventBus） | `toolId` | 打开插件工具（遗留） |
| AUTO_SAVE_CHANGED | baize:setting:auto-save-changed | R→M ⚠️ | SystemSettingDialog.vue:handleAutoSaveChange（send） | handlers.ts（registerHandleOnce → handle，仅 invoke 可达） | `{autoSaveEnabled, autoSaveInterval}` | 启停自动保存；**send 打不到 handle，实际不生效** |
| IMPORT_OPTION_CONFIRM | baize:dialog:import-option-confirm | D→M send | ShowImportOptionDialog.ts 脚本 | 同文件 handleImportOptionConfirm | `option: 'replace'\|'newfile'\|'insert'` | 导入方式确认 |
| LOAD_SAVED_SETTINGS | baize:dialog:load-saved-settings | M→D send | ShowSystemSettingDialog.ts | 同文件 HTML 脚本 | `savedSettings` | 对话框回填设置 |
| SAVE_SUCCESS | baize:file:save-success | M→D send | ShowQuickLinkSettingDialog.ts:handleSaveQuickLinks | 同文件 HTML 脚本 | 无 | 保存成功 toast |

##### 7.5 NAVIGATION / VIEW / MONACO_INSERT（10 个）

| 分组 | 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| NAVIGATION | OPEN_EXE | baize:navigation:open-exe | R→M send | NaviTab.vue:onQuickLinkClick | utils.ts → shell.openPath | `exePath` | 启动本地程序（三重校验） |
| NAVIGATION | KEYDOWN | baize:navigation:keydown | R→M send ❌ | 无发送方（死通道） | utils.ts（Ctrl+S 保存） | `{ctrlKey, key}` | 主进程兜底保存（已被 SAVE_TO_DISK 取代） |
| VIEW | EDIT_MODE | baize:view:edit-mode | M→R send | menu-view.ts；short-key-register.ts（F9） | MarkdownEditComponent.vue | null | 仅编辑视图 |
| VIEW | PREVIEW_MODE | baize:view:preview-mode | M→R send | menu-view.ts；short-key-register.ts（F10） | MarkdownEditComponent.vue | null | 仅预览视图 |
| VIEW | EDIT_PREVIEW_MODE | baize:view:edit-preview-mode | M→R send | menu-view.ts；short-key-register.ts（F11） | MarkdownEditComponent.vue | null | 双栏视图 |
| VIEW | TOGGLE_RES_MANAGER | baize:view:toggle-resource-manager | M→R send | menu-view.ts | WorkSpace.vue | null | 显示/隐藏资源管理器 |
| VIEW | UNDO_REDO | baize:monaco:undo-redo | M→R send | menu-edit.ts（undo/redo/cut/copy/paste） | MarkdownMonacoEditor.vue | `action` | 触发 Monaco 撤销/重做/剪贴板动作 |
| MONACO_INSERT | WRITING_TEMPLATES | baize:monaco:insert-writing-templates | M→R send ❌ | 无发送方（死通道） | MarkdownEditComponent.vue:handleInsertTemplate | `fileContent` | 插入写作模板（实际走 EventBus） |
| MONACO_INSERT | TEXT_BLOCK_TEMPLATES | baize:monaco:insert-text-block | M→R send | utils.ts（图片回插）；ShowFontSelectDialog.ts（字体 HTML） | MarkdownMonacoEditor.vue | `context` | 光标处插入任意文本片段 |
| MONACO_INSERT | AFTER_CURSOR | baize:monaco:insert-after-cursor | M→R send | import.ts:InsertImportFormFile | MarkdownMonacoEditor.vue | `content` | 光标处插入导入内容 |

##### 7.6 QUICK_LINKS（快速链接，5 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| GET | baize:quick-links:get | R→M invoke | NaviTab.vue:loadQuickLinks | utils.ts → getQuickLinks | 返回 `QuickLinkItem[]` | 读取快速链接 |
| SAVE | baize:quick-links:save | D→M send | ShowQuickLinkSettingDialog.ts 脚本 | 同文件 handleSaveQuickLinks | `links` | 保存配置 |
| RESET | baize:quick-links:reset | D→M send | 同文件 resetToDefault | handleResetQuickLinks | 无 | 重置默认 |
| UPDATED | baize:quick-links:updated | M→R send | ShowQuickLinkSettingDialog.ts（广播） | NaviTab.vue:handleQuickLinksUpdated | 无 | 通知重拉 |
| INIT | baize:quick-links:init | M→D send | ShowQuickLinkSettingDialog.ts（did-finish-load/重置） | 同文件脚本 | `links` | 对话框回填 |

##### 7.7 OVERLAY（覆盖层窗口，7 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| UPDATE_MERMAID_GRAPH | baize:overlay:update-mermaid-graph | M→D send ❌ | OpenMermaidRenderFrame.ts:updateMermaidWindowHtml（零调用） | 无监听 | `graphDesc` | 更新隐藏 Mermaid 窗口（双重断链） |
| MERMAID_GRAPH_DEF | baize:overlay:mermaid-graph-definition | M→R send ❌ | 无发送方（死通道） | MermaidRender.vue | `graphData` | 预览侧接收图定义 |
| OPEN_URL | baize:overlay:open-url | M→R send ❌ | 无发送方（死通道；实际走 OpenOnlineWebPages/window.open） | BaiZeNotes.vue | `link` | 浏览器窗口打开 URL |
| OPEN_WITH_ENCODING | baize:file:open-with-encoding | M→R send | menu-file.ts:codingMenuHandlers | MarkdownEditComponent.vue | `encoding`（9 种） | "以指定编码打开"下发 |
| CONVERT_TO_ENCODING | baize:file:convert-to-encoding | M→R send | menu-file.ts:codingMenuHandlers | MarkdownEditComponent.vue | `encoding` | "转换编码"下发 |
| REOPEN_WITH_ENCODING | file-rebaize:file:open-with-encoding | R→M invoke | MarkdownEditComponent.vue | utils.ts → ReopenActiveFileWithEncoding | `encoding`；返回 Promise | 按编码重新读取当前文件 |
| CONVERT_SAVE_ENCODING | baize:file:convert-save-encoding | R→M invoke | MarkdownEditComponent.vue | utils.ts → ConvertActiveFileEncoding | `encoding`；返回 Promise | 按编码转码保存 |

##### 7.8 EVENTS（主进程→渲染层广播，4 个）

| 常量 | 通道 | 方向/模式 | 发起方 | 接收方 | 载荷 | 用途 |
| --- | --- | --- | --- | --- | --- | --- |
| STATUS_BAR_UPDATE | baize:status-bar:update | M→R send | utils.ts、handlers.ts、logger.ts、auto-save.ts、file-operations.ts（10 处） | StatusBar.vue | `{message, type, encoding?}` | 状态栏消息/编码提示 |
| FILE_SAVED_SUCCESS | baize:file:saved | M→R send | file-operations.ts:SaveActiveFile/ConvertActiveFileEncoding（全窗口广播） | StatusBar.vue | 无 | 清除未保存标记 |
| FILE_CONTENT_RELOADED | baize:file:content-reloaded | M→R send | file-operations.ts:ReloadDirFromDisk | MarkdownEditComponent.vue | `{path, content}` | 磁盘变化后重载编辑器 |
| SHOW_SELECTED_FILE_CONTEXT | baize:fs:show-selected-file-context | M→R send | file-operations.ts（打开/新建/按编码重开） | MarkdownEditComponent.vue | `content` | 内容灌入编辑器 |

##### 7.9 B 组统计

| 方向/模式 | 数量 |
| --- | --- |
| R→M send | 18 |
| R→M invoke | 8 |
| M→R send | 21 |
| M→D send | 4 |
| D→M send | 11 |
| **合计** | **62**（正常接线 55、模式不一致 1、疑似死通道 6） |

#### 八、跨窗口通信路径

##### 8.1 主窗口 → HTML 对话框（全部经主进程中转）

| 场景 | 通道 | 说明 |
| --- | --- | --- |
| 主题注入 | `baize:theme:init-styles` | 11 个对话框创建后由主进程推送主题 |
| 主题热更新 | `baize:theme:update-from-dialogd` | 全窗口广播 |
| 编辑器设置回填 | `baize:editor:load-saved-settings` | 设置对话框 |
| 系统设置回填 | `baize:dialog:load-saved-settings` | 系统设置对话框 |
| 快捷链接回填 | `baize:quick-links:init` | 快捷链接对话框 |
| 保存成功提示 | `baize:file:save-success` | 快捷链接对话框 |

##### 8.2 HTML 对话框 → 主窗口（D→M send，主进程转发/落盘）

共 16 条链路，核心为：编辑器设置 4 通道、系统设置 3 通道、字体选择 2 通道、新建/重命名 2 通道、导入确认 1 通道、快捷链接 2 通道、主题 2 通道（THEME_UPDATE / DIALOG_BROADCAST_THEME）。全部命中 `dialog.ts` 的 17 项 send 白名单，无静默丢弃。

##### 8.3 主进程 → 主窗口（M→R 推送）

| 类别 | 通道示例 |
| --- | --- |
| 编辑器 | `INIT_SETTING`、`SETTING_UPDATED`、`UPDATE_OPTIONS`、`FLUSH_CONTENT`、`SYSTEM_SETTING_UPDATE` |
| 文件 | `WELCOME_ENTER_MAIN`、`CLEAR_EDITOR_PREVIEW`、`USER_SELECT_FILE`、`SHOW_SELECTED_FILE_CONTEXT`、`FILE_CONTENT_RELOADED` |
| 渲染 | `TEXT_BLOCK_TEMPLATES`、`AFTER_CURSOR`（PF-02 后预览渲染已本地化，无 IPC 往返） |
| 菜单/视图 | `VIEW.EDIT/PREVIEW/EDIT_PREVIEW_MODE`、`UNDO_REDO`、`TOGGLE_RES_MANAGER` |
| 主题 | `THEME_UPDATED`、`INIT_THEME_STYLES`（M→R 分支空转） |
| 状态 | `STATUS_BAR_UPDATE`、`FILE_SAVED_SUCCESS` |
| 对话框 | `OPEN_VUE_DIALOG`、`OPEN_PLUGIN_TOOL`（死通道） |
| 编码 | `OPEN_WITH_ENCODING`、`CONVERT_TO_ENCODING` |
| 快捷链接 | `QUICK_LINKS.UPDATED` |

##### 8.4 主进程 → 隐藏窗口

| 窗口 | 通信方式 |
| --- | --- |
| PlantUML 渲染窗 | 无 preload；`executeJavaScript` 传参 + 轮询/超时回收 |
| Mermaid 隐藏窗 | dialog preload；result 经 `MERMAID_RENDER_RESULT` 回传（链路半死） |
| PDF 导出窗 | 无 IPC，`loadURL` + `printToPDF` |

##### 8.5 渲染器内部 EventBus（不跨进程，25 个事件）

| 类别 | 事件 |
| --- | --- |
| 插件/工作区 | `PLUGIN_TOOL_SHOW`、`PLUGIN_TOOLS_CONTAINER_SHOW`、`WORKSPACE_SHOW` |
| Monaco 插入/替换 | `MONACO_INSERT_TEXT`、`MONACO_REPLACE_TEXT`、`MONACO_USE_TEMPLATE`、`MONACO_UPDATE_HEADER_FORMAT`、`MONACO_UPDATE_FONT_FORMAT` |
| 布局/大纲 | `MONACO_RELAYOUT`、`EDITOR_TOGGLE_FOLD`、`EDITOR_TOGGLE_OUTLINE`、`EDITOR_TRIGGER_FIND`、`EDITOR_JUMP_LINE`、`MONACO_GET_CHAPTERS`、`MONACO_CHAPTERS`、`MONACO_LOCATE_TARGET_LINE` |
| 状态栏 | `STATUS_BAR_FILE_PATH`、`STATUS_BAR_CONTEXT_LENGTH`、`STATUS_BAR_CURSOR_POSITION` |
| 文件/预览 | `HTML_FILE_SELECTED`、`PDF_FILE_SELECTED`、`FILE_TREE_NODE_CLICKED`、`MONACO_SAVE_FILE_CONTENT_TO_DISK` |
| 主题/切换 | `THEME_UPDATED`、`MONACO_SWITCH_EXPLORER` |

> 异常项：`MONACO_SWITCH_EXPLORER` **有发无收**；`FILE_TREE_NODE_CLICKED` **有收无发**。
> **分工结论**：主窗口渲染进程内组件间一律 EventBus；跨进程一律 IPC；HTML 对话框不 import EventBus，必须经主进程中转。

#### 九、问题清单

##### 9.1 疑似死通道（16 个）

> **处理状态（2026-11-18 复核）**：以下 16 个死通道已于此前的 P2 死代码清理批次（123→86 通道）**全部删除**；当前 `src/shared/ipc-channels.ts` 零引用常量扫描 = 0。2026-11-18 晚另清理了 2 个空转/空实现通道（`WINDOW.START_DRAG`、`THEME.INIT_THEME_STYLES`）与 2 处死分支，通道总数 92 → 90，详见 [2026-11-18-IPC通信矩阵](IPC通信矩阵.md)。

| # | 通道 | 现象 | 建议 |
| --- | --- | --- | --- |
| 1 | `baize:window:unmaximize` | 无发送点，仅主进程注册 | 删除或补调用方 |
| 2 | `baize:config:delete` | preload 已暴露，渲染层零调用 | 删除 API 或补管理界面 |
| 3 | `baize:config:list` | 同上 | 同上 |
| 4 | `baize:config:ensure-dir` | preload 未暴露，零调用 | 删除 |
| 5 | `baize:theme:update-monaco` | 有发送，主进程零接收 | 删除发送或补接收 |
| 6 | `baize:theme:get-current` | 仅主进程 handle，零 invoke | 删除 |
| 7 | `baize:theme:get-separate-editor` | 仅 sendSync 应答注册，零 sendSync | 删除（源码注释已自认） |
| 8 | `baize:theme:get-monaco` | 同上 | 删除 |
| 9 | `baize:editor:relayout` | 仅渲染层监听，零发送 | 删除（已由 EventBus 接管） |
| 10 | `baize:editor:update-font` | 有发送，主进程零接收 | 删除或补接收 |
| 11 | `baize:dialog:open-plugin-tool` | 有发送（26 处），零监听 | 待插件菜单主进程树退役时删除 |
| 12 | `baize:navigation:keydown` | 仅主进程接收，零发送 | 删除（Ctrl+S 已走 SAVE_TO_DISK） |
| 13 | `baize:monaco:insert-writing-templates` | 仅渲染层监听，零发送 | 删除监听+常量 |
| 14 | `baize:overlay:mermaid-graph-definition` | 仅渲染层监听，零发送 | 确认 Mermaid 链路规划后删除 |
| 15 | `baize:overlay:open-url` | 仅主窗口监听，零发送 | 删除 |
| 16 | `baize:overlay:update-mermaid-graph` | 发送函数零调用 + 窗口零监听 | 与 #14 一并评估 |

##### 9.2 模式/语义不一致

| # | 通道 | 问题 | 影响 |
| --- | --- | --- | --- |
| 1 | `baize:setting:auto-save-changed` | 渲染层 `send`，主进程用 `ipcMain.handle` 注册 | **Vue 系统设置对话框的自动保存开关变更实际不生效**；HTML 版直接在主进程内启停定时器，同一功能双实现行为分叉 |
| 2 | `THEME.INIT_THEME_STYLES` | M→R 分支无监听（空转）；载荷双轨（裸 ThemeStyles vs `{theme, separateEditorTheme, monacoTheme}`）；ShowFontSelectDialog 有监听无发送 | 主窗口初始主题改由 invoke 完成；同名通道两种载荷 |
| 3 | `EDITOR.UPDATE_OPTIONS` | 方向混用：M→R 推送 lineNumbers/renderWhitespace 正常；BaiZeNotes.vue 的 R→M `('theme', ...)` 分支无接收 | 主题选项发送空转 |
| 4 | `THEME.THEME_UPDATED` | MenuBar.vue 按 `{currentTheme}` 读取，实际载荷无该字段 | 菜单主题选中态不被推送刷新 |
| 5 | `ARC-03` 绕过 | `common/templates.ts` 用字面量重复定义两个 MONACO_INSERT 通道常量（零消费） | 后续启用存在漂移风险 |
| 6 | 命名与用途不符 | `TEXT_BLOCK_TEMPLATES` 被复用为通用"光标插入文本"；`WRITING_TEMPLATES` 对应功能实际不走 IPC | 维护认知成本 |
| 7 | 监听未入台账 | 6 个对话框 + Mermaid 通道直连 `ipcMain`，未走 `ipcListenerManager` | `cleanupAll()/getInventory()` 台账不完整 |

##### 9.3 机制层风险（C-01 ～ C-10）

| 编号 | 问题 | 影响 |
| --- | --- | --- |
| C-01 | `editor-setting-dialog` 未注入 preload（`ShowEditorSettingDialog.ts`），但脚本首行即用 `window.electronAPI` | 该对话框脚本抛错、设置逻辑失效（窗口已不可达，属遗留） |
| C-02 | 对话框 preload 的 `removeListener` 与 `on` 包装函数引用不一致 | 无法真正退订，API 语义失真 |
| C-03 | `ShowThemeSettingDialog.ts` 模块级 `ipcMain.on` 回调中引用渲染层 `window` | 主进程执行到广播处抛 `ReferenceError`，主题广播中断 |
| C-04 | 部分监听器直连 `ipcMain`（`main/index.ts`、6 个对话框、Mermaid） | 台账不完整，泄漏治理有盲区（MEM-10 未彻底） |
| C-05 | HTML 对话框与 Vue 组件对话框双轨并存，多数 HTML 版不可达 | 维护成本；14 个可见 HTML 对话框实际可达约 5–6 个 |
| C-06 | 菜单 id 错位：`help:contact-us` vs `help:contact` | 点"联系我们"实际打开 HTML 对话框而非 Vue 版 |
| C-07 | Mermaid 隐藏窗链路半死（启动空图、结果无消费、更新函数零调用） | 占用一个隐藏渲染进程，实际渲染由渲染层 mermaid 包完成 |
| C-08 | `online-web-page` 加载远程 URL 且持有 dialog preload，无导航拦截 | 远程页可 `shell.openExternal` 任意协议、监听任意通道（写被白名单阻断） |
| C-09 | 主窗口 preload 暴露全量 electronAPI（无 send 白名单） | 受信上下文；若出现 XSS 将直达全量 IPC（纵深防御缺口） |
| C-10 | `<webview>` PDF 预览不可用（`webviewTag:false`）；Vue 版 OnlineWebPage/MermaidRenderFrame 为占位 | 功能空白，不新增通信面 |

#### 十、维护与防回归建议

1. **新增通道流程**：先在 `src/shared/ipc-channels.ts` 按分组登记常量 → preload/主进程/渲染层全部引用常量（禁止字面量）→ 若为对话框 send 通道需同步加入 `dialog.ts` 白名单 → 运行 `npm test` 校验。
2. **防回归测试已覆盖**：`ipc-channel-constants.test.ts`（常量唯一性、无字面量绕过、无死常量）、`preload-dialog.test.ts`（白名单放行/丢弃）、`main-index.test.ts`（启动注册与清理）、`dialog-defaults.test.ts`（对话框公共配置）。
3. **治理优先级建议**：HTML/Vue 对话框双轨收敛（C-05/C-06）→ 监听器台账补全（C-04）→ 主题广播修复（C-03）→ preload 缺口修复（C-01/C-02）→ 死通道清理（16 个）。
4. **远程内容安全**：为 `online-web-page` 补充 `will-navigate` / `setWindowOpenHandler` 拦截与协议白名单（C-08）。
5. **文档同步**：通道增删改后同步更新本矩阵；本矩阵依据工作区当前源码（2026-11-15）静态扫描，若运行态行为有差异以实测为准。
