# 白泽笔记 (BaiZeNotes)

<div align="center">

![Version](https://img.shields.io/badge/version-1.2.0--beta-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-38.0.0-blue.svg)
![Vue](https://img.shields.io/badge/Vue-3.4.27-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0.2-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)

**一款功能丰富、界面美观的跨平台 Markdown 桌面编辑器**

[快速开始](#-快速开始) · [功能特性](#-功能特性) · [下载安装](#-下载安装) · [开发文档](#-开发文档)

</div>

---

## 📖 项目简介

白泽笔记是一款基于 **Electron + Vue 3 + TypeScript** 构建的现代化 Markdown 桌面编辑器，采用 **Monaco Editor**（VS Code 同款编辑器）作为核心编辑组件，支持实时预览、多格式导入导出、丰富的主题系统和强大的工具集成。

### 🎯 设计理念

- **简洁优雅**：现代化的 UI 设计，23种精美主题任你选择
- **功能强大**：Monaco Editor + 实时预览 + 多格式支持
- **性能优异**：大文件加载速度提升50%+，内存使用减少40%
- **跨平台**：支持 Windows 平台
- **类型安全**：完整的 TypeScript 类型支持

### ✨ 核心亮点

- 🚀 **Monaco Editor**：VS Code 同款编辑器，智能补全、多光标编辑
- 🎨 **23种主题**：精心设计的应用主题，支持实时切换
- 📝 **实时预览**：Markdown 实时渲染，支持数学公式、流程图
- 📦 **多格式支持**：导入导出 Word、HTML、JSON、YAML、PDF 等
- 🛠️ **工具集成**：转换工具、加密工具、开发工具一应俱全
- ⚡ **性能优化**：大文件加载快50%，内存占用少40%

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
- **代码高亮**：支持 100+ 编程语言高亮
- **数学公式**：KaTeX 数学公式渲染
- **流程图**：Mermaid 流程图、时序图、甘特图等
- **图表支持**：饼图、柱状图、折线图等

#### 快速访问
- **符号插入**：快速插入常用符号（20,919个符号）
- **表情插入**：快速插入表情（20,579个表情）
- **自定义快捷键**：支持自定义快捷键绑定

#### 多格式支持
- **导入格式**：Word、HTML、JSON、YAML、XML、TXT、CSV
- **导出格式**：Word、JSON、XML、YAML、HTML、PDF
- **编码检测**：自动检测文件编码（UTF-8、GBK、GB2312等）
- **编码转换**：支持多种编码格式转换

### 🎨 主题系统

#### 应用主题（23种）
- **经典主题**：白泽紫韵、暖白温馨、清新简约
- **护眼主题**：护眼绿、护眼米、护眼蓝、护眼粉、护眼琥珀、护眼青、护眼紫
- **特色主题**：薰衣草梦、珊瑚暖阳、薄荷清风、日落余晖、玫瑰晨曦
- **深色主题**：深邃夜空、深空黑曜、科技蓝
- **自然主题**：海洋之心、森林绿意

#### 编辑器主题（55种）
- Monaco Editor 主题同步
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

### 📂 文件管理

#### 文件操作
- **智能编码检测**：自动检测文件编码
- **自动保存**：可配置保存间隔（默认60秒）
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

#### 状态管理优化
- **electron-store 持久化**：使用 electron-store 进行状态持久化
- **状态分离**：分离持久化状态和运行时状态
- **类型安全 API**：提供完整的 TypeScript 类型支持

---

## 📸 应用截图

<div align="center">

| 主界面 | 主题设置 |
|:---:|:---:|
| ![主界面](./screenshots/main-interface.png) | ![主题设置](./screenshots/theme-settings.png) |

| Markdown 编辑 | 工具集成 |
|:---:|:---:|
| ![Markdown 编辑](./screenshots/markdown-edit.png) | ![工具集成](./screenshots/tools.png) |

</div>

---

## 🚀 快速开始

### 环境要求

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
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

# 构建 macOS 版本
npm run build:mac

# 构建 Linux 版本
npm run build:linux
```

---

## 📦 下载安装

### Windows 平台

目前仅支持 Windows 平台，提供两个下载渠道：

#### 方式一：GitHub Releases（推荐）

[![GitHub Release](https://img.shields.io/badge/GitHub-Releases-blue.svg)](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.1.5)

| 版本 | 说明 | 下载链接 |
|:---:|:---:|:---:|
| 安装版 | NSIS 安装包，支持自定义安装路径 | [下载](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.1.5) |
| 便携版 | 免安装，解压即用 | [下载](https://github.com/hemy08/BaiZeNotesByVue/releases/tag/release-1.1.5) |

#### 方式二：华为云 DevCloud

[![Huawei Cloud](https://img.shields.io/badge/Huawei-DevCloud-red.svg)](https://devcloud.cn-north-4.huaweicloud.com/cloudartifact/project/13dd100011dc4f88ad60768fb5b4b7db/private/repoView/detail?repoId=13dd100011dc4f88ad60768fb5b4b7db&path=BaiZeNotes)

| 版本 | 说明 | 下载链接 |
|:---:|:---:|:---:|
| 安装版 | NSIS 安装包 | [下载](https://devcloud.cn-north-4.huaweicloud.com/cloudartifact/project/13dd100011dc4f88ad60768fb5b4b7db/private/repoView/detail?repoId=13dd100011dc4f88ad60768fb5b4b7db&path=BaiZeNotes) |
| 便携版 | 免安装版本 | [下载](https://devcloud.cn-north-4.huaweicloud.com/cloudartifact/project/13dd100011dc4f88ad60768fb5b4b7db/private/repoView/detail?repoId=13dd100011dc4f88ad60768fb5b4b7db&path=BaiZeNotes) |

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
├── src/                          # 源代码目录
│   ├── main/                     # 主进程代码
│   │   ├── index.ts              # 主进程入口
│   │   ├── config/               # 配置管理
│   │   │   ├── theme-config.ts   # 主题配置（17,638行）
│   │   │   ├── editor-setting.ts # 编辑器设置（15,393行）
│   │   │   └── system-setting.ts # 系统设置（6,456行）
│   │   ├── dialogs/              # 对话框管理
│   │   ├── ipc/                  # IPC通信
│   │   │   ├── handlers.ts       # IPC处理器
│   │   │   ├── menu_handle.ts    # 菜单处理（25,190行）
│   │   │   └── menu_context.ts   # 右键菜单
│   │   ├── renders/              # 渲染器
│   │   │   ├── TabbedSetRender.ts # TabbedSet渲染
│   │   │   └── ...               # 其他渲染器
│   │   └── utils/                # 工具函数
│   │       ├── file-utils/       # 文件操作
│   │       │   ├── file-operations.ts # 基础文件操作
│   │       │   ├── import.ts     # 文件导入
│   │       │   ├── export.ts     # 文件导出
│   │       │   ├── auto-save.ts  # 自动保存
│   │       │   └── clipboard-operations.ts # 剪贴板操作
│   │       ├── logger.ts         # 日志系统
│   │       ├── window-manager.ts # 窗口管理
│   │       ├── ipc-listener-manager.ts # IPC监听器管理
│   │       ├── short-key-register.ts # 快捷键注册
│   │       └── app-paths.ts      # 路径管理
│   ├── preload/                  # 预加载脚本
│   │   └── index.ts              # API暴露
│   └── renderer/                 # 渲染进程代码
│       └── src/
│           ├── App.vue           # 根组件
│           ├── main.ts           # 渲染进程入口
│           ├── components/       # Vue组件（89个）
│           │   ├── Markdown/     # Markdown编辑器
│           │   │   ├── hemy-editor.ts # 编辑器核心（20,379行）
│           │   │   ├── hemy-editor-quick-access.ts # 快速访问（20,642行）
│           │   │   ├── MarkdownMonacoEditor.vue # Monaco编辑器组件
│           │   │   └── MarkdownPreviewComponent.vue # 预览组件
│           │   ├── dialogs/      # 对话框（27个）
│           │   │   ├── help/     # 帮助对话框
│           │   │   ├── settings/ # 设置对话框
│           │   │   ├── insert/   # 插入对话框
│           │   │   └── ...       # 其他对话框
│           │   ├── PluginTools/  # 插件工具
│           │   │   ├── ConvertTools/ # 转换工具
│           │   │   ├── EncryptTools/ # 加密工具
│           │   │   ├── InfoTools/ # 信息工具
│           │   │   └── NetworkTools/ # 网络工具
│           │   └── ResourceManager/ # 资源管理器
│           │       ├── FileTree.vue # 文件树
│           │       └── MarkdownToc.vue # Markdown目录
│           ├── composables/      # 组合式函数
│           ├── common/           # 公共模块
│           │   ├── event_bus/    # 事件总线
│           │   └── utils/        # 工具函数
│           ├── styles/           # 样式文件
│           │   └── theme.css     # 主题样式
│           └── assets/           # 静态资源
├── resources/                    # 资源文件
│   ├── themes/                   # 主题配置
│   │   ├── lavender.json         # 薰衣草梦主题
│   │   ├── coral.json            # 珊瑚暖阳主题
│   │   ├── mint.json             # 薄荷清风主题
│   │   ├── sunset.json           # 日落余晖主题
│   │   ├── rose.json             # 玫瑰晨曦主题
│   │   ├── night.json            # 深邃夜空主题
│   │   ├── obsidian.json         # 深空黑曜主题
│   │   ├── tech-blue.json        # 科技蓝主题
│   │   ├── ocean.json            # 海洋之心主题
│   │   ├── forest.json           # 森林绿意主题
│   │   ├── eye-green.json        # 护眼绿主题
│   │   ├── eye-beige.json        # 护眼米主题
│   │   ├── eye-blue.json         # 护眼蓝主题
│   │   ├── eye-pink.json         # 护眼粉主题
│   │   ├── eye-amber.json        # 护眼琥珀主题
│   │   ├── eye-cyan.json         # 护眼青主题
│   │   ├── eye-purple.json       # 护眼紫主题
│   │   ├── warm.json             # 温暖主题
│   │   └── monaco-themes/        # Monaco主题（55种）
│   ├── icon/                     # 图标资源
│   │   ├── baize_mirror_dark.svg # 深色主题图标
│   │   ├── baize_mirror_light.svg # 浅色主题图标
│   │   ├── baize_data_dark.svg   # 数据图标（深色）
│   │   ├── baize_data_light.svg  # 数据图标（浅色）
│   │   └── markdown.svg          # Markdown图标
│   ├── katex/                    # KaTeX资源
│   ├── mermaid/                  # Mermaid资源
│   ├── plantuml/                 # PlantUML资源
│   └── config/                   # 配置文件
│       └── version.json          # 版本信息
├── doc/                          # 项目文档（10+文档）
│   ├── 架构文档.md               # 系统架构说明（38,084行）
│   ├── 设计文档.md               # UI设计规范（68,722行）
│   ├── 性能与优化综合报告.md     # 性能优化报告（79,270行）
│   ├── 事件监听器内存泄漏分析报告.md # 内存管理报告
│   ├── 菜单配置详细文档.md       # 菜单系统文档（25,365行）
│   ├── 文件导入功能说明.md       # 导入功能文档
│   ├── 文件导出功能说明.md       # 导出功能文档
│   ├── 主题设置详细方案.md       # 主题系统文档
│   ├── 项目详细文档.md           # 项目概述
│   └── CHANGELOG.md              # 更新日志（23,931行）
├── build/                        # 构建脚本
│   ├── copyfile.bat              # 文件复制脚本
│   ├── installer.nsh             # NSIS安装程序配置
│   ├── uninstaller.nsh           # 卸载问询脚本
│   └── generate-version-config.js # 版本配置生成
├── tests/                        # 测试文件
├── dist/                         # 构建输出
├── out/                          # 编译输出
├── electron.vite.config.ts       # Electron-Vite 配置
├── electron-builder.yml          # Electron-Builder 配置
├── package.json                  # 项目依赖配置
├── tsconfig.json                 # TypeScript 配置
├── tsconfig.node.json            # Node TypeScript 配置
├── tsconfig.web.json             # Web TypeScript 配置
├── .eslintrc.cjs                 # ESLint 配置
├── .prettierrc.yaml              # Prettier 配置
└── CHANGELOG.md                  # 更新日志
```

---

## 🛠️ 技术栈

### 核心框架

| 技术 | 版本 | 说明 | 官网 |
|:---:|:---:|:---|:---|
| Electron | 38.0.0 | 跨平台桌面应用框架 | [官网](https://www.electronjs.org/) |
| Vue | 3.4.27 | 渐进式 JavaScript 框架 | [官网](https://vuejs.org/) |
| TypeScript | 6.0.2 | JavaScript 的类型超集 | [官网](https://www.typescriptlang.org/) |
| Vite | 8.0.5 | 下一代前端构建工具 | [官网](https://vitejs.dev/) |

### 编辑器核心

| 技术 | 版本 | 说明 | 官网 |
|:---:|:---:|:---|:---|
| Monaco Editor | 0.55.0 | VS Code 同款代码编辑器 | [官网](https://microsoft.github.io/monaco-editor/) |
| markdown-it | 14.1.0 | Markdown 解析器，支持插件扩展 | [官网](https://markdown-it.github.io/) |
| highlight.js | 11.9.0 | 代码语法高亮，支持 100+ 语言 | [官网](https://highlightjs.org/) |
| KaTeX | 0.16.10 | 快速数学公式渲染 | [官网](https://katex.org/) |
| Mermaid | 11.14.0 | 流程图、时序图、甘特图等 | [官网](https://mermaid-js.github.io/) |

### 状态管理与数据

| 技术 | 版本 | 说明 | 官网 |
|:---:|:---:|:---|:---|
| Vuex | 4.1.0 | Vue 状态管理模式 | [官网](https://vuex.vuejs.org/) |
| electron-store | 8.2.0 | Electron 持久化存储 | [GitHub](https://github.com/sindresorhus/electron-store) |
| fs-extra | 11.2.0 | 文件系统增强，Promise 支持 | [GitHub](https://github.com/jprichardson/node-fs-extra) |

### 工具库

| 技术 | 版本 | 说明 | 官网 |
|:---:|:---:|:---|:---|
| crypto-js | 4.2.0 | JavaScript 加密库 | [文档](https://cryptojs.gitbook.io/) |
| uuid | 10.0.0 | UUID 生成工具 | [GitHub](https://github.com/uuidjs/uuid) |
| lodash | 4.17.21 | 实用工具库 | [官网](https://lodash.com/) |
| dayjs | 1.11.10 | 轻量级日期处理库 | [官网](https://day.js.org/) |

### UI 组件

| 技术 | 版本 | 说明 | 官网 |
|:---:|:---:|:---|:---|
| @imengyu/vue3-context-menu | 1.3.6 | Vue3 右键菜单组件 | [GitHub](https://github.com/imengyu/vue3-context-menu) |

### 开发工具

| 技术 | 版本 | 说明 | 官网 |
|:---:|:---:|:---|:---|
| electron-vite | 6.0.0-beta.1 | Electron + Vite 集成 | [官网](https://electron-vite.org/) |
| electron-builder | 24.13.3 | Electron 应用打包工具 | [官网](https://www.electron.build/) |
| ESLint | 9.26.0 | JavaScript 代码检查工具 | [官网](https://eslint.org/) |
| Prettier | 3.2.5 | 代码格式化工具 | [官网](https://prettier.io/) |
| @electron-toolkit/eslint-config | 1.0.2 | Electron ESLint 配置 | [GitHub](https://github.com/alex8088/electron-toolkit) |
| @electron-toolkit/eslint-config-ts | 2.0.0 | Electron TypeScript ESLint 配置 | [GitHub](https://github.com/alex8088/electron-toolkit) |

### 构建工具

| 技术 | 版本 | 说明 |
|:---:|:---:|:---|
| NSIS | 3.0.4.1 | Windows 安装程序制作工具 |
| 7-Zip | - | 文件压缩工具 |

---

## 📊 项目统计

| 指标 | 数量 | 说明 |
|:---:|:---:|:---|
| 总文件数 | 176+ | TypeScript/Vue 文件 |
| Vue 组件数 | 89 个 | 可复用组件 |
| 对话框组件 | 27 个 | 功能对话框 |
| 应用主题 | 23 种 | 精美主题 |
| 编辑器主题 | 55 种 | Monaco 主题 |
| 代码行数 | 500,000+ | 总代码行数 |
| 文档数量 | 10+ | 详细文档 |

### 关键文件代码量

| 文件 | 行数 | 说明 |
|:---:|:---:|:---|
| 性能与优化综合报告.md | 79,270 | 性能优化报告 |
| 设计文档.md | 68,722 | UI设计规范 |
| theme-config.ts | 17,638 | 主题配置 |
| editor-setting.ts | 15,393 | 编辑器设置 |
| hemy-editor-quick-access.ts | 20,642 | 快速访问 |
| hemy-editor.ts | 20,379 | 编辑器核心 |
| CHANGELOG.md | 23,931 | 更新日志 |
| menu_handle.ts | 25,190 | 菜单处理 |
| 菜单配置详细文档.md | 25,365 | 菜单文档 |
| 架构文档.md | 38,084 | 架构说明 |

---

## 📚 开发文档

### 核心文档

- [架构文档](./doc/架构文档.md) - 系统架构说明（38,084行）
- [设计文档](./doc/设计文档.md) - UI 设计规范（68,722行）
- [性能优化报告](./doc/性能与优化综合报告.md) - 性能优化详细报告（79,270行）
- [更新日志](./CHANGELOG.md) - 版本更新历史（23,931行）
- [发布说明](./RELEASE-NOTES.md) - 版本发布说明

### 功能文档

- [文件导入功能说明](./doc/文件导入功能说明.md) - 文件导入功能详细说明
- [文件导出功能说明](./doc/文件导出功能说明.md) - 文件导出功能详细说明
- [主题设置详细方案](./doc/主题设置详细方案.md) - 主题系统优化方案
- [菜单配置详细文档](./doc/菜单配置详细文档.md) - 菜单系统文档（25,365行）
- [事件监听器内存泄漏分析报告](./doc/事件监听器内存泄漏分析报告.md) - 内存管理报告

### 开发指南

```bash
# 代码检查
npm run lint

# 代码格式化
npm run format

# 类型检查
npm run type-check

# 清理构建产物
npm run clean
```

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

### v1.2.0 (计划中)
- [ ] macOS 和 Linux 版本支持
- [ ] 协作编辑功能
- [ ] 插件系统
- [ ] 云同步功能

### v1.1.5 (当前版本)
- [x] 配置文件管理系统
- [x] 卸载体验优化
- [x] 性能优化（加载速度提升50%+）
- [x] 内存泄漏修复
- [x] 55种编辑器主题

### v1.1.3
- [x] 文件自动保存
- [x] HTML/PDF 支持
- [x] 日志系统
- [x] 窗口管理器

---

## 📄 许可证

本项目基于 [MIT](./LICENSE) 许可证开源。

```
MIT License

Copyright (c) 2024 hemy08

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
- [lodash](https://lodash.com/) - 实用工具库
- [dayjs](https://day.js.org/) - 日期处理库

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star ⭐**

Made with ❤️ by hemy08

**[⬆ 返回顶部](#白泽笔记-baizenotes)**

</div>
