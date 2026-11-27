/**
 * 主窗口（外壳 + 工区）四风格可见性静态契约 —— 视觉升级 1.5.5 修复（用户实测：
 * 设置 → 外观切换「界面风格」时主窗口几乎看不到效果，四风格主窗口截图 hash 完全相同）。
 *
 * ## 为什么用静态契约而不是像素快照
 * 四风格的真实像素由根元素 `data-style` 下的 P0 冻结令牌（`--ui-*`）经 calc/color-mix
 * 连续派生，jsdom 不解析 CSS 变量、类型化除法与 color-mix，无法断言最终颜色。因此本文件
 * 守护「主窗口关键区域确实消费了材质令牌、且四风格差异全部由令牌派生」：
 * 1. 壳层派生变量只从 P0 冻结令牌计算，workbench 基准项恒为 0（默认观感零变化）；
 * 2. 标题栏 / 状态栏 / 侧栏 / 导航条 / 工区内容区分别消费壳层（`--ui-*`）与内容区
 *    （`--ui-content-*`）令牌 —— hybrid 双材质边界由此成立：外壳 = workbench、内容区 = paper；
 * 3. 组件内不得出现 data-style / data-density 分支或读取用户外观设置（唯一入口 useTheme）；
 * 4. 禁止整窗 backdrop-filter（glass 性能约束）、禁止新增硬编码主题色（既有遗留值白名单）。
 *
 * 真实 Electron 真机截图（4 风格主窗口两两不同 + 默认 workbench 基线不变）由
 * `e2e/visual-matrix.spec.ts` 的 `assertStyleVariantsDiffer` 硬断言保证。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
    UI_CONTENT_MATERIAL,
    UI_STYLE_TOKENS,
    UI_STYLE_VALUES
} from '../../src/shared/constants/ui-style'
import type { UiStyle } from '../../src/shared/types'

const ROOT = path.resolve(__dirname, '../..')
const COMPONENTS = path.join(ROOT, 'src', 'renderer', 'src', 'components')

/** 主窗口修复写域内的全部实现文件（与组件视觉区域一一对应） */
const SOURCE_FILES = {
    shell: path.join(COMPONENTS, 'BaiZeNotes.vue'),
    statusBar: path.join(COMPONENTS, 'StatusBar.vue'),
    workspace: path.join(COMPONENTS, 'WorkSpaceArea', 'WorkSpace.vue'),
    naviTab: path.join(COMPONENTS, 'WorkSpaceArea', 'NaviTab.vue'),
    resourceManager: path.join(COMPONENTS, 'ResourceManager', 'ResourceManager.vue')
} as const

/** 各文件允许保留的既有硬编码颜色（历史遗留，非本次新增；均为非主题色用途） */
const LEGACY_HEX_COLORS: Record<keyof typeof SOURCE_FILES, readonly string[]> = {
    // 标题栏既有白字/白描边（color-mix 的 100% 混合端保持不变）
    shell: ['#fff'],
    statusBar: [],
    // 异步占位文字的历史兜底色（既有规则）
    workspace: ['#757575'],
    // 导航图标既有品牌色 + 白字
    naviTab: ['#fff', '#fe9803', '#ffc10a', '#986801'],
    resourceManager: []
}

function readSource(file: string): string {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 去掉 HTML / CSS / JS 注释（只保留真实样式与代码） */
function stripComments(source: string): string {
    return source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** 取某条选择器规则块的声明文本（首个 `选择器 {` 起至下一个 `}`） */
function ruleBlock(source: string, selector: string): string {
    const start = source.indexOf(`${selector} {`)
    expect(start, `${selector} 规则应存在`).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('}', start)
    return source.slice(start, end)
}

/** 取某条选择器规则块的声明文本（最后一个 `选择器 {`，用于同一选择器出现多次的场景） */
function lastRuleBlock(source: string, selector: string): string {
    const start = source.lastIndexOf(`${selector} {`)
    expect(start, `${selector} 规则应存在`).toBeGreaterThanOrEqual(0)
    const end = source.indexOf('}', start)
    return source.slice(start, end)
}

function css(key: keyof typeof SOURCE_FILES): string {
    return stripComments(readSource(SOURCE_FILES[key]))
}

describe('壳层材质派生（BaiZeNotes.vue）：只从 P0 冻结令牌计算，workbench 恒为 0', () => {
    it('派生变量全部引用 --ui-* 冻结令牌（圆角 / 表面不透明度 / 高光边 / 语义色）', () => {
        const source = css('shell')
        // 整块派生用 @supports 包裹：浏览器不支持 CSS 类型化除法 / color-mix 时变量不定义，
        // 消费点 var(--bz-*, 兜底) 回退升级前观感（不会出现半套材质）
        expect(source).toContain('@supports (width: calc(1px / 1px * 1px)) and')
        expect(source).toContain('(color: color-mix(in srgb, currentColor 0%, transparent)) {')
        const shellBlock = ruleBlock(source, '#editor-container')
        // 风格强度 = 大圆角令牌相对 workbench 基准 6px 的差值（CSS 类型化除法）
        expect(shellBlock).toContain(
            '--bz-style-ratio: calc((var(--ui-radius-lg, 6px) - 6px) / 1px)'
        )
        expect(shellBlock).toContain(
            '--bz-content-ratio: calc((var(--ui-content-radius-lg, 6px) - 6px) / 1px)'
        )
        // 玻璃强度 = 高光边 alpha 令牌（glass 0.14 / steady 0.10 / 其余 0）
        expect(shellBlock).toContain('--bz-glass-alpha: var(--ui-highlight-border-alpha, 0)')
        // 壳层表面 = 悬浮面底 × 不透明度（glass 0.86 半透明）
        expect(shellBlock).toContain('--bz-shell-surface: color-mix(')
        expect(shellBlock).toContain('var(--ui-bg-elevated, var(--theme-card-background))')
        expect(shellBlock).toContain('calc(var(--ui-surface-opacity, 1) * 100%)')
        // 内容区表面 = 页面底 × 内容区不透明度（hybrid 内容区 = paper）
        expect(shellBlock).toContain('--bz-content-surface: color-mix(')
        expect(shellBlock).toContain('var(--ui-bg, var(--theme-background-color))')
        expect(shellBlock).toContain('calc(var(--ui-content-surface-opacity, 1) * 100%)')
        // 内容区卡片面（工具栏 / 预览区底）：workbench 取 --ui-bg-elevated（= 既有卡片底）
        expect(shellBlock).toContain('--bz-content-card: color-mix(')
        expect(shellBlock).toContain('var(--ui-bg-elevated, var(--theme-card-background))')
        expect(shellBlock).toContain('--bz-content-card-surface: color-mix(')
        // 薄雾取自语义强调色；hairline 来自 --ui-hairline-width
        expect(shellBlock).toContain('var(--ui-accent)')
        expect(shellBlock).toContain('--bz-shell-hairline: calc(var(--ui-hairline-width, 1px)')
        expect(shellBlock).toContain('--bz-content-hairline: calc(var(--ui-hairline-width, 1px)')
        // 圆角派生
        expect(shellBlock).toContain('--bz-shell-radius: calc((var(--ui-radius-lg, 6px) - 6px)')
        expect(shellBlock).toContain(
            '--bz-content-radius: calc((var(--ui-content-radius-lg, 6px) - 6px)'
        )
        // 0/1 可见性开关（workbench 为 0 → 材质覆盖层不绘制）
        expect(shellBlock).toContain('--bz-style-on: min(1, var(--bz-style-ratio))')
        expect(shellBlock).toContain('--bz-content-on: min(1, var(--bz-content-ratio))')
    })

    it('四风格派生值：workbench / hybrid 壳层为 0，paper 2、glass 6；hybrid 内容区 = paper', () => {
        // 与 CSS `calc((var(--ui-radius-lg, 6px) - 6px) / 1px)` 同口径
        const shellRatio = (style: UiStyle): number => UI_STYLE_TOKENS[style].radiusLg - 6
        expect(shellRatio('workbench')).toBe(0)
        expect(shellRatio('hybrid')).toBe(0)
        expect(shellRatio('paper')).toBe(2)
        expect(shellRatio('glass')).toBe(6)

        // 内容区材质：hybrid 取 paper（唯一双材质风格），其余与外壳同材质
        const contentMaterial = (style: UiStyle): UiStyle => UI_CONTENT_MATERIAL[style]
        expect(contentMaterial('hybrid')).toBe('paper')
        for (const style of UI_STYLE_VALUES) {
            if (style !== 'hybrid') {
                expect(contentMaterial(style), style).toBe(style)
            }
        }
        const contentRatio = (style: UiStyle): number =>
            UI_STYLE_TOKENS[contentMaterial(style)].radiusLg - 6
        expect(contentRatio('workbench')).toBe(0)
        expect(contentRatio('paper')).toBe(2)
        expect(contentRatio('glass')).toBe(6)
        expect(contentRatio('hybrid')).toBe(2)

        // hybrid 外壳材质 = workbench（与 UI_STYLE_TOKENS.hybrid 定义一致）
        expect(UI_STYLE_TOKENS.hybrid).toEqual(UI_STYLE_TOKENS.workbench)
    })

    it('窗口底色：workbench / hybrid 保持既有 --theme-background-color，paper / glass 叠渐层', () => {
        // 派生变量块之外的第二个 #editor-container 规则承载窗口底色（布局规则）
        const shellBlock = lastRuleBlock(css('shell'), '#editor-container')
        // 前置兜底声明（= 升级前现状）
        expect(shellBlock).toContain('background-color: var(--theme-background-color);')
        expect(shellBlock).toContain(
            'background-color: var(--ui-bg, var(--theme-background-color));'
        )
        // paper 主题色薄雾 / glass 渐层光斑（薄雾变量在 @supports 派生块中；窗口底色直接消费派生值）
        expect(css('shell')).toContain('--bz-shell-veil: color-mix(')
        expect(shellBlock).toContain('radial-gradient(')
        expect(shellBlock).toContain('var(--bz-glass-alpha, 0)')
        expect(shellBlock).toContain('var(--ui-info, var(--ui-accent))')
        // glass 性能约束：禁止整窗 backdrop-filter
        expect(shellBlock).not.toContain('backdrop-filter')
    })

    it('标题栏：paper/glass 材质覆盖层 + 文字/图标对比色 + 底部 hairline（workbench opacity 0）', () => {
        const source = css('shell')
        const titleBlock = ruleBlock(source, '.title-bar')
        // 文字色随壳层强度从白字渐变到主题文字色（workbench = 100% 白，零变化）
        expect(titleBlock).toContain('var(--ui-text, var(--theme-text-color))')
        expect(titleBlock).toContain('calc(var(--bz-style-on, 0) * 100%)')
        // 覆盖层：opacity 前置兜底 0（workbench 不绘制）+ 纸感面 + 薄雾 + hairline + glass 高光
        const overlay = source.slice(source.indexOf('.title-bar::after'))
        expect(overlay).toContain('opacity: 0;')
        expect(overlay).toContain('opacity: var(--bz-style-on, 0);')
        expect(overlay).toContain('var(--bz-shell-surface, transparent)')
        expect(overlay).toContain('var(--bz-shell-veil, transparent)')
        expect(overlay).toContain('var(--bz-shell-hairline, 0)')
        expect(overlay).toContain('var(--ui-border, var(--theme-border-color))')
        expect(overlay).toContain(
            'inset 0 1px 0 rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0))'
        )
        // 窗口控制按钮图标跟随标题栏文字色（Child 组件样式由宿主 :deep 收口）
        expect(source).toContain('.title-bar :deep(.window-btn svg)')
        expect(source).toContain('stroke: color-mix(')
    })

    it('状态栏（宿主）：上边框 hairline / 表面 / 顶部圆角消费材质令牌，paper 无阴影', () => {
        const statusBlock = ruleBlock(css('shell'), '.status-bar')
        // 既有尺寸契约不漂移（height 24 / font-size 12）
        expect(statusBlock).toContain('height: 24px')
        expect(statusBlock).toContain('font-size: 12px')
        expect(statusBlock).toContain(
            'border-top: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color))'
        )
        expect(statusBlock).toContain(
            'background-color: var(--bz-shell-surface, var(--theme-card-background))'
        )
        expect(statusBlock).toContain('var(--bz-shell-veil, transparent)')
        expect(statusBlock).toContain('border-radius: var(--bz-shell-radius, 0)')
        // paper 无阴影 / workbench 现状：外壳不叠加 box-shadow（glass 高光边由组件内层收口）
        expect(statusBlock).not.toContain('box-shadow')

        // 状态栏组件消费 glass 高光边令牌
        expect(css('statusBar')).toContain('var(--ui-highlight-border-alpha, 0)')
    })

    it('分隔条：paper / glass 收为 hairline 语义色，workbench / hybrid 保持主题强调色', () => {
        const fileBar = ruleBlock(css('shell'), '#file-bar')
        expect(fileBar).toContain('var(--ui-accent, var(--theme-accent-color))')
        expect(fileBar).toContain('var(--ui-border, var(--theme-border-color))')
        expect(fileBar).toContain('var(--bz-style-on, 0)')
    })
})

describe('工区 / 侧栏 / 导航条材质消费（内容区与外壳双材质边界）', () => {
    it('内容区容器消费 --bz-content-*（hybrid 内容区 = paper）并默认不可见', () => {
        const source = css('workspace')
        // 6 类容器统一材质：md / plugin / tool / html / pdf
        for (const selector of [
            '#md-container,',
            '#plugin-containers,',
            '#tool-containers,',
            '#html-containers,',
            '#pdf-containers'
        ]) {
            expect(source, selector).toContain(selector)
        }
        expect(source).toContain(
            'background-color: var(--bz-content-surface, var(--theme-background-color))'
        )
        expect(source).toContain('var(--bz-content-veil, transparent)')
        expect(source).toContain('border-radius: var(--bz-content-radius, 0)')
        // 描边 / glass 高光边 / 纸感弱阴影（--ui-shadow-1 为 DESIGN 的卡片档弱阴影）
        expect(source).toContain(
            'var(--bz-content-hairline, 0) var(--ui-border, var(--theme-border-color))'
        )
        expect(source).toContain('rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0))')
        expect(source).toContain('var(--ui-shadow-1)')
        // workbench（内容区强度 0）时材质覆盖层 opacity 0 → 默认观感零变化
        expect(source).toContain('opacity: 0;')
        expect(source).toContain('opacity: var(--bz-content-on, 0);')
        // 编辑区顶部条与预览区同底（paper / hybrid 可见；workbench 取值与既有背景同值）
        expect(source).toContain('#md-container :deep(#md-edit-tools-bar)')
        expect(source).toContain('#md-container :deep(.md-preview)')
        expect(source).toContain('#md-container :deep(#markdown-preview-html)')
        expect(source).toContain('var(--bz-content-card-surface, var(--theme-card-background))')
        // 内容区同样禁止 backdrop-filter（glass 只允许悬浮层小面积模糊）
        expect(source).not.toContain('backdrop-filter')
    })

    it('侧栏（文件树 / 大纲）消费 --bz-shell-* 描边、阴影与 glass 高光边', () => {
        const source = css('resourceManager')
        expect(source).toContain(
            'background-color: var(--bz-shell-surface, var(--theme-card-background'
        )
        expect(source).toContain('var(--bz-shell-veil, transparent)')
        expect(source).toContain('border-radius: var(--bz-shell-radius, 0)')
        expect(source).toContain(
            'var(--bz-shell-hairline, 0) var(--ui-border, var(--theme-border-color))'
        )
        expect(source).toContain('rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0))')
        expect(source).toContain('var(--ui-shadow-1)')
        expect(source).toContain('opacity: var(--bz-style-on, 0);')
        // 既有滚动与宽度契约不漂移
        expect(source).toContain('overflow: auto')
        expect(source).toContain('width: calc(100% - 1px)')
        // 大纲面板同样走外壳材质
        expect(source).toContain('.markdown-toc-component {')
    })

    it('左右导航条消费外壳材质（paper 纸感 / glass 半透明 / workbench 现状）', () => {
        const workspace = css('workspace')
        const naviBlock = ruleBlock(workspace, '#navi-tab')
        expect(naviBlock).toContain('background-color: var(--bz-shell-surface')
        expect(naviBlock).toContain('var(--bz-shell-veil, transparent)')
        expect(naviBlock).toContain('border-radius: var(--bz-shell-radius, 0)')
        expect(naviBlock).toContain('rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0))')
        expect(naviBlock).toContain('var(--ui-border, var(--theme-border-color))')

        const naviTab = css('naviTab')
        expect(naviTab).toContain('background-color: var(--bz-shell-surface')
        expect(naviTab).toContain('var(--ui-border, var(--theme-border-color))')
        expect(naviTab).toContain('var(--ui-hairline-width, 1px)')
    })
})

describe('约束：无风格分支 / 无新增硬编码主题色 / 无障碍与既有契约保持', () => {
    it('组件内不得写 data-style / data-density 分支，也不得读取用户外观设置', () => {
        for (const [key, file] of Object.entries(SOURCE_FILES)) {
            const source = stripComments(readSource(file))
            expect(source, key).not.toMatch(/data-(style|density)\s*[=\]]/)
            expect(source, key).not.toContain('dataset.style')
            expect(source, key).not.toContain('dataset.density')
            expect(source, key).not.toMatch(/effectiveStyle|requestedStyle|uiStyle\b/)
        }
    })

    it('不新增硬编码主题色（既有无障碍/品牌遗留色白名单之外不得出现 hex 颜色）', () => {
        for (const key of Object.keys(SOURCE_FILES) as Array<keyof typeof SOURCE_FILES>) {
            const allowed = LEGACY_HEX_COLORS[key].map((value) => value.toLowerCase())
            const source = stripComments(readSource(SOURCE_FILES[key]))
            const colors = (source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).map((value) =>
                value.toLowerCase()
            )
            const offenders = colors.filter((value) => !allowed.includes(value))
            expect(offenders, `${key} 存在非白名单硬编码色值: ${offenders.join(', ')}`).toEqual([])
        }
    })

    it('状态栏无障碍契约未变化（错误详情为 dialog + 错误点/文字语义色）', () => {
        const statusBar = css('statusBar')
        expect(statusBar).toContain('aria-haspopup="dialog"')
        expect(statusBar).toContain('role="dialog"')
        expect(statusBar).toContain('var(--ui-danger)')
        expect(statusBar).toContain('color: var(--ui-text-secondary')
    })

    it('标题栏可拖拽/窗口控制区域契约未变化（-webkit-app-region drag/no-drag 保持）', () => {
        const source = readSource(SOURCE_FILES.shell)
        expect(source).toContain('-webkit-app-region: drag;')
        expect(source).toContain('-webkit-app-region: no-drag;')
        // 标题栏纯视觉覆盖层不得拦截点击/拖拽
        expect(source).toContain('pointer-events: none;')
    })
})
