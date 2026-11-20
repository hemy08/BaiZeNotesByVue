/**
 * 系统设置对话框 —— 共享表单状态 composable（设置页拆分 P0）
 *
 * 4 个页签（general/file/appearance/backup）拆分前共用对话框内的一份 `settings` 草稿
 * 与 `initialSettings` 快照；拆分后草稿 / 加载 / 保存 / 取消 / 脏标记 / 校验职责收敛到本
 * composable，壳层 SystemSettingDialog.vue 只保留 activePanel、侧边栏、footer 与 IPC 编排。
 *
 * 对外契约（拆分前后等价）：
 * - `settings`：草稿（响应式，唯一一份，4 个 panel 通过 `:settings` + `@update` 读写）；
 * - `loadSettings()`：`config:read('system')` → 逐字段合并 → 语言归一化 → 记录初始值，
 *   随后刷新「外观-应用主题」只读显示名（独立 try/catch，失败不影响设置加载）；
 * - `saveSettings()`：写 `config:write('system', 快照)` 并返回提交快照（null 表示保存失败），
 *   由壳层 emit apply；P2 功能错误处理修复后改为 **await 写结果**：主进程 AS-4 校验拒绝时
 *   返回 false、IPC 异常时 reject，两种失败都经统一 helper 弹错误对话框并返回 null
 *   （壳层据此不关闭对话框、不 emit apply，用户可原地重试）；保存前仅做诊断校验
 *   （越界 warn 日志，不阻断、不改值）；
 * - `resetSettings()`：取消时恢复打开时加载值（不写配置）；
 * - `isDirty`：草稿与初始值的差异（仅供契约测试 / 后续 UI 使用，当前不绑定视觉）。
 *
 * 默认值真源仍为主进程 system-setting.ts 的 shared 兜底常量（见 ./model.ts）。
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { IPC } from '../../../../../../shared/ipc-channels'
// 第 2 批契约重构：配置读取形状统一引用 shared 真源（theme / system 两类）。
// 主题列表项与主题设置对话框共用 shared ThemeListItem（types/theme.ts）。
import type { AppThemeConfig, SystemSetting, ThemeListItem } from '../../../../../../shared/types'
import { t } from '../../../../common/i18n'
import { logger } from '../../../../common/logger'
import { describeActionError, reportActionFailure } from '../../../../common/action-feedback'
import {
    createDefaultSystemDialogSettings,
    isSystemSettingsDirty,
    mergeStoredSystemSettings,
    normalizeLanguageSelection,
    validateDialogSettings,
    type SystemDialogSettings
} from './model'

/** useSystemSettingForm 的返回值（壳层与测试共用同一份契约） */
export interface SystemSettingForm {
    /** 草稿（4 个 panel 共享的唯一数据源） */
    settings: Ref<SystemDialogSettings>
    /** 外观页签只读展示的应用主题显示名（i18n 映射后） */
    appThemeDisplay: Ref<string>
    /**
     * P2 剩余静默失败提示：应用主题显示名是否因读取失败而回退。
     * 为 true 时外观页签显示内联降级提示（非阻断，不弹窗打断设置浏览）。
     */
    appThemeDisplayFallback: Ref<boolean>
    /** 草稿是否偏离打开时的加载值 */
    isDirty: ComputedRef<boolean>
    /** 打开对话框时加载主进程配置 + 主题显示名 */
    loadSettings: () => Promise<void>
    /** 应用草稿：写 system 配置并返回提交快照；保存失败时弹错误提示并返回 null */
    saveSettings: () => Promise<SystemDialogSettings | null>
    /** 取消：恢复打开时加载值（不写配置） */
    resetSettings: () => void
}

export function useSystemSettingForm(): SystemSettingForm {
    // 初始状态（也用于取消时恢复）：默认值/映射逻辑见 ./model.ts。
    const initialSettings = ref<SystemDialogSettings>(createDefaultSystemDialogSettings())
    const settings = ref<SystemDialogSettings>({ ...initialSettings.value })
    const isDirty = computed(() => isSystemSettingsDirty(settings.value, initialSettings.value))

    /**
     * 批次 C #10：应用主题收口（方案 A）——只读展示当前主题显示名，
     * 数据来自 config:read('theme')（主进程 theme-config 真源）经既有
     * IPC.THEME.GET_ALL_THEMES 通道映射 i18n 显示名；两个通道均为既有通道，
     * 不新增 IPC。
     *
     * P2 剩余静默失败提示：读取失败此前只写日志（显示名停留在初始值，用户可能误读为
     * 真实主题名）。现回退显示「未知」并置 fallback 标记，由外观页签渲染一行内联降级提示
     * （非阻断；重新打开设置会再次读取，用户无需处理弹窗）。
     */
    const appThemeDisplay = ref('baize')
    const appThemeDisplayFallback = ref(false)

    async function loadThemeDisplay(): Promise<void> {
        appThemeDisplayFallback.value = false
        try {
            const themeConfig = await window.api.config.read<AppThemeConfig>('theme')
            const current = themeConfig?.currentTheme || 'baize'
            const allThemes: unknown = await window.electron.ipcRenderer.invoke(
                IPC.THEME.GET_ALL_THEMES
            )
            if (Array.isArray(allThemes)) {
                const found = (allThemes as ThemeListItem[]).find((item) => item?.type === current)
                const styles = found?.styles
                if (styles?.nameKey) {
                    appThemeDisplay.value = t(styles.nameKey)
                    return
                }
                if (typeof styles?.name === 'string' && styles.name) {
                    appThemeDisplay.value = styles.name
                    return
                }
            }
            appThemeDisplay.value = current
        } catch (error) {
            logger.error('读取当前主题显示名失败:', error)
            appThemeDisplay.value = t('common.unknown')
            appThemeDisplayFallback.value = true
        }
    }

    // ARC-04：打开对话框时从主进程 systemSetting.json 读取当前值
    // （config:read('system') 已由 config-manager 路由到主进程 store），
    // 只合并返回中已定义的字段，未返回的字段保持默认值。
    async function loadSettings(): Promise<void> {
        try {
            // 第 2 批契约重构：主进程 'system' 实际返回完整 SystemSetting（含 autoStart 的
            // OS 校正值），旧断言 Partial<SystemDialogSettings> 只是它的子集；改为 shared 真源后
            // 下方逐字段守卫语义不变（仅类型标注变化，不改变运行时合并逻辑）。
            const stored = await window.api.config.read<SystemSetting>('system')
            // 5.5：逐字段合并（已定义且类型一致才覆盖）抽为纯函数 mergeStoredSystemSettings
            settings.value = mergeStoredSystemSettings(settings.value, stored)
            // 语言历史值归一化（主进程默认 'zh-cn'，下拉选项值为 'zh-CN' / 'en-US'）
            settings.value.language = normalizeLanguageSelection(settings.value.language)
            // 记录加载后的初始状态，供「取消」还原
            initialSettings.value = { ...settings.value }
        } catch (error) {
            logger.error('加载系统设置失败:', error)
        }
        // 批次 C #10：应用主题只读显示——读取当前主题显示名（独立 try/catch，失败不影响设置加载）
        await loadThemeDisplay()
    }

    async function saveSettings(): Promise<SystemDialogSettings | null> {
        const snapshot: SystemDialogSettings = { ...settings.value }
        // 设置页拆分 P0：保存前诊断校验（越界/未知枚举只记 warn，不阻断保存、不改值；
        // 强制校验仍由主进程 AS-4 config-schema 承担，行为与拆分前一致）。
        const issues = validateDialogSettings(snapshot)
        if (issues.length > 0) {
            logger.warn(
                '系统设置保存前校验发现界面范围外的值（主进程 AS-4 会钳制/丢弃，本次不阻断保存）:',
                issues
            )
        }
        // P2 功能错误处理修复：主进程 write 失败有两种形态——返回 false（AS-4 校验拒绝/
        // 磁盘失败，不抛异常）与 invoke 异常（IPC 不可用等）。两者此前都静默（fire-and-forget），
        // 用户以为设置已保存、重启后丢失且无提示。现在 await 结果并统一弹错误对话框，
        // 返回 null 让壳层保持对话框打开（草稿不丢）供用户重试。
        try {
            const saved = await window.api.config.write('system', snapshot)
            if (saved === false) {
                reportActionFailure({
                    title: t('dialogRenderer.systemSetting.saveFailedTitle'),
                    message: t('dialogRenderer.systemSetting.saveFailedMessage', {
                        error: t('workspace.config.writeReturnedFalse')
                    })
                })
                return null
            }
            return snapshot
        } catch (error) {
            logger.error('保存系统设置失败:', error)
            reportActionFailure({
                title: t('dialogRenderer.systemSetting.saveFailedTitle'),
                message: t('dialogRenderer.systemSetting.saveFailedMessage', {
                    error: describeActionError(error, t('common.unknown'))
                })
            })
            return null
        }
    }

    function resetSettings(): void {
        settings.value = { ...initialSettings.value }
    }

    return {
        settings,
        appThemeDisplay,
        appThemeDisplayFallback,
        isDirty,
        loadSettings,
        saveSettings,
        resetSettings
    }
}
