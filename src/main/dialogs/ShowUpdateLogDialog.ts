/**
 * 更新日志对话框
 * 显示本次升级的依赖变更信息
 */

import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions, createJSDOM, loadDialogHtml } from './dialog-defaults'
import { IPC } from '../../shared/ipc-channels'
import { tMain } from '../utils/i18n'

/**
 * 显示更新日志对话框
 */
export function ShowUpdateLogDialog() {
    const existing = windowManager.getWindowByType('update-log-dialog')
    if (existing) {
        existing.focus()
        return
    }

    const updateLogDialog = windowManager.createWindow(
        'update-log-dialog',
        createDialogOptions({
            width: 900,
            height: 700,
            minimizable: false,
            maximizable: false,
            resizable: true,
            title: tMain('dialogMain.updateLog.windowTitle')
        }),
        'update-log-dialog',
        true
    )

    updateLogDialog.setMenu(null)

    const html = makeUpdateLogHtml()
    loadDialogHtml(updateLogDialog, html)

    updateLogDialog.show()

    updateLogDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        updateLogDialog?.webContents.send(IPC.THEME.INIT_THEME_STYLES, theme)
    })
}

interface UpgradeItem {
    name: string
    old: string
    new: string
    type: 'major' | 'minor' | 'patch' | 'keep' | 'added' | 'removed'
}

interface UpgradeGroup {
    /** 分组标题的词典键（渲染时再 tMain，保证语言切换后重新打开对话框可生效） */
    titleKey: string
    items: UpgradeItem[]
}

/** 1.3.0 相对 1.2.2 的依赖变化（old = 1.2.2 声明版本，new = 1.3.0 声明/实际版本） */
const upgradeGroups: UpgradeGroup[] = [
    {
        titleKey: 'dialogMain.updateLog.groups.coreFramework',
        items: [
            { name: 'electron', old: '^43.0.0', new: '^43.8.10', type: 'patch' },
            { name: 'electron-builder', old: '^26.0.0', new: '^26.18.0', type: 'minor' },
            { name: 'electron-vite', old: '^6.0.0-beta.1', new: '^6.0.0', type: 'major' },
            { name: 'vite', old: '^8.2.2', new: '^8.3.8', type: 'minor' },
            { name: 'vue', old: '^3.5.41', new: '^3.5.45', type: 'patch' },
            { name: 'typescript', old: '^6.0.2', new: '^6.0.3', type: 'patch' }
        ]
    },
    {
        titleKey: 'dialogMain.updateLog.groups.editorRendering',
        items: [
            { name: 'monaco-editor', old: '^0.56.0', new: '^0.57.0', type: 'minor' },
            { name: 'mermaid', old: '^11.17.0', new: '^12.3.0', type: 'major' },
            { name: 'markdown-it', old: '^15.0.0', new: '^15.0.3', type: 'patch' },
            { name: 'markdown-it-anchor', old: '^9.2.1', new: '—', type: 'removed' }
        ]
    },
    {
        titleKey: 'dialogMain.updateLog.groups.dataTools',
        items: [
            { name: 'jschardet', old: '—', new: '^3.1.3', type: 'added' },
            { name: 'sharp', old: '^0.35.3', new: '—', type: 'removed' }
        ]
    },
    {
        titleKey: 'dialogMain.updateLog.groups.devTools',
        items: [
            { name: 'vitest', old: '^4.1.11', new: '^4.1.12', type: 'patch' },
            { name: 'app-builder-bin', old: '^4.2.0', new: '—', type: 'removed' }
        ]
    }
]

/** 1.3.0 重大更新词条的词典键（按展示顺序） */
const highlightKeys = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'] as const

/** 代码适配修复清单的词典键（按展示顺序） */
const codeFixKeys = [
    'materialRender',
    'editorOptions',
    'hemyEditorRender',
    'tsconfigWeb',
    'vitest',
    'encryptDecrypt',
    'useConfigStore',
    'preloadTypes',
    'quickLinkXss',
    'cleanup'
] as const

/** 验证结果清单的词典键（按展示顺序） */
const verifyKeys = [
    'typescriptNode',
    'typescriptWeb',
    'eslint',
    'unitTests',
    'audit',
    'build'
] as const

function getTypeLabels(): Record<string, string> {
    return {
        major: tMain('dialogMain.updateLog.typeLabels.major'),
        minor: tMain('dialogMain.updateLog.typeLabels.minor'),
        patch: tMain('dialogMain.updateLog.typeLabels.patch'),
        keep: tMain('dialogMain.updateLog.typeLabels.keep'),
        added: tMain('dialogMain.updateLog.typeLabels.added'),
        removed: tMain('dialogMain.updateLog.typeLabels.removed')
    }
}

const typeColors: Record<string, string> = {
    major: '#dc2626',
    minor: '#d97706',
    patch: '#059669',
    keep: '#6b7280',
    added: '#15803d',
    removed: '#dc2626'
}

const typeBgColors: Record<string, string> = {
    major: '#fee2e2',
    minor: '#fef3c7',
    patch: '#d1fae5',
    keep: '#e5e7eb',
    added: '#d1fae5',
    removed: '#fee2e2'
}

/** 1.3.0 重大更新区块（★ 列表，置于依赖表格之前） */
function makeHighlightSection(): string {
    const items = highlightKeys
        .map(
            (key) =>
                `<div class="highlight-item"><span class="bullet">★</span><span>${tMain('dialogMain.updateLog.highlights.' + key)}</span></div>`
        )
        .join('')
    return `
        <div class="section">
            <div class="section-title">${tMain('dialogMain.updateLog.highlightsTitle')}</div>
            <div class="highlight-box">${items}</div>
        </div>`
}

function makeUpgradeTable(group: UpgradeGroup): string {
    const typeLabels = getTypeLabels()
    const rows = group.items
        .map(
            (item) => `
        <tr>
            <td class="dep-name">${item.name}</td>
            <td class="dep-old">${item.old}</td>
            <td class="dep-new">${item.new}</td>
            <td><span class="badge" style="background:${typeBgColors[item.type]};color:${typeColors[item.type]}">${typeLabels[item.type]}</span></td>
        </tr>`
        )
        .join('')

    return `
        <div class="section">
            <div class="section-title">${tMain(group.titleKey)}</div>
            <div class="table-wrapper">
                <table class="upgrade-table">
                    <thead>
                        <tr>
                            <th>${tMain('dialogMain.updateLog.table.dependency')}</th>
                            <th>${tMain('dialogMain.updateLog.table.oldVersion')}</th>
                            <th>${tMain('dialogMain.updateLog.table.newVersion')}</th>
                            <th>${tMain('dialogMain.updateLog.table.type')}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`
}

function makeUpdateLogHtml(): string {
    const theme = getCurrentThemeStyles()

    // MEM-12：显式持有 JSDOM 实例，流程结束（正常返回与异常路径）调用 window.close() 释放内部资源
    const dom = createJSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${tMain('dialogMain.updateLog.title')}</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Microsoft YaHei", sans-serif;
            background: ${theme.backgroundColor};
            color: ${theme.textColor};
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
            user-select: none;
        }
        .title-bar {
            width: 100%; height: 32px;
            background: ${theme.titleBarGradient};
            display: flex; align-items: center; justify-content: center;
            flex-shrink: 0; position: relative;
            -webkit-app-region: drag;
        }
        .title-bar span { color: #fff; font-size: 13px; font-weight: 600; }
        .close-btn {
            position: absolute; right: 10px;
            width: 28px; height: 28px;
            border: none; background: rgba(255,255,255,0.2);
            border-radius: 50%; cursor: pointer;
            display: flex; align-items: center; justify-content: center;
            font-size: 14px; color: #fff; transition: all 0.2s;
            -webkit-app-region: no-drag;
        }
        .close-btn:hover { background: rgba(255,100,100,0.9); }
        .container { flex: 1; overflow-y: auto; padding: 24px; }
        .header { margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid ${theme.borderColor}; }
        .header h1 { font-size: 22px; margin: 0 0 8px 0; color: ${theme.textColor}; }
        .update-date { font-size: 13px; color: ${theme.secondaryTextColor}; margin: 0 0 4px 0; }
        .update-summary { font-size: 13px; color: ${theme.secondaryTextColor}; margin: 0; line-height: 1.5; }
        .section { margin-bottom: 24px; }
        .section-title {
            font-size: 15px; font-weight: 600; color: ${theme.textColor};
            margin-bottom: 12px; padding-left: 8px;
            border-left: 3px solid ${theme.accentColor};
        }
        .table-wrapper { overflow-x: auto; }
        .upgrade-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .upgrade-table th {
            text-align: left; padding: 8px 12px;
            background: ${theme.cardBackground}; color: ${theme.textColor};
            font-weight: 600; border-bottom: 2px solid ${theme.borderColor};
        }
        .upgrade-table td { padding: 8px 12px; border-bottom: 1px solid ${theme.borderColor}; }
        .dep-name { font-weight: 500; }
        .dep-old { color: ${theme.secondaryTextColor}; }
        .dep-new { color: ${theme.accentColor}; font-weight: 500; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; }
        .fix-list { display: flex; flex-direction: column; gap: 6px; }
        .fix-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .highlight-box {
            background: ${theme.cardBackground};
            border: 1px solid ${theme.borderColor};
            border-radius: 8px; padding: 12px 16px;
        }
        .highlight-item {
            display: flex; align-items: center; gap: 8px;
            font-size: 13px; padding: 3px 0; line-height: 1.5;
        }
        .bullet { color: ${theme.accentColor}; flex-shrink: 0; }
        .verify-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
        .verify-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
        .footer {
            padding: 12px 24px; text-align: center; font-size: 12px;
            color: ${theme.secondaryTextColor};
            border-top: 1px solid ${theme.borderColor};
            background: ${theme.cardBackground}; flex-shrink: 0;
        }
    </style>
</head>
<body>
    <div class="title-bar"><span>${tMain('dialogMain.updateLog.title')}</span><button class="close-btn" onclick="window.close()">×</button></div>
    <div class="container">
        <div class="header">
            <h1>📋 ${tMain('dialogMain.updateLog.heading')}</h1>
            <p class="update-date">${tMain('dialogMain.updateLog.updateDate')}</p>
            <p class="update-summary">${tMain('dialogMain.updateLog.updateSummary')}</p>
        </div>
        ${makeHighlightSection()}
        ${upgradeGroups.map(makeUpgradeTable).join('')}
        <div class="section">
            <div class="section-title">${tMain('dialogMain.updateLog.codeFixesTitle')}</div>
            <div class="fix-list">
                ${codeFixKeys.map((key) => `<div class="fix-item"><span>✅</span><span>${tMain('dialogMain.updateLog.codeFixes.' + key)}</span></div>`).join('')}
            </div>
        </div>
        <div class="section">
            <div class="section-title">${tMain('dialogMain.updateLog.verifyTitle')}</div>
            <div class="verify-grid">
                ${verifyKeys.map((key) => `<div class="verify-item"><span>✅</span><span>${tMain('dialogMain.updateLog.verify.' + key)}</span></div>`).join('')}
            </div>
        </div>
    </div>
    <div class="footer">${tMain('dialogMain.updateLog.footer')}</div>
</body>
</html>`
    )
    try {
        const document = dom.window.document

        return document.documentElement.outerHTML
    } finally {
        // MEM-12：无论正常返回还是异常，关闭 JSDOM 窗口释放内部资源
        dom.window.close()
    }
}
