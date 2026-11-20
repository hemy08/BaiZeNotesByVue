/**
 * CMP-30：渲染层 i18n（轻量自研，中英双语）
 *
 * - currentLocale 为响应式 ref：模板中调用 t() 会读取它，切换语言即触发重渲染；
 * - 初始语言来自系统设置（config:read 'system'），并监听主进程的
 *   system-setting-update 广播实时切换；
 * - 默认语言 zh-CN，词典与主进程共享 src/shared/i18n，保证同一 key 输出一致。
 *
 * P1-3（2026-11-20 首屏 i18n 拆包）：
 * - 词典改为按语言动态加载（shared/i18n.loadLocale）：`initI18n()` 在 App 挂载前先
 *   读取系统语言并 **await 加载当前语言词典**，保证首屏 t() 同步可用且不出现空文案闪烁；
 * - 首屏只加载当前语言（中/英各为独立 chunk），另一语言在语言切换时按需加载；
 * - `t()` / `setLocale()` 同步接口保持不变：切换目标语言已加载时 setLocale 同步生效
 *   （测试与二次切换路径），未加载时异步加载完成后经 currentLocale ref 触发响应式更新。
 */
import { ref } from 'vue'
import {
    DEFAULT_LOCALE,
    hasLocaleMessages,
    loadLocale,
    registerLocaleLoader,
    resolveLocale,
    translate,
    type Locale
} from '../../../shared/i18n'
import { IPC } from '../../../shared/ipc-channels'
import { logger } from './logger'

/**
 * P1-3：当前语言词典的**动态加载器**只在这里出现（Vite/Rollup 按语言拆成独立 chunk）。
 * 首屏 initI18n 只加载当前语言；另一语言在语言切换时按需加载。
 * 注意：主进程不走这里（main/utils/i18n.ts 静态注册两套以保持 tMain 同步）。
 */
registerLocaleLoader('zh-CN', () => import('../../../shared/i18n/messages/zh-CN'))
registerLocaleLoader('en-US', () => import('../../../shared/i18n/messages/en-US'))

/** 当前界面语言（响应式） */
export const currentLocale = ref<Locale>(DEFAULT_LOCALE)

/**
 * 最近一次语言切换的加载任务（语言未加载时）。
 * 启动流程与测试可用 `waitForLocaleReady()` 等待其完成；正常已加载路径立即 resolve。
 */
let pendingLocaleLoad: Promise<void> = Promise.resolve()

/** 语言切换请求序号：并发切换时只有最后一次请求允许生效（防止慢加载回写旧语言） */
let localeRequestSeq = 0

/** 翻译函数：在模板/脚本中直接使用 t('common.ok') */
export function t(key: string, params?: Record<string, string | number>): string {
    return translate(key, currentLocale.value, params)
}

/** 确保指定语言词典可用；加载失败返回 false（不抛错，由调用方决定回落策略） */
async function ensureLocaleMessages(locale: Locale): Promise<boolean> {
    if (hasLocaleMessages(locale)) return true
    try {
        await loadLocale(locale)
        return true
    } catch (error) {
        logger.warn(`[i18n] 加载语言词典失败（${locale}），尝试回落默认语言`, error)
        return false
    }
}

/**
 * 应用语言：先确保词典可用，再更新响应式 currentLocale（顺序保证不出现键名闪烁）。
 * @param requestSeq 语言切换请求序号；非最新请求直接放弃（防止并发切换回写旧语言）
 */
async function applyLocale(locale: Locale, requestSeq: number): Promise<void> {
    let target = locale
    if (!(await ensureLocaleMessages(target))) {
        // 目标语言词典加载失败：回落默认语言（默认语言也可能失败，此时保持现状不切换）
        if (target === DEFAULT_LOCALE) return
        target = DEFAULT_LOCALE
        if (!(await ensureLocaleMessages(target))) return
    }
    if (requestSeq !== localeRequestSeq) return
    if (currentLocale.value !== target) {
        currentLocale.value = target
    }
}

/**
 * 设置当前语言（自动归一化历史写法）。
 * 目标语言词典已加载时同步生效；未加载时异步加载，完成后经 currentLocale 响应式更新。
 * 返回值保持 void（既有调用点零改动），需要等待完成时使用 waitForLocaleReady()。
 */
export function setLocale(raw?: string | null): void {
    const next = resolveLocale(raw)
    localeRequestSeq += 1
    if (next === currentLocale.value && hasLocaleMessages(next)) return
    if (hasLocaleMessages(next)) {
        currentLocale.value = next
        pendingLocaleLoad = Promise.resolve()
        return
    }
    pendingLocaleLoad = applyLocale(next, localeRequestSeq)
}

/** 等待最近一次语言切换（词典按需加载）完成；无待处理切换时立即 resolve */
export function waitForLocaleReady(): Promise<void> {
    return pendingLocaleLoad
}

/** 读取当前语言 */
export function getLocale(): Locale {
    return currentLocale.value
}

let initialized = false

/**
 * 初始化语言：读取系统设置 → 加载当前语言词典 → 订阅主进程语言变更广播。
 * 幂等：重复调用只生效一次。
 *
 * 关键时序：`await` 词典加载完成后才 resolve；`src/renderer/src/main.ts` 在
 * initI18n() resolve 后才 mount，因此首屏第一次渲染时 t() 必为当前语言（无闪烁）。
 */
export async function initI18n(): Promise<void> {
    if (initialized) return
    initialized = true

    let initialLocale: Locale = DEFAULT_LOCALE
    try {
        const systemConfig = await window.api.config.read<{ language?: string }>('system')
        initialLocale = resolveLocale(systemConfig?.language)
    } catch (error) {
        // 读取失败不阻塞启动，回落默认语言
        logger.warn('[i18n] 读取系统语言设置失败，使用默认语言', error)
    }

    // P1-3：首屏只加载当前语言词典；加载完成后才允许挂载，避免空文案/键名闪烁
    localeRequestSeq += 1
    pendingLocaleLoad = applyLocale(initialLocale, localeRequestSeq)
    await pendingLocaleLoad

    try {
        window.electron.ipcRenderer.on(
            IPC.SETTING.SYSTEM_SETTING_UPDATE,
            (_event: unknown, setting: { language?: string } | undefined) => {
                if (setting && typeof setting.language === 'string') {
                    setLocale(setting.language)
                }
            }
        )
    } catch (error) {
        logger.warn('[i18n] 订阅语言变更失败', error)
    }
}
