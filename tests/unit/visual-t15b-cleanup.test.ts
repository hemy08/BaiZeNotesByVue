/**
 * 视觉升级 1.5.6（REQ-16 收口 / P2F）：硬编码颜色清理回归护栏
 *
 * ## 背景
 * P2 的 T15 已清理 161 处；P2B 继续清理 24 处（白名单外可治理 338 → 314），并把剩余
 * 314 处按「固定设计 / 参考数据 / UI-01 例外 / 待补令牌」逐行归类。本批（1.5.6 P2F）
 * 完成 P2B 遗留的 25 处「待令牌化」并把模板遗留演示样式清理掉：**314 → 272（−42）**：
 * 1. `undefined-token-fallback` 18 处：`--theme-text-secondary` / `--text-primary` /
 *    `--bg-secondary` 等变量主题层从未定义、组件内兜底即实际生效值；本批在**新令牌真源**
 *    `src/renderer/src/styles/content-tokens.css` 按「等值」补定义后，删除组件内颜色兜底
 *    （18 处）。另修正 1 处并行任务新增的同名兜底（不入本批 314 基数）。
 * 2. `highlight-border-pattern` 7 处：新增 `--ui-highlight-color`（固定白基色）与派生
 *    `--ui-highlight-border-color`，替换 6 处玻璃高光边写法；第 7 处 `CommandPalette.vue`
 *    属并行任务写域，保留旧写法并登记（`BaiZeNotes.vue` / `MenuSubmenu.vue` 同属并行写域，
 *    不在 7 处基数内，迁移时一并替换）。
 * 3. `template-legacy` 25 处：electron-vite 模板演示样式（`.logo` / `.vue` / `.ts` /
 *    `.versions` 等无应用消费者）与 `--ev-*` 模板调色板整段删除（18 处）；`.status-bar` /
 *    `.md-preview blockquote` / `table` / `.plugin-tools-*` 仍被应用消费，保留并登记理由
 *    （7 处）。
 *
 * ## 护栏内容
 * 1. 可治理颜色数量棘轮：白名单外可治理 hex+rgb 字面量 ≤ 本轮实测 272（只降不升）；
 * 2. 扩展 T15 不变量：静态真源（theme.css / ui-style.css / content-tokens.css）与主题
 *    运行时绑定变量均不得再带颜色兜底；
 * 3. 本批清理文件不得回退（旧裸色/旧兜底已消失 + 新令牌已接入，逐个文件断言）；
 * 4. 等值映射前提锁定：content-tokens.css 每个历史令牌的值 = 各消费点原兜底字面量；
 * 5. 新令牌真源引入契约：content-tokens.css 只在 main.ts 引入一次、位于 ui-style.css
 *    之后、只声明 `:root` 变量，且颜色字面量只允许出现在该真源文件内。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const RENDERER = path.join(ROOT, 'src', 'renderer', 'src')
const THEME_CSS = path.join(RENDERER, 'styles', 'theme.css')
const UI_STYLE_CSS = path.join(RENDERER, 'styles', 'ui-style.css')
const CONTENT_TOKENS_CSS = path.join(RENDERER, 'styles', 'content-tokens.css')
const MAIN_TS = path.join(RENDERER, 'main.ts')
const USE_THEME = path.join(RENDERER, 'composables', 'useTheme.ts')

/** 本批清理后白名单外可治理颜色实测上限（hex + rgb/rgba 字面量个数） */
const GOVERNABLE_COLOR_CEILING = 272

/** P2 白名单（与 out/tmp/t15b-final-inventory.cjs 同源；1.5.6 追加新令牌真源） */
const P2_WHITELIST_FILES = new Set([
    'src/renderer/src/styles/theme.css',
    'src/renderer/src/styles/ui-style.css',
    'src/renderer/src/styles/content-tokens.css',
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

/** 取 content-tokens.css :root 中某个令牌的声明值（去注释、压平空白） */
function contentTokenValue(token: string): string | undefined {
    const source = stripComments(readSource(CONTENT_TOKENS_CSS))
    const pattern = new RegExp(`${token}\\s*:\\s*([^;]+);`)
    return pattern.exec(source)?.[1]?.replace(/\s+/g, ' ').trim().toLowerCase() ?? undefined
}

// =============================================================================================
// T15b-1：白名单外可治理颜色数量棘轮（只降不升）
// =============================================================================================
describe('T15b-1 白名单外可治理硬编码颜色数量棘轮', () => {
    it(`白名单外可治理颜色 ≤ ${GOVERNABLE_COLOR_CEILING}（1.5.6 P2F 实测值，只降不升）`, () => {
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
        // 下限兜底：本批清理 42 处后仍有固定设计/参考数据/并行写域，数量不得因误删/误扫归零
        expect(count).toBeGreaterThan(200)
    })

    it('白名单定义未扩大（真源/参考数据/固定主题之外不得新增白名单文件）', () => {
        // 白名单是「颜色真源 + vendored 固定主题 + 参考数据」，不允许把普通组件加进来；
        // 本断言锁定白名单文件清单，防止后续以"加白名单"方式绕过清理。
        // 1.5.6 追加的 content-tokens.css 属「颜色令牌真源」（与 theme.css / ui-style.css
        // 同性质，是被导入的令牌定义文件而非组件级豁免），由 T15b-5 单独锁定其引入契约。
        const expectedWhitelistFiles = [
            'src/renderer/src/styles/theme.css',
            'src/renderer/src/styles/ui-style.css',
            'src/renderer/src/styles/content-tokens.css',
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
     * 1.5.6 追加：content-tokens.css 新定义的 9 个历史令牌同样视为「已定义令牌」，
     * 组件内不得再保留 `var(--令牌, #颜色)` 兜底（本批已全部删除）。
     */
    it('静态真源变量（theme/ui-style/content-tokens）与主题绑定变量均无颜色兜底', () => {
        const staticallyDefined = new Set([
            ...declaredVariables(THEME_CSS),
            ...declaredVariables(UI_STYLE_CSS),
            ...declaredVariables(CONTENT_TOKENS_CSS)
        ])
        const themeVariables = themeBindingVariables()
        expect(themeVariables.size).toBe(20) // 10 prefixed + 10 alias
        const known = new Set([...staticallyDefined, ...themeVariables])

        // 允许保留颜色兜底的例外：
        // - 三个真源文件本身（变量定义处）；
        // - WritingModeHost：纸感版式令牌只在 paper/hybrid 块声明，非全风格可用（与 P2 既有
        //   T15 不变量同口径豁免）。
        const whitelist = new Set([
            THEME_CSS,
            UI_STYLE_CSS,
            CONTENT_TOKENS_CSS,
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
// T15b-3：本批清理文件不得回退（逐文件锁定「旧裸色消失 + 新令牌接入」）
// =============================================================================================
describe('T15b-3 本批清理文件不得回退', () => {
    const file = (relativePath: string): string => path.join(RENDERER, relativePath)
    const source = (relativePath: string): string => stripComments(readSource(file(relativePath)))

    // ---------- 1.5.6：未定义历史令牌兜底（18 处） ----------
    it('工作区布局（WorkspaceLayoutDialog.vue）：历史令牌全部去兜底，--bg-secondary 三值拆分', () => {
        const sourceText = source('components/dialogs/workspace-layout/WorkspaceLayoutDialog.vue')
        // --text-primary / --text-secondary / --bg-secondary 已由 content-tokens.css 定义
        expect(sourceText).toContain('color: var(--text-primary);')
        expect(sourceText).toContain('color: var(--text-secondary);')
        expect(sourceText).toContain('background: var(--bg-secondary);')
        expect(sourceText).toContain('background: var(--bg-secondary-raised);')
        expect(sourceText).toContain('background: var(--bg-secondary-accent);')
        expect(sourceText).not.toMatch(
            /var\(--(?:text-primary|text-secondary|bg-secondary|bg-secondary-raised|bg-secondary-accent|bg-primary)\s*,/
        )
        // P2B 已完成的等值白底映射不回退
        expect(sourceText).toContain('background: var(--ui-bg-elevated);')
    })

    it('使用指导（UsageGuideDialog.vue）：--bg-primary 去兜底', () => {
        const sourceText = source('components/dialogs/help/usage-guide/UsageGuideDialog.vue')
        expect(sourceText).toContain('background: var(--bg-primary);')
        expect(sourceText).not.toMatch(/var\(--bg-primary\s*,/)
        // P2B 已完成的等值白底映射不回退
        expect(sourceText).toContain('background: var(--ui-bg-elevated);')
    })

    it('PDF 查看器（ShowPdfEditor.vue）：--theme-text-secondary/error/toolbar 去兜底', () => {
        const sourceText = source('components/HemyTools/ShowPdfEditor.vue')
        expect(sourceText).toContain('color: var(--theme-text-secondary);')
        expect(sourceText).toContain('color: var(--theme-error-color);')
        expect(sourceText).toContain('border-color: var(--theme-error-color);')
        expect(sourceText).toContain('background-color: var(--theme-toolbar-background);')
        expect(sourceText).not.toMatch(
            /var\(--(?:theme-text-secondary|theme-error-color|theme-toolbar-background)\s*,/
        )
        expect(sourceText).not.toContain('#757575')
        expect(sourceText).not.toContain('#d32f2f')
        expect(sourceText).not.toContain('#f5f5f5')
    })

    it('文件查看器外壳（FileViewerShell.vue）：三个历史令牌去兜底', () => {
        const sourceText = source('components/HemyTools/FileViewerShell.vue')
        expect(sourceText).toContain('color: var(--theme-error-color);')
        expect(sourceText).toContain('background-color: var(--theme-toolbar-background);')
        expect(sourceText).toContain('color: var(--theme-text-secondary);')
        expect(sourceText).not.toMatch(
            /var\(--(?:theme-text-secondary|theme-error-color|theme-toolbar-background)\s*,/
        )
        expect(sourceText).not.toContain('#757575')
        expect(sourceText).not.toContain('#d32f2f')
        expect(sourceText).not.toContain('#f5f5f5')
    })

    it('工作区（WorkSpace.vue）：异步占位文字去兜底', () => {
        const sourceText = source('components/WorkSpaceArea/WorkSpace.vue')
        expect(sourceText).toContain('color: var(--theme-text-secondary);')
        expect(sourceText).not.toMatch(/var\(--theme-text-secondary\s*,/)
        expect(sourceText).not.toContain('#757575')
    })

    // ---------- 1.5.6：玻璃高光边基色（6 处，CommandPalette 属并行写域） ----------
    it('玻璃高光边：5 个文件 6 处统一消费 --ui-highlight-border-color', () => {
        const HIGHLIGHT_CONSUMERS = [
            'components/dialogs/BaseDialog.vue',
            'components/dialogs/medium/table-editor/TableEditorDialog.vue',
            'components/ResourceManager/ResourceManager.vue',
            'components/StatusBar.vue',
            'components/WorkSpaceArea/WorkSpace.vue'
        ]
        for (const consumer of HIGHLIGHT_CONSUMERS) {
            const sourceText = source(consumer)
            expect(sourceText, consumer).toContain('var(--ui-highlight-border-color)')
            // 旧写法：裸白 rgba 基色（本批已收敛为令牌）
            expect(sourceText, consumer).not.toContain(
                'rgba(255, 255, 255, var(--ui-highlight-border-alpha'
            )
        }
        // 除并行写域（BaiZeNotes / MenuSubmenu / CommandPalette 由对应波次迁移）外，
        // 渲染层不得再出现「白色基色 + 高光透明度」的裸写法。
        const parallelWaveFiles = new Set([
            'src/renderer/src/components/BaiZeNotes.vue',
            'src/renderer/src/components/MenuBar/MenuSubmenu.vue',
            'src/renderer/src/components/search/CommandPalette.vue'
        ])
        const legacyPatternFiles = walkFiles(RENDERER, ['.vue', '.css', '.ts'])
            .filter((file) => {
                const rel = relative(file)
                if (parallelWaveFiles.has(rel)) return false
                return stripComments(readSource(file)).includes(
                    'rgba(255, 255, 255, var(--ui-highlight-border-alpha'
                )
            })
            .map(relative)
        expect(legacyPatternFiles).toEqual([])
    })

    // ---------- 1.5.6：electron-vite 模板遗留演示样式删除（18 处） ----------
    it('模板遗留：base.css 的 --ev-* / --color-* 调色板与 main.css 演示类已删除', () => {
        const baseCss = source('assets/base.css')
        const mainCss = source('assets/main.css')
        // 模板调色板变量（12 个硬编码颜色）不再存在
        expect(baseCss).not.toContain('--ev-')
        expect(baseCss).not.toContain('--color-background')
        expect(baseCss).not.toContain('--color-text')
        // 全仓不得再引用模板变量（注释中的清理说明不算）
        const evReferences = walkFiles(RENDERER, ['.vue', '.css', '.ts'])
            .filter((file) =>
                /var\(--ev-|--color-background|--color-text\b/.test(stripComments(readSource(file)))
            )
            .map(relative)
        expect(evReferences).toEqual([])
        // 模板演示类选择器（.logo/.creator/.text/.tip/.vue/.ts/.actions/.action/.versions）
        // 已整段删除（这些类在全仓零应用引用，见报告 grep 证据）
        for (const selector of [
            '.logo',
            '.creator',
            '.text',
            '.tip',
            '.vue',
            '.ts',
            '.actions',
            '.action',
            '.versions'
        ]) {
            const selectorPattern = new RegExp(`^\\s*\\${selector}(?:\\s|\\{|:|\\[)`, 'm')
            expect(mainCss, `main.css 不应再声明模板演示类 ${selector}`).not.toMatch(
                selectorPattern
            )
        }
        // 演示类的模板渐变/滤镜颜色不再出现
        for (const legacyColor of ['#42d392', '#647eff', '#3178c6', '#f0dc4e', '#6988e6aa']) {
            expect(mainCss, legacyColor).not.toContain(legacyColor)
        }
        // 仍被应用使用的全局布局类必须保留（防止误删）
        for (const retained of [
            '.plugin-tools-openurl',
            '.plugin-tools-btn-list',
            '.plugin-tools-btn',
            '.div-style-display-column',
            '.header-display-center'
        ]) {
            expect(mainCss, retained).toContain(retained)
        }
    })
})

// =============================================================================================
// T15b-4：等值映射前提锁定（令牌默认值 = 替换前字面量，未来改令牌值会报警）
// =============================================================================================
describe('T15b-4 等值映射前提：令牌默认值锁定', () => {
    /** 解析 theme.css 中的十六进制默认值（取首个声明） */
    function rootTokenValue(token: string): string | undefined {
        const source = readSource(THEME_CSS)
        const pattern = new RegExp(`${token}\\s*:\\s*([^;]+);`)
        return pattern.exec(source)?.[1]?.trim().toLowerCase()
    }

    it('P2B 白色/警告系映射前提不变：--ui-bg-elevated / --theme-button-text-color / --ui-warning', () => {
        expect(rootTokenValue('--ui-bg-elevated')).toBe('#ffffff')
        expect(rootTokenValue('--theme-button-text-color')).toBe('#ffffff')
        expect(rootTokenValue('--ui-warning')).toBe('#b45309')
    })

    it('1.5.6 历史令牌等值前提：值 = 各消费点原兜底字面量（逐项锁定）', () => {
        const EQUAL_TOKENS: ReadonlyArray<readonly [string, string]> = [
            // 原 var(--theme-text-secondary, #757575)
            ['--theme-text-secondary', '#757575'],
            // 原 var(--theme-error-color, #d32f2f)
            ['--theme-error-color', '#d32f2f'],
            // 原 var(--theme-toolbar-background, #f5f5f5)
            ['--theme-toolbar-background', '#f5f5f5'],
            // 原 var(--text-primary, #252233)
            ['--text-primary', '#252233'],
            // 原 var(--text-secondary, #6d6980)
            ['--text-secondary', '#6d6980'],
            // 原 var(--bg-secondary, #f7f3fb)（当前布局条）
            ['--bg-secondary', '#f7f3fb'],
            // 原 var(--bg-secondary, #f1ebf9)（内置徽标浅强调底）
            ['--bg-secondary-accent', '#f1ebf9'],
            // 原 var(--bg-primary, #fbf9fe)（使用指导正文底）
            ['--bg-primary', '#fbf9fe'],
            // 玻璃高光边固定白基色（原 rgba(255,255,255, var(--ui-highlight-border-alpha)) 的基色）
            ['--ui-highlight-color', '#ffffff']
        ]
        for (const [token, expected] of EQUAL_TOKENS) {
            expect(contentTokenValue(token), `${token} 默认值漂移`).toBe(expected)
        }
        // 内置布局卡片底与 --bg-primary 同值（原兜底 #fbf9fe），按语义派生引用而非复制字面量
        expect(contentTokenValue('--bg-secondary-raised')).toBe('var(--bg-primary)')
    })

    it('玻璃高光边完整色由固定白基色 × 材质透明度派生（color-mix，逐像素等值）', () => {
        const value = contentTokenValue('--ui-highlight-border-color') ?? ''
        expect(value).toContain('color-mix(')
        expect(value).toContain('var(--ui-highlight-color)')
        expect(value).toContain('var(--ui-highlight-border-alpha')
        // 不得写成新的裸色值（派生而非硬编码）
        expect(value).not.toMatch(/#[0-9a-f]{3,8}/)
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

// =============================================================================================
// T15b-5：新令牌真源 content-tokens.css 引入契约（单次注入 / 只声明 :root 变量）
// =============================================================================================
describe('T15b-5 content-tokens.css 引入契约', () => {
    it('只在 main.ts 引入一次，且位于 ui-style.css 之后（材质高光令牌依赖其 alpha 变量）', () => {
        const mainSource = readSource(MAIN_TS)
        const importPattern = /^\s*import\s+['"][^'"]*content-tokens\.css['"]/gm
        expect([...mainSource.matchAll(importPattern)]).toHaveLength(1)
        const contentIndex = mainSource.indexOf("import './styles/content-tokens.css'")
        const uiStyleIndex = mainSource.indexOf("import './styles/ui-style.css'")
        const themeIndex = mainSource.indexOf("import './styles/theme.css'")
        expect(contentIndex).toBeGreaterThan(uiStyleIndex)
        expect(uiStyleIndex).toBeGreaterThan(themeIndex)

        const referencingFiles = walkFiles(RENDERER, ['.vue', '.css', '.ts'])
            .filter((file) => {
                const source = stripComments(readSource(file))
                return /^\s*@?import\s+['"][^'"]*content-tokens\.css['"]/m.test(source)
            })
            .map(relative)
        expect(referencingFiles).toEqual(['src/renderer/src/main.ts'])
    })

    it('只声明 :root 下的 CSS 变量（不得声明组件/元素样式选择器，不得出现非令牌声明）', () => {
        const source = stripComments(readSource(CONTENT_TOKENS_CSS))
        // 去掉 :root { ... } 块后不得再有其他规则
        const withoutRoot = source
            .replace(/:root\s*\{[\s\S]*\}/, '')
            .replace(/\s+/g, ' ')
            .trim()
        expect(withoutRoot, `content-tokens.css 出现了 :root 之外的规则：${withoutRoot}`).toBe('')
        // 声明块内每一行都是变量声明（或以 var()/color-mix() 组成的变量值续行）
        const rootBody = /:root\s*\{([\s\S]*)\}/.exec(source)?.[1] ?? ''
        const declarations = rootBody
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line.length > 0)
            .join('\n')
        expect(declarations).toContain('--ui-highlight-color:')
        expect(declarations).toContain('--ui-highlight-border-color:')
        // 每个令牌只允许出现一次（重复定义会掩盖等值前提）
        const tokens = [...declarations.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((match) => match[1])
        expect(new Set(tokens).size, `重复定义的令牌：${tokens.join(', ')}`).toBe(tokens.length)
        expect(tokens.length).toBe(11) // 2 个高光令牌 + 9 个历史令牌
    })
})
