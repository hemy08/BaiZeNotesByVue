// @vitest-environment jsdom
/**
 * C-2 组（7 个「零/纯样式覆盖」对话框）迁移到 BaseDialog 后的外壳契约测试。
 *
 * 迁移前这 7 个对话框各自复制了 `.dialog-overlay/.dialog-container/.title-bar/.title-text/
 * .close-btn/.footer/过渡动画` 外壳；迁移后统一由 BaseDialog 承载。本文件锁定：
 * 1. 外壳 DOM 唯一且保留原 class（overlay/container/title-bar/title-text/close-btn/footer），
 *    避免 BaseDialog 之外的重复壳或外壳 class 丢失导致既有测试/外部选择器失效；
 * 2. 变体与内联覆盖与原声明一致（标题栏 32/40/36px、关闭按钮 circle/rounded、容器宽度、
 *    MdSheet 标题字距、MaterialSyntax/TechStack 的 flex-shrink 与尺寸覆盖）；
 * 3. 结构差异：MdSheet/MathText 迁移前无底栏（不得凭空多出 `.footer`）；InsertImage 的
 *    `.footer` 迁移前嵌在带 20px 内边距的 `.content` 内，迁移后必须保持该嵌套（否则通栏贴边）；
 * 4. 行为：遮罩空白处点击与关闭按钮点击均只 emit 一次 close；MathText 打开时重置拖拽位置。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'

import ImportOptionDialog from '@renderer/components/dialogs/medium/ImportOptionDialog.vue'
import AdmonitionDialog from '@renderer/components/dialogs/medium/AdmonitionDialog.vue'
import InsertImageDialog from '@renderer/components/dialogs/medium/InsertImageDialog.vue'
import MdSheetDialog from '@renderer/components/dialogs/medium/MdSheetDialog.vue'
import MathTextDialog from '@renderer/components/dialogs/medium/MathTextDialog.vue'
import MaterialSyntaxDialog from '@renderer/components/dialogs/complex/MaterialSyntaxDialog.vue'
import TechStackDialog from '@renderer/components/dialogs/help/TechStackDialog.vue'
import { t } from '@renderer/common/i18n'

// 对话框使用 <Teleport to="body">，测试时 stub 成内联渲染以便断言
const dialogMountOptions = { global: { stubs: { teleport: true } } }

let wrappers: VueWrapper[] = []

/** 挂载一个可见对话框并登记，afterEach 统一卸载 */
function mountDialog(component: Component): VueWrapper {
    const wrapper = mount(component, {
        ...dialogMountOptions,
        props: { visible: true }
    }) as VueWrapper
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
})

/** 每个对话框迁移后的外壳期望值（与迁移前的 scoped 外壳 CSS 逐条对应） */
interface ShellCase {
    name: string
    component: Component
    /** BaseDialog titleBarVariant 生成的 class */
    titleBarClass: string
    /** BaseDialog closeButtonVariant 生成的 class */
    closeButtonClass: string
    /** 容器内联宽度（不传 width 的 ImportOptionDialog 为默认 500px，无内联 width） */
    width?: string
    /** 是否有 BaseDialog footer 插槽渲染的底栏 */
    hasFooter: boolean
    /** InsertImageDialog：底栏仍嵌在正文 .content 内（非 BaseDialog footer 插槽） */
    footerInContent?: boolean
    /** 容器内联样式必须包含的片段（尺寸覆盖） */
    containerStyleIncludes?: string[]
    /** 标题栏内联样式必须包含的片段（高度/padding/flex-shrink 等覆盖） */
    titleBarStyleIncludes?: string[]
    /** 标题文字内联样式必须包含的片段（字距等覆盖） */
    titleTextStyleIncludes?: string[]
}

const SHELL_CASES: ShellCase[] = [
    {
        // 默认变体零覆盖：compact/circle + 默认 500px 宽度 + 默认底栏
        name: 'ImportOptionDialog',
        component: ImportOptionDialog,
        titleBarClass: 'title-bar--compact',
        closeButtonClass: 'close-btn--circle',
        hasFooter: true
    },
    {
        name: 'AdmonitionDialog',
        component: AdmonitionDialog,
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--rounded',
        width: '650px',
        hasFooter: true
    },
    {
        name: 'InsertImageDialog',
        component: InsertImageDialog,
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--rounded',
        width: '600px',
        hasFooter: true,
        footerInContent: true
    },
    {
        name: 'MdSheetDialog',
        component: MdSheetDialog,
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--rounded',
        width: '530px',
        hasFooter: false,
        titleTextStyleIncludes: ['letter-spacing: 0.5px']
    },
    {
        name: 'MathTextDialog',
        component: MathTextDialog,
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--circle',
        width: '1280px',
        hasFooter: false,
        titleBarStyleIncludes: ['height: 36px', 'padding: 0px 12px']
    },
    {
        name: 'MaterialSyntaxDialog',
        component: MaterialSyntaxDialog,
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--rounded',
        width: '900px',
        hasFooter: true,
        containerStyleIncludes: ['max-width: 94vw', 'height: 640px', 'max-height: 88vh'],
        titleBarStyleIncludes: ['flex-shrink: 0']
    },
    {
        name: 'TechStackDialog',
        component: TechStackDialog,
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--circle',
        width: '900px',
        hasFooter: true,
        containerStyleIncludes: ['height: 700px'],
        // app-region 在 jsdom 中会被忽略（Electron 生效），这里锁定其余标题栏覆盖声明
        titleBarStyleIncludes: ['flex-shrink: 0', 'cursor: auto', 'user-select: auto']
    }
]

describe('C-2 迁移对话框外壳结构', () => {
    it.each(SHELL_CASES)('$name 使用唯一外壳且 class/宽度/底栏与原声明一致', (shellCase) => {
        const wrapper = mountDialog(shellCase.component)

        // 1) 外壳唯一：每个对话框只能出现一套 BaseDialog 外壳（防重复包裹）
        expect(wrapper.findAll('.dialog-overlay')).toHaveLength(1)
        expect(wrapper.findAll('.dialog-container')).toHaveLength(1)
        expect(wrapper.findAll('.title-bar')).toHaveLength(1)
        expect(wrapper.findAll('.close-btn')).toHaveLength(1)

        // 2) 变体 class（等同于迁移前标题栏高度/字号与关闭按钮形态声明）
        expect(wrapper.find('.title-bar').classes()).toContain(shellCase.titleBarClass)
        expect(wrapper.find('.close-btn').classes()).toContain(shellCase.closeButtonClass)

        // 3) 标题文字节点保留（原 .title-text，内容来自标题 props）
        const titleText = wrapper.find('.title-text')
        expect(titleText.exists()).toBe(true)
        expect(titleText.text().trim().length).toBeGreaterThan(0)

        // 4) 容器宽度
        const containerStyle = wrapper.find('.dialog-container').attributes('style') ?? ''
        if (shellCase.width) {
            expect(containerStyle).toContain(`width: ${shellCase.width}`)
        } else {
            // 默认变体：宽度由 BaseDialog 默认壳 CSS 提供（500px），不做内联覆盖
            expect(containerStyle).not.toContain('width:')
        }
        for (const fragment of shellCase.containerStyleIncludes ?? []) {
            expect(containerStyle).toContain(fragment)
        }

        // 5) 标题栏/标题文字内联覆盖
        const titleBarStyle = wrapper.find('.title-bar').attributes('style') ?? ''
        for (const fragment of shellCase.titleBarStyleIncludes ?? []) {
            expect(titleBarStyle).toContain(fragment)
        }
        const titleTextStyle = titleText.attributes('style') ?? ''
        for (const fragment of shellCase.titleTextStyleIncludes ?? []) {
            expect(titleTextStyle).toContain(fragment)
        }

        // 6) 底栏：有无与嵌套位置（无 footer 的对话框不得凭空多出底栏）
        const footer = wrapper.find('.footer')
        expect(footer.exists()).toBe(shellCase.hasFooter)
        if (shellCase.hasFooter && !shellCase.footerInContent) {
            // BaseDialog footer 插槽渲染的底栏带 footerAlign 变体 class
            expect(footer.classes()).toContain('footer--end')
        }
        if (shellCase.footerInContent) {
            // 迁移前 .footer 是 .content（padding:20px）的子元素，视觉上不通栏贴边
            expect(wrapper.find('.content > .footer').exists()).toBe(true)
        }
    })

    it('MaterialSyntaxDialog 底栏渲染取消/插入按钮，TechStackDialog 底栏渲染信息文案', () => {
        const material = mountDialog(MaterialSyntaxDialog)
        expect(material.find('.footer .btn-cancel').exists()).toBe(true)
        expect(material.find('.footer .btn-insert').exists()).toBe(true)

        const techStack = mountDialog(TechStackDialog)
        expect(techStack.find('.footer').text()).toBe(t('dialogRenderer.techStack.footer'))
    })
})

describe('C-2 迁移对话框关闭行为', () => {
    it.each(SHELL_CASES)('$name 点击遮罩空白处 emit close', async (shellCase) => {
        const wrapper = mountDialog(shellCase.component)
        await wrapper.find('.dialog-overlay').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it.each(SHELL_CASES)('$name 点击关闭按钮 emit close 且不重复触发', async (shellCase) => {
        const wrapper = mountDialog(shellCase.component)
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it.each(SHELL_CASES)('$name visible=false 时不渲染外壳', (shellCase) => {
        const wrapper = mount(shellCase.component, {
            ...dialogMountOptions,
            props: { visible: false }
        }) as VueWrapper
        wrappers.push(wrapper)
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
        expect(wrapper.find('.dialog-container').exists()).toBe(false)
    })
})

describe('MathTextDialog 拖拽位置重置', () => {
    it('重新打开时回到初始居中位置（等价于迁移前 visible 监听内 resetPosition）', async () => {
        const wrapper = mountDialog(MathTextDialog)
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

        await wrapper.setProps({ visible: false })
        await wrapper.setProps({ visible: true })
        expect(wrapper.find('.dialog-container').attributes('style')).toContain('left: 50%')
    })
})
