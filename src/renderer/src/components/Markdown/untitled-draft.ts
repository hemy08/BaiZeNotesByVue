/**
 * 未命名文档草稿缓存。
 *
 * 背景：编辑器在“尚未打开任何文件”时也允许输入。此时内容没有归属文件，
 * 不能同步进主进程的 currentActiveFile（否则可能把旧文件/新选文件覆盖掉）。
 * 本模块把这段内容只保存在渲染层：
 * - 内存副本用于文件打开前的同步判断；
 * - localStorage 副本用于页面重载/意外关闭后的恢复；
 * - 写入走短防抖，避免每次击键都同步写 localStorage。
 *
 * 安全边界：只存文本内容与更新时间，不存路径，也不新增 IPC。
 */

/** localStorage 键（版本化，便于以后清理不兼容旧草稿） */
export const UNTITLED_DRAFT_STORAGE_KEY = 'baize:untitled-draft:v1'

/** 落盘防抖时间（毫秒） */
const PERSIST_DEBOUNCE_MS = 250

let memoryContent = ''
let loaded = false
let persistTimer: ReturnType<typeof setTimeout> | null = null

interface PersistedDraft {
    content: string
    updatedAt: number
}

function canUseStorage(): boolean {
    try {
        return typeof window !== 'undefined' && Boolean(window.localStorage)
    } catch {
        return false
    }
}

function loadFromStorage(): void {
    if (loaded) {
        return
    }
    loaded = true
    if (!canUseStorage()) {
        return
    }
    try {
        const raw = window.localStorage.getItem(UNTITLED_DRAFT_STORAGE_KEY)
        if (!raw) {
            return
        }
        const parsed = JSON.parse(raw) as Partial<PersistedDraft>
        if (typeof parsed.content === 'string') {
            memoryContent = parsed.content
        }
    } catch {
        // 旧版本/损坏数据不应阻塞编辑器启动，直接忽略
        memoryContent = ''
    }
}

function persistNow(): void {
    if (persistTimer !== null) {
        clearTimeout(persistTimer)
        persistTimer = null
    }
    if (!canUseStorage()) {
        return
    }
    try {
        if (memoryContent.length === 0) {
            window.localStorage.removeItem(UNTITLED_DRAFT_STORAGE_KEY)
            return
        }
        const payload: PersistedDraft = {
            content: memoryContent,
            updatedAt: Date.now()
        }
        window.localStorage.setItem(UNTITLED_DRAFT_STORAGE_KEY, JSON.stringify(payload))
    } catch {
        // 配额不足/隐私模式：内存副本仍可用，不打断输入
    }
}

function schedulePersist(): void {
    if (persistTimer !== null) {
        clearTimeout(persistTimer)
    }
    persistTimer = setTimeout(persistNow, PERSIST_DEBOUNCE_MS)
}

/** 读取当前未命名草稿（空字符串表示没有草稿） */
export function readUntitledDraft(): string {
    loadFromStorage()
    return memoryContent
}

/** 是否存在非空未命名草稿 */
export function hasUntitledDraft(): boolean {
    return readUntitledDraft().trim().length > 0
}

/** 更新未命名草稿（编辑器在“未装载文件”状态下每次内容变化调用） */
export function writeUntitledDraft(content: string): void {
    loadFromStorage()
    if (memoryContent === content) {
        return
    }
    memoryContent = content
    if (content.length === 0) {
        persistNow()
        return
    }
    schedulePersist()
}

/** 立即把待写草稿落 localStorage（页面隐藏/关闭前调用） */
export function flushUntitledDraft(): void {
    loadFromStorage()
    persistNow()
}

/** 清空未命名草稿（用户选择不保存，或已成功另存为） */
export function clearUntitledDraft(): void {
    loaded = true
    memoryContent = ''
    persistNow()
}

/** 仅供单元测试：重置模块内存状态并清掉测试写入 */
export function resetUntitledDraftForTesting(): void {
    if (persistTimer !== null) {
        clearTimeout(persistTimer)
        persistTimer = null
    }
    loaded = false
    memoryContent = ''
    if (canUseStorage()) {
        try {
            window.localStorage.removeItem(UNTITLED_DRAFT_STORAGE_KEY)
        } catch {
            // 忽略测试环境存储异常
        }
    }
}
