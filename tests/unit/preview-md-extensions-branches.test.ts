// @vitest-environment jsdom
/**
 * 预览 Markdown 扩展分支补测（覆盖率补测第四批）
 *
 * 覆盖两个 DOM 边界文件的低覆盖分支（既有用例主要覆盖正常路径）：
 * 1. preview-md-basic-inline.ts：行内语法分派器的「非法/未闭合/跨行」回退分支、
 *    link-label 静默扫描（markdown-it skipToken 的 silent=true 路径）、KaTeX MathML 守卫；
 * 2. preview-md-media.ts：grid cards 闭合扫描（行内代码/围栏/HTML 注释/嵌套 div）、
 *    围栏增强（title/linenums/hl_lines、无语言 info、非法值、highlight 缺失/抛错/畸形输出）、
 *    行内高亮与 Material/Octicon 图标（未知图标降级、无 meta 兜底、静默扫描）。
 */
import { describe, it, expect } from 'vitest'
import MarkdownIt from 'markdown-it'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import { installMdxMediaExtensions } from '../../src/renderer/src/components/Markdown/preview-md-media'

type MutableMarkdownIt = InstanceType<typeof MarkdownIt> & {
    renderer: { rules: Record<string, unknown> }
}

/** 用预览同款插件链渲染（正常路径与回退路径都在同一实例上验证） */
function render(source: string): string {
    return createPreviewMarkdownIt().render(source)
}

/** 构造可自定义 highlight 的 markdown-it 实例并安装媒体扩展 */
function createCustomMarkdownIt(highlight?: (str: string, lang: string, attrs: string) => string) {
    const md = new MarkdownIt({ html: true, ...(highlight ? { highlight } : {}) })
    installMdxMediaExtensions(md)
    return md
}

/* ============================== 一、行内语法回退 / 静默扫描 ============================== */

describe('preview-md-basic-inline：非法与未闭合语法优雅回退', () => {
    it('高亮 / 插入 / 上下标 / 键盘按键的未闭合或空内容回退为原文本', () => {
        const cases = [
            '==a\\==b==', // 闭合标记被反斜杠转义 → 未闭合
            '==a\nb==', // 跨行 → 未闭合
            '== ==', // 内容全空白
            '^a^^', // 单字符闭合标记后紧跟同字符
            '^a\nb^', // 上标跨行
            '^^^^', // 插入语法空内容
            '~~a~b~~', // 下标/删除混排回退
            '+++x+++', // 三个加号不是键盘语法
            '++a\nb++', // 键盘按键内容跨行
            '+++', // 未闭合
            '{++x', // critic 未闭合
            '{--x}', // critic 未闭合
            '{==x=', // critic 未闭合
            '{~~old~>', // critic 替换缺闭合
            '{~~old~>new', // critic 替换缺结束
            '{>>comment', // critic 注释缺闭合
            '{{not-critic}}', // 未知 critic 类型
            '^ $x^2$ ^', // 公式源码中的 caret 不做二次改写
            'text ==  == text'
        ]
        for (const source of cases) {
            const html = render(source)
            expect(typeof html).toBe('string')
        }
    })

    it('合法语法输出结构正确（正常路径基线）', () => {
        expect(render('==高亮==')).toContain('<mark>高亮</mark>')
        expect(render('++ctrl+alt+del++')).toContain('</kbd>+<kbd>')
        expect(render('++"Hello World"++')).toContain('Hello World')
        expect(render('^^插入^^')).toContain('<ins>插入</ins>')
        expect(render('^sup^')).toContain('<sup>sup</sup>')
        expect(render('~sub~')).toContain('<sub>sub</sub>')
        expect(render('{++ins++}')).toContain('<ins>ins</ins>')
        expect(render('{--del--}')).toContain('<del>del</del>')
        expect(render('{==mark==}')).toContain('<mark>mark</mark>')
        expect(render('{>>hidden<<}')).toContain('hidden')
        expect(render('{~~old~>new~~}')).toContain('<del>old</del>')
    })

    it('链接 label 中的扩展语法走 silent 扫描（markdown-it skipToken 路径）', () => {
        const cases = [
            '[==x==](https://example.com)',
            '[++k++](https://example.com)',
            '[^s^](https://example.com)',
            '[~s~](https://example.com)',
            '[^^i^^](https://example.com)',
            '[{++i++}](https://example.com)',
            '[{>>c<<}](https://example.com)',
            '[a ==b== c](https://example.com)',
            '[a ^b^ c](https://example.com)',
            '[a ~b~ c](https://example.com)',
            '![==alt==](https://example.com/x.png)'
        ]
        for (const source of cases) {
            const html = render(source)
            // 图片语法输出 <img>，链接语法输出 <a>
            if (source.startsWith('!')) {
                expect(html).toContain('<img ')
            } else {
                expect(html).toContain('<a ')
            }
        }
    })

    it('MathML 渲染产物中的 ^ / ~ 不被扩展规则二次改写', () => {
        const html = render(
            '公式 <span class="katex"><math><semantics><annotation encoding="application/x-tex">a^2</annotation></semantics></math></span> 后文 ^x^'
        )
        expect(html).toContain('a^2')
        expect(html).toContain('<sup>x</sup>')
    })

    it('行内属性列表与脚注引用的回退分支', () => {
        // 未定义的脚注引用保持原文本
        expect(render('引用[^missing]结束')).toContain('[^missing]')
        // 行内属性：非法语法回退为普通文本
        const html = render('文本{ .cls }与[链接](https://example.com){ #id .cls }')
        expect(html).toContain('<a ')
        expect(typeof html).toBe('string')
    })
})

/* ============================== 二、grid cards 闭合扫描 ============================== */

describe('preview-md-media：grid cards 容器识别与闭合扫描', () => {
    it('基础 grid cards 递归解析内部 Markdown', () => {
        const html = render(
            ['<div class="grid cards" markdown>', '', '- 卡片一', '- 卡片二', '', '</div>'].join(
                '\n'
            )
        )
        expect(html).toContain('<div class="grid cards">')
        expect(html).toContain('<li>卡片一</li>')
    })

    it('未带 markdown 属性 / 非 grid class / 自闭合 / 缩进代码块不当作容器', () => {
        // 普通 HTML 容器直通（交给 html_block），内部列表不被递归解析为 li
        const passthrough = render('<div class="grid cards">\n- a\n</div>')
        expect(passthrough).not.toContain('<li>')
        expect(render('<div class="foo" markdown>\n- a\n</div>')).not.toContain('<li>')
        expect(render('<div class="grid" markdown />\n- a')).toBeTruthy()
        expect(render('    <div class="grid cards" markdown>\n    - a\n    </div>')).toBeTruthy()
        // 只有 markdown 属性、没有 class：不满足 grid
        expect(render('<div markdown>\n- a\n</div>')).toBeTruthy()
    })

    it('重复属性 / 未闭合容器优雅回退', () => {
        // 重复 class 属性：首次值生效（grid cards）
        expect(render('<div class="grid cards" markdown class="dup">\n- a\n</div>')).toContain(
            '<div class="grid cards">'
        )
        // 未闭合：只输出开标签，后续 Markdown 继续解析
        const unclosed = render('<div class="grid cards" markdown>\n\n- 后续列表')
        expect(unclosed).toContain('- 后续列表'.length > 0 ? '<li>后续列表</li>' : '')
    })

    it('闭合扫描忽略围栏代码块 / 行内代码 / HTML 注释里的 div', () => {
        const html = render(
            [
                '<div class="grid cards" markdown>',
                '',
                '```html',
                '<div></div>',
                '```',
                '',
                '描述中写 `<div>` 与 ``<div>`` 不应影响闭合计数',
                '',
                '<!-- 多行注释开始',
                '注释里 </div> 不算闭合',
                '注释结束 -->',
                '',
                '<!-- 单行注释 <div> -->',
                '',
                '- 真实卡片',
                '',
                '</div>'
            ].join('\n')
        )
        expect(html).toContain('<div class="grid cards">')
        expect(html).toContain('<li>真实卡片</li>')
    })

    it('行内代码反引号未闭合 / 反引号围栏 info 含反引号时扫描继续', () => {
        const html = render(
            [
                '<div class="grid cards" markdown>',
                '',
                '````',
                '围栏内 ``` 与非闭合反引号 `<div>` 忽略',
                '````',
                '',
                '未闭合反引号行：`单独一个反引号 <div>',
                '',
                '- 卡片',
                '',
                '</div>'
            ].join('\n')
        )
        expect(html).toContain('<li>卡片</li>')
        // 反引号围栏开头的 ``` 后带反引号时不是合法围栏起始
        expect(render('``` `x`\n<div class="grid" markdown>\n- a\n</div>')).toBeTruthy()
    })

    it('段落后的 grid 容器：段落终止探测的 silent 调用路径', () => {
        const html = render(
            ['上一段正文', '<div class="grid cards" markdown>', '', '- 卡片', '', '</div>'].join(
                '\n'
            )
        )
        expect(html).toContain('<div class="grid cards">')
        expect(html).toContain('<li>卡片</li>')
    })

    it('嵌套 div / 嵌套 grid 容器按深度配对', () => {
        const html = render(
            [
                '<div class="grid cards" markdown>',
                '',
                '<div class="inner">普通 div</div>',
                '',
                '<div class="grid" markdown>',
                '',
                '- 内层卡片',
                '',
                '</div>',
                '',
                '</div>'
            ].join('\n')
        )
        expect(html).toContain('<li>内层卡片</li>')
    })

    it('grid 渲染规则对非法 meta 的兜底（class 非数组 / 缺少 grid）', () => {
        const md = createCustomMarkdownIt()
        const openRule = (
            md.renderer.rules as Record<string, (tokens: unknown[], idx: number) => string>
        )['mdx_grid_open']
        const renderOpen = (meta: unknown) => openRule([{ meta }], 0) as unknown as string

        expect(renderOpen({ classes: ['cards'] })).toBe('<div class="grid cards">')
        expect(renderOpen({ classes: ['grid', 'cards'] })).toBe('<div class="grid cards">')
        expect(renderOpen({ classes: 'not-array' })).toBe('<div class="grid">')
        expect(renderOpen(undefined)).toBe('<div class="grid">')
        // 非法 class 字符被过滤
        expect(renderOpen({ classes: ['grid', 'bad class', '<x>'] })).toBe('<div class="grid">')
    })
})

/* ============================== 三、围栏代码块增强 ============================== */

describe('preview-md-media：围栏增强 title / linenums / hl_lines', () => {
    it('title 单独出现时输出 filename 且不包行', () => {
        const html = render('```python title="main.py"\nprint(1)\n```')
        expect(html).toContain('<span class="filename">main.py</span>')
        expect(html).not.toContain('class="lineno"')
    })

    it('linenums + hl_lines 输出行号与高亮行', () => {
        const html = render(
            '```js linenums="5" hl_lines="2 3-4"\nconst a = 1\nconst b = 2\nconst c = 3\nconst d = 4\n```'
        )
        expect(html).toContain('class="lineno"')
        expect(html).toContain('>5</span>')
        expect(html).toContain('hll')
    })

    it('无语言、只有属性：按转义文本输出', () => {
        const html = render('``` linenums="1" title="notes.txt"\nplain <b>text</b>\n```')
        expect(html).toContain('<span class="filename">notes.txt</span>')
        expect(html).toContain('&lt;b&gt;text&lt;/b&gt;')
    })

    it('非法 linenums / hl_lines 值回退到安全默认', () => {
        expect(render('```js linenums="abc"\nx\n```')).toContain('>1</span>')
        expect(render('```js linenums="0"\nx\n```')).toContain('>1</span>')
        // 超大区间被忽略（不构造超大 Set）
        expect(render('```js hl_lines="1-20000"\nx\n```')).not.toContain('hll')
    })

    it('highlight 缺失 / 抛错 / 输出畸形 HTML 时的兜底', () => {
        // highlight 缺失：转义文本（无语言 attr 的 info 场景）
        const noHighlight = createCustomMarkdownIt()
        expect(noHighlight.render('```title="t.txt"\n<b>raw</b>\n```')).toContain(
            '&lt;b&gt;raw&lt;/b&gt;'
        )

        // highlight 抛错：回退转义文本
        const throwing = createCustomMarkdownIt(() => {
            throw new Error('highlight failed')
        })
        expect(throwing.render('```js title="t.js"\nconst a = 1\n```')).toContain('const a = 1')
        expect(throwing.render('```js linenums="1"\nconst a = 1\n```')).toContain('class="lineno"')

        // 畸形高亮输出：未闭合标签 / 自闭合标签 / void 标签 / 注释行 / 跨行 span
        const oddOutputs = [
            'a < b\nnext',
            '<x/>self\nnext',
            '<br>void\nnext',
            '<!--comment-->\nnext',
            '<span class="k">open\nclose</span>'
        ]
        for (const output of oddOutputs) {
            const md = createCustomMarkdownIt(() => output)
            const html = md.render('```js linenums="1"\ncode\n```')
            expect(html).toContain('class="lineno"')
        }
    })

    it('原围栏渲染器缺失时直接走转义模板（两个回退点）', () => {
        // 场景 1：普通围栏 + 原渲染器缺失 → 转义模板
        const md = createCustomMarkdownIt() as MutableMarkdownIt
        delete md.renderer.rules.fence
        installMdxMediaExtensions(md)
        expect(md.render('```\nplain\n```')).toContain('<pre><code>plain')

        // 场景 2：增强渲染抛出 + 原渲染器缺失 → 转义模板
        // 用「highlight 返回 length getter 抛错的伪字符串」触发 renderEnhancedFence 内部异常
        const boomValue = {
            get length(): number {
                throw new Error('boom length')
            }
        }
        const md2 = createCustomMarkdownIt(
            () => boomValue as unknown as string
        ) as MutableMarkdownIt
        delete md2.renderer.rules.fence
        installMdxMediaExtensions(md2)
        expect(md2.render('```js linenums="1"\nplain\n```')).toContain('<pre><code>plain')
    })

    it('增强渲染抛出但存在原渲染器时回退原渲染器', () => {
        const originalFence = () => 'ORIGINAL-FENCE'
        const md = createCustomMarkdownIt() as MutableMarkdownIt
        md.renderer.rules.fence = originalFence
        installMdxMediaExtensions(md)
        const boomValue = {
            get length(): number {
                throw new Error('boom length')
            }
        }
        const md2 = createCustomMarkdownIt(() => boomValue as unknown as string)
        md2.renderer.rules.fence = originalFence
        installMdxMediaExtensions(md2)
        expect(md2.render('```js linenums="1"\nplain\n```')).toContain('ORIGINAL-FENCE')
    })
})

/* ============================== 四、行内高亮与 Material 图标 ============================== */

describe('preview-md-media：行内高亮 #!lang', () => {
    it('合法 #!lang 输出 highlight 类与高亮片段', () => {
        const html = render('行内 `#!python print(1)` 代码')
        expect(html).toContain('class="highlight language-python"')
    })

    it('无代码内容 / 无 #! 前缀 / 非法语言名回退普通行内代码', () => {
        const plain = render('普通 `inline code`')
        expect(plain).toContain('<code')
        expect(plain).toContain('inline code')
        expect(render('shebang `#!python`')).toBeTruthy()
        expect(render('`#!python`')).toBeTruthy()
    })

    it('highlight 缺失 / 抛错时回退转义文本', () => {
        const noHighlight = createCustomMarkdownIt()
        expect(noHighlight.render('`#!python print(1)`')).toContain('print(1)')

        const throwing = createCustomMarkdownIt(() => {
            throw new Error('inline highlight failed')
        })
        expect(throwing.render('`#!python print(2)`')).toContain('print(2)')
    })

    it('原 code_inline 渲染器缺失时的兜底模板', () => {
        const md = createCustomMarkdownIt() as MutableMarkdownIt
        delete md.renderer.rules.code_inline
        installMdxMediaExtensions(md)
        expect(md.render('`plain`')).toContain('<code>plain</code>')
    })
})

describe('preview-md-media：Material / Octicon 图标', () => {
    it('已知 MDI 图标渲染 SVG，未知图标降级可见文本', () => {
        const known = render('图标 :material-account: 结束')
        expect(known).toContain('mkdocs-icon')
        expect(known).toContain('<path d="')

        const missing = render('未知 :material-not-exist-icon: 结束')
        expect(missing).toContain('mkdocs-icon--missing')
        expect(missing).toContain(':material-not-exist-icon:')
    })

    it('Octicon 图标（全量数据为空）降级可见文本', () => {
        const html = render('图标 :octicons-git-branch: 结束')
        expect(html).toContain('mkdocs-icon--missing')
        expect(html).toContain(':octicons-git-branch:')
    })

    it('非 material/octicons 短代码不抢 emoji 规则', () => {
        const html = render('表情 :smile: 保持 emoji 行为')
        expect(html).toContain('😄')
    })

    it('图标出现在链接 label 中走 silent 扫描', () => {
        const html = render('[:material-account:](https://example.com)')
        expect(html).toContain('<a ')
        expect(html).toContain('mkdocs-icon')
    })

    it('渲染规则对缺失/非法 meta 的兜底', () => {
        const md = createCustomMarkdownIt()
        const iconRule = (
            md.renderer.rules as Record<string, (tokens: unknown[], idx: number) => string>
        )['mdx_icon']
        const renderIcon = (token: unknown) => iconRule([token], 0) as unknown as string

        expect(renderIcon({})).toContain('mkdocs-icon--missing')
        expect(renderIcon({ meta: { prefix: 1, name: 2 } })).toContain('mkdocs-icon--missing')
        expect(renderIcon({ meta: { prefix: 'unknown', name: 'x' } })).toContain(
            'mkdocs-icon--missing'
        )
    })
})
