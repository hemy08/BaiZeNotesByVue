import * as template from '../templates/templates'
import * as dialogs from '../dialogs/dialogs'
import * as utils from '../utils/utils'

const InsertFromFiles = {
  json: { label: '*.json' },
  text: { label: '*.txt;*.log' },
  ini: { label: '*.ini' },
  yaml: { label: '*.yaml;*.yml' },
  csv: { label: '*.csv' },
  excel: { label: '*.xls;*.xlsx' }
}

function GenInsertFromSubMenu(mainWindow: Electron.BrowserWindow) {
  return Object.keys(InsertFromFiles).map((key) => {
    return {
      label: InsertFromFiles[key].label, // 根据类别设置标签
      click: () => {
        utils.FileUtils.InsertImportFormFile(mainWindow, key, false)
      }
    }
  })
}

function GenSubMenu(mainWindow: Electron.BrowserWindow, items: MenuContext, channel: string) {
  return items.map((item) => {
    return {
      label: item.label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send(channel, item.context)
      }
    }
  })
}

function GenMaterialSubMenu(mainWindow: Electron.BrowserWindow) {
  return [
    {
      label: 'Admonition',
      click: () => {
        dialogs.ShowAdmonitionDialog(mainWindow)
      }
    }
  ]
}

// eslint-disable-next-line no-unused-vars
export function getAppInsertMenuItem(mainWindow: Electron.BrowserWindow) {
  const insertMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '特殊字体',
      click: () => {
        dialogs.ShowFontSelectDialog(mainWindow)
      }
    },
    {
      label: '数学公式',
      click: () => {
        dialogs.ShowMathTextDialog(mainWindow)
      }
    },
    {
      label: 'markdown表格',
      click: () => {
        dialogs.ShowMarkdownSheetDialog(mainWindow)
      }
    },
    {
      label: '网页链接',
      click: () => {
        dialogs.ShowWebUrlDialog(mainWindow)
      }
    },
    { type: 'separator' },
    {
      label: '写作模板',
      submenu: GenSubMenu(mainWindow, template.files, 'monaco-insert-writing-templates')
    },
    {
      label: '文本',
      submenu: GenSubMenu(mainWindow, template.texts, 'monaco-insert-text-block-templates')
    },
    {
      label: '来自文件',
      submenu: GenInsertFromSubMenu(mainWindow)
    },
    { type: 'separator' },
    {
      label: 'Material',
      submenu: GenMaterialSubMenu(mainWindow)
    },
    {
      label: 'Mermaid',
      submenu: GenSubMenu(mainWindow, template.mermaid, 'monaco-insert-text-block-templates')
    },
    {
      label: 'PlantUML',
      submenu: GenSubMenu(mainWindow, template.plantuml, 'monaco-insert-text-block-templates')
    },
    { type: 'separator' },
    {
      label: '自定义模板 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '模板管理 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  return {
    label: '插入(I)',
    enable: true,
    accelerator: 'alt+i',
    submenu: insertMenuItems
  }
}
