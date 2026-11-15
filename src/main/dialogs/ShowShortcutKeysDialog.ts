/**
 * 键盘快捷键说明对话框（FE-07）
 *
 * 背景：帮助 → 快捷键 菜单项 id `baize:menu:help:shortkeys` 在渲染层未拦截，
 * 落到主进程 `helpMenuHandlers.shortkeys`，原实现只有
 * `console.warn('[Menu] Shortcut keys help not implemented yet')` —— 用户点击后
 * 没有任何界面反馈（P2 FE-07）。
 *
 * 实现方式与既有帮助类对话框（ShowReleaseNotesDialog / ShowUpdateLogDialog）一致：
 * 主进程 JSDOM 拼只读 HTML 表格 + data: URL 加载到无边框主题对话框，不新增 IPC 通道。
 * 快捷键清单与真实绑定对齐（src/main/config/short-key-register.ts 的全局键 +
 * src/renderer/src/components/Markdown/hemy-editor-shortcut.ts 的编辑器键）。
 */

import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions, loadDialogHtml } from './dialog-defaults'
import { IPC } from '../../shared/ipc-channels'
import { tMain } from '../utils/i18n'

interface ShortcutItem {
    /** 按键组合展示文本（不含翻译） */
    keys: string
    /** 说明文案的 i18n 键 */
    labelKey: string
}

interface ShortcutGroup {
    titleKey: string
    items: ShortcutItem[]
}

/** 快捷键清单（顺序即界面展示顺序） */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        titleKey: 'dialogMain.shortcutKeys.groups.file',
        items: [
            { keys: 'Ctrl+N', labelKey: 'dialogMain.shortcutKeys.items.newFile' },
            { keys: 'Ctrl+O', labelKey: 'dialogMain.shortcutKeys.items.openFolder' },
            { keys: 'Ctrl+S', labelKey: 'dialogMain.shortcutKeys.items.save' },
            { keys: 'Ctrl+R', labelKey: 'dialogMain.shortcutKeys.items.reload' },
            { keys: 'Ctrl+Shift+R', labelKey: 'dialogMain.shortcutKeys.items.relaunch' },
            { keys: 'F4', labelKey: 'dialogMain.shortcutKeys.items.exit' }
        ]
    },
    {
        titleKey: 'dialogMain.shortcutKeys.groups.edit',
        items: [
            { keys: 'Ctrl+Z', labelKey: 'dialogMain.shortcutKeys.items.undo' },
            { keys: 'Ctrl+Y', labelKey: 'dialogMain.shortcutKeys.items.redo' },
            { keys: 'Ctrl+X', labelKey: 'dialogMain.shortcutKeys.items.cut' },
            { keys: 'Ctrl+C', labelKey: 'dialogMain.shortcutKeys.items.copy' },
            { keys: 'Ctrl+V', labelKey: 'dialogMain.shortcutKeys.items.paste' },
            { keys: 'Ctrl+F', labelKey: 'dialogMain.shortcutKeys.items.find' },
            { keys: 'Ctrl+H', labelKey: 'dialogMain.shortcutKeys.items.replace' },
            { keys: 'Ctrl+G', labelKey: 'dialogMain.shortcutKeys.items.goLine' }
        ]
    },
    {
        titleKey: 'dialogMain.shortcutKeys.groups.format',
        items: [
            { keys: 'Ctrl+1 ~ 6', labelKey: 'dialogMain.shortcutKeys.items.headings' },
            { keys: 'Ctrl+B', labelKey: 'dialogMain.shortcutKeys.items.bold' },
            { keys: 'Ctrl+I', labelKey: 'dialogMain.shortcutKeys.items.italic' },
            { keys: 'Ctrl+U', labelKey: 'dialogMain.shortcutKeys.items.underline' },
            { keys: 'Ctrl+D', labelKey: 'dialogMain.shortcutKeys.items.strikethrough' },
            { keys: 'Ctrl+K', labelKey: 'dialogMain.shortcutKeys.items.keyboard' },
            { keys: 'Ctrl+L', labelKey: 'dialogMain.shortcutKeys.items.link' },
            { keys: 'Ctrl+V', labelKey: 'dialogMain.shortcutKeys.items.pasteImage' }
        ]
    },
    {
        titleKey: 'dialogMain.shortcutKeys.groups.view',
        items: [
            { keys: 'F9', labelKey: 'dialogMain.shortcutKeys.items.editMode' },
            { keys: 'F10', labelKey: 'dialogMain.shortcutKeys.items.previewMode' },
            { keys: 'F11', labelKey: 'dialogMain.shortcutKeys.items.editPreviewMode' },
            { keys: 'F12', labelKey: 'dialogMain.shortcutKeys.items.devTools' }
        ]
    }
]

const SHORTCUT_KEYS_WINDOW_TYPE = 'shortcut-keys-dialog'

/**
 * 显示键盘快捷键说明对话框（同类型窗口已打开时聚焦复用）
 */
export function ShowShortcutKeysDialog(): void {
    const existing = windowManager.getWindowByType(SHORTCUT_KEYS_WINDOW_TYPE)
    if (existing) {
        existing.focus()
        return
    }

    const shortcutDialog = windowManager.createWindow(
        SHORTCUT_KEYS_WINDOW_TYPE,
        createDialogOptions({
            width: 620,
            height: 640,
            minimizable: false,
            maximizable: false,
            resizable: true,
            title: tMain('dialogMain.shortcutKeys.windowTitle')
        }),
        SHORTCUT_KEYS_WINDOW_TYPE,
        true
    )

    shortcutDialog.setMenu(null)
    loadDialogHtml(shortcutDialog, makeShortcutKeysHtml())
    shortcutDialog.show()

    shortcutDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        shortcutDialog?.webContents.send(IPC.THEME.INIT_THEME_STYLES, theme)
    })
}

/** 生成只读快捷键说明 HTML */
function makeShortcutKeysHtml(): string {
    const theme = getCurrentThemeStyles()

    const groupsHtml = SHORTCUT_GROUPS.map((group) => {
        const rowsHtml = group.items
            .map(
                (item) =>
                    `<div class="shortcut-row"><kbd>${item.keys}</kbd><span class="shortcut-label">${tMain(item.labelKey)}</span></div>`
            )
            .join('')
        return `<div class="section"><div class="section-title">${tMain(group.titleKey)}</div><div class="shortcut-list">${rowsHtml}</div></div>`
    }).join('')

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <title>${tMain('dialogMain.shortcutKeys.windowTitle')}</title>
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
        .container { flex: 1; overflow-y: auto; padding: 18px 24px 24px; }
        .intro {
            font-size: 12px; line-height: 1.6;
            color: ${theme.secondaryTextColor};
            background: ${theme.cardBackground};
            border: 1px solid ${theme.borderColor};
            border-radius: 6px;
            padding: 8px 12px;
            margin-bottom: 16px;
        }
        .section { margin-bottom: 16px; }
        .section-title {
            font-size: 14px; font-weight: 600;
            margin-bottom: 8px; padding-left: 8px;
            border-left: 3px solid ${theme.accentColor};
        }
        .shortcut-list {
            background: ${theme.cardBackground};
            border: 1px solid ${theme.borderColor};
            border-radius: 8px;
            padding: 4px 14px;
        }
        .shortcut-row {
            display: flex; align-items: center;
            padding: 6px 0;
            font-size: 13px;
            border-bottom: 1px solid ${theme.borderColor};
        }
        .shortcut-row:last-child { border-bottom: none; }
        kbd {
            flex: 0 0 150px;
            font-family: "Consolas", "Courier New", monospace;
            font-size: 12px;
            color: ${theme.accentColor};
        }
        .shortcut-label { flex: 1; color: ${theme.textColor}; }
        .footer {
            padding: 10px 24px; text-align: center; font-size: 12px;
            color: ${theme.secondaryTextColor};
            border-top: 1px solid ${theme.borderColor};
            background: ${theme.cardBackground}; flex-shrink: 0;
        }
    </style>
</head>
<body>
    <div class="title-bar"><span>${tMain('dialogMain.shortcutKeys.title')}</span><button class="close-btn" onclick="window.close()">×</button></div>
    <div class="container">
        <div class="intro">${tMain('dialogMain.shortcutKeys.intro')}</div>
        ${groupsHtml}
    </div>
    <div class="footer">${tMain('dialogMain.shortcutKeys.close')} · ${tMain('dialogMain.shortcutKeys.windowTitle')}</div>
</body>
</html>`
}
