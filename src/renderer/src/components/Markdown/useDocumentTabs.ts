/**
 * A1 多标签 / 会话恢复（opt-in：`SystemSetting.featureTabs`，默认关闭）。
 *
 * ## 设计边界（为什么是「视图层多标签」而不是「主进程多文档」）
 * 现有应用是单活动文档链路：主进程 `appState.currentActiveFile` 只保存当前文件，
 * 文件打开（`IPC.FILE.OPEN_SELECT_FILE`）会先按既有行为自动保存当前 `.md`、再读盘并
 * 广播 `SHOW_SELECTED_FILE_CONTEXT`（内容）+ `USER_SELECT_FILE`（路径）。本模块不新增
 * IPC、不改主进程，只在渲染层把「本次会话打开过的文件」组织成标签列表：
 * - 打开新文件：仍走既有链路，收到 `USER_SELECT_FILE` 后登记/激活标签；
 * - 切换标签：先把最新全文经既有 `UPDATE_SELECT_FILE_CONTENT` 同步给主进程，再经既有
 *   `OPEN_SELECT_FILE` 打开目标文件（主进程随即自动保存上一文件，内容不丢）；
 * - 关闭活动标签：先经既有 `SAVE_TO_DISK` 落盘（等价于用户保存），再切换到相邻标签；
 * - 会话恢复：只把「文件路径 + 活动标签」写入带版本的 localStorage（不存正文，
 *   避免大文档膨胀配额）；启动后主界面挂载完成时恢复标签列表，再按情况打开活动标签。
 *
 * ## 纯逻辑分层（便于单测）
 * 1. 纯函数：路径归一化、标签增删、相邻标签、内容恢复判定、会话序列化/校验；
 * 2. `useDocumentTabs()` 控制器：Vue 响应式状态 + 定时器 + 注入式副作用（IPC 由组件注入）。
 *
 * ## 已知限制
 * - 主进程仍是单活动文档：标签只表示「本次会话打开过」，不能真正同时持有多个文件句柄；
 * - 切换/关闭时复用既有「打开新文件前自动保存」语义，未保存内容会落盘而不是仅存内存；
 * - 最后一个标签不可关闭（主进程无法「卸载当前文档」，清空编辑器后续保存会写错文件）；
 * - 纯内存快照仅在「脏标签被切走且落盘异常」时用于切回恢复；正文不写 localStorage。
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'

/** 会话持久化键（带版本：结构不兼容时递增键后缀，旧键自然失效） */
export const DOCUMENT_TABS_STORAGE_KEY = 'baize:document-tabs:session:v1'
/** 会话结构版本（与键后缀双保险；校验不通过时静默降级为空会话） */
export const DOCUMENT_TABS_SESSION_VERSION = 1
/** 同时保留的标签上限（超出后淘汰最早加入的非活动标签） */
export const MAX_DOCUMENT_TABS = 12
/** 标签切换确认超时：主进程未回发 `USER_SELECT_FILE` 时回退，保留当前活动标签 */
export const DEFAULT_TAB_SWITCH_TIMEOUT_MS = 6000
/** 会话恢复兜底延时：主界面挂载后仍无启动恢复文件事件时，主动打开上次活动标签 */
export const DEFAULT_SESSION_RESTORE_DELAY_MS = 1500

/** 单个标签的渲染层状态 */
export interface DocumentTab {
    /** 归一化后的绝对路径（正斜杠） */
    path: string
    /** 显示名（路径最后一段） */
    name: string
    /** 脏标记：编辑器内容与最近一次从磁盘装载/保存的内容不同 */
    dirty: boolean
    /** 切走时的正文快照（仅内存，用于落盘异常时切回恢复） */
    snapshot: string | null
    /** 切走时是否处于未保存状态（决定切回时是否允许用快照覆盖磁盘内容） */
    snapshotDirty: boolean
}

/** localStorage 会话结构（只存路径与活动标签，不存正文） */
export interface DocumentTabsSession {
    version: number
    paths: string[]
    activePath: string
}

/** localStorage 最小替身接口（渲染层用 window.localStorage；测试注入内存实现） */
export interface DocumentTabsStorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

/** 标签切换/会话恢复所需的副作用（全部由组件注入，模块本身零 IPC/DOM 依赖） */
export interface UseDocumentTabsOptions {
    /** 当前主进程活动文件路径（组件维护的 `activeFilePath`） */
    getActivePath: () => string
    /** 当前编辑器全文（组件维护的 `markdownEditorContent`） */
    getCurrentContent: () => string
    /** 编辑器是否已装载当前文件内容；false 时禁止切换前同步，防止空内容覆盖磁盘 */
    hasLoadedDocument?: () => boolean
    /** 把最新全文同步给主进程（既有 `IPC.FILE.UPDATE_SELECT_FILE_CONTENT`） */
    flushContent: (content: string) => void
    /** 把最新全文保存到磁盘（既有 `IPC.FILE.SAVE_TO_DISK`，关闭活动标签时使用） */
    saveContent: (content: string) => void
    /** 打开目标文件（既有 `IPC.FILE.OPEN_SELECT_FILE`，主进程会先自动保存当前文件） */
    openFile: (tab: { path: string; name: string }) => void
    /** localStorage 替身；缺省使用 window.localStorage，不可用时静默降级为「不持久化」 */
    storage?: DocumentTabsStorageLike | null
    /** 标签数量上限（默认 MAX_DOCUMENT_TABS） */
    maxTabs?: number
    /** 切换确认超时（默认 DEFAULT_TAB_SWITCH_TIMEOUT_MS） */
    switchTimeoutMs?: number
    /** 会话恢复兜底延时（默认 DEFAULT_SESSION_RESTORE_DELAY_MS） */
    restoreDelayMs?: number
    /** 诊断日志出口（默认静默；组件注入 renderer logger，避免本模块直接依赖日志实现） */
    warn?: (...args: unknown[]) => void
}

/** 控制器对外 API（组件只消费，不直接改内部状态） */
export interface DocumentTabsController {
    /** 开关是否生效（由 `setEnabled` 驱动；关闭时不读写 localStorage、不注册任何行为） */
    enabled: Ref<boolean>
    /** 标签列表（顺序 = 打开顺序） */
    tabs: Ref<DocumentTab[]>
    /** 活动标签路径 */
    activePath: Ref<string>
    /** 是否正在等待主进程确认标签切换 */
    switching: Ref<boolean>
    /** 是否允许关闭标签（最后一个标签不可关闭） */
    canCloseTabs: ComputedRef<boolean>
    /** 开关联动入口：开启时恢复会话/采纳当前文件，关闭时停止一切副作用 */
    setEnabled: (value: boolean) => void
    /** 主进程下发 `USER_SELECT_FILE`：登记并激活对应标签（含启动恢复） */
    handleFileActivated: (path: string) => void
    /** 主进程下发文件内容：返回编辑器应展示的内容（切回脏标签时可能是内存快照） */
    handleLoadedContent: (diskContent: string, kind?: 'open' | 'reload') => string
    /** 编辑器内容变化：更新活动标签脏标记 */
    handleEditorContent: (content: string) => void
    /** 主进程保存成功（FILE_SAVED_SUCCESS）：清除脏标记并推进基准 */
    handleSaved: () => void
    /** 用户点击标签：同步当前内容后经既有打开链路切换 */
    selectTab: (path: string) => boolean
    /** 用户关闭标签：活动标签先保存再切走；最后一个标签返回 false */
    closeTab: (path: string) => boolean
    /** 快捷键循环切换（step=1 下一个 / -1 上一个） */
    cycleTab: (step: number) => boolean
    /** 组件卸载：清理定时器并按需落一次会话 */
    dispose: () => void
}

/** 把任意输入归一化为标签路径（无效输入返回空串；统一正斜杠便于跨平台比较） */
export function normalizeDocumentPath(raw: unknown): string {
    if (typeof raw !== 'string') {
        return ''
    }
    const trimmed = raw.trim().replace(/\\/g, '/')
    if (trimmed.length === 0) {
        return ''
    }
    // 去掉末尾斜杠（`C:/notes/` → `C:/notes`；根路径 `/` 保留）
    const withoutTrailing = trimmed.replace(/\/+$/, '')
    return withoutTrailing.length > 0 ? withoutTrailing : '/'
}

/** 从路径取显示名（最后一段；取不到时回退原路径） */
export function getDocumentName(path: string): string {
    const normalized = normalizeDocumentPath(path)
    if (normalized.length === 0) {
        return ''
    }
    const index = normalized.lastIndexOf('/')
    const name = index >= 0 ? normalized.slice(index + 1) : normalized
    return name.length > 0 ? name : normalized
}

/** 新建标签记录（路径无效返回 null） */
export function createDocumentTab(rawPath: unknown): DocumentTab | null {
    const path = normalizeDocumentPath(rawPath)
    if (path.length === 0) {
        return null
    }
    return {
        path,
        name: getDocumentName(path),
        dirty: false,
        snapshot: null,
        snapshotDirty: false
    }
}

/** 判断两个路径是否指向同一文件（大小写不敏感，兼容 Windows 盘符大小写差异） */
export function sameDocumentPath(a: string, b: string): boolean {
    const left = normalizeDocumentPath(a)
    const right = normalizeDocumentPath(b)
    return left.length > 0 && right.length > 0 && left.toLowerCase() === right.toLowerCase()
}

/** 在标签列表中查找路径命中的标签 */
export function findDocumentTab(
    tabs: readonly DocumentTab[],
    rawPath: string
): DocumentTab | undefined {
    return tabs.find((tab) => sameDocumentPath(tab.path, rawPath))
}

/** 追加标签（去重；超过上限时淘汰最早加入且非保护路径的标签） */
export function addDocumentTab(
    tabs: readonly DocumentTab[],
    rawPath: string,
    options: { maxTabs?: number; protectPath?: string } = {}
): { tabs: DocumentTab[]; added: boolean; evictedPath: string | null } {
    const tab = createDocumentTab(rawPath)
    if (!tab) {
        return { tabs: [...tabs], added: false, evictedPath: null }
    }
    if (findDocumentTab(tabs, tab.path)) {
        return { tabs: [...tabs], added: false, evictedPath: null }
    }
    const maxTabs = Math.max(1, Math.floor(options.maxTabs ?? MAX_DOCUMENT_TABS))
    const next = [...tabs, tab]
    let evictedPath: string | null = null
    if (next.length > maxTabs) {
        // 淘汰最早加入且不是「当前保护路径」的标签（保护路径 = 即将激活的目标）
        const evictIndex = next.findIndex(
            (item) => !options.protectPath || !sameDocumentPath(item.path, options.protectPath) // 新标签在尾部，不会被误淘汰
        )
        const index = evictIndex >= 0 ? evictIndex : 0
        const [evicted] = next.splice(index, 1)
        evictedPath = evicted ? evicted.path : null
    }
    return { tabs: next, added: true, evictedPath }
}

/** 移除标签（未命中返回原数组副本） */
export function removeDocumentTab(
    tabs: readonly DocumentTab[],
    rawPath: string
): { tabs: DocumentTab[]; removed: boolean } {
    const next = tabs.filter((tab) => !sameDocumentPath(tab.path, rawPath))
    return { tabs: next, removed: next.length !== tabs.length }
}

/**
 * 取相邻标签路径（step=1 下一个 / -1 上一个；循环）。
 * 无标签返回空串；只有一个标签时返回该标签自身（调用方自行判断是否需要切换）。
 */
export function getAdjacentDocumentPath(
    tabs: readonly DocumentTab[],
    rawPath: string,
    step: number
): string {
    if (tabs.length === 0) {
        return ''
    }
    const index = tabs.findIndex((tab) => sameDocumentPath(tab.path, rawPath))
    if (index < 0) {
        return tabs[0].path
    }
    const direction = step >= 0 ? 1 : -1
    const nextIndex = (index + direction + tabs.length) % tabs.length
    return tabs[nextIndex].path
}

/**
 * 计算切回标签时应展示的内容。
 * 仅当「离开时处于未保存状态」且内存快照与磁盘内容不同（落盘异常等）时用快照恢复，
 * 否则以磁盘内容为准（避免用过期快照覆盖外部修改）。
 */
export function resolveDocumentRestoreContent(
    tab: DocumentTab | undefined,
    diskContent: string
): { content: string; restored: boolean } {
    if (
        tab &&
        tab.snapshot !== null &&
        tab.snapshotDirty &&
        tab.snapshot.length > 0 &&
        tab.snapshot !== diskContent
    ) {
        return { content: tab.snapshot, restored: true }
    }
    return { content: diskContent, restored: false }
}

/** 序列化会话（空标签返回 null，表示应删除存储键） */
export function serializeDocumentTabsSession(
    tabs: readonly DocumentTab[],
    activePath: string
): string | null {
    const paths: string[] = []
    for (const tab of tabs) {
        const normalized = normalizeDocumentPath(tab.path)
        if (normalized.length === 0) {
            continue
        }
        if (!paths.some((item) => item.toLowerCase() === normalized.toLowerCase())) {
            paths.push(normalized)
        }
        if (paths.length >= MAX_DOCUMENT_TABS) {
            break
        }
    }
    if (paths.length === 0) {
        return null
    }
    const normalizedActive = normalizeDocumentPath(activePath)
    const matched = paths.find((item) => item.toLowerCase() === normalizedActive.toLowerCase())
    const session: DocumentTabsSession = {
        version: DOCUMENT_TABS_SESSION_VERSION,
        paths,
        activePath: matched ?? paths[0]
    }
    return JSON.stringify(session)
}

/** 解析会话（版本/结构/路径非法时返回 null：静默降级，不阻塞启动） */
export function parseDocumentTabsSession(raw: string | null): DocumentTabsSession | null {
    if (typeof raw !== 'string' || raw.length === 0) {
        return null
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(raw)
    } catch {
        return null
    }
    if (!parsed || typeof parsed !== 'object') {
        return null
    }
    const candidate = parsed as {
        version?: unknown
        paths?: unknown
        activePath?: unknown
    }
    if (candidate.version !== DOCUMENT_TABS_SESSION_VERSION || !Array.isArray(candidate.paths)) {
        return null
    }
    const paths: string[] = []
    for (const item of candidate.paths) {
        const normalized = normalizeDocumentPath(item)
        if (normalized.length === 0) {
            continue
        }
        if (!paths.some((path) => path.toLowerCase() === normalized.toLowerCase())) {
            paths.push(normalized)
        }
        if (paths.length >= MAX_DOCUMENT_TABS) {
            break
        }
    }
    if (paths.length === 0) {
        return null
    }
    const rawActive = normalizeDocumentPath(candidate.activePath)
    const activePath =
        paths.find((path) => path.toLowerCase() === rawActive.toLowerCase()) ?? paths[0]
    return { version: DOCUMENT_TABS_SESSION_VERSION, paths, activePath }
}

/** 保存会话（存储不可用/写入失败静默降级；空标签移除旧会话） */
export function saveDocumentTabsSession(
    storage: DocumentTabsStorageLike | null,
    tabs: readonly DocumentTab[],
    activePath: string
): boolean {
    if (!storage) {
        return false
    }
    try {
        const raw = serializeDocumentTabsSession(tabs, activePath)
        if (raw === null) {
            storage.removeItem(DOCUMENT_TABS_STORAGE_KEY)
            return true
        }
        storage.setItem(DOCUMENT_TABS_STORAGE_KEY, raw)
        return true
    } catch {
        return false
    }
}

/** 读取会话（损坏数据删除并返回 null，避免反复解析失败） */
export function loadDocumentTabsSession(
    storage: DocumentTabsStorageLike | null
): DocumentTabsSession | null {
    if (!storage) {
        return null
    }
    try {
        const raw = storage.getItem(DOCUMENT_TABS_STORAGE_KEY)
        if (raw === null) {
            return null
        }
        const session = parseDocumentTabsSession(raw)
        if (session === null) {
            storage.removeItem(DOCUMENT_TABS_STORAGE_KEY)
        }
        return session
    } catch {
        return null
    }
}

/** 清理会话（仅在功能开启时的显式路径调用；关闭状态下不得读写） */
export function clearDocumentTabsSession(storage: DocumentTabsStorageLike | null): void {
    if (!storage) {
        return
    }
    try {
        storage.removeItem(DOCUMENT_TABS_STORAGE_KEY)
    } catch {
        // 存储不可用：静默降级
    }
}

/** 解析默认 localStorage（不可用/被禁用时返回 null） */
function resolveDefaultStorage(): DocumentTabsStorageLike | null {
    try {
        const candidate = (globalThis as { localStorage?: DocumentTabsStorageLike }).localStorage
        if (
            !candidate ||
            typeof candidate.getItem !== 'function' ||
            typeof candidate.setItem !== 'function' ||
            typeof candidate.removeItem !== 'function'
        ) {
            return null
        }
        return candidate
    } catch {
        return null
    }
}

/**
 * 创建多标签控制器（组合式入口）。
 * 副作用全部经 options 注入；模块本身不 import IPC、不访问 DOM。
 */
export function useDocumentTabs(options: UseDocumentTabsOptions): DocumentTabsController {
    /** localStorage 惰性解析：关闭状态下完全不访问 DOM 存储（严格零副作用） */
    let resolvedStorage: DocumentTabsStorageLike | null | undefined
    function getStorage(): DocumentTabsStorageLike | null {
        if (options.storage !== undefined) {
            return options.storage
        }
        if (resolvedStorage === undefined) {
            resolvedStorage = resolveDefaultStorage()
        }
        return resolvedStorage
    }
    const maxTabs = Math.max(1, Math.floor(options.maxTabs ?? MAX_DOCUMENT_TABS))
    const switchTimeoutMs = Math.max(1, options.switchTimeoutMs ?? DEFAULT_TAB_SWITCH_TIMEOUT_MS)
    const restoreDelayMs = Math.max(0, options.restoreDelayMs ?? DEFAULT_SESSION_RESTORE_DELAY_MS)
    const warn = options.warn ?? (() => undefined)

    const enabled = ref(false)
    const tabs = ref<DocumentTab[]>([])
    const activePath = ref('')
    const switching = ref(false)
    const canCloseTabs = computed(() => enabled.value && tabs.value.length > 1)

    /** 编辑器当前全文（相机内容，不直接对模板暴露） */
    let currentContent = ''
    /** 活动标签最近一次从磁盘装载/保存成功的正文基准（脏标记比较对象） */
    let savedBaseline = ''
    /** 渲染层已知的主进程活动文件路径（仅由 handleFileActivated 推进） */
    let loadedPath = ''
    let pendingSwitchPath: string | null = null
    let pendingClosePath: string | null = null
    /** 会话恢复的目标活动标签（启动恢复兜底时使用） */
    let restoreTargetPath = ''
    /** 本次激活是否已由 handleLoadedContent 装载内容（决定是否需要重置基准） */
    let contentLoadedForActivation = false
    /**
     * 关闭活动标签前主动发出的「保存」次数。
     * 保存成功事件（FILE_SAVED_SUCCESS）无载荷、无法归属，若在切换确认后才到达会被误认为
     * 目标标签的保存成功而清除其脏标记；这里按次吞掉与主动保存对应的成功事件。
     */
    let pendingReferenceSaveEvents = 0
    let switchTimer: ReturnType<typeof setTimeout> | null = null
    let restoreTimer: ReturnType<typeof setTimeout> | null = null
    let disposed = false

    function clearSwitchTimer(): void {
        if (switchTimer !== null) {
            clearTimeout(switchTimer)
            switchTimer = null
        }
    }

    function clearRestoreTimer(): void {
        if (restoreTimer !== null) {
            clearTimeout(restoreTimer)
            restoreTimer = null
        }
    }

    /** 仅在功能开启时写入会话（关闭状态零 localStorage 读写） */
    function persistSession(): void {
        if (!enabled.value) {
            return
        }
        saveDocumentTabsSession(getStorage(), tabs.value, activePath.value)
    }

    function findTab(rawPath: string): DocumentTab | undefined {
        return findDocumentTab(tabs.value, rawPath)
    }

    function armSwitchTimeout(): void {
        clearSwitchTimer()
        switchTimer = setTimeout(() => {
            switchTimer = null
            if (disposed) {
                return
            }
            switching.value = false
            pendingSwitchPath = null
            pendingClosePath = null
            // 用户可见失败提示由主进程状态栏下发；这里只记录诊断日志
            warn('[DocumentTabs] 标签切换超时，保留当前活动标签')
        }, switchTimeoutMs)
    }

    function scheduleRestoreFallback(): void {
        clearRestoreTimer()
        if (restoreTargetPath.length === 0) {
            return
        }
        restoreTimer = setTimeout(() => {
            restoreTimer = null
            if (disposed || !enabled.value || loadedPath.length > 0 || switching.value) {
                return
            }
            const target = restoreTargetPath
            restoreTargetPath = ''
            if (target.length === 0 || !findTab(target)) {
                return
            }
            beginOpen(target)
        }, restoreDelayMs)
    }

    /**
     * 打开目标标签（唯一切换入口）：
     * 1. 捕获当前标签的内存快照（切回时兜底恢复用）；
     * 2. 把最新全文同步给主进程（主进程 OPEN 前会按既有行为自动保存当前 .md）；
     * 3. 经既有 OPEN_SELECT_FILE 打开目标文件，等待 USER_SELECT_FILE 确认。
     */
    function beginOpen(rawPath: string): boolean {
        const target = findTab(rawPath)
        if (!target || switching.value) {
            return false
        }
        if (loadedPath.length > 0) {
            const currentTab = findTab(loadedPath)
            if (currentTab) {
                currentTab.snapshot = currentContent
                currentTab.snapshotDirty = currentTab.dirty || currentContent !== savedBaseline
            }
            // 保护：编辑器尚未装载任何文件时不同步（否则可能用空内容覆盖主进程当前文件）
            const loaded = options.hasLoadedDocument ? options.hasLoadedDocument() : true
            if (loaded) {
                options.flushContent(currentContent)
            }
        }
        contentLoadedForActivation = false
        pendingSwitchPath = target.path
        switching.value = true
        options.openFile({ path: target.path, name: target.name })
        armSwitchTimeout()
        return true
    }

    function setEnabled(value: boolean): void {
        if (disposed || value === enabled.value) {
            return
        }
        if (!value) {
            // 关闭：清理定时器与切换态；不写 localStorage（关闭状态零读写）
            enabled.value = false
            switching.value = false
            pendingSwitchPath = null
            pendingClosePath = null
            restoreTargetPath = ''
            contentLoadedForActivation = false
            clearSwitchTimer()
            clearRestoreTimer()
            return
        }
        enabled.value = true
        // 重新启用时先清空上一轮运行态，避免停用前的活动文件/基准污染本轮会话
        loadedPath = ''
        currentContent = ''
        savedBaseline = ''
        contentLoadedForActivation = false
        // 1. 恢复上次会话的标签列表与活动标签（损坏/版本不符时静默降级为空）
        const session = loadDocumentTabsSession(getStorage())
        if (session) {
            tabs.value = session.paths
                .map((path) => createDocumentTab(path))
                .filter((tab): tab is DocumentTab => tab !== null)
            const restoredActive = findTab(session.activePath)
            activePath.value = restoredActive ? restoredActive.path : (tabs.value[0]?.path ?? '')
            restoreTargetPath = session.activePath || activePath.value
            scheduleRestoreFallback()
        }
        // 2. 采纳开关开启前已经打开的活动文件（设置保存后即时生效的场景）
        const adoptedPath = normalizeDocumentPath(options.getActivePath())
        if (adoptedPath.length > 0) {
            currentContent = options.getCurrentContent()
            savedBaseline = currentContent
            contentLoadedForActivation = true
            handleFileActivated(adoptedPath)
        }
    }

    function handleFileActivated(rawPath: string): void {
        if (!enabled.value) {
            return
        }
        const path = normalizeDocumentPath(rawPath)
        if (path.length === 0) {
            return
        }
        // 切走的旧标签：主进程在打开新文件前已自动保存，清除其脏标记；
        // 正文快照已在 beginOpen（用户切换标签）或 handleLoadedContent（外部打开文件）时捕获，
        // 此处不可再用 currentContent 重新捕获——内容事件已先到达，新内容会污染旧标签快照。
        if (loadedPath.length > 0 && !sameDocumentPath(loadedPath, path)) {
            const previousTab = findTab(loadedPath)
            if (previousTab) {
                previousTab.dirty = false
            }
        }
        const result = addDocumentTab(tabs.value, path, {
            maxTabs,
            protectPath: path
        })
        tabs.value = result.tabs
        if (result.evictedPath !== null) {
            warn('[DocumentTabs] 标签数量达到上限，已淘汰最早标签:', result.evictedPath)
        }
        const target = findTab(path)
        if (!target) {
            return
        }
        activePath.value = target.path
        loadedPath = target.path
        // 未经 handleLoadedContent（如开关打开时采纳现有文件）时，把当前内容作为干净基准
        if (!contentLoadedForActivation) {
            currentContent = options.getCurrentContent()
            savedBaseline = currentContent
        }
        contentLoadedForActivation = false
        // 切换确认：清理等待态与启动恢复兜底
        switching.value = false
        pendingSwitchPath = null
        clearSwitchTimer()
        restoreTargetPath = ''
        clearRestoreTimer()
        // 关闭活动标签流程收尾：确认已切到相邻标签后再移除旧标签
        if (pendingClosePath !== null && !sameDocumentPath(pendingClosePath, target.path)) {
            tabs.value = removeDocumentTab(tabs.value, pendingClosePath).tabs
        }
        pendingClosePath = null
        // 脏标记：快照恢复的标签保持脏（用户保存后清除），其余视为磁盘内容干净
        target.dirty = currentContent !== savedBaseline
        if (target.dirty) {
            target.snapshot = currentContent
            target.snapshotDirty = true
        } else {
            target.snapshot = null
            target.snapshotDirty = false
        }
        persistSession()
    }

    function handleLoadedContent(diskContent: string, kind: 'open' | 'reload' = 'open'): string {
        if (!enabled.value) {
            return diskContent
        }
        if (kind === 'reload') {
            // 主进程主动重读当前文件（目录刷新等）：磁盘内容为准，清除快照与脏标记
            savedBaseline = diskContent
            currentContent = diskContent
            contentLoadedForActivation = true
            const activeTab = findTab(activePath.value)
            if (activeTab) {
                activeTab.snapshot = null
                activeTab.snapshotDirty = false
                activeTab.dirty = false
            }
            return diskContent
        }
        // 外部打开新文件（文件树/最近文件/新建/欢迎页）：内容事件先于路径事件到达，
        // 此刻先把旧活动标签的最新正文存入内存快照（旧文件由主进程打开前自动保存）。
        if (pendingSwitchPath === null && loadedPath.length > 0) {
            const previousTab = findTab(loadedPath)
            if (previousTab) {
                previousTab.snapshot = currentContent
                previousTab.snapshotDirty = previousTab.dirty || currentContent !== savedBaseline
                previousTab.dirty = false
            }
        }
        savedBaseline = diskContent
        currentContent = diskContent
        contentLoadedForActivation = true
        const pending = pendingSwitchPath
        if (pending !== null) {
            const target = findTab(pending)
            const resolved = resolveDocumentRestoreContent(target, diskContent)
            if (resolved.restored) {
                // 切回脏标签：用内存快照恢复（主进程内容由后续保存/编辑同步覆盖）
                currentContent = resolved.content
                warn('[DocumentTabs] 已用内存快照恢复标签内容:', target ? target.path : pending)
                return resolved.content
            }
            if (target) {
                target.snapshot = null
                target.snapshotDirty = false
                target.dirty = false
            }
        }
        return diskContent
    }

    function handleEditorContent(content: string): void {
        if (!enabled.value) {
            return
        }
        currentContent = content
        const target = findTab(activePath.value)
        if (!target) {
            return
        }
        target.dirty = target.path === loadedPath && content !== savedBaseline
    }

    function handleSaved(): void {
        if (!enabled.value) {
            return
        }
        // 主动保存（关闭标签前）的迟到成功事件：不属于当前活动标签，吞掉一次
        if (pendingReferenceSaveEvents > 0) {
            pendingReferenceSaveEvents -= 1
            return
        }
        // 切换/关闭进行中：此时到达的保存成功事件属于「切走前的旧文件」，
        // 不能推进目标标签的基准（否则会把刚恢复的脏标签误判为干净）。
        if (switching.value) {
            return
        }
        savedBaseline = currentContent
        const target = findTab(activePath.value)
        if (target) {
            target.dirty = false
            target.snapshot = null
            target.snapshotDirty = false
        }
    }

    function selectTab(rawPath: string): boolean {
        if (!enabled.value || switching.value) {
            return false
        }
        const path = normalizeDocumentPath(rawPath)
        if (path.length === 0 || sameDocumentPath(path, loadedPath)) {
            return false
        }
        if (!findTab(path)) {
            return false
        }
        return beginOpen(path)
    }

    function closeTab(rawPath: string): boolean {
        if (!enabled.value || switching.value) {
            return false
        }
        const path = normalizeDocumentPath(rawPath)
        if (path.length === 0) {
            return false
        }
        const target = findTab(path)
        // 最后一个标签不可关闭：主进程无法「卸载当前文档」，清空编辑器后续保存会写错文件
        if (!target || tabs.value.length <= 1) {
            return false
        }
        const isActive =
            sameDocumentPath(path, loadedPath) || sameDocumentPath(path, activePath.value)
        if (!isActive) {
            tabs.value = removeDocumentTab(tabs.value, path).tabs
            persistSession()
            return true
        }
        // 活动标签：先把最新内容经既有保存链路落盘（不丢内容），再切到相邻标签
        if (currentContent !== savedBaseline) {
            pendingReferenceSaveEvents += 1
            options.saveContent(currentContent)
        }
        const loaded = options.hasLoadedDocument ? options.hasLoadedDocument() : true
        if (loaded) {
            options.flushContent(currentContent)
        }
        const nextPath = getAdjacentDocumentPath(tabs.value, path, 1)
        if (nextPath.length === 0 || sameDocumentPath(nextPath, path)) {
            return false
        }
        pendingClosePath = path
        const opened = beginOpen(nextPath)
        if (!opened) {
            pendingClosePath = null
            return false
        }
        return true
    }

    function cycleTab(step: number): boolean {
        if (!enabled.value || switching.value || tabs.value.length < 2) {
            return false
        }
        const nextPath = getAdjacentDocumentPath(tabs.value, activePath.value, step)
        if (nextPath.length === 0 || sameDocumentPath(nextPath, loadedPath)) {
            return false
        }
        return selectTab(nextPath)
    }

    function dispose(): void {
        if (disposed) {
            return
        }
        clearSwitchTimer()
        clearRestoreTimer()
        if (enabled.value) {
            persistSession()
        }
        enabled.value = false
        disposed = true
    }

    return {
        enabled,
        tabs,
        activePath,
        switching,
        canCloseTabs,
        setEnabled,
        handleFileActivated,
        handleLoadedContent,
        handleEditorContent,
        handleSaved,
        selectTab,
        closeTab,
        cycleTab,
        dispose
    }
}
