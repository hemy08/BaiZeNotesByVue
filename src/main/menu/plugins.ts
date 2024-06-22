// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(mainWindow: Electron.BrowserWindow) {
  const pluginsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'PlantUML Server',
      click: () => {
        global.hemy.dialog.web.plantumlServe()
      }
    },
    {
      label: 'PlantText',
      click: () => {
        global.hemy.dialog.web.plantText()
      }
    },
    {
      label: 'Mermaid 在线编辑',
      click: () => {
        global.hemy.dialog.web.mermaidLiveEdit()
      }
    },
    {
      label: '菜鸟工具',
      click: () => {
        global.hemy.dialog.jy.home()
      }
    },
    {
      label: 'SVG在线',
      click: () => {
        global.hemy.dialog.jy.svgEditor()
      }
    },
    {
      label: '菜鸟绘图工具',
      click: () => {
        global.hemy.dialog.jy.shapeFlyDiagram()
      }
    },
    {
      label: '在线流程图',
      click: () => {
        global.hemy.dialog.web.diagramsNet()
      }
    },
    {
      label: '菜鸟在线办公软件',
      click: () => {
        global.hemy.dialog.jy.office()
      }
    },
    {
      label: '思维导图',
      click: () => {
        global.hemy.dialog.web.mindLineWebapp()
      }
    },
    {
      label: 'HTML表格生成器',
      click: () => {
        global.hemy.dialog.web.frontEnd()
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
