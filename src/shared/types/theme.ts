/**
 * 主题类型（ARC-13 / 第 2 批契约重构：主进程 / 渲染层唯一真源）
 *
 * ## 收敛内容
 * - `ThemeStyles`：收敛前在 src/main/global-types.d.ts、src/main/config/theme-config.ts、
 *   src/shared/types/index.ts 三处重复定义（结构一致），现统一到本文件；
 * - `ThemeType` / `ThemeConfig` / `MonacoThemeType`：收敛前只存在于主进程
 *   `src/main/config/theme-config.ts`（渲染层只能按 string 猜测合法主题值）；
 * - `MonacoThemeConfig` / `MonacoThemeData`：收敛前只存在于主进程
 *   `src/main/config/theme-registry.ts`（IPC 返回项形状由 shared/types/ipc.ts 另行镜像，
 *   存在两份同构定义）；
 * - `ThemeListItem` / `ThemeListResult` / `MonacoThemeListItem`：IPC 返回项形状，
 *   收敛前定义在 shared/types/ipc.ts（本地镜像名），现以主题领域类型为真源。
 *
 * ## 引用关系（迁移后）
 * - 主进程 `src/main/config/theme-config.ts` 以 `import type` 引用并 re-export
 *   （保持既有 `import type { ThemeType } from '../config'` 等引用路径不变）；
 * - 主进程 `src/main/config/theme-registry.ts` 引用并 re-export Monaco 主题类型；
 * - 渲染层 `ThemeSettingDialog.vue` / `SystemSettingDialog.vue` / `BaiZeNotes.vue`
 *   从本文件（经 shared/types 统一出口）引用，不再各自维护 partial 副本。
 *
 * ## 28 主题与明暗分组
 * 28 项 `ThemeType` 的权威顺序/取值与 `src/main/config/theme-config.ts` 的 `themes`
 * 注册表逐项一致（`tests/unit/theme-contract.test.ts` 静态双向核对）。
 * 明暗/护眼分组清单见 `src/shared/constants/theme.ts` 的 `THEME_GROUPS`
 * （唯一真源：主进程主题定义不含 isDark 标志字段，分组口径以主题设置对话框 UI 分组为准）。
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
 * 应用主题标识：28 套内置主题的唯一合法取值。
 *
 * 真源：`src/main/config/theme-config.ts` 的 `themes: Record<ThemeType, ThemeStyles>`
 * （28 个键，测试静态核对两集合相等）。历史配置中的非法值由主进程
 * `normalizeThemeType` 兜底回退 `DEFAULT_THEME_TYPE`（'baize'），本类型只描述合法取值。
 */
export type ThemeType =
    | 'baize'
    | 'warm'
    | 'light'
    | 'lavender'
    | 'coral'
    | 'mint'
    | 'sunset'
    | 'rose'
    | 'dark'
    | 'deepdark'
    | 'icon'
    | 'ocean'
    | 'forest'
    | 'eyecare-green'
    | 'eyecare-beige'
    | 'eyecare-blue'
    | 'eyecare-pink'
    | 'eyecare-amber'
    | 'eyecare-teal'
    | 'eyecare-lilac'
    | 'baize-text'
    | 'baize-starry'
    | 'baize-beast'
    | 'baize-clear'
    | 'baize-data-light'
    | 'baize-mirror-light'
    | 'baize-data-dark'
    | 'baize-mirror-dark'

/**
 * Monaco 编辑器主题标识。
 *
 * 取值空间是动态的：内置 `vs` / `vs-dark` / `hc-black` + `resources/themes/monaco-themes/
 * themes/*.json` 磁盘主题（当前 55 套，由 theme-registry 扫描文件名得到）。
 * 主进程 `getMonacoThemeData` 运行时按文件名读盘并做路径逃逸校验，不存在可穷举的联合类型，
 * 因此保持 string（与迁移前主进程 `MonacoThemeType = string` 完全一致）。
 */
export type MonacoThemeType = string

/** 主进程 theme-config.json 的 `themeConfig` 键结构（应用主题配置持久化形状） */
export interface ThemeConfig {
    /** 当前应用主题标识（主进程读取时经 normalizeThemeType 兜底为合法值） */
    currentTheme: ThemeType
    /** 编辑器是否使用独立于应用的主题 */
    separateEditorTheme: boolean
    /** 独立的 Monaco 编辑器主题标识（缺省回退 'vs'） */
    editorTheme?: MonacoThemeType
}

/**
 * Monaco 主题元信息（内置主题表 + 磁盘动态主题的提取结果）。
 *
 * 来源：`src/main/config/theme-registry.ts` 的 `MonacoThemeConfig`；内置主题手写，
 * 动态主题由主题 JSON 的 base/colors 派生（isDark 由 base 是否为 vs-dark/hc-black 判定）。
 */
export interface MonacoThemeConfig {
    /** 主题显示名 */
    name: string
    /** 主题描述 */
    description: string
    /** CMP-30：主题名称 i18n key（themeNames.monaco.<id>.name）；磁盘动态主题无此键，回退 name */
    nameKey?: string
    /** CMP-30：主题描述 i18n key；动态主题用 themeNames.monaco.dynamicDescription 模板（{name}） */
    descKey?: string
    /** 是否深色主题 */
    isDark: boolean
    backgroundColor?: string
    foregroundColor?: string
    cardBackground?: string
    borderColor?: string
}

/**
 * Monaco 主题定义（`resources/themes/monaco-themes/themes/*.json` 文件结构）。
 *
 * 可原样交给 `monaco.editor.defineTheme`，因此只有 base 必填，其余为 Monaco 侧可选项。
 */
export interface MonacoThemeData {
    /** 基础主题（vs / vs-dark / hc-black） */
    base: string
    /** 是否继承基础主题 */
    inherit?: boolean
    /** token 着色规则 */
    rules?: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
    /** 颜色映射 */
    colors?: Record<string, string>
    /** 编码后的 token 颜色（Monaco 内部用） */
    encodedTokensColors?: string[]
}

/**
 * 应用主题列表项（主进程 `getAllThemes()` 返回项，IPC.THEME.GET_ALL_THEMES 的元素）。
 *
 * 28 套主题的 styles 字段完整（ThemeStyles 必填字段全部有值），渲染层无需再按 partial 断言。
 */
export interface ThemeListItem {
    /** 主题标识（主进程主题注册表的合法键） */
    type: ThemeType
    /** 主题样式 */
    styles: ThemeStyles
}

/** 应用主题列表（主进程 `getAllThemes()` 的完整返回结构） */
export type ThemeListResult = ThemeListItem[]

/**
 * Monaco 主题列表项（主进程 `getAllMonacoThemes()` 返回项，
 * IPC.THEME.GET_ALL_MONACO_THEMES 的元素）。
 */
export interface MonacoThemeListItem {
    /** Monaco 主题标识（内置 vs/vs-dark/hc-black 或磁盘主题文件名） */
    type: MonacoThemeType
    /** 主题元信息 */
    config: MonacoThemeConfig
}

/**
 * 主题更新数据（主进程 → 渲染层广播，通道 baize-notes:theme-updated）
 * 收敛前在 main/global-types.d.ts 与 shared/types 各一份，结构一致；
 * 渲染层 BaiZeNotes.vue 的 handleThemeUpdate 使用本类型，主进程发送端
 * （src/main/ipc/theme-broadcast.ts 的 ThemeUpdateData）同样引用本类型，
 * 保证广播契约只有一个真源。
 *
 * themeType 说明：历史字段（收敛前主进程广播载荷实际不携带、渲染层也未消费），
 * 现标记为可选，使契约与真实运行时载荷一致；不为对齐类型而向广播载荷强塞该字段。
 */
export interface ThemeUpdateData {
    /** 历史字段：现行主进程广播不携带（渲染层未消费），保留可选仅为兼容旧载荷 */
    themeType?: string
    separateEditorTheme: boolean
    monacoTheme: string
    themeStyles: ThemeStyles
}
