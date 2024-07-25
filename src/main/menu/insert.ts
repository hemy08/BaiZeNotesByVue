import * as dialogs from '../dialogs/dialogs'
import * as utils from '../utils/utils'
import * as menucontext from './menucontext'

const InsertFromFiles = {
  json: { label: '*.json' },
  text: { label: '*.txt;*.log' },
  ini: { label: '*.ini' },
  yaml: { label: '*.yaml;*.yml' },
  csv: { label: '*.csv' },
  excel: { label: '*.xls;*.xlsx' }
}

function GenInsertFromSubMenu(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions[] {
  return Object.keys(InsertFromFiles).map((key) => {
    return {
      label: InsertFromFiles[key].label, // 根据类别设置标签
      click: () => {
        utils.FileUtils.InsertImportFormFile(mainWindow, key, false)
      }
    }
  })
}

function GenMaterialSubMenu(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions[] {
  return [
    {
      label: 'Admonition',
      click: () => {
        dialogs.ShowAdmonitionDialog(mainWindow)
      }
    }
  ]
}

const CHANNEL_INSERT_WRITING_TEMPLATE = 'monaco-insert-writing-templates'
const CHANNEL_INSERT_TEXTBLOCK_TEMPLATE = 'monaco-insert-text-block-templates'

const insertSubMenu = {
  mermaid: { channel: CHANNEL_INSERT_TEXTBLOCK_TEMPLATE, MenuContext: menucontext.Mermaid },
  plantuml: { channel: CHANNEL_INSERT_TEXTBLOCK_TEMPLATE, MenuContext: menucontext.PlantUML },
  writing: { channel: CHANNEL_INSERT_WRITING_TEMPLATE, MenuContext: menucontext.Writing },
  textblock: { channel: CHANNEL_INSERT_TEXTBLOCK_TEMPLATE, MenuContext: menucontext.TextBlock }
}

function GenSubMenuItemInsert(
  mainWindow: Electron.BrowserWindow,
  label: string
): Electron.MenuItemConstructorOptions[] {
  return menucontext.GenElectronMenuItem(
    mainWindow,
    insertSubMenu[label].channel,
    insertSubMenu[label].MenuContext
  )
}

// eslint-disable-next-line no-unused-vars
export function getAppInsertMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
  const InsertMenuConfig: Array<{
    label: string
    click?: () => void
    submenu?: Electron.MenuItemConstructorOptions[]
  }> = [
    { label: '特殊字体', click: () => dialogs.ShowFontSelectDialog(mainWindow) },
    { label: '数学公式', click: () => dialogs.ShowMathTextDialog(mainWindow) },
    { label: 'markdown表格', click: () => dialogs.ShowMarkdownSheetDialog(mainWindow) },
    { label: '网页链接', click: () => dialogs.ShowWebUrlDialog(mainWindow) },
    { label: 'separator', click: () => {} },
    { label: '写作模板', submenu: GenSubMenuItemInsert(mainWindow, 'writing') },
    { label: '文本', submenu: GenSubMenuItemInsert(mainWindow, 'textblock') },
    { label: '来自文件', submenu: GenInsertFromSubMenu(mainWindow) },
    { label: 'separator', click: () => {} },
    { label: 'Material', submenu: GenMaterialSubMenu(mainWindow) },
    { label: 'Mermaid', submenu: GenSubMenuItemInsert(mainWindow, 'mermaid') },
    { label: 'PlantUML', submenu: GenSubMenuItemInsert(mainWindow, 'plantuml') },
    { label: 'separator', click: () => {} },
    { label: '自定义模板 ...待开发', click: () => mainWindow.webContents.send('OpenFile', null) },
    { label: '模板管理 ...待开发', click: () => mainWindow.webContents.send('OpenFile', null) }
  ]

  const insertMenuItems: Electron.MenuItemConstructorOptions[] = InsertMenuConfig.map((item) => {
    if ('separator' === item.label) {
      return { type: 'separator' }
    } else if (item.submenu) {
      return {
        label: item.label,
        submenu: item.submenu
      }
    } else {
      return {
        label: item.label,
        click: item.click
      }
    }
  })

  return {
    label: '插入(I)',
    enabled: true,
    accelerator: 'alt+i',
    submenu: insertMenuItems
  }
}
