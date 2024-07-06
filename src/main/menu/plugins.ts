import * as dialogs from '../dialogs/dialogs'

const openUrlsInBrowser = true

// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
  const onlineTools = dialogs.WebLinks.map((item) => {
    return {
      label: item.label, // 根据类别设置标签
      click: () => {
        if (openUrlsInBrowser) {
          mainWindow.webContents.send('open-url-in-web-browser-window', item.context)
        } else {
          dialogs.OpenOnlineWebPage(item.context)
        }
      }
    }
  })

  const pluginsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '在线工具网站',
      submenu: onlineTools
    }
  ]

  return {
    label: '插件(P)',
    enabled: true,
    accelerator: 'alt+p',
    submenu: pluginsMenuItems
  }
}
