/**
 * 应用主题明暗分组共享常量（第 2 批契约重构 2.5：主题分类清单唯一真源）。
 *
 * ## 为什么需要本文件
 * 28 套应用主题的明暗/护眼归属此前在渲染层被**三处**各自维护，且已互相矛盾：
 * 1. `ThemeSettingDialog.vue` 的浅色/深色/护眼 3 组硬编码清单（主题设置对话框的展示口径）；
 * 2. `BaiZeNotes.vue` 的 `darkThemeTypes`（决定标题栏 logo 用深色版还是浅色版）；
 * 3. `useConfigStore.ts` 的 `isDarkTheme`（按主题 id 是否含 `dark` / `深` 猜明暗）。
 * 三处归属不一致（`baize-text` / `baize-starry` 在 ①② 中相反；`forest` 只在 ① 中为深色），
 * 导致同一主题在不同界面/不同组件里被当成不同明暗类别。
 *
 * ## 真源调查结论（2026-11-19，第 2 批）
 * - 主进程主题定义 `src/main/config/theme-config.ts` 的 `ThemeStyles` **不含** `isDark` /
 *   `type` 等明暗标志字段，`resources/themes/` 下只有 Monaco 主题 JSON（含 base 字段），
 *   没有应用主题的 JSON/CSS 配置——即不存在结构化明暗标志真源；
 * - 因此按任务约定「无真源时以主题设置对话框 UI 分类为准」：本文件的 3 组清单**逐项照抄**
 *   `ThemeSettingDialog.vue` 迁移前的 3 组硬编码清单（浅色 14 / 深色 7 / 护眼 7），
 *   值保持不变，仅把「清单维护的位置」从渲染层组件收敛到 shared 常量；
 * - 遗留待产品确认：按主题配色（背景/文字色）计算，`baize-text`、`baize-starry` 实际为
 *   深色底浅色字（其描述也自述「深色主题」），`forest` 实际为浅色底深色字——与 UI 分组
 *   相反。若产品确认以配色为准，只需调整本文件 `DARK_THEME_TYPES` 与 `THEME_GROUPS` 一次，
 *   渲染层全部消费方（主题设置对话框分组 / 标题栏 logo / isDarkTheme）自动同步，
 *   并由 `tests/unit/theme-contract.test.ts` 守住 28 项覆盖不重不漏。
 *
 * ## 消费方
 * - `ThemeSettingDialog.vue`：按 `THEME_GROUPS` 生成主题设置对话框的 3 个分组；
 * - `BaiZeNotes.vue`：标题栏 logo 明暗切换改用 `isDarkThemeType`；
 * - `useConfigStore.ts`：`isDarkTheme` 计算属性改用 `isDarkThemeType`。
 *
 * 说明：本文件只被渲染层与测试引用（主进程主题实现不依赖分组口径），是纯常量 + 纯函数，
 * 与 shared/constants 其余文件一样零运行时副作用。
 */
import type { ThemeType } from '../types/theme'

/** 主题分组标识（与主题设置对话框的 3 个分组一一对应） */
export type ThemeGroupId = 'light' | 'dark' | 'eyecare'

/** 主题分组：labelKey 为分组标题的 i18n key，types 为该组包含的主题标识（有序） */
export interface ThemeGroup {
    /** 分组标识 */
    readonly id: ThemeGroupId
    /** 分组标题 i18n key（dialogRenderer.themeSetting.category*） */
    readonly labelKey: string
    /** 分组主题标识清单（顺序即 UI 展示顺序） */
    readonly types: readonly ThemeType[]
}

/**
 * 浅色系主题（14 项，主题设置对话框「浅色主题」分组；迁移前基线为
 * ThemeSettingDialog.vue 的 lightThemes 清单）。
 */
export const LIGHT_THEME_TYPES = [
    'baize',
    'warm',
    'light',
    'lavender',
    'coral',
    'mint',
    'sunset',
    'rose',
    'baize-beast',
    'baize-clear',
    'baize-text',
    'baize-starry',
    'baize-data-light',
    'baize-mirror-light'
] as const satisfies readonly ThemeType[]

/**
 * 深色系主题（7 项，主题设置对话框「深色主题」分组；迁移前基线为
 * ThemeSettingDialog.vue 的 darkThemes 清单）。
 */
export const DARK_THEME_TYPES = [
    'dark',
    'deepdark',
    'icon',
    'ocean',
    'forest',
    'baize-data-dark',
    'baize-mirror-dark'
] as const satisfies readonly ThemeType[]

/**
 * 护眼系主题（7 项，主题设置对话框「护眼主题」分组；迁移前基线为
 * ThemeSettingDialog.vue 的 eyecareThemes 清单）。
 */
export const EYECARE_THEME_TYPES = [
    'eyecare-green',
    'eyecare-beige',
    'eyecare-blue',
    'eyecare-pink',
    'eyecare-amber',
    'eyecare-teal',
    'eyecare-lilac'
] as const satisfies readonly ThemeType[]

/**
 * 主题设置对话框的 3 个分组（顺序：浅色 → 深色 → 护眼，与 UI 展示顺序一致）。
 */
export const THEME_GROUPS: readonly ThemeGroup[] = [
    {
        id: 'light',
        labelKey: 'dialogRenderer.themeSetting.categoryLight',
        types: LIGHT_THEME_TYPES
    },
    {
        id: 'dark',
        labelKey: 'dialogRenderer.themeSetting.categoryDark',
        types: DARK_THEME_TYPES
    },
    {
        id: 'eyecare',
        labelKey: 'dialogRenderer.themeSetting.categoryEyecare',
        types: EYECARE_THEME_TYPES
    }
]

/**
 * 是否为深色系主题（供标题栏 logo 与 `isDarkTheme` 等明暗判断统一使用）。
 *
 * 未知主题值（历史损坏配置 / 非主题 id）一律按非深色处理（返回 false），
 * 与主进程 `normalizeThemeType` 的兜底方向一致：默认主题 `baize` 属浅色。
 */
export function isDarkThemeType(themeType: string): boolean {
    return (DARK_THEME_TYPES as readonly string[]).includes(themeType)
}
