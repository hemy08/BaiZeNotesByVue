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
// CMP-30：i18n 初始化（读取系统语言设置 + 订阅语言变更）
import { initI18n } from './common/i18n'

/**
 * 创建 Vue 应用实例
 */
const app = createApp(App)

/**
 * P0 安全（C-08 配套）：全局拖拽拦截。
 *
 * 当前应用没有"拖放文件导入"能力，但浏览器默认的 drop 行为会把拖入窗口的远程链接 /
 * 本地 HTML 文件当作导航目标，导致主窗口被不可信页面替换（进而可能接触 preload 暴露的
 * IPC 能力）。这里在捕获阶段统一 preventDefault：
 * - dragover：阻止浏览器显示"可放置"状态并取消默认放置行为；
 * - drop：阻止默认导航 / 打开文件的动作。
 * 若后续确需支持拖放导入，应改为按 dataTransfer.types 做受控白名单处理，
 * 不要直接放开默认 drop 行为。
 */
window.addEventListener('dragover', (event) => event.preventDefault(), true)
window.addEventListener('drop', (event) => event.preventDefault(), true)

app.component('ContextMenu', ContextMenu) // 注册右键菜单组件
// 先完成语言初始化再挂载，避免首屏语言闪烁
initI18n().finally(() => app.mount('#app'))
