import { join } from 'path'
import type { BrowserWindowConstructorOptions, WebPreferences } from 'electron'
import * as SystemSettingUtils from '../config'
import { windowManager } from '../window/window-manager'
import { logger } from '../utils/logger'
import { registerDenyAllPermissionHandlers } from '../utils/permission-handler'
import { isSafeExternalUrl, normalizeSafeExternalUrl, openExternalSafely } from '../utils/security'

/**
 * P3-10：在线网页窗口专用内存 session 名（无 `persist:` 前缀 = 内存 session，
 * 退出即清空，不落盘到磁盘 profile）。
 *
 * 背景：历史上在线网页窗口与主渲染页共享 `defaultSession`（同一存储/缓存/配额）。
 * 远程不可信页面与本地受信页面应隔离会话；同时该 session 不走 defaultSession 的
 * 「主窗口白名单」权限处理器，必须显式安装「一律拒绝」处理器（见窗口创建处）。
 */
export const ONLINE_WEB_PARTITION = 'baize-online-web'

/**
 * 结构优化第 2 批 2.3（H6）：jsdom 运行时依赖边界清理。
 *
 * 2.1（H3）把全部主进程 JSDOM 对话框迁移为渲染层 Vue 对话框后，
 * `dialog-defaults.ts` 的 jsdom/HTML 构建助手（getJSDOM / createJSDOM /
 * createDialogHtmlUrl / loadDialogHtml / notifyReloadDirFromDisk）已零生产调用，
 * 本批随该文件一并删除；文件中唯一仍在使用的「对话框窗口默认配置」
 * （DIALOG_WEB_PREFERENCES / createDialogOptions）归并到本文件——其唯一调用方。
 *
 * 清理结果：`src/main` 不再有任何 jsdom 运行时 import/require，主进程产物
 * （out/build/main）不内联 jsdom；jsdom 仅保留为 devDependency 供 vitest 的 jsdom
 * 测试环境使用，不参与主进程 bundle。
 */

/** 对话框 preload 产物路径（sandbox 对话框默认注入；在线网页窗口会显式覆盖为 undefined） */
const DIALOG_PRELOAD = join(__dirname, '../preload/dialog.js')

/** 对话框窗口 webPreferences 安全基线：无 Node 集成、上下文隔离、sandbox 开启 */
const DIALOG_WEB_PREFERENCES: WebPreferences = {
    nodeIntegration: false,
    contextIsolation: true,
    sandbox: true,
    preload: DIALOG_PRELOAD
}

/**
 * 合并对话框窗口默认配置（frameless + 隐藏菜单栏 + 安全基线），
 * 调用方可通过 overrides / overrides.webPreferences 逐项覆盖。
 */
function createDialogOptions(
    overrides?: Partial<BrowserWindowConstructorOptions>
): BrowserWindowConstructorOptions {
    return {
        frame: false,
        autoHideMenuBar: true,
        ...overrides,
        webPreferences: {
            ...DIALOG_WEB_PREFERENCES,
            ...(overrides?.webPreferences || {})
        }
    }
}

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
                contextIsolation: true,
                // P3-10：独立内存 session，隔离远程站点与主渲染页的存储/缓存/配额
                partition: ONLINE_WEB_PARTITION
            }
        }),
        'online-web-page',
        false
    )

    // P3-10：独立 session 不被 defaultSession 的权限处理器覆盖，必须显式安装
    // 「一律拒绝」处理器（Electron 对无 handler 的 session 默认自动批准权限）。
    try {
        registerDenyAllPermissionHandlers(
            localOpenWebPageDialog.webContents.session,
            'online-web-page'
        )
    } catch (error) {
        // 窗口 webContents 已销毁等竞态：拒绝型处理器注册失败不得阻断网页打开，
        // 但必须留下告警（此时该独立 session 的权限策略退化为 Electron 默认值）。
        logger.warn('[Security] 在线网页窗口拒绝型权限处理器注册异常（P3-10）：', error)
    }

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
