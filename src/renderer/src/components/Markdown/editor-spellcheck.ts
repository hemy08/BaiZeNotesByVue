/**
 * A6 拼写检查（opt-in，开关 `spellcheck`，默认关闭）。
 *
 * 实现说明（不引入词典依赖）：
 * - 使用 Chromium / 操作系统自带的拼写检查能力，本模块只负责给 Monaco 实际输入
 *   textarea 设置 `spellcheck` 与 `lang` 属性；
 * - 开启：`spellcheck="true"` + `lang`（引导系统词典语言）；
 * - 关闭：`spellcheck="false"` 并移除 `lang`，不保留任何开启态属性；
 * - 纯 DOM 操作，不依赖 Monaco / Vue，便于 jsdom 单测；组件在开关变化时调用。
 */

/** 语言兜底值（取不到 navigator.language 时使用） */
export const SPELLCHECK_LANG_FALLBACK = 'zh-CN'

/** 读取当前语言（系统/Chromium 拼写词典按此语言选择；不可用时回落 `zh-CN`） */
export function resolveSpellcheckLanguage(): string {
    try {
        if (typeof navigator !== 'undefined' && navigator.language) {
            return navigator.language
        }
    } catch {
        // 极旧运行时/受限环境取不到 navigator：回落默认语言
    }
    return SPELLCHECK_LANG_FALLBACK
}

/** 对单个 textarea 应用拼写检查属性（开启设置 true/lang；关闭设置 false 并移除 lang） */
export function applySpellcheckToTextarea(
    textarea: HTMLTextAreaElement,
    enabled: boolean,
    lang: string = SPELLCHECK_LANG_FALLBACK
): void {
    if (enabled) {
        textarea.spellcheck = true
        textarea.setAttribute('spellcheck', 'true')
        textarea.setAttribute('lang', lang)
        return
    }
    textarea.spellcheck = false
    textarea.setAttribute('spellcheck', 'false')
    textarea.removeAttribute('lang')
}

/**
 * 对根节点下所有 textarea 应用拼写检查属性。
 * @returns 命中的 textarea 数量（0 表示编辑器尚未创建输入节点，可忽略）
 */
export function applySpellcheckToRoot(
    root: ParentNode | null | undefined,
    enabled: boolean,
    lang: string = SPELLCHECK_LANG_FALLBACK
): number {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return 0
    }
    const textareas = Array.from(root.querySelectorAll('textarea'))
    for (const textarea of textareas) {
        applySpellcheckToTextarea(textarea, enabled, lang)
    }
    return textareas.length
}

/** 编辑器最小结构（仅取 Monaco DOM 根节点，避免依赖 monaco 类型与运行时） */
export interface SpellcheckEditorLike {
    getDomNode?: () => HTMLElement | null
}

/**
 * 对 Monaco 编辑器输入 textarea 应用/撤销拼写检查。
 * @returns 命中的 textarea 数量（编辑器未就绪/DOM 不可用时为 0，不抛错）
 */
export function applyEditorSpellcheck(
    editor: SpellcheckEditorLike | null | undefined,
    enabled: boolean,
    lang: string = SPELLCHECK_LANG_FALLBACK
): number {
    if (!editor || typeof editor.getDomNode !== 'function') {
        return 0
    }
    let domNode: HTMLElement | null
    try {
        domNode = editor.getDomNode()
    } catch {
        return 0
    }
    return applySpellcheckToRoot(domNode, enabled, lang)
}
