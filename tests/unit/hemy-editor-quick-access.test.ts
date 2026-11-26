import { describe, it, expect, afterEach, vi } from 'vitest'

// 模拟 vue3-context-menu，避免在 node 环境加载组件库
vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: vi.fn() },
    MenuItem: {}
}))

import ContextMenu from '@imengyu/vue3-context-menu'
import EventBus from '../../src/renderer/src/common/event-bus/event-bus'
import * as Templates from '../../src/renderer/src/common/templates'
import * as QuickAccessSvgs from '../../src/renderer/src/components/Markdown/hemy-editor-quick-access-svgs'
import { getConfigStore } from '../../src/renderer/src/common/useConfigStore'
import { MdEditQuickAccess } from '../../src/renderer/src/components/Markdown/hemy-editor-quick-access'
import { translate } from '../../src/shared/i18n'

const showContextMenuMock = vi.mocked(ContextMenu.showContextMenu)

// CMP-30：模板菜单项文案改为 labelKey（由壳层菜单代理维护），兼容历史 label 字段
interface TemplateMenuEntryLike {
    label?: string
    labelKey?: string
}

function resolveTemplateLabel(template: TemplateMenuEntryLike): string {
    if (template.labelKey) {
        return translate(template.labelKey)
    }
    return template.label ?? ''
}

// 对话框状态重置，避免用例间相互影响
function resetDialogs() {
    const store = getConfigStore()
    for (const key of Object.keys(store.dialogs) as (keyof typeof store.dialogs)[]) {
        if (key === 'messageDialog') {
            store.dialogs.messageDialog.visible = false
            store.dialogs.messageDialog.type = 'success'
            store.dialogs.messageDialog.title = ''
            store.dialogs.messageDialog.message = ''
        } else if (key === 'importOption') {
            store.dialogs.importOption.visible = false
            store.dialogs.importOption.content = undefined
        } else {
            // 第 4 批 P3：admonition 的 data 死字段已删除，与其他普通对话框一致只重置 visible
            store.dialogs[key].visible = false
        }
    }
}

// 构造带 x/y 坐标的假鼠标事件
function fakeEvent(x: number, y: number): Event {
    return { x, y } as unknown as Event
}

describe('MdEditQuickAccess structure', () => {
    it('should define the 35 quick access buttons', () => {
        expect(Object.keys(MdEditQuickAccess)).toHaveLength(35)
    })

    it('should keep ids equal to keys and unique', () => {
        const entries = Object.entries(MdEditQuickAccess)
        for (const [key, value] of entries) {
            expect(value.id, `${key} 的 id 应与键一致`).toBe(key)
        }
        const ids = entries.map(([, value]) => value.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('should give every button a titleKey, class, param and svg', () => {
        for (const [key, value] of Object.entries(MdEditQuickAccess)) {
            // CMP-30：按钮提示改为 i18n 词条键，模板中经 t() 渲染
            expect(typeof value.titleKey, `${key} 应有 titleKey`).toBe('string')
            expect(
                value.titleKey.startsWith('editorUi.toolbar.'),
                `${key} 的 titleKey 应位于 editorUi 命名空间`
            ).toBe(true)
            expect(translate(value.titleKey).length, `${key} 的词条应有文案`).toBeGreaterThan(0)
            expect(value.class).toBe('tool-btn')
            expect(typeof value.param).toBe('string')
            expect(value.svg.startsWith('<svg'), `${key} 的 svg 应以 <svg 开头`).toBe(true)
        }
    })

    it('should map button params to the expected format commands', () => {
        const params = Object.fromEntries(
            Object.entries(MdEditQuickAccess).map(([key, value]) => [key, value.param])
        )
        expect(params['header-1']).toBe('h1')
        expect(params['header-6']).toBe('H6')
        expect(params['font-bold']).toBe('bold')
        expect(params['font-italic']).toBe('italic')
        expect(params['font-delete']).toBe('deleteline')
        expect(params['font-under']).toBe('underline')
        expect(params['align-center']).toBe('aligncenter')
        expect(params['code-block']).toBe('codeblock')
        expect(params['math-block']).toBe('mathblock')
        expect(params['task-lists']).toBe('tasklists')
        expect(params['insert-table']).toBe('insertable')
        expect(params['insert-images']).toBe('insertimage')
    })

    it('should reuse the exported svg constants', () => {
        const svgValues = new Set<string>(Object.values(QuickAccessSvgs))
        for (const [key, value] of Object.entries(MdEditQuickAccess)) {
            expect(svgValues.has(value.svg), `${key} 的 svg 应来自 svg 常量表`).toBe(true)
        }
    })
})

describe('MdEditQuickAccess font format events', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        resetDialogs()
    })

    it('should emit the header format event with the param', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        MdEditQuickAccess['header-1'].clickFn(fakeEvent(0, 0), 'h1')
        expect(emitSpy).toHaveBeenCalledWith('monaco-editor-update-header-format', 'h1')
    })

    it('should emit the font format event with the param', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        MdEditQuickAccess['font-bold'].clickFn(fakeEvent(0, 0), 'bold')
        expect(emitSpy).toHaveBeenCalledWith('monaco-editor-update-font-format', 'bold')
    })

    it('should open the mdSheet dialog from the table button', async () => {
        const store = getConfigStore()
        MdEditQuickAccess['insert-table'].clickFn(fakeEvent(0, 0), '')
        // P0：先尝试可视化表格编辑；无活动编辑器/不在表格内时异步回退到插入对话框
        await vi.waitFor(() => expect(store.dialogs.mdSheet.visible).toBe(true))
    })

    it('should open the insertImage dialog from the image button', () => {
        const store = getConfigStore()
        MdEditQuickAccess['insert-images'].clickFn(fakeEvent(0, 0), '')
        expect(store.dialogs.insertImage.visible).toBe(true)
    })

    it('should open the insertLink dialog from the web links button', () => {
        const store = getConfigStore()
        MdEditQuickAccess['web-links'].clickFn(fakeEvent(0, 0), '')
        expect(store.dialogs.insertLink.visible).toBe(true)
    })
})

describe('MdEditQuickAccess context menus', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        showContextMenuMock.mockClear()
    })

    it('should open the emoji menu at x and y+10', () => {
        MdEditQuickAccess['insert-emoji'].clickFn(fakeEvent(100, 200), '')
        expect(showContextMenuMock).toHaveBeenCalledTimes(1)
        const args = showContextMenuMock.mock.calls[0][0]
        expect(args.x).toBe(100)
        expect(args.y).toBe(210)
        expect(Array.isArray(args.items)).toBe(true)
        expect(args.items!.length).toBeGreaterThan(0)
    })

    it('should open the mermaid menu with every template and emit insert-text on click', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        MdEditQuickAccess['insert-mermaid'].clickFn(fakeEvent(10, 20), '')

        const args = showContextMenuMock.mock.calls[0][0]
        expect(args.x).toBe(10)
        expect(args.y).toBe(30)

        const items = args.items as { label: string; onClick: () => void }[]
        expect(items).toHaveLength(Templates.Mermaid.length)
        expect(items.map((item) => item.label)).toEqual(
            Templates.Mermaid.map((template) => resolveTemplateLabel(template))
        )

        // 点击 flowchart 条目应插入对应模板内容
        const flowchartIndex = Templates.Mermaid.findIndex(
            (template) => resolveTemplateLabel(template) === 'flowchart'
        )
        items[flowchartIndex].onClick()
        expect(emitSpy).toHaveBeenCalledWith(
            'baize:notes:monaco-editor:insert-text',
            Templates.Mermaid[flowchartIndex].context
        )
    })

    it('should open the plantuml menu with every template and emit insert-text on click', () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        MdEditQuickAccess['insert-plantuml'].clickFn(fakeEvent(30, 40), '')

        const args = showContextMenuMock.mock.calls[0][0]
        expect(args.x).toBe(30)
        expect(args.y).toBe(50)

        const items = args.items as { label: string; onClick: () => void }[]
        expect(items).toHaveLength(Templates.PlantUML.length)
        expect(items.map((item) => item.label)).toEqual(
            Templates.PlantUML.map((template) => resolveTemplateLabel(template))
        )

        const classIndex = Templates.PlantUML.findIndex(
            (template) => resolveTemplateLabel(template) === '类图'
        )
        items[classIndex].onClick()
        expect(emitSpy).toHaveBeenCalledWith(
            'baize:notes:monaco-editor:insert-text',
            Templates.PlantUML[classIndex].context
        )
    })
})
