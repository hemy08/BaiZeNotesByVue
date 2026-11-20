// @vitest-environment jsdom
/**
 * P2 对话框可访问性（a11y）契约测试
 *
 * 背景：BaseDialog 统一外壳此前只承载结构与视觉（overlay/container/title-bar/footer），
 * 无任何 ARIA 语义、无键盘行为、无焦点管理。P2 在 BaseDialog 增量补齐：
 * 1. 语义：role="dialog" + aria-modal="true" + 标题关联（默认标题 aria-labelledby，
 *    无标题场景 aria-label）+ 关闭按钮 aria-label；
 * 2. 焦点：打开后焦点移入对话框容器，关闭后归还打开前焦点；
 * 3. 键盘：Esc 触发 close；Tab / Shift+Tab 在对话框内循环（焦点陷阱）；
 * 4. 嵌套：多个 dialog 同时可见时只有顶层响应 Esc/Tab（模块级栈）。
 *
 * 本文件分两部分：
 * - BaseDialog：逐条锁定上述契约（含嵌套栈与焦点归还）；
 * - 代表性对话框（System / Theme / Editor / QuickLink / ConfirmDelete）：验证外壳 a11y
 *   在真实对话框上生效（标题关联指向真实标题、Esc 正常发出 close、初始焦点在对话框内、
 *   关闭按钮有可访问名称），不重复锁定各自业务行为（业务契约在 c2/c3/c4 等文件）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'

import BaseDialog from '@renderer/components/dialogs/BaseDialog.vue'
import EditorSettingDialog from '@renderer/components/dialogs/complex/EditorSettingDialog.vue'
import SystemSettingDialog from '@renderer/components/dialogs/complex/SystemSettingDialog.vue'
import ThemeSettingDialog from '@renderer/components/dialogs/complex/ThemeSettingDialog.vue'
import ConfirmDeleteDialog from '@renderer/components/dialogs/simple/ConfirmDeleteDialog.vue'
import QuickLinkSettingDialog from '@renderer/components/dialogs/help/QuickLinkSettingDialog.vue'
import { t } from '@renderer/common/i18n'

/**
 * 对话框默认 Teleport 到 body；统一 stub 成内联渲染，便于断言与焦点查询。
 * attachTo: document.body 是焦点断言的前提——VTU 默认把组件挂到游离 div，
 * 游离 DOM 上的 focus() 不会写入 document.activeElement（jsdom 行为）。
 */
const dialogMountOptions = {
    global: { stubs: { teleport: true } },
    attachTo: document.body
}

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

function mountBaseDialog(
    props: Record<string, unknown> = {},
    slots: Record<string, string> = {}
): VueWrapper {
    return track(
        mount(BaseDialog, {
            ...dialogMountOptions,
            props: { visible: true, title: '测试标题', ...props },
            slots
        })
    )
}

/** 等待挂载后的焦点逻辑（watch flush:post + nextTick）完成 */
async function flushFocus(): Promise<void> {
    await nextTick()
    await nextTick()
}

function pressKey(key: string, options: KeyboardEventInit = {}): void {
    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...options }))
}

function activeElement(): HTMLElement | null {
    return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

beforeEach(() => {
    // 代表性对话框挂载时可能读取配置 / 调用 IPC：给最小桩，测试不依赖返回值
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn().mockResolvedValue(true) },
        app: { getVersion: vi.fn().mockResolvedValue({}) }
    })
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke: vi.fn().mockResolvedValue(undefined),
            send: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn()
        }
    })
})

afterEach(async () => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) wrapper.unmount()
    }
    wrappers = []
    await nextTick()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('BaseDialog 可访问性语义', () => {
    it('容器暴露 role=dialog / aria-modal，并以标题节点作为可访问名称', () => {
        const wrapper = mountBaseDialog({ title: '设置' })
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')

        const labelledby = container.attributes('aria-labelledby')
        expect(labelledby).toBeTruthy()
        const titleNode = wrapper.find('.title-text')
        expect(titleNode.attributes('id')).toBe(labelledby)
        expect(titleNode.text()).toBe('设置')
        // 有可见标题时不叠加 aria-label，避免命名来源冲突
        expect(container.attributes('aria-label')).toBeUndefined()
    })

    it('无可见标题（HelpAbout 场景）时使用 aria-label 作为可访问名称', () => {
        const wrapper = mountBaseDialog({ title: '', ariaLabel: '关于白泽笔记' })
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('aria-label')).toBe('关于白泽笔记')
        expect(container.attributes('aria-labelledby')).toBeUndefined()
    })

    it('关闭按钮有可访问名称（× 对读屏无意义）', () => {
        const wrapper = mountBaseDialog()
        expect(wrapper.find('.close-btn').attributes('aria-label')).toBe(t('common.close'))
    })

    it('visible=false 时不渲染任何 dialog 语义节点（避免隐藏对话框被读屏访问）', () => {
        const wrapper = mount(BaseDialog, {
            ...dialogMountOptions,
            props: { visible: false, title: '隐藏' }
        })
        wrappers.push(wrapper)
        expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    })
})

describe('BaseDialog 初始焦点', () => {
    it('打开后焦点移入对话框容器', async () => {
        mountBaseDialog({}, { default: '<p class="body">正文</p>' })
        await flushFocus()
        expect(activeElement()).toBe(document.querySelector('.dialog-container'))
    })

    it('子组件已自行聚焦（如重命名输入框）时不抢焦点', async () => {
        const wrapper = mountBaseDialog({}, { default: '<input class="inner-input" />' })
        const input = wrapper.find('.inner-input').element as HTMLInputElement
        input.focus()
        await flushFocus()
        expect(activeElement()).toBe(input)
    })

    it('关闭后焦点归还到打开前的焦点元素', async () => {
        const trigger = document.createElement('button')
        trigger.textContent = '打开设置'
        document.body.appendChild(trigger)
        trigger.focus()
        expect(activeElement()).toBe(trigger)

        const wrapper = mount(BaseDialog, {
            ...dialogMountOptions,
            props: { visible: false, title: '设置' }
        })
        wrappers.push(wrapper)
        await wrapper.setProps({ visible: true })
        await flushFocus()
        expect(activeElement()).toBe(wrapper.find('.dialog-container').element)

        await wrapper.setProps({ visible: false })
        await flushFocus()
        expect(activeElement()).toBe(trigger)
    })
})

describe('BaseDialog 键盘行为', () => {
    it('Esc 触发一次 close', async () => {
        const wrapper = mountBaseDialog()
        await flushFocus()
        pressKey('Escape')
        await nextTick()
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('焦点陷阱：容器内最后一个可聚焦元素 Tab 回到第一个，首个 Shift+Tab 回到最后一个', async () => {
        const wrapper = mountBaseDialog({}, { footer: '<button class="footer-btn">确定</button>' })
        await flushFocus()
        const container = wrapper.find('.dialog-container').element as HTMLElement
        const focusables = Array.from(
            container.querySelectorAll<HTMLElement>('button:not([disabled])')
        )
        expect(focusables.length).toBeGreaterThanOrEqual(2)
        const first = focusables[0]
        const last = focusables[focusables.length - 1]

        last.focus()
        pressKey('Tab')
        await nextTick()
        expect(activeElement()).toBe(first)

        first.focus()
        pressKey('Tab', { shiftKey: true })
        await nextTick()
        expect(activeElement()).toBe(last)
    })

    it('初始焦点在容器上时，Tab 进入第一个可聚焦元素，Shift+Tab 进入最后一个', async () => {
        const wrapper = mountBaseDialog({}, { footer: '<button class="footer-btn">确定</button>' })
        await flushFocus()
        const container = wrapper.find('.dialog-container').element as HTMLElement
        const focusables = Array.from(
            container.querySelectorAll<HTMLElement>('button:not([disabled])')
        )
        expect(activeElement()).toBe(container)

        pressKey('Tab')
        await nextTick()
        expect(activeElement()).toBe(focusables[0])

        container.focus()
        pressKey('Tab', { shiftKey: true })
        await nextTick()
        expect(activeElement()).toBe(focusables[focusables.length - 1])
    })

    it('Esc 关闭只作用于最顶层对话框（嵌套对话框不一次性全部关闭）', async () => {
        const lower = mountBaseDialog({ title: '设置' })
        const upper = mountBaseDialog({ title: '确认' })
        await flushFocus()

        pressKey('Escape')
        await nextTick()
        expect(upper.emitted('close')).toHaveLength(1)
        expect(lower.emitted('close')).toBeUndefined()

        // 上层关闭出栈后，下一次 Esc 才作用于下层
        await upper.setProps({ visible: false })
        await flushFocus()
        pressKey('Escape')
        await nextTick()
        expect(lower.emitted('close')).toHaveLength(1)
    })

    it('非顶层对话框不抢焦点，也不响应 Tab 陷阱', async () => {
        const lower = mountBaseDialog({ title: '设置' })
        await flushFocus()
        const upper = mountBaseDialog({ title: '确认' })
        await flushFocus()
        expect(activeElement()).toBe(upper.find('.dialog-container').element)

        pressKey('Escape')
        await nextTick()
        expect(upper.emitted('close')).toHaveLength(1)
        expect(lower.emitted('close')).toBeUndefined()
    })
})

describe('代表性对话框 a11y 契约', () => {
    interface DialogCase {
        name: string
        component: Component
        props: Record<string, unknown>
        /** 预期标题字典键（部分对话框标题含动态版本号，按 key 断言） */
        titleKey: string
    }

    const cases: DialogCase[] = [
        {
            name: 'SystemSettingDialog',
            component: SystemSettingDialog,
            props: {},
            titleKey: 'dialogRenderer.systemSetting.title'
        },
        {
            name: 'ThemeSettingDialog',
            component: ThemeSettingDialog,
            props: {},
            titleKey: 'dialogRenderer.themeSetting.title'
        },
        {
            name: 'EditorSettingDialog',
            component: EditorSettingDialog,
            props: {},
            titleKey: 'dialogRenderer.editorSetting.title'
        },
        {
            name: 'QuickLinkSettingDialog',
            component: QuickLinkSettingDialog,
            props: {},
            titleKey: 'dialogRenderer.quickLink.title'
        },
        {
            name: 'ConfirmDeleteDialog',
            component: ConfirmDeleteDialog,
            props: { path: 'C:/notes/a.md', isFile: true },
            titleKey: 'dialogMain.confirmDelete.title'
        }
    ]

    it.each(cases)('$name：语义属性、初始焦点与 Esc 关闭', async (dialogCase) => {
        const wrapper = track(
            mount(dialogCase.component, {
                ...dialogMountOptions,
                props: { visible: true, ...dialogCase.props }
            })
        )
        await flushFocus()

        const container = wrapper.find('.dialog-container')
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')

        // 标题关联：aria-labelledby 指向真实标题节点，文本与词典一致
        const labelledby = container.attributes('aria-labelledby')
        expect(labelledby).toBeTruthy()
        const titleNode = wrapper.find(`[id="${labelledby}"]`)
        expect(titleNode.exists()).toBe(true)
        expect(titleNode.text()).toBe(t(dialogCase.titleKey))

        // 关闭按钮可访问名称
        expect(wrapper.find('.close-btn').attributes('aria-label')).toBe(t('common.close'))

        // 初始焦点在对话框内（容器或容器内元素）
        expect(activeElement()).not.toBeNull()
        expect(container.element.contains(activeElement())).toBe(true)

        // Esc 关闭
        pressKey('Escape')
        await nextTick()
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it.each(cases)('$name：Tab 焦点陷阱在对话框内循环', async (dialogCase) => {
        const wrapper = track(
            mount(dialogCase.component, {
                ...dialogMountOptions,
                props: { visible: true, ...dialogCase.props }
            })
        )
        await flushFocus()

        const container = wrapper.find('.dialog-container').element as HTMLElement
        const focusables = Array.from(
            container.querySelectorAll<HTMLElement>(
                'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
        )
        expect(focusables.length).toBeGreaterThan(0)

        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        last.focus()
        pressKey('Tab')
        await nextTick()
        expect(activeElement()).toBe(first)

        first.focus()
        pressKey('Tab', { shiftKey: true })
        await nextTick()
        expect(activeElement()).toBe(last)
    })
})
