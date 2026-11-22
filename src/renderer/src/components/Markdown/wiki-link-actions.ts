/**
 * B1 Wiki 链接 Ctrl/Cmd+Click 动作（1.5.1 本地知识库基座，2026-11-22）
 *
 * ## 职责
 * Markdown 编辑器中按住 Ctrl/Cmd 点击 `[[target]]` / `[[target|alias]]` / `[[target#heading]]` 时：
 * 1. **定位链接**：当前行文本用 `[[...]]` 正则找出包含点击列的区间（列语义与 Monaco 一致：
 *    字符下标 i 对应列 i + 1，`endColumn` 为 exclusive）；
 * 2. **清洗目标**：去掉 `|alias` 与 `#heading`；拒绝空目标、绝对路径、盘符、UNC、`..` 段，
 *    以及含非法字符 / 控制字符 / Windows 保留设备名 / 尾随点空格的路径段；
 * 3. **三态解析**（数据源为工作区索引快照，与 E10 悬停预览及主进程索引阶段同口径）：
 *    - `resolved` 唯一命中 → 复用既有 `openIndexedFile`（打开 + 跳行链路）打开文件；
 *    - `ambiguous` 多候选 → 返回候选清单（标题 + 相对路径），由对话框选择后打开；
 *    - `missing` 目标不存在 → 生成创建计划，由确认对话框确认后复用既有
 *      `IPC.FILE.CREATE_FILE_FOLDER` invoke 创建（**不新增 IPC 通道**）；
 * 4. **创建边界**：缺失页创建只允许「目标目录已出现在工作区索引路径中」的场景，
 *    目录不存在时返回 `directory-missing`（提示用户先创建目录），绝不递归建目录。
 *
 * ## 边界（与 E10 wiki-link-hover.ts 同一接线原则）
 * - 本模块不依赖 monaco / Vue / DOM：Monaco 只以最小结构接口（`onMouseDown` / `addAction`
 *   / `getModel` / `getPosition`）注入，纯函数可直接单测；
 * - 数据源只经注入的 `loadIndex`（生产默认 `getWorkspaceIndex()`，复用既有
 *   `FILE.GET_WORKSPACE_INDEX` 通道），任何失败都降级为结构化结果（`unavailable` /
 *   `error`），不向 UI 抛异常；
 * - 打开命中文件复用 `composables/useWorkspaceIndex.openIndexedFile`；创建复用既有
 *   `FILE.CREATE_FILE_FOLDER` 主进程实现（Path Guard / 已存在检查由主进程再做一次）；
 * - heading 暂不参与跳转（打开目标文件即可）；`![[embed]]` 嵌入语义不在本能力范围。
 */
import { IPC } from '../../../../shared/ipc-channels'
import type { WorkspaceIndexResult } from '../../../../shared/types/ipc'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexLinkStatus,
    WorkspaceIndexSnapshot
} from '../../../../shared/types/workspace-index'
import { getExtension, normalizeSlashes } from '../../../../shared/utils/path'
import { hasControlChars } from '../../../../shared/utils/validate'
import {
    getWorkspaceIndex,
    normalizeIndexPath,
    openIndexedFile
} from '../../composables/useWorkspaceIndex'
import { logger } from '../../common/logger'

/* ============================ 常量 ============================ */

/** 本能力只处理 Markdown 编辑器模型 */
export const WIKI_LINK_ACTIONS_LANGUAGE_SELECTOR = 'markdown'

/** 缺失页统一创建的扩展名（复用既有 CREATE_FILE_FOLDER 的 extension 参数） */
export const WIKI_LINK_CREATE_EXTENSION = '.md'

/**
 * 可索引文本扩展名（**不含点**、小写）。
 *
 * 真源为主进程 `WORKSPACE_INDEX_EXTENSIONS`（渲染层禁止 import `src/main/**`，故按
 * 「纯数据镜像」本地声明）；解析/创建计划的口径与 E10 悬停预览保持一致。
 */
export const WIKI_LINK_TEXT_EXTENSIONS: readonly string[] = ['md', 'markdown', 'txt']

/** Wiki 链接：`[[...]]`（单行内匹配，原文含方括号；与主进程/E10 同一模式） */
const WIKI_LINK_PATTERN = /\[\[([^[\]\r\n]+)\]\]/g

/** Windows 盘符开头（`C:` / `C:/` / `C:\`）不是工作区 Wiki 链接目标 */
const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:/

/** Windows 文件名非法字符（同时覆盖路径分隔符与 NTFS ADS 冒号） */
const WINDOWS_ILLEGAL_FILENAME_PATTERN = /[\\/:*?"<>|]/

/** Windows 保留设备名（`CON` / `NUL` / `COM1` 等；带扩展名同样保留） */
const WINDOWS_RESERVED_DEVICE_PATTERN = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i

/** 单个路径段最大长度（与主进程 isSafeFileName 的 255 上限一致） */
const MAX_SEGMENT_LENGTH = 255

/* ============================ 类型：链接定位 ============================ */

/** 点击列命中的 Wiki 链接（原文 + 拆分后的 target/alias/heading + 列区间） */
export interface WikiLinkLocated {
    /** 链接原文（含 `[[` `]]`） */
    raw: string
    /** 方括号内部原文（可能含 `|alias` / `#heading`） */
    inner: string
    /** 清洗（去 alias/heading、trim）后的目标；空目标在定位阶段即返回 null */
    target: string
    /** 别名（`|` 之后的内容；无别名为空串） */
    alias: string
    /** 标题锚点（`#` 之后的内容；无锚点为空串） */
    heading: string
    /** 起始列（1-based，`[[` 第一个字符） */
    startColumn: number
    /** 结束列（1-based，exclusive，即 `]]` 之后一列） */
    endColumn: number
}

/* ============================ 类型：目标清洗 ============================ */

/** 目标被拒绝的原因（供 UI 提示与测试断言；不向用户直接展示英文码） */
export type WikiLinkTargetRejectReason =
    | 'empty-target'
    | 'missing-filename'
    | 'absolute-path'
    | 'unc-path'
    | 'drive-letter'
    | 'parent-segment'
    | 'unsafe-segment'

/** 清洗通过的目标 */
export interface WikiLinkCleanTarget {
    ok: true
    /** 清洗后的相对目标（`/` 分隔、去掉 `./` 段，保留作者写法大小写） */
    target: string
    /** 拆分后的路径段（目录段 + 文件名段） */
    segments: string[]
    /** 别名（可空串） */
    alias: string
    /** 标题锚点（可空串） */
    heading: string
}

/** 清洗失败 */
export interface WikiLinkTargetRejected {
    ok: false
    reason: WikiLinkTargetRejectReason
}

export type WikiLinkCleanTargetResult = WikiLinkCleanTarget | WikiLinkTargetRejected

/* ============================ 类型：三态解析 ============================ */

/** 解析候选（对话框展示「标题 + 相对路径」的数据结构） */
export interface WikiLinkCandidate {
    /** 文件绝对路径（打开时传给 openIndexedFile） */
    path: string
    /** 相对工作区根的展示路径（统一 `/` 分隔） */
    relativePath: string
    /** 展示标题：front matter title > 第一个 H1 > 文件名 */
    title: string
}

/** 命中阶段（与主进程解析顺序一致） */
export type WikiLinkResolutionMatch = 'root-relative' | 'source-relative' | 'basename-or-title'

/** 三态解析结果（ambiguous 时携带全部候选，供选择） */
export interface WikiLinkResolution {
    status: WorkspaceIndexLinkStatus
    candidates: WikiLinkCandidate[]
    match: WikiLinkResolutionMatch | null
}

/* ============================ 类型：缺失页创建计划 ============================ */

/** 创建计划被拒绝的原因 */
export type WikiLinkCreateRejectReason =
    'no-workspace' | 'invalid-target' | 'directory-missing' | 'already-exists'

/** 缺失页创建计划（确认后原样交给 IPC.FILE.CREATE_FILE_FOLDER） */
export interface WikiLinkCreationPlan {
    /** 工作区根绝对路径（统一 `/` 分隔、无尾斜杠） */
    rootPath: string
    /** 待创建文件的相对工作区根路径（`/` 分隔、含 `.md`） */
    relativePath: string
    /** CREATE_FILE_FOLDER 的 name 参数（不含扩展名） */
    fileName: string
    /** CREATE_FILE_FOLDER 的 extension 参数（固定 `.md`） */
    extension: string
    /** 目标目录相对工作区根（根目录为空串） */
    dirRelativePath: string
    /** CREATE_FILE_FOLDER 的 dirPath 参数（绝对路径） */
    dirPath: string
    /** UI 展示路径（与 relativePath 相同，便于对话框直接回显） */
    displayPath: string
}

export type WikiLinkCreationPlanResult =
    | { ok: true; plan: WikiLinkCreationPlan }
    | {
          ok: false
          reason: WikiLinkCreateRejectReason
          /** already-exists 时命中的已存在文件绝对路径 */
          existingFilePath?: string
          /** directory-missing 时缺失的目录相对路径 */
          missingDirectory?: string
      }

/* ============================ 类型：动作编排 ============================ */

/** Monaco 位置最小结构（1-based） */
export interface WikiLinkActionPosition {
    lineNumber: number
    column: number
}

/** Monaco 文本模型最小结构（只读行文本与语言） */
export interface WikiLinkActionModelLike {
    getLineContent(lineNumber: number): string
    getLanguageId?(): string
}

/** Monaco 编辑器最小结构（动作编排只用到模型/位置） */
export interface WikiLinkActionEditorLike {
    getModel(): WikiLinkActionModelLike | null
    getPosition?(): WikiLinkActionPosition | null
}

/** Monaco 鼠标按下事件最小结构（`IEditorMouseEvent` 的结构兼容子集） */
export interface WikiLinkMouseEventLike {
    event?: {
        ctrlKey?: boolean
        metaKey?: boolean
        leftButton?: boolean
        browserEvent?: { button?: number }
        preventDefault?(): void
    } | null
    target?: { position?: WikiLinkActionPosition | null } | null
}

/** 动作依赖注入点（单测注入替身；缺省走真实 IPC / 工作区索引 / 打开链路） */
export interface WikiLinkActionDeps {
    /** 工作区索引加载器（默认 `getWorkspaceIndex()`） */
    loadIndex?: () => Promise<WorkspaceIndexResult>
    /** 打开文件（默认 `openIndexedFile`） */
    openFile?: (filePath: string, line: number) => Promise<boolean>
    /** IPC invoke 替身（默认取 `window.electron.ipcRenderer`；null = 不可用） */
    invokeIpc?: WikiLinkIpcInvoker | null
    /** 当前源文件路径兜底（组件传 `props.filePath`；用于「相对源文件目录」阶段） */
    getSourcePath?: () => string
}

/** IPC invoke 最小结构（preload 受限 ipcRenderer 的结构兼容子集） */
export interface WikiLinkIpcInvoker {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** 点击命中的目标信息（各结果分支共用） */
export interface WikiLinkActionTargetInfo {
    /** 链接原文（含方括号） */
    raw: string
    /** 清洗后的目标 */
    target: string
    /** 行号（1-based） */
    line: number
    /** 列号（1-based） */
    column: number
}

/** 动作编排结果（宿主根据 kind 决定打开文件 / 弹对话框 / 静默忽略） */
export type WikiLinkActionOutcome =
    | { kind: 'ignored'; reason: 'no-model' | 'not-markdown' | 'no-link' }
    | ({ kind: 'invalid-target'; reason: WikiLinkTargetRejectReason } & WikiLinkActionTargetInfo)
    | ({ kind: 'unavailable'; reason: 'no-workspace' | 'index-error' } & WikiLinkActionTargetInfo)
    | ({
          kind: 'opened'
          filePath: string
          candidate: WikiLinkCandidate
      } & WikiLinkActionTargetInfo)
    | ({ kind: 'open-failed'; filePath: string } & WikiLinkActionTargetInfo)
    | ({
          kind: 'ambiguous'
          candidates: WikiLinkCandidate[]
          match: WikiLinkResolutionMatch
      } & WikiLinkActionTargetInfo)
    | ({ kind: 'missing'; plan: WikiLinkCreationPlan } & WikiLinkActionTargetInfo)
    | ({
          kind: 'create-blocked'
          reason: WikiLinkCreateRejectReason
          missingDirectory?: string
          existingFilePath?: string
      } & WikiLinkActionTargetInfo)
    | { kind: 'error'; message: string }

/** 索引加载结果（区分未打开工作区与索引错误，供 UI 提示） */
export interface WikiLinkIndexLoadResult {
    snapshot: WorkspaceIndexSnapshot | null
    code: 'no-workspace' | 'index-error' | null
}

/** 缺失页创建调用结果 */
export interface WikiLinkCreateResult {
    ok: boolean
    /** 失败原因（'IPC_UNAVAILABLE' / 'INVALID_PLAN' 或主进程异常 message） */
    error?: string
}

/* ============================ 纯函数：链接定位 ============================ */

/** 拆分方括号内部原文为 target / alias / heading（target 去 `#` 段并 trim） */
function splitWikiLinkInner(inner: string): { target: string; alias: string; heading: string } {
    const pipeIndex = inner.indexOf('|')
    const targetSection = pipeIndex >= 0 ? inner.slice(0, pipeIndex) : inner
    const alias = pipeIndex >= 0 ? inner.slice(pipeIndex + 1).trim() : ''
    const hashIndex = targetSection.indexOf('#')
    const target = (hashIndex >= 0 ? targetSection.slice(0, hashIndex) : targetSection).trim()
    const heading = hashIndex >= 0 ? targetSection.slice(hashIndex + 1).trim() : ''
    return { target, alias, heading }
}

/**
 * 在单行文本中定位指定列命中的 Wiki 链接。
 *
 * 列语义与 Monaco 一致：字符下标 i 对应列 i + 1；返回的 `endColumn` 为 exclusive
 * （`startColumn + raw.length`），即列落在 `[startColumn, endColumn)` 才命中。
 * 空目标（`[[#heading]]` / `[[|alias]]`）与主进程一致视为不可解析链接，返回 null。
 *
 * @param lineText 单行文本
 * @param column 1-based 列
 * @returns 命中的链接；未命中返回 null
 */
export function locateWikiLinkAt(lineText: string, column: number): WikiLinkLocated | null {
    if (typeof lineText !== 'string' || lineText.length === 0) {
        return null
    }
    if (typeof column !== 'number' || !Number.isFinite(column) || column < 1) {
        return null
    }
    WIKI_LINK_PATTERN.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = WIKI_LINK_PATTERN.exec(lineText)) !== null) {
        const raw = match[0]
        const startColumn = match.index + 1
        const endColumn = startColumn + raw.length
        if (column < startColumn || column >= endColumn) {
            continue
        }
        const inner = match[1]
        const parsed = splitWikiLinkInner(inner)
        if (parsed.target.length === 0) {
            return null
        }
        return {
            raw,
            inner,
            target: parsed.target,
            alias: parsed.alias,
            heading: parsed.heading,
            startColumn,
            endColumn
        }
    }
    return null
}

/* ============================ 纯函数：目标清洗 / 路径安全 ============================ */

/**
 * 判断单个路径段（目录名或文件名）是否安全。
 *
 * 口径与主进程 `security.isSafeFileName`（SEC-09 / AS-1）对齐：
 * - 空串 / `.` / `..` / 超长拒绝；
 * - 控制字符、Windows 非法字符（`\ / : * ? " < > |`）拒绝；
 * - 尾随点 / 尾随空格拒绝（Windows 会静默截断，可能绕过同名判断）；
 * - Windows 保留设备名（CON/PRN/AUX/NUL/COM1-9/LPT1-9）拒绝。
 *
 * 说明：保留设备名在非 Windows 平台也会被本函数拒绝——缺失页统一按 Windows 兼容
 * 口径校验，宁可多拒也不产生跨平台不可用文件。
 */
export function isSafeWikiLinkSegment(segment: string): boolean {
    if (typeof segment !== 'string') {
        return false
    }
    // 不 trim：Windows 会静默去掉文件名末尾的点/空格，按 trim 后判定会漏掉绕过
    const value = segment
    if (value.length === 0 || value.length > MAX_SEGMENT_LENGTH) {
        return false
    }
    if (value === '.' || value === '..') {
        return false
    }
    if (hasControlChars(value)) {
        return false
    }
    if (WINDOWS_ILLEGAL_FILENAME_PATTERN.test(value)) {
        return false
    }
    if (value.endsWith('.') || value.endsWith(' ')) {
        return false
    }
    if (WINDOWS_RESERVED_DEVICE_PATTERN.test(value)) {
        return false
    }
    return true
}

/**
 * 清洗 Wiki 链接目标（可传方括号内部原文，也可传已拆分的 target）。
 *
 * 处理顺序：
 * 1. 去 `|alias` / `#heading`（alias/heading 仅展示与锚点用途，不参与路径）；
 * 2. 反斜杠归一化为 `/`、trim；
 * 3. 拒绝空目标、`//` UNC、`/` 绝对路径、盘符、尾随 `/`（缺文件名）；
 * 4. 拒绝任意 `..` 段（防目录穿越），丢弃空段与 `.` 段；
 * 5. 逐段做文件名安全校验（含目录段，防止把 `..` / 非法字符写进 dirPath）。
 *
 * @param rawTarget 链接目标原文（可含 alias/heading）
 * @returns 清洗通过的目标 / 拒绝原因
 */
export function cleanWikiLinkTarget(rawTarget: string): WikiLinkCleanTargetResult {
    if (typeof rawTarget !== 'string') {
        return { ok: false, reason: 'empty-target' }
    }
    const parsed = splitWikiLinkInner(rawTarget)
    const normalized = normalizeSlashes(parsed.target).trim()
    if (normalized.length === 0) {
        return { ok: false, reason: 'empty-target' }
    }
    // 先判 UNC（`//server/share`）再判绝对路径（`/notes/a`），两者都拒绝
    if (normalized.startsWith('//')) {
        return { ok: false, reason: 'unc-path' }
    }
    if (normalized.startsWith('/')) {
        return { ok: false, reason: 'absolute-path' }
    }
    if (WINDOWS_DRIVE_PATTERN.test(normalized)) {
        return { ok: false, reason: 'drive-letter' }
    }
    if (normalized.endsWith('/')) {
        return { ok: false, reason: 'missing-filename' }
    }
    const rawSegments = normalized.split('/')
    if (rawSegments.some((segment) => segment === '..')) {
        return { ok: false, reason: 'parent-segment' }
    }
    const segments = rawSegments.filter((segment) => segment.length > 0 && segment !== '.')
    if (segments.length === 0) {
        return { ok: false, reason: 'empty-target' }
    }
    if (!segments.every((segment) => isSafeWikiLinkSegment(segment))) {
        return { ok: false, reason: 'unsafe-segment' }
    }
    return {
        ok: true,
        target: segments.join('/'),
        segments,
        alias: parsed.alias,
        heading: parsed.heading
    }
}

/* ============================ 内部：快照查找表 ============================ */

/** 全库查找表（键统一小写；值为同键文件列表，长度 > 1 即候选歧义） */
interface FileLookup {
    byRelativePath: Map<string, WorkspaceIndexFile[]>
    byBasename: Map<string, WorkspaceIndexFile[]>
    byTitle: Map<string, WorkspaceIndexFile[]>
}

/** 向查找表追加文件（同键多个即多候选） */
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
        appendLookup(lookup.byRelativePath, normalizeIndexPath(file.relativePath), file)
        appendLookup(
            lookup.byBasename,
            getFileStem(getBaseName(file.relativePath)).toLowerCase(),
            file
        )
        if (typeof file.title === 'string' && file.title.length > 0) {
            appendLookup(lookup.byTitle, file.title.toLowerCase(), file)
        }
    }
    return lookup
}

/** 取路径最后一段（无名分隔符时原样返回；空串安全） */
function getBaseName(filePath: string): string {
    const normalized = normalizeSlashes(String(filePath ?? ''))
    const slashIndex = normalized.lastIndexOf('/')
    return slashIndex < 0 ? normalized : normalized.slice(slashIndex + 1)
}

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

/** 按路径去重（Windows 大小写不敏感；保持首次出现顺序） */
function dedupeFiles(files: readonly WorkspaceIndexFile[]): WorkspaceIndexFile[] {
    const seen = new Set<string>()
    const result: WorkspaceIndexFile[] = []
    for (const file of files) {
        const key = normalizeIndexPath(file.path)
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        result.push(file)
    }
    return result
}

/** 快照文件 → 候选展示结构（标题缺失时回退文件名/相对路径） */
function toFileCandidate(file: WorkspaceIndexFile): WikiLinkCandidate {
    const relativePath = normalizeSlashes(file.relativePath ?? '')
    const title =
        typeof file.title === 'string' && file.title.length > 0
            ? file.title
            : file.name || relativePath
    return { path: file.path, relativePath, title }
}

/** 在快照中按绝对路径查找文件（分隔符归一化 + 小写比较，对齐 normalizeIndexPath） */
function findIndexedFileByPath(
    snapshot: WorkspaceIndexSnapshot | null,
    filePath: string
): WorkspaceIndexFile | null {
    if (!snapshot || !Array.isArray(snapshot.files) || typeof filePath !== 'string') {
        return null
    }
    if (filePath.length === 0) {
        return null
    }
    const key = normalizeIndexPath(filePath)
    return snapshot.files.find((file) => normalizeIndexPath(file.path) === key) ?? null
}

/* ============================ 纯函数：三态解析 ============================ */

/** 把文件列表转成三态结果（1 = resolved；> 1 = ambiguous；0 = 调用方处理） */
function buildResolution(
    files: readonly WorkspaceIndexFile[],
    match: WikiLinkResolutionMatch
): WikiLinkResolution {
    const candidates = dedupeFiles(files).map(toFileCandidate)
    if (candidates.length === 1) {
        return { status: 'resolved', candidates, match }
    }
    return { status: 'ambiguous', candidates, match }
}

/**
 * 按相对路径（无扩展名时依次补 `.md` → `.markdown` → `.txt`）收集候选。
 *
 * 与主进程/E10 口径一致：按候选键顺序，命中第一个有结果的键即返回（该键下多个文件
 * 即歧义），不再继续尝试后续扩展名。
 */
function collectByRelativePath(lookup: FileLookup, candidatePath: string): WorkspaceIndexFile[] {
    const extension = getExtension(candidatePath)
    const candidateKeys = [candidatePath]
    if (!WIKI_LINK_TEXT_EXTENSIONS.includes(extension)) {
        for (const textExtension of WIKI_LINK_TEXT_EXTENSIONS) {
            candidateKeys.push(`${candidatePath}.${textExtension}`)
        }
    }
    for (const key of candidateKeys) {
        const matches = lookup.byRelativePath.get(key.toLowerCase())
        if (matches !== undefined && matches.length > 0) {
            return dedupeFiles(matches)
        }
    }
    return []
}

/**
 * 解析 Wiki 链接目标并返回全部候选（与主进程阶段顺序一致）：
 * ① 工作区根相对路径 → ② 相对源文件目录 → ③ 全库 basename/title 唯一匹配。
 *
 * @param snapshot 工作区索引快照（null/结构非法按 missing 处理，不抛错）
 * @param sourcePath 当前文件绝对路径（可为空串；为空时跳过阶段②）
 * @param rawTarget 链接目标原文（可含 alias/heading；内部会先清洗）
 * @returns 三态结果；ambiguous 时 `candidates` 为全部候选
 */
export function resolveWikiLinkCandidates(
    snapshot: WorkspaceIndexSnapshot | null,
    sourcePath: string,
    rawTarget: string
): WikiLinkResolution {
    const empty: WikiLinkResolution = { status: 'missing', candidates: [], match: null }
    if (!snapshot || !Array.isArray(snapshot.files)) {
        return empty
    }
    const cleaned = cleanWikiLinkTarget(rawTarget)
    if (!cleaned.ok) {
        return empty
    }
    const lookup = createFileLookup(snapshot.files)

    // 阶段①：工作区根相对
    const rootMatches = collectByRelativePath(lookup, cleaned.target)
    if (rootMatches.length > 0) {
        return buildResolution(rootMatches, 'root-relative')
    }

    // 阶段②：相对源文件目录（源文件需在快照中）
    const sourceFile = findIndexedFileByPath(snapshot, sourcePath)
    if (sourceFile !== null) {
        const sourceDirectory = getParentRelativePath(normalizeSlashes(sourceFile.relativePath))
        if (sourceDirectory.length > 0) {
            const siblingMatches = collectByRelativePath(
                lookup,
                `${sourceDirectory}/${cleaned.target}`
            )
            if (siblingMatches.length > 0) {
                return buildResolution(siblingMatches, 'source-relative')
            }
        }
    }

    // 阶段③：全库 basename / title（判定顺序与 E10 一致：basename 唯一优先 → title 唯一）
    const lastSegment = cleaned.segments[cleaned.segments.length - 1] ?? ''
    const basenameMatches = dedupeFiles(
        lookup.byBasename.get(getFileStem(lastSegment).toLowerCase()) ?? []
    )
    const titleMatches: WorkspaceIndexFile[] = []
    for (const key of [cleaned.target.toLowerCase(), lastSegment.toLowerCase()]) {
        for (const file of lookup.byTitle.get(key) ?? []) {
            if (!titleMatches.includes(file)) {
                titleMatches.push(file)
            }
        }
    }
    if (basenameMatches.length === 1) {
        return {
            status: 'resolved',
            candidates: [toFileCandidate(basenameMatches[0])],
            match: 'basename-or-title'
        }
    }
    if (titleMatches.length === 1) {
        return {
            status: 'resolved',
            candidates: [toFileCandidate(titleMatches[0])],
            match: 'basename-or-title'
        }
    }
    if (basenameMatches.length > 1 || titleMatches.length > 1) {
        return {
            status: 'ambiguous',
            candidates: dedupeFiles([...basenameMatches, ...titleMatches]).map(toFileCandidate),
            match: 'basename-or-title'
        }
    }
    return empty
}

/* ============================ 纯函数：缺失页创建计划 ============================ */

/** 去掉已知文本扩展名（`foo.md` → `foo`；其它扩展名原样保留） */
function stripKnownTextExtension(fileName: string): string {
    const extension = getExtension(fileName)
    if (!WIKI_LINK_TEXT_EXTENSIONS.includes(extension)) {
        return fileName
    }
    return fileName.slice(0, fileName.length - extension.length - 1)
}

/**
 * 在快照中查找「本次创建将命中的已存在文件」。
 *
 * 用于防御索引快照滞后/缺失导致的重复创建：目标相对路径补全各文本扩展名后逐个比较
 * （Windows 大小写不敏感），命中即视为已存在（由 UI 提示，不覆盖）。
 */
function findCreationConflict(
    files: readonly WorkspaceIndexFile[],
    dirSegments: readonly string[],
    fileName: string
): WorkspaceIndexFile | null {
    const relativeBase = [...dirSegments, fileName].join('/').toLowerCase()
    const candidateKeys = new Set<string>([relativeBase])
    for (const extension of WIKI_LINK_TEXT_EXTENSIONS) {
        candidateKeys.add(`${relativeBase}.${extension}`)
    }
    for (const file of files) {
        if (candidateKeys.has(normalizeIndexPath(file.relativePath))) {
            return file
        }
    }
    return null
}

/**
 * 在快照中查找「已存在的目标目录」的真实相对路径（保留磁盘上的大小写）。
 *
 * 只按路径前缀判断目录存在（空目录不在索引快照内，属已知限制），并取快照里
 * 实际写入时的大小写，避免在大小写敏感平台把 `Notes/` 拼成不存在的目录。
 *
 * @returns 目录相对路径（保留快照大小写；根目录为空串）；不存在返回 null
 */
function findWorkspaceDirectoryRelativePath(
    files: readonly WorkspaceIndexFile[],
    dirRelativePath: string
): string | null {
    if (dirRelativePath.length === 0) {
        return ''
    }
    const lowerPrefix = `${dirRelativePath.toLowerCase()}/`
    for (const file of files) {
        const normalized = normalizeIndexPath(file.relativePath)
        if (normalized.startsWith(lowerPrefix)) {
            // 取快照相对路径同长度前缀，保留真实大小写（分隔符已由 / 归一化）
            return normalizeSlashes(file.relativePath).slice(0, dirRelativePath.length)
        }
    }
    return null
}

/**
 * 规划缺失页创建（不写盘，只产出创建参数；确认后由 {@link createMissingWikiPage} 调用 IPC）。
 *
 * 规则：
 * - 无工作区（快照缺失/根为空）→ `no-workspace`；
 * - 目标非法（清洗失败）→ `invalid-target`；
 * - 快照中已存在同路径文件（含 `.md`/`.markdown`/`.txt` 补全）→ `already-exists`；
 * - 目标含子目录时，只有该目录已出现在工作区索引路径中才允许 → 否则 `directory-missing`
 *   （**不递归建目录**）；
 * - 文件名使用去扩展名后的 name，扩展名固定 `.md`（复用既有 CREATE_FILE_FOLDER 契约）。
 *
 * @param snapshot 工作区索引快照
 * @param rawTarget 链接目标原文（可含 alias/heading）
 * @returns 创建计划 / 拒绝原因
 */
export function planWikiLinkCreation(
    snapshot: WorkspaceIndexSnapshot | null,
    rawTarget: string
): WikiLinkCreationPlanResult {
    if (
        !snapshot ||
        !Array.isArray(snapshot.files) ||
        typeof snapshot.rootPath !== 'string' ||
        snapshot.rootPath.length === 0
    ) {
        return { ok: false, reason: 'no-workspace' }
    }
    const cleaned = cleanWikiLinkTarget(rawTarget)
    if (!cleaned.ok) {
        return { ok: false, reason: 'invalid-target' }
    }
    const fileNameSegment = cleaned.segments[cleaned.segments.length - 1] ?? ''
    const fileName = stripKnownTextExtension(fileNameSegment)
    if (fileName.length === 0 || !isSafeWikiLinkSegment(fileName)) {
        return { ok: false, reason: 'invalid-target' }
    }
    const dirSegments = cleaned.segments.slice(0, -1)
    const typedDirRelativePath = dirSegments.join('/')

    const existingFile = findCreationConflict(snapshot.files, dirSegments, fileName)
    if (existingFile !== null) {
        return { ok: false, reason: 'already-exists', existingFilePath: existingFile.path }
    }
    // 目标目录必须已出现在工作区索引路径中（不递归建目录）；命中时用快照里的真实大小写
    const resolvedDirRelativePath = findWorkspaceDirectoryRelativePath(
        snapshot.files,
        typedDirRelativePath
    )
    if (resolvedDirRelativePath === null) {
        return { ok: false, reason: 'directory-missing', missingDirectory: typedDirRelativePath }
    }
    const resolvedDirSegments =
        resolvedDirRelativePath.length > 0 ? resolvedDirRelativePath.split('/') : []
    const relativePath = [...resolvedDirSegments, `${fileName}${WIKI_LINK_CREATE_EXTENSION}`].join(
        '/'
    )

    const rootPath = normalizeSlashes(snapshot.rootPath).replace(/\/+$/, '')
    const dirPath =
        resolvedDirSegments.length > 0 ? `${rootPath}/${resolvedDirSegments.join('/')}` : rootPath
    return {
        ok: true,
        plan: {
            rootPath,
            relativePath,
            fileName,
            extension: WIKI_LINK_CREATE_EXTENSION,
            dirRelativePath: resolvedDirRelativePath,
            dirPath,
            displayPath: relativePath
        }
    }
}

/* ============================ 动作：索引 / 打开 / 创建 ============================ */

/** 取 preload 暴露的受限 ipcRenderer；非 Electron 环境返回 null */
function resolveIpcInvoker(): WikiLinkIpcInvoker | null {
    try {
        const ipc = typeof window !== 'undefined' ? window.electron?.ipcRenderer : undefined
        return ipc && typeof ipc.invoke === 'function' ? ipc : null
    } catch {
        return null
    }
}

/** 从依赖注入读取源文件路径（异常静默降级为空串） */
function resolveSourcePath(deps: WikiLinkActionDeps): string {
    try {
        const value = deps.getSourcePath?.()
        return typeof value === 'string' ? value : ''
    } catch {
        return ''
    }
}

/**
 * 加载工作区索引快照（复用既有通道，不新增 IPC）。
 *
 * 返回 `{ snapshot, code }`：成功时 code=null；失败区分「未打开工作区」与「索引错误」。
 * 任何异常都降级为 index-error，不向 UI 抛错。
 */
export async function loadWikiLinkIndex(
    deps: WikiLinkActionDeps = {}
): Promise<WikiLinkIndexLoadResult> {
    const loadIndex = deps.loadIndex ?? getWorkspaceIndex
    try {
        const result = await loadIndex()
        if (
            result !== null &&
            typeof result === 'object' &&
            result.ok === true &&
            result.snapshot !== null &&
            typeof result.snapshot === 'object' &&
            Array.isArray(result.snapshot.files)
        ) {
            return { snapshot: result.snapshot, code: null }
        }
        const code =
            result !== null && typeof result === 'object' && result.ok === false
                ? result.code === 'NO_WORKSPACE'
                    ? 'no-workspace'
                    : 'index-error'
                : 'index-error'
        return { snapshot: null, code }
    } catch (error) {
        logger.warn('[B1] 加载工作区索引失败，Wiki 链接动作跳过：', error)
        return { snapshot: null, code: 'index-error' }
    }
}

/**
 * 打开唯一命中的目标文件（复用既有打开 + 跳行链路 `openIndexedFile`）。
 *
 * heading 暂不参与跳转：统一打开到第 1 行（文件打开后用户可自行定位标题）。
 *
 * @returns true = 已确认切换；false = 打开失败（调用方决定提示）
 */
export async function openWikiLinkTarget(
    filePath: string,
    deps: WikiLinkActionDeps = {}
): Promise<boolean> {
    if (typeof filePath !== 'string' || filePath.length === 0) {
        return false
    }
    const openFile = deps.openFile ?? openIndexedFile
    try {
        return (await openFile(filePath, 1)) === true
    } catch (error) {
        logger.warn('[B1] 打开 Wiki 链接目标文件失败：', error)
        return false
    }
}

/**
 * 调用既有 `IPC.FILE.CREATE_FILE_FOLDER` 创建缺失页（不新增通道）。
 *
 * 参数顺序与主进程 handler 完全一致：`(name, dirPath, false, '.md')`。
 * 主进程会再次做 Path Guard / 文件名白名单 / 已存在检查，并在成功时自动打开新文件；
 * 渲染层这里只负责调用与失败结果归一化。
 */
export async function createMissingWikiPage(
    plan: WikiLinkCreationPlan,
    deps: WikiLinkActionDeps = {}
): Promise<WikiLinkCreateResult> {
    if (
        !plan ||
        typeof plan.fileName !== 'string' ||
        plan.fileName.length === 0 ||
        typeof plan.dirPath !== 'string' ||
        plan.dirPath.length === 0
    ) {
        return { ok: false, error: 'INVALID_PLAN' }
    }
    const ipc = deps.invokeIpc !== undefined ? deps.invokeIpc : resolveIpcInvoker()
    if (!ipc) {
        logger.warn('[B1] preload IPC 不可用，无法创建缺失 Wiki 页面')
        return { ok: false, error: 'IPC_UNAVAILABLE' }
    }
    try {
        await ipc.invoke(
            IPC.FILE.CREATE_FILE_FOLDER,
            plan.fileName,
            plan.dirPath,
            false,
            plan.extension
        )
        return { ok: true }
    } catch (error) {
        logger.warn('[B1] 创建缺失 Wiki 页面失败：', error)
        return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
}

/* ============================ 动作：鼠标事件判定 ============================ */

/**
 * 判断鼠标按下事件是否应触发 Wiki 链接跳转（仅 Ctrl/Cmd + 左键）。
 *
 * 普通点击不触发；右键/中键即使带修饰键也不触发（避免与上下文菜单冲突）。
 */
export function isWikiLinkModifierClick(mouseEvent: unknown): boolean {
    const event = mouseEvent as WikiLinkMouseEventLike | null | undefined
    if (!event || typeof event !== 'object' || !event.event) {
        return false
    }
    const mouse = event.event
    if (mouse.leftButton === false) {
        return false
    }
    if (
        mouse.browserEvent &&
        typeof mouse.browserEvent.button === 'number' &&
        mouse.browserEvent.button !== 0
    ) {
        return false
    }
    return mouse.ctrlKey === true || mouse.metaKey === true
}

/** 读取鼠标事件中命中的编辑器位置（非法/缺失返回 null） */
export function readWikiLinkMousePosition(mouseEvent: unknown): WikiLinkActionPosition | null {
    const event = mouseEvent as WikiLinkMouseEventLike | null | undefined
    const position = event?.target?.position
    if (!position) {
        return null
    }
    const lineNumber = Math.trunc(Number(position.lineNumber))
    const column = Math.trunc(Number(position.column))
    if (!Number.isFinite(lineNumber) || lineNumber < 1 || !Number.isFinite(column) || column < 1) {
        return null
    }
    return { lineNumber, column }
}

/* ============================ 动作：编排 ============================ */

/**
 * 执行一次 Wiki 链接动作（Ctrl/Cmd+Click 与命令注册共用）。
 *
 * 纯编排：定位 → 清洗 → 加载索引 → 三态 → 打开 / 返回候选或创建计划。
 * 不弹对话框、不操作 DOM，宿主根据返回的 `kind` 决定后续 UI。
 *
 * @param editor Monaco 编辑器最小结构（提供模型与语言）
 * @param position 点击位置（1-based）
 * @param deps 依赖注入点（索引/打开/IPC/源路径）
 */
export async function performWikiLinkAction(
    editor: WikiLinkActionEditorLike | null | undefined,
    position: WikiLinkActionPosition | null | undefined,
    deps: WikiLinkActionDeps = {}
): Promise<WikiLinkActionOutcome> {
    try {
        const model = editor?.getModel?.() ?? null
        if (!model) {
            return { kind: 'ignored', reason: 'no-model' }
        }
        if (
            typeof model.getLanguageId === 'function' &&
            model.getLanguageId() !== WIKI_LINK_ACTIONS_LANGUAGE_SELECTOR
        ) {
            return { kind: 'ignored', reason: 'not-markdown' }
        }
        const lineNumber = Math.trunc(Number(position?.lineNumber))
        const column = Math.trunc(Number(position?.column))
        if (
            !Number.isFinite(lineNumber) ||
            lineNumber < 1 ||
            !Number.isFinite(column) ||
            column < 1
        ) {
            return { kind: 'ignored', reason: 'no-link' }
        }
        let lineText = ''
        try {
            lineText = model.getLineContent(lineNumber)
        } catch {
            return { kind: 'ignored', reason: 'no-link' }
        }
        const link = locateWikiLinkAt(lineText, column)
        if (!link) {
            return { kind: 'ignored', reason: 'no-link' }
        }
        const baseInfo: WikiLinkActionTargetInfo = {
            raw: link.raw,
            target: link.target,
            line: lineNumber,
            column
        }
        const cleaned = cleanWikiLinkTarget(link.inner)
        if (!cleaned.ok) {
            return { kind: 'invalid-target', reason: cleaned.reason, ...baseInfo }
        }
        const targetInfo: WikiLinkActionTargetInfo = { ...baseInfo, target: cleaned.target }

        const loaded = await loadWikiLinkIndex(deps)
        if (loaded.snapshot === null || loaded.code !== null) {
            return {
                kind: 'unavailable',
                reason: loaded.code ?? 'index-error',
                ...targetInfo
            }
        }

        const resolution = resolveWikiLinkCandidates(
            loaded.snapshot,
            resolveSourcePath(deps),
            cleaned.target
        )
        if (resolution.status === 'resolved' && resolution.candidates.length > 0) {
            const candidate = resolution.candidates[0]
            const opened = await openWikiLinkTarget(candidate.path, deps)
            if (opened) {
                return { kind: 'opened', filePath: candidate.path, candidate, ...targetInfo }
            }
            return { kind: 'open-failed', filePath: candidate.path, ...targetInfo }
        }
        if (resolution.status === 'ambiguous') {
            return {
                kind: 'ambiguous',
                candidates: resolution.candidates,
                match: resolution.match ?? 'basename-or-title',
                ...targetInfo
            }
        }

        const creation = planWikiLinkCreation(loaded.snapshot, cleaned.target)
        if (creation.ok) {
            return { kind: 'missing', plan: creation.plan, ...targetInfo }
        }
        return {
            kind: 'create-blocked',
            reason: creation.reason,
            missingDirectory: creation.missingDirectory,
            existingFilePath: creation.existingFilePath,
            ...targetInfo
        }
    } catch (error) {
        // 体验增强能力：任何异常都降级为结构化错误结果，不影响编辑器主链路
        logger.warn('[B1] Wiki 链接动作执行失败：', error)
        return { kind: 'error', message: error instanceof Error ? error.message : String(error) }
    }
}
