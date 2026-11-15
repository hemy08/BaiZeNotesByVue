# 发布说明 (Release Notes)

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
- 实现方案与验收见 [17-系统设置补充实现计划](docs/reports/md/17-系统设置补充实现计划.md)

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
- **复扫收口**：6 维度全量复扫结论 105 项完全修复 / 22 项部分修复 / 0 未处理，详见 [2026-11-15-晚-全量复扫结果](docs/reports/md/2026-11-15-晚-全量复扫结果.md)

### ⚠️ 已知问题

- 自动更新源未配置（example.com 占位，菜单会诚实提示）；配置存储目录未完全收敛；主窗口 preload 白名单化留待下批次（当前由主进程校验兜底）
- 详情见 [2026-11-15-晚-全量复扫结果](docs/reports/md/2026-11-15-晚-全量复扫结果.md)

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

- **Electron**: 43.8.10
- **Vue 3**: 3.5.45
- **TypeScript**: 6.0.3
- **Vite**: 8.2.2
- **Monaco Editor**: 0.57.0
- **markdown-it**: 15.0.3
- **Mermaid**: 12.3.0

---

**最后更新时间**: 2026-11-14
**当前版本**: 1.3.0
**维护者**: hemy08
