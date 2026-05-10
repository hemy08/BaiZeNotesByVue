# 白泽笔记 (BaiZeNotes)

<div align="center">

![Version](https://img.shields.io/badge/version-1.2.0--beta-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)
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
- **跨平台**：支持 Windows、macOS、Linux 三大平台
- **类型安全**：完整的 TypeScript 类型支持

---

## ✨ 功能特性

### 📝 编辑器核心

- **Monaco Editor 集成**：VS Code 同款编辑器，支持智能补全、多光标编辑、代码折叠
- **实时预览**：Markdown 实时渲染，支持代码高亮、数学公式、流程图
- **快速访问**：快速插入符号、表情，自定义快捷键
- **多格式支持**：导入 Word、HTML、JSON、YAML、XML、TXT、CSV；导出 Word、JSON、XML、YAML、HTML、PDF

### 🎨 主题系统

- **23种精美主题**：薰衣草梦、珊瑚暖阳、薄荷清风、日落余晖、玫瑰晨曦等
- **55种编辑器主题**：Monaco Editor 主题同步，支持自定义主题
- **实时切换**：主题实时切换，无需重启应用

### 🛠️ 工具集成

- **转换工具**：JSON/CSV/YAML/TOML 互转、大小写转换、颜色转换、日期转换
- **加密工具**：多种加密算法、哈希计算、Base64 编解码
- **开发工具**：正则表达式测试、HTTP 请求工具、时间戳转换、UUID 生成

### 📂 文件管理

- **智能编码检测**：自动检测文件编码（UTF-8、GBK、GB2312等）
- **自动保存**：可配置保存间隔，文件状态持久化
- **崩溃恢复**：文件状态持久化，支持崩溃恢复

### ⚡ 性能优化

- **大文件优化**：大文件加载速度提升 50%+
- **内存优化**：内存使用减少 40%
- **Mermaid 优化**：多图表并行渲染，速度提升 3倍
- **智能缓存**：LRU 缓存算法，文件内容智能缓存

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

# 构建 macOS 版本
npm run build:mac

# 构建 Linux 版本
npm run build:linux
```

---

## 📦 下载安装

### Windows 平台

| 版本 | 说明 | 下载 |
|:---:|:---:|:---:|
| 安装版 | NSIS 安装包，支持自定义安装路径 | [BaiZeNotes_Setup_1.2.0-bate_windows_x64.exe](./dist/) |
| 便携版 | 免安装，解压即用 | [BaiZeNotes_1.2.0-bate_windows_x64.exe](./dist/) |

### macOS 平台

| 版本 | 说明 | 下载 |
|:---:|:---:|:---:|
| DMG | macOS 安装包 | [BaiZeNotes_1.2.0-bate_MacOS_x64.dmg](./dist/) |

### Linux 平台

| 版本 | 说明 | 下载 |
|:---:|:---:|:---:|
| AppImage | 通用 Linux 格式 | [BaiZeNotes_1.2.0-bate_Linux_x64.AppImage](./dist/) |
| Snap | Snap 包格式 | [BaiZeNotes_1.2.0-bate_Linux_x64.snap](./dist/) |
| Deb | Debian/Ubuntu 包 | [BaiZeNotes_1.2.0-bate_Linux_x64.deb](./dist/) |

> **注意**：目前主要提供 Windows 版本，macOS 和 Linux 版本可自行编译。

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
│   │   │   └── menu_handle.ts    # 菜单处理（25,190行）
│   │   ├── renders/              # 渲染器
│   │   └── utils/                # 工具函数
│   │       ├── file-utils/       # 文件操作
│   │       ├── logger.ts         # 日志系统
│   │       └── window-manager.ts # 窗口管理
│   ├── preload/                  # 预加载脚本
│   │   └── index.ts              # API暴露
│   └── renderer/                 # 渲染进程代码
│       └── src/
│           ├── App.vue           # 根组件
│           ├── main.ts           # 渲染进程入口
│           ├── components/       # Vue组件（89个）
│           │   ├── Markdown/     # Markdown编辑器
│           │   │   ├── hemy-editor.ts # 编辑器核心（20,379行）
│           │   │   └── hemy-editor-quick-access.ts # 快速访问（20,642行）
│           │   ├── dialogs/      # 对话框（27个）
│           │   ├── PluginTools/  # 插件工具
│           │   └── ResourceManager/ # 资源管理器
│           ├── composables/      # 组合式函数
│           ├── common/           # 公共模块
│           ├── styles/           # 样式文件
│           └── assets/           # 静态资源
├── resources/                    # 资源文件
│   ├── themes/                   # 主题配置（23种）
│   │   └── monaco-themes/        # Monaco主题（55种）
│   ├── icon/                     # 图标资源
│   ├── katex/                    # KaTeX资源
│   ├── mermaid/                  # Mermaid资源
│   └── config/                   # 配置文件
├── doc/                          # 项目文档（10+文档）
│   ├── 架构文档.md               # 系统架构说明（38,084行）
│   ├── 设计文档.md               # UI设计规范（68,722行）
│   ├── 性能与优化综合报告.md     # 性能优化报告（79,270行）
│   └── CHANGELOG.md              # 更新日志（23,931行）
├── build/                        # 构建脚本
├── tests/                        # 测试文件
├── dist/                         # 构建输出
├── out/                          # 编译输出
├── electron.vite.config.ts       # Electron-Vite 配置
├── electron-builder.yml          # Electron-Builder 配置
└── package.json                  # 项目依赖配置
```

---

## 🛠️ 技术栈

### 核心框架

| 技术 | 版本 | 说明 |
|:---:|:---:|:---|
| [Electron](https://www.electronjs.org/) | 38.0.0 | 桌面应用框架 |
| [Vue](https://vuejs.org/) | 3.4.27 | 渐进式 JavaScript 框架 |
| [TypeScript](https://www.typescriptlang.org/) | 6.0.2 | JavaScript 的类型超集 |
| [Vite](https://vitejs.dev/) | 8.0.5 | 下一代前端构建工具 |

### 编辑器核心

| 技术 | 版本 | 说明 |
|:---:|:---:|:---|
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | 0.55.0 | VS Code 同款代码编辑器 |
| [markdown-it](https://markdown-it.github.io/) | 14.1.0 | Markdown 解析器 |
| [highlight.js](https://highlightjs.org/) | 11.9.0 | 代码语法高亮 |
| [KaTeX](https://katex.org/) | 0.16.10 | 数学公式渲染 |
| [Mermaid](https://mermaid-js.github.io/) | 11.14.0 | 流程图和图表渲染 |

### 状态管理与工具

| 技术 | 版本 | 说明 |
|:---:|:---:|:---|
| [Vuex](https://vuex.vuejs.org/) | 4.1.0 | Vue 状态管理 |
| [electron-store](https://github.com/sindresorhus/electron-store) | 8.2.0 | Electron 配置存储 |
| [fs-extra](https://github.com/jprichardson/node-fs-extra) | 11.2.0 | 文件系统增强 |
| [crypto-js](https://cryptojs.gitbook.io/) | 4.2.0 | 加密解密库 |

### 开发工具

| 技术 | 版本 | 说明 |
|:---:|:---:|:---|
| [electron-vite](https://electron-vite.org/) | 6.0.0-beta.1 | Electron + Vite 集成 |
| [electron-builder](https://www.electron.build/) | 24.13.3 | Electron 应用打包 |
| [ESLint](https://eslint.org/) | 9.26.0 | JavaScript 代码检查 |
| [Prettier](https://prettier.io/) | 3.2.5 | 代码格式化工具 |

---

## 📊 项目统计

| 指标 | 数量 |
|:---:|:---:|
| 总文件数 | 176 个 TypeScript/Vue 文件 |
| Vue 组件数 | 89 个组件 |
| 对话框组件 | 27 个对话框 |
| 主题数量 | 23 种应用主题 + 55 种编辑器主题 |
| 代码行数 | 约 500,000+ 行 |

---

## 📚 开发文档

### 核心文档

- [架构文档](./doc/架构文档.md) - 系统架构说明
- [设计文档](./doc/设计文档.md) - UI 设计规范
- [性能优化报告](./doc/性能与优化综合报告.md) - 性能优化详细报告
- [更新日志](./CHANGELOG.md) - 版本更新历史
- [发布说明](./RELEASE-NOTES.md) - 版本发布说明

### 功能文档

- [文件导入功能说明](./doc/文件导入功能说明.md)
- [文件导出功能说明](./doc/文件导出功能说明.md)
- [主题设置详细方案](./doc/主题设置详细方案.md)
- [菜单配置详细文档](./doc/菜单配置详细文档.md)

### 开发指南

```bash
# 代码检查
npm run lint

# 代码格式化
npm run format

# 类型检查
npm run type-check
```

---

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request！

### 贡献流程

1. **Fork 本仓库**
2. **创建特性分支**：`git checkout -b feature/AmazingFeature`
3. **提交更改**：`git commit -m 'Add some AmazingFeature'`
4. **推送到分支**：`git push origin feature/AmazingFeature`
5. **提交 Pull Request**

### 代码规范

- 遵循 ESLint 和 Prettier 配置
- 使用 TypeScript 类型注解
- 编写清晰的提交信息
- 添加必要的测试用例

---

## 🐛 问题反馈

如果您遇到任何问题或有功能建议，请：

1. 查看 [Issues](https://github.com/hemy08/BaiZeNotesByVue/issues) 是否已有相关问题
2. 如果没有，请创建新的 Issue，并详细描述问题或建议
3. 提供复现步骤、系统环境等信息

---

## 📄 许可证

本项目基于 [MIT](./LICENSE) 许可证开源。

---

## 👨‍💻 作者

**hemy08**
- 📧 Email: zhaojunwei008@yeah.net
- 🐙 GitHub: [@hemy08](https://github.com/hemy08)

---

## 🙏 致谢

感谢以下开源项目的支持：

- [Electron](https://www.electronjs.org/) - 构建跨平台桌面应用
- [Vue.js](https://vuejs.org/) - 渐进式 JavaScript 框架
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 强大的代码编辑器
- [Mermaid](https://mermaid-js.github.io/) - 流程图和图表渲染
- [KaTeX](https://katex.org/) - 数学公式渲染
- [markdown-it](https://markdown-it.github.io/) - Markdown 解析器
- [highlight.js](https://highlightjs.org/) - 代码语法高亮

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star ⭐**

Made with ❤️ by hemy08

**[⬆ 返回顶部](#白泽笔记-baizenotes)**

</div>
