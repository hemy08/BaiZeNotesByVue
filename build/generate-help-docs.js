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
/** PDF 打印字体（可经 HELP_PDF_FONT 覆盖，用于体积/字形测试） */
const PRINT_FONT = process.env.HELP_PDF_FONT || '"DengXian","Microsoft YaHei",sans-serif'
/** PDF 正文字号（可经 HELP_PDF_FONT_SIZE 覆盖，用于体积/分页测试） */
const PRINT_FONT_SIZE = process.env.HELP_PDF_FONT_SIZE || '9'

const md = new MarkdownIt({ html: true, linkify: false, typographer: false })

/** 标题锚点（稳定、无中文 slug 依赖） */
const headings = []
const fallbackHeadingOpen = md.renderer.rules.heading_open
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const inline = tokens[idx + 1]
    const text = inline && inline.type === 'inline' ? inline.content : ''
    const level = Number(token.tag.slice(1))
    const id = `sec-${headings.length + 1}`
    token.attrSet('id', id)
    if (level >= 2 && level <= 3) headings.push({ level, text, id })
    return fallbackHeadingOpen
        ? fallbackHeadingOpen(tokens, idx, options, env, self)
        : self.renderToken(tokens, idx, options)
}

/** TOC 嵌套渲染；printOnly 时只输出二级标题，压缩 PDF 目录页体积。 */
function renderToc(maxLevel = 3) {
    let html = ''
    let open = false
    for (const heading of headings) {
        if (heading.level === 2) {
            if (open) html += '</ul>'
            html += `<li class="toc-h2"><a href="#${heading.id}">${escapeHtml(heading.text)}</a>`
            html += '<ul class="toc-sub">'
            open = true
        } else if (heading.level <= maxLevel) {
            html += `<li class="toc-h3"><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`
        }
    }
    if (open) html += '</ul>'
    return `<ul class="toc-root">${html}</ul>`
}

function escapeHtml(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
}

/** 把帮助文档截图复制到 renderer public，供 HTML 页面直接引用 */
function copyHelpImages() {
    if (!fs.existsSync(HELP_IMAGES_SRC)) {
        return
    }
    fs.rmSync(HELP_IMAGES_OUT, { recursive: true, force: true })
    fs.mkdirSync(HELP_IMAGES_OUT, { recursive: true })
    fs.cpSync(HELP_IMAGES_SRC, HELP_IMAGES_OUT, { recursive: true })
    const copied = fs
        .readdirSync(HELP_IMAGES_OUT)
        .filter((name) => /\.(png|jpe?g|webp|gif|svg)$/i.test(name))
    console.log(
        `[help-docs] 截图复制：${copied.length} 个 → ${path.relative(ROOT, HELP_IMAGES_OUT)}`
    )
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
.side{width:250px;flex:0 0 250px;padding:24px 18px;background:var(--panel);border-right:1px solid var(--line);position:sticky;top:0;height:100vh;overflow:auto}
.side strong{display:block;font-size:17px;margin-bottom:4px}
.side .ver{color:var(--muted);font-size:12px;margin-bottom:16px}
.side .online{display:inline-block;margin-bottom:14px;font-size:12px;padding:2px 8px;background:var(--brand-soft);border-radius:999px}
.side .toc-root{list-style:none;margin:0;padding:0}
.side .toc-root ul{list-style:none;margin:0;padding:0}
.side .toc-h2>a{display:block;padding:5px 8px;border-radius:6px;font-size:14px;color:var(--text);font-weight:600}
.side .toc-h3>a{display:block;padding:3px 8px 3px 20px;border-radius:6px;font-size:12px;color:var(--muted)}
.side a:hover{background:var(--brand-soft);text-decoration:none}
main{flex:1;min-width:0;max-width:1000px;padding:30px 46px 70px}
h1{font-size:28px;margin:0 0 10px}
h2{font-size:22px;margin:34px 0 10px;padding-top:6px;border-top:1px solid var(--line)}
h3{font-size:17px;margin:22px 0 8px}
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
@media(max-width:760px){.layout{display:block}.side{width:auto;height:auto;position:static;border-right:0;border-bottom:1px solid var(--line)}main{padding:20px 18px 50px}}
@media print{
  body{background:#fff;font-family:${PRINT_FONT};font-size:${PRINT_FONT_SIZE}pt;line-height:1.42}
  .layout{display:block}
  .side{display:none}
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
  <nav class="side" aria-label="使用指导导航">
    <strong>白泽笔记 · 使用指导</strong>
    <div class="ver">Windows x64 · 随安装包分发</div>
    <a class="online" href="https://hemy08.github.io" target="_blank" rel="noreferrer">在线文档 hemy08.github.io</a>
    ${toc}
  </nav>
  <main>
    <section class="print-toc" aria-label="打印目录">
      <h2>目录</h2>
      ${printToc}
    </section>
    ${body}
    <footer>白泽笔记 · 使用指导 · 随安装包分发 · 在线文档 https://hemy08.github.io</footer>
  </main>
</div>
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
    fs.writeFileSync(HTML_PATH, await formatHtml(buildHtml(body)), 'utf8')
    console.log(`[help-docs] HTML 生成：${path.relative(ROOT, HTML_PATH)}`)

    const electronRuntime = path.join(ROOT, 'out', 'tmp', 'e2e-electron-runtime', 'electron.exe')
    const electronPath = fs.existsSync(electronRuntime) ? electronRuntime : require('electron')
    const printScript = path.join(ROOT, 'build', 'print-help-pdf.js')
    const printEnv = { ...process.env }
    delete printEnv.ELECTRON_RUN_AS_NODE
    const result = spawnSync(electronPath, [printScript, HTML_PATH, PDF_PATH], {
        cwd: ROOT,
        stdio: 'inherit',
        env: printEnv
    })
    if (result.status !== 0) {
        throw new Error(`Electron 打印 PDF 失败（exit=${result.status ?? 'null'}）`)
    }
    console.log(`[help-docs] PDF 生成：${path.relative(ROOT, PDF_PATH)}`)
}

main().catch((error) => {
    console.error('[help-docs] 生成失败：', error)
    process.exitCode = 1
})
