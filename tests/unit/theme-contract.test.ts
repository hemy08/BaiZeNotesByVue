/**
 * 主题契约静态护栏（第 2 批契约重构 2.5：主题类型族 + 明暗分组清单）
 *
 * 目标（全部为「真源 ⇄ 契约 ⇄ 消费方」三方一致性检查，不 import 主进程运行时模块）：
 * 1. shared/types/theme.ts 的 ThemeType 联合 == 主进程 theme-config.ts 的 themes 注册表键
 *    （28 项，双向核对）——主题标识只有这一处真源；
 * 2. shared/constants/theme.ts 的 THEME_GROUPS 覆盖全部 28 项、不重不漏，分组为
 *    light 14 / dark 7 / eyecare 7（值来自主题设置对话框迁移前的 UI 分类基线）；
 * 3. 分组标题 i18n key 在 zh-CN / en-US 词典中均存在；
 * 4. 渲染层消费方（主题设置对话框 / 标题栏 logo / config store）确实引用 shared 清单，
 *    且不再保留硬编码主题 id 数组（防回归：避免又回到三处各自维护）。
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

    it('三组数量应为 14 / 7 / 7（主题设置对话框 UI 分类基线）', () => {
        expect(LIGHT_THEME_TYPES).toHaveLength(14)
        expect(DARK_THEME_TYPES).toHaveLength(7)
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
    it('ThemeSettingDialog.vue 应按 THEME_GROUPS 分组，不再硬编码主题 id 清单', () => {
        const source = readSource(THEME_SETTING_DIALOG)
        expect(source).toContain("from '../../../../../shared/constants/theme'")
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
// 收敛后：index.html 零 stylesheet link，全部 CSS 只由 main.ts 引入一次，KaTeX 只有一处。
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

    it('KaTeX CSS 全仓只有 main.ts 一处引入（katex.css / katex.min.css 均计）', () => {
        const katexCssImportPattern =
            /^\s*(?:@?import)\s+['"][^'"]*katex\/dist\/katex(?:\.min)?\.css['"]/m
        const referencingFiles = rendererSources
            .filter((file) => katexCssImportPattern.test(readSource(file)))
            .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
        expect(referencingFiles).toEqual(['src/renderer/src/main.ts'])
        expect(readSource(MAIN_TS)).toContain("import 'katex/dist/katex.css'")
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
