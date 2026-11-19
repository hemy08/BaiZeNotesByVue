/**
 * 主题设置对话框 —— 表单模型 / 侧边栏页签 / 展示映射纯函数（设置对话框二期拆分）
 *
 * 与 DOM / 响应式状态无关的部分收敛到本文件：
 * - 左侧页签常量 `THEME_SETTING_SIDEBAR_ITEMS`（顺序即 DOM 顺序）；
 * - 字体设置字段类型与下拉选项（拆分前对话框本地常量）；
 * - 主题/编辑器主题的「视图项」类型与 i18n 显示名、预览配色映射
 *   （第 2 批契约重构后的 shared 类型消费逻辑原样迁入）。
 *
 * 响应式草稿 / 打开时加载 / 取消恢复见 `./useThemeSettingForm.ts`；
 * 3 个页签组件见同目录 AppThemePanel / EditorThemePanel / FontSettingsPanel，
 * 主题卡片见 ThemePreviewCard。
 */
import type { CSSProperties } from 'vue'
import type {
    MonacoThemeListItem,
    ThemeListItem,
    ThemeStyles
} from '../../../../../../shared/types'
import { t } from '../../../../common/i18n'

/** 左侧页签（顺序即展示顺序；id 与模板中的 activePanel 判定一一对应） */
export const THEME_SETTING_SIDEBAR_ITEMS = [
    { id: 'app-theme', nameKey: 'dialogRenderer.themeSetting.sidebarAppTheme', icon: '🎨' },
    { id: 'editor-theme', nameKey: 'dialogRenderer.themeSetting.sidebarEditorTheme', icon: '📝' },
    {
        id: 'font-settings',
        nameKey: 'dialogRenderer.themeSetting.sidebarFontSettings',
        icon: '🔤'
    }
] as const

/** 侧边栏页签 id（壳层 activePanel 的类型真源，与 3 个 panel 组件一一对应） */
export type ThemeSettingPanelId = (typeof THEME_SETTING_SIDEBAR_ITEMS)[number]['id']

/** 应用主题分组（THEME_GROUPS 生成：组标题 i18n key + 组内主题列表） */
export interface ThemeCategory {
    nameKey: string
    themes: ThemeListItem[]
}

// 第 2 批契约重构：ThemeListItem / MonacoThemeListItem 直接引用 shared 主题领域类型
// （types/theme.ts）；主进程 getAllThemes() 返回的 styles 是完整 ThemeStyles，
// 不再是历史 partial 断言。渲染层内部只额外补充「预览配色」一个视图字段。
/** 渲染层内部使用的编辑器主题视图项（在 shared MonacoThemeListItem 基础上补充预览配色） */
export interface MonacoThemeViewItem {
    type: string
    name: string
    colors: { bg: string; text: string; accent: string }
    config: MonacoThemeListItem['config']
}

/** 主题选择草稿（打开时记录初始值，取消时恢复；独立编辑器主题开关一并纳入） */
export interface ThemeDialogSelection {
    currentTheme: string
    separateEditorTheme: boolean
    currentMonacoTheme: string
}

/** 字体设置页签草稿（拆分前即对话框本地状态；不参与主题配置的保存/取消） */
export interface ThemeFontSettings {
    editorFont: string
    previewFont: string
    fontSize: number
}

/** 编辑器字体下拉选项（拆分前原样保留） */
export const EDITOR_FONT_OPTIONS = [
    'Consolas',
    'Monaco',
    'Courier New',
    'Fira Code',
    'Source Code Pro',
    'JetBrains Mono',
    'Menlo',
    'Ubuntu Mono'
]

/** 预览字体下拉选项（拆分前原样保留） */
export const PREVIEW_FONT_OPTIONS = [
    'Microsoft YaHei',
    'PingFang SC',
    'Segoe UI',
    'Arial',
    'Helvetica',
    'SimSun',
    'SimHei',
    'KaiTi'
]

/** 初始主题选择（也是取消时恢复的默认值；读取失败时保持该默认值） */
export function createDefaultThemeDialogSelection(): ThemeDialogSelection {
    return {
        currentTheme: 'baize',
        separateEditorTheme: false,
        currentMonacoTheme: 'vs'
    }
}

/** 初始字体设置（不参与保存，仅作字体页签默认展示） */
export function createDefaultThemeFontSettings(): ThemeFontSettings {
    return {
        editorFont: 'Consolas',
        previewFont: 'Microsoft YaHei',
        fontSize: 14
    }
}

/** 主题卡片上的一个色块（预览色 + tooltip 文案） */
export interface ThemeColorDot {
    style: CSSProperties
    title: string
}

/**
 * 应用主题卡片的预览底色。
 * 第 2 批：shared ThemeStyles 只有 backgroundColor / textColor（主进程从不发送
 * 历史 partial 断言里的 background / color 字段），删除不可达的回退分支，
 * 颜色取值与迁移前实际生效路径一致（backgroundColor / textColor 兜底默认色）。
 */
export function getThemePreviewStyle(theme: ThemeListItem): CSSProperties {
    const styles: ThemeStyles = theme.styles
    return {
        background: styles.backgroundColor || '#fff',
        color: styles.textColor || '#333'
    }
}

/** 应用主题卡片预览：标题栏渐变 */
export function getThemeTitleBarStyle(theme: ThemeListItem): CSSProperties {
    return {
        background:
            theme.styles?.titleBarGradient || 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }
}

/** 应用主题卡片预览：左侧栏底色 */
export function getThemeSidebarStyle(theme: ThemeListItem): CSSProperties {
    return { background: theme.styles?.cardBackground || '#f5f5f5' }
}

/** 应用主题卡片预览：3 条示意文本行 */
export function getThemePreviewLines(theme: ThemeListItem): CSSProperties[] {
    return [
        { background: theme.styles?.textColor || '#333', opacity: 0.8 },
        { background: theme.styles?.textColor || '#333', opacity: 0.5, width: '70%' },
        {
            background: theme.styles?.accentColor || '#00b0ff',
            opacity: 0.6,
            width: '50%'
        }
    ]
}

/** 应用主题卡片色块：背景色 / 强调色 / 文字色 */
export function getThemeColorDots(theme: ThemeListItem): ThemeColorDot[] {
    return [
        {
            style: { background: theme.styles?.backgroundColor || '#fff' },
            title: t('dialogRenderer.themeSetting.colorBackground')
        },
        {
            style: { background: theme.styles?.accentColor || '#00b0ff' },
            title: t('dialogRenderer.themeSetting.colorAccent')
        },
        {
            style: { background: theme.styles?.textColor || '#333' },
            title: t('dialogRenderer.themeSetting.colorText')
        }
    ]
}

/** 编辑器主题卡片预览：背景 / 侧栏 / 文本行 */
export function getMonacoPreviewStyle(theme: MonacoThemeViewItem): CSSProperties {
    return { background: theme.colors.bg }
}

export function getMonacoTitleBarStyle(theme: MonacoThemeViewItem): CSSProperties {
    return { background: theme.colors.bg }
}

export function getMonacoSidebarStyle(theme: MonacoThemeViewItem): CSSProperties {
    return { background: theme.colors.bg, opacity: 0.8 }
}

export function getMonacoPreviewLines(theme: MonacoThemeViewItem): CSSProperties[] {
    return [
        { background: theme.colors.text, opacity: 0.8 },
        { background: theme.colors.text, opacity: 0.5, width: '70%' },
        { background: theme.colors.text, opacity: 0.6, width: '50%' }
    ]
}

/** 编辑器主题卡片色块：背景色 / 文字色 / 强调色（拆分前第三块沿用文字色） */
export function getMonacoColorDots(theme: MonacoThemeViewItem): ThemeColorDot[] {
    return [
        {
            style: { background: theme.colors.bg },
            title: t('dialogRenderer.themeSetting.colorBackground')
        },
        {
            style: { background: theme.colors.text },
            title: t('dialogRenderer.themeSetting.colorText')
        },
        {
            style: { background: theme.colors.text },
            title: t('dialogRenderer.themeSetting.colorAccent')
        }
    ]
}

// CMP-30：主题名称/描述优先走 i18n key，词条或字段缺失时回退主题数据中的原文字段
export function getThemeDisplayName(theme: ThemeListItem): string {
    const styles = theme.styles
    if (styles?.nameKey) return t(styles.nameKey)
    return styles?.name || theme.type
}

export function getThemeDisplayDesc(theme: ThemeListItem): string {
    const styles = theme.styles
    if (styles?.descKey) return t(styles.descKey)
    return styles?.description || t('dialogRenderer.themeSetting.customTheme')
}

export function getMonacoThemeDisplayName(theme: MonacoThemeViewItem): string {
    const config = theme.config
    if (config?.nameKey) return t(config.nameKey, { name: theme.name })
    return config?.name || theme.name
}

export function getMonacoThemeDisplayDesc(theme: MonacoThemeViewItem): string {
    const config = theme.config
    if (config?.descKey) return t(config.descKey, { name: theme.name })
    return config?.description || t('dialogRenderer.themeSetting.editorThemeFallback')
}
