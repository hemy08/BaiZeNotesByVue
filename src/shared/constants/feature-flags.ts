/**
 * 可选能力开关（用户选定：A1/A3/A4/A6/A7/A10 默认关闭，可在系统设置中开启）。
 *
 * 设计约束：
 * - 键名与 SystemSetting 的持久化字段一一对应（featureXxx），默认 false；
 * - 本文件同时被主进程（默认值/校验）与渲染层（设置页/运行时开关）引用，
 *   不依赖 Vue/Electron，保持纯数据 + 类型；
 * - A2/A8/A9 是默认能力，不进入本开关集合；
 * - 1.5.2 E6 起新增 `dailyNotes`（今日日记 / 快速收件箱，默认关闭）；
 * - 1.5.2 E1 起新增 `clipCapture`（剪贴板剪藏：新笔记 / 插入当前笔记，默认关闭）；
 * - 1.5.2 E2 起新增 `pdfAnnotations`（PDF 标注与摘录，第 9 项，默认关闭）；
 * - 1.5.2 E3 起新增 `imageOcr`（图片 OCR：识别剪贴板截图文字，第 10 项，默认关闭）。
 */

/** 可选能力标识（与菜单/组件/测试中的能力编号语义一致） */
export type OptionalFeatureFlagId =
    | 'tabs'
    | 'documentHistory'
    | 'markdownLint'
    | 'spellcheck'
    | 'smartInput'
    | 'outlinePlus'
    | 'dailyNotes'
    | 'clipCapture'
    | 'pdfAnnotations'
    | 'imageOcr'

/** 单个开关定义：持久化字段、默认值、i18n 文案键 */
export interface OptionalFeatureFlagDefinition {
    /** 对应 SystemSetting 的布尔字段名 */
    settingKey:
        | 'featureTabs'
        | 'featureDocumentHistory'
        | 'featureMarkdownLint'
        | 'featureSpellcheck'
        | 'featureSmartInput'
        | 'featureOutlinePlus'
        | 'featureDailyNotes'
        | 'featureClipCapture'
        | 'featurePdfAnnotations'
        | 'featureImageOcr'
    /** 默认值（全部 opt-in，默认关闭） */
    defaultValue: boolean
    /** 设置页标题键（dialogRenderer.systemSetting.features.*） */
    labelKey: string
    /** 设置页说明键 */
    descKey: string
}

/** 可选能力定义表（顺序即设置页展示顺序） */
export const OPTIONAL_FEATURE_FLAGS: Readonly<
    Record<OptionalFeatureFlagId, OptionalFeatureFlagDefinition>
> = {
    tabs: {
        settingKey: 'featureTabs',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.tabsLabel',
        descKey: 'dialogRenderer.systemSetting.features.tabsDesc'
    },
    documentHistory: {
        settingKey: 'featureDocumentHistory',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.documentHistoryLabel',
        descKey: 'dialogRenderer.systemSetting.features.documentHistoryDesc'
    },
    markdownLint: {
        settingKey: 'featureMarkdownLint',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.markdownLintLabel',
        descKey: 'dialogRenderer.systemSetting.features.markdownLintDesc'
    },
    spellcheck: {
        settingKey: 'featureSpellcheck',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.spellcheckLabel',
        descKey: 'dialogRenderer.systemSetting.features.spellcheckDesc'
    },
    smartInput: {
        settingKey: 'featureSmartInput',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.smartInputLabel',
        descKey: 'dialogRenderer.systemSetting.features.smartInputDesc'
    },
    outlinePlus: {
        settingKey: 'featureOutlinePlus',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.outlinePlusLabel',
        descKey: 'dialogRenderer.systemSetting.features.outlinePlusDesc'
    },
    // 1.5.2 E6：今日日记 / 快速收件箱（工具菜单 + 命令面板两个入口，默认关闭）
    dailyNotes: {
        settingKey: 'featureDailyNotes',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.dailyNotesLabel',
        descKey: 'dialogRenderer.systemSetting.features.dailyNotesDesc'
    },
    // 1.5.2 E1：剪贴板剪藏（工具菜单 + 命令面板两个入口，默认关闭；
    // 关闭时不注册命令、菜单执行提示开启，且不会读取系统剪贴板）
    clipCapture: {
        settingKey: 'featureClipCapture',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.clipCaptureLabel',
        descKey: 'dialogRenderer.systemSetting.features.clipCaptureDesc'
    },
    // 1.5.2 E2：PDF 标注与摘录（第 9 项，默认关闭；
    // 关闭时 PDF 预览与现状零行为变化：不渲染文本层、不显示标注 UI、不调用新通道）
    pdfAnnotations: {
        settingKey: 'featurePdfAnnotations',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.pdfAnnotationsLabel',
        descKey: 'dialogRenderer.systemSetting.features.pdfAnnotationsDesc'
    },
    // 1.5.2 E3：图片 OCR（剪贴板截图识别，第 10 项，默认关闭；
    // 关闭时零行为差异：不注册命令/菜单入口、不加载 OCR worker、不下载语言包）
    imageOcr: {
        settingKey: 'featureImageOcr',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.features.imageOcrLabel',
        descKey: 'dialogRenderer.systemSetting.features.imageOcrDesc'
    }
} as const

/** 可选能力 id 列表（稳定顺序，供设置页与测试遍历） */
export const OPTIONAL_FEATURE_FLAG_IDS = Object.keys(
    OPTIONAL_FEATURE_FLAGS
) as OptionalFeatureFlagId[]

/** 默认开关快照（默认全部关闭） */
export const OPTIONAL_FEATURE_FLAG_DEFAULTS: Readonly<Record<OptionalFeatureFlagId, boolean>> = {
    tabs: false,
    documentHistory: false,
    markdownLint: false,
    spellcheck: false,
    smartInput: false,
    outlinePlus: false,
    dailyNotes: false,
    clipCapture: false,
    pdfAnnotations: false,
    imageOcr: false
}

/** 写作体验能力标识（P0；系统设置「编写体验」页签，默认全部关闭） */
export type WritingExperienceFlagId =
    | 'writingMode'
    | 'writingTypewriter'
    | 'writingFocus'
    | 'writingStats'
    | 'writingTypography'
    | 'writingSessionRestore'
    | 'writingBubble'
    | 'writingSlash'
    | 'writingStyleCheck'

/** 单条写作体验开关定义 */
export interface WritingExperienceFlagDefinition {
    settingKey:
        | 'writingModeEnabled'
        | 'writingTypewriterEnabled'
        | 'writingFocusEnabled'
        | 'writingStatsEnabled'
        | 'writingTypographyEnabled'
        | 'writingSessionRestoreEnabled'
        | 'writingBubbleEnabled'
        | 'writingSlashEnabled'
        | 'writingStyleCheckEnabled'
    defaultValue: boolean
    labelKey: string
    descKey: string
}

/** 写作体验开关定义表（顺序即设置页展示顺序） */
export const WRITING_EXPERIENCE_FLAGS: Readonly<
    Record<WritingExperienceFlagId, WritingExperienceFlagDefinition>
> = {
    writingMode: {
        settingKey: 'writingModeEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.modeLabel',
        descKey: 'dialogRenderer.systemSetting.writing.modeDesc'
    },
    writingTypewriter: {
        settingKey: 'writingTypewriterEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.typewriterLabel',
        descKey: 'dialogRenderer.systemSetting.writing.typewriterDesc'
    },
    writingFocus: {
        settingKey: 'writingFocusEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.focusLabel',
        descKey: 'dialogRenderer.systemSetting.writing.focusDesc'
    },
    writingStats: {
        settingKey: 'writingStatsEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.statsLabel',
        descKey: 'dialogRenderer.systemSetting.writing.statsDesc'
    },
    writingTypography: {
        settingKey: 'writingTypographyEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.typographyLabel',
        descKey: 'dialogRenderer.systemSetting.writing.typographyDesc'
    },
    writingSessionRestore: {
        settingKey: 'writingSessionRestoreEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.sessionRestoreLabel',
        descKey: 'dialogRenderer.systemSetting.writing.sessionRestoreDesc'
    },
    writingBubble: {
        settingKey: 'writingBubbleEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.bubbleLabel',
        descKey: 'dialogRenderer.systemSetting.writing.bubbleDesc'
    },
    writingSlash: {
        settingKey: 'writingSlashEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.slashLabel',
        descKey: 'dialogRenderer.systemSetting.writing.slashDesc'
    },
    writingStyleCheck: {
        settingKey: 'writingStyleCheckEnabled',
        defaultValue: false,
        labelKey: 'dialogRenderer.systemSetting.writing.styleCheckLabel',
        descKey: 'dialogRenderer.systemSetting.writing.styleCheckDesc'
    }
} as const

/** 写作体验开关 id 列表 */
export const WRITING_EXPERIENCE_FLAG_IDS = Object.keys(
    WRITING_EXPERIENCE_FLAGS
) as WritingExperienceFlagId[]

/** 写作体验默认快照（默认全部关闭） */
export const WRITING_EXPERIENCE_DEFAULTS: Readonly<Record<WritingExperienceFlagId, boolean>> = {
    writingMode: false,
    writingTypewriter: false,
    writingFocus: false,
    writingStats: false,
    writingTypography: false,
    writingSessionRestore: false,
    writingBubble: false,
    writingSlash: false,
    writingStyleCheck: false
}
