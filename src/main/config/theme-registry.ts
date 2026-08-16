/**
 * Monaco 编辑器主题注册表
 * 启动时从 resources/themes/monaco-themes/ 目录扫描所有主题 JSON 文件
 */
import { join } from 'path'
import * as fs from 'node:fs'
import { is } from '@electron-toolkit/utils'

function getResourcesPath(): string {
    if (is.dev) {
        return join(__dirname, '../../resources')
    }
    return process.resourcesPath
}

export interface MonacoThemeConfig {
    name: string
    description: string
    isDark: boolean
    backgroundColor?: string
    foregroundColor?: string
    cardBackground?: string
    borderColor?: string
}

export interface MonacoThemeData {
    base: string
    inherit?: boolean
    rules?: Array<{ token: string; foreground?: string; background?: string; fontStyle?: string }>
    colors?: Record<string, string>
    encodedTokensColors?: string[]
}

const builtinThemes: Record<string, MonacoThemeConfig> = {
    'vs': {
        name: 'Visual Studio Light',
        description: 'Visual Studio 浅色主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#000000',
        cardBackground: '#FFFFFF',
        borderColor: '#D3D3D3'
    },
    'vs-dark': {
        name: 'Visual Studio Dark',
        description: 'Visual Studio 深色主题',
        isDark: true,
        backgroundColor: '#1E1E1E',
        foregroundColor: '#D4D4D4',
        cardBackground: '#2D2D2D',
        borderColor: '#404040'
    },
    'hc-black': {
        name: 'High Contrast',
        description: '高对比度主题',
        isDark: true,
        backgroundColor: '#000000',
        foregroundColor: '#FFFFFF',
        cardBackground: '#000000',
        borderColor: '#FFFFFF'
    }
}

let allThemeNames: string[] = []
let allThemeConfigs: Record<string, MonacoThemeConfig> = { ...builtinThemes }
const themeDataCache: Record<string, MonacoThemeData> = {}
let initialized = false

function extractThemeConfig(themeName: string, themeData: MonacoThemeData): MonacoThemeConfig {
    const colors = themeData.colors || {}
    const base = themeData.base || 'vs'
    const isDark = base === 'vs-dark' || base === 'hc-black'

    const bgColor = colors['editor.background'] || (isDark ? '#1E1E1E' : '#FFFFFF')
    const fgColor = colors['editor.foreground'] || (isDark ? '#D4D4D4' : '#000000')

    let cardBg: string
    let borderClr: string
    if (isDark) {
        cardBg = colors['editorWidget.background'] || colors['editor.lineHighlightBackground'] || lightenColor(bgColor, 15)
        borderClr = colors['editorWidget.border'] || lightenColor(bgColor, 30)
    } else {
        cardBg = colors['editorWidget.background'] || darkenColor(bgColor, 3)
        borderClr = colors['editorWidget.border'] || darkenColor(bgColor, 12)
    }

    return {
        name: themeName,
        description: themeName + ' 主题',
        isDark,
        backgroundColor: bgColor,
        foregroundColor: fgColor,
        cardBackground: cardBg,
        borderColor: borderClr
    }
}

function lightenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, ((num >> 16) & 0xFF) + amount)
    const g = Math.min(255, ((num >> 8) & 0xFF) + amount)
    const b = Math.min(255, (num & 0xFF) + amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, ((num >> 16) & 0xFF) - amount)
    const g = Math.max(0, ((num >> 8) & 0xFF) - amount)
    const b = Math.max(0, (num & 0xFF) - amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

function initializeRegistry(): void {
    if (initialized) return

    try {
        const resourcesPath = getResourcesPath()
        const themesDir = join(resourcesPath, 'themes', 'monaco-themes', 'themes')

        const files = fs.readdirSync(themesDir)
            .filter(f => f.endsWith('.json') && f !== 'themelist.json')

        for (const file of files) {
            const themeName = file.replace(/\.json$/, '')

            try {
                const filePath = join(themesDir, file)
                const content = fs.readFileSync(filePath, 'utf-8')
                const themeData = JSON.parse(content)

                themeDataCache[themeName] = themeData
                allThemeConfigs[themeName] = extractThemeConfig(themeName, themeData)
            } catch (err) {
                console.error("", err)
            }
        }

        allThemeNames = [
            ...Object.keys(builtinThemes),
            ...files.map(f => f.replace(/\.json$/, '')).sort((a, b) => a.localeCompare(b))
        ]

        initialized = true
    } catch (error) {
        console.error('[Main] Failed to initialize monaco theme registry', error)
        allThemeNames = Object.keys(builtinThemes)
        initialized = true
    }
}

export function getAllMonacoThemes(): { type: string; config: MonacoThemeConfig }[] {
    initializeRegistry()
    return allThemeNames.map(type => ({
        type,
        config: allThemeConfigs[type]
    })).filter(item => item.config !== undefined)
}

export function getMonacoThemeData(themeName: string): MonacoThemeData | null {
    initializeRegistry()
    return themeDataCache[themeName] || null
}