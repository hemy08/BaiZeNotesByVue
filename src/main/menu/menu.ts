import { getAppFileMenuItem } from './file'
import { getAppEditMenuItem } from './edit'
import { getAppViewMenuItem } from './view'
import { getAppInsertMenuItem } from './insert'
import { getAppSettingMenuItem } from './setting'
import { getAppToolsMenuItem } from './tools'
import { getAppPluginsMenuItem } from './plugins'
import { getAppHelpsMenuItem } from './helps'
import { getAppEncodingMenuItem } from './encoding'
import { getAppOnlineToolHomeMenuItem, getAppOnlineLinkMenuItem } from './links'

export function getApplicationMenu(
  mainWindow: Electron.CrossProcessExports.BrowserWindow
): Electron.MenuItemConstructorOptions[] {
  return [
    getAppFileMenuItem(mainWindow),
    getAppEditMenuItem(mainWindow),
    getAppViewMenuItem(mainWindow),
    getAppEncodingMenuItem(mainWindow),
    getAppInsertMenuItem(mainWindow),
    getAppSettingMenuItem(mainWindow),
    getAppToolsMenuItem(mainWindow),
    getAppPluginsMenuItem(mainWindow),
    getAppOnlineToolHomeMenuItem(mainWindow),
    getAppOnlineLinkMenuItem(mainWindow),
    getAppHelpsMenuItem(mainWindow)
  ]
}
