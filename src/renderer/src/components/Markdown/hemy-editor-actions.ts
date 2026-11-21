import { OnInsertAfterCursor, replaceSelection } from './hemy-editor-common'
import * as monaco from 'monaco-editor'
import { t } from '../../common/i18n'
import { useFeatureFlags } from '../../composables/useFeatureFlags'
import {
    computeSmartBackspacePlan,
    computeSmartEnterPlan,
    type SmartEnterPlan
} from './editor-smart-input'
import {
    attachPasteEnhance,
    pasteFromSystemClipboard,
    selectionToHtml,
    writeClipboardPayload
} from './editor-paste-enhance'
import { logger } from '../../common/logger'

/**
 * A8 复制增强命令 id（固定，供命令面板/菜单/快捷键统一引用，勿改）：
 * - `baize.copyAsMarkdown`：复制选区（无选区时为全文）为 Markdown 文本
 * - `baize.copyAsHtml`：复制选区（无选区时为全文）为转义后的 HTML
 */
export const COPY_AS_MARKDOWN_ACTION_ID = 'baize.copyAsMarkdown'
export const COPY_AS_HTML_ACTION_ID = 'baize.copyAsHtml'

function matchStartWith(
    str: string,
    matcher: { [Symbol.match](string: string): RegExpMatchArray | null }
): string | null {
    const match = str.match(matcher)
    return match ? match[0] : null
}

/**
 * A7 智能输入（opt-in）：普通模式与写作模式共用同一引擎。
 *
 * 开关来源：
 * - 系统设置 →「功能」→ Markdown 智能输入（`smartInput`）；
 * - 系统设置 →「编写体验」→ 智能输入增强（`writingSmartInput`，同样全模式生效）。
 *
 * 能力：有序列表递增/后续重编号、引用/嵌套/任务列表续行、空列表项回车/退格退出、
 * 标题后空行；中文输入法组合期不介入，所有自动修改合并为一次 executeEdits（一次撤销）。
 */

/** 正在输入法组合中的编辑器（组合期完全不干预 Enter/Backspace） */
const composingEditors = new WeakSet<object>()

function smartInputEnabled(): boolean {
    const { flags } = useFeatureFlags()
    return flags.smartInput === true || flags.writingSmartInput === true
}

function isEditorComposing(editor: monaco.editor.IStandaloneCodeEditor): boolean {
    return composingEditors.has(editor)
}

/** 注册组合期监听；编辑器能力缺失（测试替身）时安全跳过 */
function attachCompositionGuards(
    editor: monaco.editor.IStandaloneCodeEditor,
    disposables: monaco.IDisposable[]
): void {
    if (typeof editor.onDidCompositionStart === 'function') {
        const disposable = editor.onDidCompositionStart(() => {
            composingEditors.add(editor)
        })
        if (disposable) disposables.push(disposable)
    }
    if (typeof editor.onDidCompositionEnd === 'function') {
        const disposable = editor.onDidCompositionEnd(() => {
            composingEditors.delete(editor)
        })
        if (disposable) disposables.push(disposable)
    }
}

/** 按插入文本计算执行后的光标位置（文本从光标处开始插入，仅含换行） */
/** 单次提交编辑并显式包裹 undo stop，确保用户一次 Ctrl+Z 即可整体撤销 */
function executeSmartEdits(
    editor: monaco.editor.IStandaloneCodeEditor,
    edits: monaco.editor.IIdentifiedSingleEditOperation[]
): void {
    if (!editor.executeEdits) return
    editor.pushUndoStop?.()
    editor.executeEdits('smart-input', edits)
    editor.pushUndoStop?.()
}

function resolveCursorAfterInsert(
    position: monaco.Position,
    insertText: string
): { lineNumber: number; column: number } {
    const lines = insertText.split('\n')
    return {
        lineNumber: position.lineNumber + lines.length - 1,
        column: lines[lines.length - 1].length + 1
    }
}

/**
 * 为有序列表后续同缩进/同分隔符项生成重编号编辑。
 *
 * 仅处理紧邻连续的有序列表项（遇到空行、普通文本、不同层级/分隔符即停止），
 * 编辑与插入合并到同一个 executeEdits，用户一次 Ctrl+Z 可整体撤销。
 */
function buildOrderedRenumberEdits(
    model: monaco.editor.ITextModel,
    startLineNumber: number,
    plan: SmartEnterPlan
): monaco.editor.IIdentifiedSingleEditOperation[] {
    const renumber = plan.orderedRenumber
    if (!renumber) return []
    const lineCount =
        typeof model.getLineCount === 'function' ? model.getLineCount() : startLineNumber
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = []
    let expected = renumber.nextNumber
    for (let lineNumber = startLineNumber; lineNumber <= lineCount; lineNumber++) {
        const lineText = model.getLineContent(lineNumber)
        const match = lineText.match(/^(\s*)(\d+)([.)])([ \t]+)\S/)
        if (!match) break
        if (match[1] !== renumber.indent || match[3] !== renumber.delimiter) break
        const indent = match[1] ?? ''
        const digits = match[2] ?? ''
        edits.push({
            range: new monaco.Range(
                lineNumber,
                indent.length + 1,
                lineNumber,
                indent.length + digits.length + 1
            ),
            text: String(expected),
            forceMoveMarkers: true
        })
        expected++
        // 防御异常超长列表：一次自动编辑最多重编号 500 行
        if (edits.length >= 500) break
    }
    return edits
}

/**
 * 应用智能回车计划（单次 executeEdits，保证一次撤销）。
 *
 * @returns 已处理返回 true；开关关闭/组合期/未命中返回 false，由调用方继续原逻辑。
 */
function applySmartEnter(
    editor: monaco.editor.IStandaloneCodeEditor,
    position: monaco.Position
): boolean {
    // 开关关闭或输入法组合中：不读取 model、不改变任何行为
    if (!smartInputEnabled() || isEditorComposing(editor)) {
        return false
    }
    const model = editor.getModel()
    if (!model) {
        return false
    }
    const lineText = model.getLineContent(position.lineNumber)
    const plan = computeSmartEnterPlan(lineText, position.column)
    if (!plan) {
        return false
    }
    if (typeof editor.executeEdits !== 'function') {
        return false
    }

    const insertText = plan.insertText.replace(/\n/g, '\r\n')
    const edits: monaco.editor.IIdentifiedSingleEditOperation[] = []
    if (plan.deletePrefixChars && plan.deletePrefixChars > 0) {
        // 空列表项回车退出列表：删除行首标记后插入换行（光标落到下一行行首）
        edits.push({
            range: new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column),
            text: insertText,
            forceMoveMarkers: true
        })
    } else {
        edits.push({
            range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            ),
            text: insertText,
            forceMoveMarkers: true
        })
        // 新行插入后，后续行整体下移 1 行
        edits.push(...buildOrderedRenumberEdits(model, position.lineNumber + 1, plan))
    }
    executeSmartEdits(editor, edits)
    if (typeof editor.setPosition === 'function') {
        const cursor = plan.deletePrefixChars
            ? { lineNumber: position.lineNumber + 1, column: 1 }
            : resolveCursorAfterInsert(position, plan.insertText)
        editor.setPosition(cursor)
    }
    return true
}

/**
 * 应用「空列表项退格退出」：仅在 Backspace 时拦截，其他情况放行 Monaco 原生行为。
 *
 * @returns 已处理返回 true（调用方需 preventDefault/stopPropagation）。
 */
function applySmartBackspace(editor: monaco.editor.IStandaloneCodeEditor): boolean {
    if (!smartInputEnabled() || isEditorComposing(editor)) {
        return false
    }
    if (typeof editor.getPosition !== 'function' || typeof editor.executeEdits !== 'function') {
        return false
    }
    const position = editor.getPosition()
    const model = editor.getModel()
    if (!position || !model) return false
    const lineText = model.getLineContent(position.lineNumber)
    const plan = computeSmartBackspacePlan(lineText, position.column)
    if (!plan) return false
    executeSmartEdits(editor, [
        {
            range: new monaco.Range(
                position.lineNumber,
                1,
                position.lineNumber,
                lineText.length + 1
            ),
            text: '',
            forceMoveMarkers: true
        }
    ])
    if (typeof editor.setPosition === 'function') {
        editor.setPosition({ lineNumber: position.lineNumber, column: plan.cursorColumn })
    }
    return true
}

function EnterAction(editor: monaco.editor.IStandaloneCodeEditor) {
    // 输入法组合期：回车用于确认候选词，所有自动回车逻辑均不介入
    if (isEditorComposing(editor)) {
        return
    }
    // 获取鼠标当前位置
    const position = editor.getPosition()
    if (!position) return

    // A7：智能输入（opt-in）优先；关闭/未命中时完全走下面的原有逻辑
    if (applySmartEnter(editor, position)) {
        return
    }

    if (position.lineNumber <= 2) {
        OnInsertAfterCursor(editor, '\r\n')
        return
    }

    const model = editor.getModel()
    if (!model) return

    const content = model.getLineContent(position.lineNumber)
    // 获取上一行内容，如果是- [开头，插入\r\n- []()
    // 获取上一行内容，如果是- 开头，插入\r\n-
    const start_list = matchStartWith(content, /^\s*- /)
    const start_link = matchStartWith(content, /^\s*- \[/)
    let insertText = '\r\n'
    if (start_link != null) {
        if (start_link.length != content.length) {
            insertText = '\r\n' + start_link
        }
    } else if (start_list != null && start_list.length != content.length) {
        insertText = '\r\n' + start_list
    } else {
        insertText = '\r\n'
    }

    if (insertText != '\r\n') {
        OnInsertAfterCursor(editor, insertText)
    } else {
        replaceSelection(
            editor,
            '\r\n',
            true,
            new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            )
        )
    }
}

/** 读取复制源：有选区取选区文本，无选区取整篇文档 */
function readSelectionOrDocumentText(editor: monaco.editor.IStandaloneCodeEditor): string {
    const model = editor.getModel()
    if (!model) {
        return ''
    }
    const selection = editor.getSelection()
    if (selection && typeof selection.isEmpty === 'function' && !selection.isEmpty()) {
        return model.getValueInRange(selection)
    }
    return model.getValue()
}

/** A8：复制为 Markdown（纯文本写入剪贴板） */
async function copyAsMarkdown(editor: monaco.editor.IStandaloneCodeEditor): Promise<void> {
    const text = readSelectionOrDocumentText(editor)
    if (!text) {
        return
    }
    const written = await writeClipboardPayload({ text })
    if (!written) {
        logger.warn('[copyAsMarkdown] 写入剪贴板失败（无可用剪贴板通道）')
    }
}

/** A8：复制为 HTML（text/plain 存原文、text/html 存转义后的结构化 HTML） */
async function copyAsHtml(editor: monaco.editor.IStandaloneCodeEditor): Promise<void> {
    const text = readSelectionOrDocumentText(editor)
    if (!text) {
        return
    }
    const written = await writeClipboardPayload({ text, html: selectionToHtml(text) })
    if (!written) {
        logger.warn('[copyAsHtml] 写入剪贴板失败（无可用剪贴板通道）')
    }
}

/** 注册 editor action（addAction 返回 disposable；测试替身可能返回 undefined，做防御） */
function addActionSafely(
    editor: monaco.editor.IStandaloneCodeEditor,
    descriptor: monaco.editor.IActionDescriptor,
    disposables: monaco.IDisposable[]
): void {
    const disposable = editor.addAction(descriptor)
    if (disposable) {
        disposables.push(disposable)
    }
}

/**
 * A8 粘贴增强：在既有 Ctrl+V 命令（hemy-editor-shortcut.ts：图片 → INSERT_IMAGE、
 * 纯文本 → 直接插入）之上增加 HTML → Markdown 通道。
 *
 * 说明：Monaco 动态键绑定「后注册者优先」，本函数在 KeyMaps 之后调用，因此同键位
 * 覆盖旧命令；图片与纯文本路径仍复用 hemy-editor-common 的既有能力，行为不变。
 */
function registerClipboardPasteCommand(editor: monaco.editor.IStandaloneCodeEditor): void {
    if (typeof editor.addCommand !== 'function') {
        return
    }
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, () => {
        void pasteFromSystemClipboard(editor)
    })
}

/**
 * 注册编辑器动作：回车增强、A8 复制动作、A8 粘贴增强（命令 + 原生 paste 捕获）。
 *
 * @returns 需要随组件卸载显式释放的句柄（原生 paste 监听等；编辑器自身 action 随
 *          editor.dispose() 释放，这里一并返回便于统一清理，测试替身未返回时为 undefined）
 */
export function MonacoEditorAddActions(
    editor: monaco.editor.IStandaloneCodeEditor
): monaco.IDisposable[] {
    const disposables: monaco.IDisposable[] = []

    // 中文输入法组合期守卫：组合期 Enter/Backspace 完全交给 IME / Monaco 原生逻辑
    attachCompositionGuards(editor, disposables)

    // 空列表项退格退出：onKeyDown 先于 Monaco 默认 Backspace，未命中时完全放行
    if (typeof editor.onKeyDown === 'function') {
        const backspaceDisposable = editor.onKeyDown((event) => {
            if (event.keyCode !== monaco.KeyCode.Backspace) {
                return
            }
            if ((event as unknown as { isComposing?: boolean }).isComposing === true) {
                return
            }
            if (!applySmartBackspace(editor)) {
                return
            }
            event.preventDefault?.()
            event.stopPropagation?.()
        })
        if (backspaceDisposable) {
            disposables.push(backspaceDisposable)
        }
    }

    addActionSafely(
        editor,
        {
            id: 'hemy-custom-enter-action',
            label: 'Hemy Custom Enter Action',
            keybindings: [monaco.KeyCode.Enter], // 例如，绑定到 Shift + Enter
            // 回调函数
            run: EnterAction
        },
        disposables
    )

    // A8：复制为 Markdown / 复制为 HTML（id 固定，供命令面板/菜单引用）
    addActionSafely(
        editor,
        {
            id: COPY_AS_MARKDOWN_ACTION_ID,
            label: t('editorUi.editorActions.copyAsMarkdown'),
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyM],
            contextMenuGroupId: '9_cutcopypaste',
            contextMenuOrder: 2,
            run: (target) => copyAsMarkdown(target as monaco.editor.IStandaloneCodeEditor)
        },
        disposables
    )
    addActionSafely(
        editor,
        {
            id: COPY_AS_HTML_ACTION_ID,
            label: t('editorUi.editorActions.copyAsHtml'),
            keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC],
            contextMenuGroupId: '9_cutcopypaste',
            contextMenuOrder: 3,
            run: (target) => copyAsHtml(target as monaco.editor.IStandaloneCodeEditor)
        },
        disposables
    )

    // A8：粘贴增强（Ctrl+V 命令 + 原生 paste 事件兜底）
    registerClipboardPasteCommand(editor)
    const pasteEnhanceDisposable = attachPasteEnhance(editor)
    if (pasteEnhanceDisposable) {
        disposables.push(pasteEnhanceDisposable)
    }

    // FUN-30：已删除调试用的 "Hemy Custom ContextMenu" 右键菜单动作（原实现为
    // alert('args' + args)），属调试残留且暴露在用户编辑器右键菜单中，无功能意义。
    return disposables
}
