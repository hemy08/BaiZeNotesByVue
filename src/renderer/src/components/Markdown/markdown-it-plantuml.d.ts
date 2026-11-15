/**
 * markdown-it-plantuml 的最小类型声明（CQ-1：恢复 noImplicitAny 后 TS7016）。
 *
 * 该包（无 @types 声明、package.json 也未携带 types）只导出一个 markdown-it 插件函数：
 * 把裸 `@startuml ... @enduml` 块渲染为 PlantUML 服务图片；本项目仅把它作为
 * 「本地离线渲染不可用」时的远程降级路径使用（见 MarkdownPreviewComponent 注释）。
 *
 * 注意：本文件为脚本声明（无顶层 import/export），使 declare module 成为
 * 新环境模块声明而非模块增强（与同目录 monaco-worker-types.ts 同一先例）。
 */
declare module 'markdown-it-plantuml' {
    import type { MarkdownIt } from 'markdown-it'
    /** 注册 PlantUML 渲染规则的 markdown-it 插件 */
    const plantuml: (md: MarkdownIt) => void
    export default plantuml
}
