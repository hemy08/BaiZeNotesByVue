/**
 * 状态栏类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * 收敛前直接内联在 src/shared/types/index.ts，现按领域拆分到本文件，
 * 由 index.ts 统一 re-export，既有 `import type ... from '.../shared/types'` 不变。
 */

/**
 * 状态栏消息类型（M2/4.4：主进程发送端与渲染层展示端统一真源）
 *
 * - info：普通提示（默认图标 ℹ）
 * - success：成功（✓）
 * - warning：警告/降级（⚠）
 * - error：失败（✗）
 * - loading：进行中（⋯，渲染层不自动复位）
 */
export type StatusBarMessageType = 'info' | 'success' | 'warning' | 'error' | 'loading'

export interface StatusBarUpdatePayload {
    message: string
    type: StatusBarMessageType
    encoding?: string
}
