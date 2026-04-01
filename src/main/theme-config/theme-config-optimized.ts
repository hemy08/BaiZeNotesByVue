/**
 * 主题配置管理模块 - 优化版本
 * 用于管理应用的主题设置
 * 
 * 优化策略：
 * 1. 主题配置硬编码在内存中，避免文件I/O操作
 * 2. 使用CSS变量系统，支持动态主题切换
 * 3. 预生成主题CSS文件，提升性能
 */

// @ts-ignore
import Store from 'electron-store'
import * as path from 'path'
// @ts-ignore
import { generateAllThemeCSS } from './theme-css-generator'

// 主题类型
export type ThemeType = 'baize' | 'warm' | 'light' | 'lavender' | 'coral' | 'mint' | 'sunset' | 'rose' | 'dark' | 'deepdark' | 'icon' | 'ocean' | 'forest' | 'eyecare-green' | 'eyecare-beige' | 'eyecare-blue' | 'eyecare-pink' | 'eyecare-amber' | 'eyecare-teal' | 'eyecare-lilac'

// 主题配置接口
export interface ThemeConfig {
    currentTheme: ThemeType
}

// 主题样式接口
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

// 主题配置 - 硬编码在内存中，避免文件I/O操作
const THEMES: Record<ThemeType, ThemeStyles> = {
    baize: {
        id: 'baize',
        name: '白泽主题',
        description: '默认主题，清新简洁',
        backgroundColor: '#ffffff',
        cardBackground: '#f5f5f5',
        textColor: '#333333',
        secondaryTextColor: '#666666',
        borderColor: '#e0e0e0',
        accentColor: '#00b0ff',
        buttonBackground: '#00b0ff',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e3f2fd',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    },
    warm: {
        id: 'warm',
        name: '暖阳主题',
        description: '温暖的橙色调，给人舒适感',
        backgroundColor: '#fff8f0',
        cardBackground: '#ffeedd',
        textColor: '#4a3f35',
        secondaryTextColor: '#7a6f65',
        borderColor: '#ffdcb0',
        accentColor: '#ff9800',
        buttonBackground: '#ff9800',
        buttonTextColor: '#ffffff',
        hoverBackground: '#fff3e0',
        titleBarGradient: 'linear-gradient(135deg, #f6d365 0%, #fda085 100%)'
    },
    light: {
        id: 'light',
        name: '明亮主题',
        description: '简洁明亮，适合日常使用',
        backgroundColor: '#fafafa',
        cardBackground: '#ffffff',
        textColor: '#212121',
        secondaryTextColor: '#757575',
        borderColor: '#e0e0e0',
        accentColor: '#2196f3',
        buttonBackground: '#2196f3',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e3f2fd',
        titleBarGradient: 'linear-gradient(135deg, #e0e0e0 0%, #f5f5f5 100%)'
    },
    lavender: {
        id: 'lavender',
        name: '薰衣草梦',
        description: '浪漫的薰衣草紫，梦幻温柔',
        backgroundColor: '#f8f4ff',
        cardBackground: '#f0e8ff',
        textColor: '#4a3f5c',
        secondaryTextColor: '#7a6f8c',
        borderColor: '#d8c8f0',
        accentColor: '#9c27b0',
        buttonBackground: '#9c27b0',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f3e5f5',
        titleBarGradient: 'linear-gradient(135deg, #e1bee7 0%, #ce93d8 100%)'
    },
    coral: {
        id: 'coral',
        name: '珊瑚暖阳',
        description: '活力的珊瑚色，温暖明亮',
        backgroundColor: '#fff5f0',
        cardBackground: '#ffe8e0',
        textColor: '#5c3f3a',
        secondaryTextColor: '#8c6f6a',
        borderColor: '#ffd0c0',
        accentColor: '#ff7043',
        buttonBackground: '#ff7043',
        buttonTextColor: '#ffffff',
        hoverBackground: '#ffebe0',
        titleBarGradient: 'linear-gradient(135deg, #ffccbc 0%, #ffab91 100%)'
    },
    mint: {
        id: 'mint',
        name: '薄荷清风',
        description: '清新的薄荷绿，清爽怡人',
        backgroundColor: '#f0fff8',
        cardBackground: '#e0ffe8',
        textColor: '#2f5f4a',
        secondaryTextColor: '#5f8f7a',
        borderColor: '#c0e8d0',
        accentColor: '#00c853',
        buttonBackground: '#00c853',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e8f5e9',
        titleBarGradient: 'linear-gradient(135deg, #b9f6ca 0%, #69f0ae 100%)'
    },
    sunset: {
        id: 'sunset',
        name: '日落余晖',
        description: '温暖的日落色调，宁静祥和',
        backgroundColor: '#fff8f0',
        cardBackground: '#ffe8d8',
        textColor: '#5c4a3a',
        secondaryTextColor: '#8c7a6a',
        borderColor: '#ffd8b8',
        accentColor: '#ff9800',
        buttonBackground: '#ff9800',
        buttonTextColor: '#ffffff',
        hoverBackground: '#fff3e0',
        titleBarGradient: 'linear-gradient(135deg, #ffcc80 0%, #ff9800 100%)'
    },
    rose: {
        id: 'rose',
        name: '玫瑰晨曦',
        description: '优雅的玫瑰红，温馨浪漫',
        backgroundColor: '#fff0f5',
        cardBackground: '#ffe0e8',
        textColor: '#5c3a4a',
        secondaryTextColor: '#8c6a7a',
        borderColor: '#ffd0e0',
        accentColor: '#e91e63',
        buttonBackground: '#e91e63',
        buttonTextColor: '#ffffff',
        hoverBackground: '#fce4ec',
        titleBarGradient: 'linear-gradient(135deg, #f8bbd0 0%, #f48fb1 100%)'
    },
    dark: {
        id: 'dark',
        name: '深邃夜空',
        description: '深色主题，护眼舒适',
        backgroundColor: '#1e1e1e',
        cardBackground: '#2d2d2d',
        textColor: '#e0e0e0',
        secondaryTextColor: '#b0b0b0',
        borderColor: '#404040',
        accentColor: '#64b5f6',
        buttonBackground: '#64b5f6',
        buttonTextColor: '#1e1e1e',
        hoverBackground: '#3d3d3d',
        titleBarGradient: 'linear-gradient(135deg, #2c3e50 0%, #34495e 100%)'
    },
    deepdark: {
        id: 'deepdark',
        name: '深空黑曜',
        description: '极深色主题，极致护眼',
        backgroundColor: '#121212',
        cardBackground: '#1e1e1e',
        textColor: '#e0e0e0',
        secondaryTextColor: '#a0a0a0',
        borderColor: '#333333',
        accentColor: '#90caf9',
        buttonBackground: '#90caf9',
        buttonTextColor: '#121212',
        hoverBackground: '#2d2d2d',
        titleBarGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)'
    },
    icon: {
        id: 'icon',
        name: '科技蓝',
        description: '现代科技感蓝色主题',
        backgroundColor: '#f5f9ff',
        cardBackground: '#e8f2ff',
        textColor: '#1a3a5c',
        secondaryTextColor: '#4a6a8c',
        borderColor: '#b8d4ff',
        accentColor: '#2196f3',
        buttonBackground: '#2196f3',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e3f2fd',
        titleBarGradient: 'linear-gradient(135deg, #64b5f6 0%, #42a5f5 100%)'
    },
    ocean: {
        id: 'ocean',
        name: '海洋之心',
        description: '深邃的海洋蓝，宁静深远',
        backgroundColor: '#f0f8ff',
        cardBackground: '#e0f0ff',
        textColor: '#1a3a5c',
        secondaryTextColor: '#4a6a8c',
        borderColor: '#b8d4f0',
        accentColor: '#0288d1',
        buttonBackground: '#0288d1',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e1f5fe',
        titleBarGradient: 'linear-gradient(135deg, #4fc3f7 0%, #039be5 100%)'
    },
    forest: {
        id: 'forest',
        name: '森林绿意',
        description: '自然的森林绿，清新自然',
        backgroundColor: '#f0fff8',
        cardBackground: '#e0ffe8',
        textColor: '#2f5f4a',
        secondaryTextColor: '#5f8f7a',
        borderColor: '#c0e8d0',
        accentColor: '#43a047',
        buttonBackground: '#43a047',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e8f5e9',
        titleBarGradient: 'linear-gradient(135deg, #81c784 0%, #66bb6a 100%)'
    },
    'eyecare-green': {
        id: 'eyecare-green',
        name: '护眼绿',
        description: '经典的护眼绿色，减轻眼部疲劳',
        backgroundColor: '#c7edcc',
        cardBackground: '#d7f5dc',
        textColor: '#1a3a2a',
        secondaryTextColor: '#4a6a5a',
        borderColor: '#a8e0b0',
        accentColor: '#4caf50',
        buttonBackground: '#4caf50',
        buttonTextColor: '#ffffff',
        hoverBackground: '#c8e6c9',
        titleBarGradient: 'linear-gradient(135deg, #a5d6a7 0%, #81c784 100%)'
    },
    'eyecare-beige': {
        id: 'eyecare-beige',
        name: '护眼米',
        description: '温和的米色调，舒适护眼',
        backgroundColor: '#f5f5dc',
        cardBackground: '#faf8f0',
        textColor: '#4a4a3a',
        secondaryTextColor: '#7a7a6a',
        borderColor: '#e8e8d8',
        accentColor: '#8d6e63',
        buttonBackground: '#8d6e63',
        buttonTextColor: '#ffffff',
        hoverBackground: '#efebe9',
        titleBarGradient: 'linear-gradient(135deg, #d7ccc8 0%, #bcaaa4 100%)'
    },
    'eyecare-blue': {
        id: 'eyecare-blue',
        name: '护眼蓝',
        description: '柔和的蓝色调，缓解眼部疲劳',
        backgroundColor: '#e3f2fd',
        cardBackground: '#e8f5fe',
        textColor: '#1a3a5c',
        secondaryTextColor: '#4a6a8c',
        borderColor: '#bbdefb',
        accentColor: '#2196f3',
        buttonBackground: '#2196f3',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e1f5fe',
        titleBarGradient: 'linear-gradient(135deg, #90caf9 0%, #64b5f6 100%)'
    },
    'eyecare-pink': {
        id: 'eyecare-pink',
        name: '护眼粉',
        description: '温柔的粉色调，舒适怡人',
        backgroundColor: '#fce4ec',
        cardBackground: '#f8e8f0',
        textColor: '#4a2a3a',
        secondaryTextColor: '#7a5a6a',
        borderColor: '#f8bbd9',
        accentColor: '#e91e63',
        buttonBackground: '#e91e63',
        buttonTextColor: '#ffffff',
        hoverBackground: '#fce4ec',
        titleBarGradient: 'linear-gradient(135deg, #f48fb1 0%, #f06292 100%)'
    },
    'eyecare-amber': {
        id: 'eyecare-amber',
        name: '护眼琥珀',
        description: '温暖的琥珀色，柔和舒适',
        backgroundColor: '#fff8e1',
        cardBackground: '#fffde7',
        textColor: '#4a4a2a',
        secondaryTextColor: '#7a7a5a',
        borderColor: '#ffecb3',
        accentColor: '#ffc107',
        buttonBackground: '#ffc107',
        buttonTextColor: '#1a1a1a',
        hoverBackground: '#fff8e1',
        titleBarGradient: 'linear-gradient(135deg, #ffe082 0%, #ffd54f 100%)'
    },
    'eyecare-teal': {
        id: 'eyecare-teal',
        name: '护眼青',
        description: '清新的青色调，护眼舒适',
        backgroundColor: '#e0f2f1',
        cardBackground: '#e8f5f3',
        textColor: '#1a4a4a',
        secondaryTextColor: '#4a7a7a',
        borderColor: '#b2dfdb',
        accentColor: '#009688',
        buttonBackground: '#009688',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e0f2f1',
        titleBarGradient: 'linear-gradient(135deg, #80cbc4 0%, #4db6ac 100%)'
    },
    'eyecare-lilac': {
        id: 'eyecare-lilac',
        name: '护眼丁香',
        description: '淡雅的丁香紫护眼主题',
        backgroundColor: '#faf5fa',
        cardBackground: '#fdf8fd',
        textColor: '#3a2a40',
        secondaryTextColor: '#6a5a70',
        borderColor: '#e8d8e8',
        accentColor: '#9a70a0',
        buttonBackground: '#9a70a0',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5e8f5',
        titleBarGradient: 'linear-gradient(135deg, #d8bfd8 0%, #c8a8c8 100%)'
    }
}

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
 * 在应用启动时调用一次，生成主题CSS文件
 */
export function initializeThemeManager(): void {
    try {
        // 生成主题CSS文件
        const themes = Object.entries(THEMES).map(([type, styles]) => ({
            type,
            styles
        }))
        
        const outputDir = path.join(__dirname, '../../theme-css')
        generateAllThemeCSS(themes, outputDir)
        
        console.log('Theme manager initialized, generated CSS files at:', outputDir)
        console.log('Available themes:', Object.keys(THEMES))
    } catch (error) {
        console.error('Failed to initialize theme manager:', error)
    }
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
 * 直接从内存中获取，无需文件I/O操作
 */
export function getCurrentThemeStyles(): ThemeStyles {
    const themeType = getCurrentTheme()
    return THEMES[themeType]
}

/**
 * 获取指定主题样式
 * 直接从内存中获取，无需文件I/O操作
 */
export function getThemeStyles(themeType: ThemeType): ThemeStyles | undefined {
    return THEMES[themeType]
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
 * 直接从内存中获取，无需文件I/O操作
 */
export function getAllThemes(): { type: ThemeType; styles: ThemeStyles }[] {
    return Object.entries(THEMES).map(([type, styles]) => ({
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
 * 获取主题数量
 */
export function getThemeCount(): number {
    return Object.keys(THEMES).length
}
