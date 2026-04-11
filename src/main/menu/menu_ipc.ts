import { app, shell } from 'electron'
import * as fileUtils from "../utils/file-utils";
import * as dialogs from "../dialogs/dialogs";

/**
 * 菜单动作处理函数类型定义
 */
type MenuActionHandler = (mainWindow: Electron.CrossProcessExports.BrowserWindow) => void;

/**
 * 菜单动作解析器
 * 解析格式: baize:menu:主菜单:子菜单:动作
 */
class MenuActionParser {
    static parse(action: string): string[] {
        if (!action.startsWith('baize:menu:')) {
            return [];
        }
        return action.split(':').slice(2);
    }

    static getMainMenu(action: string): string {
        return this.parse(action)[0] || '';
    }

    static getSubMenu(action: string): string {
        return this.parse(action)[1] || '';
    }

    static getActionName(action: string): string {
        const parts = this.parse(action);
        return parts[parts.length - 1] || '';
    }
}

// ==================== 文件菜单处理器 ====================
const fileMenuHandlers = {
    'new-file': () => dialogs.ShowNewFileFolderDialog(true),
    'new-folder': () => dialogs.ShowNewFileFolderDialog(false),
    'open-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.OpenFile(mainWindow),
    'open-folder': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.OpenDirectory(mainWindow),
    'save': () => fileUtils.SaveActiveFile(),
    'save-as': () => fileUtils.SaveActiveFileAs(),
    'close-file': () => fileUtils.SaveActiveFile(),
    'reload': () => fileUtils.ReloadDirFromDisk(),
    'relaunch': () => {
        app.relaunch()
        app.quit()
    },
    'exit': () => app.quit(),

    import: {
        'word': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'word', true),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'html', true),
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'json', true),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'yaml', true),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'xml', true),
        'text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'text', true),
    },

    export: {
        'word': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.ExportToFile(mainWindow, 'word'),
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.ExportToFile(mainWindow, 'json'),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.ExportToFile(mainWindow, 'xml'),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.ExportToFile(mainWindow, 'yaml'),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.ExportToFile(mainWindow, 'html'),
        'pdf': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.ExportToFile(mainWindow, 'pdf'),
    }
};

// ==================== 编辑菜单处理器 ====================
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
};

// ==================== 视图菜单处理器 ====================
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
};

// ==================== 编码菜单处理器 ====================
const codingMenuHandlers = {
    encoding: {
        'utf8': () => {},
        'utf16-le': () => {},
        'utf16-be': () => {},
        'gbk': () => {},
        'gb2312': () => {},
        'gb18030': () => {},
        'big5': () => {},
        'big5-hkscs': () => {},
        'hex': () => {},
    },
    switch: {
        'utf8': () => {},
        'utf16-le': () => {},
        'utf16-be': () => {},
        'gbk': () => {},
        'gb2312': () => {},
        'gb18030': () => {},
        'big5': () => {},
        'big5-hkscs': () => {},
        'hex': () => {},
    }
};

// ==================== 插入菜单处理器 ====================
const insertMenuHandlers = {
    material: {
        'admonition': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            dialogs.ShowAdmonitionDialog(mainWindow)
        },
    },
    'special-text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowFontSelectDialog(mainWindow)
    },
    'math': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowMathTextDialog(mainWindow)
    },
    'md-table': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowMarkdownSheetDialog(mainWindow)
    },
    'web-link': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowWebUrlDialog(mainWindow)
    },
    'custom-template': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'template-manager': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'from-file': {
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'json', true),
        'text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'text', true),
        'ini': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'ini', true),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'yaml', true),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'xml', true),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'html', true),
        'csv': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'csv', true),
        'excel': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => fileUtils.InsertImportFormFile(mainWindow, 'excel', true),
    }
};

// ==================== 设置菜单处理器 ====================
const settingMenuHandlers = {
    'theme': () => dialogs.ShowThemeSettingDialog(),
    'system': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => dialogs.ShowSystemSettingDialog(mainWindow),
    'quick-link': () => dialogs.ShowQuickLinkSettingDialog(),
    'monaco-editor': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowEditorSettingDialog(mainWindow)
    },
};

// ==================== 工具菜单处理器 ====================
const toolsMenuHandlers = {
    'mermaid': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowMermaidEditDialog(mainWindow)
    },
    'katex': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'table': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'images': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'drawing': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
};

// ==================== 插件菜单处理器 ====================
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
};

// ==================== 在线工具菜单处理器 ====================
const onlineMenuHandlers = {
    tools: {
        'cainiao-tools': () => shell.openExternal('https://www.jyshare.com/'),
        'w3cschool-tools': () => shell.openExternal('https://www.w3cschool.cn/tools/'),
        'baibaoxiang': () => shell.openExternal('https://www.toolnb.com/'),
        'toolfk': () => shell.openExternal('https://www.toolfk.com/'),
        'json-bejson': () => shell.openExternal('https://www.bejson.com/'),
        '67tool': () => shell.openExternal('http://www.67tool.com/'),
        'toollu': () => shell.openExternal('http://www.toollu.com/'),
        'sojson-parser': () => shell.openExternal('https://www.sojson.com/'),
        'latex-editor': () => shell.openExternal('https://www.latex-project.org/'),
        'mermaid-editor': () => shell.openExternal('https://mermaid.live/'),
        'planttext-editor': () => shell.openExternal('https://www.planttext.com/'),
        'mindmap-tool': () => shell.openExternal('https://www.mindmapmaker.com/'),
        'diagrams-tool': () => shell.openExternal('https://www.diagrams.net/'),
        'plantuml-server': () => shell.openExternal('https://www.plantuml.com/plantuml'),
        'chuizi-tools': () => shell.openExternal('http://www.toolshi.com/'),
    },
    cainiao: {
        'svg-editor': () => shell.openExternal('https://www.jyshare.com/more/svgeditor/'),
        'draw-tool': () => shell.openExternal('https://www.jyshare.com/more/shapefly-diagram/'),
        'office-tools': () => shell.openExternal('https://www.jyshare.com/office/'),
        'table-generator': () => shell.openExternal('https://www.jyshare.com/front-end/7688/'),
    },
    encode: {
        'csv-to-html': () => shell.openExternal('https://www.w3cschool.cn/tools/index?name=csv2tb'),
        'sql-formatter': () => shell.openExternal('https://www.w3cschool.cn/tools/index?name=sql_formatter'),
        'fullwidth-halfwidth-converter': () => shell.openExternal('https://www.w3cschool.cn/tools/index?name=fullhalfcode'),
        'qrcode-generator': () => shell.openExternal('https://cli.im/'),
        'qrcode-decoder': () => shell.openExternal('https://www.box3.cn/tool/qrcode/decode.html'),
        'encoding-converter': () => shell.openExternal('https://www.branah.com/encoding'),
    },
    ide: {
        'webide-online': () => shell.openExternal('https://codepen.io/'),
        'html-lang': () => shell.openExternal('https://codepen.io/pen/'),
        'python-lang': () => shell.openExternal('https://www.mycompiler.io/new/python'),
        'c-lang': () => shell.openExternal('https://www.mycompiler.io/new/c'),
        'go-lang': () => shell.openExternal('https://www.mycompiler.io/new/go'),
    },
    dev: {
        'pretty-qrcode-generator': () => shell.openExternal('https://www.seventhqueen.com/product/qrdesigner'),
        'qrcode-decoder-box3': () => shell.openExternal('https://www.box3.cn/tool/qrcode/decode.html'),
        'image-format-converter': () => shell.openExternal('https://www.box3.cn/tool/img/convert.html'),
        'linux-crontab': () => shell.openExternal('https://tool.box3.cn/crontab.html'),
        'jwt-decoder': () => shell.openExternal('https://tool.box3.cn/jwt.html'),
    },
    team: {
        'taobao-fed': () => shell.openExternal('https://fed.taobao.org/'),
        'tmall-fe': () => shell.openExternal('https://tmallfe.github.io/'),
        'thx-alimama-fe': () => shell.openExternal('https://thx.github.io/'),
        'ali-nodejs-platform': () => shell.openExternal('https://www.aliyun.com/product/nodejs'),
        'baidu-fex': () => shell.openExternal('https://fex-team.github.io/'),
    },
    cloud: {
        'aliyun': () => shell.openExternal('https://www.aliyun.com/'),
        'tencent-cloud': () => shell.openExternal('https://cloud.tencent.com/'),
        'huawei-cloud': () => shell.openExternal('https://activity.huaweicloud.com/'),
        'tianyi-cloud': () => shell.openExternal('https://www.ctyun.cn/'),
        'jinshan-cloud': () => shell.openExternal('https://www.ksyun.com/'),
    }
};

// ==================== GitHub菜单处理器 ====================
const githubMenuHandlers = {
    'it-tools': () => shell.openExternal('https://it-tools.tech/'),
    'ghost-website': () => shell.openExternal('https://ghost.org/'),
    'priospace': () => shell.openExternal('https://github.com/AnoyRC/priospace'),
    'plane-project': () => shell.openExternal('https://github.com/makeplane/plane'),
    'openproject': () => shell.openExternal('https://github.com/opf/openproject'),
};

// ==================== 帮助菜单处理器 ====================
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
};

// ==================== 统一合并所有菜单处理器 ====================
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
};

/**
 * 查找菜单动作处理器
 */
function findHandler(action: string): MenuActionHandler | undefined {
    const parts = MenuActionParser.parse(action);
    if (parts.length === 0) {
        return undefined;
    }

    let current: any = menuHandlers;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (current[part]) {
            if (i === parts.length - 1) {
                if (typeof current[part] === 'function') {
                    return current[part];
                }
            } else {
                current = current[part];
            }
        } else {
            return undefined;
        }
    }

    return undefined;
}

/**
 * 处理菜单动作
 */
export function HandleBaiZeMenuAction(
    action: string,
    mainWindow: Electron.CrossProcessExports.BrowserWindow
): void {
    const handler = findHandler(action);

    if (handler) {
        try {
            handler(mainWindow);
        } catch (error) {
            console.error('Error executing menu action: ', action, ', error: ', error);
        }
    } else {
        console.warn('Unknown menu action: ', action);
    }
}

/**
 * 获取所有已注册的菜单动作
 */
export function getAllMenuActions(): string[] {
    const actions: string[] = [];

    function collectActions(obj: any, prefix: string = 'baize:menu') {
        for (const key in obj) {
            const value = obj[key];
            const action = prefix + ':' + key;

            if (typeof value === 'function') {
                actions.push(action);
            } else if (typeof value === 'object') {
                collectActions(value, action);
            }
        }
    }

    collectActions(menuHandlers);
    return actions;
}
