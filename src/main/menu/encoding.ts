export const OpenWithEncode = [
  { type: 'menu', label: 'UTF-8', encoding: 'utf8:' },
  { type: 'menu', label: 'UTF-16LE', encoding: 'utf-16le' },
  { type: 'menu', label: 'UTF-16BE', encoding: 'utf-16be' },
  { type: 'separator', label: 'separator', encoding: 'separator' },
  { type: 'menu', label: 'GBK(简体中文)', encoding: 'gbk' },
  { type: 'menu', label: 'GB2312(简体中文)', encoding: 'gb2312' },
  { type: 'menu', label: 'GB18030(简体中文)', encoding: 'gb18030' },
  { type: 'menu', label: 'Big5(繁体中文)', encoding: 'big5' },
  { type: 'menu', label: 'Big5-HKSCS(繁体中文)', encoding: 'big5-hkscs' },
  { type: 'separator', label: 'separator', encoding: 'separator' },
  { type: 'menu', label: '十六进制', encoding: 'hex' },
  { type: 'nomenu', label: '注意: 请勿直接编辑乱码文件。', encoding: 'none' }
]

function GenOpenWithEncodeSubMenuItems(mainWindow: Electron.BrowserWindow) {
  return OpenWithEncode.map((item) => {
    if (item.type === 'separator') {
      return { type: 'separator' }
    } else if (item.type === 'nomenu') {
      return {
        label: item.label, // 根据类别设置标签
        enable: false
      }
    } else {
      return {
        label: item.label, // 根据类别设置标签
        click: () => {
          mainWindow.webContents.send('open-with-encoding', ittm.encoding)
        }
      }
    }
  })
}

export const ConvertToEncode = [
  { type: 'menu', label: '转为 UTF-8 编码', encoding: 'utf8:' },
  { type: 'menu', label: '转为 UTF-16 Little Endian 编码', encoding: 'utf-16le' },
  { type: 'menu', label: '转为 UTF-16 Big Endian 编码', encoding: 'utf-16be' },
  { type: 'separator', label: 'separator', encoding: 'separator' },
  { type: 'menu', label: '转为 GBK(简体中文) 编码', encoding: 'gbk' },
  { type: 'menu', label: '转为 GB2312(简体中文) 编码', encoding: 'gb2312' },
  { type: 'menu', label: '转为 GB18030(简体中文) 编码', encoding: 'gb18030' },
  { type: 'menu', label: '转为 Big5(繁体中文) 编码', encoding: 'big5' },
  { type: 'menu', label: '转为 Big5-HKSCS(繁体中文) 编码', encoding: 'big5-hkscs' },
  { type: 'separator', label: 'separator', encoding: 'separator' },
  { type: 'menu', label: '转为 十六进制 编码', encoding: 'hex' },
  { type: 'nomenu', label: '注意: 请勿直接编辑乱码文件。', encoding: 'enabled' }
]

function GenCvtEncodeSubMenuItems(mainWindow: Electron.BrowserWindow) {
  return ConvertToEncode.map((item) => {
    if (item.type === 'separator') {
      return { type: 'separator' }
    } else if (item.type === 'nomenu') {
      return {
        label: item.label, // 根据类别设置标签
        enable: false
      }
    } else {
      return {
        label: item.label, // 根据类别设置标签
        click: () => {
          mainWindow.webContents.send('convert-to-encoding', item.encoding)
        }
      }
    }
  })
}

export function getAppEncodingMenuItem(mainWindow: Electron.BrowserWindow) {
  const EncodingMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '重新用...编码打开',
      submenu: GenOpenWithEncodeSubMenuItems(mainWindow)
    },
    {
      label: '转为...编码',
      submenu: GenCvtEncodeSubMenuItems(mainWindow)
    }
  ]
  return {
    label: '编码(C)',
    enable: true,
    accelerator: 'alt+c',
    submenu: EncodingMenuItems
  }
}
