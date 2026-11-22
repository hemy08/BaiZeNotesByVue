## 2026年11月21日 - 版本 1.5.1（能力开关与编辑器增强，开发中）

> 用户选定：A2 全工作区搜索/替换、A8 粘贴/复制增强、A9 命令面板/Quick Open 作为默认能力；A1 多标签/会话恢复、A3 文档历史/diff、A4 Markdown lint/format、A6 拼写检查、A7 智能输入、A10 大纲增强作为系统设置可选能力，默认关闭。

### 🧩 能力开关基础

- 系统设置新增「功能」页签：默认能力只读展示；可选能力 6 项开关，默认全部关闭，保存后经 SYSTEM_SETTING_UPDATE 即时生效
- 新增 shared/constants/feature-flags.ts 单一真源 + useFeatureFlags() 渲染层运行时开关；配置白名单/默认值/兜底常量/i18n 同步

### ✍️ 写作体验 P0（2026-11-21）

- 系统设置新增「编写体验」页签：写作模式、打字机、段落聚焦、写作统计、写作排版、光标/滚动恢复、气泡工具栏、Slash 命令、风格检查共 9 项开关，**默认全部关闭**
- 写作模式：沉浸布局（隐藏侧栏/菜单/标题栏/格式工具栏）、正文限宽、字号/行高/排版预设、顶部写作控制条；工具栏与预览可在写作模式内按需召回复用，退出恢复原布局
- 焦点与反馈：Typewriter 光标居中、当前段落高亮、状态栏中英字数/阅读时间/每日目标进度
- 输入手感：选中文本气泡工具栏、Slash 插入命令、写作模式内智能输入（列表/引用/标题续行）
- 修订辅助：按文件恢复光标/滚动/选区；轻量写作风格检查（长句、重复词、口头禅、填充词等，只提示不自动改）
- 所有写作能力均受「编写体验」开关门控，关闭时不注册界面/监听

### ⌨️ 智能输入增强（普通模式 / 写作模式通用）

- 有序列表回车自动递增，并对后续同缩进/同分隔符列表项自动重编号
- 引用块、嵌套列表、任务列表续行；任务项续行统一为未勾选状态
- 空列表项回车退出列表；空列表项退格删除标记退出；标题后回车自动补空行
- 中文输入法组合期完全放行 Enter/Backspace，不介入候选词确认
- 自动修改合并为一次 `executeEdits` 并包裹 undo stop，一次 Ctrl+Z 整体撤销
- 开关：系统设置 →「功能」→ Markdown 智能输入（唯一开关，普通模式与写作模式通用，默认关闭）

### 🗂️ 本地知识库基座（2026-11-22）

- **A5 文档属性**：识别/编辑 YAML front matter（title/date/tags/status/summary/aliases + 自定义键），正文与 BOM/CRLF 逐字保留；保存经既有全文替换事件写回编辑器
- **工作区索引层**：主进程扫描 `.md/.markdown/.txt`，提取标题、front matter 标签、正文 `#tag`、Wiki 链接；复用工作区根/忽略目录/符号链接/大小/数量/深度上限与结构化失败
- **B2 标签索引**：按标签聚合文件，点击打开；**B1 双链/反向链接**：解析 `[[target]]` / `[[target|alias]]` / `[[target#heading]]`，展示当前文件反链；**B4 链接检查**：缺失/歧义链接清单，点击定位来源行；重命名 Markdown 文件后自动更新其他文档中的 Wiki 链接（两阶段：重命名成功后才写回，失败不改链接；按原文件编码解码/写回并保留 BOM，索引与更新链路统一使用编码探测）
- **B5 附件管理**：索引 Markdown 图片/附件引用，分组展示缺失/正常附件、引用来源，支持在资源管理器中定位；**E10 Wiki 链接悬浮预览**：悬停 Wiki 链接显示目标标题、路径、摘要与反链数量
- 新增 `FILE.GET_WORKSPACE_INDEX` IPC（主进程只索引 appState.rootPath；sender 校验 + force 白名单；内存缓存）；
- 入口：编辑菜单「文档属性… / 知识库（标签/链接/反链）」与命令面板；无新增依赖。

### 🔍 默认能力

- 全工作区搜索/替换：当前工作区 Markdown/TXT 跨文件搜索，支持大小写/整词/正则，结果跳转与批量替换（主进程受控写盘）
- 命令面板 / Quick Open：Ctrl+Shift+P 命令、Ctrl+P 文件快速打开
- 粘贴/复制增强：HTML/Word 粘贴转 Markdown、复制为 HTML/Markdown（默认开启，无需配置）

### 🧷 可选能力（默认关闭）

- A1 多标签/会话恢复、A3 文档历史/diff/回滚、A4 Markdown lint/格式化、A6 拼写检查、A7 智能输入、A10 大纲增强
- 关闭时不注册界面/编辑行为，默认启动与编辑链路零变化

### ✅ 门禁

- 类型检查 TypeScript / Vue 四工程 **0 错误**；ESLint **0 error / 0 warning**；Prettier 全绿
- 测试 **312 文件 / 5,741 用例（5,737 passed / 4 skipped）**；覆盖率 **93.85 / 88.41 / 94.28 / 94.21**
- E2E **28/28**；构建 / 体积预算 / Fuses 8/8 / audit / memory 检查通过
- 体积：入口 **143.2 KiB**（≤150）、首屏 **329.4 KiB**（≤512）、Setup **111.33 MiB**、portable **100.47 MiB**、asar **40.82 MiB**
- 编写体验 9 项开关均默认关闭；关闭时不注册界面/监听，默认启动与编辑链路保持旧行为

## 2026年11月20日 - 版本 1.5.0（新版本基线 / 主题设置首开修复）

> **版本号调整（2026-11-20，2026-11-21 发布）**：应维护者要求，项目当前版本统一为 **1.5.0** 并已发布（tag `release-1.5.0`，GitHub Release 资产：NSIS 安装包 / portable / latest.yml / blockmap）；本文件与 README/RELEASE-NOTES 的当前版本标识同步为 1.5.0。

> 1.5.0 起作为新版本基线：自本次版本升级之后的所有修改归入 1.5.0；1.3.9 保持已发布内容（tag `release-1.3.9`）。

### 🖥️ 编辑器底部布局修复（2026-11-20）

- **根因**：Markdown 编辑器容器用 `calc(100vh - 62px)` 推算高度，而工作区实际高度为 `100vh - 92px`；编辑器底部被 `.workspace-area` 的 `overflow:hidden` 裁掉，Monaco 视口延伸到裁剪区，页面已满时回车产生的新行/光标落在状态栏后面
- **修复**：工作区改为 flex 跟随父容器（`flex:1` + `min-height:0`），编辑器/资源管理器/插件容器统一 `height:100%`；状态栏 `flex-shrink:0`；Monaco 开启 `scrollBeyondLastLine` + 底部 20px 安全距；内容变化后若光标在视口最后一行，额外 reveal 下一行
- **回归**：新增 E2E `e2e/editor-bottom-visible.spec.ts`（输入填满视口→Ctrl+End→回车→断言编辑器/光标在状态栏上方）与 `viewer-layout-contract` 源码级布局契约；全量 E2E 20/20

### 🔄 编辑器→预览滚动同步（2026-11-20）

- markdown-it 渲染注入 `data-source-line` 锚点（标题/段落/列表/代码块/表格等；html_block/fence 用零高布局锚点），DOMPurify 消毒后保留
- 编辑器滚动 rAF 合帧 + 内容变化 180ms 尾随防抖 + 光标兜底三路触发；父组件以 seq 去重后透传
- 预览缓存锚点二分查找并同步 `scrollTop`，无锚点按比例兜底；内容重渲染后重放最后目标；隐藏/空内容跳过
- E2E：`e2e/scroll-sync.spec.ts` 覆盖滚轮/PageDown、输入自动跟随、可视区修改不跳项（3/3）

### 🪟 未保存关闭确认应用内对话框（2026-11-20）

- 窗口关闭/退出未保存确认从 Electron 原生 `dialog.showMessageBox` 改为 BaseDialog 风格 `UnsavedChangesDialog`（保存并关闭 / 不保存 / 取消，默认焦点保存、Esc 取消）
- 新增双通道 IPC `DIALOG.UNSAVED_CLOSE_REQUEST` + `DIALOG.UNSAVED_CLOSE_SUBMIT`（通道 91→93；preload 白名单 send 61 / receive 26），经 `withSenderCheck` 注册
- 兜底：30s 超时、窗口销毁、渲染进程崩溃均按取消安全侧处理；preload 不可用回退原生框并记录；保存失败保留对话框并展示内联错误
- E2E：`e2e/close-confirm.spec.ts` 覆盖自定义框、取消/不保存、保存失败路径（3/3）

### 🪟 应用内消息确认服务（2026-11-21）

- 新增通用双通道 IPC `DIALOG.APP_MESSAGE_REQUEST/SUBMIT/DISMISS/HOST_READY`（IPC 93→97；preload 白名单 send 63 / receive 28）
- 主进程 `showAppMessageBox()`：requestId、串行队列、30s 超时、窗口销毁/渲染崩溃安全结算、无父窗口降级；异常回退原生框并记录
- 渲染层 `AppMessageDialog` 复用 BaseDialog 外壳（默认焦点/Esc/a11y）；替换 OPEN_EXE、大文件打开、自动更新 6 个原生 `showMessageBox` 调用

### 🔔 工具提示去原生化（2026-11-21）

- 23 处浏览器 `alert()` 替换为应用内 MessageDialog（错误/警告/成功分类），新增 `common/app-message.ts` 与静态扫描门禁
- 菜单「跳转到行」的 `window.prompt` 改为触发 Monaco 原生 `editor.action.gotoLine`，与 Ctrl+G 同源

### 🎛️ 对话框按钮样式统一（2026-11-21）

- 新增 `assets/dialog-buttons.css`：30px 高/16px 内边距/4px 圆角/13px 字号 + primary/secondary/danger/ghost/apply 5 变体，限定 `.dialog-container`
- 23 个对话框 + QuickLinkForm/MessageDialog 迁移，删除 4 份重复 `.btn` 样式；保留 `.btn-confirm/.btn-cancel` 兼容选择器
- E2E 28/28（settings-persistence/close-confirm/theme-first-open 选择器零改动）

### 🔧 版本与发布

- **全仓版本号升级 1.3.9 → 1.5.0**：`package.json` / `package-lock.json` / `resources/config/version.json` / README 徽章与路线图 / docs 当前状态标注统一
- **1.3.9 已发布**（2026-11-20）：GitHub Release `release-1.3.9`（tag → `1b73d9b`；NSIS 109.98 MB / portable 99.84 MB / latest.yml / blockmap），包含 tag `release-1.3.8` 之后全部修改
- **1.5.0 已发布**（2026-11-21）：GitHub Release `release-1.5.0`（tag 触发 release workflow；NSIS 安装包 / portable / latest.yml / blockmap）；包含 1.3.9 之后全部修改（依赖升级、安全/性能/质量治理、滚动同步、应用内对话框与按钮统一等）
- **应用内发布说明补齐（REL-16 / 遗留 D-2）**：帮助 → 版本发布新增 **1.5.0 / 1.3.9** 两条（`release-notes-data.ts` + `menu-help.ts` handler + `menu-config.ts` 子菜单 + `dialogMain` 中英词典同步），版本项 13 → 15；`menu_config` 断言同步为 15 条并锁定最新两项

### 🐛 体验修复

- **主题设置首次打开主题列表为空**：拆分后 `ThemeSettingDialog` 的 visible watch 缺少 `immediate`，父级 v-if 首次以 visible=true 挂载时不触发 `loadThemes`；已补 immediate，并同步修复 `EditorSettingDialog` 配置加载、`CreateFileFolderDialog` 默认路径回填、`RenameFileFolderDialog` 首开聚焦

### 📦 依赖升级（B1~B4）

- **B1**：eslint 9.39→10.15、eslint-plugin-vue 9.33→10.12、@electron-toolkit/eslint-config 2→3、eslint-config-ts 3→4（ESLint 10 新增 2 条规则命中存量 25 处，暂降 warn 待清债）
- **B2**：@types/node 22→26（encrypt-decrypt 适配 Cipheriv/Decipheriv）；typescript 7 因 vue-tsc 不兼容回滚
- **B3**：vitest 4→5.1.1、@vitest/coverage-v8 4→5.1.1；Node 26 下 forks 池 crypto 熵源异常 → 改用 threads 池 + testTimeout 15s
- **B4**：electron-store 11→12（ESM-only，store-factory 适配 + 打包启动验证）、jschardet 3→4
- **B8（补充）**：vue 3.5.45→3.5.46；jsdom 29→31 评估失败回滚（简写序列化/游离 DOM 用例异常）；ESLint 10 存量 **30 条 warning 全部清理**并恢复新增规则为 error（0 warning）
- **B5**：electron 43→45 评估后回滚（dev E2E userData/欢迎页时序不稳定，保留 43.8.12）
- Node 运行时升级 26.13.1；体积预算按依赖增长调整（Setup 115 MiB / asar 47 MiB）

### 🧹 工程质量

- **E2E 启动链路**：dev 启动改用原生 `--user-data-dir`（替代 `-r` 夹具 setPath），删除废弃夹具；Electron 43 下 E2E 9/9，为后续 Electron 45 升级减少启动分支差异
- **M1 收口**：`trayHideNotified` 从 tray.ts 模块级状态迁入 `AppContext.tray`（窗口重建/测试统一 reset，行为不变）

### 🛡️ 全量扫描 P1 修复（2026-11-20）

- **安全**：工作区敏感根黑名单（.ssh/.gnupg/.aws 等 + AppData/浏览器配置）；defaultSession 权限处理器（默认拒绝，仅本地受信页面放行安全权限）；preload 收敛为受限 ipcRenderer（不再暴露 process.env/webFrame/webUtils）；生产 CSP 移除 unsafe-eval 与 localhost（dev 保留）
- **发布/CI**：release dispatch 按 tag 检出 + tag↔package.json↔appVersion 三方守卫；发布门禁对齐 CI（typecheck/eslint/prettier/vitest/docs/baseline/audit/budget）；按版本精确上传与 tag 维度 latest.yml 校验；CI 最小权限、单次 coverage+JSON 基线、--max-warnings=0、E2E 纳入 typecheck；package.json 卫生（private/description/packageManager/engines/clean）
- **架构**：架构测试升级 TS AST（静态/动态 import/.vue），新增 config→ipc 零例外、main→renderer/preload、renderer→preload 规则；config→ipc 反向边清零（theme-broadcast 迁中性层、IPC 台账 provider 注入）
- **文档**：README/wiki/报告索引/IPC 矩阵/台账统一到 HEAD 实测口径（187 文件 / 3,458 用例、91 通道 / 17 组、白名单 60+25、26 md / 27 HTML）

### 🧰 第二批 P1/P2 修复（2026-11-20）

- **性能**：首屏预算扩展到 modulepreload 静态闭包（≤512KiB，实测 487.2KiB）；主进程 mammoth/csv-parser/turndown/markdown-it 惰性 require（启动期外部依赖 112.75→57.63ms）；highlight.js 改 core + 25 语言（预览 chunk −63.2%）
- **更新/关闭**：更新安装前保存确认（取消不安装、保留待安装状态）；下载 10 分钟超时；关闭/退出确认重入保护；relaunch 意图收敛（取消清除）；托盘模式「保存并隐藏」
- **错误处理**：编码转换/按编码重开失败提示+重试；系统/编辑器设置保存失败提示且不关闭；主题加载错误态+重试；快捷链接/导入异常提示
- **覆盖率**：新增 5 测试文件/80 用例，window-manager/dialog/WorkSpace 关键盲区补齐；全局覆盖 86.51/79.51/85.40/86.93

### 🔒 第三批 P1/P2 修复（2026-11-20）

- **工作区授权收敛**：新增受信根批准机制（仅原生目录选择/启动播种登记，realpath + 50 条 LRU）；OPEN_SPECIFIC_FOLDER/OPEN_RECENT 只读判定；recent-folders 渲染层写入拒绝、主进程维护；敏感根黑名单保留
- **覆盖率**：新增 5 测试文件 +123 用例，0% 文件 12→0（414 语句清零）；全局覆盖 90.28/83.72/89.11/90.58；MarkdownMonacoEditor 96.6%、plantuml 97.3%；修复 Monaco 折叠提供器重复注册缺陷
- **E2E**：新增主题首开/二次重载、主题取消不回滚、HTML 查看器导航+路径切换、文件打开-Monaco 编辑-Ctrl+S-磁盘落盘 4 条；E2E 9→13 条，两轮 13/13 通过

### 🌐 第四批 P1/P2 修复（2026-11-20）

- **首屏 i18n 拆包**：中英词典改为按语言动态加载（首屏只装当前语言）；首屏初始 JS **487.5→321.9 KiB（−34.0%）**；budget 新增「词典不得进首屏」断言
- **KaTeX 按需**：移除静态 import，检测到公式标记（跳过代码块）才动态加载；预览首载静态闭包 **1,146,305→652,683 B（−43.1%）**，无公式文档 0 加载
- **E2E 稳定性量化**：新增 startup-stability spec（8 次启动统计恢复率/就绪耗时）；CI retries 1→0；新增严格 startup-stability job；功能用例接入 metrics 与 `E2E_STRICT_LAUNCH` 严格开关
- **主题取消回滚**：取消/关闭/Esc/遮罩恢复打开时主题（未修改不额外 emit）；确认/应用语义不变

### 🛡️ 第五批 P2 修复（2026-11-20）

- **依赖分类与审计**：明确「Vite 内联运行时库留 devDependencies」策略并新增架构测试冻结 allowlist；新增 `audit:all` 全量树审计（含 dev）接入 CI/release，实测 0 漏洞
- **安全剩余项**：`READ_HTML` 文本扩展名白名单（44 项）；`OPEN_EXE` 一律确认+系统目录强化提示；Electron Fuses 启用 `runAsNode:false`/`onlyLoadAppFromAsar`/`enableEmbeddedAsarIntegrityValidation`（asar 篡改拒绝启动）；新增 SECURITY.md
- **性能基线 CI**：新增 perf CI 脚本与 26 项指标（bundle 12 + 冷启动 14），基线快照偏离 >20% 仅 warning；CI `perf-baseline` job 上传 artifact/Step Summary；开发 preview-ready 478.7ms、打包版 476.8ms

### 🧱 第六批 P2/工程修复（2026-11-20）

- **CI 安全**：actions 全量 SHA 锁定（25 处/6 action）；最小权限、并发控制、job 超时、不持久化凭据、缓存 key 含 lock 哈希；新增 PR 级 dependency-review
- **体积**：asar 排除 `jschardet/dist` 与 config 示例，asar 46.4→41.5MB（−10.53%）；裁剪后 asar 39.59MiB / Setup 111.04MiB / portable 100.25MiB
- **健壮性**：设置浏览失败、自动保存同步失败（提示+回滚+重试）、主题显示名/应用失败等 4 条静默路径补可见反馈与防刷屏节流
- **门禁**：quality baseline 扩为三文档 27 条规则/87 项事实（含 vitest JSON 用例数）；docs:check 纳入根 README/SECURITY
- **清理**：移除无消费方的 `checkUpdateOnStart`（含历史键幂等清理）、0B 空文件与 4 个零引用导出；Dependabot open alerts 复核为 0

### ⚡ 第七批 性能/安全/质量优化（2026-11-20）

- **Word 主线程阻塞**：导入/导出改 worker_threads（独立入口随 asar 打包、超时/崩溃/空闲回收、失败降级）；事件循环阻塞导入 418.4→16.5ms、导出 99→17ms
- **预览优化**：KaTeX CSS 改按需加载（首屏 CSS −26.3%，首屏 KaTeX 字体引用归零）；hljs 新增 52 种冷门语言按需预取
- **覆盖率**：新增 9 测试文件/99 用例，<70% 文件 9→0；全局覆盖 91.80/85.76/90.62/92.14
- **Fuses**：最终 8 项显式矩阵（禁用 runAsNode/NodeOptions/NodeCliInsp/cookie 加密等；保留 asar 完整性/onlyLoadAppFromAsar/file 协议权限）；E2E 与硬化构建分离 + 发布产物 8/8 断言
- **回归修复**：打包产物权限处理器 Session 方法 this 绑定（Illegal invocation），新增回归测试

### 🧩 第八批 架构/性能/质量优化（2026-11-20）

- **IPC 收口**：`utils.ts` 29 处注册清零（929→187 行），按域拆 6 个 ipc 模块 + 编排入口；`utils→ipc` 架构例外清零（2→0），通道/顺序/handler AST 逐字核对；新增重复注册守护测试
- **大文档预览**：256KB 简化档 + 512KB 渐进档（骨架屏/分块净化/让出），1MB 首屏正文 2325.8→583.5ms（−74.9%）、600KB −66.6%；降级不绕过 DOMPurify
- **覆盖率**：新增 9 文件/132 用例；全局 93.42/87.82/93.24/93.67；修复图标链接 label 崩溃、错误占位 retry TypeError 等 3 个真实缺陷
- **A11y**：BaseDialog 滚动锁/描述关联/焦点循环排除/IME Esc；MessageDialog 与 ConfirmDeleteDialog 同步

### 🔐 第九批 安全/质量/稳定性优化（2026-11-20）

- **app:// 迁移**：renderer 从 file:// → app://（资源/PlantUML/本地图片经 Path Guard）；关闭 `grantFileProtocolExtraPrivileges`，fuses 8/8 一致；打包 E2E 新增 Monaco worker/预览图片/HTML/PDF 4 条
- **覆盖率**：新增 16 测试文件 +299 用例，覆盖 22 个主进程 IO 模块；全局覆盖 95.14/89.82/94.24/95.42；<90% 文件 51→30；修复 clipboard 串扰与 tsconfig.node TS6307 门禁缺陷
- **内存治理**：修复分栏监听/timer/预览在途渲染/Word worker 退出 4 处生命周期缺口；新增 `memory:check`
- **安全 P3**：PDF 导出窗硬化、日志敏感值脱敏、数据/备份 POSIX 权限、热键异常隔离、UNC/设备命名空间拒绝、OPEN_EXE 审计、在线网页独立 session 权限全拒

### ✅ 门禁

- typecheck 三工程 0 错误、ESLint 0/0、Prettier 全绿、vitest **187 文件 / 3,458 用例全通过**、electron-vite build 成功

## 2026年11月20日 - 版本 1.3.9（结构治理 / 工程优化 / 体验修复）

> 承接 1.3.8（2026-11-19 发布）之后 tag `release-1.3.8` 的全部修改：P0~P4 工程优化、设置/对话框与 i18n/可访问性、安装包瘦身、E2E 与性能基线、HTML 查看器导航修复、自动保存默认关闭与未保存关闭确认等。

### 🔧 版本与发布

- **全仓版本号升级 1.3.8 → 1.3.9**：`package.json` / `package-lock.json` / `resources/config/version.json` / README 徽章与路线图 / docs wiki / docs reports / 结构图等当前状态标注统一
- **1.3.8 已发布**（2026-11-19）：GitHub Release `release-1.3.8`（tag `release-1.3.8` → `1d71cc0`；NSIS 117.94 MB / portable 107.03 MB / latest.yml / blockmap）
- **1.3.8 已包含**：结构优化第 1~5 批 + M3 单一 manifest、设置页/设置对话框拆分（4 个对话框）、依赖安全治理（Dependabot 254 条分类 + 配置 + 修复）

### 📦 P0 安装包瘦身与 E2E

- **安装包瘦身**：Electron locales 55 → 2（zh-CN/en-US）；Setup **117.94 → 109.98 MiB（−6.76%）**、portable **107.03 → 99.83 MiB（−6.73%）**、win-unpacked **−45.56 MiB（−10.9%）**、asar 39.31 MiB
- **CI 体积预算**：新增 `build/check-bundle-budget.js` + `budget:check` + CI `bundle-budget` job（入口/壳/安装包/asar/locales 阈值）
- **E2E 补齐**：新增启动恢复（autoOpenLastFile/Folder）、设置持久化、打包产物启动用例；新增 Electron profile 夹具（临时 userData + ConfigSandbox）；CI e2e 改 `build:unpack`、超时 45min、coverage artifact 上传
- **E2E 根因与稳定性**：定位 Electron 43.8.12 上游 sandboxed preload mojo 竞态（非产品逻辑），增加「首次导航 file: + 2s 桥宽限 + 同进程 reload 恢复」；单轮 9/9、repeat-each=2 18/18

### ⚡ P1 缺陷修复 / 性能 / 清理

- 修复预览 `renderSequence` TDZ ReferenceError（+回归测试）
- 修复设置对话框首开不回填持久化值（immediate watch + 单测，E2E fixme 转正）
- **启动性能基线**：新增 shared/perf marks 与 `build/perf-baseline.js` → `out/analysis/perf-baseline.json`；开发构建冷启动 app-ready 260.6ms / renderer-ready 399.5ms / editor-ready 514.6ms / preview-ready 585.8ms
- **打包版冷启动基线**：窗口可见 414.3ms、app-ready 203.8ms、editor-ready 492.4ms、preview-ready 535.2ms（较开发构建快 4%~22%）
- 存量清理：eslint-disable 34→24（源码保留项均有原因注释）、`@types/jsdom` 移除；新增 `build/check-doc-links.js` + `docs:check` + CI 步骤（742 链接 / 495 相对链接，断链 0）

### 🌐 P2 i18n 与可访问性

- 补齐 zh-CN/en-US 缺失 key（dialogRenderer / toolsConvert / toolsNetwork 等），替换插件工具与对话框硬编码文案；新增 key 一致性/空值/引用校验
- **BaseDialog 可访问性**：`role="dialog"`、`aria-modal`、`aria-labelledby/aria-label`、关闭按钮 aria-label、打开聚焦/关闭焦点归还、Esc 关闭、Tab/Shift+Tab 焦点陷阱；新增 `dialog-stack`（多对话框仅顶层响应 Esc/Tab）；新增 `dialog-a11y` 测试（12 例）

### 🔧 P3 依赖升级

- `prettier` 3.9.6 → **3.10.1**；`vue-tsc` 3.3.11 → **3.3.14**
- 升级 vue-tsc 暴露并修复 `InsertImageDialog` 只读 computed 赋值（TS2540）真实缺陷
- `katex` 0.19.1 评估后回滚（mermaid 锁 `^0.18`，产生双份 KaTeX chunk +499KB）；15 项 major 依赖单列排期（见《依赖升级与代码签名排期》）

### 🧭 P4 与体验修复

- 新增《依赖升级与代码签名排期》（11 项 major 分批 B1~B7 + 签名上线清单）
- **HTML 查看器导航修复**：点击顶部导航后目标页 `report-nav.js` 因 sandbox 不执行而导航消失、路径不切换；改为拦截本地 `.html` 链接走查看器加载器（重新读取 + 注入静态导航 + 更新 filePath）
- **自动保存默认关闭**：`systemSettingDefaults` / `SYSTEM_SETTING_FALLBACK` 的 `autoSaveEnabled` 由 true 改为 false；软件打开后不启用自动保存，用户需在「系统设置 → 文件设置」中自行开启（schema v3 一次性迁移旧默认 true → false，之后用户开启不再覆盖）
- **未保存关闭确认**：关闭窗口/退出应用时若当前文件有未保存修改，弹原生对话框「保存并关闭 / 不保存 / 取消」；取消或保存失败不关闭（新增 `close-confirm.ts` 与中英文案）

### 📦 依赖升级（B1~B4）

- **B1**：eslint 9.39→10.15、eslint-plugin-vue 9.33→10.12、@electron-toolkit/eslint-config 2→3、eslint-config-ts 3→4（ESLint 10 新增 2 条规则命中存量 25 处，暂降 warn 待清债）
- **B2**：@types/node 22→26（encrypt-decrypt 适配 Cipheriv/Decipheriv）；typescript 7 因 vue-tsc 不兼容回滚
- **B3**：vitest 4→5.1.1、@vitest/coverage-v8 4→5.1.1；Node 26 下 forks 池 crypto 熵源异常 → 改用 threads 池 + testTimeout 15s
- **B4**：electron-store 11→12（ESM-only，store-factory 适配 + 打包启动验证）、jschardet 3→4
- **B8（补充）**：vue 3.5.45→3.5.46；jsdom 29→31 评估失败回滚（简写序列化/游离 DOM 用例异常）；ESLint 10 存量 **30 条 warning 全部清理**并恢复新增规则为 error（0 warning）
- **B5**：electron 43→45 评估后回滚（dev E2E userData/欢迎页时序不稳定，保留 43.8.12）
- Node 运行时升级 26.13.1；体积预算按依赖增长调整（Setup 115 MiB / asar 47 MiB）

### 🧹 工程质量

- **E2E 启动链路**：dev 启动改用原生 `--user-data-dir`（替代 `-r` 夹具 setPath），删除废弃夹具；Electron 43 下 E2E 9/9，为后续 Electron 45 升级减少启动分支差异
- **M1 收口**：`trayHideNotified` 从 tray.ts 模块级状态迁入 `AppContext.tray`（窗口重建/测试统一 reset，行为不变）

### ✅ 门禁

- typecheck 三工程 0 错误、ESLint 0/0、Prettier 全绿、vitest **185 文件 / 3,397 用例全通过**、electron-vite build 成功
- 质量基线/文档链接检查/CI 体积预算/生产依赖 audit（0 漏洞）全部通过

## 2026年11月19日 - 版本 1.3.8（版本维护 / 结构优化第 1 批）

> 1.3.8 为版本维护 + 结构优化批次：承接 1.3.7 发布收尾，并落地《代码结构优化计划》第 1 批（结构防御 H1/H2/L4）。

### 🔧 版本与发布

- **全仓版本号升级 1.3.7 → 1.3.8**：`package.json` / `package-lock.json` / `resources/config/version.json` / README 徽章 / docs wiki / docs reports / 结构图等当前状态标注统一
- **1.3.7 已发布**（2026-11-19）：GitHub Release `release-1.3.7`（tag `release-1.3.7` → `cc3d929`；NSIS 118.42 MiB / portable 107.46 MiB / latest.yml / blockmap），自动更新源 `releases/latest/download` 已验证可访问
- **1.3.6 tag 补齐**：在发布提交 `506e78a` 上补打 `release-1.3.6` tag

### 🧭 HTML 报告 Wiki 导航共享化（2026-11-19）

- **导航/样式抽成共享资产**：docs/reports/html/assets/（report.css 公共样式、report-nav.js 浏览器端导航渲染、report-nav.html/report-nav-home.html 静态片段），由 REPORT_NAV_DATA 单一真源生成；24 页（1 首页 + 23 报告）改为引用共享资源，每页减少约 206 行内联重复，新增报告只需改数据表 + 写 md，已有页面无需改动
- **应用内兼容**：HTML 查看器（srcdoc 无脚本）检测占位后注入静态导航片段（首页/分类页变体按候选路径探测，失败静默降级）；hemytools-html-view 测试 18→36 用例
- **验证**：24 页模板契约 24/24、jsdom 外链加载 749 项 0 失败、Chromium file:// 实测 17/17、视觉零回归（截图 SHA256 一致、正文逐字节一致）、生成幂等与 assets 自动重建、新增报告流程 13/13；真实应用内导航注入验证通过（26 链接、样式生效、布局正常）
- **清理/口径**：删除废弃 build/report-nav.html；reports 实有 23 篇 → HTML Wiki 24 页（旧文档 23 页/22 报告属过期口径，两份 README 已同步）

### 🖼️ HTML 查看器导航修复（2026-11-19，用户反馈）

- **问题**：①HTML 内顶部导航跳转后点击左侧悬浮目录，布局越界上移被菜单栏遮挡；②直接打开 HTML 后点击左侧导航，页面空白
- **根因**：①容器缺少布局样式 + iframe 无 min-height 收缩 → 内部视口高度被内容撑大（18501px vs 1192px），点锚点时浏览器转而滚动父级滚动链；②srcdoc 的 #anchor 经注入 base 解析为 file:// 导航（sandbox 下失败）
- **修复**：容器补齐 flex/column/height:100%/min-height:0/overflow:hidden，shell/iframe/PDF 滚动区 min-height:0；新增 iframe 锚点守卫（父页面事件委托拦截纯 fragment 链接，仅滚动 iframe 内部；跨文档链接保持默认）
- **验证**：真实应用脚本复现两场景——跳转后点 .toc 容器 y 稳定 67（修复前 -8）、直接打开点 .toc 不再空白且内部滚动正常；新增布局契约测试 3 用例

### 🧱 结构优化第 1 批（H1 / H2 / L4）

- **H1 依赖边界自动化**：新增 `src/main/utils/providers.ts`（依赖倒置，仅依赖 shared），`auto-backup`/`i18n`/`path-utils`/`utils.ts` 的 utils→config 静态 import 清零；`config/index.ts` 移除 `ipcListenerManager` re-export；新增 `tests/architecture/dependency-boundaries.test.ts`（方向矩阵扫描，0 violation）
- **H2 preload 白名单单一化**：新增 `build/generate-preload-whitelist.js`，从 `shared/types/ipc.ts` 契约生成 `src/preload/allowed-channels.generated.ts`（send 58 / receive 25 / window.api 6 / dialog 2+1；`satisfies` + 编译期穷尽性断言）；`--check` 防漂移；预加载入口镜像与生成模块一致性由测试锁定；`predev`/`prebuild*` 前置生成
- **L4 shared 边界收口**：`backup-dir.ts` 移除 `node:path`，`resolveBackupDirSafe` 改为显式注入 `PathApi`；`eslint.config.js` 新增 shared 禁止 node/electron/vue/DOM 的硬约束；新增 `tests/architecture/shared-boundary.test.ts`（AST 扫描）
- 门禁：typecheck 0 / ESLint 0 / vitest **174 文件 / 3,224 用例全通过** / electron-vite build 成功（preload 保持单文件产物）

### ✅ 门禁

### 🧱 结构优化第 2 批（H3 / H4 / H6 / M1 / M2）

- **H3 双对话框收敛**：主进程 JSDOM/原生对话框全部删除 → 渲染层 Vue + BaseDialog（快捷键/更新日志/发布说明/重命名/删除确认 + 新建文件文件夹统一路径）；复用 \IPC.DIALOG.OPEN_VUE_DIALOG\，删除 2 个旧 ENTER 通道；preload dialog 白名单归零
- **H4 主界面二级分块**：入口 **127.2 kB**、主界面壳 **316.3 kB**（原 9.89 MB）；Monaco（5,050+2,206 kB）与预览（1,757+KaTeX 499 kB）改为壳 chunk 动态 import，未被 index.html 预载
- **H6 jsdom 依赖边界**：删除 \dialog-defaults.ts\，主进程 \out/main/index.js\ **10.50 MiB → 0.60 MiB（-94.3%）**、jsdom/lib 计数 0；jsdom 仅保留 devDependency（vitest 环境）
- **M1/M2 基础设施收口**：新增 \pp-context.ts\（窗口/welcome/快捷键/退出/flags 集中 + reset）与 \ipc/registry.ts\（两阶段 6 类 64 处注册，入口只调用一次）；错误 helper 统一留待第 4 批
- 门禁：typecheck 0 / ESLint 0 / vitest **169 文件 / 3,234 用例全通过** / electron-vite build 成功

### ✅ 门禁

- typecheck 三工程 0 错误、ESLint 0/0、vitest **169 文件 / 3,234 用例全通过**

---

### ⚙️ 结构优化第 3 批（H7 / M9 / M7）

- **3.1 文档基线自动校验**：新增 `build/generate-quality-baseline.js`（版本/IPC/测试文件/用例/dist 产物 → `out/analysis/quality-baseline.json`），`--check` 与 docs 当前基线比对；CI 新增 Quality baseline check
- **3.2 CI 门禁补强**：CI 新增 Coverage（80/75/73/80）、Prettier --check、生产依赖 audit（官方 registry，0 漏洞）；27 个文件完成 Prettier 修复
- **3.3 release workflow**：新增 `.github/workflows/release.yml`（release-* tag → 门禁 → build:win:all → GitHub Release 上传 NSIS/portable/latest.yml/blockmap → latest.yml 更新源验证）
- **3.4 产物治理（部分）**：`out/analysis` 独立目录 + `.gitignore`；dist 历史归档与 out/build 拆分留待第 5 批
- 门禁：prettier --check 全绿；npm audit --omit=dev（官方 registry）0 漏洞；基线脚本 --check 通过

### 🧱 结构优化第 4 批（M2 / M4 / M5 / M6）

- **4.2 主题单真源**：新增 `useTheme` 单例，集中主题读盘/CSS 变量/Monaco/广播；`BaiZeNotes.vue` −276 行、`MenuBar.vue` −28 行，重复读盘与 DOM 直改消除
- **4.3 EventBus 统一**：`useEventBus` 自动清理替换 8 文件 24 处手写 `$on/$off`；新增 24 事件双向契约与泄漏检测
- **4.4 错误/状态栏 helper 收敛**：新增 `status-notify`（notifyStatus/toUserError）与 `error-report`，收敛 8 套 helper；状态栏消息类型收敛 shared 类型
- **4.5 重复资产清理**：4 个 CSS/KaTeX CSS 收口 `main.ts`（index.html 仅 1 条 stylesheet）；删除 7 个未注册占位页与 `atom-one-light.css` 死副本；MermaidRender 生产引用归零
- 门禁：typecheck 0 / ESLint 0 / vitest **172 文件 / 3,272 用例全通过** / electron-vite build 成功

### 🧹 结构优化第 5 批（清理与规范 L1/L2/L3 + 巨型文件 + M3 manifest）

- **5.1 死代码/目录语义（L1，`c68e91f`）**：删除 `src/main/utils/common.ts`（生产零调用的 FontFamily 表）及其测试；删除 `SYSTEM.OPEN_EXTERNAL_LINK` 死通道（零发送方：ipc-channels 常量 + 主进程 handler + 4 条相关测试；协议白名单安全矩阵仍由 window-security 测试覆盖）；`window-manager` 由 `config/` 迁 `src/main/window/`（config/index 保留 re-export 门面，调用点零改动）
- **5.2 EOL/编码（L2，`f626a8a`）**：`.editorconfig` end_of_line 与 `.prettierrc` endOfLine 统一为 LF，新增 `.gitattributes`（`* text=auto eol=lf` + 二进制白名单）覆盖本机 core.autocrlf，保证任意环境检出即 LF；修复 3 个含 U+FFFD 替换字符的文件（`.gitignore` 损坏注释、wiki 版本更新报告、plantuml vendored 产物裸替换字符改等价 `\uFFFD` 转义）；`prettier --check .` 全绿
- **5.3 build 脚本治理（L3，`af5a4b1`）**：删除零引用空宏桩 `build/installer.nsh`、两个未被引用的 `.bat`（能力已被 npm scripts 覆盖）；`build/build-win.ps1` 的 NSIS 临时目录重定向能力并入 `build/prepare-build-dirs.js` 新增 `--exec` 子命令（`node build/prepare-build-dirs.js --exec "npm run build:win:nsis"`）
- **5.4 docs 资产归档（L3，`6ed8a3f`）**：`docs/架构文档.html` → `docs/历史归档/架构文档.html`（README/wiki 索引标注「非当前」）；`resources/_unused-assets`（287 文件 / 6.5 MB）移出工作区至 `out/archive/`
- **5.5 巨型文件（`13cd4ba`，部分完成）**：`pinyin-data.ts`（20,914 行纯数据）迁 `src/renderer/src/data/`，`chinese-lib` 改动态 `import()` 按需加载（构建实测独立 chunk 165.8 KB、入口不 preload；`getPinyin/getFirstLetter` 异步化，交互语义不变）；`directory-tree`/`preview-md-basic`/`MaterialSyntaxDialog`/设置页拆分未执行，已列入后续计划（未假完成）
- **5.6 根目录清理（L3，`b71569e`）**：`baize_clear_icon.ico` 归入 `resources/icon/`；删除 `debug.log`、`tsconfig.web.tsbuildinfo` 与空目录 `$base/`；`.gitignore`/`.prettierignore` 清理失效规则并忽略 `docs/历史归档/`
- **M3 单一 manifest（`7c2467b`）**：新增 `src/shared/constants/material-syntax.ts` 作为 15 项 Material 扩展语法唯一真源（id / 菜单词条 / 动作 id）；`menu-config` 菜单项由 manifest 生成，`menu-actions` 拦截清单与对话框 id 类型/顺序改为派生；新增 4 条 manifest 一致性测试（菜单生成顺序 / 对话框渲染顺序 / zh-CN+en-US 词条齐全）；38 项插件工具 manifest 留待后续
- 门禁：typecheck 三工程 0 错误、ESLint 0/0、`prettier --check .` 全绿、electron-vite build 成功、vitest **171 文件 / 3,265 用例全通过**（删除死测试 11 条 + 新增 manifest 一致性 4 条）、preload 白名单 `--check` 通过、质量基线 `--check` 一致、IPC **91 通道 / 17 组**

### 🛡️ 依赖安全治理（Dependabot 254 条告警全量分类与修复，2026-11-19）

- **全量分类**：经 GitHub REST API 拉取 254 条 open 告警（critical 1 / high 93 / medium 120 / low 40；runtime 170 / development 84；41 个包 / 188 个唯一 GHSA），按当前依赖树逐条 semver 核验：**已修复 209 条、依赖已移除 30 条、清单已删除（vendor）15 条、仍受影响 0 条**；npm audit（官方 registry，含 dev，828 个依赖）**0 漏洞**，差异归因（告警为历史快照 / overrides 已修复 / 依赖已移除 / vendor 清单已删除 / 工具库差异）见报告
- **Dependabot 配置**：新增 `.github/dependabot.yml`（npm / weekly / 8 分组合并 PR / `open-pull-requests-limit: 5` / `exclude-paths` 排除 vendor 副本 / major 统一 ignore；security updates 需在仓库 Settings 开启，文档注明）
- **修复批**：18 项直接依赖声明升级 + 5 处 overrides 更新（electron 43.8.12、electron-builder 26.18.1、dompurify 3.4.18、katex 0.18.11、mammoth 1.13.0、minimatch 11.0.9、uuid 14.0.3 等）；`vue-tsc` 3.3.14 暴露存量模板对只读 computed 赋值，按「失败单项回滚」恢复 3.3.11；electron 二进制未随依赖安装落盘的问题经 `ELECTRON_MIRROR` 恢复后复跑门禁
- **报告**：[依赖安全治理报告](docs/reports/md/03-专项治理/依赖安全治理报告.md)（254 条分类表、Top 包、npm audit 差异归因、vendor 说明、剩余 major 清单与复现命令）
- **门禁**：typecheck 三工程 0 错误、ESLint 0/0、Prettier 全绿、vitest **175 文件 / 3,297 用例全通过**、electron-vite build 成功、npm audit 0 漏洞

## 2026年11月19日 - 版本 1.3.7（结构治理 / 性能 / 安全与文档体系）

> 承接 1.3.6（2026-11-15 发布）之后 **11-18、11-19 的全部修改**：以「公共接口归位」第 0~4 批完成 shared 三层单真源与渲染层组件化，主界面异步分块将入口 chunk 降低 98.9%，并完成 PDF 预览 / CSP / preload 白名单等安全加固与报告 HTML Wiki 文档体系重构。

### ⚡ 性能：主界面异步分块（2026-11-19）

- **入口 chunk 10,096KB → 114KB（-98.9%）**：主界面 `BaiZeNotes.vue` 改为 `defineAsyncComponent` 按需加载；Monaco（≈7.3MB）、highlight.js（≈1.29MB）、KaTeX（≈0.51MB）与渲染管线移入主界面异步 chunk（≈9,644KB）；初始加载 JS+CSS 10,541KB → **604KB（-94.3%）**
- **启动恢复时序**：主界面挂载并注册 IPC 监听后上报再发 READY（show-welcome=false）；autoOpenLastFile/Folder 路径 READY 前预加载模块；欢迎页首帧后空闲预加载
- **E2E**：新增 2 用例（构建产物契约 + show-welcome=false 真实进入主界面且 Monaco 加载），共 4 passed
- 门禁：typecheck 0 / ESLint 0-0 / vitest 158 文件 2,871 用例全通过 / electron-vite build 成功

### 🧩 公共接口归位第 0~4 批（2026-11-19）

- **第 0 批（URL / 窗口控制 / 默认值 / 主题广播）**：URL 单一真源（main 常量表改为 re-export shared 真源，删 52 条重复常量）；渲染层菜单删除 50 个死 URL 字段；主界面最大化改 `TOGGLE_MAXIMIZE`（二次点击还原）+ 图标/title 切换；删除 `useConfigStore` 死状态、新增 shared `SYSTEM_SETTING_FALLBACK`；主题广播统一走 `broadcastThemeToAllWindows`（shared `ThemeUpdateData`）
- **第 1 批（shared/utils + shared/constants）**：新建 `src/shared/utils/` 11 模块（path / hash / lru-cache / html / random / validate / format / concurrency / debounce / date / backup-dir）+ `src/shared/constants/` 6 模块（window / limits / render / file-extensions / hash-algorithms / encodings）；主进程 16 文件 + 渲染层 15 文件迁移（保留导出名/签名，行为零变化）；顺带修复 MarkdownPreviewComponent basename 短路缺陷、Monaco model URI 统一 `file:///` + UNC 兼容
- **第 2 批（shared/types 契约层）**：新建 `shared/types/ipc.ts`（IpcRequests 58 / IpcResponses 26 / IpcEvents 25 + 静态护栏测试）、`config.ts`（ConfigName 8 + 读写映射）、`dialog.ts`（VueDialogName 24 / 主进程 9）；文件树/主题族/其余契约两端统一；删除 createFileFolder `isFolder` 死字段
- **第 3 批（渲染层组件化 + BaseDialog 18/18）**：WindowControls（欢迎页/主界面统一，-222 行）、FileViewerShell + useFileViewerState（HTML/PDF 壳层去重 -343 行）、TextCodecTool（4 codec 薄封装）、BaseDialog（18 props / 4 插槽，18/18 对话框迁移，+插件样式副本清理 -229 行/121 条重复声明）、preview-block-utils（4 预览插件净减 309 行 + 23 等价性单测）；删除死组件 MermaidRender.vue；新增 C-2/C-3/C-4 外壳契约测试 79 用例
- **第 4 批（P3 清理）**：删 dialog-helpers 3 个死包装；4 处手写 basename/dirname 统一；主题/图标资源路径统一（**修复主窗口图标一直未加载的真实缺陷**）；删 @mainer 死别名；global-types 迁移 shared；IPC domain 计数 18→17 + 防回归断言；删死 composable useEventBus（-13 用例）；18 处 console→logger；**修复 ThemeSettingDialog 8 个 resize-handle 未生效缺陷**
- **累计**：新建 shared 层 22 个模块、60+ 文件迁移、18/18 对话框组件化、净减约 4,000+ 行重复代码；最终 vitest **171 文件 / 3,198 用例全通过**

### 🛡️ 安全与稳定性修复（2026-11-18）

- **修复遗留问题批次 1**：新增 `FILE.OPEN_IN_BROWSER` 通道（扩展名 + Path Guard 校验后 `pathToFileURL` → `shell.openExternal`）；MenuBar 主题广播后重新读取配置（修正选中态不刷新）；dialog preload `on/removeListener` 包装函数缓存（退订引用一致）；新增 `.github/workflows/ci.yml`（typecheck + ESLint + Vitest）；electron-builder 显式 `compression: maximum`
- **修复遗留问题批次 2**：主窗口 preload 受限 ipcRenderer（send/invoke 57 通道 + on/once 26 通道白名单，未知通道丢弃并告警）；默认更新源改为 GitHub Releases；`theme-registry` 新增 `warmupMonacoThemeCache()` 窗口就绪后异步预热，首次同步构建不再做文件 IO
- **修复遗留问题批次 3**：IPC 常量分组与 domain 统一（编码类并入 FILE、系统类新建 SYSTEM、设置类新建 SETTING、Monaco 并入 MONACO，16→17 组，通道仍 90）；PlantUML 隐藏渲染窗空闲 60s 销毁（SVG LRU 保留、按需重建、timer unref）；CSP 与 HemyTools 评估结论
- **修复遗留问题批次 4（PDF 预览与 CSP 收紧）**：新增 `pdfjs-dist` 依赖与 `FILE.READ_BINARY` 二进制读取通道（Path Guard → Uint8Array）；ShowPdfEditor 重写为 pdf.js canvas 渲染（翻页/缩放/错误提示/卸载销毁），恢复插件注册与「工具→常用小工具→PDF 预览」菜单入口（新增 2 个 i18n 词条）；HTML 查看器与 PDF 预览改按需异步组件，pdf.js 独立 chunk **802KB**（主 renderer chunk -809KB）；CSP 补充 `object-src 'none'` / `base-uri 'self'` / `form-action 'none'` 并新增 renderer-csp 契约测试 6 用例
- **死通道清理（2026-11-18 晚）**：16 个历史死通道确认已删除；本轮另清 4 项空转/死分支——`WINDOW.START_DRAG`（空实现握手）、`THEME.INIT_THEME_STYLES`（6 发送点/0 接收）、`EDITOR.UPDATE_OPTIONS` 渲染层 R→M 死分支、`EVENTS.STATUS_BAR_UPDATE` 反向 send；同步更新 IPC 通信矩阵与索引基线
- **报告导航与 HTML 查看器修复（2026-11-18 晚追加）**：HTML Wiki 顶部固定导航条（首页 + 3 分类下拉 + 当前页高亮 + 分类自动展开），修复下拉被 `overflow` 裁剪、`details` 关闭态被样式覆盖导致点击无反应；HTML 查看器 `srcdoc` 注入 `<base href="file:///<文件目录>/">`，本地 HTML 报告相对链接可正常点击；新增 `build/generate-report-wiki.js` 与 `build/report-nav.html` 导航片段
- **欢迎页窗口控制修复（2026-11-18 用户反馈）**：新增主进程 `welcome-state` 状态模块，欢迎页关闭跳过 FLUSH_CONTENT 的 2s 等待；最大化按钮改 `TOGGLE_MAXIMIZE` 二次点击还原，按 `IS_MAXIMIZED` 动态切换图标与 title（新增 i18n 词条 `workspace.window.restore`）

### 🔧 代码复检批次 5~6 与工程卫生（2026-11-19）

- **批次 5（P0/P1/P2 与工程卫生）**：P0 欢迎页最近文件夹进入主界面补 `markMainViewEntered`、CLOSE 快路径 + 启动配置集成测试；P1 PDF 重试按钮失效/双实例 componentId/渲染令牌与加载代次/首屏空白/缩放滚动等修复；P2 `READ_BINARY` 128MB 上限与去拷贝、preload 白名单静态回归（58/25 双向核对）、`CSP frame-src` 收紧与 base-uri 回退、HTML/PDF 按需挂载、最大化 resize 同步 + timer 清理、PlantUML 空闲销毁重计时、dialog on 去重；工程卫生：pdfjs-dist/jsdom 迁 devDependencies、tsbuildinfo 出库、git 索引大小写修正、死事件清理
- **批次 6（E2E 入 CI 与安全纵深）**：新增并行 e2e CI job（构建 + Playwright Electron 冒烟，失败上传 report/trace），冒烟增强主窗口/欢迎页窗口控制/preload 桥/IPC 往返断言；dialog preload 接收通道白名单（仅 THEME_UPDATED）；JSDOM 对话框 HTML 统一注入严格 CSP（`default-src 'none'`）；`CONVERT_SAVE_ENCODING` 通道值统一为 `file:convert-save-encoding`；渲染层 `autoOpenLastFile` 默认值与主进程一致（false）；清理过期注释

### 📚 文档与报告体系（2026-11-18 ~ 11-19）

- **报告归档重构（2026-11-18）**：`docs/reports` 去日期前缀、按「检查与扫描 / 修复与实施 / 专项治理」分类、同主题合并（32 份 → 19 份合并稿 + 新增台账 = 20 篇）；Markdown 与 HTML 分目录；HTML Wiki（首页 + `_sidebar.md` 侧边栏 + 每页固定导航与悬浮目录）；新增 `build/generate-report-wiki.js` 批量生成脚本与 `build/report-nav.html` 导航片段，`build-html-report.js` 支持 `--nav` / `--navHtml`
- **遗留问题跟踪台账**：新增《当前遗留问题清单》（21 项，含优先级/位置/影响/状态列与修复记录章节）
- **结构分析报告**：新增《代码整体结构分析报告》+ 5 张 SVG 架构图（进程架构 / 主进程分层 / 渲染层 / 数据流 / 构建发布），报告生成支持 SVG 占位自动内嵌与导航自动同步
- **公共接口归位修复计划**：新增《公共接口归位修复计划》（批次路线图 SVG + 批次 1~4 明细/验收/手测/风险），HTML Wiki 收录（23 页）
- **口径统一**：README / 报告索引 / docs wiki / 台账统一到最新实测口径（171 文件 / 3,198 用例、92 通道 / 17 组、58+25 白名单、38 插件、57 Monaco 主题、最新产物体积）

### 🚀 发布

- **GitHub Release**：`release-1.3.7`（tag `release-1.3.7` → 提交 `cc3d929`），资产包含 **NSIS 安装包 118.42 MiB / 便携版 107.46 MiB / `.blockmap` / `latest.yml`**；自动更新源 `releases/latest/download` 已生效
- **产物校验**：包内 `resources/config/version.json` = 1.3.7；`latest.yml` version = 1.3.7；`app.asar` ≈50.11 MiB

### ✅ 门禁

- typecheck 三工程 0 错误、ESLint 0/0、vitest **171 文件 / 3,198 用例全通过**、electron-vite build 通过、E2E 4 passed

---

## 2026年11月15日 - 版本 1.3.6（审查修复批次）

> 对 1.3.0~1.3.5 新增内容（插件工具 / mkdocs-material 扩展 / 系统设置补充实现）做全量代码审查（32 项问题：P1×2 / P2×11 / P3×19），修复全部 P1/P2 与 12 项 P3，剩余 7 项 P3 为文档声明类低风险项。审查与修复详情见 [全量扫描与审查报告](docs/reports/md/01-检查与扫描/全量扫描与审查报告.md)。
>
> 说明：1.3.6 于 2026-11-15 发布（发布提交 `506e78a`，`release-v1.3.6`）；2026-11-19 已在该提交补打 `release-1.3.6` tag。**11-18、11-19 的后续修改已全部归入 1.3.7**（见上）。

### ✨ 新增功能

- **文件菜单「最近文件」/「最近文件夹」子菜单**：打开「文件」菜单时动态拉取最近列表，各最多展示 20 项（最近文件显示文件名、最近文件夹显示路径，超长自动截断），点击即快速切换；空列表显示「（暂无记录）」占位
    - 主进程新增 `FILE.RECENT_LIST` / `FILE.OPEN_RECENT` invoke 通道（sender 校验）；打开目标必须命中当前最近列表（白名单，防任意路径），文件走 OpenSelectFile 链路、文件夹复用工作区根校验 + 主界面时序打开
    - `openDirectoryInMainView` 抽取自启动恢复逻辑复用；`runAfterMainViewEntered` 下沉为叶子模块破循环依赖
    - 新增测试：最近列表截断/容错、打开白名单/校验/时序、菜单动态注入（新增 menubar-recent 组件测试）、preload 暴露
    - 验证：typecheck 三工程 0 错误、ESLint 0/0、vitest **154 文件 / 2,821 用例全通过**

### 🔴 P1 修复（2）

- **正则测试冻结**：回归 **Web Worker + 3s 时间预算**（超时 terminate 重建 worker，UI「匹配中/超时」提示；electron-vite build 产出独立 worker chunk 5.23KB），灾难性回溯不再冻结应用
- **自动备份阻塞**：全链路 `fs.promises` 异步化；保存设置/启动仅重启定时器不再立即执行（首备在第一个间隔到点）；逐条写入失败回滚半成品目录

### 🟡 P2 修复（11）

- 人民币大写整数部分 BigInt 化（>2^53 不再浮点舍入，小数纯字符串十进制四舍五入）
- 繁简转换惰性 Map 缓存（O(n×m) → O(1) 替换）
- 进制转换 200ms 防抖 + 1 万字符上限
- mdi 图标数据拆出主 chunk（首屏核心 77 图标 + 全量动态 import，独立 chunk 93.47KB）
- `enableAutoBackup` / `minimizeToTray` 默认改 **false（opt-in）**，存量用户语义不突变
- 新增**单实例锁**（二次启动唤起已有窗口，避免双实例双写配置）
- 渲染层就绪握手（RENDER.READY 通道）：启动恢复不再间歇静默失效（3s 超时兜底）
- 启动恢复复用工作区根校验（不合法回退欢迎页提示）
- 备份 dest 冲突改 `_active/` 子目录 + 序号兜底；活动文件 20MB 上限；托盘退出 flush 窗口位置

### 🟢 P3 修复（12）

- 剪贴板统一封装 `copyTextToClipboard`（替换 14 处裸调用，失败有提示）；Unicode >0xFFFF 码点修复（emoji 单实体）；字数统计防抖；图片 Base64 粘贴预检；时间戳空输入提示；3 处过期注释按实况修正
- snippets 每轮读取缓存；grid 扫描排除缩进代码块；KaTeX 降级路径标记保护
- schema 范围对齐（backupInterval 1~~72 / backupCount 1~~10）；macOS activate 重启主题 watcher 与备份定时器；跟随系统主题脏检查

### 🛠️ 关闭后进程残留修复（2026-11-15 晚追加）

> 现象：点关闭后任务管理器仍有 4 个 BaiZeNotes 进程。根因：1.3.1~1.3.5 期间 `minimizeToTray` 默认 true，用户保存过系统设置即把 `true` 落盘；升级后默认虽改 false，存量值仍让「关闭窗口」退化为「隐藏到托盘」（Windows 托盘图标位于任务栏溢出区，用户难以找到退出入口）。

- **存量配置一次性迁移**：新增 `settingsSchemaVersion`（不入 defaults，避免 electron-store 构造时写入导致迁移失效）；whenReady 在建窗前执行 `migrateLegacyOptInSettings()`——无版本标记的旧数据把 `minimizeToTray` / `enableAutoBackup` 重置为 false 并写入版本标记，只执行一次（用户此后主动开启不受影响）
- **首次隐藏到托盘系统通知**：托盘隐藏分支调用 `notifyMinimizedToTray()`（Notification 不可用时静默降级），告知用户应用仍在后台、右键托盘图标可退出
- **验证**：新增迁移 3 例、通知 4 例、index 生命周期断言；typecheck 三工程 0 错误、ESLint 0/0、vitest 153 文件 / 2789 用例全通过

### ✅ 门禁

- typecheck 三工程 0 错误、ESLint 0/0、vitest **153 文件 / 2789 用例全通过**、electron-vite build 通过

---

## 2026年11月15日 - 版本 1.3.5（菜鸟常用工具插件集成）

> 阅读菜鸟工具镜像站（www.jyshare.com）前端工具区工具源码，将其中适合离线使用的常用工具能力移植为本项目插件。源码调研报告见 [jyshare 前端工具源码调研](docs/reports/md/03-专项治理/插件工具集成.md)，实施与验证细节见 [jyshare 插件集成实施报告](docs/reports/md/03-专项治理/插件工具集成.md)。

### 🧩 新增插件工具（18 个组件 / 19 个菜单项，插件工具总数 19 → 37）

- **编解码（codec）**：Base64 编解码（先 UTF-8 再编码）、URL 编解码、HTML 实体编解码（命名+数字实体）、Unicode 与中文互转（\uXXXX / &#nnn;）、图片转 Base64（≤20MB，DataURL 与预览）
- **格式转换（convert）**：颜色转换（RGB/HEX/HSL/HSV/CMYK 任意互转）、单位换算（长度 24 单位 + 存储 1024/1000 制）、人民币大写、时间戳转换（秒/毫秒切换）、进制转换（2-36 进制，支持小数与负数，BigInt 无浮点误差）
- **文本转换（text）**：繁简互转（4792 字等长映射）、汉字转拼音（20902 字字库，无调/首字母）、字数统计（8 项分类）、文本比对（行级 LCS，大文本保护）
- **格式化（format）**：JSON 工具（格式化/压缩/转义·去转义）、XML 格式化（自研词法解析器移植，注释/CDATA/文本原样保留）
- **解析器（net）**：正则表达式测试（主线程，d/g/i/m/s/u/v/y 标志，替换 $1/$$/$<name>，匹配数与字符数防护上限）
- **常用小工具（misc）**：随机生成器（密码/字符串/数字/颜色，crypto.getRandomValues 无偏采样）、在线计算器（双栈求值，显式运算零 eval）

### 🔧 移植改进与修复

- 修正原站 CMYK 转 RGB 分支缺陷（四分量统一 /100，往返自洽）
- 修正原站 JSON 去转义缺陷（`\/` → `/`、`\\"` 正确还原、兼容 `\uXXXX`）
- 随机数弃用 Math.random，改 crypto.getRandomValues 拒绝采样（消除模偏差）
- 时间戳转换弃用 moment 栈（约 700KB），改原生 Date 手工解析（含日期存在性回验）
- 正则测试改 Worker 后台线程实现（原站 Web Worker；1.3.5 首发时为主线程，经审查修复后回归 Worker + 3s 超时自动中止，见下「审查修复批次」）

### ⏸️ 本期未集成（记入 Roadmap）

- SQL 格式化（原站为服务端实现，离线需引入 sql-formatter 库）
- 中国日历（农历核心 344KB + 节假日需逐年外部数据）
- JS 压缩/混淆、HTML 转 JS（依赖 js-beautifier/obfuscator 大体积库）
- 文本比对采用自写 LCS（原站 Mergely 为 LGPL 且约 500KB）

### ✅ 质量门禁

- 新增 154 个单元测试用例（编解码 39 / 格式转换 45 / 常用小工具 27 / 文本 16 / 格式化 27）
- 插件注册表 ↔ 菜单双向一致性守护同步更新（总数/分类计数/id 命名规范）
- 全量单测、typecheck（三工程）、ESLint 全部通过（实测数据见实施报告）

### 🔧 审查修复批次（2026-11-15 晚）

> 新增内容全量审查（32 项：P1×2 / P2×11 / P3×19）与修复（P1/P2 全部 + 12 项 P3）已随版本 **1.3.6** 发布，详见上方 1.3.6 条目与 [新增内容审查报告](docs/reports/md/01-检查与扫描/全量扫描与审查报告.md)。

---

## 2026年11月15日 - 版本 1.3.3（mkdocs-material 扩展语法）

> 本版本新增 **15 项 mkdocs-material / pymdownx 扩展语法**支持，配合既有的 admonition（`!!!` 提示块）与标签页（`===`）渲染，白泽笔记可直接渲染 mkdocs-material 笔记的绝大多数高频写法。实施报告见 [mkdocs-material 扩展语法实施报告](docs/reports/md/03-专项治理/mkdocs-material语法支持.md)，可视化样例见 `out/tool-results/mdx-features-preview.html`。

### ✨ 新增语法支持（15 项）

- **折叠提示块** `??? note "标题"` / `???+`（`<details>`，`+` 默认展开）
- **任务列表** `- [x]` / `- [ ]`（禁用复选框）
- **高亮 / 插入 / 删除**：`==高亮==`、`^^插入^^`、`~~删除~~`，以及 critic 标记 `{++ins++}` / `{--del--}` / `{~~旧~>新~~}` / `{==高亮==}` / `{>>隐藏注释<<}`
- **上标 / 下标**：`^上标^` / `~下标~`
- **键盘按键**：`++ctrl+alt+del++` → `<kbd>`
- **属性列表**：`[按钮](url){ .md-button }`、`{ align=center }`、标题 `{ #custom-id }`
- **脚注**：`[^1]` 引用 + `[^1]: 说明`（文末脚注区、回链、多引用）
- **定义列表**：`术语` + `: 定义`
- **Grid cards**：`<div class="grid cards" markdown>`（内部 Markdown 递归解析，支持图标/列表/分隔线）
- **代码块增强**：`linenums` 行号、`hl_lines="2 3"` 高亮行、`title="main.py"` 文件名、行内高亮 `` `#!python …` ``
- **Material 图标**：`:material-account:` / `:octicons-…:`（内置 264 个常用 MDI 子集，未知图标降级文本）
- **pymdownx.blocks**：`/// note`、`/// tip | 标题`、`/// tabbed` + `/// tab | 标签`、`/// details`
- **snippets 文件片段**：`--8<-- "relative/file.md"`、`--8<-- "file.md:10:20"`（相对活动文件目录、行号区间、递归深度/大小/扩展名白名单/目录边界限制）
- **标签页深链**：`#__tabbed_<set>_<n>` 锚点点击自动切换到对应 tab

### 🧭 插入菜单：插入 → Material

- **菜单入口**：`插入 → Material` 子菜单在原有 Admonition 之后新增 **15 个插入入口**（折叠提示块 / 任务列表 / 高亮 / 插入删除 / 上下标 / 键盘按键 / 属性列表 / 脚注 / 定义列表 / Grid cards / 代码块增强 / Material 图标 / `///` blocks / snippets / 标签页深链），动作 id 统一为 `baize:menu:insert:material:<featureId>`
- **统一插入对话框** `MaterialSyntaxDialog`：左侧 15 项功能列表 + 右侧数据驱动表单 + **实时 Markdown 预览**；点击菜单项自动定位到对应语法（preset），「插入」经既有编辑器插入链路写入光标处；中文/英文界面完整适配（`dialogRenderer.materialSyntax` 命名空间 103 键）
- **测试**：对话框 25 用例（15 项精确 markdown 生成、preset、条件字段、预览、事件）+ 菜单 16 项/动作映射一致性用例；全仓 150 文件 2737 用例通过

### 🧩 实现与安全

- 新增统一扩展注册 `src/renderer/src/components/Markdown/preview-markdown-extensions.ts`，扩展拆分为 `preview-md-basic` / `preview-md-media` / `preview-md-blocks` 三个插件模块 + 3 个样式文件；全部为 markdown-it 原生 rule（解析阶段 token），不使用"渲染后字符串替换"
- snippets 复用主进程既有 `IPC.FILE.READ_HTML` 通道（sender 校验 + 路径守卫 + UTF-8 读取），**不新增 IPC 通道**
- 与预览 DOMPurify 消毒配置（`USE_PROFILES: html/svg/svgFilters/mathMl`）兼容，新增标签/属性全部保留，无需放宽安全策略

### 📚 文档与测试

- 新增 [mkdocs-material 扩展语法实施报告](docs/reports/md/03-专项治理/mkdocs-material语法支持.md)（含 15 项语法速查、实现细节、DOMPurify 结论、限制说明）
- 扩展相关 8 个测试文件 **270 用例全过**（178 新增批次用例 + 5 端到端集成 + 既有回归）；端到端样例覆盖 15 项组合渲染与安全消毒

---

## 2026年11月15日 - 版本 1.3.2（AI 导航菜单）

> 菜单栏新增第 12 个顶层菜单「AI 导航」：按 9 个分类收录 70 个主流 AI 工具入口，链接整理自 [菜鸟工具 - AI 导航](https://www.jyshare.com/ai/)，全部为官方干净地址（https、已去除推广/返利参数）。

### ✨ 新增功能

- **AI 导航菜单**：位于「在线」之后、「GitHub」之前，按分类收录主流 AI 工具，点击经既有安全外开链路打开（`IPC.MENU.ACTION` → 主进程 `aiMenuHandlers` → `OpenOnlineWebPage`，未新增 IPC 通道）

| 分组          | 条目数 | 代表工具                                                                                                               |
| ------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| 热门 AI       | 14     | ChatGPT、DeepSeek、豆包、Kimi、通义千问、文心一言、腾讯元宝、Claude、Gemini、Grok、Copilot、Perplexity、智谱清言、天工 |
| AI 编程       | 9      | Cursor、TRAE、Qoder、GitHub Copilot、OpenCode、Google AI Studio、字节 Coding Plan、ZCode、DeepSeek Harness             |
| AI 作图       | 10     | Midjourney、Stable Diffusion、Leonardo、Adobe Firefly、Runway、Canva、Figma、RemoveBG、Clipdrop、Civitai               |
| AI 写作       | 7      | Notion AI、Grammarly、QuillBot、Gamma、NotebookLM、秘塔 AI 搜索、Poe                                                   |
| AI 办公       | 3      | Miro、ima copilot、Manus                                                                                               |
| AI 影音       | 8      | Suno、ElevenLabs、VEED、RecCloud、TurboScribe、Genmo、可灵、海螺                                                       |
| AI 智能体     | 10     | OpenClaw、KimiClaw、AutoClaw、MaxClaw、ArkClaw、EasyClaw、QoderWork、秒哒、Agent Skills、腾讯 skillHub                 |
| AI 模型与榜单 | 5      | Hugging Face、OpenRouter、Arena 排行榜、Artificial Analysis、SWE-bench                                                 |
| 更多 AI 工具  | 4      | 菜鸟 AI 导航主页、Google Labs、SkillsMP、Character AI                                                                  |

### 📚 文档与测试

- [菜单配置详细文档](docs/wiki/03-功能说明/菜单配置详细文档.md) 新增 7.10「AI 导航」章节（含 70 条链接清单与动作链路）
- 菜单相关测试（menu_config / menu-tools / menu-ipc-trees / menu-handle / menu_actions / i18n-dict）共 6 文件 205 用例通过；URL 契约断言：全部 https、无推广参数、全菜单唯一

---

## 2026年11月15日 - 版本 1.3.1（系统设置项补充实现）

> 系统设置对话框中 9 项「该设置暂无对应功能实现」的禁用设置项已全部补充实现。整理清单与逐项实现方案见 [17-系统设置补充实现计划](docs/reports/md/02-修复与实施/系统设置补充实现.md)。

### ✅ 已实现设置项（9 项）

- **启动恢复**（autoOpenLastFile / autoOpenLastFolder）：新增 `startup-restore.ts`，主窗口 ready-to-show 后按开关自动恢复上次文件/目录（复用 WELCOME_ENTER_MAIN 时序，先进入主界面再投递数据事件）；文件/目录不存在时回退欢迎页并提示
- **开机自启动**（autoStart）：config-manager 保存时联动 `app.setLoginItemSettings`，读取侧用 `getLoginItemSettings().openAtLogin` 校正显示；开发模式无效属预期（UI 提示「需安装应用后生效」）
- **记住窗口位置大小**（rememberWindowSize）：新增 `window-bounds.ts`，启动按持久化 bounds 恢复（多显示器越界回退 1280×800 居中），resize/move 500ms 防抖写回，最大化/全屏跳过，close 立即落盘
- **最近文件数量**（recentFilesCount，5~20）：新增共享 `clampRecentFilesLimit`，最近文件与最近文件夹写入侧按设置截断去重，改设置后即时裁剪存量
- **最小化到托盘**（minimizeToTray）：新增 `tray.ts`（单例 Tray + 显示主窗口/退出菜单 + 单击恢复）；主窗口 close 拦截：落盘后按开关 hide 到托盘，显式退出（托盘退出/before-quit 的 isQuitting 标志）放行真实退出，进程可完全结束
- **跟随系统主题**（useSystemTheme）：新增 `system-theme.ts`，nativeTheme updated 按 shouldUseDarkColors 自动应用 dark/light 主题并广播；手动切换主题自动关闭跟随（互斥语义，UI 有说明）
- **自动备份**（enableAutoBackup + backupInterval）：新增 `auto-backup.ts`，按间隔定时备份活动文件（按原编码写出）+ 工作区 .md 文件到 `userData/backups/<时间戳>/`（保留目录结构、跳过 node_modules/.git、单文件 >20MB 跳过），按 backupCount（1~10）滚动清理；递归 setTimeout 防重叠；成功/失败状态栏提示；whenReady 启动、cleanupApp 停止
- **应用主题下拉收口**（appTheme）：禁用下拉替换为只读显示当前主题名 + 「打开主题设置」按钮（复用主题设置对话框调用链），消除"暂无实现"提示

### 🧪 测试与验证

- 新增测试：startup-restore（6）、window-bounds（15）、tray（9）、system-theme（10）、auto-backup（12），并扩充 main-index / config-manager / file-state / config-schema / complex-dialogs 等既有测试
- 验证：typecheck 三工程 0 错误、ESLint 0/0、vitest 全量 149 文件 / 2691 用例全通过

### ⚠️ 已知注意

- 托盘菜单文案按创建时语言固化（语言切换不热更新）；Linux 部分桌面托盘 click 不保证（目标平台 Windows）
- 自动备份为同步 IO，超大工作区首次备份可能短暂阻塞（20MB/文件上限与目录跳过已缓解）
- 开机自启动仅打包环境可验证

---

## 2026年11月15日 - 版本 1.3.0（全面治理正式版）

> 首个包含完整安全加固、国际化、预览本地渲染与架构收口的正式版本。基于 2026-11-14 全量检查（127 项）与 2026-11-15 复扫（94 项）执行多轮修复，复扫结论：**✅ 已修复 105 项 / 🟡 部分修复 22 项 / 未处理 0 项**。门禁实测：typecheck 三工程 0 错误（noImplicitAny 已开启、tests 已纳入）、ESLint 0 error / 0 warning、全量与生产依赖 audit 均 0 漏洞、**133 测试文件 2243 用例全通过**（复扫期的 2 例断言不同步已修复）。复扫详情见 [2026-11-15-晚-全量复扫结果](docs/reports/md/01-检查与扫描/全量扫描与审查报告.md)。

### 🔒 安全加固（P0 攻击链四环闭环 3.5/4）

- **预览 XSS 消毒**：Markdown 预览末端接入 DOMPurify.sanitize（恶意 md 无法执行脚本）；新增预览 XSS 回归测试
- **主进程 IPC 校验**：新增 `ipc-security.ts`（`assertTrustedSender` / `withSenderCheck` / 受信窗口与对话框登记），61 个业务注册中 37 个高风险通道接入，文件读写删、配置、菜单、外链、主题、编码转换 100% 覆盖
- **路径守卫**：新增 Path Guard（`isPathAllowed` / `assertSafePath` / `registerTrustedPath` / realpath 符号链接逃逸校验），55+ 调用点覆盖打开/保存/删除/重命名/复制/HTML 读取/图片写入全部入口
- **OPEN_EXE 三重校验**：受信 sender + 绝对路径/isFile/扩展名白名单/受信目录 + 用户确认
- **外链唯一入口**：`openExternalSafely()` 全库收口 shell.openExternal，仅 http/https（fail-closed），拒绝 file:/javascript:/data:/自定义协议
- **导航边界**：主窗口 `will-navigate` / `will-redirect` 仅放行 dev server 与本地 renderer；`setWindowOpenHandler` 一律 deny；渲染层全局拖拽拦截（dragover/drop 捕获阶段 preventDefault）
- **远程窗口隔离**：在线网页窗口移除特权 preload；对话框 preload `send` 白名单收缩至 2 通道
- **CSP**：渲染页新增 CSP meta（default-src 'self' + worker-src + frame-src 必要放宽）
- **XSS 纵深**：TOC 大纲 v-html → 文本插值；NaviTab 图标 DOMPurify svg profile 消毒；Mermaid 编辑预览 v-html → 文本插值（彻底去 v-html）；HTML 查看器 iframe sandbox 收窄（移除 allow-scripts）
- **隐私与审计**：日志落 userData + 脱敏 + 仅 WARN/ERROR 镜像状态栏；PlantUML 远程外发阻断；`showItemInFolder` 拒绝 UNC；生产禁用 F12；Fuses/热键幂等化
- **已知遗留**：主窗口 preload 仍暴露完整 electronAPI（无通道白名单，由主进程 sender 校验兜底，C-09/FE-22），建议下批次收窄为显式白名单 API

### 🌐 国际化（i18n）

- 新增 `src/shared/i18n`：zh-CN / en-US 双语词典，12 个命名空间、每语言约 1,200 词条
- 渲染层 `t()`（响应式即时切换）+ 主进程 `tMain()`（JSDOM 对话框同步翻译）
- 菜单、状态栏、设置、对话框、编辑器 UI、转换/网络工具、主题名全量接入；菜单标签走 labelKey
- 词典门禁测试：命名空间数量、中英键一致性、英文词典中文残留、静态引用键存在性

### ⚡ 性能优化

- **预览本地单跳（PF-02）**：预览渲染 4 次主进程 IPC → 0，全部在渲染进程完成；删除主进程 4 个渲染器（797 行）与 4 个渲染通道
- **highlightAuto 修复**：行内代码不再全语言探测，实测 16KiB 文档 232.8ms → 1.55ms（**124×**）、50KiB 553ms → 0.37ms
- **预览重渲染治理**：面板隐藏跳过渲染（1MiB 文档省 315.8ms/轮）、内容未变跳过、渲染序号丢弃旧轮次、TOC 指纹门控
- **KaTeX 缓存**：LRU 200 条 + 大文档降级策略（-94.9%）
- **击键链路**：500ms 空闲防抖 + 脏指纹（长度+sha256）跳过未变化内容；Ctrl+S 双份全文 IPC → 单份
- **Monaco worker**：手动注册 worker + 裸包名重定向，产物从 15MB 死 worker → 0.57MB 单 worker（按需语言）
- **目录树**：fs.watch（500ms 合并）增量重扫，单文件变更 28.6ms → 1.5ms（-94.8%）；node_modules/.git 排除监听
- **首屏**：11.80MiB → 10.08MiB，modulepreload 18 → 1；对话框与插件工具全部 defineAsyncComponent 懒加载
- **懒加载**：jsdom 首次调用才 require；mermaid 动态 import；PlantUML 本地渲染窗口按需创建
- **rAF 合帧**：窗口拖拽/缩放 IPC 1000/s → 60/s；分栏拖拽不再触发 Monaco 全量 layout
- **日志开销**：字节计数估算替代逐条 statSync
- **包体积**：安装包 233MB → 109.8MB（app.asar 51.93MB）；files 白名单 + *.map 排除 + 图标清理；1.2.1 旧包清理
- **sendSync 清零**：4 处同步 IPC 全部改 invoke
- **mkdocs-material 语法插件化**：admonition（`!!!` 提示块）与 tabbed set（`===` 标签页）由预渲染文本变换重构为 markdown-it 原生 block 插件（解析阶段生成 token），嵌套组合（admonition 内嵌 tab、tab 内嵌代码围栏/列表/公式）正确处理；预渲染管线相应精简
- **已知遗留**：每键仍全文 `getValue()`（PF-3 残余）；目录自身操作仍整树 JSON 无增量 patch（PF-05）

### 🖼️ 本地图片预览修复（FE-12）

- **根因**：预览层把相对路径拼成无协议的绝对路径（`E:/.../images/x.png`）直接写入 `<img src>`，浏览器将 `E:` 当作未知 scheme 无法加载；且 Windows 盘符路径（含 `:`）被 DOMPurify 默认 URI 白名单剥离，`src` 属性被删除；CSP `img-src` 亦未放行 `file:` 协议
- **修复**：新增 `toFileUrl()` 把相对路径解析为活动文件所在目录的 `file:///` 绝对 URL（前导斜杠 + encodeURI + `#`/`?` 单独编码）；DOMPurify 配置基于默认白名单追加 `file:` 协议；CSP `img-src` 增加 `file:`
- **效果**：`![](images/xxx.png)`（Markdown 同目录 images/ 下）在右侧预览区正常显示；顺带修复了相对 .md 链接绝对化的同类问题

### 💾 数据安全

- **统一 dirty 标志**（长度 + sha256 指纹）贯穿自动保存/关闭/重载/退出；空内容按长度差异判脏
- **关闭/退出保护**：close 拦截 → flush → 脏则落盘（不再静默丢失 30 秒窗口期修改）；before-quit 同链路覆盖
- **自动保存修复**：开关方向修正（按 payload 启停/重启）、间隔改动即时生效、脏检查后写盘、失败状态栏提示
- **编码体系**：打开按 jschardet + iconv-lite 探测，按原编码写回（GBK 乱码覆盖原文件的路径消除）；状态栏动态显示当前编码
- **磁盘重载保护**：脏状态跳过重载并提示；磁盘签名去重
- **模板行为**："写作模板"由全文替换改为光标处插入
- **边界修复**：新建同名文件查重、空文件不注入 `\r\n`、编码菜单双端接线
- **配置容错**：损坏配置备份 `.corrupt-*` 后重建（五配置模块统一 createSafeConfigModule 工厂）；字段级 schema 校验（fontFamily CSS 注入拦截、configName 白名单）
- **配置写入**：按 configName 分定时器防抖 + 关窗 flushConfigWrites 兜底

### 🏗️ 架构收口

- **IPC 通道唯一真源**：`src/shared/ipc-channels.ts`（56 文件引用、调用点零硬编码字面量）；123 → 86 通道死清理
- **IPC 注册一次性化**：全部移出 createWindow，whenReady 一次性执行 + registerOnce 幂等兜底（macOS activate 抛错消除）
- **监听台账**：主进程 ipcMain 直连清零（全部经 ipcListenerManager），对话框通道挂 componentId 随窗口 closed 自动清理
- **菜单/插件对齐**：菜单数据收敛为注册表子集，4 个缺入口工具补齐，空组 pruneEmptySubmenus 递归剪除，菜单 id 双端一致
- **配置单真源**：system/theme/editor/quick-links 路由到主进程 electron-store（渲染层写主进程读的断裂消除）；主题广播唯一实现（theme-broadcast，payload 修正）
- **边界收敛**：主↔渲染双向 import 清零；file-state ↔ file-utils 循环依赖打破；非空断言 18 → 0（getLiveMainWindow/sendToMainWindow 收口）
- **已知遗留**：配置三目录未完全收敛（fileState/recent-folders 仍分散）；urls 常量 main/shared 双份（ARC-13）

### ✅ 质量门禁

- **ESLint**：flat config 迁移完成，实测 0 error / **0 warning**（106 警告清零）；lint 脚本去 --fix（独立 lint:fix）
- **类型安全**：`@ts-ignore`/`@ts-expect-error` 清零；`any` 收敛至 3 处带注释的第三方边界；`noImplicitAny: true`（46 处诊断修复）
- **测试纳入类型检查**：新建 tsconfig.test.json，235 处测试诊断修复，typecheck 链含 typecheck:test
- **console 治理**：主进程 136 → 12 处；渲染层统一 logger 包装
- **覆盖率**：lines 77.67%（阈值 73% 防回归），覆盖 main/preload/shared/renderer 全 src
- **CI**：新增 test / lint / typecheck / build / audit 流水线

### 🧹 死代码清理

- 删除 36 个零引用文件 / 10,403 行（JSDOM 死对话框 12、死组件 10、i18n 死命名空间 2、死测试 12）
- 主进程产物 out/main/index.js 682.5KB → 379.5KB（-44%）
- 后续复扫再清：>TEST< 残留清零、openUrl 32 → 15 份、images 231 个零引用 SVG 整目录删除、Convert 目录 17 组件孤儿化（待二选一）

### 📦 依赖升级与漏洞清零

- **生产依赖漏洞 15 → 0**（1 critical + 11 high 清零；npm audit 复测 0）
- 升级：electron 43.8.10、vue 3.5.45、markdown-it 15.0.3、monaco-editor 0.57.0、mermaid 12.3.0、dompurify 3.4.17 + overrides 兜底
- 移除 8 个死依赖：node-forge、commonmark、encoding、detect-file-encoding-and-language、plantuml-cli、app-builder-bin、png-to-ico、sharp、vite-plugin-monaco-editor、vuex（devDeps 28 → 22，extraneous 清零）
- `.npmrc`：audit=true、清理废弃键
- **2026-11-15 晚依赖治理（全量 0 漏洞）**：npm audit 全量发现 12 个 moderate（minimatch 7.0.0–11.0.0 DoS，GHSA-g3hv-75wg-m249，经 electron-builder→@electron/universal 与 @typescript-eslint/typescript-estree 两条链引入）；升级 electron-builder 26.15.3 → **26.18.0**，并新增定向 override 将三条链的 minimatch 强制到修复版 **11.0.8**（app-builder-lib / @electron/universal / @typescript-eslint/typescript-estree）；复测全量与生产依赖均 **0 漏洞**

### 🧪 测试体系

- 规模：3 文件 21 例 → **133 文件 2243 用例**（覆盖 main/preload/shared/renderer + Vue 组件 jsdom 挂载，全量通过）
- 新增：安全（window-security 18 例、path-guard、ipc-security、XSS 回归）、架构（通道常量防回归、监听台账、菜单树）、数据（dirty 状态、编码、配置防抖）、性能（highlightAuto 8 例、指纹门控、rAF 合帧）、图片预览（file:// URL 转换、DOMPurify file: 白名单、CSP）等
- 复扫期 clipboard-operations.test.ts 2 例断言不同步已随修复同步

### 📚 文档与工程

- README 按实测重写统计与技术栈（133 测试文件 / 2243 用例 / 89 通道 / 24 主题）；33 个链接 0 断链
- 架构文档（wiki）升级为当前架构（+281 行，ADR-006～012）；`docs/架构文档.html` 标注为历史版本
- 设计文档 / 项目详细文档技术栈与统计同步校准；主题口径统一为实测 24 应用主题 + 55 Monaco 主题
- 应用内帮助页同步 v1.3.0：技术栈信息对话框 15 项版本校准为实际安装版本（含 electron-vite 6.0.0 稳定版、turndown 7.2.4）；关于页面兜底版本更新；版本发布说明新增 v1.3.0 条目（中英双语词条 + 菜单 + 路由）；更新日志页脚 1.2.1 → 1.3.0
- 报告索引新增口径说明（127/127 为历史口径，当前以复扫为准）
- 本次发布：CHANGELOG / RELEASE-NOTES 补记 1.3.0；版本号更新 package.json / package-lock.json / resources/config/version.json

### ⚠️ 已知遗留（22 项部分修复 + 复扫新发现）

- preload 全量暴露（CMP-15，P0 链第 2 环，sender 校验兜底）
- 自动更新源仍 example.com 占位（FUN-10 / CMP-21 / ARC-16；electron-updater 已真实接入，占位时诚实提示）
- 配置三目录未收敛（ARC-04）；urls 常量双份（ARC-13）
- 目录树无增量 patch（PF-05）；每键全文 getValue（PF-3 残余）；切文件无条件写盘（PF-06）
- HemyTools 空壳（CMP-27）；首屏 chunk 9.66MB（Monaco 主体未瘦身）；PlantUML 隐藏窗常驻
- 工作区大量变更待 git 提交
- 完整清单见 [2026-11-15-晚-全量复扫结果](docs/reports/md/01-检查与扫描/全量扫描与审查报告.md)

---

## 2026年11月15日 - 版本 1.3.0（架构治理批次：i18n / 预览本地渲染 / 通道统一 / 安全加固）

> 本条目记录 2026-11-15 完成的架构治理批次（随 1.3.0 发布）：P0 安全加固 → P1 XSS 加固 → 国际化 → PF-02 预览本地渲染 → PlantUML 本地渲染 → IPC 通道命名统一 → P2 死代码清理 → P3 文档与工程治理。报告索引见 [docs/reports/README.md](docs/reports/README.md)（含口径说明）。

### 🌐 国际化（i18n）

- 新增 `src/shared/i18n`：zh-CN / en-US 双词典，12 个命名空间、中英各约 1,200 条词条，键集合一致
- 渲染层 `t()`（响应式，切换语言即时刷新）+ 主进程 `tMain()`（JSDOM 对话框同步翻译）
- 系统设置新增语言项，切换后经 `baize:setting:updated` 广播实时生效
- 菜单、状态栏、设置、对话框、编辑器 UI、转换/网络工具、主题名等全量接入
- 词典门禁：命名空间数量、中英键一致性、英文词典中文残留、静态引用键存在性测试

### 🔒 P0 安全加固

- 新增 `src/main/utils/security.ts`：`openExternalSafely()` 统一收口，shell 仅放行 http/https（拒绝 file:/javascript:/data:/自定义协议）
- 主窗口导航边界：`will-navigate` / `will-redirect` 仅放行 dev server 与本地 renderer index；`setWindowOpenHandler` 对新窗口一律 deny
- 在线网页窗口（C-08）移除 preload，窗口内导航与 `window.open` 全部 deny
- 渲染层全局拦截拖拽 `dragover` / `drop`，阻止拖入远程链接/本地 HTML 触发导航
- 对话框 preload `send` 通道白名单收缩至 2 个回车通道
- 自动保存开关通道模式修正：渲染层 `send` → `invoke`，主进程 `handle`，双端一致

### 🛡️ P1 渲染层 XSS 加固

- TOC 大纲：移除 `v-html` 改文本插值 + `U+00A0` 缩进，标题内 HTML 不再执行
- 快捷链接 SVG 图标：DOMPurify svg profile 白名单消毒（剥离 script / on* 事件 / javascript: / foreignObject）
- HTML 查看器：iframe sandbox 收窄为 `allow-same-origin`，移除 allow-scripts / allow-forms / allow-popups
- 新增共享 `escape-html.ts`，统一 mermaid / PlantUML 错误回显转义

### ⚡ PF-02 预览本地单跳渲染

- 预览链路从「4 次主进程 IPC + 主进程同步 KaTeX」改为渲染进程本地单跳：`preview-local-render.ts`（854 行）
- 删除 `src/main/renders` 下 4 个渲染器（797 行）与 4 个 PRE/POST 渲染通道
- KaTeX、材料块（admonition）、标签页（tabbed set）、代码块保护全部迁移至渲染层
- PlantUML 图保留必要 IPC（资源依赖型），mermaid 渲染层本地渲染保持不变

### 🌿 PlantUML 本地离线渲染（PF-08）

- 隐藏窗口加载 `resources/plantuml`（teaVM）本地渲染 SVG，经 `baize:render:plantuml-local` 返回渲染层
- 单队列串行 + 同源码 hash LRU（上限 50）+ 单图 10s / 窗口加载 20s 超时；资源缺失时降级远程渲染
- 消除 plantuml.com 远程依赖，离线 / 弱网可用

### 🔌 IPC 通道命名统一与死通道清理

- 通道唯一真源 `src/shared/ipc-channels.ts`；命名统一为 `baize:<domain>:<name>`
- 通道常量 123 → 86（删除报告死通道 16 个 + C-07 1 个 + 删除不可达对话框连带 17 个 + 单边死通道 3 个）
- 移除 C-07 Mermaid 隐藏窗口半死链路（创建 / 渲染结果通道 / 监听整链删除）
- 测试强制：三段式格式、18 个 domain 白名单、值唯一性、历史前缀禁止、零引用常量反向校验

### 🧹 P2 死代码清理

- 删除 36 个零引用文件 / 10,403 行：12 个主进程死文件（8 个不可达 JSDOM 对话框 + 3 个编辑器设置模块 + Mermaid 渲染帧）、10 个渲染层死组件、2 个 i18n 命名空间文件、12 个死测试文件（121 例）
- 主进程产物 `out/main/index.js` 682,502 B → 375,551 B（-44.97%）
- 测试 120 文件 / 1,901 例 → 108 文件 / 1,737 例；活跃路径补充防回归断言
- 配置单真源收口：`STORE_BACKED_CONFIGS` 将 system/theme/editor/quick-links 路由到主进程 electron-store

### 📚 P3 文档与工程治理

- README 按实测重写统计与目录树（245 源码文件 / 45,763 行 / 81 组件 / 108 测试文件 / 1,737 用例 / 86 通道），修正技术栈、删除未使用依赖 lodash/dayjs、补充 i18n 与本地渲染说明
- 架构文档（wiki）更新至 v1.3.0 当前架构，新增 i18n / PF-02 / PlantUML 本地渲染 / 配置单真源 / 通道命名 / 安全边界 / 死代码清理章节与 ADR-006～012；`docs/架构文档.html` 顶部标注为历史版本
- `docs/reports/README.md` 新增「口径说明」：区分 127/127 历史口径与 IPC 专项 32 项现状，统一测试数与轮次表述
- 忽略规则：`.gitignore` 增加 `coverage/`、`resources/_unused-assets/`；ESLint ignores 与 `.prettierignore` 同步覆盖

---

## 2026年11月14日 - 版本 1.3.0（安全与质量修复批次）

> 版本 1.2.2 首次发布于 2026-08-22（Electron 38 → 43 重大升级、40+ 依赖升级、78 个类型错误修复、3 个 XSS 修复）。本条目记录 2026-11-14 基于全量检查（127 项发现）执行的修复批次，随 1.3.0 发布。检查报告见 [docs/reports/README.md](docs/reports/README.md)。

### 🚀 原始发布（2026-08-22）：Electron 43 重大升级

- Electron 38 → 43，跨 5 个大版本升级
- 同步升级 40+ 依赖包到最新版本
- 修复 78 个 TypeScript 类型错误
- 修复 3 个 XSS 安全风险
- 新增"更新日志"对话框与版本发布子菜单
- 关于页面新增 Monaco Editor 和 markdown-it 版本显示

### 🔒 安全止血

- 预览链路接入 DOMPurify 消毒（svg/mathMl 配置，保留 mermaid/katex 渲染）
- 渲染页新增 CSP 安全策略（`default-src 'self'` + 必要放宽）
- `navi-tab-open-exe` 增加发送方校验与可执行文件目录白名单
- preload 对话框 `send` 改为通道白名单
- 配置文件读写通道 `configName` 白名单校验，防路径逃逸
- mermaid 渲染窗口去除远程 CDN，改为本地内联脚本（消除离线依赖外链）

### 💾 数据安全

- 统一 dirty 标记：仅保存脏内容、空内容同样落盘、保存失败用户可见
- 自动保存开关逻辑修正（间隔变更重启定时器）
- 关闭/退出前拦截落盘 + 未保存内容确认
- 打开文件编码探测（jschardet + iconv-lite），按原编码写回
- 磁盘重载脏状态保护；新建同名文件覆盖检查
- electron-store 配置损坏容错（备份 `.corrupt-*` 后重建）
- 对话框 IPC 监听器命名化 + closed 兜底清理；移除只写不读缓存
- 新增 dirty 标记、编码探测、配置保存防抖共 25 个单元测试

### ✅ 质量门禁

- ESLint 迁移 flat config（`eslint.config.js`），删除旧式 `.eslintrc.cjs` 与 `.eslintignore`
- 清理 8 处 `@ts-ignore` / `as any`；加密模块错误处理改为抛出
- 删除零引用死代码 `default-configs.ts`

### ⚡ 性能

- 击键同步 500ms 防抖 + 脏标记，保存前 flush
- 移除无订阅者的滚动事件监听
- mermaid 按内容 hash 缓存（上限 50 条）；非法 math 块降级不崩溃
- logger 文件大小缓存，避免每条日志 statSync
- Monaco 主题按需读取 + 主题名路径安全校验

### 🏗️ 架构收口

- IPC 注册移出 createWindow，一次性注册
- 菜单动作双注册表 id 对齐；主题广播 payload 修正
- 插件菜单未实现项隐藏；ipc-listener-manager 按通道引用清理
- IPv4 子网比较、编辑器默认值统一、提示标题等小修

### 📦 依赖升级与漏洞清零

- 移除零引用死依赖（commonmark、encoding、detect-file-encoding-and-language、markdown-it-anchor、monaco-themes、plantuml-cli、vuex、node-forge）
- 升级 electron 43.8.10、vue 3.5.45、markdown-it 15.0.3、monaco-editor 0.57.0、mermaid 12.3.0、dompurify 3.4.17
- 传递依赖 override 治理；`.npmrc` 清理 9 个废弃键、审计开关改为 true
- npm audit 复测：15 个漏洞（critical 1 / high 11）→ 0 漏洞

### 📚 文档与发布完整性

- README 关键数据按实测重写（代码 40,065 行、24 种应用主题、目录树与失效链接修正）
- 打包配置校正（移除不存在的 resources/katex、resources/mermaid 条目）
- version.json 生成链修复（electron 版本从 electron 包读取；chrome/node 版本改由运行时读取）
- dist 清理旧版本安装包（1.2.1 产物）

---

## 2026年8月16日 - 版本 1.2.1

### 🚀 新增功能

#### 全量代码扫描与优化

- 使用 Deepseek 对项目进行全量代码扫描
- 代码质量全面提升
- 统一代码风格和规范

#### 架构优化

- 文档更新，架构优化
- 优化项目结构和代码组织
- 提升代码可维护性

### 🐛 Bug 修复

#### 进程与文件修复

- 修复进程残留问题，应用关闭后进程未完全退出
- 修复文件重新打开后，未加载最新内容问题
- 修复从磁盘重新加载后，文件内容未更新问题

#### 其他修复

- 修复多个编译和运行时缺陷
- 修复代码扫描发现的潜在问题

### 🔧 代码质量改进

#### 全量扫描优化

- 对全部源代码进行扫描和优化
- 修复类型安全问题
- 提升代码整体质量

#### 文档更新

- 更新项目文档
- 完善架构说明

### 📁 文件变更

#### 修改文件

- `src/main/` - 主进程代码优化
- `src/renderer/` - 渲染进程代码优化
- `src/preload/` - preload 脚本优化
- 多个配置文件和文档更新

### 🧪 测试验证

- ✅ 开发环境测试通过
- ✅ 打包构建成功

### 📦 构建信息

- **技术栈**: Electron 38.0.0 + Vue 3.4.27 + TypeScript 6.0.2
- **构建日期**: 2026-08-16

---

## 2026年5月10日 - 版本 1.2.0

### 🚀 新增功能

#### 对话框架构重大更新

- **将部分对话框从 JSDOM 转换为 Vue 对话框**
    - 多个对话框组件从 JSDOM 迁移到 Vue 组件
    - 提升对话框渲染性能和开发体验
    - 对话框组件更新，支持更好的主题适配

#### 项目架构变更

- **消息处理逻辑重构**
    - IPC 通信优化，提升通信效率
    - 消息处理逻辑统一管理
- **对话框组件更新**
    - 组件化程度提升
    - 代码复用性增强

#### 主题与图标

- **新增四个主题**
    - 增加四种新的主题样式
    - 提供更丰富的个性化选择
- **应用图标更新**
    - 应用图标全面更新
    - 工具图标优化
- **主题设置即时更新**
    - 主题设置支持选择后立即更新
    - 无需重启应用即可看到主题变化

#### 配置管理优化

- **配置文件管理优化**
    - 优化配置文件管理和打包结构
    - 提升配置文件读写效率
- **项目清理**
    - 删除不使用的文件
    - 清理项目冗余代码

### 🐛 Bug 修复

#### 进程残留修复

- 修复应用关闭后进程残留问题
- 确保应用完全退出，无残留进程

#### 文件加载修复

- 修复文件重新打开后，未加载最新内容问题
- 修复从磁盘重新加载后，文件内容未更新问题
- 确保文件内容与磁盘同步

### 🔧 代码质量改进

#### 架构重构

- 对话框组件从 JSDOM 迁移到 Vue 组件
- 消息处理逻辑重构
- IPC 通信机制优化
- 项目架构整体变更

#### 项目清理

- 删除不使用的文件和函数
- 清理冗余代码
- 提升项目可维护性

### 📁 文件变更

#### 新增文件

- Vue 对话框组件（多个）
- 四个新主题配置文件
- 新应用图标资源

#### 修改文件

- `src/main/dialogs/` - 对话框组件重构
- `src/main/ipc/` - IPC 通信优化
- `src/renderer/src/components/dialogs/` - Vue 对话框组件
- `electron-builder.yml` - 打包配置优化
- `package.json` - 版本更新至 1.2.0

### 🧪 测试验证

- ✅ 开发环境测试通过
- ✅ 打包构建成功
- ✅ 主题切换即时生效
- ✅ 对话框功能正常

### 📦 构建信息

- **技术栈**: Electron 38.0.0 + Vue 3.4.27 + TypeScript 6.0.2
- **构建日期**: 2026-05-10

---

## 2026年5月1日 - 版本 1.1.5

### 🚀 新增功能

#### 配置文件管理系统

- 在用户目录创建 `.baizenotes` 文件夹存储配置
- 新增路径管理工具 (`src/main/utils/app-paths.ts`)
- 新增 Store 工厂函数 (`src/main/utils/store-factory.ts`)
- 统一配置文件管理，支持多用户独立配置

#### 卸载体验优化

- 新增卸载问询脚本 (`build/uninstaller.nsh`)
- 卸载时询问用户是否保留配置文件
- 提供更友好的卸载体验

#### TabbedSet 渲染支持

- 新增 TabbedSet 渲染器 (`src/main/renders/TabbedSetRender.ts`)
- 支持表格集渲染功能

### ⚡ 性能优化

#### 打包结构优化

- 修复 `win-unpacked` 目录下 `resources\resources` 重复嵌套问题
- 优化 `electron-builder.yml` 配置
- 正确打包 config、icon、themes、katex、mermaid、plantuml 资源
- 资源文件与 `app.asar` 同级，符合规范

#### Store 初始化优化

- 统一所有配置文件使用 `createStore` 工厂函数
- 移除重复导入和冗余代码
- 优化配置文件初始化流程

### 🐛 Bug 修复

#### Store 未定义错误修复

- 修复打包后运行时 `ReferenceError: 对象处未定义存储` 错误
- 修复 `theme-config.ts` 语法错误（多余括号）
- 统一配置文件导入路径

#### 构建错误修复

- 修复 `build:win:all` 构建失败问题
- 修复 TypeScript 编译错误
- 优化构建配置

### 🔧 代码质量改进

#### 配置管理重构

- 所有配置文件统一使用 `createStore` 工厂函数
- 配置文件路径统一管理
- 提高代码可维护性

#### 文档完善

- 新增《配置文件路径优化说明.md》
- 新增《配置优化实施总结.md》
- 新增《Store修复报告.md》
- 新增《项目优化分析报告.md》
- 新增《依赖包清理分析报告.md》
- 新增《依赖包清理执行总结.md》
- 新增《事件监听器优化总结.md》
- 新增《OPTIMIZATION_GUIDE.md》

### 📊 技术改进

#### 配置管理统一化

- 所有配置文件使用统一的 `createStore` 工厂函数
- 配置文件统一存储在用户目录 `C:\Users\用户\.baizenotes\`
- 便于维护和扩展

#### 打包结构规范化

- 资源文件正确放置在 `resources` 目录
- 与 `app.asar` 同级，符合 electron-builder 规范
- 避免目录嵌套问题

#### 用户体验提升

- 卸载时提供配置保留选项
- 配置文件独立于应用，便于备份
- 多用户支持，配置互不影响

### 📁 文件变更

#### 新增文件 (13个)

- `src/main/utils/app-paths.ts` - 路径管理工具
- `src/main/utils/store-factory.ts` - Store 工厂函数
- `build/uninstaller.nsh` - 卸载问询脚本
- `src/main/renders/TabbedSetRender.ts` - TabbedSet 渲染器
- `src/renderer/src/composables/` - Vue Composition API
- 8个优化和修复文档

#### 修改文件 (28个)

- `electron-builder.yml` - 打包配置优化
- `src/main/index.ts` - 添加用户目录初始化
- `src/main/themes/theme-config.ts` - 使用 createStore
- `src/main/themes/system-setting.ts` - 使用 createStore
- `src/main/settings/editor-setting.ts` - 使用 createStore
- `src/main/settings/quick-link-config.ts` - 使用 createStore
- `src/main/utils/baize-store.ts` - 配置路径优化
- `package.json` - 版本更新至 1.1.5-beta
- 其他文档和组件文件

### 🧪 测试验证

- ✅ 开发环境测试通过
- ✅ 打包构建成功 (`build:win:all`)
- ✅ 配置文件正确保存到用户目录
- ✅ 资源文件正确打包
- ✅ Store 初始化正常
- ✅ 卸载问询功能正常

### 📦 构建信息

- **安装包**: `BaiZeNotes_Setup_1.1.5-bate_windows_x64.exe` (202 MB)
- **便携版**: `BaiZeNotes_1.1.5-bate_windows_x64.exe` (167 MB)
- **技术栈**: Electron 38.0.0 + Vue 3.4.27 + TypeScript 6.0.2
- **构建日期**: 2026-05-01

---

## 2026年4月26日 - 版本 1.1.3

### 🚀 新增功能

#### 文件自动保存功能

- 实现文件自动保存机制，默认周期为60秒
- 状态栏实时显示文件保存状态
- 未保存和已保存状态可视化区分

#### HTML 内容显示支持

- 新增 HTML 查看组件 (`ShowHtmlVIew.vue`)
- 新增 PDF 编辑器组件 (`ShowPdfEditor.vue`)
- 支持 HTML 文件的直接预览和编辑

#### 日志系统

- 新增日志模块 (`src/main/utils/logger.ts`)
- 支持多级别日志记录 (DEBUG, INFO, WARN, ERROR)
- 日志文件自动轮转和归档

#### 窗口管理增强

- 新增窗口管理器 (`src/main/utils/window-manager.ts`)
- 支持模态/非模态窗口控制
- 窗口状态监控和统计

#### IPC 监听器管理

- 新增 IPC 监听器管理器 (`src/main/utils/ipc-listener-manager.ts`)
- 自动清理机制，防止内存泄漏
- 支持监听器注册、注销和批量清理

#### 快捷键注册系统

- 新增快捷键注册模块 (`src/main/utils/short-key-register.ts`)
- 支持全局快捷键绑定
- 快捷键冲突检测

### ⚡ 性能优化

#### 编辑器性能优化

- **大文件加载优化**: 提高大文件加载速度 50%+
- **缓存策略优化**: 减少 40% 内存使用
- **Monaco Editor 实例管理**: 防止内存泄漏
- **LRU 缓存算法**: 实现文件内容智能缓存

#### Mermaid 渲染优化

- **并行渲染**: 多图表并行渲染，速度提升 3倍
- **渲染缓存**: 图表渲染结果缓存
- **按需渲染**: 只渲染可见区域图表

#### EventBus 优化

- **自动清理机制**: 组件卸载时自动清理事件监听器
- **内存泄漏修复**: 修复事件监听器残留问题

#### 状态管理优化

- **electron-store 持久化**: 使用 electron-store 进行状态持久化
- **状态分离**: 分离持久化状态和运行时状态
- **类型安全 API**: 提供完整的 TypeScript 类型支持
- **状态监控**: 支持状态监控和调试

### 🎨 UI/UX 改进

#### 主题系统升级

- **Monaco 编辑器主题**: 新增 55 种编辑器主题
- **主题目录重构**: 主题文件移至 `resources/themes/monaco-themes/themes/`
- **主题配置优化**: 从 JSON 文件动态加载主题配置
- **UI 样式标准**: 统一 UI 样式规范文档

#### 预览区域改进

- **垂直滚动条**: 预览区域增加垂直滚动条显示
- **滚动性能**: 优化滚动流畅度

#### 状态栏增强

- **文件状态监控**: 实时显示文件保存状态
- **状态可视化**: 未保存/已保存状态区分显示
- **信息展示**: 显示更多文件信息

#### 窗口右侧导航

- **NaviTab 组件**: 新增右侧导航标签页
- **快速访问**: 提供快速访问常用功能

### 🐛 Bug 修复

#### 内存泄漏修复 (严重)

- **生命周期钩子错误**: 修复 Vue 3 生命周期钩子嵌套调用问题
- **Monaco Editor 泄漏**: 修复编辑器实例未释放问题 (30-50 MB/个)
- **EventBus 泄漏**: 修复事件监听器残留问题
- **窗口事件泄漏**: 修复窗口事件监听器残留问题
- **IPC 监听器泄漏**: 修复 IPC 监听器未清理问题

#### 文件保存修复

- **保存失败修复**: 修复文件保存失败 bug
- **编码处理**: 修复文件编码保存问题

#### 渲染问题修复

- **Mermaid 渲染**: 修复图表渲染失败问题
- **Material 渲染**: 优化 Material 图标渲染

#### 文件新增修复

- **默认内容**: 修复文件新增时默认插入内容问题

### 🔧 代码质量改进

#### 代码清理

- **删除冗余文件**: 删除未使用的文件和模块
- **删除冗余函数**: 清理未使用的函数和接口
- **删除 lib 目录**: 删除 `src/renderer/src/lib` 及相关使用

#### 配置优化

- **编辑器配置**: 完善编辑器配置项
- **系统配置**: 增加系统配置保存功能
- **主题配置**: 更新主题配置方案
- **快速链接配置**: 优化快速链接配置

#### 类型定义

- **全局类型**: 新增全局类型定义 (`global-types.d.ts`)
- **类型安全**: 提供完整的 TypeScript 类型支持

### 📚 文档更新

#### 新增文档

- **UI 样式规范文档** (`doc/UI样式规范文档.md`)
- **Monaco Editor 全量配置** (`doc/monaco-editor全量配置.md`)
- **性能分析与优化报告** (`doc/性能分析与优化报告.md`)
- **全局状态管理优化总结** (`doc/全局状态管理优化总结-v2.md`)
- **项目分析报告** (多个版本)

#### 更新文档

- **主题设置详细方案**: 更新主题配置方案
- **CHANGELOG**: 更新版本变更记录
- **RELEASE-NOTES**: 更新发布说明

### 📊 性能指标对比

| 指标             | 1.1.2版本 | 1.1.3版本 | 改进 |
| ---------------- | --------- | --------- | ---- |
| 大文件加载速度   | 基准      | +50%      | ⬆️   |
| 内存使用         | 基准      | -40%      | ⬇️   |
| Mermaid 渲染速度 | 基准      | +200%     | ⬆️   |
| 内存泄漏         | 严重      | 已修复    | ✅   |
| 自动保存周期     | 30s       | 60s       | ⬆️   |
| 编辑器主题数量   | 0         | 55        | ⬆️   |

---

## 2026年4月10日 - 版本 1.1.2

### 🚀 新增功能

- 状态栏增加文件保存状态监控
- 增加文件自动保存功能，可以通过设置菜单设置自动保存周期
- 将config、themes、icon目录打包到安装包中

#### 菜单系统重构

- **菜单项迁移到Vue组件**
    - 新增 MenuBar.vue 组件，使用 Vue 3 Composition API 实现
    - 新增 menu_ipc.ts，统一处理菜单 IPC 通信
    - 新增 menu_consts.ts，集中管理菜单常量定义
    - 新增 menu_config.ts 和 menu_actions.ts，分离菜单配置和动作处理
    - 支持主题样式跟随，菜单栏颜色随主题变化
    - 优化菜单交互体验，支持鼠标悬停和键盘导航

#### 模板系统迁移

- **模板文件统一管理**
    - 新增 `src/main/common/templates/` 目录
    - 合并 Mermaid 模板到 mermaid.ts (595行)
    - 合并 PlantUML 模板到 plantuml.ts (738行)
    - 合并文本块模板到 textblock.ts
    - 合并写作模板到 writing.ts
    - 删除旧的分散模板文件，提升代码可维护性

#### 编辑器性能优化

- **Monaco Editor 性能优化配置**
    - 改为手动布局模式，提升性能 (automaticLayout: false)
    - 新增大文件优化配置 (largeFileOptimizations: true)
    - 限制语法高亮行数 (maxTokenizationLineLength: 10000)
    - 限制折叠区域数量 (foldingMaximumRegions: 5000)
    - 限制撤销历史 (undoLimit: 100)
    - 禁用不必要的功能：链接检测、颜色装饰器、括号对颜色化
    - 优化渲染配置：减少概览标尺车道数、禁用字形边距
    - 新增平滑滚动和光标动画效果

### 🎨 优化改进

#### 安全性增强

- **WebSecurity 配置优化**
    - 开发环境禁用 webSecurity，生产环境启用以增强安全性
    - 开发环境允许不安全内容，生产环境禁止
    - 提升应用安全性，防止潜在安全风险

#### DevTools 交互优化

- **F12 快捷键切换 DevTools**
    - 移除启动时自动打开 DevTools 的功能
    - 新增 F12 快捷键，支持打开/关闭 DevTools 切换
    - 提升开发体验，减少不必要的干扰

#### 编辑器布局优化

- **编辑器宽度调整修复**
    - 修复编辑器宽度调整时的布局问题
    - 新增窗口大小变化监听，动态调整编辑器宽度
    - 优化编辑器容器定位，使用绝对定位替代浮动布局
    - 新增分隔条样式优化，跟随主题颜色

#### IPC 通信优化

- **主题相关 IPC 通信简化**
    - 简化 get-current-theme 和 get-current-theme-styles 处理
    - 优化 IPC 事件监听器注册方式
    - 提升主题切换性能

### 🐛 Bug修复

#### 主题显示问题修复

- 修复主题样式在某些情况下不正确应用的问题
- 修复主题切换后菜单栏颜色不同步的问题

#### 编辑器布局修复

- 修复编辑器宽度调整时的布局错位问题
- 修复窗口大小变化时编辑器不自动调整的问题
- 修复分隔条拖动时的视觉反馈问题

#### 其他修复

- 修复 MarkdownToc 组件中的冗余代码
- 优化 ResourceManager 组件的布局逻辑
- 修复文件无法保存问题

### 📦 依赖更新

- 新增 renderer 依赖 (v0.1.5)

### 📝 文档更新

- 更新 Monaco Editor 版本说明至 0.55.0
- 新增 AI 项目分析报告 (2026年4月6日)

---

## 2026年4月5日 - 版本 1.1.1

### 🚀 新增功能

#### 主题系统重构

- **支持应用主题和编辑器主题分开设置**
    - 新增独立的编辑器主题配置选项
    - 应用主题和编辑器主题可独立切换
    - 支持不同主题组合，提供更灵活的个性化体验

#### 文件状态管理

- **自动保存文件和目录状态**
    - 应用关闭时自动保存当前打开的文件和目录结构
    - 应用重新打开后自动加载上次的工作状态
    - 提升用户体验，无需手动重新打开文件

#### 项目结构调整

- **新增专业目录结构**
    - 新增 `themes/` 目录：存放主题配置文件
    - 新增 `icon/` 目录：存放应用图标资源
    - 新增 `config/` 目录：存放配置文件
    - 优化项目结构，提升代码可维护性

#### 主题资源管理

- **新增18种主题配置文件**
    - 薰衣草梦 (lavender.json)
    - 珊瑚暖阳 (coral.json)
    - 薄荷清风 (mint.json)
    - 日落余晖 (sunset.json)
    - 玫瑰晨曦 (rose.json)
    - 深邃夜空 (night.json)
    - 深空黑曜 (obsidian.json)
    - 科技蓝 (tech-blue.json)
    - 海洋之心 (ocean.json)
    - 森林绿意 (forest.json)
    - 护眼绿 (eye-green.json)
    - 护眼米 (eye-beige.json)
    - 护眼蓝 (eye-blue.json)
    - 护眼粉 (eye-pink.json)
    - 护眼琥珀 (eye-amber.json)
    - 护眼青 (eye-cyan.json)
    - 护眼紫 (eye-purple.json)
    - 温暖 (warm.json)

#### 文件导入导出功能完善

- **增强文件导入功能**
    - 支持多种文件格式导入 (MD, TXT, HTML, JSON等)
    - 新增导入选项对话框，提供更灵活的导入配置
    - 优化导入流程，提升导入效率

### 🚀 新增功能

#### 主题系统重构

- **支持应用主题和编辑器主题分开设置**
    - 新增独立的编辑器主题配置选项
    - 应用主题和编辑器主题可独立切换
    - 支持不同主题组合，提供更灵活的个性化体验

#### 文件状态管理

- **自动保存文件和目录状态**
    - 应用关闭时自动保存当前打开的文件和目录结构
    - 应用重新打开后自动加载上次的工作状态
    - 提升用户体验，无需手动重新打开文件

#### 项目结构调整

- **新增专业目录结构**
    - 新增 `themes/` 目录：存放主题配置文件
    - 新增 `icon/` 目录：存放应用图标资源
    - 新增 `config/` 目录：存放配置文件
    - 优化项目结构，提升代码可维护性

#### 主题资源管理

- **新增18种主题配置文件**
    - 薰衣草梦 (lavender.json)
    - 珊瑚暖阳 (coral.json)
    - 薄荷清风 (mint.json)
    - 日落余晖 (sunset.json)
    - 玫瑰晨曦 (rose.json)
    - 深邃夜空 (night.json)
    - 深空黑曜 (obsidian.json)
    - 科技蓝 (tech-blue.json)
    - 海洋之心 (ocean.json)
    - 森林绿意 (forest.json)
    - 护眼绿 (eye-green.json)
    - 护眼米 (eye-beige.json)
    - 护眼蓝 (eye-blue.json)
    - 护眼粉 (eye-pink.json)
    - 护眼琥珀 (eye-amber.json)
    - 护眼青 (eye-cyan.json)
    - 护眼紫 (eye-purple.json)
    - 温暖 (warm.json)

#### 文件导入导出功能完善

- **增强文件导入功能**
    - 支持多种文件格式导入 (MD, TXT, HTML, JSON等)
    - 新增导入选项对话框，提供更灵活的导入配置
    - 优化导入流程，提升导入效率

#### 新增对话框

- **成功提示对话框** (ShowSuccessDialog.ts)
    - 统一的成功提示界面
    - 支持自定义标题和消息内容
    - 提供美观的视觉反馈

- **技术栈信息对话框** (ShowTechStackDialog.ts)
    - 显示项目技术栈详细信息
    - 展示各组件版本号和依赖关系
    - 帮助用户了解项目技术背景

#### 构建优化

- **新增构建脚本**
    - 新增 `build/copyfile.bat`：文件复制脚本
    - 新增 `build/installer.nsh`：NSIS安装程序配置
    - 优化构建流程，提升构建效率

### 🔧 优化改进

#### 编辑器主题适配

- **编辑区主题实时适配**
    - 编辑器区域根据编辑器主题配置实时更新样式
    - Monaco编辑器主题与编辑器主题配置同步
    - 提升编辑体验，保持视觉一致性

#### 对话框优化

- **主题设置对话框重构** (ShowThemeSettingDialog.ts)
    - 代码量减少 61% (从797行优化至312行)
    - 支持应用主题和编辑器主题独立配置
    - 优化UI布局，提升用户体验
    - 新增主题预览功能

#### 代码重构

- **工具函数优化**
    - `theme-config.ts` 重构为 `theme-config.ts` 和 `theme-config-optimized.ts`
    - 主题配置代码结构更清晰
    - 优化主题加载和缓存机制

- **渲染器模块重组**
    - 将渲染相关代码从 `utils/` 迁移至 `renders/` 目录
    - 新增 `renders/` 目录存放渲染器代码
    - 提升代码组织结构

#### 样式优化

- **CSS文件重组**
    - 将样式文件从 `style/` 迁移至 `styles/` 目录
    - 新增主题CSS生成器 (theme-css-generator.ts)
    - 优化样式管理，提升维护性

### 🐛 Bug修复

#### 文本格式化功能修复

- **修复加粗、倾斜、下划线、删除线功能**
    - 修复文本格式化功能不生效的问题
    - 优化格式化逻辑，提升稳定性
    - 确保格式化功能正常工作

#### 编译错误修复

- **修复TypeScript编译错误**
    - 解决类型定义问题
    - 修复模块导入错误
    - 确保项目正常编译

### 📝 文档更新

#### 新增文档

- **架构文档.md** (2449行)
    - 详细的项目架构说明
    - 核心模块设计文档
    - 通信机制和数据流分析

- **功能分析报告.md** (1399行)
    - 完整的功能分析报告
    - 技术实现详细说明
    - 数据流和状态管理分析

- **规格文档.md** (1524行)
    - 产品规格说明
    - 功能规格定义
    - 技术规格要求

- **设计文档.md** (476行)
    - UI设计规范
    - 交互设计说明
    - 性能设计方案

- **项目详细文档.md** (655行)
    - 项目概述和技术架构
    - 软件架构详细说明
    - 开发指南和最佳实践

- **文件导入功能说明.md** (389行)
    - 文件导入功能详细说明
    - 支持格式和技术实现
    - 使用指南和注意事项

- **文件导出功能说明.md** (334行)
    - 文件导出功能详细说明
    - 支持格式和技术实现
    - 使用指南和注意事项

- **主题设置详细方案.md** (更新)
    - 主题系统优化方案
    - 新增编辑器主题配置说明
    - 主题文件管理指南

- **主题优化方案.md** (更新)
    - 主题系统优化背景
    - 优化方案详细说明
    - 优化效果评估

- **文档更新摘要.md** (新增)
    - 文档更新历史记录
    - 更新内容总结
    - 项目现状评估

### 📊 统计数据

- **代码变更**: 133个文件修改
- **新增行数**: 28,467行
- **删除行数**: 16,027行
- **净增长**: 12,440行
- **提交次数**: 8次

---

## 2026年3月30日 - 版本 1.1.0

`Bai Ze Notes 1.1.0 windows.x64.exe` 是免安装直接使用
`Bai Ze Notes Setup 1.1.0 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

更新日志：

- 依赖升级
    - Electron 升级至 38.0.0，支持最新特性和性能优化
    - TypeScript 升级至 6.0.2，支持最新语言特性
    - ESLint 升级至 9.26.0，使用最新 linting 规则
    - @vue/eslint-config-typescript 升级至 14.7.0，支持 ESLint 9.x
- TypeScript 配置优化
    - 更新 tsconfig.node.json，使用 module: "NodeNext" 和 moduleResolution: "NodeNext"
    - 更新 tsconfig.web.json，添加 ignoreDeprecations: "6.0" 以兼容未来版本
    - 修复 TypeScript 编译器堆栈溢出问题，增加 Node.js 堆栈大小配置
- 构建优化
    - 修改 typecheck:node 脚本，增加 --max-old-space-size=8192 --stack-size=4096 参数
    - 解决大型项目类型检查时的性能问题
- 版本更新
    - 版本号更新至 1.1.0
    - 增加Linux、macOS编译配置
    - 帮助菜单增加技术栈版本信息
    - 整理项目详细文档
    - 增加完善文件导入导出功能

2026年3月15日：

`BaiZeNotes 1.0.2.exe` 是免安装直接使用
`BaiZeNotes Setup 1.0.2.exe` 是`windows`下的安装包，目前不支持`linux、macos、HarmonyOS`，可以自行下载编译

更新日志：

- 完善主题设置功能
    - 新增 20 种主题样式（薰衣草梦、珊瑚暖阳、薄荷清风、日落余晖、玫瑰晨曦、深邃夜空、深空黑曜、科技蓝、海洋之心、森林绿意、护眼绿、护眼米、护眼蓝、护眼粉、护眼琥珀、护眼青、护眼紫等）
    - 优化主题设置对话框布局，窗口大小调整为 1100x750
    - 实现主题实时切换，所有窗口同步更新主题样式
    - 添加主题预览功能，支持可视化选择主题
- 优化快速链接设置功能
    - 调整快速链接设置页面布局，窗口大小调整为 1100x750
    - 实现快速链接保存后立即生效，无需重启应用
    - 添加主题样式支持，快速链接设置窗口跟随主题变化
    - 优化 IPC 通信机制，统一使用 `baize-notes:` 前缀
- 优化关于页面
    - 补充编译发布日期和详细版本信息
    - 优化页面布局，添加应用描述信息
    - 修复版本信息显示问题，正确显示 Electron、Chromium、Node.js、V8 版本
    - 窗口调整为可调整大小，提升用户体验
- 优化联系我们页面
    - 重新设计页面布局，窗口大小调整为 600x400
    - 添加白泽图标 SVG，提升视觉效果
    - 添加主题样式支持，跟随主题变化
- 优化系统设置对话框
    - 调整窗口大小为 500x300，优化布局
    - 添加无边框设计和主题样式支持
    - 优化设置项布局和交互体验
- 优化各个对话框页面
    - 统一对话框样式，添加标题栏渐变效果
    - 实现主题样式跟随，所有对话框支持主题切换
    - 优化布局和间距，提升视觉效果
    - 添加关闭按钮悬停效果和过渡动画
- 修复 Mermaid 编辑器实时预览功能
    - 修复 updateGraph 函数中错误的数据获取方式（使用 value 替代 innerHTML）
    - 修复预览区域清空方式（使用 innerHTML = '' 替代 firstChild = ''）
    - 修复 mermaid.render() 调用方式，正确处理 Promise 返回结果
    - 添加完善的错误处理机制，显示渲染错误信息
- 新增 Mermaid 编辑器拖动分隔条功能
    - 在编辑区域和预览区域之间添加可拖动的分隔条
    - 支持动态调整编辑区域和预览区域的显示占比
    - 宽度限制在 10%-90% 之间，防止布局崩溃
    - 添加视觉反馈，悬停和拖动时有明显的颜色变化
    - 拖动时禁用文本选择，避免误操作
- 其他优化
    - 更新版本号至 1.0.2
    - 新增 CHANGELOG.md 文件，记录版本更新历史
    - 新增主题配置工具和对话框主题工具
    - 优化 IPC 通信，统一事件命名规范

2026年3月8日：
`BaiZeNotes 1.0.1.exe` 是免安装直接使用
`BaiZeNotes Setup 1.0.1.exe` 是`windows`下的安装包，目前不支持`linux、macos、HarmonyOS`，可以自行下载编译

- 支持安装目录由用户自定义选中
- 支持快速链接用户自定义: **设置->快速链接设置**
- 更新项目说明README.md
- 补充项目设计文档，参考`\doc`目录
- 更新工具图标（使用`Codearts Agent`生成）
