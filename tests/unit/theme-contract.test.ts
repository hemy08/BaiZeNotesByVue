/**
 * 主题契约静态护栏（第 2 批契约重构 2.5：主题类型族 + 明暗分组清单）
 *
 * 目标（全部为「真源 ⇄ 契约 ⇄ 消费方」三方一致性检查，不 import 主进程运行时模块）：
 * 1. shared/types/theme.ts 的 ThemeType 联合 == 主进程 theme-config.ts 的 themes 注册表键
 *    （28 项，双向核对）——主题标识只有这一处真源；
 * 2. shared/constants/theme.ts 的 THEME_GROUPS 覆盖全部 28 项、不重不漏，分组为
 *    light 13 / dark 8 / eyecare 7（2026-11-28 REQ-02 按实测明暗修正后；历史 UI 分类基线为
 *    14 / 7 / 7，因 forest / baize-text / baize-starry 三套声明与实测明暗相反已校正）；
 * 3. 分组标题 i18n key 在 zh-CN / en-US 词典中均存在；
 * 4. 渲染层消费方（主题设置对话框 / 标题栏 logo / config store）确实引用 shared 清单，
 *    且不再保留硬编码主题 id 数组（防回归：避免又回到三处各自维护）；
 * 5. 视觉升级 P0：28 套主题 × 18 个语义令牌全部可派生 / 全部合法、语义色分组正确、
 *    theme.css :root 默认值与 baize 主题派生结果逐项一致、useTheme 真正写入 --ui-* 变量；
 * 6. 主题配色自洽性：页面底与卡片面不得明暗相反、正文/次要文字在页面底上达到 AA 基线
 *    （2026-11-27 dark 主题历史数据修复的回归护栏）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
    DARK_THEME_TYPES,
    EYECARE_THEME_TYPES,
    isDarkThemeType,
    LIGHT_THEME_TYPES,
    THEME_GROUPS
} from '../../src/shared/constants/theme'
import {
    buildSemanticCssVariables,
    buildSemanticTokens,
    contrastRatio,
    isDarkColor,
    parseColor,
    relativeLuminance,
    resolveSemanticThemeGroup,
    SEMANTIC_STATUS_COLORS,
    SEMANTIC_TOKEN_CSS_BINDINGS,
    SEMANTIC_TOKEN_KEYS,
    type SemanticTokenSource
} from '../../src/shared/theme-tokens'

const ROOT = path.resolve(__dirname, '../..')
const THEME_TYPES_FILE = path.join(ROOT, 'src', 'shared', 'types', 'theme.ts')
const THEME_CONFIG_FILE = path.join(ROOT, 'src', 'main', 'config', 'theme-config.ts')
const ZH_DIALOG_RENDERER = path.join(
    ROOT,
    'src',
    'shared',
    'i18n',
    'messages',
    'zh-CN',
    'dialogRenderer.ts'
)
const EN_DIALOG_RENDERER = path.join(
    ROOT,
    'src',
    'shared',
    'i18n',
    'messages',
    'en-US',
    'dialogRenderer.ts'
)
const THEME_SETTING_DIALOG = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'complex',
    'ThemeSettingDialog.vue'
)
// 设置对话框二期拆分：THEME_GROUPS 分组逻辑从 ThemeSettingDialog.vue 迁至
// theme-setting/useThemeSettingForm.ts；静态护栏改为扫描「壳层 + theme-setting 目录」，
// 保证 shared 清单仍被引用且不再出现硬编码主题 id 清单。
const THEME_SETTING_DIR = path.join(
    ROOT,
    'src',
    'renderer',
    'src',
    'components',
    'dialogs',
    'complex',
    'theme-setting'
)
const BAIZE_NOTES = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'BaiZeNotes.vue')
const MENU_BAR = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'MenuBar.vue')
const USE_THEME = path.join(ROOT, 'src', 'renderer', 'src', 'composables', 'useTheme.ts')
const CONFIG_STORE = path.join(ROOT, 'src', 'renderer', 'src', 'common', 'useConfigStore.ts')
const MAIN_TS = path.join(ROOT, 'src', 'renderer', 'src', 'main.ts')
const RENDERER_INDEX_HTML = path.join(ROOT, 'src', 'renderer', 'index.html')
const RENDERER_SRC_DIR = path.join(ROOT, 'src', 'renderer', 'src')

/** 递归收集目录下指定后缀的源文件（用于静态扫描「实现是否只在一处」） */
function collectSourceFiles(dir: string, extensions: readonly string[]): string[] {
    const files: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...collectSourceFiles(fullPath, extensions))
        } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
            files.push(fullPath)
        }
    }
    return files
}

function readSource(file: string): string {
    // 仓库内部分文件为 CRLF（prettier endOfLine=auto），统一归一化为 LF 后再做行级解析
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 去掉 JS/TS 注释（静态护栏只匹配真实代码；注释中的路径/句式不算引用） */
function stripJsComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 去掉 HTML 注释（同上） */
function stripHtmlComments(source: string): string {
    return source.replace(/<!--[\s\S]*?-->/g, '')
}

/** 解析 shared/types/theme.ts 的 ThemeType 联合（28 个单引号字符串字面量） */
function parseThemeTypeUnion(): string[] {
    const source = readSource(THEME_TYPES_FILE)
    const marker = 'export type ThemeType ='
    const start = source.indexOf(marker)
    expect(start, 'shared/types/theme.ts 应定义 ThemeType').toBeGreaterThanOrEqual(0)
    const rest = source.slice(start + marker.length)
    const end = rest.indexOf('\n\n')
    expect(end, 'ThemeType 联合应有结束空行').toBeGreaterThan(0)
    return [...rest.slice(0, end).matchAll(/'([^']+)'/g)].map((match) => match[1])
}

/**
 * 解析主进程 theme-config.ts 的 themes 注册表键。
 * 形状约束：`export const themes: Record<ThemeType, ThemeStyles> = {` 之后、顶格 `}` 之前，
 * 4 空格缩进且以 `: {` 结尾的键（合法标识符无引号，含连字符的键保留单引号）。
 */
function parseThemeRegistryKeys(): string[] {
    const source = readSource(THEME_CONFIG_FILE)
    const marker = 'export const themes: Record<ThemeType, ThemeStyles> = {'
    const start = source.indexOf(marker)
    expect(start, '主进程 theme-config.ts 应定义 themes 注册表').toBeGreaterThanOrEqual(0)
    const keys: string[] = []
    for (const line of source.slice(start + marker.length).split('\n')) {
        if (line === '}') {
            break
        }
        const match = line.match(/^ {4}(?:'([^']+)'|([A-Za-z][\w-]*)): \{$/)
        if (match) {
            keys.push(match[1] ?? match[2])
        }
    }
    return keys
}

const THEME_TYPE_UNION = parseThemeTypeUnion()
const REGISTRY_KEYS = parseThemeRegistryKeys()
const GROUPED_TYPES = THEME_GROUPS.flatMap((group) => [...group.types])

describe('主题标识真源一致性', () => {
    it('shared ThemeType 联合应为 28 项且无重复', () => {
        expect(THEME_TYPE_UNION).toHaveLength(28)
        expect(new Set(THEME_TYPE_UNION).size).toBe(28)
    })

    it('主进程 themes 注册表键集合应与 shared ThemeType 联合完全一致（双向）', () => {
        expect(REGISTRY_KEYS).toHaveLength(28)
        expect([...REGISTRY_KEYS].sort()).toEqual([...THEME_TYPE_UNION].sort())
    })

    it('主题标识顺序应与主进程注册表定义顺序一致', () => {
        // shared 联合按主进程 themes 注册表顺序书写，便于人工对照（不一致不算契约错误，
        // 但顺序漂移往往意味着新增主题时只改了一处，故作为弱约束记录）
        expect(THEME_TYPE_UNION).toEqual(REGISTRY_KEYS)
    })
})

describe('主题明暗分组清单（THEME_GROUPS）', () => {
    it('应为 light / dark / eyecare 三组且顺序固定', () => {
        expect(THEME_GROUPS.map((group) => group.id)).toEqual(['light', 'dark', 'eyecare'])
    })

    it('三组数量应为 13 / 8 / 7（REQ-02 按实测明暗修正后的分组基线）', () => {
        expect(LIGHT_THEME_TYPES).toHaveLength(13)
        expect(DARK_THEME_TYPES).toHaveLength(8)
        expect(EYECARE_THEME_TYPES).toHaveLength(7)
    })

    it('三组合计应覆盖全部 28 项且不重不漏', () => {
        expect(GROUPED_TYPES).toHaveLength(28)
        expect(new Set(GROUPED_TYPES).size).toBe(28)
        expect([...GROUPED_TYPES].sort()).toEqual([...THEME_TYPE_UNION].sort())
    })

    it('分组标题 i18n key 应在 zh-CN / en-US 词典中均存在', () => {
        const zh = readSource(ZH_DIALOG_RENDERER)
        const en = readSource(EN_DIALOG_RENDERER)
        const labelKeys = THEME_GROUPS.map((group) => group.labelKey)
        expect(new Set(labelKeys).size).toBe(3)
        for (const labelKey of labelKeys) {
            const leaf = labelKey.split('.').pop() as string
            expect(labelKey.startsWith('dialogRenderer.themeSetting.category')).toBe(true)
            expect(zh).toContain(`${leaf}:`)
            expect(en).toContain(`${leaf}:`)
        }
    })

    it('isDarkThemeType 应与 DARK_THEME_TYPES 完全一致，未知主题按非深色处理', () => {
        for (const type of THEME_TYPE_UNION) {
            expect(isDarkThemeType(type), type).toBe(
                (DARK_THEME_TYPES as readonly string[]).includes(type)
            )
        }
        expect(isDarkThemeType('baize')).toBe(false)
        expect(isDarkThemeType('not-a-theme')).toBe(false)
        expect(isDarkThemeType('')).toBe(false)
    })
})

describe('渲染层消费方统一引用 shared 清单（防回退护栏）', () => {
    /** 主题设置对话框全部源码（壳层 + theme-setting 子组件/composable，拆分后分组逻辑在 composable） */
    function readThemeSettingSources(): string {
        const files = [
            THEME_SETTING_DIALOG,
            ...collectSourceFiles(THEME_SETTING_DIR, ['.ts', '.vue'])
        ]
        return files.map(readSource).join('\n')
    }

    it('主题设置对话框应按 THEME_GROUPS 分组，不再硬编码主题 id 清单', () => {
        const source = readThemeSettingSources()
        expect(source).toContain("from '../../../../../../shared/constants/theme'")
        expect(source).toContain('THEME_GROUPS')
        // 防回归：迁移前的三组硬编码清单里的代表 id 不应再以字符串字面量出现
        expect(source.includes("'eyecare-green'")).toBe(false)
        expect(source.includes("'baize-data-dark'")).toBe(false)
        expect(source.includes("'baize-starry'")).toBe(false)
    })

    it('useTheme.ts 应使用 isDarkThemeType，BaiZeNotes.vue 只消费 useTheme 不再维护明暗逻辑', () => {
        // 第 4 批 4.2（M4）：主题明暗判断与全部主题实现收敛到 useTheme 单例；
        // 主界面组件只读 useTheme.isDarkTheme（内部仍走 shared DARK_THEME_TYPES 唯一口径）。
        const apiSource = readSource(USE_THEME)
        expect(apiSource).toContain("from '../../../shared/constants/theme'")
        expect(apiSource).toContain('isDarkThemeType')
        expect(apiSource.includes('const darkThemeTypes')).toBe(false)

        const shellSource = readSource(BAIZE_NOTES)
        expect(shellSource).toContain('theme.isDarkTheme')
        expect(shellSource.includes('const darkThemeTypes')).toBe(false)
        expect(shellSource.includes('darkThemeTypes.includes')).toBe(false)
    })

    it('useConfigStore.isDarkTheme 应使用 isDarkThemeType，不再按名字猜明暗', () => {
        const source = readSource(CONFIG_STORE)
        expect(source).toContain('isDarkThemeType')
        expect(source.includes(".includes('dark')")).toBe(false)
        expect(source.includes(".includes('深')")).toBe(false)
    })
})

// =============================================================================================
// 第 4 批 4.2（M4）：主题单真源静态护栏
//
// 收敛目标：主题读盘 / CSS 变量应用 / Monaco 主题 / 广播监听在渲染层只有一处实现
// （composables/useTheme.ts）；主界面壳与菜单栏只做「接线」，不得再各自读盘或直改 DOM。
// =============================================================================================
describe('主题单真源（第 4 批 4.2 / M4）', () => {
    const rendererSources = collectSourceFiles(RENDERER_SRC_DIR, ['.ts', '.vue'])

    it('渲染层只有 useTheme.ts 实现「当前主题样式」IPC 调用', () => {
        const filesUsingThemeStylesIpc = rendererSources
            .filter((file) => readSource(file).includes('THEME.GET_CURRENT_THEME_STYLES'))
            .map((file) => path.relative(RENDERER_SRC_DIR, file).replace(/\\/g, '/'))
        expect(filesUsingThemeStylesIpc).toEqual(['composables/useTheme.ts'])
    })

    it('渲染层只有 useTheme.ts 写主题 CSS 变量（--theme-* / --* 别名）', () => {
        const filesWritingThemeVariables = rendererSources
            .filter((file) => readSource(file).includes('setProperty('))
            .map((file) => path.relative(RENDERER_SRC_DIR, file).replace(/\\/g, '/'))
        expect(filesWritingThemeVariables).toEqual(['composables/useTheme.ts'])
        // 变量映射表（10 个主题色字段 × 主变量/别名）只能在单真源文件维护
        expect(readSource(USE_THEME)).toContain('THEME_CSS_VARIABLE_BINDINGS')
    })

    it('BaiZeNotes.vue 不再内联主题实现（读样式/写 DOM/Monaco 主题/重复订阅广播）', () => {
        const source = stripJsComments(readSource(BAIZE_NOTES))
        expect(source).toContain('useTheme')
        expect(source.includes('THEME.GET_CURRENT_THEME_STYLES')).toBe(false)
        expect(source.includes('document.documentElement')).toBe(false)
        expect(source.includes('style.setProperty')).toBe(false)
        expect(source.includes("querySelector('[data-theme]')")).toBe(false)
        expect(source.includes('monaco.editor.defineTheme')).toBe(false)
        expect(source.includes('THEME.THEME_UPDATED, handleThemeUpdate')).toBe(false)
    })

    it('MenuBar.vue 不再重复读主题配置 / 订阅主题广播', () => {
        const source = stripJsComments(readSource(MENU_BAR))
        expect(source.includes('config.read')).toBe(false)
        expect(source.includes('THEME.THEME_UPDATED')).toBe(false)
        expect(source.includes('IPC.THEME')).toBe(false)
    })
})

// =============================================================================================
// 第 4 批 4.5（M6）：CSS 单次注入静态护栏
//
// 收敛前：4 个 CSS 同时被 index.html 的 <link> 与 main.ts 的 import 加载（双份产物）；
// KaTeX CSS 在 main.ts / MathTextDialog.vue / MarkdownPreviewComponent.vue 三处引入。
// 收敛后：index.html 零 stylesheet link，基础 CSS 只由 main.ts 引入一次。
// P1-8 后续（KaTeX CSS 按需）：KaTeX CSS 移出 main.ts 首屏静态引入，改为
// preview-katex-assets.ts 中的单处动态 import（有公式时才加载），由下方用例锁定。
// =============================================================================================
describe('CSS 单次注入（第 4 批 4.5 / M6）', () => {
    const rendererSources = collectSourceFiles(RENDERER_SRC_DIR, ['.ts', '.vue', '.css'])

    /** 收敛前被 index.html 与 main.ts 双重加载的 4 个 CSS（相对 renderer 根目录的路径片段） */
    const DEDUPED_CSS_FILES = [
        'atom-one-light.css',
        'normalize.css',
        'admonition.css',
        'gridcards.css'
    ]

    /**
     * 统计源码中「真正的 CSS 引入语句」条数（`import 'x.css'` / `@import 'x.css'`）。
     * 注释中的文件名说明不算（本文件与源码注释都会提到这些路径）。
     */
    function countCssImports(source: string, cssFileName: string): number {
        const escaped = cssFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const pattern = new RegExp(`^\\s*(?:@?import)\\s+['"][^'"]*${escaped}['"]`, 'gm')
        return [...source.matchAll(pattern)].length
    }

    it('index.html 不再通过 <link rel="stylesheet"> 加载任何 CSS（收口到 main.ts）', () => {
        const source = stripHtmlComments(readSource(RENDERER_INDEX_HTML))
        expect(/<link[^>]+rel=["']stylesheet["']/i.test(source)).toBe(false)
        for (const cssFileName of DEDUPED_CSS_FILES) {
            const linkPattern = new RegExp(
                `<link[^>]+href=["'][^"']*${cssFileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}["']`,
                'i'
            )
            expect(linkPattern.test(source), `index.html 不应再 link ${cssFileName}`).toBe(false)
        }
    })

    it('4 个双重加载 CSS 只在 main.ts import 一次，且全仓仅 main.ts 引用', () => {
        const mainSource = readSource(MAIN_TS)
        for (const cssFileName of DEDUPED_CSS_FILES) {
            expect(countCssImports(mainSource, cssFileName), `main.ts 中 ${cssFileName}`).toBe(1)
            const referencingFiles = rendererSources
                .filter((file) => countCssImports(readSource(file), cssFileName) > 0)
                .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
            expect(referencingFiles).toEqual(['src/renderer/src/main.ts'])
        }
    })

    it('KaTeX CSS 不再随首屏静态引入，且动态引入收敛到 preview-katex-assets.ts 唯一一处', () => {
        // P1-8 后续（KaTeX CSS 按需）：KATEX CSS 曾由 main.ts 静态 import（进入首屏 CSS）。
        // 现在必须在「有公式时」与 KaTeX JS 同一次会话级加载，因此：
        // 1) 全仓不得再有静态 `import 'katex/dist/katex.css'`（含 min 变体）——否则样式回流首屏；
        // 2) 动态 import('...katex.css') 只能出现在 preview-katex-assets.ts（单一真源，
        //    预览管线与公式编辑器共用同一会话 Promise，避免重复打包/重复加载）。
        const staticKatexCssImportPattern =
            /^\s*import\s+['"][^'"]*katex\/dist\/katex(?:\.min)?\.css['"]/m
        const staticReferencingFiles = rendererSources
            .filter((file) => staticKatexCssImportPattern.test(readSource(file)))
            .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
        expect(staticReferencingFiles).toEqual([])
        expect(readSource(MAIN_TS)).not.toContain("import 'katex/dist/katex.css'")

        const dynamicKatexCssImportPattern =
            /import\(\s*['"][^'"]*katex\/dist\/katex(?:\.min)?\.css['"]\s*\)/
        const dynamicReferencingFiles = rendererSources
            .filter((file) => dynamicKatexCssImportPattern.test(readSource(file)))
            .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
        expect(dynamicReferencingFiles).toEqual([
            'src/renderer/src/components/Markdown/preview-katex-assets.ts'
        ])
    })

    it('与 styles/preview_font 重复的 assets/atom-one-light.css 死副本已删除（M6 重复资产）', () => {
        const assetsDuplicate = path.join(RENDERER_SRC_DIR, 'assets', 'atom-one-light.css')
        const effectiveStylesCopy = path.join(
            RENDERER_SRC_DIR,
            'styles',
            'preview_font',
            'atom-one-light.css'
        )
        // 收敛前 assets/ 下存在一份零引用的旧版 atom-one-light.css（1369B，
        // 与 styles/preview_font 的生效版本内容不同且全仓无引用），本轮作为重复资产删除；
        // 生效副本保留（main.ts 唯一引入，由上一个用例锁定）。
        expect(fs.existsSync(assetsDuplicate)).toBe(false)
        expect(fs.existsSync(effectiveStylesCopy)).toBe(true)
    })
})

// =============================================================================================
// 视觉升级 P0（T1）：28 套主题 × 18 个语义令牌完整性
//
// 目标：不 import 主进程运行时模块（避免 electron-store 依赖链），静态解析 theme-config.ts
// 的 themes 注册表，对每套主题实际调用共享派生函数，验证「28 × 18 = 504」个令牌全部可得
// 且全部是合法 CSS 颜色；同时锁定语义色分组、theme.css :root 默认值、useTheme 写入路径。
// =============================================================================================
describe('28 套主题 × 18 语义令牌派生完整性 + 配色自洽性（视觉升级 P0）', () => {
    /** 主题注册表中参与语义令牌派生的 7 个配色字段 */
    const TOKEN_COLOR_FIELDS = [
        'backgroundColor',
        'cardBackground',
        'textColor',
        'secondaryTextColor',
        'borderColor',
        'accentColor',
        'hoverBackground'
    ] as const
    const THEME_CSS_FILE = path.join(ROOT, 'src', 'renderer', 'src', 'styles', 'theme.css')

    interface ParsedThemeEntry {
        type: string
        colors: Record<string, string>
    }

    /**
     * 静态解析主进程 theme-config.ts 的 themes 注册表（键 + 7 个配色字段）。
     * 形状约束与 parseThemeRegistryKeys 一致：4 空格缩进的 `key: {` 开始一个条目，
     * 8 空格缩进的 `field: 'value'` 为字段；注册表顶格 `}` 结束。
     */
    function parseThemeColorEntries(): ParsedThemeEntry[] {
        const source = readSource(THEME_CONFIG_FILE)
        const marker = 'export const themes: Record<ThemeType, ThemeStyles> = {'
        const start = source.indexOf(marker)
        expect(start, '主进程 theme-config.ts 应定义 themes 注册表').toBeGreaterThanOrEqual(0)
        const entries: ParsedThemeEntry[] = []
        let current: ParsedThemeEntry | null = null
        for (const line of source.slice(start + marker.length).split('\n')) {
            if (line === '}') {
                break
            }
            const keyMatch = line.match(/^ {4}(?:'([^']+)'|([A-Za-z][\w-]*)): \{$/)
            if (keyMatch) {
                current = { type: keyMatch[1] ?? keyMatch[2], colors: {} }
                entries.push(current)
                continue
            }
            if (!current) {
                continue
            }
            const fieldMatch = line.match(/^ {8}([A-Za-z]+): '([^']*)'/)
            if (fieldMatch && (TOKEN_COLOR_FIELDS as readonly string[]).includes(fieldMatch[1])) {
                current.colors[fieldMatch[1]] = fieldMatch[2]
            }
        }
        return entries
    }

    const THEME_ENTRIES = parseThemeColorEntries()

    it('静态解析出 28 个主题条目，每个条目 7 个配色字段均为合法颜色', () => {
        expect(THEME_ENTRIES).toHaveLength(28)
        expect(THEME_ENTRIES.map((entry) => entry.type).sort()).toEqual(
            [...THEME_TYPE_UNION].sort()
        )
        for (const entry of THEME_ENTRIES) {
            expect(Object.keys(entry.colors).sort(), entry.type).toEqual(
                [...TOKEN_COLOR_FIELDS].sort()
            )
            for (const field of TOKEN_COLOR_FIELDS) {
                expect(parseColor(entry.colors[field]), `${entry.type}.${field}`).not.toBeNull()
            }
        }
    })

    it('每套主题都能派生全部 18 个语义令牌，且全部是合法 CSS 颜色（28 × 18 = 504 项）', () => {
        let checkedTokens = 0
        for (const entry of THEME_ENTRIES) {
            const source = entry.colors as unknown as SemanticTokenSource
            const group = resolveSemanticThemeGroup(entry.type, source)
            const tokens = buildSemanticTokens(source, group)
            expect(Object.keys(tokens).sort(), entry.type).toEqual([...SEMANTIC_TOKEN_KEYS].sort())
            for (const key of SEMANTIC_TOKEN_KEYS) {
                expect(
                    parseColor(tokens[key]),
                    `${entry.type}.${key}=${tokens[key]}`
                ).not.toBeNull()
                checkedTokens += 1
            }
            // CSS 变量映射同为 18 项且变量名保持 --ui- 前缀
            const variables = buildSemanticCssVariables(source, group)
            expect(Object.keys(variables)).toHaveLength(18)
        }
        expect(checkedTokens).toBe(28 * 18)
    })

    it('语义色分组：护眼组全部 eyecare，浅色/深色组与表面亮度判定一致（REQ-02 修正后）', () => {
        const groupByType = new Map(
            THEME_ENTRIES.map((entry) => [
                entry.type,
                resolveSemanticThemeGroup(
                    entry.type,
                    entry.colors as unknown as SemanticTokenSource
                )
            ])
        )
        // 2026-11-28 REQ-02 后「声明分组 = 实测明暗」：浅色组必须按浅色套语义色、深色组必须按
        // 深色套；不再有历史归属偏差（forest / baize-text / baize-starry 已修正声明）。
        for (const type of EYECARE_THEME_TYPES) {
            expect(groupByType.get(type), type).toBe('eyecare')
        }
        for (const type of DARK_THEME_TYPES) {
            expect(groupByType.get(type), type).toBe('dark')
        }
        for (const type of LIGHT_THEME_TYPES) {
            expect(groupByType.get(type), type).toBe('light')
        }
    })

    it('REQ-02：三套历史归属相反主题已按实测明暗修正声明分组（不改颜色）', () => {
        // 2026-11-28 产品口径：以配色的实测明暗为准修正声明分组，不改任何主题颜色。
        // 历史问题：forest 声明深色但实测浅底；baize-text / baize-starry 声明浅色但实测深底。
        expect(LIGHT_THEME_TYPES).toContain('forest')
        expect(DARK_THEME_TYPES).toContain('baize-text')
        expect(DARK_THEME_TYPES).toContain('baize-starry')
        expect(isDarkThemeType('forest')).toBe(false)
        expect(isDarkThemeType('baize-text')).toBe(true)
        expect(isDarkThemeType('baize-starry')).toBe(true)
        const expectedClass: Record<string, 'light' | 'dark'> = {
            forest: 'light',
            'baize-text': 'dark',
            'baize-starry': 'dark'
        }
        for (const [type, expected] of Object.entries(expectedClass)) {
            const entry = THEME_ENTRIES.find((item) => item.type === type)
            expect(entry, `应能解析 ${type} 主题条目`).toBeDefined()
            const source = entry?.colors as unknown as SemanticTokenSource
            expect(isDarkColor(source.cardBackground), `${type}.cardBackground 实测明暗`).toBe(
                expected === 'dark'
            )
            expect(resolveSemanticThemeGroup(type, source), type).toBe(expected)
        }
    })

    it('深色分组使用深色语义状态色，浅色/护眼分组使用浅色语义状态色', () => {
        for (const entry of THEME_ENTRIES) {
            const source = entry.colors as unknown as SemanticTokenSource
            const group = resolveSemanticThemeGroup(entry.type, source)
            const tokens = buildSemanticTokens(source, group)
            const expectedPalette =
                group === 'dark' ? SEMANTIC_STATUS_COLORS.dark : SEMANTIC_STATUS_COLORS.light
            expect(tokens.success, `${entry.type}.success`).toBe(expectedPalette.success)
            expect(tokens.warning, `${entry.type}.warning`).toBe(expectedPalette.warning)
            expect(tokens.danger, `${entry.type}.danger`).toBe(expectedPalette.danger)
            expect(tokens.info, `${entry.type}.info`).toBe(expectedPalette.info)
        }
    })

    it('theme.css :root 的 18 个 --ui-* 默认值 == baize 主题派生结果（首屏兜底与运行时一致）', () => {
        const baizeEntry = THEME_ENTRIES.find((entry) => entry.type === 'baize')
        expect(baizeEntry, '应能解析 baize 主题条目').toBeDefined()
        const source = baizeEntry?.colors as unknown as SemanticTokenSource
        const variables = buildSemanticCssVariables(source, 'light')
        const cssSource = readSource(THEME_CSS_FILE)
        for (const binding of SEMANTIC_TOKEN_CSS_BINDINGS) {
            expect(
                cssSource,
                `theme.css :root 缺少与派生结果一致的 ${binding.cssVariable}`
            ).toContain(`${binding.cssVariable}: ${variables[binding.cssVariable]};`)
        }
    })

    it('useTheme 在应用主题时追加语义变量，且既有 20 变量映射机制保持不变（UI-03）', () => {
        const useThemeSource = readSource(USE_THEME)
        // 追加：20 个旧变量仍由 buildThemeCssVariables 生成；语义变量由 buildSemanticCssVariables 生成
        expect(useThemeSource).toContain('buildThemeCssVariables')
        expect(useThemeSource).toContain('buildSemanticCssVariables')
        expect(useThemeSource).toContain("from '../../../shared/theme-tokens'")
        expect(useThemeSource).toContain('THEME_CSS_VARIABLE_BINDINGS')
        // 语义变量必须与旧变量合并后统一写入（否则会覆盖/漏写其中一套）
        expect(useThemeSource).toContain('...buildThemeCssVariables(theme)')
        expect(useThemeSource).toContain('...buildSemanticCssVariables(theme, semanticGroup)')
        // 旧变量清单仍是 10 个配色字段（20 变量）的唯一真源
        expect(useThemeSource).toContain('export const THEME_CSS_VARIABLE_BINDINGS')
    })

    // =========================================================================================
    // 主题配色自洽性（2026-11-27 遗留项 1：dark 主题历史配色数据异常修正的回归护栏）
    //
    // 历史缺陷：dark（深邃夜空）的 backgroundColor 误用 rose 主题的浅粉 #fff0f0，而
    // cardBackground #1a1a2e / textColor #e0e0e0 为深色主题配色 → 页面底与卡片面明暗相反，
    // 正文 #e0e0e0 在 #fff0f0 上仅 1.19:1（不可读）。P0 令牌派生只对 cardBackground 表面做
    // 亮度兜底，因此该异常被掩盖。以下两条用例锁定「页面底自洽」：以后任意主题再把背景色
    // 改成与卡片相反明暗（或页面底正文不可读）都会被静态契约直接拦截。
    // =========================================================================================

    it('28 套主题页面底与卡片面明暗一致，且正文/次要文字在页面底上可读（AA 基线）', () => {
        for (const entry of THEME_ENTRIES) {
            const source = entry.colors as unknown as SemanticTokenSource
            const group = resolveSemanticThemeGroup(entry.type, source)
            // 语义分组按「卡片面亮度」判定：页面底必须与其同明暗，禁止出现 dark 历史数据的
            // 「浅粉页面底 + 深色卡片」组合（深色主题下卡片面更亮、浅色主题下页面底更亮）
            expect(isDarkColor(source.backgroundColor), `${entry.type}.backgroundColor`).toBe(
                group === 'dark'
            )
            const textContrast = contrastRatio(source.textColor, source.backgroundColor) ?? 0
            const secondaryContrast =
                contrastRatio(source.secondaryTextColor, source.backgroundColor) ?? 0
            expect(textContrast, `${entry.type} 正文/页面底对比度`).toBeGreaterThanOrEqual(4.5)
            expect(secondaryContrast, `${entry.type} 次要文字/页面底对比度`).toBeGreaterThanOrEqual(
                3
            )
        }
    })

    it('深邃夜空（dark）已修正为自洽深色：深色页面底 + 卡片悬浮层次 + 可读文字', () => {
        const darkEntry = THEME_ENTRIES.find((entry) => entry.type === 'dark')
        expect(darkEntry, '应能解析 dark 主题条目').toBeDefined()
        const source = darkEntry?.colors as unknown as SemanticTokenSource
        expect(isDarkColor(source.backgroundColor), 'dark.backgroundColor 必须是深色').toBe(true)
        expect(isDarkColor(source.cardBackground), 'dark.cardBackground 必须是深色').toBe(true)
        // 页面底应比卡片面更暗，保证卡片/工具窗是「悬浮面」而不是「凹陷面」
        const pageLuminance = relativeLuminance(source.backgroundColor)
        const cardLuminance = relativeLuminance(source.cardBackground)
        expect(pageLuminance).not.toBeNull()
        expect(cardLuminance).not.toBeNull()
        expect(pageLuminance as number).toBeLessThan(cardLuminance as number)
        // 正文 ≥4.5:1、次要文字 ≥3:1（历史值正文仅 1.19:1）
        expect(contrastRatio(source.textColor, source.backgroundColor) ?? 0).toBeGreaterThanOrEqual(
            4.5
        )
        expect(
            contrastRatio(source.secondaryTextColor, source.backgroundColor) ?? 0
        ).toBeGreaterThanOrEqual(3)
    })
})
