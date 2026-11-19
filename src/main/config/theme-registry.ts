/**
 * Monaco 编辑器主题注册表
 * P-5（PF-15）：主题 JSON 按需读取——全量列表首次访问时构建并缓存，
 * 单个主题数据（getMonacoThemeData）仅在首次访问该主题时异步读取对应 JSON
 */
import { join } from 'path'
import * as fs from 'node:fs'
// 第 4 批 P3 清理：资源目录解析统一收敛到 app-paths.getAppResourcesPath()
//（判据由 electron-toolkit 的 is.dev 改为 app.isPackaged，二者在 Electron 运行时等价：
//  is.dev 的定义就是 !app.isPackaged；开发环境=项目根目录 resources，打包后=process.resourcesPath）
import { getAppResourcesPath } from '../utils/app-paths'
import { logger } from '../utils/logger'
// 第 2 批契约重构：Monaco 主题领域类型已收敛到 src/shared/types/theme.ts（唯一真源），
// 此处 import type 并 re-export，保持既有 `import type { MonacoThemeConfig, MonacoThemeData }
// from './theme-registry'` / `from '../config'` 的引用路径不变。
import type { MonacoThemeConfig, MonacoThemeData, MonacoThemeListItem } from '../../shared/types'

export type { MonacoThemeConfig, MonacoThemeData }

const builtinThemes: Record<string, MonacoThemeConfig> = {
    vs: {
        name: 'Visual Studio Light',
        nameKey: 'themeNames.monaco.vs.name',
        description: 'Visual Studio 浅色主题',
        descKey: 'themeNames.monaco.vs.description',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#000000',
        cardBackground: '#FFFFFF',
        borderColor: '#D3D3D3'
    },
    'vs-dark': {
        name: 'Visual Studio Dark',
        nameKey: 'themeNames.monaco.vs-dark.name',
        description: 'Visual Studio 深色主题',
        descKey: 'themeNames.monaco.vs-dark.description',
        isDark: true,
        backgroundColor: '#1E1E1E',
        foregroundColor: '#D4D4D4',
        cardBackground: '#2D2D2D',
        borderColor: '#404040'
    },
    'hc-black': {
        name: 'High Contrast',
        nameKey: 'themeNames.monaco.hc-black.name',
        description: '高对比度主题',
        descKey: 'themeNames.monaco.hc-black.description',
        isDark: true,
        backgroundColor: '#000000',
        foregroundColor: '#FFFFFF',
        cardBackground: '#000000',
        borderColor: '#FFFFFF'
    }
}

let allThemeNames: string[] = []
const allThemeConfigs: Record<string, MonacoThemeConfig> = { ...builtinThemes }
const themeDataCache: Record<string, MonacoThemeData> = {}
// P-5（PF-15）：主题目录文件名清单缓存（首次扫描后复用，避免重复 readdirSync）
let themeFileNames: string[] | null = null
// 全量主题列表是否已构建（已有缓存则保持）
let allThemesLoaded = false

function getThemesDir(): string {
    // 打包后 themes 由 extraResources 复制到 process.resourcesPath/themes，
    // 开发环境为项目根目录 resources/themes（app-paths 统一解析，见 electron-builder.yml）
    const resourcesPath = getAppResourcesPath()
    return join(resourcesPath, 'themes', 'monaco-themes', 'themes')
}

/** 扫描主题目录中的 JSON 文件名（结果缓存） */
function scanThemeFiles(): string[] {
    if (themeFileNames === null) {
        try {
            themeFileNames = fs
                .readdirSync(getThemesDir())
                .filter((f) => f.endsWith('.json') && f !== 'themelist.json')
        } catch (error) {
            logger.error('[Main] Failed to scan monaco theme directory', error)
            themeFileNames = []
        }
    }
    return themeFileNames
}

/** 同步读取并解析单个主题 JSON（供全量列表构建使用，结果缓存） */
function loadThemeDataSync(themeName: string): MonacoThemeData | null {
    if (themeDataCache[themeName]) {
        return themeDataCache[themeName]
    }
    try {
        const filePath = join(getThemesDir(), `${themeName}.json`)
        const content = fs.readFileSync(filePath, 'utf-8')
        const themeData = JSON.parse(content) as MonacoThemeData
        themeDataCache[themeName] = themeData
        return themeData
    } catch (err) {
        logger.error(`[Main] Failed to load monaco theme "${themeName}"`, err)
        return null
    }
}

function extractThemeConfig(themeName: string, themeData: MonacoThemeData): MonacoThemeConfig {
    const colors = themeData.colors || {}
    const base = themeData.base || 'vs'
    const isDark = base === 'vs-dark' || base === 'hc-black'

    const bgColor = colors['editor.background'] || (isDark ? '#1E1E1E' : '#FFFFFF')
    const fgColor = colors['editor.foreground'] || (isDark ? '#D4D4D4' : '#000000')

    let cardBg: string
    let borderClr: string
    if (isDark) {
        cardBg =
            colors['editorWidget.background'] ||
            colors['editor.lineHighlightBackground'] ||
            lightenColor(bgColor, 15)
        borderClr = colors['editorWidget.border'] || lightenColor(bgColor, 30)
    } else {
        cardBg = colors['editorWidget.background'] || darkenColor(bgColor, 3)
        borderClr = colors['editorWidget.border'] || darkenColor(bgColor, 12)
    }

    return {
        name: themeName,
        description: themeName + ' 主题',
        // CMP-30：磁盘动态主题名称不翻译（文件名即主题名），描述用「{name} 主题/theme」词典模板
        descKey: 'themeNames.monaco.dynamicDescription',
        isDark,
        backgroundColor: bgColor,
        foregroundColor: fgColor,
        cardBackground: cardBg,
        borderColor: borderClr
    }
}

function lightenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, ((num >> 16) & 0xff) + amount)
    const g = Math.min(255, ((num >> 8) & 0xff) + amount)
    const b = Math.min(255, (num & 0xff) + amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, ((num >> 16) & 0xff) - amount)
    const g = Math.max(0, ((num >> 8) & 0xff) - amount)
    const b = Math.max(0, (num & 0xff) - amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function initializeRegistry(): void {
    if (allThemesLoaded) return

    try {
        const files = scanThemeFiles()

        for (const file of files) {
            const themeName = file.replace(/\.json$/, '')

            const themeData = loadThemeDataSync(themeName)
            if (themeData) {
                allThemeConfigs[themeName] = extractThemeConfig(themeName, themeData)
            }
        }

        allThemeNames = [
            ...Object.keys(builtinThemes),
            ...files.map((f) => f.replace(/\.json$/, '')).sort((a, b) => a.localeCompare(b))
        ]

        allThemesLoaded = true
    } catch (error) {
        logger.error('[Main] Failed to initialize monaco theme registry', error)
        allThemeNames = Object.keys(builtinThemes)
        allThemesLoaded = true
    }
}

/**
 * 2026-11-18（遗留清单 #12）：窗口就绪后异步预热 Monaco 主题缓存。
 * 注意：调用点在 ready-to-show（main/index.ts），**不是**空闲调度（无 setTimeout/
 * requestIdleCallback），仅以异步 IO 并行于其他启动任务；2026-11-19 修正表述。
 *
 * 首次 getAllMonacoThemes 会在主线程同步 readdir/readFile 全量主题 JSON（冷启动 IO 阻塞）；
 * 本函数在窗口就绪后以异步 IO 填充「文件名清单 + 主题数据缓存」，使首次真实调用只做内存构建。
 * 预热失败时保持惰性加载（themeFileNames 仍为 null，后续走原同步路径并记录错误）。
 */
export async function warmupMonacoThemeCache(): Promise<void> {
    if (allThemesLoaded || themeFileNames !== null) {
        return
    }
    const dir = getThemesDir()
    try {
        const entries = await fs.promises.readdir(dir)
        const files = entries.filter((f) => f.endsWith('.json') && f !== 'themelist.json')
        await Promise.all(
            files.map(async (file) => {
                const themeName = file.replace(/\.json$/, '')
                if (themeDataCache[themeName]) {
                    return
                }
                try {
                    const content = await fs.promises.readFile(join(dir, file), 'utf-8')
                    themeDataCache[themeName] = JSON.parse(content) as MonacoThemeData
                } catch (error) {
                    // 单个主题失败不影响其余；后续同步路径仍会重试并记录错误
                    logger.warn(
                        `[Main] 预热 Monaco 主题 "${themeName}" 失败（保持惰性加载）`,
                        error
                    )
                }
            })
        )
        // 仅在未与同步初始化竞争时落文件名缓存（同步初始化已优先完成则保持其结果）
        if (!allThemesLoaded && themeFileNames === null) {
            themeFileNames = files
        }
    } catch (error) {
        // 目录不可读：保持 null，让首次同步调用按原路径处理并记录错误
        logger.warn('[Main] 预热 Monaco 主题缓存失败（保持惰性加载）:', error)
    }
}

/**
 * 全部 Monaco 主题列表（内置 3 套 + 磁盘动态主题）：
 * `{ type, config }` 即 shared `MonacoThemeListItem`（IPC.THEME.GET_ALL_MONACO_THEMES 返回项）。
 */
export function getAllMonacoThemes(): MonacoThemeListItem[] {
    initializeRegistry()
    return allThemeNames
        .map((type) => ({
            type,
            config: allThemeConfigs[type]
        }))
        .filter((item) => item.config !== undefined)
}

export async function getMonacoThemeData(themeName: string): Promise<MonacoThemeData | null> {
    // 内置主题没有对应 JSON 文件
    if (!themeName || builtinThemes[themeName]) {
        return null
    }
    // 拒绝含路径分隔符/上级目录的主题名与清单文件，防路径逃逸
    if (
        themeName.includes('/') ||
        themeName.includes('\\') ||
        themeName.includes('..') ||
        themeName === 'themelist'
    ) {
        return null
    }
    // P-5（PF-15）：命中缓存直接返回；未命中才按需读取该主题对应的 JSON，
    // 不再为单个主题触发 55 个文件的读取
    if (themeDataCache[themeName]) {
        return themeDataCache[themeName]
    }

    const filePath = join(getThemesDir(), `${themeName}.json`)
    try {
        const content = await fs.promises.readFile(filePath, 'utf-8')
        const themeData = JSON.parse(content) as MonacoThemeData
        themeDataCache[themeName] = themeData
        return themeData
    } catch (err) {
        logger.error(`[Main] Failed to load monaco theme "${themeName}"`, err)
        return null
    }
}
