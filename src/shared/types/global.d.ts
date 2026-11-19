/**
 * 跨层全局类型兼容声明（第 4 批 P3 清理：原 src/main/global-types.d.ts 迁入）
 *
 * ## 迁移背景
 * 原 `src/main/global-types.d.ts` 被 `tsconfig.web.json` 的 include 列入渲染层程序，
 * 形成「渲染层类型检查依赖 main 目录文件」的跨层挂靠（架构检查 ARC-13 遗留项）。
 * 现迁移到 shared 层：全局声明与结构真源同属 `src/shared`，渲染层与测试程序都只从
 * shared 取声明，main 目录不再被 web/test 的 tsconfig include。
 *
 * ## 本文件保留内容
 * 仅保留「渲染层以全局类型方式使用」的兼容别名：
 * - FileProperties：`MarkdownPreviewComponent.vue` 仍以全局类型直接使用
 *   （`FileTreeNode.vue` 已改为显式 `import type`）。为不破坏既有全局用法，采用
 *   「shared 定义 + declare global 转发」方式保留同一份结构，避免第三处重复定义。
 *
 * ## 约定
 * 主进程代码已全部改为显式 `import type`，不依赖本全局声明；新增代码请优先显式
 * `import type { FileProperties } from '.../shared/types'`，不要继续扩散全局类型用法。
 */
import type { FileProperties as SharedFileProperties } from './file'

declare global {
    /**
     * 文件属性（跨进程：渲染层 → 主进程 IPC.FILE.OPEN_SELECT_FILE）
     * 结构唯一来源：src/shared/types/file.ts 的 FileProperties。
     */
    type FileProperties = SharedFileProperties
}
