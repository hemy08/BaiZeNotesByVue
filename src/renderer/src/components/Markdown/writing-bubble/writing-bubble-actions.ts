/**
 * 写作气泡工具栏 —— 按钮定义与执行（P0-6）
 *
 * 复用约定（不复制格式化实现）：所有按钮最终都归到既有链路：
 * - 文本格式（加粗/斜体/删除线/行内代码/标题/列表/引用）→ `hemy-editor-common.ts`
 *   的 `UpdateContextFormat(editor, style)`（与编辑工具栏同一入口，`style` 取自
 *   `EventHandleMaps` 的键，类型层保证不会写错样式名）；
 * - 链接 → `menu-actions.ts` 的 `HandleMenuAction('baize:menu:insert:web-link')`
 *   （与插入菜单同一分发链路 → 打开既有 WebUrlDialog → EventBus 插入）。
 */

import type * as monaco from 'monaco-editor'
import { UpdateContextFormat, type EventHandleMaps } from '../hemy-editor-common'
import { HandleMenuAction } from '../../MenuBar/menu-actions'

/** 文本格式化样式名（真源：hemy-editor-common 的 EventHandleMaps 键） */
export type BubbleFormatStyle = keyof typeof EventHandleMaps

/** 按钮动作类型：format = 文本格式化；menu = 既有菜单动作 */
export type BubbleButtonKind = 'format' | 'menu'

/** 气泡工具栏按钮定义（只含展示信息与既有动作引用，不含格式化实现） */
export interface BubbleButtonDefinition {
    /** 稳定按钮 id（供 data-action、单测与后续快捷键映射使用） */
    id: string
    /** 无障碍名称 / tooltip 文案的 i18n 键（复用 editorUi.toolbar.* 既有词条） */
    labelKey: string
    /** 按钮显示字形（纯文本，避免引入 SVG 注入面 / v-html） */
    glyph: string
    /** 动作类型 */
    kind: BubbleButtonKind
    /** kind=format：UpdateContextFormat 的样式名 */
    style?: BubbleFormatStyle
    /** kind=menu：既有菜单动作 id（与 menu-config / menu-actions 同源） */
    menuAction?: string
}

/**
 * 气泡工具栏按钮顺序（与需求一致）：
 * 加粗 / 斜体 / 删除线 / 行内代码 / 链接 / 标题 1~3 / 无序列表 / 有序列表 / 引用。
 */
export const BUBBLE_BUTTONS: readonly BubbleButtonDefinition[] = [
    { id: 'bold', labelKey: 'editorUi.toolbar.bold', glyph: 'B', kind: 'format', style: 'bold' },
    {
        id: 'italic',
        labelKey: 'editorUi.toolbar.italic',
        glyph: 'I',
        kind: 'format',
        style: 'italic'
    },
    {
        id: 'deleteline',
        labelKey: 'editorUi.toolbar.deleteLine',
        glyph: 'S',
        kind: 'format',
        style: 'deleteline'
    },
    {
        id: 'codeline',
        labelKey: 'editorUi.toolbar.codeLine',
        glyph: '</>',
        kind: 'format',
        style: 'codeline'
    },
    {
        id: 'link',
        labelKey: 'editorUi.toolbar.webLinks',
        glyph: '🔗',
        kind: 'menu',
        menuAction: 'baize:menu:insert:web-link'
    },
    { id: 'h1', labelKey: 'editorUi.toolbar.h1', glyph: 'H1', kind: 'format', style: 'h1' },
    { id: 'h2', labelKey: 'editorUi.toolbar.h2', glyph: 'H2', kind: 'format', style: 'h2' },
    { id: 'h3', labelKey: 'editorUi.toolbar.h3', glyph: 'H3', kind: 'format', style: 'h3' },
    {
        id: 'listbulleted',
        labelKey: 'editorUi.toolbar.listBulleted',
        glyph: '•',
        kind: 'format',
        style: 'listbulleted'
    },
    {
        id: 'listnumbered',
        labelKey: 'editorUi.toolbar.listNumbered',
        glyph: '1.',
        kind: 'format',
        style: 'listnumbered'
    },
    {
        id: 'quote',
        labelKey: 'editorUi.toolbar.quote',
        glyph: '>',
        kind: 'format',
        style: 'fontquote'
    }
]

/**
 * 执行一个气泡按钮动作。
 *
 * @returns true = 已分发；false = 按钮定义不完整（缺 style/menuAction）未执行
 */
export function executeBubbleAction(
    editor: monaco.editor.IStandaloneCodeEditor,
    button: BubbleButtonDefinition
): boolean {
    if (button.kind === 'format' && button.style) {
        UpdateContextFormat(editor, button.style)
        return true
    }
    if (button.kind === 'menu' && button.menuAction) {
        HandleMenuAction(button.menuAction)
        return true
    }
    return false
}
