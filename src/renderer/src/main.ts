/**
 * 渲染进程入口文件
 * 负责创建 Vue 应用实例并挂载到 DOM
 */

// 引入样式文件
import './assets/main.css'
import './styles/theme.css'
import '@renderer/styles/preview_font/atom-one-light.css'
import '@renderer/styles/sheet_dialog/normalize.css'
import 'katex/dist/katex.css'
import '@renderer/styles/material/admonition.css'
import '@renderer/styles/material/gridcards.css'
import '@renderer/styles/material/tableset.css'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'

// 引入 Vue 组件和依赖
import { ContextMenu } from '@imengyu/vue3-context-menu'
import { createApp } from 'vue'
import App from './App.vue'

/**
 * 创建 Vue 应用实例
 */
const app = createApp(App)
app.component('ContextMenu', ContextMenu) // 注册右键菜单组件
app.mount('#app')                        // 挂载到 DOM
