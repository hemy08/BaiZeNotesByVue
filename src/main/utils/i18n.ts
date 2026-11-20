/**
 * CMP-30：主进程 i18n（轻量自研，中英双语）
 *
 * 主进程的对话框使用 HTML 字符串模板（Show*.ts），无法使用 Vue 响应式，
 * 因此提供同步的 tMain()：语言取自系统设置（electron-store），
 * 系统设置写入后由 config-manager 调用 refreshMainLocale() 失效缓存。
 *
 * P1-3（2026-11-20 首屏 i18n 拆包）：
 * shared/i18n 改为按语言动态加载后，渲染层首屏只装当前语言；主进程不在首屏预算内，
 * 且 tMain() 必须同步可用（`config/editor-setting.ts` 等在模块加载期就会调用），
 * 因此这里保持改造前的行为——模块加载时同步注册中英两套词典，tMain 语义零变化。
 */
import {
    DEFAULT_LOCALE,
    registerLocaleMessages,
    resolveLocale,
    translate,
    type Locale
} from '../../shared/i18n'
import zhMessages from '../../shared/i18n/messages/zh-CN'
import enMessages from '../../shared/i18n/messages/en-US'
// 结构优化 1.1（H1）：语言设置读取改为注入（main/index.ts 启动早期注入 config 实现），
// utils 不再静态 import config，消除 utils → config 反向依赖。
import { getSystemSettingFromProvider } from './providers'
import { logger } from './logger'

// 主进程同步翻译所需：模块加载即注册两套词典（不做动态 import，保证 tMain 同步可用）。
// 注意：仅主进程调用；渲染层必须走 shared/i18n.loadLocale 按需加载，否则首屏拆包失效。
registerLocaleMessages('zh-CN', zhMessages)
registerLocaleMessages('en-US', enMessages)

let cachedLocale: Locale | null = null

/** 使语言缓存失效（系统设置中 language 变更后调用） */
export function refreshMainLocale(): void {
    cachedLocale = null
}

/** 当前主进程语言 */
export function getMainLocale(): Locale {
    if (cachedLocale === null) {
        let raw: string | undefined
        try {
            raw = getSystemSettingFromProvider()?.language
        } catch (error) {
            logger.warn('[i18n] 读取系统语言失败，使用默认语言', error)
        }
        cachedLocale = resolveLocale(raw) ?? DEFAULT_LOCALE
    }
    return cachedLocale
}

/** 主进程翻译：tMain('dialogMain.xxx.yyy') */
export function tMain(key: string, params?: Record<string, string | number>): string {
    return translate(key, getMainLocale(), params)
}
