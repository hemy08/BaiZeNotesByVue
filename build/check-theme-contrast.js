#!/usr/bin/env node
/**
 * 28 套应用主题对比度硬门禁（1.5.6 方案一批次 A：REQ-01 / REQ-02 / REQ-03）
 *
 * ## 为什么需要本脚本
 * 1.5.5 主题一致性扫描（证据 out/tmp/fix-dark-theme/theme-consistency-scan.json）发现 14 套
 * 主题「按钮文字 / 按钮底」对比度不足 WCAG AA（白字 + 中亮度强调色底），但当时只有临时扫描
 * 脚本、没有入库门禁——主题配色数据以后被改动（新增主题、微调强调色）时，可读性劣化没有任何
 * 静态检查能拦截。本脚本把该检查做成可重复执行的硬门禁，并接入质量基线（--check）与单测。
 *
 * ## 检查项（阈值与 1.5.6 需求 REQ-03 一致）
 * 1. 正文 textColor / 页面底 backgroundColor ≥ 4.5:1
 * 2. 正文 textColor / 卡片面 cardBackground ≥ 4.5:1
 * 3. 次要文字 secondaryTextColor / 页面底 backgroundColor ≥ 3:1
 * 4. 次要文字 secondaryTextColor / 卡片面 cardBackground ≥ 3:1
 * 5. 按钮文字 buttonTextColor / 按钮底 buttonBackground ≥ 4.5:1
 * 6. 强调色 accentColor / 页面底 backgroundColor ≥ 3:1（WCAG 1.4.11 非文本对比度口径）
 * 7. 声明分组 = 实测明暗（REQ-02 回归护栏）：light / eyecare 组须为浅色表面、dark 组须为
 *    深色表面。明暗按 cardBackground 相对亮度 < 0.45 判定，与 shared/theme-tokens.ts 的
 *    resolveSemanticThemeGroup 同口径（该函数是运行时兜底，本门禁保证声明数据本身自洽）。
 *
 * ## 数据来源（纯静态解析，不 import 主进程运行时模块，避免 electron-store 依赖链）
 * - 主题配色：src/main/config/theme-config.ts 的 `themes` 注册表（28 项）；
 * - 分组声明：src/shared/constants/theme.ts 的 LIGHT_THEME_TYPES / DARK_THEME_TYPES /
 *   EYECARE_THEME_TYPES（解析约束与 tests/unit/theme-contract.test.ts 同形状）。
 *
 * ## 用法
 *   node build/check-theme-contrast.js           # 输出 28 行表格 + 失败列表；有失败 exit 1
 *   node build/check-theme-contrast.js --brief   # 只输出汇总与失败列表（质量基线集成用）
 *   node build/check-theme-contrast.js --json    # 输出 JSON（测试 / 工具消费）
 *   node build/check-theme-contrast.js --help
 *
 * ## 编程接口（供 build/generate-quality-baseline.js --check 与单测复用）
 *   const { checkThemeContrast } = require('./check-theme-contrast.js')
 *   const result = checkThemeContrast() // { ok, themeCount, contrastCheckCount, failures, rows }
 * 另导出对比度 / 亮度纯函数、parseThemes / parseDeclaredGroups 与 evaluateThemes，
 * 测试可注入「修正前历史配色」验证门禁能变红（红→绿回归证据）。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
/** 主题配色真源（主进程） */
const THEME_CONFIG_PATH = path.join(ROOT, 'src', 'main', 'config', 'theme-config.ts')
/** 分组声明真源（shared 常量） */
const THEME_GROUPS_PATH = path.join(ROOT, 'src', 'shared', 'constants', 'theme.ts')
/** 主题注册表起始标记（形状约束与 tests/unit/theme-contract.test.ts 一致） */
const THEME_REGISTRY_MARKER = 'export const themes: Record<ThemeType, ThemeStyles> = {'

/**
 * WCAG 2.x 阈值（REQ-03 固定口径；改动需同步 1.5.6 需求文档与单测）。
 * darkSurfaceLuminance 与 shared/theme-tokens.ts#resolveSemanticThemeGroup 的 0.45 同口径。
 */
const WCAG_THRESHOLDS = Object.freeze({
    textOnBackground: 4.5,
    textOnCard: 4.5,
    secondaryOnBackground: 3,
    secondaryOnCard: 3,
    buttonTextOnButton: 4.5,
    accentOnBackground: 3,
    darkSurfaceLuminance: 0.45
})

/** 对比度检查规则（顺序即表格列顺序） */
const CONTRAST_RULES = Object.freeze([
    {
        code: 'textOnBackground',
        label: '正文/页面底',
        foreground: 'textColor',
        background: 'backgroundColor',
        threshold: WCAG_THRESHOLDS.textOnBackground
    },
    {
        code: 'textOnCard',
        label: '正文/卡片面',
        foreground: 'textColor',
        background: 'cardBackground',
        threshold: WCAG_THRESHOLDS.textOnCard
    },
    {
        code: 'secondaryOnBackground',
        label: '次要文字/页面底',
        foreground: 'secondaryTextColor',
        background: 'backgroundColor',
        threshold: WCAG_THRESHOLDS.secondaryOnBackground
    },
    {
        code: 'secondaryOnCard',
        label: '次要文字/卡片面',
        foreground: 'secondaryTextColor',
        background: 'cardBackground',
        threshold: WCAG_THRESHOLDS.secondaryOnCard
    },
    {
        code: 'buttonTextOnButton',
        label: '按钮文字/按钮底',
        foreground: 'buttonTextColor',
        background: 'buttonBackground',
        threshold: WCAG_THRESHOLDS.buttonTextOnButton
    },
    {
        code: 'accentOnBackground',
        label: '强调色/页面底',
        foreground: 'accentColor',
        background: 'backgroundColor',
        threshold: WCAG_THRESHOLDS.accentOnBackground
    }
])

/**
 * 非阻断观察项（不计入退出码，仅提示既有残留风险）：
 * 对话框主按钮 `.dialog-btn--primary` 的实际配色是「--ui-accent（= accentColor）作底色 +
 * --button-text-color（= buttonTextColor）作文字色」，与 REQ-03 规定的「按钮文字/按钮底」
 * 组合不完全等价（主题里 buttonBackground 与 accentColor 可以是不同色，例如 baize-text /
 * baize-clear）。本批次 REQ-01 只授权修复 14 套「按钮文字/按钮底」不达标的主题，这条观察项
 * 用于把剩余组合风险显式暴露出来，留给后续批次按产品口径处理，不阻断门禁。
 */
const DIAGNOSTIC_RULES = Object.freeze([
    {
        code: 'accentOnButtonText',
        label: '强调色/按钮文字（对话框主按钮实际组合）',
        foreground: 'accentColor',
        background: 'buttonTextColor'
    }
])

/** 门禁解析主题所需的颜色字段（缺字段直接报错，避免「解析到空对象但检查全通过」的假绿） */
const REQUIRED_COLOR_FIELDS = Object.freeze([
    'backgroundColor',
    'cardBackground',
    'textColor',
    'secondaryTextColor',
    'borderColor',
    'accentColor',
    'buttonBackground',
    'buttonTextColor',
    'hoverBackground'
])

/**
 * 解析 CSS 颜色为 {r,g,b}（0~255）。
 * 支持 #rgb / #rrggbb / #rgba / #rrggbbaa 与 rgb()/rgba()；alpha 不参与 WCAG 亮度计算
 * （主题真源当前全部为不透明色；若未来出现半透明色，对比度按合成后颜色另行评估）。
 * @param {unknown} value
 * @returns {{r: number, g: number, b: number} | null}
 */
function parseColor(value) {
    if (typeof value !== 'string') return null
    const text = value.trim()
    const hexMatch = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.exec(text)
    if (hexMatch) {
        const digits = hexMatch[1]
        if (digits.length === 3 || digits.length === 4) {
            const triplet = digits
                .slice(0, 3)
                .split('')
                .map((digit) => parseInt(digit + digit, 16))
            return { r: triplet[0], g: triplet[1], b: triplet[2] }
        }
        return {
            r: parseInt(digits.slice(0, 2), 16),
            g: parseInt(digits.slice(2, 4), 16),
            b: parseInt(digits.slice(4, 6), 16)
        }
    }
    const rgbMatch =
        /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*[\d.]+)?\s*\)$/i.exec(text)
    if (rgbMatch) {
        const channels = [rgbMatch[1], rgbMatch[2], rgbMatch[3]].map((channel) => {
            const amount = Number.parseFloat(channel)
            return Number.isFinite(amount) ? Math.min(255, Math.max(0, amount)) : NaN
        })
        if (channels.some((channel) => Number.isNaN(channel))) return null
        return { r: channels[0], g: channels[1], b: channels[2] }
    }
    return null
}

/**
 * WCAG 2.x 相对亮度（sRGB 线性化后加权：0.2126R + 0.7152G + 0.0722B）。
 * @param {unknown} value
 * @returns {number | null} 无法解析时返回 null
 */
function relativeLuminance(value) {
    const parsed = parseColor(value)
    if (!parsed) return null
    const linearize = (channel) => {
        const normalized = channel / 255
        return normalized <= 0.03928
            ? normalized / 12.92
            : Math.pow((normalized + 0.055) / 1.055, 2.4)
    }
    return (
        0.2126 * linearize(parsed.r) + 0.7152 * linearize(parsed.g) + 0.0722 * linearize(parsed.b)
    )
}

/**
 * WCAG 2.x 对比度（前景/背景，1~21）。任一颜色无法解析时返回 null。
 * @param {unknown} foreground
 * @param {unknown} background
 * @returns {number | null}
 */
function contrastRatio(foreground, background) {
    const foregroundLuminance = relativeLuminance(foreground)
    const backgroundLuminance = relativeLuminance(background)
    if (foregroundLuminance === null || backgroundLuminance === null) return null
    const lighter = Math.max(foregroundLuminance, backgroundLuminance)
    const darker = Math.min(foregroundLuminance, backgroundLuminance)
    return (lighter + 0.05) / (darker + 0.05)
}

/** 按表面（卡片面）相对亮度判定实测明暗：< 0.45 为深色，无法解析按浅色处理（与运行时分派同向） */
function measuredSurfaceClass(themeFields) {
    const luminance = relativeLuminance(themeFields.cardBackground)
    return luminance !== null && luminance < WCAG_THRESHOLDS.darkSurfaceLuminance ? 'dark' : 'light'
}

/**
 * 解析主进程主题注册表。
 * 形状约束：`export const themes: Record<ThemeType, ThemeStyles> = {` 之后、顶格 `}` 之前，
 * 4 空格缩进且以 `: {` 结尾的键开始一个主题；8 空格缩进的 `field: 'value'` 为颜色字段。
 * @param {string} source theme-config.ts 源码
 * @returns {Array<{type: string, fields: Record<string, string>}>}
 */
function parseThemesFromSource(source) {
    const normalized = String(source).replace(/\r\n/g, '\n')
    const start = normalized.indexOf(THEME_REGISTRY_MARKER)
    if (start < 0) {
        throw new Error(`未在 ${path.basename(THEME_CONFIG_PATH)} 找到主题注册表标记`)
    }
    const entries = []
    let current = null
    for (const line of normalized.slice(start + THEME_REGISTRY_MARKER.length).split('\n')) {
        if (line === '}') break
        const keyMatch = line.match(/^ {4}(?:'([^']+)'|([A-Za-z][\w-]*)): \{$/)
        if (keyMatch) {
            current = { type: keyMatch[1] ?? keyMatch[2], fields: {} }
            entries.push(current)
            continue
        }
        if (!current) continue
        const fieldMatch = line.match(/^ {8}([A-Za-z]+): '([^']*)'/)
        if (fieldMatch) current.fields[fieldMatch[1]] = fieldMatch[2]
    }
    if (entries.length === 0) {
        throw new Error('主题注册表解析结果为空，请检查 theme-config.ts 结构是否变化')
    }
    for (const entry of entries) {
        const missing = REQUIRED_COLOR_FIELDS.filter((field) => !entry.fields[field])
        if (missing.length) {
            throw new Error(`主题 ${entry.type} 缺少颜色字段：${missing.join(', ')}`)
        }
    }
    return entries
}

/** 读取并解析主进程主题注册表（28 项） */
function parseThemes() {
    return parseThemesFromSource(fs.readFileSync(THEME_CONFIG_PATH, 'utf-8'))
}

/**
 * 解析 shared/constants/theme.ts 的三组明暗声明清单。
 * @param {string} source shared/constants/theme.ts 源码
 * @returns {{light: string[], dark: string[], eyecare: string[]}}
 */
function parseDeclaredGroupsFromSource(source) {
    const normalized = String(source).replace(/\r\n/g, '\n')
    const pick = (constantName) => {
        const pattern = new RegExp(
            `export const ${constantName} = \\[([\\s\\S]*?)\\] as const`,
            'm'
        )
        const match = pattern.exec(normalized)
        if (!match) {
            throw new Error(`未在 shared/constants/theme.ts 找到 ${constantName} 清单`)
        }
        return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1])
    }
    return {
        light: pick('LIGHT_THEME_TYPES'),
        dark: pick('DARK_THEME_TYPES'),
        eyecare: pick('EYECARE_THEME_TYPES')
    }
}

/** 读取并解析三组明暗声明清单 */
function parseDeclaredGroups() {
    return parseDeclaredGroupsFromSource(fs.readFileSync(THEME_GROUPS_PATH, 'utf-8'))
}

/** 主题类型 → 声明分组（未声明返回 '?'） */
function declaredGroupOf(declaredGroups, type) {
    for (const group of ['light', 'dark', 'eyecare']) {
        if (declaredGroups[group].includes(type)) return group
    }
    return '?'
}

/**
 * 逐主题计算对比度与分组一致性。
 * @param {{type: string, fields: Record<string, string>}} entry
 * @param {'light'|'dark'|'eyecare'|'?'} declaredGroup
 * @returns {{type: string, declaredGroup: string, measuredClass: string, metrics: Record<string, number | null>, failures: Array<{code: string, message: string}>}}
 */
function evaluateTheme(entry, declaredGroup) {
    const failures = []
    const metrics = {}
    for (const rule of CONTRAST_RULES) {
        const foreground = entry.fields[rule.foreground]
        const background = entry.fields[rule.background]
        const value = contrastRatio(foreground, background)
        metrics[rule.code] = value
        if (value === null) {
            failures.push({
                code: rule.code,
                message: `${rule.label}：颜色无法解析（${foreground} / ${background}）= N/A，要求 ≥ ${rule.threshold}`
            })
            continue
        }
        if (value < rule.threshold) {
            failures.push({
                code: rule.code,
                message: `${rule.label} ${value.toFixed(2)} < ${rule.threshold}`
            })
        }
    }

    const measuredClass = measuredSurfaceClass(entry.fields)
    if (declaredGroup === '?') {
        failures.push({
            code: 'declaredGroupMissing',
            message: '未在 shared/constants/theme.ts 三组清单中声明明暗分组'
        })
    } else {
        const expectedClass = declaredGroup === 'dark' ? 'dark' : 'light'
        if (measuredClass !== expectedClass) {
            failures.push({
                code: 'declaredGroupMismatch',
                message: `声明分组 ${declaredGroup} 与实测明暗 ${measuredClass} 不一致（表面亮度判定）`
            })
        }
    }

    const warnings = []
    for (const rule of DIAGNOSTIC_RULES) {
        const foreground = entry.fields[rule.foreground]
        const background = entry.fields[rule.background]
        const value = contrastRatio(foreground, background)
        if (value === null) {
            warnings.push({
                code: rule.code,
                message: `${rule.label}：颜色无法解析（${foreground} / ${background}）`
            })
        } else if (value < WCAG_THRESHOLDS.textOnBackground) {
            warnings.push({
                code: rule.code,
                message: `${rule.label} ${value.toFixed(2)} < ${WCAG_THRESHOLDS.textOnBackground}（非阻断观察项）`
            })
        }
    }

    return {
        type: entry.type,
        declaredGroup,
        measuredClass,
        metrics,
        metricsDiagnostic: Object.fromEntries(
            DIAGNOSTIC_RULES.map((rule) => [
                rule.code,
                contrastRatio(entry.fields[rule.foreground], entry.fields[rule.background])
            ])
        ),
        failures,
        warnings
    }
}

/**
 * 对给定的主题数据与分组声明执行全部检查（纯函数，可注入历史数据做红→绿验证）。
 * @param {Array<{type: string, fields: Record<string, string>}>} themeEntries
 * @param {{light: string[], dark: string[], eyecare: string[]}} declaredGroups
 * @returns {{ok: boolean, themeCount: number, contrastCheckCount: number, groupCheckCount: number, thresholds: object, rows: object[], failures: Array<{type: string, code: string, message: string}>}}
 */
function evaluateThemes(themeEntries, declaredGroups) {
    const rows = themeEntries.map((entry) =>
        evaluateTheme(entry, declaredGroupOf(declaredGroups, entry.type))
    )
    const failures = []
    const warnings = []
    for (const row of rows) {
        for (const failure of row.failures) {
            failures.push({
                type: row.type,
                code: failure.code,
                message: `${row.type}：${failure.message}`
            })
        }
        for (const warning of row.warnings) {
            warnings.push({
                type: row.type,
                code: warning.code,
                message: `${row.type}：${warning.message}`
            })
        }
    }
    return {
        ok: failures.length === 0,
        themeCount: rows.length,
        contrastCheckCount: rows.length * CONTRAST_RULES.length,
        groupCheckCount: rows.length,
        thresholds: { ...WCAG_THRESHOLDS },
        rows,
        failures,
        warnings
    }
}

/**
 * 读取仓库真源并执行门禁检查（CLI 与质量基线共用入口）。
 * @returns {ReturnType<typeof evaluateThemes>}
 */
function checkThemeContrast() {
    const themeEntries = parseThemes()
    const declaredGroups = parseDeclaredGroups()
    if (themeEntries.length !== 28) {
        throw new Error(`主题注册表应有 28 项，实际解析到 ${themeEntries.length} 项`)
    }
    return evaluateThemes(themeEntries, declaredGroups)
}

/** 全角字符按 2 列宽计算，保证中英文混排表格对齐 */
function displayWidth(text) {
    return [...text].reduce((sum, char) => sum + (char.codePointAt(0) > 255 ? 2 : 1), 0)
}

function padCell(value, width) {
    const text = String(value)
    return text + ' '.repeat(Math.max(0, width - displayWidth(text)))
}

function formatMetric(value) {
    return value === null ? 'N/A' : value.toFixed(2)
}

/** 输出表格（28 行 + 表头） */
function formatTable(rows) {
    const columns = [
        { title: '主题', width: 18 },
        { title: '声明组', width: 8 },
        { title: '实测', width: 6 },
        { title: '正文/底', width: 8 },
        { title: '正文/卡', width: 8 },
        { title: '次要/底', width: 8 },
        { title: '次要/卡', width: 8 },
        { title: '按钮文字/底', width: 11 },
        { title: '强调/底', width: 8 },
        { title: '结果', width: 6 }
    ]
    const lines = [columns.map((column) => padCell(column.title, column.width)).join(' | ')]
    lines.push(columns.map((column) => '-'.repeat(column.width)).join('-+-'))
    for (const row of rows) {
        lines.push(
            [
                padCell(row.type, columns[0].width),
                padCell(row.declaredGroup, columns[1].width),
                padCell(row.measuredClass, columns[2].width),
                padCell(formatMetric(row.metrics.textOnBackground), columns[3].width),
                padCell(formatMetric(row.metrics.textOnCard), columns[4].width),
                padCell(formatMetric(row.metrics.secondaryOnBackground), columns[5].width),
                padCell(formatMetric(row.metrics.secondaryOnCard), columns[6].width),
                padCell(formatMetric(row.metrics.buttonTextOnButton), columns[7].width),
                padCell(formatMetric(row.metrics.accentOnBackground), columns[8].width),
                padCell(row.failures.length ? '❌ 失败' : '✅ 通过', columns[9].width)
            ].join(' | ')
        )
    }
    return lines.join('\n')
}

/** 输出汇总 + 失败列表 */
function formatSummary(result) {
    const lines = [
        `主题总数：${result.themeCount}（期望 28）`,
        `对比度检查组合：${result.contrastCheckCount} 项（${result.themeCount} 主题 × ${CONTRAST_RULES.length} 组合）` +
            ` + 分组一致性 ${result.groupCheckCount} 项`,
        `阈值：正文/底 ${WCAG_THRESHOLDS.textOnBackground}、正文/卡 ${WCAG_THRESHOLDS.textOnCard}、` +
            `次要/底 ${WCAG_THRESHOLDS.secondaryOnBackground}、次要/卡 ${WCAG_THRESHOLDS.secondaryOnCard}、` +
            `按钮文字/底 ${WCAG_THRESHOLDS.buttonTextOnButton}、强调/底 ${WCAG_THRESHOLDS.accentOnBackground}`
    ]
    if (result.ok) {
        lines.push(
            `\n✅ 全部通过：${result.contrastCheckCount} 项对比度组合与 ${result.groupCheckCount} 项分组一致性均达标`
        )
    } else {
        lines.push(`\n❌ 失败 ${result.failures.length} 项：`)
        for (const failure of result.failures) lines.push(`  - ${failure.message}`)
    }
    if (result.warnings.length) {
        lines.push(`\n⚠️ 非阻断观察项 ${result.warnings.length} 项（不计入退出码）：`)
        for (const warning of result.warnings) lines.push(`  - ${warning.message}`)
    }
    return lines.join('\n')
}

function printUsage() {
    console.log(
        [
            '用法：node build/check-theme-contrast.js [--brief] [--json] [--help]',
            '  默认      输出 28 套主题对比度表格 + 汇总；有失败 exit 1',
            '  --brief   只输出汇总与失败列表（质量基线集成用）',
            '  --json    输出 JSON 结果（测试 / 工具消费）',
            '  --help    显示本帮助'
        ].join('\n')
    )
}

/** 解析 CLI 参数；非法参数返回 error */
function parseArgs(argv) {
    const options = { brief: false, json: false, help: false }
    for (const arg of argv) {
        if (arg === '--brief') options.brief = true
        else if (arg === '--json') options.json = true
        else if (arg === '--help' || arg === '-h') options.help = true
        else return { error: `未知参数：${arg}（可用：--brief / --json / --help）` }
    }
    return { options }
}

function main() {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.error) {
        console.error(`[theme-contrast] ❌ ${parsed.error}`)
        process.exit(1)
    }
    if (parsed.options.help) {
        printUsage()
        return
    }

    let result
    try {
        result = checkThemeContrast()
    } catch (error) {
        console.error(`[theme-contrast] ❌ ${error.message}`)
        process.exit(1)
        return
    }

    if (parsed.options.json) {
        console.log(JSON.stringify(result, null, 2))
    } else {
        if (!parsed.options.brief) {
            console.log('[theme-contrast] 28 套应用主题对比度扫描（WCAG 2.x）')
            console.log(formatTable(result.rows))
            console.log('')
        }
        console.log(formatSummary(result))
    }

    if (!result.ok) {
        process.exit(1)
    }
}

if (require.main === module) main()

module.exports = {
    WCAG_THRESHOLDS,
    CONTRAST_RULES,
    DIAGNOSTIC_RULES,
    REQUIRED_COLOR_FIELDS,
    parseColor,
    relativeLuminance,
    contrastRatio,
    measuredSurfaceClass,
    parseThemesFromSource,
    parseThemes,
    parseDeclaredGroupsFromSource,
    parseDeclaredGroups,
    declaredGroupOf,
    evaluateTheme,
    evaluateThemes,
    checkThemeContrast
}
