import { fileMenuHandlers, codingMenuHandlers } from './menu-file'
import { editMenuHandlers } from './menu-edit'
import { viewMenuHandlers, insertMenuHandlers } from './menu-view'
import { toolsMenuHandlers, onlineMenuHandlers, githubMenuHandlers } from './menu-tools'
import { helpMenuHandlers } from './menu-help'
import { IPC } from '../../shared/ipc-channels'
// CQ-10：主进程统一日志出口。注意本文件另有 3 处 console.error/warn 被
// tests/unit/menu-handle.test.ts 以「精确参数」断言（Unknown menu action / Error executing
// menu action / 上报失败），迁移会改变 console 实参形态导致断言失败，故按任务约定保留。
import { logger } from '../utils/logger'

type MenuActionHandler = (mainWindow: Electron.CrossProcessExports.BrowserWindow) => unknown

// 菜单处理器树节点：叶子为处理函数，中间节点为按 id 索引的子树
type MenuHandlerValue = MenuActionHandler | MenuHandlerNode
interface MenuHandlerNode {
    [key: string]: MenuHandlerValue
}

class MenuActionParser {
    static parse(action: string): string[] {
        if (!action.startsWith('baize:menu:')) {
            return []
        }
        return action.split(':').slice(2)
    }

    static getMainMenu(action: string): string {
        return this.parse(action)[0] || ''
    }

    static getSubMenu(action: string): string {
        return this.parse(action)[1] || ''
    }

    static getActionName(action: string): string {
        const parts = this.parse(action)
        return parts[parts.length - 1] || ''
    }
}

// P2 死代码清理：
// - setting:* 四个设置对话框 handler 已删除（渲染层 menu_actions.ts 全部接管）；
// - plugins:* 整个子树已删除——渲染层 menu_actions.ts 对所有 plugins:* 动作 emit
//   EventBus 的 PLUGIN_TOOL_SHOW 直接展示组件，主进程 pluginsMenuHandlers 唯一实现
//   是向已无监听方的 'baize:dialog:open-plugin-tool' 通道 send，属死路径；
// - insert 树的 md-table/web-link 仍在渲染层拦截列表内，保持原剔除逻辑。
const insertHandlers: MenuHandlerNode = { ...insertMenuHandlers }
delete insertHandlers['md-table']
delete insertHandlers['web-link']

const menuHandlers = {
    file: fileMenuHandlers,
    edit: editMenuHandlers,
    view: viewMenuHandlers,
    coding: codingMenuHandlers,
    insert: insertHandlers,
    tools: toolsMenuHandlers,
    online: onlineMenuHandlers,
    github: githubMenuHandlers,
    help: helpMenuHandlers
}

function findHandler(action: string): MenuActionHandler | undefined {
    const parts = MenuActionParser.parse(action)
    if (parts.length === 0) {
        return undefined
    }

    let current: MenuHandlerNode = menuHandlers
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        const value = current[part]
        if (!value) {
            return undefined
        }
        if (i === parts.length - 1) {
            return typeof value === 'function' ? value : undefined
        }
        if (typeof value === 'function') {
            return undefined
        }
        current = value
    }

    return undefined
}

/** 取错误对象中适合展示给用户的文案 */
function describeMenuActionError(error: unknown): string {
    if (error instanceof Error) {
        return error.message
    }
    return String(error)
}

/**
 * FE-08：把菜单动作失败文案写入状态栏（主窗口可能已销毁，全部判空 + 兜底）。
 * tMain 经动态 import 加载：menu-handle 被 handlers.ts 在启动早期引用，
 * 静态 import i18n 链会提前带入 config 模块（与既有 lazy import 约定一致）；
 * 翻译模块不可用时退化为直接展示原始错误信息（仅供排查，不阻塞提示）。
 */
function notifyMenuActionError(
    mainWindow: Electron.CrossProcessExports.BrowserWindow | undefined,
    rawMessage: string
): void {
    const send = (message: string): void => {
        if (
            !mainWindow ||
            typeof mainWindow.isDestroyed !== 'function' ||
            mainWindow.isDestroyed()
        ) {
            return
        }
        try {
            mainWindow.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, {
                message,
                type: 'error'
            })
        } catch (notifyError) {
            console.error('Failed to report menu action error to status bar: ', notifyError)
        }
    }

    if (rawMessage === 'No active file') {
        void import('../utils/i18n.js')
            .then(({ tMain }) => tMain('mainMsg.status.noActiveFileSave'))
            .catch(() => rawMessage)
            .then(send)
        return
    }
    void import('../utils/i18n.js')
        .then(({ tMain }) => tMain('mainMsg.status.menuActionFailed', { message: rawMessage }))
        .catch(() => rawMessage)
        .then(send)
}

/**
 * FE-08：菜单动作执行失败的统一上报。
 *
 * 修复前只做 console.error——async handler 返回的 rejected promise 无人消费
 * （主进程未处理拒绝），且用户没有任何提示。这里统一：
 * 1. 记录日志（保持原错误日志格式）；
 * 2. 经 STATUS_BAR_UPDATE 通知渲染层状态栏（窗口已销毁时静默跳过）；
 * 3. "无活动文件"这类已知受控错误给出明确文案（不从主进程把英文内部异常透出）。
 */
function reportMenuActionError(
    action: string,
    mainWindow: Electron.CrossProcessExports.BrowserWindow | undefined,
    error: unknown
): void {
    console.error('Error executing menu action: ', action, ', error: ', error)

    try {
        notifyMenuActionError(mainWindow, describeMenuActionError(error))
    } catch (notifyError) {
        // 上报失败（窗口销毁/IPC 不可用）不得再次抛出，避免异常循环
        logger.error('Failed to report menu action error: ', action, notifyError)
    }
}

export function HandleBaiZeMenuAction(
    action: string,
    mainWindow: Electron.CrossProcessExports.BrowserWindow
): void {
    const handler = findHandler(action)

    if (handler) {
        try {
            const result = handler(mainWindow)
            // FE-08：async 菜单 handler（保存/打开/导入等）的 Promise 必须消费，
            // 否则失败会成为主进程未处理 Promise 拒绝（用户也看不到提示）。
            if (result && typeof (result as Promise<unknown>).then === 'function') {
                void (result as Promise<unknown>).catch((error: unknown) => {
                    reportMenuActionError(action, mainWindow, error)
                })
            }
        } catch (error) {
            reportMenuActionError(action, mainWindow, error)
        }
    } else {
        console.warn('Unknown menu action: ', action)
    }
}
