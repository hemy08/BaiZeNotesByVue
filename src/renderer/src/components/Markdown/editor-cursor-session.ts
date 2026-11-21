/**
 * 编辑器光标/滚动/选区会话恢复（P0-5）
 *
 * 设计约束：
 * - 纯函数 + 可注入 storage，便于单测；生产使用 localStorage；
 * - key 按文件路径区分（Windows 路径大小写归一化），不写主进程配置；
 * - 只保存轻量位置（行/列/滚动 top/可选选区），不保存正文；
 * - 存储不可用/损坏时静默降级，不阻塞打开文件。
 */

export interface EditorCursorSession {
    /** 光标位置（Monaco 1 基） */
    lineNumber: number
    column: number
    /** 编辑器 scrollTop（px；恢复时若内容已变化会尽量接近） */
    scrollTop: number
    /** 非空选区（可选；空选区不保存，避免恢复后误选中） */
    selection?: {
        startLineNumber: number
        startColumn: number
        endLineNumber: number
        endColumn: number
    }
}

/** 最小存储接口（可传 localStorage / 内存替身） */
export interface CursorSessionStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
}

const KEY_PREFIX = 'baize:editor-session:v1:'

/** 路径 → 稳定 hash（避免 key 过长/包含特殊字符；仅用于区分文件） */
export function hashSessionPath(filePath: string): string {
    const normalized = filePath.replace(/\//g, '\\').toLowerCase()
    let hash = 0x811c9dc5
    for (let i = 0; i < normalized.length; i += 1) {
        hash ^= normalized.charCodeAt(i)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
}

export function cursorSessionKey(filePath: string): string {
    return `${KEY_PREFIX}${hashSessionPath(filePath)}`
}

function toPositiveInt(value: unknown, fallback: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return fallback
    }
    return Math.floor(value)
}

function normalizeSelection(raw: unknown): EditorCursorSession['selection'] | undefined {
    if (!raw || typeof raw !== 'object') return undefined
    const source = raw as Record<string, unknown>
    const startLineNumber = toPositiveInt(source.startLineNumber, 0)
    const startColumn = toPositiveInt(source.startColumn, 0)
    const endLineNumber = toPositiveInt(source.endLineNumber, 0)
    const endColumn = toPositiveInt(source.endColumn, 0)
    if (!startLineNumber || !startColumn || !endLineNumber || !endColumn) {
        return undefined
    }
    return { startLineNumber, startColumn, endLineNumber, endColumn }
}

/** 归一化任意存储值 */
export function normalizeCursorSession(raw: unknown): EditorCursorSession | null {
    if (!raw || typeof raw !== 'object') return null
    const source = raw as Record<string, unknown>
    const lineNumber = toPositiveInt(source.lineNumber, 0)
    const column = toPositiveInt(source.column, 0)
    if (!lineNumber || !column) return null
    return {
        lineNumber,
        column,
        scrollTop: Math.max(0, Math.floor(Number(source.scrollTop) || 0)),
        selection: normalizeSelection(source.selection)
    }
}

/** 读取会话；不存在/损坏/异常返回 null */
export function loadCursorSession(
    storage: CursorSessionStorage | null,
    filePath: string
): EditorCursorSession | null {
    if (!storage || !filePath) return null
    try {
        const raw = storage.getItem(cursorSessionKey(filePath))
        if (!raw) return null
        return normalizeCursorSession(JSON.parse(raw))
    } catch {
        return null
    }
}

/** 保存会话；空路径/异常静默忽略 */
export function saveCursorSession(
    storage: CursorSessionStorage | null,
    filePath: string,
    session: EditorCursorSession
): void {
    if (!storage || !filePath) return
    const normalized = normalizeCursorSession(session)
    if (!normalized) return
    try {
        storage.setItem(cursorSessionKey(filePath), JSON.stringify(normalized))
    } catch {
        // 配额/隐私模式：恢复能力降级，不影响编辑
    }
}

/** 清除指定文件会话（可选；文件删除/重命名时使用） */
export function clearCursorSession(storage: CursorSessionStorage | null, filePath: string): void {
    if (!storage || !filePath) return
    try {
        storage.removeItem(cursorSessionKey(filePath))
    } catch {
        // 忽略
    }
}
