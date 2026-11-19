// @vitest-environment jsdom
/**
 * C-4 组（4 个需要 prepend / 特殊标题栏 / 特殊底栏的复杂对话框）迁移到 BaseDialog 后的外壳契约测试。
 *
 * 本组迁移前的外壳分叉点（迁移后必须等价）：
 * 1. 容器尺寸由对话框固定（EditorSetting 900×700、Mermaid 1400×900、ThemeSetting 900×600、
 *    HelpAbout 750×600）：BaseDialog 默认 500px 宽且无固定高，故统一经 width / containerStyle 覆盖；
 * 2. 标题栏：前三个是「标题文字 + 关闭按钮」标准结构（高度 48 / 48 / 40px），HelpAbout 则是
 *    「仅关闭按钮 + flex-end + padding 0 10px + Electron app-region drag」特殊结构，且不使用
 *    自定义拖拽（迁移前模板无 @mousedown，只能靠原生标题栏拖拽）；
 * 3. 底栏：前三个是右对齐操作按钮行（15px 24px 内边距 + 12px 间距 + flex-shrink:0），
 *    HelpAbout 是居中信息条（块级布局 + 10px 20px + 11px 次要文字）；
 * 4. ThemeSetting 的 8 个 resize-handle 必须仍渲染在 `.dialog-container` 内、`.title-bar` 之前
 *    （迁移后放进 BaseDialog 的 #prepend 插槽），class、顺序与指针事件绑定保持不变。
 *
 * 锁定内容：
 * 1. 外壳唯一且保留原 class（overlay/container/title-bar/title-text/close-btn/footer）；
 * 2. 变体 class、容器宽高、标题栏/标题文字/关闭按钮/底栏的内联覆盖与原 scoped 声明一致；
 * 3. ThemeSetting 的 resize-handle DOM 位置 / class / 事件绑定不丢失；
 * 4. HelpAbout 标题栏 flex-end / padding / 无标题文字 / drag + no-drag 与禁用自定义拖拽保持；
 * 5. 行为：遮罩空白处点击与关闭按钮点击均只 emit 一次 close；前三个对话框仍可标题栏拖拽。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'

import EditorSettingDialog from '@renderer/components/dialogs/complex/EditorSettingDialog.vue'
import MermaidEditDialog from '@renderer/components/dialogs/complex/MermaidEditDialog.vue'
import ThemeSettingDialog from '@renderer/components/dialogs/complex/ThemeSettingDialog.vue'
import HelpAboutDialog from '@renderer/components/dialogs/help/HelpAboutDialog.vue'

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

beforeEach(() => {
    // 外壳结构测试不依赖真实 IPC：仅 HelpAbout 的 onMounted 版本查询需要最小可用 stub，
    // 其余对话框的 watch 在「直接以 visible=true 挂载」时不会触发（与原测试口径一致）。
    vi.stubGlobal('api', {
        app: {
            getVersion: vi.fn().mockResolvedValue({
                appVersion: '1.3.6',
                electronVersion: '43.8.1',
                chromeVersion: '140.0.0',
                nodeVersion: '22.0.0',
                vueVersion: '3.5.42',
                viteVersion: '8.2.4',
                typescriptVersion: '6.0.2',
                monacoEditorVersion: '0.57.0',
                markdownItVersion: '15.0.3'
            })
        },
        config: { read: vi.fn().mockResolvedValue({}), write: vi.fn().mockResolvedValue(true) }
    })
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke: vi.fn().mockResolvedValue([]), send: vi.fn() }
    })
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

/** jsdom 未实现 -webkit-app-region：以 CSSStyleDeclaration 扩展键读取 Vue 的透传结果 */
type StyleWithAppRegion = CSSStyleDeclaration & { WebkitAppRegion?: string }

function appRegionOf(wrapper: VueWrapper, selector: string): string | undefined {
    return ((wrapper.find(selector).element as HTMLElement).style as StyleWithAppRegion)
        .WebkitAppRegion
}

/** 每个对话框迁移后的外壳期望值（与迁移前 scoped 外壳 CSS 逐条对应） */
interface ShellCase {
    name: string
    component: Component
    /** BaseDialog titleBarVariant 生成的 class */
    titleBarClass: string
    /** BaseDialog closeButtonVariant 生成的 class */
    closeButtonClass: string
    /** 容器内联宽度 / 高度 */
    width: string
    height: string
    /** 标题文字（HelpAboutDialog 为「仅关闭按钮」场景，没有标题文字，故为空串） */
    titleText: string
    /** 标题栏内联样式必须包含的片段（高度/padding/flex-shrink 等覆盖） */
    titleBarStyleIncludes: string[]
    /** 标题文字内联样式必须包含的片段（字号/字重覆盖） */
    titleTextStyleIncludes?: string[]
    /** 关闭按钮内联样式必须包含的片段（字号覆盖） */
    closeButtonStyleIncludes?: string[]
    /** 底栏内联样式必须包含的片段（padding/gap/布局覆盖） */
    footerStyleIncludes: string[]
    /** 标题栏 / 关闭按钮的 Electron app-region 覆盖（jsdom 用扩展键读取） */
    titleBarAppRegion?: 'drag' | 'no-drag'
    closeButtonAppRegion?: 'drag' | 'no-drag'
}

const SHELL_CASES: ShellCase[] = [
    {
        // 迁移前：48px 标题栏 / 16px 600 标题 / rounded 18px 关闭按钮 / 900×700
        name: 'EditorSettingDialog',
        component: EditorSettingDialog,
        titleBarClass: 'title-bar--large',
        closeButtonClass: 'close-btn--rounded',
        width: '900px',
        height: '700px',
        titleText: '编辑器设置',
        titleBarStyleIncludes: ['flex-shrink: 0'],
        titleTextStyleIncludes: ['font-size: 16px', 'font-weight: 600'],
        closeButtonStyleIncludes: ['font-size: 18px'],
        footerStyleIncludes: ['padding: 15px 24px', 'gap: 12px', 'flex-shrink: 0'],
        closeButtonAppRegion: 'no-drag'
    },
    {
        // 迁移前：48px 标题栏 / 16px 600 标题 / rounded 18px 关闭按钮 / 1400×900
        name: 'MermaidEditDialog',
        component: MermaidEditDialog,
        titleBarClass: 'title-bar--large',
        closeButtonClass: 'close-btn--rounded',
        width: '1400px',
        height: '900px',
        titleText: 'Mermaid 图表编辑',
        titleBarStyleIncludes: ['flex-shrink: 0'],
        titleTextStyleIncludes: ['font-size: 16px', 'font-weight: 600'],
        closeButtonStyleIncludes: ['font-size: 18px'],
        footerStyleIncludes: ['padding: 15px 24px', 'gap: 12px', 'flex-shrink: 0']
    },
    {
        // 迁移前：40px 标题栏 / 14px 500 标题 / rounded 16px 关闭按钮 / 900×600（可 resize）
        name: 'ThemeSettingDialog',
        component: ThemeSettingDialog,
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--rounded',
        width: '900px',
        height: '600px',
        titleText: '主题设置',
        titleBarStyleIncludes: ['flex-shrink: 0'],
        footerStyleIncludes: ['padding: 15px 24px', 'gap: 12px', 'flex-shrink: 0']
    },
    {
        // 迁移前：32px 标题栏（仅关闭按钮、右对齐、原生 drag）/ circle 28px 关闭按钮 / 750×600
        name: 'HelpAboutDialog',
        component: HelpAboutDialog,
        titleBarClass: 'title-bar--compact',
        closeButtonClass: 'close-btn--circle',
        width: '750px',
        height: '600px',
        titleText: '',
        titleBarStyleIncludes: [
            'justify-content: flex-end',
            'flex-shrink: 0',
            'cursor: auto',
            'user-select: auto'
        ],
        footerStyleIncludes: [
            'display: block',
            'padding: 10px 20px',
            'text-align: center',
            'font-size: 11px'
        ],
        titleBarAppRegion: 'drag',
        closeButtonAppRegion: 'no-drag'
    }
]

describe('C-4 迁移对话框外壳结构', () => {
    it.each(SHELL_CASES)('$name 使用唯一外壳且 class/尺寸/底栏与原声明一致', (shellCase) => {
        const wrapper = mountDialog(shellCase.component)

        // 1) 外壳唯一：每个对话框只能出现一套 BaseDialog 外壳（防重复包裹）
        expect(wrapper.findAll('.dialog-overlay')).toHaveLength(1)
        expect(wrapper.findAll('.dialog-container')).toHaveLength(1)
        expect(wrapper.findAll('.title-bar')).toHaveLength(1)
        expect(wrapper.findAll('.close-btn')).toHaveLength(1)

        // 2) 变体 class（等价于迁移前标题栏高度/字号与关闭按钮形态声明）
        expect(wrapper.find('.title-bar').classes()).toContain(shellCase.titleBarClass)
        expect(wrapper.find('.close-btn').classes()).toContain(shellCase.closeButtonClass)

        // 3) 标题文字节点保留（HelpAbout 为空串，即「仅关闭按钮」场景）
        const titleText = wrapper.find('.title-text')
        expect(titleText.exists()).toBe(true)
        expect(titleText.text()).toBe(shellCase.titleText)

        // 4) 容器内联宽高（迁移前固定在各自 scoped .dialog-container 中）
        const containerStyle = wrapper.find('.dialog-container').attributes('style') ?? ''
        expect(containerStyle).toContain(`width: ${shellCase.width}`)
        expect(containerStyle).toContain(`height: ${shellCase.height}`)

        // 5) 标题栏 / 标题文字 / 关闭按钮内联覆盖
        const titleBarStyle = wrapper.find('.title-bar').attributes('style') ?? ''
        for (const fragment of shellCase.titleBarStyleIncludes) {
            expect(titleBarStyle).toContain(fragment)
        }
        const titleTextStyle = titleText.attributes('style') ?? ''
        for (const fragment of shellCase.titleTextStyleIncludes ?? []) {
            expect(titleTextStyle).toContain(fragment)
        }
        const closeButtonStyle = wrapper.find('.close-btn').attributes('style') ?? ''
        for (const fragment of shellCase.closeButtonStyleIncludes ?? []) {
            expect(closeButtonStyle).toContain(fragment)
        }

        // 6) 底栏：4 个对话框迁移前均有底栏，且默认右对齐由 BaseDialog footer--end 提供
        const footer = wrapper.find('.footer')
        expect(footer.exists()).toBe(true)
        expect(footer.classes()).toContain('footer--end')
        const footerStyle = footer.attributes('style') ?? ''
        for (const fragment of shellCase.footerStyleIncludes) {
            expect(footerStyle).toContain(fragment)
        }

        // 7) Electron app-region 透传（jsdom 不实现该 CSS，以扩展键读取验证）
        if (shellCase.titleBarAppRegion) {
            expect(appRegionOf(wrapper, '.title-bar')).toBe(shellCase.titleBarAppRegion)
        }
        if (shellCase.closeButtonAppRegion) {
            expect(appRegionOf(wrapper, '.close-btn')).toBe(shellCase.closeButtonAppRegion)
        }
    })

    it('MermaidEditDialog 迁移前未声明 app-region，迁移后也不注入（仅保留自定义拖拽）', () => {
        const wrapper = mountDialog(MermaidEditDialog)
        expect(appRegionOf(wrapper, '.title-bar')).toBeUndefined()
        expect(appRegionOf(wrapper, '.close-btn')).toBeUndefined()
    })
})

describe('C-4 迁移对话框底栏内容', () => {
    it('EditorSettingDialog / ThemeSettingDialog 底栏保留取消/应用/确定按钮', () => {
        const editor = mountDialog(EditorSettingDialog)
        expect(editor.find('.footer .btn-cancel').exists()).toBe(true)
        expect(editor.find('.footer .btn-apply').exists()).toBe(true)
        expect(editor.find('.footer .btn-confirm').exists()).toBe(true)

        const theme = mountDialog(ThemeSettingDialog)
        expect(theme.find('.footer .btn-cancel').text()).toBe('取消')
        expect(theme.find('.footer .btn-apply').text()).toBe('应用')
        expect(theme.find('.footer .btn-confirm').text()).toBe('确定')
    })

    it('MermaidEditDialog 底栏保留取消/插入按钮', () => {
        const wrapper = mountDialog(MermaidEditDialog)
        expect(wrapper.find('.footer .btn-cancel').exists()).toBe(true)
        expect(wrapper.find('.footer .btn-primary').exists()).toBe(true)
    })

    it('HelpAboutDialog 底栏保留居中的链接信息条', () => {
        const wrapper = mountDialog(HelpAboutDialog)
        expect(wrapper.findAll('.footer a')).toHaveLength(2)
        expect(wrapper.find('.footer').text()).toContain('GitHub')
        expect(wrapper.find('.footer').text()).toContain('2024 Hemy08')
    })
})

describe('ThemeSettingDialog resize-handle（BaseDialog #prepend 插槽）', () => {
    const HANDLE_DIRECTIONS = [
        'resize-n',
        'resize-s',
        'resize-e',
        'resize-w',
        'resize-ne',
        'resize-nw',
        'resize-se',
        'resize-sw'
    ]

    it('8 个 resize-handle 仍是容器直接子节点，且全部位于 title-bar 之前', () => {
        const wrapper = mountDialog(ThemeSettingDialog)
        const container = wrapper.find('.dialog-container').element
        const children = Array.from(container.children)
        const titleBarIndex = children.findIndex((child) => child.classList.contains('title-bar'))

        // 迁移前 DOM 顺序：8 个 resize-handle → title-bar → 正文 → 底栏
        expect(titleBarIndex).toBe(8)
        expect(container.children.length).toBe(11)

        const handles = wrapper.findAll('.resize-handle')
        expect(handles).toHaveLength(8)
        const directions = handles.map((handle) =>
            HANDLE_DIRECTIONS.find((direction) => handle.classes().includes(direction))
        )
        expect(directions).toEqual(HANDLE_DIRECTIONS)

        // 每个 handle 都是容器直接子节点（绝对定位以容器为基准），且不在标题栏内部
        for (const handle of handles) {
            expect(handle.element.closest('.dialog-container')).toBe(container)
            expect(handle.element.closest('.title-bar')).toBeNull()
        }
        expect(wrapper.find('.title-bar .resize-handle').exists()).toBe(false)
        // prepend 插槽内容必须位于默认插槽正文之前（第 9 个子节点是标题栏，第 10 个是正文）
        expect(children[8].classList.contains('title-bar')).toBe(true)
        expect(children[9].classList.contains('main-container')).toBe(true)
    })

    it('resize-handle 的 mousedown 绑定保留，且不会误触发标题栏拖拽', async () => {
        const wrapper = mountDialog(ThemeSettingDialog)
        // 事件绑定保留：派发 mousedown 不应抛错（useDialogResize.startResize 仍是原处理链）
        await wrapper.find('.resize-handle.resize-se').trigger('mousedown', {
            clientX: 500,
            clientY: 500
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 550, clientY: 540 }))
        await nextTick()
        const containerStyle = wrapper.find('.dialog-container').attributes('style') ?? ''
        // 未按下标题栏，不应产生自定义拖拽的 left/top 改写
        expect(containerStyle).toContain('left: 50%')
        expect(containerStyle).not.toContain('left: 80px')
        document.dispatchEvent(new MouseEvent('mouseup'))
    })
})

describe('HelpAboutDialog 特殊标题栏', () => {
    it('标题栏只有空标题文字 + 关闭按钮两个子节点，无可见标题文案', () => {
        const wrapper = mountDialog(HelpAboutDialog)
        const titleBar = wrapper.find('.title-bar').element
        expect(titleBar.children).toHaveLength(2)
        expect((titleBar.children[0] as HTMLElement).className).toContain('title-text')
        expect(wrapper.find('.title-bar .title-text').text()).toBe('')
        expect(wrapper.find('.title-bar .close-btn').exists()).toBe(true)
        expect(wrapper.find('.title-bar').text().replace('×', '').trim()).toBe('')
        // 未传 titleTextStyle，空标题节点不应带内联样式
        expect(wrapper.find('.title-text').attributes('style')).toBeUndefined()
    })

    it('标题栏保留 flex-end/padding 0 10px，且用原生 app-region 拖拽而非自定义拖拽', async () => {
        const wrapper = mountDialog(HelpAboutDialog)
        const titleBarStyle = wrapper.find('.title-bar').attributes('style') ?? ''
        expect(titleBarStyle).toContain('justify-content: flex-end')
        // jsdom 会把 padding 的 0 归一化成 0px，用正则兼容两种序列化
        expect(titleBarStyle).toMatch(/padding: 0(px)? 10px/)
        expect(appRegionOf(wrapper, '.title-bar')).toBe('drag')
        expect(appRegionOf(wrapper, '.close-btn')).toBe('no-drag')

        // draggable=false：按下标题栏后移动鼠标不会改写容器定位（仍保持居中 fixed 定位）
        await wrapper.find('.title-bar').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 160 }))
        await nextTick()
        const containerStyle = wrapper.find('.dialog-container').attributes('style') ?? ''
        expect(containerStyle).toContain('left: 50%')
        expect(containerStyle).not.toContain('left: 80px')
        document.dispatchEvent(new MouseEvent('mouseup'))
    })
})

describe('C-4 迁移对话框拖拽行为', () => {
    const DRAGGABLE_CASES = SHELL_CASES.filter((shellCase) => shellCase.name !== 'HelpAboutDialog')

    it.each(DRAGGABLE_CASES)('$name 仍支持按住标题栏拖拽移动', async (shellCase) => {
        const wrapper = mountDialog(shellCase.component)
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
})

describe('C-4 迁移对话框关闭行为', () => {
    it.each(SHELL_CASES)('$name 点击遮罩空白处只 emit 一次 close', async (shellCase) => {
        const wrapper = mountDialog(shellCase.component)
        await wrapper.find('.dialog-overlay').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it.each(SHELL_CASES)('$name 点击关闭按钮只 emit 一次 close', async (shellCase) => {
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
