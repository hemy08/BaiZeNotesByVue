# 方案 A：独立 Vue 对话框窗口实现

## 📁 推荐目录结构

```
src/renderer/src/dialogs
├── ThemeSetting/
│   ├── index.html          # 对话框入口 HTML
│   ├── main.ts             # Vue 应用初始化
│   ├── App.vue             # 对话框主组件
│   ├── components/
│   │   └── ThemePanel.vue  # 主题选择组件
│   └── vite.config.ts      # 可选（如果单独打包）
```

---

## 1. index.html

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>主题设置</title>
  <!-- 这里引入必要的 CSS -->
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.ts"></script>
</body>
</html>
```

---

## 2. main.ts

```typescript
import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

// 创建 Vue 应用
const app = createApp(App)
app.mount('#app')
```

---

## 3. App.vue

```vue
<template>
  <div class="theme-setting-dialog">
    <div class="title-bar" :style="titleBarStyle">
      <span class="title-bar-title">主题设置</span>
      <button class="close-btn" @click="closeDialog">×</button>
    </div>
    
    <!-- 内容与方案 B Modal 基本一致，复用 ThemePanel -->
    <ThemePanel />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ThemePanel from './components/ThemePanel.vue'

// IPC 通信
const { ipcRenderer } = require('electron')
// 或者用 contextBridge 暴露的 window.electron.ipcRenderer

function closeDialog() {
  ipcRenderer.send('dialog:close-theme-settings')
}

// 计算样式...
</script>

<style scoped>
/* 样式与方案 B 一致 */
</style>
```

---

## 4. 修改主进程（ShowThemeSettingDialog.ts）

```typescript
import { BrowserWindow, app } from 'electron'
import path from 'path'
import { getCurrentThemeStyles } from '../themes/theme-config'

let themeSettingDialog: Electron.BrowserWindow | null

export function ShowThemeSettingDialog() {
  if (themeSettingDialog) {
    themeSettingDialog.focus()
    return
  }

  // 创建窗口（启用安全设置）
  themeSettingDialog = new BrowserWindow({
    width: 1200,
    height: 600,
    frame: false,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,       // ✅ 关闭
      contextIsolation: true,       // ✅ 开启
      preload: path.join(__dirname, '../../preload/index.js')
    }
  })

  // 开发 vs 生产加载路径
  const isDev = !app.isPackaged
  if (isDev) {
    const port = process.env.PORT || 5173
    themeSettingDialog.loadURL(`http://localhost:${port}/#/theme-setting`)
  } else {
    themeSettingDialog.loadFile(
      path.join(__dirname, '../../renderer/dialogs/ThemeSetting/index.html')
    )
  }

  // 窗口关闭时清理
  themeSettingDialog.on('closed', () => {
    themeSettingDialog = null
  })
}
```

---

## 5. 修改 preload

保持 `preload/index.ts` 如之前的 `preload-updates.ts` 示例，暴露 theme API 即可。

---

## 6. electron.vite.config.ts 补充多页面配置

```typescript
// 可以设置多页面，或者让 vite 处理多个入口
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: { ... },
    plugins: [vue()],
    // 可选：多页面配置
    build: {
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'src/renderer/index.html'),
          theme: resolve(__dirname, 'src/renderer/src/dialogs/ThemeSetting/index.html')
        }
      }
    }
  }
})
```

---

## ✅ 方案 A 优缺点总结

| 特性 | 评分 |
| --- | --- |
| 与现有 IPC 协议兼容 | ⭐⭐⭐⭐⭐ 完美 |
| 代码复用性 | ⭐⭐⭐ 需要一些调整 |
| 性能 | ⭐⭐⭐⭐ 额外窗口开销 |
| 用户体验 | ⭐⭐⭐⭐⭐ 原生对话框体验 |
| 内存占用 | ⭐⭐⭐ 较高 |
