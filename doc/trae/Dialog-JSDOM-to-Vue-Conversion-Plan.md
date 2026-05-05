# 对话框 JSDOM → Vue 转换计划

**文档版本**: v1.0
**生成日期**: 2026年5月3日
**目标**: 将 `src/main/dialogs` 下的 JSDOM 生成对话框转换为 Vue 组件

---

## 1. 对话框清单与复杂度分析

### 1.1 简单对话框（第一批）- 5个

| 文件名 | 功能 | 行数 | 特点 |
|-------|------|------|------|
| `ShowSuccessDialog.ts` | 成功提示对话框 | 215行 | 显示消息+确定按钮，最简单 |
| `ShowCreateFileFolderDialog.ts` | 新建文件/文件夹 | 246行 | 单输入框+确定/取消 |
| `ShowRemaneDialog.ts` | 重命名对话框 | 146行 | 显示旧路径+新名称输入 |
| `ShowWebUrlDialog.ts` | 插入网页链接 | 303行 | 两个输入框+确定/取消 |
| `ShowNewFileFolderDialog.ts` | 新建文件/文件夹(带路径) | 355行 | 名称+路径选择+确定/取消 |

### 1.2 中等复杂度对话框（第二批）- 5个

| 文件名 | 功能 | 行数 | 特点 |
|-------|------|------|------|
| `ShowInsertImageDialog.ts` | 插入图片 | 315行 | 3个输入区域+文件选择+预览 |
| `ShowAdmonitionsDialog.ts` | Admonition编辑 | 700行 | 13种类型+标题+内容+预览 |
| `ShowMdSheetDialog.ts` | Markdown表格 | 待分析 | 表格编辑组件 |
| `ShowMathTextDialog.ts` | 数学公式编辑 | 待分析 | LaTeX输入+预览 |
| `ShowImportOptionDialog.ts` | 导入选项 | 待分析 | 导入配置选项 |

### 1.3 复杂对话框（第三批）- 5个

| 文件名 | 功能 | 行数 | 特点 |
|-------|------|------|------|
| `ShowFontSelectDialog.ts` | 字体样式选择 | 668行 | 字体/颜色/样式/对齐+实时预览 |
| `ShowThemeSettingDialog.ts` | 主题设置 | 750+行 | 主题网格+分类+编辑器主题 |
| `ShowEditorSettingDialog.ts` | 编辑器设置 | 500+行 | 多种配置选项 |
| `ShowSystemSettingDialog.ts` | 系统设置 | 500+行 | 多种配置选项 |
| `ShowMermaidEditDialog.ts` | Mermaid编辑 | 400+行 | 代码编辑+预览 |

### 1.4 待分析对话框（第四批）- 6个

| 文件名 | 功能 | 备注 |
|-------|------|------|
| `ShowHelpAboutDialog.ts` | 关于对话框 | |
| `ShowHelpContactUsDialog.ts` | 联系我们 | |
| `ShowQuickLinkSettingDialog.ts` | 快捷链接设置 | |
| `ShowTechStackDialog.ts` | 技术栈对话框 | |
| `OpenMermaidRenderFrame.ts` | Mermaid渲染窗口 | 独立窗口 |
| `OpenOnlineWebPages.ts` | 打开网页 | |

---

## 2. 目标目录结构

```
src/renderer/src/dialogs/
├── common/                          # 对话框公共组件
│   ├── TitleBar.vue                 # 通用标题栏
│   ├── BaseDialog.vue               # 基础对话框组件
│   └── DialogButton.vue             # 通用按钮组件
├── simple/                          # 简单对话框
│   ├── SuccessDialog.vue
│   ├── CreateFileFolderDialog.vue
│   ├── RenameDialog.vue
│   ├── WebUrlDialog.vue
│   └── NewFileFolderDialog.vue
├── medium/                          # 中等复杂度对话框
│   ├── InsertImageDialog.vue
│   ├── AdmonitionDialog.vue
│   ├── MdSheetDialog.vue
│   ├── MathTextDialog.vue
│   └── ImportOptionDialog.vue
├── complex/                         # 复杂对话框
│   ├── FontSelectDialog.vue
│   ├── ThemeSettingDialog.vue
│   ├── EditorSettingDialog.vue
│   ├── SystemSettingDialog.vue
│   └── MermaidEditDialog.vue
└── pending/                         # 待分析对话框
    ├── HelpAboutDialog.vue
    ├── HelpContactUsDialog.vue
    ├── QuickLinkSettingDialog.vue
    ├── TechStackDialog.vue
    ├── MermaidRenderFrame.vue
    └── OnlineWebPage.vue
```

---

## 3. 转换方案

### 3.1 架构选择

**推荐方案：主窗口内 Modal**

- 所有对话框作为 Vue 组件，在主窗口内以 Modal 形式显示
- 保持现有 IPC 消息协议兼容
- 可以复用 App.vue 中的 `applyTheme` 等代码
- 性能更好，资源消耗更低

### 3.2 IPC 通信保持兼容

现有 IPC 消息协议保持不变：
- `dialog-xxx-btn-insert` → 发送数据
- `dialog-xxx-btn-cancel` → 取消
- `baize-notes:theme-updated` → 主题更新广播
- `baize-notes:init-theme-styles` → 初始化主题

### 3.3 Preload API 补充

在 `src/preload/index.ts` 中补充必要 API：
```typescript
const dialogAPI = {
  // 显示对话框
  showDialog: (dialogName: string, data?: any) => {
    ipcRenderer.send('dialog:show', { name: dialogName, data })
  },
  // 关闭对话框
  closeDialog: () => {
    ipcRenderer.send('dialog:close')
  }
}
```

---

## 4. 转换步骤

### 4.1 阶段一：创建公共组件（第1天）

1. 创建 `common/TitleBar.vue` - 通用标题栏
2. 创建 `common/BaseDialog.vue` - 基础对话框布局
3. 创建 `common/DialogButton.vue` - 通用按钮
4. 创建 `common/styles.css` - 公共样式

### 4.2 阶段二：转换简单对话框（第2-3天）

1. `SuccessDialog.vue` - 最简单，从它开始
2. `CreateFileFolderDialog.vue`
3. `RenameDialog.vue`
4. `WebUrlDialog.vue`
5. `NewFileFolderDialog.vue`

### 4.3 阶段三：转换中等对话框（第4-5天）

1. `InsertImageDialog.vue`
2. `AdmonitionDialog.vue`
3. `MdSheetDialog.vue`
4. `MathTextDialog.vue`
5. `ImportOptionDialog.vue`

### 4.4 阶段四：转换复杂对话框（第6-10天）

1. `FontSelectDialog.vue` - 样式复杂
2. `ThemeSettingDialog.vue` - 已有示例
3. `EditorSettingDialog.vue`
4. `SystemSettingDialog.vue`
5. `MermaidEditDialog.vue`

### 4.5 阶段五：转换剩余对话框（第11-12天）

1. `HelpAboutDialog.vue`
2. `HelpContactUsDialog.vue`
3. `QuickLinkSettingDialog.vue`
4. `TechStackDialog.vue`
5. `MermaidRenderFrame.vue`
6. `OnlineWebPage.vue`

### 4.6 阶段六：集成与测试（第13-14天）

1. 修改主进程调用方式
2. 确保 IPC 通信正常
3. 测试主题切换
4. 测试所有对话框功能

---

## 5. Vue 组件模板

### 5.1 基础对话框模板

```vue
<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog-container" :style="dialogStyle">
        <!-- 标题栏 -->
        <div class="dialog-title-bar">
          <span class="dialog-title">{{ title }}</span>
          <button class="dialog-close-btn" @click="handleClose">×</button>
        </div>

        <!-- 内容区域 -->
        <div class="dialog-content">
          <slot></slot>
        </div>

        <!-- 按钮区域 -->
        <div v-if="$slots.footer" class="dialog-footer">
          <slot name="footer"></slot>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  visible: boolean
  title: string
  width?: string
  height?: string
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: '对话框',
  width: '500px',
  height: 'auto'
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', data: any): void
}>()

const dialogStyle = computed(() => ({
  width: props.width,
  height: props.height
}))

function handleClose() {
  emit('close')
}

function handleConfirm(data: any) {
  emit('confirm', data)
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog-container {
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-title-bar {
  height: 40px;
  background: var(--title-bar-gradient);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  -webkit-app-region: drag;
}

.dialog-title {
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.dialog-close-btn {
  -webkit-app-region: no-drag;
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: white;
  transition: all 0.2s;
}

.dialog-close-btn:hover {
  background: rgba(255, 80, 80, 0.95);
}

.dialog-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
```

---

## 6. 转换示例（ShowSuccessDialog）

### 6.1 Vue 组件实现

```vue
<!-- src/renderer/src/dialogs/simple/SuccessDialog.vue -->
<template>
  <Teleport to="body">
    <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
      <div class="dialog-container">
        <div class="title-bar">
          <span class="title-text">{{ title }}</span>
          <button class="close-btn" @click="handleClose">×</button>
        </div>

        <div class="container">
          <svg class="success-icon" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="45" fill="none" stroke="var(--accent-color)" stroke-width="3"/>
            <path d="M 30 50 L 45 65 L 70 35" fill="none" stroke="var(--accent-color)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <div class="success-message">{{ message }}</div>
        </div>

        <div class="footer">
          <button class="btn-confirm" @click="handleClose">确定</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
interface Props {
  visible: boolean
  title: string
  message: string
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog-container {
  width: 450px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.title-bar {
  height: 32px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 15px;
  -webkit-app-region: drag;
}

.title-text {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
}

.close-btn {
  -webkit-app-region: no-drag;
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 100, 100, 0.9);
}

.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 20px;
}

.success-icon {
  width: 60px;
  height: 60px;
  margin-bottom: 15px;
  animation: scaleIn 0.3s ease-out;
}

@keyframes scaleIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.success-message {
  font-size: 14px;
  color: var(--text-color);
  text-align: center;
  line-height: 1.6;
  max-width: 380px;
  word-wrap: break-word;
}

.footer {
  padding: 15px 20px;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
}

.btn-confirm {
  padding: 8px 30px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm:hover {
  opacity: 0.9;
}
</style>
```

### 6.2 主进程修改（参考）

```typescript
// 旧代码 (ShowSuccessDialog.ts)
import { BrowserWindow } from 'electron'
import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../themes/theme-config'

export function ShowSuccessDialog(title: string, message: string) {
  const html = makeSuccessHtml(title, message)
  const dialog = new BrowserWindow({ ... })
  dialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
}

// 新代码 (showSuccessDialog.ts) - 主进程只负责显示
import { ipcMain } from 'electron'

// IPC 通道保持不变
ipcMain.on('dialog:show-success', (event, { title, message }) => {
  // 通知渲染进程显示对话框
  BrowserWindow.getFocusedWindow()?.webContents.send('show-success-dialog', { title, message })
})
```

---

## 7. 注意事项

### 7.1 主题样式复用

所有对话框复用现有的 CSS 变量：
- `--bg-color` - 背景色
- `--card-bg` - 卡片背景
- `--text-color` - 文本颜色
- `--border-color` - 边框颜色
- `--accent-color` - 强调色
- `--hover-bg` - 悬停背景
- `--title-bar-gradient` - 标题栏渐变

### 7.2 IPC 兼容性

转换过程中保持 IPC 消息协议兼容，确保向后兼容。

### 7.3 事件处理

使用 Vue 的 `defineEmits` 定义事件，与现有 IPC 消息对应。

---

**文档版本**: v1.0
**最后更新**: 2026-05-03
**状态**: 待执行
