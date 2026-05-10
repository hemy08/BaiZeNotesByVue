/**
 * 主题配置管理模块
 * 用于管理应用的主题设置
 */

// @ts-ignore
import { createStore } from '../utils/store-factory'

export type ThemeType = 'baize' | 'warm' | 'light' | 'lavender' | 'coral' | 'mint' | 'sunset' | 'rose' | 'eyecare-green' | 'eyecare-beige' | 'eyecare-blue' | 'eyecare-pink' | 'eyecare-amber' | 'eyecare-teal' | 'eyecare-lilac' | 'baize-beast' | 'baize-clear' | 'dark' | 'deepdark' | 'icon' | 'ocean' | 'forest' | 'baize-text' | 'baize-starry' | 'baize-data-light' | 'baize-mirror-light' | 'baize-data-dark' | 'baize-mirror-dark'

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

export interface ThemeConfig {
    currentTheme: ThemeType
    separateEditorTheme: boolean
    editorTheme?: MonacoThemeType
}

export const themes: Record<ThemeType, ThemeStyles> = {
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
    lavender: {
        name: '薰衣草梦',
        description: '浅蓝浅紫渐变护眼主题',
        titleBarGradient: 'linear-gradient(135deg, #b8c5e8 0%, #d4b8e8 100%)',
        backgroundColor: '#e8e4f8',
        cardBackground: '#f5f2fa',
        textColor: '#3a3550',
        secondaryTextColor: '#6a6580',
        borderColor: '#d0c8e8',
        accentColor: '#8b7ec8',
        buttonBackground: '#8b7ec8',
        buttonTextColor: '#ffffff',
        hoverBackground: '#ebe8f5'
    },
    coral: {
        name: '珊瑚暖阳',
        description: '温暖的珊瑚色主题',
        titleBarGradient: 'linear-gradient(135deg, #ffb8a3 0%, #ff9a8b 100%)',
        backgroundColor: '#e8e4f8',
        cardBackground: '#f5f2fa',
        textColor: '#4a3530',
        secondaryTextColor: '#7a6555',
        borderColor: '#f5d8d0',
        accentColor: '#e07850',
        buttonBackground: '#e07850',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5e8e5'
    },
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
    sunset: {
        name: '日落余晖',
        description: '温暖的橙红渐变主题',
        titleBarGradient: 'linear-gradient(135deg, #ffd89b 0%, #f9a86b 100%)',
        backgroundColor: '#fff8e8',
        cardBackground: '#fffbf0',
        textColor: '#4a3a2a',
        secondaryTextColor: '#7a6a5a',
        borderColor: '#f0e0c8',
        accentColor: '#e08840',
        buttonBackground: '#e08840',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5f0e8'
    },
    rose: {
        name: '玫瑰花园',
        description: '浪漫的玫瑰粉主题',
        titleBarGradient: 'linear-gradient(135deg, #f5b7b1 0%, #ec7063 100%)',
        backgroundColor: '#fff0f0',
        cardBackground: '#fef5f5',
        textColor: '#4a2a2a',
        secondaryTextColor: '#7a5a5a',
        borderColor: '#f8d8d8',
        accentColor: '#c05050',
        buttonBackground: '#c05050',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f8e8e8'
    },
    dark: {
        name: '深邃夜空',
        description: '护眼深色主题',
        titleBarGradient: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        backgroundColor: '#fff0f0',
        cardBackground: '#1a1a2e',
        textColor: '#e0e0e0',
        secondaryTextColor: '#888888',
        borderColor: '#2a2a4a',
        accentColor: '#4fc3f7',
        buttonBackground: '#4fc3f7',
        buttonTextColor: '#1e1e1e',
        hoverBackground: '#252540'
    },
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
    icon: {
        name: '白泽图标',
        description: '与白泽图标一致的紫粉渐变主题',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#1a1625',
        cardBackground: '#2d2640',
        textColor: '#e8e0f8',
        secondaryTextColor: '#b8b0c8',
        borderColor: '#3d3560',
        accentColor: '#f093fb',
        buttonBackground: '#f093fb',
        buttonTextColor: '#1a1625',
        hoverBackground: '#352d50',
    },
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
    },
    'baize-text': {
        name: '白泽文字',
        description: '紫粉渐变配金色文字深色主题',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#1a1625',
        cardBackground: '#2d2640',
        textColor: '#e8e0f8',
        secondaryTextColor: '#b8b0c8',
        borderColor: '#3d3560',
        accentColor: '#ffd700',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#352d50'
    },
    'baize-starry': {
        name: '白泽星空',
        description: '深蓝星空配金色主题',
        titleBarGradient: 'linear-gradient(135deg, #0a1929 0%, #1a237e 50%, #283593 100%)',
        backgroundColor: '#0d1421',
        cardBackground: '#1a237e',
        textColor: '#e8e8e8',
        secondaryTextColor: '#b8b8b8',
        borderColor: '#2a3a5e',
        accentColor: '#ffd700',
        buttonBackground: '#ffd700',
        buttonTextColor: '#0a1929',
        hoverBackground: '#252e5e'
    },
    'baize-beast': {
        name: '白泽神兽',
        description: '紫粉渐变配白色神兽主题',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#f5f0fa',
        cardBackground: '#faf8ff',
        textColor: '#3d3d3d',
        secondaryTextColor: '#6d6d6d',
        borderColor: '#e0d8f0',
        accentColor: '#764ba2',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f2e8f8'
    },
    'baize-clear': {
        name: '白泽清晰',
        description: '紫粉渐变配金色高对比主题',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 50%, #f093fb 100%)',
        backgroundColor: '#fffcf5',
        cardBackground: '#fffaf0',
        textColor: '#1a1a1a',
        secondaryTextColor: '#4a4a4a',
        borderColor: '#f0e8d8',
        accentColor: '#ffed4e',
        buttonBackground: '#764ba2',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f5f0ff'
    },
    'baize-data-light': {
        name: '白泽数据浅色',
        description: '清新数据主题，青紫渐变，浅色背景',
        titleBarGradient: 'linear-gradient(135deg, #0EA5E9 0%, #8B5CF6 100%)',
        backgroundColor: '#F8FAFC',
        cardBackground: '#FFFFFF',
        textColor: '#1E293B',
        secondaryTextColor: '#64748B',
        borderColor: '#E2E8F0',
        accentColor: '#0EA5E9',
        buttonBackground: '#0EA5E9',
        buttonTextColor: '#FFFFFF',
        hoverBackground: '#F0F9FF'
    },
    'baize-mirror-light': {
        name: '白泽镜像浅色',
        description: '科技镜像主题，透镜设计，纯净白色',
        titleBarGradient: 'linear-gradient(135deg, #8B5CF6 0%, #0EA5E9 100%)',
        backgroundColor: '#FFFFFF',
        cardBackground: '#F8FAFC',
        textColor: '#0F172A',
        secondaryTextColor: '#475569',
        borderColor: '#CBD5E1',
        accentColor: '#8B5CF6',
        buttonBackground: '#8B5CF6',
        buttonTextColor: '#FFFFFF',
        hoverBackground: '#F5F3FF'
    },
    'baize-data-dark': {
        name: '白泽数据深色',
        description: '数据科技主题，青紫光晕，深色背景',
        titleBarGradient: 'linear-gradient(135deg, #00E0FF 0%, #6C5CE7 100%)',
        backgroundColor: '#020617',
        cardBackground: '#0F172A',
        textColor: '#E2E8F0',
        secondaryTextColor: '#94A3B8',
        borderColor: '#1E293B',
        accentColor: '#00E0FF',
        buttonBackground: '#00E0FF',
        buttonTextColor: '#020617',
        hoverBackground: '#1E293B'
    },
    'baize-mirror-dark': {
        name: '白泽镜像深色',
        description: '科技洞察主题，透镜光效，深邃夜空',
        titleBarGradient: 'linear-gradient(135deg, #6C5CE7 0%, #00E0FF 100%)',
        backgroundColor: '#0B1120',
        cardBackground: '#111B33',
        textColor: '#F8FAFC',
        secondaryTextColor: '#CBD5E1',
        borderColor: '#1E3A5F',
        accentColor: '#6C5CE7',
        buttonBackground: '#6C5CE7',
        buttonTextColor: '#FFFFFF',
        hoverBackground: '#1E293B'
    }
}

// 存储实例（延迟初始化）
let store: ReturnType<typeof createStore> | null = null

// 获取存储实例
function getStore() {
    if (!store) {
        store = createStore('theme-config', {
            themeConfig: {
                currentTheme: 'baize',
                separateEditorTheme: false,
                editorTheme: 'vs'
            }
        })
    }
    return store
}

export function getAllThemes(): { type: ThemeType; styles: ThemeStyles }[] {
    return Object.entries(themes).map(([type, styles]) => ({
        type: type as ThemeType,
        styles
    }))
}

export function getCurrentTheme(): ThemeType {
    const s = getStore()
    // @ts-ignore
    const config = s.get('themeConfig') as ThemeConfig
    return config.currentTheme
}

export function getCurrentThemeStyles(): ThemeStyles {
    const themeType = getCurrentTheme()
    return themes[themeType]
}

export function getThemeStylesByType(themeType: ThemeType): ThemeStyles {
    return themes[themeType]
}

export function setTheme(theme: ThemeType): void {
    const s = getStore()
    // @ts-ignore
    s.set('themeConfig', { currentTheme: theme })
}

export type MonacoThemeType = string

import { getAllMonacoThemes as registryGetAllMonacoThemes, MonacoThemeConfig } from './theme-registry'

export type { MonacoThemeConfig }

export function getAllMonacoThemes(): { type: MonacoThemeType; config: MonacoThemeConfig }[] {
    return registryGetAllMonacoThemes()
}

export function getSeparateEditorTheme(): boolean {
    const s = getStore()
    // @ts-ignore
    const config = s.get('themeConfig') as ThemeConfig
    return config.separateEditorTheme || false
}

export function setSeparateEditorTheme(separate: boolean): void {
    const s = getStore()
    // @ts-ignore
    const config = s.get('themeConfig') as ThemeConfig
    // @ts-ignore
    s.set('themeConfig', { ...config, separateEditorTheme: separate })
}

export function getMonacoTheme(): MonacoThemeType {
    const s = getStore()
    // @ts-ignore
    const config = s.get('themeConfig') as ThemeConfig
    return config.editorTheme || 'vs'
}

export function setMonacoTheme(theme: MonacoThemeType): void {
    const s = getStore()
    // @ts-ignore
    const config = s.get('themeConfig') as ThemeConfig
    // @ts-ignore
    s.set('themeConfig', { ...config, editorTheme: theme })
}