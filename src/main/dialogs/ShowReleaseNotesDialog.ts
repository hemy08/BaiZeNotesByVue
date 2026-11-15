/**
 * 版本发布说明对话框
 * 显示指定版本的发布说明
 */

import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions, createJSDOM, loadDialogHtml } from './dialog-defaults'
import { IPC } from '../../shared/ipc-channels'
import { tMain } from '../utils/i18n'

interface ReleaseNoteEntry {
    version: string
    date: string
    /** 词条键分组（完整键 = dialogMain.releaseNotes.<key>.<suffix>） */
    key: string
    highlightKeys: string[]
    featureKeys?: string[]
    fixKeys?: string[]
    improvementKeys?: string[]
    techStack?: { name: string; value: string }[]
}

/** releaseNotes 命名空间内词条键前缀 */
const RELEASE_NOTES_KEY_PREFIX = 'dialogMain.releaseNotes.'

const releaseNotes: ReleaseNoteEntry[] = [
    {
        version: '1.3.0',
        date: '2026-11-15',
        key: 'v130',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2'],
        techStack: [
            { name: 'Electron', value: '43.8.10' },
            { name: 'Vue', value: '3.5.45' },
            { name: 'Vite', value: '8.3.8' },
            { name: 'TypeScript', value: '6.0.3' },
            { name: 'Monaco Editor', value: '0.57.0' },
            { name: 'markdown-it', value: '15.0.3' }
        ]
    },
    {
        version: '1.2.2',
        date: '2026-08-22',
        key: 'v122',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3', 'highlights.h4'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3'],
        improvementKeys: [
            'improvements.i1',
            'improvements.i2',
            'improvements.i3',
            'improvements.i4',
            'improvements.i5'
        ],
        fixKeys: ['fixes.x1', 'fixes.x2', 'fixes.x3', 'fixes.x4'],
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
        key: 'v121',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        improvementKeys: ['improvements.i1', 'improvements.i2']
    },
    {
        version: '1.2.0',
        date: '2026-05-10',
        key: 'v120',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2'],
        improvementKeys: ['improvements.i1', 'improvements.i2']
    },
    {
        version: '1.1.5',
        date: '2026-05-06',
        key: 'v115',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2'],
        improvementKeys: ['improvements.i1', 'improvements.i2', 'improvements.i3']
    },
    {
        version: '1.1.3',
        date: '2026-05-02',
        key: 'v113',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        fixKeys: ['fixes.x1', 'fixes.x2', 'fixes.x3']
    },
    {
        version: '1.1.2',
        date: '2026-04-26',
        key: 'v112',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        improvementKeys: ['improvements.i1', 'improvements.i2', 'improvements.i3']
    },
    {
        version: '1.1.1',
        date: '2026-04-05',
        key: 'v111',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2'],
        improvementKeys: ['improvements.i1']
    },
    {
        version: '1.1.0',
        date: '2026-03-30',
        key: 'v110',
        highlightKeys: ['highlights.h1', 'highlights.h2'],
        featureKeys: ['features.f1'],
        fixKeys: ['fixes.x1']
    },
    {
        version: '1.0.2',
        date: '2026-03-15',
        key: 'v102',
        highlightKeys: ['highlights.h1', 'highlights.h2'],
        improvementKeys: ['improvements.i1']
    },
    {
        version: '1.0.1',
        date: '2026-03-08',
        key: 'v101',
        highlightKeys: ['highlights.h1', 'highlights.h2', 'highlights.h3'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3']
    },
    {
        version: '1.0.0',
        date: '2025-09-13',
        key: 'v100',
        highlightKeys: ['highlights.h1', 'highlights.h2'],
        featureKeys: ['features.f1', 'features.f2', 'features.f3', 'features.f4']
    }
]

/** 取分组发布说明词条（suffix 形如 highlights.h1） */
function releaseNoteText(entry: ReleaseNoteEntry, suffix: string): string {
    return tMain(RELEASE_NOTES_KEY_PREFIX + entry.key + '.' + suffix)
}

/** 生成带图标的说明列表项 HTML */
function makeNoteItems(
    entry: ReleaseNoteEntry,
    suffixes: string[] | undefined,
    icon: string
): string {
    return (suffixes || [])
        .map(
            (suffix) =>
                `<div class="note-item"><span class="icon">${icon}</span><span>${releaseNoteText(entry, suffix)}</span></div>`
        )
        .join('')
}

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

    const releaseDialog = windowManager.createWindow(
        windowType,
        createDialogOptions({
            width: 800,
            height: 650,
            minimizable: false,
            maximizable: false,
            resizable: true,
            title: tMain('dialogMain.releaseNotes.windowTitle', { version })
        }),
        windowType,
        true
    )

    releaseDialog.setMenu(null)

    const html = makeReleaseNotesHtml(version)
    loadDialogHtml(releaseDialog, html)

    releaseDialog.show()

    releaseDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        releaseDialog?.webContents.send(IPC.THEME.INIT_THEME_STYLES, theme)
    })
}

function findReleaseNote(version: string): ReleaseNoteEntry | undefined {
    return releaseNotes.find((r) => r.version === version)
}

function makeReleaseNotesHtml(version: string): string {
    const theme = getCurrentThemeStyles()
    const note = findReleaseNote(version)

    if (!note) {
        return `<!DOCTYPE html><html><body><h2>${tMain('dialogMain.releaseNotes.notFound', { version })}</h2></body></html>`
    }

    const highlightsHtml = note.highlightKeys
        .map(
            (key) =>
                `<div class="highlight-item"><span class="bullet">★</span><span>${releaseNoteText(note, key)}</span></div>`
        )
        .join('')

    const featuresHtml = makeNoteItems(note, note.featureKeys, '✨')
    const fixesHtml = makeNoteItems(note, note.fixKeys, '🐛')
    const improvementsHtml = makeNoteItems(note, note.improvementKeys, '⚡')

    const techStackHtml =
        note.techStack
            ?.map(
                (t) =>
                    `<div class="tech-row"><span class="tech-name">${t.name}</span><span class="tech-value">v${t.value}</span></div>`
            )
            .join('') || ''

    const featuresSection = featuresHtml
        ? `
        <div class="section">
            <div class="section-title">✨ ${tMain('dialogMain.releaseNotes.featuresTitle')}</div>
            <div class="note-list">${featuresHtml}</div>
        </div>`
        : ''

    const fixesSection = fixesHtml
        ? `
        <div class="section">
            <div class="section-title">🐛 ${tMain('dialogMain.releaseNotes.fixesTitle')}</div>
            <div class="note-list">${fixesHtml}</div>
        </div>`
        : ''

    const improvementsSection = improvementsHtml
        ? `
        <div class="section">
            <div class="section-title">⚡ ${tMain('dialogMain.releaseNotes.improvementsTitle')}</div>
            <div class="note-list">${improvementsHtml}</div>
        </div>`
        : ''

    const techStackSection = techStackHtml
        ? `
        <div class="section">
            <div class="section-title">🔧 ${tMain('dialogMain.releaseNotes.techStackTitle')}</div>
            <div class="tech-list">${techStackHtml}</div>
        </div>`
        : ''

    // MEM-12：显式持有 JSDOM 实例，流程结束（正常返回与异常路径）调用 window.close() 释放内部资源
    const dom = createJSDOM(
        `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${tMain('dialogMain.releaseNotes.windowTitle', { version: note.version })}</title>
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
    <div class="title-bar"><span>${tMain('dialogMain.releaseNotes.windowTitle', { version: note.version })}</span><button class="close-btn" onclick="window.close()">×</button></div>
    <div class="container">
        <div class="header">
            <div class="version-badge">v${note.version}</div>
            <h1>${releaseNoteText(note, 'title')}</h1>
            <div class="release-date">${tMain('dialogMain.releaseNotes.releaseDate', { date: note.date })}</div>
            <div class="highlight-box">${highlightsHtml}</div>
        </div>
        ${featuresSection}
        ${fixesSection}
        ${improvementsSection}
        ${techStackSection}
    </div>
    <div class="footer">${tMain('dialogMain.releaseNotes.footer', { version: note.version, date: note.date })}</div>
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
