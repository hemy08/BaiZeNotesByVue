import * as dialogs from '../dialogs/dialogs'
import * as utils from '../utils/utils'
import * as menucontext from './menucontext'
import * as templates from '../common/templates'

const InsertFromFiles = {
    json: { label: '*.json', menu_action: 'baize:menu:insert:from-file:json' },
    text: { label: '*.txt;*.log', menu_action: 'baize:menu:insert:from-file:text' },
    ini: { label: '*.ini', menu_action: 'baize:menu:insert:from-file:ini' },
    yaml: { label: '*.yaml;*.yml', menu_action: 'baize:menu:insert:from-file:yaml' },
    csv: { label: '*.csv', menu_action: 'baize:menu:insert:from-file:csv' },
    excel: { label: '*.xls;*.xlsx', menu_action: 'baize:menu:insert:from-file:excel' }
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

const insertSubMenu = {
    mermaid: {
        channel: templates.CHANNEL_INSERT_TEXTBLOCK,
        MenuContext: [...templates.MermaidPart1,...templates.MermaidPart2] },
    plantuml: {
        channel: templates.CHANNEL_INSERT_TEXTBLOCK,
        MenuContext: [ ...templates.PlantUMLPart1,...templates.PlantUMLPart2]  },
    writing: { channel: templates.CHANNEL_INSERT_WRITING, MenuContext: templates.Writing },
    textblock: { channel: templates.CHANNEL_INSERT_TEXTBLOCK, MenuContext: templates.TextBlock }
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
        {
            label: '自定义模板 ...待开发',
            click: () => mainWindow.webContents.send('OpenFile', null)
        },
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
