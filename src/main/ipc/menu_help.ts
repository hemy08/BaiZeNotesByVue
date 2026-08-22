import { shell } from 'electron'
import * as dialogs from '../dialogs/dialogs'

export const helpMenuHandlers = {
    'release-notes': {
        'v1.2.2': () => dialogs.ShowReleaseNotesDialog('1.2.2'),
        'v1.2.1': () => dialogs.ShowReleaseNotesDialog('1.2.1'),
        'v1.2.0': () => dialogs.ShowReleaseNotesDialog('1.2.0'),
        'v1.1.5': () => dialogs.ShowReleaseNotesDialog('1.1.5'),
        'v1.1.3': () => dialogs.ShowReleaseNotesDialog('1.1.3'),
        'v1.1.2': () => dialogs.ShowReleaseNotesDialog('1.1.2'),
        'v1.1.1': () => dialogs.ShowReleaseNotesDialog('1.1.1'),
        'v1.1.0': () => dialogs.ShowReleaseNotesDialog('1.1.0'),
        'v1.0.2': () => dialogs.ShowReleaseNotesDialog('1.0.2'),
        'v1.0.1': () => dialogs.ShowReleaseNotesDialog('1.0.1'),
        'v1.0.0': () => dialogs.ShowReleaseNotesDialog('1.0.0'),
    },
    'change-log': (_mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Change log not implemented yet')
    },
    'shortkeys': (_mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Shortcut keys help not implemented yet')
    },
    'usage': () => shell.openExternal('https://hemy08.github.io/hemynotes/'),
    'issues': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue/issues'),
    'tech-stack': () => dialogs.ShowTechStackDialog(),
    'update-log': () => dialogs.ShowUpdateLogDialog(),
    'about': () => dialogs.ShowHelpAboutDialog(),
    'home': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue'),
    'update': (_mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Update check not implemented yet')
    },
    'contact-us': () => dialogs.ShowHelpContactUsDialog(),
}
