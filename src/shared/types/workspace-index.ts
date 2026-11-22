/**
 * 工作区索引跨进程契约类型（1.5.1 本地知识库基座，2026-11-21）
 *
 * ## 职责
 * `FILE.GET_WORKSPACE_INDEX` 通道返回的快照结构：主进程索引服务
 * （`src/main/utils/workspace-index.ts`）构建，渲染层反链/标签/链接检查面板消费。
 *
 * ## 约定
 * - 本文件只放**纯类型声明**（shared 叶子层：不依赖 Node/Electron/Vue/DOM 运行时）；
 * - `path` / `resolvedPath` / `files` / `referencedBy` 均为**绝对路径**，`relativePath` 为
 *   相对工作区根、统一 `/` 分隔符的展示路径；
 * - 行/列一律 1-based（与 `src/main/utils/workspace-search.ts` 的匹配位置口径一致）；
 * - IPC 载荷引用统一从 `shared/types/ipc.ts` 的 `IpcResponses` 契约消费，不在此重复。
 *
 * ## task-12 扩展（B5 附件管理 / E10 悬浮预览）
 * - `WorkspaceIndexFile.excerpt`：正文纯文本摘要（≤240 字符），供 Wiki 链接悬浮预览直接展示；
 * - `WorkspaceAttachment` / `attachments` / `stats.attachmentCount`
 *   / `stats.missingAttachmentCount`：Markdown 图片/附件引用的聚合清单。
 * 新增字段均为**可选**，旧快照消费者（反链/标签/链接检查面板）无需改动即可兼容。
 */

/** Wiki 链接的解析状态：resolved=唯一命中；missing=不存在；ambiguous=多个候选无法唯一确定 */
export type WorkspaceIndexLinkStatus = 'resolved' | 'missing' | 'ambiguous'

/** 单条 Wiki 链接（`[[target]]` / `[[target|alias]]` / `[[target#heading]]`）的解析结果 */
export interface WorkspaceIndexLink {
    /** 归一化后的链接目标（去掉别名与 `#heading` 片段，保留作者写法大小写与相对形式） */
    target: string
    /** 链接原文（含 `[[` `]]`，便于 UI 原样回显与跳转定位） */
    raw: string
    /** 链接起始位置所在行（1-based，相对整个文件，含 front matter 行） */
    line: number
    /** 链接起始位置所在列（1-based） */
    column: number
    /** 解析状态 */
    status: WorkspaceIndexLinkStatus
    /** 解析命中时的绝对路径（仅 status === 'resolved' 存在） */
    resolvedPath?: string
}

/** 工作区内的单个可索引文本文件（`.md` / `.markdown` / `.txt`） */
export interface WorkspaceIndexFile {
    /** 文件绝对路径（词法路径，基于传入的工作区根拼接） */
    path: string
    /** 相对工作区根的展示路径（统一 `/` 分隔） */
    relativePath: string
    /** 文件名（含扩展名） */
    name: string
    /** 展示标题：front matter `title` > 第一个 H1 > 去掉扩展名的文件名 */
    title: string
    /**
     * 正文纯文本摘要（可选，最多 240 个字符）：
     * 去掉 front matter、围栏代码块与 Markdown 标记后压缩空白，供 Wiki 链接悬浮预览（E10）
     * 直接展示，避免渲染层为预览再读一次文件。空正文为空串 `''`。
     */
    excerpt?: string
    /** 标签清单（front matter `tags` + 正文行内 `#tag`，按首次出现顺序、大小写不敏感去重） */
    tags: string[]
    /** 该文件内解析出的全部 Wiki 链接（按出现顺序） */
    links: WorkspaceIndexLink[]
    /** 文件字节数 */
    size: number
    /** 文件修改时间（ms，与 `fs.Stats.mtimeMs` 同源） */
    mtimeMs: number
}

/** 全库标签聚合项 */
export interface WorkspaceIndexTag {
    /** 标签展示名（取首次出现的写法，不含 `#`） */
    tag: string
    /** 包含该标签的文件数（同一文件重复出现只计一次） */
    count: number
    /** 包含该标签的文件绝对路径（与 `WorkspaceIndexFile.path` 可直接对齐） */
    files: string[]
}

/** 反向链接来源（某个文件通过 Wiki 链接指向目标路径） */
export interface WorkspaceIndexBacklink {
    /** 来源文件绝对路径 */
    sourcePath: string
    /** 来源文件相对工作区根路径（统一 `/` 分隔） */
    sourceRelativePath: string
    /** 来源文件展示标题 */
    sourceTitle: string
    /** 链接起始行（1-based） */
    line: number
    /** 链接起始列（1-based） */
    column: number
}

/**
 * 工作区内的附件引用条目（B5 附件管理 / E10 悬浮预览数据源）。
 *
 * 由 Markdown 图片 `![alt](path)` 与普通链接 `[text](path)` 中的本地相对路径聚合而来：
 * 同一附件（按绝对路径，Windows 下大小写不敏感）只出现一次，`referencedBy` 记录全部来源文件；
 * 缺失的引用同样收录（`exists === false`），便于附件面板提示并批量修复。
 */
export interface WorkspaceAttachment {
    /** 附件绝对路径（按来源文件所在目录词法解析；本服务只做存在性检查，不读取内容） */
    path: string
    /** 相对工作区根的展示路径（统一 `/` 分隔） */
    relativePath: string
    /** 磁盘上是否存在且为普通文件（`false` 表示引用缺失或指向目录） */
    exists: boolean
    /** 引用该附件的来源文件绝对路径（去重；按快照 `files` 顺序，即 relativePath 升序） */
    referencedBy: string[]
}

/**
 * 工作区索引快照（`FILE.GET_WORKSPACE_INDEX` 的 `snapshot` 载荷）。
 *
 * `generatedAt` 为构建时刻（`Date.now()`），供渲染层判断缓存新鲜度；
 * `files` 按 `relativePath` 升序排列，`tags` 按数量降序 + 标签名升序排列，
 * `missingLinks` 按文件遍历顺序（即 `files` 顺序）与链接出现顺序排列，
 * `attachments` 按 `relativePath` 升序排列（同路径再按绝对路径升序），保证快照确定性。
 */
export interface WorkspaceIndexSnapshot {
    /** 工作区根绝对路径；根非法/不存在时为空串（空快照） */
    rootPath: string
    /** 快照构建时刻（ms） */
    generatedAt: number
    /** 已索引文件清单 */
    files: WorkspaceIndexFile[]
    /** 标签聚合清单 */
    tags: WorkspaceIndexTag[]
    /** 缺失链接清单（仅 status === 'missing'；ambiguous 单独计入 stats.ambiguousCount） */
    missingLinks: Array<{
        sourcePath: string
        sourceRelativePath: string
        target: string
        line: number
        column: number
    }>
    /**
     * 附件引用聚合清单（可选；空工作区/无引用时为空数组）。
     * 缺失附件也在此列出（`exists === false`），并计入 `stats.missingAttachmentCount`。
     */
    attachments?: WorkspaceAttachment[]
    /** 统计汇总 */
    stats: {
        fileCount: number
        linkCount: number
        missingCount: number
        ambiguousCount: number
        /** 去重后的附件引用总数（可选；等于 `attachments.length`，含缺失附件） */
        attachmentCount?: number
        /** 缺失附件数（可选；等于 `attachments` 中 `exists === false` 的条目数） */
        missingAttachmentCount?: number
    }
}

/** `findLinkIssues()` 的展示结构：缺失 + 歧义链接合并清单 */
export interface WorkspaceIndexLinkIssue {
    /** 来源文件绝对路径 */
    sourcePath: string
    /** 来源文件相对工作区根路径（统一 `/` 分隔） */
    sourceRelativePath: string
    /** 链接目标（归一化后） */
    target: string
    /** 链接起始行（1-based） */
    line: number
    /** 链接起始列（1-based） */
    column: number
    /** 问题类型：missing=目标不存在；ambiguous=目标不唯一 */
    status: 'missing' | 'ambiguous'
}
