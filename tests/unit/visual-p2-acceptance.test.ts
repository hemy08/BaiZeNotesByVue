/**
 * 视觉升级 1.5.5 P2 验收契约（T12 跨组件回归 / T13 编辑器纸感 / T14 图标统一 / T16 验收矩阵）
 *
 * ## 为什么用静态契约 + jsdom 断言
 * 4 风格 × 3 密度 × 28 主题的最终像素由根元素 `data-style` / `data-density` 下的 CSS 变量
 * 自动生效，jsdom 不解析 CSS 变量、color-mix、backdrop-filter，无法断言最终像素。因此本文件
 * 守护「P2 改动的实现契约与矩阵完整性」：
 * 1. T12 层级收敛 / 菜单栏高度单一实现 / 宽度阶梯迁移 / 工具窗可选内边距包裹层；
 * 2. T13 paper/hybrid 写作模式正文版式令牌与消费点，且不触碰 Monaco 主题；
 * 3. T14 图标统一（24 网格 / stroke 1.5 / currentColor / 16-20-24 三档；MDI fill 型库与
 *    品牌 512 网格为例外）、图标资产引用守卫与 AdmonitionDialog 12 类图标替换契约；
 * 4. T15 硬编码清理不变量（静态 CSS 真源变量不再保留冗余颜色兜底）；
 * 5. T16 验收矩阵（4 风格 × 2 主题 × 6 组件 48 + 密度 18 + 主题类别 12 + glass 6）的
 *    组合数与令牌覆盖，以及 28 主题对比度扫描；
 * 6. P2 遗留项 4：z-index 应用层基座迁移（欢迎页 / 窗口缩放热区 / 写作模式裸值清零，
 *    常量与 CSS 变量单一真源，数值与迁移前逐项等值）。
 *
 * 真实截图的软门禁见 `e2e/visual-matrix.spec.ts`（E2E_VISUAL=1），静态矩阵补充说明核对
 * `docs/design/P2-VERIFICATION.md`。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
    buildSemanticTokens,
    contrastRatio,
    parseColor,
    resolveSemanticThemeGroup
} from '../../src/shared/theme-tokens'
import type { SemanticTokenSource } from '../../src/shared/theme-tokens'
import {
    UI_DENSITY_TOKENS,
    UI_DENSITY_VALUES,
    UI_STYLE_TOKENS,
    UI_STYLE_VALUES,
    UI_Z_INDEX_APP_BASE,
    UI_Z_INDEX_APP_COMPAT,
    UI_Z_INDEX_TOKENS
} from '../../src/shared/constants/ui-style'
import { DIALOG_WIDTH_LADDER } from '../../src/renderer/src/components/dialogs/dialog-metrics'

const ROOT = path.resolve(__dirname, '../..')
const RENDERER = path.join(ROOT, 'src', 'renderer', 'src')
const COMPONENTS = path.join(RENDERER, 'components')

function readSource(file: string): string {
    return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** 递归收集某目录下指定扩展名文件（相对仓库根路径，便于断言报告） */
function walkFiles(dir: string, extensions: readonly string[]): string[] {
    const result: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            result.push(...walkFiles(full, extensions))
        } else if (extensions.some((ext) => entry.name.endsWith(ext))) {
            result.push(full)
        }
    }
    return result
}

/** 去掉注释（HTML/CSS/JS 三种），避免把说明文字里的字面量当成实现 */
function stripComments(source: string): string {
    return source
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

// =============================================================================================
// T12 跨组件回归：层级收敛 / 菜单栏高度单一实现 / 宽度阶梯 / 工具窗可选内边距
// =============================================================================================

describe('T12 层级收敛：对话框 / 命令面板应用层兼容令牌', () => {
    const UI_STYLE_CSS = path.join(RENDERER, 'styles', 'ui-style.css')
    const BASE_DIALOG = path.join(COMPONENTS, 'dialogs', 'BaseDialog.vue')
    const COMMAND_PALETTE = path.join(COMPONENTS, 'search', 'CommandPalette.vue')

    it('应用层兼容层级 = 既有 9999 / 10000，语义相对阶梯保持 50 / 60 不变', () => {
        expect(UI_Z_INDEX_APP_COMPAT).toEqual({ dialog: 9999, commandPalette: 10000 })
        // 语义阶梯保持不变（设计文档 §3.3 的 0~80 相对层级）
        expect(UI_Z_INDEX_TOKENS.dialog).toBe(50)
        expect(UI_Z_INDEX_TOKENS.commandPalette).toBe(60)
        // 应用层映射比语义 rank 高，保证「命令面板恒在对话框之上」
        expect(UI_Z_INDEX_APP_COMPAT.commandPalette).toBeGreaterThan(UI_Z_INDEX_APP_COMPAT.dialog)
    })

    it('ui-style.css :root 声明两个应用层变量，值与 UI_Z_INDEX_APP_COMPAT 一致', () => {
        const source = readSource(UI_STYLE_CSS)
        expect(source).toContain(`--ui-z-dialog-app: ${UI_Z_INDEX_APP_COMPAT.dialog};`)
        expect(source).toContain(`--ui-z-palette-app: ${UI_Z_INDEX_APP_COMPAT.commandPalette};`)
    })

    it('BaseDialog 遮罩 z-index 走 --ui-z-dialog-app，不再写死 9999', () => {
        const source = readSource(BASE_DIALOG)
        const css = stripComments(source)
        expect(css).toMatch(/z-index:\s*var\(--ui-z-dialog-app/)
        expect(css).not.toMatch(/z-index:\s*9999/)
    })

    it('命令面板遮罩走 --ui-z-palette-app（比对话框高一档，不依赖 DOM 顺序）', () => {
        const source = readSource(COMMAND_PALETTE)
        expect(source).toContain('var(--ui-z-palette-app')
        expect(source).toContain('overlay-style="overlayStyle"')
    })
})

// =============================================================================================
// P2 遗留项 4：z-index 应用层基座迁移（欢迎页 / 窗口缩放热区 / 写作模式）
// 裸值 9999 / 10000 / 3000 → 命名令牌 UI_Z_INDEX_APP_BASE + --ui-z-*-app 变量（数值零变化）
// =============================================================================================

describe('P2 遗留项 4 z-index 应用层基座迁移', () => {
    const UI_STYLE_CSS_FILE = path.join(RENDERER, 'styles', 'ui-style.css')
    const WELCOME_SCREEN = path.join(COMPONENTS, 'WelcomeScreen.vue')
    const HOST_SHELL = path.join(COMPONENTS, 'BaiZeNotes.vue')
    const WRITING_MODE_HOST = path.join(COMPONENTS, 'Markdown', 'WritingModeHost.vue')

    it('UI_Z_INDEX_APP_BASE 数值与迁移前逐项等值，且保持与 T12 兼容层级的既有栈序关系', () => {
        // 迁移前：欢迎页 9999 / 窗口缩放热区 9999~10000 / 写作模式 3000（数值不得漂移）
        expect(UI_Z_INDEX_APP_BASE).toEqual({ welcome: 9999, resize: 10000, writingMode: 3000 })
        // 欢迎页与对话框同层（二者互斥渲染：App.vue 中 v-if / v-else，等值不产生竞争）
        expect(UI_Z_INDEX_APP_BASE.welcome).toBe(UI_Z_INDEX_APP_COMPAT.dialog)
        // 缩放热区「角」与命令面板同层 = 应用内最高层；「边」= resize - 1 = 9999（原值）
        expect(UI_Z_INDEX_APP_BASE.resize).toBe(UI_Z_INDEX_APP_COMPAT.commandPalette)
        expect(UI_Z_INDEX_APP_BASE.resize).toBeGreaterThan(UI_Z_INDEX_APP_COMPAT.dialog)
        expect(UI_Z_INDEX_APP_BASE.resize - 1).toBe(UI_Z_INDEX_APP_COMPAT.dialog)
        // 写作模式恒低于对话框/工具窗（原语义：写作模式上的弹窗必须可见）
        expect(UI_Z_INDEX_APP_BASE.writingMode).toBeLessThan(UI_Z_INDEX_APP_COMPAT.dialog)
        // 欢迎页内部窗口控制条 = welcome + 1（原 10000），仅在本层 stacking context 内排序
        expect(UI_Z_INDEX_APP_BASE.welcome + 1).toBe(UI_Z_INDEX_APP_BASE.resize)
    })

    it('ui-style.css :root 声明三个基座变量，值与 UI_Z_INDEX_APP_BASE 逐项一致（单一真源）', () => {
        const source = readSource(UI_STYLE_CSS_FILE)
        expect(source).toContain(`--ui-z-welcome-app: ${UI_Z_INDEX_APP_BASE.welcome};`)
        expect(source).toContain(`--ui-z-resize-app: ${UI_Z_INDEX_APP_BASE.resize};`)
        expect(source).toContain(`--ui-z-writing-mode-app: ${UI_Z_INDEX_APP_BASE.writingMode};`)
    })

    it('三个基座组件不再出现 9999 / 10000 / 3000 裸值（样式声明级）', () => {
        for (const file of [WELCOME_SCREEN, HOST_SHELL, WRITING_MODE_HOST]) {
            const css = stripComments(readSource(file))
            const bare = css.match(/z-index:\s*(?:9999|10000|3000)\b/g) ?? []
            expect(bare, path.relative(ROOT, file)).toEqual([])
        }
    })

    it('欢迎页：全屏层消费 --ui-z-welcome-app，内部控制条 = welcome + 1（原 10000）', () => {
        const css = stripComments(readSource(WELCOME_SCREEN))
        expect(css).toMatch(/\.welcome-screen\s*\{[\s\S]*?z-index:\s*var\(--ui-z-welcome-app\);/)
        expect(css).toMatch(
            /\.window-controls\s*\{[\s\S]*?z-index:\s*calc\(var\(--ui-z-welcome-app\)\s*\+\s*1\);/
        )
    })

    it('宿主窗口：缩放热区「角」= --ui-z-resize-app，「边」= resize - 1（原 10000 / 9999）', () => {
        const css = stripComments(readSource(HOST_SHELL))
        expect(css).toMatch(
            /\.resize-edge\s*\{[\s\S]*?z-index:\s*calc\(var\(--ui-z-resize-app\)\s*-\s*1\);/
        )
        expect(css).toMatch(/\.resize-corner\s*\{[\s\S]*?z-index:\s*var\(--ui-z-resize-app\);/)
    })

    it('写作模式：全屏层消费 --ui-z-writing-mode-app（原 3000，恒低于对话框）', () => {
        const css = stripComments(readSource(WRITING_MODE_HOST))
        expect(css).toMatch(
            /\.writing-mode-host\s*\{[\s\S]*?z-index:\s*var\(--ui-z-writing-mode-app\);/
        )
    })

    it('渲染层不再有组件直接写 9999 / 10000 / 3000 的 z-index 裸值（全局静态护栏）', () => {
        const offenders: string[] = []
        for (const file of walkFiles(RENDERER, ['.vue', '.css'])) {
            const css = stripComments(readSource(file))
            for (const match of css.matchAll(/z-index:\s*(9999|10000|3000)\b/g)) {
                offenders.push(`${path.relative(ROOT, file)}: z-index: ${match[1]}`)
            }
        }
        expect(offenders).toEqual([])
    })
})

describe('T12 菜单栏宿主高度：单一实现（宿主文件消费 --ui-control-height）', () => {
    const HOST = path.join(COMPONENTS, 'BaiZeNotes.vue')
    const MENU_BAR = path.join(COMPONENTS, 'MenuBar.vue')

    it('宿主 .menu-bar 高度 = 控件高令牌 + 4px；MenuBar.vue 不再有全局 #menu-bar 覆盖', () => {
        const hostBlock = readSource(HOST).match(/\.menu-bar\s*\{[\s\S]*?\}/)?.[0] ?? ''
        expect(hostBlock).toMatch(/height:\s*calc\(var\(--ui-control-height,\s*32px\)\s*\+\s*4px\)/)
        const menuBar = readSource(MENU_BAR)
        expect(menuBar).not.toContain('#menu-bar {')
        // 组件自身只撑满宿主高度（高度真源唯一）
        expect(menuBar).toMatch(/\.menu-bar\s*\{[\s\S]*?height:\s*100%;/)
    })

    it('三档密度下的菜单栏高度 = 32 / 36 / 40（COMPONENTS.md §2）', () => {
        for (const density of UI_DENSITY_VALUES) {
            const expected = UI_DENSITY_TOKENS[density].controlHeight + 4
            const heights: Record<string, number> = { compact: 32, default: 36, spacious: 40 }
            expect(expected, density).toBe(heights[density])
        }
    })
})

describe('T12 对话框宽度阶梯渐进迁移（只迁移像素等值的调用点）', () => {
    it('语义阶梯 360 / 520 / 720 / 960 / 全宽 与方案一致', () => {
        expect(DIALOG_WIDTH_LADDER).toEqual({
            confirm: '360px',
            form: '520px',
            medium: '720px',
            complex: '960px',
            full: 'min(1440px, 96vw)'
        })
    })

    it('等值调用点已迁移到 widthSize：命令面板 720 / 链接 520 / 写作风格 960 / 文档历史 960', () => {
        const expected: Array<[string, string, keyof typeof DIALOG_WIDTH_LADDER]> = [
            ['search/CommandPalette.vue', 'PALETTE_WIDTH_SIZE', 'medium'],
            ['dialogs/simple/WebUrlDialog.vue', 'WEB_URL_WIDTH_SIZE', 'form'],
            [
                'Markdown/writing-style/WritingStyleDialog.vue',
                'WRITING_STYLE_WIDTH_SIZE',
                'complex'
            ],
            ['Markdown/history/FileHistoryDialog.vue', 'FILE_HISTORY_WIDTH_SIZE', 'complex']
        ]
        for (const [relative, constName, size] of expected) {
            const source = readSource(path.join(COMPONENTS, relative))
            expect(source, relative).toContain(`${constName}: DialogWidthSize = '${size}'`)
            expect(source, relative).toContain(`:width-size="${constName}"`)
            // 阶梯像素值不再作为 width 字面量出现在调用点
            expect(source, relative).not.toMatch(new RegExp(`width="${DIALOG_WIDTH_LADDER[size]}"`))
        }
    })

    it('剩余 width 调用点没有使用阶梯像素值（风险大的调用点保持原值但不得与阶梯冲突）', () => {
        const ladderPixels = new Set<string>(Object.values(DIALOG_WIDTH_LADDER))
        const files = walkFiles(COMPONENTS, ['.vue'])
        for (const file of files) {
            const source = stripComments(readSource(file))
            for (const match of source.matchAll(/\bwidth="([^"]+)"/g)) {
                const value = match[1]
                expect(
                    ladderPixels.has(value),
                    `${path.relative(ROOT, file)} 仍以 width="${value}" 传阶梯像素值，应改用 widthSize`
                ).toBe(false)
            }
        }
    })
})

describe('T12 T6 工具窗统一内边距：可选包裹层不破坏 c4 节点契约', () => {
    const BASE_DIALOG = path.join(COMPONENTS, 'dialogs', 'BaseDialog.vue')

    it('默认不包裹（contentPadding 默认 false），保持 prepend → title-bar → 正文 → footer 直接子节点', () => {
        const source = readSource(BASE_DIALOG)
        expect(source).toContain('contentPadding?: boolean')
        expect(source).toMatch(/contentPadding:\s*false/)
        // 包裹层受 contentPadding 开关控制，默认 false 时不产生额外 DOM
        expect(source).toMatch(/v-if="contentPadding"\s+class="dialog-body"/)
    })

    it('包裹层内边距消费 --ui-pad，且仅在显式启用时渲染', () => {
        const source = readSource(BASE_DIALOG)
        const css = stripComments(source)
        expect(css).toMatch(/\.dialog-body\s*\{[\s\S]*?padding:\s*var\(--ui-pad/)
    })

    it('当前没有任何调用点启用 contentPadding（本批零像素变化，后续批次逐个迁移）', () => {
        const files = walkFiles(COMPONENTS, ['.vue'])
        const enabled = files.filter((file) =>
            /content-padding|:contentPadding/.test(stripComments(readSource(file)))
        )
        expect(enabled).toEqual([])
    })
})

// =============================================================================================
// T13 编辑器正文纸感：paper / hybrid 写作模式版式 + 不覆盖 Monaco 主题
// =============================================================================================

describe('T13 paper/hybrid 写作模式正文纸感版式', () => {
    const UI_STYLE_CSS = path.join(RENDERER, 'styles', 'ui-style.css')
    const WRITING_MODE_HOST = path.join(COMPONENTS, 'Markdown', 'WritingModeHost.vue')

    /** 取 CSS 中某选择器块的声明文本 */
    function ruleBlock(source: string, selectorLine: string): string {
        const start = source.indexOf(selectorLine)
        expect(start, `ui-style.css 缺少 ${selectorLine}`).toBeGreaterThanOrEqual(0)
        const end = source.indexOf('}', start)
        return source.slice(start, end)
    }

    it('内容区纸感版式令牌只在 paper / hybrid（内容区材质 = paper）声明', () => {
        const source = readSource(UI_STYLE_CSS)
        // paper 与 hybrid 共享同一块内容版式令牌
        const shared = ruleBlock(source, "[data-style='paper'],\n[data-style='hybrid'] {")
        expect(shared).toContain('--ui-content-line-height: 1.75;')
        expect(shared).toContain('--ui-content-paragraph-gap: 0.75em;')
        expect(shared).toContain('--ui-content-heading-gap-top: 1.5em;')
        expect(shared).toContain('--ui-content-heading-gap-bottom: 0.5em;')
        expect(shared).toContain('--ui-content-blockquote-width: 3px;')
        expect(shared).toContain(
            '--ui-content-blockquote-color: color-mix(in srgb, var(--ui-accent) 30%, transparent);'
        )
        expect(shared).toContain('--ui-content-code-padding: 12px;')
        expect(shared).toContain('--ui-content-list-indent: 1.25em;')
        // 代码块圆角 6：取内容区圆角中档（paper=6 / hybrid 内容区=6）
        expect(shared).toContain('--ui-content-code-radius: var(--ui-content-radius-md, 6px);')
        // workbench / glass 不声明纸感版式令牌（正文保持升级前默认）
        const workbench = ruleBlock(source, "[data-style='workbench'] {")
        expect(workbench).not.toContain('--ui-content-line-height')
        const glass = ruleBlock(source, "[data-style='glass'] {")
        expect(glass).not.toContain('--ui-content-line-height')
    })

    it('写作模式消费全部版式令牌，且只在 paper / hybrid 生效', () => {
        const source = readSource(WRITING_MODE_HOST)
        for (const token of [
            '--ui-content-line-height',
            '--ui-content-font-size',
            '--ui-content-paragraph-gap',
            '--ui-content-heading-gap-top',
            '--ui-content-heading-gap-bottom',
            '--ui-content-blockquote-width',
            '--ui-content-blockquote-color',
            '--ui-content-code-radius',
            '--ui-content-code-padding',
            '--ui-content-list-indent',
            '--ui-selection'
        ]) {
            expect(source, `WritingModeHost 未消费 ${token}`).toContain(token)
        }
        // 选择器必须限定 paper / hybrid + 写作模式 + 预览区域，不允许全局覆盖
        expect(source).toContain("[data-style='paper'] #editor-container.writing-mode-active")
        expect(source).toContain("[data-style='hybrid'] #editor-container.writing-mode-active")
        expect(source).toContain('.md-typeset')
    })

    it('不覆盖 Monaco 主题：写作模式样式中没有 Monaco 主题定义/编辑器主题选择器', () => {
        const source = stripComments(readSource(WRITING_MODE_HOST))
        expect(source).not.toContain('defineTheme')
        expect(source).not.toContain('.monaco-editor')
        expect(source).not.toContain('monaco.editor.setTheme')
    })
})

// =============================================================================================
// T14 图标统一：24 网格 / stroke 1.5 / currentColor / 16-20-24 三档
// + 图标资产引用守卫（34 个占位圆已删 / 20 个历史零引用冻结）+ MDI fill 型例外与 12 类 emoji 替换
// =============================================================================================

describe('T14 图标统一', () => {
    it('EmptyState 统一插图：24 网格 / stroke 1.5 / currentColor / 无 emoji 功能图标', () => {
        const emptyState = readSource(path.join(COMPONENTS, 'common', 'ui', 'EmptyState.vue'))
        expect(emptyState).toContain('viewBox="0 0 24 24"')
        expect(emptyState).toContain('stroke-width="1.5"')
        expect(emptyState).toContain('stroke="currentColor"')
        expect(emptyState).toContain('fill="none"')
        // 空态插图不得用 emoji 作为功能图标
        expect(emptyState).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
    })

    it('HemyTools 查看器工具栏图标：24 网格 / 16px / stroke 1.5 / currentColor', () => {
        for (const relative of ['HemyTools/ShowHtmlView.vue', 'HemyTools/ShowPdfEditor.vue']) {
            const source = readSource(path.join(COMPONENTS, relative))
            const tags = source.match(/<svg\b[^>]*>/g) ?? []
            expect(tags.length, relative).toBeGreaterThan(0)
            for (const tag of tags) {
                expect(tag, `${relative}: ${tag.slice(0, 80)}`).toContain('viewBox="0 0 24 24"')
                expect(tag, relative).toContain('width="16"')
                expect(tag, relative).toContain('height="16"')
                expect(tag, relative).toContain('stroke="currentColor"')
                expect(tag, relative).toContain('stroke-width="1.5"')
                expect(tag, relative).not.toContain('stroke-width="2"')
            }
        }
    })

    it('品牌大图标（512 网格）与功能图标（24 网格）分档：assets/icons 固定 23 个资产（20 功能 + 3 品牌）', () => {
        const iconsDir = path.join(RENDERER, 'assets', 'icons')
        const svgFiles = walkFiles(iconsDir, ['.svg'])
        // P2 T14 遗留项 5：34 个未引用「占位圆」已删除（dark/light 各 17），剩余 20 个 24 网格
        // 功能图标 + 3 个 512 网格品牌文件；资产数冻结，增删资产必须同步本断言与 COMPONENTS.md §8。
        expect(svgFiles.length).toBe(23)
        const largeGrid: string[] = []
        for (const file of svgFiles) {
            const source = readSource(file)
            const viewBox = /viewBox="([^"]+)"/.exec(source)?.[1]
            expect(viewBox, `缺少 viewBox: ${file}`).toBeTruthy()
            // 图标只允许两种网格：功能图标 24 / 品牌大图标 512
            expect(['0 0 24 24', '0 0 512 512'], `viewBox: ${file}`).toContain(viewBox)
            if (viewBox === '0 0 512 512') {
                largeGrid.push(path.basename(file))
            }
        }
        // 三个品牌/logo 文件使用 512 网格（logo-baize-dark-A-ultra / logo-baize-light-A-large /
        // baize_mirror_dark），属「不得按 24 功能图标网格重绘」的例外，已在 P2-VERIFICATION 记录
        expect(largeGrid.sort()).toEqual(
            [
                'baize_mirror_dark.svg',
                'logo-baize-dark-A-ultra.svg',
                'logo-baize-light-A-large.svg'
            ].sort()
        )
    })

    it('assets/icons 不得再出现「占位圆」资产（单 circle + stroke-width 2 + 无 path）', () => {
        // P2 T14 审计的 34 个占位圆均为同一 200 字节文件：24 网格 + 单个 stroke 2 的 r=10 圆。
        // 该模式是「占位资产」的静态指纹，后续批次不得以任何形式重新引入。
        const iconsDir = path.join(RENDERER, 'assets', 'icons')
        const placeholders = walkFiles(iconsDir, ['.svg']).filter((file) => {
            const source = readSource(file)
            return (
                (source.match(/<circle\b/g) ?? []).length === 1 &&
                !/<path\b/.test(source) &&
                source.includes('stroke-width="2"')
            )
        })
        expect(placeholders.map((file) => path.relative(ROOT, file))).toEqual([])
    })

    it('assets/icons 不得引入未引用资产：新资产必须被 src 引用（20 个历史零引用仅冻结待后续）', () => {
        const iconsDir = path.join(RENDERER, 'assets', 'icons')
        // 遗留项 5 只删除 34 个占位圆；以下 20 个 24 网格功能图标当前仍零静态引用
        // （P2-VERIFICATION §4.5 记录的历史存量），冻结为「只减不增」清单：
        // 新增资产必须被 src 引用；本清单只允许在后续批次删除资产时同步收缩。
        const FROZEN_UNREFERENCED = new Set([
            'icon-html-convert.svg',
            'icon-html-convert-light.svg',
            'icon-import-export.svg',
            'icon-import-export-light.svg',
            'icon-katex.svg',
            'icon-katex-light.svg',
            'icon-live-preview.svg',
            'icon-live-preview-light.svg',
            'icon-md-edit.svg',
            'icon-md-edit-light.svg',
            'icon-mermaid.svg',
            'icon-mermaid-light.svg',
            'icon-multi-cursor.svg',
            'icon-multi-cursor-light.svg',
            'icon-multi-format.svg',
            'icon-multi-format-light.svg',
            'icon-search.svg',
            'icon-search-light.svg',
            'icon-theme-switch.svg',
            'icon-theme-switch-light.svg'
        ])
        const svgFiles = walkFiles(iconsDir, ['.svg'])
        const assetNames = new Set(svgFiles.map((file) => path.basename(file)))
        // 冻结清单只减不增：清单内每个文件必须仍存在（删除资产后必须同步收缩清单）
        for (const frozen of FROZEN_UNREFERENCED) {
            expect(assetNames.has(frozen), `冻结清单已失效，请同步收缩: ${frozen}`).toBe(true)
        }
        // 引用判定（静态可实现的弱守卫）：资产文件名（不含 .svg）出现在渲染层源码中即视为被引用。
        // 严格的 import 语法级校验见 out/tmp/scan-unreferenced-icons.mjs（本批证据脚本）。
        const rendererSource = walkFiles(RENDERER, ['.ts', '.vue', '.json', '.css'])
            .map(readSource)
            .join('\n')
        const unreferenced: string[] = []
        for (const file of svgFiles) {
            const name = path.basename(file)
            if (
                rendererSource.includes(name.replace(/\.svg$/, '')) ||
                FROZEN_UNREFERENCED.has(name)
            ) {
                continue
            }
            unreferenced.push(path.relative(ROOT, file))
        }
        expect(unreferenced).toEqual([])
    })

    it('AdmonitionDialog 类型选择器：12 个 emoji 已替换为 MDI fill 型 SVG（无 emoji / 24 网格 / currentColor / aria-hidden）', () => {
        const source = readSource(
            path.join(COMPONENTS, 'dialogs', 'medium', 'AdmonitionDialog.vue')
        )
        // 不得再出现 emoji 功能图标（渲染层统一 SVG 图标）
        expect(source).not.toMatch(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u)
        // 12 个类型各有一条 MDI path 数据（fill 型图形库，24×24，取自 mdi-icons-data.ts）
        const iconPaths = source.match(
            /^\s+(?:note|tip|warning|danger|info|abstract|todo|success|question|bug|example|quote):\s*'M/gm
        )
        expect(iconPaths?.length ?? 0).toBe(12)
        // 模板内联 SVG：24 网格 + currentColor + 装饰性 aria-hidden；可访问名由可见 type-name 承载
        expect(source).toContain('viewBox="0 0 24 24"')
        expect(source).toContain('fill="currentColor"')
        expect(source).toContain('aria-hidden="true"')
        // 类型 id / 顺序 / 文案保持 12 项不变（替换图标不得改动数据契约）
        const typeEntries = source.match(/id: '([a-z]+)', name: '([A-Za-z]+)'/g) ?? []
        expect(typeEntries).toHaveLength(12)
    })
})

// =============================================================================================
// T15 硬编码清理不变量：静态 CSS 真源变量的冗余颜色兜底已删除
// =============================================================================================

describe('T15 硬编码清理不变量', () => {
    const THEME_CSS_FILE = path.join(RENDERER, 'styles', 'theme.css')
    const UI_STYLE_CSS_FILE = path.join(RENDERER, 'styles', 'ui-style.css')

    /** 静态 CSS 真源中已声明、且首屏前即生效的变量（这些变量不允许再带颜色兜底） */
    function staticallyDefinedVariables(): Set<string> {
        const variables = new Set<string>()
        for (const file of [THEME_CSS_FILE, UI_STYLE_CSS_FILE]) {
            for (const match of readSource(file).matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
                variables.add(match[1])
            }
        }
        return variables
    }

    it('渲染层非真源文件不再保留「静态真源变量」的颜色兜底（等值替换，零视觉变化）', () => {
        const staticallyDefined = staticallyDefinedVariables()
        const whitelist = new Set([
            THEME_CSS_FILE,
            UI_STYLE_CSS_FILE,
            // 写作模式纸感令牌仅在 paper/hybrid 块声明，非全风格可用 → 允许兜底
            path.join(RENDERER, 'components', 'Markdown', 'WritingModeHost.vue')
        ])
        const files = walkFiles(RENDERER, ['.vue', '.css', '.ts']).filter(
            (file) => !whitelist.has(file)
        )
        const offenders: string[] = []
        for (const file of files) {
            const source = stripComments(readSource(file))
            const pattern = /var\((--[a-z0-9-]+),[^()]*(#[0-9a-fA-F]{3,8}|rgba?\()/g
            for (const match of source.matchAll(pattern)) {
                if (staticallyDefined.has(match[1])) {
                    offenders.push(`${path.relative(ROOT, file)}: var(${match[1]}, …)`)
                }
            }
        }
        expect(offenders).toEqual([])
    })
})

// =============================================================================================
// T16 验收矩阵：组合数 / 令牌覆盖 / 28 主题对比度扫描
// =============================================================================================

describe('T16 验收矩阵完整性', () => {
    const THEME_CONFIG_FILE = path.join(ROOT, 'src', 'main', 'config', 'theme-config.ts')
    const UI_STYLE_CSS = path.join(RENDERER, 'styles', 'ui-style.css')
    const TOKEN_COLOR_FIELDS = [
        'backgroundColor',
        'cardBackground',
        'textColor',
        'secondaryTextColor',
        'borderColor',
        'accentColor',
        'hoverBackground'
    ] as const

    /** 6 类验收组件（方案 §4：菜单栏 / 工具窗 / 表格 / 对话框 / 命令面板 / 状态栏与空态） */
    const COMPONENT_REGIONS = [
        'menu-bar',
        'tool-window',
        'table-editor',
        'dialog',
        'command-palette',
        'status-bar-empty-state'
    ] as const
    /** 2 个代表主题（浅色 baize / 深色 baize-text） */
    const REPRESENTATIVE_THEMES = ['baize', 'baize-text'] as const

    interface ParsedThemeEntry {
        type: string
        colors: Record<string, string>
    }

    /** 静态解析主进程 theme-config.ts 的 themes 注册表（与 theme-contract.test.ts 同口径） */
    function parseThemeColorEntries(): ParsedThemeEntry[] {
        const source = readSource(THEME_CONFIG_FILE)
        const marker = 'export const themes: Record<ThemeType, ThemeStyles> = {'
        const start = source.indexOf(marker)
        expect(start, '主进程 theme-config.ts 应定义 themes 注册表').toBeGreaterThanOrEqual(0)
        const entries: ParsedThemeEntry[] = []
        let current: ParsedThemeEntry | null = null
        for (const line of source.slice(start + marker.length).split('\n')) {
            if (line === '}') break
            const keyMatch = line.match(/^ {4}(?:'([^']+)'|([A-Za-z][\w-]*)): \{$/)
            if (keyMatch) {
                current = { type: keyMatch[1] ?? keyMatch[2], colors: {} }
                entries.push(current)
                continue
            }
            if (!current) continue
            const fieldMatch = line.match(/^ {8}([A-Za-z]+): '([^']*)'/)
            if (fieldMatch && (TOKEN_COLOR_FIELDS as readonly string[]).includes(fieldMatch[1])) {
                current.colors[fieldMatch[1]] = fieldMatch[2]
            }
        }
        return entries
    }

    it('矩阵组合数：48（4 风格 × 2 主题 × 6 组件）+ 18（密度）+ 12（主题类别）+ 6（glass 降级）', () => {
        expect(UI_STYLE_VALUES).toHaveLength(4)
        expect(UI_DENSITY_VALUES).toHaveLength(3)
        expect(COMPONENT_REGIONS).toHaveLength(6)
        expect(REPRESENTATIVE_THEMES).toHaveLength(2)

        const styleMatrix =
            UI_STYLE_VALUES.length * REPRESENTATIVE_THEMES.length * COMPONENT_REGIONS.length
        const densityMatrix = COMPONENT_REGIONS.length * UI_DENSITY_VALUES.length
        const themeCategoryMatrix = UI_STYLE_VALUES.length * 3 // 浅色 / 深色 / 高饱和·护眼
        const glassMatrix = 6
        expect(styleMatrix).toBe(48)
        expect(densityMatrix).toBe(18)
        expect(themeCategoryMatrix).toBe(12)
        expect(glassMatrix).toBe(6)
        // 方案 §5 文字「合计 78 张」= 48 + 18 + 12（不含 glass 专项 6 张）；
        // 若把 glass 专项也计入则为 84 张——P2-VERIFICATION.md 已记录该口径差异。
        expect(styleMatrix + densityMatrix + themeCategoryMatrix).toBe(78)
        expect(styleMatrix + densityMatrix + themeCategoryMatrix + glassMatrix).toBe(84)
    })

    it('4 风格 × 3 密度在 ui-style.css 中有完整变量块（含 glass 降级 2 块）', () => {
        const source = readSource(UI_STYLE_CSS)
        for (const style of UI_STYLE_VALUES) {
            expect(source, style).toContain(`[data-style='${style}'] {`)
            const block = UI_STYLE_TOKENS[style]
            expect(block.radiusLg).toBeGreaterThan(0)
        }
        for (const density of UI_DENSITY_VALUES) {
            expect(source, density).toContain(`[data-density='${density}'] {`)
        }
        expect(source).toContain("[data-style='glass'][data-glass-mode='steady']")
        expect(source).toContain("[data-style='glass'][data-transparency='reduced']")
        expect(source).toContain('@media (prefers-reduced-transparency: reduce)')
        expect(source).toContain('@media (prefers-reduced-motion: reduce)')
    })

    it('28 主题 × 4 风格对比度扫描：正文 ≥4.5:1、次要文字 ≥3:1（风格不改颜色，四风格同值）', () => {
        const entries = parseThemeColorEntries()
        expect(entries).toHaveLength(28)
        const failures: string[] = []
        const checked: string[] = []
        for (const entry of entries) {
            const source = entry.colors as unknown as SemanticTokenSource
            const group = resolveSemanticThemeGroup(entry.type, source)
            const tokens = buildSemanticTokens(source, group)
            for (const style of UI_STYLE_VALUES) {
                // 风格层只改材质不改颜色：令牌取值与 style 无关，这里显式断言「四风格一致」
                const tokensByStyle = buildSemanticTokens(source, group)
                expect(tokensByStyle.text, `${entry.type}/${style}`).toBe(tokens.text)
                const textContrast = contrastRatio(tokens.text, tokens.surface) ?? 0
                const secondaryContrast = contrastRatio(tokens.textSecondary, tokens.surface) ?? 0
                // 4 风格 × 浅/深/护眼三类主题均在扫描范围内
                const key = `${entry.type}/${style}`
                if (textContrast < 4.5) {
                    failures.push(`${key} 正文对比度 ${textContrast.toFixed(2)} < 4.5`)
                }
                if (secondaryContrast < 3) {
                    failures.push(`${key} 次要文字对比度 ${secondaryContrast.toFixed(2)} < 3`)
                }
                checked.push(key)
            }
        }
        // 16 个语义色令牌 × 28 主题 × 4 风格 = 1792 项对比度抽样（正文/次要文字两项）
        expect(checked.length).toBe(28 * 4)
        expect(failures).toEqual([])
    })

    it('对比度令牌派生：focus-ring = accent 30%、selection = accent 15%（键盘走查可见性前提）', () => {
        const entries = parseThemeColorEntries()
        for (const entry of entries) {
            const source = entry.colors as unknown as SemanticTokenSource
            const group = resolveSemanticThemeGroup(entry.type, source)
            const tokens = buildSemanticTokens(source, group)
            const focus = parseColor(tokens.focusRing)
            const selection = parseColor(tokens.selection)
            expect(focus, entry.type).not.toBeNull()
            expect(selection, entry.type).not.toBeNull()
            expect(focus?.a, entry.type).toBeCloseTo(0.3, 3)
            expect(selection?.a, entry.type).toBeCloseTo(0.15, 3)
        }
    })
})
