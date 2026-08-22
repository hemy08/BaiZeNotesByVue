# 白泽笔记优化计划

> 文档生成日期：2026年8月22日
> 状态：全部完成 ✅

---

## 一、概述

本计划对 BaiZeNotes（白泽笔记）项目进行全面优化，包括 TypeScript 类型错误修复、XSS 安全风险修复、依赖升级、帮助页面完善等。共 11 项优化任务，均已全部完成。

---

## 二、优化项目

### 1. TypeScript 类型错误修复（P0-P3） ✅

**问题描述**：项目存在 78 个 TypeScript 类型错误（23 个 node 端 + 55 个 web 端），影响编译和类型安全。

**修复内容**：
- **P0**：修复 `system-setting.ts` 导入路径错误，修复 `useConfigStore.ts` DialogState 类型不匹配（7处）
- **P1**：添加 `window.api`/`window.electronAPI` 全局类型声明（11处），修复 `encrypt_decrypt.ts` crypto API 类型安全（7处），修复 `MermaidEditDialog.vue` handleClose 生命周期 bug
- **P2**：清理 15 处未使用变量/导入，修复 `../electron.vite.config.ts`、`TitleBar.vue`、`ThemeSettingDialog.vue`、`app-state.ts`、`store-factory.ts` 等类型错误
- **P3**：修复 `ShowQuickLinkSettingDialog.ts` XSS 安全风险（escapeHtml 添加单引号转义，renderIcon 转义用户输入）

**验证结果**：typecheck:node 0 错误，typecheck:web 0 错误

---

### 2. XSS 安全风险修复 ✅

**问题描述**：项目中存在 19 处 innerHTML 使用，其中 3 处存在 XSS 安全风险。

**修复内容**：
- `ShowQuickLinkSettingDialog.ts`：escapeHtml 函数添加单引号转义，renderIcon 转义用户输入
- 审查其余 innerHTML 使用点，确认安全

---

### 3. 依赖全量升级 ✅

**问题描述**：Electron 38 需升级到 43，同步升级所有其他依赖到高版本。

**升级内容**：
- **核心框架**：Electron 38→43, electron-builder 24→26, vue-tsc 2→3, vite 8.0.5→8.2.2, vue 3.4→3.5.41
- **Electron 生态**：@electron-toolkit/utils 3→4, @electron-toolkit/tsconfig 1→2, electron-store 8→11
- **编辑器与渲染**：monaco-editor 0.55→0.56, markdown-it 14→15, mermaid 11.14→11.17, katex 0.16→0.18
- **数据与工具库**：jsdom 24→29, uuid 10→14, ulid 2→3
- **开发工具**：vitest 3→4, @types/node 20→22, @types/jsdom 21→30
- 共升级 40+ 依赖包

---

### 4. markdown-it 15 API 适配 ✅

**问题描述**：markdown-it 15 的 highlight 选项和 parse 方法 API 发生变化。

**修复内容**：
- `MaterialRender.ts`：highlight 选项从 plugin 选项移到 MarkdownIt 构造函数
- `hemy-editor-render.ts`：`parse(text, [])` 改为 `parse(text, {})`，类型用 `InstanceType<typeof MarkdownIt>`

---

### 5. monaco-editor 0.56 类型适配 ✅

**问题描述**：monaco-editor 0.56 的 hover 配置类型发生变化。

**修复内容**：
- `editor-options.ts`：`hover.enabled` 从 `boolean` 改为 `"on" | "off" | "onKeyboardModifier"`，`hover.sticky` 从字符串改为 `boolean`

---

### 6. vue-tsc 3.x 兼容性修复 ✅

**问题描述**：vue-tsc 3.x 的 noUnusedLocals 导致 Vue `<script setup>` 中模板使用的 ref 变量被误报。

**修复内容**：
- `../tsconfig.web.json`：设置 `noUnusedLocals: false`, `noUnusedParameters: false`

---

### 7. vitest 4.x 兼容性修复 ✅

**问题描述**：vitest 3.x 的 loupe 依赖与 Node.js 24 不兼容。

**修复内容**：
- 升级 vitest 3→4，解决 loupe ESM 语法错误

---

### 8. 帮助页面版本信息更新 ✅

**问题描述**：帮助页面的技术栈和关于页面版本信息需要更新。

**修复内容**：
- `TechStackDialog.vue`：更新技术栈版本号
- `ShowTechStackDialog.ts`：更新技术栈版本号（13处）
- `HelpAboutDialog.vue`：更新 fallback 版本（1.2.1, 3.5.41, 8.2.2, 6.0.2）
- `ShowHelpAboutDialog.ts`：更新版本常量

---

### 9. 更新日志页面 ✅

**问题描述**：需要新增更新日志页面展示依赖升级详情。

**修复内容**：
- 新增 `UpdateLogDialog.vue`（Vue 渲染进程组件）
- 新增 `ShowUpdateLogDialog.ts`（主进程 JSDOM 对话框）
- 标题栏添加关闭按钮
- 菜单项放在"修改日志"子菜单下，命名为"重大版本升级"

---

### 10. 版本发布说明页面 ✅

**问题描述**：需要为每个发布版本生成对应的发布说明页面。

**修复内容**：
- 新增 `ShowReleaseNotesDialog.ts`，支持 11 个版本（v1.0.0 ~ v1.2.2）
- "版本发布"改为子菜单，列出全部版本
- 每个版本点击后弹出对应的发布说明页面
- 补充 `../RELEASE-NOTES.md` 和 `../CHANGELOG.md` 中 v1.2.0、v1.2.1 的内容

---

### 11. 打包后版本显示修复 ✅

**问题描述**：安装后的应用，关于页面中应用版本号和开发框架版本显示为 "v"，无具体版本信息。

**修复内容**：
- `generate-version-config.js`：从 `../node_modules/electron/package.json` 读取 electron 版本，添加 monaco/markdown-it 版本
- `utils.ts`：IPC 处理器添加运行时 fallback，从 `process.versions` 补充 electron/chrome/node 版本
- `app-paths.ts`：修复 `getAppResourcesPath()` 使用 `process.resourcesPath` 替代 `path.dirname(app.getPath('exe'))`
- `preload/index.ts` + `index.d.ts`：添加 `monacoEditorVersion` 和 `markdownItVersion` 字段
- `HelpAboutDialog.vue`：添加 Monaco Editor 和 markdown-it 版本显示

---

## 三、验证结果

| 验证项 | 结果 |
|--------|------|
| TypeScript (Node) | ✅ 0 错误 |
| TypeScript (Web) | ✅ 0 错误 |
| ESLint | ✅ 无错误 |
| 单元测试 | ✅ 21/21 通过 |
| 开发模式 | ✅ 启动成功 |
| 打包构建 | ✅ 打包成功 |

---

## 四、技术栈

- **Electron**: 43.4.1
- **Vue**: 3.5.41
- **Vite**: 8.2.2
- **TypeScript**: 6.0.2
- **Monaco Editor**: 0.56.0
- **markdown-it**: 15.0.0
- **Node.js**: 24.6.0（内置）
