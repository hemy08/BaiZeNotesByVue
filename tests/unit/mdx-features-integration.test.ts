// @vitest-environment jsdom
/**
 * mkdocs-material / pymdownx 扩展语法端到端集成测试（2026-11-15）
 *
 * 覆盖 15 项扩展语法的组合渲染（批次 A/B/C 全部接入 createPreviewMarkdownIt 后）：
 * A：折叠提示块、任务列表、高亮/插入/删除、上下标、键盘按键、属性列表、脚注、定义列表
 * B：grid cards、代码块增强（linenums/hl_lines/title/行内高亮）、Material 图标
 * C：pymdownx.blocks（///）、snippets（--8<--）、tab 深链
 * 同时校验：DOMPurify（与 MarkdownPreviewComponent 相同配置）后关键结构仍保留。
 *
 * 说明：不依赖外部仓库/真实窗口；snippets 使用注入的 readFile 桩。
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import DOMPurify from 'dompurify'
import { createPreviewMarkdownIt } from '../../src/renderer/src/components/Markdown/preview-markdown-it'
import {
    EnsurePreviewKatexLoaded,
    HemyRenderPreLocal
} from '../../src/renderer/src/components/Markdown/preview-local-render'
import { expandSnippetIncludes } from '../../src/renderer/src/components/Markdown/preview-md-blocks'
import {
    createTabDeepLinkEnv,
    getTabTargetByHash
} from '../../src/renderer/src/components/Markdown/preview-mkdocs-material'

const SAMPLE = `# 扩展语法总览

## 折叠提示块

??? note "可折叠提示"
    折叠内容 **加粗**

    - 列表项一
    - 列表项二

???+ tip "默认展开"
    展开内容

## 任务列表

- [x] 已完成任务
- [ ] 未完成任务

## 高亮 / 插入 / 删除

==高亮文本== 与 ^^插入文本^^、~~删除文本~~、{--critic删除--}、{++critic插入++}、{==critic高亮==}。

## 上下标与键盘

H^上标^ 与 H~下标~；快捷键 ++ctrl+alt+del++。

## 属性列表

[主按钮](https://example.com/docs){ .md-button }

## 脚注

引用脚注[^note]。

[^note]: 脚注说明文字。

## 定义列表

术语
: 定义内容

## Grid cards

<div class="grid cards" markdown>

-   :material-account: **卡片一**

    ---

    卡片一描述

-   :material-cog: **卡片二**

    卡片二描述

</div>

## 代码块增强

\`\`\`python linenums="1" hl_lines="2" title="main.py"
def main():
    print("hi")
\`\`\`

行内高亮：\`#!python print(1)\`

## Material 图标

图标 :material-home: :material-github:

## 提示块 + 标签页

!!! Success "标签页示例"
    === "C"
        \`\`\`c
        int x = 1;
        \`\`\`
    === "Go"
        \`\`\`go
        var x = 1
        \`\`\`

## pymdownx.blocks

/// note | blocks 提示
blocks 内容 **加粗**
///

/// tabbed
/// tab | A
A 内容
///
/// tab | B
B 内容
///
///

/// details | 折叠详情
详情内容
///

## snippets

--8<-- "snippet-part.md"

## 数学公式

行内公式 $E=mc^2$。
`

const SNIPPET_CONTENT = '# 片段标题\n\n片段正文内容。\n'

/** 与 MarkdownPreviewComponent 相同的 DOMPurify 配置（简化版 URI 白名单同款语义） */
const DOMPURIFY_CONFIG = {
    USE_PROFILES: { html: true, svg: true, svgFilters: true, mathMl: true }
}

/** 渲染完整样例（含 snippets 展开 + tab 深链 env） */
async function renderSample(): Promise<string> {
    const md = createPreviewMarkdownIt()
    const expanded = await expandSnippetIncludes(
        SAMPLE,
        '/tmp/notes/example.md',
        async (absPath: string) => (absPath.endsWith('snippet-part.md') ? SNIPPET_CONTENT : null)
    )
    // P1-8：KaTeX 改为按需动态加载——与预览组件同序，在同步预渲染前先 await 加载
    await EnsurePreviewKatexLoaded(expanded)
    const preRendered = HemyRenderPreLocal(expanded, { skipKatex: false })
    return md.render(preRendered, createTabDeepLinkEnv())
}

describe('mkdocs-material 扩展语法端到端集成', () => {
    it('样例中 15 项语法均渲染为预期结构（无裸语法残留）', async () => {
        const html = await renderSample()

        // 1 折叠提示块
        expect(html).toContain('<details class="admonition note"')
        expect(html).toContain('<summary class="admonition-title">可折叠提示</summary>')
        expect(html).toContain('<details class="admonition tip" open')
        // 2 任务列表
        expect(html).toContain('task-list-item')
        expect(html).toContain('type="checkbox"')
        // 3 高亮/插入/删除
        expect(html).toContain('<mark>高亮文本</mark>')
        expect(html).toContain('<ins>插入文本</ins>')
        expect(html).toContain('<del>critic删除</del>')
        // 4 上下标
        expect(html).toContain('<sup>上标</sup>')
        expect(html).toContain('<sub>下标</sub>')
        // 5 键盘按键
        expect(html).toContain('<kbd>ctrl</kbd>')
        // 6 属性列表按钮
        expect(html).toContain('class="md-button"')
        // 7 脚注
        expect(html).toContain('footnote-ref')
        expect(html).toContain('class="footnotes"')
        // 8 定义列表
        expect(html).toContain('<dl>')
        expect(html).toContain('<dt>术语</dt>')
        expect(html).toContain('<dd>定义内容</dd>')
        // 9 grid cards + 图标
        expect(html).toContain('class="grid cards"')
        expect(html).toContain('mkdocs-icon')
        // 10 代码块增强
        expect(html).toContain('class="filename"')
        expect(html).toContain('lineno')
        expect(html).toContain('hll')
        // 11 提示块 + 标签页（既有）
        expect(html).toContain('<div class="admonition success">')
        expect(html).toContain('tabbed-set')
        // 12 pymdownx.blocks
        expect(html).toContain('blocks 提示')
        expect(html).toContain('<details class="admonition details"')
        // 13 snippets
        expect(html).toContain('片段标题')
        expect(html).not.toContain('--8<--')
        // 14 tab 深链 id
        expect(html).toMatch(/id="__tabbed_\d+_\d+"/)
        expect(html).toContain('_label"')
        expect(html).toContain('_panel"')
        // 15 KaTeX 公式（脚注/标注不破坏）
        expect(html).toContain('katex')

        // 无裸语法残留（代码围栏除外：代码块内部转义文本中不会出现裸三反引号）
        expect(html).not.toContain('??? note')
        expect(html).not.toContain('/// note')
    })

    it('DOMPurify（预览同款配置）后关键结构保留', async () => {
        const html = await renderSample()
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)

        // 折叠块 / 任务列表 / 行内标签
        expect(sanitized).toContain('<details')
        expect(sanitized).toContain('<summary')
        expect(sanitized).toContain('type="checkbox"')
        expect(sanitized).toContain('<ins>')
        expect(sanitized).toContain('<del>')
        expect(sanitized).toContain('<mark>')
        expect(sanitized).toContain('<kbd>')
        expect(sanitized).toContain('<dl>')
        // grid cards / 图标 svg / 代码块增强
        expect(sanitized).toContain('grid cards')
        expect(sanitized).toContain('<svg')
        expect(sanitized).toContain('class="filename"')
        // tab 深链 id 保留（data-* 与 id 均默认放行）
        expect(sanitized).toMatch(/id="__tabbed_\d+_\d+"/)
        // 注入面：脚本与事件属性被剥离
        expect(sanitized).not.toContain('<script')
        expect(sanitized).not.toContain('onerror=')
    })

    it('tab 深链解析：label/panel/hash 均可映射到 radio id', async () => {
        const html = await renderSample()
        const firstRadio = html.match(/id="(__tabbed_(\d+)_(\d+))"/)
        expect(firstRadio).not.toBeNull()
        const radioId = firstRadio![1]
        const setId = firstRadio![2]
        const tabNumber = firstRadio![3]

        expect(getTabTargetByHash(`#${radioId}`)).toEqual({ radioId })
        expect(getTabTargetByHash(`#${radioId}_label`)).toEqual({ radioId })
        expect(getTabTargetByHash(`#${radioId}_panel`)).toEqual({ radioId })
        expect(getTabTargetByHash(`https://example.com/doc#${radioId}`)).toEqual({ radioId })
        expect(getTabTargetByHash(`#__tabbed_${setId}_${tabNumber}`)).toEqual({ radioId })
        expect(getTabTargetByHash('#not-a-tab')).toBeNull()
    })

    it('snippets 缺失/无活动文件时保留原文且不抛错', async () => {
        const md = createPreviewMarkdownIt()
        const noActive = await expandSnippetIncludes(SAMPLE, null, async () => null)
        expect(noActive).toContain('--8<--')

        const missing = await expandSnippetIncludes(
            '前文\n\n--8<-- "missing.md"\n\n后文',
            '/tmp/notes/example.md',
            async () => null
        )
        expect(missing).toContain('--8<--')
        const html = md.render(missing, createTabDeepLinkEnv())
        // 未展开时渲染为占位段落（不抛错、不吞掉后续文本；指令原文由占位块承载）
        expect(html).toContain('mdx-snippet-placeholder')
        expect(html).toContain('后文')
        expect(html).not.toContain('<script')
    })

    it('生成可视化预览产物（仅当设置 MDX_PREVIEW_ARTIFACT 环境变量时）', async () => {
        const artifactPath = process.env.MDX_PREVIEW_ARTIFACT
        if (!artifactPath) {
            return
        }
        const html = await renderSample()
        const sanitized = DOMPurify.sanitize(html, DOMPURIFY_CONFIG)
        const cssFiles = [
            'src/renderer/src/styles/material/admonition.css',
            'src/renderer/src/styles/material/tableset.css',
            'src/renderer/src/styles/material/gridcards.css',
            'src/renderer/src/styles/material/md-basic.css',
            'src/renderer/src/styles/material/md-media.css',
            'src/renderer/src/styles/material/md-blocks.css'
        ]
        const css = cssFiles
            .map((relativePath) => {
                const absolutePath = path.resolve(__dirname, '../..', relativePath)
                return fs.existsSync(absolutePath) ? fs.readFileSync(absolutePath, 'utf-8') : ''
            })
            .join('\n')
        const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>mkdocs 扩展语法预览样例</title>
<style>
body { max-width: 1100px; margin: 0 auto; padding: 24px 32px; font-family: "Microsoft YaHei", sans-serif; line-height: 1.7; color: #1f2328; background: #fff; }
code, pre { font-family: Consolas, monospace; }
${css}
</style>
</head>
<body>
<div class="md-typeset">
${sanitized}
</div>
</body>
</html>
`
        fs.mkdirSync(path.dirname(artifactPath), { recursive: true })
        fs.writeFileSync(artifactPath, doc, 'utf-8')
        expect(fs.existsSync(artifactPath)).toBe(true)
    })
})
