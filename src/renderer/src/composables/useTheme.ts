/**
 * 主题单真源 composable（结构优化第 4 批 4.2 / M4）
 *
 * ## 背景（收敛前：主题读写/应用分散在 3 处）
 * 1. `BaiZeNotes.vue`：读配置 → invoke `THEME.GET_CURRENT_THEME_STYLES` → 手写 20 个
 *    CSS 变量 + querySelector 直改 `.title-bar`/`.menu-container`/`#markdown-preview-html`
 *    内联样式 → 动态 import Monaco 应用编辑器主题 → 监听 `THEME_UPDATED` 广播；
 * 2. `MenuBar.vue`：独立 `window.api.config.read('theme')` 读盘 + 独立监听
 *    `THEME_UPDATED`（读到的主题名无任何消费方，属重复读盘 + 无效订阅）；
 * 3. Monaco 主题逻辑（内置/磁盘主题 + 动态自定义主题）也内联在主界面组件里。
 *
 * ## 收敛后（本模块为渲染层主题唯一实现）
 * - `currentThemeStyles` / `currentThemeType` / `isDarkTheme`：主题样式与标识的唯一运行时状态
 *   （主题名以 `useConfigStore.themeConfig` 为单一状态源，本模块不另存一份可写副本）；
 * - `applyThemeStyles`：把 ThemeStyles 映射为 20 个 CSS 变量（`--theme-*` 主变量 +
 *   无前缀历史别名）写根元素，并做**幂等**短路：同一份样式重复 apply 不再触碰 DOM；
 * - `applyThemeUpdate`：一次性完成「CSS 变量 → Monaco 主题 → EventBus 通知编辑器」；
 * - `initializeTheme`：启动初始化（配置读盘 + 首套主题应用），单例防重入——
 *   同一窗口重复调用不会二次读盘/二次 invoke；
 * - `changeTheme`：主题设置对话框切换入口（更新配置 → 拉取样式 → 应用 → 请求主进程广播）；
 * - `handleThemeBroadcast` / `subscribeThemeUpdates`：`THEME_UPDATED` 广播的唯一订阅实现
 *   （主进程多窗口广播 / 跟随系统主题路径在渲染层的唯一落点）；
 * - 视觉升级 P0（视觉升级方案 T1~T3）：`applyThemeStyles` 在既有 20 个主题变量之外追加
 *   18 个语义颜色令牌（`--ui-*`，shared/theme-tokens 派生）；`applyUiAppearance` 把
 *   界面风格（paper/glass/workbench/hybrid）与界面密度（compact/default/spacious）写到
 *   根元素 `data-style` / `data-density` 等属性，并按主题类别解析 glass 降级材质；二者与
 *   28 套主题正交，默认 workbench + default 密度与视觉升级前观感完全一致。
 *
 * ## 行为保持（与收敛前逐项等价）
 * - 初始主题：欢迎页不应用主题（与收敛前一致，主界面挂载后才初始化）；
 * - 编辑器中立主题（separateEditorTheme）与磁盘 Monaco 主题加载逻辑原样迁移；
 * - 无独立编辑器主题时按主题名含 dark/深/Dark/黑 选择 vs-dark/vs 并 defineTheme
 *   `custom-theme` —— 该启发式与主题明暗归属（baize-text / baize-starry / forest
 *   与 UI 分组相反）相关，属待产品确认项，本次**只记录不改语义**（见报告）；
 * - 系统主题跟随：主进程 `system-theme.ts` 改配置 + 广播，渲染层仍以 `THEME_UPDATED`
 *   广播为唯一入口，由本模块应用，行为不变；
 * - 主题应用成功后仍 `EventBus.$emit(THEME_UPDATED)`（编辑器/插件面板既有监听不变）。
 *
 * ## 已删除的「DOM 直改样式」
 * 收敛前 applyTheme 会 querySelector `.title-bar` / `.menu-container` /
 * `#markdown-preview-html` 写内联样式，并遍历 `[data-theme]` 元素改属性。经全仓核对：
 * - `.title-bar` / `#markdown-preview-html` 的样式已由 `styles/theme.css` 的 CSS 变量规则
 *   提供（同值），内联写入纯冗余；
 * - `.menu-container` 渲染层**不存在**该元素；`[data-theme]` 属性全仓**无元素使用**；
 *   两段均为死代码。因此本模块只写根元素 CSS 变量，不再做任何元素级直改。
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import type {
    SystemSetting,
    ThemeStyles,
    ThemeUpdateData,
    UiDensity,
    UiStyle
} from '../../../shared/types'
import { IPC } from '../../../shared/ipc-channels'
import {
    isDarkThemeType,
    isEyecareThemeType,
    isSaturatedThemeType
} from '../../../shared/constants/theme'
import { buildSemanticCssVariables, resolveSemanticThemeGroup } from '../../../shared/theme-tokens'
import {
    DEFAULT_UI_DENSITY,
    DEFAULT_UI_REDUCE_TRANSPARENCY,
    DEFAULT_UI_STYLE,
    normalizeUiDensity,
    normalizeUiReduceTransparency,
    normalizeUiStyle,
    resolveEffectiveUiStyle
} from '../../../shared/constants/ui-style'
import type { GlassMode, UiStyleContext } from '../../../shared/constants/ui-style'
import { getConfigStore } from '../common/useConfigStore'
import EventBus from '../common/event-bus/event-bus'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import { logger } from '../common/logger'
// P2 剩余静默失败提示：用户主动切换主题失败时经统一失败反馈 helper 弹错误对话框 + 重试
import { t } from '../common/i18n'
import { describeActionError, reportActionFailure } from '../common/action-feedback'

/** Monaco 模块形态（仅类型引用；运行时按需动态 import，避免 Monaco 进入首屏 chunk） */
type MonacoModule = typeof import('monaco-editor')

/** ThemeStyles 中参与 CSS 变量映射的配色字段（name/description/i18n key 不参与） */
export type ThemeCssField =
    | 'backgroundColor'
    | 'cardBackground'
    | 'textColor'
    | 'secondaryTextColor'
    | 'borderColor'
    | 'accentColor'
    | 'buttonBackground'
    | 'buttonTextColor'
    | 'hoverBackground'
    | 'titleBarGradient'

/** ThemeStyles 配色字段 → CSS 变量名映射项 */
export interface ThemeCssVariableBinding {
    /** ThemeStyles 配色字段名 */
    field: ThemeCssField
    /** 带 `--theme-` 前缀的主变量名（壳层/工作区组件使用） */
    prefixed: string
    /** 无前缀历史别名（对话框组件使用；收敛前由 applyTheme 同步写入） */
    alias: string
}

/**
 * 主题 CSS 变量映射表（唯一真源）。
 *
 * 顺序与收敛前 `BaiZeNotes.applyTheme` 的写入顺序逐项一致；主变量与别名同值，
 * 供两套历史命名（`--theme-*` / `--*`）同时可用，组件不需要迁移 CSS。
 */
export const THEME_CSS_VARIABLE_BINDINGS: readonly ThemeCssVariableBinding[] = [
    {
        field: 'backgroundColor',
        prefixed: '--theme-background-color',
        alias: '--bg-color'
    },
    {
        field: 'cardBackground',
        prefixed: '--theme-card-background',
        alias: '--card-bg'
    },
    {
        field: 'textColor',
        prefixed: '--theme-text-color',
        alias: '--text-color'
    },
    {
        field: 'secondaryTextColor',
        prefixed: '--theme-secondary-text-color',
        alias: '--secondary-text-color'
    },
    {
        field: 'borderColor',
        prefixed: '--theme-border-color',
        alias: '--border-color'
    },
    {
        field: 'accentColor',
        prefixed: '--theme-accent-color',
        alias: '--accent-color'
    },
    {
        field: 'buttonBackground',
        prefixed: '--theme-button-background',
        alias: '--button-bg'
    },
    {
        field: 'buttonTextColor',
        prefixed: '--theme-button-text-color',
        alias: '--button-text-color'
    },
    {
        field: 'hoverBackground',
        prefixed: '--theme-hover-background',
        alias: '--hover-bg'
    },
    {
        field: 'titleBarGradient',
        prefixed: '--theme-title-bar-gradient',
        alias: '--title-bar-gradient'
    }
]

/**
 * 把 ThemeStyles 展开为「CSS 变量名 → 值」映射（纯函数，便于单测）。
 *
 * @param theme 主进程返回的完整主题样式（shared ThemeStyles）
 * @returns 20 项变量映射（10 个主变量 + 10 个历史别名）
 */
export function buildThemeCssVariables(theme: ThemeStyles): Record<string, string> {
    const variables: Record<string, string> = {}
    for (const binding of THEME_CSS_VARIABLE_BINDINGS) {
        const value = theme[binding.field]
        variables[binding.prefixed] = value
        variables[binding.alias] = value
    }
    return variables
}

/** 当前应用主题样式（未初始化/未应用过时为 null；供调试与单测断言） */
const currentThemeStyles = ref<ThemeStyles | null>(null)
/** 编辑器是否使用独立于应用主题的 Monaco 主题（与 config store 同步） */
const separateEditorTheme = ref(false)
/** 当前 Monaco 编辑器主题标识（与 config store 同步） */
const monacoEditorTheme = ref('vs')

/**
 * 系统设置中的三项外观配置（视觉升级 P0）。
 * 字段可选：调用方可以只传变更项（其余沿用上一次生效值），启动路径传完整 SystemSetting。
 */
export type UiAppearanceSetting = Partial<
    Pick<SystemSetting, 'uiStyle' | 'uiDensity' | 'uiReduceTransparency'>
>

/** 当前生效的界面外观状态（风格层 + 密度层；供调试、单测与后续 P1 组件读取） */
export interface UiAppearanceState {
    /** 用户请求的风格（可能因主题类别被降级） */
    requestedStyle: UiStyle
    /** 实际生效材质（写根元素 data-style） */
    effectiveStyle: UiStyle
    /** 生效密度（写根元素 data-density） */
    density: UiDensity
    /** 用户是否开启「减少透明效果」 */
    reduceTransparency: boolean
    /** 系统是否偏好减少透明（prefers-reduced-transparency: reduce） */
    preferReducedTransparency: boolean
    /** 玻璃材质模式（normal / steady / flat） */
    glassMode: GlassMode
}

/** 默认外观状态（workbench + default + 不减少透明 = 视觉升级前现状） */
function createDefaultUiAppearance(): UiAppearanceState {
    return {
        requestedStyle: DEFAULT_UI_STYLE,
        effectiveStyle: DEFAULT_UI_STYLE,
        density: DEFAULT_UI_DENSITY,
        reduceTransparency: DEFAULT_UI_REDUCE_TRANSPARENCY,
        preferReducedTransparency: false,
        glassMode: 'normal'
    }
}

/** 当前生效外观状态（模块级单例 ref） */
const currentUiAppearance = ref<UiAppearanceState>(createDefaultUiAppearance())
/** 上一次应用的完整外观设置（主题切换/广播后按新主题重新解析降级材质） */
let lastUiAppearanceSetting: Required<UiAppearanceSetting> | null = null

/** 默认外观设置（未读配置/配置缺字段时兜底；与主进程 systemSettingDefaults 一致） */
function createDefaultUiAppearanceSetting(): Required<UiAppearanceSetting> {
    return {
        uiStyle: DEFAULT_UI_STYLE,
        uiDensity: DEFAULT_UI_DENSITY,
        uiReduceTransparency: DEFAULT_UI_REDUCE_TRANSPARENCY
    }
}

/**
 * 系统是否偏好「减少透明」。
 *
 * `prefers-reduced-transparency` 是 Chromium/系统级可访问性偏好；jsdom/老环境可能没有
 * `matchMedia`，任何异常都按「不偏好」处理（回退默认观感，不阻塞启动）。
 * 同时导出供单测替换/断言。
 */
export function detectReducedTransparencyPreference(): boolean {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return false
    }
    try {
        return window.matchMedia('(prefers-reduced-transparency: reduce)').matches === true
    } catch {
        return false
    }
}

/** 是否按「深色材质」处理：优先按实际表面亮度（修正 baize-text / forest 等归属偏差），无法解析时回退主题分组 */
function isDarkMaterialTheme(themeType: string, styles: ThemeStyles | null): boolean {
    if (styles) {
        const darkByBackground = resolveSemanticThemeGroup(themeType, styles) === 'dark'
        return darkByBackground
    }
    return isDarkThemeType(themeType)
}

/**
 * 解析实际生效的界面风格（visual P0 风格层纯函数封装）。
 *
 * 降级规则见 `shared/constants/ui-style.ts` 的 `resolveEffectiveUiStyle`：
 * glass 在「减少透明 / 系统偏好 / 高饱和 / 护眼」时回退 paper 材质，
 * 在深色主题下进入 steady 稳健模式（降透明度 + 关模糊）。
 */
export function resolveEffectiveStyle(requested: UiStyle, context: UiStyleContext): UiStyle {
    return resolveEffectiveUiStyle(requested, context).style
}

/**
 * 应用界面外观（风格 + 密度 + 减少透明）到根元素 data-* 属性。
 *
 * - 只写 `document.documentElement.dataset`，不写任何 CSS 变量（颜色仍由 applyThemeStyles 负责）；
 * - 三项配置缺省/非法时归一化为默认值（workbench / default / false），保证首次启动
 *   「默认观感零变化」；
 * - 主题切换或主进程广播后会以最新主题重新解析（glass 的 dark/高饱和/护眼降级可能随之变化）。
 *
 * @param setting 外观配置（部分字段也可）
 * @param themeStyles 主题样式（缺省取当前已应用主题）
 * @param themeType 主题标识（缺省取 config store 当前主题）
 */
function applyUiAppearance(
    setting: UiAppearanceSetting,
    themeStyles?: ThemeStyles | null,
    themeType?: string
): void {
    const previous = lastUiAppearanceSetting ?? createDefaultUiAppearanceSetting()
    const nextSetting: Required<UiAppearanceSetting> = {
        uiStyle: normalizeUiStyle(setting.uiStyle ?? previous.uiStyle),
        uiDensity: normalizeUiDensity(setting.uiDensity ?? previous.uiDensity),
        uiReduceTransparency: normalizeUiReduceTransparency(
            setting.uiReduceTransparency ?? previous.uiReduceTransparency
        )
    }
    lastUiAppearanceSetting = nextSetting

    const styles = themeStyles ?? currentThemeStyles.value
    const resolvedThemeType = themeType ?? getConfigStore().themeConfig.value.currentTheme
    const preferReducedTransparency = detectReducedTransparencyPreference()
    const context: UiStyleContext = {
        isDark: isDarkMaterialTheme(resolvedThemeType, styles),
        isSaturated: isSaturatedThemeType(resolvedThemeType),
        isEyecare: isEyecareThemeType(resolvedThemeType),
        reduceTransparency: nextSetting.uiReduceTransparency,
        preferReducedTransparency
    }
    const effective = resolveEffectiveUiStyle(nextSetting.uiStyle, context)
    const state: UiAppearanceState = {
        requestedStyle: nextSetting.uiStyle,
        effectiveStyle: effective.style,
        density: nextSetting.uiDensity,
        reduceTransparency: nextSetting.uiReduceTransparency,
        preferReducedTransparency,
        glassMode: effective.glassMode
    }
    currentUiAppearance.value = state

    if (typeof document === 'undefined' || !document.documentElement) {
        return
    }
    const dataset = document.documentElement.dataset
    dataset.style = state.effectiveStyle
    dataset.density = state.density
    dataset.glassMode = state.glassMode
    dataset.transparency =
        state.reduceTransparency || state.preferReducedTransparency ? 'reduced' : 'normal'
}

/** 上一次真正写入 DOM 的变量签名（幂等短路用；模块级单例状态） */
let lastAppliedSignature: string | null = null
/** 初始化单例 Promise（同一窗口只读盘/应用一次） */
let initializePromise: Promise<void> | null = null
/** Monaco 模块按需加载 Promise（失败后清空，允许后续主题更新重试） */
let monacoModulePromise: Promise<MonacoModule> | null = null
/** THEME_UPDATED 广播订阅清理函数（单例订阅，防重复注册） */
let broadcastUnsubscribe: (() => void) | null = null

/** 取渲染层 IPC 通道对象（测试/极简环境缺失时返回 null，不抛异常） */
function getRendererIpc(): Window['electron']['ipcRenderer'] | null {
    if (typeof window === 'undefined') {
        return null
    }
    return window.electron?.ipcRenderer ?? null
}

/**
 * 取主进程当前主题样式（渲染层唯一调用点）。
 *
 * P2 剩余静默失败提示：此前 IPC 异常在此被吞掉并返回 null，调用方（主题切换）静默退出，
 * 用户看不到任何反馈。现在：
 * - invoke 异常向上抛（由调用方决定提示策略：用户主动切换 → 错误对话框 + 重试；
 *   启动初始化/广播 → 静默回退默认主题，见 initializeTheme / handleThemeBroadcast 注释）；
 * - resolve 为 null（主题不存在等）仍返回 null，由调用方按「未返回样式」处理。
 */
async function fetchCurrentThemeStyles(themeType: string): Promise<ThemeStyles | null> {
    const ipc = getRendererIpc()
    if (!ipc) {
        return null
    }
    const styles = (await ipc.invoke(
        IPC.THEME.GET_CURRENT_THEME_STYLES,
        themeType
    )) as ThemeStyles | null
    return styles ?? null
}

/**
 * 应用主题到 DOM（CSS 变量）——幂等：同一份变量重复调用直接返回 false，不触碰 DOM。
 *
 * 写入内容（共 38 个变量）：
 * - 既有 20 个主题变量（`THEME_CSS_VARIABLE_BINDINGS`：10 个 `--theme-*` 主变量 +
 *   10 个无前缀历史别名）——**完全不变**（UI-03 兼容）；
 * - 视觉升级新增 18 个语义变量（`--ui-*`，由 shared/theme-tokens 派生），
 *   供 P1 组件与 ui-style.css 消费；与旧变量正交，不覆盖旧变量。
 *
 * 说明：CSS 变量统一写在 `document.documentElement`，`:root` 规则（styles/theme.css 的
 * 默认值 + styles/ui-style.css 的风格/密度默认值）随组件消费自动生效；不做任何元素级
 * querySelector 内联样式直改。
 *
 * @param theme 主进程返回的完整主题样式
 * @param themeType 主题标识（缺省取 config store 当前主题；用于判定语义色分组）
 * @returns 是否真正写入了 DOM（签名变化 = true；重复 apply 同一主题 = false）
 */
function applyThemeStyles(theme: ThemeStyles, themeType?: string): boolean {
    const resolvedThemeType = themeType ?? getConfigStore().themeConfig.value.currentTheme
    const semanticGroup = resolveSemanticThemeGroup(resolvedThemeType, theme)
    const variables: Record<string, string> = {
        ...buildThemeCssVariables(theme),
        ...buildSemanticCssVariables(theme, semanticGroup)
    }
    const signature = JSON.stringify(variables)
    if (signature === lastAppliedSignature) {
        return false
    }
    lastAppliedSignature = signature
    currentThemeStyles.value = theme

    if (typeof document !== 'undefined' && document.documentElement) {
        const rootStyle = document.documentElement.style
        for (const [name, value] of Object.entries(variables)) {
            rootStyle.setProperty(name, value)
        }
    }
    return true
}

/** 按需加载 Monaco 模块（与编辑器组件共享同一打包 chunk，只求值一次） */
async function loadMonacoModule(): Promise<MonacoModule> {
    if (monacoModulePromise === null) {
        monacoModulePromise = import('monaco-editor').catch((error: unknown) => {
            monacoModulePromise = null
            throw error
        })
    }
    return monacoModulePromise
}

/** 无独立编辑器主题时的基色选择（沿用收敛前启发式，待产品确认明暗归属后修正） */
function resolveBaseTheme(themeName: string): 'vs' | 'vs-dark' {
    const isDarkByName =
        themeName.includes('dark') ||
        themeName.includes('深') ||
        themeName.includes('Dark') ||
        themeName.includes('黑')
    return isDarkByName ? 'vs-dark' : 'vs'
}

/**
 * 加载磁盘/内置 Monaco 主题（原 BaiZeNotes.loadMonacoTheme 原样迁移）。
 *
 * 内置主题直接 setTheme；扩展主题经 `THEME.LOAD_MONACO_THEME` 从
 * `resources/themes/monaco-themes/` 读取后 defineTheme；失败回退 `vs`。
 *
 * P2 剩余静默失败提示：此前失败只记日志并静默回退（用户以为编辑器主题已切换），
 * 现返回是否成功；用户主动切换主题（changeTheme）时由调用方弹错误提示，启动/广播等
 * 后台路径仍保持「静默回退默认主题」（不打断编辑，理由见各调用方注释）。
 *
 * @returns 是否成功应用目标 Monaco 主题（false = 已回退 vs 或默认主题）
 */
async function loadMonacoTheme(monaco: MonacoModule, themeName: string): Promise<boolean> {
    if (themeName === 'vs' || themeName === 'vs-dark' || themeName === 'hc-black') {
        monaco.editor.setTheme(themeName)
        return true
    }

    const ipc = getRendererIpc()
    if (!ipc) {
        monaco.editor.setTheme('vs')
        return false
    }

    try {
        const themeData = await ipc.invoke(IPC.THEME.LOAD_MONACO_THEME, themeName)
        if (themeData) {
            monaco.editor.defineTheme(themeName, themeData)
            monaco.editor.setTheme(themeName)
            return true
        }
        logger.error(`Monaco theme not found: ${themeName}`)
        monaco.editor.setTheme('vs')
        return false
    } catch (error) {
        logger.error(`Failed to load Monaco theme: ${themeName}`, error)
        monaco.editor.setTheme('vs')
        return false
    }
}

/**
 * 应用 Monaco 编辑器主题（原 BaiZeNotes.updateMonacoEditorTheme 原样迁移）。
 *
 * - 独立编辑器主题（separate → true）：加载用户选择的 Monaco 主题；
 * - 否则按应用主题生成 `custom-theme`（基色 vs/vs-dark + 主题色覆盖）；
 * - 成功后 `EventBus.$emit(THEME_UPDATED, theme)` 通知编辑器/插件面板（历史契约保留）；
 * - Monaco 模块加载失败只跳过编辑器主题，不影响界面/预览主题，不阻塞启动；
 * - P2：返回是否成功应用编辑器主题，供用户主动切换路径提示失败（启动/广播路径忽略）。
 */
async function applyMonacoEditorTheme(
    theme: ThemeStyles,
    separate: boolean,
    monacoThemeName: string
): Promise<boolean> {
    let monaco: MonacoModule
    try {
        monaco = await loadMonacoModule()
    } catch (error) {
        logger.warn('Monaco 模块加载失败，已跳过编辑器主题更新:', error)
        return false
    }

    let monacoApplied = true
    if (separate) {
        monacoApplied = await loadMonacoTheme(monaco, monacoThemeName)
    } else {
        try {
            monaco.editor.defineTheme('custom-theme', {
                base: resolveBaseTheme(theme.name),
                inherit: true,
                rules: [],
                colors: {
                    'editor.background': theme.cardBackground,
                    'editor.foreground': theme.textColor,
                    'editor.lineHighlightBackground': theme.hoverBackground,
                    'editorCursor.foreground': theme.accentColor,
                    'editor.selectionBackground': theme.accentColor + '40',
                    'editor.inactiveSelectionBackground': theme.accentColor + '20'
                }
            })
            monaco.editor.setTheme('custom-theme')
        } catch (error) {
            logger.error('应用自定义 Monaco 主题失败（已回退默认主题）:', error)
            monacoApplied = false
        }
    }

    EventBus.$emit(EVENT_BUS.THEME_UPDATED, theme)
    return monacoApplied
}

/**
 * 一次性应用主题更新（CSS 变量 + Monaco + 编辑器事件）。
 *
 * 调用方：启动初始化、主题切换、主进程 `THEME_UPDATED` 广播、跟随系统主题。
 * 顺序与收敛前一致：先同步状态 → 应用界面主题 → 再异步应用编辑器主题。
 * 视觉升级 P0：界面主题应用后，若已读过外观配置则按新主题重新解析玻璃降级材质
 * （深色/高饱和/护眼主题切换会改变生效材质）。
 *
 * @param themeType 主题标识（可选；缺省取 config store 当前主题，用于语义色分组判定）
 * @returns Monaco 编辑器主题是否成功应用（界面主题此时已应用；供用户主动切换路径提示）
 */
async function applyThemeUpdate(
    themeStyles: ThemeStyles,
    separate: boolean,
    monacoThemeName: string,
    themeType?: string
): Promise<boolean> {
    separateEditorTheme.value = separate
    monacoEditorTheme.value = monacoThemeName
    applyThemeStyles(themeStyles, themeType)
    if (lastUiAppearanceSetting) {
        applyUiAppearance(lastUiAppearanceSetting, themeStyles, themeType)
    }
    return applyMonacoEditorTheme(themeStyles, separate, monacoThemeName)
}

/**
 * 启动主题初始化（主界面挂载后调用一次）。
 *
 * 时序与收敛前 BaiZeNotes.onMounted 完全一致：先加载配置（主题配置为唯一读盘入口），
 * 再按配置拉取主题样式并应用。单例防重入：主界面重复挂载不会二次读盘。
 *
 * P2 剩余静默失败提示的范围说明（为何此路径仍保持静默回退）：
 * - 启动阶段属于**后台路径**：此时主界面尚未稳定、用户没有主动触发任何操作，弹模态错误框
 *   会打断首次进入应用；且 CSS 变量在 styles/theme.css 的 :root 中已有默认主题兜底，
 *   界面仍完整可用。因此仅记 error 日志并保持默认主题（P3 体验项，不误导用户为「已切换」）。
 * - 用户主动切换主题的 changeTheme 路径已改为错误对话框 + 重试（见下方）。
 */
async function initializeTheme(): Promise<void> {
    if (initializePromise) {
        return initializePromise
    }
    initializePromise = (async () => {
        try {
            const store = getConfigStore()
            // 第 4 批 4.2：配置读盘收敛到本模块（原 BaiZeNotes.onMounted 内联调用）。
            // themeConfig 的运行时状态仍由 useConfigStore 单例持有，本模块只读不复制。
            await store.loadAllConfigs()
            const themeConfig = store.themeConfig.value
            const styles = await fetchCurrentThemeStyles(themeConfig.currentTheme)
            if (styles) {
                // 启动路径忽略 Monaco 主题应用结果：失败已回退默认主题且不打断启动
                await applyThemeUpdate(
                    styles,
                    themeConfig.separateEditorTheme,
                    themeConfig.editorTheme || 'vs',
                    themeConfig.currentTheme
                )
            }
            // 视觉升级（P0）：读取系统设置中的界面风格/密度/减少透明并写根元素 data-* 属性。
            // 独立 try/catch：系统设置读取失败不得影响主题初始化（回退 workbench + default，
            // 即升级前现状观感）。读到的设置同时缓存，供后续主题切换重新解析降级材质。
            try {
                const systemSetting = await window.api.config.read<SystemSetting>('system')
                applyUiAppearance(systemSetting ?? {}, styles ?? null, themeConfig.currentTheme)
            } catch (error) {
                logger.warn('读取系统外观设置失败，已使用默认界面风格/密度:', error)
                applyUiAppearance({}, styles ?? null, themeConfig.currentTheme)
            }
        } catch (error) {
            logger.error('Failed to load configs:', error)
        }
    })()
    return initializePromise
}

/**
 * 主题切换（主题设置对话框 `change` 事件入口）。
 *
 * 与收敛前 BaiZeNotes.handleThemeChange 逐项等价：
 * 1. 更新配置（写盘由 config store 去抖，不在本模块重复实现）；
 * 2. invoke `THEME.GET_CURRENT_THEME_STYLES` 拉取目标主题样式；
 * 3. 应用界面主题 + Monaco 主题；
 * 4. 请求主进程向所有窗口广播（多窗口/主进程侧同步）。
 *
 * P2 剩余静默失败提示（用户主动操作，必须可见）：样式拉取失败 / 主进程未返回样式 /
 * 编辑器主题加载失败此前都只写日志，用户误以为主题已切换。现统一弹错误对话框并附
 * 「重试」按钮（重试按同一目标参数重走完整切换链路）。界面主题应用成功后仍会广播，
 * 编辑器主题失败不影响界面主题与广播。
 *
 * @param themeType 目标应用主题标识（缺省取配置中的当前主题）
 * @param monacoTheme 目标 Monaco 主题标识（缺省取配置 / 'vs'）
 * @param separate 是否使用独立编辑器主题（缺省取配置）
 */
async function changeTheme(
    themeType?: string,
    monacoTheme?: string,
    separate?: boolean
): Promise<void> {
    const store = getConfigStore()
    const targetTheme = themeType || store.themeConfig.value.currentTheme
    const targetSeparate =
        separate !== undefined ? separate : store.themeConfig.value.separateEditorTheme
    const targetMonacoTheme = monacoTheme || store.themeConfig.value.editorTheme || 'vs'
    /** 重试：按本次目标参数重走完整切换链路（失败会再次进入本函数并重新提示） */
    const retry = (): Promise<void> => changeTheme(targetTheme, targetMonacoTheme, targetSeparate)

    try {
        store.updateThemeConfig({
            currentTheme: targetTheme,
            separateEditorTheme: targetSeparate,
            editorTheme: targetMonacoTheme
        })

        let styles: ThemeStyles | null
        try {
            styles = await fetchCurrentThemeStyles(targetTheme)
        } catch (error) {
            logger.error(`Failed to load theme styles: ${targetTheme}`, error)
            reportActionFailure({
                title: t('dialogRenderer.themeSetting.applyFailedTitle'),
                message: t('dialogRenderer.themeSetting.applyFailedMessage', {
                    theme: targetTheme,
                    error: describeActionError(error, t('common.unknown'))
                }),
                retry
            })
            return
        }
        if (!styles) {
            logger.error(`Theme styles not found: ${targetTheme}`)
            reportActionFailure({
                title: t('dialogRenderer.themeSetting.applyFailedTitle'),
                message: t('dialogRenderer.themeSetting.applyFailedMessage', {
                    theme: targetTheme,
                    error: t('dialogRenderer.themeSetting.applyFailedReasonNotFound')
                }),
                retry
            })
            return
        }

        const monacoApplied = await applyThemeUpdate(
            styles,
            targetSeparate,
            targetMonacoTheme,
            targetTheme
        )
        if (!monacoApplied) {
            // 界面主题已应用，仅编辑器主题回退：单独提示，不影响下方主进程广播
            reportActionFailure({
                title: t('dialogRenderer.themeSetting.editorThemeApplyFailedTitle'),
                message: t('dialogRenderer.themeSetting.editorThemeApplyFailedMessage', {
                    theme: targetMonacoTheme
                }),
                retry
            })
        }

        // A-3/FUN-20：主题应用成功后请求主进程广播（多窗口热同步）——原逻辑原样保留。
        getRendererIpc()?.send(
            IPC.THEME.UPDATE_THEME,
            targetTheme,
            targetMonacoTheme,
            targetSeparate
        )
    } catch (error) {
        logger.error('Failed to handle theme change:', error)
        reportActionFailure({
            title: t('dialogRenderer.themeSetting.applyFailedTitle'),
            message: t('dialogRenderer.themeSetting.applyFailedMessage', {
                theme: targetTheme,
                error: describeActionError(error, t('common.unknown'))
            }),
            retry
        })
    }
}

/**
 * 处理主进程 `THEME_UPDATED` 广播（多窗口 / 跟随系统主题的渲染层唯一入口）。
 *
 * 契约（shared ThemeUpdateData）：{ themeStyles, monacoTheme, separateEditorTheme }，
 * 不含主题标识（历史字段可选且现行不发送）——因此这里只应用样式，不改写 config store
 * 中的主题名（与收敛前一致；主题名由主进程配置真源持久化，重启/读配置时对齐）。
 *
 * P2 剩余静默失败提示的范围说明（为何此路径无需提示）：广播是**后台路径**（其他窗口/
 * 系统主题触发），当前窗口没有用户主动操作；样式已在主进程侧应用成功，编辑器主题加载
 * 失败时回退默认主题不影响界面。弹框会打断用户正在进行的编辑，因此保持日志 + 默认主题
 * 兜底（与 startup 路径同一口径）。
 */
async function handleThemeBroadcast(_event: unknown, data: ThemeUpdateData): Promise<void> {
    if (!data || !data.themeStyles) {
        logger.error('[Renderer] Received invalid theme data')
        return
    }
    // 后台广播忽略 Monaco 主题应用结果（失败已回退默认主题，不打断当前编辑）
    // 主题标识：历史载荷不带 themeType（可选字段），缺省取 config store 当前主题用于
    // 语义色分组判定；material 降级另有「按背景亮度」兜底，不会因主题名过期而错配。
    const broadcastThemeType = data.themeType ?? getConfigStore().themeConfig.value.currentTheme
    await applyThemeUpdate(
        data.themeStyles,
        data.separateEditorTheme,
        data.monacoTheme,
        broadcastThemeType
    )
}

/** 订阅主进程主题广播（单例订阅；返回清理函数，重复订阅返回同一清理函数） */
function subscribeThemeUpdates(): () => void {
    const ipc = getRendererIpc()
    if (!ipc) {
        return () => undefined
    }
    if (broadcastUnsubscribe) {
        return broadcastUnsubscribe
    }
    ipc.on(IPC.THEME.THEME_UPDATED, handleThemeBroadcast)
    broadcastUnsubscribe = () => {
        ipc.removeListener(IPC.THEME.THEME_UPDATED, handleThemeBroadcast)
        broadcastUnsubscribe = null
    }
    return broadcastUnsubscribe
}

/** 主题单例 API（useTheme 的返回类型） */
export interface ThemeApi {
    /** 当前已应用的主题样式（只读状态） */
    currentThemeStyles: Ref<ThemeStyles | null>
    /** 当前生效的界面外观状态（风格层 + 密度层；视觉升级 P0） */
    currentUiAppearance: Ref<UiAppearanceState>
    /** 当前应用主题标识（来自 config store，单一状态源） */
    currentThemeType: ComputedRef<string>
    /** 当前主题是否属于深色系（shared DARK_THEME_TYPES 唯一口径） */
    isDarkTheme: ComputedRef<boolean>
    /** 是否使用独立 Monaco 主题 */
    separateEditorTheme: Ref<boolean>
    /** Monaco 编辑器主题标识 */
    monacoEditorTheme: Ref<string>
    initializeTheme: typeof initializeTheme
    changeTheme: typeof changeTheme
    applyThemeStyles: typeof applyThemeStyles
    applyThemeUpdate: typeof applyThemeUpdate
    /** 应用界面外观（风格/密度/减少透明）到根元素 data-* 属性 */
    applyUiAppearance: typeof applyUiAppearance
    /** 解析实际生效风格（glass 降级规则封装） */
    resolveEffectiveStyle: typeof resolveEffectiveStyle
    handleThemeBroadcast: typeof handleThemeBroadcast
    subscribeThemeUpdates: typeof subscribeThemeUpdates
}

/** 创建主题单例 API（模块内只执行一次） */
function createThemeApi(): ThemeApi {
    return {
        currentThemeStyles,
        currentUiAppearance,
        currentThemeType: computed(() => getConfigStore().themeConfig.value.currentTheme),
        isDarkTheme: computed(() =>
            isDarkThemeType(getConfigStore().themeConfig.value.currentTheme)
        ),
        separateEditorTheme,
        monacoEditorTheme,
        initializeTheme,
        changeTheme,
        applyThemeStyles,
        applyThemeUpdate,
        applyUiAppearance,
        resolveEffectiveStyle,
        handleThemeBroadcast,
        subscribeThemeUpdates
    }
}

/** 进程内主题单例（与 useConfigStore.getConfigStore 同一模式） */
let themeApi: ThemeApi | null = null

/**
 * 获取主题单例 API。
 *
 * 多次调用返回同一对象；主题状态、初始化 Promise、广播订阅均为模块级单例，
 * 与收敛前「每个组件实例各自处理主题」相比，重复读盘与重复订阅被消除。
 */
export function useTheme(): ThemeApi {
    if (!themeApi) {
        themeApi = createThemeApi()
    }
    return themeApi
}

/**
 * 仅供单测：重置模块级单例状态（生产代码不得调用）。
 *
 * - 清空已应用样式记录/签名，使下一次 applyThemeStyles 重新写 DOM；
 * - 清空初始化 Promise / Monaco 模块 Promise / 广播订阅；
 * - 不动 config store（store 状态由各测试自行复位）。
 */
export function resetThemeStateForTesting(): void {
    broadcastUnsubscribe?.()
    broadcastUnsubscribe = null
    currentThemeStyles.value = null
    separateEditorTheme.value = false
    monacoEditorTheme.value = 'vs'
    lastAppliedSignature = null
    initializePromise = null
    monacoModulePromise = null
    themeApi = null
    // 视觉升级（P0）：外观状态与根元素 data-* 属性一并复位，避免跨用例串扰
    currentUiAppearance.value = createDefaultUiAppearance()
    lastUiAppearanceSetting = null
    if (typeof document !== 'undefined' && document.documentElement) {
        const dataset = document.documentElement.dataset
        delete dataset.style
        delete dataset.density
        delete dataset.glassMode
        delete dataset.transparency
    }
}
