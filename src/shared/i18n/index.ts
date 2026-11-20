/**
 * CMP-30：i18n 统一入口（主进程 / 渲染层 / 测试共用）
 *
 * 词典按键的命名空间组织：`<namespace>.<key...>`，例如 `common.ok`、
 * `menu.file.new`。translate 在目标语言缺失时回落默认语言（中文），
 * 再缺失时返回键名本身（便于测试与排查未翻译项）。
 *
 * P1-3（2026-11-20 首屏 i18n 拆包）：
 * - 本模块不再静态 import 中英两套共 24 个消息文件（此前它们被打进 index.html
 *   modulepreload 的首屏共享 chunk，实测 348.5 KiB，单语用户白加载另一语言）；
 * - 词典由 `messages/<locale>/index.ts` 聚合，运行时经 `loadLocale(locale)` 加载：
 *   **动态 import 由使用方注册加载器**（渲染层在 `common/i18n.ts` 注册 = Vite 按语言
 *   拆成独立 chunk，首屏只装当前语言；主进程在 `main/utils/i18n.ts` 静态注册两套词典，
 *   保持 tMain 同步可用——主进程不在首屏预算内）；
 * - 之所以把 `import()` 放在使用方而不是本文件：`tsconfig.node.json` 使用 NodeNext
 *   模块解析，shared 内的动态 import 相对路径会被 TS2834 拒绝；同时本文件同时被
 *   main/renderer/test 三套 tsconfig 检查，把加载器下沉到进程侧也更符合「shared 纯数据/
 *   纯函数边界」；
 * - `translate()` 保持同步签名：调用方需保证目标语言已加载（渲染层在 App 挂载前
 *   await initI18n 内的 loadLocale）；
 * - `MESSAGES` 保留为「已加载词典」的同步视图（供测试/主进程使用），未加载的语言
 *   不会出现在其键中；加载状态用 `hasLocaleMessages()` / `getMessages()` 查询。
 */
import type { Locale, MessageNode } from './types'

export type { Locale } from './types'

/** 默认语言：中文（保持现有界面零变化） */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** 支持的语言列表（仅中英双语） */
export const SUPPORTED_LOCALES: ReadonlyArray<Locale> = ['zh-CN', 'en-US']

/** 语言词典动态加载器（返回 `{ default: MessageNode }`，即 messages/<locale>/index.ts 的默认导出） */
export type LocaleLoader = () => Promise<{ default: MessageNode }>

/**
 * 已加载词典（按语言懒加载；未加载语言的键不存在）。
 * 说明：类型上声明为 `Record<Locale, MessageNode>` 以兼容既有同步读法（主进程/测试），
 * 渲染层运行时应先经 `loadLocale` 保证目标语言存在，或先用 `hasLocaleMessages` 判断。
 */
const loadedMessages: Partial<Record<Locale, MessageNode>> = {}

/** 已加载词典的同步视图（键 = 已加载语言） */
export const MESSAGES = loadedMessages as Record<Locale, MessageNode>

/** 语言 → 动态加载器（由渲染层在模块加载时注册，见 src/renderer/src/common/i18n.ts） */
const localeLoaders = new Map<Locale, LocaleLoader>()

/** 进行中的语言加载（并发去重：同一语言只会加载一次） */
const pendingLoads = new Map<Locale, Promise<void>>()

/** 指定语言的词典是否已加载（同步查询） */
export function hasLocaleMessages(locale: Locale): boolean {
    return loadedMessages[locale] !== undefined
}

/** 读取已加载的词典；未加载返回 undefined（同步，不触发加载） */
export function getMessages(locale: Locale): MessageNode | undefined {
    return loadedMessages[locale]
}

/**
 * 注册某语言的动态加载器（渲染层在模块加载时调用，指向 `messages/<locale>` 聚合入口）。
 * 同一语言重复注册以最后一次为准（幂等覆盖，便于测试注入替身）。
 */
export function registerLocaleLoader(locale: Locale, loader: LocaleLoader): void {
    localeLoaders.set(locale, loader)
}

/**
 * 同步注册某语言词典（主进程 tMain / 单测预载使用）。
 * 渲染层走 `loadLocale()` 动态加载，不要调用本函数（否则会把词典重新拉回首屏闭包）。
 */
export function registerLocaleMessages(locale: Locale, messages: MessageNode): void {
    loadedMessages[locale] = messages
}

/**
 * 加载指定语言词典（幂等 + 并发去重）。
 * 未注册加载器或加载失败时抛出原始异常（调用方决定回落默认语言还是继续；渲染层会回落 zh-CN）。
 */
export async function loadLocale(locale: Locale): Promise<void> {
    if (loadedMessages[locale]) return
    const pending = pendingLoads.get(locale)
    if (pending) return pending
    const loader = localeLoaders.get(locale)
    if (!loader) {
        throw new Error(`[i18n] 语言 ${locale} 未注册词典加载器（渲染层见 registerLocaleLoader）`)
    }
    const task = loader()
        .then((module) => {
            loadedMessages[locale] = module.default
        })
        .finally(() => {
            pendingLoads.delete(locale)
        })
    pendingLoads.set(locale, task)
    return task
}

/**
 * 加载全部支持语言的词典。
 * 仅用于测试预载 / 需要双语同步可用的场景；渲染层首屏禁止调用（否则失去拆包收益）。
 * 已加载的语言直接跳过（此时不要求加载器已注册）。
 */
export async function loadAllLocales(): Promise<void> {
    await Promise.all(SUPPORTED_LOCALES.map((locale) => loadLocale(locale)))
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
 * 翻译函数（同步）。
 * @param key 形如 `common.ok` 的点分键
 * @param locale 目标语言（缺省默认语言）
 * @param params 插值参数：词典中 `{name}` 会被替换
 *
 * 注意：目标语言词典尚未加载时（例如渲染层首屏加载前调用），目标语言查不到会回落到
 * 已加载的默认语言；两者都未加载时返回键名。渲染层已保证 App 挂载前完成当前语言加载。
 */
export function translate(
    key: string,
    locale?: Locale,
    params?: Record<string, string | number>
): string {
    const target = locale ?? DEFAULT_LOCALE
    const parts = key.split('.')
    let text = deepGet(getMessages(target), parts)
    if (text === undefined && target !== DEFAULT_LOCALE) {
        text = deepGet(getMessages(DEFAULT_LOCALE), parts)
    }
    if (text === undefined) return key
    if (!params) return text
    return text.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name])
    )
}
