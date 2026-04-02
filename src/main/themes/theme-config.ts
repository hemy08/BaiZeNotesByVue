/**
 * 主题配置管理模块
 * 用于管理应用的主题设置
 */

// @ts-ignore
import Store from 'electron-store'

// 主题类型
export type ThemeType = 'baize' | 'warm' | 'light' | 'lavender' | 'coral' | 'mint' | 'sunset' | 'rose' | 'dark' | 'deepdark' | 'icon' | 'ocean' | 'forest' | 'eyecare-green' | 'eyecare-beige' | 'eyecare-blue' | 'eyecare-pink' | 'eyecare-amber' | 'eyecare-teal' | 'eyecare-lilac'

// 主题配置接口
export interface ThemeConfig {
    currentTheme: ThemeType
}

// 主题样式定义
export interface ThemeStyles {
    name: string
    description: string
    titleBarGradient: string
    backgroundColor: string
    cardBackground: string
    textColor: string
    secondaryTextColor: string
    borderColor: string
    accentColor: string
    buttonBackground: string
    buttonTextColor: string
    hoverBackground: string
}

// 预定义主题
export const themes: Record<ThemeType, ThemeStyles> = {
    // ========== 浅色主题 ==========
    // 白泽紫主题（默认）
    baize: {
        name: '白泽紫韵',
        description: '优雅的紫色渐变主题',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundColor: '#f5f0ff',
        cardBackground: '#ffffff',
        textColor: '#2d2d2d',
        secondaryTextColor: '#666666',
        borderColor: '#e0d4f0',
        accentColor: '#764ba2',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f0e8ff'
    },
    // 暖白主题
    warm: {
        name: '暖白温馨',
        description: '温暖的米白色主题',
        titleBarGradient: 'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
        backgroundColor: '#faf8f5',
        cardBackground: '#ffffff',
        textColor: '#3d3d3d',
        secondaryTextColor: '#777777',
        borderColor: '#e8e0d8',
        accentColor: '#e07a5f',
        buttonBackground: '#e07a5f',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5f0eb'
    },
    // 浅色主题
    light: {
        name: '清新简约',
        description: '简洁明亮的浅色主题',
        titleBarGradient: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 50%, #90caf9 100%)',
        backgroundColor: '#ffffff',
        cardBackground: '#f5f5f5',
        textColor: '#212121',
        secondaryTextColor: '#757575',
        borderColor: '#e0e0e0',
        accentColor: '#1976d2',
        buttonBackground: '#1976d2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f0f0f0'
    },
    // 浅蓝浅紫渐变主题
    lavender: {
        name: '薰衣草梦',
        description: '浅蓝浅紫渐变护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #b8c5e8 0%, #d4b8e8 100%)',
        backgroundColor: '#f5f3fa',
        cardBackground: '#ffffff',
        textColor: '#3a3550',
        secondaryTextColor: '#6a6580',
        borderColor: '#ddd8ea',
        accentColor: '#8b7ec8',
        buttonBackground: '#8b7ec8',
        buttonTextColor: '#ffffff',
        hoverBackground: '#ebe8f5'
    },
    // 珊瑚主题
    coral: {
        name: '珊瑚暖阳',
        description: '温暖的珊瑚色主题',
        titleBarGradient: 'linear-gradient(135deg, #ffb8a3 0%, #ff9a8b 100%)',
        backgroundColor: '#fff5f2',
        cardBackground: '#ffffff',
        textColor: '#4a3530',
        secondaryTextColor: '#7a6555',
        borderColor: '#f5d8d0',
        accentColor: '#e07850',
        buttonBackground: '#e07850',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5e8e5'
    },
    // 薄荷主题
    mint: {
        name: '薄荷清风',
        description: '清新的薄荷绿主题',
        titleBarGradient: 'linear-gradient(135deg, #a8e6cf 0%, #7fcdbb 100%)',
        backgroundColor: '#f0faf5',
        cardBackground: '#ffffff',
        textColor: '#2a4a3a',
        secondaryTextColor: '#5a7a6a',
        borderColor: '#c8e8d8',
        accentColor: '#3cb371',
        buttonBackground: '#3cb371',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e0f5ea'
    },
    // 日落主题
    sunset: {
        name: '日落余晖',
        description: '温暖的橙红渐变主题',
        titleBarGradient: 'linear-gradient(135deg, #ffd89b 0%, #f9a86b 100%)',
        backgroundColor: '#fffbf5',
        cardBackground: '#ffffff',
        textColor: '#4a3a2a',
        secondaryTextColor: '#7a6a5a',
        borderColor: '#f0e0d0',
        accentColor: '#e08840',
        buttonBackground: '#e08840',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5f0e8'
    },
    // 玫瑰主题
    rose: {
        name: '玫瑰花园',
        description: '浪漫的玫瑰粉主题',
        titleBarGradient: 'linear-gradient(135deg, #f5b7b1 0%, #ec7063 100%)',
        backgroundColor: '#fdf5f5',
        cardBackground: '#ffffff',
        textColor: '#4a2a2a',
        secondaryTextColor: '#7a5a5a',
        borderColor: '#f0d8d8',
        accentColor: '#c05050',
        buttonBackground: '#c05050',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f8e8e8'
    },
    // ========== 深色主题 ==========
    // 深色主题
    dark: {
        name: '深邃夜空',
        description: '护眼深色主题',
        titleBarGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        backgroundColor: '#0f0f1a',
        cardBackground: '#1a1a2e',
        textColor: '#e0e0e0',
        secondaryTextColor: '#888888',
        borderColor: '#2a2a4a',
        accentColor: '#4fc3f7',
        buttonBackground: '#4fc3f7',
        buttonTextColor: '#1e1e1e',
        hoverBackground: '#252540'
    },
    // 深黑主题
    deepdark: {
        name: '极简深黑',
        description: '纯黑背景深色主题',
        titleBarGradient: 'linear-gradient(135deg, #1f1f1f 0%, #0a0a0a 100%)',
        backgroundColor: '#000000',
        cardBackground: '#121212',
        textColor: '#ffffff',
        secondaryTextColor: '#aaaaaa',
        borderColor: '#333333',
        accentColor: '#bb86fc',
        buttonBackground: '#bb86fc',
        buttonTextColor: '#000000',
        hoverBackground: '#1f1f1f'
    },
    // 图标主题
    icon: {
        name: '白泽图标',
        description: '与白泽图标一致的紫粉渐变主题',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#f5f7fa',
        cardBackground: '#ffffff',
        textColor: '#1a1a1a',
        secondaryTextColor: '#4a4a4a',
        borderColor: '#e1e4e8',
        accentColor: '#f093fb',
        buttonBackground: '#f093fb',
        buttonTextColor: '#1a1625',
        hoverBackground: '#e8f0fe'
    },
    // 海洋主题
    ocean: {
        name: '深海蔚蓝',
        description: '深邃的海洋蓝主题',
        titleBarGradient: 'linear-gradient(135deg, #4a90a4 0%, #2a6070 100%)',
        backgroundColor: '#0a1a20',
        cardBackground: '#152530',
        textColor: '#d0e0e8',
        secondaryTextColor: '#809098',
        borderColor: '#2a4050',
        accentColor: '#40a0c0',
        buttonBackground: '#40a0c0',
        buttonTextColor: '#0a1a20',
        hoverBackground: '#203540'
    },
    // 森林主题
    forest: {
        name: '森林秘境',
        description: '深邃的森林绿主题',
        titleBarGradient: 'linear-gradient(135deg, #4a7a50 0%, #2a5030 100%)',
        backgroundColor: '#f5f8f5',
        cardBackground: '#ffffff',
        textColor: '#1a1a1a',
        secondaryTextColor: '#4a4a4a',
        borderColor: '#d8e8d8',
        accentColor: '#50a050',
        buttonBackground: '#50a050',
        buttonTextColor: '#0a150a',
        hoverBackground: '#e8f5e9'
    },
    // ========== 护眼主题 ==========
    // 护眼绿色主题
    'eyecare-green': {
        name: '护眼绿洲',
        description: '柔和的绿色护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #a8e6cf 0%, #88d8b0 100%)',
        backgroundColor: '#e8f5e9',
        cardBackground: '#f1f8f2',
        textColor: '#2e4a2f',
        secondaryTextColor: '#5a7a5b',
        borderColor: '#c8e6c9',
        accentColor: '#4caf50',
        buttonBackground: '#4caf50',
        buttonTextColor: '#ffffff',
        hoverBackground: '#d4edda'
    },
    // 护眼米黄主题
    'eyecare-beige': {
        name: '护眼米黄',
        description: '温和的米黄色护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #f5e6d3 0%, #e8d5b7 100%)',
        backgroundColor: '#faf6f0',
        cardBackground: '#fff9f0',
        textColor: '#4a4035',
        secondaryTextColor: '#7a7065',
        borderColor: '#e5ddd0',
        accentColor: '#c9a66b',
        buttonBackground: '#c9a66b',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5efe5'
    },
    // 护眼淡蓝主题
    'eyecare-blue': {
        name: '护眼淡蓝',
        description: '舒适的淡蓝色护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #b8d4e8 0%, #9fc5d8 100%)',
        backgroundColor: '#f0f7fc',
        cardBackground: '#f5fafd',
        textColor: '#2c4a5e',
        secondaryTextColor: '#5a7a8e',
        borderColor: '#d0e4f0',
        accentColor: '#5c9ece',
        buttonBackground: '#5c9ece',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e0eff8'
    },
    // 护眼粉色主题
    'eyecare-pink': {
        name: '护眼樱粉',
        description: '柔和的樱花粉护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #ffd1dc 0%, #ffb6c1 100%)',
        backgroundColor: '#fff5f8',
        cardBackground: '#fffafb',
        textColor: '#4a2a35',
        secondaryTextColor: '#7a5a65',
        borderColor: '#f5d8e0',
        accentColor: '#e08090',
        buttonBackground: '#e08090',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f8e8ec'
    },
    // 护眼琥珀主题
    'eyecare-amber': {
        name: '护眼琥珀',
        description: '温暖的琥珀色护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #ffe4b5 0%, #ffd9a0 100%)',
        backgroundColor: '#fffbf0',
        cardBackground: '#fffdf5',
        textColor: '#4a3a20',
        secondaryTextColor: '#7a6a50',
        borderColor: '#f0e5d0',
        accentColor: '#d4a050',
        buttonBackground: '#d4a050',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f8f0e0'
    },
    // 护眼青色主题
    'eyecare-teal': {
        name: '护眼青瓷',
        description: '清雅的青瓷色护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #b2dfdb 0%, #80cbc4 100%)',
        backgroundColor: '#f0faf8',
        cardBackground: '#f5fcfa',
        textColor: '#2a4a45',
        secondaryTextColor: '#5a7a75',
        borderColor: '#c8e8e0',
        accentColor: '#26a69a',
        buttonBackground: '#26a69a',
        buttonTextColor: '#ffffff',
        hoverBackground: '#e0f5f0'
    },
    // 护眼丁香主题
    'eyecare-lilac': {
        name: '护眼丁香',
        description: '淡雅的丁香紫护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #d8bfd8 0%, #c8a8c8 100%)',
        backgroundColor: '#faf5fa',
        cardBackground: '#fdf8fd',
        textColor: '#3a2a40',
        secondaryTextColor: '#6a5a70',
        borderColor: '#e8d8e8',
        accentColor: '#9a70a0',
        buttonBackground: '#9a70a0',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5e8f5'
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
 * 获取当前主题
 */
export function getCurrentTheme(): ThemeType {
    // @ts-ignore
    const config = store.get('themeConfig') as ThemeConfig
    return config.currentTheme
}

/**
 * 获取当前主题样式
 */
export function getCurrentThemeStyles(): ThemeStyles {
    const themeType = getCurrentTheme()
    return themes[themeType]
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
 */
export function getAllThemes(): { type: ThemeType; styles: ThemeStyles }[] {
    return Object.entries(themes).map(([type, styles]) => ({
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
