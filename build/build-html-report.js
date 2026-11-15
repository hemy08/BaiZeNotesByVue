#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- 本脚本为 CommonJS 构建脚本（package.json 无 type:module，由 node 直接运行），保持 require 写法 */
/**
 * Markdown → HTML 报告生成器（复用 docs/reports/html 既有报告视觉风格）
 *
 * 用法：
 *   node build/build-html-report.js --input docs/md/x.md --output docs/html/x.html \
 *     --title "报告标题" --l1 "副标题一" --l2 "副标题二" --cards "127|通道总数;16|死通道;10|机制风险" \
 * --svg doc=path/to/topology.svg --svg-at "<!-- SVG:topology -->"
 *
 * 特性：
 * - 固定悬浮目录（h2/h3 两级锚点，随滚动保持可见）
 * - 表格斑马纹、行内代码、代码块、列表、链接
 * - 可选 SVG 内嵌：md 中放 <!-- SVG:name --> 占位符，脚本用 --svg name=file 替换
 * - 卡片统计区（--cards "数值|标签;数值|标签"）
 */
const fs = require('fs')
const path = require('path')
const MarkdownIt = require('markdown-it')

function parseArgs(argv) {
    const args = { svg: [] }
    for (let i = 2; i < argv.length; i++) {
        const key = argv[i]
        if (key === '--svg') {
            args.svg.push(argv[++i])
        } else if (key.startsWith('--')) {
            args[key.slice(2)] = argv[++i]
        }
    }
    return args
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

function buildToc(mdHtml) {
    // 从渲染后的 HTML 中提取 h2 / h3（已带 id）
    const toc = []
    const re = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g
    let m
    while ((m = re.exec(mdHtml)) !== null) {
        const level = Number(m[1])
        const id = m[2]
        const text = m[3].replace(/<[^>]+>/g, '').trim()
        toc.push({ level, id, text })
    }
    return toc
}

function renderToc(toc) {
    return toc
        .map((item) =>
            item.level === 2
                ? `    <a class="toc-l2" href="#${item.id}">${escapeHtml(item.text)}</a>`
                : `    <a class="toc-l3" href="#${item.id}">${escapeHtml(item.text)}</a>`
        )
        .join('\n')
}

function renderCards(cardsArg) {
    if (!cardsArg) return ''
    const cards = cardsArg
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean)
    return cards
        .map((c) => {
            const [value, label] = c.split('|')
            return `    <div class="card"><b>${escapeHtml(value)}</b><span>${escapeHtml(label)}</span></div>`
        })
        .join('\n')
}

function injectSvg(html, svgList) {
    let out = html
    for (const spec of svgList) {
        const [name, file] = spec.split('=')
        if (!file) continue
        const abs = path.resolve(file)
        if (!fs.existsSync(abs)) {
            console.warn(`[warn] SVG 不存在，跳过：${abs}`)
            continue
        }
        const svg = fs.readFileSync(abs, 'utf-8')
        out = out.split(`<!-- SVG:${name} -->`).join(`<figure class="diagram">${svg}</figure>`)
    }
    return out
}

/** 给 h2/h3 自动加 id（markdown-it 的渲染结果不含 id） */
function addHeadingIds(html) {
    let h2 = 0
    let h3 = 0
    return html
        .replace(/<h2>([\s\S]*?)<\/h2>/g, (_, inner) => {
            h2++
            return `<h2 id="sec-${h2}">${inner}</h2>`
        })
        .replace(/<h3>([\s\S]*?)<\/h3>/g, (_, inner) => {
            h3++
            return `<h3 id="sub-${h3}">${inner}</h3>`
        })
}

const CSS = `
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
  /* 悬浮导航 */
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
`

function buildHtml(args) {
    const mdPath = path.resolve(args.input)
    if (!fs.existsSync(mdPath)) throw new Error(`Markdown 文件不存在：${mdPath}`)
    const md = fs.readFileSync(mdPath, 'utf-8')

    const mdit = new MarkdownIt({ html: true, linkify: false, typographer: false })
    // 报告标题由 <header> 呈现：跳过 md 开头的首个一级标题，避免页面中出现重复标题
    const mdBody = md.replace(/^\s*#\s+[^\n]*(?:\r?\n)+/, '')
    let body = mdit.render(mdBody)
    body = addHeadingIds(body)
    body = injectSvg(body, args.svg || [])

    const toc = buildToc(body)
    const cards = renderCards(args.cards)
    const title = args.title || '报告'
    const subtitleLines = [args.l1, args.l2, args.l3].filter(Boolean)

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>${CSS}</style>
</head>
<body>
  <nav class="toc">
    <h4>目录</h4>
${renderToc(toc)}
  </nav>

<div class="wrap">
  <header>
    <h1>${escapeHtml(title)}</h1>
    ${subtitleLines.map((s) => `<p>${escapeHtml(s)}</p>`).join('\n    ')}
  </header>

${cards ? `  <div class="cards">\n${cards}\n  </div>\n` : ''}
${body}
  <footer>由 build/build-html-report.js 从 Markdown 生成 · 报告内容以源码静态扫描为准</footer>
</div>
</body>
</html>
`

    const outPath = path.resolve(args.output)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, html, 'utf-8')
    console.log(`[ok] 生成 ${outPath}（${html.length} 字节，${toc.length} 个目录项）`)
    return outPath
}

if (require.main === module) {
    const args = parseArgs(process.argv)
    if (!args.input || !args.output) {
        console.error(
            '用法：node build/build-html-report.js --input <md> --output <html> [--title ...] [--l1 ...] [--cards ...] [--svg name=file]'
        )
        process.exit(1)
    }
    buildHtml(args)
}

module.exports = { buildHtml }
