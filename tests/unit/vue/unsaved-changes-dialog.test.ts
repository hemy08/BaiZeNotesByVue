// @vitest-environment jsdom
/**
 * UnsavedChangesDialog.vue 组件契约测试（2026-11-20 关闭确认应用内对话框）
 *
 * 覆盖：
 * 1. 渲染：BaseDialog 外壳（role=dialog/aria-modal/aria-labelledby）+ 正文 aria-describedby；
 * 2. 三按钮文案（保存并关闭 / 不保存 / 取消）与 emit 语义；
 * 3. 默认焦点在「保存并关闭」；Esc / 标题栏关闭按钮 = 取消（busy 时忽略）；
 * 4. 托盘场景文案（保存并隐藏 / 隐藏到系统托盘说明）；
 * 5. 保存中（busy）：按钮禁用、保存按钮显示进行中文案、不响应 Esc/关闭；
 * 6. 保存失败错误提示（role=alert）可见。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import UnsavedChangesDialog from '@renderer/components/dialogs/simple/UnsavedChangesDialog.vue'

/** BaseDialog 默认 Teleport 到 body；统一 stub 成内联渲染，attachTo body 是焦点断言前提 */
const dialogMountOptions = {
    global: { stubs: { teleport: true } },
    attachTo: document.body
}

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

function mountDialog(props: Record<string, unknown> = {}): VueWrapper {
    return track(
        mount(UnsavedChangesDialog, {
            ...dialogMountOptions,
            props: { visible: true, ...props }
        })
    )
}

/** 等待挂载/显隐后的焦点逻辑（BaseDialog + 本组件各一轮 nextTick） */
async function flushFocus(): Promise<void> {
    await nextTick()
    await nextTick()
    await nextTick()
}

function pressEscape(): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
}

beforeEach(() => {
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke: vi.fn().mockResolvedValue(undefined) }
    })
})

afterEach(async () => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) wrapper.unmount()
    }
    wrappers = []
    await nextTick()
    document.body.innerHTML = ''
    // BaseDialog 打开期间锁定 body 滚动；关闭后恢复（清理残留避免用例间串扰）
    document.body.style.removeProperty('overflow')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('UnsavedChangesDialog 渲染与语义', () => {
    it('visible=false 时不渲染任何对话框语义节点', () => {
        const wrapper = track(
            mount(UnsavedChangesDialog, {
                ...dialogMountOptions,
                props: { visible: false }
            })
        )
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    })

    it('复用 BaseDialog 外壳：role/aria-modal/aria-labelledby + 正文 aria-describedby', () => {
        const wrapper = mountDialog()
        const container = wrapper.find('.dialog-container')
        expect(container.classes()).toContain('unsaved-close-dialog')
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')

        const labelledby = container.attributes('aria-labelledby')
        expect(labelledby).toBeTruthy()
        expect(wrapper.find('.title-text').attributes('id')).toBe(labelledby)
        expect(wrapper.find('.title-text').text()).toBe('未保存的修改')

        const describedby = container.attributes('aria-describedby')
        expect(describedby).toBeTruthy()
        expect(wrapper.find(`#${describedby}`).text()).toContain('当前文件有未保存的修改')
    })

    it('三个按钮：保存并关闭 / 不保存 / 取消，点击分别 emit 对应事件', async () => {
        const wrapper = mountDialog()
        const save = wrapper.find('.btn-save')
        expect(save.text()).toBe('保存并关闭')
        expect(wrapper.find('.btn-discard').text()).toBe('不保存')
        expect(wrapper.find('.btn-cancel').text()).toBe('取消')

        await save.trigger('click')
        await wrapper.find('.btn-discard').trigger('click')
        await wrapper.find('.btn-cancel').trigger('click')

        expect(wrapper.emitted('save')).toHaveLength(1)
        expect(wrapper.emitted('discard')).toHaveLength(1)
        expect(wrapper.emitted('cancel')).toHaveLength(1)
    })

    it('默认焦点在「保存并关闭」', async () => {
        const wrapper = mountDialog()
        await flushFocus()
        const active = document.activeElement as HTMLElement | null
        expect(active?.classList.contains('btn-save')).toBe(true)
        expect(wrapper.find('.btn-save').element).toBe(active)
    })

    it('Esc = 取消；标题栏关闭按钮 = 取消', async () => {
        const wrapper = mountDialog()
        await flushFocus()
        pressEscape()
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('cancel')).toHaveLength(2)
        expect(wrapper.emitted('save')).toBeUndefined()
        expect(wrapper.emitted('discard')).toBeUndefined()
    })
})

describe('UnsavedChangesDialog 托盘场景文案', () => {
    it('minimizeToTray=true：保存按钮为「保存并隐藏」，正文/说明使用托盘语义', () => {
        const wrapper = mountDialog({ minimizeToTray: true })
        expect(wrapper.find('.btn-save').text()).toBe('保存并隐藏')
        expect(wrapper.find('.message').text()).toContain('隐藏到系统托盘')
        expect(wrapper.find('.detail').text()).toContain('隐藏到系统托盘')
    })
})

describe('UnsavedChangesDialog 保存中/失败状态', () => {
    it('busy：三个按钮禁用、保存按钮显示「正在保存…」、Esc/关闭按钮被忽略', async () => {
        const wrapper = mountDialog({ busy: true })
        await flushFocus()

        expect(wrapper.find('.btn-save').attributes('disabled')).toBeDefined()
        expect(wrapper.find('.btn-discard').attributes('disabled')).toBeDefined()
        expect(wrapper.find('.btn-cancel').attributes('disabled')).toBeDefined()
        expect(wrapper.find('.btn-save').text()).toBe('正在保存…')

        pressEscape()
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('cancel')).toBeUndefined()
    })

    it('error：保存失败提示以 role=alert 可见，对话框仍保持打开', () => {
        const errorText = '保存失败，窗口未关闭。请重试保存，或选择「不保存」/「取消」。'
        const wrapper = mountDialog({ error: errorText })
        const alert = wrapper.find('[role="alert"]')
        expect(alert.exists()).toBe(true)
        expect(alert.text()).toBe(errorText)
        expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
        // 失败态按钮恢复可操作
        expect(wrapper.find('.btn-save').attributes('disabled')).toBeUndefined()
    })
})
