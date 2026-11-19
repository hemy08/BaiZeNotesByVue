#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本为 CommonJS 构建脚本，由 node 直接运行 */
/**
 * 批量生成「报告 HTML Wiki」：
 *   docs/reports/md/**\/*.md  →  docs/reports/html/<分类>/<同名>.html（注入顶部整体导航）
 *   docs/reports/html/README.md → docs/reports/html/README.html（Wiki 首页，同样带导航）
 *
 * 用法：node build/generate-report-wiki.js
 * 说明：顶部整体导航片段见 build/report-nav.html（首页 + 3 个分类下拉 + 当前页高亮），
 *       每份报告页由 build/build-html-report.js 生成（固定悬浮目录 + 顶部导航）。
 */
const fs = require('fs')
const path = require('path')
const { buildHtml } = require('./build-html-report')

const ROOT = path.resolve(__dirname, '..')
const MD_ROOT = path.join(ROOT, 'docs', 'reports', 'md')
const HTML_ROOT = path.join(ROOT, 'docs', 'reports', 'html')
const SVG_ROOT = path.join(ROOT, 'docs', 'reports', 'svg')
const NAV = path.join(__dirname, 'report-nav.html')

function walk(dir, acc = []) {
    for (const f of fs.readdirSync(dir)) {
        const p = path.join(dir, f)
        const s = fs.statSync(p)
        if (s.isDirectory()) walk(p, acc)
        else if (f.endsWith('.md')) acc.push(p)
    }
    return acc
}

/** 报告分类（与 md/ 下目录同名；顶部导航下拉与侧边栏均按此顺序/范围维护） */
const NAV_CATEGORIES = ['01-检查与扫描', '02-修复与实施', '03-专项治理']

/** 列出 md/ 下全部报告（按分类、文件名字典序），供导航/侧边栏自动补齐 */
function listReportEntries() {
    const entries = []
    for (const cat of NAV_CATEGORIES) {
        const dir = path.join(MD_ROOT, cat)
        if (!fs.existsSync(dir)) continue
        for (const f of fs.readdirSync(dir).filter((name) => name.endsWith('.md')).sort()) {
            entries.push({ cat, name: path.basename(f, '.md') })
        }
    }
    return entries
}

/**
 * 顶部导航（build/report-nav.html）自动补齐：
 * 保持既有的手写顺序，把 md/ 中存在但导航未登记的报告追加到对应分类下拉末尾，
 * 避免「新增报告后 wiki 顶部导航漏项」（本次结构分析报告即因此遗漏）。
 * 幂等：已有链接的文件不会重复追加。
 */
function syncReportNav(entries) {
    let nav = fs.readFileSync(NAV, 'utf-8')
    let added = 0
    for (const cat of NAV_CATEGORIES) {
        const catEntries = entries.filter((e) => e.cat === cat)
        if (catEntries.length === 0) continue
        const marker = `<summary>${cat} ▾</summary>`
        const markerIndex = nav.indexOf(marker)
        if (markerIndex < 0) {
            console.warn(`[report-wiki] 顶部导航缺少分类：${cat}`)
            continue
        }
        const openTag = '<div class="rgnav-drop">'
        const bodyStart = nav.indexOf(openTag, markerIndex)
        if (bodyStart < 0) continue
        const bodyEnd = nav.indexOf('</div>', bodyStart)
        if (bodyEnd < 0) continue
        const body = nav.slice(bodyStart + openTag.length, bodyEnd)
        const missing = catEntries.filter((e) => !body.includes(`${cat}/${e.name}.html`))
        if (missing.length === 0) continue
        const inserted = missing.map((e) => `      <a href="../${cat}/${e.name}.html">${e.name}</a>`).join('\n')
        const updatedBody = body.replace(/\s*$/, '') + '\n' + inserted + '\n    '
        nav = nav.slice(0, bodyStart + openTag.length) + updatedBody + nav.slice(bodyEnd)
        added += missing.length
    }
    if (added > 0) {
        fs.writeFileSync(NAV, nav, 'utf-8')
        console.log(`[report-wiki] 顶部导航补齐 ${added} 个报告链接（build/report-nav.html）`)
    }
    return added
}

/** 侧边栏（docsify：docs/reports/html/_sidebar.md）自动补齐，规则同上 */
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
        while (blockEnd < lines.length && !/^-\s+\*\*/.test(lines[blockEnd].trim()) && lines[blockEnd].trim() !== '') {
            blockEnd++
        }
        const blockText = lines.slice(headerIndex, blockEnd).join('\n')
        const missing = entries.filter((e) => e.cat === cat && !blockText.includes(`${cat}/${e.name}.html`))
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

// 生成前先同步导航与侧边栏：从 md/ 目录自动补齐缺失报告，
// 保证本次生成的所有页面（含首页）顶部导航指向同一份最新清单。
const reportEntries = listReportEntries()
syncReportNav(reportEntries)
syncSidebar(reportEntries)

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
        nav: NAV,
        svg: collectSvgSpecs(mdPath)
    })
    count++
}

// Wiki 首页：README.md → README.html（带导航；生成后把指向 md 报告的链接改为 html 报告）
// 首页位于 html/ 根目录（比分类报告高一级），导航片段中的 ../ 前缀需去掉做深度适配
const readmeMd = path.join(HTML_ROOT, 'README.md')
if (fs.existsSync(readmeMd)) {
    const readmeHtml = path.join(HTML_ROOT, 'README.html')
    const navRaw = fs.readFileSync(NAV, 'utf-8')
    const navRoot = navRaw.replace(/href="\.\.\//g, 'href="')
    buildHtml({
        input: readmeMd,
        output: readmeHtml,
        title: '报告 HTML Wiki · 首页',
        l1: '白泽笔记 · 历史报告归档（HTML Wiki）',
        l2: '当前基线 v1.3.8 · 174 测试文件 / 3,224 用例 · 92 IPC 通道',
        navHtml: navRoot
    })
    // 首页导航：md 报告链接 → 对应 html（存在时），便于在 wiki 内直接跳转
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

// 生成后处理：正文中的 Markdown 相对链接 → 同构目录下的 HTML 页面（目标存在时）
// 报告正文含 `../../README.md`（报告总索引）与跨分类 `../03-专项治理/xxx.md` 等，
// 在 html/<分类>/ 目录下按同构结构把存在对应 .html 的链接改指 HTML，便于 wiki 内直接跳转。
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

