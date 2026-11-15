/**
 * 状态栏类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * 收敛前直接内联在 src/shared/types/index.ts，现按领域拆分到本文件，
 * 由 index.ts 统一 re-export，既有 `import type ... from '.../shared/types'` 不变。
 */
export interface StatusBarUpdatePayload {
    message: string
    type: string
    encoding?: string
}
