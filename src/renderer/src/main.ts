/**
 * 渲染进程入口文件
 * 负责创建 Vue 应用实例并挂载到 DOM
 */

// 引入样式文件
//
// 第 4 批 4.5（M6）「CSS 单次注入」唯一入口：
// - 4 个曾被 index.html <link> 与下方 import 双重加载的 CSS（atom-one-light /
//   normalize / admonition / gridcards）现只在此处引入一次（index.html 的 4 条 link 已删除）；
// - 引入顺序与收敛前 main.ts 完全一致（级联顺序不变），tests/unit/theme-contract.test.ts
//   的「CSS 单次注入」静态护栏锁定该契约。
//
// P1-8 后续（KaTeX CSS 按需，2026-11-20）：`katex/dist/katex.css` 不再在本入口静态引入
// （此前它是首屏 CSS 的一部分，无公式文档也要下载解析 KaTeX 样式与字体声明）。现改由
// preview-katex-assets.ts 在检测到公式时与 KaTeX JS 同一会话级 Promise 动态加载；公式编辑器
// 懒加载打开时同样走该加载器。首屏 CSS 因此不含任何 KaTeX 选择器/字体引用（预算门禁守护）。
import './assets/main.css'
import './styles/theme.css'
// 视觉升级（P0）：界面风格层/密度层变量表（4 风格 × 3 密度 + 动效/z-index 阶梯）。
// 只声明 CSS 变量、不覆盖任何既有选择器，因此默认观感与升级前完全一致（P1 组件才消费）；
// 必须在 theme.css 之后引入（主题色语义变量默认值先就位，ui-style.css 的变量引用才稳定）。
import './styles/ui-style.css'
// 对话框底部按钮统一样式层（唯一视觉真源）：必须在 theme.css 之后引入，
// 用 `.dialog-container .dialog-btn`（0,2,0）覆盖主题全局 `button` 的基础声明；
// 详见 assets/dialog-buttons.css 顶部说明与 tests/unit/vue/dialog-buttons-style.test.ts。
import './assets/dialog-buttons.css'
import '@renderer/styles/preview_font/atom-one-light.css'
import '@renderer/styles/sheet_dialog/normalize.css'
import '@renderer/styles/material/admonition.css'
import '@renderer/styles/material/gridcards.css'
import '@renderer/styles/material/tableset.css'
import '@renderer/styles/material/md-basic.css'
import '@renderer/styles/material/md-media.css'
import '@renderer/styles/material/md-blocks.css'
import '@imengyu/vue3-context-menu/lib/vue3-context-menu.css'

// 引入 Vue 组件和依赖
import { ContextMenu } from '@imengyu/vue3-context-menu'
import { createApp } from 'vue'
import App from './App.vue'
// CMP-30：i18n 初始化（读取系统语言设置 + 订阅语言变更）
import { initI18n } from './common/i18n'
// 2026-11-20（renderer file:// → app:// 迁移）：打包/构建产物由 app://baize 协议加载，
// 本地用户文件（预览图片、HTML 查看器相对资源）必须改走 app://local（file:// 在 fuse
// 关闭后不可用，且被 Chromium 从 app:// origin 禁止）；Vite dev server 模式保持 file:// 口径。
import { setAppProtocolActive } from '../../shared/protocol/app-protocol'

setAppProtocolActive(window.location.protocol === 'app:')

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
