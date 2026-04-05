# 白泽笔记 (BaiZeNotes)

<div align="center">

![Version](https://img.shields.io/badge/version-1.1.1-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-38.0.0-blue.svg)
![Vue](https://img.shields.io/badge/Vue-3.4.27-brightgreen.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0.2-blue.svg)

**一款基于 Electron + Vue 3 + TypeScript 的现代化 Markdown 桌面编辑器**

</div>

---

## 📖 项目简介

白泽笔记是一款功能强大的桌面端 Markdown 编辑器，采用 Electron + Vue 3 + TypeScript 技术栈开发。以中国古代神话中的神兽"白泽"命名，寓意知识渊博、通晓万物。

### ✨ 核心特性

#### 📝 强大的编辑器
- **Monaco Editor**: 采用 VS Code 同款编辑器，提供卓越的编辑体验
- **实时预览**: Markdown 实时渲染，所见即所得
- **语法高亮**: 支持多种编程语言的语法高亮
- **智能提示**: 代码自动补全和智能提示
- **多光标编辑**: 支持多光标同时编辑
- **代码折叠**: 支持代码块折叠展开

#### 🎨 丰富的 Markdown 支持
- **Mermaid 图表**: 支持流程图、时序图、甘特图、类图、状态图等 20+ 种图表
- **KaTeX 数学公式**: 完整的 LaTeX 数学公式支持
- **PlantUML**: 支持 PlantUML 图表渲染
- **Material Admonitions**: Material 风格的提示块（note、warning、info 等）
- **代码高亮**: highlight.js 提供的代码语法高亮
- **表格支持**: 便捷的表格创建和编辑功能
- **图片管理**: 支持本地图片插入和管理

#### 🎭 主题系统
- **29+ 精美主题**: 浅色、深色、护眼三大类主题
  - 浅色主题：白泽紫韵、暖白温馨、清新简约、薰衣草梦、珊瑚暖阳、薄荷清风、日落余晖、玫瑰晨曦、温暖
  - 深色主题：深邃夜空、深空黑曜、科技蓝、海洋之心、森林绿意
  - 护眼主题：护眼绿、护眼米、护眼蓝、护眼粉、护眼琥珀、护眼青、护眼紫
- **双主题配置**: 支持应用主题和编辑器主题分开设置，提供更灵活的个性化体验
- **实时切换**: 主题实时切换，所有窗口同步更新
- **主题预览**: 提供主题预览功能，支持可视化选择主题

#### 🔧 插件工具集
- **转换工具**: JSON/YAML/TOML 互转、大小写转换、颜色格式转换、日期格式转换等
- **加密工具**: 文本加密解密、哈希生成（MD5、SHA）、RSA 密钥生成、UUID/ULID 生成器
- **网络工具**: IPv4/IPv6 地址转换、子网计算器、二维码生成器、WiFi 二维码
- **信息工具**: ASCII 码对照表、文件扩展名查询、数学符号查询、希腊字母表、HTTP 状态码

#### 📂 文件管理
- **多格式导入**: 支持 Word、HTML、JSON、YAML、XML、文本文件导入
- **多格式导出**: 支持导出为 Word、PDF、HTML、JSON、XML、YAML
- **自动保存**: 可配置自动保存间隔，防止数据丢失
- **文件树浏览**: 便捷的文件树导航
- **最近文件**: 快速访问最近打开的文件

#### 🚀 效率提升
- **快捷链接**: 自定义快捷链接，快速访问常用应用和网站
- **模板系统**: 预置 Mermaid 图表模板、PlantUML 模板、写作模板
- **快速插入**: 快速插入 Emoji 表情、特殊符号
- **文件大纲**: 自动生成文档大纲，快速导航

#### 💾 数据安全
- **本地存储**: 所有数据本地存储，保护隐私
- **文件关联**: 支持 .md 文件关联打开
- **状态持久化**: 编辑器状态自动保存和恢复
- **文件状态管理**: 应用关闭时自动保存当前打开的文件和目录结构，重新打开后自动加载上次的工作状态

## 🔧 技术栈

### 核心框架

| 技术 | 版本 | 说明 |
|------|------|------|
| [Electron](https://www.electronjs.org/) | 38.0.0 | 跨平台桌面应用框架 |
| [Vue 3](https://vuejs.org/) | 3.4.27 | 渐进式 JavaScript 框架 |
| [TypeScript](https://www.typescriptlang.org/) | 6.0.2 | JavaScript 的超集 |
| [Vite](https://vitejs.dev/) | 5.2.11 | 下一代前端构建工具 |
| [electron-vite](https://electron-vite.org/) | 2.2.0 | Electron 专用 Vite 构建工具 |
| [Vuex](https://vuex.vuejs.org/) | 4.1.0 | Vue 状态管理 |

### 编辑器与渲染

| 技术 | 版本 | 说明 |
|------|------|------|
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | 0.49.0 | VS Code 同款代码编辑器 |
| [markdown-it](https://markdown-it.github.io/) | 14.1.0 | Markdown 解析器 |
| [Mermaid](https://mermaid-js.github.io/mermaid/) | 10.9.1 | 流程图、时序图渲染 |
| [KaTeX](https://katex.org/) | 0.16.10 | 数学公式渲染 |
| [highlight.js](https://highlightjs.org/) | 11.9.0 | 代码语法高亮 |
| [marked](https://marked.js.org/) | 12.0.2 | Markdown 解析器 |
| [remarkable](https://github.com/jonschlinkert/remarkable) | 2.0.1 | Markdown 解析器 |

### 文件处理

| 技术 | 版本 | 说明 |
|------|------|------|
| [mammoth](https://github.com/mwilliamson/mammoth.js) | 1.8.0 | Word 文档解析 |
| [turndown](https://github.com/mixmark-io/turndown) | 7.2.0 | HTML 转 Markdown |
| [fs-extra](https://github.com/jprichardson/node-fs-extra) | 11.2.0 | 文件系统增强 |
| [iconv-lite](https://github.com/ashtuchkin/iconv-lite) | 0.6.3 | 编码转换 |
| [jschardet](https://github.com/aadsm/jschardet) | 3.1.3 | 编码检测 |
| [officegen](https://github.com/Ziv-Barber/officegen) | 0.6.5 | Office 文档生成 |

### 加密与安全

| 技术 | 版本 | 说明 |
|------|------|------|
| [crypto-js](https://cryptojs.gitbook.io/docs/) | 4.2.0 | JavaScript 加密库 |
| [node-forge](https://github.com/digitalbazaar/forge) | 1.3.1 | RSA 加密 |
| [uuid](https://github.com/uuidjs/uuid) | 10.0.0 | UUID 生成 |
| [ulid](https://github.com/ulid/spec) | 2.3.0 | ULID 生成 |

### 数据与存储

| 技术 | 版本 | 说明 |
|------|------|------|
| [electron-store](https://github.com/sindresorhus/electron-store) | 8.2.0 | Electron 数据持久化 |
| [electron-updater](https://www.electron.build/auto-update) | 6.1.8 | 应用自动更新 |

### 开发工具

| 技术 | 版本 | 说明 |
|------|------|------|
| [ESLint](https://eslint.org/) | 9.26.0 | JavaScript 代码检查工具 |
| [Prettier](https://prettier.io/) | 3.2.5 | 代码格式化工具 |
| [vue-tsc](https://github.com/vuejs/language-tools) | 2.0.19 | Vue TypeScript 编译器 |
| [electron-builder](https://www.electron.build/) | 24.13.3 | Electron 应用打包工具 |

### 编译环境

| 工具 | 版本 | 说明 |
|------|------|------|
| Node.js | 22.22.2 | JavaScript 运行时 |
| npm | 10.9.7 | 包管理器 |
| TypeScript | 6.0.2 | TypeScript 编译器 |
## 📦 安装与使用

### 环境要求
- **Node.js**: 22.0.0 或更高版本（推荐使用 LTS 版本）
- **npm**: 9.0.0 或更高版本（或 yarn 1.22+）

> ⚠️ **重要提示**: 项目依赖需要 Node.js 20+ 版本。使用 Node.js 18 或更低版本可能会导致运行时错误。

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 构建应用

```bash
# Windows 平台
npm run build:win

# macOS 平台
npm run build:mac

# Linux 平台
npm run build:linux
```

### 其他命令

```bash
# 类型检查
npm run typecheck

# 代码检查
npm run lint

# 代码格式化
npm run format

# 预览构建结果
npm run start
```

## 📚 文档

- [Markdown 语法指南](./MarkdownSyntax.md)
- [项目开发文档](https://hemy08.github.io/hemynotes/900-%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/010-electron%2Bvue%E6%9E%84%E5%BB%BAHemyEditor/000-%E9%A1%B9%E7%9B%AE%E6%A6%82%E8%A7%88/)
- [架构文档](./doc/架构文档.md)
- [设计文档](./doc/设计文档.md)
- [规格文档](./doc/规格文档.md)

## 🎯 项目结构

```
BaiZeNotesByVue/
├── src/                          # 源代码目录
│   ├── main/                     # Electron 主进程
│   │   ├── index.ts              # 主进程入口
│   │   ├── dialogs/              # 对话框模块
│   │   ├── menu/                 # 菜单系统
│   │   ├── renders/              # 渲染器模块
│   │   │   ├── HemyRender.ts     # 自定义渲染器
│   │   │   ├── KatexRender.ts    # KaTeX 渲染器
│   │   │   ├── MaterialRender.ts # Material Admonitions 渲染器
│   │   │   ├── MermaidRender.ts  # Mermaid 渲染器
│   │   │   └── PlantumlRender.ts # PlantUML 渲染器
│   │   ├── templates/            # 模板系统
│   │   │   ├── mermaid/          # Mermaid 图表模板
│   │   │   ├── plantuml/         # PlantUML 模板
│   │   │   └── writing/          # 写作模板
│   │   ├── themes/               # 主题配置模块
│   │   │   ├── theme-config.ts   # 主题配置
│   │   │   ├── theme-config-optimized.ts # 优化版主题配置
│   │   │   └── theme-css-generator.ts # 主题CSS生成器
│   │   └── utils/                # 工具模块
│   ├── preload/                  # 预加载脚本
│   │   └── index.ts              # 预加载脚本入口
│   └── renderer/                 # Vue 渲染进程
│       ├── src/
│       │   ├── components/       # Vue 组件
│       │   │   ├── Markdown/     # Markdown 编辑器组件
│       │   │   ├── WorkSpaceArea/ # 工作区组件
│       │   │   └── PluginTools/  # 插件工具集
│       │   ├── lib/              # 第三方库
│       │   │   ├── Katex/        # KaTeX 数学库
│       │   │   ├── mermaid/      # Mermaid 图表库
│       │   │   └── monaco-editor/ # Monaco 编辑器
│       │   └── styles/           # 样式文件
│       └── index.html            # HTML 入口
├── doc/                          # 项目文档
│   ├── 架构文档.md               # 项目架构说明
│   ├── 功能分析报告.md           # 功能分析报告
│   ├── 规格文档.md               # 产品规格说明
│   ├── 设计文档.md               # UI设计规范
│   ├── 项目详细文档.md           # 项目概述和技术架构
│   ├── 文件导入功能说明.md       # 文件导入功能说明
│   ├── 文件导出功能说明.md       # 文件导出功能说明
│   ├── 主题设置详细方案.md       # 主题系统优化方案
│   ├── 主题优化方案.md           # 主题优化方案
│   └── 文档更新摘要.md           # 文档更新历史
├── icon/                         # 应用图标
├── resources/                    # 资源文件
│   └── themes/                   # 主题配置文件
│       ├── lavender.json         # 薰衣草梦主题
│       ├── coral.json            # 珊瑚暖阳主题
│       ├── mint.json             # 薄荷清风主题
│       ├── sunset.json           # 日落余晖主题
│       ├── rose.json             # 玫瑰晨曦主题
│       ├── night.json            # 深邃夜空主题
│       ├── obsidian.json         # 深空黑曜主题
│       ├── tech-blue.json        # 科技蓝主题
│       ├── ocean.json            # 海洋之心主题
│       ├── forest.json           # 森林绿意主题
│       ├── eye-green.json        # 护眼绿主题
│       ├── eye-beige.json        # 护眼米主题
│       ├── eye-blue.json         # 护眼蓝主题
│       ├── eye-pink.json         # 护眼粉主题
│       ├── eye-amber.json        # 护眼琥珀主题
│       ├── eye-cyan.json         # 护眼青主题
│       ├── eye-purple.json       # 护眼紫主题
│       └── warm.json             # 温暖主题
├── config/                       # 配置文件目录
├── build/                        # 构建脚本
│   ├── copyfile.bat              # 文件复制脚本
│   └── installer.nsh             # NSIS安装程序配置
├── dist/                         # 构建输出目录
├── out/                          # 编译输出目录
├── electron.vite.config.ts       # Electron-Vite 配置
├── electron-builder.yml          # Electron-Builder 配置
└── package.json                  # 项目依赖配置
```

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

## 👨‍💻 作者

**hemy08**
- Email: zhaojunwei008@yeah.net
- GitHub: [@hemy08](https://github.com/hemy08)

## 🙏 致谢

感谢以下开源项目：
- [Electron](https://www.electronjs.org/)
- [Vue.js](https://vuejs.org/)
- [Monaco Editor](https://microsoft.github.io/monaco-editor/)
- [Mermaid](https://mermaid-js.github.io/)
- [KaTeX](https://katex.org/)
- [markdown-it](https://markdown-it.github.io/)
- [highlight.js](https://highlightjs.org/)

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star ⭐**

Made with ❤️ by hemy08

</div>
