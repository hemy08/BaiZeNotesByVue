/**
 * Monaco 编辑器主题注册表
 * 启动时从 resources/themes/monaco-themes/ 目录扫描所有主题 JSON 文件
 * 读取文件名和主题内容，提取颜色信息用于主题卡片显示
 */
import { join } from 'path'
import * as fs from 'node:fs'
import { is } from '@electron-toolkit/utils'

// 获取 resources 目录路径
function getResourcesPath(): string {
    if (is.dev) {
        return join(__dirname, '../../resources')
    }
    return process.resourcesPath
}

// Monaco 主题配置接口
export interface MonacoThemeConfig {
    name: string
    description: string
    isDark: boolean
    backgroundColor?: string
    foregroundColor?: string
    cardBackground?: string
    borderColor?: string
}

// 内置主题配置（vs, vs-dark, hc-black 不在文件系统中）
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

// 所有主题名称列表（内置 + 文件系统扫描）
let allThemeNames: string[] = []

// 主题配置缓存（内置 + 从 JSON 提取的颜色信息）
let allThemeConfigs: Record<string, MonacoThemeConfig> = { ...builtinThemes }

// 主题数据缓存
const themeDataCache: Record<string, any> = {}

// 是否已初始化
let initialized = false

/**
 * 从主题 JSON 数据中提取 MonacoThemeConfig
 */
function extractThemeConfig(themeName: string, themeData: any): MonacoThemeConfig {
    const colors = themeData.colors || {}
    const base = themeData.base || 'vs'
    const isDark = base === 'vs-dark' || base === 'hc-black'

    const bgColor = colors['editor.background'] || (isDark ? '#1E1E1E' : '#FFFFFF')
    const fgColor = colors['editor.foreground'] || (isDark ? '#D4D4D4' : '#000000')

    // 计算 cardBackground 和 borderColor
    let cardBg: string
    let borderClr: string
    if (isDark) {
        // 深色主题：背景稍亮，边框更亮
        cardBg = colors['editorWidget.background'] || colors['editor.lineHighlightBackground'] || lightenColor(bgColor, 15)
        borderClr = colors['editorWidget.border'] || lightenColor(bgColor, 30)
    } else {
        // 浅色主题：背景稍暗，边框更暗
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

/**
 * 简单的颜色变亮函数
 */
function lightenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, ((num >> 16) & 0xFF) + amount)
    const g = Math.min(255, ((num >> 8) & 0xFF) + amount)
    const b = Math.min(255, (num & 0xFF) + amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/**
 * 简单的颜色变暗函数
 */
function darkenColor(hex: string, amount: number): string {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, ((num >> 16) & 0xFF) - amount)
    const g = Math.max(0, ((num >> 8) & 0xFF) - amount)
    const b = Math.max(0, (num & 0xFF) - amount)
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')
}

/**
 * 初始化主题注册表
 * 扫描 resources/themes/monaco-themes/ 目录，读取所有主题文件
 */
function initializeRegistry(): void {
    if (initialized) return

    try {
        const resourcesPath = getResourcesPath()
        const themesDir = join(resourcesPath, 'themes', 'monaco-themes', 'themes')

        // 读取目录中所有 .json 文件
        const files = fs.readdirSync(themesDir)
            .filter(f => f.endsWith('.json') && f !== 'themelist.json')

        for (const file of files) {
            // 文件名去掉 .json 后缀就是主题名
            const themeName = file.replace(/\.json$/, '')

            try {
                const filePath = join(themesDir, file)
                const content = fs.readFileSync(filePath, 'utf-8')
                const themeData = JSON.parse(content)

                // 缓存主题数据
                themeDataCache[themeName] = themeData

                // 提取颜色配置
                allThemeConfigs[themeName] = extractThemeConfig(themeName, themeData)
            } catch (err) {
                console.error("", err)
            }
        }

        // 构建主题名称列表：内置主题在前，文件主题按名称排序
        allThemeNames = [
            ...Object.keys(builtinThemes),
            ...files.map(f => f.replace(/\.json$/, '')).sort((a, b) => a.localeCompare(b))
        ]

        initialized = true
        console.log()
    } catch (error) {
        console.error('[Main] Failed to initialize monaco theme registry', error)
        // 降级：只使用内置主题
        allThemeNames = Object.keys(builtinThemes)
        initialized = true
    }
}

/**
 * 获取所有 Monaco 主题（名称 + 配置）
 */
export function getAllMonacoThemes(): { type: string; config: MonacoThemeConfig }[] {
    initializeRegistry()
    return allThemeNames.map(type => ({
        type,
        config: allThemeConfigs[type]
    })).filter(item => item.config !== undefined)
}

/**
 * 从缓存获取 Monaco 主题 JSON 数据
 */
export function getMonacoThemeData(themeName: string): any | null {
    initializeRegistry()
    return themeDataCache[themeName] || null
}
