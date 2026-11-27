// @vitest-environment jsdom
/**
 * C-3 组（4 个需要 titleTextStyle / closeButtonStyle 扩展能力的对话框）迁移到 BaseDialog
 * 后的外壳契约测试。
 *
 * 迁移前这 4 个对话框各自复制了 `.dialog-overlay/.dialog-container/.title-bar/.title-text/
 * .close-btn/.footer/过渡动画` 外壳；迁移后统一由 BaseDialog 承载。本文件锁定：
 * 1. 外壳 DOM 唯一且保留原 class，避免重复壳或外壳 class 丢失导致既有测试/外部选择器失效；
 * 2. 变体与内联覆盖与原声明逐条对应：
 *    - FontSelectDialog：regular + rounded + 1280×800 + 标题字距 0.5px + 底栏 15px 24px/gap12；
 *    - SystemSettingDialog：regular + rounded + 900×650 + 标题 16px/600 + 关闭按钮 18px；
 *    - HelpContactUsDialog：large + rounded + 600 + 标题 16px/600 + 关闭按钮 18px + 居中底栏；
 *    - QuickLinkSettingDialog：large + rounded + 800×600 + 标题 16px + 关闭按钮 18px；
 *    同时校验 titleBar / container / footer 的 flex-shrink 等「防压缩」覆盖；
 * 3. 拖拽方式：complex 组沿用 JS 拖拽（拖动标题栏会改写容器位置），help 组迁移前是
 *    Electron 原生 app-region drag（无 JS 拖拽），经 draggable=false + WebkitAppRegion 还原；
 * 4. 行为：遮罩空白处点击与关闭按钮点击均只 emit 一次 close；无 resetPositionOnOpen 时
 *    重新打开沿用上次拖拽位置（与迁移前一致）；
 * 5. 源码级防回归：4 个对话框不再保留本地外壳 scoped CSS / useDialogDrag 调用。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick, type Component } from 'vue'
import fs from 'node:fs'
import path from 'node:path'

import FontSelectDialog from '@renderer/components/dialogs/complex/FontSelectDialog.vue'
import SystemSettingDialog from '@renderer/components/dialogs/complex/SystemSettingDialog.vue'
import HelpContactUsDialog from '@renderer/components/dialogs/help/HelpContactUsDialog.vue'
import QuickLinkSettingDialog from '@renderer/components/dialogs/help/QuickLinkSettingDialog.vue'
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

beforeEach(() => {
    // SystemSettingDialog 打开时读配置 / QuickLinkSettingDialog 打开时读 quickLinks：
    // shell 测试不关心 IPC 内容，统一给最小桩避免未定义全局导致的控制台噪音。
    vi.stubGlobal('api', { config: { read: vi.fn().mockResolvedValue(null) } })
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke: vi.fn().mockResolvedValue(undefined),
            send: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn()
        }
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
    vi.unstubAllGlobals()
})

/** jsdom 未实现 -webkit-app-region：以 CSSStyleDeclaration 扩展键读取 Vue 的透传结果 */
type StyleWithAppRegion = CSSStyleDeclaration & { WebkitAppRegion?: string }

function findStyleWithAppRegion(wrapper: VueWrapper, selector: string): StyleWithAppRegion {
    return (wrapper.find(selector).element as HTMLElement).style as StyleWithAppRegion
}

/** 每个对话框迁移后的外壳期望值（与迁移前 scoped 外壳 CSS 逐条对应） */
interface ShellCase {
    name: string
    component: Component
    /** BaseDialog title 属性值（迁移前 .title-text 的 i18n 文案） */
    title: string
    /** BaseDialog titleBarVariant 生成的 class */
    titleBarClass: string
    /** BaseDialog closeButtonVariant 生成的 class */
    closeButtonClass: string
    /** 容器内联宽度（迁移前 .dialog-container 的 width） */
    width: string
    /** BaseDialog footerAlign 生成的 class（迁移前底栏 justify-content） */
    footerAlignClass: string
    /** 容器内联样式必须包含的片段（尺寸覆盖） */
    containerStyleIncludes?: string[]
    /** 标题栏内联样式必须包含的片段（flex-shrink / cursor / user-select 等覆盖） */
    titleBarStyleIncludes?: string[]
    /** 标题文字内联样式必须包含的片段（字距/字号/字重等覆盖） */
    titleTextStyleIncludes?: string[]
    /** 关闭按钮内联样式必须包含的片段（18px 图标等覆盖） */
    closeButtonStyleIncludes?: string[]
    /** 底栏内联样式必须包含的片段（padding/gap/flex-shrink 覆盖） */
    footerStyleIncludes?: string[]
    /** 标题栏的 Electron 拖拽区期望（迁移前 CSS 的 -webkit-app-region） */
    titleBarAppRegion?: 'drag'
    /** 关闭按钮的 Electron no-drag 期望（拖拽区内按钮可点击） */
    closeButtonAppRegion?: 'no-drag'
    /** 是否沿用 JS 拖拽（useDialogDrag）：拖动标题栏会改写容器 left/top */
    jsDraggable: boolean
    /** 底栏按钮文案（按 DOM 顺序） */
    footerButtons: string[]
}

const SHELL_CASES: ShellCase[] = [
    {
        name: 'FontSelectDialog',
        component: FontSelectDialog,
        title: t('dialogRenderer.fontSelect.title'),
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--rounded',
        width: '1280px',
        footerAlignClass: 'footer--end',
        containerStyleIncludes: ['height: 800px', 'min-width: 1000px', 'min-height: 600px'],
        titleBarStyleIncludes: ['flex-shrink: 0'],
        titleTextStyleIncludes: ['letter-spacing: 0.5px'],
        footerStyleIncludes: ['padding: 15px 24px', 'gap: 12px', 'flex-shrink: 0'],
        jsDraggable: true,
        footerButtons: [t('common.cancel'), t('common.insert'), t('common.ok')]
    },
    {
        name: 'SystemSettingDialog',
        component: SystemSettingDialog,
        title: t('dialogRenderer.systemSetting.title'),
        titleBarClass: 'title-bar--regular',
        closeButtonClass: 'close-btn--rounded',
        width: '900px',
        footerAlignClass: 'footer--end',
        containerStyleIncludes: ['height: 650px'],
        titleBarStyleIncludes: ['flex-shrink: 0'],
        titleTextStyleIncludes: ['font-size: 16px', 'font-weight: 600'],
        closeButtonStyleIncludes: ['font-size: 18px'],
        footerStyleIncludes: ['padding: 15px 24px', 'gap: 12px', 'flex-shrink: 0'],
        closeButtonAppRegion: 'no-drag',
        jsDraggable: true,
        footerButtons: [t('common.cancel'), t('common.apply'), t('common.ok')]
    },
    {
        name: 'HelpContactUsDialog',
        component: HelpContactUsDialog,
        title: t('dialogRenderer.helpContactUs.title'),
        titleBarClass: 'title-bar--large',
        closeButtonClass: 'close-btn--rounded',
        width: '600px',
        footerAlignClass: 'footer--center',
        titleBarStyleIncludes: ['flex-shrink: 0', 'cursor: auto', 'user-select: auto'],
        titleTextStyleIncludes: ['font-size: 16px', 'font-weight: 600'],
        closeButtonStyleIncludes: ['font-size: 18px'],
        footerStyleIncludes: ['flex-shrink: 0'],
        titleBarAppRegion: 'drag',
        closeButtonAppRegion: 'no-drag',
        jsDraggable: false,
        footerButtons: [t('common.close')]
    },
    {
        name: 'QuickLinkSettingDialog',
        component: QuickLinkSettingDialog,
        title: t('dialogRenderer.quickLink.title'),
        titleBarClass: 'title-bar--large',
        closeButtonClass: 'close-btn--rounded',
        width: '800px',
        footerAlignClass: 'footer--end',
        containerStyleIncludes: ['height: 600px'],
        titleBarStyleIncludes: ['flex-shrink: 0', 'cursor: auto', 'user-select: auto'],
        titleTextStyleIncludes: ['font-size: 16px'],
        closeButtonStyleIncludes: ['font-size: 18px'],
        footerStyleIncludes: ['gap: 12px', 'flex-shrink: 0'],
        titleBarAppRegion: 'drag',
        closeButtonAppRegion: 'no-drag',
        jsDraggable: false,
        footerButtons: [t('common.cancel'), t('common.apply'), t('common.ok')]
    }
]

describe('C-3 迁移对话框外壳结构', () => {
    it.each(SHELL_CASES)('$name 使用唯一外壳且变体/尺寸/覆盖样式与原声明一致', (shellCase) => {
        const wrapper = mountDialog(shellCase.component)

        // 1) 外壳唯一：每个对话框只能出现一套 BaseDialog 外壳（防重复包裹）
        expect(wrapper.findAll('.dialog-overlay')).toHaveLength(1)
        expect(wrapper.findAll('.dialog-container')).toHaveLength(1)
        expect(wrapper.findAll('.title-bar')).toHaveLength(1)
        expect(wrapper.findAll('.close-btn')).toHaveLength(1)
        expect(wrapper.findAll('.footer')).toHaveLength(1)

        // 2) 变体 class（等同于迁移前标题栏高度/字号与关闭按钮形态声明）
        expect(wrapper.find('.title-bar').classes()).toContain(shellCase.titleBarClass)
        expect(wrapper.find('.close-btn').classes()).toContain(shellCase.closeButtonClass)
        // 迁移前动画为 0.2s 透明度淡入 + scale(0.9) 缩放，与 quick 预设一致
        expect(wrapper.find('.dialog-overlay').classes()).toContain('dialog-anim--quick')

        // 3) 标题文字节点保留（原 .title-text，内容来自 title 属性）
        const titleText = wrapper.find('.title-text')
        expect(titleText.text()).toBe(shellCase.title)

        // 4) 容器宽度与尺寸覆盖
        const containerStyle = wrapper.find('.dialog-container').attributes('style') ?? ''
        expect(containerStyle).toContain(`width: ${shellCase.width}`)
        for (const fragment of shellCase.containerStyleIncludes ?? []) {
            expect(containerStyle).toContain(fragment)
        }

        // 5) 标题栏/标题文字/关闭按钮内联覆盖
        const titleBarStyle = wrapper.find('.title-bar').attributes('style') ?? ''
        for (const fragment of shellCase.titleBarStyleIncludes ?? []) {
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

        // 6) 底栏：对齐方式、内边距/间距覆盖与按钮文案（迁移前 footer 内容顺序不变）
        const footer = wrapper.find('.footer')
        expect(footer.classes()).toContain(shellCase.footerAlignClass)
        const footerStyle = footer.attributes('style') ?? ''
        for (const fragment of shellCase.footerStyleIncludes ?? []) {
            expect(footerStyle).toContain(fragment)
        }
        expect(footer.findAll('button').map((button) => button.text())).toEqual(
            shellCase.footerButtons
        )

        // 7) Electron app-region：jsdom 不实现该 CSS 属性，以扩展键读取验证透传
        //    （help 组标题栏拖拽依赖 drag，关闭按钮依赖 no-drag 才能在拖拽区内点击）
        if (shellCase.titleBarAppRegion) {
            expect(findStyleWithAppRegion(wrapper, '.title-bar').WebkitAppRegion).toBe(
                shellCase.titleBarAppRegion
            )
        } else {
            expect(findStyleWithAppRegion(wrapper, '.title-bar').WebkitAppRegion).toBeUndefined()
        }
        if (shellCase.closeButtonAppRegion) {
            expect(findStyleWithAppRegion(wrapper, '.close-btn').WebkitAppRegion).toBe(
                shellCase.closeButtonAppRegion
            )
        }
    })

    it('源码不再保留本地外壳 scoped CSS / useDialogDrag 调用（外壳唯一真源为 BaseDialog）', () => {
        const ROOT = path.resolve(__dirname, '../../..')
        const files = [
            'src/renderer/src/components/dialogs/complex/FontSelectDialog.vue',
            'src/renderer/src/components/dialogs/complex/SystemSettingDialog.vue',
            'src/renderer/src/components/dialogs/help/HelpContactUsDialog.vue',
            'src/renderer/src/components/dialogs/help/QuickLinkSettingDialog.vue'
        ]
        const shellSelectors = [
            '.dialog-overlay',
            '.dialog-container',
            '.title-bar',
            '.title-text',
            '.close-btn',
            '.footer',
            '.dialog-fade-enter-active',
            '.dialog-scale-enter-active'
        ]
        for (const file of files) {
            const source = fs.readFileSync(path.join(ROOT, file), 'utf-8')
            expect(source).toContain('<BaseDialog')
            // 防回归：不得再自行引入/调用 useDialogDrag（拖拽能力收敛到 BaseDialog；
            // 注释中说明「迁移前 useDialogDrag 未重置位置」不算调用）
            expect(source).not.toMatch(/import\s*\{\s*useDialogDrag\s*\}/)
            expect(source).not.toMatch(/useDialogDrag\(/)
            for (const selector of shellSelectors) {
                expect(source).not.toMatch(
                    new RegExp(
                        `^\\s*${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{`,
                        'm'
                    )
                )
            }
        }
    })
})

describe('C-3 迁移对话框关闭行为', () => {
    it.each(SHELL_CASES)('$name 点击遮罩空白处 emit close', async (shellCase) => {
        const wrapper = mountDialog(shellCase.component)
        await wrapper.find('.dialog-overlay').trigger('click')
        expect(wrapper.emitted('close') ?? []).toHaveLength(
            shellCase.name === 'FontSelectDialog' ? 0 : 1
        )
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

describe('C-3 迁移对话框拖拽方式', () => {
    it.each(SHELL_CASES.filter((shellCase) => shellCase.jsDraggable))(
        '$name 沿用 JS 拖拽：拖动标题栏改写容器位置',
        async (shellCase) => {
            const wrapper = mountDialog(shellCase.component)
            await wrapper.find('.title-bar').trigger('mousedown', {
                button: 0,
                clientX: 100,
                clientY: 100
            })
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 160 }))
            await nextTick()
            const style = wrapper.find('.dialog-container').attributes('style') ?? ''
            expect(style).toContain('left: 80px')
            expect(style).toContain('top: 60px')
            // 收尾：移除拖拽期间注册的 document 监听器
            document.dispatchEvent(new MouseEvent('mouseup'))
        }
    )

    it.each(SHELL_CASES.filter((shellCase) => !shellCase.jsDraggable))(
        '$name 不绑定 JS 拖拽（标题栏拖拽交给 Electron app-region）',
        async (shellCase) => {
            const wrapper = mountDialog(shellCase.component)
            await wrapper.find('.title-bar').trigger('mousedown', {
                button: 0,
                clientX: 100,
                clientY: 100
            })
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 160 }))
            await nextTick()
            const style = wrapper.find('.dialog-container').attributes('style') ?? ''
            // 仍保持 useDialogDrag 的初始居中定位，未被鼠标移动改写
            expect(style).toContain('left: 50%')
            expect(style).toContain('top: 50%')
            document.dispatchEvent(new MouseEvent('mouseup'))
        }
    )

    it('迁移前未重置拖拽位置的对话框，重新打开时沿用上次位置（等价于 resetPositionOnOpen 默认 false）', async () => {
        const wrapper = mountDialog(FontSelectDialog)
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
