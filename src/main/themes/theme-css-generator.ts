/**
 * 主题CSS生成器
 * 为每个主题生成对应的CSS变量
 */

import * as fs from 'fs'
import * as path from 'path'
import { ThemeStyles } from './theme-config'

/**
 * 生成主题CSS
 */
export function generateThemeCSS(theme: ThemeStyles): string {
    return `
:root {
    --bg-color: ${theme.backgroundColor};
    --card-bg: ${theme.cardBackground};
    --text-color: ${theme.textColor};
    --secondary-text-color: ${theme.secondaryTextColor};
    --border-color: ${theme.borderColor};
    --accent-color: ${theme.accentColor};
    --button-background: ${theme.buttonBackground};
    --button-text-color: ${theme.buttonTextColor};
    --hover-background: ${theme.hoverBackground};
    --title-bar-gradient: ${theme.titleBarGradient};
}

/* 全局样式应用 */
body {
    background-color: var(--bg-color);
    color: var(--text-color);
}

.card {
    background-color: var(--card-bg);
    border-color: var(--border-color);
}

.accent {
    color: var(--accent-color);
}

.accent-bg {
    background-color: var(--accent-color);
    color: var(--button-text-color);
}

.button {
    background-color: var(--button-background);
    color: var(--button-text-color);
    border-color: var(--border-color);
}

.button:hover {
    background-color: var(--hover-background);
}

/* 标题栏样式 */
.title-bar {
    background: var(--title-bar-gradient);
}
`
}

/**
 * 生成所有主题的CSS文件
 */
export function generateAllThemeCSS(themes: { type: string; styles: ThemeStyles }[], outputDir: string): void {
    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    // 为每个主题生成CSS文件
    themes.forEach(({ type, styles }) => {
        const css = generateThemeCSS(styles)
        const cssPath = path.join(outputDir, `${type}.css`)
        fs.writeFileSync(cssPath, css, 'utf-8')
    })

    // 生成主题列表CSS
    const themeListCSS = generateThemeListCSS(themes)
    const themeListPath = path.join(outputDir, 'theme-list.css')
    fs.writeFileSync(themeListPath, themeListCSS, 'utf-8')
}

/**
 * 生成主题列表CSS
 */
function generateThemeListCSS(themes: { type: string; styles: ThemeStyles }[]): string {
    let css = '/* 主题列表样式 */\n'
    
    themes.forEach(({ type, styles }) => {
        css += `
body[data-theme="${type}"] {
    --bg-color: ${styles.backgroundColor};
    --card-bg: ${styles.cardBackground};
    --text-color: ${styles.textColor};
    --secondary-text-color: ${styles.secondaryTextColor};
    --border-color: ${styles.borderColor};
    --accent-color: ${styles.accentColor};
    --button-background: ${styles.buttonBackground};
    --button-text-color: ${styles.buttonTextColor};
    --hover-background: ${styles.hoverBackground};
    --title-bar-gradient: ${styles.titleBarGradient};
}
`
    })

    return css
}

/**
 * 获取主题CSS内容
 */
export function getThemeCSS(themeType: string): string {
    const cssPath = path.join(__dirname, '../../theme-css', `${themeType}.css`)
    
    if (fs.existsSync(cssPath)) {
        return fs.readFileSync(cssPath, 'utf-8')
    }
    
    // 如果CSS文件不存在，返回默认主题CSS
    const defaultCSSPath = path.join(__dirname, '../../theme-css', 'baize.css')
    if (fs.existsSync(defaultCSSPath)) {
        return fs.readFileSync(defaultCSSPath, 'utf-8')
    }
    
    return ''
}
