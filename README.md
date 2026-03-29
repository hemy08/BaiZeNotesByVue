# 白泽笔记 (BaiZeNotes)

<div align="center">

![Version](https://img.shields.io/badge/version-1.0.1-blue.svg)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey.svg)
![Electron](https://img.shields.io/badge/Electron-28+-blue.svg)
![Vue](https://img.shields.io/badge/Vue-3+-brightgreen.svg)

**一款基于 Electron + Vue 3 + TypeScript 的现代化 Markdown 编辑器**

</div>

---

## 📖 项目简介

白泽笔记是一款功能强大的桌面端 Markdown 编辑器，采用 Electron + Vue 3 + TypeScript 技术栈开发。以中国古代神话中的神兽"白泽"命名，寓意知识渊博、通晓万物。

## ✨ 核心特性

### 📝 Markdown 编辑
- **实时预览**: 支持 Markdown 语法的实时渲染预览
- **语法高亮**: 代码块支持多种编程语言语法高亮
- **快捷键支持**: 提供常用 Markdown 语法的快捷键操作
- **工具栏**: 可视化工具栏，快速插入常用元素

### 🎨 丰富功能
- **Mermaid 图表**: 支持流程图、时序图、甘特图等
- **数学公式**: 支持 KaTeX 数学公式渲染
- **代码高亮**: 集成 Monaco Editor，支持多种主题
- **表格支持**: 便捷的表格创建和编辑功能
- **图片管理**: 支持本地图片插入和管理

### 🚀 效率工具
- **快捷链接**: 自定义快捷链接，快速访问常用应用和网站
- **文件管理**: 支持多文件编辑和管理
- **主题切换**: 支持多种编辑器主题
- **导出功能**: 支持导出为 PDF、HTML 等格式

### 💾 数据管理
- **本地存储**: 所有数据本地存储，保护隐私
- **自动保存**: 自动保存编辑内容，防止数据丢失
- **文件关联**: 支持 .md 文件关联打开

## 🛠️ 技术栈

### 核心框架

| 技术 | 版本 | 说明 | 官网 |
|------|------|------|------|
| [Electron](https://www.electronjs.org/) | ^31.0.1 | 跨平台桌面应用框架 | https://www.electronjs.org/ |
| [Vue 3](https://vuejs.org/) | ^3.4.27 | 渐进式 JavaScript 框架 | https://vuejs.org/ |
| [TypeScript](https://www.typescriptlang.org/) | ^5.4.5 | JavaScript 的超集 | https://www.typescriptlang.org/ |
| [Vite](https://vitejs.dev/) | ^5.2.11 | 下一代前端构建工具 | https://vitejs.dev/ |
| [electron-vite](https://electron-vite.org/) | ^2.2.0 | Electron 专用 Vite 构建工具 | https://electron-vite.org/ |

### 编辑器与渲染

| 技术 | 版本 | 说明 | 官网 |
|------|------|------|------|
| [Monaco Editor](https://microsoft.github.io/monaco-editor/) | ^0.49.0 | VS Code 同款代码编辑器 | https://microsoft.github.io/monaco-editor/ |
| [markdown-it](https://markdown-it.github.io/) | ^14.1.0 | Markdown 解析器 | https://markdown-it.github.io/ |
| [Mermaid](https://mermaid-js.github.io/mermaid/) | ^10.9.1 | 流程图/时序图渲染 | https://mermaid-js.github.io/mermaid/ |
| [KaTeX](https://katex.org/) | ^0.16.10 | 数学公式渲染 | https://katex.org/ |
| [highlight.js](https://highlightjs.org/) | ^11.9.0 | 代码语法高亮 | https://highlightjs.org/ |

### 数据与存储

| 技术 | 版本 | 说明 | 官网 |
|------|------|------|------|
| [electron-store](https://github.com/sindresorhus/electron-store) | ^8.2.0 | Electron 数据持久化 | https://github.com/sindresorhus/electron-store |
| [electron-updater](https://www.electron.build/auto-update) | ^6.1.8 | 应用自动更新 | https://www.electron.build/auto-update |

### 工具库

| 技术 | 版本 | 说明 | 官网 |
|------|------|------|------|
| [crypto-js](https://cryptojs.gitbook.io/docs/) | ^4.2.0 | JavaScript 加密库 | https://cryptojs.gitbook.io/docs/ |
| [mammoth](https://github.com/mwilliamson/mammoth.js) | ^1.8.0 | Word 文档解析 | https://github.com/mwilliamson/mammoth.js |
| [turndown](https://github.com/mixmark-io/turndown) | ^7.2.0 | HTML 转 Markdown | https://github.com/mixmark-io/turndown |

## 📦 安装与使用

### 环境要求
- Node.js 18+
- npm 9+ 或 yarn 1.22+

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

## 📚 文档

- [Markdown 语法指南](./MarkdownSyntax.md)
- [项目开发文档](https://hemy08.github.io/hemynotes/900-%E4%B8%AA%E4%BA%BA%E9%A1%B9%E7%9B%AE/010-electron%2Bvue%E6%9E%84%E5%BB%BAHemyEditor/000-%E9%A1%B9%E7%9B%AE%E6%A6%82%E8%A7%88/)

## 🎯 项目结构

```
BaiZeNotesByVue/
├── src/
│   ├── main/           # Electron 主进程
│   ├── preload/        # 预加载脚本
│   └── renderer/       # Vue 渲染进程
│       ├── src/
│       │   ├── components/  # Vue 组件
│       │   ├── views/       # 页面视图
│       │   ├── lib/         # 第三方库
│       │   └── assets/      # 静态资源
│       └── ...
├── icon/               # 应用图标
├── docs/               # 文档
└── resources/          # 资源文件
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

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给一个 Star ⭐**

Made with ❤️ by hemy08

</div>
