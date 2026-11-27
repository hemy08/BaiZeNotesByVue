/**
 * 视觉升级 1.5.5 遗留项 6（T15 续作 / P2B）：白名单外硬编码颜色清理回归护栏
 *
 * ## 背景
 * P2 的 T15 已清理 161 处（白名单外可治理 479 → 332，快照口径）。本批（P2B）在
 * 「并行子代理写域」之外继续收口：清理 24 处（实测 338 → 314），并把剩余 314 处按
 * 「固定设计 / 参考数据 / UI-01 例外 / 待补令牌」逐行归类，清单见
 * `out/visual-1.5.5-p2b/hardcoded-colors-inventory.json`（脚本
 * `out/tmp/t15b-final-inventory.cjs`，与 P2 的 `t15-final-inventory.cjs` 同口径）。
 *
 * > 本文件独立于 `visual-p2-acceptance.test.ts` 的原因：P2B 与「图标/emoji 清理」
 * > 两个子任务并行，后者写域包含 visual-p2-acceptance.test.ts，为避免并发改写冲突，
 * > 本批护栏单独成文件；T15 既有不变量（静态真源变量颜色兜底禁止回潮）在下方
 * > `T15b-2` 中做等价扩展。
 *
 * ## 护栏内容
 * 1. 可治理颜色数量棘轮：白名单外可治理 hex+rgb 字面量 ≤ 本轮实测 314（只降不升）；
 * 2. 扩展 T15 不变量：静态真源变量 **与主题运行时绑定变量** 均不得再带颜色兜底
 *    （本批已删除 14 处动态令牌冗余颜色兜底，等值、零观感变化）；
 * 3. 本轮清理的 12 个文件不得回退（逐个断言「旧裸色/旧兜底已消失 + 语义令牌已接入」）；
 * 4. 等值映射前提锁定：映射目标令牌的默认值必须与替换前字面量等值（未来改令牌值会报警）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const RENDERER = path.join(ROOT, 'src', 'renderer', 'src')
const THEME_CSS = path.join(RENDERER, 'styles', 'theme.css')
const UI_STYLE_CSS = path.join(RENDERER, 'styles', 'ui-style.css')
const USE_THEME = path.join(RENDERER, 'composables', 'useTheme.ts')

/** 本批清理后白名单外可治理颜色实测上限（hex + rgb/rgba 字面量个数） */
const GOVERNABLE_COLOR_CEILING = 314

/** P2 白名单（与 out/tmp/t15-final-inventory.cjs、out/tmp/t15b-final-inventory.cjs 同源） */
const P2_WHITELIST_FILES = new Set([
    'src/renderer/src/styles/theme.css',
    'src/renderer/src/styles/ui-style.css',
    'src/renderer/src/styles/preview_font/atom-one-light.css',
    'src/renderer/src/styles/material/admonition.css',
    'src/renderer/src/styles/material/gridcards.css',
    'src/renderer/src/styles/material/tableset.css',
    'src/renderer/src/styles/material/md-basic.css',
    'src/renderer/src/styles/material/md-blocks.css',
    'src/renderer/src/styles/material/md-media.css',
    'src/renderer/src/styles/sheet_dialog/normalize.css',
    'src/renderer/src/components/dialogs/complex/FontSelectDialog.vue',
    'src/renderer/src/components/PluginTools/Informations/information-tables/html-special-char-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/greece-letter-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/normal-font-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/formula-symbol-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/http-status-code-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/numeric-case-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/physical-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/subnet-mask-bits-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/ascii-table.ts',
    'src/renderer/src/components/PluginTools/Informations/information-tables/html-mime-type-table.ts'
])
const P2_WHITELIST_DIRS = [
    'src/renderer/src/components/PluginTools/Informations/information-tables/',
    'src/renderer/src/assets/icons/'
]

/** 渲染层文件读取（统一 CRLF → LF，避免 Windows 换行影响正则） */
function readSource(file: string): string {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 与扫描脚本同口径：去掉 HTML / CSS / JS 三种注释（只统计真实样式与代码） */
function stripComments(source: string): string {
    return source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
}

function walkFiles(dir: string, extensions: readonly string[]): string[] {
    const result: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) result.push(...walkFiles(full, extensions))
        else if (extensions.some((ext) => entry.name.endsWith(ext))) result.push(full)
    }
    return result
}

function relative(file: string): string {
    return path.relative(ROOT, file).split(path.sep).join('/')
}

function isP2Whitelisted(rel: string): boolean {
    return P2_WHITELIST_FILES.has(rel) || P2_WHITELIST_DIRS.some((dir) => rel.startsWith(dir))
}

/** 取 CSS/TS 真源中的变量声明（含 :root 与各风格块，变量名去重） */
function declaredVariables(file: string): Set<string> {
    const variables = new Set<string>()
    for (const match of readSource(file).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
        variables.add(match[1])
    }
    return variables
}

/** 主题运行时写入的 CSS 变量（useTheme.ts 的 prefixed / alias 绑定表） */
function themeBindingVariables(): Set<string> {
    const source = readSource(USE_THEME)
    const variables = new Set<string>()
    for (const match of source.matchAll(/(?:prefixed|alias):\s*'(--[a-z0-9-]+)'/g)) {
        variables.add(match[1])
    }
    return variables
}

// =============================================================================================
// T15b-1：白名单外可治理颜色数量棘轮（只降不升）
// =============================================================================================
describe('T15b-1 白名单外可治理硬编码颜色数量棘轮', () => {
    it(`白名单外可治理颜色 ≤ ${GOVERNABLE_COLOR_CEILING}（P2B 实测值，只降不升）`, () => {
        const offenders: string[] = []
        let count = 0
        for (const file of walkFiles(RENDERER, ['.vue', '.css', '.ts'])) {
            const rel = relative(file)
            if (isP2Whitelisted(rel)) continue
            const source = stripComments(readSource(file))
            const matches = source.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)/g) ?? []
            if (matches.length > 0) {
                count += matches.length
                offenders.push(`${rel}: ${matches.join(', ')}`)
            }
        }
        expect(
            count,
            `白名单外可治理颜色 ${count} > 上限 ${GOVERNABLE_COLOR_CEILING}，` +
                `新增/回潮文件：\n${offenders.join('\n')}`
        ).toBeLessThanOrEqual(GOVERNABLE_COLOR_CEILING)
        // 下限兜底：本批实际清理 24 处，数量不得因误删/误扫暴涨或归零（口径自检）
        expect(count).toBeGreaterThan(200)
    })

    it('P2 白名单定义未扩大（真源/参考数据/固定主题之外不得新增白名单文件）', () => {
        // 白名单是「颜色真源 + vendored 固定主题 + 参考数据」，不允许把普通组件加进来；
        // 本断言锁定 P2 白名单文件清单，防止后续以"加白名单"方式绕过清理。
        const expectedWhitelistFiles = [
            'src/renderer/src/styles/theme.css',
            'src/renderer/src/styles/ui-style.css',
            'src/renderer/src/styles/preview_font/atom-one-light.css',
            'src/renderer/src/styles/material/admonition.css',
            'src/renderer/src/styles/material/gridcards.css',
            'src/renderer/src/styles/material/tableset.css',
            'src/renderer/src/styles/material/md-basic.css',
            'src/renderer/src/styles/material/md-blocks.css',
            'src/renderer/src/styles/material/md-media.css',
            'src/renderer/src/styles/sheet_dialog/normalize.css',
            'src/renderer/src/components/dialogs/complex/FontSelectDialog.vue',
            'src/renderer/src/components/PluginTools/Informations/information-tables/html-special-char-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/greece-letter-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/normal-font-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/formula-symbol-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/http-status-code-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/numeric-case-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/physical-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/subnet-mask-bits-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/ascii-table.ts',
            'src/renderer/src/components/PluginTools/Informations/information-tables/html-mime-type-table.ts'
        ]
        expect([...P2_WHITELIST_FILES].sort()).toEqual(expectedWhitelistFiles.sort())
        expect([...P2_WHITELIST_DIRS].sort()).toEqual(
            [
                'src/renderer/src/assets/icons/',
                'src/renderer/src/components/PluginTools/Informations/information-tables/'
            ].sort()
        )
    })
})

// =============================================================================================
// T15b-2：扩展 T15 不变量 —— 静态真源 + 主题运行时绑定变量都不得带颜色兜底
// =============================================================================================
describe('T15b-2 已定义令牌不得保留冗余颜色兜底（静态真源 + 主题运行时绑定）', () => {
    /**
     * 本批清理的动态令牌兜底（13 处）：
     * --button-text-color ×6（dialog-buttons.css ×5 + EmptyState ×1）、
     * --border-color ×3 / --accent-color ×1（WorkspaceLayoutDialog）、
     * --border-color/--card-bg/--secondary-text-color（preview-local-render，3 色 2 行）、
     * --secondary-text-color（MarkdownPreviewComponent）、
     * --dialog-btn-danger-bg（UnsavedChangesDialog）。
     * 这些别名均由 useTheme.applyThemeStyles 在首屏主题初始化时写入，对话框/预览/空态
     * 渲染时机晚于初始化，因此删除兜底等值、零观感变化。
     */
    it('静态真源变量与主题绑定变量（--theme-* / 无前缀别名）均无颜色兜底', () => {
        const staticallyDefined = new Set([
            ...declaredVariables(THEME_CSS),
            ...declaredVariables(UI_STYLE_CSS)
        ])
        const themeVariables = themeBindingVariables()
        expect(themeVariables.size).toBe(20) // 10 prefixed + 10 alias
        const known = new Set([...staticallyDefined, ...themeVariables])

        // 允许保留颜色兜底的例外：
        // - 两个真源文件本身（变量定义处）；
        // - WritingModeHost：纸感版式令牌只在 paper/hybrid 块声明，非全风格可用（与 P2 既有
        //   T15 不变量同口径豁免）。
        const whitelist = new Set([
            THEME_CSS,
            UI_STYLE_CSS,
            path.join(RENDERER, 'components', 'Markdown', 'WritingModeHost.vue')
        ])

        const offenders: string[] = []
        for (const file of walkFiles(RENDERER, ['.vue', '.css', '.ts'])) {
            if (whitelist.has(file)) continue
            const source = stripComments(readSource(file))
            const pattern = /var\((--[a-z0-9-]+),[^()]*(#[0-9a-fA-F]{3,8}|rgba?\()/g
            for (const match of source.matchAll(pattern)) {
                if (known.has(match[1])) {
                    offenders.push(`${relative(file)}: var(${match[1]}, …)`)
                }
            }
        }
        expect(offenders, `已定义令牌不应保留颜色兜底：\n${offenders.join('\n')}`).toEqual([])
    })
})

// =============================================================================================
// T15b-3：本批清理文件不得回退（逐文件锁定「旧裸色消失 + 语义令牌接入」）
// =============================================================================================
describe('T15b-3 本批清理文件不得回退', () => {
    const file = (relativePath: string): string => path.join(RENDERER, relativePath)
    const source = (relativePath: string): string => stripComments(readSource(file(relativePath)))

    it('对话框按钮层（dialog-buttons.css）：按钮文字色不再带 #fff 兜底，且无任何颜色字面量', () => {
        const css = source('assets/dialog-buttons.css')
        expect(css).not.toContain('#fff')
        expect(css).not.toMatch(/var\(--button-text-color\s*,/)
        expect(css).toContain('var(--button-text-color)')
        // 该文件只允许令牌/透明值，不允许出现任何 hex 或 rgba 字面量
        expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/)
    })

    it('空态主按钮（EmptyState.vue）：--button-text-color 无颜色兜底', () => {
        const sourceText = source('components/common/ui/EmptyState.vue')
        expect(sourceText).toContain('color: var(--button-text-color)')
        expect(sourceText).not.toMatch(/var\(--button-text-color\s*,/)
    })

    it('远程图片占位块（preview-local-render.ts）：三个主题别名均无颜色兜底', () => {
        const sourceText = source('components/Markdown/preview-local-render.ts')
        expect(sourceText).toMatch(/border:1px dashed var\(--border-color\)/)
        expect(sourceText).toMatch(/background:var\(--card-bg\)/)
        expect(sourceText).toMatch(/color:var\(--secondary-text-color\)/)
        expect(sourceText).not.toMatch(
            /var\(--(?:border-color|card-bg|secondary-text-color)\s*,[^)]*#/
        )
    })

    it('预览骨架屏（MarkdownPreviewComponent.vue）：--secondary-text-color 无颜色兜底', () => {
        const sourceText = source('components/Markdown/MarkdownPreviewComponent.vue')
        expect(sourceText).not.toMatch(/var\(--secondary-text-color\s*,[^)]*#/)
        expect(sourceText).toContain('color: var(--secondary-text-color)')
    })

    it('未保存确认（UnsavedChangesDialog.vue）：危险语义色变量无 #e74c3c 兜底', () => {
        const sourceText = source('components/dialogs/simple/UnsavedChangesDialog.vue')
        expect(sourceText).toContain('color: var(--dialog-btn-danger-bg)')
        expect(sourceText).not.toContain('#e74c3c')
    })

    it('工作区布局（WorkspaceLayoutDialog.vue）：已定义令牌无兜底，等值白底改用 --ui-bg-elevated', () => {
        const sourceText = source('components/dialogs/workspace-layout/WorkspaceLayoutDialog.vue')
        expect(sourceText).not.toMatch(/var\(--(?:border-color|accent-color)\s*,[^)]*#/)
        expect(sourceText).toContain('background: var(--ui-bg-elevated);')
        // 未定义历史令牌（--text-primary / --bg-secondary 等）仍保留兜底，属清单中
        // 「undefined-token-fallback」类别，待主题层补令牌后统一迁移（本批不改观感）。
        expect(sourceText).toContain('var(--text-primary, #252233)')
    })

    it('快捷链接新增按钮（link-list.css）：强调底上文字走主题按钮文字色', () => {
        const css = source('components/dialogs/help/quick-link-setting/link-list.css')
        expect(css).toContain('color: var(--theme-button-text-color)')
        expect(css).not.toMatch(/color:\s*#fff/)
    })

    it('插入图片对话框（InsertImageDialog.vue）：强调底上文字不再写死 #fff', () => {
        const sourceText = source('components/dialogs/medium/InsertImageDialog.vue')
        expect(sourceText).not.toMatch(/color:\s*#fff/)
        expect(sourceText.match(/color: var\(--theme-button-text-color\)/g)?.length).toBe(2)
    })

    it('发布说明版本徽标（ReleaseNotesDialog.vue）：强调底上文字走主题按钮文字色', () => {
        const sourceText = source('components/dialogs/help/ReleaseNotesDialog.vue')
        expect(sourceText).toContain('color: var(--theme-button-text-color)')
        expect(sourceText).not.toMatch(/color:\s*#fff/)
    })

    it('HTML 查看器（ShowHtmlView.vue）：iframe 底色走 --ui-bg-elevated（默认 #ffffff 等值）', () => {
        const sourceText = source('components/HemyTools/ShowHtmlView.vue')
        expect(sourceText).toContain('background-color: var(--ui-bg-elevated)')
        expect(sourceText).not.toContain('#ffffff')
    })

    it('使用指导（UsageGuideDialog.vue）：--bg-primary 的等值白底兜底改为 --ui-bg-elevated', () => {
        const sourceText = source('components/dialogs/help/usage-guide/UsageGuideDialog.vue')
        expect(sourceText).toContain('background: var(--ui-bg-elevated);')
        expect(sourceText).not.toContain('var(--bg-primary, #fff)')
    })

    it('加解密工具安全提示（CryptoEncDec.vue）：等值警告文字色改走 --ui-warning', () => {
        const sourceText = source('components/PluginTools/Encryption/CryptoEncDec.vue')
        expect(sourceText).toContain('color: var(--ui-warning)')
        expect(sourceText).not.toContain('#b45309')
    })
})

// =============================================================================================
// T15b-4：等值映射前提锁定（默认令牌值 = 替换前字面量，未来改令牌值会报警）
// =============================================================================================
describe('T15b-4 等值映射前提：令牌默认值锁定', () => {
    /** 解析 theme.css :root 中的十六进制默认值（取首个声明） */
    function rootTokenValue(token: string): string | undefined {
        const source = readSource(THEME_CSS)
        const pattern = new RegExp(`${token}\\s*:\\s*([^;]+);`)
        return pattern.exec(source)?.[1]?.trim().toLowerCase()
    }

    it('白色系映射：--ui-bg-elevated / --theme-button-text-color 默认值仍为 #ffffff', () => {
        expect(rootTokenValue('--ui-bg-elevated')).toBe('#ffffff')
        expect(rootTokenValue('--theme-button-text-color')).toBe('#ffffff')
    })

    it('警告色映射：--ui-warning 默认值仍为 #b45309（= 替换前 CryptoEncDec 硬编码）', () => {
        expect(rootTokenValue('--ui-warning')).toBe('#b45309')
    })

    it('主题运行时别名默认回退口径：applyThemeStyles 写入的 20 个变量与绑定表一一对应', () => {
        const bindings = themeBindingVariables()
        expect(bindings.has('--button-text-color')).toBe(true)
        expect(bindings.has('--border-color')).toBe(true)
        expect(bindings.has('--card-bg')).toBe(true)
        expect(bindings.has('--secondary-text-color')).toBe(true)
        expect(bindings.has('--accent-color')).toBe(true)
    })
})
