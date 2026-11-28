// @vitest-environment jsdom
/**
 * E11：WorkSpace 响应布局 profile（资源管理器显隐/宽度）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import WorkSpace from '../../../src/renderer/src/components/WorkSpaceArea/WorkSpace.vue'
import {
    WORKSPACE_LAYOUT_APPLY_EVENT,
    currentWorkspaceLayout
} from '../../../src/renderer/src/components/Markdown/workspace-layout'

const stubs = {
    NaviTab: true,
    ResManager: true,
    MdContainer: true,
    PluginTools: true,
    HemyTools: true,
    ShowHtmlView: true,
    ShowPdfEditor: true
}

let wrapper: ReturnType<typeof mount> | null = null

beforeEach(() => {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined),
            removeListener: vi.fn()
        }
    })
    currentWorkspaceLayout.resourceManagerVisible = true
    currentWorkspaceLayout.resourceManagerWidth = 300
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('WorkSpace E11 布局应用', () => {
    it('应用布局后隐藏资源管理器并更新宽度', async () => {
        wrapper = mount(WorkSpace, {
            global: { stubs },
            attachTo: document.body
        })
        await nextTick()
        window.dispatchEvent(
            new CustomEvent(WORKSPACE_LAYOUT_APPLY_EVENT, {
                detail: {
                    id: 'test',
                    viewMode: 'edit',
                    resourceManagerVisible: false,
                    resourceManagerWidth: 240
                }
            })
        )
        await nextTick()
        const resource = document.getElementById('resource-manager') as HTMLElement
        expect(resource.style.display).toBe('none')
        expect(resource.style.width).toBe('240px')
        expect(currentWorkspaceLayout.resourceManagerVisible).toBe(false)
        expect(currentWorkspaceLayout.resourceManagerWidth).toBe(240)
    })

    it('应用布局后恢复资源管理器显示', async () => {
        wrapper = mount(WorkSpace, { global: { stubs }, attachTo: document.body })
        await nextTick()
        window.dispatchEvent(
            new CustomEvent(WORKSPACE_LAYOUT_APPLY_EVENT, {
                detail: {
                    id: 'test',
                    viewMode: 'edit-preview',
                    resourceManagerVisible: true,
                    resourceManagerWidth: 9999
                }
            })
        )
        await nextTick()
        const resource = document.getElementById('resource-manager') as HTMLElement
        expect(resource.style.display).not.toBe('none')
        expect(resource.style.width).toBe('800px')
        expect(currentWorkspaceLayout.resourceManagerWidth).toBe(800)
    })

    it('应用事件 detail 缺失时安全忽略（防御分支，不改变现有布局）', async () => {
        wrapper = mount(WorkSpace, { global: { stubs }, attachTo: document.body })
        await nextTick()

        // 无 detail 的 CustomEvent（detail 为 null）：handleApplyWorkspaceLayout 直接 return
        window.dispatchEvent(new CustomEvent(WORKSPACE_LAYOUT_APPLY_EVENT))
        await nextTick()

        const resource = document.getElementById('resource-manager') as HTMLElement
        expect(resource.style.display).not.toBe('none')
        expect(resource.style.width).toBe('300px')
        expect(currentWorkspaceLayout.resourceManagerVisible).toBe(true)
        expect(currentWorkspaceLayout.resourceManagerWidth).toBe(300)
    })
})
