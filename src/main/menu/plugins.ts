import * as menucontext from './menucontext'

const CHANNEL_PLUGIN_TOOL_SHOW = 'plugin-tools-show'

export const PluginMenuItem: menucontext.SubMenuItems[] = [
  { label: '加解密插件', MenuContext: menucontext.Encrypt },
  { label: '各类转换器', MenuContext: menucontext.Convert },
  { label: '网络计算插件', MenuContext: menucontext.NetWork },
  { label: '常用对照表', MenuContext: menucontext.Information }
]
// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
  return {
    label: '插件(P)',
    enabled: true,
    accelerator: 'alt+p',
    submenu: menucontext.GenElectronSubMenuItem(
      mainWindow,
      CHANNEL_PLUGIN_TOOL_SHOW,
      PluginMenuItem
    )
  }
}
