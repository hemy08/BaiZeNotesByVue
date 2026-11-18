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
        nav: NAV
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
        l2: '当前基线 v1.3.6 · 155 测试文件 / 2,823 用例 · 90 IPC 通道',
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

