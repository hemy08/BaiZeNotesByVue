#!/usr/bin/env node
/**
 * 批量生成「报告 HTML Wiki」+ 共享资源：
 *   docs/reports/md/**\/*.md       → docs/reports/html/<分类>/<同名>.html
 *   docs/reports/html/README.md    → docs/reports/html/README.html（Wiki 首页）
 *   docs/reports/html/assets/*     → 公共样式与导航资源（本脚本自动生成/维护，可提交入库）
 *
 * 共享资源（2026-11-19 重构：新增报告不再需要改动所有页面）：
 * - assets/report.css            公共样式：报告页基础版式 + `.rgnav` 顶部导航 + `.toc` 悬浮目录定位；
 * - assets/report-nav.js         浏览器端导航渲染脚本（内嵌导航数据；据 currentScript.src 定位报告根，
 *                                file:// 直接打开可用）；
 * - assets/report-nav.html       静态导航片段（链接按分类报告页深度 `../`，供应用内 HTML 查看器无脚本注入）；
 * - assets/report-nav-home.html  静态导航片段（链接按首页深度，供首页/无脚本场景注入）。
 *
 * 单一真源：下方 `REPORT_NAV_DATA` 手写数据表（分类顺序 + 条目顺序 + 显示标题）；
 * `md/` 中存在但未登记的报告会自动追加到对应分类末尾并告警。
 * report-nav.js 与两个静态片段由同一数据函数 `buildReportNavData()` 生成，避免导航漂移。
 *
 * 新增报告流程：
 *   1. 在 `REPORT_NAV_DATA` 对应分类追加 `{ file, title }`（不登记也可，会自动追加但用文件名作标题）；
 *   2. 把 Markdown 放入 `docs/reports/md/<分类>/`（顶部 `report-nav` 标记会在生成时剥离）；
 *   3. 执行 `node build/generate-report-wiki.js` —— 23+ 个既有页面引用共享资源，无需逐页重写；
 *   4. 如需同步首页索引，更新 `docs/reports/html/README.md`（首页 Markdown 源）。
 *
 * 用法：node build/generate-report-wiki.js
 * 幂等：共享资源内容未变化时不改写文件；页面内容由 Markdown + 同一模板确定性生成。
 */
const fs = require('fs')
const path = require('path')
const { buildHtml, escapeHtml } = require('./build-html-report')

const ROOT = path.resolve(__dirname, '..')
const MD_ROOT = path.join(ROOT, 'docs', 'reports', 'md')
const HTML_ROOT = path.join(ROOT, 'docs', 'reports', 'html')
const SVG_ROOT = path.join(ROOT, 'docs', 'reports', 'svg')
const ASSETS_DIR = path.join(HTML_ROOT, 'assets')
const ASSETS_CSS = path.join(ASSETS_DIR, 'report.css')
const ASSETS_NAV_JS = path.join(ASSETS_DIR, 'report-nav.js')
const ASSETS_NAV_HTML = path.join(ASSETS_DIR, 'report-nav.html')
const ASSETS_NAV_HOME = path.join(ASSETS_DIR, 'report-nav-home.html')

/** 报告分类（顺序即顶部导航分类顺序；与 md/ 下目录同名） */
const NAV_CATEGORIES = ['01-检查与扫描', '02-修复与实施', '03-专项治理']

/**
 * 导航数据表（唯一真源，顺序即导航显示顺序）：
 * 分类 → 报告条目列表；`file` 为 md/html 文件名词干，`title` 为导航与「当前：」显示的标题。
 * 新增报告：在本表对应分类末尾追加一条即可（无需改动任何既有 HTML 页面）。
 */
const NAV_REPORT_DATA = {
    '01-检查与扫描': [
        { file: '总体优化项报告', title: '总体优化项报告' },
        { file: '代码质量检查报告', title: '代码质量检查报告' },
        { file: '性能检查报告', title: '性能检查报告' },
        { file: '内存检查报告', title: '内存检查报告' },
        { file: '架构检查报告', title: '架构检查报告' },
        { file: '功能检查报告', title: '功能检查报告' },
        { file: '完整性检查报告', title: '完整性检查报告' },
        { file: '全量扫描与审查报告', title: '全量扫描与审查报告（合并）' },
        { file: '代码整体结构分析报告', title: '代码整体结构分析报告' }
    ],
    '02-修复与实施': [
        { file: '127项基线修复实施汇总', title: '127 项基线修复实施汇总（合并）' },
        { file: '修复批次实施记录', title: '修复批次实施记录' },
        { file: '项目问题复查报告', title: '项目问题复查报告' },
        { file: '国际化实施报告', title: '国际化实施报告' },
        { file: '预览单跳重构报告', title: '预览单跳重构报告' },
        { file: '系统设置补充实现', title: '系统设置补充实现' },
        { file: '公共接口归位修复计划', title: '公共接口归位修复计划' },
        { file: '代码结构优化计划', title: '代码结构优化计划' }
    ],
    '03-专项治理': [
        { file: 'IPC通信矩阵', title: 'IPC 通信矩阵（当前口径）' },
        { file: 'IPC通信治理报告', title: 'IPC 通信治理报告（合并）' },
        { file: 'mkdocs-material语法支持', title: 'mkdocs-material 语法支持（合并）' },
        { file: '插件工具集成', title: '插件工具集成（合并）' },
        { file: '专项验证记录', title: '专项验证记录（合并）' },
        { file: '当前遗留问题清单', title: '当前遗留问题清单（跟踪台账）' }
    ]
}

/**
 * 共享公共样式（输出到 docs/reports/html/assets/report.css）：
 * 1. 报告页基础版式：原 build-html-report.js 内联 CSS（逐条保留，视觉不变）；
 * 2. 顶部整体导航 .rgnav：原 build/report-nav.html 内联样式（逐条保留）；
 * 3. 悬浮目录 .toc 在导航存在时的下移覆盖（原导航片段内声明）。
 * 合并后层叠顺序与改造前「head 基础样式 → body 顶部导航样式」一致。
 */
const REPORT_CSS = `/* =========================================================================
   白泽笔记报告 HTML Wiki · 公共样式（自动生成，勿手改）
   生成来源：build/generate-report-wiki.js
   覆盖范围：报告页基础版式 + 顶部整体导航（.rgnav）+ 悬浮目录（.toc）定位
   ========================================================================= */

/* ---------- 一、报告页基础版式（原 build-html-report.js 内联样式） ---------- */
:root {
  --bg: #f5f6f8; --card: #ffffff; --text: #1f2328; --muted: #6b7280;
  --border: #e5e7eb; --accent: #2563eb;
  --p0: #dc2626; --p1: #ea580c; --p2: #ca8a04; --p3: #6b7280;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text);
       font-family: "Segoe UI", "Microsoft YaHei", sans-serif; line-height: 1.7; }
.wrap { max-width: 1080px; margin: 0 auto; padding: 32px 24px 60px; }
header { background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #fff;
         border-radius: 12px; padding: 28px 32px; margin-bottom: 24px; }
header h1 { margin: 0 0 10px; font-size: 26px; }
header p { margin: 2px 0; opacity: .92; font-size: 14px; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
         gap: 12px; margin-bottom: 24px; }
.card { background: var(--card); border: 1px solid var(--border); border-radius: 10px;
        padding: 14px 16px; text-align: center; }
.card b { display: block; font-size: 26px; }
.card span { font-size: 12px; color: var(--muted); }
h2 { border-left: 4px solid var(--accent); padding-left: 10px; margin-top: 40px;
     scroll-margin-top: 20px; }
h3 { margin-top: 26px; scroll-margin-top: 20px; }
table { width: 100%; border-collapse: collapse; background: var(--card);
        border: 1px solid var(--border); border-radius: 10px; overflow: hidden;
        font-size: 13.5px; margin: 14px 0; }
th, td { padding: 9px 12px; border-bottom: 1px solid var(--border);
         text-align: left; vertical-align: top; }
th { background: #f3f4f6; white-space: nowrap; }
tr:nth-child(even) td { background: #fafbfc; }
tr:last-child td { border-bottom: none; }
code { background: #eef1f5; padding: 1px 6px; border-radius: 4px;
       font-family: Consolas, monospace; font-size: 12.5px; }
pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 10px;
      overflow-x: auto; font-size: 12.5px; line-height: 1.55; }
pre code { background: none; color: inherit; padding: 0; }
ul, ol { padding-left: 24px; }
li { margin: 4px 0; }
blockquote { margin: 14px 0; padding: 8px 14px; background: #eff6ff;
             border-left: 4px solid var(--accent); border-radius: 6px; }
a { color: var(--accent); }
.badge { display: inline-block; padding: 1px 8px; border-radius: 999px;
         color: #fff; font-size: 12px; font-weight: 600; white-space: nowrap; }
.p0 { background: var(--p0); } .p1 { background: var(--p1); }
.p2 { background: var(--p2); } .p3 { background: var(--p3); }
.diagram { margin: 18px 0; background: var(--card); border: 1px solid var(--border);
           border-radius: 12px; padding: 16px; text-align: center; overflow-x: auto; }
.diagram svg { max-width: 100%; height: auto; }
footer { margin-top: 48px; font-size: 12px; color: var(--muted);
         text-align: center; }

/* ---------- 二、悬浮目录 .toc（页面内联 HTML 结构，样式集中在此） ---------- */
.toc { position: fixed; top: 24px; left: 24px; width: 220px;
       max-height: calc(100vh - 48px); overflow-y: auto;
       background: var(--card); border: 1px solid var(--border);
       border-radius: 10px; padding: 14px 10px; z-index: 100;
       box-shadow: 0 4px 12px rgba(0,0,0,.08); font-size: 13px; }
.toc h4 { margin: 0 0 8px; font-size: 13px; color: var(--muted); padding-left: 8px; }
.toc a { display: block; color: var(--text); text-decoration: none;
         padding: 4px 8px; border-radius: 6px; line-height: 1.45; }
.toc a:hover { background: #eef1f5; color: var(--accent); }
.toc-l3 { padding-left: 20px !important; font-size: 12.5px; color: var(--muted) !important; }
@media (min-width: 1250px) { .wrap { margin: 0 auto 0 292px; } }
@media (max-width: 1249px) { .toc { display: none; } }

/* ---------- 三、顶部整体导航 .rgnav（原 build/report-nav.html 内联样式） ---------- */
html { scroll-padding-top: 72px; }
body { padding-top: 56px; }
.rgnav {
  position: fixed; top: 0; left: 0; right: 0; height: 48px; z-index: 300;
  display: flex; align-items: center; gap: 2px; padding: 0 14px;
  background: #1f2937; color: #e5e7eb; font-size: 13px;
  box-shadow: 0 2px 10px rgba(0,0,0,.28);
  /* 注意：不能用 overflow-x:auto —— 会把绝对定位的下拉菜单裁剪掉，
     表现为「点击分类下拉没反应」。导航项在窄屏下由 media query 收缩。 */
  overflow: visible;
}
.rgnav a { color: #e5e7eb; text-decoration: none; padding: 6px 10px;
           border-radius: 6px; white-space: nowrap; }
.rgnav a:hover { background: rgba(255,255,255,.12); }
.rgnav a.active { background: #2563eb; color: #fff; font-weight: 600; }
.rgnav details { position: relative; }
.rgnav summary { cursor: pointer; list-style: none; padding: 6px 10px;
                 border-radius: 6px; white-space: nowrap; color: #e5e7eb; }
.rgnav summary::-webkit-details-marker { display: none; }
.rgnav summary:hover { background: rgba(255,255,255,.12); }
.rgnav details[open] summary { background: rgba(255,255,255,.16); }
.rgnav .rgnav-drop {
  display: none; position: absolute; top: 34px; left: 0; min-width: 260px; padding: 6px;
  background: #111827; border: 1px solid #374151; border-radius: 8px;
  box-shadow: 0 10px 24px rgba(0,0,0,.45); flex-direction: column;
}
/* 显式控制下拉显隐：details 关闭时浏览器 UA 样式的隐藏可能被作者 display 覆盖，
   故用 details[open] 显式展开，避免下拉面板常驻遮挡页面导致「点击导航无反应」。 */
.rgnav details[open] .rgnav-drop { display: flex; }
.rgnav .rgnav-drop a { display: block; padding: 6px 10px; font-weight: 400; }
.rgnav .rgnav-home { font-weight: 600; }
.rgnav .rgnav-sep { width: 1px; height: 20px; background: #4b5563; margin: 0 6px; }
.rgnav .rgnav-right { margin-left: auto; font-size: 12px; color: #9ca3af;
                      white-space: nowrap; padding-left: 12px; }
.rgnav .rgnav-right a { color: #93c5fd; padding: 2px 4px; }
/* 原悬浮目录下移，避免被顶部导航遮挡 */
.toc { top: 72px !important; max-height: calc(100vh - 96px) !important; }
@media (max-width: 760px) {
  .rgnav { font-size: 12px; }
  .rgnav .rgnav-right { display: none; }
}
`

function walk(dir, acc = []) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f)
        const s = fs.statSync(p)
        if (s.isDirectory()) walk(p, acc)
        else if (f.endsWith('.md')) acc.push(p)
    }
    return acc
}

/** 列出 md/ 下全部报告（按分类、文件名字典序），供导航自动补齐/侧边栏同步 */
function listReportEntries() {
    const entries = []
    for (const cat of NAV_CATEGORIES) {
        const dir = path.join(MD_ROOT, cat)
        if (!fs.existsSync(dir)) continue
        for (const f of fs
            .readdirSync(dir)
            .filter((name) => name.endsWith('.md'))
            .sort()) {
            entries.push({ cat, name: path.basename(f, '.md') })
        }
    }
    return entries
}

/**
 * 构造导航数据（唯一数据源出口）：以 `REPORT_NAV_DATA` 的手写顺序/标题为准，
 * 把 md/ 中存在但未登记的报告追加到对应分类末尾（保持既有行为：不漏项）。
 * 返回值同时供 report-nav.js、report-nav.html、report-nav-home.html 使用。
 */
function buildReportNavData(entries) {
    const warnings = []
    const categories = NAV_CATEGORIES.map((cat) => {
        const registered = NAV_REPORT_DATA[cat] || []
        const mdNames = entries.filter((e) => e.cat === cat).map((e) => e.name)
        const mdSet = new Set(mdNames)
        const seen = new Set()
        const items = []
        for (const item of registered) {
            if (!item || !item.file) continue
            if (seen.has(item.file)) continue
            if (!mdSet.has(item.file)) {
                warnings.push(`导航数据表登记的报告无对应 Markdown，已跳过：${cat}/${item.file}.md`)
                continue
            }
            seen.add(item.file)
            items.push({ file: item.file, title: item.title || item.file })
        }
        for (const name of mdNames) {
            if (seen.has(name)) continue
            seen.add(name)
            items.push({ file: name, title: name })
            warnings.push(
                `导航数据表未登记 ${cat}/${name}.md，已自动追加到分类末尾（如需自定义标题/顺序请在 REPORT_NAV_DATA 登记）`
            )
        }
        return { dir: cat, title: cat, entries: items }
    })
    return { home: 'README', mdIndex: 'README.md', categories, warnings }
}

/**
 * 生成静态导航片段（无脚本场景使用）：
 * - 分类报告页：linkPrefix = '../'，输出 assets/report-nav.html；
 * - Wiki 首页：linkPrefix = ''，输出 assets/report-nav-home.html。
 * 结构与行为（首页链接 / 3 分类 details 下拉 / 当前：标签 / MD 索引）与旧内联片段一致。
 */
function renderStaticNav(navData, linkPrefix, scopeLabel) {
    const lines = []
    lines.push('<!-- =========================================================================')
    lines.push('     报告 HTML Wiki · 静态导航片段（自动生成，勿手改）')
    lines.push(
        '     生成来源：build/generate-report-wiki.js（与 assets/report-nav.js 同一数据函数）'
    )
    lines.push(`     链接深度：${linkPrefix || '（根目录相对，无 ../ 前缀）'}（${scopeLabel}）`)
    lines.push(
        '     用途：应用内 HTML 查看器 sandbox 不执行脚本，由渲染层把本片段注入 #report-nav 容器'
    )
    lines.push('     ========================================================================= -->')
    lines.push('<nav class="rgnav" aria-label="报告整体导航">')
    lines.push(
        `  <a class="rgnav-home" href="${linkPrefix}${navData.home}.html" title="报告 HTML Wiki 首页">🏠 报告首页</a>`
    )
    lines.push('  <span class="rgnav-sep"></span>')
    for (const category of navData.categories) {
        lines.push('  <details>')
        lines.push(`    <summary>${escapeHtml(category.title)} ▾</summary>`)
        lines.push('    <div class="rgnav-drop">')
        for (const entry of category.entries) {
            lines.push(
                `      <a href="${linkPrefix}${category.dir}/${entry.file}.html">${escapeHtml(entry.title)}</a>`
            )
        }
        lines.push('    </div>')
        lines.push('  </details>')
    }
    lines.push('  <span class="rgnav-right">')
    lines.push('    当前：<a id="rgnav-current" href="#">—</a> ·')
    lines.push(`    <a href="${linkPrefix}${navData.mdIndex}" title="Markdown 索引">MD 索引</a>`)
    lines.push('  </span>')
    lines.push('</nav>')
    return `${lines.join('\n')}\n`
}

/**
 * 生成浏览器端导航渲染脚本 assets/report-nav.js：
 * - 内嵌导航数据（分类/条目/标题）；
 * - 用 document.currentScript.src 定位 `assets/` 的上一级（报告根），据此拼绝对 URL，
 *   保证 file:// 直接打开与 http(s)/docsify 场景均可跳转；
 * - 运行时生成 <nav class="rgnav"> 插入 #report-nav，含当前页高亮、所属分类展开、
 *   点击空白处收起下拉、右侧「当前：」标签（与旧内联脚本行为一致）。
 */
function renderNavScript(navData) {
    const payload = {
        home: `${navData.home}.html`,
        mdIndex: navData.mdIndex,
        categories: navData.categories.map((category) => ({
            title: category.title,
            entries: category.entries.map((entry) => ({
                title: entry.title,
                file: `${category.dir}/${entry.file}.html`
            }))
        }))
    }
    const dataJs = JSON.stringify(payload, null, 4).replace(/\n/g, '\n    ')
    return `/* =========================================================================
   白泽笔记报告 HTML Wiki · 导航渲染脚本（自动生成，勿手改）
   生成来源：build/generate-report-wiki.js（与 assets/report-nav.html、report-nav-home.html
   由同一导航数据函数生成，避免漂移）
   行为：生成 <nav class="rgnav"> 插入 #report-nav 容器；当前页高亮 + 所属分类自动展开 +
        点击空白处收起下拉 + 右侧「当前：」标签
   ========================================================================= */
;(function () {
    'use strict'

    // 导航数据（分类 / 条目 / 显示标题；路径相对报告根）
    var DATA = ${dataJs}

    /**
     * 定位本脚本 URL：优先 document.currentScript；降级为扫描带 report-nav.js 的 script 标签。
     * 本脚本固定位于 <报告根>/assets/report-nav.js，故其上一级 ../ 即报告根。
     */
    function findScriptSrc() {
        if (document.currentScript && document.currentScript.src) return document.currentScript.src
        var scripts = document.getElementsByTagName('script')
        for (var i = scripts.length - 1; i >= 0; i--) {
            var src = scripts[i].src || ''
            if (/report-nav\\.js(?:[?#]|$)/.test(src)) return src
        }
        return ''
    }

    var root
    try {
        root = new URL('../', findScriptSrc() || location.href)
    } catch (err) {
        // 极端降级：按当前页同目录解析（正常情况下不会走到这里）
        root = new URL('./', location.href)
    }

    /** 相对报告根路径 → 绝对 URL（file:// 与 http(s) 均可用） */
    function toUrl(relative) {
        return new URL(relative, root).href
    }

    /** 规范化 pathname：解码百分号编码、统一分隔符、去掉末尾斜杠 */
    function norm(pathname) {
        try {
            return decodeURIComponent(pathname).replace(/\\\\/g, '/').replace(/\\/+$/, '')
        } catch (err) {
            return pathname
        }
    }

    function createLink(className, href, text, title) {
        var a = document.createElement('a')
        if (className) a.className = className
        a.href = href
        if (title) a.title = title
        a.textContent = text
        return a
    }

    /** 当前页高亮 + 所属分类自动展开 + 右侧「当前：」标签 */
    function highlightCurrent(nav) {
        var self = norm(location.pathname)
        var links = nav.querySelectorAll('a[href$=".html"]')
        var current = null
        for (var i = 0; i < links.length; i++) {
            var link = links[i]
            if (norm(new URL(link.href, location.href).pathname) === self) {
                link.classList.add('active')
                current = link
            }
        }
        var label = document.getElementById('rgnav-current')
        if (current) {
            var box = current.closest('details')
            if (box) box.setAttribute('open', '')
            if (label) {
                label.textContent = current.textContent.trim()
                label.setAttribute('href', current.getAttribute('href'))
            }
            return
        }
        var home = nav.querySelector('.rgnav-home')
        if (home && norm(new URL(home.href, location.href).pathname) === self) {
            home.classList.add('active')
        }
        if (label) label.textContent = document.title.replace(' · 报告', '')
    }

    /** 生成导航 DOM 并挂载到 #report-nav（若容器内已有静态片段则跳过，保证幂等） */
    function renderNav() {
        var mount = document.getElementById('report-nav')
        if (!mount || mount.querySelector('.rgnav')) return

        var nav = document.createElement('nav')
        nav.className = 'rgnav'
        nav.setAttribute('aria-label', '报告整体导航')
        nav.appendChild(createLink('rgnav-home', toUrl(DATA.home), '🏠 报告首页', '报告 HTML Wiki 首页'))

        var sep = document.createElement('span')
        sep.className = 'rgnav-sep'
        nav.appendChild(sep)

        for (var c = 0; c < DATA.categories.length; c++) {
            var category = DATA.categories[c]
            var details = document.createElement('details')
            var summary = document.createElement('summary')
            summary.textContent = category.title + ' ▾'
            details.appendChild(summary)
            var drop = document.createElement('div')
            drop.className = 'rgnav-drop'
            for (var e = 0; e < category.entries.length; e++) {
                var entry = category.entries[e]
                drop.appendChild(createLink('', toUrl(entry.file), entry.title))
            }
            details.appendChild(drop)
            nav.appendChild(details)
        }

        var right = document.createElement('span')
        right.className = 'rgnav-right'
        right.appendChild(document.createTextNode('当前：'))
        var currentLabel = createLink('', '#', '—')
        currentLabel.id = 'rgnav-current'
        right.appendChild(currentLabel)
        right.appendChild(document.createTextNode(' · '))
        right.appendChild(createLink('', toUrl(DATA.mdIndex), 'MD 索引', 'Markdown 索引'))
        nav.appendChild(right)

        mount.appendChild(nav)
        highlightCurrent(nav)
    }

    // 点击页面空白处收起下拉（与旧内联脚本行为一致）
    document.addEventListener('click', function (event) {
        var within = event.target.closest && event.target.closest('.rgnav details')
        var opened = document.querySelectorAll('.rgnav details[open]')
        for (var i = 0; i < opened.length; i++) {
            if (opened[i] !== within) opened[i].removeAttribute('open')
        }
    })

    // <script defer> 执行时 DOM 已解析完（readyState=interactive），这里同时兼容动态注入
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', renderNav)
    } else {
        renderNav()
    }
})()
`
}

/** 仅在内容变化时写文件（幂等，避免每次生成产生无意义 diff） */
function writeFileIfChanged(filePath, content) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf-8') === content) return false
    fs.writeFileSync(filePath, content, 'utf-8')
    return true
}

/** 生成/维护 docs/reports/html/assets/ 共享资源（导航数据变化时自动更新） */
function writeSharedAssets(navData) {
    const files = [
        [ASSETS_CSS, REPORT_CSS],
        [ASSETS_NAV_JS, renderNavScript(navData)],
        [ASSETS_NAV_HTML, renderStaticNav(navData, '../', '分类报告页')],
        [ASSETS_NAV_HOME, renderStaticNav(navData, '', 'Wiki 首页')]
    ]
    let changed = 0
    for (const [file, content] of files) {
        if (writeFileIfChanged(file, content)) {
            changed++
            console.log(`[report-wiki] 写入共享资源 ${path.relative(ROOT, file)}`)
        }
    }
    const reportCount = navData.categories.reduce(
        (sum, category) => sum + category.entries.length,
        0
    )
    console.log(
        `[report-wiki] 共享资源就绪：${files.length} 个文件（本次更新 ${changed} 个）· ` +
            `导航数据 ${navData.categories.length} 分类 / ${reportCount} 篇报告（+ 首页）`
    )
}

/** 侧边栏（docsify：docs/reports/html/_sidebar.md）自动补齐，规则同改造前 */
function syncSidebar(entries) {
    const sidebarPath = path.join(HTML_ROOT, '_sidebar.md')
    if (!fs.existsSync(sidebarPath)) return 0
    const lines = fs.readFileSync(sidebarPath, 'utf-8').split('\n')
    let added = 0
    for (const cat of NAV_CATEGORIES) {
        const header = `- **${cat}**`
        const headerIndex = lines.findIndex((line) => line.trim() === header)
        if (headerIndex < 0) continue
        let blockEnd = headerIndex + 1
        while (
            blockEnd < lines.length &&
            !/^-\s+\*\*/.test(lines[blockEnd].trim()) &&
            lines[blockEnd].trim() !== ''
        ) {
            blockEnd++
        }
        const blockText = lines.slice(headerIndex, blockEnd).join('\n')
        const missing = entries.filter(
            (e) => e.cat === cat && !blockText.includes(`${cat}/${e.name}.html`)
        )
        if (missing.length === 0) continue
        const inserted = missing.map((e) => `  - [${e.name}](${cat}/${e.name}.html)`)
        lines.splice(blockEnd, 0, ...inserted)
        added += missing.length
    }
    if (added > 0) {
        fs.writeFileSync(sidebarPath, lines.join('\n'), 'utf-8')
        console.log(`[report-wiki] 侧边栏补齐 ${added} 个报告链接（docs/reports/html/_sidebar.md）`)
    }
    return added
}

/**
 * 解析报告 Markdown 中的 `<!-- SVG:name -->` 占位，映射到 docs/reports/svg/name.svg。
 * 返回 buildHtml 需要的 `name=绝对路径` 列表（AGENTS：文档配图优先 SVG，外部文件比内联更易维护）。
 */
function collectSvgSpecs(mdPath) {
    const md = fs.readFileSync(mdPath, 'utf-8')
    const names = new Set()
    for (const match of md.matchAll(/<!--\s*SVG:([\w-]+)\s*-->/g)) {
        names.add(match[1])
    }
    const specs = []
    for (const name of names) {
        const svgPath = path.join(SVG_ROOT, `${name}.svg`)
        if (fs.existsSync(svgPath)) specs.push(`${name}=${svgPath}`)
        else console.warn(`[report-wiki] 未找到 SVG：${svgPath}（占位保留）`)
    }
    return specs
}

/** 生成后处理：正文中的 Markdown 相对链接 → 同构目录下的 HTML 页面（目标存在时） */
function normalizeMdLinks() {
    let linkFixed = 0
    function postprocess(dir) {
        for (const f of fs.readdirSync(dir)) {
            const p = path.join(dir, f)
            const s = fs.statSync(p)
            if (s.isDirectory()) postprocess(p)
            else if (f.endsWith('.html')) {
                let txt = fs.readFileSync(p, 'utf8')
                const orig = txt
                txt = txt.replace(/href="([^"#]+?\.md)(#[^"]*)?"/g, (all, mdPath, hash) => {
                    let decoded
                    try {
                        decoded = decodeURIComponent(mdPath)
                    } catch {
                        return all
                    }
                    // 报告总索引（../../README.md → 由 MD 索引承担，保持指向 md）
                    if (/(^|\/)README\.md$/.test(decoded)) return all
                    const htmlRel = decoded.replace(/\.md$/, '.html')
                    const target = path.resolve(path.dirname(p), htmlRel)
                    if (fs.existsSync(target)) return `href="${htmlRel}${hash || ''}"`
                    return all
                })
                if (txt !== orig) {
                    fs.writeFileSync(p, txt, 'utf8')
                    linkFixed++
                }
            }
        }
    }
    postprocess(HTML_ROOT)
    console.log(`[report-wiki] 正文 md→html 链接规范化：${linkFixed} 个文件`)
    return linkFixed
}

function main() {
    // 1. 导航数据（唯一真源）+ 共享资源，先生成/更新 assets/
    const reportEntries = listReportEntries()
    const navData = buildReportNavData(reportEntries)
    for (const warning of navData.warnings) console.warn(`[report-wiki] ${warning}`)
    writeSharedAssets(navData)
    syncSidebar(reportEntries)

    // 2. 批量生成报告页（引用 ../assets/ 共享资源）
    let count = 0
    for (const mdPath of walk(MD_ROOT)) {
        const rel = path.relative(MD_ROOT, mdPath)
        const cat = path.dirname(rel)
        const name = path.basename(mdPath, '.md')
        const outPath = path.join(HTML_ROOT, cat, `${name}.html`)
        buildHtml({
            input: mdPath,
            output: outPath,
            title: name,
            l1: `报告归档 · ${cat}`,
            l2: '历史快照 · 顶部导航可切换其他报告',
            depth: '../',
            svg: collectSvgSpecs(mdPath)
        })
        count++
    }

    // 3. Wiki 首页：README.md → README.html（引用 ./assets/ 共享资源；首页比分类报告高一级）
    const readmeMd = path.join(HTML_ROOT, 'README.md')
    if (fs.existsSync(readmeMd)) {
        const readmeHtml = path.join(HTML_ROOT, 'README.html')
        buildHtml({
            input: readmeMd,
            output: readmeHtml,
            title: '报告 HTML Wiki · 首页',
            l1: '白泽笔记 · 历史报告归档（HTML Wiki）',
            l2: '当前基线与口径见报告总索引',
            depth: './'
        })
        // 首页导航与正文：md 报告链接 → 对应 html（存在时），便于在 wiki 内直接跳转
        let txt = fs.readFileSync(readmeHtml, 'utf8')
        const orig = txt
        txt = txt.replace(/href="([^"]+?\.md)"/g, (all, mdLink) => {
            let decoded = mdLink
            try {
                decoded = decodeURIComponent(mdLink)
            } catch {
                /* 保留原样 */
            }
            const htmlLink = decoded.replace(/\.md$/, '.html')
            const target = path.resolve(path.dirname(readmeHtml), htmlLink)
            if (fs.existsSync(target)) return `href="${htmlLink}"`
            return all
        })
        if (txt !== orig) fs.writeFileSync(readmeHtml, txt, 'utf8')
        count++
    }

    console.log(`[report-wiki] 已生成 ${count} 个页面（含首页 README.html）`)

    // 4. 正文 Markdown 链接规范化
    normalizeMdLinks()
}

if (require.main === module) main()

module.exports = {
    buildReportNavData,
    collectSvgSpecs,
    listReportEntries,
    normalizeMdLinks,
    renderNavScript,
    renderStaticNav,
    syncSidebar,
    writeSharedAssets,
    NAV_CATEGORIES,
    NAV_REPORT_DATA,
    REPORT_CSS
}
