# ECC 能力驱动的项目优化方案

> 更新于 2026-11-27　|　适用版本基线：**v1.5.3（开发中；最新发布 tag `release-1.5.1`）**　|　性质：**只读方案（本阶段不改代码）**
> 方法来源：ECC 五个技能（`contract-first`、`module-governance`、`design-system`、`click-path-audit`、`architecture-decision-records`）的方法论，与项目既有《开发规范》（215 条）和门禁体系衔接。

## 0. 结论先行

- 项目已经具备**半套**方法论基础：IPC 三张契约表 + 契约测试、ADR-001~012（内嵌架构文档）、主题 CSS 变量单真源（20 变量 × 28 主题）、319 项菜单动作与 49 个 UI 状态测试、13 个 E2E spec。
- **缺口不在"有没有意识"，而在"是否形成可机器校验的工件"**：
  1. 契约是 TypeScript 类型 + 测试断言，没有独立 schema 工件与消费者 fixture 生成/派生；
  2. ADR 没独立目录与索引，和架构文档耦合，新增决策无固定入口；
  3. 设计令牌没有 `design-tokens.json` 与 `DESIGN.md`，且"禁硬编码主题色"没有门禁；
  4. 模块没有 local agent 说明（MODULE.md），新模块无合规检查；
  5. 交互链路没有"触控点 → 状态序列 → 期望终态"矩阵，组合态 bug 依赖经验发现。
- 五个方向按 **P0（1~2 天）/ P1（约 1 周）/ P2（2~3 周）** 分批，全部可增量落地、可回滚，且**不新增运行时依赖、不改业务逻辑**。

## 1. 现状盘点（只读实测）

| 方向 | 现状证据 | 结论 |
| --- | --- | --- |
| 契约 | `src/shared/types/ipc.ts` 三表（Requests 72 / Responses 39 / Events 28 量级）+ `tests/unit/ipc-payload-contract.test.ts` 做「契约 ↔ IPC 常量 ↔ preload 白名单 ↔ 注册点」双向核对；另有 `domain-contract`、`theme-contract`、`file-tree-contract`、`viewer-layout-contract`、`dialog-contract`、`event-bus-contract` | 已有契约测试，但无**独立 schema 工件**、无消费者 fixture、无契约变更协议 |
| 模块治理 | `src/renderer/src/components/` 9 个目录 + `src/main` 各域；`tests/architecture/dependency-boundaries.test.ts` 固化依赖方向；`docs/wiki/03-功能说明/` 5 篇功能文档 | 有边界测试与功能文档，但**无逐模块 MODULE.md**（职责/接口/陷阱/领域链接），新模块无合规检查 |
| 设计系统 | `useTheme.ts:87` 的 `THEME_CSS_VARIABLE_BINDINGS`（20 变量）+ `theme-config.ts` 28 套主题 + `plugin-tools-theme.css`；`theme-contract.test.ts` 守护三处一致 | 令牌散落在代码与 CSS，**无 tokens 工件/理由文档/一致性评分**；UI-01"禁硬编码"无门禁 |
| 交互链路 | **300+ 个可触发项**（1.5.3 菜单重组后）、48 个对话框 `.vue`（含面板子组件）、命令面板 20+ 条命令、13 个 E2E spec、**50 个** UI 状态/交互测试文件；1.5.3 新增「非模态工具窗（Mermaid/表格/插入与编辑工具）」与「表格电子表格化编辑」链路 | 单点覆盖好，**缺组合态矩阵**（"单独可用、组合后终态错误"类 bug 无系统防线） |
| ADR | `docs/adr/` 不存在；ADR-001~012 内嵌 `架构文档.md`（约 1476 行起） | 决策记录完备但**无独立目录、索引、模板与新增流程** |

## 2. 五个方向的优化项

### 2.1 方向 A：contract-first —— 契约工件化（5 类边界）

**边界清单与工件选择**（每个边界一个权威工件，禁止多副本）：

| # | 边界 | 权威工件 | 当前载体 | 消费者 |
| --- | --- | --- | --- | --- |
| A1 | IPC 通道载荷 | `contracts/ipc/*.schema.json`（由 `shared/types/ipc.ts` 派生，JSON Schema 2020-12） | 三张 TS 表 | 主进程 handler、preload 白名单、渲染层调用点、测试 fixture |
| A2 | 配置数据（8 个 configName） | `contracts/config/*.schema.json` + `validateConfigData` | `config-schema.ts` 手写校验 | useConfigStore、主进程 config-manager、备份/恢复 |
| A3 | 主题样式契约 | `contracts/theme/theme-styles.schema.json` + `tokens`（见方向 C） | `ThemeStyles` 类型 + 20 变量映射 | 28 主题数据、useTheme、theme-contract 测试 |
| A4 | i18n 词典契约 | `contracts/i18n/dictionary.schema.json` | 门禁测试（叶子键对称/占位符/无中文） | 词典文件、静态引用扫描、构建拆包 |
| A5 | 新增文件格式（PDF 标注 sidecar、剪藏 front matter） | `contracts/files/*.schema.json` | `pdf-annotations.ts` 的 `normalizePdfAnnotations`、`clip-capture.ts` | 主进程读写、渲染层面板、sidecar 兼容 |

**交付物**：
1. `contracts/` 目录：每边界 `schema.json` + `README.md`（消费者 job、字段语义：必填/可空/枚举/错误形状、变更记录）。
2. `scripts/verify-contracts.mjs`（或 `build/` 下，与现有门禁同风格）：**四向校验**——schema ↔ 实现（类型/校验函数）↔ preload/白名单或词典 ↔ 测试 fixture；输出漂移清单，退出码门禁化。
3. `tests/unit/contract-fixtures.test.ts`：由 schema 生成的边界 fixture（合法/非法样本）反向校验实现。
4. 契约变更协议（写入开发规范）：**先改工件 → 评审 diff → 再生 fixture → 改实现 → 双端验证 → 合并**；破坏性变更必须带迁移/版本策略。
5. 语义约束补全：为 A1/A2 补齐"必填/可空/枚举/错误 code"说明（例如 `OpenOrCreateEntryResult.reason` 枚举、`OcrErrorCode` 九码、配置字段范围）。

**验收标准**：5 边界 100% 有 schema 工件；`contracts:check` 0 漂移；每个边界 ≥2 组合法/≥2 组非法 fixture；契约变更 100% 走协议（ADR 记录）。
**风险**：schema 与 TS 类型双写漂移 → 用"类型即真源、schema 派生 + 反向校验"而非手写两份。**预估**：A1/A5 P1 先做（3 人日），A2/A3/A4 P2。

### 2.2 方向 B：module-governance —— 模块治理（9+ 个模块）

**模块清单**（渲染层 9 + 主进程 6 域）：Markdown（编辑器/预览）、MenuBar、PluginTools、HemiTools、dialogs、search（命令面板）、WorkSpaceArea、WelcomeScreen、其余壳层；主进程：ipc 域、config、file-utils、ocr、pdf-annotations、capture。

**交付物**：
1. 每模块 `MODULE.md`：职责一句话、入口文件、**依赖方向（可被架构测试核对）**、对外接口（IPC 通道/id/事件）、领域上下文链接（相关 wiki 页/ADR/开发规范条目）、验收命令、已知陷阱（如"主题广播必须重读配置"）。
2. `docs/wiki/03-功能说明/模块治理索引.md`：模块 → 文档 → 接口 → 测试 的一表总览。
3. 门禁扩展：新增 `tests/architecture/module-governance.test.ts`——校验「组件目录 ↔ MODULE.md ↔ 架构测试规则 ↔ 功能文档」四者一致；新增目录未带 MODULE.md 即失败。
4. 与现有 `dependency-boundaries.test.ts` 联动：MODULE.md 中声明的依赖方向与测试规则表互为校验（避免文档漂移）。

**验收**：9/9 渲染模块 + 6/6 主进程域有 MODULE.md；一致性测试通过；新模块合入自动要求。
**预估**：P1（2~3 人日，模板化后每模块 20 分钟）。

### 2.3 方向 C：design-system —— 设计令牌与一致性（28 主题）

**交付物**：
1. `docs/design/design-tokens.json`：三层令牌——基础（色/字号/间距/圆角/阴影/动效/层叠）→ 语义（`--theme-*` 20 变量）→ 主题映射（28 套 × 令牌）；机读、可被测试与脚本消费。
2. `docs/design/DESIGN.md`：令牌决策理由、使用规则、反例、迁移指引（如 `--accent-color` 历史 `#3498db` 的废弃说明）。
3. 一致性评分（10 维）：色板收敛度、字号阶梯、间距 4px 基准、圆角统一、阴影层级、对比度（WCAG）、状态色一致、主题覆盖完整、动效一致、字体栈一致——输出评分 + AI-slop 清单（硬编码色值、任意 magic number、超范围圆角）。
4. 门禁 `tokens:check`：扫描 `src/renderer/**/*.{vue,css}` 的硬编码颜色/间距/圆角，与 tokens 白名单比对（UI-01 从"约定"升级为"门禁"，允许阴影 rgba/白名单例外并注释）。
5. 交互式令牌预览页（可选，P2）：一页展示 20 变量 × 28 主题对比 + 对比度检查。

**验收**：tokens 覆盖 28 主题 × 20 变量 = 100%；`tokens:check` 通过、硬编码色值归零（白名单外）；DESIGN.md 与 theme-contract 测试互链。
**风险**：历史组件有少量硬编码 → 先报告后分批清理（P0 只出报告不改 CSS）。
**预估**：P0 tokens 抽取+报告（1 人日）；P1 门禁（1 人日）；P2 评分与清理。

### 2.4 方向 D：click-path-audit —— 交互链路审计（触控点 → 状态序列 → 终态）

**范围（P0 优先）**：6 个 1.5.2 新增能力（日记/收件箱、剪藏、PDF 标注、OCR、能力开关、命令面板）+ **1.5.3 新增链路（非模态工具窗、表格电子表格化编辑、菜单重组后的插入/工具入口）** + 4 个高风险存量链路（主题应用/取消回滚、设置保存防抖+关闭 flush、多标签会话恢复、关闭确认/更新安装）。

**方法**：
1. 建"触控点清单"：从菜单动作（319 项中筛"有状态副作用"者）、24 对话框、20 命令、6 能力入口聚合出 ~80 个触控点。
2. 为每个触控点定义**状态序列**（前置状态 → 操作 → 中间态 → 期望终态 → 可观察证据），形成矩阵表（Markdown 表格，纳入仓库）。
3. 对 P0 链路写自动化断言：组件级（jsdom + 既有 testing 模式）优先，E2E 仅覆盖真实进程链路（启动/剪贴板/PDF/OCR/侧车）。
4. 输出审计报告：PASS/FAIL、复现步骤、根因分类（终态错误/竞态/幂等缺失/回滚不全），**本阶段只记录不修**。

**重点怀疑区**（依据项目史）：
- 主题：应用→取消/Esc 回滚（曾修 P2 #17）、主题广播载荷不一致（遗留 #2）；
- 设置：保存防抖 200ms + 关闭 flush 的丢失窗口；
- 多标签：会话恢复与"单活动文档语义"冲突（A1 历史）；
- 剪藏/OCR：首次使用（语言包下载失败/无活动编辑器回退）与开关热切换；
- PDF 标注：防抖保存 + 切文件/关闭 flush + 损坏 sidecar 自愈；
- 关闭确认/更新安装：`confirming` 重入与 `relaunch` 意图收敛；
- **非模态工具窗（1.5.3）**：外部点击不关闭、缩放、设置开关热切换、与编辑器焦点/滚动同步的相互影响；
- **表格编辑器（1.5.3）**：富文本单元格、转置/排序、导入的终态一致与撤销栈。

**验收**：P0 链路 100% 有判定与证据；新增自动化断言 ≥20 用例；发现的问题按优先级登记到《当前遗留问题清单》。
**预估**：P0 清单+矩阵（1 人日）；P1 断言（3~5 人日）；P2 修复随批。

### 2.5 方向 E：architecture-decision-records —— ADR 独立化

**交付物**：
1. `docs/adr/`：`README.md`（索引、状态流转 Proposed/Accepted/Superseded、模板）+ `ADR-0001..0012.md`（从架构文档逐条抽取，正文含 Context/Decision/Alternatives/Consequences）。
2. 新增 ADR（本方案落地后）：契约工件与变更协议（A）、模块治理规则（B）、设计令牌真源（C）、交互链路审计方法（D）、1.5.2 的 OCR 引擎与剪藏形态决策、**1.5.3 的非模态工具窗与表格编辑器架构决策**。
3. 架构文档改造：ADR 章节变"摘要表 + 指向 `docs/adr/` 的链接"；`docs/wiki/README.md` 与 `_sidebar.md` 登记。
4. 流程：开发规范新增 ADR 条款——**架构/契约/技术选型级变更必须新增或更新 ADR**，评审时检查；`docs:check` 覆盖新链接。

**验收**：12 条既有 ADR 全部独立化且正文完整；索引与架构文档互链；`docs:check` 0 失效；新 ADR 有编号规则与模板。
**预估**：P0（1 人日，纯搬移+索引）。

## 3. 批次计划与依赖

> 基线：**v1.5.3（开发中）**——1.5.2 的 4 批次能力已并入 main（E6/E1/E2/E3），1.5.3 继续推进编辑器与内置工具（非模态工具窗、表格编辑器、菜单重组）；批次内容与版本号解耦，可按版本节奏排期。

| 批次 | 内容 | 产出 | 依赖 | 预估 |
| --- | --- | --- | --- | --- |
| **P0（1~2 天）** | E：ADR 抽取+索引；C：tokens 抽取+一致性报告；D：触控点清单+链路矩阵骨架；A：契约漂移快检报告（先只读，复用现有测试） | `docs/adr/`、`docs/design/`、链路矩阵、契约现状报告 | 无 | 1~2 人日 |
| **P1（约 1 周）** | A1/A5 契约工件 + `contracts:check`；B：模块 MODULE.md（9+6）；C：`tokens:check` 门禁；D：P0 链路自动化断言 | 契约工件、MODULE.md、门禁、≥20 用例 | P0 | 6~8 人日 |
| **P2（2~3 周）** | A2/A3/A4 契约工件；D：全量链路审计+问题修复；C：10 维评分+AI-slop 清理；E：新增 ADR；规范增量条款 | 全量工件与清理 | P1 | 10~15 人日 |

## 4. 与现有体系的衔接

- **开发规范增量条款**（建议编号）：`CONTRACT-01~05`（工件唯一/先改工件/双端验证/破坏性迁移/禁止手写副本）、`MODULE-01~03`（模块文档/接口归属/一致性门禁）、`TOKEN-01~03`（令牌真源/禁硬编码门禁/对比度）、`CLICK-01~02`（触控点矩阵/终态断言）、`ADR-01~02`（何时必须写 ADR/状态流转）。
- **门禁新增**：`contracts:check`、`tokens:check`、`module-governance.test.ts`、链路断言测试；全部并入 `npm test` / CI quality-gate，不新增独立 CI 步骤。
- **文档体系**：`docs/adr/`（决策）、`docs/design/`（设计）、`docs/wiki/03-功能说明/模块治理索引.md`（模块）、链路矩阵纳入 `docs/reports/md/`（审计类报告，按 DOC-07 登记 HTML Wiki）。
- **不引入**：OpenAPI/AsyncAPI（非 HTTP 边界）、外部 codegen 依赖（JSON Schema + 现有工具即可）、运行时新依赖（契约校验用现有能力，必要时 ajv 已在依赖树）。

## 5. 预期收益与风险

**收益**（可度量）：
- 契约漂移从"靠测试断言 + 人工评审"升级为"工件级四向校验"，覆盖 5 个边界、0 漂移目标；
- 模块边界与文档一致性可机检，新增模块有固定模板，降低"文档漂移/重复造轮子"；
- 设计令牌使 28 主题扩展从"改 3 处"降为"改 tokens 1 处 + 校验"，硬编码色值可清零；
- 交互链路组合态 bug 有系统防线（P0 链路 100% 断言）；
- ADR 独立化后，新决策有固定入口与索引，降低"为什么这样设计"的重复解释成本。

**风险与应对**：
- 过度工程 → 只对 5 个真实边界建工件，其余共享类型即可（contract-first 技能本身规定"单模块原子变更不用契约机制"）；
- 令牌迁移破坏主题 → 只读生成 + 报告先行，P2 才改代码，且 theme-contract 测试守护；
- 链路审计范围膨胀 → 先 P0 十链路，PASS/FAIL 判定即止，不追求全量 319 项；
- ADR 抽取丢信息 → 逐条 diff 核对，架构文档保留摘要与链接。

## 6. 需要你确认的三点

1. **优先级**：是否按 P0→P1→P2 顺序推进？（可只做 P0 先看效果）
2. **契约范围**：A1 IPC + A5 新增文件格式先做，A2 配置/A3 主题/A4 i18n 放 P2 是否接受？
3. **链路审计深度**：P0 十链路先"判定+记录"（不改代码），修复单独排期——是否符合预期？
