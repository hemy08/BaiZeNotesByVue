import { OnInsertAfterCursor, replaceSelection } from './hemy-editor-common'
import * as monaco from 'monaco-editor'
import { t } from '../../common/i18n'
import { useFeatureFlags } from '../../composables/useFeatureFlags'
import { computeSmartEnterPlan } from './editor-smart-input'
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
 * A7 智能输入（opt-in，`flags.smartInput`）：在光标行尾按列表/引用/标题规则增强回车。
 *
 * @returns 已处理（调用方不应再走原 EnterAction 逻辑）；未开启/未命中返回 false，
 *          由调用方继续执行「逐字保持现状」的原有回车逻辑。
 */
function applySmartEnter(
    editor: monaco.editor.IStandaloneCodeEditor,
    position: monaco.Position
): boolean {
    const { flags } = useFeatureFlags()
    if (!flags.smartInput) {
        // 开关关闭：不读取 model、不改变任何行为（与原 EnterAction 完全一致）
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
    const insertText = plan.insertText.replace(/\n/g, '\r\n')
    if (plan.deletePrefixChars && plan.deletePrefixChars > 0) {
        // 空列表项回车退出列表：删除行首标记后插入换行（光标落到下一行行首）
        replaceSelection(
            editor,
            insertText,
            true,
            new monaco.Range(position.lineNumber, 1, position.lineNumber, position.column)
        )
        return true
    }
    OnInsertAfterCursor(editor, insertText)
    return true
}

function EnterAction(editor: monaco.editor.IStandaloneCodeEditor) {
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
