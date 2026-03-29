import { ShowHelpAboutDialog } from '../dialogs/ShowHelpAboutDialog'
import { ShowHelpContactUsDialog } from '../dialogs/ShowHelpContactUsDialog'
import { ShowTechStackDialog } from '../dialogs/ShowTechStackDialog'

// 获取构建日期

// 白泽图标SVG (简化版，用于关于页面)

/**
 * 显示关于对话框
 */

/**
 * 生成关于页面HTML
 */

// eslint-disable-next-line no-unused-vars
export function getAppHelpsMenuItem(
    mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
    const helpMenuItems: Electron.MenuItemConstructorOptions[] = [
        {
            label: '版本发布 ...待开发',
            click: () => {
                mainWindow.webContents.send('OpenFile', null)
            }
        },
        {
            type: 'separator'
        },
        {
            label: '键盘快捷方式 ...待开发',
            click: () => {
                mainWindow.webContents.send('OpenFile', null)
            }
        },
        {
            label: '使用文档',
            click: () => {
                const { shell } = require('electron')
                shell.openExternal('https://hemy08.github.io/hemynotes/')
            }
        },
        {
            label: '提交创意/意见',
            click: () => {
                const { shell } = require('electron')
                shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue/issues')
            }
        },
        {
            type: 'separator'
        },
        {
            label: '技术栈',
            click: () => {
                ShowTechStackDialog()
            }
        },
        {
            label: '关于',
            click: () => {
                ShowHelpAboutDialog()
            }
        },
        {
            label: '主页',
            click: () => {
                const { shell } = require('electron')
                shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue')
            }
        },
        {
            label: '检查更新 ...待开发',
            click: () => {
                mainWindow.webContents.send('OpenFile', null)
            }
        },
        {
            label: '联系我们',
            click: () => {
                ShowHelpContactUsDialog()
            }
        }
    ]
    return {
        label: '帮助(H)',
        enabled: true,
        accelerator: 'alt+h',
        submenu: helpMenuItems
    }
}
