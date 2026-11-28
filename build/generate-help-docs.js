#!/usr/bin/env node
/**
 * 生成帮助 → 使用指导的 HTML 与 PDF。
 *
 * 输入：docs/help/usage-guide.md（唯一内容源）
 * 输出：
 *   - src/renderer/public/usage-guide.html（随 renderer 构建进入 asar，应用内打开）
 *   - resources/help/usage-guide.pdf（经 extraResources 进入安装包，系统 PDF 阅读器打开）
 *
 * 要求：HTML/PDF 都有导航；PDF 由 Chromium 打印，开启 outline（书签）/tagged，
 * 并在正文前生成可点击目录页。PDF 是构建产物，脚本可重复执行。
 *
 * 1.5.6 REQ-09（帮助文档内搜索/导航增强）：
 *   - HTML 增加「悬浮目录」：`<aside class="side">` 内 sticky 侧栏，目录由 Markdown 的
 *     h2/h3 标题生成（md 仍是唯一真源），点击平滑滚动；内联脚本用 IntersectionObserver +
 *     滚动位置计算当前章节并高亮对应目录项；窄屏折叠为顶部 `<details>` 面板 + 右下角悬浮按钮。
 *   - HTML 增加「内文搜索」：纯前端索引（标题 + 本章正文文本），最多 20 条结果，
 *     支持 ↑/↓ 选择、Enter 跳转、Esc 清空；跳转后临时高亮命中词。
 *   - 搜索 UI 由 `.js` 类渐进增强：应用内 iframe sandbox 不含 allow-scripts 时脚本不执行，
 *     页面保持纯静态目录导航并显示 `<noscript>` 说明（不出现不可用的搜索框）。
 *   - `@media print` 隐藏悬浮目录/搜索/命中高亮，PDF 仍从同一 HTML 打印且不含这些悬浮件。
 *   - 无外部脚本/样式/CDN，不新增 IPC/CSP 例外。
 *
 * 图片两套来源（均由 build/capture-help-screenshots.js 生成）：
 *   - docs/help/images/*.webp：显示用有损图，复制到 renderer public 随 HTML 进入 asar；
 *   - docs/help/images/print/*.png：PDF 打印专用无损图，只在打印临时目录使用，不进安装包。
 *     （Chromium printToPDF 以无损 Flate 嵌入图片，WebP 噪点会让 PDF 反向膨胀。）
 */
const fs = require('fs')
const path = require('path')
const MarkdownIt = require('markdown-it')
const { spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const MD_PATH = path.join(ROOT, 'docs', 'help', 'usage-guide.md')
const HTML_PATH = path.join(ROOT, 'src', 'renderer', 'public', 'usage-guide.html')
const PDF_PATH = path.join(ROOT, 'resources', 'help', 'usage-guide.pdf')
/** 帮助文档截图源目录与随 HTML 分发的副本目录（Markdown 中以 images/ 引用） */
const HELP_IMAGES_SRC = path.join(ROOT, 'docs', 'help', 'images')
const HELP_IMAGES_OUT = path.join(ROOT, 'src', 'renderer', 'public', 'help-images')
/**
 * PDF 打印专用无损截图目录（由 build/capture-help-screenshots.js 生成）。
 * 为什么 PDF 单独用一套图：Chromium printToPDF 会把页面图片以无损 Flate 流嵌入 PDF，
 * WebP 有损噪点会被完整记录导致 PDF 反向膨胀；用干净的无损 PNG 打印，PDF 更小更清晰。
 * 该目录**不**复制到 renderer public，因此不增加安装包体积。
 */
const HELP_PRINT_IMAGES_SRC = path.join(HELP_IMAGES_SRC, 'print')
/** PDF 打印工作目录（临时；生成后清理；不入库） */
const PRINT_WORK_DIR = path.join(ROOT, 'out', 'tmp', 'help-print')
/** PDF 打印字体（可经 HELP_PDF_FONT 覆盖，用于体积/字形测试） */
const PRINT_FONT = process.env.HELP_PDF_FONT || '"DengXian","Microsoft YaHei",sans-serif'
/** PDF 正文字号（可经 HELP_PDF_FONT_SIZE 覆盖，用于体积/分页测试） */
const PRINT_FONT_SIZE = process.env.HELP_PDF_FONT_SIZE || '9'

const md = new MarkdownIt({ html: true, linkify: false, typographer: false })

/**
 * 标题锚点（稳定、无中文 slug 依赖）。
 *
 * 所有标题（h1~h6）都参与锚点编号：历史实现只把 h2/h3 计入编号，导致 h1 与首个 h2
 * 都生成 `sec-1`，目录首项「1. 快速开始」实际跳到文档大标题。只有 h2/h3 进入目录。
 */
const headings = []
let headingCounter = 0
const fallbackHeadingOpen = md.renderer.rules.heading_open
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const inline = tokens[idx + 1]
    const level = Number(token.tag.slice(1))
    const id = `sec-${++headingCounter}`
    token.attrSet('id', id)
    if (level >= 2 && level <= 3) {
        headings.push({ level, text: headingText(inline), id })
    }
    return fallbackHeadingOpen
        ? fallbackHeadingOpen(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
}

/**
 * 取标题纯文本：优先 inline children（强调/行内代码/链接都取其内容），
 * 避免把 Markdown 标记原样带进目录与搜索索引。
 * @param {{type?: string, content?: string, children?: Array<{content?: string}>}} inline
 * @returns {string}
 */
function headingText(inline) {
    if (!inline || inline.type !== 'inline') return ''
    if (Array.isArray(inline.children) && inline.children.length > 0) {
        return inline.children
            .map((child) => (typeof child.content === 'string' ? child.content : ''))
            .join('')
    }
    return typeof inline.content === 'string' ? inline.content : ''
}

/**
 * TOC 嵌套渲染。
 *
 * HTML 结构：`ul.toc-root > li.toc-h2 > (a + ul.toc-sub > li.toc-h3 > a)`，
 * 每一层都完整闭合，避免浏览器自动修复造成目录层级漂移。
 * @param {number} maxLevel 最大纳入层级（3 = 含 h3；2 = PDF 目录页只用 h2）
 */
function renderToc(maxLevel = 3) {
    const withSub = maxLevel >= 3
    let html = ''
    let subOpen = false
    for (const heading of headings) {
        if (heading.level === 2) {
            if (subOpen) html += '</ul></li>'
            html += `<li class="toc-h2"><a href="#${heading.id}">${escapeHtml(heading.text)}</a>`
            if (withSub) {
                html += '<ul class="toc-sub">'
                subOpen = true
            } else {
                html += '</li>'
                subOpen = false
            }
        } else if (heading.level === 3 && withSub) {
            if (!subOpen) {
                // 兜底：理论上 h3 总在 h2 之后；若文档从 h3 开始也不生成非法嵌套
                html += '<li class="toc-h2"><ul class="toc-sub">'
                subOpen = true
            }
            html += `<li class="toc-h3"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`
        }
    }
    if (subOpen) html += '</ul></li>'
    return `<ul class="toc-root">${html}</ul>`
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/**
 * 悬浮目录/内文搜索的样式（内联注入，无外部样式表/CDN）。
 *
 * 关键约束：
 * - 侧栏 sticky 参与 flex 布局（不覆盖正文），目录在侧栏内部独立滚动；
 * - 搜索 UI 默认隐藏，由内联脚本加 `.js` 类后显示 → 无脚本查看环境不出现点不动的搜索框；
 * - 窄屏折叠为顶部 `<details>` 面板 + 右下角悬浮按钮（无脚本时 `details` 原生可展开）；
 * - 打印样式见 buildHtml 的 `@media print`（隐藏侧栏、搜索与命中高亮）。
 */
const HELP_TOOLS_CSS = `
/* 悬浮目录侧栏：sticky 固定，目录/搜索在侧栏内部滚动，不遮挡正文 */
.side{width:250px;flex:0 0 250px;padding:0;background:var(--panel);border-right:1px solid var(--line);position:sticky;top:0;height:100vh;overflow:hidden;display:flex}
.side-panel{display:flex;flex-direction:column;width:100%;min-height:0;padding:18px 16px 12px}
.side-summary{display:block;cursor:default;list-style:none;margin:0 0 8px;outline:none;pointer-events:none;user-select:none}
.side-summary::-webkit-details-marker{display:none}
.side-summary::marker{content:''}
.side-title{display:block;font-size:16px;font-weight:700;color:var(--text);line-height:1.4}
.side-hint{display:none;font-size:12px;color:var(--muted);line-height:1.6}
.side-body{display:flex;flex-direction:column;flex:1;min-height:0}
.side .ver{color:var(--muted);font-size:12px;margin:0 0 8px}
.side .online{display:inline-block;margin:0 0 10px;font-size:12px;padding:2px 8px;background:var(--brand-soft);border-radius:999px}
/* 内文搜索（脚本可用时显示） */
.help-tools{display:none;flex:0 0 auto;margin:2px 0 10px}
.js .help-tools{display:block}
.help-search-label{display:block;font-size:12px;color:var(--muted);margin:0 0 5px}
.help-search-input{display:block;width:100%;box-sizing:border-box;padding:7px 10px;border:1px solid var(--line);border-radius:7px;background:#fff;color:var(--text);font-size:13px;line-height:1.5;outline:none}
.help-search-input:focus{border-color:var(--brand);box-shadow:0 0 0 3px rgba(118,75,162,.16)}
.help-search-meta{margin:6px 2px 0;font-size:11px;color:var(--muted);line-height:1.5}
.help-search-meta:empty{display:none}
.help-search-results{display:none;list-style:none;margin:4px 0 0;padding:0;max-height:46vh;overflow:auto}
.help-search-results.is-open{display:block}
.search-result{margin:1px 0}
.search-result-link{display:block;padding:6px 8px;border-radius:6px;border:1px solid transparent;color:var(--text)}
.search-result-link:hover{background:var(--brand-soft);text-decoration:none}
.search-result-link.is-active{background:var(--brand-soft);border-color:#e0d4f1;text-decoration:none}
.search-result-title{display:block;font-size:13px;font-weight:600;line-height:1.45}
.search-result-snippet{display:block;margin-top:1px;font-size:11px;color:var(--muted);line-height:1.5;word-break:break-word}
.search-result-link mark{background:#ffe28a;color:inherit;border-radius:2px;padding:0 1px}
/* 目录：侧栏内独立滚动，当前章节高亮 */
.toc{flex:1;min-height:0;overflow:auto;margin-top:2px;padding-right:2px;scrollbar-width:thin}
.side .toc-root{list-style:none;margin:0;padding:0}
.side .toc-root ul{list-style:none;margin:0;padding:0}
.side .toc-h2>a{display:block;padding:5px 8px;border-radius:6px;font-size:14px;color:var(--text);font-weight:600}
.side .toc-h3>a{display:block;padding:3px 8px 3px 20px;border-radius:6px;font-size:12px;color:var(--muted)}
.side .toc-root a:hover{background:var(--brand-soft);text-decoration:none}
.side .toc-root a.toc-active{background:var(--brand-soft);color:var(--brand);font-weight:700;box-shadow:inset 3px 0 0 var(--brand)}
/* 搜索进行中隐藏目录（结果列表与目录共用侧栏空间） */
body.searching .toc{display:none}
.noscript-hint{margin:10px 0 0;padding:8px 10px;border:1px dashed var(--line);border-radius:6px;color:var(--muted);font-size:12px;line-height:1.6}
/* 正文命中词临时高亮（2.6s 后由脚本移除 mark） */
.search-hit{background:#ffdf75;color:inherit;border-radius:2px;padding:0 1px;box-shadow:0 0 0 2px #ffdf75;animation:help-hit-flash 2.6s ease-out 1}
@keyframes help-hit-flash{0%{background:#ffd54a;box-shadow:0 0 0 3px #ffd54a}100%{background:transparent;box-shadow:none}}
/* 窄屏：侧栏折叠为顶部折叠面板 + 右下角悬浮按钮（按钮仅脚本可用时显示） */
.side-fab{display:none;position:fixed;right:16px;bottom:18px;z-index:30;align-items:center;gap:6px;padding:9px 14px;border:1px solid var(--line);border-radius:999px;background:var(--panel);color:var(--text);font-size:13px;font-weight:600;box-shadow:0 6px 18px rgba(37,34,51,.18);cursor:pointer}
.side-fab:hover{background:var(--brand-soft);border-color:#e0d4f1}
.side-fab:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
@media (max-width:760px){
  .layout{display:block}
  .side{width:auto;height:auto;position:static;border-right:0;border-bottom:1px solid var(--line);overflow:visible}
  .side-panel{height:auto;padding:12px 16px 14px}
  .side-summary{cursor:pointer;pointer-events:auto}
  .side-hint{display:block}
  .side-body{display:block}
  .toc{max-height:46vh}
  main{padding:20px 18px 50px}
  .js .side-fab{display:inline-flex}
}
`

/**
 * 帮助页内联脚本（无外部依赖、无网络请求、无模板字符串/正则转义依赖）。
 *
 * 能力：
 * - 悬浮目录：IntersectionObserver + 滚动位置计算当前章节，目录项 `.toc-active` 高亮；
 * - 内文搜索：以 DOM 中的 h2/h3 分节（标题 + 本节正文）为索引，最多 20 条结果；
 * - 键盘：↑/↓ 选择、Enter 跳首个/选中项、Esc 清空并恢复目录、Ctrl/⌘+K 聚焦搜索；
 * - 跳转后临时高亮命中词（`mark.search-hit`，2.6s 后还原 DOM）；
 * - 窄屏：`<details>` 折叠 + 右下角悬浮按钮，跨断点自动同步展开状态。
 */
const HELP_SEARCH_SCRIPT = String.raw`(function () {
    'use strict'
    var doc = document
    var main = doc.querySelector('main')
    var toc = doc.getElementById('help-toc')
    var sidePanel = doc.getElementById('help-side-panel')
    var searchInput = doc.getElementById('help-search')
    var searchBox = doc.getElementById('help-tools')
    var searchMeta = doc.getElementById('help-search-meta')
    var resultList = doc.getElementById('help-search-results')
    var fab = doc.getElementById('help-side-fab')
    if (!main || !toc || !searchInput || !resultList) return
    // 标记脚本可用：CSS 据此显示搜索 UI（应用内 iframe 禁用脚本时保持静态目录）
    doc.documentElement.classList.add('js')

    var MAX_RESULTS = 20
    var MAX_HIGHLIGHTS = 60
    var HIGHLIGHT_MS = 2600
    var NARROW_QUERY = '(max-width: 760px)'
    var SEARCH_DELAY = 120

    var tocLinks = Array.prototype.slice.call(toc.querySelectorAll('a[href^="#"]'))
    var linkById = {}
    for (var linkIndex = 0; linkIndex < tocLinks.length; linkIndex++) {
        var tocLink = tocLinks[linkIndex]
        var tocId = tocLink.getAttribute('href').slice(1)
        if (tocId) linkById[tocId] = tocLink
    }

    function normalize(text) {
        return String(text == null ? '' : text)
            .replace(/\s+/g, ' ')
            .trim()
    }

    // ---- 章节索引：h2/h3 标题 + 标题到下一个 h2/h3 之间的正文文本 -------------------
    var sections = []
    var sectionHeadings = []
    var printToc = doc.querySelector('.print-toc')
    var mainChildren = Array.prototype.slice.call(main.children)
    var currentSection = null
    for (var childIndex = 0; childIndex < mainChildren.length; childIndex++) {
        var child = mainChildren[childIndex]
        if (child === printToc) continue
        var headingLevel = child.tagName === 'H2' ? 2 : child.tagName === 'H3' ? 3 : 0
        if (headingLevel && child.id && linkById[child.id]) {
            currentSection = {
                id: child.id,
                level: headingLevel,
                title: normalize(child.textContent),
                text: '',
                elements: [],
                heading: child,
                order: sections.length
            }
            sections.push(currentSection)
            sectionHeadings.push(child)
            continue
        }
        if (!currentSection) continue
        currentSection.elements.push(child)
        currentSection.text += ' ' + normalize(child.textContent)
    }
    for (var sectionIndex = 0; sectionIndex < sections.length; sectionIndex++) {
        sections[sectionIndex].text = normalize(sections[sectionIndex].text)
    }

    function clearHighlights() {
        if (highlightTimer) {
            window.clearTimeout(highlightTimer)
            highlightTimer = 0
        }
        for (var i = 0; i < highlightMarks.length; i++) {
            var mark = highlightMarks[i]
            var parent = mark.parentNode
            if (!parent) continue
            while (mark.firstChild) parent.insertBefore(mark.firstChild, mark)
            parent.removeChild(mark)
            parent.normalize()
        }
        highlightMarks = []
    }

    function setMeta(text) {
        if (searchMeta) searchMeta.textContent = text
    }

    function clearSearchView() {
        currentResults = []
        activeIndex = -1
        queryTerms = []
        if (resultList) {
            resultList.textContent = ''
            resultList.classList.remove('is-open')
        }
        doc.body.classList.remove('searching')
        searchInput.setAttribute('aria-expanded', 'false')
        searchInput.removeAttribute('aria-activedescendant')
        setMeta('')
        clearHighlights()
    }

    // 安全地在文本中插入 <mark>（不拼 HTML，纯 DOM 构建，命中词由调用方保证非空）
    function appendHighlighted(container, text, terms) {
        var lower = text.toLowerCase()
        var position = 0
        while (position < text.length) {
            var best = -1
            var bestLength = 0
            for (var i = 0; i < terms.length; i++) {
                var hit = lower.indexOf(terms[i], position)
                if (hit !== -1 && (best === -1 || hit < best || (hit === best && terms[i].length > bestLength))) {
                    best = hit
                    bestLength = terms[i].length
                }
            }
            if (best === -1 || bestLength === 0) {
                container.appendChild(doc.createTextNode(text.slice(position)))
                return
            }
            if (best > position) container.appendChild(doc.createTextNode(text.slice(position, best)))
            var mark = doc.createElement('mark')
            mark.textContent = text.slice(best, best + bestLength)
            container.appendChild(mark)
            position = best + bestLength
        }
    }

    function makeSnippet(text, terms) {
        var lower = text.toLowerCase()
        var firstHit = -1
        for (var i = 0; i < terms.length; i++) {
            var hit = lower.indexOf(terms[i])
            if (hit !== -1 && (firstHit === -1 || hit < firstHit)) firstHit = hit
        }
        if (firstHit === -1) return text.slice(0, 72) + (text.length > 72 ? '…' : '')
        var start = Math.max(0, firstHit - 26)
        var end = Math.min(text.length, firstHit + 70)
        return (start > 0 ? '…' : '') + text.slice(start, end) + (end < text.length ? '…' : '')
    }

    function optionElements() {
        return resultList.querySelectorAll('.search-result')
    }

    function updateActiveOption() {
        var options = optionElements()
        for (var i = 0; i < options.length; i++) {
            var selected = i === activeIndex
            options[i].setAttribute('aria-selected', selected ? 'true' : 'false')
            var optionLink = options[i].firstChild
            if (optionLink && optionLink.classList) optionLink.classList.toggle('is-active', selected)
        }
        if (activeIndex >= 0 && activeIndex < currentResults.length) {
            searchInput.setAttribute('aria-activedescendant', 'help-search-option-' + activeIndex)
            var activeOption = options[activeIndex]
            if (activeOption) {
                var optionRect = activeOption.getBoundingClientRect()
                var listRect = resultList.getBoundingClientRect()
                if (optionRect.top < listRect.top) resultList.scrollTop -= listRect.top - optionRect.top
                else if (optionRect.bottom > listRect.bottom) resultList.scrollTop += optionRect.bottom - listRect.bottom
            }
        } else {
            searchInput.removeAttribute('aria-activedescendant')
        }
    }

    function renderResults() {
        resultList.textContent = ''
        if (!currentResults.length) {
            resultList.classList.remove('is-open')
            doc.body.classList.remove('searching')
            searchInput.setAttribute('aria-expanded', 'false')
            searchInput.removeAttribute('aria-activedescendant')
            return
        }
        for (var i = 0; i < currentResults.length; i++) {
            ;(function (item, index) {
                var option = doc.createElement('li')
                option.className = 'search-result'
                option.id = 'help-search-option-' + index
                option.setAttribute('role', 'option')
                option.setAttribute('aria-selected', 'false')
                var optionLink = doc.createElement('a')
                optionLink.className = 'search-result-link'
                optionLink.href = '#' + item.section.id
                optionLink.tabIndex = -1
                var titleEl = doc.createElement('span')
                titleEl.className = 'search-result-title'
                appendHighlighted(titleEl, item.section.title, queryTerms)
                optionLink.appendChild(titleEl)
                var snippetText = item.section.text ? makeSnippet(item.section.text, queryTerms) : ''
                if (snippetText) {
                    var snippetEl = doc.createElement('span')
                    snippetEl.className = 'search-result-snippet'
                    appendHighlighted(snippetEl, snippetText, queryTerms)
                    optionLink.appendChild(snippetEl)
                }
                optionLink.addEventListener('click', function (event) {
                    event.preventDefault()
                    activateResult(index)
                })
                option.appendChild(optionLink)
                resultList.appendChild(option)
            })(currentResults[i], i)
        }
        resultList.classList.add('is-open')
        doc.body.classList.add('searching')
        searchInput.setAttribute('aria-expanded', 'true')
        updateActiveOption()
    }

    function runSearch(raw) {
        var query = normalize(raw).toLowerCase()
        queryTerms = query ? query.split(' ') : []
        clearHighlights()
        if (!queryTerms.length) {
            clearSearchView()
            return
        }
        var scored = []
        for (var i = 0; i < sections.length; i++) {
            var section = sections[i]
            var title = section.title.toLowerCase()
            var haystack = title + ' ' + section.text.toLowerCase()
            var matched = true
            var titleHits = 0
            for (var termIndex = 0; termIndex < queryTerms.length; termIndex++) {
                var term = queryTerms[termIndex]
                if (haystack.indexOf(term) === -1) {
                    matched = false
                    break
                }
                if (title.indexOf(term) !== -1) titleHits++
            }
            if (matched) scored.push({ section: section, titleHits: titleHits })
        }
        scored.sort(function (left, right) {
            if (right.titleHits !== left.titleHits) return right.titleHits - left.titleHits
            return left.section.order - right.section.order
        })
        var total = scored.length
        currentResults = scored.slice(0, MAX_RESULTS)
        activeIndex = currentResults.length ? 0 : -1
        renderResults()
        if (!total) setMeta('没有找到匹配的章节，按 Esc 清空搜索')
        else if (total > MAX_RESULTS) setMeta('匹配 ' + total + ' 个章节，仅显示前 ' + MAX_RESULTS + ' 个')
        else setMeta('匹配 ' + total + ' 个章节')
    }

    var highlightMarks = []
    var highlightTimer = 0
    var SKIP_TAGS = { SCRIPT: true, STYLE: true, NOSCRIPT: true, TEXTAREA: true, MARK: true }

    function markTextNode(textNode, budget) {
        var text = textNode.nodeValue
        var lower = text.toLowerCase()
        var fragments = []
        var position = 0
        while (position < text.length && budget.left > 0) {
            var best = -1
            var bestLength = 0
            for (var i = 0; i < queryTerms.length; i++) {
                var hit = lower.indexOf(queryTerms[i], position)
                if (hit !== -1 && (best === -1 || hit < best || (hit === best && queryTerms[i].length > bestLength))) {
                    best = hit
                    bestLength = queryTerms[i].length
                }
            }
            if (best === -1 || bestLength === 0) break
            if (best > position) fragments.push({ text: text.slice(position, best), mark: false })
            fragments.push({ text: text.slice(best, best + bestLength), mark: true })
            budget.left--
            position = best + bestLength
        }
        if (!fragments.length) return
        if (position < text.length) fragments.push({ text: text.slice(position), mark: false })
        var fragment = doc.createDocumentFragment()
        for (var fragmentIndex = 0; fragmentIndex < fragments.length; fragmentIndex++) {
            var piece = fragments[fragmentIndex]
            if (piece.mark) {
                var mark = doc.createElement('mark')
                mark.className = 'search-hit'
                mark.textContent = piece.text
                fragment.appendChild(mark)
                highlightMarks.push(mark)
            } else {
                fragment.appendChild(doc.createTextNode(piece.text))
            }
        }
        textNode.parentNode.replaceChild(fragment, textNode)
    }

    function highlightElement(element, budget) {
        if (!element || budget.left <= 0) return
        if (!doc.createTreeWalker && !window.NodeFilter) return
        var walker = doc.createTreeWalker(element, window.NodeFilter.SHOW_TEXT, {
            acceptNode: function (node) {
                var parent = node.parentNode
                if (!parent || SKIP_TAGS[parent.tagName]) return window.NodeFilter.FILTER_REJECT
                if (!node.nodeValue || !node.nodeValue.trim()) return window.NodeFilter.FILTER_REJECT
                return window.NodeFilter.FILTER_ACCEPT
            }
        })
        var textNodes = []
        var node = walker.nextNode()
        while (node) {
            textNodes.push(node)
            node = walker.nextNode()
        }
        for (var i = 0; i < textNodes.length && budget.left > 0; i++) markTextNode(textNodes[i], budget)
    }

    function highlightSection(section) {
        if (!section || !queryTerms.length) return
        clearHighlights()
        var budget = { left: MAX_HIGHLIGHTS }
        // 标题命中也要高亮（搜索可能只命中章节标题，正文元素里没有该词）
        highlightElement(section.heading, budget)
        for (var i = 0; i < section.elements.length && budget.left > 0; i++) {
            highlightElement(section.elements[i], budget)
        }
        if (!highlightMarks.length) return
        highlightTimer = window.setTimeout(clearHighlights, HIGHLIGHT_MS)
    }

    function collapseOnNarrow() {
        if (!sidePanel) return
        try {
            if (window.matchMedia && window.matchMedia(NARROW_QUERY).matches) sidePanel.open = false
        } catch (error) {
            sidePanel.open = false
        }
    }

    function activateResult(index) {
        var item = currentResults[index]
        if (!item) return
        var target = item.section.heading
        var reduceMotion = false
        try {
            reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        } catch (error) {
            reduceMotion = false
        }
        if (target && target.scrollIntoView) {
            target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
        }
        try {
            window.history.replaceState(null, '', '#' + item.section.id)
        } catch (error) {
            // 受限 URL 环境（file:// 等）忽略，滚动定位已完成
        }
        highlightSection(item.section)
        collapseOnNarrow()
    }

    var searchTimer = 0
    function scheduleSearch() {
        if (searchTimer) window.clearTimeout(searchTimer)
        searchTimer = window.setTimeout(function () {
            searchTimer = 0
            runSearch(searchInput.value)
        }, SEARCH_DELAY)
    }

    var currentResults = []
    var activeIndex = -1
    var queryTerms = []
    searchInput.addEventListener('input', scheduleSearch)
    searchInput.addEventListener('search', function () {
        if (!searchInput.value) clearSearchView()
    })
    searchInput.addEventListener('keydown', function (event) {
        var key = event.key
        if (key === 'Escape') {
            event.preventDefault()
            searchInput.value = ''
            clearSearchView()
            return
        }
        if (key === 'ArrowDown' || key === 'ArrowUp') {
            if (!currentResults.length) return
            event.preventDefault()
            var step = key === 'ArrowDown' ? 1 : -1
            activeIndex = (activeIndex + step + currentResults.length) % currentResults.length
            updateActiveOption()
            return
        }
        if (key === 'Enter') {
            if (!currentResults.length) return
            event.preventDefault()
            activateResult(activeIndex >= 0 ? activeIndex : 0)
        }
    })
    doc.addEventListener('keydown', function (event) {
        if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
            event.preventDefault()
            if (sidePanel) sidePanel.open = true
            if (searchBox) searchBox.scrollIntoView({ block: 'nearest' })
            searchInput.focus()
            searchInput.select()
        }
    })

    // ---- 滚动高亮：IntersectionObserver 触发 + 位置计算兜底（长章节无标题进入视口时） ----
    var activeHeadingId = ''
    function setActiveHeading(id) {
        if (!id || id === activeHeadingId) return
        var previous = activeHeadingId ? linkById[activeHeadingId] : null
        if (previous) {
            previous.classList.remove('toc-active')
            previous.removeAttribute('aria-current')
        }
        activeHeadingId = id
        var activeLink = linkById[id]
        if (!activeLink) return
        activeLink.classList.add('toc-active')
        activeLink.setAttribute('aria-current', 'location')
        var linkRect = activeLink.getBoundingClientRect()
        var tocRect = toc.getBoundingClientRect()
        if (linkRect.top < tocRect.top) toc.scrollTop += linkRect.top - tocRect.top - 8
        else if (linkRect.bottom > tocRect.bottom) toc.scrollTop += linkRect.bottom - tocRect.bottom + 8
    }

    function updateActiveByPosition() {
        if (!sectionHeadings.length) return
        var offset = 88
        var current = sectionHeadings[0]
        for (var i = 0; i < sectionHeadings.length; i++) {
            if (sectionHeadings[i].getBoundingClientRect().top <= offset) current = sectionHeadings[i]
            else break
        }
        if (current) setActiveHeading(current.id)
    }

    var scrollTicking = false
    function scheduleScrollSpy() {
        if (scrollTicking) return
        scrollTicking = true
        var raf = window.requestAnimationFrame || function (callback) {
            return window.setTimeout(callback, 16)
        }
        raf(function () {
            scrollTicking = false
            updateActiveByPosition()
        })
    }

    window.addEventListener('scroll', scheduleScrollSpy, { passive: true })
    window.addEventListener('resize', scheduleScrollSpy)
    if (typeof window.IntersectionObserver === 'function') {
        var observer = new window.IntersectionObserver(function () {
            updateActiveByPosition()
        }, {
            rootMargin: '-88px 0px -62% 0px',
            threshold: [0, 1]
        })
        for (var headingIndex = 0; headingIndex < sectionHeadings.length; headingIndex++) {
            observer.observe(sectionHeadings[headingIndex])
        }
    }
    updateActiveByPosition()

    // ---- 窄屏折叠面板：原生 <details> 保证无脚本时仍可展开；悬浮按钮由脚本可用时显示 ----
    function syncFabState() {
        if (fab && sidePanel) fab.setAttribute('aria-expanded', sidePanel.open ? 'true' : 'false')
    }

    if (fab && sidePanel) {
        fab.addEventListener('click', function () {
            sidePanel.open = !sidePanel.open
            syncFabState()
            if (sidePanel.open) {
                try {
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                } catch (error) {
                    window.scrollTo(0, 0)
                }
            }
        })
        sidePanel.addEventListener('toggle', syncFabState)
        syncFabState()
    }

    var narrowViewport = false
    try {
        narrowViewport = !!(window.matchMedia && window.matchMedia(NARROW_QUERY).matches)
    } catch (error) {
        narrowViewport = false
    }
    if (narrowViewport && sidePanel) sidePanel.open = false
    window.addEventListener('resize', function () {
        var narrow = false
        try {
            narrow = !!(window.matchMedia && window.matchMedia(NARROW_QUERY).matches)
        } catch (error) {
            narrow = false
        }
        if (narrow === narrowViewport || !sidePanel) return
        narrowViewport = narrow
        sidePanel.open = !narrow
    })
})()
`

/** 把帮助文档截图复制到 renderer public，供 HTML 页面直接引用 */
function copyHelpImages() {
    if (!fs.existsSync(HELP_IMAGES_SRC)) {
        return
    }
    fs.rmSync(HELP_IMAGES_OUT, { recursive: true, force: true })
    fs.mkdirSync(HELP_IMAGES_OUT, { recursive: true })
    // 只复制显示用图片（顶层文件）；`print/` 是 PDF 专用无损图，不进入安装包
    const copied = []
    for (const entry of fs.readdirSync(HELP_IMAGES_SRC, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        if (!/\.(png|jpe?g|webp|gif|svg)$/i.test(entry.name)) continue
        fs.copyFileSync(
            path.join(HELP_IMAGES_SRC, entry.name),
            path.join(HELP_IMAGES_OUT, entry.name)
        )
        copied.push(entry.name)
    }
    console.log(
        `[help-docs] 截图复制：${copied.length} 个 → ${path.relative(ROOT, HELP_IMAGES_OUT)}`
    )
}

/**
 * 组装 PDF 打印页面：把显示用 WebP/JPEG 引用替换为打印专用无损 PNG。
 *
 * 输入为已生成的 HTML（图片引用形如 `help-images/<name>.webp`），输出到临时工作目录：
 * `out/tmp/help-print/usage-guide.html` + 同目录 `help-images/*.png`，
 * 让 HTML 的相对引用原样生效（打印完由调用方清理）。缺打印图时回退直接打印显示版 HTML
 * 并告警（PDF 体积会偏大，但不会阻断生成链）。
 * @param {string} html 已渲染/格式化的帮助 HTML
 * @returns {{htmlPath: string, cleanup: () => void}}
 */
function preparePrintWorkspace(html) {
    const printNames = fs.existsSync(HELP_PRINT_IMAGES_SRC)
        ? fs
              .readdirSync(HELP_PRINT_IMAGES_SRC, { withFileTypes: true })
              .filter((entry) => entry.isFile() && /\.png$/i.test(entry.name))
              .map((entry) => entry.name)
        : []
    if (printNames.length === 0) {
        console.warn(
            '[help-docs] 未找到 PDF 打印专用截图（docs/help/images/print/），' +
                '直接使用显示版截图打印：PDF 体积会偏大（可先运行截图采集脚本）'
        )
        return { htmlPath: HTML_PATH, cleanup: () => undefined }
    }
    fs.rmSync(PRINT_WORK_DIR, { recursive: true, force: true })
    const printImagesDir = path.join(PRINT_WORK_DIR, 'help-images')
    fs.mkdirSync(printImagesDir, { recursive: true })
    for (const name of printNames) {
        fs.copyFileSync(path.join(HELP_PRINT_IMAGES_SRC, name), path.join(printImagesDir, name))
    }
    const printHtml = html.replace(
        /help-images\/([A-Za-z0-9-]+)\.(?:webp|jpe?g|png)/g,
        'help-images/$1.png'
    )
    const htmlPath = path.join(PRINT_WORK_DIR, 'usage-guide.html')
    fs.writeFileSync(htmlPath, printHtml, 'utf8')
    console.log(
        `[help-docs] PDF 打印图：${printNames.length} 张无损 PNG → ` +
            path.relative(ROOT, printImagesDir)
    )
    return {
        htmlPath,
        cleanup: () => fs.rmSync(PRINT_WORK_DIR, { recursive: true, force: true })
    }
}

function buildHtml(body) {
    const toc = renderToc()
    // PDF 目录只保留二级标题：章节级导航仍完整，减少目录页与 PDF 体积
    const printToc = renderToc(2)
    return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>白泽笔记使用指导</title>
<style>
:root{--brand:#764ba2;--brand-soft:#f1ebf9;--text:#252233;--muted:#6d6980;--line:#e7e2ef;--bg:#fbf9fe;--panel:#fff}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;font-family:"Microsoft YaHei","PingFang SC",system-ui,-apple-system,sans-serif;color:var(--text);background:var(--bg);line-height:1.75}
a{color:var(--brand);text-decoration:none}
a:hover{text-decoration:underline}
.layout{display:flex;min-height:100vh}
main{flex:1;min-width:0;max-width:1000px;padding:30px 46px 70px}
h1{font-size:28px;margin:0 0 10px}
h2{font-size:22px;margin:34px 0 10px;padding-top:6px;border-top:1px solid var(--line);scroll-margin-top:14px}
h3{font-size:17px;margin:22px 0 8px;scroll-margin-top:14px}
h4{font-size:15px;margin:16px 0 6px}
p{margin:8px 0}
ul,ol{margin:8px 0;padding-left:24px}
li{margin:4px 0}
code{background:#f1eef6;border-radius:4px;padding:1px 5px;font-family:Consolas,"Cascadia Code",monospace;font-size:.92em}
pre{background:#29263a;color:#f5f2ff;border-radius:8px;padding:12px 14px;overflow:auto;font-size:13px;line-height:1.6}
pre code{background:transparent;padding:0;color:inherit}
table{width:100%;border-collapse:collapse;margin:10px 0;font-size:14px}
th,td{border:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}
th{background:#f7f3fb}
.shot{margin:14px 0;padding:10px;border:1px solid var(--line);border-radius:8px;background:#fff}
.shot img{display:block;max-width:100%;height:auto;margin:0 auto;border-radius:4px}
.shot figcaption{margin:7px 0 0;color:var(--muted);font-size:12px;text-align:center}
blockquote{margin:10px 0;padding:8px 14px;border-left:3px solid var(--brand);background:var(--brand-soft);color:#4b4560}
.print-toc{display:none}
footer{margin-top:40px;padding-top:14px;border-top:1px solid var(--line);color:var(--muted);font-size:12px}
${HELP_TOOLS_CSS}
@media print{
  body{background:#fff;font-family:${PRINT_FONT};font-size:${PRINT_FONT_SIZE}pt;line-height:1.42}
  .layout{display:block}
  .side,.side-fab,.help-tools,.help-search-results,.noscript-hint,.search-result{display:none !important}
  .search-hit,mark{background:transparent;color:inherit;box-shadow:none;padding:0;animation:none}
  .toc-active{background:transparent;box-shadow:none}
  main{max-width:none;padding:0}
  .print-toc{display:block;page-break-after:always;padding:6mm 0}
  .print-toc .toc-root{column-count:2;column-gap:16mm}
  .print-toc li{break-inside:avoid;font-size:9pt;line-height:1.5}
  .print-toc h2{border-top:0;margin-top:0}
  .print-toc a{color:var(--text)}
  h1{font-size:18pt;page-break-after:avoid}
  h2{font-size:13pt;page-break-after:avoid;border-top:0;margin-top:12pt}
  h3{font-size:10.5pt;page-break-after:avoid;margin:9pt 0 4pt}
  table,pre,blockquote,figure.shot{page-break-inside:avoid;font-size:8.4pt}
  .shot{margin:3mm 0;padding:2mm;border:0;background:transparent}
  .shot figcaption{font-size:8pt;margin-top:2mm}
  .shot img{max-height:150mm;width:auto;max-width:100%}
  a{color:var(--text);text-decoration:none}
  pre{white-space:pre-wrap}
  @page{size:A4;margin:12mm 12mm 14mm}
}
</style>
</head>
<body>
<div class="layout">
  <aside class="side" aria-label="使用指导导航">
    <details class="side-panel" id="help-side-panel" open>
      <summary class="side-summary">
        <span class="side-title">白泽笔记 · 使用指导</span>
        <span class="side-hint">目录与搜索（点击展开/收起）</span>
      </summary>
      <div class="side-body">
        <div class="ver">Windows x64 · 随安装包分发</div>
        <a class="online" href="https://hemy08.github.io" target="_blank" rel="noreferrer">在线文档 hemy08.github.io</a>
        <div class="help-tools" id="help-tools">
          <label class="help-search-label" for="help-search">搜索使用指导（标题与正文，Ctrl+K）</label>
          <input class="help-search-input" id="help-search" type="search" placeholder="输入关键词，Enter 跳转" autocomplete="off" spellcheck="false" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="help-search-results" aria-label="搜索使用指导内容">
          <p class="help-search-meta" id="help-search-meta" role="status" aria-live="polite"></p>
          <ul class="help-search-results" id="help-search-results" role="listbox" aria-label="搜索结果"></ul>
        </div>
        <nav class="toc" id="help-toc" aria-label="目录">
          ${toc}
        </nav>
        <noscript>
          <p class="noscript-hint">当前查看环境未启用脚本：内文搜索与滚动高亮不可用，可直接使用上方目录跳转章节。</p>
        </noscript>
      </div>
    </details>
  </aside>
  <main>
    <section class="print-toc" aria-label="打印目录">
      <h2>目录</h2>
      ${printToc}
    </section>
    ${body}
    <footer>白泽笔记 · 使用指导 · 随安装包分发 · 在线文档 https://hemy08.github.io</footer>
  </main>
</div>
<button class="side-fab" id="help-side-fab" type="button" aria-controls="help-side-panel" aria-expanded="true">目录与搜索</button>
<script>
${HELP_SEARCH_SCRIPT}
</script>
</body>
</html>`
}

/**
 * 按仓库 Prettier 配置格式化生成的 HTML。
 *
 * 为什么需要：`src/renderer/public/usage-guide.html` 是随仓库提交的交付物，
 * `npm run format:check`（prettier --check .）会覆盖它；若直接写入模板字符串原文，
 * 重新生成后格式门禁会红。格式化失败只告警并回退原文，不阻塞 HTML/PDF 产出。
 */
async function formatHtml(rawHtml) {
    try {
        const prettier = require('prettier')
        const config = (await prettier.resolveConfig(HTML_PATH)) ?? {}
        return await prettier.format(rawHtml, { ...config, filepath: HTML_PATH })
    } catch (error) {
        console.warn('[help-docs] Prettier 格式化失败，写入未格式化 HTML：', error)
        return rawHtml
    }
}

async function main() {
    const markdown = fs.readFileSync(MD_PATH, 'utf8')
    // Markdown 中的 images/ 是帮助截图源目录；生成 HTML 时指向 public 副本
    const body = md.render(markdown).replace(/src="images\//g, 'src="help-images/')
    copyHelpImages()
    fs.mkdirSync(path.dirname(HTML_PATH), { recursive: true })
    fs.mkdirSync(path.dirname(PDF_PATH), { recursive: true })
    const formattedHtml = await formatHtml(buildHtml(body))
    fs.writeFileSync(HTML_PATH, formattedHtml, 'utf8')
    console.log(`[help-docs] HTML 生成：${path.relative(ROOT, HTML_PATH)}`)

    const electronRuntime = path.join(ROOT, 'out', 'tmp', 'e2e-electron-runtime', 'electron.exe')
    const electronPath = fs.existsSync(electronRuntime) ? electronRuntime : require('electron')
    const printScript = path.join(ROOT, 'build', 'print-help-pdf.js')
    const printEnv = { ...process.env }
    delete printEnv.ELECTRON_RUN_AS_NODE
    // PDF 用打印专用无损 PNG（见 preparePrintWorkspace 注释）；工作目录用完即清理
    const printWorkspace = preparePrintWorkspace(formattedHtml)
    try {
        const result = spawnSync(electronPath, [printScript, printWorkspace.htmlPath, PDF_PATH], {
            cwd: ROOT,
            stdio: 'inherit',
            env: printEnv
        })
        if (result.status !== 0) {
            throw new Error(`Electron 打印 PDF 失败（exit=${result.status ?? 'null'}）`)
        }
    } finally {
        printWorkspace.cleanup()
    }
    console.log(`[help-docs] PDF 生成：${path.relative(ROOT, PDF_PATH)}`)
}

main().catch((error) => {
    console.error('[help-docs] 生成失败：', error)
    process.exitCode = 1
})
