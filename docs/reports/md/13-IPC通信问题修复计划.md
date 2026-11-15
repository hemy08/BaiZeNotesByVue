# IPC 通信问题修复计划

- **制定日期**：2026-11-15
- **依据**：[2026-11-15-通信检查报告](2026-11-15-通信检查报告.md)（32 项问题：P0×2、P1×5、P2×19、P3×6）与 [IPC 通信矩阵](2026-11-15-IPC通信矩阵.md)
- **现状**：检查结论「通信骨架健康，接线存在 32 处问题」；已复核关键项（自动保存模式不匹配、online-web-page 无导航拦截、主进程引用渲染层 window、菜单 action id 错位均属实）
- **执行方式**：按 4 个阶段拆分为 7 个子智能体任务（并行 2 → 3 → 1 → 1），最后统一复核
- **目标**：32 项闭环；通道数 123 → 约 107（死通道清理后）；全部门禁通过

## 1. 修复原则与验收标准

- **原则**：安全/功能问题优先；行为变化最小化（不改线上通道字符串语义）；每项修复配回归测试；删除类改动先 grep 确认双端零引用。
- **全局验收**：
  - typecheck 双绿、`npm run test` 全过、`npx eslint . --quiet` 0 error、`npx electron-vite build` 通过；
  - 新增防回归测试：①通道两端模式一致性（send↔on / invoke↔handle）；②死通道零存在（常量与调用点双向核对）；③preload 暴露面与白名单覆盖；
  - 复核方式：按通信矩阵逐通道重扫，输出"修复后矩阵"与检查报告状态标注。

## 2. 阶段划分与代理分工

| 阶段 | 子代理 | 负责问题 | 主要文件 | 依赖 |
|---|---|---|---|---|
| 阶段 1 安全与功能（并行） | A1 `ipc-sec` | C-08 远程页边界、P3-5 相关协议白名单 | OpenOnlineWebPages.ts、utils.ts、dialog-defaults.ts、相关测试 | 无 |
| | A2 `ipc-autosave` | P0-2.2 自动保存通道模式、双实现统一 | SystemSettingDialog.vue、handlers.ts、ShowSystemSettingDialog.ts | 无 |
| 阶段 2 一致性（并行） | B1 `ipc-listeners` | C-03 主题广播异常、C-04 监听台账统一 | main/index.ts、6 个 Show*.ts、theme-config/ShowThemeSettingDialog.ts | 阶段 1 完成（避免 index.ts 冲突） |
| | B2 `ipc-dialogs` | C-01 编辑器设置 HTML 对话框、C-05 双轨去留、C-06 菜单 id | ShowEditorSettingDialog.ts、editor-setting-script.ts、menu-config.ts、menu-actions.ts、dialogs 清单 | 阶段 1 完成 |
| | B3 `ipc-preload` | C-02 removeListener 语义、白名单/台账测试补齐 | preload/dialog.ts、tests/unit/preload-*.ts | 阶段 1 完成 |
| 阶段 3 清理（串行，依赖 B1 释放 index.ts） | C1 `ipc-cleanup` | 16 个死通道、C-07 Mermaid 半死链路、广播面收窄、templates.ts 字面量、UPDATE_OPTIONS 空转分支（注：通道命名统一已单独完成，见 [14-IPC通道命名统一方案](14-IPC通道命名统一方案.md)） | index.ts、ipc-channels.ts、OpenMermaidRenderFrame.ts、templates.ts、各发送/监听点 | 阶段 2 完成 |
| 阶段 4 加固（串行） | D1 `ipc-hardening` | C-09 preload 暴露面裁剪、P3 余项复核、C-10 记录 | preload/index.ts、renderer 调用点、文档记录 | 阶段 3 完成 |
| 收尾 | 根代理 + 复核代理 | 重扫矩阵、更新报告、门禁复核 | docs/reports/** | 全部完成 |

## 3. 逐项修复方案

### 3.1 阶段 1：安全与功能（P0）

| 编号 | 问题 | 修复动作 | 验证 | 风险 |
|---|---|---|---|---|
| **C-08** | `online-web-page` 加载远程页且持有 dialog preload，无导航拦截；`shell.openExternal` 无协议白名单 | ① `OpenOnlineWebPages.ts`：`webContents.on('will-navigate', e => e.preventDefault())` + `setWindowOpenHandler(() => ({ action: 'deny' }))`（与 plantuml-local.ts 一致）；② 远程窗口移除 preload（若确需主题广播等能力，改为主进程代发）；③ `OpenOnlineWebPage` 打开浏览器时校验 URL 协议白名单（仅 http/https，必要时加 mailto）；④ 窗口 `webPreferences` 显式 `sandbox:true` | 单测：远程窗口 options 断言（无 preload、sandbox、拦截器注册）；`shell.openExternal` 非法协议拒绝用例；手动冒烟远程页可正常显示、无法跳转 | 低：仅限 windows 打开路径；移除 preload 后需确认远程页无依赖 |
| **P0-2.2** | 自动保存通道：渲染层 send、主进程 handle（仅 invoke 生效）→ 开关静默失效；HTML/Vue 双实现分叉 | ① 渲染层 `SystemSettingDialog.vue::handleAutoSaveChange` 改 `invoke`（或显式 `send` 并主进程补 `ipcMain.on`）；② 推荐统一 `invoke + handle`，保留主进程现有 `registerHandleOnce`；③ 评估移除 HTML 版系统设置对话框（不可达时删除，避免双实现） | 回归测试：模拟渲染端切换开关 → 断言主进程定时器启停（Start/Stop mock 调用）；通道两端模式一致性测试用例 | 低：仅一处调用点 |
| **P3-5（配套）** | `shell.openExternal` 协议校验收口 | 抽公共 `openExternalSafely(url)` 供各调用点复用（含 navi-tab-open-exe 附近已有校验） | 单测：非法协议拒绝、合法放行 | 低 |

### 3.2 阶段 2：一致性（P1）

| 编号 | 问题 | 修复动作 | 验证 |
|---|---|---|---|
| **C-01** | `ShowEditorSettingDialog` 未注入 preload 却用 `window.electronAPI`（对话框已不可达） | 优先**删除**该 HTML 对话框及其脚本/CSS 引用（Vue 版 `EditorSettingDialog.vue` 为实际路径）；若需保留则补 `preload: dialog.js` 并加入 `DIALOG_WEB_PREFERENCES` | 单测更新；grep 确认零引用；菜单/入口确认 |
| **C-03** | `ShowThemeSettingDialog` 主进程回调引用渲染层 `window.electronAPI` | 抽主进程 `broadcastThemeToAllWindows()`（`BrowserWindow.getAllWindows().forEach(w => w.webContents.send(IPC.THEME.THEME_UPDATED, payload))`）替换；删除对 `window.electronAPI` 的引用 | 单测：不再需要 `vi.stubGlobal('window')`；广播调用断言 |
| **C-04** | 6 个对话框 + `main/index.ts` 监听器绕过 `ipcListenerManager` 台账 | 统一迁移至 `ipcListenerManager.registerOnce/registerHandleOnce`：对话框用 `componentId` + 窗口 `closed` 清理；index.ts 两类通道归入全局注册 | 台账测试：`getInventory()` 覆盖全部注册；`cleanupAll` 后无残留 |
| **C-05** | HTML 对话框与 Vue 对话框双轨并存（14 个 HTML 仅 5–6 可达） | 输出「对话框去留清单」：逐项核对菜单/入口可达性，列出保留（补 i18n/接线）与删除（含代码/常量/测试）两类；本轮只执行删除清单内无入口项 | 清单评审 + grep 零引用；删除后 build/test 通过 |
| **C-06** | 菜单 action id 错位（`contact-us` vs `contact`） | 统一为 `baize:menu:help:contact-us`；删除/保留 HTML 版按 C-05 清单决策；补菜单路由单测 | 菜单路由测试：点击映射到预期对话框实现 |
| **C-02** | 对话框 preload `removeListener` 与 `on` 包装函数引用不一致 | `dialog.ts` 的 `on` 存原始包装或维护 `channel→handler` 映射，`removeListener` 可真正退订；补 preload 单测 | 单测：注册→退订→事件不再触发 |

### 3.3 阶段 3：清理（P2）

| 编号 | 内容 | 修复动作 | 验证 |
|---|---|---|---|
| 死通道 ×16 | `window-unmaximize`、`config:delete/list/ensure-dir`、`update-monaco-theme`、`get-current-theme`、`get-separate-editor-theme`、`get-monaco-theme`、`editor-relayout`、`update-editor-font`、`open-plugin-tool`（待菜单树退役）、`keydown`、`monaco-insert-writing-templates`、`mermaid-graph-definition`、`open-url-in-web-browser-window`、`update-mermaid-render-graph` | 逐通道：删除常量 + 发送/监听代码 + 测试断言；`open-plugin-tool` 视菜单树保留状态决定（本轮删除 26 处发送或注明保留策略） | 死通道零存在测试（常量↔调用点双向） |
| **C-07** | Mermaid 隐藏窗链路半死（窗口空转 + 3 通道无消费） | 删除隐藏窗口创建/`OpenMermaidRenderFrame`/`MERMAID_RENDER_RESULT` 等通道；确认渲染层 mermaid npm 包渲染为唯一路径 | build/test；内存冒烟（无隐藏窗口） |
| 广播面收窄 | `FILE_SAVED_SUCCESS`、`QUICK_LINKS.UPDATED` 全窗口广播 | 改为定向发送（记录目标窗口引用）或确认无监听窗口后删除 | 广播目标断言 |
| 4.2 载荷不一致 ×3 | THEME.UPDATED 载荷无 `currentTheme`；INIT_THEME_STYLES 双载荷/空转；TEXT_BLOCK_TEMPLATES 命名不符 | ① 修正 MenuBar 读取或广播补字段（统一 `{themeStyles, monacoTheme, separateEditorTheme}` + 必要字段）；② INIT_THEME_STYLES 统一单一载荷并补齐监听或删除空转分支；③ 重命名通道（保留旧值兼容一次）或加注释标记语义 | 载荷一致性单测 |
| P3-1/P3-2 | UPDATE_OPTIONS 方向混用空转；templates.ts 字面量绕过 | 删除空转分支；templates.ts 改用 `IPC` 常量引用 | 常量唯一性测试 |

### 3.4 阶段 4：加固（P3 余项）

| 编号 | 内容 | 修复动作 |
|---|---|---|
| C-09 | 主窗口暴露全量 `electronAPI`（含任意通道） | 评估裁剪：保留 `ipcRenderer.on/invoke/send` 收窄为白名单 API（与 dialog preload 同模式）；或明确风险接受并记录（本地受信上下文 + DOMPurify 已封 XSS）——本轮输出评估结论与最小化方案，若风险可控则实施白名单 |
| P3-6 | `<webview>` PDF 预览不可用 | 仅记录（不新增通信面）；入口已在 CMP-19 治理中隐藏 |
| 命名复用 | `WRITING_TEMPLATES` 实际走 EventBus | 重命名/标注，避免认知混淆 |

## 4. 回归测试建设（随阶段落地）

| 测试 | 内容 |
|---|---|
| `ipc-channel-modes.test.ts`（新增） | 遍历通道常量：save 类通道断言 send↔on 或 invoke↔handle 两端模式一致 |
| `ipc-dead-channels.test.ts`（新增） | 常量↔调用点双向核对，死通道数为 0（白名单机制除外） |
| `dialog-window-security.test.ts`（新增） | 远程窗口无 preload/导航拦截/协议白名单；对话框 webPreferences 统一来源 |
| 台账测试（扩展） | `ipcListenerManager.getInventory()` 覆盖全部注册；`cleanupAll` 无残留 |
| preload 测试（扩展） | 白名单放行/拒绝、on 事件剥离、removeListener 真实退订 |

## 5. 风险与回滚

- **删除死通道**：先 grep 双端 + 动态拼接检查（`IPC.X[${var}]`），再删代码，最后删常量；单通道独立 commit 便于回滚；
- **C-08 移除远程窗口 preload**：若远程页面依赖主题广播，改主进程代发；不影响本地功能；
- **C-05 删除 HTML 对话框**：仅删除确认无入口的项；保留项不动；
- **C-09 preload 裁剪**：改动面大，先出评估报告，经评审后再实施；未评审前保持现状（现有 DOMPurify + CSP 已降低风险）。

## 6. 排期建议

| 批次 | 内容 | 预估 |
|---|---|---|
| 批次 1 | C-08、P0-2.2、P3-5（2 个并行代理） | 1 轮 |
| 批次 2 | C-01/03/04/05/06、C-02（3 个并行代理） | 1~2 轮 |
| 批次 3 | 16 死通道 + C-07 + 广播面 + 载荷修正（1 个代理） | 1~2 轮 |
| 批次 4 | C-09 评估（1 个代理）+ 余项 | 1 轮 |
| 收尾 | 重扫矩阵 + 报告状态标注 + 门禁 | 1 轮 |

> 执行时每批次完成后由根代理统一跑门禁（typecheck/test/eslint/build），并更新《2026-11-15-通信检查报告》状态列与通信矩阵，最终产出《IPC 通信问题修复实施报告》。

## 八、执行状态（2026-11-15 批次后）

- ✅ **已闭环**：C-08（在线网页窗口去 preload + 导航拦截 + 协议白名单）、P0-2.2（自动保存 invoke/handle）、C-03（主进程统一主题广播）、C-04（ipcMain 直连清零，全部迁移台账）、C-06（菜单 contact id 统一）、N-05（37 个高风险通道 sender 校验）、16 个死通道删除（通道 123→86）、C-07（Mermaid 隐藏窗链路删除）、P3-2（templates.ts 字面量收口）；
- 🟡 **部分处理**：C-05/C-01（不可达 JSDOM 对话框已批量删除，仅余 contact-us 待确认）、广播面收窄（随死通道清理部分完成）、载荷一致性（随通道删除缩减）；
- ⏭ **未处理**：C-09（主窗口 preload 全量 electronAPI 收敛）、C-10（webview PDF）、24 个低风险只读通道 sender 校验、plantuml-local IPC 校验、config-manager 内联广播收口；
- 详见 [16-修复批次实施报告](16-修复批次实施报告.md)。