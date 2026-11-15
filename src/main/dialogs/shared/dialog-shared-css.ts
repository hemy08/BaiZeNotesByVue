import type { ThemeStyles } from '../../config'

/**
 * 主进程 HTML 对话框共享 CSS（P2/CQ-4 清理后仅剩内联主题变量段）。
 *
 * CQ-06：内联主题 CSS 变量片段（紧凑版，无系统字号变量）的单一来源。
 * ShowRenameDialog / ShowCreateFileFolderDialog（P2 后仅剩这两个主进程可达
 * JSDOM 对话框使用）的 <style> 内联 :root 块此前各写一份，变量集合与顺序完全一致，
 * 仅缩进不同。indent 参数用于让各对话框保持迁移前的 HTML 输出逐字不变。
 *
 * CQ-4 清理结论（删除前全仓 grep 核实）：原 getDialogThemeVariables /
 * getDialogBaseCSS / getDialogTitleBarCSS / getDialogSidebarCSS /
 * getDialogContentCSS / getDialogScrollbarCSS / getDialogSharedCSS /
 * getEditorSettingDialogCSS 仅被测试引用（对应 JSDOM 主题设置/编辑器设置对话框
 * 已改为 Vue 组件并从主进程删除），生产零消费，已一并删除。
 */
export function getInlineDialogThemeVariables(themeStyles: ThemeStyles, indent = ''): string {
    const declarationIndent = `${indent}    `
    const declarations = [
        `--bg-color: ${themeStyles.backgroundColor};`,
        `--card-bg: ${themeStyles.cardBackground};`,
        `--text-color: ${themeStyles.textColor};`,
        `--secondary-text-color: ${themeStyles.secondaryTextColor};`,
        `--border-color: ${themeStyles.borderColor};`,
        `--accent-color: ${themeStyles.accentColor};`,
        `--hover-bg: ${themeStyles.hoverBackground};`,
        `--title-bar-gradient: ${themeStyles.titleBarGradient};`
    ]
    const body = declarations.map((declaration) => `${declarationIndent}${declaration}`).join('\n')
    return `${indent}:root {\n${body}\n${indent}}`
}
