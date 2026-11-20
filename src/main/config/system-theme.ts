/**
 * 批次 B #7：跟随系统主题
 *
 * nativeTheme.on('updated') 监听：useSystemTheme 开启时，按 nativeTheme.shouldUseDarkColors
 * 选择语义对应的应用主题并立即应用 + 广播（广播载荷经 buildThemeBroadcastPayload 统一组装、
 * 经 utils/theme-broadcast.ts 的 broadcastThemeToAllWindows 唯一广播实现发出）：
 * - 深色 → 'dark'（主题注册表中的「深邃夜空」，theme-config.ts themes.dark，确实存在）；
 * - 浅色 → 'light'（主题注册表中的「清新简约」，theme-config.ts themes.light，确实存在）；
 * 若未来注册表移除这两个主题，resolveSystemTheme 经 isKnownThemeType 防御性回退默认主题
 * 'baize'（DEFAULT_THEME_TYPE），不会向 store 写入非法主题值。
 *
 * 互斥语义（config-manager.applyThemeConfig）：用户经主题设置对话框手动切换主题时，
 * 主进程自动把 useSystemTheme 置 false，避免下次系统主题变化又把手动主题覆盖掉。
 * 本模块自身只负责「跟随」路径，不参与互斥判断。
 */
import { nativeTheme } from 'electron'
import { getSystemSetting } from './system-setting'
import {
    DEFAULT_THEME_TYPE,
    getCurrentTheme,
    getCurrentThemeStyles,
    getMonacoTheme,
    getSeparateEditorTheme,
    isKnownThemeType,
    setThemeConfig
} from './theme-config'
import type { ThemeType } from './theme-config'
// 2026-11-19：载荷统一经 buildThemeBroadcastPayload 组装（shared ThemeUpdateData 契约），
// 发送统一经 broadcastThemeToAllWindows（主进程唯一广播实现）
// 2026-11-20（P1-1）：广播实现已从 ipc/theme-broadcast 迁到中性层 utils/theme-broadcast，
// config 层不再静态 import ipc/**（消除 config → ipc 反向依赖）
import { broadcastThemeToAllWindows, buildThemeBroadcastPayload } from '../utils/theme-broadcast'
import { logger } from '../utils/logger'

/** 系统深色对应的应用主题（theme-config 注册表中的「深邃夜空」） */
const SYSTEM_DARK_THEME: ThemeType = 'dark'
/** 系统浅色对应的应用主题（theme-config 注册表中的「清新简约」） */
const SYSTEM_LIGHT_THEME: ThemeType = 'light'

/** 按当前系统深浅色解析目标主题；注册表缺失时回退默认主题（防御性兜底） */
function resolveSystemTheme(): ThemeType {
    const candidate: ThemeType = nativeTheme.shouldUseDarkColors
        ? SYSTEM_DARK_THEME
        : SYSTEM_LIGHT_THEME
    return isKnownThemeType(candidate) ? candidate : DEFAULT_THEME_TYPE
}

/**
 * 立即应用一次系统主题（useSystemTheme 开启时）。
 * 关闭时不动作：保持用户最后看到的手动主题，避免「关闭跟随」引发一次意外换肤。
 */
export function applySystemThemeNow(): void {
    if (getSystemSetting().useSystemTheme !== true) {
        return
    }
    const target = resolveSystemTheme()
    // P3（审查）：脏检查——系统主题事件在深浅色未变化时也会重复触发（如系统
    // 亮度微调），当前主题与目标一致时跳过写盘与广播，避免无意义的 store 写入
    // 与渲染层换肤。
    if (getCurrentTheme() === target) {
        return
    }
    setThemeConfig({ currentTheme: target })
    broadcastThemeToAllWindows(
        buildThemeBroadcastPayload(
            getCurrentThemeStyles(),
            getMonacoTheme(),
            getSeparateEditorTheme()
        )
    )
    logger.info(`[SystemTheme] 已跟随系统主题切换为 ${target}`)
}

let updateListener: (() => void) | null = null

/**
 * 启动系统主题跟随监听（app.whenReady 后调用；单例注册防重复）。
 * 启动时立即对齐一次：应用关闭期间系统深浅色可能已变化。
 */
export function startSystemThemeWatcher(): void {
    if (updateListener) {
        return
    }
    updateListener = (): void => applySystemThemeNow()
    nativeTheme.on('updated', updateListener)
    applySystemThemeNow()
}

/** 停止跟随监听（挂入 cleanupApp，随应用退出清理；幂等） */
export function stopSystemThemeWatcher(): void {
    if (!updateListener) {
        return
    }
    nativeTheme.removeListener('updated', updateListener)
    updateListener = null
}
