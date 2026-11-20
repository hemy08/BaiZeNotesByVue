/**
 * 编辑器设置对话框 —— 共享草稿 / 加载 / 保存 / 取消 composable（设置对话框二期拆分）
 *
 * 拆分前 EditorSettingDialog.vue 同时持有草稿、初始快照、加载与保存副作用；
 * 拆分后这些职责收敛到本 composable，壳层只保留 activePanel、侧边栏、footer 与 emit 编排，
 * 4 个页签只读 props + emit 字段补丁。
 *
 * 对外契约（拆分前后等价）：
 * - `settings`：reactive 草稿（唯一一份，4 个 panel 共享）；
 * - `loadSettings()`：打开对话框时从主进程读取并分段回填——
 *   `config:read('editor')`（shared RendererEditorConfig 反算字段）按草稿字段类型守卫合并，
 *   `config:read('system')` 回填自动保存开关/间隔；读取失败保持默认值、不阻塞打开，
 *   加载完成后记录初始值供「取消」恢复；
 * - `saveSettings()`：写 `config:write('editor', 快照)` 并返回提交快照（null 表示保存失败），
 *   由壳层 emit('apply')；P2 功能错误处理修复后改为 await 写结果并统一提示失败
 *   （返回 false / invoke 异常都弹错误对话框，壳层据此保持对话框打开供用户重试）；
 * - `resetSettings()`：取消时恢复打开时加载值（不写配置）。
 */
import { reactive, ref } from 'vue'
// 第 2 批契约重构：主进程 'editor' 配置读取形状以 shared RendererEditorConfig 为唯一真源
import type { RendererEditorConfig } from '../../../../../../shared/types'
import { logger } from '../../../../common/logger'
import { t } from '../../../../common/i18n'
import { describeActionError, reportActionFailure } from '../../../../common/action-feedback'
import { createDefaultEditorDialogSettings, type EditorDialogSettings } from './model'

/** useEditorSettingForm 的返回值（壳层与测试共用同一份契约） */
export interface EditorSettingForm {
    /** 草稿（4 个 panel 共享的唯一数据源） */
    settings: EditorDialogSettings
    /** 打开对话框时加载主进程配置并记录初始值 */
    loadSettings: () => Promise<void>
    /** 应用草稿：写 editor 配置并返回提交快照；保存失败时弹错误提示并返回 null */
    saveSettings: () => Promise<EditorDialogSettings | null>
    /** 取消：恢复打开时加载值（不写配置） */
    resetSettings: () => void
}

export function useEditorSettingForm(): EditorSettingForm {
    // 初始状态（也用于取消时恢复）：默认值见 ./model.ts
    const initialSettings = ref<EditorDialogSettings>(createDefaultEditorDialogSettings())
    const settings = reactive<EditorDialogSettings>({ ...initialSettings.value })

    /**
     * P1-FE-05：打开对话框时从主进程读取已保存的真实生效值回填。
     * config:read('editor') 已由 config-manager 路由到主进程 editorSetting 的反算结果，
     * 自动保存相关字段属于系统设置（config:read('system')）。
     * 读取失败时保持默认值，不阻塞对话框打开。
     */
    async function loadSettings(): Promise<void> {
        try {
            const read = window.api?.config?.read
            if (typeof read !== 'function') {
                return
            }
            const [editor, system] = await Promise.all([
                // 第 2 批契约重构：主进程 'editor' 实际只返回 RendererEditorConfig 的 7 个
                // 反算字段（fontSize/lineHeight/showLineNumbers/enableFolding/enableAutoComplete/
                // cursorStyle/cursorWidth），是下方 EditorDialogSettings 的子集；旧断言
                // Partial<EditorDialogSettings> 虽结构兼容但未体现真实形状，改为 shared 真源类型。
                read<RendererEditorConfig>('editor'),
                read<{ autoSaveEnabled?: boolean; autoSaveInterval?: number }>('system')
            ])
            if (editor && typeof editor === 'object') {
                // 主进程实际返回形状中没有 autoSave 等字段，这里按字符串键读取并复用下方
                // typeof 逐字段守卫合并（仅类型断言跨越“实际子集 ↔ 对话框全字段”边界，
                // 不改变运行时对象与合并逻辑）。
                const editorValues = editor as unknown as Readonly<Record<string, unknown>>
                for (const key of Object.keys(settings) as (keyof EditorDialogSettings)[]) {
                    const value = editorValues[key]
                    if (value !== undefined && typeof value === typeof settings[key]) {
                        ;(settings as Record<string, unknown>)[key] = value
                    }
                }
            }
            if (system && typeof system === 'object') {
                if (typeof system.autoSaveEnabled === 'boolean') {
                    settings.autoSave = system.autoSaveEnabled
                }
                if (typeof system.autoSaveInterval === 'number') {
                    settings.autoSaveInterval = system.autoSaveInterval
                }
            }
        } catch (error) {
            logger.error('加载编辑器设置失败:', error)
        }
        // 记录加载后的初始状态，供「取消」还原（读取失败时即默认值）
        initialSettings.value = { ...settings }
    }

    async function saveSettings(): Promise<EditorDialogSettings | null> {
        const snapshot: EditorDialogSettings = { ...settings }
        // P1-FE-05：主进程 config-manager 将该 payload 映射进 Monaco 唯一真源
        // editorSetting，并广播 INIT_SETTING 让当前编辑器立即生效。
        // P2 功能错误处理修复：同系统设置——await 写结果，失败（返回 false / invoke 异常）
        // 统一弹错误对话框并返回 null，不再静默丢设置。
        try {
            const saved = await window.api.config.write('editor', snapshot)
            if (saved === false) {
                reportActionFailure({
                    title: t('dialogRenderer.editorSetting.saveFailedTitle'),
                    message: t('dialogRenderer.editorSetting.saveFailedMessage', {
                        error: t('workspace.config.writeReturnedFalse')
                    })
                })
                return null
            }
            return snapshot
        } catch (error) {
            logger.error('保存编辑器设置失败:', error)
            reportActionFailure({
                title: t('dialogRenderer.editorSetting.saveFailedTitle'),
                message: t('dialogRenderer.editorSetting.saveFailedMessage', {
                    error: describeActionError(error, t('common.unknown'))
                })
            })
            return null
        }
    }

    function resetSettings(): void {
        Object.assign(settings, initialSettings.value)
    }

    return {
        settings,
        loadSettings,
        saveSettings,
        resetSettings
    }
}
