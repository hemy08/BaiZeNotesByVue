import { shell } from 'electron'
import * as SystemSettingUtils from "../config";
import { logger } from "../utils/logger";
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'
function OpenOnlineWebPageWithDialog(url: string) {
    const localOpenWebPageDialog = windowManager.createWindow('online-web-page', createDialogOptions({
        width: 1280,
        height: 960
    }), 'online-web-page', false)

    localOpenWebPageDialog.loadURL(url)
}

function OpenOnlineWebPageWithBrowser(url: string) {
    shell.openExternal(url)
}

export function OpenOnlineWebPage(url: string) {
    const pluginOpenType = SystemSettingUtils.getSystemSettingValString('pluginOpen', 'browser')
    logger.info('网页打开方式： ', pluginOpenType)
    if (pluginOpenType === 'local-dialog') {
        OpenOnlineWebPageWithDialog(url)
    } else {
        OpenOnlineWebPageWithBrowser(url)
    }
}
