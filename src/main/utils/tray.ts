/**
 * 批次 B #4：系统托盘（关闭时最小化到托盘）
 *
 * - 创建单例 Tray（图标：resources/icon 256 ico，经 app-paths.getIconPath 解析，
 *   与主窗口图标同一目录；打包后位于 process.resourcesPath/icon，开发环境为项目 resources/icon）；
 * - 托盘菜单：「显示主窗口」「退出」（i18n 词条走 tMain 的 mainMsg.tray.* 命名空间）；
 * - 托盘单击（Windows）恢复并聚焦主窗口；
 * - 「退出」置 appState 退出标志后走 app.quit()，由 before-quit → flush 落盘 →
 *   cleanupApp 既有链路完成真实退出，进程完全结束；
 * - 托盘创建必须在主进程 ready 后（createWindow / config:write 均发生在
 *   app.whenReady 之后，天然满足）；
 * - 设置开关关闭时不销毁托盘（见 config-manager.applySystemSettings 注释），
 *   仅在进程退出时由 cleanupApp → disposeTray 统一销毁。
 */
import { app, Menu, Tray } from 'electron'
import { join } from 'path'
import { getIconPath } from './app-paths'
import { appState, getLiveMainWindow } from './app-state'
import { tMain } from './i18n'
import { logger } from './logger'

/** 托盘图标文件名（resources/icon 下已有 256/512 两个尺寸，托盘用 256 即可） */
const TRAY_ICON_FILE_NAME = 'baize_mirror_dark_256x256.ico'

/** 托盘图标完整路径（开发环境 = 项目 resources/icon，打包后 = process.resourcesPath/icon） */
export function getTrayIconPath(): string {
    return join(getIconPath(), TRAY_ICON_FILE_NAME)
}

/** 恢复并聚焦主窗口（托盘单击 / 「显示主窗口」菜单共用） */
export function showMainWindow(): void {
    const win = getLiveMainWindow()
    if (!win) {
        logger.warn('[Tray] 主窗口不可用，无法从托盘恢复')
        return
    }
    if (typeof win.isMinimized === 'function' && win.isMinimized()) {
        win.restore()
    }
    win.show()
    win.focus()
}

/** 托盘「退出」：置退出标志后走真实退出（before-quit 完成 flush 落盘与清理） */
function quitFromTray(): void {
    appState.setQuitting(true)
    app.quit()
}

let tray: Tray | null = null

/**
 * 创建系统托盘（单例：已存在且未销毁时直接返回，防重复创建）。
 * 菜单文案取当前主进程语言（语言切换后 refreshMainLocale 失效缓存，下次创建时生效；
 * 已创建托盘的菜单文案不热更新——托盘为低频界面，接受该简化，注释说明）。
 */
export function ensureTrayCreated(): Tray {
    if (tray && !tray.isDestroyed()) {
        return tray
    }
    tray = new Tray(getTrayIconPath())
    tray.setToolTip(tMain('mainMsg.tray.tooltip'))
    const contextMenu = Menu.buildFromTemplate([
        { label: tMain('mainMsg.tray.showMainWindow'), click: () => showMainWindow() },
        { type: 'separator' },
        { label: tMain('mainMsg.tray.quit'), click: () => quitFromTray() }
    ])
    tray.setContextMenu(contextMenu)
    // Windows 托盘左键单击恢复主窗口（右键弹出菜单由 setContextMenu 处理）
    tray.on('click', () => showMainWindow())
    logger.info('[Tray] 系统托盘已创建')
    return tray
}

/** 销毁托盘（挂入 cleanupApp；设置开关关闭时不调用，保留托盘避免反复创建/销毁） */
export function disposeTray(): void {
    if (tray) {
        tray.destroy()
        tray = null
    }
}
