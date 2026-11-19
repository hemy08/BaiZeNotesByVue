/**
 * theme-registry.ts 单元测试
 * 覆盖：内置主题、目录扫描失败兜底、扫描结果缓存、外部主题加载与配置提取
 * （lighten/darken 颜色计算）、坏 JSON 跳过、名称排序、getMonacoThemeData
 * 的按需读取与缓存、路径逃逸防护、非法 JSON/读取失败处理。
 *
 * 第 4 批 P3：资源目录解析已统一到 app-paths.getAppResourcesPath()，测试桩替换该模块。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// 第 4 批 P3：资源目录统一由 app-paths.getAppResourcesPath() 解析（基于 app.isPackaged）。
// 单元测试桩替换该模块为固定资源目录，避免加载 electron 运行时；文件读写仍由下方 fs mock 拦截。
vi.mock('../../src/main/utils/app-paths', () => ({
    getAppResourcesPath: () => 'E:/baize-vitest/resources'
}))

// P2：theme-registry 的失败日志统一走 utils/logger（logger 依赖 electron 运行时）。
// 本测试不 mock electron，命中失败路径时若加载真实 logger 会因缺少 electron app 报错，
// 因此桩替换 logger 单例。
vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const fsMocks = vi.hoisted(() => ({
    readdirSync: vi.fn(),
    readFileSync: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn()
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    return {
        ...actual,
        readdirSync: fsMocks.readdirSync,
        readFileSync: fsMocks.readFileSync,
        promises: { ...actual.promises, readFile: fsMocks.readFile, readdir: fsMocks.readdir }
    }
})

vi.mock('node:fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('node:fs')>()
    return {
        ...actual,
        readdirSync: fsMocks.readdirSync,
        readFileSync: fsMocks.readFileSync,
        promises: { ...actual.promises, readFile: fsMocks.readFile, readdir: fsMocks.readdir }
    }
})

import type { MonacoThemeData } from '../../src/main/config/theme-registry'

// 测试夹具：深色主题（bg #101010）
const darkThemeData: MonacoThemeData = {
    base: 'vs-dark',
    colors: {
        'editor.background': '#101010',
        'editor.foreground': '#eeeeee'
    }
}

// 测试夹具：浅色主题（bg #ffffff）
const lightThemeData: MonacoThemeData = {
    base: 'vs',
    colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#111111'
    }
}

// 测试夹具：自带 widget 颜色覆盖
const overriddenThemeData: MonacoThemeData = {
    base: 'vs-dark',
    colors: {
        'editor.background': '#ffffff',
        'editor.foreground': '#000000',
        'editorWidget.background': '#444444',
        'editorWidget.border': '#555555'
    }
}

async function loadRegistry() {
    return await import('../../src/main/config/theme-registry')
}

describe('theme-registry', () => {
    beforeEach(() => {
        vi.resetModules()
        fsMocks.readdirSync.mockReset()
        fsMocks.readFileSync.mockReset()
        fsMocks.readFile.mockReset()
        fsMocks.readdir.mockReset()
    })

    describe('built-in themes', () => {
        it('should return three built-in themes when the directory is empty', async () => {
            fsMocks.readdirSync.mockReturnValue([])
            const { getAllMonacoThemes } = await loadRegistry()
            const result = getAllMonacoThemes()
            expect(result.map((t) => t.type)).toEqual(['vs', 'vs-dark', 'hc-black'])
            expect(result[0].config.isDark).toBe(false)
            expect(result[0].config.backgroundColor).toBe('#FFFFFF')
            expect(result[0].config.foregroundColor).toBe('#000000')
            expect(result[1].config.isDark).toBe(true)
            expect(result[1].config.backgroundColor).toBe('#1E1E1E')
            expect(result[2].config.isDark).toBe(true)
            expect(result[2].config.backgroundColor).toBe('#000000')
        })

        it('should fall back to built-ins when the directory scan throws', async () => {
            fsMocks.readdirSync.mockImplementation(() => {
                throw new Error('no such directory')
            })
            const { getAllMonacoThemes } = await loadRegistry()
            expect(getAllMonacoThemes().map((t) => t.type)).toEqual(['vs', 'vs-dark', 'hc-black'])
        })

        it('should cache the directory scan result after a failure', async () => {
            fsMocks.readdirSync.mockImplementationOnce(() => {
                throw new Error('first scan fails')
            })
            const { getAllMonacoThemes } = await loadRegistry()
            expect(getAllMonacoThemes()).toHaveLength(3)
            // 第二次调用目录中出现文件，但扫描结果已缓存为失败状态
            fsMocks.readdirSync.mockReturnValue(['new-theme.json'])
            expect(getAllMonacoThemes()).toHaveLength(3)
            expect(fsMocks.readdirSync).toHaveBeenCalledTimes(1)
        })

        it('should cache the directory scan result after a success', async () => {
            fsMocks.readdirSync.mockReturnValueOnce([])
            const { getAllMonacoThemes } = await loadRegistry()
            getAllMonacoThemes()
            getAllMonacoThemes()
            expect(fsMocks.readdirSync).toHaveBeenCalledTimes(1)
        })
    })

    describe('external theme loading and config extraction', () => {
        beforeEach(() => {
            // 模拟主题目录文件清单：非 JSON、themelist.json 应被过滤
            fsMocks.readdirSync.mockReturnValue([
                'Alpha.json',
                'beta.json',
                'themelist.json',
                'notes.txt'
            ])
            fsMocks.readFileSync.mockImplementation((filePath: string) => {
                const p = String(filePath)
                if (p.endsWith('Alpha.json')) return JSON.stringify(darkThemeData)
                if (p.endsWith('beta.json')) return JSON.stringify(lightThemeData)
                throw new Error(`unexpected read: ${p}`)
            })
        })

        it('should list built-ins first then external themes sorted by name', async () => {
            const { getAllMonacoThemes } = await loadRegistry()
            const result = getAllMonacoThemes()
            expect(result.map((t) => t.type)).toEqual([
                'vs',
                'vs-dark',
                'hc-black',
                'Alpha',
                'beta'
            ])
        })

        it('should extract dark theme config with lightened card/border colors', async () => {
            const { getAllMonacoThemes } = await loadRegistry()
            const alpha = getAllMonacoThemes().find((t) => t.type === 'Alpha')!
            expect(alpha.config.isDark).toBe(true)
            expect(alpha.config.backgroundColor).toBe('#101010')
            expect(alpha.config.foregroundColor).toBe('#eeeeee')
            // lightenColor('#101010', 15) = #1f1f1f；lightenColor('#101010', 30) = #2e2e2e
            expect(alpha.config.cardBackground).toBe('#1f1f1f')
            expect(alpha.config.borderColor).toBe('#2e2e2e')
            expect(alpha.config.name).toBe('Alpha')
            expect(alpha.config.description).toBe('Alpha 主题')
        })

        it('should extract light theme config with darkened card/border colors', async () => {
            const { getAllMonacoThemes } = await loadRegistry()
            const beta = getAllMonacoThemes().find((t) => t.type === 'beta')!
            expect(beta.config.isDark).toBe(false)
            expect(beta.config.backgroundColor).toBe('#ffffff')
            // darkenColor('#ffffff', 3) = #fcfcfc；darkenColor('#ffffff', 12) = #f3f3f3
            expect(beta.config.cardBackground).toBe('#fcfcfc')
            expect(beta.config.borderColor).toBe('#f3f3f3')
        })

        it('should prefer explicit widget colors over computed ones', async () => {
            fsMocks.readFileSync.mockImplementation((filePath: string) => {
                const p = String(filePath)
                if (p.endsWith('Alpha.json')) return JSON.stringify(overriddenThemeData)
                if (p.endsWith('beta.json')) return JSON.stringify(lightThemeData)
                throw new Error(`unexpected read: ${p}`)
            })
            const { getAllMonacoThemes } = await loadRegistry()
            const alpha = getAllMonacoThemes().find((t) => t.type === 'Alpha')!
            expect(alpha.config.cardBackground).toBe('#444444')
            expect(alpha.config.borderColor).toBe('#555555')
        })

        it('should clamp lightened colors at #ffffff', async () => {
            // 深色主题 bg 已为 #ffffff，加量后不应溢出
            fsMocks.readFileSync.mockImplementation((filePath: string) => {
                const p = String(filePath)
                if (p.endsWith('Alpha.json')) {
                    return JSON.stringify({
                        base: 'vs-dark',
                        colors: { 'editor.background': '#ffffff', 'editor.foreground': '#000000' }
                    })
                }
                if (p.endsWith('beta.json')) return JSON.stringify(lightThemeData)
                throw new Error(`unexpected read: ${p}`)
            })
            const { getAllMonacoThemes } = await loadRegistry()
            const alpha = getAllMonacoThemes().find((t) => t.type === 'Alpha')!
            // lighten(#ffffff, 15) 与 lighten(#ffffff, 30) 都应被钳制为 #ffffff
            expect(alpha.config.cardBackground).toBe('#ffffff')
            expect(alpha.config.borderColor).toBe('#ffffff')
        })

        it('should skip theme files that fail to parse', async () => {
            fsMocks.readdirSync.mockReturnValue(['good.json', 'broken.json'])
            fsMocks.readFileSync.mockImplementation((filePath: string) => {
                const p = String(filePath)
                if (p.endsWith('good.json')) return JSON.stringify(lightThemeData)
                return '{ not-valid json'
            })
            const { getAllMonacoThemes } = await loadRegistry()
            const result = getAllMonacoThemes()
            const types = result.map((t) => t.type)
            expect(types).toContain('good')
            expect(types).not.toContain('broken')
        })

        it('should not re-read theme files after the registry is initialized', async () => {
            const { getAllMonacoThemes } = await loadRegistry()
            getAllMonacoThemes()
            const firstReads = fsMocks.readFileSync.mock.calls.length
            getAllMonacoThemes()
            expect(fsMocks.readFileSync.mock.calls.length).toBe(firstReads)
        })
    })

    describe('getMonacoThemeData', () => {
        it('should return null for built-in themes', async () => {
            const { getMonacoThemeData } = await loadRegistry()
            await expect(getMonacoThemeData('vs')).resolves.toBeNull()
            await expect(getMonacoThemeData('vs-dark')).resolves.toBeNull()
            await expect(getMonacoThemeData('hc-black')).resolves.toBeNull()
        })

        it('should return null for an empty theme name', async () => {
            const { getMonacoThemeData } = await loadRegistry()
            await expect(getMonacoThemeData('')).resolves.toBeNull()
        })

        it('should reject path traversal theme names', async () => {
            const { getMonacoThemeData } = await loadRegistry()
            await expect(getMonacoThemeData('../evil')).resolves.toBeNull()
            await expect(getMonacoThemeData('a/b')).resolves.toBeNull()
            await expect(getMonacoThemeData('a\\b')).resolves.toBeNull()
            await expect(getMonacoThemeData('..')).resolves.toBeNull()
            await expect(getMonacoThemeData('evil..')).resolves.toBeNull()
            await expect(getMonacoThemeData('themelist')).resolves.toBeNull()
            // 非法名称不应触发文件读取
            expect(fsMocks.readFile).not.toHaveBeenCalled()
        })

        it('should read the theme JSON on demand and cache it', async () => {
            fsMocks.readFile.mockResolvedValueOnce(JSON.stringify(darkThemeData))
            const { getMonacoThemeData } = await loadRegistry()
            const first = await getMonacoThemeData('Alpha')
            expect(first).toEqual(darkThemeData)
            const second = await getMonacoThemeData('Alpha')
            expect(second).toEqual(darkThemeData)
            // 第二次命中缓存，不再读文件
            expect(fsMocks.readFile).toHaveBeenCalledTimes(1)
        })

        it('should return null when the JSON is invalid', async () => {
            fsMocks.readFile.mockResolvedValueOnce('{ not-valid json')
            const { getMonacoThemeData } = await loadRegistry()
            await expect(getMonacoThemeData('Alpha')).resolves.toBeNull()
        })

        it('should return null when reading the file fails', async () => {
            fsMocks.readFile.mockRejectedValueOnce(new Error('ENOENT'))
            const { getMonacoThemeData } = await loadRegistry()
            await expect(getMonacoThemeData('Alpha')).resolves.toBeNull()
        })
    })

    // 2026-11-18（遗留清单 #12）：启动空闲异步预热——首次同步构建不再做文件 IO
    describe('warmupMonacoThemeCache', () => {
        it('should warm up caches asynchronously so the first sync build performs no file IO', async () => {
            fsMocks.readdir.mockResolvedValue(['Alpha.json'])
            fsMocks.readFile.mockResolvedValue(JSON.stringify(darkThemeData))
            const { warmupMonacoThemeCache, getAllMonacoThemes } = await loadRegistry()

            await warmupMonacoThemeCache()
            expect(fsMocks.readdir).toHaveBeenCalledTimes(1)
            expect(fsMocks.readFile).toHaveBeenCalledTimes(1)

            const result = getAllMonacoThemes()
            expect(result.map((t) => t.type)).toEqual(['vs', 'vs-dark', 'hc-black', 'Alpha'])
            // 预热后首次同步构建只做内存构建：不再同步扫描目录/读取 JSON
            expect(fsMocks.readdirSync).not.toHaveBeenCalled()
            expect(fsMocks.readFileSync).not.toHaveBeenCalled()
        })

        it('should keep lazy loading when the directory scan fails', async () => {
            fsMocks.readdir.mockRejectedValue(new Error('EACCES'))
            fsMocks.readdirSync.mockReturnValue([])
            const { warmupMonacoThemeCache, getAllMonacoThemes } = await loadRegistry()

            // 预热失败不抛错，也不落空缓存
            await expect(warmupMonacoThemeCache()).resolves.toBeUndefined()
            const result = getAllMonacoThemes()
            expect(result.map((t) => t.type)).toEqual(['vs', 'vs-dark', 'hc-black'])
            // 惰性路径仍按原逻辑同步扫描
            expect(fsMocks.readdirSync).toHaveBeenCalled()
        })

        it('should skip warmup when the registry is already initialized', async () => {
            fsMocks.readdirSync.mockReturnValue([])
            fsMocks.readdir.mockResolvedValue([])
            const { warmupMonacoThemeCache, getAllMonacoThemes } = await loadRegistry()

            getAllMonacoThemes()
            await warmupMonacoThemeCache()
            expect(fsMocks.readdir).not.toHaveBeenCalled()
        })

        it('should be idempotent when called twice', async () => {
            fsMocks.readdir.mockResolvedValue([])
            const { warmupMonacoThemeCache } = await loadRegistry()

            await warmupMonacoThemeCache()
            await warmupMonacoThemeCache()
            expect(fsMocks.readdir).toHaveBeenCalledTimes(1)
        })
    })
})
