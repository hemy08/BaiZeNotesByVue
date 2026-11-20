/**
 * preview-katex-assets.ts
 * P1-8 后续（KaTeX CSS 按需）：KaTeX 样式表的会话级按需加载器。
 *
 * 背景（out/tool-results/fix-katex.md §5 限制 4）：
 * KaTeX JS 已改为按需动态 import，但 `katex/dist/katex.css` 仍由 `src/renderer/src/main.ts`
 * 静态引入——它进入首屏 CSS（约 33 KB 源 / 51 处字体引用），纯文本/普通 Markdown 笔记
 * 也要先下载并解析这份样式（含 KaTeX 字体声明），而只有含公式的文档才真正需要。
 *
 * 本模块把样式加载收敛为**唯一真源**的会话级 Promise：
 * - 预览管线（preview-local-render.ts）在 `await import('katex')` 的同一次加载中一并拉起
 *   本模块（见 loadKatexInstance），无公式文档不会触发；
 * - 公式编辑器（MathTextDialog.vue）自身也是懒加载对话框，首次打开时调用本模块加载，
 *   避免「移除全局样式后公式编辑器无样式」的功能回归。
 *
 * 构建语义（Vite，electron-vite renderer）：
 * - 动态 `import('katex/dist/katex.css')` 在构建期被拆成独立的异步 CSS 产物；
 * - 该 CSS 的字体 url() 由 Vite 重写为产物内相对路径，字体文件只在样式生效后按需请求；
 * - 动态 import 的 Promise 在 Vite preload helper 完成样式表加载后才 resolve（生产构建由
 *   __vitePreload 注入 <link rel="stylesheet">），因此 await 返回即可认为样式已生效，
 *   不会出现「公式先以无样式渲染、随后跳变」的闪烁；开发态由 Vite 注入 <style>，语义一致。
 *
 * 注意：本模块只允许通过 `import()` 引用 CSS（不得出现静态 `import '...css'`），否则样式
 * 会重新进入首屏静态 CSS；该约束由 tests/unit/theme-contract.test.ts 静态护栏锁定。
 */
import { logger } from '../../common/logger'

/** 会话级样式加载 Promise（并发调用共享；失败也缓存，避免每次渲染重试刷日志） */
let katexStylePromise: Promise<boolean> | null = null
/** 样式加载尝试次数（诊断/单元测试用；同一会话最多 1 次） */
let katexStyleLoadAttempts = 0
/** 样式是否已成功加载 */
let katexStyleLoaded = false

/** P1-8 后续：KaTeX 样式是否已加载（诊断/单元测试用） */
export function IsPreviewKatexCssLoaded(): boolean {
    return katexStyleLoaded
}

/** P1-8 后续：KaTeX 样式动态 import 尝试次数（诊断/单元测试用；无公式文档应保持 0） */
export function GetPreviewKatexCssLoadCount(): number {
    return katexStyleLoadAttempts
}

/**
 * P1-8 后续：按需加载 KaTeX 样式表（会话级幂等）。
 *
 * - 首次调用发起 `import('katex/dist/katex.css')`，之后复用同一 Promise；
 * - 加载失败只记录告警并返回 false：公式仍可渲染（KaTeX HTML 自带 MathML 回退），
 *   不抛异常、不中断预览；
 * - 返回 true 表示样式已生效（生产构建下即样式表已加载完成）。
 */
export function EnsurePreviewKatexCssLoaded(): Promise<boolean> {
    if (katexStyleLoaded) {
        return Promise.resolve(true)
    }
    if (!katexStylePromise) {
        katexStyleLoadAttempts += 1
        katexStylePromise = import('katex/dist/katex.css')
            .then(() => {
                katexStyleLoaded = true
                return true
            })
            .catch((error: unknown) => {
                logger.warn('[KatexRender] KaTeX 样式动态加载失败，公式将缺少 KaTeX 样式:', error)
                return false
            })
    }
    return katexStylePromise
}
