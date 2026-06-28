import { OpenOnlineWebPage } from '../dialogs/dialogs'

export const toolsMenuHandlers = {
    'mermaid': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mermaidEdit')
    },
    'katex': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mathText')
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

export const pluginsMenuHandlers = {
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

export const onlineMenuHandlers = {
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

export const githubMenuHandlers = {
    'it-tools': () => OpenOnlineWebPage('https://it-tools.tech/'),
    'ghost-website': () => OpenOnlineWebPage('https://ghost.org/'),
    'priospace': () => OpenOnlineWebPage('https://github.com/AnoyRC/priospace'),
    'plane-project': () => OpenOnlineWebPage('https://github.com/makeplane/plane'),
    'openproject': () => OpenOnlineWebPage('https://github.com/opf/openproject'),
}
