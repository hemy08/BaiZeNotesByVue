/**
 * 主进程全局类型声明（ARC-13 收敛后）
 *
 * ## 来源约定
 * 跨进程共享的领域类型一律在 src/shared/types/ 下定义（按领域拆分，index.ts 统一出口），
 * 主进程 / 渲染层均以 `import type` 引用；本文件不再重复定义任何共享结构。
 *
 * ## 本文件保留内容
 * 仅保留「渲染层以全局类型方式使用、且收敛前已存在」的兼容别名：
 * - FileProperties：渲染层 FileTreeNode.vue / MarkdownPreviewComponent.vue 以全局类型
 *   直接使用（tsconfig.web.json 将本文件列入 include）。为不破坏现有全局用法，
 *   采用「shared 定义 + declare global 转发」方式保留同一份结构，避免第三处重复定义。
 *   主进程 utils.ts 等已改为显式 import type，不再依赖该全局声明。
 *
 * ## 已删除内容（收敛去向见 out/tool-results/r3-types-changes.md）
 * - Global 命名空间（ARC-22 已删除，20 个旧全局字段零引用）；
 * - FileSysItem：全库零引用，渲染层 ResourceManager/resource-manager.ts 已有自己的
 *   前端文件树结构（含展开态扩展字段），故直接删除；
 * - SystemSetting / MenuContext / BaiZeMenuItem / FileItem / ThemeStyles /
 *   ThemeUpdateData / MarkdownTOC：已迁入 src/shared/types/，主进程各引用点改为
 *   显式 import type；
 * - CryptoData / CryptoResult：已迁入 src/shared/types/crypto.ts，主进程与单测改为
 *   显式 import type。
 */
import type { FileProperties as SharedFileProperties } from '../shared/types'

declare global {
    /**
     * 文件属性（跨进程：渲染层 → 主进程 IPC.FILE.OPEN_SELECT_FILE）
     * 结构唯一来源：src/shared/types/file.ts 的 FileProperties。
     */
    type FileProperties = SharedFileProperties
}
