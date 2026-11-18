/**
 * 文件系统类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * FileItem：
 * - 收敛前在 src/main/global-types.d.ts 与 src/shared/types/index.ts 重复定义（结构一致），
 *   主进程 app-state / file-operations / path-utils 直接使用；
 * - 渲染层不直接使用（渲染层文件树结构见 ResourceManager/resource-manager.ts 的
 *   FileSysItem，字段来源于主进程 FileItem 序列化结果 + 前端展开态扩展字段）。
 *
 * FileProperties：
 * - 收敛前有两处不同定义：
 *   a) src/main/global-types.d.ts 的全局声明：type: 'file' | 'folder'、content 必填、
 *      children?: []（children 全库零读取）；
 *   b) src/main/utils/file-utils/file-operations.ts 的模块导出：type: string、
 *      content?: string、encoding?: string。
 * - 以实际使用方为准合并：渲染层 FileTreeNode.vue / MarkdownPreviewComponent.vue 与主进程
 *   OpenFile/RenameFileFolder 构造点均传 type: 'file' 与 content: ''，主进程打开文件后
 *   回填 content 与 encoding（D-4 编码探测），故保留字面量联合类型、content 改为可选、
 *   新增 encoding 可选字段、删除零读取的 children。
 * - 收敛后主进程 file-operations.ts 仍保留 `export type { FileProperties }`，既有
 *   `import { FileProperties } from './file-operations'` 形式的引用不受影响。
 */
export interface FileItem {
    name: string
    path: string
    type: 'file' | 'folder'
    isDirectory: boolean
    fileExtension?: string
    children: FileItem[]
}

/**
 * 文件属性（跨进程：渲染层 → 主进程，通道 baize:notes:open-select-file）
 */
export interface FileProperties {
    name: string
    path: string
    type: 'file' | 'folder'
    content?: string
    encoding?: string
}

// ---------------------------------------------------------------------------------------------
// 「文件 → 最近文件 / 最近文件夹」菜单（RECENT_LIST / OPEN_RECENT 通道负载）
//
// 真源说明：最近文件存于 file-state-store（recentFiles），最近文件夹存于
// recent-folders 裸 JSON 配置；两个列表各自最多 20 项（与 shared/constants/recent-files
// 的钳制上限一致，菜单侧再兜底 slice(0, 20)）。渲染层只拿路径字符串，点击后经
// OPEN_RECENT 由主进程重新做白名单校验（不在当前最近列表中的路径一律拒绝）。
// ---------------------------------------------------------------------------------------------

/** 「最近文件/最近文件夹」列表（RECENT_LIST 返回结构，各最多 20 项） */
export interface RecentListResult {
    /** 最近打开的文件绝对路径（最近的在前） */
    files: string[]
    /** 最近打开的工作目录绝对路径（最近的在前） */
    folders: string[]
}

/** 「最近项」类型：文件 / 文件夹 */
export type RecentOpenKind = 'file' | 'folder'

/** 「打开最近项」请求负载（OPEN_RECENT 入参） */
export interface OpenRecentPayload {
    kind: RecentOpenKind
    path: string
}

/** 「打开最近项」结果（OPEN_RECENT 返回结构；失败时 message 为主进程已本地化文案） */
export interface OpenRecentResult {
    ok: boolean
    message?: string
}
