# 白泽笔记 - LLM Wiki 集成实施计划（完整版）

> 更新于 2026-11-28｜适用版本基线：v1.5.7（开发中，LLM Wiki 为 1.5.7 主要功能）｜文档类型：实施计划

## 0. 实施状态（2026-11-28 更新）

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| L1 工作区模板 + `raw/` 只读 | ✅ 完成 | 初始化命令、索引/搜索忽略 raw、写入守卫（14 类入口）、设置页工作区模式、切换确认 |
| L2 MCP 桥 | ✅ 完成（HTTP 传输） | 仅 127.0.0.1 + Bearer token、默认关闭、7 个只读工具 + Path Guard；**stdio 因 GUI 场景需独立 CLI，留待后续批次** |
| L3 内置 AI 工作流 | ✅ 完成 | AI Provider（本地 Ollama/LM Studio + 远程 BYOK，safeStorage 加密）、ingest → 行级 diff → 审批写入 wiki/ |
| L4 图谱与嵌入 | ✅ 完成 | 关系图谱（SVG 自绘、200 节点上限）、raw 资料嵌入（相对 Markdown 链接） |
| L5 AI 输入界面 + 布局重构 | ✅ 完成 | LLM Wiki 模式：编辑区「编辑器/预览」切换 + 右侧 AI 面板（已联调 AI.CHAT）；传统模式零变化 |
| 辅助任务 | ✅ 完成 | 文档口径/链接/类型/单测门禁全绿；新增帮助文档「LLM Wiki 工作模式」章节 |

**后续增强（非本期阻塞）**：MCP stdio CLI、AI 流式输出、AI 面板结果直接应用、真实 MCP 客户端联调、启动时序缓存、大规模图谱性能。

## 1. 背景与目标

**LLM Wiki 模式**（Karpathy 2026 年 4 月提出）是一种知识管理新范式：把原始资料存放于 `raw/` 目录并不可变 → LLM 持续将资料“编译”成可被人类与 AI 共同消费的结构化知识库（`wiki/` + `schema.md` + `CLAUDE.md`）。其核心价值是**“编译态知识”**而非“原始资料”的散乱堆积。

**白泽笔记当前定位**：
- Typora 的写作手感 + Obsidian 的知识网络 + 中文内容生产 + 本地优先 AI/隐私。
- 已有 B1（Wiki 双链/反链）、B2（标签/部分全文索引）、B3（关系图谱）、B5（附件管理）、D1~D8（编辑器能力补全）等基础能力。
- IPC 通道 108 个 / 18 组、preload 白名单 send/invoke 74 + on/once 28 + `window.api` 6、工作区索引缓存 TTL 5s、`FILE.GET_WORKSPACE_INDEX` 为当前知识库基座。

**集成目标**：
- 不复制 LLM Wiki 桌面应用的全部 UI（图谱/聊天/审阅），而是做它的**编辑、审阅、检索、管理工作台**。
- 用 Markdown 文件 + MCP 对接，比把 LLM Wiki 整个塞进白泽更合理。
- 0~3 个月完成 L1（工作区模板 + `raw/` 只读 + 只读 MCP Server）+ L2（MCP 只读接口），后续按 AI MVP/B3/E5 独立推进。
- **1.5.7（2026-11-28 用户确认）**：LLM Wiki 为 **1.5.7 主要功能**，范围升级为**全量**（L1 工作区模式 + L2 MCP 桥 + L3 内置 AI 工作流 + L4 图谱与嵌入 + **L5 AI 输入界面与编辑区布局重构**），按阶段分批次交付（P0 先行）；AI 能力同时支持**本地模型**与**远程 API**。

---

## 2. 阶段划分与总览

| 阶段 | 任务数 | 预计工期 | 优先级 | 产出 |
|------|--------|---------|--------|------|
| L0 直接打开 | 0 | 0 | 无 | 无需改动 |
| L1 工作区模板 + `raw/` 只读 | 9 | 1~2 周 | P0 | 工作区模板、`raw/` 只读 |
| L2 MCP 桥 | 5 | 1 周 | P0 | 7 个只读 MCP 工具（传输默认 stdio，HTTP 可选） |
| L3 内置 AI 工作流 | 5 | 2~3 周 | P1 | AI ingest + diff 审批 |
| L4 图谱与嵌入 | 3 | 3~4 周 | P1 | 图谱 UI、嵌入 UI |
| 辅助任务 | 4 | 并行 | P0 | 文档、类型检查、单测 |
| L5 LLM Wiki 工作台（AI 输入界面 + 编辑区布局重构） | 5 | 2~3 周 | P0 | AI 输入面板、编辑区编辑器/预览切换 |

---

## 3. 阶段一：L1 工作区模板 + `raw/` 只读（P0，1~2 周）

### 3.1 任务 T1.1：创建 LLM Wiki 初始化命令

**涉及文件**：
- `src/shared/ipc-channels.ts`
- `src/main/ipc/file-editor-ipc.ts`
- `src/renderer/src/components/MenuBar/menu-actions.ts`
- `src/renderer/src/components/search/command-registry.ts`
- `src/shared/i18n/messages/zh-CN/menu.ts`
- `src/shared/i18n/messages/en-US/menu.ts`

**变更内容**：

1. **新增 IPC 通道常量**（`src/shared/ipc-channels.ts`）：
   ```typescript
   FILE: {
     // ... 现有通道
     INITIALIZE_LLM_WIKI: 'baize:file:initialize-llm-wiki'
   }
   ```

2. **新增 handler**（`src/main/ipc/file-editor-ipc.ts`）：
   - 在 `registerFileEditorIpc` 中注册 `INITIALIZE_LLM_WIKI`
   - 实现逻辑：在 `appState.rootPath` 下创建 `raw/` 与 `wiki/` 目录，生成 `schema.md` 模板

3. **菜单动作拦截**（`src/renderer/src/components/MenuBar/menu-actions.ts`）：
   - 拦截 `baize:file:initialize-llm-wiki` 动作
   - 调用 handler，成功后弹出成功提示

4. **命令面板注册**（`src/renderer/src/components/search/command-registry.ts`）：
   - 新增命令 `id: 'initialize-llm-wiki'`、`menuAction: 'baize:file:initialize-llm-wiki'`、`keywords: ['llm', 'wiki', 'raw', '初始化']`

5. **i18n 键补充**（`zh-CN/menu.ts` 与 `en-US/menu.ts`）：
   - 新增 `initializeLlmWiki` 键
   - 中文：`初始化 LLM Wiki`；英文：`Initialize LLM Wiki`

---

### 3.2 任务 T1.2：索引服务忽略 `raw/` 目录

**涉及文件**：
- `src/main/utils/workspace-index.ts`
- `src/main/utils/workspace-search.ts`

**变更内容**：

1. **扩展忽略目录规则**（`workspace-index.ts`）：
   ```typescript
   export const WORKSPACE_INDEX_IGNORED_DIRS: ReadonlySet<string> = new Set([
     'node_modules', '.git', '.svn', '.hg', '.bzr', '.idea', '.vscode',
     'raw'  // 新增
   ])
   ```

2. **扩展忽略目录规则**（`workspace-search.ts`）：
   ```typescript
   export const WORKSPACE_SEARCH_IGNORED_DIRS: ReadonlySet<string> = new Set([
     'node_modules', '.git', '.svn', '.hg', '.bzr', '.idea', '.vscode',
     'raw'  // 新增
   ])
   ```

**验收标准**：执行 `FILE.GET_WORKSPACE_INDEX` 与全工作区搜索后，结果不包含 `raw/` 下的文件。

---

### 3.3 任务 T1.3：新增 `assertWorkspaceWritable` 写入守卫

**涉及文件**：
- `src/main/utils/security.ts`

**变更内容**：
- 新增函数 `assertWorkspaceWritable(rootPath: string): void`
- 在所有文件写入路径前置调用（包括 `file-operations.ts`、`attachment-manager.ts`、`wiki-link-rename.ts` 等）
- 若检测到 `raw` 子目录，抛 `PathAccessDeniedError`

**前置依赖**：T1.1 完成后，才能在写盘路径中调用此函数。

**验收标准**：在写入任何文件前调用，若 `raw/` 存在，应抛错并提示“raw 目录只读”。

---

### 3.4 任务 T1.4：设置页“工作区模式”选项

**涉及文件**：
- `src/renderer/src/components/dialogs/complex/system-setting/FeaturesPanel.vue`
- `src/main/config/config-schema.ts`

**变更内容**：

1. **新增配置字段**（`src/main/config/config-schema.ts`）：
   ```typescript
   export const ALLOWED_CONFIG_NAMES: ReadonlySet<string> = new Set([
     // ... 现有
     'workspaceMode'  // 新增
   ])

   export function validateConfigData(configName: string, data: unknown): ConfigValidationResult {
     // 验证 workspaceMode 是否为 'traditional' | 'llm-wiki'
   }
   ```

2. **UI 实现**（`FeaturesPanel.vue`）：
   - 在“功能设置”页签新增 `workspaceMode` 下拉框
   - 选项：`traditional`（默认）、`llm-wiki`
   - 在 `handleUpdate` 中监听变化

---

### 3.5 任务 T1.5：模式切换确认对话框

**涉及文件**：
- `src/renderer/src/components/dialogs/complex/system-setting/FeaturesPanel.vue`
- `src/renderer/src/components/dialogs/BaseDialog.vue`（可选复用）

**变更内容**：
- 在 `FeaturesPanel.vue` 中监听 `workspaceMode` 变化
- 若从 `traditional` → `llm-wiki`，弹出 `BaseDialog` 确认对话框
- 对话框内容：“切换到 LLM Wiki 模式会创建 `raw/` 与 `wiki/` 目录，并开启只读模式。是否继续？”
- 按钮：“取消”、“确认初始化”

**验收标准**：切换到 `llm-wiki` 模式时，必须先弹出对话框，用户点击“确认”后才会执行初始化。

---

### 3.6 任务 T1.6：文档更新

**涉及文件**：
- `docs/wiki/02-设计与架构/LLM-Wiki-Integration-Design.md`
- `docs/wiki/README.md`

**变更内容**：
- 在“背景与目标”章节增加“初始化时机”说明
- 在“文档维护约定”中说明新增文档路径
- 更新文档计数与链接检查

---

## 4. 阶段二：L2 MCP 桥（P0，1 周）

### 4.1 任务 T2.1：新增 MCP IPC 通道常量

**涉及文件**：
- `src/shared/ipc-channels.ts`

**变更内容**：
```typescript
MCP: {
  SEARCH_NOTES: 'baize:mcp:search-notes',
  READ_NOTE: 'baize:mcp:read-note',
  LIST_TAGS: 'baize:mcp:list-tags',
  GET_BACKLINKS: 'baize:mcp:get-backlinks'
}
```

---

### 4.2 任务 T2.2：实现 MCP 只读 handlers

**涉及文件**：
- `src/main/ipc/mcp-ipc.ts`（新建）

**变更内容**：
- 实现 `searchNotes` handler：调用 `searchWorkspace`，过滤 `layer: 'wiki'`
- 实现 `readNote` handler：从索引快照中返回 file
- 实现 `listTags` handler：返回 tags
- 实现 `getBacklinks` handler：调用 `useWorkspaceIndex().findBacklinks()`

**验收标准**：MCP 通道返回结构符合 `WorkspaceIndexSnapshot` 与 `WorkspaceIndexBacklink` 类型。

---

### 4.3 任务 T2.3：注册 MCP IPC

**涉及文件**：
- `src/main/ipc/registry.ts`

**变更内容**：
```typescript
import { registerMcpIpc } from './mcp-ipc'
// 在 registerAll 中调用 registerMcpIpc(mainWindow, 'global-mcp-ipc')
```

---

### 4.4 任务 T2.4：主进程 MCP Server 初始化

**涉及文件**：
- `src/main/utils/mcp.ts`（新建）

**变更内容**：
- 使用 `@modelcontextprotocol/sdk` 或轻量级 HTTP wrapper
- 实现 MCP Server，暴露 4 个 tool
- 经 `contextBridge` 暴露 `baizeMcp` 给渲染层与外部 Agent

**验收标准**：外部 Agent 调用 `baizeMcp.search_notes` 能返回结果。

---

### 4.5 任务 T2.5：MCP 通道安全校验

**涉及文件**：
- `src/main/utils/ipc-security.ts`

**变更内容**：
- 在 `withSenderCheck` 中增加 MCP 域的 scope 检查
- 确保只有主窗口可调用

**验收标准**：渲染层（非主窗口）调用 MCP 通道应返回 `UNTRUSTED_SENDER_RESULT`。

---

### 4.6 传输方式与工具清单（1.5.7 更新，2026-11-28）

#### 4.6.1 传输方式对比与选型

| 方式 | 原理 | 优点 | 缺点/代价 | 结论 |
| --- | --- | --- | --- | --- |
| **stdio** | 客户端将白泽作为本地子进程启动，经 stdin/stdout 交换 JSON-RPC | 零端口、进程隔离、最安全、无需鉴权 | 单客户端；客户端需能拉起进程 | **默认**（本地 Agent：Claude Code / DSH / Cursor 等） |
| **Streamable HTTP**（MCP 2025-03） | 主进程监听 HTTP，POST + SSE 流式响应 | 多客户端、可远程、跨应用 | 需端口与鉴权（token）、暴露面/CSP/防火墙评估 | **可选**：默认关闭，仅绑定 127.0.0.1 + 随机 token + 只读工具 |
| **SSE**（旧 2024-11） | HTTP GET SSE 通道 | 兼容旧客户端 | 已被 Streamable HTTP 取代 | **不单独实现**（如需兼容旧客户端后续加兼容层） |

**安全边界**：MCP Server 默认关闭；开启需用户在设置页显式启用；只读工具默认可用、L3 写工具默认关闭且必须经 UI 审批；不接受任意绝对路径，只接受 workspace 相对路径并走 Path Guard。

#### 4.6.2 工具清单（L2 只读：4 → 7 个；L3 写工具 2 个默认关闭）

| 工具 | 说明 | 备注 |
| --- | --- | --- |
| `search_wiki` | wiki 全文/标签检索（支持分页 limit） | 替代窄口径 `search_notes` |
| `read_page` | 读取 wiki 页面（markdown + front matter） | 仅 `wiki/` 内相对路径 |
| `list_pages` | wiki 目录/页面树（分页） | Agent 探索入口 |
| `read_schema` | 读取 `schema.md` 与编译约定 | LLM Wiki 核心（AI 生成依据） |
| `list_tags` | 标签列表与计数 | — |
| `get_backlinks` | 双链/反链查询 | — |
| `read_raw` | 读取 `raw/` 原始资料（只读） | 可选；权限与当前用户一致 |
| `ingest_raw`（L3，默认关闭） | 触发 raw → wiki 草案生成 | 需 UI diff 审批后才写入 |
| `apply_ingest`（L3，默认关闭） | 应用已审批的 wiki 变更 | 审批门禁；不可绕过 |

#### 4.6.3 实现建议修正（相对 §4.4）

- **MCP Server 由主进程直接调用** `workspace-index` / `workspace-search` 服务，**不经渲染层 IPC**；`contextBridge` 仅用于渲染层展示 MCP 状态/开关，不作为 Agent 入口（避免安全与架构反模式）。
- 原 `MCP.*` IPC 通道保留供**渲染层 UI 查询与审计日志**（sender 校验 + 只读 scope），与 MCP Server 自身解耦。
- 依赖：优先使用 `@modelcontextprotocol/sdk`（主进程依赖），新增依赖需通过依赖审计与 allowlist 流程。

---

## 5. 阶段三：L3 内置 AI 工作流（P1，2~3 周）

### 5.1 任务 T3.1：新增 AI ingest 通道

**涉及文件**：
- `src/shared/ipc-channels.ts`

**变更内容**：
```typescript
AI: {
  // ... 现有通道
  INGEST: 'baize:ai:ingest'
}
```

---

### 5.2 任务 T3.2：实现 AI ingest handler

**涉及文件**：
- `src/main/ipc/ai-ipc.ts`（新建）

**变更内容**：
- 调用 AI Provider（本地 Ollama/LM Studio + BYOK）
- 扫描 `raw/`，提取 front matter/标签/摘要
- 生成 `wiki/` 页面
- 调用 `baize:file:initialize-llm-wiki` 写入

**前置依赖**：AI MVP 基线已实现，Provider 可用。

**验收标准**：AI ingest 命令成功后，`wiki/` 目录下生成 Markdown 页面。

---

### 5.2.1 AI Provider：本地 + 远程双支持（1.5.7 更新，2026-11-28）

**目标**：L3 的 AI ingest 与 L5 的 AI 输入界面都必须同时支持**本地模型**与**远程 API**。

- **本地模型**：Ollama（默认 `http://127.0.0.1:11434`）、LM Studio（本地 HTTP）——隐私友好、离线可用，默认优先。
- **远程 API**：BYOK（OpenAI 兼容接口，如 DeepSeek 等），密钥经**安全存储**（不明文落配置），启用前需用户显式确认并展示隐私提示（数据将发送到所配置的服务）。
- **抽象**：新增 `AIProvider` 接口（chat / stream，embed 可选）；设置页选择 Provider 与模型；请求统一走主进程（渲染层不直连，兼容 CSP 与密钥安全），支持超时/重试/取消/流式输出。
- **降级**：本地模型不可用时提示切换远程或启动本地服务；两者均不可用时不阻塞编辑（仅 AI 功能置灰并说明）。
- **依赖**：优先复用现有 HTTP 能力（fetch/undici）；新增依赖需审计。

---

### 5.3 任务 T3.3：AI ingest diff 审批 UI

**涉及文件**：
- `src/renderer/src/components/Markdown/llm-ingest-diff.vue`（新建）

**变更内容**：
- 展示 AI 生成内容的 diff
- 提供“确认”、“回滚”按钮

**验收标准**：用户点击确认后，AI 内容写入 `wiki/`；回滚时恢复旧版本。

---

### 5.4 任务 T3.4：命令面板注册

**涉及文件**：
- `src/renderer/src/components/search/command-registry.ts`

**变更内容**：
```typescript
{
  id: 'llm-ingest',
  labelKey: 'menu.file.ingest',
  categoryKey: 'editorUi.commandPalette.category.file',
  menuAction: 'baize:ai:ingest',
  keywords: ['ingest', 'ai', '编译']
}
```

---

### 5.5 任务 T3.5：i18n 键补充

**涉及文件**：
- `src/shared/i18n/messages/zh-CN/menu.ts`
- `src/shared/i18n/messages/en-US/menu.ts`

**变更内容**：
```typescript
// zh-CN/menu.ts
ingest: 'AI 编译'

// en-US/menu.ts
ingest: 'AI Compile'
```

---

## 6. 阶段四：B3 图谱与 E4 嵌入（P1，3~4 周）

### 6.1 任务 T4.1：图谱 UI 实现

**涉及文件**：
- `src/renderer/src/components/Graph/GraphDialog.vue`（新建）
- `src/main/utils/graph.ts`（新建，如需）

**变更内容**：
- 调用 B3 关系图谱数据
- 展示节点/边
- 点击节点可跳转文件

**前置依赖**：B3 关系图谱数据已实现。

**验收标准**：点击节点可跳转文件，点击边显示关系。

---

### 6.2 任务 T4.2：嵌入 UI 实现

**涉及文件**：
- `src/renderer/src/components/Markdown/embed/EmbedDialog.vue`（新建）

**变更内容**：
- 支持在 `wiki/` 中嵌入 `raw/` 资料链接

**验收标准**：嵌入框能显示 `raw/` 中的文件预览。

---

### 6.3 任务 T4.3：文档更新（✅ 已完成，帮助文档新增 LLM Wiki 章节）

**涉及文件**：
- `docs/wiki/02-设计与架构/LLM-Wiki-Integration-Design.md`

**变更内容**：
- 在“下一步行动”中记录 B3/E5 进度

---

## 7. 辅助任务（贯穿所有阶段）

### 7.1 任务 T0.1：文档口径校验

**涉及文件**：
- `docs/reports/README.md`
- `docs/wiki/README.md`

**变更内容**：
- 更新文档计数为 34 页（1 首页 + 33 报告）

**验收标准**：`npm run docs:check` 通过。

---

### 7.2 任务 T0.2：链接检查

**涉及文件**：
- `docs/wiki/README.md`
- `docs/wiki/02-设计与架构/LLM-Wiki-Integration-Design.md`

**变更内容**：
- 补齐所有相对链接

**验收标准**：`npm run docs:check` 通过。

---

### 7.3 任务 T0.3：类型检查与单测

**涉及文件**：
- 所有新增/修改的文件

**变更内容**：
- 确保新增类型、handler、工具函数有对应测试

**验收标准**：`npm run typecheck` 通过，新增单测通过。

---

## 8. 实施过程（按阶段）

### 阶段一：L1 工作区模板 + `raw/` 只读（1~2 周）

1. **T1.1**（1 天）：创建 `INITIALIZE_LLM_WIKI` 通道常量、handler、菜单动作、命令面板注册、i18n 键。
2. **T1.2**（0.5 天）：修改索引与搜索服务，忽略 `raw/` 目录。
3. **T1.3**（1 天）：新增 `assertWorkspaceWritable` 写入守卫，在所有写盘路径前置调用。
4. **T1.4**（1 天）：在 `config-schema.ts` 中新增 `workspaceMode` 字段，在设置页添加下拉框。
5. **T1.5**（0.5 天）：在设置页切换时弹出确认对话框。
6. **T1.6**（0.5 天）：更新文档，补充 i18n 与测试。

### 阶段二：L2 MCP 桥（1 周）

1. **T2.1**（0.5 天）：新增 MCP 通道常量。
2. **T2.2**（3 天）：实现 7 个 MCP 只读 handlers（工具清单见 §4.6.2）。
3. **T2.3**（0.5 天）：注册 MCP IPC。
4. **T2.4**（2 天）：实现 MCP Server 与 `contextBridge` 暴露。
5. **T2.5**（1 天）：增加 MCP 域的 scope 检查。

### 阶段三：L3 内置 AI 工作流（2~3 周）

1. **T3.1**（0.5 天）：新增 `AI.INGEST` 通道常量。
2. **T3.2**（5 天）：实现 AI ingest handler，调用 AI Provider，生成 `wiki/` 页面。
3. **T3.3**（3 天）：实现 AI ingest diff 审批 UI。
4. **T3.4**（0.5 天）：命令面板注册。
5. **T3.5**（0.5 天）：补充 i18n 键。

### 阶段四：B3 图谱与 E4 嵌入（3~4 周）

1. **T4.1**（5 天）：实现图谱 UI。
2. **T4.2**（3 天）：实现嵌入 UI。
3. **T4.3**（1 天）：更新文档。

### 阶段五：LLM Wiki 工作台（AI 输入界面 + 编辑区布局重构，2~3 周）

1. **T5.1**（3 天）：工作区布局切换（编辑区编辑器/预览切换 + 右侧 AI 面板区域）。
2. **T5.2**（5 天）：AI 输入面板（对话/指令、模型选择本地/远程、上下文引用、流式输出）。
3. **T5.3**（2 天）：生成结果 diff 预览与应用（复用 L3 diff 审批）。
4. **T5.4**（2 天）：设置项、模型配置与 i18n。
5. **T5.5**（1 天）：帮助文档与 E2E 规格。

---

## 9. 风险与依赖

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| `raw/` 只读导致用户困惑 | 高 | 初始化文档说明；设置页提示 |
| MCP Server 调试成本高 | 中 | 提供 PoC，外部 Agent 验证 |
| AI ingest 性能问题 | 中 | 先做小规模 `raw/` 测试，设置批量阈值 |
| 图谱 UI 不够好，重复造轮子 | 中 | 图谱与知识库查询对话框分离，图谱按 B3 独立推进 |
| AI 输入界面/布局重构复杂度高 | 中 | 复用 MarkdownPreview/diff 审批组件；布局做成可切换开关（经典并排 / LLM Wiki 工作台） |
| 本地模型性能/资源占用 | 中 | 默认小模型 + 流式输出 + 可取消；提供连接测试与超时降级 |
| 远程 API 隐私与密钥安全 | 高 | 主进程统一代理请求、密钥安全存储、显式启用 + 隐私提示、可一键清除 |
| MCP 暴露面（HTTP 传输） | 中 | 默认 stdio；HTTP 默认关闭、仅 127.0.0.1 + token + 只读工具；审计日志 |

---

## 10. 附录

### 10.1 参考文档

- 《LLM Wiki 集成设计方案》（同一目录下）
- 《业界对标与改进建议报告》
- 《Markdown 编辑器能力补全选项报告》
- 《B2 全文索引风险与实施方案》
- 《Monaco 与 WYSIWYG 双编辑器技术评估报告》

### 10.2 前置基线

| 基线项 | 版本/基线 | 说明 |
|--------|----------|------|
| 白泽笔记版本 | v1.5.7 | 开发中（LLM Wiki 为 1.5.7 主要功能；1.5.6 已发布） |
| IPC 通道 | 108 个 / 18 组 | 白名单 send 74 + on/once 28 + `window.api` 6 |
| preload 白名单 | 74+28+6 | 工作区索引缓存 TTL 5s |
| 测试覆盖率 | 93.03% statements / 87.56% branches | 375 测试文件 / 7,041 用例（含 5 skipped） |
| 文档计数 | 34 篇 md / 35 页 HTML | 01 类 13 / 02 类 10 / 03 类 11 |

### 10.3 联系方式

- ## 12. 阶段五：LLM Wiki 工作台（AI 输入界面 + 编辑区布局重构）

> 1.5.7 追加（2026-11-28 用户确认）。目标：LLM Wiki 模式下提供 **AI 输入界面**，并把**编辑器与预览统一到编辑区域**，右侧区域交给 AI 输入。

### 12.1 布局设计（LLM Wiki 模式下）

- **传统模式**：布局不变（左编辑区 + 右预览区并排）。
- **LLM Wiki 模式**：
  - **左侧编辑区域**：内部提供「**编辑器 / 预览**」切换（分段控件或 Tab）——编辑与预览统一在编辑区，不再常驻并排；
  - **右侧区域**：**AI 输入界面**（对话/指令输入、模型选择、上下文引用、发送/停止、结果应用）；
  - 布局由 `workspaceMode === 'llm-wiki'` 驱动；设置页可切换「LLM Wiki 工作台布局」/「经典并排布局」；
  - 四风格 × 三密度适配（`--ui-*` 令牌）；窄窗口下 AI 面板可折叠为抽屉/侧边条。
- **验收**：两种布局切换正常；编辑/预览切换保留光标与滚动位置；写作模式、NaviTab、面板拖拽、命令面板等既有行为不回归。

### 12.2 任务

| 任务 | 内容 | 验收标准 |
| --- | --- | --- |
| T5.1 | 工作区布局切换：编辑区「编辑器/预览」切换（复用 Monaco 与 MarkdownPreview）+ 右侧 AI 面板区域；布局状态持久化 | 两种模式布局切换正常；切换后光标/滚动位置保留；既有工作区功能不回归 |
| T5.2 | **AI 输入面板**（`llm-ai-panel.vue`）：对话/指令输入、模型选择（本地 Ollama/LM Studio；远程 BYOK）、上下文引用（当前文档/选区/wiki 页面/raw 资料）、发送/停止/清空、流式输出 | 本地与远程模型均可对话；上下文引用准确；流式输出与取消可用 |
| T5.3 | 结果应用：生成结果 diff 预览 + 确认应用到编辑器；raw→wiki ingest 入口（复用 L3 diff 审批） | 应用/回滚正确；`raw/` 只读边界不破；wiki 写入经审批 |
| T5.4 | 设置项 + i18n：工作区模式/布局开关、AI Provider 配置（本地/远程、密钥安全存储、连接测试）、隐私提示 | 配置持久化；远程启用需显式确认；i18n 中英对称 |
| T5.5 | 帮助文档 + E2E：LLM Wiki 模式使用指南（布局/AI 面板/审批流程）；新增 E2E 规格 | docs:check 与 E2E 通过 |

### 12.3 与既有能力的关系

- **复用**：MarkdownPreview 组件、写作模式排版、L3 diff 审批组件、AI Provider（L3 抽象）、BaseDialog/工具窗令牌。
- **不改变**：传统模式的编辑+预览并排行为、Monaco 主题、四风格/三密度。
- **约束**：不新增整窗模糊/CSP 例外；AI 请求走主进程；不新增未审计依赖。

### 12.4 工期与优先级

- 预估 **2~3 周**，优先级 P0（AI 面板可与 L3 并行开发）。
- 1.5.7 内按批次交付：L1 → L2 → L3/L5（AI 相关）→ L4（图谱/嵌入）。

---

**维护者**：hemy08
- **最后核对**：2026-11-28
- **文档类型**：实施计划（完整版）

---

## 11. 变更清单汇总

| 阶段 | 文件数量 | 主要改动 |
|------|---------|---------|
| L1 | 7 | 新增 IPC 通道、handler、菜单动作、命令面板、i18n 键、索引服务、安全守卫、设置页 UI |
| L2 | 3 | 新增 MCP IPC 通道、handler、MCP Server |
| L3 | 3 | 新增 AI ingest 通道、handler、diff 审批 UI |
| L4 | 2 | 新增图谱 UI、嵌入 UI |
| L5 | 5 | 工作区布局切换、AI 输入面板、生成结果应用、设置项、帮助文档与 E2E |
| 辅助 | 4 | 文档口径校验、链接检查、类型检查、单测 |

---

**维护者**：hemy08｜**最后核对**：2026-11-28｜**文档类型**：实施计划（完整版）