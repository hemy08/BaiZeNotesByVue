/**
 * IPC 菜单处理器模块
 * 集中管理所有菜单动作的处理逻辑
 */

import { app, shell } from 'electron'
import { OpenFile, OpenDirectory, SaveActiveFile, SaveActiveFileAs, ReloadDirFromDisk } from '../utils/file-utils/file-operations'
import { InsertImportFormFile } from '../utils/file-utils/import'
import { ExportToFile } from '../utils/file-utils/export'
import * as dialogs from '../dialogs/dialogs'
import { OpenOnlineWebPage } from '../dialogs/dialogs'

type MenuActionHandler = (mainWindow: Electron.CrossProcessExports.BrowserWindow) => void

class MenuActionParser {
    static parse(action: string): string[] {
        if (!action.startsWith('baize:menu:')) {
            return []
        }
        return action.split(':').slice(2)
    }

    static getMainMenu(action: string): string {
        return this.parse(action)[0] || ''
    }

    static getSubMenu(action: string): string {
        return this.parse(action)[1] || ''
    }

    static getActionName(action: string): string {
        const parts = this.parse(action)
        return parts[parts.length - 1] || ''
    }
}

const fileMenuHandlers = {
    'new-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'createFileFolder', { isFolder: true })
    },
    'new-folder': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'createFileFolder', { isFolder: false })
    },
    'open-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => OpenFile(mainWindow),
    'open-folder': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => OpenDirectory(mainWindow),
    'save': () => SaveActiveFile(),
    'save-as': () => SaveActiveFileAs(),
    'close-file': () => SaveActiveFile(),
    'reload': () => ReloadDirFromDisk(),
    'relaunch': () => {
        app.relaunch()
        app.quit()
    },
    'exit': () => app.quit(),

    import: {
        'word': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'word', true),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'html', true),
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'json', true),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'yaml', true),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'xml', true),
        'text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'text', true),
    },

    export: {
        'word': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'word'),
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'json'),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'xml'),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'yaml'),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'html'),
        'pdf': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'pdf'),
    }
}

const editMenuHandlers = {
    'undo': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'undo')
    },
    'redo': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'redo')
    },
    'cut': () => {},
    'copy': () => {},
    'paste': () => {},
    'go-line': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'find-in-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'replace-in-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'find-in-dir': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'replace-in-dir': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
}

const viewMenuHandlers = {
    'edit-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('markdown-edit-model', null)
    },
    'preview-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('markdown-preview-model', null)
    },
    'edit-preview-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('markdown-edit-preview-model', null)
    },
    'dev-tools': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.toggleDevTools()
    },
    'toggle-resource-manager': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('menu-view-hide-display-res-manager', null)
    },
    'toggle-line-number': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('baize-notes:monaco-editor-update-options', 'lineNumbers')
    },
    'toggle-whitespace': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('baize-notes:monaco-editor-update-options', 'renderWhitespace')
    },
    'toggle-outline': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('menu-view-hide-display-res-manager', null)
    },

    fold: {
        'all-fold': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'all-expand': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level1': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level2': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level3': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level4': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level5': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level6': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
    }
}

function FileEncoding(mainWindow: Electron.CrossProcessExports.BrowserWindow, encoding: string) {
    mainWindow.webContents.send('open-with-encoding', encoding)
}

function FileConvertCoding(mainWindow: Electron.CrossProcessExports.BrowserWindow, encoding: string) {
    mainWindow.webContents.send('convert-to-encoding', encoding)
}

const codingMenuHandlers = {
    encoding: {
        'utf8': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'utf8')
        },
        'utf16-le': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'utf16-le')
        },
        'utf16-be': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'utf16-be')
        },
        'gbk': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'gbk')
        },
        'gb2312': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'gb2312')
        },
        'gb18030': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'gb18030')
        },
        'big5': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'big5')
        },
        'big5-hkscs': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'big5-hkscs')
        },
        'hex': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileEncoding(mainWindow, 'hex')
        },
    },
    switch: {
        'utf8': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'utf8')
        },
        'utf16-le': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'utf16-le')
        },
        'utf16-be': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'utf16-be')
        },
        'gbk': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'gbk')
        },
        'gb2312': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'gb2312')
        },
        'gb18030': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'gb18030')
        },
        'big5': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'big5')
        },
        'big5-hkscs': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'big5-hkscs')
        },
        'hex': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            FileConvertCoding(mainWindow, 'hex')
        },
    }
}

const insertMenuHandlers = {
    material: {
        'admonition': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-vue-dialog', 'admonition')
        },
    },
    'special-text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowFontSelectDialog(mainWindow)
    },
    'math': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mathText')
    },
    'md-table': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mdSheet')
    },
    'web-link': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'insertLink')
    },
    'custom-template': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'template-manager': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'from-file': {
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'json', false),
        'text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'text', false),
        'ini': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'ini', false),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'yaml', false),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'xml', false),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'html', false),
        'csv': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'csv', false),
        'excel': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'excel', false),
    }
}

const settingMenuHandlers = {
    'theme': () => dialogs.ShowThemeSettingDialog(),
    'system': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => dialogs.ShowSystemSettingDialog(mainWindow),
    'quick-link': () => dialogs.ShowQuickLinkSettingDialog(),
    'monaco-editor': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowEditorSettingDialog(mainWindow)
    },
}

const toolsMenuHandlers = {
    'mermaid': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mermaidEdit')
    },
    'katex': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'table': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mdSheet')
    },
    'images': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'insertImage')
    },
    'drawing': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
}

const pluginsMenuHandlers = {
    encrypt: {
        'token-generator': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'token-generator')
        },
        'hash-text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'hash-text')
        },
        'uuids-generator': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'uuids-generator')
        },
        'ulid-generator': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'ulid-generator')
        },
        'encrypt-decrypt': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'encrypt-decrypt')
        },
        'crypto-encrypt-decrypt': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'crypto-encrypt-decrypt')
        },
        'hmac-generator': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'hmac-generator')
        },
        'rsa-generator': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'rsa-generator')
        },
    },
    convert: {
        'date-converter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'date-converter')
        },
        'base-converter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'base-converter')
        },
        'roman-numeral-converter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'roman-numeral-converter')
        },
        'color-converter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'color-converter')
        },
        'number-converter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'number-converter')
        },
        'unit-converter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'unit-converter')
        },
        'json-to-yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'json-to-yaml')
        },
        'yaml-to-json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'yaml-to-json')
        },
    },
    format: {
        'json-formatter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'json-formatter')
        },
        'xml-formatter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'xml-formatter')
        },
        'yaml-formatter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'yaml-formatter')
        },
        'sql-formatter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'sql-formatter')
        },
        'html-formatter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'html-formatter')
        },
    },
    net: {
        'ip-address-converter': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'ip-address-converter')
        },
        'ipv4-subnet-calculator': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'ipv4-subnet-calculator')
        },
    },
    info: {
        'ascii-table': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-plugin-tool', 'ascii-table')
        },
    }
}

const onlineMenuHandlers = {
    tools: {
        'cainiao-tools': () => OpenOnlineWebPage('https://www.jyshare.com/'),
        'w3cschool-tools': () => OpenOnlineWebPage('https://www.w3cschool.cn/tools/'),
        'baibaoxiang': () => OpenOnlineWebPage('https://www.toolnb.com/'),
        'toolfk': () => OpenOnlineWebPage('https://www.toolfk.com/'),
        'json-bejson': () => OpenOnlineWebPage('https://www.bejson.com/'),
        '67tool': () => OpenOnlineWebPage('http://www.67tool.com/'),
        'toollu': () => OpenOnlineWebPage('http://www.toollu.com/'),
        'sojson-parser': () => OpenOnlineWebPage('https://www.sojson.com/'),
        'latex-editor': () => OpenOnlineWebPage('https://www.latex-project.org/'),
        'mermaid-editor': () => OpenOnlineWebPage('https://mermaid.live/'),
        'planttext-editor': () => OpenOnlineWebPage('https://www.planttext.com/'),
        'mindmap-tool': () => OpenOnlineWebPage('https://www.mindmapmaker.com/'),
        'diagrams-tool': () => OpenOnlineWebPage('https://www.diagrams.net/'),
        'plantuml-server': () => OpenOnlineWebPage('https://www.plantuml.com/plantuml'),
        'chuizi-tools': () => OpenOnlineWebPage('http://www.toolshi.com/'),
    },
    cainiao: {
        'svg-editor': () => OpenOnlineWebPage('https://www.jyshare.com/more/svgeditor/'),
        'draw-tool': () => OpenOnlineWebPage('https://www.jyshare.com/more/shapefly-diagram/'),
        'office-tools': () => OpenOnlineWebPage('https://www.jyshare.com/office/'),
        'table-generator': () => OpenOnlineWebPage('https://www.jyshare.com/front-end/7688/'),
    },
    encode: {
        'csv-to-html': () => OpenOnlineWebPage('https://www.w3cschool.cn/tools/index?name=csv2tb'),
        'sql-formatter': () => OpenOnlineWebPage('https://www.w3cschool.cn/tools/index?name=sql_formatter'),
        'fullwidth-halfwidth-converter': () => OpenOnlineWebPage('https://www.w3cschool.cn/tools/index?name=fullhalfcode'),
        'qrcode-generator': () => OpenOnlineWebPage('https://cli.im/'),
        'qrcode-decoder': () => OpenOnlineWebPage('https://www.box3.cn/tool/qrcode/decode.html'),
        'encoding-converter': () => OpenOnlineWebPage('https://www.branah.com/encoding'),
    },
    ide: {
        'webide-online': () => OpenOnlineWebPage('https://codepen.io/'),
        'html-lang': () => OpenOnlineWebPage('https://codepen.io/pen/'),
        'python-lang': () => OpenOnlineWebPage('https://www.mycompiler.io/new/python'),
        'c-lang': () => OpenOnlineWebPage('https://www.mycompiler.io/new/c'),
        'go-lang': () => OpenOnlineWebPage('https://www.mycompiler.io/new/go'),
    },
    dev: {
        'pretty-qrcode-generator': () => OpenOnlineWebPage('https://www.seventhqueen.com/product/qrdesigner'),
        'qrcode-decoder-box3': () => OpenOnlineWebPage('https://www.box3.cn/tool/qrcode/decode.html'),
        'image-format-converter': () => OpenOnlineWebPage('https://www.box3.cn/tool/img/convert.html'),
        'linux-crontab': () => OpenOnlineWebPage('https://tool.box3.cn/crontab.html'),
        'jwt-decoder': () => OpenOnlineWebPage('https://tool.box3.cn/jwt.html'),
    },
    team: {
        'taobao-fed': () => OpenOnlineWebPage('https://fed.taobao.org/'),
        'tmall-fe': () => OpenOnlineWebPage('https://tmallfe.github.io/'),
        'thx-alimama-fe': () => OpenOnlineWebPage('https://thx.github.io/'),
        'ali-nodejs-platform': () => OpenOnlineWebPage('https://www.aliyun.com/product/nodejs'),
        'baidu-fex': () => OpenOnlineWebPage('https://fex-team.github.io/'),
    },
    cloud: {
        'aliyun': () => OpenOnlineWebPage('https://www.aliyun.com/'),
        'tencent-cloud': () => OpenOnlineWebPage('https://cloud.tencent.com/'),
        'huawei-cloud': () => OpenOnlineWebPage('https://activity.huaweicloud.com/'),
        'tianyi-cloud': () => OpenOnlineWebPage('https://www.ctyun.cn/'),
        'jinshan-cloud': () => OpenOnlineWebPage('https://www.ksyun.com/'),
    }
}

const githubMenuHandlers = {
    'it-tools': () => OpenOnlineWebPage('https://it-tools.tech/'),
    'ghost-website': () => OpenOnlineWebPage('https://ghost.org/'),
    'priospace': () => OpenOnlineWebPage('https://github.com/AnoyRC/priospace'),
    'plane-project': () => OpenOnlineWebPage('https://github.com/makeplane/plane'),
    'openproject': () => OpenOnlineWebPage('https://github.com/opf/openproject'),
}

const helpMenuHandlers = {
    'release-notes': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'change-log': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'shortkeys': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'usage': () => shell.openExternal('https://hemy08.github.io/hemynotes/'),
    'issues': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue/issues'),
    'tech-stack': () => dialogs.ShowTechStackDialog(),
    'about': () => dialogs.ShowHelpAboutDialog(),
    'home': () => shell.openExternal('https://github.com/hemy08/BaiZeNotesByVue'),
    'update': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'contact-us': () => dialogs.ShowHelpContactUsDialog(),
}

const menuHandlers = {
    file: fileMenuHandlers,
    edit: editMenuHandlers,
    view: viewMenuHandlers,
    coding: codingMenuHandlers,
    insert: insertMenuHandlers,
    setting: settingMenuHandlers,
    tools: toolsMenuHandlers,
    plugins: pluginsMenuHandlers,
    online: onlineMenuHandlers,
    github: githubMenuHandlers,
    help: helpMenuHandlers,
}

function findHandler(action: string): MenuActionHandler | undefined {
    const parts = MenuActionParser.parse(action)
    if (parts.length === 0) {
        return undefined
    }

    let current: any = menuHandlers
    console.log('parts: ', parts);
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (current[part]) {
            if (i === parts.length - 1) {
                if (typeof current[part] === 'function') {
                    return current[part]
                }
            } else {
                current = current[part]
            }
        } else {
            return undefined
        }
    }

    return undefined
}

export function HandleBaiZeMenuAction(
    action: string,
    mainWindow: Electron.CrossProcessExports.BrowserWindow
): void {
    const handler = findHandler(action)

    if (handler) {
        try {
            handler(mainWindow)
        } catch (error) {
            console.error('Error executing menu action: ', action, ', error: ', error)
        }
    } else {
        console.warn('Unknown menu action: ', action)
    }
}

export function getAllMenuActions(): string[] {
    const actions: string[] = []

    function collectActions(obj: any, prefix: string = 'baize:menu') {
        for (const key in obj) {
            const value = obj[key]
            const action = prefix + ':' + key

            if (typeof value === 'function') {
                actions.push(action)
            } else if (typeof value === 'object') {
                collectActions(value, action)
            }
        }
    }

    collectActions(menuHandlers)
    return actions
}
