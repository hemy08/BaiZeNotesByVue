/**
 * 图表渲染超时 / 缓存上限 / 并发上限共享常量（公共接口归位第 1 批 1.17）。
 *
 * 覆盖 PlantUML（主进程隐藏窗口本地渲染 + 渲染层调用）与 Mermaid（渲染层本地渲染）。
 * 数值逐项与来源文件对齐，禁止在此自行调整（超时与并发会直接影响预览卡顿 / 资源占用）。
 * 本批次只新建常量、不改任何使用方（引用迁移由后续阶段负责）。
 */

/* ==================== 一、PlantUML 主进程本地渲染 ==================== */

/**
 * 单张图本地渲染总超时（10s）：超时返回 error，预览侧回显源码 + 错误提示。
 * 进程 / 用途：主进程 / 隐藏渲染窗口一次性渲染。
 * 来源：`src/main/renders/plantuml-local.ts:61-62`（已导出同名常量）。
 */
export const PLANTUML_RENDER_TIMEOUT_MS = 10000

/**
 * 隐藏窗口首次加载 + teaVM 初始化超时（20s）：超时按渲染失败处理。
 * 进程 / 用途：主进程 / 隐藏渲染窗口创建与首屏加载。
 * 来源：`src/main/renders/plantuml-local.ts:64-65`（已导出同名常量）。
 */
export const PLANTUML_WINDOW_LOAD_TIMEOUT_MS = 20000

/**
 * 页面内等待 PlantUML 把 SVG 写入 `#out` 的最长时间（8s，teavm 正常为同步输出）。
 * 进程 / 用途：主进程 / `executeJavaScript` 轮询渲染结果。
 * 来源：`src/main/renders/plantuml-local.ts:67-68`（源码私有常量 `PLANTUML_PAGE_RENDER_WAIT_MS`）。
 */
export const PLANTUML_PAGE_RENDER_WAIT_MS = 8000

/**
 * 渲染结果 LRU 缓存上限（50 条，按源码 sha1 命中）。
 * 进程 / 用途：主进程 / 本地渲染 SVG 缓存。
 * 来源：`src/main/renders/plantuml-local.ts:70-71`（源码导出名为 `PLANTUML_CACHE_MAX`）。
 */
export const PLANTUML_RENDER_CACHE_MAX = 50

/**
 * 隐藏渲染窗口空闲销毁超时（60s）：渲染完成后的空闲期超时即销毁窗口释放渲染进程资源。
 * 进程 / 用途：主进程 / 隐藏渲染窗口生命周期管理。
 * 来源：`src/main/renders/plantuml-local.ts:102-110`（已导出同名常量，值为 `60_000`）。
 */
export const PLANTUML_IDLE_DISPOSE_MS = 60000

/* ==================== 二、PlantUML 渲染层调用（预览管线） ==================== */

/**
 * 渲染层单图渲染兜底超时（12s）：主进程侧 10s 超时，渲染层留 2s 余量。
 * 进程 / 用途：渲染进程 / `ipcRenderer.invoke` 调用本地渲染通道。
 * 来源：`src/renderer/src/components/Markdown/hemy-editor-render.ts:232-233`
 * （源码私有常量 `PLANTUML_INVOKE_TIMEOUT_MS`）。
 */
export const RENDERER_PLANTUML_TIMEOUT_MS = 12000

/**
 * PlantUML 渲染并发上限（3）：与 mermaid 一致；主进程内部串行队列消化，避免一次性塞满 IPC。
 * 进程 / 用途：渲染进程 / 预览管线并发调度。
 * 来源：`src/renderer/src/components/Markdown/hemy-editor-render.ts:234-235`
 * （源码私有常量 `PLANTUML_CONCURRENCY_LIMIT`）。
 */
export const PLANTUML_CONCURRENCY_LIMIT = 3

/**
 * 渲染层 PlantUML 渲染结果 HTML 缓存上限（50 条，LRU，避免同一源码重复跨进程渲染）。
 * 进程 / 用途：渲染进程 / 预览 HTML 缓存。
 * 来源：`src/renderer/src/components/Markdown/hemy-editor-render.ts:236-237`
 * （源码私有常量 `PLANTUML_HTML_CACHE_MAX`）。
 */
export const RENDERER_PLANTUML_CACHE_MAX = 50

/* ==================== 三、Mermaid 渲染层本地渲染 ==================== */

/**
 * Mermaid 渲染结果 LRU 缓存上限（50 条，按内容 hash 命中，避免防抖后全量重渲染）。
 * 进程 / 用途：渲染进程 / Mermaid SVG 缓存。
 * 来源：`src/renderer/src/components/Markdown/hemy-editor-render.ts:69-70`
 * （源码私有常量 `MERMAID_CACHE_MAX`）。
 */
export const MERMAID_RENDER_CACHE_MAX = 50

/**
 * Mermaid 渲染并发上限（3）：Mermaid 内部存在全局状态，限制并发数避免状态竞争。
 * 进程 / 用途：渲染进程 / 预览管线并发调度。
 * 来源：`src/renderer/src/components/Markdown/hemy-editor-render.ts:208-210`
 * （源码函数内局部常量 `MERMAID_CONCURRENCY_LIMIT`）。
 */
export const MERMAID_CONCURRENCY_LIMIT = 3
