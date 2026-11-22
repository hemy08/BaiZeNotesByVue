/**
 * E11：工作区布局对话框宿主（动态挂载独立 Vue 应用，关闭只切显隐）。
 */
import { createApp, type App } from 'vue'
import { logger } from '../../../common/logger'
import WorkspaceLayoutDialog from './WorkspaceLayoutDialog.vue'
import {
    closeWorkspaceLayoutDialogState,
    openWorkspaceLayoutDialogState
} from './workspace-layout-state'

export const WORKSPACE_LAYOUT_HOST_ID = 'baize-workspace-layout-host'

let hostApp: App | null = null
let hostContainer: HTMLElement | null = null
let disposeGeneration = 0

async function ensureHost(): Promise<boolean> {
    if (hostApp !== null) return true
    if (typeof document === 'undefined') return false
    const generation = disposeGeneration
    try {
        if (generation !== disposeGeneration || typeof document === 'undefined') return false
        const container = document.createElement('div')
        container.id = WORKSPACE_LAYOUT_HOST_ID
        document.body.appendChild(container)
        const app = createApp(WorkspaceLayoutDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        return true
    } catch (error) {
        logger.error('[WorkspaceLayout] 挂载布局对话框宿主失败', error)
        disposeWorkspaceLayoutHost()
        return false
    }
}

/** 打开工作区布局对话框（挂载失败返回 false，不抛错） */
export async function openWorkspaceLayoutDialog(): Promise<boolean> {
    if (!(await ensureHost())) return false
    openWorkspaceLayoutDialogState()
    return true
}

/** 关闭工作区布局对话框（保留宿主，便于再次打开） */
export function closeWorkspaceLayoutDialog(): void {
    closeWorkspaceLayoutDialogState()
}

/** 释放宿主（幂等；再次打开会重新挂载） */
export function disposeWorkspaceLayoutHost(): void {
    closeWorkspaceLayoutDialogState()
    disposeGeneration += 1
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[WorkspaceLayout] 卸载布局对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
}
