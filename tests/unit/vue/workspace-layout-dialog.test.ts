// @vitest-environment jsdom
/**
 * E11：工作区布局对话框组件契约（内置布局渲染、应用事件、保存自定义布局）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import WorkspaceLayoutDialog from '../../../src/renderer/src/components/dialogs/workspace-layout/WorkspaceLayoutDialog.vue'
import {
    WORKSPACE_LAYOUT_APPLY_EVENT,
    WORKSPACE_LAYOUT_STORAGE_KEY,
    currentWorkspaceLayout
} from '../../../src/renderer/src/components/Markdown/workspace-layout'
import {
    closeWorkspaceLayoutDialogState,
    openWorkspaceLayoutDialogState,
    workspaceLayoutDialogState
} from '../../../src/renderer/src/components/dialogs/workspace-layout/workspace-layout-state'

beforeEach(() => {
    window.localStorage.clear()
    openWorkspaceLayoutDialogState()
    currentWorkspaceLayout.viewMode = 'edit-preview'
    currentWorkspaceLayout.resourceManagerVisible = true
    currentWorkspaceLayout.resourceManagerWidth = 300
})

afterEach(() => {
    closeWorkspaceLayoutDialogState()
    document.body.innerHTML = ''
})

describe('WorkspaceLayoutDialog', () => {
    it('渲染内置布局并可应用（广播布局事件后关闭）', async () => {
        const listener = vi.fn()
        window.addEventListener(WORKSPACE_LAYOUT_APPLY_EVENT, listener)
        const wrapper = mount(WorkspaceLayoutDialog, {
            global: { stubs: { teleport: true } },
            attachTo: document.body
        })
        expect(wrapper.findAll('.profile-card')).toHaveLength(3)
        await wrapper.find('.layout-apply').trigger('click')
        expect(listener).toHaveBeenCalledTimes(1)
        expect(workspaceLayoutDialogState.visible).toBe(false)
        window.removeEventListener(WORKSPACE_LAYOUT_APPLY_EVENT, listener)
        wrapper.unmount()
    })

    it('保存当前布局写入 localStorage 并显示成功提示', async () => {
        const wrapper = mount(WorkspaceLayoutDialog, {
            global: { stubs: { teleport: true } },
            attachTo: document.body
        })
        await wrapper.find('.layout-name-input').setValue('我的布局')
        await wrapper.find('.layout-save').trigger('click')
        expect(window.localStorage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)).toContain('我的布局')
        expect(wrapper.find('.layout-message').text()).toContain('我的布局')
        wrapper.unmount()
    })
})
