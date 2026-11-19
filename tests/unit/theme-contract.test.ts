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
const CONFIG_STORE = path.join(ROOT, 'src', 'renderer', 'src', 'common', 'useConfigStore.ts')

function readSource(file: string): string {
    // 仓库内部分文件为 CRLF（prettier endOfLine=auto），统一归一化为 LF 后再做行级解析
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
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

    it('BaiZeNotes.vue 标题栏 logo 明暗应使用 isDarkThemeType，不再维护 darkThemeTypes', () => {
        const source = readSource(BAIZE_NOTES)
        expect(source).toContain('isDarkThemeType')
        expect(source.includes('const darkThemeTypes')).toBe(false)
        expect(source.includes('darkThemeTypes.includes')).toBe(false)
    })

    it('useConfigStore.isDarkTheme 应使用 isDarkThemeType，不再按名字猜明暗', () => {
        const source = readSource(CONFIG_STORE)
        expect(source).toContain('isDarkThemeType')
        expect(source.includes(".includes('dark')")).toBe(false)
        expect(source.includes(".includes('深')")).toBe(false)
    })
})
