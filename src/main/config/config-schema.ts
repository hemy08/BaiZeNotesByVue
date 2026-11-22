/**
 * AS-4（P2）：配置写入白名单与字段级校验
 *
 * 背景：`config:write` 此前只做 configName 的字符白名单（防路径逃逸），不校验 data 结构：
 * - `fontFamily` 原样落盘并被拼进主窗口 CSS 与 HTML 对话框 `:root`，形成持久化 CSS 注入面；
 * - `currentTheme` 只判 string，非法主题值会让 `getCurrentThemeStyles()` 返回 undefined，
 *   进而使主进程 HTML 对话框抛 TypeError（持久化 DoS）；
 * - 任意未知配置名可落盘任意 JSON（`recent-folders` 还会被欢迎页展示并作为打开文件夹入参）。
 *
 * 本模块提供：
 * 1. 已知配置名白名单（isAllowedConfigName）：system / theme / editor / quick-links /
 *    quickLinks / backup / recent-folders / show-welcome；
 * 2. 仅主进程可写配置名清单（isMainProcessOnlyConfigName）：recent-folders——P1-1
 *    工作区受信根来源收敛后不再允许渲染层经通用 config:write 写入，由主进程在用户
 *    打开目录时自行维护（读取仍对渲染层开放，欢迎页展示需要）；
 * 3. 按配置名的字段级 schema 校验（类型/枚举/范围/长度）：
 *    - 结构非法或安全敏感字段非法 → ok=false（调用方返回 false 并记日志，不抛异常）；
 *    - 未知字段丢弃、超范围数值钳制 → ok=true，记录 adjusted 供日志审计。
 *
 * 设计约束：纯函数、不读写存储、不抛异常；供 config-manager（写入路由）、
 * system-setting（buildFontCss 渲染兜底）复用。
 */
import { isKnownThemeType } from './theme-config'
// 公共接口归位第 2 批：纯校验函数统一引用 shared/utils/validate 真源
import {
    clampNumber as clampNumberBase,
    hasControlChars,
    isFiniteNumber,
    isPlainObject
} from '../../shared/utils/validate'

/**
 * AS-4：允许经 config:write / config:read 访问的配置名白名单。
 * - system/theme/editor/quick-links/quickLinks/backup：ARC-04/05、FE-04/05/06 的既有写入路径；
 * - recent-folders/show-welcome：渲染层欢迎页的裸 JSON 配置（App.vue / WelcomeScreen.vue）。
 * 其余名称一律拒绝（防止写入任意配置、污染配置目录）。
 */
export const ALLOWED_CONFIG_NAMES: ReadonlySet<string> = new Set([
    'system',
    'theme',
    'editor',
    'quick-links',
    'quickLinks',
    'backup',
    'recent-folders',
    'show-welcome'
])

/** 是否为白名单内的配置名（未知/非字符串一律 false） */
export function isAllowedConfigName(name: unknown): name is string {
    return typeof name === 'string' && ALLOWED_CONFIG_NAMES.has(name)
}

/**
 * P1-1（工作区受信根来源收敛）：仅允许主进程写入的配置名。
 *
 * `recent-folders` 是工作区受信根的历史来源：历史实现允许渲染层经通用 `config:write`
 * 任意写入，XSS 后可写入任意目录再从「最近文件夹」入口合法打开。收敛后该配置名
 * **只允许主进程写入**（打开目录时由主进程置顶维护、启动时由主进程读取播种受信根），
 * 渲染层仍可经 `config:read` 读取（欢迎页展示需要），但 `config:write` 一律拒绝。
 */
export const MAIN_PROCESS_ONLY_CONFIG_NAMES: ReadonlySet<string> = new Set(['recent-folders'])

/** 是否为「仅主进程可写」的配置名（渲染层 config:write 必须拒绝） */
export function isMainProcessOnlyConfigName(name: unknown): boolean {
    return typeof name === 'string' && MAIN_PROCESS_ONLY_CONFIG_NAMES.has(name)
}

/** 字段级校验结果：ok=false 时调用方应拒绝写入；adjusted 记录被丢弃/钳制字段（仅日志用） */
export interface ConfigValidationResult {
    ok: boolean
    /** 清洗后的可写数据（ok=true 时使用） */
    value?: unknown
    /** 拒绝原因（ok=false 时必填，用于日志） */
    reason?: string
    /** 被丢弃/钳制的字段说明（ok=true 时可能有值） */
    adjusted?: string[]
}

/** 界面默认字体族（与 system-setting 默认值保持一致） */
export const DEFAULT_FONT_FAMILY =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif'

/** 界面字体大小安全范围（px） */
export const FONT_SIZE_MIN = 8
export const FONT_SIZE_MAX = 72

/**
 * 字体族安全字符集：字母/数字/中文/空白/逗号/引号/连字符/下划线/点。
 * 刻意排除 `;`、`{}`、`()`、`:`、`/`、`\`、`<`、`>` 等可构造 CSS 声明注入的字符。
 */
const FONT_FAMILY_SAFE_PATTERN = /^[A-Za-z0-9\u4e00-\u9fa5\s,"'_.-]+$/

/* 公共接口归位第 2 批：isPlainObject / isFiniteNumber / hasControlChars 的本地副本已删除，
 * 统一引用 shared/utils/validate；仅保留下方 clampNumber 的「{value, clamped} | null」适配包装。 */

/**
 * 数值钳制：非法值返回 null；超范围返回边界值并标记 clamped。
 *
 * 公共接口归位第 2 批：保留本地适配包装——shared 的 clampNumber 是「数字进、数字出」，
 * 而本模块的调用方需要区分「非法（null）」与「被钳制（clamped=true）」；因此先用
 * shared.isFiniteNumber 判非法，再调用 shared.clampNumber 做区间钳制，最后比较入参
 * 是否被改动得到 clamped 标志，行为与原实现逐字一致。
 */
function clampNumber(
    value: unknown,
    min: number,
    max: number
): { value: number; clamped: boolean } | null {
    if (!isFiniteNumber(value)) {
        return null
    }
    const clampedValue = clampNumberBase(value, min, max)
    return { value: clampedValue, clamped: clampedValue !== value }
}

/**
 * 归一化界面字体族（AS-4 核心：阻断 CSS 注入）。
 * 仅允许安全字符集，返回去除首尾空白的值；非法返回 null。
 */
export function sanitizeFontFamily(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed.length > 200) {
        return null
    }
    // 控制字符（换行/制表等）同样禁止：CSS 值必须是单行安全字符集
    if (hasControlChars(trimmed)) {
        return null
    }
    if (!FONT_FAMILY_SAFE_PATTERN.test(trimmed)) {
        return null
    }
    return trimmed
}

/** 归一化界面字体大小：非法值回退默认 13，超范围钳制到 8~72 并取整 */
export function clampFontSize(value: unknown, fallback = 13): number {
    if (!isFiniteNumber(value) || value <= 0) {
        return fallback
    }
    return Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, Math.round(value)))
}

/** 是否为已知主题类型（currentTheme 枚举校验的单一真源：theme-config 的 themes 注册表） */
export { isKnownThemeType } from './theme-config'

// ============================ system 配置 schema ============================

/** 系统设置中的布尔字段（列表与 shared/types/system.ts SystemSetting 保持一致） */
const SYSTEM_BOOLEAN_FIELDS: ReadonlySet<string> = new Set([
    'autoSaveEnabled',
    'autoOpenLastFile',
    'autoOpenLastFolder',
    'autoStart',
    'minimizeToTray',
    'rememberWindowSize',
    'enableAutoBackup',
    'useSystemTheme',
    // AS-9：远程图片隐私开关（默认 false，仅接受布尔值；非布尔值丢弃并记录 adjusted）
    'allowRemoteImages',
    'editorSettingModal',
    'systemSettingModal',
    'themeSettingModal',
    'helpAboutModal',
    'helpContactUsModal',
    'insertImageModal',
    'admonitionsModal',
    'fontSelectModal',
    'mathTextModal',
    'mdSheetModal',
    'importOptionModal',
    'mermaidEditModal',
    'quickLinkSettingModal',
    'techStackModal',
    'webUrlModal',
    // 可选能力开关（A1/A3/A4/A6/A7/A10；默认 false，见 shared/constants/feature-flags.ts）
    'featureTabs',
    'featureDocumentHistory',
    'featureMarkdownLint',
    'featureSpellcheck',
    'featureSmartInput',
    'featureOutlinePlus',
    // 1.5.2 E6：今日日记 / 快速收件箱（默认 false，仅接受布尔值）
    'featureDailyNotes',
    // 1.5.2 E1：剪贴板剪藏（默认 false，仅接受布尔值）
    'featureClipCapture',
    // 1.5.2 E2：PDF 标注与摘录（第 9 项，默认 false，仅接受布尔值）
    'featurePdfAnnotations',
    // 1.5.2 E3：图片 OCR（第 10 项，默认 false，仅接受布尔值）
    'featureImageOcr',
    // 写作体验（P0）
    'writingModeEnabled',
    'writingTypewriterEnabled',
    'writingFocusEnabled',
    'writingStatsEnabled',
    'writingTypographyEnabled',
    'writingSessionRestoreEnabled',
    'writingBubbleEnabled',
    'writingSlashEnabled',
    'writingStyleCheckEnabled'
])

/** 系统设置中的数值字段范围（超范围钳制而非拒绝，避免一个越界值导致整次保存失败） */
const SYSTEM_NUMBER_LIMITS: Readonly<Record<string, { min: number; max: number }>> = {
    autoSaveInterval: { min: 5, max: 86400 },
    fontSize: { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX },
    // 「最近文件列表数量」：5~20（与 SystemSettingDialog 输入框与 shared 常量一致）
    recentFilesCount: { min: 5, max: 20 },
    // P3 对齐：与 UI 输入框（1~72 / 1~10）及 auto-backup 运行时钳制一致
    backupInterval: { min: 1, max: 72 },
    backupCount: { min: 1, max: 10 }
}

/** 系统设置中的枚举字段（未知值丢弃） */
const SYSTEM_ENUM_FIELDS: Readonly<Record<string, readonly string[]>> = {
    menuBarStyle: ['electron', 'default', 'windows-native'],
    renderWhitespace: ['none', 'boundary', 'selection', 'all']
}

/** 系统设置中的短标识字段（资源管理器/编辑器模型/插件打开方式/应用主题） */
const SYSTEM_SHORT_FIELDS: ReadonlySet<string> = new Set([
    'resourceManager',
    'editorModel',
    'pluginOpen',
    'appTheme'
])

/** BCP-47 形态的语言标签（zh-CN / en / en-US 等），兼容历史值 'zh-cn' */
const LANGUAGE_PATTERN = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/
/** 短标识安全字符集 */
const SHORT_ID_PATTERN = /^[A-Za-z0-9_./-]{1,64}$/
/** 路径类字符串最大长度（防异常超长 payload 落盘） */
const MAX_PATH_STRING_LENGTH = 4096

// 「记住窗口位置和大小」持久化边界校验范围（与 handlers.ts 的 AS-6 常量一致，
// 见 AS-6 注释的同步点说明；handlers 依赖 config 反向不可 import，故就地复制）。
/** 窗口坐标绝对值上限（覆盖多显示器/超宽屏，同时挡住 1e9 级异常值） */
const WINDOW_BOUNDS_COORDINATE_LIMIT = 100000
/** 窗口尺寸上限（下限 1：真正的可用尺寸由系统窗口管理器决定） */
const WINDOW_BOUNDS_SIZE_LIMIT = 32768

/** 校验 system 配置写入（对话框 17 字段 + 主进程 SystemSetting 全字段） */
export function validateSystemConfig(data: unknown): ConfigValidationResult {
    if (!isPlainObject(data)) {
        return { ok: false, reason: 'system 配置必须是纯对象' }
    }
    const value: Record<string, unknown> = {}
    const adjusted: string[] = []

    for (const [field, raw] of Object.entries(data)) {
        if (raw === undefined) {
            continue
        }
        if (SYSTEM_BOOLEAN_FIELDS.has(field)) {
            if (typeof raw === 'boolean') {
                value[field] = raw
            } else {
                adjusted.push(`${field}: 期望布尔值，已丢弃`)
            }
            continue
        }
        if (field === 'fontFamily') {
            const safeFontFamily = sanitizeFontFamily(raw)
            if (safeFontFamily === null) {
                return { ok: false, reason: 'fontFamily 含不安全字符（疑似 CSS 注入），拒绝写入' }
            }
            value.fontFamily = safeFontFamily
            continue
        }
        const limits = SYSTEM_NUMBER_LIMITS[field]
        if (limits) {
            const clamped = clampNumber(raw, limits.min, limits.max)
            if (clamped === null) {
                adjusted.push(`${field}: 期望有限数字，已丢弃`)
            } else {
                value[field] = clamped.value
                if (clamped.clamped) {
                    adjusted.push(
                        `${field}: 超出 ${limits.min}~${limits.max}，已钳制为 ${clamped.value}`
                    )
                }
            }
            continue
        }
        if (field === 'language') {
            if (typeof raw === 'string' && LANGUAGE_PATTERN.test(raw)) {
                value.language = raw
            } else {
                adjusted.push('language: 非法语言标签，已丢弃')
            }
            continue
        }
        const allowedValues = SYSTEM_ENUM_FIELDS[field]
        if (allowedValues) {
            if (typeof raw === 'string' && allowedValues.includes(raw)) {
                value[field] = raw
            } else {
                adjusted.push(`${field}: 不在枚举 [${allowedValues.join(', ')}] 内，已丢弃`)
            }
            continue
        }
        if (SYSTEM_SHORT_FIELDS.has(field)) {
            if (typeof raw === 'string' && SHORT_ID_PATTERN.test(raw)) {
                value[field] = raw
            } else {
                adjusted.push(`${field}: 非法短标识，已丢弃`)
            }
            continue
        }
        if (field === 'defaultFilePath') {
            if (
                typeof raw === 'string' &&
                raw.length <= MAX_PATH_STRING_LENGTH &&
                !hasControlChars(raw)
            ) {
                value.defaultFilePath = raw
            } else {
                adjusted.push('defaultFilePath: 非法路径字符串，已丢弃')
            }
            continue
        }
        if (field === 'windowBounds') {
            // 「记住窗口位置和大小」的持久化边界（主进程写入，此处防御渲染层传入）。
            // 坐标/尺寸合法范围与 handlers.ts 的 AS-6 校验一致（该模块不可被本文件
            // import——handlers 反向依赖 config，故常量就地复制并注明同步点）。
            if (raw === null) {
                value.windowBounds = null
                continue
            }
            if (isPlainObject(raw)) {
                const bounds = raw as Record<string, unknown>
                const coords = [bounds.x, bounds.y]
                const sizes = [bounds.width, bounds.height]
                const coordsValid = coords.every(
                    (v) =>
                        typeof v === 'number' &&
                        Number.isFinite(v) &&
                        Number.isInteger(v) &&
                        Math.abs(v) <= WINDOW_BOUNDS_COORDINATE_LIMIT
                )
                const sizesValid = sizes.every(
                    (v) =>
                        typeof v === 'number' &&
                        Number.isFinite(v) &&
                        Number.isInteger(v) &&
                        v >= 1 &&
                        v <= WINDOW_BOUNDS_SIZE_LIMIT
                )
                if (coordsValid && sizesValid) {
                    value.windowBounds = {
                        x: bounds.x,
                        y: bounds.y,
                        width: bounds.width,
                        height: bounds.height
                    }
                } else {
                    adjusted.push('windowBounds: 坐标/尺寸非法，已丢弃')
                }
            } else {
                adjusted.push('windowBounds: 必须是 null 或 {x,y,width,height} 对象，已丢弃')
            }
            continue
        }
        adjusted.push(`${field}: 未知系统设置字段，已丢弃`)
    }

    return { ok: true, value, adjusted }
}

// ============================ theme 配置 schema ============================

/** Monaco 主题标识安全字符集（与 theme-registry 的路径逃逸校验一致） */
const THEME_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/** 校验 theme 配置写入（currentTheme 必须为已知主题，否则拒绝） */
export function validateThemeConfig(data: unknown): ConfigValidationResult {
    if (!isPlainObject(data)) {
        return { ok: false, reason: 'theme 配置必须是纯对象' }
    }
    const value: Record<string, unknown> = {}
    const adjusted: string[] = []

    for (const [field, raw] of Object.entries(data)) {
        if (raw === undefined) {
            continue
        }
        if (field === 'currentTheme') {
            if (!isKnownThemeType(raw)) {
                return {
                    ok: false,
                    reason: `currentTheme 不是已知主题（${String(raw)}），拒绝写入`
                }
            }
            value.currentTheme = raw
            continue
        }
        if (field === 'separateEditorTheme') {
            if (typeof raw === 'boolean') {
                value.separateEditorTheme = raw
            } else {
                adjusted.push('separateEditorTheme: 期望布尔值，已丢弃')
            }
            continue
        }
        if (field === 'editorTheme') {
            if (typeof raw === 'string' && THEME_ID_PATTERN.test(raw)) {
                value.editorTheme = raw
            } else {
                return { ok: false, reason: `editorTheme 非法（${String(raw)}），拒绝写入` }
            }
            continue
        }
        adjusted.push(`${field}: 未知主题配置字段，已丢弃`)
    }

    return { ok: true, value, adjusted }
}

// ============================ editor 配置 schema ============================

/** 编辑器设置布尔字段（渲染层 EditorSettingDialog 形状） */
const EDITOR_BOOLEAN_FIELDS: ReadonlySet<string> = new Set([
    'autoSave',
    'enableFolding',
    'showLineNumbers',
    'enableAutoComplete',
    'enableLivePreview',
    'enableCodeHighlight',
    'enableLinkHighlight',
    'enableExperimental'
])

/** 编辑器设置数值字段范围（lineHeight 为倍数，允许小数） */
const EDITOR_NUMBER_LIMITS: Readonly<Record<string, { min: number; max: number }>> = {
    autoSaveInterval: { min: 5, max: 86400 },
    cursorWidth: { min: 1, max: 10 },
    fontSize: { min: FONT_SIZE_MIN, max: FONT_SIZE_MAX },
    lineHeight: { min: 0.5, max: 5 },
    previewDelay: { min: 0, max: 60000 },
    maxFileSize: { min: 1, max: 2048 },
    renderDelay: { min: 0, max: 60000 }
}

/** 编辑器光标样式枚举（含 Monaco 的 line-thin/block-outline/underline-thin） */
const EDITOR_CURSOR_STYLES: readonly string[] = [
    'line',
    'block',
    'underline',
    'blink',
    'line-thin',
    'block-outline',
    'underline-thin'
]

/** 校验 editor 配置写入（只保留已知字段并收敛取值范围） */
export function validateEditorConfig(data: unknown): ConfigValidationResult {
    if (!isPlainObject(data)) {
        return { ok: false, reason: 'editor 配置必须是纯对象' }
    }
    const value: Record<string, unknown> = {}
    const adjusted: string[] = []

    for (const [field, raw] of Object.entries(data)) {
        if (raw === undefined) {
            continue
        }
        if (EDITOR_BOOLEAN_FIELDS.has(field)) {
            if (typeof raw === 'boolean') {
                value[field] = raw
            } else {
                adjusted.push(`${field}: 期望布尔值，已丢弃`)
            }
            continue
        }
        const limits = EDITOR_NUMBER_LIMITS[field]
        if (limits) {
            const clamped = clampNumber(raw, limits.min, limits.max)
            if (clamped === null) {
                adjusted.push(`${field}: 期望有限数字，已丢弃`)
            } else {
                value[field] = clamped.value
                if (clamped.clamped) {
                    adjusted.push(
                        `${field}: 超出 ${limits.min}~${limits.max}，已钳制为 ${clamped.value}`
                    )
                }
            }
            continue
        }
        if (field === 'cursorStyle') {
            if (typeof raw === 'string' && EDITOR_CURSOR_STYLES.includes(raw)) {
                value.cursorStyle = raw
            } else {
                adjusted.push(
                    `cursorStyle: 不在枚举 [${EDITOR_CURSOR_STYLES.join(', ')}] 内，已丢弃`
                )
            }
            continue
        }
        adjusted.push(`${field}: 未知编辑器设置字段，已丢弃`)
    }

    return { ok: true, value, adjusted }
}

// ============================ quick-links 配置 schema ============================

/** 单次允许保存的最大快捷链接条数（与 quick-link-config 的 IPC 归一化上限一致） */
const MAX_QUICK_LINKS = 50
/** 快捷链接字段长度上限 */
const QUICK_LINK_FIELD_LIMITS: Readonly<Record<string, number>> = {
    id: 128,
    name: 100,
    url: 4096,
    icon: 64,
    iconContent: 4096,
    description: 2000
}

/** 归一化单条「渲染层形状」快捷链接（{name,url,icon,description}），非法条目返回 null */
function normalizeRendererQuickLink(raw: unknown): Record<string, unknown> | null {
    if (!isPlainObject(raw)) {
        return null
    }
    const item: Record<string, unknown> = {}
    for (const [field, maxLength] of Object.entries(QUICK_LINK_FIELD_LIMITS)) {
        const value = raw[field]
        if (value === undefined) {
            continue
        }
        if (typeof value !== 'string') {
            return null
        }
        const trimmed = value.trim()
        if (trimmed.length > maxLength || hasControlChars(trimmed)) {
            return null
        }
        item[field] = trimmed
    }
    // 渲染层「名称/URL 必填」的表单约束：缺失即视为非法条目
    if (typeof item.name !== 'string' || item.name.length === 0) {
        return null
    }
    const url = typeof item.url === 'string' ? item.url : ''
    if (url.length === 0) {
        return null
    }
    return item
}

/**
 * 校验 quick-links / quickLinks 配置写入：
 * 接受数组或 { links: [...] } 包裹，条目按渲染层形状归一化（{name,url,icon,description}）。
 * 非法条目丢弃（不因单条坏数据拒绝整次保存），整体结构非法时拒绝。
 */
export function validateQuickLinksConfig(data: unknown): ConfigValidationResult {
    const rawItems = Array.isArray(data)
        ? data
        : isPlainObject(data) && Array.isArray(data.links)
          ? data.links
          : null
    if (rawItems === null) {
        return { ok: false, reason: 'quick-links 必须是数组或 { links: [...] }' }
    }
    if (rawItems.length > MAX_QUICK_LINKS) {
        return { ok: false, reason: `快捷链接条数超限（> ${MAX_QUICK_LINKS}）` }
    }
    const links: Record<string, unknown>[] = []
    let dropped = 0
    for (const raw of rawItems) {
        const normalized = normalizeRendererQuickLink(raw)
        if (normalized === null) {
            dropped += 1
            continue
        }
        links.push(normalized)
    }
    const adjusted = dropped > 0 ? [`${dropped} 条非法快捷链接已丢弃`] : []
    // 保持调用方传入的包裹形态（数组还是 { links }），避免破坏既有读取方
    const value = Array.isArray(data) ? links : { ...(data as Record<string, unknown>), links }
    return { ok: true, value, adjusted }
}

// ============================ 裸 JSON 配置 schema ============================

/** 最近文件夹历史最大条数（欢迎页展示 + 打开入参） */
const MAX_RECENT_FOLDERS = 50

/** 校验 recent-folders 写入（字符串数组；非法条目丢弃，结构非法拒绝） */
export function validateRecentFoldersConfig(data: unknown): ConfigValidationResult {
    if (!Array.isArray(data)) {
        return { ok: false, reason: 'recent-folders 必须是字符串数组' }
    }
    const folders: string[] = []
    let dropped = 0
    for (const raw of data) {
        if (
            typeof raw !== 'string' ||
            raw.trim().length === 0 ||
            raw.length > MAX_PATH_STRING_LENGTH ||
            hasControlChars(raw)
        ) {
            dropped += 1
            continue
        }
        folders.push(raw)
    }
    const adjusted = dropped > 0 ? [`${dropped} 条非法最近文件夹已丢弃`] : []
    return { ok: true, value: folders.slice(0, MAX_RECENT_FOLDERS), adjusted }
}

/** 校验 show-welcome 写入（布尔值） */
export function validateShowWelcomeConfig(data: unknown): ConfigValidationResult {
    if (typeof data !== 'boolean') {
        return { ok: false, reason: 'show-welcome 必须是布尔值' }
    }
    return { ok: true, value: data }
}

// ============================ 统一入口 ============================

/**
 * AS-4：按配置名做统一校验（config-manager.writeConfig 的唯一入口）。
 *
 * - 'backup' 承载备份/恢复命令（data 形如 { action }），命令参数由
 *   config-backup.handleConfigBackupCommand 自行校验，这里直接放行；
 * - 已知配置名各自走字段级 schema；未知配置名拒绝（白名单外）。
 */
export function validateConfigData(configName: string, data: unknown): ConfigValidationResult {
    if (!isAllowedConfigName(configName)) {
        return { ok: false, reason: `配置名不在白名单内：${String(configName)}` }
    }
    switch (configName) {
        case 'system':
            return validateSystemConfig(data)
        case 'theme':
            return validateThemeConfig(data)
        case 'editor':
            return validateEditorConfig(data)
        case 'quick-links':
        case 'quickLinks':
            return validateQuickLinksConfig(data)
        case 'recent-folders':
            return validateRecentFoldersConfig(data)
        case 'show-welcome':
            return validateShowWelcomeConfig(data)
        case 'backup':
            return { ok: true, value: data }
        default:
            return { ok: false, reason: `未定义校验规则的配置名：${configName}` }
    }
}
