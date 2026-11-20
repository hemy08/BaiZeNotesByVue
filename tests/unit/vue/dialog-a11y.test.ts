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
import HelpAboutDialog from '@renderer/components/dialogs/help/HelpAboutDialog.vue'
import ConfirmDeleteDialog from '@renderer/components/dialogs/simple/ConfirmDeleteDialog.vue'
import MessageDialog from '@renderer/components/dialogs/simple/MessageDialog.vue'
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
    // body 滚动锁定由 BaseDialog 打开/关闭维护：清理残留内联样式，避免测试间串扰
    document.body.style.removeProperty('overflow')
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

describe('BaseDialog 描述关联（aria-describedby）', () => {
    it('传 ariaDescribedby 时容器关联调用方提供的描述节点', () => {
        const wrapper = mountBaseDialog(
            { ariaDescribedby: 'dialog-desc-node' },
            { default: '<p id="dialog-desc-node">补充说明</p>' }
        )
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('aria-describedby')).toBe('dialog-desc-node')
        // 命名仍走标题，描述不替代 aria-labelledby
        expect(container.attributes('aria-labelledby')).toBeTruthy()
    })

    it('未传 ariaDescribedby 时不产生 aria-describedby（纯增量，不影响既有对话框）', () => {
        const wrapper = mountBaseDialog()
        expect(wrapper.find('.dialog-container').attributes('aria-describedby')).toBeUndefined()
    })
})

describe('BaseDialog body 滚动锁定/恢复', () => {
    it('打开时锁定 body 滚动，关闭后恢复打开前的内联 overflow 值', async () => {
        document.body.style.overflow = 'auto'
        const wrapper = track(
            mount(BaseDialog, {
                ...dialogMountOptions,
                props: { visible: false, title: '设置' }
            })
        )
        expect(document.body.style.overflow).toBe('auto')

        await wrapper.setProps({ visible: true })
        await flushFocus()
        expect(document.body.style.overflow).toBe('hidden')

        await wrapper.setProps({ visible: false })
        await flushFocus()
        // 恢复的是打开前的原值（存在内联值时应还原，而不是简单删除）
        expect(document.body.style.overflow).toBe('auto')
    })

    it('嵌套对话框引用计数：关闭任意一层仍锁定，最后一个关闭后才恢复', async () => {
        document.body.style.removeProperty('overflow')
        const lower = mountBaseDialog({ title: '设置' })
        const upper = mountBaseDialog({ title: '确认' })
        await flushFocus()
        expect(document.body.style.overflow).toBe('hidden')

        // 先关闭下层（非顶层）不应提前解锁
        await lower.setProps({ visible: false })
        await flushFocus()
        expect(document.body.style.overflow).toBe('hidden')

        await upper.setProps({ visible: false })
        await flushFocus()
        // 原值由样式表决定（无内联值）：恢复为移除内联属性
        expect(document.body.style.overflow).toBe('')
        expect(document.body.style.getPropertyValue('overflow')).toBe('')
    })

    it('打开状态下组件卸载也会恢复 body 滚动（避免页面永久锁死）', async () => {
        document.body.style.removeProperty('overflow')
        const wrapper = mountBaseDialog()
        expect(document.body.style.overflow).toBe('hidden')

        wrapper.unmount()
        await nextTick()
        expect(document.body.style.overflow).toBe('')
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

    it('输入法组合中的 Esc 不关闭对话框（中文输入取消候选不误关）', async () => {
        const wrapper = mountBaseDialog()
        await flushFocus()
        pressKey('Escape', { isComposing: true })
        await nextTick()
        expect(wrapper.emitted('close')).toBeUndefined()
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

describe('BaseDialog 焦点陷阱排除项', () => {
    /** 覆盖 disabled / hidden / inert / aria-hidden / iframe / tabindex=-1 等不可 Tab 元素 */
    const trapSlot = `
        <button class="trap-first">第一个</button>
        <button class="trap-disabled" disabled>禁用</button>
        <input class="trap-hidden-input" type="hidden" value="x" />
        <div hidden><button class="trap-hidden-attr">hidden</button></div>
        <div aria-hidden="true"><button class="trap-aria-hidden">aria-hidden</button></div>
        <div inert><button class="trap-inert">inert</button></div>
        <fieldset disabled><button class="trap-fieldset">fieldset</button></fieldset>
        <iframe class="trap-iframe" tabindex="0"></iframe>
        <button class="trap-minus" tabindex="-1">tabindex -1</button>
        <button class="trap-last">最后</button>
        <iframe class="trap-iframe-trailer" tabindex="0"></iframe>
        <button class="trap-trailer-disabled" disabled>尾部禁用</button>
        <button class="trap-trailer-minus" tabindex="-1">尾部 tabindex -1</button>
        <div hidden><button class="trap-trailer-hidden">尾部 hidden</button></div>
        <div style="display: none">
            <button class="trap-trailer-css-hidden">尾部 CSS 隐藏（v-show 面板）</button>
        </div>
    `

    it('Tab 从最后一个可聚焦元素回到第一个，跳过 disabled/hidden/inert/iframe/tabindex=-1', async () => {
        const wrapper = mountBaseDialog({}, { default: trapSlot })
        await flushFocus()
        const container = wrapper.find('.dialog-container').element as HTMLElement
        const closeBtn = container.querySelector('.close-btn') as HTMLElement
        const firstSlotBtn = container.querySelector('.trap-first') as HTMLElement
        const last = container.querySelector('.trap-last') as HTMLElement

        // 外壳关闭按钮是 DOM 中第一个可 Tab 元素；trap-first 是其后的第一个正文按钮
        expect(firstSlotBtn).not.toBeNull()

        last.focus()
        pressKey('Tab')
        await nextTick()
        expect(activeElement()).toBe(closeBtn)

        closeBtn.focus()
        pressKey('Tab', { shiftKey: true })
        await nextTick()
        expect(activeElement()).toBe(last)
    })

    it('初始焦点在容器时，Shift+Tab 进入真实的最后一个可 Tab 元素（尾部 iframe/disabled/tabindex=-1/hidden/display:none 均排除）', async () => {
        const wrapper = mountBaseDialog({}, { default: trapSlot })
        await flushFocus()
        const container = wrapper.find('.dialog-container').element as HTMLElement
        const last = container.querySelector('.trap-last') as HTMLElement
        expect(activeElement()).toBe(container)

        pressKey('Tab', { shiftKey: true })
        await nextTick()
        expect(activeElement()).toBe(last)
    })

    it('焦点在对话框外时，Tab 会把焦点拉回对话框内第一个可聚焦元素', async () => {
        const outside = document.createElement('button')
        outside.className = 'outside-btn'
        document.body.appendChild(outside)
        const wrapper = mountBaseDialog({}, { default: trapSlot })
        await flushFocus()
        const container = wrapper.find('.dialog-container').element as HTMLElement
        const closeBtn = container.querySelector('.close-btn') as HTMLElement

        outside.focus()
        pressKey('Tab')
        await nextTick()
        expect(activeElement()).toBe(closeBtn)
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

describe('代表对话框扩展 a11y（描述关联 / 嵌套 / prepend 兼容）', () => {
    it('MessageDialog：标题命名 + 正文描述关联 + 初始焦点 + Esc 关闭', async () => {
        const wrapper = track(
            mount(MessageDialog, {
                ...dialogMountOptions,
                props: { visible: true, type: 'info', title: '提示', message: '保存失败，请重试' }
            })
        )
        await flushFocus()
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')

        // 命名：aria-labelledby 指向标题节点
        const labelledby = container.attributes('aria-labelledby')
        expect(labelledby).toBeTruthy()
        expect(wrapper.find(`[id="${labelledby}"]`).text()).toBe('提示')

        // 描述：aria-describedby 指向消息正文（读屏在标题后补充播报）
        const describedby = container.attributes('aria-describedby')
        expect(describedby).toBeTruthy()
        const descNode = wrapper.find(`[id="${describedby}"]`)
        expect(descNode.classes()).toContain('message-text')
        expect(descNode.text()).toBe('保存失败，请重试')

        // 初始焦点在对话框内，Esc 关闭
        expect(container.element.contains(activeElement())).toBe(true)
        pressKey('Escape')
        await nextTick()
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('MessageDialog 嵌套在已打开对话框上：Esc 只关顶层，关闭后焦点回到下层触发按钮', async () => {
        const lower = mountBaseDialog(
            { title: '设置' },
            { footer: '<button class="outer-trigger">打开消息</button>' }
        )
        await flushFocus()
        const trigger = lower.find('.outer-trigger').element as HTMLElement
        trigger.focus()

        const message = track(
            mount(MessageDialog, {
                ...dialogMountOptions,
                props: { visible: true, type: 'error', title: '错误', message: '操作失败' }
            })
        )
        await flushFocus()
        // 顶层消息框接管焦点
        expect(activeElement()).toBe(message.find('.dialog-container').element)

        pressKey('Escape')
        await nextTick()
        expect(message.emitted('close')).toHaveLength(1)
        expect(lower.emitted('close')).toBeUndefined()

        // 父组件收到 close 后置 visible=false：焦点归还到打开消息框前的下层按钮
        await message.setProps({ visible: false })
        await flushFocus()
        expect(activeElement()).toBe(trigger)
    })

    it('ConfirmDeleteDialog：删除文案作为 aria-describedby 描述', async () => {
        const wrapper = track(
            mount(ConfirmDeleteDialog, {
                ...dialogMountOptions,
                props: { visible: true, path: 'C:/notes/a.md', isFile: true }
            })
        )
        await flushFocus()
        const container = wrapper.find('.dialog-container')
        const describedby = container.attributes('aria-describedby')
        expect(describedby).toBeTruthy()
        const descNode = wrapper.find(`[id="${describedby}"]`)
        expect(descNode.classes()).toContain('message')
        expect(descNode.text()).toContain('C:/notes/a.md')
    })

    it('HelpAboutDialog：无可见标题节点时仍以 aria-label 提供可访问名称', async () => {
        const wrapper = track(
            mount(HelpAboutDialog, { ...dialogMountOptions, props: { visible: true } })
        )
        await flushFocus()
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('aria-labelledby')).toBeUndefined()
        expect(container.attributes('aria-label')).toBe(t('dialogRenderer.helpAbout.windowTitle'))
        expect(container.attributes('role')).toBe('dialog')
        expect(container.attributes('aria-modal')).toBe('true')
    })

    it('ThemeSettingDialog：prepend 的 8 个 resize-handle 不进入 Tab 次序，Tab 循环仍闭合', async () => {
        const wrapper = track(
            mount(ThemeSettingDialog, { ...dialogMountOptions, props: { visible: true } })
        )
        await flushFocus()
        const container = wrapper.find('.dialog-container').element as HTMLElement
        const handles = Array.from(container.querySelectorAll<HTMLElement>('.resize-handle'))
        expect(handles).toHaveLength(8)
        for (const handle of handles) {
            // 默认 tabIndex=-1：不进 Tab 次序，焦点陷阱不会把焦点丢到 resize-handle
            expect(handle.tabIndex).toBe(-1)
        }

        // 初始焦点在容器：Tab 应进入真实可聚焦元素（标题栏关闭按钮），而不是 resize-handle
        expect(activeElement()).toBe(container)
        pressKey('Tab')
        await nextTick()
        const active = activeElement()
        expect(active).not.toBeNull()
        expect(container.contains(active)).toBe(true)
        expect(active?.classList.contains('resize-handle')).toBe(false)
        expect(active?.tagName).toBe('BUTTON')
    })
})
