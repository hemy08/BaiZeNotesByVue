// @vitest-environment jsdom
/**
 * 菜单栏下拉布局与视觉材质组件测试（1.5.5 用户实测反馈修复）
 *
 * 用户反馈三件事：
 * 1. 菜单下拉出现滚动条；
 * 2. 三级（嵌套）子菜单「没展示出来」（被父面板 overflow 裁剪）；
 * 3. 靠右菜单（AI 导航 / GitHub / 帮助）的下拉与三级子菜单超出窗口右缘被裁剪；
 * 4. 切换「界面风格」时菜单栏看不到差异。
 *
 * 本文件覆盖修复后的契约：
 * - 顶级下拉按**实测宽高**夹取到视口（jsdom 用原型矩形桩驱动真实组件链路）；
 * - 嵌套子菜单右侧空间不足时翻转左侧，并在窗口 resize 后重算；
 * - 三级子菜单在 DOM 中完整渲染、可 hover / 键盘展开（插入 → Mermaid → 第一/二部分）；
 * - `.submenu-list` 不再作为滚动容器（静态断言无 max-height / overflow-y: auto）；
 * - `.menu-bar` 消费四风格材质令牌（surface/opacity/border/radius/shadow），
 *   workbench 保持现状口径（其它风格由令牌差异产生可见变化）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import { UI_STYLE_TOKENS, UI_STYLE_VALUES } from '../../../src/shared/constants/ui-style'

import MenuBar from '@renderer/components/MenuBar.vue'

let wrapper: VueWrapper | null = null

/** 视口恢复值（jsdom 默认 1024 × 768） */
const DEFAULT_INNER_WIDTH = 1024

/** 桩矩形（只填被测代码读取的字段，其余置 0，避免依赖真实排版） */
function makeRect(input: Partial<DOMRect> = {}): DOMRect {
    const left = input.left ?? 0
    const top = input.top ?? 0
    const width = input.width ?? 0
    const height = input.height ?? 0
    return {
        left,
        top,
        right: input.right ?? left + width,
        bottom: input.bottom ?? top + height,
        width,
        height,
        x: left,
        y: top,
        toJSON: () => ({})
    } as DOMRect
}

function stubShellGlobals(): void {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            removeListener: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined)
        }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue({}) }
    })
}

/** 覆盖 jsdom 视口宽度（innerWidth 是 accessor，defineProperty 覆盖 own property 即可） */
function setViewportWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width })
}

beforeEach(() => {
    vi.clearAllMocks()
    stubShellGlobals()
    setViewportWidth(DEFAULT_INNER_WIDTH)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    setViewportWidth(DEFAULT_INNER_WIDTH)
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

function mountMenuBar(): VueWrapper {
    wrapper = mount(MenuBar, { attachTo: document.body })
    return wrapper
}

/** 顶层菜单按钮（按可见文案定位，如 文件 / 插入） */
function topMenuItem(label: string): HTMLElement {
    const item = wrapper!
        .findAll('.menu-item')
        .find((node) => node.find('.menu-label').text() === label)
    expect(item, `应存在顶层菜单「${label}」`).toBeDefined()
    return item!.element as HTMLElement
}

async function clickTopMenu(label: string): Promise<void> {
    topMenuItem(label).click()
    await flushPromises()
}

/** 按可见文案在给定范围内找菜单行（只比对 .menu-item-label，避免 accelerator/箭头干扰） */
function findRow(scope: ParentNode, label: string): HTMLElement {
    const row = [...scope.querySelectorAll<HTMLElement>('.menu-submenu-item')].find(
        (node) => node.querySelector(':scope > .menu-item-label')?.textContent === label
    )
    expect(row, `应存在菜单行「${label}」`).toBeDefined()
    return row!
}

/** 派发 hover（MenuSubmenuItem 监听 mouseenter，非冒泡） */
async function hoverRow(row: HTMLElement): Promise<void> {
    row.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }))
    await flushPromises()
}

/** 派发键盘事件（bubbles=true，模拟真实按键冒泡到 MenuSubmenu 根） */
async function pressKey(target: Element, key: string): Promise<void> {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
    await flushPromises()
}

/** 等待 resize/scroll 节流（组件侧 32ms 合并）后的翻转重算完成 */
async function waitForPlacement(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 60))
    await flushPromises()
}

/** 当前所有菜单面板（顶层 + 各嵌套层） */
function submenuPanels(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>('.submenu-container .submenu-list')]
}

describe('三级（嵌套）子菜单完整渲染与展开', () => {
    it('悬停展开三级链路：插入 → Mermaid → Mermaid 第一部分（DOM 完整，不被裁剪）', async () => {
        mountMenuBar()
        await clickTopMenu('插入')

        // 一级：Mermaid 组
        const mermaidRow = findRow(document.body, 'Mermaid')
        await hoverRow(mermaidRow)

        // 二级：Mermaid 第一部分 / 第二部分
        const secondLevel = document.querySelector<HTMLElement>(
            '.submenu-container .nested-submenu > .submenu-list'
        )
        expect(secondLevel, '二级子菜单应渲染').not.toBeNull()
        expect(secondLevel!.dataset.menuLevel).toBe('1')
        expect(findRow(secondLevel!, 'Mermaid 第一部分')).toBeTruthy()
        expect(findRow(secondLevel!, 'Mermaid 第二部分')).toBeTruthy()

        // 三级：悬停二级组「Mermaid 第一部分」展开模板项
        await hoverRow(findRow(secondLevel!, 'Mermaid 第一部分'))
        const thirdLevel = document.querySelector<HTMLElement>(
            '.submenu-container .nested-submenu .nested-submenu > .submenu-list'
        )
        expect(thirdLevel, '三级子菜单应渲染（此前被 overflow 裁剪）').not.toBeNull()
        expect(thirdLevel!.dataset.menuLevel).toBe('2')
        expect(thirdLevel!.querySelectorAll(':scope > .menu-submenu-item').length).toBeGreaterThan(
            0
        )
        // 三级叶子项真实可读（基础框架 / flowchart 来自模板真源）
        expect(findRow(thirdLevel!, '基础框架')).toBeTruthy()
        expect(findRow(thirdLevel!, 'flowchart')).toBeTruthy()
        // 每层都是 role=menu，层级结构未被扁平化
        const panels = submenuPanels()
        expect(panels.length).toBeGreaterThanOrEqual(3)
        for (const panel of panels) {
            expect(panel.getAttribute('role')).toBe('menu')
        }
    })

    it('长菜单（帮助 → 版本发布 19 项）完整渲染，不依赖滚动容器/虚拟滚动', async () => {
        mountMenuBar()
        await clickTopMenu('帮助')
        await hoverRow(findRow(document.body, '版本发布'))

        const nested = document.querySelector<HTMLElement>('.nested-submenu > .submenu-list')
        expect(nested).not.toBeNull()
        // 19 个版本叶子全部在 DOM 中（不是滚动懒加载；移除 max-height 后由视口 clamp 保证可见）
        const items = [...nested!.querySelectorAll<HTMLElement>(':scope > .menu-submenu-item')]
        expect(items).toHaveLength(19)
        expect(findRow(nested!, 'v1.5.6')).toBeTruthy()
        expect(findRow(nested!, 'v1.0.0')).toBeTruthy()
    })

    it('键盘 ArrowRight 逐级展开到三级，焦点进入三级首项（键盘契约不变）', async () => {
        const w = mountMenuBar()
        await clickTopMenu('插入')

        // 一级组「Mermaid」→ ArrowRight 展开并进入二级首项（Mermaid 第一部分）
        const group = findRow(document.body, 'Mermaid')
        group.focus()
        await pressKey(group, 'ArrowRight')
        const secondLevel = document.querySelector<HTMLElement>('.nested-submenu > .submenu-list')
        expect(secondLevel).not.toBeNull()
        expect(document.activeElement).toBe(
            secondLevel!.querySelector<HTMLElement>(':scope > .menu-submenu-item')
        )

        // 二级组「Mermaid 第一部分」→ ArrowRight 展开三级
        const secondGroup = document.activeElement as HTMLElement
        expect(secondGroup.textContent).toContain('Mermaid 第一部分')
        await pressKey(secondGroup, 'ArrowRight')
        const thirdLevel = document.querySelector<HTMLElement>(
            '.nested-submenu .nested-submenu > .submenu-list'
        )
        expect(thirdLevel, '三级子菜单应可键盘展开').not.toBeNull()
        const firstThirdRow = thirdLevel!.querySelector<HTMLElement>(
            ':scope > .menu-submenu-item, :scope > .submenu-item-wrapper > .menu-submenu-item'
        )
        expect(firstThirdRow).not.toBeNull()
        expect(document.activeElement).toBe(firstThirdRow)

        // 顶层按钮 aria-expanded 仍为 true（既有 a11y 契约不回退）
        expect(topMenuItem('插入').getAttribute('aria-expanded')).toBe('true')
        // Tab 仍关闭整个下拉（既有键盘契约）
        await pressKey(document.activeElement ?? firstThirdRow!, 'Tab')
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(w.findAll('.menu-item').length).toBe(12)
    })
})

describe('顶级下拉：按实测宽高夹取到视口', () => {
    /** 安装矩形桩：顶层第一项 + 下拉容器（模拟真实排版尺寸） */
    function stubLayout(
        anchor: { left: number; bottom: number },
        size: { width: number; height: number }
    ) {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
            this: HTMLElement
        ) {
            if (this.classList.contains('menu-item')) {
                return makeRect({ left: anchor.left, bottom: anchor.bottom, height: 28 })
            }
            if (this.classList.contains('submenu-container')) {
                return makeRect({ width: size.width, height: size.height })
            }
            return makeRect()
        })
    }

    it('靠右菜单按实测宽度（400px）左移，不再溢出右缘', async () => {
        mountMenuBar()
        // 视口 1024；锚点 1000 + 400 + 8 > 1024 → left = 1024 - 400 - 8 = 616
        stubLayout({ left: 1000, bottom: 100 }, { width: 400, height: 200 })
        await clickTopMenu('AI 导航')

        const container = document.querySelector<HTMLElement>('.submenu-container')!
        expect(container.style.left).toBe('616px')
        expect(container.style.top).toBe('100px')
    })

    it('下拉高于视口剩余空间时按实测高度上移（长菜单不引入滚动条）', async () => {
        mountMenuBar()
        // 底部 700 + 高 300 + 8 > 768 → top = 768 - 300 - 8 = 460
        stubLayout({ left: 100, bottom: 700 }, { width: 220, height: 300 })
        await clickTopMenu('插入')

        const container = document.querySelector<HTMLElement>('.submenu-container')!
        expect(container.style.top).toBe('460px')
        expect(container.style.left).toBe('100px')
    })
})

describe('嵌套子菜单：右侧空间不足翻转左侧', () => {
    /** 安装矩形桩：触发组固定右侧、嵌套面板固定宽度（视口宽度由用例控制） */
    function stubNestedLayout(trigger: { left: number; right: number }, nestedWidth: number): void {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
            this: HTMLElement
        ) {
            if (this.classList.contains('submenu-item-wrapper')) {
                return makeRect({
                    left: trigger.left,
                    right: trigger.right,
                    width: trigger.right - trigger.left,
                    height: 28
                })
            }
            if (
                this.classList.contains('submenu-list') &&
                this.closest('.nested-submenu') !== null
            ) {
                return makeRect({ width: nestedWidth, height: 120 })
            }
            return makeRect()
        })
    }

    async function openFileImportNested(): Promise<HTMLElement> {
        mountMenuBar()
        await clickTopMenu('文件')
        await hoverRow(findRow(document.body, '从文件导入'))
        const nested = document.querySelector<HTMLElement>('.nested-submenu')
        expect(nested).not.toBeNull()
        return nested!
    }

    it('右侧空间足够时保持右侧展开；resize 后空间不足自动翻转；恢复后翻回', async () => {
        // 触发组位于 200~320，嵌套面板 300 宽
        stubNestedLayout({ left: 200, right: 320 }, 300)
        const nested = await openFileImportNested()

        // 视口 1024：右侧空间 1024-8-320=696 ≥ 300 → 右侧
        expect(nested.classList.contains('nested-submenu--flipped')).toBe(false)

        // 视口缩小到 400：右侧 72 < 300，左侧 192 < 300 → 左侧空间更大 → 翻转
        setViewportWidth(400)
        window.dispatchEvent(new Event('resize'))
        await waitForPlacement()
        expect(nested.classList.contains('nested-submenu--flipped')).toBe(true)

        // 恢复宽度并再次 resize → 重新判定回右侧（重算而非一次性开关）
        setViewportWidth(DEFAULT_INNER_WIDTH)
        window.dispatchEvent(new Event('resize'))
        await waitForPlacement()
        expect(nested.classList.contains('nested-submenu--flipped')).toBe(false)
    })

    it('窗口滚动时同样重算（捕获阶段监听 + 节流合并高频滚动）', async () => {
        stubNestedLayout({ left: 200, right: 320 }, 300)
        const nested = await openFileImportNested()
        expect(nested.classList.contains('nested-submenu--flipped')).toBe(false)

        setViewportWidth(400)
        // 任意滚动容器滚动（捕获阶段冒泡路径：document 上的 capture 监听器会收到）
        document.body.dispatchEvent(new Event('scroll'))
        await waitForPlacement()
        expect(nested.classList.contains('nested-submenu--flipped')).toBe(true)
    })

    it('翻转载荷只作用于当前嵌套层，换组或收起后复位', async () => {
        stubNestedLayout({ left: 900, right: 1000 }, 300)
        mountMenuBar()
        setViewportWidth(400)
        await clickTopMenu('文件')
        await hoverRow(findRow(document.body, '从文件导入'))
        const nested = document.querySelector<HTMLElement>('.nested-submenu')!
        // 视口 400：右侧 400-8-1000 < 0，左侧 892 ≥ 300 → 翻转
        expect(nested.classList.contains('nested-submenu--flipped')).toBe(true)

        // 悬停普通叶子项 → 收起嵌套（DOM 移除，不留翻转态）
        await hoverRow(findRow(document.body, '新建'))
        expect(document.querySelector('.nested-submenu')).toBeNull()

        // 再展开另一个组：重新按当前视口判定（翻转态不残留、也不影响其它组）
        await hoverRow(findRow(document.body, '导出到文件'))
        const reopened = document.querySelector<HTMLElement>('.nested-submenu')!
        expect(reopened.classList.contains('nested-submenu--flipped')).toBe(true)
    })
})

describe('静态样式契约：无滚动条 / 翻转样式 / 菜单栏材质令牌', () => {
    const ROOT = path.resolve(__dirname, '../../..')
    const MENU_BAR_FILE = path.join(ROOT, 'src', 'renderer', 'src', 'components', 'MenuBar.vue')
    const MENU_SUBMENU_FILE = path.join(
        ROOT,
        'src',
        'renderer',
        'src',
        'components',
        'MenuBar',
        'MenuSubmenu.vue'
    )

    function readSource(file: string): string {
        return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    }

    /** 去掉注释（HTML/CSS/JS 三种），避免把说明文字里的字面量当成实现（与 visual-* 契约测试同口径） */
    function stripComments(source: string): string {
        return source
            .replace(/<!--[\s\S]*?-->/g, '')
            .replace(/\/\*[\s\S]*?\*\//g, '')
            .replace(/(^|[^:])\/\/.*$/gm, '$1')
    }

    /** 取 `<style>` 段内指定选择器的规则块（首字符匹配，避免命中注释里的同名字符串） */
    function styleRule(source: string, selector: string): string {
        const styleStart = source.indexOf('<style')
        expect(styleStart, '组件应有 <style> 段').toBeGreaterThanOrEqual(0)
        const styles = source.slice(styleStart)
        const start = styles.indexOf(`${selector} {`)
        expect(start, `样式中应存在规则 ${selector}`).toBeGreaterThanOrEqual(0)
        const end = styles.indexOf('}', start)
        return styles.slice(start, end + 1)
    }

    it('.submenu-list 不再作为滚动容器（无 max-height / overflow-y: auto，显式 overflow: visible）', () => {
        const block = styleRule(stripComments(readSource(MENU_SUBMENU_FILE)), '.submenu-list')
        expect(block).not.toMatch(/max-height\s*:/)
        expect(block).not.toMatch(/overflow-y\s*:\s*(auto|scroll)/)
        expect(block).toMatch(/overflow\s*:\s*visible/)
    })

    it('嵌套翻转样式：flipped 时改为 right: 100% / left: auto（不再向右溢出）', () => {
        const styles = stripComments(readSource(MENU_SUBMENU_FILE))
        const block = styleRule(styles, '.nested-submenu--flipped')
        expect(block).toMatch(/left\s*:\s*auto/)
        expect(block).toMatch(/right\s*:\s*100%/)
        // 基础方向仍是右侧展开（未翻转时既有行为不变）
        const base = styleRule(styles, '.nested-submenu')
        expect(base).toMatch(/left\s*:\s*100%/)
    })

    it('.menu-bar 消费四风格材质令牌（surface/opacity/border/radius/shadow）且不写风格分支', () => {
        const source = stripComments(readSource(MENU_BAR_FILE))
        const block = styleRule(source, '.menu-bar')
        for (const token of [
            '--ui-surface',
            '--ui-surface-opacity',
            '--ui-border',
            '--ui-hairline-width',
            '--ui-radius-lg',
            '--ui-shadow-1',
            '--ui-duration-fast',
            '--ui-ease-standard'
        ]) {
            expect(block, `.menu-bar 应消费材质/动效令牌 ${token}`).toContain(token)
        }
        // 组件内不得写风格/密度分支（UI-15：唯一入口 useTheme）
        expect(source).not.toMatch(/data-(style|density)\s*[=\]]/)
        // 菜单栏是外壳而非悬浮层：按 DESIGN.md §3 不启用玻璃模糊（防整窗/大面积 blur）
        expect(block).not.toContain('backdrop-filter')
        // 高度真源仍在宿主（MenuBar 组件只撑满 100%，不写死壳高）
        expect(block).toMatch(/height:\s*100%;/)
        // 背景色必须走令牌（不得硬编码 hex；var 兜底允许）
        expect(block.replace(/var\([^()]*\)/g, '')).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    })

    it('四风格材质令牌确有差异：菜单栏消费的令牌足以产生可见变化', () => {
        expect(UI_STYLE_VALUES).toHaveLength(4)
        // 面不透明度：glass 0.72 半透明（1.5.6 增强），其余 1（透明差异可见）
        const opacities = UI_STYLE_VALUES.map((style) => UI_STYLE_TOKENS[style].surfaceOpacity)
        expect(new Set(opacities).size).toBeGreaterThanOrEqual(2)
        expect(UI_STYLE_TOKENS.glass.surfaceOpacity).toBeLessThan(1)
        // 圆角：paper 8 / glass 12 / workbench 6（菜单栏下圆角可见差异）
        expect(UI_STYLE_TOKENS.paper.radiusLg).not.toBe(UI_STYLE_TOKENS.glass.radiusLg)
        expect(UI_STYLE_TOKENS.glass.radiusLg).not.toBe(UI_STYLE_TOKENS.workbench.radiusLg)
        // 阴影：paper 弱于 workbench、glass 扩散更大（投影差异）
        expect(UI_STYLE_TOKENS.paper.shadow1).not.toBe(UI_STYLE_TOKENS.workbench.shadow1)
        expect(UI_STYLE_TOKENS.glass.shadow1).not.toBe(UI_STYLE_TOKENS.workbench.shadow1)
        // hybrid 外壳按规格 = workbench 材质（双材质边界：内容区才切 paper）
        expect(UI_STYLE_TOKENS.hybrid).toEqual(UI_STYLE_TOKENS.workbench)
    })
})
