# JSDOM → Vue 对话框转换任务进度

## 任务概述

将 `src/main/dialogs/` 下的 JSDOM 生成对话框转换为 Vue 组件，放在 `src/renderer/src/dialogs/` 目录。

---

## 已完成工作

### ✅ 公共基础组件（3个）

| 组件 | 位置 | 功能 |
|------|------|------|
| `TitleBar.vue` | `src/renderer/src/dialogs/common/` | 通用对话框标题栏 |
| `DialogButton.vue` | `src/renderer/src/dialogs/common/` | 通用按钮组件 |
| `BaseDialog.vue` | `src/renderer/src/dialogs/common/` | 基础对话框容器组件 |

---

### ✅ 第一批：简单对话框（5个）

| 原文件 | Vue 组件 | 位置 | 功能 |
|--------|----------|------|------|
| `ShowSuccessDialog.ts` | `SuccessDialog.vue` | `src/renderer/src/dialogs/simple/` | 成功提示对话框 |
| `ShowCreateFileFolderDialog.ts` | `CreateFileFolderDialog.vue` | `src/renderer/src/dialogs/simple/` | 新建文件/文件夹对话框 |
| `ShowRemaneDialog.ts` | `RenameDialog.vue` | `src/renderer/src/dialogs/simple/` | 重命名对话框 |
| `ShowWebUrlDialog.ts` | `WebUrlDialog.vue` | `src/renderer/src/dialogs/simple/` | 插入网页链接对话框 |
| `ShowNewFileFolderDialog.ts` | `NewFileFolderDialog.vue` | `src/renderer/src/dialogs/simple/` | 新建文件/文件夹（含路径选择） |

---

### ✅ 第二批：中等对话框（5个）

| 原文件 | Vue 组件 | 位置 | 功能 |
|--------|----------|------|------|
| `ShowMdSheetDialog.ts` | `MdSheetDialog.vue` | `src/renderer/src/dialogs/medium/` | Markdown 表格插入 |
| `ShowMathTextDialog.ts` | `MathTextDialog.vue` | `src/renderer/src/dialogs/medium/` | 数学公式编辑（LaTeX） |
| `ShowImportOptionDialog.ts` | `ImportOptionDialog.vue` | `src/renderer/src/dialogs/medium/` | 导入选项选择 |
| `ShowInsertImageDialog.ts` | `InsertImageDialog.vue` | `src/renderer/src/dialogs/medium/` | 插入图片对话框 |
| `ShowAdmonitionsDialog.ts` | `AdmonitionDialog.vue` | `src/renderer/src/dialogs/medium/` | Admonition 提示框编辑 |

---

## 待完成工作

### 🔄 第三批：复杂对话框（5个）

| 原文件 | 计划组件名 | 复杂度 |
|--------|------------|--------|
| `ShowFontSelectDialog.ts` | `FontSelectDialog.vue` | 🔴 高 |
| `ShowThemeSettingDialog.ts` | `ThemeSettingDialog.vue` | 🔴 高 |
| `ShowEditorSettingDialog.ts` | `EditorSettingDialog.vue` | 🔴 高 |
| `ShowSystemSettingDialog.ts` | `SystemSettingDialog.vue` | 🔴 高 |
| `ShowMermaidEditDialog.ts` | `MermaidEditDialog.vue` | 🟡 中 |

---

### 🔄 第四批：其他对话框（6个）

| 原文件 | 计划组件名 |
|--------|------------|
| `ShowHelpAboutDialog.ts` | `HelpAboutDialog.vue` |
| `ShowHelpContactUsDialog.ts` | `HelpContactUsDialog.vue` |
| `ShowQuickLinkSettingDialog.ts` | `QuickLinkSettingDialog.vue` |
| `ShowTechStackDialog.ts` | `TechStackDialog.vue` |
| `OpenMermaidRenderFrame.ts` | `MermaidRenderFrame.vue` |
| `OpenOnlineWebPages.ts` | `OnlineWebPages.vue` |

---

## 目录结构

```
src/renderer/src/dialogs/
├── common/                          # 公共基础组件
│   ├── TitleBar.vue
│   ├── DialogButton.vue
│   └── BaseDialog.vue
├── simple/                          # 简单对话框（5个）
│   ├── SuccessDialog.vue
│   ├── CreateFileFolderDialog.vue
│   ├── RenameDialog.vue
│   ├── WebUrlDialog.vue
│   └── NewFileFolderDialog.vue
├── medium/                          # 中等对话框（5个）
│   ├── MdSheetDialog.vue
│   ├── MathTextDialog.vue
│   ├── ImportOptionDialog.vue
│   ├── InsertImageDialog.vue
│   └── AdmonitionDialog.vue
├── complex/                         # 复杂对话框（待完成）
│   ├── FontSelectDialog.vue
│   ├── ThemeSettingDialog.vue
│   ├── EditorSettingDialog.vue
│   ├── SystemSettingDialog.vue
│   └── MermaidEditDialog.vue
└── pending/                         # 其他对话框（待完成）
    ├── HelpAboutDialog.vue
    ├── HelpContactUsDialog.vue
    ├── QuickLinkSettingDialog.vue
    ├── TechStackDialog.vue
    ├── MermaidRenderFrame.vue
    └── OnlineWebPages.vue
```

---

## 进度统计

| 类别 | 计划数 | 已完成 | 百分比 |
|------|--------|--------|--------|
| 公共基础组件 | 3 | 3 | 100% |
| 简单对话框 | 5 | 5 | 100% |
| 中等对话框 | 5 | 5 | 100% |
| 复杂对话框 | 5 | 0 | 0% |
| 其他对话框 | 6 | 0 | 0% |
| **总计** | **24** | **13** | **54%** |

---

## 下一步工作建议

### 1. 继续创建剩余对话框
先完成第三批复杂对话框，再完成第四批其他对话框。

### 2. Preload 接口暴露
需要在 `src/preload/index.ts` 中暴露对话框相关接口，比如：
- `dialog.showThemeSetting()`
- `dialog.showFontSelect()`
- 等等

### 3. 主进程 IPC 改造
- 保持现有 IPC 协议兼容（`dialog-*-btn-*`）
- 新增 invoke 接口支持 Promise 调用
- 注册主题更新广播监听

### 4. App.vue 集成
- 添加对话框状态管理
- 集成到主界面组件中
- 处理主题样式应用

### 5. 测试验证
- 逐个测试对话框功能
- 验证主题切换正确
- 检查 IPC 通信稳定
- 性能评估与优化

---

## 技术要点

### 对话框实现方式
- 使用 `<Teleport to="body">` 挂载到 body
- 使用 `<Transition>` 实现动画
- 复用 `var(--*)` CSS 变量主题系统
- 通过 `emit` 实现父子组件通信

### IPC 兼容性策略
- 现有 `send` 协议完全保留
- 新增 `invoke` 接口提供 Promise 调用
- 广播协议 `baize-notes:theme-updated` 保持不变

### 性能优化
- 按需显示/隐藏，而非创建/销毁
- 使用 v-show/v-if 管理生命周期
- 避免不必要的重复渲染

---

## 相关文档

- `doc/trae/白泽笔记项目深度分析报告.md` - 项目整体分析
- `doc/trae/主题系统深度分析与优化方案.md` - 主题系统专项分析
- `doc/trae/Dialog-to-Vue-Plan.md` - 对话框改造计划

---

*文档生成时间：2026-05-03*
*更新时间：2026-05-03*
