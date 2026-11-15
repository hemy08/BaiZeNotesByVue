/**
 * CMP-30：渲染层 i18n（轻量自研，中英双语）
 *
 * - currentLocale 为响应式 ref：模板中调用 t() 会读取它，切换语言即触发重渲染；
 * - 初始语言来自系统设置（config:read 'system'），并监听主进程的
 *   system-setting-update 广播实时切换；
 * - 默认语言 zh-CN，词典与主进程共享 src/shared/i18n，保证同一 key 输出一致。
 */
import { ref } from 'vue'
import { DEFAULT_LOCALE, resolveLocale, translate, type Locale } from '../../../shared/i18n'
import { IPC } from '../../../shared/ipc-channels'
import { logger } from './logger'

/** 当前界面语言（响应式） */
export const currentLocale = ref<Locale>(DEFAULT_LOCALE)

/** 翻译函数：在模板/脚本中直接使用 t('common.ok') */
export function t(key: string, params?: Record<string, string | number>): string {
    return translate(key, currentLocale.value, params)
}

/** 设置当前语言（自动归一化历史写法） */
export function setLocale(raw?: string | null): void {
    const next = resolveLocale(raw)
    if (currentLocale.value !== next) {
        currentLocale.value = next
    }
}

/** 读取当前语言 */
export function getLocale(): Locale {
    return currentLocale.value
}

let initialized = false

/**
 * 初始化语言：读取系统设置 + 订阅主进程语言变更广播。
 * 幂等：重复调用只生效一次。
 */
export async function initI18n(): Promise<void> {
    if (initialized) return
    initialized = true

    try {
        const systemConfig = await window.api.config.read<{ language?: string }>('system')
        if (systemConfig && systemConfig.language) {
            setLocale(systemConfig.language)
        }
    } catch (error) {
        // 读取失败不阻塞启动，回落默认语言
        logger.warn('[i18n] 读取系统语言设置失败，使用默认语言', error)
    }

    try {
        window.electron.ipcRenderer.on(
            IPC.EDITOR.SYSTEM_SETTING_UPDATE,
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
