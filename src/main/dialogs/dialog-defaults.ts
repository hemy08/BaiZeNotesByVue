import { BrowserWindowConstructorOptions, WebPreferences } from 'electron'
import { join } from 'path'

const DIALOG_PRELOAD = join(__dirname, '../preload/dialog.js')

export const DIALOG_WEB_PREFERENCES: WebPreferences = {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: DIALOG_PRELOAD
}

export function createDialogOptions(overrides?: Partial<BrowserWindowConstructorOptions>): BrowserWindowConstructorOptions {
    return {
        frame: false,
        autoHideMenuBar: true,
        ...overrides,
        webPreferences: {
            ...DIALOG_WEB_PREFERENCES,
            ...(overrides?.webPreferences || {})
        }
    }
}
