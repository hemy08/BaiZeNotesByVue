/**
 * 帮助 → 使用指导交付物守卫：
 * - HTML 指南已生成到 renderer public，构建后随 asar 分发；
 * - PDF 指南已生成到 resources/help，经 extraResources 进入安装包；
 * - 两份文档都包含导航与关键章节，避免“文件存在但内容为空/导航丢失”；
 * - 1.5.6 REQ-09：HTML 需带悬浮目录（md 章节单一真源）与纯前端内文搜索，
 *   打印口径必须隐藏这些悬浮件（PDF 由同一 HTML 打印）。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = process.cwd()
const htmlPath = path.join(root, 'src/renderer/public/usage-guide.html')
const pdfPath = path.join(root, 'resources/help/usage-guide.pdf')
const mdPath = path.join(root, 'docs/help/usage-guide.md')

/** 取出 HTML 中的内联脚本内容（用于校验「纯前端、无外部依赖」） */
function inlineScripts(html: string): string[] {
    return [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
}

describe('使用指导交付物', () => {
    it('HTML 指南存在且包含侧边导航、内页锚点与关键章节', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        expect(html).toContain('class="side"')
        expect(html).toContain('id="sec-1"')
        expect(html).toContain('使用指导导航')
        expect(html).toContain('插件工具（38 项）')
        expect(html).toContain('Wiki 双链与反向链接')
    })

    it('HTML 指南包含 1.5.5 新增能力的使用说明（外观三项 / 菜单栏键盘 / 纸感版式）', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        // 外观三项：入口、取值、默认值与降级规则
        expect(html).toContain('界面风格与密度')
        expect(html).toContain('界面风格')
        expect(html).toContain('界面密度')
        expect(html).toContain('减少透明效果')
        expect(html).toContain('高密度工作台')
        // 材质口径：纸感/玻璃由主题强调色派生（非固定暖黄色），且说明主窗口可见变化
        expect(html).toContain('低饱和薄雾')
        expect(html).toContain('主窗口可见变化')
        // 菜单栏键盘：按键表与三级子菜单规则
        expect(html).toContain('菜单栏键盘操作')
        expect(html).toContain('三级子菜单的展开规则')
        // 菜单栏 Alt 激活（Windows 惯例，1.5.5 遗留项补齐）
        expect(html).toContain('可激活菜单栏')
        expect(html).toContain('退出激活')
        // 写作模式纸感版式
        expect(html).toContain('写作模式纸感版式')
        expect(html).toContain('纸感版式')
        // 系统设置矩阵同步：外观页签含三项新增配置
        expect(html).toContain('外观设置')
        expect(html).toContain('无需重启')
    })

    it('使用指导已同步「Alt 激活菜单栏」与「Alt+字母助记符」，不残留旧口径', () => {
        const md = fs.readFileSync(mdPath, 'utf8')
        const html = fs.readFileSync(htmlPath, 'utf8')
        // 内容源与生成物都必须给出 Alt 激活/退出说明（实现与文档一致，避免只改一处）
        for (const doc of [md, html]) {
            expect(doc).toContain('可激活菜单栏')
            expect(doc).toContain('退出激活')
        }
        // 1.5.5 之前的旧口径（不支持 Alt / 单独按 Alt 不展开）不得残留
        for (const doc of [md, html]) {
            expect(doc).not.toContain('不会激活或展开菜单栏')
            expect(doc).not.toContain('不会展开')
            expect(doc).not.toContain('不支持单独按')
        }
        // 1.5.6 起支持顶层菜单「Alt + 字母」助记符：文件 / 帮助两个代表字母在内容源与生成物中都存在
        for (const doc of [md, html]) {
            expect(doc).toContain('Alt + F')
            expect(doc).toContain('Alt + H')
        }
        // 旧口径「不提供 / 没有 Alt+字母助记符」不得残留（Markdown 源口径 + 生成物渲染口径）
        expect(md).not.toContain('不提供 `Alt + 字母` 助记符')
        expect(md).not.toContain('没有 `Alt + 字母` 助记符')
        expect(html).not.toMatch(/不提供[^。；\n]{0,24}Alt \+ 字母[^。；\n]{0,24}助记符/)
        expect(html).not.toMatch(/没有[^。；\n]{0,24}Alt \+ 字母[^。；\n]{0,24}助记符/)
    })

    it('HTML 指南包含插入工具界面截图，且图片资源存在', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        const expectedImages = [
            'insert-menu.webp',
            'tools-menu.webp',
            'insert-material-menu.webp',
            'insert-mermaid-templates.webp',
            'insert-writing-templates.webp',
            'insert-from-file-menu.webp',
            'special-text-dialog.webp',
            'math-dialog.webp',
            'table-editor-dialog.webp',
            'mermaid-dialog.webp',
            'admonition-dialog.webp',
            'insert-image-dialog.webp',
            'web-link-dialog.webp',
            'command-palette.webp',
            'settings-features.webp',
            'settings-nonmodal-switch.webp',
            'entry-top-menu.webp',
            'entry-insert-menu.webp',
            'entry-tools-menu.webp',
            'entry-toolbar.webp',
            'entry-settings-switch.webp',
            'nonmodal-compare.webp'
        ]
        for (const image of expectedImages) {
            expect(html, `HTML 应引用截图 ${image}`).toContain(`help-images/${image}`)
            expect(
                fs.existsSync(path.join(root, 'src/renderer/public/help-images', image)),
                `截图文件应存在：${image}`
            ).toBe(true)
        }
        expect(html).toContain('图 3-1')
        expect(html).toContain('图 3-13')
        expect(html).toContain('图 9-2')
        expect(html).toContain('图 12-3')
        expect(html).toContain('图 1-4')
    })

    it('帮助文档章节标题不包含版本号，版本支持信息放在正文', () => {
        const md = fs.readFileSync(mdPath, 'utf8')
        const headings = md.match(/^#{1,6} .+$/gm) ?? []
        for (const heading of headings) {
            expect(heading, `章节标题不应带版本号：${heading}`).not.toMatch(/\b1\.5\.\d+/)
        }
        expect(md).toContain('版本说明：')
    })

    it('HTML 指南与 Markdown 内容源章节数一致（防止只改 md 未重新生成）', () => {
        const md = fs.readFileSync(mdPath, 'utf8')
        const html = fs.readFileSync(htmlPath, 'utf8')
        const mdH2 = (md.match(/^## /gm) || []).length
        const mdH3 = (md.match(/^### /gm) || []).length
        const htmlH2 = (html.match(/<h2/g) || []).length
        const htmlH3 = (html.match(/<h3/g) || []).length
        // HTML 比 md 多 1 个 <h2>：PDF 打印目录页固定标题「目录」
        expect(htmlH2).toBe(mdH2 + 1)
        expect(htmlH3).toBe(mdH3)
    })

    it('HTML 指南不残留 Markdown 标题破格（行首多余单引号）', () => {
        const md = fs.readFileSync(mdPath, 'utf8')
        const html = fs.readFileSync(htmlPath, 'utf8')
        // 历史文档曾有 4 处标题前多了单引号，生成后变成 <p>'### ...</p>（标题丢失、目录缺项）；
        // 同时校验内容源与生成物，避免只改 md 未重新生成、或生成后又被写坏。
        expect(md).not.toMatch(/^'#{1,6}\s/m)
        expect(html).not.toContain("'##")
        expect(html).not.toContain("'###")
    })

    it('PDF 指南存在、非空且以 PDF 头开始', () => {
        const buffer = fs.readFileSync(pdfPath)
        expect(buffer.length).toBeGreaterThan(10_000)
        expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    })

    it('悬浮目录按 md 的 h2/h3 生成且与正文锚点一一对应（无重复 id）', () => {
        const md = fs.readFileSync(mdPath, 'utf8')
        const html = fs.readFileSync(htmlPath, 'utf8')
        const mdH2 = (md.match(/^## /gm) || []).length
        const mdH3 = (md.match(/^### /gm) || []).length

        // 目录容器：sticky 侧栏内的 nav（无脚本也可用的静态目录）
        expect(html).toMatch(/\.side\s*\{[^}]*position:\s*sticky/)
        const toc = (html.match(/<nav[^>]*id="help-toc"[\s\S]*?<\/nav>/) ?? [''])[0]
        expect(toc).not.toBe('')
        const tocIds = [...toc.matchAll(/href="#(sec-\d+)"/g)].map((match) => match[1])
        // md 单一真源：目录条目数 = md 的 h2 + h3 数
        expect(tocIds).toHaveLength(mdH2 + mdH3)
        expect(toc.match(/class="toc-h2"/g) || []).toHaveLength(mdH2)
        expect(toc.match(/class="toc-h3"/g) || []).toHaveLength(mdH3)
        // 目录顺序与正文标题顺序一致，且每个条目都指向真实存在的锚点
        const headingIds = [...html.matchAll(/<h[23] id="(sec-\d+)"/g)].map((match) => match[1])
        expect(headingIds).toEqual(tocIds)
        // 历史缺陷回归：h1 与首个 h2 曾共用 sec-1，导致目录首项跳到文首大标题
        const allIds = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1])
        expect(new Set(allIds).size).toBe(allIds.length)
    })

    it('HTML 内文搜索为纯前端实现：容器完整、脚本内联且无外部依赖/网络请求', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        // 搜索 UI 容器（输入框 + 结果列表 + 状态区）
        expect(html).toContain('id="help-search"')
        expect(html).toContain('id="help-search-results"')
        expect(html).toContain('id="help-search-meta"')
        expect(html).toMatch(/role="combobox"/)
        expect(html).toMatch(/role="listbox"/)
        expect(html).toMatch(/aria-live="polite"/)
        // 渐进增强：默认隐藏搜索 UI，脚本可用（补充 .js 类）后显示；无脚本时给 noscript 说明
        expect(html).toMatch(/\.help-tools\s*\{[^}]*display:\s*none/)
        expect(html).toMatch(/\.js \.help-tools\s*\{[^}]*display:\s*block/)
        expect(html).toMatch(/<noscript>[\s\S]*<\/noscript>/)

        // 内联脚本：唯一、无 src/外链样式、无网络请求（纯前端索引，不走 CDN/接口）
        const scripts = inlineScripts(html)
        expect(scripts).toHaveLength(1)
        const script = scripts[0]
        expect(script).toContain('IntersectionObserver')
        expect(script).toContain('MAX_RESULTS = 20')
        expect(script).toMatch(/keydown/)
        expect(script).toMatch(/ArrowDown/)
        expect(script).toMatch(/Escape/)
        expect(script).toContain('scrollIntoView')
        expect(html).not.toMatch(/<script[^>]+src=/i)
        expect(html).not.toMatch(/<link[^>]+stylesheet/i)
        expect(html).not.toMatch(/@import\s/i)
        expect(script).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|https?:\/\//)
    })

    it('窄屏可折叠目录，且 @media print 隐藏悬浮目录/搜索/命中高亮', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        // 响应式：原生 details 折叠面板 + 窄屏断点 + 悬浮按钮（仅脚本可用时显示）
        expect(html).toMatch(/<details[^>]*id="help-side-panel"[^>]*\bopen\b/)
        expect(html).toMatch(/<button[^>]*id="help-side-fab"/)
        expect(html).toMatch(/@media\s*\(max-width:\s*760px\)/)
        expect(html).toMatch(/\.js \.side-fab\s*\{[^}]*display:\s*inline-flex/)
        // 打印：PDF 由同一 HTML 打印，必须不含悬浮 TOC/搜索件与命中高亮
        const printStart = html.indexOf('@media print')
        expect(printStart).toBeGreaterThan(-1)
        const printCss = html.slice(printStart, html.indexOf('</style>'))
        expect(printCss).toMatch(/\.side[^{}]*\{[^}]*display:\s*none/)
        expect(printCss).toMatch(/\.help-tools[^{}]*\{[^}]*display:\s*none/)
        expect(printCss).toMatch(/\.side-fab[^{}]*\{[^}]*display:\s*none/)
        // !important：窄屏打印预览时 `@media (max-width:760px)` 的 `.js .side-fab{display:inline-flex}`
        // 特异性更高，必须用 !important 保证打印永不出现悬浮按钮/搜索
        expect(printCss).toMatch(/display:\s*none\s*!important/)
        expect(printCss).toMatch(/\.search-hit[^{}]*\{[^}]*background:\s*transparent/)
        expect(printCss).toMatch(/@page/)
    })
})
