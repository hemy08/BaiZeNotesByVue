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
      label: '菜鸟工具',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenJYShareOnline()
        })
      }
    },
    {
      label: 'SVG在线',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenSvgEditorOnline()
        })
      }
    },
    {
      label: '菜鸟绘图工具',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenShapeFlyDiagramOnline()
        })
      }
    },{
      label: '在线流程图',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenDiagramsOnline()
        })
      }
    },
    {
      label: '菜鸟在线办公软件',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenJYShareOfficeOnline()
        })
      }
    },
    {
      label: '思维导图',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenMindmapOnline()
        })
      }
    },
    {
      label: 'HTML表格生成器',
      click: () => {
        import('../plugins/plugin').then((module) => {
          module.OpenHtmlSheetCreateOnline()
        })
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
