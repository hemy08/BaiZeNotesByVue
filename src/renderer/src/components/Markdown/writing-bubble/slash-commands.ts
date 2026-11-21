/**
 * Slash 命令菜单 —— 命令定义与执行（P0-6）
 *
 * 复用约定（不复制对话框/菜单/格式化实现）：
 * - 命令数据复用命令面板的 `PaletteCommand` 结构与过滤算法（`filterPaletteCommands`），
 *   不维护第二套过滤/排序逻辑；
 * - 「表格 / 公式 / 图片 / 写作模板 / 链接」直接复用既有菜单动作 id
 *   （`HandleMenuAction`，与菜单栏点击、命令面板同一条分发链路，最终打开既有对话框或
 *   经既有 EventBus 链插入，不复制对话框）；
 * - 「标题 / 分隔线」复用 `hemy-editor-common.ts` 的 `UpdateContextFormat`。
 *
 * i18n：命令文案只存 `labelKey`，渲染时 `t(labelKey)` 输出（I18N-08）；
 * 本轮复用既有 `editorUi.*` / `menu.*` 词条，不新增 i18n 文件改动。
 */

import type * as monaco from 'monaco-editor'
import { UpdateContextFormat, type EventHandleMaps } from '../hemy-editor-common'
import { HandleMenuAction } from '../../MenuBar/menu-actions'
import { filterPaletteCommands, type PaletteCommand } from '../../search/command-registry'

/** Slash 命令的文本格式化样式名（真源：hemy-editor-common 的 EventHandleMaps 键） */
export type SlashFormatStyle = keyof typeof EventHandleMaps

/** 一条 Slash 命令：复用命令面板结构，额外支持「文本格式化」动作 */
export interface SlashCommandDefinition extends PaletteCommand {
    /** 走 UpdateContextFormat 的格式化样式；与 menuAction 二选一 */
    style?: SlashFormatStyle
}

/**
 * Slash 命令清单（需求约定 7 项：标题、表格、公式、图片、模板、分隔线、链接）。
 *
 * 关键字同时包含英文与拼音/中文，保证中文界面输入 `/biaoti` 或 `/表格` 均可命中；
 * 新增命令只需在此数组追加一条（执行动作优先复用 menuAction / style，不写新逻辑）。
 */
export const SLASH_COMMANDS: readonly SlashCommandDefinition[] = [
    {
        id: 'heading',
        labelKey: 'editorUi.toolbar.h1',
        categoryKey: 'editorUi.commandPalette.category.insert',
        keywords: ['heading', 'title', 'h1', 'biaoti', '标题'],
        style: 'h1'
    },
    {
        id: 'table',
        labelKey: 'editorUi.toolbar.insertTable',
        categoryKey: 'editorUi.commandPalette.category.insert',
        keywords: ['table', 'md', 'biaoge', '表格'],
        menuAction: 'baize:menu:insert:md-table'
    },
    {
        id: 'math',
        labelKey: 'menu.insert.math',
        categoryKey: 'editorUi.commandPalette.category.insert',
        keywords: ['math', 'formula', 'latex', 'katex', 'gongshi', '公式', '数学'],
        menuAction: 'baize:menu:insert:math'
    },
    {
        id: 'image',
        labelKey: 'editorUi.toolbar.insertImages',
        categoryKey: 'editorUi.commandPalette.category.insert',
        keywords: ['image', 'img', 'picture', 'tupian', '图片'],
        menuAction: 'baize:menu:insert:image'
    },
    {
        id: 'template',
        labelKey: 'menu.insert.writing',
        categoryKey: 'editorUi.commandPalette.category.insert',
        keywords: ['template', 'writing', 'moban', '模板'],
        // 写作模板插入的既有动作（menu-actions 命中后 emit MONACO_USE_TEMPLATE → 光标处插入）
        menuAction: 'baize:menu:insert:writing:problem-resolving'
    },
    {
        id: 'divider',
        labelKey: 'editorUi.toolbar.lineScan',
        categoryKey: 'editorUi.commandPalette.category.insert',
        keywords: ['divider', 'hr', 'line', 'separator', 'fgx', '分隔线', '水平线'],
        style: 'linescan'
    },
    {
        id: 'link',
        labelKey: 'menu.insert.webLink',
        categoryKey: 'editorUi.commandPalette.category.insert',
        keywords: ['link', 'url', 'lianjie', '链接'],
        menuAction: 'baize:menu:insert:web-link'
    }
]

/**
 * 过滤 Slash 命令（复用命令面板过滤：显示名子串 > id/关键词子串 > 子序列兜底）。
 *
 * @param commands 候选命令（默认 SLASH_COMMANDS；单测可注入替身）
 * @param query `/` 与光标之间的查询文本
 * @param translate i18n 翻译函数（传入 `t`，随语言切换响应式重算）
 */
export function filterSlashCommands<T extends SlashCommandDefinition>(
    commands: readonly T[],
    query: string,
    translate: (key: string) => string
): T[] {
    // filterPaletteCommands 只依赖 PaletteCommand 字段，返回同一批对象；此处按泛型还原子类型。
    return filterPaletteCommands(commands, query, translate) as T[]
}

/**
 * 执行一条 Slash 命令（调用方负责先删除 `/query` 触发文本）。
 *
 * @returns true = 已分发；false = 命令定义不完整未执行
 */
export function executeSlashCommand(
    editor: monaco.editor.IStandaloneCodeEditor,
    command: SlashCommandDefinition
): boolean {
    if (command.style) {
        UpdateContextFormat(editor, command.style)
        return true
    }
    if (command.menuAction) {
        HandleMenuAction(command.menuAction)
        return true
    }
    return false
}
