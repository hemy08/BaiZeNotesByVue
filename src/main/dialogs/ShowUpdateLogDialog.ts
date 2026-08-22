/**
 * 更新日志对话框
 * 显示本次升级的依赖变更信息
 */

import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

/**
 * 显示更新日志对话框
 */
export function ShowUpdateLogDialog() {
    const existing = windowManager.getWindowByType('update-log-dialog')
    if (existing) {
        existing.focus()
        return
    }

    const updateLogDialog = windowManager.createWindow('update-log-dialog', createDialogOptions({
        width: 900,
        height: 700,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '更新日志 - 白泽笔记'
    }), 'update-log-dialog', true)

    updateLogDialog.setMenu(null)

    const html = makeUpdateLogHtml()
    updateLogDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    updateLogDialog.show()

    updateLogDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        updateLogDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })
}

interface UpgradeItem {
    name: string
    old: string
    new: string
    type: 'major' | 'minor' | 'patch' | 'keep'
}

interface UpgradeGroup {
    title: string
    items: UpgradeItem[]
}

const upgradeGroups: UpgradeGroup[] = [
    {
        title: '核心框架',
        items: [
            { name: 'electron', old: '^38.0.0', new: '^43.0.0', type: 'major' },
            { name: 'electron-builder', old: '^24.13.3', new: '^26.0.0', type: 'major' },
            { name: 'electron-vite', old: '^6.0.0-beta.1', new: '^6.0.0-beta.1', type: 'keep' },
            { name: 'vite', old: '8.0.5', new: '^8.2.2', type: 'patch' },
            { name: 'vue', old: '^3.4.27', new: '^3.5.41', type: 'minor' },
            { name: 'typescript', old: '^6.0.2', new: '^6.0.2', type: 'keep' },
            { name: 'vue-tsc', old: '^2.0.19', new: '^3.3.11', type: 'major' }
        ]
    },
    {
        title: 'Electron 生态',
        items: [
            { name: '@electron-toolkit/preload', old: '^3.0.1', new: '^3.0.2', type: 'patch' },
            { name: '@electron-toolkit/utils', old: '^3.0.0', new: '^4.0.0', type: 'major' },
            { name: '@electron-toolkit/tsconfig', old: '^1.0.1', new: '^2.0.0', type: 'major' },
            { name: '@electron-toolkit/eslint-config', old: '^1.0.2', new: '^2.1.0', type: 'major' },
            { name: '@electron-toolkit/eslint-config-ts', old: '^2.0.0', new: '^3.1.0', type: 'major' },
            { name: 'electron-store', old: '^8.2.0', new: '^11.0.2', type: 'major' },
            { name: 'electron-updater', old: '^6.1.8', new: '^6.8.9', type: 'minor' }
        ]
    },
    {
        title: '编辑器与渲染',
        items: [
            { name: 'monaco-editor', old: '^0.55.0', new: '^0.56.0', type: 'minor' },
            { name: 'mermaid', old: '^11.14.0', new: '^11.17.0', type: 'minor' },
            { name: 'katex', old: '^0.16.10', new: '^0.18.4', type: 'minor' },
            { name: 'markdown-it', old: '^14.1.0', new: '^15.0.0', type: 'major' },
            { name: 'markdown-it-anchor', old: '^9.0.1', new: '^9.2.1', type: 'minor' },
            { name: 'markdown-it-emoji', old: '^3.0.0', new: '^3.1.0', type: 'minor' },
            { name: 'highlight.js', old: '^11.9.0', new: '^11.12.0', type: 'minor' }
        ]
    },
    {
        title: '数据与工具库',
        items: [
            { name: 'jsdom', old: '^24.1.0', new: '^29.1.1', type: 'major' },
            { name: 'uuid', old: '^10.0.0', new: '^14.0.2', type: 'major' },
            { name: 'ulid', old: '^2.3.0', new: '^3.0.2', type: 'major' },
            { name: 'iconv-lite', old: '^0.6.3', new: '^0.7.3', type: 'minor' },
            { name: 'fs-extra', old: '^11.2.0', new: '^11.4.0', type: 'minor' },
            { name: 'mammoth', old: '^1.8.0', new: '^1.12.1', type: 'minor' },
            { name: 'csv-parser', old: '^3.0.0', new: '^3.2.1', type: 'minor' },
            { name: 'sharp', old: '^0.34.5', new: '^0.35.3', type: 'minor' }
        ]
    },
    {
        title: '开发工具',
        items: [
            { name: '@vitejs/plugin-vue', old: '^6.0.6', new: '^6.0.8', type: 'patch' },
            { name: '@vue/eslint-config-prettier', old: '^9.0.0', new: '^10.2.0', type: 'major' },
            { name: '@vue/eslint-config-typescript', old: '^14.7.0', new: '^14.9.0', type: 'minor' },
            { name: 'vitest', old: '^3.2.4', new: '^4.1.11', type: 'major' },
            { name: 'prettier', old: '^3.2.5', new: '^3.9.6', type: 'minor' },
            { name: 'eslint', old: '^9.26.0', new: '^9.39.4', type: 'minor' },
            { name: 'eslint-plugin-vue', old: '^9.26.0', new: '^9.33.0', type: 'minor' },
            { name: '@types/node', old: '^20.14.9', new: '^22.0.0', type: 'major' },
            { name: '@types/jsdom', old: '^21.1.6', new: '^30.0.0', type: 'major' },
            { name: 'app-builder-bin', old: '^4.0.0', new: '^4.2.0', type: 'minor' }
        ]
    }
]

const codeFixes = [
    'MaterialRender.ts: markdown-it 15 highlight 选项适配',
    'editor-options.ts: monaco-editor 0.56 hover.enabled/sticky 类型适配',
    'hemy-editor-render.ts: markdown-it 15 MarkdownIt 类型和 parse 方法适配',
    'tsconfig.web.json: vue-tsc 3.x 关闭 noUnusedLocals 适配',
    'vitest 3.x → 4.x: 解决 loupe 与 Node.js 24 兼容性',
    'encrypt_decrypt.ts: 修复 7 处 crypto API 类型安全',
    'useConfigStore.ts: 修复 DialogState 类型不匹配（7处）',
    'preload/index.d.ts: 添加 window.api/electronAPI 全局类型声明（11处）',
    'ShowQuickLinkSettingDialog.ts: 修复 XSS 安全风险（escapeHtml + renderIcon）',
    '清理 15 处未使用变量/导入'
]

const typeLabels: Record<string, string> = {
    major: '大版本',
    minor: '小版本',
    patch: '补丁',
    keep: '保持'
}

const typeColors: Record<string, string> = {
    major: '#dc2626',
    minor: '#d97706',
    patch: '#059669',
    keep: '#6b7280'
}

const typeBgColors: Record<string, string> = {
    major: '#fee2e2',
    minor: '#fef3c7',
    patch: '#d1fae5',
    keep: '#e5e7eb'
}

function makeUpgradeTable(group: UpgradeGroup): string {
    const rows = group.items.map((item) => `
        <tr>
            <td class="dep-name">${item.name}</td>
            <td class="dep-old">${item.old}</td>
            <td class="dep-new">${item.new}</td>
            <td><span class="badge" style="background:${typeBgColors[item.type]};color:${typeColors[item.type]}">${typeLabels[item.type]}</span></td>
        </tr>`).join('')

    return `
        <div class="section">
            <div class="section-title">${group.title}</div>
            <div class="table-wrapper">
                <table class="upgrade-table">
                    <thead>
                        <tr>
                            <th>依赖</th>
                            <th>旧版本</th>
                            <th>新版本</th>
                            <th>类型</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`
}

function makeUpdateLogHtml(): string {
    const theme = getCurrentThemeStyles()

    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>更新日志 - 白泽笔记</title>
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
    <div class="title-bar"><span>更新日志 - 白泽笔记</span><button class="close-btn" onclick="window.close()">×</button></div>
    <div class="container">
        <div class="header">
            <h1>📋 更新日志</h1>
            <p class="update-date">更新日期：2026年8月22日 · 版本 1.2.1</p>
            <p class="update-summary">本次更新升级 Electron 38 → 43，同步升级 40+ 依赖包，修复 78 个类型错误和 3 个 XSS 安全风险</p>
        </div>
        ${upgradeGroups.map(makeUpgradeTable).join('')}
        <div class="section">
            <div class="section-title">代码适配修复</div>
            <div class="fix-list">
                ${codeFixes.map(f => `<div class="fix-item"><span>✅</span><span>${f}</span></div>`).join('')}
            </div>
        </div>
        <div class="section">
            <div class="section-title">验证结果</div>
            <div class="verify-grid">
                <div class="verify-item"><span>✅</span><span>TypeScript (Node): 0 错误</span></div>
                <div class="verify-item"><span>✅</span><span>TypeScript (Web): 0 错误</span></div>
                <div class="verify-item"><span>✅</span><span>ESLint: 无错误</span></div>
                <div class="verify-item"><span>✅</span><span>单元测试: 21/21 通过</span></div>
                <div class="verify-item"><span>✅</span><span>开发模式: 启动成功</span></div>
                <div class="verify-item"><span>✅</span><span>打包构建: 打包成功</span></div>
            </div>
        </div>
    </div>
    <div class="footer">白泽笔记 v1.2.1 · 基于 Electron 43 + Vue 3.5 + TypeScript 6.0</div>
</body>
</html>`).window

    return document.documentElement.outerHTML
}