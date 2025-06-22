import * as dialogs from '../dialogs/dialogs'

// eslint-disable-next-line no-unused-vars
export function getAppSettingMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
  const SettingMenuConfig: Array<{ label: string; click?: () => void }> = [
    { label: '系统设置', click: () => dialogs.ShowSystemSettingDialog() },
    { label: '主题设置', click: () => dialogs.ShowThemeSettingDialog() },
    { label: '快速链接设置', click: () => dialogs.ShowQuickLinkSettingDialog() },
    { label: '编辑器设置', click: () => mainWindow.webContents.send('OpenFile', null) },
    { label: 'Markdown解析器', click: () => mainWindow.webContents.send('OpenFile', null) },
    { label: 'xxxx ...待开发', click: () => mainWindow.webContents.send('OpenFile', null) }
  ]

  const settingMenuItems: Electron.MenuItemConstructorOptions[] = SettingMenuConfig.map((item) => ({
    label: item.label,
    click: item.click
  }))

  return {
    label: '设置(S)',
    enabled: true,
    accelerator: 'alt+s',
    submenu: settingMenuItems
  }
}
