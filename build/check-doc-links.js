#!/usr/bin/env node
/**
 * 文档相对链接检查（P1：文档链接检查 CI，P2-1 扩展：根级文档纳入）
 *
 * 扫描「仓库根 Markdown + docs 目录 Markdown」中的相对链接，校验相对路径目标是否存在，
 * 发现断链时以退出码 1 结束，供 `npm run docs:check` 与 CI quality-gate 使用。
 *
 * 扫描范围（见 SCAN_ROOT_FILES / DOCS_DIR）：
 * - 仓库根：README.md、SECURITY.md（扫描报告 P2-1：此前只扫 docs，根 README 的链接无门禁）；
 * - docs/**\/*.md：已覆盖 docs/md/**、docs/reports/md/**、docs/wiki/** 等全部 Markdown；
 * - 不扫描 HTML 生成物（docs/reports/html/**、docs/历史归档/*.html）：相对链接由
 *   `build/generate-report-wiki.js` 生成时统一拼装，且 HTML 锚点/导航片段校验成本高。
 *
 * 检查口径（与任务约定一致）：
 * - 只检查相对链接（以及指向仓库内文件的链接）；`http(s)://`、`mailto:`、`tel:`、
 *   `data:`、协议相对 `//`、纯锚点 `#...` 一律忽略；
 * - 忽略代码块：围栏代码块（``` / ~~~）与行内代码（`...`）；HTML 注释同样忽略；
 * - **锚点不校验标题存在性**：`foo.md#section` 只校验 `foo.md` 是否存在（标题锚点需要解析
 *   全部标题与 GitHub/docsify 两套 slug 规则，成本与误报都高，本脚本不做）；
 * - 链接目标为目录时视为有效（目录型链接）；
 * - 支持行内链接 `[text](target "title")`、`[text](<target with space>)`、
 *   图片 `![alt](target)` 与引用式定义 `[id]: target`。
 *
 * 用法：
 *   node build/check-doc-links.js          # 检查，断链时退出码 1
 *   node build/check-doc-links.js --list   # 额外列出已检查的链接明细
 */

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const DOCS_DIR = path.join(ROOT, 'docs')
const LIST_ALL = process.argv.includes('--list')
/** 仓库根目录纳入扫描的 Markdown（P2-1：根 README/SECURITY 的相对链接此前无门禁） */
const SCAN_ROOT_FILES = ['README.md', 'SECURITY.md']

/** 忽略的链接协议/前缀（外部资源与非文件目标） */
const IGNORED_PREFIXES = [
    'http://',
    'https://',
    'mailto:',
    'tel:',
    'ftp://',
    'ftps://',
    'data:',
    'javascript:',
    '//'
]

const FENCE_RE = /^\s{0,3}(`{3,}|~{3,})/
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const INLINE_LINK_RE =
    /!?\[[^\]]*\]\(\s*(?:<([^>]+)>|([^)\s]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)/g
const REF_DEF_RE = /^\s{0,3}\[[^\]]+\]:\s*(?:<([^>]+)>|(\S+))/

/** 递归收集 docs 下的 Markdown 文件（跳过 node_modules） */
function collectMarkdownFiles(dir, result = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            collectMarkdownFiles(full, result)
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.md')) {
            result.push(full)
        }
    }
    return result
}

/**
 * 汇总扫描目标：仓库根 SCAN_ROOT_FILES + docs/**\/*.md。
 * 顺序固定（根文件在前），便于输出与 CI 日志对比。
 */
function collectScanFiles() {
    const files = []
    const missing = []
    for (const rel of SCAN_ROOT_FILES) {
        const abs = path.join(ROOT, rel)
        if (fs.existsSync(abs) && fs.statSync(abs).isFile()) files.push(abs)
        else missing.push(rel)
    }
    if (fs.existsSync(DOCS_DIR)) files.push(...collectMarkdownFiles(DOCS_DIR))
    return { files, missing }
}

/**
 * 屏蔽行内代码（CommonMark code span 规则：N 个反引号开始，必须由恰好 N 个反引号结束）。
 *
 * 不能简单用正则处理：文档里存在 ```text/``` 这类三重反引号行内代码，
 * 正则的回溯会把后续单反引号代码块错误配对，导致真正的代码示例被当成链接。
 * 这里按反引号「连续串长度」精确配对，命中区间用空格覆盖（保留换行以维持行号）。
 *
 * @param {string} text
 * @returns {string}
 */
function maskInlineCodeSpans(text) {
    const chars = text.split('')
    let index = 0

    while (index < text.length) {
        if (text[index] !== '`') {
            index++
            continue
        }

        let openLength = 0
        while (text[index + openLength] === '`') openLength++

        // 向右寻找长度恰好等于 openLength 的闭合串
        let cursor = index + openLength
        let closeStart = -1
        while (cursor < text.length) {
            if (text[cursor] === '`') {
                let runLength = 0
                while (text[cursor + runLength] === '`') runLength++
                if (runLength === openLength) {
                    closeStart = cursor
                    break
                }
                cursor += runLength
            } else {
                cursor++
            }
        }

        if (closeStart === -1) {
            // 无闭合串：按字面量处理，跳过该反引号串继续扫描
            index += openLength
            continue
        }

        const end = closeStart + openLength
        for (let position = index; position < end; position++) {
            if (chars[position] !== '\n') chars[position] = ' '
        }
        index = end
    }

    return chars.join('')
}

/**
 * 去掉围栏代码块（用空行占位以保留行号）。
 * 返回去掉代码块后的全文。
 */
function stripFencedCodeBlocks(text) {
    const lines = text.split(/\r?\n/)
    const output = []
    let fenceChar = null
    let fenceLength = 0

    for (const line of lines) {
        const match = FENCE_RE.exec(line)
        if (fenceChar === null) {
            if (match) {
                fenceChar = match[1][0]
                fenceLength = match[1].length
                output.push('')
                continue
            }
            output.push(line)
        } else {
            if (match && match[1][0] === fenceChar && match[1].length >= fenceLength) {
                fenceChar = null
                fenceLength = 0
            }
            output.push('')
        }
    }

    return output.join('\n')
}

/** 是否属于应忽略的链接目标 */
function isIgnoredTarget(rawTarget) {
    const target = rawTarget.trim()
    if (!target) return true
    if (target.startsWith('#')) return true
    return IGNORED_PREFIXES.some((prefix) => target.toLowerCase().startsWith(prefix))
}

/**
 * 校验单个链接目标。
 * @returns {{ok: boolean, reason?: string}}
 */
function checkTarget(sourceFile, rawTarget) {
    let target = rawTarget.trim()
    // 去掉锚点（只校验文件/目录存在性）
    const hashIndex = target.indexOf('#')
    if (hashIndex !== -1) target = target.slice(0, hashIndex)
    // 去掉查询串（Markdown 预览场景极少出现，出现时同样只校验路径）
    const queryIndex = target.indexOf('?')
    if (queryIndex !== -1) target = target.slice(0, queryIndex)
    if (!target) return { ok: true }

    let decoded
    try {
        decoded = decodeURIComponent(target)
    } catch {
        return { ok: false, reason: '非法 URL 编码' }
    }

    const resolved = path.resolve(path.dirname(sourceFile), decoded)
    const relativeToRepo = path.relative(ROOT, resolved)
    if (relativeToRepo.startsWith('..') || path.isAbsolute(relativeToRepo)) {
        return { ok: false, reason: '链接指向仓库外部' }
    }
    if (!fs.existsSync(resolved)) {
        return {
            ok: false,
            reason: `目标不存在（解析为 ${relativeToRepo.split(path.sep).join('/')}）`
        }
    }
    return { ok: true }
}

function main() {
    if (!fs.existsSync(DOCS_DIR)) {
        console.error(`[docs:check] 未找到 docs 目录：${DOCS_DIR}`)
        process.exitCode = 1
        return
    }

    const { files, missing } = collectScanFiles()
    const broken = []
    const checked = []
    const ignored = []
    let linkCount = 0

    for (const file of files) {
        const raw = fs.readFileSync(file, 'utf8')
        const withoutFences = stripFencedCodeBlocks(raw)
        const withoutComments = withoutFences.replace(HTML_COMMENT_RE, (comment) =>
            comment.replace(/[^\n]/g, '')
        )
        const withoutInlineCode = maskInlineCodeSpans(withoutComments)
        const lines = withoutInlineCode.split(/\r?\n/)

        for (let index = 0; index < lines.length; index++) {
            const line = lines[index]
            const lineNumber = index + 1
            const targets = []

            INLINE_LINK_RE.lastIndex = 0
            let match
            while ((match = INLINE_LINK_RE.exec(line)) !== null) {
                targets.push(match[1] ?? match[2])
            }
            const refMatch = REF_DEF_RE.exec(line)
            if (refMatch) {
                targets.push(refMatch[1] ?? refMatch[2])
            }

            for (const target of targets) {
                linkCount++
                const displayTarget = target.trim()
                if (isIgnoredTarget(displayTarget)) {
                    ignored.push({ file, line: lineNumber, target: displayTarget })
                    continue
                }
                const result = checkTarget(file, displayTarget)
                const relFile = path.relative(ROOT, file).split(path.sep).join('/')
                if (result.ok) {
                    checked.push(`${relFile}:${lineNumber} → ${displayTarget}`)
                } else {
                    broken.push({
                        file: relFile,
                        line: lineNumber,
                        target: displayTarget,
                        reason: result.reason
                    })
                }
            }
        }
    }

    const rootFileCount = files.filter((f) => path.dirname(f) === ROOT).length
    console.log('============================================================')
    console.log(' 文档相对链接检查（docs:check）')
    console.log('============================================================')
    console.log(
        `扫描文件：${files.length} 个 Markdown（仓库根 ${rootFileCount} 个：${SCAN_ROOT_FILES.join('、')}；docs 下 ${files.length - rootFileCount} 个）`
    )
    console.log('排除：HTML 生成物（docs/reports/html/**、docs/历史归档/*.html）；不校验锚点')
    for (const name of missing) console.warn(`  ⚠️ 仓库根文档不存在，已跳过：${name}`)
    console.log(
        `链接总数：${linkCount}（相对链接 ${checked.length + broken.length}，忽略外部/锚点 ${ignored.length}）`
    )
    if (LIST_ALL && checked.length) {
        console.log('\n[通过]')
        for (const item of checked) console.log(`  ✅ ${item}`)
    }
    if (broken.length) {
        console.log(`\n[断链] 共 ${broken.length} 处：`)
        for (const item of broken) {
            console.log(`  ❌ ${item.file}:${item.line} → ${item.target}（${item.reason}）`)
        }
        console.log('\n[docs:check] 失败：请修复上述相对链接后重试')
        process.exitCode = 1
        return
    }
    console.log('\n[docs:check] ✅ 全部相对链接有效（锚点按口径不校验）')
}

main()
