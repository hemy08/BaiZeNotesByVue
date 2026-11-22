/**
 * E10 Wiki 链接悬浮预览（Monaco HoverProvider，1.5.1）
 *
 * ## 职责
 * 编辑器光标悬停在 `[[target]]` / `[[target|alias]]` / `[[target#heading]]` 上时，
 * 基于**工作区索引快照**展示目标笔记的悬浮卡片：
 * - 目标标题（front matter title > 第一个 H1 > 文件名，快照已计算好 `title`）；
 * - 相对工作区根的展示路径（`relativePath`）；
 * - 正文摘要 `excerpt`（task-12 / B5 在快照中新增的可选字段，缺失时整行省略）；
 * - 反向链接数量（基于快照内全部 `links[].resolvedPath` 反查，0 时省略）。
 *
 * ## 数据与边界
 * - 数据源只经注入的 `loadIndex`（生产默认动态 import
 *   `composables/useWorkspaceIndex.getWorkspaceIndex()`，复用既有
 *   `FILE.GET_WORKSPACE_INDEX` 通道，**不新增 IPC**）；
 * - 快照不可用（未打开工作区 / 索引失败 / 无 IPC）时 provider 返回 null，
 *   不弹错、不抛异常、不刷控制台；
 * - 本模块不依赖 monaco 运行时与 Vue/DOM：Monaco 只以最小结构接口注入，
 *   纯函数可单测；组件侧在 Monaco 就绪后动态 import 本模块，不进入首屏静态闭包；
 * - 解析口径与主进程 `src/main/utils/workspace-index.ts` 的链接解析阶段（① 工作区根相对、
 *   ② 相对源文件目录、③ 全库 basename/title 唯一匹配）保持一致；快照里已有同位置
 *   链接记录时直接复用其解析结果，避免编辑器内容与快照短暂不一致时误判。
 *
 * ## 已知限制
 * - HoverProvider 按语言（`markdown`）注册，属 Monaco 全局注册表；本模块按编辑器实例
 *   维护注册句柄，重复注册同名编辑器返回同一句柄（释放幂等）。多编辑器实例场景下
 *   每个实例各注册一次（当前应用只有一个主编辑器，属既定使用边界）；
 * - 首次悬停才触发索引拉取（避免未使用功能时触发全库索引扫描）；索引较慢时本次悬停
 *   等待 IPC 返回后展示，失败则返回 null 并在失败 TTL 内不重试；
 * - 摘要在快照中已是纯文本（task-12 口径）；本模块再压缩空白并按 Unicode 码点截断到
 *   240，避免半截代理对；
 * - 不解析 `![[embed]]` 嵌入语义与 heading 锚点跳转，heading 仅在解析结果中保留。
 */
import { translate } from '../../../../shared/i18n'
import type { WorkspaceIndexResult } from '../../../../shared/types/ipc'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexLink,
    WorkspaceIndexLinkStatus,
    WorkspaceIndexSnapshot
} from '../../../../shared/types/workspace-index'
import {
    getExtension,
    normalizePathForCompare,
    normalizeSlashes
} from '../../../../shared/utils/path'
import { logger } from '../../common/logger'

/* ============================ 常量 ============================ */

/** HoverProvider 注册的语言选择器（本功能只服务 Markdown 模型） */
export const WIKI_LINK_HOVER_LANGUAGE_SELECTOR = 'markdown'

/** 悬浮摘要最大字符数（与 task-12 快照摘要口径一致，按 Unicode 码点计） */
export const WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH = 240

/** 快照缓存有效期（ms）：悬停高频触发，避免每次悬停都走一次 IPC */
export const WIKI_LINK_HOVER_DEFAULT_SNAPSHOT_TTL_MS = 30_000

/** 加载失败后的重试冷却（ms）：失败期间重复悬停不反复打 IPC */
export const WIKI_LINK_HOVER_DEFAULT_FAILURE_TTL_MS = 5_000

/**
 * 可索引文本扩展名（**不含点**、小写）。
 *
 * 真源为主进程 `WORKSPACE_INDEX_EXTENSIONS`（渲染层禁止 import `src/main/**`，故按
 * 「纯数据镜像」本地声明；两处口径由各自单测守护，修改时需同步）。
 */
const WIKI_LINK_TEXT_EXTENSIONS: readonly string[] = ['md', 'markdown', 'txt']

/** Wiki 链接：`[[...]]`（单行内匹配，原文含方括号；与主进程同一模式） */
const WIKI_LINK_PATTERN = /\[\[([^[\]\r\n]+)\]\]/g

/** 盘符 / UNC 开头的目标不属于工作区 Wiki 链接（与主进程同口径，防把系统路径当笔记） */
const WINDOWS_ABSOLUTE_TARGET_PATTERN = /^[A-Za-z]:/

/* ============================ 类型 ============================ */

/** 悬停位置命中的 Wiki 链接解析结果（纯文本解析，未接快照） */
export interface WikiLinkAtPosition {
    /** 归一化后的目标（去掉别名与 `#heading`，保留作者写法大小写） */
    target: string
    /** 别名（`|` 之后的内容；无别名为空串） */
    alias: string
    /** 标题锚点（`#` 之后的内容；无锚点为空串） */
    heading: string
    /** 链接原文（含 `[[` `]]`） */
    raw: string
    /** 起始列（1-based，`[[` 第一个字符） */
    startColumn: number
    /** 结束列（1-based，exclusive，即 `]]` 之后一列） */
    endColumn: number
}

/** 链接目标解析结果（与主进程 `LinkResolution` 同构） */
export type WikiLinkTargetResolution =
    | { status: 'resolved'; file: WorkspaceIndexFile }
    | { status: 'missing' }
    | { status: 'ambiguous' }

/** 单次悬停的展示信息（未格式化的结构化数据，便于单测与后续换 UI 形态） */
export interface WikiLinkHoverInfo {
    /** 解析状态：resolved=唯一命中；missing=目标不存在；ambiguous=目标不唯一 */
    status: WorkspaceIndexLinkStatus
    /** 归一化目标 */
    target: string
    /** 链接原文（含方括号） */
    raw: string
    /** 别名（可空串） */
    alias: string
    /** 标题锚点（可空串） */
    heading: string
    /** 悬停所在行（1-based） */
    line: number
    /** 悬停所在列（1-based） */
    column: number
    /** 目标展示标题（仅 resolved；front matter title > 第一个 H1 > 文件名） */
    title?: string
    /** 目标相对工作区根的展示路径（仅 resolved） */
    relativePath?: string
    /** 目标正文摘要（仅 resolved 且快照提供 excerpt 且非空） */
    excerpt?: string
    /** 指向目标的反向链接数量（仅 resolved；可为 0） */
    backlinkCount?: number
}

/** 构建悬停信息时的可选参数 */
export interface WikiLinkHoverBuildOptions {
    /** 摘要最大字符数（默认 {@link WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH}） */
    excerptMaxLength?: number
}

/** 悬停文案（全部经注入，默认从既有 i18n 词条取值，禁止在本模块写死用户可见文案） */
export interface WikiLinkHoverLabels {
    /** 目标不存在（缺失）状态文案 */
    missing: string
    /** 目标不唯一（歧义）状态文案 */
    ambiguous: string
    /** 反向链接数量模板（入参为数量，返回完整文案） */
    backlinks: (count: number) => string
}

/** 文案来源：对象、或返回对象的工厂（工厂在每次悬停时求值，语言切换即时生效） */
export type WikiLinkHoverLabelsSource =
    Partial<WikiLinkHoverLabels> | (() => Partial<WikiLinkHoverLabels> | undefined)

/** `registerWikiLinkHover()` 的可选配置 */
export interface WikiLinkHoverOptions {
    /** 索引加载器（默认动态 import `getWorkspaceIndex`；单测注入替身） */
    loadIndex?: () => Promise<WorkspaceIndexResult>
    /** 悬停文案（默认取既有 i18n 词条） */
    labels?: WikiLinkHoverLabelsSource
    /** 当前文件路径兜底（模型 URI 非 file 协议时使用） */
    getSourcePath?: () => string
    /** 快照缓存有效期（ms；默认 30000，0 = 每次悬停都重新拉取） */
    snapshotTtlMs?: number
    /** 失败重试冷却（ms；默认 5000） */
    failureTtlMs?: number
    /** 摘要最大字符数（默认 240） */
    excerptMaxLength?: number
}

/** 注册句柄（dispose 幂等；isRegistered 便于组件/测试判断是否已真正注册） */
export interface WikiLinkHoverHandle {
    readonly isRegistered: boolean
    dispose(): void
}

/* ------------------- Monaco 最小结构接口（不 import monaco 运行时/类型） ------------------- */

/** Monaco 位置（1-based） */
export interface WikiLinkHoverPositionLike {
    lineNumber: number
    column: number
}

/** Monaco 范围（1-based，end 为 exclusive 语义由调用方约定） */
export interface WikiLinkHoverRangeLike {
    startLineNumber: number
    startColumn: number
    endLineNumber: number
    endColumn: number
}

/** Monaco 文本模型最小结构（provider 只读行文本与 URI） */
export interface WikiLinkHoverModelLike {
    uri: { scheme: string; path: string; authority?: string }
    getLanguageId(): string
    getLineContent(lineNumber: number): string
}

/** Monaco 编辑器最小结构（用于模型 URI 不可用时的路径兜底） */
export interface WikiLinkHoverEditorLike {
    getModel(): WikiLinkHoverModelLike | null
}

/** Monaco Hover 的 Markdown 内容项 */
export interface WikiLinkHoverMarkdownLike {
    value: string
    supportThemeIcons?: boolean
}

/** Monaco Hover 结果 */
export interface WikiLinkHoverResultLike {
    range: WikiLinkHoverRangeLike
    contents: WikiLinkHoverMarkdownLike[]
}

/** Monaco HoverProvider 最小结构（真实 provider 的结构兼容子集） */
export interface WikiLinkHoverProviderLike {
    provideHover(
        model: WikiLinkHoverModelLike,
        position: WikiLinkHoverPositionLike
    ): Promise<WikiLinkHoverResultLike | null>
}

/** Monaco API 最小结构（真实 `monaco` 实例结构兼容子集） */
export interface WikiLinkHoverMonacoLike {
    languages: {
        /**
         * 注册入口的参数按 `never` 声明：本模块在运行时把自己的 provider 交给真实
         * Monaco，但不在此重复声明 Monaco 的 `HoverProvider` 类型（其返回
         * `Hover | Thenable<Hover>`，与「允许返回 null」的内部最小结构存在方向性
         * 差异）。这样真实 `monaco.languages.registerHoverProvider` 在严格方差下
         * 也满足本接口，组件侧无需任何类型断言。
         */
        registerHoverProvider(languageSelector: string, provider: never): { dispose(): void }
    }
    Range: new (
        startLineNumber: number,
        startColumn: number,
        endLineNumber: number,
        endColumn: number
    ) => WikiLinkHoverRangeLike
}

/* ============================ 内部缓存类型 ============================ */

/** 全库查找表（键统一小写；值为同键文件列表，长度 > 1 即歧义候选） */
interface FileLookup {
    byRelativePath: Map<string, WorkspaceIndexFile[]>
    byBasename: Map<string, WorkspaceIndexFile[]>
    byTitle: Map<string, WorkspaceIndexFile[]>
}

/** 悬停输入（纯函数入参，便于单测） */
export interface WikiLinkHoverContext {
    /** 工作区索引快照（null = 不可用，直接返回 null） */
    snapshot: WorkspaceIndexSnapshot | null
    /** 当前文件绝对路径（可为空串，如未保存的临时文档） */
    sourcePath: string
    /** 悬停所在行（1-based） */
    lineNumber: number
    /** 悬停所在列（1-based） */
    column: number
    /** 悬停所在行的文本 */
    lineText: string
}

/* ============================ 纯函数：链接定位 ============================ */

/** 路径比较键：统一分隔符 + 小写（与 `useWorkspaceIndex.normalizeIndexPath` 同口径） */
function toPathKey(filePath: string): string {
    return normalizeSlashes(String(filePath ?? '')).toLowerCase()
}

/**
 * 在单行文本中定位指定列命中的 Wiki 链接。
 *
 * 列语义与 Monaco 一致：字符下标 i 对应列 i + 1；返回的 `endColumn` 为 exclusive
 * （`startColumn + raw.length`），即列落在 `[startColumn, endColumn)` 才命中。
 * 空目标（如 `[[#heading]]` / `[[|alias]]`）与主进程一致视为不可解析链接，返回 null。
 *
 * @param lineText 单行文本
 * @param column 1-based 列
 * @returns 命中的链接；未命中返回 null
 */
export function parseWikiLinkAt(lineText: string, column: number): WikiLinkAtPosition | null {
    if (typeof lineText !== 'string' || lineText.length === 0) {
        return null
    }
    if (typeof column !== 'number' || !Number.isFinite(column) || column < 1) {
        return null
    }
    WIKI_LINK_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKI_LINK_PATTERN.exec(lineText)) !== null) {
        const startColumn = match.index + 1
        const raw = match[0]
        const endColumn = startColumn + raw.length
        if (column < startColumn || column >= endColumn) {
            continue
        }
        const inner = match[1]
        const pipeIndex = inner.indexOf('|')
        // 别名只影响展示：target 取 `|` 之前的内容
        const targetSection = pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner
        const alias = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : ''
        // heading 只影响跳转锚点：target 取 `#` 之前的内容
        const hashIndex = targetSection.indexOf('#')
        const target = (hashIndex >= 0 ? targetSection.slice(0, hashIndex) : targetSection).trim()
        const heading = hashIndex >= 0 ? targetSection.slice(hashIndex + 1).trim() : ''
        if (target.length === 0) {
            return null
        }
        return { target, alias, heading, raw, startColumn, endColumn }
    }
    return null
}

/* ============================ 纯函数：目标解析（与主进程同口径） ============================ */

/** 取去掉扩展名的文件名（无扩展名原样返回） */
function getFileStem(fileName: string): string {
    const extension = getExtension(fileName)
    return extension.length === 0
        ? fileName
        : fileName.slice(0, fileName.length - extension.length - 1)
}

/** 取相对路径的父目录（根目录文件返回空串） */
function getParentRelativePath(relativePath: string): string {
    const slashIndex = relativePath.lastIndexOf('/')
    return slashIndex <= 0 ? '' : relativePath.slice(0, slashIndex)
}

/** 向查找表追加文件（同键多个即为候选歧义） */
function appendLookup(
    lookupMap: Map<string, WorkspaceIndexFile[]>,
    key: string,
    file: WorkspaceIndexFile
): void {
    const existing = lookupMap.get(key)
    if (existing === undefined) {
        lookupMap.set(key, [file])
        return
    }
    existing.push(file)
}

/** 构建全库查找表（键统一小写：链接解析大小写不敏感） */
function createFileLookup(files: readonly WorkspaceIndexFile[]): FileLookup {
    const lookup: FileLookup = {
        byRelativePath: new Map(),
        byBasename: new Map(),
        byTitle: new Map()
    }
    for (const file of files) {
        appendLookup(lookup.byRelativePath, toPathKey(file.relativePath), file)
        appendLookup(lookup.byBasename, getFileStem(file.name).toLowerCase(), file)
        if (typeof file.title === 'string' && file.title.length > 0) {
            appendLookup(lookup.byTitle, file.title.toLowerCase(), file)
        }
    }
    return lookup
}

/** 快照 → 查找表缓存（同一快照只构建一次；快照对象来自 IPC，可用 WeakMap 键控） */
const fileLookupCache = new WeakMap<WorkspaceIndexSnapshot, FileLookup>()

/** 取快照对应的查找表（带缓存） */
function getFileLookup(snapshot: WorkspaceIndexSnapshot): FileLookup {
    const cached = fileLookupCache.get(snapshot)
    if (cached !== undefined) {
        return cached
    }
    const lookup = createFileLookup(snapshot.files)
    fileLookupCache.set(snapshot, lookup)
    return lookup
}

/**
 * 在快照中按绝对路径查找文件（分隔符归一化 + 小写比较，对齐 `normalizeIndexPath`）。
 *
 * @returns 命中文件；快照不可用 / 路径为空 / 未命中返回 null
 */
export function findSnapshotFile(
    snapshot: WorkspaceIndexSnapshot | null,
    filePath: string
): WorkspaceIndexFile | null {
    if (!snapshot || !Array.isArray(snapshot.files) || typeof filePath !== 'string') {
        return null
    }
    if (filePath.length === 0) {
        return null
    }
    const key = toPathKey(filePath)
    return snapshot.files.find((file) => toPathKey(file.path) === key) ?? null
}

/**
 * 在快照中查找与「当前行文本里的链接」对应的链接记录。
 *
 * 优先按「同 raw + 同位置（行号且列落在链接范围内）」匹配；快照行号可能因用户编辑
 * 短暂漂移，故回退到「同 raw 且全文件唯一」的记录。找不到返回 null，由调用方按
 * target 重新解析（不因快照滞后而错误展示）。
 */
export function findWikiLinkInSnapshot(
    snapshot: WorkspaceIndexSnapshot | null,
    sourcePath: string,
    lineNumber: number,
    column: number,
    raw: string
): WorkspaceIndexLink | null {
    const sourceFile = findSnapshotFile(snapshot, sourcePath)
    if (!sourceFile || !Array.isArray(sourceFile.links)) {
        return null
    }
    for (const link of sourceFile.links) {
        if (link.raw !== raw) {
            continue
        }
        if (
            link.line === lineNumber &&
            column >= link.column &&
            column < link.column + link.raw.length
        ) {
            return link
        }
    }
    const sameRaw = sourceFile.links.filter((link) => link.raw === raw)
    return sameRaw.length === 1 ? sameRaw[0] : null
}

/** 归一化链接目标为工作区相对路径（拒绝绝对路径 / NUL / 越出根目录的 `..`） */
function normalizeRelativePath(input: string): string | null {
    const cleaned = input.trim().replace(/^\.\/+/, '')
    if (cleaned.length === 0 || cleaned.includes('\u0000') || cleaned.startsWith('/')) {
        return null
    }
    const normalized = normalizePathForCompare(cleaned, false)
    if (
        normalized.length === 0 ||
        normalized === '.' ||
        normalized === '..' ||
        normalized.startsWith('../')
    ) {
        return null
    }
    return normalized
}

/** 阶段①/②：按工作区根相对路径解析（无扩展名时依次补 `.md`→`.markdown`→`.txt`） */
function resolveByRelativePath(
    candidatePath: string,
    lookup: FileLookup
): WikiLinkTargetResolution {
    const normalized = normalizeRelativePath(candidatePath)
    if (normalized === null) {
        return { status: 'missing' }
    }
    const candidateKeys = [normalized]
    const extension = getExtension(normalized)
    if (!WIKI_LINK_TEXT_EXTENSIONS.includes(extension)) {
        for (const extensionCandidate of WIKI_LINK_TEXT_EXTENSIONS) {
            candidateKeys.push(`${normalized}.${extensionCandidate}`)
        }
    }
    for (const key of candidateKeys) {
        const matches = lookup.byRelativePath.get(key.toLowerCase())
        if (matches === undefined) {
            continue
        }
        if (matches.length === 1) {
            return { status: 'resolved', file: matches[0] }
        }
        return { status: 'ambiguous' }
    }
    return { status: 'missing' }
}

/** 阶段③：全库 basename / title 唯一匹配（同一目标的多候选视为歧义） */
function resolveByBasenameOrTitle(rawTarget: string, lookup: FileLookup): WikiLinkTargetResolution {
    const trimmed = rawTarget.trim()
    const segments = trimmed.split('/')
    const lastSegment = segments[segments.length - 1] ?? ''
    const basenameMatches = lookup.byBasename.get(getFileStem(lastSegment).toLowerCase()) ?? []
    const titleMatches = new Set<WorkspaceIndexFile>()
    for (const key of [trimmed.toLowerCase(), lastSegment.toLowerCase()]) {
        for (const file of lookup.byTitle.get(key) ?? []) {
            titleMatches.add(file)
        }
    }
    if (basenameMatches.length === 1) {
        return { status: 'resolved', file: basenameMatches[0] }
    }
    if (titleMatches.size === 1) {
        return { status: 'resolved', file: [...titleMatches][0] }
    }
    if (basenameMatches.length > 1 || titleMatches.size > 1) {
        return { status: 'ambiguous' }
    }
    return { status: 'missing' }
}

/**
 * 解析 Wiki 链接目标（与主进程阶段顺序一致）：
 * ① 工作区根相对路径 → ② 相对源文件目录 → ③ 全库 basename/title 唯一匹配。
 *
 * @param snapshot 工作区索引快照
 * @param sourcePath 当前文件绝对路径（可为空串；为空时跳过阶段②）
 * @param rawTarget 链接目标原文（未去 `#heading` 的部分）
 * @returns 解析结果；快照不可用时按 missing 处理（不抛错）
 */
export function resolveWikiLinkTarget(
    snapshot: WorkspaceIndexSnapshot | null,
    sourcePath: string,
    rawTarget: string
): WikiLinkTargetResolution {
    if (!snapshot || !Array.isArray(snapshot.files) || typeof rawTarget !== 'string') {
        return { status: 'missing' }
    }
    const target = rawTarget.trim().replace(/\\/g, '/')
    if (target.length === 0 || target.includes('\u0000')) {
        return { status: 'missing' }
    }
    // 盘符 / UNC 目标不属于工作区 Wiki 链接（防把系统路径当笔记解析）
    if (WINDOWS_ABSOLUTE_TARGET_PATTERN.test(target) || target.startsWith('//')) {
        return { status: 'missing' }
    }
    const lookup = getFileLookup(snapshot)
    if (target.startsWith('/')) {
        return resolveByRelativePath(target.replace(/^\/+/, ''), lookup)
    }
    const rootRelative = resolveByRelativePath(target, lookup)
    if (rootRelative.status !== 'missing') {
        return rootRelative
    }
    const sourceFile = findSnapshotFile(snapshot, sourcePath)
    const sourceDirectory =
        sourceFile === null ? '' : getParentRelativePath(normalizeSlashes(sourceFile.relativePath))
    if (sourceDirectory.length > 0) {
        const sibling = resolveByRelativePath(`${sourceDirectory}/${target}`, lookup)
        if (sibling.status !== 'missing') {
            return sibling
        }
    }
    return resolveByBasenameOrTitle(target, lookup)
}

/* ============================ 纯函数：摘要 / 反链 ============================ */

/** 读取快照文件的摘要（task-12 新增的可选字段，未扩展类型时安全缺失） */
function readFileExcerpt(file: WorkspaceIndexFile): string {
    const record = file as unknown as Record<string, unknown>
    return typeof record.excerpt === 'string' ? record.excerpt : ''
}

/**
 * 归一化悬浮摘要：纯文本单行、压缩空白、按 Unicode 码点截断。
 *
 * @param excerpt 快照摘要（未知类型按缺失处理）
 * @param maxLength 最大字符数（默认 240；非法值回落默认）
 * @returns 可直接展示的单行纯文本（空/非字符串返回空串）
 */
export function normalizeHoverExcerpt(
    excerpt: unknown,
    maxLength: number = WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH
): string {
    if (typeof excerpt !== 'string' || excerpt.length === 0) {
        return ''
    }
    const limit =
        typeof maxLength === 'number' && Number.isFinite(maxLength) && maxLength >= 0
            ? Math.trunc(maxLength)
            : WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH
    if (limit === 0) {
        return ''
    }
    const plain = excerpt.replace(/\s+/g, ' ').trim()
    if (plain.length === 0) {
        return ''
    }
    const codePoints = Array.from(plain)
    return codePoints.length > limit ? codePoints.slice(0, limit).join('') : plain
}

/** 反向链接计数缓存（同一快照只做一遍全量统计；避免每次悬停 O(文件×链接)） */
const backlinkCountCache = new WeakMap<WorkspaceIndexSnapshot, Map<string, number>>()

/** 取「目标路径 → 反链数量」映射（带缓存） */
function getBacklinkCountMap(snapshot: WorkspaceIndexSnapshot): Map<string, number> {
    const cached = backlinkCountCache.get(snapshot)
    if (cached !== undefined) {
        return cached
    }
    const counts = new Map<string, number>()
    for (const file of snapshot.files) {
        if (!Array.isArray(file.links)) {
            continue
        }
        for (const link of file.links) {
            if (link.status !== 'resolved' || typeof link.resolvedPath !== 'string') {
                continue
            }
            const key = toPathKey(link.resolvedPath)
            counts.set(key, (counts.get(key) ?? 0) + 1)
        }
    }
    backlinkCountCache.set(snapshot, counts)
    return counts
}

/**
 * 统计指向目标文件的反向链接数量（基于快照内全部 `links[].resolvedPath` 反查）。
 *
 * @returns 反链数量；快照不可用/路径为空返回 0
 */
export function countWikiBacklinks(
    snapshot: WorkspaceIndexSnapshot | null,
    targetPath: string
): number {
    if (!snapshot || !Array.isArray(snapshot.files) || typeof targetPath !== 'string') {
        return 0
    }
    if (targetPath.length === 0) {
        return 0
    }
    return getBacklinkCountMap(snapshot).get(toPathKey(targetPath)) ?? 0
}

/* ============================ 纯函数：悬停信息与格式化 ============================ */

/**
 * 构建单次悬停的展示信息。
 *
 * 解析优先级：
 * 1. 快照中存在同 raw + 同位置的链接记录 → 直接复用其 status/resolvedPath（避免
 *    编辑器内容与快照短暂不一致时误判）；
 * 2. 否则按当前行文本里的 target 走 {@link resolveWikiLinkTarget} 重新解析。
 *
 * @returns 悬停信息；非链接位置 / 快照不可用 / 空目标返回 null
 */
export function buildWikiLinkHoverInfo(
    context: WikiLinkHoverContext,
    options: WikiLinkHoverBuildOptions = {}
): WikiLinkHoverInfo | null {
    if (!context || typeof context.lineText !== 'string') {
        return null
    }
    const link = parseWikiLinkAt(context.lineText, context.column)
    if (!link) {
        return null
    }
    const snapshot = context.snapshot
    if (!snapshot || !Array.isArray(snapshot.files)) {
        return null
    }
    const base: WikiLinkHoverInfo = {
        status: 'missing',
        target: link.target,
        raw: link.raw,
        alias: link.alias,
        heading: link.heading,
        line: context.lineNumber,
        column: context.column
    }
    const snapshotLink = findWikiLinkInSnapshot(
        snapshot,
        context.sourcePath,
        context.lineNumber,
        context.column,
        link.raw
    )
    let status: WorkspaceIndexLinkStatus
    let targetFile: WorkspaceIndexFile | null = null
    if (snapshotLink !== null) {
        status = snapshotLink.status
        if (status === 'resolved' && typeof snapshotLink.resolvedPath === 'string') {
            targetFile = findSnapshotFile(snapshot, snapshotLink.resolvedPath)
        }
    } else {
        const resolution = resolveWikiLinkTarget(snapshot, context.sourcePath, link.target)
        status = resolution.status
        targetFile = resolution.status === 'resolved' ? resolution.file : null
    }
    // 快照记录命中但目标文件已不在文件清单（极端不一致）：回退按 target 再解析一次
    if (status === 'resolved' && targetFile === null) {
        const fallback = resolveWikiLinkTarget(snapshot, context.sourcePath, link.target)
        status = fallback.status
        targetFile = fallback.status === 'resolved' ? fallback.file : null
    }
    base.status = status
    if (status !== 'resolved' || targetFile === null) {
        return base
    }
    const excerptMaxLength =
        typeof options.excerptMaxLength === 'number' &&
        Number.isFinite(options.excerptMaxLength) &&
        options.excerptMaxLength >= 1
            ? Math.trunc(options.excerptMaxLength)
            : WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH
    const excerpt = normalizeHoverExcerpt(readFileExcerpt(targetFile), excerptMaxLength)
    return {
        ...base,
        title:
            typeof targetFile.title === 'string' && targetFile.title.length > 0
                ? targetFile.title
                : targetFile.name || targetFile.relativePath,
        relativePath: normalizeSlashes(targetFile.relativePath),
        excerpt: excerpt.length > 0 ? excerpt : undefined,
        backlinkCount: countWikiBacklinks(snapshot, targetFile.path)
    }
}

/** 转义 Markdown 文本中的行内标记字符（标题/摘要按纯文本展示） */
function escapeMarkdownText(value: string): string {
    return value.replace(/[\\`*_[\]<>]/g, (matched) => `\\${matched}`)
}

/** 把任意单行文本包成 Markdown 代码段（含反引号时自动加长围栏） */
function toHoverCodeSpan(value: string): string {
    const text = String(value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
    const fence = text.includes('`') ? '``' : '`'
    return `${fence}${text}${fence}`
}

/**
 * 把悬停信息格式化为 Monaco Hover 的 Markdown 文本。
 *
 * - resolved：标题（加粗）+ 相对路径（代码段）+ 摘要 + 反向链接数量；
 * - missing / ambiguous：状态文案（加粗）+ 链接原文。
 * 全部用户可见文案均来自入参 `labels`（组件接线时传 `t()` 结果）。
 */
export function formatWikiLinkHoverMarkdown(
    info: WikiLinkHoverInfo,
    labels: WikiLinkHoverLabels
): string {
    if (info.status === 'missing') {
        return `**${escapeMarkdownText(labels.missing)}**\n\n${toHoverCodeSpan(info.raw)}`
    }
    if (info.status === 'ambiguous') {
        return `**${escapeMarkdownText(labels.ambiguous)}**\n\n${toHoverCodeSpan(info.raw)}`
    }
    const title = typeof info.title === 'string' && info.title.length > 0 ? info.title : info.target
    const lines: string[] = [`**${escapeMarkdownText(title)}**`]
    if (typeof info.relativePath === 'string' && info.relativePath.length > 0) {
        lines.push('', toHoverCodeSpan(info.relativePath))
    }
    if (typeof info.excerpt === 'string' && info.excerpt.length > 0) {
        lines.push('', escapeMarkdownText(info.excerpt))
    }
    if (typeof info.backlinkCount === 'number' && info.backlinkCount > 0) {
        lines.push('', labels.backlinks(info.backlinkCount))
    }
    return lines.join('\n')
}

/* ============================ 文案与加载器默认实现 ============================ */

/**
 * 默认悬停文案（沿用既有 i18n 词条，不新增词典键）：
 * - missing → `editorUi.knowledge.statusMissing`；
 * - ambiguous → `editorUi.knowledge.statusAmbiguous`；
 * - backlinks → `editorUi.knowledge.summaryBacklinks`（`{count}` 插值）。
 *
 * 渲染层组件接线时统一传入基于 `t()` 的 labels（语言切换即时生效）；本默认值用于
 * 无 i18n 上下文（单测/独立调用）时保证有可读文案。
 */
export function createDefaultWikiLinkHoverLabels(): WikiLinkHoverLabels {
    return {
        missing: translate('editorUi.knowledge.statusMissing'),
        ambiguous: translate('editorUi.knowledge.statusAmbiguous'),
        backlinks: (count: number) =>
            translate('editorUi.knowledge.summaryBacklinks', undefined, { count })
    }
}

/** 规整文案来源（允许只覆盖部分字段；工厂异常回落默认） */
function resolveWikiLinkHoverLabels(source?: WikiLinkHoverLabelsSource): WikiLinkHoverLabels {
    const defaults = createDefaultWikiLinkHoverLabels()
    if (source === undefined || source === null) {
        return defaults
    }
    let provided: Partial<WikiLinkHoverLabels> | undefined
    try {
        provided = typeof source === 'function' ? source() : source
    } catch {
        provided = undefined
    }
    if (!provided || typeof provided !== 'object') {
        return defaults
    }
    return {
        missing:
            typeof provided.missing === 'string' && provided.missing.length > 0
                ? provided.missing
                : defaults.missing,
        ambiguous:
            typeof provided.ambiguous === 'string' && provided.ambiguous.length > 0
                ? provided.ambiguous
                : defaults.ambiguous,
        backlinks:
            typeof provided.backlinks === 'function' ? provided.backlinks : defaults.backlinks
    }
}

/** 默认索引加载器：动态 import 渲染层 composable（复用既有 IPC 通道，不新增通道） */
async function defaultLoadWorkspaceIndex(): Promise<WorkspaceIndexResult> {
    const module = await import('../../composables/useWorkspaceIndex')
    return module.getWorkspaceIndex()
}

/* ============================ 注册 / 释放 ============================ */

/** 同编辑器实例的注册句柄（重复注册幂等；dispose 后移除，可重新注册） */
const registeredHandles = new WeakMap<object, WikiLinkHoverHandle>()

/** 规格化非负数值配置（非法回落默认） */
function normalizeNonNegativeNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

/** 从模型 URI 读取本地文件路径（file 协议 + 编码还原 + Windows 盘符/UNC 处理） */
function readModelFilePath(model: WikiLinkHoverModelLike | null | undefined): string {
    try {
        const uri = model?.uri
        if (
            !uri ||
            uri.scheme !== 'file' ||
            typeof uri.path !== 'string' ||
            uri.path.length === 0
        ) {
            return ''
        }
        let decoded = uri.path
        try {
            decoded = decodeURIComponent(decoded)
        } catch {
            // 非法百分号编码：保留 URI 原文，仅作比较键使用
        }
        const authority = typeof uri.authority === 'string' ? uri.authority : ''
        if (authority.length > 0) {
            decoded = `//${authority}${decoded.startsWith('/') ? decoded : `/${decoded}`}`
        }
        // Windows 盘符路径：/E:/notes/a.md → E:/notes/a.md（比较键会统一分隔符/大小写）
        return decoded.replace(/^\/([A-Za-z]:)/, '$1')
    } catch {
        return ''
    }
}

/** 快照结构防御性判定（注入的加载器可能返回非契约结构） */
function isWorkspaceIndexSnapshotLike(value: unknown): value is WorkspaceIndexSnapshot {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    return Array.isArray((value as { files?: unknown }).files)
}

/**
 * 创建并注册 Wiki 链接悬浮预览。
 *
 * @param editor 当前 Monaco 编辑器实例（可为空；仅用于模型 URI 不可用时的路径兜底）
 * @param monacoApi Monaco API（真实 `monaco` 实例；本模块只使用
 *                  `languages.registerHoverProvider` 与 `Range`）
 * @param options 可选配置（加载器/文案/缓存时长/摘要长度）
 * @returns 释放句柄（dispose 幂等；重复注册同一编辑器返回同一句柄）
 */
export function registerWikiLinkHover(
    editor: WikiLinkHoverEditorLike | null | undefined,
    monacoApi: WikiLinkHoverMonacoLike,
    options: WikiLinkHoverOptions = {}
): WikiLinkHoverHandle {
    const editorKey = editor && typeof editor === 'object' ? (editor as object) : null
    if (editorKey !== null) {
        const existing = registeredHandles.get(editorKey)
        if (existing !== undefined) {
            return existing
        }
    }
    const handle = createWikiLinkHoverHandle(editorKey, monacoApi, options)
    if (editorKey !== null) {
        registeredHandles.set(editorKey, handle)
    }
    return handle
}

/** 内部：创建句柄、注册 provider 并维护快照缓存 */
function createWikiLinkHoverHandle(
    editor: object | null,
    monacoApi: WikiLinkHoverMonacoLike,
    options: WikiLinkHoverOptions
): WikiLinkHoverHandle {
    const loadIndex: () => Promise<WorkspaceIndexResult> =
        typeof options.loadIndex === 'function' ? options.loadIndex : defaultLoadWorkspaceIndex
    const snapshotTtlMs = normalizeNonNegativeNumber(
        options.snapshotTtlMs,
        WIKI_LINK_HOVER_DEFAULT_SNAPSHOT_TTL_MS
    )
    const failureTtlMs = normalizeNonNegativeNumber(
        options.failureTtlMs,
        WIKI_LINK_HOVER_DEFAULT_FAILURE_TTL_MS
    )
    const excerptMaxLength = normalizeNonNegativeNumber(
        options.excerptMaxLength,
        WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH
    )

    let disposed = false
    let providerDisposable: { dispose(): void } | null = null
    let cachedSnapshot: WorkspaceIndexSnapshot | null = null
    let cachedAt = 0
    let failureAt = 0
    let inflight: Promise<WorkspaceIndexSnapshot | null> | null = null

    /** 取快照（带 TTL 缓存 / 失败冷却 / 并发去重；任何失败都返回 null 或旧快照，不抛错） */
    async function loadSnapshot(): Promise<WorkspaceIndexSnapshot | null> {
        if (disposed) {
            return null
        }
        const now = Date.now()
        if (cachedSnapshot !== null && now - cachedAt < snapshotTtlMs) {
            return cachedSnapshot
        }
        if (failureAt > 0 && now - failureAt < failureTtlMs) {
            return cachedSnapshot
        }
        if (inflight !== null) {
            return inflight
        }
        inflight = (async (): Promise<WorkspaceIndexSnapshot | null> => {
            try {
                const result = await loadIndex()
                if (result !== null && typeof result === 'object' && result.ok === true) {
                    if (isWorkspaceIndexSnapshotLike(result.snapshot)) {
                        cachedSnapshot = result.snapshot
                        cachedAt = Date.now()
                        failureAt = 0
                        return cachedSnapshot
                    }
                }
                failureAt = Date.now()
                return cachedSnapshot
            } catch (error) {
                // 快照不可用属可预期降级（未打开工作区/索引失败），不向 UI 抛错
                logger.debug('[E10] 工作区索引快照加载失败，悬浮预览本次跳过：', error)
                failureAt = Date.now()
                return cachedSnapshot
            } finally {
                inflight = null
            }
        })()
        return inflight
    }

    /** 解析当前文件路径：模型 URI → 编辑器模型 URI → 选项兜底 */
    function resolveSourcePath(model: WikiLinkHoverModelLike | null): string {
        const fromModel = readModelFilePath(model)
        if (fromModel.length > 0) {
            return fromModel
        }
        const monoEditor = editor as WikiLinkHoverEditorLike | null
        if (monoEditor && typeof monoEditor.getModel === 'function') {
            try {
                const fromEditor = readModelFilePath(monoEditor.getModel())
                if (fromEditor.length > 0) {
                    return fromEditor
                }
            } catch {
                // 编辑器已销毁等竞态：按无源路径处理
            }
        }
        try {
            const hinted = options.getSourcePath?.()
            return typeof hinted === 'string' ? hinted : ''
        } catch {
            return ''
        }
    }

    const provider: WikiLinkHoverProviderLike = {
        async provideHover(model, position) {
            if (disposed) {
                return null
            }
            try {
                if (!model || typeof model.getLineContent !== 'function') {
                    return null
                }
                if (model.getLanguageId() !== WIKI_LINK_HOVER_LANGUAGE_SELECTOR) {
                    return null
                }
                const lineNumber = Math.trunc(Number(position?.lineNumber))
                const column = Math.trunc(Number(position?.column))
                if (!Number.isFinite(lineNumber) || lineNumber < 1 || column < 1) {
                    return null
                }
                const lineText = model.getLineContent(lineNumber)
                const link = parseWikiLinkAt(lineText, column)
                // 非链接位置直接返回，避免无意义地触发索引加载
                if (!link) {
                    return null
                }
                const snapshot = await loadSnapshot()
                if (disposed || snapshot === null) {
                    return null
                }
                const info = buildWikiLinkHoverInfo(
                    {
                        snapshot,
                        sourcePath: resolveSourcePath(model),
                        lineNumber,
                        column,
                        lineText
                    },
                    { excerptMaxLength }
                )
                if (!info) {
                    return null
                }
                return {
                    range: new monacoApi.Range(
                        lineNumber,
                        link.startColumn,
                        lineNumber,
                        link.endColumn
                    ),
                    contents: [
                        {
                            value: formatWikiLinkHoverMarkdown(
                                info,
                                resolveWikiLinkHoverLabels(options.labels)
                            ),
                            supportThemeIcons: true
                        }
                    ]
                }
            } catch (error) {
                // 悬浮预览属体验增强：任何异常都降级为不展示，不影响编辑器主链路
                logger.warn('[E10] Wiki 链接悬浮预览计算失败，已跳过本次展示：', error)
                return null
            }
        }
    }

    // 注册失败（极旧 Monaco / 测试桩）不影响编辑器主链路，只是不提供悬浮预览
    try {
        if (
            monacoApi &&
            monacoApi.languages &&
            typeof monacoApi.languages.registerHoverProvider === 'function' &&
            typeof monacoApi.Range === 'function'
        ) {
            providerDisposable = monacoApi.languages.registerHoverProvider(
                WIKI_LINK_HOVER_LANGUAGE_SELECTOR,
                // 运行期交给真实 Monaco 的 provider；类型差异见 WikiLinkHoverMonacoLike 注释
                provider as unknown as never
            )
        }
    } catch (error) {
        providerDisposable = null
        logger.warn('[E10] Wiki 链接悬浮预览 provider 注册失败，已跳过：', error)
    }

    return {
        get isRegistered(): boolean {
            return !disposed && providerDisposable !== null
        },
        dispose(): void {
            if (disposed) {
                return
            }
            disposed = true
            const disposable = providerDisposable
            providerDisposable = null
            try {
                disposable?.dispose()
            } catch (error) {
                logger.warn('[E10] Wiki 链接悬浮预览 provider 释放失败：', error)
            }
            cachedSnapshot = null
            cachedAt = 0
            failureAt = 0
            inflight = null
            if (editor !== null) {
                registeredHandles.delete(editor)
            }
        }
    }
}
