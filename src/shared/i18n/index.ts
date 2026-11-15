/**
 * CMP-30：i18n 统一入口（主进程 / 渲染层 / 测试共用）
 *
 * 词典按键的命名空间组织：`<namespace>.<key...>`，例如 `common.ok`、
 * `menu.file.new`。translate 在目标语言缺失时回落默认语言（中文），
 * 再缺失时返回键名本身（便于测试与排查未翻译项）。
 */
import zhCommon from './messages/zh-CN/common'
import zhMenu from './messages/zh-CN/menu'
import zhStatus from './messages/zh-CN/status'
import zhWorkspace from './messages/zh-CN/workspace'
import zhDialogRenderer from './messages/zh-CN/dialogRenderer'
import zhDialogMain from './messages/zh-CN/dialogMain'
import zhMainMsg from './messages/zh-CN/mainMsg'
import zhEditorUi from './messages/zh-CN/editorUi'
import zhToolsConvert from './messages/zh-CN/toolsConvert'
import zhToolsNetwork from './messages/zh-CN/toolsNetwork'
import zhSettings from './messages/zh-CN/settings'
import zhThemeNames from './messages/zh-CN/themeNames'

import enCommon from './messages/en-US/common'
import enMenu from './messages/en-US/menu'
import enStatus from './messages/en-US/status'
import enWorkspace from './messages/en-US/workspace'
import enDialogRenderer from './messages/en-US/dialogRenderer'
import enDialogMain from './messages/en-US/dialogMain'
import enMainMsg from './messages/en-US/mainMsg'
import enEditorUi from './messages/en-US/editorUi'
import enToolsConvert from './messages/en-US/toolsConvert'
import enToolsNetwork from './messages/en-US/toolsNetwork'
import enSettings from './messages/en-US/settings'
import enThemeNames from './messages/en-US/themeNames'

import type { Locale, MessageNode } from './types'

export type { Locale } from './types'

/** 默认语言：中文（保持现有界面零变化） */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** 支持的语言列表（仅中英双语） */
export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ['zh-CN', 'en-US']

const zhMessages: MessageNode = {
    common: zhCommon,
    menu: zhMenu,
    status: zhStatus,
    workspace: zhWorkspace,
    dialogRenderer: zhDialogRenderer,
    dialogMain: zhDialogMain,
    mainMsg: zhMainMsg,
    editorUi: zhEditorUi,
    toolsConvert: zhToolsConvert,
    toolsNetwork: zhToolsNetwork,
    settings: zhSettings,
    themeNames: zhThemeNames
}

const enMessages: MessageNode = {
    common: enCommon,
    menu: enMenu,
    status: enStatus,
    workspace: enWorkspace,
    dialogRenderer: enDialogRenderer,
    dialogMain: enDialogMain,
    mainMsg: enMainMsg,
    editorUi: enEditorUi,
    toolsConvert: enToolsConvert,
    toolsNetwork: enToolsNetwork,
    settings: enSettings,
    themeNames: enThemeNames
}

export const MESSAGES: Record<Locale, MessageNode> = {
    'zh-CN': zhMessages,
    'en-US': enMessages
}

/**
 * 归一化语言标识：兼容历史值（'zh-cn' / 'en-us' / 'en' / 'zh'）与空值。
 * 空值或无法识别时回落默认语言。
 */
export function resolveLocale(raw?: string | null): Locale {
    const value = String(raw ?? '')
        .trim()
        .toLowerCase()
    if (value.startsWith('en')) return 'en-US'
    if (value.startsWith('zh')) return 'zh-CN'
    return DEFAULT_LOCALE
}

function deepGet(node: MessageNode | undefined, parts: string[]): string | undefined {
    let current: unknown = node
    for (const part of parts) {
        if (current === null || typeof current !== 'object') return undefined
        current = (current as Record<string, unknown>)[part]
    }
    return typeof current === 'string' ? current : undefined
}

/**
 * 翻译函数。
 * @param key 形如 `common.ok` 的点分键
 * @param locale 目标语言（缺省默认语言）
 * @param params 插值参数：词典中 `{name}` 会被替换
 */
export function translate(
    key: string,
    locale?: Locale,
    params?: Record<string, string | number>
): string {
    const target = locale ?? DEFAULT_LOCALE
    const parts = key.split('.')
    let text = deepGet(MESSAGES[target], parts)
    if (text === undefined && target !== DEFAULT_LOCALE) {
        text = deepGet(MESSAGES[DEFAULT_LOCALE], parts)
    }
    if (text === undefined) return key
    if (!params) return text
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name])
    )
}
