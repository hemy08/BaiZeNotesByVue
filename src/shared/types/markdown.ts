/**
 * Markdown 结构类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * MarkdownTOC 收敛前在 src/main/global-types.d.ts 与 src/shared/types/index.ts
 * 重复定义；主进程侧零引用，渲染层（ResourceManager.vue / hemy-editor-render.ts /
 * MarkdownMonacoEditor.vue）从 shared 引用，故以 shared 版本迁移到本文件。
 */
export interface MarkdownTOC {
    id: string
    level: string
    text: string
    lineNumber: number
}
