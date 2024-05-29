import { getAppFileMenuItem } from './file'
import { getAppEditMenuItem } from './edit'
import { getAppViewMenuItem } from './view'
import { getAppInsertMenuItem } from './insert'
import { getAppSettingMenuItem } from './setting'
import { getAppToolsMenuItem } from './tools'
import { getAppPluginsMenuItem } from './plugins'
import { getAppHelpsMenuItem } from './helps'

export function getApplicationMenu(mainWindow: Electron.BrowserWindow) {
  return [
    getAppFileMenuItem(mainWindow),
    getAppEditMenuItem(mainWindow),
    getAppViewMenuItem(mainWindow),
    getAppInsertMenuItem(mainWindow),
    getAppSettingMenuItem(mainWindow),
    getAppToolsMenuItem(mainWindow),
    getAppPluginsMenuItem(mainWindow),
    getAppHelpsMenuItem(mainWindow)
  ]
}
