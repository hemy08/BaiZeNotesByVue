export const Encrypt: MenuContext[] = [
  { label: 'Token Generator', context: 'token-generator' },
  { label: 'Hash Text', context: 'hash-text' },
  { label: 'UUIDs 生成器', context: 'uuids-generator' },
  { label: 'ULID 生成器', context: 'ulid-generator' },
  { label: '加密/解密文本', context: 'encrypt-decrypt' },
  { label: 'Crypto加密/解密文本', context: 'crypto-encrypt-decrypt' },
  { label: 'Hmac 生成器', context: 'hmac-generator' },
  { label: 'RSA密钥对生成器', context: 'rsa-generator' }
]

export const Convert: MenuContext[] = [
  { label: '日期时间转换器', context: 'date-converter' },
  { label: '整数基转换器', context: 'base-converter' },
  { label: '罗马数字转换器', context: 'roman-numeral-converter' },
  { label: 'Color 选择器', context: 'color-converter' },
  { label: '大小写转换', context: 'case-converter' },
  { label: '文本到 ASCII 二进制', context: 'text-to-binary' },
  { label: '文本转 Unicode', context: 'text-to-unicode' },
  { label: 'YAML◀▶JSON', context: 'yaml-json-converter' },
  { label: 'YAML◀▶TOML', context: 'yaml-toml-converter' },
  { label: 'JSON◀▶TOML', context: 'json-toml-converter' },
  { label: 'JSON◀▶CSV', context: 'json-csv-converter' },
  { label: 'List 转换器', context: 'list-converter' },
  { label: 'JSON格式化', context: 'json-formatter' },
  { label: 'SQL格式化', context: 'sql-formatter' },
  { label: 'XML格式化', context: 'xml-formatter' },
  { label: 'YAML格式化', context: 'yaml-formatter' },
  { label: 'HTML格式化', context: 'html-formatter' }
]

export const NetWork: MenuContext[] = [
  { label: 'IPv4子网计算器', context: 'ipv4-subnet-calculator' },
  { label: 'Ipv4地址转换器', context: 'ipv4-address-converter' },
  { label: 'MAC地址查找', context: 'mac-address-lookup' },
  { label: 'MAC 地址生成器', context: 'mac-address-generator' },
  { label: 'IPv6 ULA生成器', context: 'ipv6-ula-generator' },
  { label: 'WiFi 二维码生成器', context: 'wifi-qrcode-generator' },
  { label: '二维码生成器', context: 'qrcode-generator' }
]

export const Information: MenuContext[] = [
  { label: 'ASCII对照表', context: 'ascii-table' },
  { label: 'HTML特殊字符查询', context: 'html-special-char-table' },
  { label: '数学公式符号', context: 'formula-symbol-table' },
  { label: '物理符号常数', context: 'physical-symbolic-constant' },
  { label: '子网掩码对照表', context: 'subnet-mask-map-table' },
  { label: 'HTTP状态码查询', context: 'http-status-code-table' },
  { label: '数字大小写', context: 'numeric-case-table' },
  { label: '常用字体对照', context: 'normal-font-style-table' },
  { label: '文件类型（MIME头）', context: 'file-name-extension-table' },
  { label: '希腊字母对照', context: 'greece-letter-table' }
]

function GenPluginToolsShow(
  mainWindow: Electron.BrowserWindow,
  items: MenuContext[]
): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    return {
      label: item.label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send('plugin-tools-show', item.context)
      }
    }
  })
}

// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
  const pluginsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '加解密插件',
      submenu: GenPluginToolsShow(mainWindow, Encrypt)
    },
    {
      label: '各类转换器',
      submenu: GenPluginToolsShow(mainWindow, Convert)
    },
    {
      label: '网络计算插件',
      submenu: GenPluginToolsShow(mainWindow, NetWork)
    },
    {
      label: '常用对照表',
      submenu: GenPluginToolsShow(mainWindow, Information)
    }
  ]

  return {
    label: '插件(P)',
    enabled: true,
    accelerator: 'alt+p',
    submenu: pluginsMenuItems
  }
}
