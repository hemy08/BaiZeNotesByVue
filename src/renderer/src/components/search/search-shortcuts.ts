/**
 * A9 命令面板 / A2 工作区搜索 —— 全局快捷键匹配与监听（渲染层，2026-11-21）
 *
 * 快捷键契约（与用户需求一致，Windows 用 Ctrl、macOS 同时接受 Cmd）：
 * - `Ctrl+Shift+F`：打开 A2 全工作区搜索/替换对话框；
 * - `Ctrl+Shift+P`：打开 A9 命令面板（命令模式）；
 * - `Ctrl+P`：打开 A9 文件 Quick Open（文件模式）。
 *
 * 说明：
 * - 用 `keydown` 捕获阶段监听，命中后 `preventDefault + stopPropagation`，
 *   避免 Monaco/浏览器默认行为（Ctrl+P 打印、Ctrl+Shift+P 等）干扰；
 * - 输入法组合期（`isComposing` / keyCode 229）不触发，避免中文输入误开面板；
 * - 监听器由挂载宿主在卸载时通过返回的清理函数移除（不泄漏）。
 */

/** 快捷键动作类型 */
export type SearchShortcutAction = 'workspace-search' | 'command-palette' | 'quick-open'

/** 快捷键处理回调（由 SearchOverlayHost 注入，实际改变面板显隐） */
export interface SearchShortcutHandlers {
    /** 打开 A2 工作区搜索 */
    openWorkspaceSearch: () => void
    /** 打开命令面板（命令模式） */
    openCommandPalette: () => void
    /** 打开文件 Quick Open（文件模式） */
    openQuickOpen: () => void
}

/** 键盘事件的最小结构（便于单测直接构造，不依赖真实 KeyboardEvent） */
export interface SearchShortcutKeyEvent {
    key: string
    ctrlKey?: boolean
    metaKey?: boolean
    shiftKey?: boolean
    altKey?: boolean
    isComposing?: boolean
    keyCode?: number
}

/** 可按需注册/移除监听的最小事件目标（浏览器 Window / 测试替身均可） */
export interface SearchShortcutEventTarget {
    addEventListener: (
        type: 'keydown',
        listener: (event: KeyboardEvent) => void,
        capture?: boolean
    ) => void
    removeEventListener: (
        type: 'keydown',
        listener: (event: KeyboardEvent) => void,
        capture?: boolean
    ) => void
}

/**
 * 判定键盘事件对应的快捷键动作。
 *
 * @returns 命中的动作；未命中返回 null（不消费事件）
 */
export function matchSearchShortcut(event: SearchShortcutKeyEvent): SearchShortcutAction | null {
    // 输入法组合中（含 Chrome 的 keyCode 229 标记）：不响应，避免取消候选时误开面板
    if (event.isComposing === true || event.keyCode === 229) {
        return null
    }
    const hasPrimaryModifier = event.ctrlKey === true || event.metaKey === true
    if (!hasPrimaryModifier) {
        return null
    }
    // Ctrl+Alt+... 属系统/其它功能快捷键，不抢占
    if (event.altKey === true) {
        return null
    }
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : ''
    if (event.shiftKey === true) {
        if (key === 'f') {
            return 'workspace-search'
        }
        if (key === 'p') {
            return 'command-palette'
        }
        return null
    }
    if (key === 'p') {
        return 'quick-open'
    }
    return null
}

/**
 * 注册全局搜索/命令面板快捷键监听。
 *
 * @param target 事件目标（生产传 window；单测可传替身）
 * @param handlers 三个动作的回调
 * @returns 清理函数（组件卸载时调用，移除监听）
 */
export function registerSearchShortcuts(
    target: SearchShortcutEventTarget,
    handlers: SearchShortcutHandlers
): () => void {
    const listener = (event: KeyboardEvent): void => {
        const action = matchSearchShortcut(event)
        if (!action) {
            return
        }
        event.preventDefault()
        // 避免 Monaco 等组件同时处理同一按键（如 Ctrl+P 打印/命令面板）
        event.stopPropagation()
        if (action === 'workspace-search') {
            handlers.openWorkspaceSearch()
        } else if (action === 'command-palette') {
            handlers.openCommandPalette()
        } else {
            handlers.openQuickOpen()
        }
    }
    // 捕获阶段优先于编辑器内部快捷键
    target.addEventListener('keydown', listener, true)
    return () => {
        target.removeEventListener('keydown', listener, true)
    }
}
