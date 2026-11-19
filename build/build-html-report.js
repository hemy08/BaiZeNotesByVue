#!/usr/bin/env node
/**
 * Markdown → HTML 报告生成器（报告 HTML Wiki 的单页渲染器）
 *
 * 用法：
 *   node build/build-html-report.js --input docs/reports/md/x.md --output docs/reports/html/x.html \
 *     --title "报告标题" --l1 "副标题一" --l2 "副标题二" --cards "127|通道总数;16|死通道" \
 *     --depth ../ --svg doc=path/to/topology.svg
 *   （md 中放 `<!-- SVG:name -->` 占位符，脚本用 --svg name=file 替换为内嵌 SVG）
 *
 * 页面结构约定（2026-11-19 重构：导航与公共样式抽为共享资源）：
 * - head 只引用 `<link rel="stylesheet" href="{depth}assets/report.css">`，不再内联公共 CSS；
 * - body 顶部输出 `<!-- baize-report-nav-slot -->` + `<div id="report-nav"></div>`：
 *   - 浏览器直接打开：由 `{depth}assets/report-nav.js`（defer）在运行时渲染导航；
 *   - 应用内 HTML 查看器（sandbox 不执行脚本）：由渲染层向该容器注入静态片段
 *     `assets/report-nav.html`（分类报告页深度）或 `assets/report-nav-home.html`（首页深度）；
 * - body 末尾引用 `{depth}assets/report-nav.js`；
 * - 页面内联悬浮目录（.toc）保留：目录项因页而异，由本脚本按 h2/h3 生成，不做抽取。
 *
 * 共享资源（report.css / report-nav.js / 两个静态片段）由 build/generate-report-wiki.js
 * 统一生成并维护（产物位于 docs/reports/html/assets/，可提交入库）。
 * 因此单页生成前需先跑过一次 Wiki 批量生成，否则共享资源缺失（脚本会给出告警）。
 *
 * 兼容说明：`--nav` / `--navHtml` 参数保留但已废弃——导航不再内联进页面，传入会被忽略。
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

/**
 * 规范化资源相对深度：分类报告页为 `../`（默认），Wiki 首页为 `./`；
 * 更深层级报告页（如 `docs/reports/html/<分类>/<子目录>/x.html`）可传 `../../`。
 */
function normalizeDepth(raw) {
    const value = String(raw === undefined || raw === null ? '' : raw).trim()
    if (value === '') return '../'
    if (value === '.' || value === './') return './'
    if (/^(?:\.\.\/)+$/.test(value)) return value
    if (/^(?:\.\.\/)*\.\.$/.test(value)) return `${value}/`
    if (/^(?:\.\.\/)*\.$/.test(value)) return value.replace(/\.$/, './')
    throw new Error(`--depth 参数不合法：${raw}（仅支持 './'、'../'、'../../' 这类相对前缀）`)
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

function buildHtml(args) {
    const mdPath = path.resolve(args.input)
    if (!fs.existsSync(mdPath)) throw new Error(`Markdown 文件不存在：${mdPath}`)
    const md = fs.readFileSync(mdPath, 'utf-8')

    const mdit = new MarkdownIt({ html: true, linkify: false, typographer: false })
    // 报告标题由 <header> 呈现：跳过 md 开头的首个一级标题，避免页面中出现重复标题
    let mdBody = md.replace(/^\s*#\s+[^\n]*(?:\r?\n)+/, '')
    // 剥离 Markdown 报告顶部的手写「报告导航」行（页面导航改由共享导航资源承担）
    mdBody = mdBody.replace(/<!-- report-nav:start -->[\s\S]*?<!-- report-nav:end -->\s*/, '')
    let body = mdit.render(mdBody)
    body = addHeadingIds(body)
    body = injectSvg(body, args.svg || [])

    const toc = buildToc(body)
    const cards = renderCards(args.cards)
    const title = args.title || '报告'
    const subtitleLines = [args.l1, args.l2, args.l3].filter(Boolean)
    const depth = normalizeDepth(args.depth)

    // 旧参数兼容：导航已不再内联进页面（改为 assets/ 共享资源 + 静态片段注入）
    if (args.nav || args.navHtml) {
        console.warn(
            '[warn] --nav / --navHtml 已废弃并被忽略：导航改由 docs/reports/html/assets/report-nav.js（浏览器）' +
                '与 assets/report-nav.html（应用内静态注入）承担，请运行 node build/generate-report-wiki.js 维护'
        )
    }

    const outPath = path.resolve(args.output)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    // 共享资源缺失时给出明确告警（不阻断单页生成，但页面样式/导航会失效）
    const missingAssets = ['report.css', 'report-nav.js']
        .map((name) => path.resolve(path.dirname(outPath), depth, 'assets', name))
        .filter((file) => !fs.existsSync(file))
    if (missingAssets.length > 0) {
        console.warn(
            `[warn] 共享资源缺失：${missingAssets.join('、')}；` +
                '请先运行 node build/generate-report-wiki.js 生成 docs/reports/html/assets/'
        )
    }

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${depth}assets/report.css">
</head>
<body>
<!-- baize-report-nav-slot -->
<div id="report-nav"></div>
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
<script src="${depth}assets/report-nav.js" defer></script>
</body>
</html>
`

    fs.writeFileSync(outPath, html, 'utf-8')
    console.log(`[ok] 生成 ${outPath}（${html.length} 字节，${toc.length} 个目录项）`)
    return outPath
}

if (require.main === module) {
    const args = parseArgs(process.argv)
    if (!args.input || !args.output) {
        console.error(
            '用法：node build/build-html-report.js --input <md> --output <html> [--title ...] [--depth ./|../] [--l1 ...] [--cards ...] [--svg name=file]'
        )
        process.exit(1)
    }
    buildHtml(args)
}

module.exports = { buildHtml, escapeHtml }
