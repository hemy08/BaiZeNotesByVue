/**
 * 主题设置对话框 —— 共享草稿 / 主题数据加载 / 取消恢复 composable（设置对话框二期拆分）
 *
 * 拆分前 ThemeSettingDialog.vue 同时持有主题选择草稿、字体草稿、主题列表数据与
 * 打开时加载逻辑；拆分后这些状态与副作用收敛到本 composable，壳层只保留
 * activePanel、侧边栏、footer 与 change/close emit 编排，3 个页签只做展示 + 事件上报。
 *
 * 对外契约（拆分前后等价）：
 * - `currentTheme` / `separateEditorTheme` / `currentMonacoTheme`：主题选择草稿
 *   （打开时记录初始值，取消时恢复；点选应用主题时由壳层立即 emit('change')）；
 * - `fonts`：字体设置草稿（不参与主题配置读写，仅保持页签切换不丢值——拆分前即该行为）；
 * - `themeCategories` / `allMonacoThemes`：主题列表数据（打开时经既有 IPC 加载）；
 * - `isLoading` / `loadError`：主题列表加载态与失败文案（P2 功能错误处理修复：
 *   失败不再只记日志，面板显示错误态 + 「重试」按钮，重试复用 loadThemes）；
 * - `loadThemes()`：读取全部主题 + 编辑器主题 + 当前主题配置（读取失败记录错误态并清空
 *   半成品数据，面板据此显示可重试的降级 UI）；
 * - `resetSettings()`：取消时恢复打开时加载值（字体草稿不恢复，与拆分前一致）；返回值
 *   供壳层判断是否需要回滚已即时应用的主题（P2 #17，详见返回值注释）。
 */
import { ref, reactive } from 'vue'
import type { Ref } from 'vue'
import { IPC } from '../../../../../../shared/ipc-channels'
// 第 2 批契约重构：主题领域类型以 shared/types/theme.ts 为唯一真源（不再本地维护 partial 副本）；
// 分组清单以 shared/constants/theme.ts 的 THEME_GROUPS 为唯一真源（浅色/深色/护眼 3 组）。
import type {
    AppThemeConfig,
    MonacoThemeListItem,
    ThemeListItem
} from '../../../../../../shared/types'
import { THEME_GROUPS } from '../../../../../../shared/constants/theme'
import { logger } from '../../../../common/logger'
import { t } from '../../../../common/i18n'
import { describeActionError } from '../../../../common/action-feedback'
import {
    createDefaultThemeDialogSelection,
    createDefaultThemeFontSettings,
    type MonacoThemeViewItem,
    type ThemeCategory,
    type ThemeDialogSelection,
    type ThemeFontSettings
} from './model'

/** useThemeSettingForm 的返回值（壳层与测试共用同一份契约） */
export interface ThemeSettingForm {
    /** 应用主题草稿（当前选中应用主题 type） */
    currentTheme: Ref<string>
    /** 独立编辑器主题开关（拆分前后均在草稿中，随 apply 提交） */
    separateEditorTheme: Ref<boolean>
    /** 编辑器主题草稿（当前选中 Monaco 主题 type） */
    currentMonacoTheme: Ref<string>
    /** 字体设置草稿（字体页签展示用，不参与主题配置保存） */
    fonts: ThemeFontSettings
    /** 应用主题分组数据（THEME_GROUPS 生成） */
    themeCategories: Ref<ThemeCategory[]>
    /** 编辑器主题视图项（含预览配色） */
    allMonacoThemes: Ref<MonacoThemeViewItem[]>
    /** 主题列表是否加载中（面板显示加载态，避免首次打开空白） */
    isLoading: Ref<boolean>
    /** 主题列表加载失败文案（空串 = 无错误；非空时面板显示错误态 + 重试） */
    loadError: Ref<string>
    /** 打开对话框时加载主题列表与当前主题配置（兼作失败后的重试入口） */
    loadThemes: () => Promise<void>
    /**
     * 取消：恢复打开时加载的主题选择（字体草稿保持不动，与拆分前一致）。
     *
     * P2 #17：返回回滚目标——草稿与打开时初始值不同（用户已改变应用主题/编辑器主题）时
     * 返回打开时的初始选择，壳层据此 emit 一次 `change(initial...)` 恢复已即时应用的主题；
     * 草稿未变化时返回 null（壳层不额外 emit，避免无谓的写盘/广播）。
     */
    resetSettings: () => ThemeDialogSelection | null
}

export function useThemeSettingForm(): ThemeSettingForm {
    // 初始主题选择（也用于取消时恢复）：默认值见 ./model.ts
    const initialSettings = ref<ThemeDialogSelection>(createDefaultThemeDialogSelection())
    const currentTheme = ref(initialSettings.value.currentTheme)
    const separateEditorTheme = ref(initialSettings.value.separateEditorTheme)
    const currentMonacoTheme = ref(initialSettings.value.currentMonacoTheme)

    // 字体草稿：拆分前即对话框本地状态（既不读取配置也不随 apply 提交），
    // 拆分后提升到 composable 以保证页签切换（v-if 重挂载）不丢值。
    const fonts = reactive<ThemeFontSettings>(createDefaultThemeFontSettings())

    const themeCategories = ref<ThemeCategory[]>([])
    const allMonacoThemes = ref<MonacoThemeViewItem[]>([])
    // P2 功能错误处理修复：加载态 / 失败文案（面板据此显示加载或「错误 + 重试」降级 UI）
    const isLoading = ref(false)
    const loadError = ref('')

    /**
     * 记录「打开时初始主题选择」快照（P2 #17：取消回滚目标）。
     *
     * 调用于两处：
     * 1. `loadThemes()` 起始处：父级懒加载包装组件打开过一次后保持挂载，二次打开时列表
     *    来自上一次加载、可立即点选（配置读取可能尚未返回）。先按当前草稿记快照——
     *    此时草稿即上一次确认/取消后的已应用主题，保证取消回滚到的是「本次打开前」的主题，
     *    而不是上一次打开前更旧的快照；
     * 2. 主题配置读取成功后：以主进程配置为打开时初始值（唯一真源）；
     * 读取失败走 catch，不覆盖快照（仍按默认/上次值处理）。
     */
    function captureInitialSettings(): void {
        initialSettings.value = {
            currentTheme: currentTheme.value,
            separateEditorTheme: separateEditorTheme.value,
            currentMonacoTheme: currentMonacoTheme.value
        }
    }

    /** 打开对话框时读取全部主题 / 编辑器主题 / 当前主题配置 */
    async function loadThemes(): Promise<void> {
        isLoading.value = true
        loadError.value = ''
        // P2 #17：进入本次打开/重试时先记录回滚快照（见 captureInitialSettings 注释）
        captureInitialSettings()
        try {
            const allThemes = (await window.electron.ipcRenderer.invoke(
                IPC.THEME.GET_ALL_THEMES
            )) as ThemeListItem[]

            // 第 2 批契约重构：3 组分类清单统一引用 shared/constants/theme 的 THEME_GROUPS，
            // 本组件不再维护主题 id 硬编码数组（浅色/深色/护眼归属的唯一真源）。
            // 过滤条件与迁移前逐项一致：按组内 type 清单筛选主进程返回的全部主题，
            // 未在清单中的主题（历史/未知值）不展示。
            themeCategories.value = THEME_GROUPS.map((group) => ({
                nameKey: group.labelKey,
                themes: allThemes.filter((theme) => group.types.includes(theme.type))
            }))

            const monacoThemes = (await window.electron.ipcRenderer.invoke(
                IPC.THEME.GET_ALL_MONACO_THEMES
            )) as MonacoThemeListItem[]
            allMonacoThemes.value = monacoThemes.map((item) => ({
                type: item.type,
                name: item.config.name,
                config: item.config,
                colors: {
                    bg: item.config.backgroundColor || (item.config.isDark ? '#1e1e1e' : '#ffffff'),
                    text:
                        item.config.foregroundColor || (item.config.isDark ? '#d4d4d4' : '#333333'),
                    accent: item.config.isDark ? '#007acc' : '#007acc'
                }
            }))

            const themeConfig = await window.api.config.read<AppThemeConfig>('theme')
            if (themeConfig) {
                currentTheme.value = themeConfig.currentTheme || 'baize'
                separateEditorTheme.value = themeConfig.separateEditorTheme || false
                currentMonacoTheme.value = themeConfig.editorTheme || 'vs'
            }
            // P2 #17：配置读取完成后的主题选择即「打开时初始值」（读取失败不覆盖快照）
            captureInitialSettings()
        } catch (error) {
            // P2 功能错误处理修复：失败不再空白面板——清空半成品数据并记录可重试错误态，
            // 由 ThemeSettingDialog 传入页签展示错误文案 + 「重试」按钮（重试调用本函数）。
            logger.error('加载主题失败:', error)
            themeCategories.value = []
            allMonacoThemes.value = []
            loadError.value = t('dialogRenderer.themeSetting.loadFailed', {
                error: describeActionError(error, t('common.unknown'))
            })
        } finally {
            isLoading.value = false
        }
    }

    /**
     * 取消：恢复打开时的主题选择，并返回需要回滚的初始选择（P2 #17）。
     *
     * 应用主题点选是「立即 emit('change') 生效」的语义（父级写盘），若用户取消时草稿
     * 已偏离打开时的初始值，仅恢复本地草稿无法撤销已应用主题，故返回初始选择供壳层
     * emit 一次 change(initial...) 走既有应用链路回滚；未修改时返回 null。
     * 字体草稿仍不参与取消恢复（与拆分前一致，「字体页签不持久化」语义不变）。
     */
    function resetSettings(): ThemeDialogSelection | null {
        const initial = initialSettings.value
        const changed =
            currentTheme.value !== initial.currentTheme ||
            separateEditorTheme.value !== initial.separateEditorTheme ||
            currentMonacoTheme.value !== initial.currentMonacoTheme

        currentTheme.value = initial.currentTheme
        separateEditorTheme.value = initial.separateEditorTheme
        currentMonacoTheme.value = initial.currentMonacoTheme

        return changed ? { ...initial } : null
    }

    return {
        currentTheme,
        separateEditorTheme,
        currentMonacoTheme,
        fonts,
        themeCategories,
        allMonacoThemes,
        isLoading,
        loadError,
        loadThemes,
        resetSettings
    }
}
