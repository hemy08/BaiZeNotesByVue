<!-- report-nav:start -->
> 🧭 **报告导航**：[🏠 报告首页](../../README.md) ｜ [01-检查与扫描](../01-检查与扫描/) ｜ [02-修复与实施](../02-修复与实施/) ｜ [03-专项治理](../03-专项治理/) ｜ 当前：**Monaco 与 WYSIWYG 双编辑器技术评估报告**
<!-- report-nav:end -->

# Monaco 与 WYSIWYG 双编辑器技术评估报告

> **性质**：技术可行性评估与方案决策，**不含实现代码**。
> **决策状态**：**暂不实施双编辑器**（用户 2026-11-21 决定）。保留 Monaco 源码模式 + 分栏预览现状；本报告仅作为评估存档，不进入 PoC/实现排期。
> **项目基线**：v1.5.1（开发中；最新发布版本为 v1.5.0，tag `release-1.5.0`）。
> **评估时间**：2026-11-21。
> **结论先行**：**技术可行，但需采用「可插拔编辑器适配层 + 同一时间只挂载一个编辑器」的方案**；不能把 Monaco 与 WYSIWYG 同时显示、同时编辑。经评估当前**暂不实施**，也不在 1.5.1 内替换 Monaco。

## 1. 需求定义

用户期望：

- 增加类似 Typora / Obsidian 的“编辑和预览在一起”模式；
- 不是当前编辑区 + 预览区分栏；
- 现有 Monaco 源码模式保留；
- 两种模式通过配置切换。

需要先区分两个概念：

| 概念 | 实际形态 | 与本项目的关系 |
|---|---|---|
| **真 WYSIWYG**（Typora 类） | 文档模型是富文本树，编辑区直接显示最终排版，Markdown 通常是序列化格式 | 需要引入 ProseMirror/Milkdown/Tiptap 一类富文本编辑器，替换 Monaco 编辑区 |
| **单栏实时预览 / Live Preview**（Obsidian 类） | 文档模型仍是 Markdown 源文本，用 decorations 隐藏标记、渲染样式，光标行显示源码 | 可在 Monaco 上增量实现，风险低，但不是严格意义的 WYSIWYG |
| **单栏编辑/预览切换** | 同一块区域一次显示编辑或预览，按钮切换 | 实现最简单，但不满足“同时看到编辑和预览” |

用户描述的“Monaco 和 WYSIWYG 同时实现、通过配置切换”，技术上对应**双编辑器适配层**；如果要求 Typora 级别的所见即所得，则第二种编辑器必须是富文本编辑器，不能只靠 Monaco 装饰器。

## 2. 当前架构事实

### 2.1 编辑与预览链路

| 层 | 当前实现 | 耦合点 |
|---|---|---|
| 容器 | `MarkdownContainer.vue`：工具栏 + `#md-edit-component` | 工具栏为异步加载，假设编辑器是 Monaco |
| 编排 | `MarkdownEditComponent.vue` | `initialCodeContent`、`handleMarkdownCodeUpdate`、`syncContentToMain`、`saveContentToDisk`、tabs、行内/预览布局均围绕单一 Monaco 实例 |
| 源码编辑器 | `MarkdownMonacoEditor.vue` | Monaco worker、主题、快捷键、魔法输入、气泡/Slash、写作模式、光标会话 |
| 预览 | `MarkdownPreviewComponent.vue` + `markdown-it` | 独立渲染链，使用 DOMPurify、KaTeX、Mermaid、PlantUML、highlight.js |
| 规范内容 | `markdownEditorContent`（Markdown 字符串） | 保存、脏标记、标签会话、历史快照都以字符串为真源 |

### 2.2 已识别的 Monaco 耦合

当前 `components/Markdown` 下约 **22 个文件** 直接或间接触达 Monaco，包括：

- 编辑器动作：`hemy-editor-actions.ts`、`hemy-editor-common.ts`、`hemy-editor.ts`；
- 工具栏：`MarkdownEditToolsComponent.vue`、`hemy-editor-quick-access.ts`；
- 写作体验：气泡工具栏、Slash 命令、写作模式、智能输入、拼写检查；
- 预览/滚动同步：`MarkdownMonacoEditor.vue` 与 `MarkdownPreviewComponent.vue` 之间的编辑器事件；
- 光标/滚动恢复：`editor-cursor-session.ts`；
- 查找/跳行/大纲/选区：多数通过 Monaco API 或 EventBus 间接依赖。

这意味着：

1. **不能简单把 WYSIWYG 塞进 `#md-edit-component` 旁边**，否则两套编辑器会争抢焦点、快捷键、撤销栈和选中态；
2. 工具栏、气泡、Slash、智能输入、大纲等需要从“直接调用 Monaco”改为“调用统一编辑器适配接口”；
3. 保存/脏标记链路可以复用 Markdown 字符串，但模式切换必须显式 flush 当前内容。

### 2.3 现有构建与体积约束

| 指标 | 当前实测 | 预算 | 余量 | 约束 |
|---|---:|---:|---:|---|
| 主入口 | 149.5 KiB | 150 KiB | 0.5 KiB | **WYSIWYG 绝不能同步进入入口 chunk** |
| 首屏 | 328.6 KiB | 512 KiB | 183.4 KiB | 可容纳少量懒加载入口，但需实测 |
| Setup | 111.29 MiB | 115 MiB | 3.71 MiB | 新依赖会直接影响安装包 |
| portable | 100.43 MiB | 101 MiB | 583.6 KiB | 余量很小 |
| app.asar | 40.59 MiB | 47 MiB | 6.41 MiB | 富文本编辑器依赖可能占用数 MiB |

结论：**WYSIWYG 必须做成动态 import 的独立 chunk，且源码模式启动时不得加载其代码**；否则会直接突破入口体积预算。

## 3. 可行路线对比

### 3.1 路线 A：双编辑器适配层（推荐）

同一个 Markdown 字符串作为唯一真源，下面挂两个可替换实现：

```text
MarkdownEditComponent
        │
        ├── SourceEditorAdapter ──▶ Monaco
        └── WysiwygEditorAdapter ─▶ ProseMirror / Milkdown / Tiptap
                │
                └── 统一方法：getValue / setValue / insert / wrap / selection
                              undo / redo / focus / revealLine / onChange
```

模式切换流程：

1. 当前编辑器 `getValue()`，立即写回 `markdownEditorContent` 并 flush；
2. 卸载当前编辑器（释放 Monaco worker/监听/DOM）；
3. 动态加载目标编辑器 chunk；
4. 以当前 Markdown 字符串初始化目标编辑器；
5. 更新脏标记基准，避免“仅切换模式”被误判为内容修改；
6. 恢复大致位置（源码行号 ↔ WYSIWYG 块位置只能 best-effort）。

优点：

- 源码模式完全保留，出问题可随时切回；
- 两个编辑器不同时挂载，内存、焦点、撤销栈、快捷键冲突可控；
- 可渐进迁移工具栏/搜索/大纲等能力；
- 可以按文件/文档大小自动回退到 Monaco。

缺点：

- 需要先做适配层重构，无法零成本接入；
- Markdown 与富文本模型之间存在序列化损耗；
- 两套查找、撤销、光标、IME 行为需要分别测试。

### 3.2 路线 B：Monaco 单栏实时预览（Live Preview）

不引入富文本编辑器，在 Monaco 里用 decorations 实现：

- 标题字号/行高；
- 粗体、斜体、删除线、行内代码、链接；
- 引用、列表、任务列表；
- 当前行显示 Markdown 源码，其他行隐藏标记；
- 可追加图片/表格/公式的 block widget（首版可不做）。

优点：

- 复用现有 Monaco 全部能力，成本最低；
- 不需要新依赖，入口/安装包几乎不受影响；
- 与 Obsidian Live Preview 的产品形态接近。

缺点：

- **不是 Typora 式真 WYSIWYG**；
- 复杂语法（表格、嵌套、图片、数学、Mermaid）首版效果有限；
- decorations 需要自行处理光标、折叠、选区、大文档性能。

### 3.3 路线 C：WYSIWYG 直接替换 Monaco

只保留富文本编辑器，不再提供 Monaco 源码模式。

优点：产品形态最统一，交互最简单。

缺点：

- 直接丢失 Monaco 的查找替换、多光标、语法高亮、代码折叠、大量大文件能力；
- 现有 22 个 Monaco 文件、写作体验、工具栏、气泡、智能输入全部要重写或删除；
- 数据保真、撤销、IME、大文档性能风险最高；
- 与 1.5.1 的稳定性目标冲突。

**不建议**在 1.5.1 采用。

### 3.4 路线 D：两个编辑器同时挂载/叠加

把 Monaco 和 WYSIWYG 同时渲染，隐藏其中一个，或做透明叠层。

**明确不推荐**：

- 双份 DOM、双份文档模型、双份监听和内存；
- 焦点、快捷键、选区、撤销栈冲突；
- 滚动/光标同步成本高且容易错位；
- 大文档下内存和 CPU 明显增加；
- 没有产品收益，切换时仍要卸载一个。

## 4. 候选富文本技术

| 方案 | 基础 | Markdown 能力 | 许可/生态 | 包体参考 | 适配判断 |
|---|---|---|---|---|---|
| **Milkdown** | ProseMirror + remark | Markdown-first，GFM 插件较完整 | MIT，Vue 支持，插件化 | core 约 96.8 KB gzip；Crepe 约 463.5 KB gzip（含编辑器 UI/KaTeX/CodeMirror 等） | **优先 PoC**：适合 Markdown 真源，但 Crepe 全量偏重，需按需裁剪 |
| **Tiptap** | ProseMirror 封装 | Markdown 扩展仍是 Beta，使用 marked 解析/序列化 | 核心 MIT，Pro 扩展付费 | core 约 19.9 KB gzip；StarterKit 约 93.5 KB gzip；Markdown 扩展另计 | **备选 PoC**：生态成熟，但 Markdown 保真需重点验证 |
| **ProseMirror 直接使用** | 原生 ProseMirror | 需自行组合 schema/serializer | MIT | 取决于组合，控制力最强 | 适合长期自研，但首版工作量最大 |
| **Toast UI Editor** | 自有编辑器 | 内建 Markdown/WYSIWYG 双模式，可随时切换 | MIT | 完整编辑器，体积和 UI 集成成本较高 | 可作为快速功能验证，但不建议直接嵌入现有自定义壳 |
| **Monaco Live Preview** | Monaco | 不是富文本模型 | 现有依赖 | 无新增大依赖 | 如果目标只是“同栏格式化显示”，成本最低 |

> 包体数据来自 Bundlephobia 的包级统计，**不是本应用实际 tree-shake 后体积**；PoC 必须以本仓库 Vite 产物实测为准。

### 4.1 选型倾向

- 若目标是 **Typora 式真 WYSIWYG**：优先 PoC **Milkdown**（Markdown-first、MIT、Vue 集成）与 **Tiptap**（生态强、Markdown 扩展较新）二选一；
- 若目标是 **Obsidian 式同栏编辑体验**：直接做 Monaco Live Preview，不必引入富文本依赖；
- Toast UI 适合做交互参考，不建议直接作为生产编辑器替换现有外壳。

## 5. 推荐目标架构

### 5.1 配置与入口

建议新增系统设置（默认源码模式）：

```ts
type EditorMode = 'source' | 'wysiwyg'

interface SystemSetting {
    editorMode?: EditorMode // 默认 'source'
}
```

- 位置：系统设置 →「编辑器」页签（或「功能」下的实验能力）；
- 默认值：`source`，保证升级后行为不变；
- 切换入口：设置页 + 视图菜单 + 状态栏下拉；
- 首次切换显示“实验能力，可随时切回源码”提示；
- 不在源码模式下加载 WYSIWYG chunk。

### 5.2 统一编辑器接口

新增 `MarkdownEditorAdapter`，工具栏、气泡、Slash、智能输入、查找、大纲只依赖接口：

```ts
interface MarkdownEditorAdapter {
    getValue(): string
    setValue(markdown: string): void
    focus(): void
    getSelection(): EditorSelection | null
    insertText(text: string): void
    wrapSelection(prefix: string, suffix: string): void
    replaceSelection(text: string): void
    undo(): void
    redo(): void
    revealLine(line: number): void
    onChange(listener: (markdown: string) => void): () => void
    dispose(): void
}
```

Monaco 适配器可包装现有 `MarkdownMonacoEditor`；WYSIWYG 适配器包装 ProseMirror/Milkdown 的 commands。

### 5.3 内容与脏标记

- **唯一真源仍然是 Markdown 字符串**，不把 ProseMirror JSON 写入文件；
- 模式切换时先 flush 当前内容，再挂载另一个编辑器；
- 切换动作本身不得触发 `UPDATE_SELECT_FILE_CONTENT` 脏写；
- 每标签页保留“上次编辑模式”可选，首版建议全局模式，避免标签状态复杂化；
- 切换后 undo 栈不共享，必须明确提示“撤销历史按模式独立”。

### 5.4 工具栏与快捷键

- 工具栏按钮改为调用 `adapter.insertText/wrapSelection`，不再直接拿 Monaco editor；
- 气泡工具栏和 Slash 菜单复用同一 adapter 命令；
- Ctrl+B/I/K 等快捷键由当前编辑器各自绑定，但动作语义必须一致；
- 查找替换：WYSIWYG 需要独立查找 UI；跨文件搜索仍走现有主进程搜索，不依赖编辑器。

## 6. 能力兼容矩阵

| 能力 | 源码模式（现状） | WYSIWYG 目标 | 迁移策略 |
|---|---|---|---|
| 打开/保存/编码 | 已完成 | 复用 | Markdown 字符串不变 |
| 多标签/会话恢复 | 已完成 | 复用 | 内容/路径由标签控制器管理 |
| 文档历史/diff | 已完成 | 复用 | 基于 Markdown 字符串快照 |
| 查找替换 | Monaco 内建 | 需独立实现 | 适配层抽象 |
| 大纲 | Monaco 章节/文档解析 | 可从 Markdown 解析复用 | 不依赖编辑器实例 |
| 格式工具栏 | Monaco 编辑动作 | 富文本命令 | 统一 adapter |
| 气泡工具栏/Slash | Monaco 选区/动作 | 富文本命令 | 统一 adapter |
| 写作模式/打字机/段落聚焦 | Monaco 视图 | 需独立实现 | 仅源码模式支持，WYSIWYG 后续补 |
| 智能输入 | Monaco 键盘/编辑动作 | ProseMirror input rules | 行为对齐，分别测试 |
| 拼写检查 | Monaco textarea | 浏览器 contenteditable | 独立验证 |
| 滚动同步 | 编辑↔预览 | 单栏不需要 | WYSIWYG 模式关闭分栏 |
| 大文件 | Monaco 强项 | 需容量上限/回退 | 超限自动源码模式 |
| 主题 | Monaco 主题 + CSS | 富文本主题 | 新增一套主题变量映射 |

## 7. Markdown 保真风险（最高优先级）

富文本编辑器通常需要“Markdown → 内部文档 → Markdown”的往返，以下内容最容易丢失或被重写：

- YAML front matter；
- 原始 HTML 块；
- 表格列宽/对齐/单元格内多块内容；
- 脚注、定义列表、admonition、tabbed；
- Mermaid、PlantUML、KaTeX；
- 图片尺寸/链接属性；
- 引用式链接、转义字符；
- CRLF/LF、末尾换行、BOM；
- 自定义 Markdown 扩展语法。

**必须建立 Markdown 往返测试夹具**：至少 30 个真实样例，覆盖上述语法。验收标准：

1. 未编辑时切换模式，内容 **逐字不变**（或明确接受规范化并提示）；
2. 编辑后保存，未知语法不得丢失；无法映射的块应回退源码/保留原文；
3. 保存后再次打开，源码模式显示结果与 WYSIWYG 内容一致；
4. 表格/公式/Mermaid 等复杂块必须有专门回归用例。

> 如果 WYSIWYG 解析后立即序列化会把全文重排，可能导致用户每次切换都产生大面积 diff。这是本功能最大的产品风险，PoC 必须先验证。

## 8. 安全与合规

WYSIWYG 会直接渲染用户文档，攻击面比 Monaco 源码模式更大：

- 原始 HTML：默认禁用或严格白名单，不能把 WYSIWYG 解析器变成 HTML 注入入口；
- 链接协议：沿用现有 URL 白名单，禁止 `javascript:`/危险协议；
- 远程图片：仍受“允许远程图片”开关控制；
- 粘贴：Word/HTML 粘贴需清洗，防止脚本/事件属性；
- 剪贴板：复制为 HTML 时继续走 DOMPurify 或等价清洗；
- CSP：不得为 WYSIWYG 放宽现有 CSP；
- 依赖：新增依赖必须通过 `audit:all`、许可证与 SBOM 检查。

## 9. 性能与体积

### 9.1 必测指标

| 指标 | 目标 |
|---|---|
| 源码模式启动 chunk | 入口保持 ≤150 KiB，WYSIWYG 不进入入口 |
| WYSIWYG chunk | 实测 tree-shake 后大小，动态加载 |
| 1 MiB 文档切换模式 | ≤500 ms（目标） |
| 10,000 行文档编辑 | 无明显卡顿，必要时自动回退源码 |
| 内存 | 切换后旧编辑器 dispose，无残留监听/worker |
| 安装包 | 更新预算基线前必须实测并说明；不得私自放宽 |

### 9.2 已知包体参考

- Milkdown core 包级约 **96.8 KB gzip**，Crepe 完整 preset 约 **463.5 KB gzip**（含 KaTeX、CodeMirror 等，实际裁剪后可能更低）；
- Tiptap core 约 **19.9 KB gzip**，StarterKit 约 **93.5 KB gzip**，Markdown 扩展和自选扩展另计；
- 这些数字不是本应用产物；必须在 PoC 中用 `build:unpack`/`budget:check` 实测。

## 10. 分阶段实施建议

| 阶段 | 内容 | 预计工作量 | 产出 |
|---|---|---:|---|
| **P0 PoC** | 选型对比 Milkdown/Tiptap；Markdown 往返夹具；入口/包体/性能实测；最小演示页 | 2～3 天 | 选型结论 + 实测报告 |
| **P1 适配层** | `MarkdownEditorAdapter` 抽象；Monaco 适配器；模式配置/切换；懒加载 WYSIWYG；保存/脏标记/flush | 5～8 天 | 可切换 MVP，默认源码 |
| **P2 体验补齐** | 工具栏/气泡/Slash/查找/大纲/主题/IME/撤销/多标签/写作模式 | 3～4 周 | 功能基本可用 |
| **P3 保真与发布** | 表格/图片/公式/Mermaid/front matter、安全审计、性能优化、E2E/文档/发布门禁 | 2～3 周 | 可发布版本 |

总计：**MVP 约 2～3 周；接近功能平权约 6～8 周**（单开发者、不含选型返工）。若只做 Monaco Live Preview，预计 **3～5 天**可出 MVP。

## 11. PoC 验收清单

PoC 不进入主分支功能，先回答以下问题：

- [ ] 选型库的 Markdown 解析/序列化对现有 30 个夹具是否有数据丢失？
- [ ] 未编辑切换模式，源码是否逐字不变？若会规范化，规范化范围是否可接受？
- [ ] 表格/任务列表/代码围栏/公式/Mermaid/front matter 能否正确往返？
- [ ] 中文输入法组合、撤销/重做、复制粘贴、查找替换是否正常？
- [ ] 1 MiB / 10,000 行文档切换和编辑性能是否达标？
- [ ] 动态 chunk 实测体积多少？源码模式入口是否保持 ≤150 KiB？
- [ ] 依赖 audit/许可证是否通过？安装包预算是否仍在范围内？
- [ ] 与现有保存/标签/历史/关闭确认链路是否无冲突？
- [ ] 安全评审：HTML、链接、图片、粘贴、剪贴板是否全部受控？

## 12. 结论与建议

> **当前决策（2026-11-21）：暂不实施双编辑器。** 以下为未来若重启评估时的结论与建议，不构成本迭代任务。

1. **可以实现 Monaco 与 WYSIWYG 双模式、配置切换**，但应做成“可插拔编辑器适配层”，**同一时间只挂载一个编辑器**；
2. **不建议**双编辑器同时挂载/叠加，也不建议 1.5.1 直接替换 Monaco；
3. 真正的 Typora 式 WYSIWYG 建议先做 PoC，候选优先 **Milkdown** 与 **Tiptap**，用本仓库 Markdown 夹具和构建预算做最终选型；
4. 若目标只是“编辑和预览在同一栏”，**Monaco Live Preview** 成本低得多，3～5 天可出可试用 MVP，但它不是严格 WYSIWYG；
5. 上线策略：默认源码模式，WYSIWYG 作为实验能力懒加载；先内部试用，再决定是否进入正式版本；
6. 在 PoC 通过前，不建议在 1.5.1 中引入新依赖或改动现有编辑器主链路。

## 13. 参考资料

- [Tiptap Editor Overview](https://tiptap.dev/docs/editor/getting-started/overview)：Tiptap 基于 ProseMirror、MIT 开源核心、Pro 扩展付费；
- [Tiptap Markdown Introduction](https://tiptap.dev/docs/editor/markdown)：Markdown 扩展仍为 Beta，说明了解析/序列化架构与限制；
- [Milkdown core · npm](https://www.npmjs.com/package/@milkdown/core)：Milkdown 7.23.0，MIT，ProseMirror + remark，WYSIWYG Markdown 框架；
- [Milkdown · GitHub](https://github.com/Milkdown/milkdown)：插件驱动、Vue 集成与 MIT 许可；
- [TOAST UI Editor · GitHub](https://github.com/nhn/tui.editor)：内建 Markdown/WYSIWYG 双模式、MIT；
- [Bundlephobia: @milkdown/core](https://bundlephobia.com/package/@milkdown/core@7.23.0)、[@milkdown/crepe](https://bundlephobia.com/package/@milkdown/crepe@7.23.0)、[@tiptap/starter-kit](https://bundlephobia.com/package/@tiptap/starter-kit@3.0.0)：包级体积参考，非本应用实测；
- 项目内：`docs/reports/md/01-检查与扫描/Markdown编辑器能力补全选项报告.md`、`docs/wiki/02-设计与架构/开发规范.md`、`src/renderer/src/components/Markdown/`。
