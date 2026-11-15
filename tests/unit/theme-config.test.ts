/**
 * theme-config.ts 单元测试
 * 覆盖：主题注册表完整性、按类型取样式、当前主题读写、独立编辑器主题开关、
 * Monaco 主题读写、fallback、createConfigStoreSafely 损坏备份重建、Monaco 主题列表委托
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as path from 'path'
import * as fs from 'fs'

// 顶层 mock：electron（app-paths 需要 getPath('home')）
const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: { home: `${base}/baize-vitest-theme-config/home` } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-theme-config/app`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

// theme-registry 依赖：is.dev 恒为 true；目录扫描返回空列表（不依赖磁盘主题文件）
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

const registryFs = vi.hoisted(() => ({
    readdirSync: vi.fn(),
    // 保存真实 fs 模块引用：mock 会覆盖 readdirSync，测试内部校验备份文件时需走真实实现
    realFs: null as unknown as typeof import('fs')
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    registryFs.realFs = actual
    return { ...actual, readdirSync: registryFs.readdirSync }
})

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>()
    registryFs.realFs = actual
    return { ...actual, readdirSync: registryFs.readdirSync }
})

import { FakeStore } from './helpers/fake-store'
import {
    themes,
    getAllThemes,
    getCurrentTheme,
    getCurrentThemeStyles,
    getThemeStylesByType,
    setTheme,
    getAllMonacoThemes,
    getSeparateEditorTheme,
    setSeparateEditorTheme,
    getMonacoTheme,
    setMonacoTheme,
    createConfigStoreSafely,
    type ThemeType
} from '../../src/main/config/theme-config'

// 主题样式必填字段
const STYLE_KEYS = [
    'name',
    'description',
    'titleBarGradient',
    'backgroundColor',
    'cardBackground',
    'textColor',
    'secondaryTextColor',
    'borderColor',
    'accentColor',
    'buttonBackground',
    'buttonTextColor',
    'hoverBackground'
] as const

describe('theme-config', () => {
    beforeEach(() => {
        FakeStore.resetAll()
        registryFs.readdirSync.mockReset()
        registryFs.readdirSync.mockReturnValue([])
    })

    describe('themes registry', () => {
        it('should contain 28 themes', () => {
            expect(Object.keys(themes)).toHaveLength(28)
        })

        it('should give every theme complete non-empty style fields', () => {
            for (const [type, styles] of Object.entries(themes)) {
                for (const key of STYLE_KEYS) {
                    expect(typeof styles[key], `${type}.${key}`).toBe('string')
                    expect((styles[key] as string).length, `${type}.${key}`).toBeGreaterThan(0)
                }
            }
        })

        it('should expose known theme values', () => {
            expect(themes.baize.name).toBe('白泽紫韵')
            expect(themes.baize.accentColor).toBe('#764ba2')
            expect(themes.deepdark.backgroundColor).toBe('#000000')
            expect(themes.deepdark.cardBackground).toBe('#121212')
            expect(themes['eyecare-green'].accentColor).toBe('#4caf50')
            expect(themes['baize-data-dark'].backgroundColor).toBe('#020617')
        })
    })

    describe('getAllThemes / getThemeStylesByType', () => {
        it('should list all themes with type and styles', () => {
            const all = getAllThemes()
            expect(all).toHaveLength(28)
            const baize = all.find((t) => t.type === 'baize')
            expect(baize).toBeDefined()
            expect(baize!.styles).toBe(themes.baize)
        })

        it('should return styles for a known theme type', () => {
            expect(getThemeStylesByType('warm').name).toBe('暖白温馨')
            expect(getThemeStylesByType('dark').accentColor).toBe('#4fc3f7')
        })

        it('should fall back to the default theme for an unknown theme type (AS-4)', () => {
            // AS-4：非法主题值不再返回 undefined（会让 HTML 对话框模板抛 TypeError）
            expect(getThemeStylesByType('not-exist' as ThemeType)).toBe(themes.baize)
        })
    })

    describe('current theme', () => {
        it('should default the current theme to baize', () => {
            expect(getCurrentTheme()).toBe('baize')
        })

        it('should update and persist the current theme', () => {
            setTheme('dark')
            expect(getCurrentTheme()).toBe('dark')
            expect(getCurrentThemeStyles()).toBe(themes.dark)
        })

        it('should keep other config fields when switching theme', () => {
            setSeparateEditorTheme(true)
            setMonacoTheme('hc-black')
            setTheme('light')
            expect(getCurrentTheme()).toBe('light')
            expect(getSeparateEditorTheme()).toBe(true)
            expect(getMonacoTheme()).toBe('hc-black')
        })

        it('should fall back to baize when the persisted currentTheme is invalid (AS-4)', () => {
            // 模拟历史损坏配置：theme-config.json 被写入未知主题名
            FakeStore.data.set(
                'theme-config',
                new Map<string, unknown>([
                    ['themeConfig', { currentTheme: 'no-such-theme', separateEditorTheme: false }]
                ])
            )
            expect(getCurrentTheme()).toBe('baize')
            expect(getCurrentThemeStyles()).toBe(themes.baize)
        })
    })

    describe('separate editor theme', () => {
        it('should default separateEditorTheme to false', () => {
            expect(getSeparateEditorTheme()).toBe(false)
        })

        it('should roundtrip true and false', () => {
            setSeparateEditorTheme(true)
            expect(getSeparateEditorTheme()).toBe(true)
            setSeparateEditorTheme(false)
            expect(getSeparateEditorTheme()).toBe(false)
        })

        it('should fall back to false when the field is missing', () => {
            // 构造缺少 separateEditorTheme 的配置
            FakeStore.data.set(
                'theme-config',
                new Map<string, unknown>([['themeConfig', { currentTheme: 'warm' }]])
            )
            expect(getSeparateEditorTheme()).toBe(false)
            expect(getCurrentTheme()).toBe('warm')
        })
    })

    describe('monaco theme', () => {
        it('should default the monaco theme to vs', () => {
            expect(getMonacoTheme()).toBe('vs')
        })

        it('should roundtrip a custom monaco theme', () => {
            setMonacoTheme('vs-dark')
            expect(getMonacoTheme()).toBe('vs-dark')
        })

        it('should fall back to vs when the field is missing', () => {
            FakeStore.data.set(
                'theme-config',
                new Map<string, unknown>([
                    ['themeConfig', { currentTheme: 'baize', separateEditorTheme: false }]
                ])
            )
            expect(getMonacoTheme()).toBe('vs')
        })
    })

    describe('getAllMonacoThemes delegation', () => {
        it('should return built-in monaco themes when the theme directory is empty', () => {
            registryFs.readdirSync.mockReturnValue([])
            const result = getAllMonacoThemes()
            expect(result.map((t) => t.type)).toEqual(['vs', 'vs-dark', 'hc-black'])
            expect(result[0].config.isDark).toBe(false)
            expect(result[1].config.isDark).toBe(true)
            expect(result[2].config.isDark).toBe(true)
        })
    })

    describe('createConfigStoreSafely', () => {
        it('should return a working store with defaults in the normal path', () => {
            const store = createConfigStoreSafely(
                'safely-normal',
                { hello: 'world' },
                '/unused/path.json'
            )
            expect(store.get('hello')).toBe('world')
            expect(store.get('missing', 'fallback')).toBe('fallback')
        })

        it('should back up the corrupt file and rebuild the store', () => {
            const configDir = path.join(electronState.paths.home, '.baizenotes', 'config')
            const filePath = path.join(configDir, 'safely-corrupt.json')
            fs.mkdirSync(configDir, { recursive: true })
            fs.writeFileSync(filePath, '{ corrupt', 'utf-8')

            FakeStore.failOnceFor = 'safely-corrupt'
            const store = createConfigStoreSafely('safely-corrupt', { ok: 1 }, filePath)

            expect(store.get('ok')).toBe(1)
            // 使用真实 fs 读取目录（registryFs.readdirSync 已被 mock 覆盖）
            const files = registryFs.realFs.readdirSync(configDir)
            const backup = files.find((f) => /^safely-corrupt\.json\.corrupt-\d+$/.test(f))
            expect(backup).toBeDefined()
            expect(fs.existsSync(filePath)).toBe(false)
        })

        it('should rebuild without backup when the corrupt file does not exist', () => {
            const configDir = path.join(electronState.paths.home, '.baizenotes', 'config')
            fs.mkdirSync(configDir, { recursive: true })

            FakeStore.failOnceFor = 'safely-no-file'
            const store = createConfigStoreSafely(
                'safely-no-file',
                { ok: 2 },
                path.join(configDir, 'safely-no-file.json')
            )
            expect(store.get('ok')).toBe(2)
            // 只检查本次测试目标的备份文件（其他用例的备份可能残留在同一目录）
            const corruptBackups = registryFs.realFs
                .readdirSync(configDir)
                .filter((f) => f.includes('safely-no-file') && f.includes('.corrupt-'))
            expect(corruptBackups).toEqual([])
        })
    })
})
