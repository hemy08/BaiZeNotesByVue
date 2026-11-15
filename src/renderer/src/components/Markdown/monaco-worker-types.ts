/**
 * PF-03/CMP-28（monaco-worker-setup.ts 的配套类型声明，脚本文件——无 import/export，
 * 使 declare module 成为新环境模块声明而非模块增强）
 *
 * monaco-editor 的 esm 子路径（editor contributions、语言定义 register 等）不携带
 * 类型声明，且仅供副作用注册、无 API 面——用通配环境模块声明放行（TS2882）。
 *
 * ?worker 导入另行精确声明：保留 new XxxWorker() 的构造器类型。
 * 注意：'monaco-editor/esm/*' 的匹配优先级高于 vite/client 的 '*?worker'，
 * 因此必须显式声明该 worker 模块，否则默认导出会丢失类型。
 * PF-11：ts/css/html/json 4 个语言 worker 已随死重移除，这里只保留 editor worker 声明。
 */
declare module 'monaco-editor/esm/*'

declare module 'monaco-editor/esm/vs/editor/editor.worker?worker' {
    const WorkerConstructor: new (options?: { name?: string }) => Worker
    export default WorkerConstructor
}
