import { BrowserWindow, shell } from 'electron'
import * as SystemSettingUtils from "../themes/system-setting";
import { logger } from "../utils/logger";
function OpenOnlineWebPageWithDialog(url: string) {
    const localOpenWebPageDialog = new BrowserWindow({
        width: 1280,
        height: 960,
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
            contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
            sandbox: false
        }
    })

    localOpenWebPageDialog.loadURL(url)
}

function OpenOnlineWebPageWithBrowser(url: string) {
    shell.openExternal(url)
}

export function OpenOnlineWebPage(url: string) {
    const pluginOpenType = SystemSettingUtils.getSystemSettingValString('pluginOpen', 'browser')
    console.log('systemSettings.pluginOpen',pluginOpenType)
    logger.info('网页打开方式： ', pluginOpenType)
    if (pluginOpenType === 'local-dialog') {
        OpenOnlineWebPageWithDialog(url)
    } else {
        OpenOnlineWebPageWithBrowser(url)
    }
}
