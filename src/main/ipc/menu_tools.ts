import { OpenOnlineWebPage } from '../dialogs/dialogs'
import {
    TOOLS_JYSHARE, TOOLS_W3CSCHOOL, TOOLS_TOOLNB, TOOLS_TOOLFK, TOOLS_BEJSON,
    TOOLS_67TOOL, TOOLS_TOOLLU, TOOLS_SOJSON, TOOLS_LATEX, TOOLS_MERMAID_LIVE,
    TOOLS_PLANTTEXT, TOOLS_MINDMAP, TOOLS_DIAGRAMS, TOOLS_PLANTUML, TOOLS_TOOLSHI,
    CAINIAO_SVG_EDITOR, CAINIAO_DRAW, CAINIAO_OFFICE, CAINIAO_TABLE,
    ENCODE_CSV_TO_HTML, ENCODE_SQL_FORMATTER, ENCODE_FULLWIDTH_HALFWIDTH,
    ENCODE_QRCODE_GENERATOR, ENCODE_QRCODE_DECODER, ENCODE_CONVERTER,
    IDE_CODEPEN, IDE_CODEPEN_PEN, IDE_PYTHON, IDE_C, IDE_GO,
    DEV_QRCODEDESIGNER, DEV_IMG_CONVERT, DEV_CRONTAB, DEV_JWT,
    TEAM_TAOBAO_FED, TEAM_TMALL_FE, TEAM_THX, TEAM_ALIYUN_NODEJS, TEAM_BAIDU_FEX,
    CLOUD_ALIYUN, CLOUD_TENCENT, CLOUD_HUAWEI, CLOUD_CTYUN, CLOUD_KSYUN,
    GITHUB_IT_TOOLS, GITHUB_GHOST, GITHUB_PRIOSPACE, GITHUB_PLANE, GITHUB_OPENPROJECT,
} from '../constants/urls'

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
        'cainiao-tools': () => OpenOnlineWebPage(TOOLS_JYSHARE),
        'w3cschool-tools': () => OpenOnlineWebPage(TOOLS_W3CSCHOOL),
        'baibaoxiang': () => OpenOnlineWebPage(TOOLS_TOOLNB),
        'toolfk': () => OpenOnlineWebPage(TOOLS_TOOLFK),
        'json-bejson': () => OpenOnlineWebPage(TOOLS_BEJSON),
        '67tool': () => OpenOnlineWebPage(TOOLS_67TOOL),
        'toollu': () => OpenOnlineWebPage(TOOLS_TOOLLU),
        'sojson-parser': () => OpenOnlineWebPage(TOOLS_SOJSON),
        'latex-editor': () => OpenOnlineWebPage(TOOLS_LATEX),
        'mermaid-editor': () => OpenOnlineWebPage(TOOLS_MERMAID_LIVE),
        'planttext-editor': () => OpenOnlineWebPage(TOOLS_PLANTTEXT),
        'mindmap-tool': () => OpenOnlineWebPage(TOOLS_MINDMAP),
        'diagrams-tool': () => OpenOnlineWebPage(TOOLS_DIAGRAMS),
        'plantuml-server': () => OpenOnlineWebPage(TOOLS_PLANTUML),
        'chuizi-tools': () => OpenOnlineWebPage(TOOLS_TOOLSHI),
    },
    cainiao: {
        'svg-editor': () => OpenOnlineWebPage(CAINIAO_SVG_EDITOR),
        'draw-tool': () => OpenOnlineWebPage(CAINIAO_DRAW),
        'office-tools': () => OpenOnlineWebPage(CAINIAO_OFFICE),
        'table-generator': () => OpenOnlineWebPage(CAINIAO_TABLE),
    },
    encode: {
        'csv-to-html': () => OpenOnlineWebPage(ENCODE_CSV_TO_HTML),
        'sql-formatter': () => OpenOnlineWebPage(ENCODE_SQL_FORMATTER),
        'fullwidth-halfwidth-converter': () => OpenOnlineWebPage(ENCODE_FULLWIDTH_HALFWIDTH),
        'qrcode-generator': () => OpenOnlineWebPage(ENCODE_QRCODE_GENERATOR),
        'qrcode-decoder': () => OpenOnlineWebPage(ENCODE_QRCODE_DECODER),
        'encoding-converter': () => OpenOnlineWebPage(ENCODE_CONVERTER),
    },
    ide: {
        'webide-online': () => OpenOnlineWebPage(IDE_CODEPEN),
        'html-lang': () => OpenOnlineWebPage(IDE_CODEPEN_PEN),
        'python-lang': () => OpenOnlineWebPage(IDE_PYTHON),
        'c-lang': () => OpenOnlineWebPage(IDE_C),
        'go-lang': () => OpenOnlineWebPage(IDE_GO),
    },
    dev: {
        'pretty-qrcode-generator': () => OpenOnlineWebPage(DEV_QRCODEDESIGNER),
        'qrcode-decoder-box3': () => OpenOnlineWebPage(ENCODE_QRCODE_DECODER),
        'image-format-converter': () => OpenOnlineWebPage(DEV_IMG_CONVERT),
        'linux-crontab': () => OpenOnlineWebPage(DEV_CRONTAB),
        'jwt-decoder': () => OpenOnlineWebPage(DEV_JWT),
    },
    team: {
        'taobao-fed': () => OpenOnlineWebPage(TEAM_TAOBAO_FED),
        'tmall-fe': () => OpenOnlineWebPage(TEAM_TMALL_FE),
        'thx-alimama-fe': () => OpenOnlineWebPage(TEAM_THX),
        'ali-nodejs-platform': () => OpenOnlineWebPage(TEAM_ALIYUN_NODEJS),
        'baidu-fex': () => OpenOnlineWebPage(TEAM_BAIDU_FEX),
    },
    cloud: {
        'aliyun': () => OpenOnlineWebPage(CLOUD_ALIYUN),
        'tencent-cloud': () => OpenOnlineWebPage(CLOUD_TENCENT),
        'huawei-cloud': () => OpenOnlineWebPage(CLOUD_HUAWEI),
        'tianyi-cloud': () => OpenOnlineWebPage(CLOUD_CTYUN),
        'jinshan-cloud': () => OpenOnlineWebPage(CLOUD_KSYUN),
    }
}

export const githubMenuHandlers = {
    'it-tools': () => OpenOnlineWebPage(GITHUB_IT_TOOLS),
    'ghost-website': () => OpenOnlineWebPage(GITHUB_GHOST),
    'priospace': () => OpenOnlineWebPage(GITHUB_PRIOSPACE),
    'plane-project': () => OpenOnlineWebPage(GITHUB_PLANE),
    'openproject': () => OpenOnlineWebPage(GITHUB_OPENPROJECT),
}
