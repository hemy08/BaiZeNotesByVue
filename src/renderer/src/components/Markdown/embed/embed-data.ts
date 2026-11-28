/**
 * 1.5.7 LLM Wiki L4（T4.2）：嵌入 UI 纯逻辑（无 Vue / DOM / IPC 依赖）。
 *
 * ## 职责
 * - {@link parseWorkspaceFileTree}：把主进程目录树 IPC 载荷（`FILE_MANAGER.FILE_SYSTEM_DATA`
 *   的 JSON 字符串）解析为「工作区 `raw/` 下可嵌入文件清单」；
 * - {@link buildEmbedMarkdownLink}：为选中的 `raw/` 文件生成标准 Markdown 引用
 *   `[资料标题](相对路径)`——相对路径基于「当前活动文件所在目录」计算（wiki/ 页面 →
 *   `../raw/xxx.md`），与项目既有预览管线（`preview-local-render` 的相对文件 URL 转换 +
 *   DOMPurify 白名单 + 预览点击打开 `.md` 链路）兼容；
 * - 文件类型分类（文本可预览 / 图片可缩略 / 其他仅引用）与路径编码。
 *
 * ## 为什么用目录树 IPC 而不是工作区索引
 * L1/T1.2 起 `raw/` 被工作区索引与全工作区搜索排除（原始资料不参与知识库索引），
 * 因此 `FILE.GET_WORKSPACE_INDEX` 无法列出 raw/ 内容；本模块复用既有目录树数据
 * （主进程 `FILE_MANAGER.FILE_SYSTEM_DATA` 事件，由 `FILE_MANAGER.RELOAD_FROM_DISK`
 * 触发刷新）——不新增 IPC、不直接读文件系统。
 *
 * ## 边界
 * - 纯函数、只处理字符串/路径词法，不 stat、不读文件；
 * - 目录树只包含主进程白名单扩展名（`.md/.markdown/.txt/.png/.jpg/.jpeg/.svg/.pdf/.html`），
 *   清单上限由主进程扫描决定，本模块不再额外截断；
 * - 路径比较统一 `/` 分隔；Windows 盘符大小写不敏感。
 */
import { LLM_WIKI_RAW_DIR_NAME } from '../../../../../shared/constants/workspace-mode'
import { TREE_IMAGE_EXTENSIONS } from '../../../../../shared/constants/file-extensions'
import type { FileItem } from '../../../../../shared/types'

/** 可在对话框内直接只读预览正文的文本扩展名（经既有 `FILE.READ_HTML` 文本通道读取） */
export const EMBED_TEXT_EXTENSIONS: readonly string[] = ['.md', '.markdown', '.txt']

/** 可在对话框内以缩略图预览的图片扩展名（与目录树图片白名单同源） */
export const EMBED_IMAGE_EXTENSIONS: readonly string[] = TREE_IMAGE_EXTENSIONS

/** 正文预览最大字符数（超出截断并提示；README 等长文本不至于拖慢对话框） */
export const EMBED_PREVIEW_MAX_CHARS = 20000

/** 嵌入文件类型：文本可预览 / 图片可缩略 / 其他仅支持插入引用 */
export type EmbedFileKind = 'text' | 'image' | 'other'

/** `raw/` 下可嵌入文件条目 */
export interface EmbedFileEntry {
    /** 文件绝对路径（插入时计算相对路径；图片预览经 app://local 协议加载） */
    path: string
    /** 相对工作区根的展示路径（`raw/...`，统一 `/` 分隔） */
    relativePath: string
    /** 文件名（含扩展名） */
    name: string
    /** 小写扩展名（含点；无扩展名时为空串） */
    extension: string
    /** 文件类型（决定预览方式） */
    kind: EmbedFileKind
}

/** 目录树解析结果：成功（raw/ 可能不存在）或失败 */
export type EmbedRawScanResult =
    | {
          ok: true
          /** 工作区根绝对路径（目录树根节点） */
          rootPath: string
          /** `raw/` 目录绝对路径；null = 工作区尚未初始化 raw/ */
          rawRootPath: string | null
          /** raw/ 下可嵌入文件（已按 relativePath 升序） */
          files: EmbedFileEntry[]
      }
    | {
          ok: false
          /** 目录树载荷非法 / 尚未打开工作区 */
          code: 'INVALID_TREE' | 'NO_WORKSPACE'
      }

/** Markdown 引用生成结果：成功（markdown 可插入）或失败原因 */
export type EmbedMarkdownLinkResult =
    | {
          ok: true
          /** 可直接插入编辑器的 Markdown 引用 */
          markdown: string
          /** 计算出的相对路径（未编码前的展示形式） */
          relativePath: string
      }
    | {
          ok: false
          /** NO_ACTIVE_FILE=没有活动文件；DIFFERENT_DRIVE=不同磁盘无法构造相对路径 */
          code: 'NO_ACTIVE_FILE' | 'DIFFERENT_DRIVE'
      }

/** 取路径最后一段（文件名） */
function getBaseName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const index = normalized.lastIndexOf('/')
    return index >= 0 ? normalized.slice(index + 1) : normalized
}

/** 取小写扩展名（含点；无扩展名返回空串） */
function getLowerExtension(fileName: string): string {
    const index = fileName.lastIndexOf('.')
    if (index <= 0 || index === fileName.length - 1) {
        return ''
    }
    return fileName.slice(index).toLowerCase()
}

/** 去掉扩展名的文件名（插入标题用；无扩展名原样返回） */
export function getEmbedTitle(fileName: string): string {
    const index = fileName.lastIndexOf('.')
    return index > 0 ? fileName.slice(0, index) : fileName
}

/**
 * 文件类型分类：文本（可预览正文）/ 图片（可缩略）/ 其他（仅插入引用）。
 *
 * @param fileName 文件名或小写扩展名（含点）
 */
export function classifyEmbedFile(fileName: string): EmbedFileKind {
    const extension = fileName.includes('.') ? getLowerExtension(fileName) : fileName.toLowerCase()
    if (EMBED_TEXT_EXTENSIONS.includes(extension)) {
        return 'text'
    }
    if (EMBED_IMAGE_EXTENSIONS.includes(extension)) {
        return 'image'
    }
    return 'other'
}

/**
 * 计算 targetPath 相对 rootPath 的工作区相对路径（统一 `/` 分隔）。
 *
 * 前缀比较大小写不敏感（Windows 盘符/目录名大小写不敏感），但输出保留 target 原大小写；
 * target 不在 root 下时退化为「去掉前导分隔符的原始路径」（防御异常目录树）。
 */
export function relativePathFrom(rootPath: string, targetPath: string): string {
    const root = rootPath.replace(/\\/g, '/').replace(/\/+$/, '')
    const target = targetPath.replace(/\\/g, '/')
    if (root.length === 0) {
        return target.replace(/^\/+/, '')
    }
    const rootLower = root.toLowerCase()
    const targetLower = target.toLowerCase()
    if (targetLower === rootLower) {
        return ''
    }
    if (targetLower.startsWith(`${rootLower}/`)) {
        return target.slice(root.length + 1)
    }
    return target.replace(/^\/+/, '')
}

/** 类型守卫：目录树节点是否为合法对象 */
function isFileItemLike(value: unknown): value is FileItem {
    if (!value || typeof value !== 'object') {
        return false
    }
    const record = value as Record<string, unknown>
    return typeof record.path === 'string' && typeof record.name === 'string'
}

/** 递归收集 `raw/` 子树下的文件（只取文件节点；不再额外过滤扩展名，主进程已白名单） */
function collectRawFiles(node: FileItem, rootPath: string, out: EmbedFileEntry[]): void {
    const children = Array.isArray(node.children) ? node.children : []
    for (const child of children) {
        if (!isFileItemLike(child)) {
            continue
        }
        if (child.isDirectory === true || child.type === 'folder') {
            collectRawFiles(child, rootPath, out)
            continue
        }
        const name = child.name
        const extension = getLowerExtension(name)
        out.push({
            path: child.path,
            relativePath: relativePathFrom(rootPath, child.path),
            name,
            extension,
            kind: classifyEmbedFile(name)
        })
    }
}

/**
 * 解析主进程目录树 JSON，得到工作区 `raw/` 下可嵌入文件清单。
 *
 * 目录树结构：根节点为工作区目录（`FileItem[]` 长度 1），`raw/` 为根的直接子目录
 * （LLM Wiki 约定的工作区布局）。`raw/` 不存在时返回 `rawRootPath: null`（UI 展示空态引导）。
 *
 * @param fileTreeJson `FILE_MANAGER.FILE_SYSTEM_DATA` 载荷（主进程 `JSON.stringify` 的整树）
 * @returns 扫描结果（不抛异常；非法载荷返回 `INVALID_TREE`）
 */
export function parseWorkspaceFileTree(fileTreeJson: unknown): EmbedRawScanResult {
    if (typeof fileTreeJson !== 'string' || fileTreeJson.trim().length === 0) {
        return { ok: false, code: 'INVALID_TREE' }
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(fileTreeJson)
    } catch {
        return { ok: false, code: 'INVALID_TREE' }
    }
    if (!Array.isArray(parsed) || parsed.length === 0) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    const root = parsed[0]
    if (!isFileItemLike(root)) {
        return { ok: false, code: 'INVALID_TREE' }
    }
    const rootPath = root.path
    const rootChildren = Array.isArray(root.children) ? root.children : []
    const rawFolder = rootChildren.find(
        (child) =>
            isFileItemLike(child) &&
            (child.isDirectory === true || child.type === 'folder') &&
            child.name.toLowerCase() === LLM_WIKI_RAW_DIR_NAME.toLowerCase()
    )
    if (!rawFolder) {
        return { ok: true, rootPath, rawRootPath: null, files: [] }
    }
    const files: EmbedFileEntry[] = []
    collectRawFiles(rawFolder, rootPath, files)
    files.sort((left, right) => {
        const relativeCompare = left.relativePath.localeCompare(right.relativePath)
        if (relativeCompare !== 0) {
            return relativeCompare
        }
        return left.path.localeCompare(right.path)
    })
    return { ok: true, rootPath, rawRootPath: rawFolder.path, files }
}

/**
 * 计算从「当前活动文件」到目标文件的 Markdown 相对路径（含百分号编码）。
 *
 * 例：活动文件 `E:/ws/wiki/a.md`、目标 `E:/ws/raw/x.md` → `../raw/x.md`。
 * 使用标准 Markdown 相对链接而非 `[[wiki 链接]]`：`raw/` 不在工作区索引内
 * （T1.2 排除），`[[...]]` 会被解析为缺失链接；而相对链接由既有预览管线转换为可点击
 * 本地 URL，并复用预览内 `.md` 链接的既有打开链路。
 *
 * @param fromFilePath 当前活动文件绝对路径（空串 = 未打开文件）
 * @param targetPath 目标文件绝对路径
 * @returns 编码后的相对路径；无法构造时返回 null
 */
export function toRelativeMarkdownPath(fromFilePath: string, targetPath: string): string | null {
    if (fromFilePath.trim().length === 0 || targetPath.trim().length === 0) {
        return null
    }
    const from = fromFilePath.replace(/\\/g, '/').replace(/\/+$/, '')
    const target = targetPath.replace(/\\/g, '/').replace(/\/+$/, '')
    const fromSegments = from.split('/')
    const targetSegments = target.split('/')
    // 盘符不同（Windows 跨磁盘）无法构造相对路径；POSIX 首段为空串，同样参与比较
    const fromDrive = fromSegments[0].toLowerCase()
    const targetDrive = targetSegments[0].toLowerCase()
    if (fromDrive !== targetDrive) {
        return null
    }
    // 活动文件所在目录参与公共前缀计算（文件名本身不参与）
    const fromDirSegments = fromSegments.slice(0, -1)
    let common = 0
    while (
        common < fromDirSegments.length &&
        common < targetSegments.length - 1 &&
        fromDirSegments[common].toLowerCase() === targetSegments[common].toLowerCase()
    ) {
        common += 1
    }
    const upSegments: string[] = []
    for (let index = common; index < fromDirSegments.length; index += 1) {
        upSegments.push('..')
    }
    const downSegments = targetSegments.slice(common)
    const parts = [...upSegments, ...downSegments]
    if (parts.length === 0 || parts.every((part) => part.length === 0)) {
        return null
    }
    return encodeMarkdownPath(parts.join('/'))
}

/**
 * Markdown 链接路径编码：保留 `/` 与中文等可读字符，只转义会破坏链接目标的部分。
 *
 * - 空格 / `#` / `?` 会被 markdown-it 当作分隔符或片段/查询串截断，必须转义；
 * - `(` `)` 会破坏 `[text](url)` 结构，`<` `>` 会被当作目标定界符，一并转义；
 * - 已有 `%` 先转义为 `%25`，避免与转义序列混淆（本模块生成路径均为未编码原文）。
 *
 * 不做整段 `encodeURI`：中文/韩文等文件名保持可读，编辑器内源文档更易读。
 */
export function encodeMarkdownPath(relativePath: string): string {
    return relativePath
        .replace(/%/g, '%25')
        .replace(/ /g, '%20')
        .replace(/#/g, '%23')
        .replace(/\?/g, '%3F')
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/</g, '%3C')
        .replace(/>/g, '%3E')
        .replace(/\[/g, '%5B')
        .replace(/\]/g, '%5D')
}

/** 转义 Markdown 链接文本中的方括号/反斜杠（避免破坏 `[text](url)` 结构） */
export function escapeMarkdownLinkText(text: string): string {
    return text.replace(/[\\[\]]/g, '').trim()
}

/**
 * 为选中文件生成可插入编辑器的 Markdown 引用。
 *
 * 形式：`[资料标题](相对路径)`（标题取文件名去扩展名；方括号/反斜杠已清洗）。
 * 相对路径基于当前活动文件目录计算；无活动文件或跨磁盘时返回结构化失败，
 * 由对话框给出「请先打开 wiki/ 页面」等引导文案。
 *
 * @param file 选中的 raw/ 文件
 * @param activeFilePath 当前活动文件绝对路径
 */
export function buildEmbedMarkdownLink(
    file: EmbedFileEntry,
    activeFilePath: string
): EmbedMarkdownLinkResult {
    if (activeFilePath.trim().length === 0) {
        return { ok: false, code: 'NO_ACTIVE_FILE' }
    }
    const encodedRelativePath = toRelativeMarkdownPath(activeFilePath, file.path)
    if (encodedRelativePath === null) {
        return { ok: false, code: 'DIFFERENT_DRIVE' }
    }
    const title = escapeMarkdownLinkText(getEmbedTitle(file.name))
    const displayTitle = title.length > 0 ? title : escapeMarkdownLinkText(file.name)
    return {
        ok: true,
        markdown: `[${displayTitle}](${encodedRelativePath})`,
        relativePath: decodeMarkdownPath(encodedRelativePath)
    }
}

/** Markdown 链接路径解码（展示用；非法百分号序列原样保留） */
export function decodeMarkdownPath(encodedPath: string): string {
    return encodedPath
        .split('/')
        .map((segment) => {
            try {
                return decodeURIComponent(segment)
            } catch {
                return segment
            }
        })
        .join('/')
}

/** 统计清单中某类型文件数量（对话框汇总文案用；纯函数，便于单测） */
export function countEmbedFilesByKind(
    files: readonly EmbedFileEntry[],
    kind: EmbedFileKind
): number {
    return files.reduce((total, file) => (file.kind === kind ? total + 1 : total), 0)
}

/** 便捷：取文件清单中第一个可预览文件（对话框打开时默认选中；无则 null） */
export function findFirstEmbedFile(files: readonly EmbedFileEntry[]): EmbedFileEntry | null {
    return files.length > 0 ? files[0] : null
}

/** 内部工具导出（组件/单测复用）：取路径最后一段 */
export { getBaseName }
