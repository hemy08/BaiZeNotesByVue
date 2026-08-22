/**
 * 版本发布说明对话框
 * 显示指定版本的发布说明
 */

import { JSDOM } from 'jsdom'
import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

interface ReleaseNoteEntry {
    version: string
    date: string
    title: string
    highlights: string[]
    features?: string[]
    fixes?: string[]
    improvements?: string[]
    techStack?: { name: string; value: string }[]
}

const releaseNotes: ReleaseNoteEntry[] = [
    {
        version: '1.2.2',
        date: '2026-08-22',
        title: 'Electron 43 重大升级',
        highlights: [
            'Electron 38 → 43，跨 5 个大版本升级',
            '同步升级 40+ 依赖包到最新版本',
            '修复 78 个 TypeScript 类型错误',
            '修复 3 个 XSS 安全风险'
        ],
        features: [
            '新增"更新日志"对话框，展示依赖升级详情',
            '关于页面新增 Monaco Editor 和 markdown-it 版本显示',
            '版本发布子菜单，支持查看各版本发布说明'
        ],
        improvements: [
            'markdown-it 14 → 15，适配 highlight 选项 API 变化',
            'monaco-editor 0.55 → 0.56，适配 hover 类型变化',
            'vue-tsc 2 → 3，关闭 noUnusedLocals 适配',
            'vitest 3 → 4，解决 Node.js 24 兼容性',
            'electron-store 8 → 11，electron-builder 24 → 26'
        ],
        fixes: [
            '修复 generate-version-config.js 在 Node.js 环境下 electron/chrome 版本为空的问题',
            '修复 ShowQuickLinkSettingDialog.ts XSS 安全风险',
            '修复 encrypt_decrypt.ts crypto API 类型安全问题',
            '修复 MermaidEditDialog.vue handleClose 生命周期 bug'
        ],
        techStack: [
            { name: 'Electron', value: '43.4.1' },
            { name: 'Vue', value: '3.5.41' },
            { name: 'Vite', value: '8.2.2' },
            { name: 'TypeScript', value: '6.0.2' },
            { name: 'Monaco Editor', value: '0.56.0' },
            { name: 'markdown-it', value: '15.0.0' }
        ]
    },
    {
        version: '1.2.1',
        date: '2026-08-16',
        title: '全量扫描与代码优化',
        highlights: [
            '使用 Deepseek 进行全量代码扫描和优化',
            '修复多个 bug 和缺陷',
            '代码质量全面提升'
        ],
        improvements: [
            '项目代码全量扫描优化',
            '修复编译和运行时缺陷'
        ]
    },
    {
        version: '1.2.0',
        date: '2026-05-10',
        title: '图标与主题优化',
        highlights: [
            '应用图标全面更新',
            '新增四个主题',
            '主题设置支持选择后立即更新'
        ],
        features: [
            '新增四个主题样式',
            '应用图标重新设计'
        ],
        improvements: [
            '主题设置选择后立即生效，无需重启',
            '删除不使用的文件，清理项目'
        ]
    },
    {
        version: '1.1.5',
        date: '2026-05-06',
        title: '对话框架构重大更新',
        highlights: [
            '将部分对话框从 JSDOM 转换为 Vue 对话框',
            '项目架构变更',
            'IPC 通信优化'
        ],
        features: [
            '对话框组件从 JSDOM 迁移到 Vue 组件',
            '消息处理逻辑重构'
        ],
        improvements: [
            'IPC 通信机制优化',
            '对话框组件更新',
            '项目架构整体变更'
        ]
    },
    {
        version: '1.1.3',
        date: '2026-05-02',
        title: '进程与文件修复',
        highlights: [
            '修复进程残留问题',
            '修复文件重新打开后未加载最新内容问题',
            '修复从磁盘重新加载后文件内容未更新问题'
        ],
        fixes: [
            '修复应用关闭后进程残留问题',
            '修复文件重新打开后未加载最新内容的问题',
            '修复从磁盘重新加载后文件内容未更新的问题'
        ]
    },
    {
        version: '1.1.2',
        date: '2026-04-26',
        title: '项目优化与 UI 样式更新',
        highlights: [
            '优化项目，删除冗余文件和函数',
            '更新主题 UI 样式标准',
            '增加窗口的模态/非模态控制'
        ],
        improvements: [
            '删除冗余文件和函数',
            '主题 UI 样式标准化',
            '窗口模态/非模态控制'
        ]
    },
    {
        version: '1.1.1',
        date: '2026-04-05',
        title: '主题配置与文件记忆',
        highlights: [
            '主题配置支持应用主题和编辑器主题分开设置',
            '增加保存文件和目录记忆功能',
            '编辑区适配主题更改'
        ],
        features: [
            '应用主题和编辑器主题分开设置',
            '应用再次打开后自动加载上次的文件和目录'
        ],
        improvements: [
            '编辑区适配主题更改'
        ]
    },
    {
        version: '1.1.0',
        date: '2026-03-30',
        title: '文件导入导出功能',
        highlights: [
            '增加文件导入导出基本功能框架',
            '修正编译打包错误'
        ],
        features: [
            '文件导入导出基本功能框架'
        ],
        fixes: [
            '修正编译打包错误'
        ]
    },
    {
        version: '1.0.2',
        date: '2026-03-15',
        title: '图标与文字调整',
        highlights: [
            '修改文字图标大小',
            '界面细节调整'
        ],
        improvements: [
            '修改文字图标大小'
        ]
    },
    {
        version: '1.0.1',
        date: '2026-03-08',
        title: '图标设计与快速链接',
        highlights: [
            '增加图标设计',
            '编译输出安装包可指定安装目录',
            '增加支持自定义快速链接'
        ],
        features: [
            '应用图标设计',
            '编译输出安装包支持自定义安装目录',
            '自定义快速链接功能'
        ]
    },
    {
        version: '1.0.0',
        date: '2025-09-13',
        title: '初始版本发布',
        highlights: [
            '白泽笔记初始版本',
            '基于 Electron + Vue + TypeScript 的 Markdown 笔记应用'
        ],
        features: [
            'Markdown 编辑与预览',
            '文件管理器',
            '主题系统',
            '插件系统'
        ]
    }
]

/**
 * 显示版本发布说明对话框
 */
export function ShowReleaseNotesDialog(version: string) {
    const windowType = `release-notes-dialog-${version}`
    const existing = windowManager.getWindowByType(windowType)
    if (existing) {
        existing.focus()
        return
    }

    const releaseDialog = windowManager.createWindow(windowType, createDialogOptions({
        width: 800,
        height: 650,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: `版本发布 v${version} - 白泽笔记`
    }), windowType, true)

    releaseDialog.setMenu(null)

    const html = makeReleaseNotesHtml(version)
    releaseDialog.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))

    releaseDialog.show()

    releaseDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        releaseDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })
}

function findReleaseNote(version: string): ReleaseNoteEntry | undefined {
    return releaseNotes.find(r => r.version === version)
}

function makeReleaseNotesHtml(version: string): string {
    const theme = getCurrentThemeStyles()
    const note = findReleaseNote(version)

    if (!note) {
        return `<!DOCTYPE html><html><body><h2>未找到版本 ${version} 的发布说明</h2></body></html>`
    }

    const highlightsHtml = note.highlights.map(h =>
        `<div class="highlight-item"><span class="bullet">★</span><span>${h}</span></div>`
    ).join('')

    const featuresHtml = note.features?.map(f =>
        `<div class="note-item"><span class="icon">✨</span><span>${f}</span></div>`
    ).join('') || ''

    const fixesHtml = note.fixes?.map(f =>
        `<div class="note-item"><span class="icon">🐛</span><span>${f}</span></div>`
    ).join('') || ''

    const improvementsHtml = note.improvements?.map(i =>
        `<div class="note-item"><span class="icon">⚡</span><span>${i}</span></div>`
    ).join('') || ''

    const techStackHtml = note.techStack?.map(t =>
        `<div class="tech-row"><span class="tech-name">${t.name}</span><span class="tech-value">v${t.value}</span></div>`
    ).join('') || ''

    const featuresSection = featuresHtml ? `
        <div class="section">
            <div class="section-title">✨ 新功能</div>
            <div class="note-list">${featuresHtml}</div>
        </div>` : ''

    const fixesSection = fixesHtml ? `
        <div class="section">
            <div class="section-title">🐛 问题修复</div>
            <div class="note-list">${fixesHtml}</div>
        </div>` : ''

    const improvementsSection = improvementsHtml ? `
        <div class="section">
            <div class="section-title">⚡ 优化改进</div>
            <div class="note-list">${improvementsHtml}</div>
        </div>` : ''

    const techStackSection = techStackHtml ? `
        <div class="section">
            <div class="section-title">🔧 技术栈</div>
            <div class="tech-list">${techStackHtml}</div>
        </div>` : ''

    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>版本发布 v${note.version} - 白泽笔记</title>
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
        .header {
            margin-bottom: 20px; padding-bottom: 16px;
            border-bottom: 1px solid ${theme.borderColor};
        }
        .version-badge {
            display: inline-block; padding: 4px 12px;
            background: ${theme.accentColor}; color: #fff;
            border-radius: 4px; font-size: 14px; font-weight: 600;
            margin-bottom: 8px;
        }
        .header h1 { font-size: 20px; margin: 0 0 6px 0; color: ${theme.textColor}; }
        .release-date { font-size: 13px; color: ${theme.secondaryTextColor}; }
        .highlight-box {
            background: ${theme.cardBackground};
            border: 1px solid ${theme.borderColor};
            border-radius: 8px; padding: 12px 16px; margin-top: 12px;
        }
        .highlight-item {
            display: flex; align-items: center; gap: 8px;
            font-size: 13px; padding: 3px 0; line-height: 1.5;
        }
        .bullet { color: ${theme.accentColor}; font-size: 14px; flex-shrink: 0; }
        .section { margin-bottom: 20px; }
        .section-title {
            font-size: 15px; font-weight: 600; color: ${theme.textColor};
            margin-bottom: 10px; padding-left: 8px;
            border-left: 3px solid ${theme.accentColor};
        }
        .note-list { display: flex; flex-direction: column; gap: 6px; }
        .note-item {
            display: flex; align-items: center; gap: 8px;
            font-size: 13px; line-height: 1.5;
        }
        .icon { flex-shrink: 0; }
        .tech-list {
            background: ${theme.cardBackground};
            border: 1px solid ${theme.borderColor};
            border-radius: 8px; padding: 10px 16px;
        }
        .tech-row {
            display: flex; justify-content: space-between;
            font-size: 13px; padding: 4px 0;
            border-bottom: 1px solid ${theme.borderColor};
        }
        .tech-row:last-child { border-bottom: none; }
        .tech-name { color: ${theme.secondaryTextColor}; }
        .tech-value { color: ${theme.accentColor}; font-weight: 500; }
        .footer {
            padding: 10px 24px; text-align: center; font-size: 12px;
            color: ${theme.secondaryTextColor};
            border-top: 1px solid ${theme.borderColor};
            background: ${theme.cardBackground}; flex-shrink: 0;
        }
    </style>
</head>
<body>
    <div class="title-bar"><span>版本发布 v${note.version} - 白泽笔记</span><button class="close-btn" onclick="window.close()">×</button></div>
    <div class="container">
        <div class="header">
            <div class="version-badge">v${note.version}</div>
            <h1>${note.title}</h1>
            <div class="release-date">发布日期：${note.date}</div>
            <div class="highlight-box">${highlightsHtml}</div>
        </div>
        ${featuresSection}
        ${fixesSection}
        ${improvementsSection}
        ${techStackSection}
    </div>
    <div class="footer">白泽笔记 v${note.version} · ${note.date}</div>
</body>
</html>`).window

    return document.documentElement.outerHTML
}