/**
 * 主题配置管理模块
 * 用于管理应用的主题设置
 * 使用新的主题管理器（theme-manager.ts）来优化性能
 */

// @ts-ignore
import Store from 'electron-store'
import * as path from 'path'
import * as fs from 'fs'

// 主题类型
export type ThemeType = 'baize' | 'warm' | 'light' | 'lavender' | 'coral' | 'mint' | 'sunset' | 'rose' | 'dark' | 'deepdark' | 'icon' | 'ocean' | 'forest' | 'eyecare-green' | 'eyecare-beige' | 'eyecare-blue' | 'eyecare-pink' | 'eyecare-amber' | 'eyecare-teal' | 'eyecare-lilac'

// 主题配置接口
export interface ThemeConfig {
    currentTheme: ThemeType
}

// 主题样式定义
export interface ThemeStyles {
    id: string
    name: string
    description: string
    backgroundColor: string
    cardBackground: string
    textColor: string
    secondaryTextColor: string
    borderColor: string
    accentColor: string
    buttonBackground: string
    buttonTextColor: string
    hoverBackground: string
    titleBarGradient: string
}

// 主题缓存 - 避免重复读取文件
const themeCache = new Map<ThemeType, ThemeStyles>()

// 主题目录路径
let THEME_DIR_PATH: string = ''

// 创建存储实例
// @ts-ignore
const store = new Store()

// 初始化默认配置
// @ts-ignore
if (!store.has('themeConfig')) {
    // @ts-ignore
    store.set('themeConfig', {
        currentTheme: 'baize'
    })
}

/**
 * 初始化主题管理器
 * 在应用启动时调用一次，预加载所有主题到缓存
 */
export function initializeThemeManager(): void {
    // 设置主题目录路径
    // 在开发环境和生产环境中，路径可能不同，需要动态判断
    // 如果在开发环境中，__dirname 指向 out/main/
    // 如果在生产环境中，__dirname 指向 app.asar 或解压后的目录
    // 我们需要向上查找 resources 目录

    // 尝试多个可能的路径
    const possiblePaths = [
        path.join(__dirname, '../../../resources/themes'),  // 开发环境
        path.join(__dirname, '../../resources/themes'),     // 生产环境（未打包）
        path.join(process.resourcesPath, 'themes'),         // Electron resources
        path.join(path.dirname(process.execPath), 'resources/themes')  // 独立可执行文件
    ]

    // 找到第一个存在的路径
    for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
            THEME_DIR_PATH = testPath
            break
        }
    }

    // 如果还是找不到，尝试使用相对路径
    if (!THEME_DIR_PATH) {
        THEME_DIR_PATH = path.join(__dirname, '../../../resources/theme')
    }

    // 预加载所有主题到缓存
    preloadAllThemes()

    console.log('Theme manager initialized, theme directory:', THEME_DIR_PATH)
    console.log('Preloaded themes:', Array.from(themeCache.keys()))
}

/**
 * 预加载所有主题到缓存
 * 这个函数在应用启动时调用一次，避免后续加载窗口时的文件读取
 */
function preloadAllThemes(): void {
    try {
        const themeFiles = fs.readdirSync(THEME_DIR_PATH)

        themeFiles.forEach(file => {
            if (file.endsWith('.json')) {
                const themeId = file.replace('.json', '') as ThemeType
                loadThemeToCache(themeId)
            }
        })
    } catch (error) {
        console.error('Failed to preload themes:', error)
    }
}

/**
 * 加载主题到缓存
 */
function loadThemeToCache(themeId: ThemeType): ThemeStyles | undefined {
    if (themeCache.has(themeId)) {
        return themeCache.get(themeId)
    }

    try {
        const themeFilePath = path.join(THEME_DIR_PATH, `${themeId}.json`)
        const themeData = JSON.parse(fs.readFileSync(themeFilePath, 'utf-8')) as ThemeStyles

        // 验证主题数据
        if (!validateThemeData(themeData)) {
            console.error(`Invalid theme data for ${themeId}`)
            return undefined
        }

        themeCache.set(themeId, themeData)
        return themeData
    } catch (error) {
        console.error(`Failed to load theme ${themeId}:`, error)
        return undefined
    }
}

/**
 * 验证主题数据
 */
function validateThemeData(theme: any): theme is ThemeStyles {
    const requiredFields = [
        'id', 'name', 'description', 'backgroundColor', 'cardBackground',
        'textColor', 'secondaryTextColor', 'borderColor', 'accentColor',
        'buttonBackground', 'buttonTextColor', 'hoverBackground', 'titleBarGradient'
    ]

    return requiredFields.every(field => field in theme)
}

/**
 * 获取当前主题
 */
export function getCurrentTheme(): ThemeType {
    // @ts-ignore
    const config = store.get('themeConfig') as ThemeConfig
    return config.currentTheme
}

/**
 * 获取当前主题样式
 * 从缓存中读取，避免文件I/O操作
 */
export function getCurrentThemeStyles(): ThemeStyles {
    const themeType = getCurrentTheme()

    // 从缓存中获取
    let themeStyles = themeCache.get(themeType)

    // 如果缓存中没有，尝试加载
    if (!themeStyles) {
        themeStyles = loadThemeToCache(themeType)
    }

    // 如果还是没有，返回默认主题
    if (!themeStyles) {
        console.warn(`Theme ${themeType} not found, using default theme`)
        themeStyles = themeCache.get('baize')!
    }

    return themeStyles!
}

/**
 * 获取指定主题样式
 * 从缓存中读取
 */
export function getThemeStyles(themeType: ThemeType): ThemeStyles | undefined {
    // 从缓存中获取
    let themeStyles = themeCache.get(themeType)

    // 如果缓存中没有，尝试加载
    if (!themeStyles) {
        themeStyles = loadThemeToCache(themeType)
    }

    return themeStyles
}

/**
 * 设置主题
 */
export function setTheme(theme: ThemeType): void {
    // @ts-ignore
    store.set('themeConfig', { currentTheme: theme })
}

/**
 * 获取所有主题列表
 * 从缓存中读取，避免文件I/O操作
 */
export function getAllThemes(): { type: ThemeType; styles: ThemeStyles }[] {
    return Array.from(themeCache.entries()).map(([type, styles]) => ({
        type: type as ThemeType,
        styles
    }))
}

/**
 * 重置为默认主题
 */
export function resetToDefaultTheme(): void {
    setTheme('baize')
}

/**
 * 获取主题缓存统计信息
 */
export function getThemeCacheStats(): { count: number; themes: ThemeType[] } {
    return {
        count: themeCache.size,
        themes: Array.from(themeCache.keys())
    }
}

/**
 * 重新加载主题（用于开发调试）
 */
export function reloadTheme(themeType: ThemeType): boolean {
    // 从缓存中移除
    themeCache.delete(themeType)

    // 重新加载
    const themeStyles = loadThemeToCache(themeType)

    return themeStyles !== null
}

/**
 * 清空主题缓存
 */
export function clearThemeCache(): void {
    themeCache.clear()
}
