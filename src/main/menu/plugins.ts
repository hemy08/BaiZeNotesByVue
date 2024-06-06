// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(mainWindow: Electron.BrowserWindow) {
  const pluginsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'PlantUML Online',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenPlantUmlOnline()
        })
      }
    },
    {
      label: 'Mermaid 在线编辑',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenMermaidLiveEditor()
        })
      }
    },
    {
      label: 'Latex插件 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'JSON插件 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Yaml插件 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'xxxx ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  return {
    label: '插件(P)',
    submenu: pluginsMenuItems
  }
}
