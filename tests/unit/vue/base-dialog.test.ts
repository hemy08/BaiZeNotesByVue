// @vitest-environment jsdom
/**
 * BaseDialog 统一外壳单元测试（第 3 批组件化子任务 C，保守抽层）
 *
 * 覆盖点（只锁定「抽层后必须等价」的外壳契约，不涉及具体业务对话框）：
 * 1. 显隐：visible=false 不渲染遮罩/容器；默认 Teleport 到 body，可关闭 Teleport；
 * 2. 结构：overlay → container → title-bar(title-text/close-btn) → 默认插槽 → footer 插槽；
 *    未提供 footer 插槽时不渲染底栏（MathTextDialog / MdSheetDialog 等迁移前无 footer）；
 * 3. 关闭行为：遮罩空白处点击、关闭按钮点击均 emit('close')；closeOnOverlay=false 时
 *    点遮罩不关闭；点关闭按钮不会二次触发遮罩 close（.stop + click.self）；
 * 4. 变体：titleBarVariant / closeButtonVariant / footerAlign / animation 生成对应 class，
 *    width 写入容器内联样式，containerClass 合并到容器 class；
 * 5. 拖拽：默认按标题栏拖拽会改写容器定位样式；draggable=false 不绑定 document 监听；
 *    resetPositionOnOpen 打开时重置位置，默认（false）沿用上次拖拽位置。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import BaseDialog from '@renderer/components/dialogs/BaseDialog.vue'

/** 对话框默认 <Teleport to="body">，测试里 stub 成内联渲染以便断言（与既有对话框测试一致） */
const teleportStub = { global: { stubs: { teleport: true } } }

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

describe('BaseDialog 结构', () => {
    it('visible=false 时不渲染遮罩与容器', () => {
        const wrapper = track(mount(BaseDialog, { ...teleportStub, props: { visible: false } }))
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
        expect(wrapper.find('.dialog-container').exists()).toBe(false)
    })

    it('渲染标题、默认插槽内容与 footer 插槽内容', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: { visible: true, title: '标题' },
                slots: {
                    default: '<div class="body-slot">正文</div>',
                    footer: '<button class="footer-btn">确定</button>'
                }
            })
        )
        expect(wrapper.find('.title-text').text()).toBe('标题')
        expect(wrapper.find('.body-slot').text()).toBe('正文')
        expect(wrapper.find('.footer').exists()).toBe(true)
        expect(wrapper.find('.footer-btn').text()).toBe('确定')
    })

    it('未提供 footer 插槽时不渲染底栏（保留无 footer 对话框的原有 DOM）', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: { visible: true, title: '标题' },
                slots: { default: '<div class="body-slot">正文</div>' }
            })
        )
        expect(wrapper.find('.footer').exists()).toBe(false)
    })

    it('title 插槽可完全覆盖默认标题节点', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: { visible: true, title: '默认标题' },
                slots: { title: '<span class="custom-title">自定义</span>' }
            })
        )
        expect(wrapper.find('.custom-title').text()).toBe('自定义')
        expect(wrapper.find('.title-text').exists()).toBe(false)
    })

    it('默认 Teleport 到 body；teleport=false 时内联渲染', () => {
        const teleported = mount(BaseDialog, { props: { visible: true } })
        expect(document.body.querySelector('.dialog-overlay')).not.toBeNull()
        teleported.unmount()

        const inline = track(mount(BaseDialog, { props: { visible: true, teleport: false } }))
        expect(inline.find('.dialog-overlay').exists()).toBe(true)
        expect(document.body.querySelector('.dialog-overlay')).toBeNull()
    })
})

describe('BaseDialog 关闭行为', () => {
    it('点击遮罩空白处 emit close', async () => {
        const wrapper = track(mount(BaseDialog, { ...teleportStub, props: { visible: true } }))
        await wrapper.find('.dialog-overlay').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('closeOnOverlay=false 时点击遮罩不关闭', async () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: { visible: true, closeOnOverlay: false }
            })
        )
        await wrapper.find('.dialog-overlay').trigger('click')
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('点击关闭按钮 emit close，且不会重复触发遮罩关闭', async () => {
        const wrapper = track(mount(BaseDialog, { ...teleportStub, props: { visible: true } }))
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('BaseDialog 变体与覆盖钩子', () => {
    it('标题栏/关闭按钮/底部对齐/动画变体生成对应 class', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: {
                    visible: true,
                    titleBarVariant: 'large',
                    closeButtonVariant: 'rounded',
                    footerAlign: 'center',
                    animation: 'smooth'
                },
                slots: { footer: '<button>确定</button>' }
            })
        )
        expect(wrapper.find('.title-bar').classes()).toContain('title-bar--large')
        expect(wrapper.find('.close-btn').classes()).toContain('close-btn--rounded')
        expect(wrapper.find('.footer').classes()).toContain('footer--center')
        expect(wrapper.find('.dialog-overlay').classes()).toContain('dialog-anim--smooth')
    })

    it('默认变体为 simple 对话框迁移前的 compact/circle/end/quick', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: { visible: true },
                slots: { footer: '<button>确定</button>' }
            })
        )
        expect(wrapper.find('.title-bar').classes()).toContain('title-bar--compact')
        expect(wrapper.find('.close-btn').classes()).toContain('close-btn--circle')
        expect(wrapper.find('.footer').classes()).toContain('footer--end')
        expect(wrapper.find('.dialog-overlay').classes()).toContain('dialog-anim--quick')
    })

    it('width 写入容器内联样式，containerClass 合并到容器 class', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: { visible: true, width: '520px', containerClass: 'info-dialog' }
            })
        )
        const container = wrapper.find('.dialog-container')
        expect(container.classes()).toContain('info-dialog')
        expect(container.attributes('style')).toContain('width: 520px')
    })

    it('containerStyle / titleBarStyle 覆盖默认外壳样式', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: {
                    visible: true,
                    containerStyle: { background: 'var(--card-bg)' },
                    titleBarStyle: { background: 'linear-gradient(135deg, #000, #fff)' }
                }
            })
        )
        expect(wrapper.find('.dialog-container').attributes('style')).toContain(
            'background: var(--card-bg)'
        )
        expect(wrapper.find('.title-bar').attributes('style')).toContain('linear-gradient')
    })
})

describe('BaseDialog 拖拽行为', () => {
    it('默认按标题栏拖拽会改写容器定位样式', async () => {
        const wrapper = track(mount(BaseDialog, { ...teleportStub, props: { visible: true } }))
        await wrapper.find('.title-bar').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 160 }))
        await nextTick()
        expect(wrapper.find('.dialog-container').attributes('style')).toContain('left: 80px')

        // 收尾：移除拖拽期间注册的 document 监听器
        document.dispatchEvent(new MouseEvent('mouseup'))
    })

    it('draggable=false 时标题栏按下不绑定 document 拖拽监听', async () => {
        const addEventListenerSpy = vi.spyOn(document, 'addEventListener')
        const wrapper = track(
            mount(BaseDialog, { ...teleportStub, props: { visible: true, draggable: false } })
        )
        await wrapper.find('.title-bar').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        const dragListenerCalls = addEventListenerSpy.mock.calls.filter(
            (call) => call[0] === 'mousemove' || call[0] === 'mouseup'
        )
        expect(dragListenerCalls).toHaveLength(0)
    })

    it('resetPositionOnOpen=true 时重新打开会回到初始居中位置', async () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...teleportStub,
                props: { visible: true, resetPositionOnOpen: true }
            })
        )
        await wrapper.find('.title-bar').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 160 }))
        await nextTick()
        expect(wrapper.find('.dialog-container').attributes('style')).toContain('left: 80px')
        document.dispatchEvent(new MouseEvent('mouseup'))

        await wrapper.setProps({ visible: false })
        await wrapper.setProps({ visible: true })
        expect(wrapper.find('.dialog-container').attributes('style')).toContain('left: 50%')
    })

    it('resetPositionOnOpen 默认 false：重新打开沿用上次拖拽位置', async () => {
        const wrapper = track(mount(BaseDialog, { ...teleportStub, props: { visible: true } }))
        await wrapper.find('.title-bar').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 160 }))
        await nextTick()
        document.dispatchEvent(new MouseEvent('mouseup'))

        await wrapper.setProps({ visible: false })
        await wrapper.setProps({ visible: true })
        expect(wrapper.find('.dialog-container').attributes('style')).toContain('left: 80px')
    })
})
