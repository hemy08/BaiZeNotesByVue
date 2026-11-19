<!-- report-nav:start -->
> 🧭 **报告导航**：[🏠 报告首页](../../README.md) ｜ [01-检查与扫描](../01-检查与扫描/) ｜ [02-修复与实施](../02-修复与实施/) ｜ [03-专项治理](../03-专项治理/) ｜ 当前：**IPC通信治理报告**（03-专项治理）
<!-- report-nav:end -->

# IPC 通信治理报告（合并归档）

> **合并归档报告**：由以下历史报告合并而成（保留原文，按时间顺序成章）：`2026-11-15-通信检查报告.md`、`13-IPC通信问题修复计划.md`、`14-IPC通道命名统一方案.md`。
> 内容为历史快照；当前口径见 [报告总索引](../../README.md) 与 [IPC通信矩阵](IPC通信矩阵.md)（v1.3.6 基线：158 测试文件 / 2,877 用例 / 92 IPC 通道 / 17 组）。

## 一、通信检查报告（2026-11-15）

- 检查日期：2026-11-15
- 检查对象：IPC 通道 123 个（16 分组）、BrowserWindow 容器 18 类、preload 暴露 API 27 个、EventBus 事件 25 个
- 检查依据：`src/shared/ipc-channels.ts`（通道常量唯一真源）+ `src/main/**`、`src/preload/**`、`src/renderer/src/**` 全量交叉检索
- 检查方法：常量 ↔ 调用点双向 grep 检索（正向：每个常量找发送/接收点；反向：每个 IPC 调用点核对常量来源），逐通道判定方向、模式、载荷与两端接线状态

#### 一、检查摘要

**结论：通信骨架健康，接线存在 32 处问题。** 通道常量治理（ARC-03 唯一真源）与防回归测试到位，未发现绕过常量硬编码通道字符串的违规调用；但存在 2 项 P0 级安全问题/功能失效、5 项 P1 高优先级缺陷，以及 16 个疑似死通道与部分模式不一致。

##### 1.1 检查项与结果

| 检查项 | 结果 | 说明 |
| --- | --- | --- |
| 常量唯一性 | ✅ 通过 | 123 个通道无重复值 |
| 常量引用完整性（正向） | ✅ 通过 | `src/` 内无通道字符串字面量直接调用（常量定义与 EventBus 事件名除外） |
| 调用点有效性（反向） | ⚠️ 16 个死通道 | 每个常量至少被引用一次，但部分仅单端存在 |
| 收发两端接线 | ⚠️ 1 个模式不匹配 | `baize:setting:auto-save-changed` 用 send 发送、handle 注册 |
| sendSync 使用 | ✅ 通过 | 全项目已无 `ipcRenderer.sendSync` 调用点 |
| 对话框 send 白名单 | ✅ 通过 | 17 通道白名单覆盖全部 D→M send，无缺漏 |
| preload 暴露面 | ⚠️ 15/27 未使用 | 暴露但无调用方（含 config.delete/list） |
| 窗口安全基线 | ✅ 通过 | 全窗口 `contextIsolation:true`、`nodeIntegration:false` |
| 远程内容边界 | ❌ 不通过 | `online-web-page` 持有 preload 且无导航拦截（C-08） |
| 监听器台账 | ⚠️ 不完整 | 6 个对话框 + Mermaid 通道绕过 `ipcListenerManager`（C-04） |
| 防回归测试 | ✅ 覆盖 | `ipc-channel-constants.test.ts`、`preload-dialog.test.ts` 等 |

##### 1.2 问题统计

| 严重度 | 数量 | 判定标准 |
| --- | --- | --- |
| **P0 严重** | **2** | 安全边界缺失或用户可见功能失效 |
| **P1 高** | **5** | 功能缺陷、运行时异常、治理盲区 |
| **P2 中** | **19** | 死通道、载荷/语义不一致、双轨并存 |
| **P3 低** | **6** | 命名复用、字面量绕过、遗留清理项 |
| **合计** | **32** | 死通道 16 + 模式不一致 6 + 机制风险 10（去重后；原 PRE/POST 渲染两段式问题已随 PF-02 重构消除） |

##### 1.3 检查范围说明

- 只做**静态扫描**：除 C-03/C-04 有单测佐证外，问题未在运行态复现。
- 跨进程形态：单主进程 + 多渲染进程（每窗口一个）；未使用 `utilityProcess`、`MessageChannelMain`、`MessagePort`、`BrowserView`。
- 扫描基线为用户工作区当前代码（含在途重构），源码变更后需重新核对。

#### 二、P0 严重问题（2 项）

##### 2.1 C-08：`online-web-page` 加载远程页面且持有 dialog preload

- **现象**：`OpenOnlineWebPages.ts` 以 `loadURL(远程URL)` 打开任意网页，窗口使用 `dialog.js` preload；未设置 `will-navigate` 拦截、无 URL scheme 白名单。
- **能力面**：远程页面可调用 `window.electronAPI.ipcRenderer.send`（受 17 项白名单约束）与 `ipcRenderer.on`（**无白名单限制**）、`shell.openExternal`（未校验协议，可外开 `file://`、自定义协议等）。
- **对比**：PlantUML 隐藏窗（`plantuml-local.ts`）正确设置了 `setWindowOpenHandler→deny` 与 `will-navigate` 全拦截。
- **影响**：远程内容可向主进程发送主题变更、保存快捷链接等 17 类消息，可监听任意主进程广播（含文件内容、路径）；`shell.openExternal` 可作跳板打开本地程序/协议。
- **建议**：① 为 `online-web-page` 增加导航与 `setWindowOpenHandler` 拦截；② `shell.openExternal` 加协议白名单（仅 http/https）；③ 评估该窗口是否需要 preload（若仅展示远程页可去掉）。

##### 2.2 「自动保存开关」收发模式不匹配

- **通道**：`baize:setting:auto-save-changed`
- **现象**：渲染层 `SystemSettingDialog.vue:handleAutoSaveChange` 用 `window.electron.ipcRenderer.send` 发送；主进程 `handlers.ts:registerIpcHandlers` 用 `ipcListenerManager.registerHandleOnce`（即 `ipcMain.handle`，**仅 invoke 可触发**）注册；全 src 无第二个 `ipcMain.on` 注册。
- **影响**：Vue 系统设置对话框中切换"自动保存"开关**不会触发主进程启停定时器**，功能静默失效；HTML 版系统设置对话框则在主进程内直接 `StartAutoSaveFileTime`，同一功能双实现、行为分叉。
- **建议**：统一为 `invoke + handle`（推荐），或主进程补 `ipcMain.on`；补齐回归测试覆盖该通道两端模式。

#### 三、P1 高优先级问题（5 项）

##### 3.1 C-01：`editor-setting-dialog` 未注入 preload 却使用 `window.electronAPI`

- **现象**：`ShowEditorSettingDialog.ts` 的 `webPreferences` 未设置 `preload`；但注入脚本 `editor-setting-script.ts` 第一行即访问 `window.electronAPI.ipcRenderer`。
- **影响**：脚本在 `window.electronAPI` 处抛错，设置回填/应用/取消逻辑全部失效。该对话框在菜单树中已被移除（不可达），属遗留缺陷；同时偏离 `DIALOG_WEB_PREFERENCES` 单一配置源。
- **建议**：若保留则补 `preload: dialog.js`；更优是删除该 HTML 对话框（Vue 版 `EditorSettingDialog.vue` 已为实际路径）。

##### 3.2 C-03：主题设置对话框主进程回调引用渲染层 `window`

- **现象**：`ShowThemeSettingDialog.ts` 模块顶层 `ipcMain.on(THEME.THEME_UPDATE)` 回调中执行 `(window as ...).electronAPI.broadcastTheme(...)`。
- **影响**：主进程无 `window` 全局 → 回调执行到广播处抛 `ReferenceError`；主题配置可能已写入 store，但广播中断，主进程存在未捕获异常。
- **证据**：单测 `dialogs.test.ts` 必须 `vi.stubGlobal('window', …)` 才能通过。
- **建议**：改为直接调用 `ipcMain.emit(IPC.THEME.DIALOG_BROADCAST_THEME, …)` 或抽公共 `broadcastThemeToAllWindows()` 主进程函数。

##### 3.3 C-04：部分监听器绕过 `ipcListenerManager` 台账

- **现象**：`main/index.ts`（THEME.UPDATE_THEME、EDITOR.FLUSH_CONTENT*）、6 个对话框、Mermaid 结果通道直连 `ipcMain.on`，未走 `ipcListenerManager.register*`。
- **影响**：`cleanupAll()` / `getInventory()` 台账不完整，MEM-10 治理承诺未兑现，泄漏诊断存在盲区。
- **建议**：统一迁移至 `ipcListenerManager`，对话框监听器挂 `componentId` 随窗口 `closed` 自动清理。

##### 3.4 C-06：菜单 action id 错位

- **现象**：`menu-config.ts` 发出 `baize:menu:help:contact-us`，`menu-actions.ts` 拦截的是 `baize:menu:help:contact`。
- **影响**：点击"联系我们"实际落到主进程 HTML 对话框（`ShowHelpContactUsDialog`），而非渲染层 `HelpContactUsDialog.vue`；两套实现并存。
- **建议**：统一 id，删除未使用的 HTML 版或明确保留策略。

##### 3.5 C-07：Mermaid 隐藏窗链路半死

- **现象**：主窗口 `ready-to-show` 即创建隐藏 Mermaid 窗口并渲染空图；`HandleMermaidGetRenderResult`、`updateMermaidWindowHtml` 全库零调用；`OVERLAY.MERMAID_GRAPH_DEF` 有监听无发送；`MERMAID_RENDER_RESULT` 结果仅存入模块变量无消费方。
- **影响**：占用一个隐藏渲染进程；实际 Mermaid 渲染由渲染层 npm 包完成，隐藏窗为遗留机制。
- **建议**：确认无后路需求后删除该窗口与 3 个相关通道，或补齐"主进程渲染 Mermaid"链路。

#### 四、P2 中优先级问题（去重后 19 项）

##### 4.1 疑似死通道（16 个）

| # | 通道 | 现象 | 清理建议 |
| --- | --- | --- | --- |
| 1 | `baize:window:unmaximize` | 无发送点，仅主进程注册 | 删除常量与 handler；还原能力由 TOGGLE_MAXIMIZE 覆盖 |
| 2 | `baize:config:delete` | preload 已暴露，渲染层零调用 | 删除 API 或补配置管理界面 |
| 3 | `baize:config:list` | 同上 | 同上 |
| 4 | `baize:config:ensure-dir` | preload 未暴露，零调用 | 删除（read/write/list 内部已 ensure） |
| 5 | `baize:theme:update-monaco` | 有发送，主进程零接收 | 删除发送方（主题改走 saveConfig→THEME_UPDATED） |
| 6 | `baize:theme:get-current` | 仅 handle，零 invoke | 删除 |
| 7 | `baize:theme:get-separate-editor` | 仅 sendSync 应答注册，零 sendSync | 删除（源码注释已自认遗留） |
| 8 | `baize:theme:get-monaco` | 同上 | 删除 |
| 9 | `baize:editor:relayout` | 仅渲染层监听，零发送 | 删除（布局已走 EventBus MONACO_RELAYOUT） |
| 10 | `baize:editor:update-font` | 有发送，主进程零接收 | 删除发送方（字体走配置写入） |
| 11 | `baize:dialog:open-plugin-tool` | 有发送（26 处），零监听 | 待插件菜单主进程树退役时连同删除 |
| 12 | `baize:navigation:keydown` | 仅主进程接收，零发送 | 删除（Ctrl+S 已走 SAVE_TO_DISK） |
| 13 | `baize:monaco:insert-writing-templates` | 仅渲染层监听，零发送 | 删除监听+常量，并清理 templates.ts 字面量副本 |
| 14 | `baize:overlay:mermaid-graph-definition` | 仅渲染层监听，零发送 | 与 C-07 一并评估 |
| 15 | `baize:overlay:open-url` | 仅主窗口监听，零发送 | 删除 |
| 16 | `baize:overlay:update-mermaid-graph` | 发送函数零调用 + 窗口零监听 | 与 C-07 一并评估 |

> 补充：`EVENTS.FILE_SAVED_SUCCESS`、`QUICK_LINKS.UPDATED` 采用 `BrowserWindow.getAllWindows()` 广播，会发给无监听的窗口，属可收窄的广播面（P3）。
>
> **计数口径说明**：本节列出 16 个死通道，其中 `baize:overlay:mermaid-graph-definition` 与 `baize:overlay:update-mermaid-graph` 的处置已随 C-07（P1-3.5）一并评估，不重复计入 P2；因此 P2 实际计数为 16 − 2（归入 C-07）+ 4.2 的 3 项 + 4.3 的 2 项 = **19 项**。

##### 4.2 载荷/语义不一致（3 项）

| # | 通道 | 问题 | 影响 |
| --- | --- | --- | --- |
| 1 | `baize:theme:update-from-dialogd`（THEME.UPDATED） | `MenuBar.vue:handleThemeUpdated` 按 `{ currentTheme }` 读取，但实际广播载荷为 `{themeStyles, monacoTheme, separateEditorTheme}` 与 `{themeType, ...}`，均无 `currentTheme` | 菜单主题选中态不会被推送刷新 |
| 2 | `baize:theme:init-styles`（INIT_THEME_STYLES） | M→R 分支无监听（空转）；载荷双轨：10 个发送方发裸 `ThemeStyles`，主题对话框发 `{theme, separateEditorTheme, monacoTheme}` | 主窗口初始主题改由 invoke 完成；同名通道两种载荷，维护易错 |
| 3 | `baize:monaco:insert-text-block`（TEXT_BLOCK_TEMPLATES） | 通道名与实际用途不符：被复用为"通用文本片段插入"（图片引用、字体 HTML、导入文本） | 命名认知成本，易误用 |

> 原"PRE/POST 渲染两段式无请求 ID"问题已随 PF-02 重构（预览改为渲染层本地单跳渲染）消除，不再计入。

##### 4.3 机制层（2 项）

| # | 问题 | 影响 |
| --- | --- | --- |
| 1 | C-02：对话框 preload 的 `removeListener` 与 `on` 包装函数引用不一致 | 无法真正退订；当前脚本未调用 removeListener，属 API 语义失真 |
| 2 | C-05：HTML 对话框与 Vue 组件对话框双轨并存，14 个可见 HTML 对话框实际仅约 5–6 个可达 | 维护成本与认知负担；逐通道矩阵需按两种实现分别理解 |

#### 五、P3 低优先级问题（6 项）

| # | 问题 | 说明 |
| --- | --- | --- |
| 1 | `EDITOR.UPDATE_OPTIONS` 方向混用 | `BaiZeNotes.vue` 的 `('theme', loadedTheme)` R→M 分支无接收方（空转）；M→R 分支正常 |
| 2 | ARC-03 唯一真源被绕过 | `common/templates.ts` 用字面量重复定义 `baize:monaco:insert-writing-templates` / `baize:monaco:insert-text-block`（零消费） |
| 3 | 命名与用途不符 | `WRITING_TEMPLATES` 对应功能实际走 EventBus，不走 IPC |
| 4 | 监听台账证据补充 | 与 C-04 同源，作为补齐清单使用 |
| 5 | C-09 主窗口暴露全量 electronAPI | 本地受信上下文；若出现 XSS 将直达全量 IPC（纵深防御缺口） |
| 6 | C-10 `<webview>` PDF 预览不可用 / Vue Overlay 占位 | `webviewTag:false` 导致预览空白；不新增通信面 |

#### 六、检查方法与复现

##### 6.1 扫描方法

1. **常量盘点**：解析 `ipc-channels.ts` 得到 16 组 123 个常量（组 → 键 → 通道字符串）。
2. **正向检索**：对每个常量 grep `IPC.<组>.<键>`，记录全部发送点与接收点。
3. **反向检索**：grep `ipcMain.(on|handle|once)`、`webContents.send`、`ipcRenderer.(invoke|send|on)`，确认首参均为常量（无字面量绕过）。
4. **方向判定**：send+on ⇒ 单向；invoke+handle ⇒ 请求-响应；webContents.send ⇒ 主进程推送；结合窗口归属判定 R/D/H。
5. **接线判定**：两端均存在 ⇒ 正常；单端存在或发送函数零调用 ⇒ 死通道/半死。

##### 6.2 复现命令

```powershell
### 通道常量统计
node -e "const fs=require('fs');const s=fs.readFileSync('src/shared/ipc-channels.ts','utf8');const g={};let cur=null;for(const l of s.split('\n')){const m=l.match(/^\s{4}([A-Z_]+): \{$/);if(m){cur=m[1];g[cur]=0;continue}if(/^\s{4}\} as const/.test(l)){cur=null;continue}if(cur&&/^\s+[A-Z_]+: '/.test(l))g[cur]++}console.log(g)"

### 死通道抽查（示例：baize:window:unmaximize）
Select-String -Path (Get-ChildItem src -Recurse -Include *.ts,*.vue | % FullName) -Pattern "WINDOW.UNMAXIMIZE"

### 自动保存通道两端模式
Select-String -Path (Get-ChildItem src -Recurse -Include *.ts,*.vue | % FullName) -Pattern "AUTO_SAVE_CHANGED"
```

##### 6.3 防回归现状

| 测试文件 | 覆盖内容 |
| --- | --- |
| `tests/unit/ipc-channel-constants.test.ts` | 常量唯一性、无字面量绕过、无死常量、EventBus 事件同规则 |
| `tests/unit/preload-dialog.test.ts` | 对话框 send 白名单放行/丢弃、on 事件剥离、broadcastTheme |
| `tests/unit/main-index.test.ts` | 启动注册流程、close 前 flush 协议、清理 |
| `tests/unit/dialog-defaults.test.ts` | 对话框公共 webPreferences 配置 |

#### 七、修复路线图

| 阶段 | 内容 | 关联问题 | 预期收益 |
| --- | --- | --- | --- |
| 第 1 阶段（安全/功能） | 修复远程页 preload 边界与 shell 协议白名单；修复自动保存通道模式 | C-08、P0-2.2 | 消除安全跳板面，恢复自动保存开关 |
| 第 2 阶段（一致性） | 统一监听器台账；修复主题广播异常与菜单 id 错位；明确双轨对话框去留 | C-01、C-03、C-04、C-06、C-05 | 治理盲区清零，主题/联系入口行为一致 |
| 第 3 阶段（清理） | 删除 16 个死通道及其发送/监听代码；收敛广播面 | P2 死通道、广播面 | 通道数从 123 收敛至约 107，减少维护面 |
| 第 4 阶段（加固） | Mermaid 隐藏窗链路决策；preload 暴露面裁剪；字面量绕过清理 | C-07、C-09、ARC-03 | 进程/API 面精简，防漂移 |

#### 八、附录：问题证据索引

| 编号 | 关键证据位置 |
| --- | --- |
| P0-2.1（C-08） | `src/main/dialogs/OpenOnlineWebPages.ts:6-13`、`src/preload/dialog.ts:56-58` |
| P0-2.2 | `SystemSettingDialog.vue:handleAutoSaveChange`、`src/main/ipc/handlers.ts:registerIpcHandlers` |
| P1-3.1（C-01） | `src/main/dialogs/ShowEditorSettingDialog.ts:39-57`、`editor-setting-script.ts:4` |
| P1-3.2（C-03） | `src/main/dialogs/ShowThemeSettingDialog.ts:744-770` |
| P1-3.3（C-04） | `src/main/index.ts:48-53,174`、6 个对话框的 `ipcMain.on` |
| P1-3.4（C-06） | `menu-config.ts:395`、`menu-actions.ts:114` |
| P1-3.5（C-07） | `src/main/index.ts:113`、`OpenMermaidRenderFrame.ts:24-75` |
| P2-4.1 | 逐通道证据见通信矩阵报告第六、七节 |
| P2-4.2 #1 | `MenuBar.vue:handleThemeUpdated`、`main/index.ts` 广播载荷 |
| P2-4.2 #2 | 11 个 `Show*Dialog` 的 INIT_THEME_STYLES 发送点、`ShowThemeSettingDialog.ts:56` |
| P3 #2 | `src/renderer/src/common/templates.ts:6-7` |

> 完整逐通道矩阵（123 行、含发起方/接收方/载荷/用途）见《2026-11-15-IPC通信矩阵》报告。

## 二、IPC 通信问题修复计划

- **制定日期**：2026-11-15
- **依据**：[2026-11-15-通信检查报告](IPC通信治理报告.md)（32 项问题：P0×2、P1×5、P2×19、P3×6）与 [IPC 通信矩阵](IPC通信矩阵.md)
- **现状**：检查结论「通信骨架健康，接线存在 32 处问题」；已复核关键项（自动保存模式不匹配、online-web-page 无导航拦截、主进程引用渲染层 window、菜单 action id 错位均属实）
- **执行方式**：按 4 个阶段拆分为 7 个子智能体任务（并行 2 → 3 → 1 → 1），最后统一复核
- **目标**：32 项闭环；通道数 123 → 约 107（死通道清理后）；全部门禁通过

#### 1. 修复原则与验收标准

- **原则**：安全/功能问题优先；行为变化最小化（不改线上通道字符串语义）；每项修复配回归测试；删除类改动先 grep 确认双端零引用。
- **全局验收**：
  - typecheck 双绿、`npm run test` 全过、`npx eslint . --quiet` 0 error、`npx electron-vite build` 通过；
  - 新增防回归测试：①通道两端模式一致性（send↔on / invoke↔handle）；②死通道零存在（常量与调用点双向核对）；③preload 暴露面与白名单覆盖；
  - 复核方式：按通信矩阵逐通道重扫，输出"修复后矩阵"与检查报告状态标注。

#### 2. 阶段划分与代理分工

| 阶段 | 子代理 | 负责问题 | 主要文件 | 依赖 |
|---|---|---|---|---|
| 阶段 1 安全与功能（并行） | A1 `ipc-sec` | C-08 远程页边界、P3-5 相关协议白名单 | OpenOnlineWebPages.ts、utils.ts、dialog-defaults.ts、相关测试 | 无 |
| | A2 `ipc-autosave` | P0-2.2 自动保存通道模式、双实现统一 | SystemSettingDialog.vue、handlers.ts、ShowSystemSettingDialog.ts | 无 |
| 阶段 2 一致性（并行） | B1 `ipc-listeners` | C-03 主题广播异常、C-04 监听台账统一 | main/index.ts、6 个 Show*.ts、theme-config/ShowThemeSettingDialog.ts | 阶段 1 完成（避免 index.ts 冲突） |
| | B2 `ipc-dialogs` | C-01 编辑器设置 HTML 对话框、C-05 双轨去留、C-06 菜单 id | ShowEditorSettingDialog.ts、editor-setting-script.ts、menu-config.ts、menu-actions.ts、dialogs 清单 | 阶段 1 完成 |
| | B3 `ipc-preload` | C-02 removeListener 语义、白名单/台账测试补齐 | preload/dialog.ts、tests/unit/preload-*.ts | 阶段 1 完成 |
| 阶段 3 清理（串行，依赖 B1 释放 index.ts） | C1 `ipc-cleanup` | 16 个死通道、C-07 Mermaid 半死链路、广播面收窄、templates.ts 字面量、UPDATE_OPTIONS 空转分支（注：通道命名统一已单独完成，见 [14-IPC通道命名统一方案](IPC通信治理报告.md)） | index.ts、ipc-channels.ts、OpenMermaidRenderFrame.ts、templates.ts、各发送/监听点 | 阶段 2 完成 |
| 阶段 4 加固（串行） | D1 `ipc-hardening` | C-09 preload 暴露面裁剪、P3 余项复核、C-10 记录 | preload/index.ts、renderer 调用点、文档记录 | 阶段 3 完成 |
| 收尾 | 根代理 + 复核代理 | 重扫矩阵、更新报告、门禁复核 | ../../** | 全部完成 |

#### 3. 逐项修复方案

##### 3.1 阶段 1：安全与功能（P0）

| 编号 | 问题 | 修复动作 | 验证 | 风险 |
|---|---|---|---|---|
| **C-08** | `online-web-page` 加载远程页且持有 dialog preload，无导航拦截；`shell.openExternal` 无协议白名单 | ① `OpenOnlineWebPages.ts`：`webContents.on('will-navigate', e => e.preventDefault())` + `setWindowOpenHandler(() => ({ action: 'deny' }))`（与 plantuml-local.ts 一致）；② 远程窗口移除 preload（若确需主题广播等能力，改为主进程代发）；③ `OpenOnlineWebPage` 打开浏览器时校验 URL 协议白名单（仅 http/https，必要时加 mailto）；④ 窗口 `webPreferences` 显式 `sandbox:true` | 单测：远程窗口 options 断言（无 preload、sandbox、拦截器注册）；`shell.openExternal` 非法协议拒绝用例；手动冒烟远程页可正常显示、无法跳转 | 低：仅限 windows 打开路径；移除 preload 后需确认远程页无依赖 |
| **P0-2.2** | 自动保存通道：渲染层 send、主进程 handle（仅 invoke 生效）→ 开关静默失效；HTML/Vue 双实现分叉 | ① 渲染层 `SystemSettingDialog.vue::handleAutoSaveChange` 改 `invoke`（或显式 `send` 并主进程补 `ipcMain.on`）；② 推荐统一 `invoke + handle`，保留主进程现有 `registerHandleOnce`；③ 评估移除 HTML 版系统设置对话框（不可达时删除，避免双实现） | 回归测试：模拟渲染端切换开关 → 断言主进程定时器启停（Start/Stop mock 调用）；通道两端模式一致性测试用例 | 低：仅一处调用点 |
| **P3-5（配套）** | `shell.openExternal` 协议校验收口 | 抽公共 `openExternalSafely(url)` 供各调用点复用（含 navi-tab-open-exe 附近已有校验） | 单测：非法协议拒绝、合法放行 | 低 |

##### 3.2 阶段 2：一致性（P1）

| 编号 | 问题 | 修复动作 | 验证 |
|---|---|---|---|
| **C-01** | `ShowEditorSettingDialog` 未注入 preload 却用 `window.electronAPI`（对话框已不可达） | 优先**删除**该 HTML 对话框及其脚本/CSS 引用（Vue 版 `EditorSettingDialog.vue` 为实际路径）；若需保留则补 `preload: dialog.js` 并加入 `DIALOG_WEB_PREFERENCES` | 单测更新；grep 确认零引用；菜单/入口确认 |
| **C-03** | `ShowThemeSettingDialog` 主进程回调引用渲染层 `window.electronAPI` | 抽主进程 `broadcastThemeToAllWindows()`（`BrowserWindow.getAllWindows().forEach(w => w.webContents.send(IPC.THEME.THEME_UPDATED, payload))`）替换；删除对 `window.electronAPI` 的引用 | 单测：不再需要 `vi.stubGlobal('window')`；广播调用断言 |
| **C-04** | 6 个对话框 + `main/index.ts` 监听器绕过 `ipcListenerManager` 台账 | 统一迁移至 `ipcListenerManager.registerOnce/registerHandleOnce`：对话框用 `componentId` + 窗口 `closed` 清理；index.ts 两类通道归入全局注册 | 台账测试：`getInventory()` 覆盖全部注册；`cleanupAll` 后无残留 |
| **C-05** | HTML 对话框与 Vue 对话框双轨并存（14 个 HTML 仅 5–6 可达） | 输出「对话框去留清单」：逐项核对菜单/入口可达性，列出保留（补 i18n/接线）与删除（含代码/常量/测试）两类；本轮只执行删除清单内无入口项 | 清单评审 + grep 零引用；删除后 build/test 通过 |
| **C-06** | 菜单 action id 错位（`contact-us` vs `contact`） | 统一为 `baize:menu:help:contact-us`；删除/保留 HTML 版按 C-05 清单决策；补菜单路由单测 | 菜单路由测试：点击映射到预期对话框实现 |
| **C-02** | 对话框 preload `removeListener` 与 `on` 包装函数引用不一致 | `dialog.ts` 的 `on` 存原始包装或维护 `channel→handler` 映射，`removeListener` 可真正退订；补 preload 单测 | 单测：注册→退订→事件不再触发 |

##### 3.3 阶段 3：清理（P2）

| 编号 | 内容 | 修复动作 | 验证 |
|---|---|---|---|
| 死通道 ×16 | `window-unmaximize`、`config:delete/list/ensure-dir`、`update-monaco-theme`、`get-current-theme`、`get-separate-editor-theme`、`get-monaco-theme`、`editor-relayout`、`update-editor-font`、`open-plugin-tool`（待菜单树退役）、`keydown`、`monaco-insert-writing-templates`、`mermaid-graph-definition`、`open-url-in-web-browser-window`、`update-mermaid-render-graph` | 逐通道：删除常量 + 发送/监听代码 + 测试断言；`open-plugin-tool` 视菜单树保留状态决定（本轮删除 26 处发送或注明保留策略） | 死通道零存在测试（常量↔调用点双向） |
| **C-07** | Mermaid 隐藏窗链路半死（窗口空转 + 3 通道无消费） | 删除隐藏窗口创建/`OpenMermaidRenderFrame`/`MERMAID_RENDER_RESULT` 等通道；确认渲染层 mermaid npm 包渲染为唯一路径 | build/test；内存冒烟（无隐藏窗口） |
| 广播面收窄 | `FILE_SAVED_SUCCESS`、`QUICK_LINKS.UPDATED` 全窗口广播 | 改为定向发送（记录目标窗口引用）或确认无监听窗口后删除 | 广播目标断言 |
| 4.2 载荷不一致 ×3 | THEME.UPDATED 载荷无 `currentTheme`；INIT_THEME_STYLES 双载荷/空转；TEXT_BLOCK_TEMPLATES 命名不符 | ① 修正 MenuBar 读取或广播补字段（统一 `{themeStyles, monacoTheme, separateEditorTheme}` + 必要字段）；② INIT_THEME_STYLES 统一单一载荷并补齐监听或删除空转分支；③ 重命名通道（保留旧值兼容一次）或加注释标记语义 | 载荷一致性单测 |
| P3-1/P3-2 | UPDATE_OPTIONS 方向混用空转；templates.ts 字面量绕过 | 删除空转分支；templates.ts 改用 `IPC` 常量引用 | 常量唯一性测试 |

##### 3.4 阶段 4：加固（P3 余项）

| 编号 | 内容 | 修复动作 |
|---|---|---|
| C-09 | 主窗口暴露全量 `electronAPI`（含任意通道） | 评估裁剪：保留 `ipcRenderer.on/invoke/send` 收窄为白名单 API（与 dialog preload 同模式）；或明确风险接受并记录（本地受信上下文 + DOMPurify 已封 XSS）——本轮输出评估结论与最小化方案，若风险可控则实施白名单 |
| P3-6 | `<webview>` PDF 预览不可用 | 仅记录（不新增通信面）；入口已在 CMP-19 治理中隐藏 |
| 命名复用 | `WRITING_TEMPLATES` 实际走 EventBus | 重命名/标注，避免认知混淆 |

#### 4. 回归测试建设（随阶段落地）

| 测试 | 内容 |
|---|---|
| `ipc-channel-modes.test.ts`（新增） | 遍历通道常量：save 类通道断言 send↔on 或 invoke↔handle 两端模式一致 |
| `ipc-dead-channels.test.ts`（新增） | 常量↔调用点双向核对，死通道数为 0（白名单机制除外） |
| `dialog-window-security.test.ts`（新增） | 远程窗口无 preload/导航拦截/协议白名单；对话框 webPreferences 统一来源 |
| 台账测试（扩展） | `ipcListenerManager.getInventory()` 覆盖全部注册；`cleanupAll` 无残留 |
| preload 测试（扩展） | 白名单放行/拒绝、on 事件剥离、removeListener 真实退订 |

#### 5. 风险与回滚

- **删除死通道**：先 grep 双端 + 动态拼接检查（`IPC.X[${var}]`），再删代码，最后删常量；单通道独立 commit 便于回滚；
- **C-08 移除远程窗口 preload**：若远程页面依赖主题广播，改主进程代发；不影响本地功能；
- **C-05 删除 HTML 对话框**：仅删除确认无入口的项；保留项不动；
- **C-09 preload 裁剪**：改动面大，先出评估报告，经评审后再实施；未评审前保持现状（现有 DOMPurify + CSP 已降低风险）。

#### 6. 排期建议

| 批次 | 内容 | 预估 |
|---|---|---|
| 批次 1 | C-08、P0-2.2、P3-5（2 个并行代理） | 1 轮 |
| 批次 2 | C-01/03/04/05/06、C-02（3 个并行代理） | 1~2 轮 |
| 批次 3 | 16 死通道 + C-07 + 广播面 + 载荷修正（1 个代理） | 1~2 轮 |
| 批次 4 | C-09 评估（1 个代理）+ 余项 | 1 轮 |
| 收尾 | 重扫矩阵 + 报告状态标注 + 门禁 | 1 轮 |

> 执行时每批次完成后由根代理统一跑门禁（typecheck/test/eslint/build），并更新《2026-11-15-通信检查报告》状态列与通信矩阵，最终产出《IPC 通信问题修复实施报告》。

#### 八、执行状态（2026-11-15 批次后）

- ✅ **已闭环**：C-08（在线网页窗口去 preload + 导航拦截 + 协议白名单）、P0-2.2（自动保存 invoke/handle）、C-03（主进程统一主题广播）、C-04（ipcMain 直连清零，全部迁移台账）、C-06（菜单 contact id 统一）、N-05（37 个高风险通道 sender 校验）、16 个死通道删除（通道 123→86）、C-07（Mermaid 隐藏窗链路删除）、P3-2（templates.ts 字面量收口）；
- 🟡 **部分处理**：C-05/C-01（不可达 JSDOM 对话框已批量删除，仅余 contact-us 待确认）、广播面收窄（随死通道清理部分完成）、载荷一致性（随通道删除缩减）；
- ⏭ **未处理**：C-09（主窗口 preload 全量 electronAPI 收敛）、C-10（webview PDF）、24 个低风险只读通道 sender 校验、plantuml-local IPC 校验、config-manager 内联广播收口；
- 详见 [16-修复批次实施报告](../02-修复与实施/修复批次实施记录.md)。

## 三、IPC 通道命名统一方案

- **制定日期**：2026-11-15
- **依据**：`src/shared/ipc-channels.ts`（123 个通道 · 16 分组）+ [IPC 通信矩阵](IPC通信矩阵.md) + [通信检查报告](IPC通信治理报告.md)
- **配套产物**：机器可读映射 `out\tool-results\ipc-channel-rename-map.json`（group/key/old/new/direction/dead）
- **一句话建议**：统一为 **`baize:<domain>:<name>`** 三段式；由于通道引用已 100% 走常量真源，**改名只需修改 `ipc-channels.ts` 的 123 个字符串值，1341 个调用点零改动**，成本极低。

#### 一、现状盘点

##### 1.1 规模

| 指标 | 数量 |
|---|---|
| 通道常量 | **123**（16 分组：WINDOW 10 / CONFIG 5 / THEME 13 / MENU 1 / EDITOR 14 / FILE 18 / FILE_MANAGER 14 / PLUGIN 6 / RENDER 2 / DIALOG 14 / NAVIGATION 2 / VIEW 5 / MONACO_INSERT 3 / QUICK_LINKS 5 / OVERLAY 7 / EVENTS 4） |
| 前缀分布 | `baize-notes:` **25** · `baize:notes:` **7** · 其他/无前缀 **91**（如 `window-*`、`config:*`、`file-manager-*`、`dialog-*`、`get-*`） |
| 已知方向数据 | 113/123（来自通信矩阵） |
| 计划删除的死通道 | 16（见明细表「计划删除」标记） |

##### 1.2 发现的六类命名问题

| # | 问题 | 典型例子 |
|---|---|---|
| A | **前缀四套并存** | `baize-notes:update-theme`、`baize:notes:welcome:open-file`、`config:read`、`window-minimize`、`get-current-theme` |
| B | **分隔符/层级混用** | `baize:notes:welcome:open-file`（4 段）vs `baize-notes:update-theme`（2 段）；`file-manager-context-menu-*` 13 个超长前缀 |
| C | **动词/事件语义不统一** | 命令式 `window-minimize`、`get-current-theme`、`update-*`、`dialog-*-enter` 混用；事件型 `*-updated`、`*-changed`、`*-result` 未统一 |
| D | **拼写/语义错误** | `markdown-edit-model` / `markdown-preview-model`（model→**mode**）；`monaco-insert-text-block-templates` 实为通用文本插入；`open-plugin-tool` 为死通道 |
| E | **方向不可辨** | 同一前缀下混有 R→M send/on、invoke/handle、M→R 推送，仅看名称无法区分 |
| F | **通道名与常量名不一致** | 常量 `TEXT_BLOCK_TEMPLATES` ↔ 通道 `monaco-insert-text-block-templates`；`COPY_IMAGELINK` ↔ `...copy-imagelink`（缺连字符） |

#### 二、统一命名规范（建议）

##### 2.1 格式

```
baize:<domain>:<name>
```

- 固定三段，全小写 kebab-case；`<domain>` 取白名单（18 个）；`<name>` 为动作/实体 + 可选细节；
- 示例：`baize:window:minimize`、`baize:config:read`、`baize:theme:updated`、`baize:fs:copy-relative-path`、`baize:file:open-with-encoding`。

##### 2.2 领域白名单（18）

`window` · `config` · `setting` · `theme` · `editor` · `monaco` · `view` · `menu` · `file` · `fs` · `navigation` · `dialog` · `plugin` · `render` · `quick-links` · `overlay` · `status-bar` · `system`

##### 2.3 命名细则（5 条）

| 规则 | 内容 | 示例 |
|---|---|---|
| R1 动作语义 | 请求-响应（invoke/handle）与 R→M 命令用**动词原形**开头 | `baize:window:minimize`、`baize:config:read` |
| R2 事件语义 | 主进程→渲染层推送/结果事件用**过去式或结果后缀**（`-updated`/`-changed`/`-reloaded`/`-result`） | `baize:theme:updated`、`baize:setting:auto-save-changed` |
| R3 单数实体 | 实体一律单数，冗余词删除（`file-manager-context-menu-` → `fs:`） | `file-manager-context-menu-rename` → `baize:fs:rename` |
| R4 拼写与语义 | 修正 `model`→`mode` 等拼写；名称须与用途一致 | `markdown-edit-model` → `baize:view:edit-mode` |
| R5 常量命名不变 | **不改 `IPC.<GROUP>.<KEY>` 常量名与分组**（改动 1341 个调用点不经济）；仅统一通道字符串值，并用测试锁定格式 | `IPC.WINDOW.MINIMIZE` 值改为 `baize:window:minimize` |

> 可选增强：在 `ipc-channels.ts` 增加 `CHANNEL_DOMAINS` 常量与通道方向元数据（`CHANNEL_META`），供测试与矩阵自动生成使用；不影响调用点。

##### 2.4 格式校验正则

```regex
^baize:[a-z][a-z-]*:[a-z][a-z0-9-]*$
```

并断言 domain ∈ 18 个白名单。建议新增 `tests/unit/ipc-channel-naming.test.ts` 固化。

#### 三、完整通道清单（123 个）

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

#### 四、迁移方案（成本极低）

##### 4.1 关键前提（已核实）

- 通道引用 100% 走常量：`src/main`、`src/preload`、`src/renderer` 均 `IPC.*` 引用；**HTML 对话框内联脚本通过模板插值注入常量**（如 `ipcRenderer.send('${IPC.EDITOR.DIALOG_SETTING_APPLY}', …)`）；preload 对话框 send 白名单也引用常量；
- 因此**无需逐个改调用点**，只改常量值即可全局生效。

##### 4.2 改动清单

| # | 文件/对象 | 改动 | 说明 |
|---|---|---|---|
| 1 | `src/shared/ipc-channels.ts` | 123 个字符串值替换为建议值 | 唯一真源，风险集中一处 |
| 2 | `tests/unit/ipc-channel-constants.test.ts` 等 | 若有硬编码旧值断言则同步 | 预计少量 |
| 3 | `tests/unit/ipc-channel-naming.test.ts`（新增） | 格式正则 + domain 白名单 + 唯一性 | 防回归 |
| 4 | `../../md|html/2026-11-15-IPC通信矩阵.md/html` | 重生成（脚本或人工） | 报告同步 |
| 5 | `out/tool-results/ipc-channel-rename-map.json` | 作为执行依据 | 已生成 |

##### 4.3 与死通道清理合并执行（推荐）

建议把本方案并入 [13-IPC通信问题修复计划](IPC通信治理报告.md) 的**批次 3（清理）**一起执行：

1. 先删除 16 个死通道（常量 + 收发端 + 测试）；
2. 对剩余 107 个通道一次性套用新命名（改常量值）；
3. 重生成通信矩阵，更新检查报告中的通道名；
4. 跑门禁 + 新增命名测试。

预期收益：通道数 123 → 107，命名 100% 符合 `baize:<domain>:<name>`，报告/日志/排障 grep 一致。

##### 4.4 不建议的做法

- ❌ **保留旧值别名**：内部闭环应用无外部消费者，别名会增加"双轨"认知负担（与 CMP-30 双轨问题同类）；
- ❌ **逐个调用点改名**：徒增风险，且失去常量真源的意义；
- ❌ **在通道名中加入方向后缀**（如 `:req`/`:evt`）：徒增噪音，方向由调用位置与矩阵文档区分，测试可校验两端模式一致性（见修复计划回归测试建设）。

#### 五、验证方案

| 验证 | 方法 | 通过标准 |
|---|---|---|
| 格式 | 新增命名测试 | 100% 匹配 `^baize:[a-z][a-z-]*:[a-z][a-z0-9-]*$` 且 domain 白名单 |
| 唯一性 | 现有 `ipc-channel-constants.test.ts` | 无重复值 |
| 无字面量绕过 | 现有测试 | src 内无通道字符串直接调用 |
| 旧值零残留 | `grep` 旧通道值（src/tests） | 0 命中 |
| 功能回归 | typecheck + npm test + eslint + build | 全部通过 |
| 报告一致 | 重生成通信矩阵 | 与常量文件一致 |

#### 六、风险与决策点

| 项 | 说明 | 建议 |
|---|---|---|
| 常量名是否同步改为英文域名（如 `FILE_MANAGER`→`FS`） | 需改 1341 处调用点，收益低 | **不改**，仅统一字符串值 |
| 是否本轮同时删除死通道 | 与命名改动叠加在同一文件 | 推荐合并（批次 3），一次验证 |
| 历史报告中的旧通道名 | 已发布报告属历史存档 | 保留历史，仅更新"当前状态"版矩阵/报告 |
| 与主进程 HTML 对话框的耦合 | 已确认常量注入 | 无额外风险 |

#### 七、结论与下一步

1. **通道清单**：见第三节 123 行明细（最新版以 `out\tool-results\ipc-channel-rename-map.json` 为准）；
2. **建议方案**：`baize:<domain>:<name>` 三段式 + 18 个 domain 白名单 + 5 条命名细则；
3. **实施路径**：并入 13 号修复计划批次 3（先删 16 死通道 → 改名 → 重生成矩阵 → 新增命名测试 → 门禁）；
4. 若需立即执行命名统一（不等待其余 IPC 修复），可单列"批次 0"，预计 1 个子智能体一轮完成 + 验证。

#### 八、执行状态（2026-11-15 已完成）

- ✅ **通道值统一**：`src/shared/ipc-channels.ts` 123 个通道全部改为 `baize:<domain>:<name>`（旧值零残留）；
- ✅ **测试用例更新**：46 个测试文件共 216 处硬编码旧通道名同步为新值（`keydown` 歧义单独处理），全部通过；
- ✅ **顺带收口**：`src/renderer/src/common/templates.ts` 的通道字面量副本改为引用 `IPC` 常量（通信检查报告 P3-2 / ARC-03 收口）；
- ✅ **新增防回归测试**：`tests/unit/ipc-channel-naming.test.ts`（格式正则/domain 白名单/唯一性/历史前缀 6 用例）；
- ✅ **文档同步**：IPC 通信矩阵与通信检查报告的通道名已更新，并加统一说明注记；
- ✅ **门禁**：typecheck 双绿 · 测试 **116 文件 / 1849 用例**全过 · ESLint 0 error · electron-vite build 通过。

> 说明：死通道（16 个）本轮仅统一命名、未删除（删除属 [13-IPC通信问题修复计划](IPC通信治理报告.md) 批次 3 范围）。
