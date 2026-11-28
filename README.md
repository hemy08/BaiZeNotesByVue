# 白泽笔记 (BaiZeNotes)

<div align="center">

![Version](https://img.shields.io/badge/version-1.5.3-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-43.8.12-blue.svg)
![Vue](https://img.shields.io/badge/Vue-3.5.46-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0.3-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**一款功能丰富、界面美观的跨平台 Markdown 桌面编辑器**

[快速开始](#-快速开始) · [功能特性](#-功能特性) · [下载安装](#-下载安装) · [开发文档](#-开发文档)

</div>

![欢迎界面](docs/images/welcome.png)

---

## 📖 项目简介

白泽笔记是一款基于 **Electron + Vue 3 + TypeScript** 构建的现代化 Markdown 桌面编辑器，采用 **Monaco Editor**（VS Code 同款编辑器）作为核心编辑组件，支持实时预览、多格式导入导出、丰富的主题系统和强大的工具集成。

### 🎯 设计理念

- **简洁优雅**：现代化的 UI 设计，28种精美主题任你选择
- **功能强大**：Monaco Editor + 实时预览 + 多格式支持
- **性能优异**：大文件加载速度提升50%+，内存使用减少40%
- **跨平台**：支持 Windows 平台
- **类型安全**：完整的 TypeScript 类型支持

### ✨ 核心亮点

- 🚀 **Monaco Editor**：VS Code 同款编辑器，智能补全、多光标编辑
- 🎨 **28种主题**：精心设计的应用主题，支持实时切换
- 📝 **实时预览**：Markdown 实时渲染，支持数学公式、流程图；预览在渲染进程本地单跳完成（零主进程渲染 IPC）
- 🌐 **国际化（i18n）**：内置简体中文 / English 双语，系统设置中实时切换，主进程与渲染层共用一套词典
- 🔒 **安全加固**：导航边界拦截、shell 协议白名单、preload 通道白名单、CSP、DOMPurify 消毒、iframe sandbox 收窄
- 📦 **多格式支持**：导入导出 Word、HTML、JSON、YAML、PDF 等
- 🛠️ **工具集成**：转换工具、加密工具、开发工具一应俱全
- ⚡ **性能优化**：大文件加载快50%，内存占用少40%；PlantUML 本地离线渲染，无需联网

---

## ✨ 功能特性

### 📝 编辑器核心

#### Monaco Editor 集成

- **智能补全**：Markdown 语法智能补全
- **多光标编辑**：支持多光标同时编辑
- **代码折叠**：支持代码块折叠
- **语法高亮**：完整的 Markdown 语法高亮
- **快捷键支持**：丰富的快捷键支持

#### 实时预览

- **Markdown 渲染**：实时 Markdown 渲染
- **本地单跳渲染**：预览渲染全部在渲染进程完成（PF-02），主进程渲染 IPC 由 4 跳降为 0 跳
- **代码高亮**：支持 100+ 编程语言高亮
- **数学公式**：KaTeX 数学公式渲染（已迁移至渲染层，不再阻塞主进程）
- **流程图**：Mermaid 流程图、时序图、甘特图等（渲染层本地渲染 + 内容 hash 缓存）
- **PlantUML**：基于内置 teaVM 的本地离线渲染（`resources/plantuml`），弱网/离线可用，失败时降级
- **图表支持**：饼图、柱状图、折线图等

##### 1.5.1 新增：搜索 / 命令面板 / 能力开关

- **全工作区搜索/替换**：`Ctrl+Shift+F` 跨文件搜索，支持大小写/整词/正则，结果跳转与批量替换
- **命令面板 / Quick Open**：`Ctrl+Shift+P` 命令面板、`Ctrl+P` 快速打开文件
- **粘贴/复制增强**：粘贴 HTML/Word 内容自动转 Markdown；支持复制为 Markdown/HTML
- **可选能力开关**：系统设置 →「功能」页签，默认关闭；开启后提供多标签/会话恢复、文档历史/diff、Markdown lint/格式化、拼写检查、智能输入、大纲增强
- **写作体验 P0**：系统设置 →「编写体验」页签，9 项能力默认关闭；开启后可启用写作模式、打字机/段落聚焦、写作统计与目标、排版预设、光标恢复、气泡工具栏/Slash、风格检查
- **智能输入增强**：系统设置 →「功能」→ Markdown 智能输入（唯一开关），普通模式与写作模式通用；有序列表递增/重编号、引用/嵌套/任务列表续行、空列表回车/退格退出、标题后空行、输入法组合期不干预、一次撤销
- **本地知识库基座**：Front matter/文档属性编辑、主进程工作区索引、标签索引、Wiki 双链反向链接、Ctrl/Cmd+Click 跳转与缺失页创建、缺失/歧义链接检查、附件引用管理/孤儿审计/移入回收站/附件重命名、Wiki 链接悬浮预览；全文检索继续复用 A2 按需搜索（1.5.1 不建持久全文索引）；入口：编辑菜单「文档属性 / 知识库 / 附件管理」或命令面板

#### 快速访问

- **符号插入**：快速插入常用符号
- **表情插入**：快速插入常用表情
- **自定义快捷键**：支持自定义快捷键绑定

#### 多格式支持

- **导入格式**：Word、HTML、JSON、YAML、XML、TXT、CSV
- **导出格式**：Word、JSON、XML、YAML、HTML、PDF
- **编码检测**：自动检测文件编码（UTF-8、GBK、GB2312等）
- **编码转换**：支持多种编码格式转换

### 🎨 主题系统

#### 应用主题（28种）

- **经典主题**：白泽紫韵、暖白温馨、清新简约
- **护眼主题**：护眼绿洲、护眼米黄、护眼淡蓝、护眼樱粉、护眼琥珀、护眼青瓷、护眼丁香
- **特色主题**：薰衣草梦、珊瑚暖阳、薄荷清风、日落余晖、玫瑰花园
- **深色主题**：深邃夜空、极简深黑
- **自然主题**：深海蔚蓝、森林秘境
- **白泽专属**：白泽图标、白泽文字、白泽星空、白泽神兽、白泽数据、白泽镜像（浅色/深色）

#### 编辑器主题（57种）

- Monaco Editor 主题同步（内置 3 + 磁盘 54）
- 支持自定义主题
- 主题实时切换，无需重启

### 🛠️ 工具集成

#### 转换工具

- **格式转换**：JSON/CSV/YAML/TOML 互转
- **大小写转换**：驼峰、下划线、短横线等
- **颜色转换**：HEX、RGB、HSL 互转
- **日期转换**：时间戳、日期格式转换

#### 加密工具

- **加密解密**：AES、DES、RSA 等多种加密算法
- **哈希计算**：MD5、SHA-1、SHA-256、SHA-512
- **Base64**：Base64 编码解码

#### 开发工具

- **正则表达式**：正则表达式测试工具
- **HTTP 请求**：HTTP 请求测试工具
- **时间戳转换**：Unix 时间戳转换
- **UUID 生成**：UUID/GUID 生成工具
- **二维码生成**：二维码生成工具

#### 在线资源导航

- **AI 导航**：ChatGPT / DeepSeek / Claude / Midjourney / Suno 等 9 组 70 个主流 AI 工具官方入口，菜单一键直达（2026-11 新增）

### ℹ️ 帮助系统

#### 版本信息

- **版本发布说明**：查看各版本（v1.0.0 ~ v1.5.0）的发布说明
- **更新日志**：展示依赖升级详情和代码适配修复
- **技术栈信息**：显示项目技术栈详细信息
- **关于页面**：显示应用版本、开发框架、系统环境信息

### 🌐 国际化（i18n）

#### 中英双语

- **语言切换**：系统设置中选择「简体中文 / English」，切换后界面即时刷新，无需重启
- **词条统一**：主进程与渲染层共用 `src/shared/i18n` 词典（zh-CN / en-US 各 12 个命名空间），避免两套文案漂移
- **主进程文案**：对话框、消息框等 JSDOM/原生提示经 `tMain()` 输出；渲染层组件统一使用 `t()`
- **范围覆盖**：菜单、状态栏、设置、对话框、编辑器 UI、转换/网络工具、主题名称等

### 🔒 安全与隐私

#### 进程与交互安全

- **导航边界**：主窗口拦截 `will-navigate` / `will-redirect`，仅允许开发服务器与打包后的本地 renderer 页面
- **协议白名单**：`shell.openExternal` 统一走安全封装，仅放行 http/https，拒绝 `file:` / `javascript:` / `data:` 等协议
- **新窗口策略**：`setWindowOpenHandler` 一律不新建窗口，外部链接只交给系统浏览器
- **拖拽防护**：渲染层全局拦截 `dragover` / `drop`，阻止拖入远程链接或本地 HTML 触发导航
- **preload 白名单**：对话框 preload 的 `send` 仅放行 2 个回车通道；在线网页窗口不加载任何 preload
- **CSP**：渲染页配置 Content-Security-Policy；渲染输出统一经 DOMPurify 消毒后再 `v-html`
- **iframe 收窄**：HTML 查看器 sandbox 移除脚本/表单/弹窗权限，仅保留同源静态展示

### 📂 文件管理

#### 文件操作

- **智能编码检测**：自动检测文件编码
- **自动保存**：默认关闭（需在系统设置中自行开启），可配置保存间隔（默认 60 秒）；关闭应用时若文件有未保存修改会提示「保存并关闭 / 不保存 / 取消」
- **文件状态持久化**：应用重启后自动恢复工作状态
- **崩溃恢复**：支持崩溃恢复

#### 资源管理器

- **文件树展示**：树形结构展示文件和文件夹
- **Markdown 目录大纲**：自动生成 Markdown 目录大纲
- **拖拽支持**：支持文件拖拽操作
- **右键菜单**：丰富的右键菜单操作

### ⚡ 性能优化

#### 编辑器性能

- **大文件优化**：大文件加载速度提升 50%+
- **内存优化**：内存使用减少 40%
- **Monaco Editor 实例管理**：防止内存泄漏
- **LRU 缓存算法**：文件内容智能缓存

#### Mermaid 渲染优化

- **并行渲染**：多图表并行渲染，速度提升 3倍
- **渲染缓存**：图表渲染结果缓存
- **按需渲染**：只渲染可见区域图表

#### EventBus 优化

- **自动清理机制**：组件卸载时自动清理事件监听器
- **内存泄漏修复**：修复事件监听器残留问题

#### 包体积与死代码治理

- **死代码清理**：删除 36 个零引用文件 / 10,403 行死代码，主进程产物 `out/main/index.js` 体积下降 44.97%
- **死通道清理**：IPC 通道常量 123 → 86；通道命名统一为 `baize:<domain>:<name>`，并在测试中强制校验格式、域名白名单与零死常量
- **打包体积治理**：渲染层依赖（mermaid / monaco-editor / vue / katex / highlight.js 等 14 个已由 Vite 打入 renderer 的包）移入 devDependencies，并排除 node_modules 内 source map；app.asar 361.59 MiB → 66.65 MiB（-81.6%），NSIS 安装包 161.2 MiB → 111.8 MiB（-30.6%），便携包 131.0 MiB → 100.0 MiB（-23.7%）
- **依赖分类策略（P2-5）**：上述「Vite 内联进 renderer/preload 的运行时库」保持 devDependencies（避免 electron-builder 重复打包 node_modules），并由架构测试冻结 15 项显式 allowlist；依赖审计口径同步升级为全量树 `npm audit --audit-level=high`（含 dev），详见 [项目详细文档 §8.5](docs/wiki/02-设计与架构/项目详细文档.md)

#### 状态管理优化

- **electron-store 持久化**：使用 electron-store 进行状态持久化
- **状态分离**：分离持久化状态和运行时状态
- **类型安全 API**：提供完整的 TypeScript 类型支持

---

## 📸 应用截图

<div align="center">

|                  主界面                   |                  主题设置                   |
| :---------------------------------------: | :-----------------------------------------: |
| ![主界面](docs/images/main-interface.png) | ![主题设置](docs/images/theme-settings.png) |

</div>

---

## 🚀 快速开始

### 环境要求

- **Node.js**: >= 22.0.0（与 package.json `engines` 一致）
- **npm**: >= 10.0.0
- **Git**: 最新版本

### 安装依赖

```bash
# 克隆项目
git clone https://github.com/hemy08/BaiZeNotesByVue.git

# 进入项目目录
cd BaiZeNotesByVue

# 安装依赖
npm install
```

### 开发运行

```bash
# 启动开发模式
npm run dev
```

### 构建打包

```bash
# 构建 Windows 版本（NSIS安装包 + 便携版）
npm run build:win:all

# 构建 Windows NSIS 安装包
npm run build:win:nsis

# 构建 Windows 便携版
npm run build:win:portable

# 构建 macOS 版本（占位命令，当前未验证：缺少 entitlements.mac.plist 与签名配置，暂不可用）
npm run build:mac

# 构建 Linux 版本（占位命令，当前未验证：maintainer 等元数据为占位，暂不可用）
npm run build:linux
```

---

## 📦 下载安装

### Windows 平台

目前仅支持 Windows 平台，提供两个下载渠道：

#### 方式一：GitHub Releases（推荐）

[![GitHub Release](https://img.shields.io/badge/GitHub-Releases-blue.svg)](https://github.com/hemy08/BaiZeNotesByVue/releases)

|  版本  |              说明               |                          下载链接                          |
| :----: | :-----------------------------: | :--------------------------------------------------------: |
| 安装版 | NSIS 安装包，支持自定义安装路径 | [下载](https://github.com/hemy08/BaiZeNotesByVue/releases) |
| 便携版 |        免安装，解压即用         | [下载](https://github.com/hemy08/BaiZeNotesByVue/releases) |

#### 方式二：华为云 DevCloud

[![Huawei Cloud](https://img.shields.io/badge/Huawei-DevCloud-red.svg)](https://devcloud.cn-north-4.huaweicloud.com/cloudartifact/project/13dd100011dc4f88ad60768fb5b4b7db/private/repoView/detail?repoId=13dd100011dc4f88ad60768fb5b4b7db&path=BaiZeNotes)

|  版本  |    说明     |                                                                                          下载链接                                                                                          |
| :----: | :---------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------: |
| 安装版 | NSIS 安装包 | [下载](https://devcloud.cn-north-4.huaweicloud.com/cloudartifact/project/13dd100011dc4f88ad60768fb5b4b7db/private/repoView/detail?repoId=13dd100011dc4f88ad60768fb5b4b7db&path=BaiZeNotes) |
| 便携版 | 免安装版本  | [下载](https://devcloud.cn-north-4.huaweicloud.com/cloudartifact/project/13dd100011dc4f88ad60768fb5b4b7db/private/repoView/detail?repoId=13dd100011dc4f88ad60768fb5b4b7db&path=BaiZeNotes) |

### 安装说明

#### 安装版

1. 下载 `BaiZeNotes_Setup_x.x.x_windows_x64.exe`
2. 双击运行安装程序
3. 选择安装路径（支持自定义）
4. 完成安装后，桌面会自动创建快捷方式

#### 便携版

1. 下载 `BaiZeNotes_x.x.x_windows_x64.exe`
2. 双击运行即可，无需安装
3. 可放置在任意目录使用

---

## 🏗️ 项目结构

```
BaiZeNotesByVue/
├── src/                                  # 源代码目录（357 个代码文件：261 ts / 96 vue；另 22 css）
│   ├── main/                             # 主进程（72 个 .ts）
│   │   ├── index.ts                      # 主进程入口（窗口、生命周期、导航边界）
│   │   ├── config/                       # 配置管理（11 个模块）
│   │   │   ├── config-manager.ts         # 配置读写单真源（STORE_BACKED_CONFIGS）
│   │   │   ├── theme-config.ts           # 应用主题配置（28 种）
│   │   │   ├── theme-registry.ts         # Monaco 主题注册表
│   │   │   ├── editor-setting.ts         # 编辑器设置
│   │   │   ├── system-setting.ts         # 系统设置（含语言）
│   │   │   ├── quick-link-config.ts      # 快速链接配置
│   │   │   ├── window-manager.ts         # 窗口管理
│   │   │   └── short-key-register.ts     # 快捷键注册
│   │   ├── constants/                    # 共享常量（urls.ts）
│   │   ├── dialogs/                      # 主进程对话框（2 个文件；JSDOM HTML 对话框已下线，仅剩 Vue 对话框转发与在线网页窗口）
│   │   ├── ipc/                          # IPC 注册与菜单动作（11 个文件）
│   │   │   ├── handlers.ts               # IPC 处理器
│   │   │   ├── index.ts                  # IPC 注册入口
│   │   │   ├── ipc-listener-manager.ts   # IPC 监听器管理
│   │   │   └── menu-*.ts                 # 菜单动作（file/edit/view/help/tools/handle）
│   │   ├── renders/                      # 主进程渲染器
│   │   │   └── plantuml-local.ts         # PlantUML 本地 teaVM 离线渲染
│   │   ├── window/                       # 窗口管理（WindowManager 单例）
│   │   └── utils/                        # 工具函数（43 个文件）
│   │       ├── file-utils/               # 文件操作（15 个文件：读写/导入导出/自动保存/剪贴板/图片/目录树）
│   │       ├── security.ts               # 导航边界与 shell 协议白名单
│   │       ├── i18n.ts                   # 主进程 tMain() 翻译
│   │       ├── baize-store.ts / store-factory.ts / file-state-store.ts
│   │       ├── app-paths.ts / app-state.ts / global.ts / utils.ts
│   │       ├── logger.ts / auto-updater.ts
│   │       └── encrypt-decrypt.ts        # 加解密工具
│   ├── preload/                          # 预加载脚本（4 个文件）
│   │   ├── index.ts                      # 主窗口 API 暴露（受限 ipcRenderer + window.api）
│   │   ├── dialog.ts                     # 对话框 preload（send 通道白名单）
│   │   ├── allowed-channels.generated.ts # 生成的通道白名单常量（send 86 / receive 28 / window.api 6）
│   │   └── index.d.ts                    # 类型声明
│   ├── shared/                           # 主进程 / 渲染层共享代码（65 个 .ts）
│   │   ├── ipc-channels.ts               # IPC 通道常量唯一真源（120 个通道 / 21 组）
│   │   ├── i18n/                         # 中英词典（12 个命名空间 × 2 语言 = 26 个文件）
│   │   ├── types/                        # 共享类型定义（14 个模块）
│   │   └── constants/                    # 共享常量（13 个模块）
│   └── renderer/                         # 渲染进程代码（300 个文件：96 vue / 120 ts / 60 svg / 22 css）
│       ├── index.html                    # 渲染页（含 CSP）
│       └── src/
│           ├── App.vue / main.ts / env.d.ts
│           ├── components/               # Vue 组件（203 个文件：95 vue + 97 ts + 11 css）
│           │   ├── BaiZeNotes.vue / MenuBar.vue / StatusBar.vue / WelcomeScreen.vue
│           │   ├── Markdown/             # 编辑器与预览（43 个文件，含 preview-local-render.ts）
│           │   ├── dialogs/              # 渲染层对话框（23 个懒加载对话框 + BaseDialog 基座 + 面板子组件）
│           │   ├── PluginTools/          # 插件工具（78 个文件：38 个工具）
│           │   ├── MenuBar/              # 菜单逻辑（menu-config / menu-actions / menu-consts）
│           │   ├── ResourceManager/      # 资源管理器
│           │   ├── WorkSpaceArea/        # 工作区（NaviTab / WorkSpace）
│           │   └── HemyTools/            # 辅助工具（HTML 查看 / PDF 预览）
│           ├── composables/              # 组合式函数（6 个：对话框拖拽/缩放、EventBus、窗口管理）
│           ├── common/                   # 公共模块（15 个文件：useConfigStore、i18n、event-bus、templates、escape-html）
│           ├── data/                     # 纯数据资产（pinyin-data 字库，动态 import 按需加载）
│           ├── styles/                   # 样式文件（9 个）
│           └── assets/                   # 静态资源（图标/图片等 62 个文件）
├── resources/                            # 应用资源
│   ├── themes/                           # 主题配置
│   │   └── monaco-themes/themes/         # Monaco 编辑器主题（54 个主题 json + themelist 索引）
│   ├── plantuml/                         # PlantUML 本地 teaVM 渲染资源
│   ├── icon/                             # 应用图标（ico/svg）
│   └── config/                           # 配置文件（version.json 构建时生成）
├── tests/                                # 单元测试（424 个 .test.ts / 8,027 个用例）
├── docs/                                 # 项目文档
│   ├── wiki/                             # 知识库文档（4 类 25 篇）
│   │   ├── README.md                     # 文档索引
│   │   ├── 01-项目分析报告/               # 项目分析（9 篇，历史快照）
│   │   ├── 02-设计与架构/                 # 架构文档、设计文档、规格文档、项目详细文档（4 篇）
│   │   ├── 03-功能说明/                   # 导入/导出/菜单配置等功能说明（5 篇）
│   │   └── 04-优化与专项报告/             # 优化专项报告（7 篇）
│   ├── reports/                          # 报告归档（Markdown 版 + 独立 HTML Wiki）
│   │   ├── README.md                     # 报告总索引（含口径说明与合并记录）
│   │   ├── md/                           # Markdown 报告（34 篇：01 检查 13 / 02 修复 10 / 03 专项 11）
│   │   └── html/                         # HTML 报告 Wiki（首页 + 侧边栏 + 33 份带悬浮目录页面，共 35 页）
│   ├── images/                           # 文档配图
│   ├── 历史归档/                          # 历史文档归档（非当前实现，见「文档导航」说明）
│   │   └── 架构文档.html                  # 历史版架构文档合辑（非当前；最新见 docs/wiki/02-设计与架构/架构文档.md）
│   └── md/                               # 其他 Markdown 文档
├── build/                                # 构建脚本（generate-version-config.js、prepare-build-dirs.js、报告工具 generate-report-wiki.js 等）
├── dist/                                 # 打包输出（已忽略）
├── out/                                  # 编译输出（已忽略）
├── electron.vite.config.ts               # Electron-Vite 配置
├── electron-builder.yml                  # Electron-Builder 配置
├── eslint.config.js                      # ESLint 配置（flat config）
├── package.json                          # 项目依赖配置
├── tsconfig*.json                        # TypeScript 配置
├── vitest.config.ts                      # 测试配置
├── .prettierrc.yaml                      # Prettier 配置
├── CHANGELOG.md                          # 更新日志
└── RELEASE-NOTES.md                      # 发布说明
```

---

## 🛠️ 技术栈

### 核心框架

|    技术    |  版本   | 说明                   | 官网                                    |
| :--------: | :-----: | :--------------------- | :-------------------------------------- |
|  Electron  | 43.8.12 | 跨平台桌面应用框架     | [官网](https://www.electronjs.org/)     |
|    Vue     | 3.5.46  | 渐进式 JavaScript 框架 | [官网](https://vuejs.org/)              |
| TypeScript |  6.0.3  | JavaScript 的类型超集  | [官网](https://www.typescriptlang.org/) |
|    Vite    |  8.3.8  | 下一代前端构建工具     | [官网](https://vitejs.dev/)             |

### 编辑器核心

|       技术        |  版本   | 说明                                           | 官网                                               |
| :---------------: | :-----: | :--------------------------------------------- | :------------------------------------------------- |
|   Monaco Editor   | 0.57.0  | VS Code 同款代码编辑器                         | [官网](https://microsoft.github.io/monaco-editor/) |
|    markdown-it    | 15.0.3  | Markdown 解析器，支持插件扩展                  | [官网](https://markdown-it.github.io/)             |
|   highlight.js    | 11.12.0 | 代码语法高亮，支持 100+ 语言                   | [官网](https://highlightjs.org/)                   |
|       KaTeX       | 0.18.11 | 快速数学公式渲染（渲染层本地渲染）             | [官网](https://katex.org/)                         |
|      Mermaid      | 12.3.0  | 流程图、时序图、甘特图等                       | [官网](https://mermaid-js.github.io/)              |
| PlantUML（teaVM） |    -    | 本地离线渲染（内置 `resources/plantuml` 资源） | [官网](https://plantuml.com/)                      |

### 状态管理与数据

|      技术       |  版本  | 说明                                              | 官网                                                     |
| :-------------: | :----: | :------------------------------------------------ | :------------------------------------------------------- |
| Vue Composables |   -    | Vue 3 组合式函数状态管理（渲染层 useConfigStore） | [官网](https://vuejs.org/)                               |
| electron-store  | 12.0.0 | Electron 持久化存储（主进程配置单真源）           | [GitHub](https://github.com/sindresorhus/electron-store) |
|    fs-extra     | 11.4.1 | 文件系统增强，Promise 支持                        | [GitHub](https://github.com/jprichardson/node-fs-extra)  |

### 工具库

|    技术    |  版本  | 说明                  | 官网                                               |
| :--------: | :----: | :-------------------- | :------------------------------------------------- |
| crypto-js  | 4.2.0  | JavaScript 加密库     | [文档](https://cryptojs.gitbook.io/)               |
| DOMPurify  | 3.4.18 | HTML/SVG 消毒，防 XSS | [GitHub](https://github.com/cure53/DOMPurify)      |
|    uuid    | 14.0.3 | UUID 生成工具         | [GitHub](https://github.com/uuidjs/uuid)           |
|    ulid    | 3.0.2  | ULID 生成工具         | [GitHub](https://github.com/ulid/javascript)       |
| iconv-lite | 0.7.3  | 文件编码转换          | [GitHub](https://github.com/ashtuchkin/iconv-lite) |
| jschardet  | 4.1.0  | 文件编码探测          | [GitHub](https://github.com/aadsm/jschardet)       |

### UI 组件

|            技术            | 版本  | 说明              | 官网                                                   |
| :------------------------: | :---: | :---------------- | :----------------------------------------------------- |
| @imengyu/vue3-context-menu | 1.5.7 | Vue3 右键菜单组件 | [GitHub](https://github.com/imengyu/vue3-context-menu) |

### 开发工具

|                技术                |  版本   | 说明                                        | 官网                                                   |
| :--------------------------------: | :-----: | :------------------------------------------ | :----------------------------------------------------- |
|           electron-vite            |  6.0.0  | Electron + Vite 集成                        | [官网](https://electron-vite.org/)                     |
|          electron-builder          | 26.18.1 | Electron 应用打包工具                       | [官网](https://www.electron.build/)                    |
|               Vitest               |  5.1.1  | 单元测试框架（424 个测试文件 / 8,027 用例） | [官网](https://vitest.dev/)                            |
|               ESLint               | 10.15.0 | JavaScript 代码检查工具                     | [官网](https://eslint.org/)                            |
|              Prettier              | 3.10.1  | 代码格式化工具                              | [官网](https://prettier.io/)                           |
|  @electron-toolkit/eslint-config   |  3.0.0  | Electron ESLint 配置                        | [GitHub](https://github.com/alex8088/electron-toolkit) |
| @electron-toolkit/eslint-config-ts |  4.0.0  | Electron TypeScript ESLint 配置             | [GitHub](https://github.com/alex8088/electron-toolkit) |

### 构建工具

| 技术  |  版本   | 说明                     |
| :---: | :-----: | :----------------------- |
| NSIS  | 3.0.4.1 | Windows 安装程序制作工具 |
| 7-Zip |    -    | 文件压缩工具             |

---

## 📊 项目统计

> 以下数据为 **2026-11-21 实测**（1.5.1 发布版本基线，最新发布版本 1.5.6、当前开发版本 1.5.7；唯一真值以 [报告总索引](docs/reports/README.md) 的「当前基线」与 [IPC 通信矩阵](docs/reports/md/03-专项治理/IPC通信矩阵.md) 为准；历史版本数据保留在各报告时点）。

|      指标      |                           数量                           | 说明                                                                                                                                                                                                                                                         |
| :------------: | :------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   源码文件数   |                          357 个                          | `src/` 下代码文件（261 ts / 96 vue）；另 22 个 css（`src/` 总计 441 文件，含 60 个 svg）                                                                                                                                                                     |
|    代码行数    |                        97,434 行                         | 上述 357 个代码文件总行数（含空行；另 22 个 css 共 3,563 行）                                                                                                                                                                                                |
|   Vue 组件数   |                          96 个                           | `src/` 下 .vue 文件（components 目录 95 个 + 根组件 App.vue）                                                                                                                                                                                                |
|  渲染层对话框  |                          23 个                           | src/renderer/src/components/dialogs（懒加载对话框：complex 6 / help 7 / medium 5 / simple 5，另 BaseDialog 基座与面板子组件）                                                                                                                                |
|  主进程对话框  |                         2 个文件                         | src/main/dialogs（JSDOM HTML 对话框已下线，仅剩 Vue 对话框转发与在线网页窗口）                                                                                                                                                                               |
|    应用主题    |                          28 种                           | src/main/config/theme-config.ts（编译进主进程，无资源 JSON；旧 app_themes 已删除）                                                                                                                                                                           |
|   编辑器主题   |                          57 种                           | Monaco 主题（内置 3 + 磁盘 54；themes 目录含 54 个主题 json + themelist 索引）                                                                                                                                                                               |
|    IPC 通道    |                          116 个                          | `baize:<domain>:<name>`（120 个 / 21 组常量），唯一真源 `src/shared/ipc-channels.ts`                                                                                                                                                                         |
| preload 白名单 |               send 86 / receive 28 / api 6               | `src/preload/allowed-channels.generated.ts`（send/invoke 86、on/once 28 通道；`window.api` 6 方法 / 3 组）                                                                                                                                                   |
|    插件工具    |                          38 个                           | src/shared/constants/plugin-tools-manifest.ts（单一 manifest，异步按需加载）                                                                                                                                                                                 |
|    单元测试    |                       8,027 个用例                       | 424 个 `.test.ts` 文件（vitest，全通过）                                                                                                                                                                                                                     |
|    声明依赖    |                          49 个                           | 生产依赖 11 + 开发依赖 38（package.json 实测）                                                                                                                                                                                                               |
|    依赖审计    |                          0 漏洞                          | 生产与全量依赖均为 0 漏洞（2026-11-20 官方 registry 实测，`npm ls` 干净；Dependabot 254 条告警全量分类 0 条可复现）                                                                                                                                          |
|   安装包体积   |                        ≈114.0 MiB                        | NSIS 安装包 111.13 MiB / 便携版 100.33 MiB（app.asar 39.96 MiB、locales 2；2026-11-20 当前 dist 实测，发布前需从 HEAD 重建复验）                                                                                                                             |
|   主进程产物   |                        ≈0.62 MiB                         | `out/build/main/index.js`（655,183 B；2026-11-20 构建实测）                                                                                                                                                                                                  |
|  主渲染 chunk  | 143.2 KiB（入口）+ 490.1 KiB（主界面壳）；首屏 329.5 KiB | 入口 `index-*.js`（约 153,088 B）；主界面壳 `BaiZeNotes-*.js`（约 501,862 B）；首屏实际 = 入口 + modulepreload 共享 chunk 329.5 KiB（2026-11-21 构建实测）；Monaco/highlight.js/KaTeX 在异步 chunk 按需加载；欢迎页窗口控制条为异步 chunk，保证入口 ≤150 KiB |
|    文档规模    |       wiki 4 类 25 篇 / 报告 md 34 篇 / HTML 35 页       | 报告分类：01 检查与扫描 13 / 02 修复与实施 10 / 03 专项治理 11；HTML Wiki = 1 首页 + 34 份报告                                                                                                                                                               |

### 代码规模分布（实测）

|         类型         | 文件数  |    行数    |
| :------------------: | :-----: | :--------: |
|   TypeScript (.ts)   |   261   |   74,657   |
|    Vue SFC (.vue)    |   96    |   22,777   |
|     **源码合计**     | **357** | **97,434** |
|         CSS          |   22    |   3,563    |
| 单元测试（.test.ts） |   424   |  148,879   |
|   静态资源（.svg）   |   60    |    447     |

### 关键源码文件行数（实测）

|              文件               |  行数  | 说明                             |
| :-----------------------------: | :----: | :------------------------------- |
| pinyin-data.ts（data 数据资产） | 20,914 | 拼音字库（动态 import 按需加载） |
|      preview-md-blocks.ts       | 1,075  | 预览 blocks 插件                 |
|       file-operations.ts        |  937   | 文件读写与文件树操作             |
|     preview-local-render.ts     |  896   | 预览本地单跳渲染（PF-02）        |
|            utils.ts             |  879   | 主进程通用工具                   |
|           handlers.ts           |  852   | IPC 处理器注册                   |
|    MarkdownMonacoEditor.vue     |  789   | Monaco 编辑器组件                |
|       preview-md-media.ts       |  768   | 预览媒体插件                     |
|    plantuml.ts（templates）     |  737   | PlantUML 代码模板                |
|         menu-config.ts          |  724   | 菜单树配置（12 顶层 / 319 项）   |
|         theme-config.ts         |  707   | 应用主题配置（28 种）            |
|           security.ts           |  663   | 导航边界 / 协议白名单 / 路径守卫 |
|         ipc-channels.ts         |  170   | IPC 通道常量唯一真源（91 / 17）  |

---

## 📚 开发文档

项目文档分三类：**知识库文档**（[docs/wiki](docs/wiki/README.md)）、**报告归档**（[docs/reports](docs/reports/README.md)）与**报告 HTML Wiki**（[docs/reports/html](docs/reports/html/README.md)）。

### 文档索引

- [知识库文档索引](docs/wiki/README.md) - docs/wiki 全部文档导航（4 类 25 篇）
- [报告总索引](docs/reports/README.md) - 检查/修复/专项报告（34 篇：01 检查与扫描 13 / 02 修复与实施 10 / 03 专项治理 11，已去日期并按主题合并，含口径说明）
- [当前遗留问题清单](docs/reports/md/03-专项治理/当前遗留问题清单.md) - **问题跟踪台账**（22 项，21 ✅ / 0 🟡 / 1 ⏸️；修复后更新状态）
- [报告 HTML Wiki](docs/reports/html/README.html) - HTML 版报告（首页 + 侧边栏 + 每页顶部整体导航 + 33 份带悬浮目录页面，共 35 页）
- [IPC 通信矩阵](docs/reports/md/03-专项治理/IPC通信矩阵.md) - **当前 IPC 口径**（120 通道 / 21 组 + 白名单 send 86 + receive 28 + window.api 6 + 窗口/preload 结构）
- [IPC 通信治理报告](docs/reports/md/03-专项治理/IPC通信治理报告.md) - 通信检查 + 修复计划 + 命名方案（历史）

### 项目分析与架构

- [项目综合分析报告](docs/wiki/01-项目分析报告/项目综合分析报告.md) - 项目整体分析
- [性能与优化综合报告](docs/wiki/01-项目分析报告/性能与优化综合报告.md) - 性能优化详细报告
- [架构文档](docs/wiki/02-设计与架构/架构文档.md) - 系统架构说明
- [设计文档](docs/wiki/02-设计与架构/设计文档.md) - UI 设计规范
- [规格文档](docs/wiki/02-设计与架构/规格文档.md) - 需求与规格

### 功能文档

- [文件导入功能说明](docs/wiki/03-功能说明/文件导入功能说明.md) - 文件导入功能详细说明
- [文件导出功能说明](docs/wiki/03-功能说明/文件导出功能说明.md) - 文件导出功能详细说明
- [菜单配置详细文档](docs/wiki/03-功能说明/菜单配置详细文档.md) - 菜单系统文档
- [编辑器设置功能说明](docs/wiki/03-功能说明/编辑器设置功能说明.md) - 编辑器设置说明

### 优化与专项报告

- [事件监听器内存泄漏分析报告](docs/wiki/04-优化与专项报告/事件监听器内存泄漏分析报告.md) - 内存管理报告
- [事件监听器优化总结](docs/wiki/04-优化与专项报告/事件监听器优化总结.md) - 监听器治理总结
- [依赖包清理报告](docs/wiki/04-优化与专项报告/依赖包清理报告.md) - 依赖治理报告
- [状态管理与Store优化报告](docs/wiki/04-优化与专项报告/状态管理与Store优化报告.md) - 状态管理优化
- [主题优化方案](docs/wiki/04-优化与专项报告/主题优化方案.md) - 主题系统优化方案

### 2026-11 架构治理报告

- [国际化（i18n）实施报告](docs/reports/md/02-修复与实施/国际化实施报告.md) - 中英双语词典与 t()/tMain() 架构
- [预览单跳重构报告](docs/reports/md/02-修复与实施/预览单跳重构报告.md) - PF-02：预览本地渲染，IPC 4 跳 → 0 跳
- [IPC 通道命名统一方案](docs/reports/md/03-专项治理/IPC通信治理报告.md) - `baize:<domain>:<name>` 命名规范（历史 123 通道清单，已并入治理报告）
- [依赖安全治理报告](docs/reports/md/03-专项治理/依赖安全治理报告.md) - Dependabot 254 条告警全量分类（0 条可复现）、npm audit 差异归因、修复批与 Dependabot 配置
- [全量代码扫描报告（2026-11-20）](docs/reports/md/01-检查与扫描/2026-11-20-全量代码扫描报告.md) - 只读全量扫描（安全/架构/质量性能/功能/文档六专项；P0 0 / P1 10 / P2 精选 18）
- [架构文档（最新）](docs/wiki/02-设计与架构/架构文档.md) - 当前架构（含 i18n / PF-02 / PlantUML 本地渲染 / 配置单真源 / 安全边界）
- 说明：`docs/历史归档/架构文档.html` 为 **历史版本合辑（非当前实现）**，仅保留旧版版式与 ADR，最新架构以 wiki Markdown 为准

### 更新记录

- [更新日志](./CHANGELOG.md) - 版本更新历史
- [发布说明](./RELEASE-NOTES.md) - 版本发布说明

### 开发指南

```bash
# 代码检查
npm run lint

# 代码格式化
npm run format

# 代码格式检查（仅检查，不自动修改；CI quality-gate 中为阻断步骤，失败即 job 失败）
npm run format:check

# 类型检查（主进程 + 渲染层 + 测试三工程）
npm run typecheck

# 运行单元测试（424 个测试文件 / 8,027 个用例）
npm run test

# 运行单元测试并生成覆盖率报告
npm run test:coverage

# 架构边界检查（tests/architecture，依赖方向与 shared 边界）
npm run arch:check

# 质量基线一致性检查（版本 / IPC / 测试文件数 / 用例数 / 白名单 / 报告页数，与三份文档当前基线比对；用例数需 --test-json）
npm run quality:check

# 文档相对链接检查（仓库根 README/SECURITY + docs 下 Markdown；不含 HTML 生成物、不校验锚点）
npm run docs:check

# 构建产物体积预算检查（入口 chunk / NSIS / portable / asar / locales）
npm run budget:check

# 性能基线（软门禁）：bundle 指标 + 与仓库基线快照对比，偏离 >20% 仅输出 warning
npm run perf:ci

# 性能基线（含冷启动采样）：开发构建 + 打包版各 1 次（需先 npm run build:unpack；与 CI 同口径）
npm run perf:ci:startup

# 仅采集开发构建冷启动 performance marks（输出 out/analysis/perf-baseline.json）
npm run perf:baseline

# 更新仓库内性能基线快照（维护基线时执行，PR 中说明变化原因）
npm run perf:snapshot

# 清理构建产物
npm run clean
```

### 性能基线 CI（软门禁）

启动/首屏性能基线已纳入 CI，但为**非阻断软门禁**：只记录趋势并在回归时输出 warning annotation，不卡 PR。

| 项       | 说明                                                                                                                                                                                                                                                |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 测量项   | **bundle**：首屏初始 JS、渲染入口、主界面壳、预览 chunk、主进程入口、preload 入口、渲染层 assets、app.asar、win-unpacked、locales、NSIS/portable（存在时）；**冷启动**：开发构建 6 个 performance marks + 打包版 6 项 marks + 窗口可见 + 进程总耗时 |
| 基线快照 | [build/perf-baseline.snapshot.json](./build/perf-baseline.snapshot.json)（入库；2026-11-20 本地实测：首屏 321.9 KiB、开发 preview-ready 478.7ms、打包版 preview-ready 476.8ms / 窗口可见 375.8ms）                                                  |
| 阈值     | 相对基线偏离 **>20%** 输出 `::warning` annotation；下降 >20% 记为改善；不改变退出码                                                                                                                                                                 |
| CI 接入  | `.github/workflows/ci.yml` 的 `perf-baseline` job：`build:unpack` 后运行 `npm run perf:ci:startup`，`continue-on-error: true`，报告上传 artifact（14 天）并写入 GitHub Step Summary                                                                 |
| 产物     | `out/analysis/perf-baseline-ci.json`、`out/analysis/perf-baseline-ci.md`（另含冷启动原始报告 `perf-baseline.json` / `perf-baseline-packaged.json`）                                                                                                 |
| 可选输入 | E2E 的 `startup-metrics` annotation（readyMs / launchAttempts / reloadRecoveries）可经 `node build/perf-ci.js --e2e-report=<playwright.json>` 纳入报告统计                                                                                          |
| 基线维护 | 确认性能变化合理后：`npm run perf:ci:startup` → `npm run perf:snapshot`，在 PR 中说明阈值/基线变更原因                                                                                                                                              |

> 实现：`build/perf-ci.js`（bundle 采集 + 快照对比 + 报告/annotation）、`build/perf-baseline.js`（冷启动 performance marks，`--packaged` 为打包版窗口可见探测）。

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 贡献流程

1. **Fork 本仓库**

    ```bash
    git clone https://github.com/your-username/BaiZeNotesByVue.git
    ```

2. **创建特性分支**

    ```bash
    git checkout -b feature/AmazingFeature
    ```

3. **提交更改**

    ```bash
    git commit -m 'Add some AmazingFeature'
    ```

4. **推送到分支**

    ```bash
    git push origin feature/AmazingFeature
    ```

5. **提交 Pull Request**

### 代码规范

- ✅ 遵循 ESLint 和 Prettier 配置
- ✅ 使用 TypeScript 类型注解
- ✅ 编写清晰的提交信息
- ✅ 添加必要的测试用例
- ✅ 更新相关文档

### 分支说明

- `main` - 主分支，稳定版本
- `develop` - 开发分支，新功能开发
- `feature/*` - 特性分支
- `bugfix/*` - Bug 修复分支
- `release/*` - 发布分支

---

## 🐛 问题反馈

如果您遇到任何问题或有功能建议，请：

1. 查看 [Issues](https://github.com/hemy08/BaiZeNotesByVue/issues) 是否已有相关问题
2. 如果没有，请创建新的 Issue，并详细描述：
    - 问题描述
    - 复现步骤
    - 期望结果
    - 实际结果
    - 系统环境（OS、版本等）
    - 截图（如有必要）

---

## 🗺️ 开发路线图

### v1.5.7 (当前版本，开发中——LLM Wiki 实现完成，待发布)

- [x] **L1 工作区模式**：初始化命令（菜单/命令面板/IPC）+ `raw/` 只读守卫（14 类写盘入口）+ 索引/搜索忽略 `raw/` + 设置页工作区模式与切换确认
- [x] **L2 MCP 只读桥**：HTTP 传输（127.0.0.1 + token、默认关闭）+ 7 个只读工具 + Path Guard + 设置页启停/状态/token 复制
- [x] **L3 AI 工作流**：AI Provider（本地 Ollama/LM Studio + 远程 BYOK，safeStorage 加密）+ AI ingest → 行级 diff 审批 → 写入 wiki/ + 设置页 AI 分组
- [x] **L4 图谱与嵌入**：关系图谱（SVG、200 节点上限、拖拽/缩放/点击跳转）+ raw 资料嵌入（预览 + 相对链接插入）
- [x] **L5 工作台布局**：LLM Wiki 模式下编辑区「编辑器/预览」切换 + 右侧 AI 输入面板（已联调 AI.CHAT）；传统模式零变化
- [x] **工作台与工具条**：顶部菜单栏右侧**视图模式按钮**（编辑/预览/编辑+预览三态，两模式都显示）+ 传统/LLM Wiki **快速切换图标按钮**；可拖动分隔条（宽度无限制、双击复位、键盘可调、宽度持久化）；AI 面板收起进右侧边栏
- [x] **AI 助手入口跨模式**：右侧边栏 AI 按钮传统模式与 LLM Wiki 模式均显示（传统模式点击 = 按系统设置同样流程切换并打开面板；LLM Wiki 模式 = 展开面板）；AI 助手配置独立为「菜单 → 设置 → AI 助手」对话框
- [x] **设置页「AI 助手」页签**：多模型管理（添加/编辑/删除/默认/逐模型测试连接/密钥掩码）+ MCP 配置（端口/状态/令牌复制/重置令牌）
- [x] 门禁：全量 **424 文件 / 8,027 用例**、coverage 92.77/87.13/93.93/93.20、IPC **120 通道/21 组**、typecheck/ESLint/Prettier/docs:check/quality 全绿；构建 ProductVersion 1.5.7（portable 102.13/102.5 MiB）
- 需求清单：[1.5.7 需求清单与方案](docs/wiki/04-优化与专项报告/1.5.7-需求清单与方案.md)；实施计划（单一真源）：[LLM-Wiki-Implementation-Plan.md](docs/wiki/02-设计与架构/LLM-Wiki-Implementation-Plan.md)

### v1.5.6 (2026-11-28 已发布)

- [x] 非模态工具窗（8 个）与插件工具面板（38 项）新增最小化/最大化：工具窗折叠 42px、最大化 1248×768；面板顶栏 44px、内容 798→882px
- [x] 表格编辑器窗口缩放修复（content-box 溢出 32px → border-box + 手柄内缩 + z-index）；帮助文档第 9/17 章同步（HTML/PDF 重新生成）
- [x] **主题可读性治理**：14 套主题按钮对比度 2.30~4.23 → ≥4.56:1；3 套主题分组修正（13/8/7）；新增对比度硬门禁 `quality:contrast`
- [x] **插件工具可发现性**：面板搜索（中英/分类/关键词）、最近使用、收藏 10、三分区视图；localStorage 持久化
- [x] **插件搜索入口**：插件菜单首项「插件搜索」→ 工作区搜索界面（自动聚焦，空白显示最近使用 20 个 + 全部工具），Enter/点击打开工具
- [x] **编辑器主题设置修复**：恢复「独立编辑器主题」开关（点选自动开启）；含空格/括号的 21 套磁盘主题可正常写盘与应用（内部 id 映射）；真机全链路 10/10 PASS
- [x] **帮助文档配图重采集与瘦身**：`npm run capture:help-shots` 脚本入库（22 场景可复跑）、22 张 WebP（1.47MiB→474KiB）、PDF 1.91→1.44MB、安装包帮助资源 −1.46MiB
- [x] **P2 体验批次**：插件分类折叠 + 38 工具图标 + 20 零引用图标清理；命令面板最近命令/折叠/建议；菜单 Alt+字母助记符（12 项）；插件面板最小化联动工作区；玻璃质感增强；帮助悬浮目录/内文搜索（含应用内代理）
- [x] **工程收口**：硬编码颜色 314→272（新增 content-tokens.css 等值令牌）；z-index 应用层相对阶梯化（100/110/120，真机 9/9 PASS）
- [x] **UI 简洁化**：新增统一 ⓘ 悬停/点击提示组件；设置面板 13 类详细解释改为按需查看（保留顶部说明/错误提示/操作指引）；主题卡片紧凑 −28%；表格编辑器界面重设计（紧凑工具条 + 提示收纳 + 网格占满）
- [x] 门禁：全量 424 文件 / 8,027 用例、coverage 92.77/87.13/93.93/93.20、typecheck / ESLint / Prettier / docs:check / quality 全绿、E2E 套件通过

### v1.5.5 (2026-11-27 已发布)

- [x] 视觉升级：4 种界面风格 × 3 档密度 × 28 套主题（18 组语义令牌驱动），6 个核心组件统一升级
- [x] 菜单栏键盘可达；写作模式纸感版式；硬编码颜色清理 161 处；真实截图 37 张验收

### v1.5.3 (2026-11-27 已发布)

- [x] P0 Markdown 编辑器体验：选区格式工具栏状态/组合、统一可视化 GFM 表格编辑器、图片宽度/对齐/图注
- [x] P0 粘贴/复制 Markdown 保真与编辑器体验回归

### v1.5.2 (2026-11-22 已发布)

- [x] 捕获与日常入口：E6 日记/模板/快速收件箱 → E1 剪贴板剪藏 → E2 PDF 标注与摘录 → E3 图片 OCR
- [x] 第一层能力补齐：C3 打印/打印预览、C4 主题化/自包含 HTML 导出、E11 工作区布局/多配置
- [x] 第二层补齐：C1 EPUB 导出、E8 幻灯片 HTML、D2 文件关联 + 单实例打开文件；B2 持久全文索引/D2 独立多窗口未做
- [x] 使用指导 HTML/PDF 与帮助菜单 `hemy08.github.io` 在线文档入口
- [x] 已发布 GitHub Release（2026-11-22，tag `release-1.5.2`；NSIS / portable / latest.yml / blockmap）

### v1.5.1 (2026-11-22 已发布)

- [x] 能力开关：系统设置新增「功能」页签，A1/A3/A4/A6/A7/A10 可选、默认关闭；A2/A8/A9 默认开启
- [x] 全工作区搜索/替换、命令面板/Quick Open、粘贴/复制增强
- [x] 多标签/会话恢复、文档历史/diff、Markdown lint/format、拼写检查、智能输入、大纲增强
- [x] 写作体验 P0：编写体验开关、写作模式、Typewriter/段落高亮、写作统计与目标、中文排版、光标恢复、气泡工具栏/Slash、风格检查（默认关闭）
- [x] 知识库基座：文档属性、工作区索引、标签索引、Wiki 双链/反链与链接检查、附件管理、链接悬浮预览

### v1.5.0 (2026-11-21 已发布)

- [x] 新版本基线：全仓版本号 1.3.9 → 1.5.0；自本版本起所有修改归入 1.5.0
- [x] 1.5.0 已发布 GitHub Release（2026-11-21，tag `release-1.5.0`；NSIS 安装包 / portable / latest.yml / blockmap）
- [x] 1.3.9 已发布 GitHub Release（tag `release-1.3.9`；NSIS 109.98 MB / portable 99.84 MB / latest.yml），包含 tag release-1.3.8 之后全部修改
- [x] 主题设置首次打开列表为空修复（visible watch immediate）；同步修复 Editor/新建/重命名对话框首开初始化
- [x] 文档口径统一（2026-11-20），2026-11-22 复核刷新测试数：测试 424 文件 / 8,027 用例、IPC 120 通道 / 21 组、preload 白名单 send 86 / receive 28 / window.api 6、报告 md 34 篇 / HTML Wiki 35 页
- [ ] 长期计划：macOS 和 Linux 版本支持、协作编辑、插件系统、云同步

### v1.3.9

- [x] 结构治理与工程优化：P0 安装包瘦身（Setup 109.98 MiB / portable 99.83 MiB）+ CI 体积预算、E2E 补启动恢复/设置持久化/打包启动
- [x] P1 性能基线（开发/打包版冷启动）、预览 renderSequence TDZ / 设置首开回填修复、存量清理与 docs 链接检查
- [x] P2 i18n 一致性 + BaseDialog 可访问性；P3 prettier 3.10.1、vue-tsc 3.3.14；P4 E2E preload 根因修复
- [x] HTML 查看器顶部导航修复；自动保存默认关闭；未保存关闭确认

### v1.3.8

- 公共接口归位第 0~4 批：shared 三层单真源（types 14 / utils 11 / constants 10 模块）、60+ 文件迁移、18/18 对话框 BaseDialog 组件化

- [x] 主界面异步分块：入口 chunk 10,096KB → 114KB（-98.9%），初始加载 -94.3%
- [x] 安全加固：PDF 预览 pdf.js、CSP 收紧、preload 受限白名单、IPC 分组 17 组、PlantUML 空闲销毁
- [x] E2E 纳入 CI、死通道清理、欢迎页窗口控制修复、报告 HTML Wiki 重构（25 页）+ 结构分析报告（5 张 SVG）

### v1.3.6

- [x] 2026-11-15 全面治理与迭代：安全加固（P0 攻击链闭环）、国际化（i18n）、预览本地单跳渲染、IPC 架构收口
- [x] 127 项检查清单 105 项完全修复、22 项部分修复；新增内容审查 32 项问题修复 25 项
- [x] 系统设置 9 项禁用项全部补充实现（启动恢复/自启动/托盘/窗口记忆/跟随系统主题/自动备份等）
- [x] 菜鸟工具插件集成（18 个离线工具，插件总数 38）；mkdocs-material 扩展语法 15 项
- [x] 正则工具 Worker 化、自动备份异步化等审查修复批次

### v1.2.2

- [x] Electron 43 重大升级（38 → 43）
- [x] 40+ 依赖包全量升级
- [x] 78 个 TypeScript 类型错误修复
- [x] 3 个 XSS 安全风险修复
- [x] 版本发布说明页面（11 个版本）
- [x] 更新日志对话框
- [x] 关于页面新增 Monaco Editor 和 markdown-it 版本显示
- [x] 国际化（i18n）：中英双语切换，主进程/渲染层共用词典
- [x] PF-02 预览本地单跳渲染（主进程渲染 IPC 4 跳 → 0 跳）
- [x] PlantUML 本地离线渲染（teaVM，弱网/离线可用）
- [x] IPC 通道命名统一（`baize:<domain>:<name>`）与死通道清理（123 → 86）
- [x] P0 安全加固（导航拦截 / 协议白名单 / preload 白名单 / 拖拽拦截）与 P1 XSS 加固
- [x] 死代码清理（36 个零引用文件 / 10,403 行，主进程产物 -44.97%）

### v1.2.1

- [x] 全量代码扫描与优化
- [x] 架构优化
- [x] Bug 修复

### v1.2.0

- [x] 对话框架构重大更新（JSDOM → Vue）
- [x] 新增四个主题
- [x] 主题设置即时更新
- [x] 进程残留修复

### v1.1.5

- [x] 配置文件管理系统
- [x] 卸载体验优化
- [x] 性能优化（加载速度提升50%+）
- [x] 内存泄漏修复
- [x] 55种编辑器主题

---

## 📄 许可证

本项目基于 [MIT](./LICENSE) 许可证开源，许可证全文如下：

```
MIT License

Copyright (c) 2026 hemy08

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## 👨‍💻 作者

**hemy08**

- 📧 Email: zhaojunwei008@yeah.net
- 🐙 GitHub: [@hemy08](https://github.com/hemy08)
- 🌐 Website: [白泽笔记](https://github.com/hemy08/BaiZeNotesByVue)

---

## 🙏 致谢

感谢以下开源项目的支持：

### 核心框架

- [Electron](https://www.electronjs.org/) - 构建跨平台桌面应用
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [TypeScript](https://www.typescriptlang.org/) - JavaScript 的类型超集
- [Vite](https://vitejs.dev/) - 下一代前端构建工具

### 编辑器

- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 强大的代码编辑器
- [Mermaid](https://mermaid-js.github.io/) - 流程图和图表渲染
- [KaTeX](https://katex.org/) - 数学公式渲染
- [markdown-it](https://markdown-it.github.io/) - Markdown 解析器
- [highlight.js](https://highlightjs.org/) - 代码语法高亮

### 工具库

- [electron-store](https://github.com/sindresorhus/electron-store) - Electron 持久化存储
- [crypto-js](https://cryptojs.gitbook.io/) - JavaScript 加密库
- [DOMPurify](https://github.com/cure53/DOMPurify) - HTML/SVG 消毒

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star ⭐**

Made with ❤️ by hemy08

**[⬆ 返回顶部](#白泽笔记-baizenotes)**

</div>
