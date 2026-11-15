/**
 * 主题类型（ARC-13：主进程 / 渲染层唯一真源）
 *
 * 收敛前 ThemeStyles 在三处重复定义：
 * - src/main/global-types.d.ts（全局模块出口）
 * - src/main/config/theme-config.ts（主进程主题表与读取函数实际使用）
 * - src/shared/types/index.ts（渲染层 BaiZeNotes.vue 使用）
 * 三份结构完全一致，现统一收敛到本文件：
 * - 主进程 theme-config.ts 以 `import type` 引用并 re-export，保持
 *   `import type { ThemeStyles } from '../config'` 既有路径不变；
 * - 渲染层继续从 src/shared/types 统一出口 import type。
 */
export interface ThemeStyles {
    name: string
    description: string
    /** CMP-30：主题名称的 i18n key（themeNames.app.<themeId>.name），缺省时回退 name */
    nameKey?: string
    /** CMP-30：主题描述的 i18n key（themeNames.app.<themeId>.description），缺省时回退 description */
    descKey?: string
    titleBarGradient: string
    backgroundColor: string
    cardBackground: string
    textColor: string
    secondaryTextColor: string
    borderColor: string
    accentColor: string
    buttonBackground: string
    buttonTextColor: string
    hoverBackground: string
}

/**
 * 主题更新数据（主进程 → 渲染层广播，通道 baize-notes:theme-updated）
 * 收敛前在 main/global-types.d.ts 与 shared/types 各一份，结构一致；
 * 渲染层 BaiZeNotes.vue 的 handleThemeUpdate 使用本类型。
 */
export interface ThemeUpdateData {
    themeType: string
    separateEditorTheme: boolean
    monacoTheme: string
    themeStyles: ThemeStyles
}
