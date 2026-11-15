import { describe, it, expect } from 'vitest'

// P2/CQ-4：dialog-shared-css 中仅 getInlineDialogThemeVariables 仍被生产代码使用
// （ShowRenameDialog / ShowCreateFileFolderDialog 的内联 :root 块），其余
// getDialogThemeVariables/getDialogBaseCSS/... /getEditorSettingDialogCSS 等
// JSDOM 对话框共享 CSS 构建函数零生产消费，已随源码删除。
import { getInlineDialogThemeVariables } from '../../src/main/dialogs/shared/dialog-shared-css'

// dialog-shared-css 仅依赖主题类型，构造固定主题数据即可
const themeStyles = {
    name: 'test-theme',
    description: '测试主题',
    titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    backgroundColor: '#f5f0ff',
    cardBackground: '#ffffff',
    textColor: '#2d2d2d',
    secondaryTextColor: '#666666',
    borderColor: '#e0d4f0',
    accentColor: '#764ba2',
    buttonBackground: '#667eea',
    buttonTextColor: '#ffffff',
    hoverBackground: '#f0e8ff'
}

describe('getInlineDialogThemeVariables', () => {
    it('should emit the same 8 theme variables with stable order', () => {
        const css = getInlineDialogThemeVariables(themeStyles)
        expect(css.startsWith(':root {')).toBe(true)
        expect(css.endsWith('}')).toBe(true)
        const variableNames = css.match(/--[\w-]+:/g) || []
        expect(variableNames).toEqual([
            '--bg-color:',
            '--card-bg:',
            '--text-color:',
            '--secondary-text-color:',
            '--border-color:',
            '--accent-color:',
            '--hover-bg:',
            '--title-bar-gradient:'
        ])
        expect(css).toContain('--bg-color: #f5f0ff;')
        expect(css).toContain(
            '--title-bar-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);'
        )
    })

    it('should indent every line by the given indent to keep dialog html byte-identical', () => {
        const css = getInlineDialogThemeVariables(themeStyles, '        ')
        expect(css).toBe(
            [
                '        :root {',
                '            --bg-color: #f5f0ff;',
                '            --card-bg: #ffffff;',
                '            --text-color: #2d2d2d;',
                '            --secondary-text-color: #666666;',
                '            --border-color: #e0d4f0;',
                '            --accent-color: #764ba2;',
                '            --hover-bg: #f0e8ff;',
                '            --title-bar-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);',
                '        }'
            ].join('\n')
        )
    })
})
