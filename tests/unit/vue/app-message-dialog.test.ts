// @vitest-environment jsdom
/**
 * AppMessageDialog.vue 组件契约测试（2026-11-21 应用内消息/确认对话框通用服务）
 *
 * 覆盖：
 * 1. BaseDialog 外壳语义：role=dialog / aria-modal / aria-labelledby + 正文 aria-describedby；
 * 2. 标题/正文/详情/按钮列表渲染，kind 作用于容器视觉语义 class；
 * 3. 默认焦点在 defaultId（未指定时回退第一个按钮）；
 * 4. 点击按钮 emit choose(id)；Esc / 标题栏关闭按钮 → cancelId（未指定时回退最后一个按钮）；
 * 5. 单按钮场景与无详情场景的渲染分支。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import AppMessageDialog from '@renderer/components/dialogs/simple/AppMessageDialog.vue'

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

/** 标准两按钮 props（主进程已本地化文案） */
function baseProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        visible: true,
        kind: 'warning',
        title: '安全确认',
        message: '即将打开可执行程序',
        detail: '请确认来源可信后再继续。',
        buttons: [
            { id: 'cancel', label: '取消' },
            { id: 'confirm', label: '确认打开', kind: 'danger' }
        ],
        defaultId: 'confirm',
        cancelId: 'cancel',
        ...overrides
    }
}

function mountDialog(props: Record<string, unknown> = baseProps()): VueWrapper {
    return track(mount(AppMessageDialog, { ...dialogMountOptions, props }))
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
        ipcRenderer: { invoke: vi.fn().mockResolvedValue({ ok: true }) }
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

describe('AppMessageDialog 渲染与语义', () => {
    it('visible=false 时不渲染任何对话框语义节点', () => {
        const wrapper = track(
            mount(AppMessageDialog, {
                ...dialogMountOptions,
                props: baseProps({ visible: false })
            })
        )
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    })

    it('复用 BaseDialog 外壳：role/aria-modal/aria-labelledby + 正文 aria-describedby', () => {
        const wrapper = mountDialog()
        const container = wrapper.find('.dialog-container.app-message-dialog')
        expect(container.exists()).toBe(true)
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')

        const labelledby = container.attributes('aria-labelledby')
        expect(labelledby).toBeTruthy()
        expect(wrapper.find('.title-text').attributes('id')).toBe(labelledby)
        expect(wrapper.find('.title-text').text()).toBe('安全确认')

        const describedby = container.attributes('aria-describedby')
        expect(describedby).toBeTruthy()
        expect(wrapper.find(`#${describedby}`).text()).toBe('即将打开可执行程序')
        expect(wrapper.find('.detail').text()).toBe('请确认来源可信后再继续。')
    })

    it('kind 作用于容器 class；按钮按 id 渲染且 kind 语义样式生效', () => {
        const wrapper = mountDialog({ ...baseProps(), kind: 'error' })
        expect(wrapper.find('.app-message-dialog').classes()).toContain('app-message-dialog--error')
        expect(wrapper.find('.app-message-dialog--error').exists()).toBe(true)
        expect(wrapper.find('[data-button-id="confirm"]').classes()).toContain('btn-danger')
        expect(wrapper.find('[data-button-id="cancel"]').classes()).not.toContain('btn-danger')
    })

    it('单按钮 info 场景：只渲染一个按钮且无详情节点', () => {
        const wrapper = mountDialog({
            ...baseProps(),
            kind: 'info',
            title: '检查更新',
            message: '已是最新版本',
            detail: '',
            buttons: [{ id: 'ok', label: '确定', kind: 'primary' }],
            defaultId: 'ok',
            cancelId: 'ok'
        })
        expect(wrapper.findAll('.btn')).toHaveLength(1)
        expect(wrapper.find('.detail').exists()).toBe(false)
        expect(wrapper.find('[data-button-id="ok"]').text()).toBe('确定')
    })

    it('点击按钮 emit choose(id)', async () => {
        const wrapper = mountDialog()
        await wrapper.find('[data-button-id="confirm"]').trigger('click')
        await wrapper.find('[data-button-id="cancel"]').trigger('click')
        expect(wrapper.emitted('choose')).toEqual([['confirm'], ['cancel']])
    })
})

describe('AppMessageDialog 焦点与取消语义', () => {
    it('默认焦点在 defaultId 对应按钮（本场景为第二个按钮）', async () => {
        const wrapper = mountDialog()
        await flushFocus()
        const active = document.activeElement as HTMLElement | null
        expect(active?.getAttribute('data-button-id')).toBe('confirm')
        expect(wrapper.find('[data-button-id="confirm"]').element).toBe(active)
    })

    it('defaultId 未指定/非法时回退第一个按钮为默认焦点', async () => {
        mountDialog(baseProps({ defaultId: '', cancelId: '' }))
        await flushFocus()
        expect((document.activeElement as HTMLElement | null)?.getAttribute('data-button-id')).toBe(
            'cancel'
        )
    })

    it('Esc / 标题栏关闭按钮 → emit choose(cancelId)', async () => {
        const wrapper = mountDialog()
        await flushFocus()
        pressEscape()
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('choose')).toEqual([['cancel'], ['cancel']])
    })

    it('cancelId 未指定时 Esc 回退最后一个按钮', async () => {
        const wrapper = mountDialog(baseProps({ cancelId: '' }))
        await flushFocus()
        pressEscape()
        expect(wrapper.emitted('choose')).toEqual([['confirm']])
    })

    it('遮罩点击不关闭（与原生消息框一致，避免误触关闭安全确认）', async () => {
        const wrapper = mountDialog()
        await wrapper.find('.dialog-overlay').trigger('click')
        expect(wrapper.emitted('choose')).toBeUndefined()
    })
})
