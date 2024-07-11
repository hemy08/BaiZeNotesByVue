import * as dialogs from '../dialogs/dialogs'


export const WebLinks: MenuContext[] = [
  { label: 'Mermaid在线编辑器', context: 'https://mermaid.live/edit' },
  { label: 'PlantText编辑器', context: 'https://www.planttext.com/' },
  { label: '在线思维导图工具', context: 'https://www.mindline.cn/webapp' },
  { label: '在线流程图绘制', context: 'https://app.diagrams.net/' },
  { label: 'PlantUml 网页服务器', context: 'http://www.plantuml.com/plantuml/uml/' },
]

export const JYShare: MenuContext[] = [
  { label: '菜鸟SVG图片编辑器', context: 'https://www.jyshare.com/more/svgeditor/' },
  { label: '菜鸟绘图工具', context: 'https://www.jyshare.com/more/shapefly-diagram/' },
  { label: '菜鸟在线办公工具大全', context: 'https://www.jyshare.com/office/' },
  { label: '菜鸟在线表格生成', context: 'https://www.jyshare.com/front-end/7688/' }
]

export const W3School: MenuContext[] = [
  { label: 'CSV转HTML', context: 'https://www.w3cschool.cn/tools/index?name=csv2tb' },
  { label: 'SQL格式化', context: 'https://www.w3cschool.cn/tools/index?name=sql_formatter' },
  { label: '全角/半角转换工具', context: 'https://www.w3cschool.cn/tools/index?name=fullhalfcode' },
  { label: '常用对照表', context: 'https://www.w3cschool.cn/tools/index?name=checkList' },
  { label: 'YAML Lint', context: 'https://www.yamllint.com/' },
  { label: 'HTML在线验证', context: 'https://validator.w3.org/#validate_by_uri+with_options' },
  { label: '网络计算器', context: 'https://www.w3cschool.cn/tools/index?name=ipcalc' },
  { label: 'Excel/CSV转JSON', context: 'https://www.w3cschool.cn/tools/index?name=excel_col2json' },
  { label: '网络计算器', context: 'https://www.w3cschool.cn/tools/index?name=ipcalc' },
  { label: 'XML JSON互转', context: 'https://www.w3cschool.cn/tools/index?name=xmljson' },
  { label: 'XML格式化工具', context: 'https://www.w3cschool.cn/tools/index?name=xmlformat' },
  { label: '文本美化排版', context: 'https://www.w3cschool.cn/tools/index?name=txt_paiban' },
  { label: 'HTML 拾色器', context: 'https://www.w3cschool.cn/tools/index?name=cpicker' },
  { label: 'ColorPicker', context: 'https://www.w3cschool.cn/tools/index?name=ColorPicker' },
  { label: 'WEB安全色查询', context: 'https://www.w3cschool.cn/tools/index?name=safe_color' },
  { label: '网络计算器', context: 'https://www.w3cschool.cn/tools/index?name=ipcalc' },
  { label: '网络计算器', context: 'https://www.w3cschool.cn/tools/index?name=ipcalc' }
]

export const EncodeDecode: MenuContext[] = [
  { label: '二维码在线生成工具', context: 'https://www.w3cschool.cn/tools/index?name=qrcode' },
  { label: '二维码在线解码', context: 'https://www.w3cschool.cn/tools/index?name=qrdecode' },
  { label: '在线编码转换', context: 'https://www.w3cschool.cn/tools/index?name=urlencode_decode' },
  { label: 'BASE64编解码', context: 'https://www.w3cschool.cn/tools/index?name=base64' },
  { label: 'UTF-8编码转换', context: 'https://www.w3cschool.cn/tools/index?name=convutf' },
  { label: 'Native/ASCII转换', context: 'https://www.w3cschool.cn/tools/index?name=native2ascii' },
  { label: 'Unicode/中文', context: 'https://www.w3cschool.cn/tools/index?name=unicode_chinese' },
  { label: '文件Hash计算', context: 'https://www.w3cschool.cn/tools/index?name=filehash' },
  { label: 'JSON格式化', context: 'https://www.w3cschool.cn/tools/index?name=jsonparse' },
  { label: 'Escape加密/解密', context: 'https://www.w3cschool.cn/tools/index?name=escapepwd' },
  { label: 'MD5在线加密', context: 'https://www.w3cschool.cn/tools/index?name=CreateMD5Password' },
  { label: '高强度密码生成', context: 'https://www.w3cschool.cn/tools/index?name=CreateStrongPassword' },
  { label: '摩尔斯密码', context: 'https://www.w3cschool.cn/tools/index?name=morse' },
  { label: '在线算法加密', context: 'https://www.w3cschool.cn/tools/index?name=hash_md5_sha' },
  { label: '生成htpasswd', context: 'https://www.w3cschool.cn/tools/index?name=htpasswd' },
  { label: 'URL网址16进制加密', context: 'https://www.w3cschool.cn/tools/index?name=urlencodepwd' },
  { label: '随机字符串生成', context: 'https://www.w3cschool.cn/tools/index?name=random' }
]

export const OnlineIDE: MenuContext[] = [
  { label: 'WebIDE Online', context: 'https://www.w3cschool.cn/webide' },
  { label: 'HTML语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=html' },
  { label: 'Python语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=python3' },
  { label: 'C语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=c-clang' },
  { label: 'Go语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=go' },
  { label: 'C++语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=cpp-gcc' },
  { label: 'Ruby语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=ruby' },
  { label: 'Lua语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=lua' },
  { label: 'C#语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=cs-mono' },
  { label: 'R语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=r' },
  { label: 'JavaScript语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=javascript' },
  { label: 'Pascal语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=fpc' },
  { label: 'AWK语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=awk' },
  { label: 'Emoji语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=emoji' },
  { label: 'NodeJs语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=javascript-node' },
  { label: 'TCL语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=tcl' },
  { label: 'TypeScript语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=typescript' }
]

function GenWebOnlineSubMenu(
  mainWindow: Electron.BrowserWindow,
  items: MenuContext[]
): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    return {
      label: item.label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send('open-url-in-web-browser-window', item.context)
      }
    }
  })
}
// eslint-disable-next-line no-unused-vars
export function getAppOnlineLinkMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
  const OnlineLinkMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '菜鸟工具',
      click: () => {
        mainWindow.webContents.send('open-url-in-web-browser-window', 'https://www.jyshare.com/')
      }
    },
    {
      label: 'W3CSchool工具',
      click: () => {
        mainWindow.webContents.send('open-url-in-web-browser-window', 'https://tools.w3cschool.cn/')
      }
    },
    {
      label: 'ToolFK',
      click: () => {
        mainWindow.webContents.send('open-url-in-web-browser-window', 'https://www.toolfk.com/')
      }
    },
    {
      label: 'BEJSON',
      click: () => {
        mainWindow.webContents.send('open-url-in-web-browser-window', 'https://www.bejson.com/')
      }
    },
    {
      label: '即时工具67tool',
      click: () => {
        mainWindow.webContents.send('open-url-in-web-browser-window', 'https://www.67tool.com/')
      }
    },
    {
      label: '在线工具ToolLu',
      click: () => {
        mainWindow.webContents.send('open-url-in-web-browser-window', 'https://tool.lu/')
      }
    },
    { type: 'separator' },
    {
      label: '流程图网站',
      submenu: GenWebOnlineSubMenu(mainWindow, WebLinks)
    },
    {
      label: '菜鸟在线工具',
      submenu: GenWebOnlineSubMenu(mainWindow, JYShare)
    },
    {
      label: '编程狮在线工具',
      submenu: GenWebOnlineSubMenu(mainWindow, W3School)
    },
    {
      label: '在线编解码工具',
      submenu: GenWebOnlineSubMenu(mainWindow, EncodeDecode)
    },
    {
      label: '在线IDE编辑器',
      submenu: GenWebOnlineSubMenu(mainWindow, OnlineIDE)
    }
  ]

  return {
    label: '链接(L)',
    enabled: true,
    accelerator: 'alt+l',
    submenu: OnlineLinkMenuItems
  }
}
