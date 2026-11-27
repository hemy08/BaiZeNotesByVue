// @vitest-environment jsdom
/**
 * 对话框 / 非模态工具窗「四风格 × 三密度」外壳契约测试（视觉升级 1.5.5 P1-B1，T6/T9）
 *
 * 背景：BaseDialog 是 25 个对话框与非模态工具窗的统一外壳。视觉升级后外壳只消费
 * 根元素 `data-style` / `data-density` 下的 `--ui-*` 令牌（颜色来自 28 套主题派生、
 * 材质来自 4 种风格、尺寸节奏来自 3 档密度），组件内不得写风格/密度分支。
 *
 * 本文件锁定：
 * 1. 4 风格 × 3 密度矩阵：根元素 data-* 属性写入后，外壳结构与语义（role/tool-window/
 *    aria-modal/拖拽把手）在每种组合下保持稳定，且不出现按风格注入的内联样式；
 * 2. 令牌消费契约（静态）：外壳 CSS 引用 T9/T6 规定的令牌变量，且未写死主题色值；
 * 3. 宽度阶梯（T9）：360/520/720/960/全宽语义档位、`width` 兼容优先；
 * 4. 遮罩（T9）：浅色 rgba(0,0,0,.32) / 深色 rgba(0,0,0,.48)，调用方 overlayStyle 仍可覆盖。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import fs from 'node:fs'
import path from 'node:path'

import BaseDialog from '@renderer/components/dialogs/BaseDialog.vue'
import {
    DEFAULT_DIALOG_WIDTH_SIZE,
    DIALOG_OVERLAY_ALPHA_DARK,
    DIALOG_OVERLAY_ALPHA_LIGHT,
    DIALOG_WIDTH_LADDER,
    DIALOG_WIDTH_SIZE_VALUES,
    resolveDialogOverlayColor,
    resolveDialogWidth
} from '@renderer/components/dialogs/dialog-metrics'
import { resetThemeStateForTesting, useTheme } from '@renderer/composables/useTheme'
import { UI_DENSITY_VALUES, UI_STYLE_VALUES } from '../../../src/shared/constants/ui-style'
import type { ThemeStyles } from '../../../src/shared/types/theme'

const ROOT = path.resolve(__dirname, '../../..')

const dialogMountOptions = {
    global: { stubs: { teleport: true } },
    attachTo: document.body
}

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

function mountDialog(props: Record<string, unknown> = {}, slots: Record<string, string> = {}) {
    return track(
        mount(BaseDialog, {
            ...dialogMountOptions,
            props: { visible: true, title: '测试对话框', ...props },
            slots
        }) as VueWrapper
    )
}

/** 读取源码并去掉注释（避免注释里的风格词/令牌名被静态断言误命中） */
function readSourceWithoutComments(relativePath: string): string {
    const source = fs.readFileSync(path.join(ROOT, relativePath), 'utf-8')
    return source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
}

/** 从 `<style>` 源码中提取包含指定选择器的首个规则块（扁平 CSS，取下一个 `}`） */
function extractCssRule(source: string, selector: string): string {
    const styleIndex = source.indexOf('<style')
    expect(styleIndex, 'BaseDialog.vue 应包含 <style> 块').toBeGreaterThanOrEqual(0)
    const styleSource = source.slice(styleIndex)
    const selectorIndex = styleSource.indexOf(selector)
    expect(selectorIndex, `BaseDialog.vue 样式块应包含选择器 ${selector}`).toBeGreaterThanOrEqual(0)
    const braceStart = styleSource.indexOf('{', selectorIndex)
    const braceEnd = styleSource.indexOf('}', braceStart)
    expect(braceStart).toBeGreaterThan(selectorIndex)
    expect(braceEnd).toBeGreaterThan(braceStart)
    return styleSource.slice(braceStart + 1, braceEnd)
}

/** 清空根元素 data-* 与主题状态，避免用例间串扰 */
function resetRootAppearance(): void {
    const dataset = document.documentElement.dataset
    delete dataset.style
    delete dataset.density
    delete dataset.glassMode
    delete dataset.transparency
}

beforeEach(() => {
    resetRootAppearance()
    resetThemeStateForTesting()
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    resetRootAppearance()
    resetThemeStateForTesting()
})

describe('四风格 × 三密度：外壳结构与语义稳定', () => {
    for (const style of UI_STYLE_VALUES) {
        for (const density of UI_DENSITY_VALUES) {
            it(
                `style=${style} density=${density}：对话窗外壳` + `与工具窗外壳均为令牌驱动`,
                async () => {
                    document.documentElement.dataset.style = style
                    document.documentElement.dataset.density = density
                    expect(document.documentElement.dataset.style).toBe(style)
                    expect(document.documentElement.dataset.density).toBe(density)

                    // 模态对话框：语义稳定 + 不出现按风格注入的内联样式
                    const dialog = mountDialog({
                        title: '四风格对话框',
                        slots: { default: '<p class="dialog-body">正文</p>' }
                    })
                    const dialogContainer = dialog.find('.dialog-container')
                    expect(dialogContainer.exists()).toBe(true)
                    expect(dialogContainer.attributes('role')).toBe('dialog')
                    expect(dialogContainer.attributes('aria-modal')).toBe('true')
                    expect(dialogContainer.attributes('data-dialog-shell')).toBe('dialog')
                    expect(dialogContainer.classes()).not.toContain('dialog-container--tool-window')
                    // 风格差异只允许来自根元素变量：容器内联样式不得包含风格/密度判定
                    const dialogStyle = dialogContainer.attributes('style') ?? ''
                    expect(dialogStyle).not.toContain('backdrop-filter')
                    expect(dialogStyle).not.toMatch(/b(glass|paper|workbench|hybrid)/)

                    // 非模态工具窗（T6）：统一壳标记、拖拽把手、非模态语义
                    const toolWindow = mountDialog({
                        title: '四风格工具窗',
                        nonModal: true,
                        slots: { default: '<input class="tool-input" />' }
                    })
                    const toolContainer = toolWindow.find('.dialog-container')
                    expect(toolContainer.classes()).toContain('dialog-container--tool-window')
                    expect(toolContainer.attributes('data-dialog-shell')).toBe('tool-window')
                    expect(toolContainer.attributes('aria-modal')).toBe('false')

                    const titleBar = toolWindow.find('.title-bar')
                    expect(titleBar.classes()).toContain('title-bar--tool-window')
                    expect(titleBar.attributes('style') ?? '').not.toMatch(
                        /b(glass|paper|workbench|hybrid)/
                    )

                    const handle = toolWindow.find('.tool-window-drag-handle')
                    expect(handle.exists()).toBe(true)
                    expect(handle.attributes('aria-hidden')).toBe('true')

                    // 非模态遮罩仍透明 + 点击穿透（1.5.3 行为不变）
                    const overlayStyle =
                        toolWindow.find('.dialog-overlay').attributes('style') ?? ''
                    expect(overlayStyle).toContain('pointer-events: none')
                    expect(overlayStyle).toContain('background: transparent')

                    await nextTick()
                }
            )
        }
    }
})

describe('令牌消费契约（静态扫描 BaseDialog.vue）', () => {
    const source = readSourceWithoutComments('src/renderer/src/components/dialogs/BaseDialog.vue')

    it('T6/T9 尺寸与材质令牌全部被外壳引用（四风格/三密度自动生效的前提）', () => {
        const requiredTokens = [
            // T9 对话框壳
            '--ui-radius-lg',
            '--ui-shadow-3',
            '--ui-focus-shadow',
            '--ui-duration-dialog',
            '--ui-duration-overlay',
            '--ui-ease-standard',
            // T6 工具窗壳
            '--ui-surface',
            '--ui-surface-opacity',
            '--ui-surface-blur',
            '--ui-highlight-border-alpha',
            '--ui-shadow-2',
            '--ui-border',
            '--ui-hairline-width',
            '--ui-bg-sunken',
            '--ui-bg-elevated',
            '--ui-text-secondary',
            '--ui-text-tertiary',
            '--ui-radius-md',
            // 密度层（三档 36/40/44、8/12/16、12/13/13）；底部按钮高 --ui-control-height
            // 由对话框专属按钮样式层 assets/dialog-buttons.css 消费（见 dialog-buttons-style 测试）
            '--ui-titlebar-height',
            '--ui-pad',
            '--ui-font-size'
        ]
        for (const token of requiredTokens) {
            expect(source, `BaseDialog.vue 未引用令牌 ${token}`).toContain(`var(${token}`)
        }
    })

    it('外壳不写风格/密度分支：不得读取 data-style / data-density 或按风格名分支', () => {
        expect(source).not.toMatch(/dataset\.(style|density)/)
        expect(source).not.toMatch(/data-style|data-density/)
        // 允许注释中出现风格中文名，但代码中不得以风格标识做条件分支
        expect(source).not.toMatch(/['"](paper|glass|workbench|hybrid)['"]/)
    })

    it('遮罩/阴影 rgba 字面量只出现在允许范围（遮罩 + 令牌兜底），无语义主题色硬编码', () => {
        // 令牌兜底 rgba：遮罩 .32、阴影、深色渐变上的白字/白描边
        const hardcodedHex = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
        const allowedHex = new Set(['#fff', '#ffffff', '#c62828'])
        const offenders = hardcodedHex.filter((value) => !allowedHex.has(value))
        expect(offenders, `BaseDialog.vue 出现未允许的硬编码色值：${offenders.join(',')}`).toEqual(
            []
        )
    })

    it('遮罩浅/深两档均由 dialog-metrics 单一真源提供', () => {
        expect(source).toContain('resolveDialogOverlayColor')
        expect(DIALOG_OVERLAY_ALPHA_LIGHT).toBe(0.32)
        expect(DIALOG_OVERLAY_ALPHA_DARK).toBe(0.48)
        expect(resolveDialogOverlayColor(false)).toBe('rgba(0, 0, 0, 0.32)')
        expect(resolveDialogOverlayColor(true)).toBe('rgba(0, 0, 0, 0.48)')
    })
})

describe('T9/T6 关键规格静态落地（CSS 规则级）', () => {
    const source = readSourceWithoutComments('src/renderer/src/components/dialogs/BaseDialog.vue')

    it('T9 对话框：标题栏密度高 + 标题 15/600 + 圆角/阴影令牌 + 底栏密度内边距', () => {
        // 标题栏 40（default 密度；compact 36 / spacious 44 由密度层覆盖）
        expect(extractCssRule(source, '.title-bar')).toContain(
            'height: var(--ui-titlebar-height, 40px)'
        )
        // 标题 15 / 600：13 + 2（默认密度），密度档自动微调
        expect(extractCssRule(source, '.title-bar--compact .title-text')).toContain(
            'font-size: calc(var(--ui-font-size, 13px) + 2px)'
        )
        expect(extractCssRule(source, '.title-bar--compact .title-text')).toContain(
            'font-weight: 600'
        )
        const container = extractCssRule(source, '.dialog-container')
        expect(container).toContain('border-radius: var(--ui-radius-lg')
        expect(container).toContain('box-shadow: var(--ui-shadow-3')
        expect(extractCssRule(source, '.footer')).toContain('padding: var(--ui-pad')
    })

    it('T6 工具窗：面不透明度 + glass 小面积模糊 + 高光边 + hairline + shadow-2', () => {
        const toolWindow = extractCssRule(source, '.dialog-container--tool-window')
        // 面 = --ui-surface × --ui-surface-opacity（glass 0.86 半透明，其余 1 不透明）
        expect(toolWindow).toContain('color-mix')
        expect(toolWindow).toContain('var(--ui-surface-opacity')
        expect(toolWindow).toContain('backdrop-filter: blur(var(--ui-surface-blur')
        expect(toolWindow).toContain('var(--ui-highlight-border-alpha')
        expect(toolWindow).toContain('var(--ui-hairline-width, 1px) solid var(--ui-border')
        expect(toolWindow).toContain('var(--ui-shadow-2')

        // glass 的半透明/模糊只允许出现在工具窗悬浮壳（模态对话框不模糊，DESIGN §3）
        expect(extractCssRule(source, '.dialog-container')).not.toContain('backdrop-filter')

        // 工具窗标题栏：中性悬浮面 + hairline 分隔（与设计预览一致）
        const toolTitleBar = extractCssRule(source, '.title-bar--tool-window')
        expect(toolTitleBar).toContain('background: var(--ui-bg-sunken')
        expect(toolTitleBar).toContain('border-bottom: var(--ui-hairline-width')
    })

    it('T6 拖拽把手：标题栏左侧 6 点纹理（radial-gradient + 语义文字色）', () => {
        const handle = extractCssRule(source, '.tool-window-drag-handle')
        expect(handle).toContain('radial-gradient')
        expect(handle).toContain('var(--ui-text-tertiary')
        expect(handle).toContain('width: 14px')
        expect(handle).toContain('height: 20px')
    })
})

describe('T9 宽度语义阶梯', () => {
    it('阶梯数值与规格一致：360 / 520 / 720 / 960 / 全宽特殊', () => {
        expect(DIALOG_WIDTH_LADDER).toEqual({
            confirm: '360px',
            form: '520px',
            medium: '720px',
            complex: '960px',
            full: 'min(1440px, 96vw)'
        })
        expect(DIALOG_WIDTH_SIZE_VALUES).toEqual(['confirm', 'form', 'medium', 'complex', 'full'])
        expect(DEFAULT_DIALOG_WIDTH_SIZE).toBe('medium')
    })

    it('resolveDialogWidth：width 兼容优先 > widthSize 阶梯 > 空（默认壳 500px）', () => {
        expect(resolveDialogWidth('520px', 'complex')).toBe('520px')
        expect(resolveDialogWidth('', 'complex')).toBe('960px')
        expect(resolveDialogWidth(undefined, 'confirm')).toBe('360px')
        expect(resolveDialogWidth('min(1000px, 95vw)', undefined)).toBe('min(1000px, 95vw)')
        expect(resolveDialogWidth('', undefined)).toBe('')
        expect(resolveDialogWidth(null, null)).toBe('')
    })

    it('BaseDialog：widthSize 写为容器内联宽度，data-dialog-size 标记语义档位', () => {
        const wrapper = mountDialog({ widthSize: 'complex' })
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('style')).toContain('width: 960px')
        expect(container.attributes('data-dialog-size')).toBe('complex')
        expect(container.attributes('style')).not.toContain('width: 500px')
    })

    it('BaseDialog：既有 width 调用点兼容优先（width 与 widthSize 同时传时 width 生效）', () => {
        const wrapper = mountDialog({ width: '1280px', widthSize: 'form' })
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('style')).toContain('width: 1280px')
        expect(container.attributes('style')).not.toContain('width: 520px')
    })

    it('BaseDialog：不传宽度时保持既有默认壳（无内联 width，CSS 默认 500px）', () => {
        const wrapper = mountDialog()
        const container = wrapper.find('.dialog-container')
        expect(container.attributes('style') ?? '').not.toContain('width:')
        expect(container.attributes('data-dialog-size')).toBeUndefined()
    })
})

describe('T9 遮罩两档（浅色 .32 / 深色 .48）', () => {
    /** 深色主题样式样本（仅用于判定遮罩明暗，不写入真实配置） */
    const DARK_THEME_STYLES: ThemeStyles = {
        name: '测试深色主题',
        description: '测试深色主题',
        backgroundColor: '#1f1f1f',
        cardBackground: '#2b2b2b',
        textColor: '#f5f5f5',
        secondaryTextColor: '#b0b0b0',
        borderColor: '#3a3a3a',
        accentColor: '#bb86fc',
        buttonBackground: '#bb86fc',
        buttonTextColor: '#1f1f1f',
        hoverBackground: '#333333',
        titleBarGradient: 'linear-gradient(135deg, #333333 0%, #1f1f1f 100%)'
    }

    it('浅色主题（默认主题未应用/浅色底）：遮罩 rgba(0,0,0,.32)', () => {
        const wrapper = mountDialog()
        const style = wrapper.find('.dialog-overlay').attributes('style') ?? ''
        expect(style).toContain('rgba(0, 0, 0, 0.32)')
        expect(style).not.toContain('rgba(0, 0, 0, 0.48)')
    })

    it('深色主题：遮罩 rgba(0,0,0,.48)', () => {
        const theme = useTheme()
        theme.applyThemeStyles(DARK_THEME_STYLES, 'test-dark')
        const wrapper = mountDialog()
        const style = wrapper.find('.dialog-overlay').attributes('style') ?? ''
        expect(style).toContain('rgba(0, 0, 0, 0.48)')
    })

    it('调用方 overlayStyle 仍按迁移语义覆盖遮罩（MessageDialog 现状）', () => {
        const wrapper = mountDialog({ overlayStyle: { backgroundColor: 'rgba(0, 0, 0, 0.5)' } })
        const overlay = wrapper.find('.dialog-overlay').element as HTMLElement
        // 内联样式数组后者覆盖前者：调用方的 .5 必须最终生效（迁移兼容，优先级最高）
        expect(overlay.style.backgroundColor).toBe('rgba(0, 0, 0, 0.5)')
    })
})
