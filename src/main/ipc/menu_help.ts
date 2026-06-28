import { shell } from 'electron'
import * as dialogs from '../dialogs/dialogs'

export const helpMenuHandlers = {
    'release-notes': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Release notes not implemented yet')
    },
    'change-log': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Change log not implemented yet')
    },
    'shortkeys': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Shortcut keys help not implemented yet')
    },
    'usage': () => shell.openExternal('https://hemy08.github.io/hemynotes/'),
    'issues': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue/issues'),
    'tech-stack': () => dialogs.ShowTechStackDialog(),
    'about': () => dialogs.ShowHelpAboutDialog(),
    'home': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue'),
    'update': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Update check not implemented yet')
    },
    'contact-us': () => dialogs.ShowHelpContactUsDialog(),
}
