import { fileMenuHandlers, codingMenuHandlers } from './menu_file'
import { editMenuHandlers } from './menu_edit'
import { viewMenuHandlers, insertMenuHandlers, settingMenuHandlers } from './menu_view'
import { toolsMenuHandlers, pluginsMenuHandlers, onlineMenuHandlers, githubMenuHandlers } from './menu_tools'
import { helpMenuHandlers } from './menu_help'

type MenuActionHandler = (mainWindow: Electron.CrossProcessExports.BrowserWindow) => void

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

const menuHandlers = {
    file: fileMenuHandlers,
    edit: editMenuHandlers,
    view: viewMenuHandlers,
    coding: codingMenuHandlers,
    insert: insertMenuHandlers,
    setting: settingMenuHandlers,
    tools: toolsMenuHandlers,
    plugins: pluginsMenuHandlers,
    online: onlineMenuHandlers,
    github: githubMenuHandlers,
    help: helpMenuHandlers,
}

function findHandler(action: string): MenuActionHandler | undefined {
    const parts = MenuActionParser.parse(action)
    if (parts.length === 0) {
        return undefined
    }

    let current: any = menuHandlers
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]
        if (current[part]) {
            if (i === parts.length - 1) {
                if (typeof current[part] === 'function') {
                    return current[part]
                }
            } else {
                current = current[part]
            }
        } else {
            return undefined
        }
    }

    return undefined
}

export function HandleBaiZeMenuAction(
    action: string,
    mainWindow: Electron.CrossProcessExports.BrowserWindow
): void {
    const handler = findHandler(action)

    if (handler) {
        try {
            handler(mainWindow)
        } catch (error) {
            console.error('Error executing menu action: ', action, ', error: ', error)
        }
    } else {
        console.warn('Unknown menu action: ', action)
    }
}

export function getAllMenuActions(): string[] {
    const actions: string[] = []

    function collectActions(obj: any, prefix: string = 'baize:menu') {
        for (const key in obj) {
            const value = obj[key]
            const action = prefix + ':' + key

            if (typeof value === 'function') {
                actions.push(action)
            } else if (typeof value === 'object') {
                collectActions(value, action)
            }
        }
    }

    collectActions(menuHandlers)
    return actions
}
