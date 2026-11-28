/**
 * 28 套应用主题对比度硬门禁回归测试（1.5.6 方案一批次 A / REQ-01、REQ-02、REQ-03）
 *
 * 守护目标：
 * 1. 真实主题数据全部达标：28 主题 × 6 组对比度（正文/页面底、正文/卡片面、次要/页面底、
 *    次要/卡片面、按钮文字/按钮底、强调色/页面底）+ 28 项「声明分组 = 实测明暗」；
 * 2. 红→绿回归证据：把 1.5.5 扫描到的**修正前历史配色/分组**注入门禁，必须失败（说明护栏
 *    确实能拦住回归），再用当前真源验证通过；
 * 3. 门禁脚本自身逻辑边界：颜色解析、相对亮度、WCAG 阈值（4.5 / 3）临界值、非法颜色；
 * 4. 门禁脚本存在性与可执行约定：package.json `quality:contrast` 入口、质量基线 --check 集成、
 *    CLI 可执行且退出码符合约定。
 *
 * 说明：脚本 build/check-theme-contrast.js 是纯 CommonJS Node 脚本（不依赖 TS 构建产物），
 * 测试按 Node 语义用 createRequire 加载，与 build/generate-quality-baseline.js 的集成方式一致。
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '../..')
const GATE_SCRIPT = path.join(ROOT, 'build', 'check-theme-contrast.js')
const BASELINE_SCRIPT = path.join(ROOT, 'build', 'generate-quality-baseline.js')
const PACKAGE_JSON = path.join(ROOT, 'package.json')

interface ThemeEntry {
    type: string
    fields: Record<string, string>
}

interface DeclaredGroups {
    light: string[]
    dark: string[]
    eyecare: string[]
}

interface ContrastRule {
    code: string
    label: string
    foreground: string
    background: string
    threshold: number
}

interface ContrastFailure {
    type: string
    code: string
    message: string
}

interface ContrastRow {
    type: string
    declaredGroup: string
    measuredClass: string
    metrics: Record<string, number | null>
    failures: Array<{ code: string; message: string }>
    warnings: Array<{ code: string; message: string }>
}

interface ContrastResult {
    ok: boolean
    themeCount: number
    contrastCheckCount: number
    groupCheckCount: number
    thresholds: Record<string, number>
    rows: ContrastRow[]
    failures: ContrastFailure[]
    warnings: ContrastFailure[]
}

interface ContrastGateModule {
    WCAG_THRESHOLDS: Record<string, number>
    CONTRAST_RULES: ContrastRule[]
    DIAGNOSTIC_RULES: ContrastRule[]
    parseColor(value: unknown): { r: number; g: number; b: number } | null
    relativeLuminance(value: unknown): number | null
    contrastRatio(foreground: unknown, background: unknown): number | null
    parseThemes(): ThemeEntry[]
    parseDeclaredGroups(): DeclaredGroups
    evaluateThemes(themeEntries: ThemeEntry[], declaredGroups: DeclaredGroups): ContrastResult
    checkThemeContrast(): ContrastResult
}

const requireForGate = createRequire(import.meta.url)
const gate = requireForGate(GATE_SCRIPT) as ContrastGateModule

/** 断言指标存在并返回数值（避免 TS 严格模式下 null 未收窄） */
function metricValue(value: number | null | undefined): number {
    if (typeof value !== 'number') {
        throw new Error('对比度指标缺失（应为 number）')
    }
    return value
}

/** 复制主题条目并覆盖若干字段（红→绿注入用，不修改真实真源） */
function cloneThemeEntry(entry: ThemeEntry, patch: Record<string, string>): ThemeEntry {
    return { type: entry.type, fields: { ...entry.fields, ...patch } }
}

/** 复制分组声明并做类型移动（红→绿注入用） */
function cloneDeclaredGroups(groups: DeclaredGroups): DeclaredGroups {
    return {
        light: [...groups.light],
        dark: [...groups.dark],
        eyecare: [...groups.eyecare]
    }
}

function failureCodes(result: ContrastResult): string[] {
    return result.failures.map((failure) => failure.code)
}

// =============================================================================================
// 1. 真实主题数据（REQ-01 / REQ-02 / REQ-03 验收）
// =============================================================================================
describe('28 套主题对比度硬门禁（真实真源）', () => {
    it('主题数为 28，全部 168 项对比度组合与 28 项分组一致性均通过', () => {
        const result = gate.checkThemeContrast()
        expect(result.ok).toBe(true)
        expect(result.themeCount).toBe(28)
        expect(result.contrastCheckCount).toBe(28 * gate.CONTRAST_RULES.length)
        expect(result.groupCheckCount).toBe(28)
        expect(result.failures).toEqual([])
    })

    it('逐主题逐组合断言阈值：六项对比度全部达标（28 × 6）', () => {
        const { rows } = gate.checkThemeContrast()
        const thresholds = gate.WCAG_THRESHOLDS
        let checked = 0
        for (const row of rows) {
            for (const rule of gate.CONTRAST_RULES) {
                const value = metricValue(row.metrics[rule.code])
                expect(value, `${row.type} ${rule.label}`).toBeGreaterThanOrEqual(rule.threshold)
                checked += 1
            }
            // 阈值口径必须与需求 REQ-03 一致（防止脚本内阈值被悄悄放宽）
            expect(thresholds.textOnBackground).toBe(4.5)
            expect(thresholds.textOnCard).toBe(4.5)
            expect(thresholds.secondaryOnBackground).toBe(3)
            expect(thresholds.secondaryOnCard).toBe(3)
            expect(thresholds.buttonTextOnButton).toBe(4.5)
            expect(thresholds.accentOnBackground).toBe(3)
        }
        expect(checked).toBe(28 * 6)
    })

    it('REQ-01：14 套历史按钮对比度不足主题全部 ≥4.5（当前真源）', () => {
        // 1.5.5 扫描（out/tmp/fix-dark-theme/theme-consistency-scan.json）中的 14 套按钮失败主题
        const previouslyFailingButtonThemes = [
            'warm',
            'lavender',
            'coral',
            'mint',
            'sunset',
            'eyecare-green',
            'eyecare-beige',
            'eyecare-blue',
            'eyecare-pink',
            'eyecare-amber',
            'eyecare-teal',
            'eyecare-lilac',
            'baize-data-light',
            'baize-mirror-light'
        ]
        const buttons = new Map(
            gate
                .checkThemeContrast()
                .rows.map((row) => [row.type, metricValue(row.metrics.buttonTextOnButton)])
        )
        for (const type of previouslyFailingButtonThemes) {
            expect(buttons.get(type), `${type} 按钮文字/按钮底`).toBeGreaterThanOrEqual(4.5)
        }
    })

    it('REQ-02：三组声明数量 13 / 8 / 7，声明分组与实测明暗一致', () => {
        const declared = gate.parseDeclaredGroups()
        expect(declared.light).toHaveLength(13)
        expect(declared.dark).toHaveLength(8)
        expect(declared.eyecare).toHaveLength(7)
        // 2026-11-28 修正：forest 实测浅色底 → 浅色组；baize-text / baize-starry 实测深色底 → 深色组
        expect(declared.light).toContain('forest')
        expect(declared.dark).toContain('baize-text')
        expect(declared.dark).toContain('baize-starry')
        for (const row of gate.checkThemeContrast().rows) {
            const expectedClass = row.declaredGroup === 'dark' ? 'dark' : 'light'
            expect(row.measuredClass, `${row.type} 声明=${row.declaredGroup}`).toBe(expectedClass)
        }
    })
})

// =============================================================================================
// 2. 红→绿验证：注入 1.5.5 修正前历史数据，门禁必须变红
// =============================================================================================
describe('红→绿：修正前历史配色/分组注入后门禁必须失败', () => {
    const themes = gate.parseThemes()
    const declaredGroups = gate.parseDeclaredGroups()
    const entryOf = (type: string): ThemeEntry => {
        const entry = themes.find((item) => item.type === type)
        if (!entry) throw new Error(`未找到主题 ${type}`)
        return entry
    }

    /** 1.5.5 扫描报告中的按钮失败主题及其修正前 buttonBackground 历史值 */
    const HISTORICAL_BUTTON_BACKGROUND: Record<string, string> = {
        warm: '#e07a5f',
        lavender: '#8b7ec8',
        coral: '#e07850',
        mint: '#3cb371',
        sunset: '#e08840',
        'eyecare-green': '#4caf50',
        'eyecare-beige': '#c9a66b',
        'eyecare-blue': '#5c9ece',
        'eyecare-pink': '#e08090',
        'eyecare-amber': '#d4a050',
        'eyecare-teal': '#26a69a',
        'eyecare-lilac': '#9a70a0',
        'baize-data-light': '#0EA5E9',
        'baize-mirror-light': '#8B5CF6'
    }

    it('14 套历史按钮配色注入 → buttonTextOnButton 失败（当前真源同主题通过）', () => {
        for (const [type, historicalBackground] of Object.entries(HISTORICAL_BUTTON_BACKGROUND)) {
            const entry = entryOf(type)
            // 修正前这 14 套按钮文字均为白色（真源中存在 #ffffff / #FFFFFF 两种大小写）
            expect(entry.fields.buttonTextColor.toLowerCase(), `${type}.buttonTextColor`).toBe(
                '#ffffff'
            )
            const injected = cloneThemeEntry(entry, { buttonBackground: historicalBackground })
            const injectedResult = gate.evaluateThemes([injected], declaredGroups)
            expect(injectedResult.ok, `${type} 注入历史按钮配色后应失败`).toBe(false)
            expect(failureCodes(injectedResult), `${type}`).toContain('buttonTextOnButton')
            const injectedRatio = metricValue(injectedResult.rows[0].metrics.buttonTextOnButton)
            expect(injectedRatio, `${type} 历史按钮对比度`).toBeLessThan(4.5)
            // 当前真源同主题必须通过
            const currentResult = gate.evaluateThemes([entry], declaredGroups)
            expect(currentResult.ok, `${type} 当前真源应通过`).toBe(true)
        }
    })

    /** 1.5.5 扫描报告中的强调色/页面底失败主题及其修正前 accentColor 历史值 */
    const HISTORICAL_ACCENT_COLOR: Record<string, string> = {
        warm: '#e07a5f',
        lavender: '#8b7ec8',
        coral: '#e07850',
        mint: '#3cb371',
        sunset: '#e08840',
        'eyecare-green': '#4caf50',
        'eyecare-beige': '#c9a66b',
        'eyecare-blue': '#5c9ece',
        'eyecare-pink': '#e08090',
        'eyecare-amber': '#d4a050',
        'eyecare-teal': '#26a69a',
        'baize-clear': '#ffed4e',
        'baize-data-light': '#0EA5E9'
    }

    it('13 套历史强调色注入 → accentOnBackground 失败（当前真源同主题通过）', () => {
        for (const [type, historicalAccent] of Object.entries(HISTORICAL_ACCENT_COLOR)) {
            const entry = entryOf(type)
            const injected = cloneThemeEntry(entry, { accentColor: historicalAccent })
            const injectedResult = gate.evaluateThemes([injected], declaredGroups)
            expect(injectedResult.ok, `${type} 注入历史强调色后应失败`).toBe(false)
            expect(failureCodes(injectedResult), `${type}`).toContain('accentOnBackground')
            const injectedRatio = metricValue(injectedResult.rows[0].metrics.accentOnBackground)
            expect(injectedRatio, `${type} 历史强调色对比度`).toBeLessThan(3)
            const currentResult = gate.evaluateThemes([entry], declaredGroups)
            expect(currentResult.ok, `${type} 当前真源应通过`).toBe(true)
        }
    })

    it('3 套历史分组声明注入 → declaredGroupMismatch 失败（当前声明一致）', () => {
        // 还原 2026-11-28 修正前的分组：forest 在深色组，baize-text / baize-starry 在浅色组
        const historicalGroups = cloneDeclaredGroups(declaredGroups)
        historicalGroups.light = historicalGroups.light.filter((type) => type !== 'forest')
        historicalGroups.dark = historicalGroups.dark.filter(
            (type) => type !== 'baize-text' && type !== 'baize-starry'
        )
        historicalGroups.light.push('baize-text', 'baize-starry')
        historicalGroups.dark.push('forest')

        const historicalResult = gate.evaluateThemes(themes, historicalGroups)
        expect(historicalResult.ok).toBe(false)
        const mismatchTypes = historicalResult.failures
            .filter((failure) => failure.code === 'declaredGroupMismatch')
            .map((failure) => failure.type)
            .sort()
        expect(mismatchTypes).toEqual(['baize-starry', 'baize-text', 'forest'])
        // 当前分组声明无任何不一致
        expect(failureCodes(gate.evaluateThemes(themes, declaredGroups))).toEqual([])
    })
})

// =============================================================================================
// 3. 脚本逻辑边界：颜色解析 / 相对亮度 / WCAG 阈值临界值
// =============================================================================================
describe('门禁脚本逻辑边界（颜色解析 / 亮度 / WCAG 阈值）', () => {
    it('parseColor：支持 #rgb / #rrggbb / #rgba / #rrggbbaa / rgb() / rgba()，非法值返回 null', () => {
        expect(gate.parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255 })
        expect(gate.parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0 })
        expect(gate.parseColor('#123456')).toEqual({ r: 0x12, g: 0x34, b: 0x56 })
        // alpha 不参与 WCAG 亮度计算，仅取 RGB 通道
        expect(gate.parseColor('#1234')).toEqual({ r: 0x11, g: 0x22, b: 0x33 })
        expect(gate.parseColor('#12345678')).toEqual({ r: 0x12, g: 0x34, b: 0x56 })
        expect(gate.parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 })
        expect(gate.parseColor('rgba(0, 0, 0, 0.5)')).toEqual({ r: 0, g: 0, b: 0 })
        expect(gate.parseColor('not-a-color')).toBeNull()
        expect(gate.parseColor('rgb(999, 0, 0)')).toEqual({ r: 255, g: 0, b: 0 })
        expect(gate.parseColor(undefined)).toBeNull()
        expect(gate.parseColor(123)).toBeNull()
    })

    it('relativeLuminance：黑 0、白 1、非法 null', () => {
        expect(gate.relativeLuminance('#000000')).toBeCloseTo(0, 6)
        expect(gate.relativeLuminance('#ffffff')).toBeCloseTo(1, 6)
        expect(gate.relativeLuminance('bad')).toBeNull()
    })

    it('contrastRatio：黑白 21:1、同色 1:1、非法 null', () => {
        expect(metricValue(gate.contrastRatio('#000000', '#ffffff'))).toBeCloseTo(21, 5)
        expect(metricValue(gate.contrastRatio('#123456', '#123456'))).toBeCloseTo(1, 5)
        expect(gate.contrastRatio('bad', '#ffffff')).toBeNull()
    })

    it('WCAG 4.5:1 临界值：#767676/白 达标、#777777/白 不达标（正文阈值生效）', () => {
        const passRatio = metricValue(gate.contrastRatio('#767676', '#ffffff'))
        const failRatio = metricValue(gate.contrastRatio('#777777', '#ffffff'))
        expect(passRatio).toBeGreaterThanOrEqual(4.5)
        expect(failRatio).toBeLessThan(4.5)

        const baize = cloneThemeEntry(gate.parseThemes()[0], {
            backgroundColor: '#ffffff',
            cardBackground: '#ffffff',
            textColor: '#767676'
        })
        const passResult = gate.evaluateThemes([baize], {
            light: [baize.type],
            dark: [],
            eyecare: []
        })
        expect(failureCodes(passResult)).not.toContain('textOnBackground')

        const failEntry = cloneThemeEntry(baize, { textColor: '#777777' })
        const failResult = gate.evaluateThemes([failEntry], {
            light: [failEntry.type],
            dark: [],
            eyecare: []
        })
        expect(failureCodes(failResult)).toContain('textOnBackground')
    })

    it('WCAG 3:1 临界值：#949494/白 达标、#959595/白 不达标（次要文字阈值生效）', () => {
        const passRatio = metricValue(gate.contrastRatio('#949494', '#ffffff'))
        const failRatio = metricValue(gate.contrastRatio('#959595', '#ffffff'))
        expect(passRatio).toBeGreaterThanOrEqual(3)
        expect(failRatio).toBeLessThan(3)

        const base = cloneThemeEntry(gate.parseThemes()[0], {
            backgroundColor: '#ffffff',
            cardBackground: '#ffffff',
            textColor: '#000000',
            secondaryTextColor: '#949494'
        })
        const groups: DeclaredGroups = { light: [base.type], dark: [], eyecare: [] }
        expect(failureCodes(gate.evaluateThemes([base], groups))).not.toContain(
            'secondaryOnBackground'
        )
        const failEntry = cloneThemeEntry(base, { secondaryTextColor: '#959595' })
        expect(
            failureCodes(
                gate.evaluateThemes([failEntry], {
                    light: [failEntry.type],
                    dark: [],
                    eyecare: []
                })
            )
        ).toContain('secondaryOnBackground')
    })

    it('非法颜色与未声明分组：门禁失败并给出可读原因（不静默通过）', () => {
        const base = gate.parseThemes()[0]
        const badColor = cloneThemeEntry(base, { accentColor: 'not-a-color' })
        const badColorResult = gate.evaluateThemes([badColor], {
            light: [badColor.type],
            dark: [],
            eyecare: []
        })
        expect(badColorResult.ok).toBe(false)
        expect(failureCodes(badColorResult)).toContain('accentOnBackground')
        expect(badColorResult.failures[0].message).toContain('无法解析')

        const missingGroup = gate.evaluateThemes([base], { light: [], dark: [], eyecare: [] })
        expect(missingGroup.ok).toBe(false)
        expect(failureCodes(missingGroup)).toContain('declaredGroupMissing')

        const mismatchGroup = gate.evaluateThemes([base], {
            light: [],
            dark: [base.type],
            eyecare: []
        })
        expect(failureCodes(mismatchGroup)).toContain('declaredGroupMismatch')
    })
})

// =============================================================================================
// 4. 门禁脚本存在性与可执行约定（CLI / package.json / 质量基线集成）
// =============================================================================================
describe('门禁脚本存在性与可执行约定', () => {
    it('build/check-theme-contrast.js 存在，且为可执行 Node CLI（require.main 守卫 + exit 1 + 导出）', () => {
        expect(fs.existsSync(GATE_SCRIPT)).toBe(true)
        const source = fs.readFileSync(GATE_SCRIPT, 'utf8')
        expect(source).toContain('#!/usr/bin/env node')
        expect(source).toContain('if (require.main === module) main()')
        expect(source).toContain('process.exit(1)')
        expect(source).toContain('checkThemeContrast')
    })

    it('package.json 提供 quality:contrast 脚本入口（指向门禁脚本）', () => {
        const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8')) as {
            scripts: Record<string, string>
        }
        expect(pkg.scripts['quality:contrast']).toBe('node build/check-theme-contrast.js')
    })

    it('质量基线 --check 已集成对比度门禁（失败纳入退出码）', () => {
        const source = fs.readFileSync(BASELINE_SCRIPT, 'utf8')
        expect(source).toContain("require('./check-theme-contrast.js')")
        expect(source).toContain('checkThemeContrast')
        expect(source).toContain('主题对比度门禁')
    })

    it('CLI --brief：exit 0，输出 28 主题汇总（质量基线/CI 可直接调用）', () => {
        const output = execFileSync(process.execPath, [GATE_SCRIPT, '--brief'], {
            encoding: 'utf8',
            cwd: ROOT
        })
        expect(output).toContain('主题总数：28')
        expect(output).toContain('✅ 全部通过')
    })

    it('CLI 默认输出：28 行主题表格 + 汇总，并可 --json 输出结构化结果', () => {
        const textOutput = execFileSync(process.execPath, [GATE_SCRIPT], {
            encoding: 'utf8',
            cwd: ROOT
        })
        for (const type of [
            'warm',
            'lavender',
            'forest',
            'baize-text',
            'baize-starry',
            'baize-mirror-dark'
        ]) {
            expect(textOutput).toContain(type)
        }
        const jsonOutput = execFileSync(process.execPath, [GATE_SCRIPT, '--json'], {
            encoding: 'utf8',
            cwd: ROOT
        })
        const parsed = JSON.parse(jsonOutput) as ContrastResult
        expect(parsed.ok).toBe(true)
        expect(parsed.themeCount).toBe(28)
        expect(parsed.rows).toHaveLength(28)
    })

    it('非法参数：输出错误并 exit 1（门禁脚本不接受未知开关）', () => {
        let status: number | null = null
        try {
            execFileSync(process.execPath, [GATE_SCRIPT, '--unknown-flag'], {
                encoding: 'utf8',
                cwd: ROOT,
                stdio: 'pipe'
            })
        } catch (error) {
            status = (error as { status?: number | null }).status ?? null
        }
        expect(status).toBe(1)
    })
})
