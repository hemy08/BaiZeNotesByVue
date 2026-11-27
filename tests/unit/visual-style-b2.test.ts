/**
 * 视觉升级 P1-B2（菜单栏 / 命令面板 / 状态栏 / 空态）四风格 × 三密度静态契约测试。
 *
 * ## 为什么用静态契约而不是快照
 * 四风格 × 三密度的真实观感由根元素 `data-style` / `data-density` 下的 CSS 变量覆盖
 * 自动生效（P0 冻结层），jsdom 不解析 CSS 变量与 color-mix/backdrop-filter，无法在单测里
 * 断言最终像素。因此本文件守护「组件确实消费了正确的令牌、且没有写死风格/密度分支」——
 * 一旦有人把令牌换回硬编码值、或私自加 `[data-style=...]` 分支，本测试立即失败；
 * 最终观感由 T16 统一真实截图验收（截图归档 out/，不入库）。
 *
 * 覆盖：
 * 1. 4 个区域组件消费的 --ui-* 令牌清单（颜色 / 材质 / 密度 / 焦点 / 层级 / 动效）；
 * 2. 组件内不得出现 data-style / data-density 分支（唯一入口是 useTheme）；
 * 3. 不得新增硬编码主题色（var() 兜底值除外）；胶囊圆角 999px 是 DESIGN.md 唯一允许字面量；
 * 4. 菜单栏高度 = 控件高令牌 + 4px（compact 32 / default 36 / spacious 40）单一实现；
 * 5. 状态栏高度 24 / 字号 12 由宿主容器提供（跨文件不变量，防止后续改动漂移）；
 * 6. 键盘可达语义属性（menubar/menu/menuitem/separator、aria-expanded/haspopup）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(__dirname, '../..')
const RENDERER = path.join(ROOT, 'src', 'renderer', 'src', 'components')

/** B2 组写域内的全部实现文件 */
const SOURCE_FILES = {
    menuBar: path.join(RENDERER, 'MenuBar.vue'),
    menuSubmenu: path.join(RENDERER, 'MenuBar', 'MenuSubmenu.vue'),
    menuSubmenuItem: path.join(RENDERER, 'MenuBar', 'MenuSubmenuItem.vue'),
    commandPalette: path.join(RENDERER, 'search', 'CommandPalette.vue'),
    workspaceSearch: path.join(RENDERER, 'search', 'WorkspaceSearchDialog.vue'),
    statusBar: path.join(RENDERER, 'StatusBar.vue'),
    emptyState: path.join(RENDERER, 'common', 'ui', 'EmptyState.vue')
} as const

/** 每个区域必须消费的令牌（缺任意一个 → 四风格/三密度在该区域失真） */
const REQUIRED_TOKENS: Record<keyof typeof SOURCE_FILES, readonly string[]> = {
    // 菜单栏：密度（行高/内边距/字号/控件高）、材质（圆角/阴影/玻璃透明度与模糊/高光边）、
    // 颜色（悬停软底）、焦点环、下拉层级、动效节奏
    menuBar: [
        '--ui-row-height',
        '--ui-control-height',
        '--ui-pad',
        '--ui-font-size',
        '--ui-radius-sm',
        '--ui-accent-soft',
        '--ui-accent',
        '--ui-text',
        '--ui-bg',
        '--ui-focus-shadow',
        '--ui-z-dropdown',
        '--ui-duration-fast',
        '--ui-duration-pop',
        '--ui-ease-standard'
    ],
    menuSubmenu: [
        '--ui-surface',
        '--ui-surface-opacity',
        '--ui-surface-blur',
        '--ui-highlight-border-alpha',
        '--ui-radius-lg',
        '--ui-shadow-2',
        '--ui-border',
        '--ui-hairline-width',
        '--ui-z-dropdown',
        '--ui-duration-pop'
    ],
    menuSubmenuItem: [
        '--ui-row-height',
        '--ui-pad',
        '--ui-font-size',
        '--ui-radius-sm',
        '--ui-accent-soft',
        '--ui-accent',
        '--ui-text',
        '--ui-text-tertiary',
        '--ui-focus-shadow',
        '--ui-duration-fast'
    ],
    // 命令面板：外壳（圆角/阴影/透明度/模糊/高光边）、行高/内边距/字号、选中软底+强调条、
    // chip 圆角与 hairline、空态、动效
    commandPalette: [
        '--ui-radius-lg',
        '--ui-shadow-3',
        '--ui-surface-opacity',
        '--ui-surface-blur',
        '--ui-highlight-border-alpha',
        '--ui-control-height',
        '--ui-pad',
        '--ui-font-size',
        '--ui-accent-soft',
        '--ui-accent',
        '--ui-text-tertiary',
        '--ui-text-secondary',
        '--ui-radius-sm',
        '--ui-border',
        '--ui-hairline-width',
        '--ui-bg-sunken',
        '--ui-bg-elevated',
        '--ui-danger',
        '--ui-duration-fast',
        '--ui-ease-standard'
    ],
    // 工作区搜索对话框（T11 空态替换点）：错误色/空态容器
    workspaceSearch: ['--ui-danger'],
    // 状态栏：文字 secondary、hairline 分隔、状态语义色（danger 点）、焦点环、动效
    statusBar: [
        '--ui-text-secondary',
        '--ui-border',
        '--ui-hairline-width',
        '--ui-danger',
        '--ui-success',
        '--ui-warning',
        '--ui-info',
        '--ui-accent-soft',
        '--ui-accent',
        '--ui-bg-elevated',
        '--ui-radius-sm',
        '--ui-radius-lg',
        '--ui-shadow-2',
        '--ui-focus-shadow',
        '--ui-z-dropdown',
        '--ui-duration-fast'
    ],
    // 空态：主标题/描述/主按钮三档颜色 + 焦点/动效
    emptyState: [
        '--ui-text',
        '--ui-text-secondary',
        '--ui-text-tertiary',
        '--ui-accent',
        '--ui-accent-hover',
        '--ui-control-height',
        '--ui-radius-md',
        '--ui-font-size',
        '--ui-focus-shadow',
        '--ui-duration-fast'
    ]
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

/** 去掉所有 var(...) 表达式（含嵌套），用于检测 var 兜底之外的硬编码色值 */
function stripCssVariableExpressions(source: string): string {
    let result = source
    // 嵌套 var() 从内向外剥离：每轮删除最内层不含 var( 的括号表达式
    for (let round = 0; round < 20; round += 1) {
        const next = result.replace(/var\([^()]*\)/g, '')
        if (next === result) {
            break
        }
        result = next
    }
    return result
}

describe('B2 组件令牌消费契约（四风格 × 三密度）', () => {
    for (const key of Object.keys(SOURCE_FILES) as Array<keyof typeof SOURCE_FILES>) {
        it(`${key} 消费全部必需 --ui-* 令牌`, () => {
            const source = readSource(SOURCE_FILES[key])
            const missing = REQUIRED_TOKENS[key].filter((token) => !source.includes(token))
            expect(missing).toEqual([])
        })
    }

    it('组件内不得写 data-style / data-density 分支（唯一入口 useTheme）', () => {
        for (const file of Object.values(SOURCE_FILES)) {
            // 属性赋值形式的 style/density 分支，例如 `[data-style='paper']` / `data-density=`
            const source = stripComments(readSource(file))
            expect(source).not.toMatch(/data-(style|density)\s*[=\]]/)
            expect(source).not.toContain('dataset.style')
            expect(source).not.toContain('dataset.density')
        }
    })

    it('组件内不得新增硬编码主题色（var 兜底值除外）', () => {
        for (const [key, file] of Object.entries(SOURCE_FILES)) {
            const source = stripCssVariableExpressions(stripComments(readSource(file)))
            const hexColors = source.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []
            // EmptyState 主按钮兜底的 #fff 位于 var(--button-text-color, #fff) 内，已被剥离
            expect(hexColors, `${key} 存在硬编码色值: ${hexColors.join(', ')}`).toEqual([])
        }
    })

    it('胶囊圆角只允许 999px 字面量（DESIGN.md §5.2）', () => {
        // WorkspaceSearchDialog 的输入框/结果区样式属既有实现（本批只接入空态与错误色），
        // 圆角迁移留待 T15 硬编码清理批次；其余 B2 主区域必须全部使用圆角令牌。
        const fullyTokenizedFiles = Object.entries(SOURCE_FILES).filter(
            ([key]) => key !== 'workspaceSearch'
        )
        for (const [key, file] of fullyTokenizedFiles) {
            const source = stripComments(readSource(file))
            const radiusLiterals = source.match(/border-radius:\s*([^;]+);/g) ?? []
            for (const declaration of radiusLiterals) {
                expect(declaration, `${key} 存在非令牌圆角: ${declaration}`).toMatch(
                    /var\(--ui-radius-|999px/
                )
            }
        }
    })
})

describe('菜单栏尺寸/可访问性契约', () => {
    it('菜单栏壳高度 = 控件高令牌 + 4px（32 / 36 / 40 三档密度）', () => {
        const source = readSource(SOURCE_FILES.menuBar)
        expect(source).toContain('#menu-bar {')
        expect(source).toMatch(/height:\s*calc\(var\(--ui-control-height,\s*32px\)\s*\+\s*4px\)/)
    })

    it('渲染 menubar/menu/menuitem/separator 语义与展开状态属性', () => {
        const menuBar = readSource(SOURCE_FILES.menuBar)
        const submenu = readSource(SOURCE_FILES.menuSubmenu)
        const submenuItem = readSource(SOURCE_FILES.menuSubmenuItem)
        expect(menuBar).toContain('role="menubar"')
        expect(menuBar).toContain('aria-orientation="horizontal"')
        expect(menuBar).toContain(':aria-label="menubarAriaLabel"')
        expect(submenu).toContain('role="menu"')
        expect(submenu).toContain('role="separator"')
        expect(submenuItem).toContain('role="menuitem"')
        expect(submenuItem).toContain('aria-haspopup')
        expect(submenuItem).toContain('aria-expanded')
        expect(submenuItem).toContain('aria-disabled')
    })

    it('菜单动作分发机制未被改动（仍复用 HandleMenuAction 单链路，MENU-13）', () => {
        const submenu = readSource(SOURCE_FILES.menuSubmenu)
        expect(submenu).toContain("import { HandleMenuAction } from './menu-actions'")
        // 菜单数据仍只消费 labelKey / menuAction（不新增中文字面量菜单数据）
        const menuBar = readSource(SOURCE_FILES.menuBar)
        expect(menuBar).toContain('menu.labelKey ? t(menu.labelKey) : menu.label')
        // 数据源仍来自 menu-config 静态真源
        expect(menuBar).toContain("from './MenuBar/menu-config'")
    })
})

describe('状态栏 / 空态契约', () => {
    it('状态栏高度 24 / 字号 12 由宿主容器提供（跨文件不变量）', () => {
        const host = readSource(path.join(RENDERER, 'BaiZeNotes.vue'))
        const statusBarBlock = host.match(/\.status-bar\s*\{[\s\S]*?\}/)?.[0] ?? ''
        expect(statusBarBlock).toContain('height: 24px')
        expect(statusBarBlock).toContain('font-size: 12px')
        // 状态栏组件自身消费 secondary 文字令牌 + hairline 分隔
        const statusBar = readSource(SOURCE_FILES.statusBar)
        expect(statusBar).toContain('color: var(--ui-text-secondary')
        expect(statusBar).toContain('background-color: var(--ui-border')
    })

    it('错误状态使用 danger 点 + 可点击详情（弹层 aria 契约）', () => {
        const statusBar = readSource(SOURCE_FILES.statusBar)
        expect(statusBar).toContain('class="console-dot"')
        expect(statusBar).toContain('const isErrorConsole = computed')
        expect(statusBar).toContain('aria-haspopup="dialog"')
        expect(statusBar).toContain('role="dialog"')
        expect(statusBar).toContain('background-color: var(--ui-danger')
    })

    it('空态统一组件覆盖 6 变体且主标题/描述/主按钮使用规定字号色令牌', () => {
        const variants = readSource(path.join(RENDERER, 'common', 'ui', 'empty-state-variants.ts'))
        for (const variant of [
            'empty-file',
            'no-search',
            'no-tags',
            'no-attachments',
            'no-annotations',
            'not-enabled'
        ]) {
            expect(variants).toContain(`'${variant}'`)
        }
        const emptyState = readSource(SOURCE_FILES.emptyState)
        expect(emptyState).toMatch(/font-size:\s*15px/)
        expect(emptyState).toMatch(/font-size:\s*13px/)
        expect(emptyState).toContain('stroke-width="1.5"')
        expect(emptyState).toContain('viewBox="0 0 24 24"')
        expect(emptyState).toContain('background: var(--ui-accent')
    })

    it('空态首批替换点（命令面板 / 工作区搜索）已接入统一组件', () => {
        expect(readSource(SOURCE_FILES.commandPalette)).toContain(
            "from '../common/ui/EmptyState.vue'"
        )
        expect(readSource(SOURCE_FILES.workspaceSearch)).toContain(
            "from '../common/ui/EmptyState.vue'"
        )
    })
})

describe('命令面板视觉契约', () => {
    it('外壳宽度 720 + 圆角/阴影/透明度令牌通过 containerStyle 写入', () => {
        const palette = readSource(SOURCE_FILES.commandPalette)
        expect(palette).toContain('width="720px"')
        expect(palette).toContain("borderRadius: 'var(--ui-radius-lg")
        expect(palette).toContain('var(--ui-shadow-3)')
        expect(palette).toContain('--ui-surface-opacity')
        expect(palette).toContain('--ui-surface-blur')
    })

    it('快捷键 chip 来自菜单树真源（不新增键位表）', () => {
        const palette = readSource(SOURCE_FILES.commandPalette)
        expect(palette).toContain("from './command-shortcuts'")
        expect(palette).toContain('buildCommandAcceleratorMap')
        expect(palette).toContain('aria-keyshortcuts')
        const shortcuts = readSource(path.join(RENDERER, 'search', 'command-shortcuts.ts'))
        expect(shortcuts).toContain("from '../MenuBar/menu-config'")
    })
})
