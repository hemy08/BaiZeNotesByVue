import { webAppDialogs, openOnlineWebPage } from '../dialogs/dialogs'

const openUrlsInBrowser = true

// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(mainWindow: Electron.BrowserWindow) {
  const onlineTools = Object.keys(webAppDialogs).map((name) => {
    return {
      label: webAppDialogs[name].label, // 根据类别设置标签
      click: () => {
        if (openUrlsInBrowser) {
          mainWindow.webContents.send('open-url-in-web-browser-window', webAppDialogs[name].link)
        } else {
          openOnlineWebPage(webAppDialogs[name].link)
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
    submenu: pluginsMenuItems
  }
}
