// @vitest-environment node
/**
 * 对话框底部按钮统一样式层契约测试（对话框按钮统一样式批次）
 *
 * 背景：25 个用户对话框都复用 BaseDialog.vue 外壳，但迁移前每个对话框各自在 scoped
 * 样式里复制 `.btn` / `.btn-*` 规则，已分叉出 30px+4px 与 44px+6px 两派尺寸、三种
 * 危险色/强调色写法。本批次新增全局 `src/renderer/src/assets/dialog-buttons.css` 作为
 * 唯一视觉真源，并把所有对话框底部/正文操作按钮迁移为 `dialog-btn dialog-btn--*`。
 *
 * 本文件锁定（TEST-03 / TEST-09 / TEST-16：契约 + 自检）：
 * 1. 共享样式层存在且被渲染层入口唯一引入（在 theme.css 之后，级联顺序正确）；
 * 2. 基础按钮视觉契约（高 30px / 水平 padding 16px / 圆角 4px / 1px 边框 / 13px 字号 /
 *    all 0.2s ease / focus-visible 强调色轮廓 / disabled 视觉）；
 * 3. 五个语义变体齐全（primary / secondary / danger / ghost / apply）；
 * 4. 全部规则限定在 `.dialog-container` 作用域内，避免影响非对话框 `.btn`；
 * 5. 颜色一律走主题变量（无写死主题色，唯一例外是集中收敛的破坏性语义色变量）；
 * 6. 迁移完整性：23 个含操作按钮的对话框组件全部使用统一类名，且各对话框/.css 中
 *    不再残留重复的 `.btn` / `.btn-*` 基础样式块；无按钮的 2 个对话框不做强制；
 * 7. 兼容层：E2E（settings-persistence / close-confirm / theme-first-open）与既有单测
 *    依赖的 `.btn-confirm` / `.btn-cancel` / `.btn-save` / `.btn-discard` 等旧 class
 *    必须保留在选择器锚点上（优先保留兼容类，不改 E2E）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

const ROOT = path.resolve(__dirname, '../../..')
const RENDERER_SRC = path.join(ROOT, 'src', 'renderer', 'src')
const DIALOGS_DIR = path.join(RENDERER_SRC, 'components', 'dialogs')
const DIALOG_BUTTONS_CSS = path.join(RENDERER_SRC, 'assets', 'dialog-buttons.css')
const MAIN_TS = path.join(RENDERER_SRC, 'main.ts')

/** 读取 UTF-8 源码 */
function readSource(file: string): string {
    return fs.readFileSync(file, 'utf-8')
}

/** 去掉 CSS 注释，避免注释内容被选择器/声明断言误命中 */
function stripCssComments(source: string): string {
    return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

/** 去掉 Vue 单文件组件中的 <style> 与 <script> 块，只保留模板 */
function templateOnly(source: string): string {
    return source.slice(0, source.indexOf('<script')).split('<style')[0]
}

/** 去掉 Vue/JS 注释（用于扫描样式声明；HTML 注释与 JS 注释均不影响选择器判断） */
function stripJsComments(source: string): string {
    return source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

interface CssRule {
    selector: string
    declarations: string
}

/** 极简 CSS 规则解析（本仓库对话框样式无嵌套语法，扁平 `selector { decls }` 足够） */
function parseCssRules(source: string): CssRule[] {
    const rules: CssRule[] = []
    const pattern = /([^{}]+)\{([^{}]*)\}/g
    for (const match of stripCssComments(source).matchAll(pattern)) {
        rules.push({ selector: match[1].trim(), declarations: match[2].trim() })
    }
    return rules
}

/** 取某条规则中指定声明的值（最后一个同名声明，符合 CSS 级联） */
function declarationValue(declarations: string, property: string): string | undefined {
    const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'g')
    const values = [...declarations.matchAll(pattern)].map((match) => match[1].trim())
    return values.at(-1)
}

/** 递归收集目录下指定扩展名的文件（相对 DIALOGS_DIR） */
function collectFiles(dir: string, extensions: string[]): string[] {
    const files: string[] = []
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            files.push(...collectFiles(full, extensions))
        } else if (extensions.some((extension) => entry.name.endsWith(extension))) {
            files.push(full)
        }
    }
    return files
}

/** 直接或间接复用 BaseDialog 外壳的对话框组件（相对 DIALOGS_DIR，统一正斜杠） */
const DIALOG_FILES = [
    'simple/WebUrlDialog.vue',
    'simple/RenameFileFolderDialog.vue',
    'simple/CreateFileFolderDialog.vue',
    'simple/ConfirmDeleteDialog.vue',
    'simple/MessageDialog.vue',
    'simple/AppMessageDialog.vue',
    'simple/UnsavedChangesDialog.vue',
    'medium/ImportOptionDialog.vue',
    'medium/AdmonitionDialog.vue',
    'medium/InsertImageDialog.vue',
    'medium/MathTextDialog.vue',
    'medium/MdSheetDialog.vue',
    'complex/FontSelectDialog.vue',
    'complex/MaterialSyntaxDialog.vue',
    'complex/MermaidEditDialog.vue',
    'complex/EditorSettingDialog.vue',
    'complex/ThemeSettingDialog.vue',
    'complex/SystemSettingDialog.vue',
    'help/HelpContactUsDialog.vue',
    'help/QuickLinkSettingDialog.vue',
    'help/ReleaseNotesDialog.vue',
    'help/ShortcutKeysDialog.vue',
    'help/UpdateLogDialog.vue'
]

/** 确实没有任何操作按钮的对话框（底栏是链接/说明文案，不强制统一按钮类） */
const DIALOG_FILES_WITHOUT_ACTION_BUTTONS = ['help/HelpAboutDialog.vue', 'help/TechStackDialog.vue']

/** 按钮 class 由函数动态生成（`:class="buttonClass(button)"`），由单独用例断言函数输出 */
const DIALOG_FILES_WITH_DYNAMIC_BUTTON_CLASS = ['simple/AppMessageDialog.vue']

/** 对话框正文内的局部按钮（工具栏/页签/颜色块/输入区浏览/列表行内操作），不属于底栏统一范围 */
const LOCAL_BUTTON_CLASSES = new Set([
    'close-btn',
    'tool-btn',
    'tab-btn',
    'browse-btn',
    'font-style-btn',
    'color-btn',
    'feature-item',
    'add-btn',
    'action-btn',
    'panel-retry-btn',
    'btn-select-path'
])

/** 各对话框模板中的按钮 class（静态 class 属性）必须含统一基础类与语义变体类 */
function staticButtonClasses(source: string): string[] {
    const template = templateOnly(source)
    const classes: string[] = []
    for (const match of template.matchAll(/<button\b[^>]*>/g)) {
        const classMatch = match[0].match(/\sclass="([^"]*)"/)
        if (classMatch) classes.push(classMatch[1].trim())
    }
    return classes
}

/** 旧按钮 class 选择器集合：迁移后不得再在任何对话框样式块中定义（只允许作为模板兼容 class） */
const LEGACY_BUTTON_SELECTORS = new Set([
    '.btn',
    '.btn-cancel',
    '.btn-confirm',
    '.btn-primary',
    '.btn-danger',
    '.btn-insert',
    '.btn-close',
    '.btn-apply',
    '.btn-save',
    '.btn-discard',
    '.btn-create-file',
    '.btn-create-folder'
])

// =============================================================================================
// 1. 共享样式层存在性 / 唯一引入 / 级联顺序
// =============================================================================================
describe('对话框按钮统一样式层：文件与引入', () => {
    it('共享样式文件存在于 assets/ 下，且被 main.ts 唯一引入一次（在 theme.css 之后）', () => {
        expect(fs.existsSync(DIALOG_BUTTONS_CSS)).toBe(true)

        const mainSource = readSource(MAIN_TS)
        const importPattern = /^\s*import\s+['"][^'"]*dialog-buttons\.css['"]/gm
        const imports = [...mainSource.matchAll(importPattern)]
        expect(imports, 'main.ts 中 dialog-buttons.css 必须恰好引入一次').toHaveLength(1)

        // 级联顺序：dialog-buttons.css 必须在 theme.css 之后，才能用 0,2,0 选择器
        // 覆盖 theme.css 中全局 button 基础声明（0,0,1）
        const dialogButtonsIndex = mainSource.indexOf("import './assets/dialog-buttons.css'")
        const themeIndex = mainSource.indexOf("import './styles/theme.css'")
        expect(dialogButtonsIndex).toBeGreaterThan(themeIndex)
    })

    it('共享样式由全仓唯一一处引入（不再有组件级 @import 局部按钮样式文件）', () => {
        const rendererFiles = collectFiles(RENDERER_SRC, ['.ts', '.vue', '.css'])
        const importPattern = /(?:@?import)\s+['"][^'"]*dialog-buttons\.css['"]/
        const referencing = rendererFiles
            .filter((file) => importPattern.test(readSource(file)))
            .map((file) => path.relative(ROOT, file).replace(/\\/g, '/'))
        expect(referencing).toEqual(['src/renderer/src/main.ts'])
    })

    it('迁移前的局部 dialog-buttons.css 副本已删除（避免二套按钮样式真源）', () => {
        const legacyCopy = path.join(
            DIALOGS_DIR,
            'help',
            'quick-link-setting',
            'dialog-buttons.css'
        )
        expect(fs.existsSync(legacyCopy)).toBe(false)
    })
})

// =============================================================================================
// 2. 基础按钮视觉契约 + 语义变体 + 作用域 + 主题变量
// =============================================================================================
describe('对话框按钮统一样式层：视觉契约', () => {
    const cssSource = readSource(DIALOG_BUTTONS_CSS)
    const rules = parseCssRules(cssSource)

    /** 按选择器文本查找规则（精确匹配选择器全文） */
    function findRule(selector: string): CssRule | undefined {
        return rules.find((rule) => rule.selector === selector)
    }

    it('基础按钮尺寸/排版：30px 高、0 16px 内边距、4px 圆角、1px 边框、13px 字号、all 0.2s ease', () => {
        const base = findRule('.dialog-container .dialog-btn')
        expect(base, '缺少基础按钮规则 .dialog-container .dialog-btn').toBeDefined()
        expect(declarationValue(base!.declarations, 'height')).toBe('30px')
        expect(declarationValue(base!.declarations, 'padding')).toBe('0 16px')
        expect(declarationValue(base!.declarations, 'border-radius')).toBe('4px')
        expect(declarationValue(base!.declarations, 'border')).toMatch(/^1px solid /)
        expect(declarationValue(base!.declarations, 'font-size')).toBe('13px')
        expect(declarationValue(base!.declarations, 'transition')).toBe('all 0.2s ease')
    })

    it('交互状态：hover 反馈、disabled 视觉、focus-visible 强调色轮廓（UI-10）', () => {
        const hover = findRule('.dialog-container .dialog-btn:hover:not(:disabled)')
        expect(hover, '缺少基础按钮 hover 规则').toBeDefined()
        expect(hover!.declarations.length).toBeGreaterThan(0)

        const disabled = findRule('.dialog-container .dialog-btn:disabled')
        expect(disabled, '缺少按钮 disabled 规则').toBeDefined()
        expect(declarationValue(disabled!.declarations, 'cursor')).toBe('not-allowed')

        const focus = rules.find((rule) => rule.selector.includes('.dialog-btn:focus-visible'))
        expect(focus, '缺少 focus-visible 规则').toBeDefined()
        expect(focus!.selector).toContain('.dialog-container')
        expect(declarationValue(focus!.declarations, 'outline')).toContain('var(--accent-color)')
    })

    it('语义变体齐全：primary / secondary / danger / ghost / apply（含 hover 态）', () => {
        const variants = ['primary', 'secondary', 'danger', 'ghost', 'apply']
        for (const variant of variants) {
            const selector = `.dialog-container .dialog-btn--${variant}`
            const rule = findRule(selector)
            expect(rule, `缺少语义变体 ${selector}`).toBeDefined()
            expect(rule!.declarations.length).toBeGreaterThan(0)
            const hover = findRule(`${selector}:hover:not(:disabled)`)
            expect(hover, `缺少语义变体 hover ${selector}:hover:not(:disabled)`).toBeDefined()
        }

        // primary 用主题强调色 + 按钮文字主题色；danger 用集中收敛的破坏性语义色变量
        expect(findRule('.dialog-container .dialog-btn--primary')!.declarations).toContain(
            'var(--accent-color)'
        )
        expect(findRule('.dialog-container .dialog-btn--danger')!.declarations).toContain(
            'var(--dialog-btn-danger-bg)'
        )
        // 破坏性语义色只有一个真源：定义在 .dialog-container 上的自定义属性
        const dangerVariable = findRule('.dialog-container')
        expect(dangerVariable, '缺少 .dialog-container 自定义属性规则').toBeDefined()
        expect(dangerVariable!.declarations).toContain('--dialog-btn-danger-bg')
    })

    it('作用域限定：所有 dialog-btn 规则都以 .dialog-container 开头，不污染非对话框 .btn', () => {
        const buttonRules = rules.filter((rule) => rule.selector.includes('.dialog-btn'))
        expect(buttonRules.length).toBeGreaterThan(0)
        for (const rule of buttonRules) {
            const selectors = rule.selector.split(',').map((selector) => selector.trim())
            for (const selector of selectors) {
                expect(
                    selector.startsWith('.dialog-container'),
                    `选择器未限定在对话框容器内：${selector}`
                ).toBe(true)
            }
        }
    })

    it('颜色契约：视觉属性走主题变量（无写死主题色），危险色为唯一集中例外', () => {
        const colorProperties = ['background', 'background-color', 'color', 'border-color']
        const buttonRules = rules.filter((rule) => rule.selector.includes('.dialog-btn'))
        for (const rule of buttonRules) {
            for (const property of colorProperties) {
                const value = declarationValue(rule.declarations, property)
                if (value === undefined) continue
                expect(
                    /^(var\(|transparent$|none$|inherit$)/.test(value),
                    `${rule.selector} 的 ${property} 必须使用主题变量，实际为 ${value}`
                ).toBe(true)
            }
            const border = declarationValue(rule.declarations, 'border')
            if (border !== undefined) {
                expect(
                    /^(1px solid (?:var\(|transparent)|none$)/.test(border),
                    `${rule.selector} 的 border 必须使用主题变量，实际为 ${border}`
                ).toBe(true)
            }
        }
        // 唯一允许的直写色值：集中定义的破坏性语义色（主题调色板无对应字段，沿用既有 #e74c3c）
        expect(cssSource).toContain('--dialog-btn-danger-bg: #e74c3c')
        expect(cssSource).not.toContain('--accent-color: #')
        expect(cssSource).not.toContain('#764ba2')
    })
})

// =============================================================================================
// 3. 迁移完整性：统一类名 / 无重复 .btn 基础样式 / 语义变体使用
// =============================================================================================
describe('对话框按钮迁移完整性', () => {
    it('23 个含操作按钮的对话框全部使用统一类名 dialog-btn + dialog-btn--*', () => {
        for (const relative of DIALOG_FILES) {
            const source = readSource(path.join(DIALOGS_DIR, relative))
            expect(source.includes('dialog-btn'), `${relative} 未使用统一按钮类 dialog-btn`).toBe(
                true
            )
            if (DIALOG_FILES_WITH_DYNAMIC_BUTTON_CLASS.includes(relative)) {
                continue
            }
            const classes = staticButtonClasses(source)
            // 正文局部按钮（如 CreateFileFolderDialog 的 .btn-select-path 输入区浏览按钮）不属统一范围
            const actionClasses = classes.filter((classValue) => {
                const tokens = classValue.split(/\s+/)
                return !tokens.every((token) => LOCAL_BUTTON_CLASSES.has(token))
            })
            expect(actionClasses.length, `${relative} 应有操作按钮`).toBeGreaterThan(0)
            for (const classValue of actionClasses) {
                expect(
                    classValue.includes('dialog-btn'),
                    `${relative} 的按钮 class 缺少 dialog-btn：${classValue}`
                ).toBe(true)
                expect(
                    /dialog-btn--(primary|secondary|danger|ghost|apply)/.test(classValue),
                    `${relative} 的按钮 class 缺少语义变体：${classValue}`
                ).toBe(true)
            }
        }
    })

    it('无操作按钮的对话框（HelpAbout / TechStack）不出现按钮统一类（底栏为链接/说明）', () => {
        for (const relative of DIALOG_FILES_WITHOUT_ACTION_BUTTONS) {
            const source = readSource(path.join(DIALOGS_DIR, relative))
            expect(source.includes('dialog-btn')).toBe(false)
        }
    })

    it('AppMessageDialog 动态按钮 class 同样输出统一类与语义变体', () => {
        const source = readSource(path.join(DIALOGS_DIR, 'simple', 'AppMessageDialog.vue'))
        const script = source.slice(source.indexOf('<script'), source.indexOf('<style'))
        expect(script).toContain("'dialog-btn'")
        expect(script).toContain("'dialog-btn--primary'")
        expect(script).toContain("'dialog-btn--danger'")
        expect(script).toContain("'dialog-btn--secondary'")
    })

    it('对话框模板中除局部按钮（工具栏/页签/浏览/列表行内）外的按钮不再使用旧 btn 选择器链', () => {
        for (const relative of [...DIALOG_FILES, ...DIALOG_FILES_WITHOUT_ACTION_BUTTONS]) {
            const source = readSource(path.join(DIALOGS_DIR, relative))
            for (const classValue of staticButtonClasses(source)) {
                const tokens = classValue.split(/\s+/)
                const hasUnified = tokens.includes('dialog-btn')
                const isLocalButton = tokens.some((token) => LOCAL_BUTTON_CLASSES.has(token))
                if (!hasUnified && !isLocalButton) {
                    // 只允许 BaseDialog 标题栏关闭按钮等外壳按钮（不在对话框组件模板中）
                    throw new Error(`${relative} 存在未统一且非局部的按钮 class：${classValue}`)
                }
            }
        }
    })

    it('对话框目录内不再定义重复的 .btn / .btn-* 基础样式块（.css 与 .vue 一并扫描）', () => {
        const styleFiles = collectFiles(DIALOGS_DIR, ['.vue', '.css'])
        const offenders: string[] = []
        for (const file of styleFiles) {
            const source = stripJsComments(readSource(file))
            for (const rule of parseCssRules(source)) {
                for (const selector of rule.selector.split(',')) {
                    const normalized = selector.trim().replace(/\[data-v-[^\]]+\]/g, '')
                    if (LEGACY_BUTTON_SELECTORS.has(normalized)) {
                        offenders.push(
                            `${path.relative(ROOT, file).replace(/\\/g, '/')} → ${normalized}`
                        )
                    }
                }
            }
        }
        expect(offenders, '以下文件仍在定义重复按钮样式').toEqual([])
    })

    it('渲染层主界面注入的「重试」按钮也纳入统一层（BaiZeNotes.vue）', () => {
        const source = readSource(path.join(RENDERER_SRC, 'components', 'BaiZeNotes.vue'))
        expect(source).toContain('dialog-btn--secondary')
        expect(source).toContain('btn-message-retry')
        // 旧按钮样式块已删除，不再在宿主组件重复定义按钮视觉
        expect(stripJsComments(source)).not.toMatch(/\.btn-message-retry\s*\{/)
    })
})

// =============================================================================================
// 4. 兼容层：E2E / 既有单测选择器锚点不得丢失（优先保留兼容类，不改 E2E）
// =============================================================================================
describe('对话框按钮兼容选择器锚点', () => {
    /** E2E/单测实际依赖的旧 class → 必须保留该 class 的对话框文件 */
    const COMPAT_ANCHORS: Array<{ file: string; classes: string[] }> = [
        // e2e/settings-persistence.spec.ts: const DIALOG_CONFIRM_SELECTOR = 'button.btn-confirm'
        { file: 'complex/SystemSettingDialog.vue', classes: ['btn-confirm', 'btn-cancel'] },
        { file: 'complex/EditorSettingDialog.vue', classes: ['btn-confirm'] },
        { file: 'complex/ThemeSettingDialog.vue', classes: ['btn-cancel', 'btn-confirm'] },
        // e2e/close-confirm.spec.ts: .btn-save / .btn-discard / .btn-cancel（含 activeElement 断言）
        {
            file: 'simple/UnsavedChangesDialog.vue',
            classes: ['btn-save', 'btn-discard', 'btn-cancel']
        },
        // 壳层测试（c2/c4）：MaterialSyntax .btn-insert、Mermaid .btn-primary、设置组 .btn-apply
        { file: 'complex/MaterialSyntaxDialog.vue', classes: ['btn-cancel', 'btn-insert'] },
        { file: 'complex/MermaidEditDialog.vue', classes: ['btn-cancel', 'btn-primary'] },
        { file: 'complex/FontSelectDialog.vue', classes: ['btn-insert', 'btn-confirm'] },
        // 既有组件测试：危险/创建/URL/关闭等选择器
        { file: 'simple/ConfirmDeleteDialog.vue', classes: ['btn-cancel', 'btn-danger'] },
        {
            file: 'simple/CreateFileFolderDialog.vue',
            classes: ['btn-create-file', 'btn-create-folder', 'btn-select-path']
        },
        { file: 'simple/WebUrlDialog.vue', classes: ['btn-cancel', 'btn-confirm'] },
        { file: 'simple/MessageDialog.vue', classes: ['btn-confirm'] },
        { file: 'help/ReleaseNotesDialog.vue', classes: ['btn-close'] },
        { file: 'medium/ImportOptionDialog.vue', classes: ['btn-cancel', 'btn-confirm'] }
    ]

    it.each(COMPAT_ANCHORS)('$file 保留兼容 class：$classes', ({ file, classes }) => {
        const source = readSource(path.join(DIALOGS_DIR, file))
        for (const legacyClass of classes) {
            expect(source, `${file} 丢失兼容 class ${legacyClass}`).toContain(legacyClass)
        }
    })

    it('自检：兼容锚点确实被 E2E/单测引用（防止清单空转）', () => {
        const e2eSettings = readSource(path.join(ROOT, 'e2e', 'settings-persistence.spec.ts'))
        expect(e2eSettings).toContain('button.btn-confirm')
        expect(e2eSettings).toContain('button.btn-cancel')

        const e2eCloseConfirm = readSource(path.join(ROOT, 'e2e', 'close-confirm.spec.ts'))
        for (const legacyClass of ['.btn-save', '.btn-discard', '.btn-cancel']) {
            expect(e2eCloseConfirm).toContain(legacyClass)
        }

        const e2eThemeFirstOpen = readSource(path.join(ROOT, 'e2e', 'theme-first-open.spec.ts'))
        expect(e2eThemeFirstOpen).toContain('.btn-cancel')
    })

    it('自检：旧 `.btn` 基础样式确已删除（构造目标文件断言扫描口径有效）', () => {
        // 正例：迁移完成的文件不再命中重复按钮样式选择器
        const migrated = stripJsComments(
            readSource(path.join(DIALOGS_DIR, 'simple', 'ConfirmDeleteDialog.vue'))
        )
        expect(migrated).not.toMatch(/\.btn\s*\{/)
        // 反例自检：class 兼容锚点仍存在于模板（说明「删样式不删 class」的口径一致）
        expect(migrated).toContain('btn btn-cancel')
        expect(migrated).toContain('btn btn-danger')
    })
})
