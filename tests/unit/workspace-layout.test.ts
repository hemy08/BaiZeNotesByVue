// @vitest-environment jsdom
/**
 * E11：工作区布局 / 多配置纯逻辑与事件契约。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    BUILTIN_WORKSPACE_LAYOUTS,
    WORKSPACE_LAYOUT_APPLY_EVENT,
    WORKSPACE_LAYOUT_MAX_WIDTH,
    WORKSPACE_LAYOUT_MIN_WIDTH,
    WORKSPACE_LAYOUT_STORAGE_KEY,
    applyWorkspaceLayout,
    currentWorkspaceLayout,
    deleteCustomWorkspaceLayout,
    getAllWorkspaceLayouts,
    loadCustomWorkspaceLayouts,
    normalizeWorkspaceLayoutWidth,
    saveCurrentWorkspaceLayout,
    snapshotCurrentWorkspaceLayout,
    updateCurrentWorkspaceResourceState,
    updateCurrentWorkspaceViewMode
} from '../../src/renderer/src/components/Markdown/workspace-layout'

beforeEach(() => {
    window.localStorage.clear()
    currentWorkspaceLayout.viewMode = 'edit-preview'
    currentWorkspaceLayout.resourceManagerVisible = true
    currentWorkspaceLayout.resourceManagerWidth = 300
})

describe('workspace layout 纯逻辑', () => {
    it('内置布局包含写作/研究/项目三种配置', () => {
        expect(BUILTIN_WORKSPACE_LAYOUTS.map((item) => item.id)).toEqual([
            'builtin-writing',
            'builtin-research',
            'builtin-project'
        ])
        expect(getAllWorkspaceLayouts().slice(0, 3)).toEqual(BUILTIN_WORKSPACE_LAYOUTS)
    })

    it('宽度钳制在安全范围内，非法值回退 300', () => {
        expect(normalizeWorkspaceLayoutWidth(120)).toBe(WORKSPACE_LAYOUT_MIN_WIDTH)
        expect(normalizeWorkspaceLayoutWidth(9999)).toBe(WORKSPACE_LAYOUT_MAX_WIDTH)
        expect(normalizeWorkspaceLayoutWidth(Number.NaN)).toBe(300)
        expect(normalizeWorkspaceLayoutWidth('320')).toBe(320)
    })

    it('保存当前布局并持久化；同名覆盖更新', () => {
        updateCurrentWorkspaceViewMode('preview')
        updateCurrentWorkspaceResourceState(false, 260)
        const first = saveCurrentWorkspaceLayout('预览布局')
        expect(first).not.toBeNull()
        expect(loadCustomWorkspaceLayouts()).toHaveLength(1)
        expect(loadCustomWorkspaceLayouts()[0]).toMatchObject({
            name: '预览布局',
            viewMode: 'preview',
            resourceManagerVisible: false,
            resourceManagerWidth: 260
        })

        updateCurrentWorkspaceResourceState(true, 340)
        const second = saveCurrentWorkspaceLayout('预览布局')
        expect(second?.id).toBe(first?.id)
        const stored = loadCustomWorkspaceLayouts()
        expect(stored).toHaveLength(1)
        expect(stored[0].resourceManagerWidth).toBe(340)
    })

    it('空/超长名称拒绝保存，删除只影响自定义布局', () => {
        expect(saveCurrentWorkspaceLayout('')).toBeNull()
        expect(saveCurrentWorkspaceLayout('x'.repeat(41))).toBeNull()
        const saved = saveCurrentWorkspaceLayout('项目布局')!
        expect(deleteCustomWorkspaceLayout(saved.id)).toBe(true)
        expect(loadCustomWorkspaceLayouts()).toHaveLength(0)
        expect(deleteCustomWorkspaceLayout('builtin-writing')).toBe(false)
        expect(getAllWorkspaceLayouts().length).toBe(BUILTIN_WORKSPACE_LAYOUTS.length)
    })

    it('localStorage 损坏时回退空列表', () => {
        window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, '{not-json')
        expect(loadCustomWorkspaceLayouts()).toEqual([])
    })

    it('localStorage 非数组/非法条目/内置条目会被过滤', () => {
        window.localStorage.setItem(WORKSPACE_LAYOUT_STORAGE_KEY, '"not-array"')
        expect(loadCustomWorkspaceLayouts()).toEqual([])
        window.localStorage.setItem(
            WORKSPACE_LAYOUT_STORAGE_KEY,
            JSON.stringify([
                { id: 'bad' },
                {
                    id: 'builtin-x',
                    builtin: true,
                    name: '内置',
                    viewMode: 'edit',
                    resourceManagerVisible: true,
                    resourceManagerWidth: 300
                },
                {
                    id: 'good',
                    name: '有效',
                    viewMode: 'preview',
                    resourceManagerVisible: false,
                    resourceManagerWidth: 9999,
                    updatedAt: 1
                }
            ])
        )
        const loaded = loadCustomWorkspaceLayouts()
        expect(loaded).toHaveLength(1)
        expect(loaded[0]).toMatchObject({
            id: 'good',
            resourceManagerWidth: WORKSPACE_LAYOUT_MAX_WIDTH
        })
    })

    it('自定义布局达到上限后拒绝继续保存', () => {
        for (let index = 0; index < 20; index += 1) {
            expect(saveCurrentWorkspaceLayout(`布局${index}`)).not.toBeNull()
        }
        expect(saveCurrentWorkspaceLayout('第21个')).toBeNull()
    })

    it('无 window / localStorage 写入失败时安全降级', () => {
        const originalWindow = globalThis.window
        vi.stubGlobal('window', undefined)
        try {
            expect(loadCustomWorkspaceLayouts()).toEqual([])
            expect(saveCurrentWorkspaceLayout('不可保存')).toBeNull()
            applyWorkspaceLayout({
                id: 'x',
                name: 'x',
                viewMode: 'edit',
                resourceManagerVisible: true,
                resourceManagerWidth: 300,
                updatedAt: 1
            })
        } finally {
            vi.stubGlobal('window', originalWindow)
        }
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded')
        })
        expect(saveCurrentWorkspaceLayout('配额失败')).toBeNull()
        setItemSpy.mockRestore()
    })

    it('空对象等非法存储条目被过滤', () => {
        window.localStorage.setItem(
            WORKSPACE_LAYOUT_STORAGE_KEY,
            JSON.stringify([null, {}, { id: 'bad' }])
        )
        expect(loadCustomWorkspaceLayouts()).toEqual([])
    })

    it('应用布局广播事件并更新当前值', () => {
        const received: unknown[] = []
        const listener = (event: Event) => received.push((event as CustomEvent).detail)
        window.addEventListener(WORKSPACE_LAYOUT_APPLY_EVENT, listener)
        applyWorkspaceLayout({
            id: 'custom-1',
            name: '测试',
            viewMode: 'edit',
            resourceManagerVisible: false,
            resourceManagerWidth: 220,
            updatedAt: 1
        })
        window.removeEventListener(WORKSPACE_LAYOUT_APPLY_EVENT, listener)
        expect(received).toHaveLength(1)
        expect(received[0]).toMatchObject({ id: 'custom-1', viewMode: 'edit' })
        expect(snapshotCurrentWorkspaceLayout()).toMatchObject({
            viewMode: 'edit',
            resourceManagerVisible: false,
            resourceManagerWidth: 220
        })
    })
})
