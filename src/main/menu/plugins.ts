import * as dialogs from '../dialogs/dialogs'

const openUrlsInBrowser = true

// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(mainWindow: Electron.BrowserWindow) {
  const onlineTools = Object.keys(dialogs.webDialogs).map((name) => {
    return {
      label: dialogs.webDialogs[name].label, // 根据类别设置标签
      click: () => {
        if (openUrlsInBrowser) {
          mainWindow.webContents.send(
            'open-url-in-web-browser-window',
            dialogs.webDialogs[name].link
          )
        } else {
          dialogs.OpenOnlineWebPage(dialogs.webDialogs[name].link)
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
    enable: true,
    accelerator: 'alt+p',
    submenu: pluginsMenuItems
  }
}
