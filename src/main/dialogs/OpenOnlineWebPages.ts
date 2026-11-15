import * as SystemSettingUtils from '../config'
import { logger } from '../utils/logger'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'
import { isSafeExternalUrl, normalizeSafeExternalUrl, openExternalSafely } from '../utils/security'

/**
 * C-08：在线网页窗口（远程 URL + 本地 BrowserWindow 打开模式）加固。
 *
 * 远程网页属于不可信内容，因此：
 * 1. 仅允许 http/https（打开前统一校验，file:/javascript:/data:/自定义协议直接拒绝）；
 * 2. 窗口不带任何 preload（覆盖 createDialogOptions 默认注入的 dialog preload），
 *    并显式保持 sandbox/nodeIntegration/contextIsolation 安全组合，远程页面无法接触 IPC 桥；
 * 3. 窗口内导航全部拦截（防钓鱼页面伪装、重定向替换应用界面），
 *    远程页面内 window.open 仅把 http/https 交给系统浏览器，其余协议拒绝；
 * 4. 使用安全封装打开外部链接（shell 协议白名单）。
 */
function OpenOnlineWebPageWithDialog(url: string) {
    const safeUrl = normalizeSafeExternalUrl(url)
    if (safeUrl === null) {
        logger.warn(`[Security] 已拒绝在本地窗口打开非 http/https 网页：${url}`)
        return
    }

    const localOpenWebPageDialog = windowManager.createWindow(
        'online-web-page',
        createDialogOptions({
            width: 1280,
            height: 960,
            webPreferences: {
                // 覆盖 createDialogOptions 默认注入的 DIALOG_PRELOAD：远程页面不暴露任何 electronAPI
                preload: undefined,
                sandbox: true,
                nodeIntegration: false,
                contextIsolation: true
            }
        }),
        'online-web-page',
        false
    )

    // 窗口内导航一律 deny：远程页面内的链接跳转不在本地窗口里继续，避免被钓鱼页面接管
    localOpenWebPageDialog.webContents.on('will-navigate', (event, targetUrl) => {
        event.preventDefault()
        console.warn(`[Security] 已拦截在线网页窗口内的导航：${targetUrl}`)
    })
    // 远程页面 window.open：不创建新窗口，仅 http/https 交给系统浏览器
    localOpenWebPageDialog.webContents.setWindowOpenHandler((details) => {
        if (isSafeExternalUrl(details.url)) {
            void openExternalSafely(details.url)
        } else {
            console.warn(`[Security] 已拦截在线网页窗口打开非 http/https 链接：${details.url}`)
        }
        return { action: 'deny' }
    })

    void localOpenWebPageDialog.loadURL(safeUrl)
}

function OpenOnlineWebPageWithBrowser(url: string) {
    // 统一走 shell 协议白名单封装（仅 http/https，失败仅在安全层告警）
    void openExternalSafely(url)
}

export function OpenOnlineWebPage(url: string) {
    // C-08：打开前先做协议白名单校验，非 http/https 直接拒绝（两种打开方式都不放行）
    if (!isSafeExternalUrl(url)) {
        console.warn(`[Security] 已拒绝打开非 http/https 网页：${url}`)
        return
    }
    const pluginOpenType = SystemSettingUtils.getSystemSettingValString('pluginOpen', 'browser')
    logger.info('网页打开方式： ', pluginOpenType)
    if (pluginOpenType === 'local-dialog') {
        OpenOnlineWebPageWithDialog(url)
    } else {
        OpenOnlineWebPageWithBrowser(url)
    }
}
