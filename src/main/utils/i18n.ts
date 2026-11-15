/**
 * CMP-30：主进程 i18n（轻量自研，中英双语）
 *
 * 主进程的对话框使用 HTML 字符串模板（Show*.ts），无法使用 Vue 响应式，
 * 因此提供同步的 tMain()：语言取自系统设置（electron-store），
 * 系统设置写入后由 config-manager 调用 refreshMainLocale() 失效缓存。
 */
import { DEFAULT_LOCALE, resolveLocale, translate, type Locale } from '../../shared/i18n'
import { getSystemSetting } from '../config/system-setting'
import { logger } from './logger'

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
            raw = getSystemSetting()?.language
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
