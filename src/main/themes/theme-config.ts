/**
 * 主题配置管理模块
 * 用于管理应用的主题设置
 */

// @ts-ignore
import Store from 'electron-store'

// 主题类型
export type ThemeType = 'baize' | 'warm' | 'light' | 'lavender' | 'coral' | 'mint' | 'sunset' | 'rose' | 'eyecare-green' | 'eyecare-beige' | 'eyecare-blue' | 'eyecare-pink' | 'eyecare-amber' | 'eyecare-teal' | 'eyecare-lilac' | 'baize-beast' | 'baize-clear' | 'dark' | 'deepdark' | 'icon' | 'ocean' | 'forest' | 'baize-text' | 'baize-starry'

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

export interface ThemeConfig {
    currentTheme: ThemeType
    separateEditorTheme: boolean // 是否单独配置编辑器主题
    editorTheme?: MonacoThemeType // Monaco 编辑器主题
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
    // 珊瑚主题
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
    // 玫瑰主题
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
    // ========== 深色主题 ==========
    // 深色主题
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
    },
    // ========== 图标样式主题 ==========
    // 白泽文字主题 - 基于baize_text_icon.svg（深色）
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
    // 白泽星空主题 - 基于baize_spaced_icon.svg（深色）
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
    // 白泽神兽主题 - 基于baize_icon.svg（浅色）
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
    // 白泽清晰主题 - 基于baize_clear_icon.svg（浅色）
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

/**
 * 获取所有应用主题
 */
export function getAllThemes(): { type: ThemeType; styles: ThemeStyles }[] {
    return Object.entries(themes).map(([type, styles]) => ({
        type: type as ThemeType,
        styles
    }))
}

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

// Monaco 主题类型定义
export type MonacoThemeType = 'vs' | 'vs-dark' | 'hc-black' | 'Active4D' | 'All Hallows Eve' | 'Amy' | 'Birds of Paradise' | 'Blackboard' | 'Brilliance Black' | 'Brilliance Dull' | 'Chrome DevTools' | 'Clouds Midnight' | 'Clouds' | 'Cobalt' | 'Cobalt2' | 'Dawn' | 'Dominion Day' | 'Dracula' | 'Dreamweaver' | 'Eiffel' | 'Espresso Libre' | 'GitHub Dark' | 'GitHub Light' | 'GitHub' | 'IDLE' | 'idleFingers' | 'iPlastic' | 'Katzenmilch' | 'krTheme' | 'Kuroir Theme' | 'LAZY' | 'MagicWB (Amiga)' | 'Merbivore Soft' | 'Merbivore' | 'monoindustrial' | 'Monokai Bright' | 'Monokai' | 'Night Owl' | 'Nord' | 'Oceanic Next' | 'Pastels on Dark' | 'Slush and Poppies' | 'Solarized-dark' | 'Solarized-light' | 'SpaceCadet' | 'Sunburst' | 'Textmate (Mac Classic)' | 'Tomorrow' | 'Tomorrow-Night' | 'Tomorrow-Night-Blue' | 'Tomorrow-Night-Bright' | 'Tomorrow-Night-Eighties' | 'Twilight' | 'Upstream Sunburst' | 'Vibrant Ink' | 'Xcode_default' | 'Zenburnesque'

// Monaco 编辑器主题配置接口
export interface MonacoThemeConfig {
    name: string
    description: string
    isDark: boolean
    backgroundColor?: string
    foregroundColor?: string
    cardBackground?: string
    borderColor?: string
}

/**
 * Monaco 编辑器主题配置
 * 从主题 JSON 文件中提取实际的颜色信息
 */
export const monacoThemes: Record<MonacoThemeType, MonacoThemeConfig> = {
    // 内置主题
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
    },
    // 扩展主题
    'Active4D': {
        name: 'Active4D',
        description: 'Active4D 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#3B3B3B',
        cardBackground: '#FFFFFF',
        borderColor: '#D3D3D3'
    },
    'All Hallows Eve': {
        name: 'All Hallows Eve',
        description: 'All Hallows Eve 主题',
        isDark: true,
        backgroundColor: '#000000',
        foregroundColor: '#FFFFFF',
        cardBackground: '#1A1A1A',
        borderColor: '#333333'
    },
    'Amy': {
        name: 'Amy',
        description: 'Amy 主题',
        isDark: true,
        backgroundColor: '#200020',
        foregroundColor: '#F8F8F8',
        cardBackground: '#2D002D',
        borderColor: '#401040'
    },
    'Birds of Paradise': {
        name: 'Birds of Paradise',
        description: 'Birds of Paradise 主题',
        isDark: true,
        backgroundColor: '#372725',
        foregroundColor: '#F8F8F2',
        cardBackground: '#3A2B2A',
        borderColor: '#4A3B3A'
    },
    'Blackboard': {
        name: 'Blackboard',
        description: 'Blackboard 主题',
        isDark: true,
        backgroundColor: '#0C1021',
        foregroundColor: '#F8F8F8',
        cardBackground: '#1C2031',
        borderColor: '#2C3041'
    },
    'Brilliance Black': {
        name: 'Brilliance Black',
        description: 'Brilliance Black 主题',
        isDark: true,
        backgroundColor: '#0D0D0D',
        foregroundColor: '#FFFFFF',
        cardBackground: '#1A1A1A',
        borderColor: '#333333'
    },
    'Brilliance Dull': {
        name: 'Brilliance Dull',
        description: 'Brilliance Dull 主题',
        isDark: true,
        backgroundColor: '#050505',
        foregroundColor: '#FFFFFF',
        cardBackground: '#2A2A2A',
        borderColor: '#3A3A3A'
    },
    'Chrome DevTools': {
        name: 'Chrome DevTools',
        description: 'Chrome DevTools 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#D4D4D4',
        cardBackground: '#2D2D2D',
        borderColor: '#404040'
    },
    'Clouds Midnight': {
        name: 'Clouds Midnight',
        description: 'Clouds Midnight 主题',
        isDark: true,
        backgroundColor: '#191919',
        foregroundColor: '#9E9E9E',
        cardBackground: '#2A2A2A',
        borderColor: '#3A3A3A'
    },
    'Clouds': {
        name: 'Clouds',
        description: 'Clouds 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#4C4C4C',
        cardBackground: '#FFFFFF',
        borderColor: '#D3D3D3'
    },
    'Cobalt': {
        name: 'Cobalt',
        description: 'Cobalt 主题',
        isDark: true,
        backgroundColor: '#002240',
        foregroundColor: '#FFFFFF',
        cardBackground: '#103350',
        borderColor: '#204260'
    },
    'Cobalt2': {
        name: 'Cobalt2',
        description: 'Cobalt2 主题',
        isDark: true,
        backgroundColor: '#122F3A',
        foregroundColor: '#FFFFFF',
        cardBackground: '#224F5A',
        borderColor: '#326F7A'
    },
    'Dawn': {
        name: 'Dawn',
        description: 'Dawn 主题',
        isDark: false,
        backgroundColor: '#F9F9F9',
        foregroundColor: '#080808',
        cardBackground: '#FFFFFF',
        borderColor: '#E0E0E0'
    },
    'Dominion Day': {
        name: 'Dominion Day',
        description: 'Dominion Day 主题',
        isDark: true,
        backgroundColor: '#2A2A2A',
        foregroundColor: '#FFFFFF',
        cardBackground: '#3A3A3A',
        borderColor: '#4A4A4A'
    },
    'Dracula': {
        name: 'Dracula',
        description: 'Dracula 主题',
        isDark: true,
        backgroundColor: '#282A36',
        foregroundColor: '#F8F8F2',
        cardBackground: '#383A46',
        borderColor: '#44475A'
    },
    'Dreamweaver': {
        name: 'Dreamweaver',
        description: 'Dreamweaver 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#FFFFFF',
        cardBackground: '#2E2E2E',
        borderColor: '#3E3E3E'
    },
    'Eiffel': {
        name: 'Eiffel',
        description: 'Eiffel 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#FFFFFF',
        cardBackground: '#3B3B3B',
        borderColor: '#4B4B4B'
    },
    'Espresso Libre': {
        name: 'Espresso Libre',
        description: 'Espresso Libre 主题',
        isDark: true,
        backgroundColor: '#2A211C',
        foregroundColor: '#FFFFFF',
        cardBackground: '#3A3A3A',
        borderColor: '#4A4A4A'
    },
    'GitHub Dark': {
        name: 'GitHub Dark',
        description: 'GitHub Dark 主题',
        isDark: true,
        backgroundColor: '#24292e',
        foregroundColor: '#C9D1D9',
        cardBackground: '#161B22',
        borderColor: '#30363D'
    },
    'GitHub Light': {
        name: 'GitHub Light',
        description: 'GitHub Light 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#24292F',
        cardBackground: '#F6F8FA',
        borderColor: '#D0D7DE'
    },
    'GitHub': {
        name: 'GitHub',
        description: 'GitHub 主题',
        isDark: false,
        backgroundColor: '#F8F8FF',
        foregroundColor: '#C9D1D9',
        cardBackground: '#161B22',
        borderColor: '#30363D'
    },
    'IDLE': {
        name: 'IDLE',
        description: 'IDLE 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#000000',
        cardBackground: '#F0F0F0',
        borderColor: '#D0D0D0'
    },
    'idleFingers': {
        name: 'idleFingers',
        description: 'idleFingers 主题',
        isDark: true,
        backgroundColor: '#323232',
        foregroundColor: '#FFFFFF',
        cardBackground: '#424242',
        borderColor: '#525252'
    },
    'iPlastic': {
        name: 'iPlastic',
        description: 'iPlastic 主题',
        isDark: false,
        backgroundColor: '#E0E0E0',
        foregroundColor: '#000000',
        cardBackground: '#F0F0F0',
        borderColor: '#D0D0D0'
    },
    'Katzenmilch': {
        name: 'Katzenmilch',
        description: 'Katzenmilch 主题',
        isDark: false,
        backgroundColor: '#F8F8F8',
        foregroundColor: '#000000',
        cardBackground: '#FFFFFF',
        borderColor: '#E0E0E0'
    },
    'krTheme': {
        name: 'krTheme',
        description: 'krTheme 主题',
        isDark: true,
        backgroundColor: '#0B0B0B',
        foregroundColor: '#FFFFFF',
        cardBackground: '#1B1B1B',
        borderColor: '#2B2B2B'
    },
    'Kuroir Theme': {
        name: 'Kuroir Theme',
        description: 'Kuroir Theme 主题',
        isDark: false,
        backgroundColor: '#E6E1DC',
        foregroundColor: '#000000',
        cardBackground: '#F0EBE6',
        borderColor: '#D0CBC6'
    },
    'LAZY': {
        name: 'LAZY',
        description: 'LAZY 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#FFFFFF',
        cardBackground: '#2C2C2C',
        borderColor: '#3C3C3C'
    },
    'MagicWB (Amiga)': {
        name: 'MagicWB (Amiga)',
        description: 'MagicWB (Amiga) 主题',
        isDark: false,
        backgroundColor: '#969696',
        foregroundColor: '#FFFFFF',
        cardBackground: '#101090',
        borderColor: '#2020A0'
    },
    'Merbivore Soft': {
        name: 'Merbivore Soft',
        description: 'Merbivore Soft 主题',
        isDark: true,
        backgroundColor: '#161616',
        foregroundColor: '#E0E0E0',
        cardBackground: '#363636',
        borderColor: '#464646'
    },
    'Merbivore': {
        name: 'Merbivore',
        description: 'Merbivore 主题',
        isDark: true,
        backgroundColor: '#1B1B1B',
        foregroundColor: '#E0E0E0',
        cardBackground: '#2B2B2B',
        borderColor: '#3B3B3B'
    },
    'monoindustrial': {
        name: 'monoindustrial',
        description: 'monoindustrial 主题',
        isDark: true,
        backgroundColor: '#222C28',
        foregroundColor: '#FFFFFF',
        cardBackground: '#323C38',
        borderColor: '#424C48'
    },
    'Monokai Bright': {
        name: 'Monokai Bright',
        description: 'Monokai Bright 主题',
        isDark: true,
        backgroundColor: '#272822',
        foregroundColor: '#F8F8F2',
        cardBackground: '#373832',
        borderColor: '#474842'
    },
    'Monokai': {
        name: 'Monokai',
        description: 'Monokai 主题',
        isDark: true,
        backgroundColor: '#272822',
        foregroundColor: '#F8F8F2',
        cardBackground: '#373832',
        borderColor: '#474842'
    },
    'Night Owl': {
        name: 'Night Owl',
        description: 'Night Owl 主题',
        isDark: true,
        backgroundColor: '#011627',
        foregroundColor: '#D6DEEB',
        cardBackground: '#112637',
        borderColor: '#223647'
    },
    'Nord': {
        name: 'Nord',
        description: 'Nord 主题',
        isDark: true,
        backgroundColor: '#2E3440',
        foregroundColor: '#D8DEE9',
        cardBackground: '#3E4450',
        borderColor: '#4C5565'
    },
    'Oceanic Next': {
        name: 'Oceanic Next',
        description: 'Oceanic Next 主题',
        isDark: true,
        backgroundColor: '#1B2B34',
        foregroundColor: '#C0C5CE',
        cardBackground: '#2B3B44',
        borderColor: '#3B4B54'
    },
    'Pastels on Dark': {
        name: 'Pastels on Dark',
        description: 'Pastels on Dark 主题',
        isDark: true,
        backgroundColor: '#211E1E',
        foregroundColor: '#FFFFFF',
        cardBackground: '#312E2E',
        borderColor: '#413E3E'
    },
    'Slush and Poppies': {
        name: 'Slush and Poppies',
        description: 'Slush and Poppies 主题',
        isDark: false,
        backgroundColor: '#F1F1F1',
        foregroundColor: '#FFFFFF',
        cardBackground: '#3C3C3C',
        borderColor: '#4C4C4C'
    },
    'Solarized-dark': {
        name: 'Solarized Dark',
        description: 'Solarized Dark 主题',
        isDark: true,
        backgroundColor: '#002B36',
        foregroundColor: '#839496',
        cardBackground: '#073642',
        borderColor: '#094552'
    },
    'Solarized-light': {
        name: 'Solarized Light',
        description: 'Solarized Light 主题',
        isDark: false,
        backgroundColor: '#FDF6E3',
        foregroundColor: '#657B83',
        cardBackground: '#EEE8D5',
        borderColor: '#B58900'
    },
    'SpaceCadet': {
        name: 'SpaceCadet',
        description: 'SpaceCadet 主题',
        isDark: true,
        backgroundColor: '#0D0D0D',
        foregroundColor: '#FFFFFF',
        cardBackground: '#1D1D1D',
        borderColor: '#2D2D2D'
    },
    'Sunburst': {
        name: 'Sunburst',
        description: 'Sunburst 主题',
        isDark: true,
        backgroundColor: '#1A1A1A',
        foregroundColor: '#FFFFFF',
        cardBackground: '#2A2A2A',
        borderColor: '#3A3A3A'
    },
    'Textmate (Mac Classic)': {
        name: 'Textmate (Mac Classic)',
        description: 'Textmate (Mac Classic) 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#000000',
        cardBackground: '#F0F0F0',
        borderColor: '#D0D0D0'
    },
    'Tomorrow': {
        name: 'Tomorrow',
        description: 'Tomorrow 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#4D4D4C',
        cardBackground: '#F8F8F8',
        borderColor: '#E0E0E0'
    },
    'Tomorrow-Night': {
        name: 'Tomorrow Night',
        description: 'Tomorrow Night 主题',
        isDark: true,
        backgroundColor: '#1D1F21',
        foregroundColor: '#C5C8C6',
        cardBackground: '#2D2F31',
        borderColor: '#3D3F41'
    },
    'Tomorrow-Night-Blue': {
        name: 'Tomorrow Night Blue',
        description: 'Tomorrow Night Blue 主题',
        isDark: true,
        backgroundColor: '#002451',
        foregroundColor: '#FFFFFF',
        cardBackground: '#103461',
        borderColor: '#204471'
    },
    'Tomorrow-Night-Bright': {
        name: 'Tomorrow Night Bright',
        description: 'Tomorrow Night Bright 主题',
        isDark: true,
        backgroundColor: '#000000',
        foregroundColor: '#E0E0E0',
        cardBackground: '#1A1A1A',
        borderColor: '#2A2A2A'
    },
    'Tomorrow-Night-Eighties': {
        name: 'Tomorrow Night Eighties',
        description: 'Tomorrow Night Eighties 主题',
        isDark: true,
        backgroundColor: '#2D2D2D',
        foregroundColor: '#CCCCCC',
        cardBackground: '#3D3D3D',
        borderColor: '#4D4D4D'
    },
    'Twilight': {
        name: 'Twilight',
        description: 'Twilight 主题',
        isDark: true,
        backgroundColor: '#141414',
        foregroundColor: '#F7F7F7',
        cardBackground: '#242424',
        borderColor: '#343434'
    },
    'Upstream Sunburst': {
        name: 'Upstream Sunburst',
        description: 'Upstream Sunburst 主题',
        isDark: true,
        backgroundColor: '#000000',
        foregroundColor: '#FFFFFF',
        cardBackground: '#2A2A2A',
        borderColor: '#3A3A3A'
    },
    'Vibrant Ink': {
        name: 'Vibrant Ink',
        description: 'Vibrant Ink 主题',
        isDark: true,
        backgroundColor: '#000000',
        foregroundColor: '#FFFFFF',
        cardBackground: '#2A2A2A',
        borderColor: '#3A3A3A'
    },
    'Xcode_default': {
        name: 'Xcode_default',
        description: 'Xcode_default 主题',
        isDark: false,
        backgroundColor: '#FFFFFF',
        foregroundColor: '#FFFFFF',
        cardBackground: '#2E2E2E',
        borderColor: '#3E3E3E'
    },
    'Zenburnesque': {
        name: 'Zenburnesque',
        description: 'Zenburnesque 主题',
        isDark: true,
        backgroundColor: '#3F3F3F',
        foregroundColor: '#DCDCCC',
        cardBackground: '#4F4F4F',
        borderColor: '#5F5F5F'
    }
}

/**
 * 获取所有 Monaco 编辑器主题
 */
export function getAllMonacoThemes(): { type: MonacoThemeType; config: MonacoThemeConfig }[] {
    return Object.entries(monacoThemes).map(([type, config]) => ({
        type: type as MonacoThemeType,
        config
    }))
}

/**
 * 获取是否单独配置编辑器主题
 */
export function getSeparateEditorTheme(): boolean {
    // @ts-ignore
    const config = store.get('themeConfig') as ThemeConfig
    return config.separateEditorTheme || false
}

/**
 * 设置是否单独配置编辑器主题
 */
export function setSeparateEditorTheme(separate: boolean): void {
    // @ts-ignore
    const config = store.get('themeConfig') as ThemeConfig
    // @ts-ignore
    store.set('themeConfig', { ...config, separateEditorTheme: separate })
}

/**
 * 获取 Monaco 编辑器主题
 */
export function getMonacoTheme(): MonacoThemeType {
    // @ts-ignore
    const config = store.get('themeConfig') as ThemeConfig
    return config.editorTheme || 'vs'
}

/**
 * 设置 Monaco 编辑器主题
 */
export function setMonacoTheme(theme: MonacoThemeType): void {
    // @ts-ignore
    const config = store.get('themeConfig') as ThemeConfig
    // @ts-ignore
    store.set('themeConfig', { ...config, editorTheme: theme })
}

/**
 * 重置为默认主题
 */
export function resetToDefaultTheme(): void {
    setTheme('baize')
    setSeparateEditorTheme(false)
    setMonacoTheme('vs')
}
