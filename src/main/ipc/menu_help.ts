import { shell } from 'electron'
import * as dialogs from '../dialogs/dialogs'

export const helpMenuHandlers = {
    'release-notes': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'change-log': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'shortkeys': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'usage': () => shell.openExternal('https://hemy08.github.io/hemynotes/'),
    'issues': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue/issues'),
    'tech-stack': () => dialogs.ShowTechStackDialog(),
    'about': () => dialogs.ShowHelpAboutDialog(),
    'home': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue'),
    'update': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'contact-us': () => dialogs.ShowHelpContactUsDialog(),
}
