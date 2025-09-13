import * as menucontext from './menucontext'

const CHANNEL_OPEN_URL_WEB = 'open-url-in-web-browser-window'

// eslint-disable-next-line no-unused-vars
export function getAppOnlineToolHomeMenuItem(
    mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
    return {
        label: '在线工具',
        enabled: true,
        submenu: menucontext.GenElectronMenuItem(
            mainWindow,
            CHANNEL_OPEN_URL_WEB,
            menucontext.Links
        )
    }
}

export const OnlineLinkMenuItem: menucontext.SubMenuItems[] = [
    { label: '菜鸟在线工具（无序）', MenuContext: menucontext.JYShare },
    { label: '编程狮在线工具（无序）', MenuContext: menucontext.W3School },
    { label: '在线编解码工具（无序）', MenuContext: menucontext.EncodeDecode },
    { label: '在线IDE编辑器（无序）', MenuContext: menucontext.OnlineIDE },
    { label: '开发者工具（无序）', MenuContext: menucontext.DevOpsTool },
    { label: '国内知名前端团队（无序）', MenuContext: menucontext.OpenWebTeam },
    { label: '云计算平台（无序）', MenuContext: menucontext.CloudCommunity }
]

// eslint-disable-next-line no-unused-vars
export function getAppOnlineLinkMenuItem(
    mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
    return {
        label: '链接(L)',
        enabled: true,
        accelerator: 'alt+l',
        submenu: menucontext.GenElectronSubMenuItem(
            mainWindow,
            CHANNEL_OPEN_URL_WEB,
            OnlineLinkMenuItem
        )
    }
}
