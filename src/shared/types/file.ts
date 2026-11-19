/**
 * 文件系统类型（ARC-13 / 第 2 批契约重构：主进程 / 渲染层唯一真源）
 *
 * FileItem（目录树传输契约）：
 * - 收敛前在 src/main/global-types.d.ts 与 src/shared/types/index.ts 重复定义（结构一致），
 *   主进程 app-state / file-operations / path-utils 直接使用；渲染层不直接使用
 *   （渲染层 UI 类型见 ResourceManager/resource-manager.ts 的 FileSysItem，从本类型派生）；
 * - 第 2 批补 `id`：主进程 `directory-tree.ts` 实际构造并 JSON 序列化下发的节点**一直含**
 *   稳定 id（FNV-1a 32 位 → base36，由路径派生），但 shared FileItem 未声明，主进程只能
 *   `as FileItem` 绕过、渲染层 FileSysItem 只能把 id 标为可选——契约与运行时漂移；
 * - 第 2 批把 `fileExtension` 收紧为必填：主进程对所有节点都会赋值（文件为小写扩展名、
 *   文件夹与根节点为空串），渲染层 FileTreeNode 的 `v-model:file-extension` 依赖 string。
 *   根节点此前缺 id/fileExtension，已由主进程 `BuildFileTree` 补齐（契约对齐，非行为改造）。
 *
 * FileTreePayload（目录树传输载荷）：
 * - IPC.FILE_MANAGER.FILE_SYSTEM_DATA 的载荷是**整树 JSON 字符串**，JSON.parse 后的形状
 *   即 `FileItem[]`（主进程 `ReloadDirFromDisk` 对 `BuildFileTree` 结果做 JSON.stringify）。
 *   定义该别名是为了让「主进程发送 → 渲染层解析 → UI 类型派生」共用同一传输类型；
 *   该通道的 IPC 载荷元组仍是 `[fileTreeJson: string]`（见 shared/types/ipc.ts）。
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
 * - 第 2 批：主进程 `src/main/utils/app-state.ts` 的本地 `StoreFileProperties`（type: string、
 *   children?: [] 零读取）已删除，`currentActiveFile` 直接使用本类型。
 */
export interface FileItem {
    /**
     * 稳定节点 id（PF-4）：由绝对路径规范键做 FNV-1a 32 位哈希后转 base36
     * （主进程 directory-tree.buildStableItemId），同一路径重复扫描结果一致，
     * 用于渲染层 v-for key / ref 与整树 JSON 去重。
     */
    id: string
    name: string
    path: string
    type: 'file' | 'folder'
    isDirectory: boolean
    /** 小写扩展名（含点，如 `.md`）；文件夹与根节点为空字符串 */
    fileExtension: string
    children: FileItem[]
}

/**
 * 目录树传输载荷：IPC.FILE_MANAGER.FILE_SYSTEM_DATA 的 JSON.parse 结果
 * （主进程整树对象序列化后的形状，根节点为单个工作区目录节点）。
 */
export type FileTreePayload = FileItem[]

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
