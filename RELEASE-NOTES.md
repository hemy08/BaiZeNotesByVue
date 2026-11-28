## 版本 1.5.6 (2026-11-28)

> **发布状态**：**开发中（待发布）**｜tag：`release-1.5.6`（发布时创建）｜GitHub Release 资产：Windows NSIS 安装包 / portable / latest.yml / blockmap

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

> 本版本聚焦**工具窗与面板的可调整性 + 主题可读性 + 工具可发现性**：非模态工具窗与插件工具面板新增最小化/最大化、表格编辑器窗口缩放修复、14 套主题按钮对比度治理、插件工具搜索/最近/收藏与「插件搜索」菜单入口、编辑器主题设置修复、帮助文档配图重采集与瘦身；不新增 IPC 通道与运行时依赖。

### ✨ 工具窗与面板体验

- 8 个非模态工具窗标题栏新增 **[最小化][最大化][关闭]** 三按钮：最小化折叠为仅标题栏（实测 42px）、最大化铺满主窗口可用区（实测 1248×768，偏移 16,16）、再次点击还原并回到原拖拽位置（还原偏差 0）
- 38 项插件工具面板新增 44px 顶部工具条（标题「插件工具」+ [最小化][最大化][返回编辑器]）：最小化折叠为工具条，最大化让工具内容铺满工作区宽度（内容区实测 798→882px）
- 三按钮统一为 28×28 令牌图标，带 `aria-label` 与键盘焦点环，中英双语；不改变既有拖拽、缩放、`Esc` 与 IPC 行为

### ✨ 插件搜索入口

- 插件菜单首项新增**「插件搜索」**：点开后工作区展示搜索界面（搜索框自动聚焦），空白时显示**最近使用的 20 个插件**与全部工具
- 输入名称/分类/关键词即过滤，`↑/↓` 选择、`Enter` 或点击打开对应工具，并自动记录为最近使用

### ✨ 主题可读性

- 14 套主题按钮文字对比度从 2.30~4.23:1 修复到 **≥4.56:1**（保留白字、仅同值压暗强调色，主色观感保留）
- 3 套主题分组声明修正（forest → 浅色组、baize-text / baize-starry → 深色组），声明分组与实测明暗一致
- 新增对比度硬门禁（28 主题 × 6 组合 + 分组一致性），`npm run quality:contrast` 可单独执行

### ✨ 插件工具可发现性

- 38 项插件工具面板新增**搜索框**（名称/分类/关键词，中英双语，键盘可操作）
- **最近使用**（自动记录 5 个）+ **收藏**（星标，上限 10）；默认列表视图「收藏 → 最近使用 → 全部工具」三分区
- 本地 `localStorage` 持久化，无新增 IPC 通道与配置文件

### 🐛 问题修复

- **编辑器主题设置不生效**（三层根因修复）：恢复主题设置中的「独立编辑器主题」开关（点选编辑器主题自动开启，默认仍跟随应用主题）；含空格/括号的 21 套磁盘主题现在可正常写盘与应用（内部 id 映射）；22/54 磁盘主题的 `Illegal theme name` 回退问题消除

- **表格编辑器窗口无法拖拽缩放**：根因是正文 `.table-editor-body`（content-box + `width:100%`）被内边距撑出容器 32px，把右下角 `.resize-grip` 挤出 `.dialog-container` 的 `overflow:hidden` 裁剪区；修复为正文根节点 `box-sizing: border-box`、手柄内缩 2px 并提升 `z-index`
- 修复后真实拖拽回归实测窗口 **1002×509 → 1164×631**

### 📚 文档

- 使用指导第 9 章（非模态工具窗）与第 17 章（插件工具）补充最小化/最大化、搜索/收藏说明；HTML 与 PDF 重新生成
- **帮助配图重采集与瘦身**：新增可复跑脚本 `npm run capture:help-shots`（22 场景真实 Electron 截图，连续复跑逐字节一致）；22 张配图 PNG 1.47 MiB → WebP 474 KiB（−68.5%），PDF 打印链改用无损 PNG（PDF 1.91MB → 1.44MB）

### ✨ 体验增强（P2 批次）

- **插件工具**：8 分类可折叠（记忆状态）；38 项工具各配 24 网格线性图标；20 个历史零引用图标清理（资产 23→3）
- **命令面板**：最近命令/使用频率排序、分组折叠、空态「相关命令」建议
- **菜单栏**：12 个顶层菜单支持 Alt+字母助记符（F/E/V/C/I/S/T/P/O/A/G/H），与单独 Alt 激活共存
- **插件面板最小化联动**：折叠时编辑器区域自动扩大可见面积
- **玻璃风格**：不透明度与高光增强（平坦背景可感知），仍不启用整窗模糊
- **帮助文档**：悬浮目录 + 内文搜索（浏览器/在线）；应用内帮助由父页面代理提供搜索定位与高亮
- **工程**：硬编码颜色再收口 314→272（新增等值令牌文件）；z-index 应用层相对阶梯化（100/110/120）

### ⚠️ 已知事项

- 插件工具面板最小化仅折叠面板容器（1.5.6 已联动工作区收起空白；父容器行为见 REQ-12）
- 主题强调色（14 套）为满足按钮对比度做了同色相压暗，观感需走查；`baize-text` 主题强调色作为对话框主按钮底色（白字 1.40:1）为既有问题，不在本版修复范围
- 插件工具搜索为子串匹配（中英关键词 + 名称/分类），暂不支持拼音/模糊匹配
- 点选编辑器主题会自动开启「独立编辑器主题」（选择即使用意图）；希望编辑器跟随应用主题时请手动关闭开关（默认关闭）

## 版本 1.5.5 (2026-11-27)

> **发布状态**：**已发布**（2026-11-27）｜tag：[`release-1.5.5`](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.5.5)｜GitHub Release 资产：Windows NSIS 安装包 / portable / latest.yml / blockmap

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

> 本版本聚焦**界面视觉升级**：4 种界面风格 × 3 档密度 × 28 套应用主题全量适配，6 个核心组件统一升级，菜单栏键盘可达与写作模式纸感；不新增 IPC 通道与运行时依赖。

### 🎨 视觉升级

- 4 种界面风格（paper 纸感 / glass 轻玻璃 / workbench 高密度 / hybrid 混合）× 3 档密度（紧凑 / 默认 / 宽松），设置 → 外观切换
- 18 组语义颜色令牌由 28 套主题派生（`--ui-*`），深色 / 高饱和 / 护眼主题自动降级（glass 稳健模式）
- 6 个核心组件升级：菜单栏、非模态工具窗、对话框、命令面板、状态栏 / 空态、表格编辑器
- 统一圆角 / 阴影 / 边框 / 动效规范（DESIGN / MOTION / COMPONENTS 三篇设计规范）

### ✨ 体验改进

- 菜单栏键盘可达（role / 方向键 / Enter / Esc / 焦点可视）；命令面板与工具窗键盘操作补齐
- 编辑器写作模式纸感版式（paper / hybrid）：行高 1.75、引用条、代码块圆角；Monaco 57 套编辑器主题仍独立
- 清理 161 处硬编码颜色（−17.9%），真实 Electron 截图 37 张验收（连续两次 0 diff）
- 28 主题 × 4 风格对比度扫描全部通过（正文 ≥4.5:1）

### 🐛 问题修复

- **编辑器主题设置不生效**（三层根因修复）：恢复主题设置中的「独立编辑器主题」开关（点选编辑器主题自动开启，默认仍跟随应用主题）；含空格/括号的 21 套磁盘主题现在可正常写盘与应用（内部 id 映射）；22/54 磁盘主题的 `Illegal theme name` 回退问题消除

- 工具窗 Esc 语义：焦点在窗内时只关闭最顶层
- 菜单栏高度、宽度阶梯、z-index 收敛统一

### ⚠️ 已知事项

- 部分主题（如深邃夜空）历史配色数据中背景与卡片明暗不一致，令牌派生已按表面亮度兜底，建议后续版本修正主题数据
- 视觉升级为默认外观显式变更（workbench 默认档按新规格），如需旧观感可通过外观设置切换风格

## 版本 1.5.3 (2026-11-27)

> **发布状态**：**已发布**（2026-11-27）｜tag：[`release-1.5.3`](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.5.3)｜GitHub Release 资产：Windows NSIS 安装包 / portable / latest.yml / blockmap

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

> 本版本聚焦 **Markdown 编辑器 P0 体验**：格式工具栏、非模态工具窗、统一表格编辑器、图片插入增强、菜单重组与未命名草稿保护；不扩展知识库主线。仍为 Windows x64、未代码签名产物。

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### ✍️ 编辑器体验

- **内联格式工具栏**：选中文本或光标所在词时切换粗体、斜体、删除线、行内代码；支持粗体+斜体组合，工具栏按当前选区状态高亮
- **未命名草稿保护**：未打开文件时输入的内容只写入本地草稿缓存；点击文件先提示「保存并打开 / 不保存 / 取消」，保存走系统另存为，避免草稿覆盖目标文件；重载后可恢复草稿
- **统一 GFM 表格编辑器**：插入与编辑共用同一界面；支持指定行列、统一对齐、导入 Excel(.xlsx)/CSV、拖动列宽、行列重排、任意位置增删、按列排序、行列互换、多行 Markdown、任务清单与拖拽缩放
- **图片插入增强**：支持宽度、对齐、图注，输出 `figure/img/figcaption`；默认仍输出标准 Markdown
- **粘贴/复制 Markdown**：复用 A8 HTML→Markdown 与复制为 Markdown/HTML 能力

### 🧩 工具与菜单

- **菜单重组**：绘图工具（Mermaid/PlantUML）迁入「插入」并提升为一级分组；特殊字体、数学公式、Markdown 表格、网页链接迁入「工具」，合并重复的公式/表格入口
- **非模态工具窗**：插入菜单与编辑工具对话框打开后，点击外部、悬停或按 Esc 均不关闭，遮罩可穿透以便继续编辑 Markdown；仅关闭按钮与插入/应用等显式操作关闭
- **非模态开关**：系统设置 → 功能新增「非模态工具对话框」，默认开启，可关闭恢复普通模态行为

### 🔐 稳定性与数据安全

- 未装载文件时的编辑不再同步到主进程活动文件，避免启动恢复的旧文件或目标文件被草稿覆盖
- 文件树、资源管理器导出、标签切换、预览链接、工作区搜索等打开入口统一接入未命名草稿确认
- 保持既有 IPC 安全边界：未新增 IPC 通道，路径校验、sender 校验与文件白名单链路不变

### ⚙️ 工程与门禁

- IPC **108 通道 / 18 组**，preload 白名单 send 74 + receive 28
- 测试 **351 文件 / 6,406 用例（6,401 通过 + 5 跳过）**；覆盖率 **93.17 / 87.73 / 93.79 / 93.59**
- typecheck / ESLint / Prettier / docs / quality / audit / fuses / budget 全绿
- 体积：入口 **142.8 KiB** / 首屏 **329.5 KiB** / Setup **111.59 MiB** / portable **100.98 MiB** / asar **39.32 MiB**
- 发布产物硬化：Fuses 8 项 + 无调试器启动冒烟通过

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">📌 已知限制</summary>
<blockcode><pre><code>

- 仅提供 Windows x64 安装包；未接入代码签名，发布产物未签名
- 搜索面板、命令面板与设置/确认类对话框仍保持模态行为
- PDF 标注、OCR、剪藏、日记/收件箱等可选能力默认关闭，需在系统设置中开启
- E3 OCR MVP 仅英文 `eng`，首次使用需联网下载语言包；中文语言包与图片文字索引未做
- C2 静态站点、B3 关系图谱、E4 块引用、E5 数据库视图、E7 Canvas、D1 插件 SDK、D3 macOS/Linux、D4 Git、D5 云同步、D8 WYSIWYG 仍为后续候选

</code></pre></blockcode></details>

---

## 版本 1.5.2 (2026-11-22)

> **发布状态**：**已发布**（2026-11-22）｜tag：[`release-1.5.2`](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.5.2)｜GitHub Release 资产：Windows NSIS 安装包 / portable / latest.yml / blockmap

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

> 本版本聚焦**捕获与日常入口**，并补齐第一层（打印/自包含 HTML/布局配置）与第二层可安全交付项（EPUB/幻灯片/文件关联）。仍为 Windows x64、未代码签名产物（与 1.5.1 一致）。

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 📥 捕获与日常入口（E6/E1/E2/E3）

- **E6 今日日记/快速收件箱**：工具菜单与命令面板入口；`diary/YYYY-MM-DD.md`、`inbox/YYYY-MM-DD-HHmmss.md`；模板变量展开；独占创建不覆盖
- **E1 剪贴板剪藏**：剪藏到新笔记 / 剪藏并插入当前笔记；HTML→Markdown；来源/标题/捕获时间元数据；剪贴板读取仅用户显式触发
- **E2 PDF 标注与摘录**：PDF 文本层选择、高亮、标注列表、备注、摘录插入当前笔记；侧车 JSON 原子持久化
- **E3 图片 OCR（MVP）**：剪贴板截图本地识别、识别并插入/复制；首次按需下载英文语言包，图片不上传

### 📚 帮助与使用指导

- 帮助 → **hemy08.github.io** 在线文档
- 帮助 → 使用指导 → **HTML 版 / PDF 版**，均带导航；覆盖全部功能、配置矩阵、功能联动与典型工作流

### 🧰 第一/第二层能力

- **C3 打印/打印预览**：文件菜单打印与打印预览；复用主题化渲染与硬化隐藏窗口
- **C4 自包含 HTML 导出**：主题 CSS、目录、本地图片 Base64；工作区路径与体积上限校验
- **E11 工作区布局**：视图 → 布局配置；内置写作/研究/项目 + 自定义 profile 保存/应用/删除
- **C1 EPUB 导出**：EPUB3 容器（mimetype/container/opf/nav/ncx/XHTML/CSS/图片）
- **E8 幻灯片 HTML**：按 `---` 分页、键盘/按钮翻页、打印或另存 PDF；代码围栏内不拆页
- **D2 文件关联（部分）**：`.md/.markdown/.txt` 关联；启动参数与 second-instance 复用受信打开链路
- **预览修复**：移除右侧固定空白带与 40px 导航间距；无缩进 `===` 内容正确归组，不再生成空 Tab

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🔒 安全与工程</summary>
<blockcode><pre><code>

### 🔐 安全边界

- 主窗口/对话框/隐藏导出窗口 sandbox + contextIsolation；生产 CSP 收紧
- 文件写入统一 Path Guard；打印/EPUB/HTML 本地图片读取经 realpath + 工作区边界校验
- 剪藏不新增本地 HTTP 端口/浏览器扩展；OCR 图片仅在本地 worker/wasm 识别
- 文件关联打开复用既有 OpenSelectFile 受信路径链路；未放宽 CSP/IPC/文件白名单

### ⚙️ 工程与门禁

- IPC **108 通道 / 18 组**，preload 白名单 send 74 + receive 28
- 测试 **341 文件 / 6,331 用例（6,326 通过 + 5 跳过）**；覆盖率 **93.64 / 88.22 / 94.21 / 94.01**
- typecheck / ESLint / Prettier / docs / quality / audit / fuses / budget 全绿
- 体积：入口 **143.2 KiB** / 首屏 **329.9 KiB** / Setup **111.60 MiB** / portable **100.99 MiB** / asar **39.23 MiB**
- 发布产物硬化：Fuses 8 项 + 无调试器启动冒烟通过

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">📌 已知限制</summary>
<blockcode><pre><code>

- E3 OCR MVP 仅英文 `eng`，首次使用需联网下载语言包；中文语言包与图片文字索引未做
- B2 持久全文索引未做，全文检索继续使用 A2 按需扫描；E1 浏览器扩展/本地接收端按已选范围未做
- D2 仅完成文件关联 + 单实例打开文件，独立多窗口未做
- C2 静态站点、B3 关系图谱、E4 块引用、E5 数据库视图、E7 Canvas、D1 插件 SDK、D3 macOS/Linux、D4 Git、D5 云同步、D8 WYSIWYG 仍为后续候选
- PDF 标注、OCR、剪藏、日记/收件箱等可选能力默认关闭，需在系统设置中开启
- 未接入代码签名，发布产物未签名；仅提供 Windows x64 安装包

</code></pre></blockcode></details>

---

## 版本 1.5.1 (2026-11-22)

> **发布状态**：**已发布**（2026-11-22）｜tag：[`release-1.5.1`](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.5.1)｜GitHub Release 资产：Windows NSIS 安装包 / portable / latest.yml / blockmap

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

> 本版本聚焦**本地 Markdown 知识库基座**：文档属性、工作区索引、标签/双链/反链、链接检查、附件管理与链接悬浮预览。仍为 Windows 平台、未代码签名产物（与 1.5.0 一致）。

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🗂️ 本地知识库基座

- **A5 文档属性**：编辑 YAML front matter（标题/日期/标签/状态/摘要/别名 + 自定义键）；保存只改文件头，正文、BOM、CRLF 保持不变
- **工作区索引层**：主进程按需扫描 `.md/.markdown/.txt`，提取标题、标签、Wiki 链接、摘要、附件引用；只索引当前工作区根，跳过忽略目录/符号链接，受文件数/大小/深度上限约束
- **B2 标签索引**：按标签聚合文件并点击打开；全文检索继续复用 A2 按需搜索，新增 `elapsedMs` 指标与慢搜索日志；1.5.1 不建持久全文索引/数据库
- **B1 Wiki 双链/反链**：解析 `[[页面]]`、`[[页面|别名]]`、`[[页面#标题]]`；展示当前文件反链；编辑器内 `Ctrl/Cmd+Click` 唯一命中打开，歧义候选选择，缺失页确认后受控创建
- **B4 链接检查/重命名**：缺失/歧义链接清单可定位来源行；重命名 Markdown 文件后自动更新其他文档中的 Wiki 链接，两阶段执行、失败不改链接
- **B5 附件管理**：附件引用审计、孤儿附件只读审计、批量移入系统回收站、事务式附件重命名 + Markdown 引用更新；不提供永久删除
- **E10 Wiki 链接悬浮预览**：悬停展示目标标题、相对路径、摘要与反链数量

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🔒 安全与工程</summary>
<blockcode><pre><code>

### 🔐 安全边界

- 新增 `FILE.GET_ATTACHMENT_AUDIT` / `TRASH_ATTACHMENTS` / `RENAME_ATTACHMENT` 三个受控 IPC：`withSenderCheck` + Path Guard + 主进程串行队列
- 孤儿删除仅使用系统回收站 `shell.trashItem`，主进程重新校验路径/类型/引用，单批 100 个/500 MiB 上限
- 附件重命名保留原编码/BOM，拒绝越界、目录、symlink、非法名与被引用附件；不做永久删除
- 工作区索引/附件操作只信任 `appState.rootPath`，渲染层不直接读盘；不新增 CSP/allowlist 例外

### ⚙️ 工程与门禁

- IPC **103 通道 / 17 组**，preload 白名单 send 69 + receive 28
- 测试 **317 文件 / 5,932 用例**；覆盖率 **93.85 / 88.42 / 94.43 / 94.20**
- typecheck / ESLint / Prettier / docs / quality / memory / audit 全绿
- E2E **28/28**；构建、体积预算、Fuses 8 项、audit、memory 检查通过
- 体积：入口 **143.2 KiB** / 首屏 **329.5 KiB** / Setup **111.36 MiB** / portable **100.49 MiB** / asar **40.97 MiB**

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">📌 已知限制</summary>
<blockcode><pre><code>

- Wiki 链接 heading 目前只打开目标文件，不跳到具体标题
- B2 无持久全文索引，全文检索继续按需扫描
- B5 不提供永久删除、只改名不移动附件；HTML `<img>`、reference 式链接、代码块内引用不参与孤儿判定
- 附件重命名后若部分来源文件写回失败，不回滚改名，界面提示需手动修复
- 未接入代码签名，发布产物未签名；仅提供 Windows x64 安装包

</code></pre></blockcode></details>

## 版本 1.5.0 (2026-11-21)

> **发布状态**：**已发布**（2026-11-21）｜tag：[`release-1.5.0`](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.5.0)｜GitHub Release 资产：Windows NSIS 安装包 / portable / latest.yml / blockmap

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

> 本版本承接 1.3.9 之后的全部分批改动（上一发布为 GitHub Release `release-1.3.9`）；各批量化明细与提交记录见 CHANGELOG.md 的 1.5.0 段。

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### ✍️ 编辑器 → 预览滚动同步

- 预览按 `data-source-line` 源行锚点定位，滚动 / 输入 / 光标移动三路触发（rAF 合帧 + 内容变化 180ms 尾随防抖 + seq 去重）
- 滚轮、PageDown、输入自动跟随；在可视区内修改不跳项；无锚点内容按比例兜底，重渲染后重放最后目标

### 🖥️ 页面填满回车时光标可见

- 工作区改为 flex 跟随父容器，修正编辑器底部高度被状态栏裁切的问题；Monaco 底部留 20px 安全距，光标位于最后一行时自动 reveal 下一行
- 新增布局契约与 E2E 回归：输入填满视口 → Ctrl+End → 回车 → 断言编辑器与光标位于状态栏上方

### 🪟 未保存关闭确认与应用内消息

- 关闭 / 退出未保存确认由 Electron 原生 `showMessageBox` 改为 BaseDialog 风格对话框（保存并关闭 / 不保存 / 取消，默认焦点保存、Esc 取消）；30s 超时、窗口销毁、渲染崩溃按取消安全侧处理，保存失败保留对话框并内联提示
- 新增通用应用内消息确认服务（requestId / 串行队列 / 30s 超时 / 异常回退原生框），替换更新安装、大文件打开等 6 处原生确认框
- 23 处浏览器 `alert()` 改为应用内消息对话框（错误 / 警告 / 成功分类）；菜单「跳转到行」的 `prompt` 改为 Monaco 原生跳行（与 Ctrl+G 同源）

### 🎛️ 对话框按钮统一

- 新增共享 `dialog-buttons.css`（30px 高 / 16px 内边距 / 4px 圆角 / 5 种变体），23 个对话框与快捷链接表单、消息对话框完成迁移，删除 4 份重复 `.btn` 样式

### 🐛 体验修复

- 主题设置首次打开主题列表为空（visible watch 补 immediate）；同步修复 Editor 设置加载、新建文件 / 文件夹默认路径回填、重命名对话框首开聚焦

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">⚡ 性能与体验</summary>
<blockcode><pre><code>

### 🌐 首屏与预览按需加载

- i18n 中英词典按语言动态加载，首屏只加载当前语言：首屏初始 JS **487.5 → 321.9 KiB（−34.0%）**（该批实测），当前体积门禁实测首屏初始 JS 338.4 KiB / 预算 512 KiB
- KaTeX 改为检测到公式才动态加载（跳过代码块）：预览首次加载静态闭包 **1,146,305 → 652,683 B（−43.1%）**，无公式文档 0 加载；KaTeX CSS 同步按需，首屏 CSS −26.3%
- highlight.js 改为 core + 精选 25 种语言，另有 52 种冷门语言按需预取：预览 chunk **−63.2%**

### 🧵 Word 导入导出与主进程启动

- Word 导入 / 导出移入 `worker_threads`（超时、崩溃、空闲回收 + 失败降级）：事件循环阻塞导入 **418.4 → 16.5 ms**、导出 **99 → 17 ms**
- 主进程 mammoth / csv-parser / turndown / markdown-it 改为首次使用时惰性加载：启动期外部依赖 **112.75 → 57.63 ms（−48.9%）**

### 📄 大文档分级降级

- > 256 KiB 或 >1 万行进入简化档（跳过 KaTeX / 图表 / 冷门语言）；>512 KiB 或 >2 万行进入渐进档（分块净化 + 首块先显示），任何降级均不绕过 DOMPurify
- 1 MB 文档首屏正文 **2325.8 → 583.5 ms（−74.9%）**，600 KB −66.6%

### 📦 安装包瘦身

- asar 排除 `jschardet/dist` 与配置示例等无用文件，asar **40.04 MiB**；Setup **111.15 MiB** / portable **100.34 MiB**，均在体积预算（115 / 101 MiB）内
- Electron locales 保持 2 个（en-US / zh-CN）；另提供 `memory:check` 内存生命周期专项检查

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🔒 安全与工程</summary>
<blockcode><pre><code>

### 🔐 安全边界

- 渲染进程从 `file://` 迁移到自定义 `app://` 协议（资源 / PlantUML / 本地图片经 Path Guard 校验），关闭 `grantFileProtocolExtraPrivileges`
- Fuses 冻结 **8 项**矩阵（禁用 runAsNode / NODE_OPTIONS / CLI inspect / cookie 加密等；启用 asar 完整性校验与 onlyLoadAppFromAsar），发布产物逐位断言 + 无调试器启动冒烟
- 默认 session 安装权限处理器且默认拒绝，仅主窗口本地受信页面放行 fullscreen / clipboard 等安全权限；在线网页窗口使用独立 session 全拒绝
- preload 收敛为受限 `ipcRenderer` + `window.api`（不再暴露 `process.env` / `webFrame` / `webUtils`），未登记通道 fail-closed；生产 CSP 移除 `'unsafe-eval'` 与 localhost
- 工作区根改为主进程受信登记（realpath + LRU 上限 50），敏感目录黑名单保留；渲染层入口只做只读判定

### ⚙️ 工程与门禁

- CI 与发布流水线对齐：typecheck、ESLint 0 warning、Prettier、vitest 覆盖率、docs:check、质量基线、audit:all、budget:check、Fuses 校验逐条独立步骤
- 发布流程：按 tag 检出并校验 tag ↔ package.json ↔ appVersion 三方一致；按版本精确匹配产物并校验 tag 维度 latest.yml
- 供应链与权限：第三方 actions 锁定 40 位 SHA；workflow 最小权限 + 发布单点并发；新增 PR 级 dependency-review
- 新增首屏体积预算（入口 + modulepreload 静态闭包 ≤512 KiB）、全量依赖审计（含 dev）、启动稳定性量化 job 与性能基线快照

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">📦 依赖升级</summary>
<blockcode><pre><code>

### ⬆️ 已升级

- ESLint **9 → 10.15.0**（eslint-plugin-vue 10.12.1、@electron-toolkit/eslint-config 3、eslint-config-ts 4），ESLint 10 新规则命中的 30 条存量 warning 全部清零
- @types/node **22 → 26.6.6**（encrypt-decrypt 适配 Cipheriv / Decipheriv）
- Vitest / @vitest/coverage-v8 **4 → 5.1.1**（Node 26 下改用 threads 池 + testTimeout 15s）
- electron-store **11 → 12**（ESM-only 适配，打包启动验证）、jschardet **3 → 4.1.0**
- vue **3.5.45 → 3.5.46**、Vite 8.3.8、TypeScript 6.0.3、Monaco 0.57.0、markdown-it 15.0.3、Mermaid 12.3.0
- 开发环境 Node 升级至 **26.13.1**；`engines.node` 基线仍为 `>=22`，CI / 发布流水线使用 Node 22

### ⏸️ 评估后暂缓（保持当前版本）

- TypeScript 7：与 vue-tsc 不兼容，保留 6.0.3
- Electron 45：dev E2E 的 userData / 欢迎页时序不稳定，保留 43.8.12
- jsdom 31：CSSOM 简写序列化与游离 DOM computedStyle 行为变更导致 3 文件 / 5 用例失败，保留 29.1.1
- KaTeX 0.19.1：mermaid 12.3.0 锁定 `katex ^0.18`，升级产生双份 KaTeX chunk（+487.6 KiB）且 0.19 含 strict 行为破坏性变更，保留 0.18.x

</code></pre></blockcode></details>

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">✅ 门禁与已知限制</summary>
<blockcode><pre><code>

### ✅ 门禁（2026-11-21 实测）

- 类型检查：TypeScript / Vue 四个工程（node / web / test / e2e）**0 错误**
- 测试：**266 文件 / 4,714 用例**（4,711 passed / 3 skipped）；全量覆盖率 **stmts 95.04% / branch 89.77% / func 94.42% / line 95.31%**
- ESLint **0 error / 0 warning**；Prettier 全绿；`docs:check` 断链 0
- E2E **28/28** 通过（含关闭确认、滚动同步、编辑器底部、启动恢复、主题首开等）
- 依赖审计（全量含 dev）**0 漏洞**；体积预算 **9/9 通过**；Fuses **8/8** 与发布矩阵一致
- 安装包实测：Setup **111.15 MiB** / portable **100.34 MiB** / asar **40.04 MiB**

### ⚠️ 已知限制

- **未代码签名**：当前构建未配置代码签名证书，Windows 可能出现 SmartScreen 提示；本说明不声称已签名发布
- **发布状态**：已于 2026-11-21 发布（tag `release-1.5.0`；资产：Windows NSIS 安装包 / portable / latest.yml / blockmap）
- **Electron 上游启动竞态**：sandboxed preload 在首次导航偶发未注入（Electron 上游 mojo 竞态），E2E 侧以 `page.reload()` 恢复并由启动稳定性量化 job 以零进程重启把关，非产品逻辑缺陷
- 完整逐批明细与限制见 [CHANGELOG.md](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

</code></pre></blockcode></details>

---

## 版本 1.3.9 (2026-11-20)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

> 1.3.9 承接 tag release-1.3.8 之后的全部修改（原 1.3.10 草稿已合并归入本版本）。

### 📦 安装包与 E2E

- Electron locales 55 → 2：Setup 109.98 MiB（−6.76%）、portable 99.83 MiB（−6.73%）、win-unpacked −45.56 MiB
- CI 体积预算（bundle-budget）；E2E 补启动恢复/设置持久化/打包启动 + coverage artifact
- E2E preload 偶发未注入定位为 Electron 上游 mojo 竞态，增加 reload 恢复（单轮 9/9、repeat 18/18）

### ⚡ 性能与修复

- 启动性能基线（开发 585.8ms / 打包 535.2ms preview-ready）+ 打包版冷启动数据
- 修复预览 renderSequence TDZ、设置首开不回填、InsertImageDialog 只读 computed
- 存量清理 + docs 链接检查（742 链接 / 断链 0）；prettier 3.10.1、vue-tsc 3.3.14

### 🌐 i18n 与可访问性

- 补齐中英文 key、替换硬编码文案；BaseDialog ARIA/焦点陷阱/嵌套对话框栈 + 测试

### 🧭 体验修复

- HTML 查看器顶部导航跳转后导航消失/路径不切换 → 拦截本地 .html 走查看器加载器
- 自动保存默认关闭（用户自行开启；schema v3 迁移旧默认 true）
- 关闭/退出未保存修改 → 「保存并关闭 / 不保存 / 取消」确认框，取消不关闭

### ✅ 门禁

- typecheck 0 / ESLint 0 / Prettier 全绿 / vitest 185 文件 / 3,396 用例 / build 成功

</code></pre></blockcode></details>

---

## 版本 1.3.8 (2026-11-19)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🧱 结构优化第 1 批（结构防御）

- **H1 依赖边界自动化**：utils→config 反向依赖清零 + 依赖方向架构测试（0 violation）
- **H2 preload 白名单单一化**：由 shared 契约生成白名单（58/25/6/2+1），编译期穷尽性断言 + `--check` 防漂移
- **L4 shared 边界收口**：backup-dir 移除 node:path 注入化 + ESLint/架构测试硬约束
- 门禁：typecheck 0 / ESLint 0 / vitest 174 文件 / 3,224 用例全通过 / build 成功

### 🔧 版本维护

- 版本号 **1.3.7 → 1.3.8**
- **1.3.7 已发布**：GitHub Release `release-1.3.7`（NSIS 118.42 MiB / portable 107.46 MiB / latest.yml / blockmap），自动更新源可用
- **1.3.6 tag 补齐**：`release-1.3.6` → 提交 `506e78a`
- 文档版本标注、版本历史与报告索引同步；HTML 报告重生成

### 🧱 结构优化第 2 批（运行时收敛）

- **双对话框收敛**：主进程 JSDOM 对话框全部迁移 Vue + BaseDialog，新建文件/文件夹双路径消除
- **主界面二级分块**：入口 127.2 kB / 主界面壳 316.3 kB，Monaco 与预览改为独立按需 chunk（壳原 9.89 MB）
- **jsdom 边界**：主进程 out/main 10.50 MiB → 0.60 MiB（-94.3%），jsdom 仅保留测试环境
- **AppContext + IPC registry**：全局状态集中/reset，64 处 IPC 注册收口为单一 `registerAll`
- 门禁：typecheck 0 / ESLint 0 / vitest 169 文件 / 3,234 用例全通过

### ⚙️ 结构优化第 3 批（工程门禁与发布）

- 质量基线脚本 + CI 自动校验（版本/IPC/测试/dist 产物）
- CI 增补 Coverage / Prettier / 生产依赖 audit；release-* tag 触发发布 workflow（构建→GitHub Release→latest.yml 验证）

### 🧱 结构优化第 4 批（真源收敛）

- 主题单真源 useTheme；EventBus 统一 + 24 事件契约；错误/状态栏 helper 收敛；CSS/KaTeX 资产收口 + 死资源清理
- 门禁：typecheck 0 / ESLint 0 / vitest 172 文件 / 3,272 用例全通过

### 🧹 结构优化第 5 批（清理与规范 + M3 manifest）

- **L1**：删除 `utils/common.ts` 死文件与 `SYSTEM.OPEN_EXTERNAL_LINK` 死通道；`window-manager` 迁 `src/main/window/`
- **L2**：`.editorconfig` / Prettier / 新增 `.gitattributes` 统一 LF；修复 3 个含 U+FFFD 替换字符的文件
- **L3**：`installer.nsh`、两个 `.bat`、`build-win.ps1` 治理（能力并入 `prepare-build-dirs.js --exec`）；`docs/架构文档.html` 归档「非当前」；`_unused-assets` 287 文件移出；根目录 ico/log/tsbuildinfo/空目录清理
- **巨型文件**：`pinyin-data` 20,914 行迁 `src/renderer/src/data/` 并动态 import 按需加载（独立 chunk 165.8 KB）
- **M3**：Material 15 项语法收敛 `shared/constants/material-syntax.ts` 单一 manifest（菜单由 manifest 生成 + 4 条一致性测试）
- 门禁：typecheck 三工程 0 错误、ESLint 0/0、Prettier 全绿、electron-vite build 成功、vitest 171 文件 / 3,265 用例全通过

</code></pre></blockcode></details>

---

## 版本 1.3.7 (2026-11-19)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🧩 公共接口归位（第 0~4 批）

- 新建 `shared/utils`（11 模块）+ `shared/constants`（10 模块）+ `shared/types` 契约层（IPC 载荷 58/26/25、CONFIG 8、对话框/文件树/主题族）
- 渲染层组件化：BaseDialog **18/18** 对话框迁移、WindowControls、FileViewerShell + useFileViewerState、TextCodecTool、preview-block-utils
- 主进程/渲染层 60+ 文件迁移至 shared（re-export 门面 + 原导出名，调用点零改动），净减约 4,000+ 行重复代码

### ⚡ 性能：主界面异步分块

- 入口 chunk **10,096KB → 114KB（-98.9%）**；初始加载 10,541KB → **604KB（-94.3%）**
- Monaco / highlight.js / KaTeX 与渲染管线移入主界面异步 chunk（≈9,644KB）；启动恢复时序修正

### 🛡️ 安全与稳定性

- PDF 预览改用 **pdf.js**（按需异步、独立 chunk 802KB），CSP 收紧（object-src / base-uri / form-action / frame-src）并新增契约测试
- preload 主窗口受限 ipcRenderer 白名单（57/26）、dialog 接收白名单（仅 THEME_UPDATED）、JSDOM 对话框严格 CSP
- IPC 常量分组统一 **17 组**；PlantUML 隐藏窗空闲销毁；死通道清理；欢迎页关闭延迟 / 最大化二次点击修复；报告 HTML 查看器相对链接修复

### 🧪 工程与测试

- **E2E 纳入 CI**（并行 e2e job + Playwright 冒烟增强）；新增 `.github/workflows/ci.yml`（typecheck + ESLint + Vitest）
- 实测门禁：typecheck 三工程 0 错误、ESLint 0/0、vitest **171 文件 / 3,198 用例全通过**、E2E 4 passed、electron-vite build 通过

### 📚 文档体系

- 报告归档重构为 **HTML Wiki**（23 页，固定导航 + 悬浮目录 + 侧边栏）；新增《代码整体结构分析报告》（5 张 SVG 架构图）、《公共接口归位修复计划》、《当前遗留问题清单》台账
- README / 报告索引 / docs wiki / 台账统一到最新实测口径

</code></pre></blockcode></details>

---

## 版本 1.3.6 (2026-11-15)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🔧 审查修复批次（本版核心）

- 对 1.3.0~1.3.5 新增内容（插件工具 / mkdocs-material 扩展 / 系统设置补充实现）全量代码审查，32 项问题修复 25 项（P1/P2 全部 + 12 项 P3）：
    - **稳定性**：正则测试回归后台线程（Worker + 3s 超时自动中止），极端正则不再冻结应用；自动备份改为异步执行，不再阻塞主进程
    - **插件工具**：人民币大写超长金额精度修复；繁简转换/进制转换/字数统计性能优化；剪贴板操作失败有提示
    - **系统设置**：自动备份与托盘最小化默认关闭（可选开启）；新增单实例保护；启动恢复更可靠；备份文件冲突与超大文件保护
    - **性能**：图标数据拆出首屏主包
- 门禁：typecheck 0 错误、ESLint 0/0、153 文件 / 2789 用例全通过
- 详情见 [新增内容审查报告](docs/reports/md/01-检查与扫描/全量扫描与审查报告.md)

</code></pre></blockcode></details>

---

## 版本 1.3.5 (2026-11-15)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🧩 菜鸟常用工具插件集成

- 阅读菜鸟工具镜像站（www.jyshare.com）前端工具区源码，将 18 个适合离线使用的常用工具移植为本地插件（插件工具总数 19 → 37，全部按需懒加载）：
    - **编解码**：Base64 / URL / HTML 实体 / Unicode 与中文互转 / 图片转 Base64
    - **格式转换**：颜色转换（RGB/HEX/HSL/HSV/CMYK 互转）/ 单位换算（长度 + 存储）/ 人民币大写 / 时间戳 / 进制转换
    - **文本工具**：繁简互转 / 汉字转拼音 / 字数统计 / 文本比对
    - **格式化与解析**：JSON 工具（格式化/压缩/转义）/ XML 格式化 / 正则表达式测试
    - **常用小工具**：随机生成器（密码/字符串/数字/颜色）/ 在线计算器
- 全部零第三方依赖、纯前端离线可用；修复原站 CMYK→RGB 与 JSON 去转义缺陷，随机数改用 crypto 无偏采样
- 新增 154 个单元测试用例；SQL 格式化（原站服务端实现）、中国日历等依赖在线服务或大体积库的工具未集成（见实施报告）

</code></pre></blockcode></details>

---

## 版本 1.3.3 (2026-11-15)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### ✨ mkdocs-material 扩展语法（15 项）

- 折叠提示块 `??? note` / `???+`（details，默认展开可配置）
- 任务列表、高亮 `==`、插入 `^^`、删除 `~~`、critic 标记、上标/下标、键盘按键 `<kbd>`
- 属性列表（按钮 `.md-button`、对齐、标题 id）、脚注、定义列表
- Grid cards（`<div class="grid cards" markdown>`，内部 Markdown 递归解析）
- 代码块增强（`linenums` 行号 / `hl_lines` 高亮行 / `title` 文件名 / 行内高亮）
- Material 图标 `:material-*:`（内置 264 个常用图标子集）
- pymdownx.blocks（`/// note` / `/// tabbed` / `/// details`）
- snippets 文件片段 `--8<-- "file.md"`（相对活动文件、行号区间、安全边界限制）
- 标签页深链 `#__tabbed_<set>_<n>`（点击自动切换）
- **插入 → Material 菜单**：15 个语法插入入口 + 统一插入对话框（左侧功能列表 + 数据驱动表单 + 实时 Markdown 预览，点击菜单自动定位对应语法）

### 🧩 工程

- 扩展插件化：3 个独立插件模块 + 统一注册入口，markdown-it 原生 rule 实现
- 与 DOMPurify 消毒配置完全兼容；snippets 复用既有 IPC 读取通道，无新增通道
- 扩展相关 270 个测试用例通过；可视化样例：`out/tool-results/mdx-features-preview.html`

</code></pre></blockcode></details>

---

## 版本 1.3.2 (2026-11-15)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### ✨ AI 导航菜单

- 菜单栏新增「AI 导航」顶层菜单（位于「在线」之后、「GitHub」之前）
- 按 9 个分类收录 **70 个主流 AI 工具入口**，链接整理自菜鸟工具 AI 导航，全部为官方干净地址（https、已去除推广/返利参数）：
    - 热门 AI（ChatGPT、DeepSeek、豆包、Kimi、通义千问、Claude、Gemini 等 14 项）
    - AI 编程（Cursor、TRAE、Qoder、GitHub Copilot、OpenCode 等 9 项）
    - AI 作图（Midjourney、Stable Diffusion、Leonardo、Canva 等 10 项）
    - AI 写作 / 办公 / 影音 / 智能体 / 模型与榜单 / 更多工具 共 47 项
- 复用既有安全外开链路，未新增 IPC 通道；菜单相关 205 个用例通过

</code></pre></blockcode></details>

---

## 版本 1.3.1 (2026-11-15)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🔧 系统设置项补充实现

- 系统设置对话框中 9 项「暂无对应功能实现」的禁用设置项已全部实现并启用：
    - 启动恢复上次文件/目录、开机自启动、记住窗口位置大小、最近文件列表数量
    - 关闭时最小化到系统托盘（托盘菜单可恢复/退出）
    - 跟随系统主题（切换系统深浅色即时生效，手动切换主题自动关闭跟随）
    - 自动备份（按间隔备份活动文件与工作区 .md，按保留数量滚动清理）
    - 应用主题下拉改为当前主题只读显示 + 「打开主题设置」入口
- 实现方案与验收见 [17-系统设置补充实现计划](docs/reports/md/02-修复与实施/系统设置补充实现.md)

</code></pre></blockcode></details>

---

## 版本 1.3.0 (2026-11-15)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

`BaiZeNotes_1.3.0_windows_x64.exe` 是免安装直接使用
`BaiZeNotes_Setup_1.3.0_windows_x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🔒 安全加固（本版核心）

- **P0 攻击链闭环**：预览 DOMPurify 消毒 + 主进程 IPC sender/路径双重校验（Path Guard + 受信目录）+ 远程窗口去特权 preload；恶意 Markdown 无法再执行脚本或本地程序
- **纵深防御**：导航边界守卫、外链 http/https 白名单、拖拽拦截、CSP、HTML 查看器 sandbox 收窄、日志脱敏
- **已知**：主窗口 preload 白名单化留待下批次（当前由主进程校验兜底）

### 🌐 国际化（i18n）

- 中英双语完整支持，系统设置切换后即时生效；菜单、状态栏、对话框、编辑器全量覆盖

### ⚡ 性能

- **预览提速**：本地单跳渲染（IPC 4 跳→0）+ 行内代码高亮修复（16KiB 文档 232.8ms→1.55ms，约 124×）+ KaTeX 缓存
- **目录刷新**：fs.watch 增量重扫（单文件变更 28.6ms→1.5ms）
- **包体积**：安装包 233MB → 109.8MB（-53%）
- **击键**：500ms 防抖 + 脏指纹，未变化不传不存
- **mkdocs-material 语法插件化**：`!!!` 提示块与 `===` 标签页改为 markdown-it 原生插件解析，嵌套组合渲染正确

### 🖼️ 本地图片预览修复

- 修复 Markdown 相对路径图片（`images/xxx.png` 等同目录图片）在预览区不显示的问题
- 预览层将相对路径解析为活动文件目录下的 `file:///` 绝对 URL，并同步放行 DOMPurify 白名单与 CSP 的 `file:` 协议

### 💾 数据安全

- 统一脏标记贯穿保存/关闭/重载/退出；关闭/退出不再丢失修改
- 文件编码探测与按原编码写回（GBK 文件不再被覆盖成乱码）
- 自动保存开关/间隔修复；磁盘重载不再覆盖未保存修改；写作模板改为插入

### 🏗️ 架构与质量

- IPC 通道唯一真源（123→86）、注册一次性化、监听台账全纳管、菜单/插件对齐、配置单真源
- 质量门禁：类型检查三工程 0 错误、ESLint 0 error/0 warning、全量与生产依赖 audit 均 0 漏洞
- 测试：3 个文件 21 例 → **133 文件 2243 用例全通过**
- 死代码清理 10,403 行；主进程产物 -44%
- 应用内帮助页同步 1.3.0：技术栈信息、关于页面、版本发布说明（新增 v1.3.0 条目）

### 📦 技术栈

- Electron 43.8.10 + Vue 3.5.45 + TypeScript 6.0.3 + Monaco Editor 0.57.0 + markdown-it 15.0.3 + mermaid 12.3.0 + Vite 8.3.8

### 🔒 2026-11-14 修复批次（详细）

- **安全止血**：预览链路接入 DOMPurify 消毒；渲染页新增 CSP 安全策略；IPC 通道校验（可执行文件白名单、preload send 白名单、configName 白名单）；mermaid 渲染窗口去除远程 CDN
- **数据安全**：统一 dirty 标记与保存落盘（关闭/退出前拦截、保存失败可见）；文件编码探测与按原编码写回；磁盘重载脏状态保护；配置损坏容错备份重建；对话框 IPC 监听器 closed 兜底清理；新增 25 个单元测试
- **质量门禁**：ESLint 迁移 flat config（eslint.config.js），删除旧式 .eslintrc.cjs/.eslintignore；清理 8 处 @ts-ignore / as any；删除零引用死代码
- **性能**：击键同步 500ms 防抖 + 脏标记；mermaid 按内容 hash 缓存；logger 文件大小缓存；Monaco 主题按需读取
- **架构收口**：IPC 注册一次性化；菜单动作 id 对齐；插件菜单未实现项隐藏
- **依赖升级与漏洞清零**：移除零引用死依赖 8 个；升级 electron 43.8.10、vue 3.5.45、markdown-it 15.0.3、monaco-editor 0.57.0、mermaid 12.3.0；npm audit 生产依赖 15 漏洞 → 0
- **文档与发布**：README 关键数据按实测重写；打包配置校正；version.json 生成链修复；dist 旧版本清理

### 🌐 2026-11-15 架构治理批次（详细）

- **国际化（i18n）**：中英双语；词典统一在 `src/shared/i18n`（12 个命名空间），渲染层 `t()` + 主进程 `tMain()`，系统设置切换后即时生效
- **预览本地单跳渲染（PF-02）**：预览渲染全部在渲染进程完成，主进程渲染 IPC 由 4 跳降为 0；主进程 4 个渲染器与 4 个渲染通道删除
- **PlantUML 本地渲染（PF-08）**：内置 teaVM 离线渲染，弱网/离线可用；资源缺失时自动降级远程渲染
- **IPC 通道命名统一**：123 → 86 个通道，统一 `baize:<domain>:<name>`；死通道与 Mermaid 隐藏窗口半死链路清理
- **P0/P1 安全加固**：导航拦截、shell 协议白名单（仅 http/https）、preload 通道白名单、拖拽拦截、CSP、DOMPurify、HTML 查看器 sandbox 收窄
- **死代码清理**：删除 36 个零引用文件 / 10,403 行，主进程产物 `out/main/index.js` 体积 -44.97%
- **复扫收口**：6 维度全量复扫结论 105 项完全修复 / 22 项部分修复 / 0 未处理，详见 [2026-11-15-晚-全量复扫结果](docs/reports/md/01-检查与扫描/全量扫描与审查报告.md)

### ⚠️ 已知问题

- 自动更新源未配置（example.com 占位，菜单会诚实提示）；配置存储目录未完全收敛；主窗口 preload 白名单化留待下批次（当前由主进程校验兜底）
- 详情见 [2026-11-15-晚-全量复扫结果](docs/reports/md/01-检查与扫描/全量扫描与审查报告.md)

</code></pre></blockcode></details>

---

## 版本 1.2.2 (2026-08-22 发布)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

`BaiZeNotes_1.2.2_windows_x64.exe` 是免安装直接使用
`BaiZeNotes_Setup_1.2.2_windows_x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🚀 原始发布：Electron 43 重大升级

- Electron 38 → 43，跨 5 个大版本升级
- 同步升级 40+ 依赖包到最新版本
- 修复 78 个 TypeScript 类型错误
- 修复 3 个 XSS 安全风险
- 新增"更新日志"对话框与版本发布子菜单；关于页面新增 Monaco Editor 和 markdown-it 版本显示

> 注：2026-11-14 / 2026-11-15 的修复批次已归入 [版本 1.3.0](#版本-130-2026-11-15)。

</code></pre></blockcode></details>

---

## 版本 1.2.1 (2026-08-16)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

`Bai Ze Notes 1.2.1 windows.x64.exe` 是免安装直接使用
`Bai Ze Notes Setup 1.2.1 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🚀 核心功能

**全量代码扫描与优化**

- 使用 Deepseek 对项目进行全量代码扫描
- 修复多个 bug 和缺陷
- 代码质量全面提升

**架构优化**

- 文档更新，架构优化
- 优化项目结构和代码组织

### 🐛 Bug 修复

- 修复多个编译和运行时缺陷
- 修复进程残留问题
- 修复文件重新打开后未加载最新内容问题
- 修复从磁盘重新加载后文件内容未更新问题

### 🔧 代码质量改进

- 全量代码扫描优化
- 统一代码风格
- 提升代码可维护性

</code></pre></blockcode></details>

---

## 版本 1.2.0 (2026-05-10)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

`Bai Ze Notes 1.2.0 windows.x64.exe` 是免安装直接使用
`Bai Ze Notes Setup 1.2.0 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🚀 核心功能

**对话框架构重大更新**

- 将部分对话框从 JSDOM 转换为 Vue 对话框
- 项目架构变更，消息处理逻辑重构
- IPC 通信优化，对话框组件更新

**主题与图标**

- 新增四个主题
- 应用图标全面更新
- 主题设置支持选择后立即更新，无需重启

**配置管理优化**

- 优化配置文件管理和打包结构
- 删除不使用的文件，清理项目

### 🐛 Bug 修复

**进程与文件修复**

- 修复进程残留问题
- 修复文件重新打开后，未加载最新内容问题
- 修复从磁盘重新加载后，文件内容未更新问题

### 🔧 代码质量改进

- 对话框组件从 JSDOM 迁移到 Vue 组件
- 消息处理逻辑重构
- IPC 通信机制优化
- 项目架构整体变更

</code></pre></blockcode></details>

---

## 版本 1.1.5 (2026-05-01)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

`Bai Ze Notes 1.1.5 windows.x64.exe` 是免安装直接使用
`Bai Ze Notes Setup 1.1.5 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🚀 核心功能

**配置管理系统**

- 新增用户配置目录 `.baizenotes`，支持多用户独立配置
- 统一配置文件管理，提供类型安全的 API

**卸载体验优化**

- 卸载时询问是否保留配置文件，提供更友好的卸载体验

**文件状态管理**

- 自动保存文件和目录状态，应用重启后自动恢复工作状态
- 状态栏实时显示文件保存状态（已保存/未保存）

**HTML/PDF 支持**

- 新增 HTML 查看和 PDF 编辑器组件，支持直接预览和编辑

**日志系统**

- 新增多级别日志模块（DEBUG, INFO, WARN, ERROR）
- 支持日志文件自动轮转和归档

**窗口管理**

- 新增窗口管理器，支持模态/非模态窗口控制和状态监控

**IPC 监听器管理**

- 新增 IPC 监听器管理器，自动清理机制防止内存泄漏

**快捷键系统**

- 新增快捷键注册模块，支持全局快捷键绑定和冲突检测

### ⚡ 性能优化

**编辑器性能**

- 大文件加载速度提升 50%+
- 内存使用减少 40%
- Monaco Editor 实例管理优化，防止内存泄漏

**Mermaid 渲染**

- 多图表并行渲染，速度提升 3倍
- 图表渲染结果缓存，按需渲染

**EventBus 优化**

- 组件卸载时自动清理事件监听器
- 修复事件监听器残留导致的内存泄漏

**状态管理**

- 使用 electron-store 进行状态持久化
- 分离持久化状态和运行时状态

### 🎨 UI/UX 改进

**主题系统**

- 新增 55 种 Monaco 编辑器主题
- 主题文件移至 `resources/themes/monaco-themes/themes/`
- 从 JSON 文件动态加载主题配置

**预览区域**

- 增加垂直滚动条显示
- 优化滚动流畅度

**状态栏**

- 实时显示文件保存状态
- 未保存/已保存状态可视化区分

**右侧导航**

- 新增 NaviTab 组件，提供快速访问常用功能

### 🐛 重要修复

**内存泄漏修复（严重）**

- 修复 Vue 3 生命周期钩子嵌套调用问题
- 修复 Monaco Editor 实例未释放问题（30-50 MB/个）
- 修复 EventBus 事件监听器残留问题
- 修复窗口事件监听器残留问题
- 修复 IPC 监听器未清理问题

**文件保存修复**

- 修复文件保存失败 bug
- 修复文件编码保存问题

**渲染问题修复**

- 修复 Mermaid 图表渲染失败问题
- 优化 Material 图标渲染

**其他修复**

- 修复文件新增时默认插入内容问题
- 修复主题样式不正确应用问题
- 修复主题切换后菜单栏颜色不同步问题
- 修复编辑器布局错位问题
- 修复文件无法保存问题

### 🔧 代码质量

**TypeScript 改进**

- 新增多个类型定义文件
- 提供完整的类型安全 API

**代码重构**

- 优化组件生命周期管理
- 改进错误处理机制
- 统一代码风格

### 📦 依赖更新

- 新增 renderer 依赖 (v0.1.5)
- Monaco Editor 更新至 0.55.0

</code></pre></blockcode></details>

---

## 版本 1.1.3 (2026-04-26)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

`Bai Ze Notes 1.1.3 windows.x64.exe` 是免安装直接使用
`Bai Ze Notes Setup 1.1.3 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译
<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>
<h3>🚀 核心功能</h3>
<ul>
<li><strong>文件自动保存</strong>：实现自动保存机制，默认周期60秒，状态栏实时显示保存状态</li>
<li><strong>HTML/PDF 支持</strong>：新增 HTML 查看和 PDF 编辑器组件，支持直接预览和编辑</li>
<li><strong>日志系统</strong>：新增多级别日志模块，支持日志文件自动轮转和归档</li>
<li><strong>窗口管理</strong>：新增窗口管理器，支持模态/非模态窗口控制和状态监控</li>
</ul>
</code></pre></blockcode></details>

---

## 版本 1.0.1 (2026-03-08)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)

`Bai Ze Notes 1.0.1 windows.x64.exe` 是免安装直接使用
`Bai Ze Notes Setup 1.0.1 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>
### ✨ 新增功能
- 支持安装目录由用户自定义选中
- 支持快速链接用户自定义：**设置->快速链接设置**
- 更新项目说明 README.md
- 补充项目设计文档，参考 `\doc` 目录
- 更新工具图标（使用 `Codearts Agent` 生成）
</code></pre></blockcode></details>

---

## 下载地址

### Windows 平台

- **免安装版**：Bai Ze Notes [版本号] windows.x64.exe
- **安装版**：Bai Ze Notes Setup [版本号] windows.x64.exe

### 其他平台

- Linux、macOS、HarmonyOS 版本可自行下载编译

---

## 版本说明

### 版本命名规则

- 主版本号.次版本号.修订号
- 主版本号：重大架构变更或不兼容更新
- 次版本号：新增功能或重要优化
- 修订号：Bug修复和小幅优化

### 更新频率

- 重大更新：不定期，根据功能开发进度
- 功能更新：每月1-2次
- Bug修复：根据问题严重程度及时发布

---

## 技术栈

- **Electron**: 43.8.12
- **Vue 3**: 3.5.46
- **TypeScript**: 6.0.3
- **Vite**: 8.3.8
- **Monaco Editor**: 0.57.0
- **markdown-it**: 15.0.3
- **Mermaid**: 12.3.0

---

**最后更新时间**: 2026-11-21
**当前版本**: 1.5.0
**维护者**: hemy08
