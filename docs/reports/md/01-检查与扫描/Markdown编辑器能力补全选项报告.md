<!-- report-nav:start -->
> 🧭 **报告导航**：[🏠 报告首页](../../README.md) ｜ [01-检查与扫描](../01-检查与扫描/) ｜ [02-修复与实施](../02-修复与实施/) ｜ [03-专项治理](../03-专项治理/) ｜ 当前：**Markdown 编辑器能力补全选项报告**
<!-- report-nav:end -->

# Markdown 编辑器能力补全选项报告

> **性质**：产品能力选项、外部对标与决策清单（非缺陷报告）。
> **项目基线**：v1.5.1（开发中；最新发布版本为 v1.5.0，tag `release-1.5.0`）。
> **整理时间**：2026-11-21；本次补充 Obsidian / iA Writer / Logseq / Joplin / 思源 / Notion / Zettlr 的外部能力对标。
> **结论先行**：v1.5.1 已补齐搜索、命令面板、多标签、历史、lint、拼写、智能输入、大纲等编辑器基础能力；下一阶段最值得借鉴的是 **文档关系、属性/查询、捕获输入、发布与回顾**，而不是立刻做完整数据库或实时协作。
> **本次完成状态**：A1、A2、A3、A4、A6、A7、A8、A9、A10 已完成（A2/A8/A9 默认开启，A1/A3/A4/A6/A7/A10 为可选能力、默认关闭）；A5（Front matter）与 B/C/D/E 系列仍为候选。
> **使用方式**：§5 勾选未落地能力，或直接回复套餐编号（如 `套餐 B + E1`）。

## 1. 当前能力基线（v1.5.1）

| 领域 | 已具备能力 |
|---|---|
| 编辑 | Monaco 语法高亮、多光标、查找替换、跳行、代码折叠、Markdown 快捷键、自定义编辑器设置 |
| 预览 | 实时预览、编辑↔预览滚动同步、编辑/预览/分屏模式、标题大纲（编辑器 + 预览 TOC） |
| Markdown 语法 | 表格、任务列表、脚注、定义列表、Emoji、admonition、tabbed、属性列表、上下标、Mermaid、PlantUML、KaTeX、highlight.js、代码块增强 |
| 主题 | 28 套应用主题、57 套 Monaco 主题、主题设置/取消回滚 |
| 文件 | 新建/打开/保存/另存为、编码检测与转换、最近文件/文件夹、目录树、自动备份、未保存关闭确认 |
| 导入导出 | Word、HTML、JSON、XML、YAML、PDF 导入/导出；图片粘贴写入 `images/` |
| 安全/工程 | app://、Fuses 8 项、IPC 白名单、Path Guard、CSP、应用内消息框、CI/发布门禁、性能与体积预算 |
| 平台/i18n | Windows；中英双语；安装包/自动更新 |

### 1.1 v1.5.1 已落地能力

| ID | 能力 | 状态 | 默认 |
|---|---|---|---|
| A1 | 多标签/会话恢复 | ✅ 视图层多标签 + localStorage 会话 | 可选（默认关） |
| A2 | 全工作区搜索/替换 | ✅ 受控主进程搜索/替换 + 结果跳转 | 默认开 |
| A3 | 文档历史/diff/回滚 | ✅ localStorage 快照 + 行级 diff + 恢复 | 可选（默认关） |
| A4 | Markdown lint/格式化 | ✅ 规则子集 + 一键格式化 | 可选（默认关） |
| A5 | Front matter/元数据面板 | ⏳ 未实现 | — |
| A6 | 拼写检查 | ✅ Monaco textarea + 系统/Chromium 词典 | 可选（默认关） |
| A7 | Markdown 智能输入 | ✅ 有序列表/引用/任务列表/标题辅助 | 可选（默认关） |
| A8 | 粘贴/复制增强 | ✅ HTML/Word→Markdown、复制为 MD/HTML | 默认开 |
| A9 | 命令面板/Quick Open | ✅ 命令面板 + 文件快速打开 | 默认开 |
| A10 | 大纲增强 | ✅ setext、层级缩进、过滤 | 可选（默认关） |

> 状态说明：A1/A3/A4/A6/A7/A10 通过「系统设置 → 功能」开关控制；A2/A8/A9 为默认能力。A3 当前为渲染层 localStorage 历史，不是磁盘级历史库；A1 主进程仍保持单活动文档语义。

## 2. 外部对标：主流 Markdown 编辑器/知识库

### 2.1 对标对象与代表性能力

| 产品 | 代表性能力 | 对本项目最有借鉴意义的部分 |
|---|---|---|
| **Obsidian** | Backlinks、Bases、Canvas、Daily notes、File recovery、Graph view、Page preview、Properties、Publish、Quick switcher、Slash commands、Slides、Sync、Tags、Templates、Workspaces | 把「文件 → 关系 → 属性 → 查询」做成完整闭环；核心插件即工作流模块 |
| **iA Writer** | Focus Mode、Content Blocks、Style Check、Smart MD Tables、Writing Goals、Snippets、Wikilinks、Dynamic Outline、Global Search | 写作体验（专注/风格/目标）与可复用内容块 |
| **Logseq** | 块引用、Linked References、Flashcards、Whiteboards、大纲式编辑 | 块级引用/反向链接、回顾与白板工作流 |
| **Joplin** | Web Clipper、OCR、PDF/图片搜索、Note History、AI Chat/语义搜索、MCP、插件、多配置、自定义 CSS | 捕获、检索、历史与本地 AI 隐私路线 |
| **思源（SiYuan）** | 内容块/嵌入/块级双链、数据库五视图、PDF 标注、闪卡、S3 同步、SQL 查询、模板片段、发布服务 | 块级内容复用与「笔记数据化」 |
| **Notion** | Block docs、Databases、版本历史、Backlinks、Link previews、Web Clipper、AI/MCP、实时协作 | 块编辑、数据库视图、协作与 AI 的完整度 |
| **Zettlr** | Zotero/BibTeX 引用、全文搜索、导出/学术写作 | 学术引用与参考文献工作流 |

参考来源见 §9；各产品能力以其官方/用户文档为准。

### 2.2 可借鉴能力总览

| 工作流环节 | 能力 | 代表产品 | 对编辑器的价值 | 本项目状态 |
|---|---|---|---|---|
| 编辑/导航 | 全工作区搜索、命令面板/Quick Open、多标签、文档历史、Markdown lint、拼写、智能输入、大纲 | 本项目 1.5.1 | 基础编辑与检索工作流 | ✅ 已完成（1.5.1；部分可选） |
| 捕获 | Web Clipper、Email to Note、快速收件箱 | Joplin、Obsidian、思源 | 浏览器/邮件内容一键进库，减少手动搬运 | ❌ 未开始（E1/E6） |
| 捕获 | PDF 标注、图片 OCR、图片内文字搜索 | 思源、Joplin | 阅读/截图资料可检索、可引用 | ❌ 未开始（E2/E3） |
| 整理 | Front matter/属性、标签索引、保存查询 | Obsidian、思源、Notion | 从「文件」升级为「可筛选数据」 | ❌ 未开始（A5/B2） |
| 整理 | Bases/数据库视图（表格/看板/日历） | Obsidian、Notion、思源 | 任务、文献、项目统一管理 | ❌ 未开始（E5，建议后置） |
| 写作 | 所见即所得、Focus/Typewriter、写作目标、Style Check | Typora、iA Writer | 降低「源码↔预览」切换成本，提升长文体验 | ⏳ 部分（拼写/lint 已有；Focus/Style 未做，E9） |
| 写作 | 可复用内容块、Snippets、模板 | iA Writer、Obsidian、思源 | 常用段落/模板复用，减少重复劳动 | ⏳ 部分（内置模板已有；内容块/嵌入未做，E4） |
| 连接 | Wiki 双链、反向链接、未链接提及、悬浮预览 | Obsidian、Logseq、思源 | 形成知识网络，发现隐性关联 | ❌ 未开始（B1/E10） |
| 连接 | 块引用/嵌入/Transclusion | Logseq、思源、Obsidian | 一处修改多处同步，适合复用型笔记 | ❌ 未开始（E4） |
| 连接 | 关系图谱 | Obsidian、思源 | 发现孤立笔记与主题聚类 | ❌ 未开始（B3） |
| 回顾 | 笔记历史/版本恢复、闪卡/间隔重复 | Joplin、Logseq、思源 | 防误删、可回溯、可复习 | ⏳ 部分（历史 MVP ✅；闪卡未做） |
| 发布 | 幻灯片、静态站点、EPUB、博客直发 | Obsidian、iA Writer、Joplin | 从写作到分享的完整链路 | ❌ 未开始（C1/C2/E8） |
| 协作/扩展 | 同步/冲突处理、实时协作、插件/API/MCP | Joplin、Notion、Obsidian | 多设备/团队/自动化，但成本高 | ❌ 未开始（D1/D5/D6） |

### 2.3 对本项目的判断

- **已经对齐**：搜索、命令面板、多标签、历史、lint、拼写、智能输入、大纲，这些在 1.5.1 已落地，说明编辑器基础层不再是主要差距；
- **最自然的下一步**：先做 **A5 属性 + B1/B2/B4 关系与索引**，把「文件树」升级成「可查询的本地知识库」；
- **最容易形成差异化的能力**：**E1 网页剪藏 + E2 PDF 标注 + E3 OCR**，与现有本地文件/安全架构契合；
- **不建议照搬**：完整数据库、实时协作、云同步、全文 WYSIWYG 替换 Monaco；这些是产品级/团队级工程，不是单个版本能稳妥交付的。

## 3. 能力候选矩阵

> 估算口径：**S** ≤2 人日、**M** 3~5 人日、**L** 8~15 人日、**XL** >15 人日（单人）；实际随交互细节/测试量浮动。状态：✅ 1.5.1 已落地 / ⏳ 未落地。

### A. 编辑器与工作流

| ID | 能力 | 状态 | 价值 | 主要改动 | 依赖/风险 | 工作量 | 推荐度 |
|---|---|---|---|---|---|---|---|
| A1 | 多标签/多文档 + 会话恢复 | ✅ 可选 | 同时编辑多篇、切换不丢状态 | 视图层标签 + 会话恢复；主进程仍单文档 | 另存为/主进程状态同步 | L | ★★★★★ |
| A2 | 全工作区搜索/替换 | ✅ 默认 | 跨文件找内容、批量替换 | 主进程搜索/替换 + 结果面板 | 大目录性能、忽略规则 | M~L | ★★★★★ |
| A3 | 文档保存历史 / diff / 回滚 | ✅ 可选 | 误改可恢复 | localStorage 快照 + diff UI | 存储上限；非磁盘级 | M~L | ★★★★☆ |
| A4 | Markdown lint / 自动格式化 | ✅ 可选 | 统一格式 | 规则子集 + 一键格式化 | 避免破坏手写风格 | S~M | ★★★★☆ |
| A5 | Front matter / 元数据面板 | ⏳ | 标题、日期、标签、摘要、状态 | 识别 YAML front matter；表单编辑 | schema/自定义字段 | S~M | ★★★★★ |
| A6 | 拼写/语法检查 | ✅ 可选 | 写作错误提示 | textarea 系统拼写检查 | 中文分词误报 | S~M | ★★★☆☆ |
| A7 | Markdown 智能输入 | ✅ 可选 | 列表/引用续行 | Enter/Tab 行为扩展 | 兼容既有习惯 | S | ★★★☆☆ |
| A8 | 粘贴/复制增强 | ✅ 默认 | HTML/Word→Markdown、复制格式 | Turndown + clipboard | 清洗/保真度 | M | ★★★☆☆ |
| A9 | 命令面板 / Quick Open | ✅ 默认 | 键盘快速操作 | 命令注册表 + 文件模糊搜索 | 命令体系 | M | ★★★☆☆ |
| A10 | 大纲增强 | ✅ 可选 | setext/层级/过滤 | 大纲解析扩展 | 与预览 TOC 协调 | S~M | ★★☆☆☆ |

### B. 知识库与文档关系（均未落地）

| ID | 能力 | 价值 | 主要改动 | 依赖/风险 | 工作量 | 推荐度 |
|---|---|---|---|---|---|---|
| B1 | **Wiki 双链 / 反向链接** | `[[页面]]` 链接、被引用列表，知识库核心 | 解析 wikilink；链接索引；点击创建/跳转；重命名更新 | 文件树/搜索/重命名联动；链接歧义 | L | ★★★★★ |
| B2 | **标签与全文索引** | 按标签聚合、全文快速检索 | front matter/行内标签；索引存储；筛选视图 | 索引持久化/增量更新；与 A2 共用 | M~L | ★★★★★ |
| B3 | **关系图谱** | 可视化文档/链接关系 | 图数据构建；SVG/Canvas 渲染；交互 | 大规模性能；布局 | M~L | ★★★☆☆ |
| B4 | **链接检查与重命名自动更新** | 避免死链 | 链接解析；重命名事务；检查报告 | B1/B5 联动；相对路径/锚点 | M | ★★★★☆ |
| B5 | **附件管理器** | 图片/附件重命名、孤儿清理 | 附件索引；引用扫描；操作 UI | 安全路径；与粘贴/插入整合 | M | ★★★☆☆ |

### C. 发布与导出（均未落地）

| ID | 能力 | 价值 | 主要改动 | 依赖/风险 | 工作量 | 推荐度 |
|---|---|---|---|---|---|---|
| C1 | **EPUB 导出** | 电子书/长文发布 | 渲染结果打包 EPUB；封面/目录/元数据 | 资源内嵌/样式兼容 | M | ★★★☆☆ |
| C2 | **静态站点导出** | 文件夹发布为站点 | 路由/索引/主题/资源 | 输出格式维护成本 | L | ★★★☆☆ |
| C3 | **打印 / 打印预览** | 直接打印或预览分页 | 打印样式；Electron print API | 与 PDF 导出一致性 | S | ★★★☆☆ |
| C4 | **主题化/自包含 HTML 导出** | 保留样式/图片/目录 | 内联 CSS/图片；TOC；主题 | 资源体积/外链安全 | S~M | ★★★☆☆ |

### D. 平台、扩展与协作（均未落地）

| ID | 能力 | 价值 | 主要改动 | 依赖/风险 | 工作量 | 推荐度 |
|---|---|---|---|---|---|---|
| D1 | **插件/模板 SDK** | 用户扩展编辑器能力 | 命令/菜单/UI 扩展点；模板管理；插件加载 | 安全沙箱、版本兼容 | L~XL | ★★★☆☆（长期） |
| D2 | **文件关联 / 多窗口** | 双击 `.md` 打开；多窗口 | fileAssociations；second-instance；多窗口状态 | 平台行为差异 | M | ★★★★☆ |
| D3 | **macOS / Linux 支持** | 跨平台用户覆盖 | 打包、签名、平台测试 | 证书/设备/权限 | L | ★★★★★（若产品化） |
| D4 | **Git 集成** | 版本管理/提交/差异 | Git 调用或内置实现；diff UI | 本机 Git/认证 | L | ★★★☆☆ |
| D5 | **云同步 / 实时协作** | 多设备/多人 | 后端、账号、冲突合并 | 基础设施/隐私成本高 | XL | ★★☆☆☆（战略级） |
| D6 | **AI 写作辅助** | 续写、润色、摘要、翻译 | 模型 API/本地模型；流式 UI | API/隐私/成本 | M~L | ★★★☆☆（视定位） |

### E. 工作流扩展新增候选（本次外部对标新增）

| ID | 能力 | 价值 | 主要改动 | 依赖/风险 | 工作量 | 推荐度 |
|---|---|---|---|---|---|---|
| E1 | **Web Clipper / 剪藏** | 浏览器内容一键进工作区 | 浏览器扩展/本地接收端；HTML→Markdown；来源元数据 | 本地端口安全、网页清洗、图片下载 | M~L | ★★★★★ |
| E2 | **PDF 标注与摘录** | 阅读与笔记闭环 | pdfjs 标注层；摘录插入；标注 sidecar | 标注持久化/坐标/缩放 | M~L | ★★★★★ |
| E3 | **图片 OCR / 图片文字搜索** | 截图、扫描件可检索 | OCR worker；索引文本；结果跳转 | 模型体积/准确率/性能 | M | ★★★★☆ |
| E4 | **块引用 / 内容嵌入（Transclusion）** | 一处修改多处同步 | 块 ID/引用语法；预览渲染；反向引用 | 块模型、复制/移动语义 | L | ★★★★★（知识库路线） |
| E5 | **数据库 / 查询视图** | 笔记数据化（表格/看板/日历） | 属性 schema；索引；多视图；查询语法 | 工程量大；先做轻量属性查询 | L~XL | ★★★☆☆（先轻后重） |
| E6 | **日记 / 模板 / 快速收件箱** | 日常记录、降低启动成本 | 模板；日期笔记；收件箱；快捷捕获 | 与模板/命令面板整合 | S~M | ★★★★★ |
| E7 | **Canvas / 白板** | 头脑风暴、项目图 | Excalidraw/自研画布；.canvas 持久化 | 文件格式/性能/交互 | M~L | ★★★☆☆ |
| E8 | **幻灯片 / 演示导出** | 笔记直接变演示 | Marp/reveal 渲染或导出 PPT/HTML | 主题/分页/图片 | M | ★★★☆☆ |
| E9 | **Focus/Typewriter、写作目标、Style Check** | 长文写作体验 | 编辑器模式；目标统计；风格规则（Vale 类） | 规则配置/误报 | S~M | ★★★★☆ |
| E10 | **页面悬浮预览 / 链接预览** | 不离开当前文档看引用 | 预览卡片；链接解析；定位 | 性能/安全 | S~M | ★★★★☆ |
| E11 | **工作区布局 / 多配置** | 写作/研究/项目切换 | 布局保存；最近工作区；配置 profile | 状态管理/文件监听 | S~M | ★★★☆☆ |

## 4. 推荐套餐与版本路线

| 套餐 | 包含 | 适合定位 | 说明 |
|---|---|---|---|
| **套餐 A：轻量编辑器增强** | A1、A2、A3、A4、A6、A7、A8、A9、A10 | 「更好用的 Markdown 编辑器」 | ✅ 1.5.1 已完成；剩余 A5 可补 |
| **套餐 B：本地知识库** | A5、B1、B2、B4、B5、E10 | 「本地 Markdown 笔记/知识库」 | 下一阶段主线；先关系/属性，后图谱/数据库 |
| **套餐 C：捕获与创作** | E1、E2、E3、E4、E6 | 「资料收集→整理→复用」 | 外部对标中差异化最强的一组 |
| **套餐 D：发布与平台** | C1、C3、C4、D2、E8 | 「写作→分享」 | 成本中等；先打印/HTML，再 EPUB/静态站点 |
| **套餐 E：长期生态** | D1、D3、D5、D6、E5、E7 | 「产品化/团队化」 | 需要后端、插件治理、跨平台能力，分阶段评估 |

### 推荐实施顺序

1. **文档关系层（1.6）**：A5 属性 → B1 双链/反向链接 → B4 链接检查 → B2 标签/索引 → E10 悬浮预览；
2. **捕获与复用（1.7）**：E1 Web Clipper → E2 PDF 标注 → E3 OCR → E4 块引用/嵌入 → E6 日记/模板/收件箱；
3. **表达与发布（1.8）**：E9 写作体验 → C3 打印/C4 主题 HTML → E8 幻灯片 → C1 EPUB/C2 静态站点；
4. **平台与智能（后续）**：E7 Canvas → D1 插件 SDK → D2 文件关联/多窗口 → D3 跨平台 → D5/D6 同步/AI；
5. **数据库（E5）不要先做**：先完成属性 + 索引 + 查询，再评估是否需要完整数据库视图。

## 5. 决策勾选表（只列未落地能力）

请为每项标注：**P0 优先 / P1 后续 / 不做 / 待定**，或直接回复套餐编号。

| ID | 能力 | 你的选择（P0/P1/不做/待定） |
|---|---|---|
| A5 | Front matter/元数据面板 | |
| B1 | Wiki 双链/反向链接 | |
| B2 | 标签/全文索引 | |
| B3 | 关系图谱 | |
| B4 | 链接检查/重命名自动更新 | |
| B5 | 附件管理器 | |
| C1 | EPUB 导出 | |
| C2 | 静态站点导出 | |
| C3 | 打印/打印预览 | |
| C4 | 主题化/自包含 HTML 导出 | |
| D1 | 插件/模板 SDK | |
| D2 | 文件关联/多窗口 | |
| D3 | macOS/Linux 支持 | |
| D4 | Git 集成 | |
| D5 | 云同步/实时协作 | |
| D6 | AI 写作辅助 | |
| E1 | Web Clipper/剪藏 | |
| E2 | PDF 标注与摘录 | |
| E3 | 图片 OCR/图片文字搜索 | |
| E4 | 块引用/内容嵌入 | |
| E5 | 数据库/查询视图 | |
| E6 | 日记/模板/快速收件箱 | |
| E7 | Canvas/白板 | |
| E8 | 幻灯片/演示导出 | |
| E9 | Focus/写作目标/Style Check | |
| E10 | 页面悬浮预览/链接预览 | |
| E11 | 工作区布局/多配置 | |

## 6. 关键风险与依赖提示

- **B1/B4** 会改变文件语义（链接/重命名），要先定链接语法、歧义规则、相对路径策略和回滚方案；
- **B2/E5 索引**会影响主进程性能与目录监听链路，必须定义忽略规则与增量更新；数据库视图不要先于属性/索引做；
- **A3 历史**已有 MVP，但 localStorage 容量有限；后续需升级为磁盘级历史与清理策略；
- **E1/E2/E3** 涉及外部内容/二进制/PDF，必须复用现有 Path Guard、app://、CSP 与 worker 边界；
- **E4 块引用**会引入稳定块 ID 与复制/移动/删除语义，建议在 B1 索引稳定后再做；
- **E9 Style Check** 需要规则集与误报控制，可参考 Vale 的规则模型；
- **D5/D6** 涉及后端、隐私与成本，建议先明确产品定位；AI 默认应离线/可关闭；
- 当前 **单文件架构、Windows-only、未签名** 是长期约束，规划时需一起考虑。

## 7. 建议验收标准（选定后补）

- 每一批功能必须有：单元测试 + 关键 E2E + 不降低现有覆盖率阈值；
- 不破坏现有门禁：typecheck / ESLint 0 warning / Prettier / vitest / E2E / audit / budget / fuses；
- 性能敏感功能（搜索、索引、多文档、预览）需给出量化基线（启动、内存、搜索耗时）；
- 涉及文件语义的能力（链接、重命名、历史、剪藏）必须有回滚方案与失败提示；
- 外部内容（剪藏/PDF/OCR/AI）必须有明确隐私开关与本地优先策略。

## 8. 下一步

1. 维护者按 §5 勾选并确认套餐；
2. 将选中项转成版本计划（含里程碑、验收指标、风险与回滚）；
3. 按「文档关系 → 捕获复用 → 表达发布 → 平台智能」的顺序排期。

## 9. 参考资料

- [Obsidian Core plugins](https://obsidian.md/help/plugins)（Backlinks、Bases、Canvas、Daily notes、File recovery、Graph view、Page preview、Properties、Publish、Quick switcher、Slash commands、Slides、Sync、Tags、Templates、Workspaces 等）
- [iA Writer Features](https://ia.net/writer/support/basics/features?platform=windows)（Focus Mode、Content Blocks、Style Check、Smart Tables、Writing Goals、Snippets、Wikilinks、Dynamic Outline 等）
- [Logseq](https://logseq.com/)（Block References、Linked References、Flashcards、Whiteboards）
- [Joplin for Research](https://joplinapp.org/help/apps/use_cases/research/)（Web Clipper、OCR、附件、协作）
- [Joplin Note History](https://joplinapp.org/help/apps/note_history/)（定期版本快照与恢复）
- [Joplin Semantic Search](https://joplinapp.org/help/apps/ai_semantic_search/)（本地模型、离线索引、MCP）
- [思源内容块](https://siyuannote.com/article/1725202793?pvs=25)（块引用/嵌入/块 ID/双链；社区用户指南）
- [思源数据库](https://siyuannote.com/article/1725202844?pvs=25)（表格/列表/卡片/看板/日历视图）
- [Notion Features](https://www.notion.com/product/features)（Block docs、Databases、版本历史、Backlinks、Link previews、Web Clipper、AI/MCP、实时协作）
- [Zettlr Features](https://zettlr.com/features)（Zotero/BibTeX 引用、全文搜索、学术写作）
- [Vale](https://vale.sh/)（可配置的 prose lint / style check 规则模型）
- [Typora What's New 1.1](https://support.typora.io/What%27s-New-1.1/)（Focus/Typewriter 模式等写作体验）

> 外部产品能力以官方文档为准；本报告只做能力对标，不引入外部代码或服务依赖。
