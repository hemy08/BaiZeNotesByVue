import {
  mermaidDiagrams,
  plantumlDiagrams,
  textBlocks,
  fileTemplates
} from '../templates/templates'
import * as dialogs from '../dialogs/dialogs'

// eslint-disable-next-line no-unused-vars
export function getAppInsertMenuItem(mainWindow: Electron.BrowserWindow) {
  const mermaidMenuItems = Object.keys(mermaidDiagrams).map((name) => {
    return {
      label: mermaidDiagrams[name].label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          mermaidDiagrams[name].diagram
        )
      }
    }
  })

  const plantumlMenuItems = Object.keys(plantumlDiagrams).map((name) => {
    return {
      label: plantumlDiagrams[name].label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          plantumlDiagrams[name].diagram
        )
      }
    }
  })

  const testBlockMenuItems = Object.keys(textBlocks).map((name) => {
    return {
      label: textBlocks[name].label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send('monaco-insert-text-block-templates', textBlocks[name].data)
      }
    }
  })

  const writeTemplatesMenuItems = Object.keys(fileTemplates).map((name) => {
    return {
      label: fileTemplates[name].label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send('monaco-insert-writing-templates', fileTemplates[name].data)
      }
    }
  })

  const insertMaterialItem: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Admonition',
      click: () => {
        dialogs.ShowAdmonitionDialog(mainWindow)
      }
    }
  ]
  const insertMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '写作模板',
      submenu: writeTemplatesMenuItems
    },
    {
      label: '文本',
      submenu: testBlockMenuItems
    },
    {
      type: 'separator'
    },
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
    {
      type: 'separator'
    },
    {
      label: 'Material',
      submenu: insertMaterialItem
    },
    {
      label: 'Mermaid',
      submenu: mermaidMenuItems
    },
    {
      label: 'PlantUML',
      submenu: plantumlMenuItems
    },
    {
      type: 'separator'
    },
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
    submenu: insertMenuItems
  }
}
