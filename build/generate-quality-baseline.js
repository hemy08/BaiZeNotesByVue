#!/usr/bin/env node
/**
 * 质量基线生成/校验脚本（结构优化第 3 批 3.1；P2-2 扩展：多文档口径自动校验）
 *
 * 背景：README / docs/wiki / docs/reports 的「当前基线」长期靠人工同步（H5 曾出现
 * 158/172/174 多口径；2026-11-20 扫描再次出现 3,767 / 3,778 用例、187 / 205 文件等多口径）。
 * 本脚本从**代码与产物**生成唯一基线（版本 / IPC / 测试文件数 / 测试用例数 / preload 白名单 /
 * 报告页数 / dist 产物），并在 `--check` 模式下把三份对外文档的「当前基线」相关行与期望值
 * 逐项比对，不一致即失败并打印期望值，供 CI quality-gate 使用。
 *
 * 用法：
 *   node build/generate-quality-baseline.js
 *       生成 out/analysis/quality-baseline.json（不校验文档，退出码 0）
 *   node build/generate-quality-baseline.js --check
 *       生成基线并校验三份文档（用例数缺 --test-json 时跳过，其余口径照常校验）
 *   node build/generate-quality-baseline.js --check --test-json=out/test-results/vitest.json
 *   node build/generate-quality-baseline.js --check --test-json out/test-results/vitest.json
 *       额外用 vitest `--reporter=json` 产物核对「测试文件数 / 用例数」
 *   node build/generate-quality-baseline.js --check --test-json=<json> --docs-root=<dir>
 *       用指定文档根目录（需含 README.md、docs/wiki/README.md、docs/reports/README.md）
 *       代替仓库根做口径校验；仅用于自测/注入验证，正式门禁不要传。
 *
 * 口径与来源：
 * - 版本：package.json version（appVersion 读 resources/config/version.json，仅记录不阻断）；
 * - IPC 通道 / 分组：src/shared/ipc-channels.ts 常量表（正则统计，口径与既有测试一致）；
 * - 测试文件数：默认统计 tests/**\/*.test.ts；传 --test-json 时改用 vitest JSON 的
 *   testResults.length（与实际执行文件一致）；
 * - 测试用例数：只能来自 vitest JSON（numTotalTests），未传 `--test-json` 时**不校验**用例数
 *   （向后兼容旧行为，并在输出中明确提示）；
 * - preload 白名单：src/preload/allowed-channels.generated.ts 三个导出数组的真实条目数
 *   （send/invoke、on/once、window.api），不从注释文案取值；
 * - 报告规模：docs/reports/md/**\/*.md 篇数、docs/reports/html/ 下页面数（排除 assets/ 下
 *   2 个导航片段），以及 01/02/03 分类篇数；
 * - dist 产物：out/build/dist/ 下最新 *_Setup_<version>_*.exe（不存在时留空，不阻断）。
 *
 * 向后兼容：
 * - 不传 `--test-json` 时除「用例数」外行为与旧版一致，`npm run quality:check` 仍可直接使用；
 * - 传了 `--test-json` 但文件不存在 / JSON 非法 / 无有效 testResults 时**直接报错**
 *   （旧版会静默降级为不校验，正是 CI 路径写错时口径失守的根因，故不再静默）；
 * - 生成模式（默认）只写产物、不校验文档；`--check` 模式才做文档比对，两种模式互不破坏。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'out', 'analysis')
/** 三份对外文档（相对文档根；默认仓库根，可用 --docs-root 覆盖做自测） */
const DOC_FILES = {
    readme: 'README.md',
    wiki: 'docs/wiki/README.md',
    reports: 'docs/reports/README.md'
}

/** 读取仓库内文本文件（统一 LF，避免 CRLF 干扰行内正则） */
function readText(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8').replace(/\r\n/g, '\n')
}

function walkFiles(dir, filter, acc = []) {
    if (!fs.existsSync(dir)) return acc
    for (const name of fs.readdirSync(dir)) {
        const p = path.join(dir, name)
        const st = fs.statSync(p)
        if (st.isDirectory()) walkFiles(p, filter, acc)
        else if (filter(name)) acc.push(p)
    }
    return acc
}

function getVersion() {
    const pkg = JSON.parse(readText('package.json'))
    let appVersion = ''
    try {
        appVersion = JSON.parse(readText('resources/config/version.json')).appVersion || ''
    } catch {
        /* 生成物缺失时不阻断 */
    }
    return { version: pkg.version, appVersion }
}

/** IPC 通道常量：`KEY: 'baize:xxx:yyy'` 计数与 4 空格缩进分组计数（与既有口径一致） */
function getIpcStats() {
    const src = readText('src/shared/ipc-channels.ts')
    const channels = (src.match(/:\s*'baize:[^']+'/g) || []).length
    const groups = (src.match(/^[ \t]{4}[A-Z_]+:\s*\{/gm) || []).length
    return { channels, groups }
}

function getTestStats() {
    const files = walkFiles(path.join(ROOT, 'tests'), (n) => n.endsWith('.test.ts'))
    let lines = 0
    for (const f of files) lines += fs.readFileSync(f, 'utf-8').split('\n').length
    return { files: files.length, lines }
}

/** 生成的白名单数组条目数（不读注释文案，防止注释与数组漂移） */
function countIpcEntries(source, constName) {
    const match = new RegExp(
        `export const ${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*as const`
    ).exec(source)
    if (!match) return null
    return (match[1].match(/IPC\.[A-Za-z0-9_]+\.[A-Za-z0-9_]+/g) || []).length
}

function getWhitelistStats() {
    const rel = 'src/preload/allowed-channels.generated.ts'
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) {
        return { send: null, receive: null, api: null, missing: rel }
    }
    const src = fs.readFileSync(abs, 'utf-8').replace(/\r\n/g, '\n')
    return {
        send: countIpcEntries(src, 'RENDERER_SEND_CHANNELS'),
        receive: countIpcEntries(src, 'RENDERER_RECEIVE_CHANNELS'),
        api: countIpcEntries(src, 'PRELOAD_API_CHANNELS')
    }
}

/** 报告规模：md 篇数（含 01/02/03 分类）+ HTML Wiki 页面数（排除 assets 导航片段） */
function getReportStats() {
    const mdDir = path.join(ROOT, 'docs/reports/md')
    const rows = []
    if (fs.existsSync(mdDir)) {
        for (const entry of fs
            .readdirSync(mdDir, { withFileTypes: true })
            .sort((a, b) => a.name.localeCompare(b.name))) {
            if (!entry.isDirectory()) continue
            const count = fs
                .readdirSync(path.join(mdDir, entry.name))
                .filter((name) => name.toLowerCase().endsWith('.md')).length
            rows.push({ dir: entry.name, count })
        }
    }
    const md = rows.reduce((sum, row) => sum + row.count, 0)
    const categoryCounts = rows.map((row) => row.count)

    const htmlDir = path.join(ROOT, 'docs/reports/html')
    let htmlPages = 0
    let htmlFragments = 0
    const walkHtml = (dir) => {
        if (!fs.existsSync(dir)) return
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name)
            if (entry.isDirectory()) {
                walkHtml(full)
            } else if (entry.name.toLowerCase().endsWith('.html')) {
                // assets/ 为各页面共享的导航片段，不计入 Wiki 页面数
                if (full.split(path.sep).includes('assets')) htmlFragments++
                else htmlPages++
            }
        }
    }
    walkHtml(htmlDir)
    return { md, htmlPages, htmlFragments, categories: rows, categoryCounts }
}

function getDistStats() {
    // M7 产物治理：electron-builder 输出目录已迁至 out/build/dist（历史 dist/ 已归档到 out/archive/dist）
    const dist = path.join(ROOT, 'out', 'build', 'dist')
    if (!fs.existsSync(dist)) return []
    return fs
        .readdirSync(dist)
        .filter((n) => n.endsWith('.exe') && fs.statSync(path.join(dist, n)).isFile())
        .map((n) => ({ name: n, bytes: fs.statSync(path.join(dist, n)).size }))
        .sort((a, b) => b.bytes - a.bytes)
}

/**
 * 解析 vitest `--reporter=json` 产物。
 * @returns {{ok: boolean, error?: string, stats?: {files: number, cases: number, passed: number, failed: number, rel: string}}}
 */
function getTestJsonStats(file) {
    if (!file) return { ok: true, stats: null }
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file)
    const rel = path.relative(ROOT, abs).split(path.sep).join('/')
    if (!fs.existsSync(abs)) {
        return {
            ok: false,
            error: `未找到 vitest JSON 报告：${rel}（请先执行 vitest run --reporter=json --outputFile.json=<path>）`
        }
    }
    let json
    try {
        json = JSON.parse(fs.readFileSync(abs, 'utf-8'))
    } catch (error) {
        return { ok: false, error: `无法解析 vitest JSON 报告 ${rel}：${error.message}` }
    }
    const files = Array.isArray(json.testResults) ? json.testResults.length : 0
    const cases = Number(json.numTotalTests ?? 0)
    if (!files || !Number.isFinite(cases) || cases <= 0) {
        return { ok: false, error: `vitest JSON 报告 ${rel} 缺少有效 testResults / numTotalTests` }
    }
    return {
        ok: true,
        stats: {
            files,
            cases,
            passed: Number(json.numPassedTests ?? 0),
            failed: Number(json.numFailedTests ?? 0),
            rel
        }
    }
}

/* ============================================================================
 * 文档口径比对（--check 模式）
 *
 * 只比对「当前基线」承载行，不全文扫描：
 * - 历史报告/变更记录中的时点数字不属于当前口径，全文扫描会误报；
 * - 每份文档用稳定的行标记（表格行名 / 固定措辞）定位，行内再按「指标 + 期望值」提取。
 * 提取不到（文档改写）时：required 规则直接失败并提示期望值，可选规则只告警。
 * ========================================================================== */

/** 事实规格：label 用于报错文案，expected 从期望对象取真值，format 用于展示 */
const FACT_SPECS = {
    version: { label: '版本', expected: (exp) => exp.version, format: (v) => String(v) },
    testFiles: {
        label: '测试文件数',
        expected: (exp) => exp.testFiles,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    testCases: {
        label: '测试用例数',
        expected: (exp) => exp.testCases,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    testLines: {
        label: '测试代码行数',
        expected: (exp) => exp.testLines,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    ipcChannels: {
        label: 'IPC 通道数',
        expected: (exp) => exp.ipc.channels,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    ipcGroups: {
        label: 'IPC 分组数',
        expected: (exp) => exp.ipc.groups,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    whitelistSend: {
        label: 'preload send/invoke 白名单',
        expected: (exp) => exp.whitelist.send,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    whitelistReceive: {
        label: 'preload on/once 白名单',
        expected: (exp) => exp.whitelist.receive,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    whitelistApi: {
        label: 'preload window.api 白名单',
        expected: (exp) => exp.whitelist.api,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    reportMd: {
        label: '报告 Markdown 篇数',
        expected: (exp) => exp.reports.md,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    reportHtmlPages: {
        label: 'HTML Wiki 页面数',
        expected: (exp) => exp.reports.htmlPages,
        format: (v) => Number(v).toLocaleString('en-US')
    },
    reportCategories: {
        label: '报告分类篇数（01/02/03）',
        expected: (exp) => exp.reports.categoryCounts,
        format: (v) => (Array.isArray(v) ? v.join(' / ') : String(v))
    }
}

/** 行内提取器：返回 [{key, value}]（同一指标可能出现多次，全部参与校验） */
const FACT_EXTRACTORS = {
    version(line) {
        const match = /(?:版本\s*(?:\*\*)?\s*|v)(\d+\.\d+\.\d+)/.exec(line)
        return match ? [{ key: 'version', value: match[1] }] : []
    },
    /** 测试文件数 + 用例数（成对写法：`205 文件 / 3,778 用例` 及变体） */
    tests(line) {
        const facts = []
        const spans = []
        const pairRe =
            /(\d{1,4})\s*(?:个\s*)?(?:`?\.test\.ts`?\s*(?:文件)?|测试文件|文件)?\s*[/／]\s*(\d{1,3}(?:,\d{3})+|\d{4,})\s*(?:个\s*)?用例/g
        let match
        while ((match = pairRe.exec(line)) !== null) {
            spans.push([match.index, match.index + match[0].length])
            facts.push({ key: 'testFiles', value: Number(match[1]) })
            facts.push({ key: 'testCases', value: Number(match[2].replace(/,/g, '')) })
        }
        // 独立用例数（如表格里「3,778 个用例」与文件数分列）
        const caseRe = /(\d{1,3}(?:,\d{3})+|\d{4,})\s*(?:个\s*)?用例/g
        while ((match = caseRe.exec(line)) !== null) {
            if (spans.some(([start, end]) => match.index >= start && match.index < end)) continue
            facts.push({ key: 'testCases', value: Number(match[1].replace(/,/g, '')) })
        }
        // 独立文件数（如「205 个 `.test.ts` 文件」）
        const fileRe = /(\d{1,4})\s*个\s*(?:`?\.test\.ts`?\s*(?:文件)?|测试文件)/g
        while ((match = fileRe.exec(line)) !== null) {
            if (spans.some(([start, end]) => match.index >= start && match.index < end)) continue
            facts.push({ key: 'testFiles', value: Number(match[1]) })
        }
        return facts
    },
    ipc(line) {
        const collect = (re) => {
            const found = []
            let match
            while ((match = re.exec(line)) !== null) {
                found.push(
                    { key: 'ipcChannels', value: Number(match[1]) },
                    { key: 'ipcGroups', value: Number(match[2]) }
                )
            }
            return found
        }
        const primary = collect(
            /(\d{1,3})\s*(?:个\s*)?(?:IPC\s*)?通道\s*[/／]\s*(\d{1,2})\s*个?\s*组/g
        )
        if (primary.length) return primary
        // 表格简写：`91 个 / 17 组`
        return collect(/(\d{1,3})\s*个\s*[/／]\s*(\d{1,2})\s*个?\s*组/g)
    },
    whitelist(line) {
        const facts = []
        const send = /send(?:\/invoke)?\s*`?\s*(?:\*\*)?\s*(\d{1,3})/i.exec(line)
        if (send) facts.push({ key: 'whitelistSend', value: Number(send[1]) })
        const receive = /(?:receive|on\/once)\s*`?\s*(?:\*\*)?\s*(\d{1,3})/i.exec(line)
        if (receive) facts.push({ key: 'whitelistReceive', value: Number(receive[1]) })
        const api = /(?:window\.)?api`?\s*(?:\*\*)?\s*(\d{1,3})/i.exec(line)
        if (api) facts.push({ key: 'whitelistApi', value: Number(api[1]) })
        if (facts.length) return facts
        // 简写：`白名单 60+25`
        const pair = /白名单[^0-9\n]{0,8}(\d{1,3})\s*\+\s*(\d{1,3})/.exec(line)
        if (!pair) return []
        return [
            { key: 'whitelistSend', value: Number(pair[1]) },
            { key: 'whitelistReceive', value: Number(pair[2]) }
        ]
    },
    /** 报告篇数 / HTML 页面数（成对写法优先，其次分别提取） */
    pages(line) {
        const facts = []
        const pair =
            /(?:md|Markdown)[^0-9\n]{0,14}?(\d{1,3})\s*篇[^0-9\n]{0,60}?HTML\s*(?:Wiki)?[^0-9\n]{0,60}?(\d{1,3})\s*个?页/i.exec(
                line
            )
        if (pair) {
            facts.push({ key: 'reportMd', value: Number(pair[1]) })
            facts.push({ key: 'reportHtmlPages', value: Number(pair[2]) })
            return facts
        }
        const md = /(?:md|Markdown)[^0-9\n]{0,14}?(\d{1,3})\s*篇/i.exec(line)
        if (md) facts.push({ key: 'reportMd', value: Number(md[1]) })
        const html = /HTML[^0-9\n]{0,60}?(\d{1,3})\s*个?页/i.exec(line)
        if (html) facts.push({ key: 'reportHtmlPages', value: Number(html[1]) })
        const pageLabel = /页面[：:]\s*(?:\*\*)?\s*(\d{1,3})\s*个?/.exec(line)
        if (pageLabel) facts.push({ key: 'reportHtmlPages', value: Number(pageLabel[1]) })
        return facts
    },
    /** 报告分类篇数：`01 类 10 / 02 类 8 / 03 类 8` 及其变体 */
    categories(line) {
        const match =
            /01[^0-9\n]{0,14}?(\d{1,3})\s*[/／]\s*02[^0-9\n]{0,14}?(\d{1,3})\s*[/／]\s*03[^0-9\n]{0,14}?(\d{1,3})/.exec(
                line
            )
        if (!match) return []
        return [
            {
                key: 'reportCategories',
                value: [Number(match[1]), Number(match[2]), Number(match[3])]
            }
        ]
    },
    /** README「代码规模分布」表中的 `| 单元测试（.test.ts） | 187 | 58,434 |` 行 */
    testScaleRow(line) {
        if (!line.includes('单元测试（.test.ts）')) return []
        const cells = line
            .split('|')
            .map((cell) => cell.trim())
            .filter((cell) => cell !== '')
        if (cells.length < 3) return []
        const files = /^\d{1,4}$/.exec(cells[1])
        const lines = /^\d{1,3}(?:,\d{3})+$|^\d{4,}$/.exec(cells[2])
        if (!files || !lines) return []
        return [
            { key: 'testFiles', value: Number(cells[1]) },
            { key: 'testLines', value: Number(cells[2].replace(/,/g, '')) }
        ]
    }
}

/**
 * 文档校验规则：
 * - file：DOC_FILES 键；
 * - label：报错时的行定位说明；
 * - match：行匹配函数（稳定措辞/表格行名）；
 * - checks：行内提取器列表；
 * - required：规则定位不到行时是否失败（承载「当前基线」的表格行/基线行必须存在）；
 * - requiredFacts：该行必须包含的口径（否则失败；期望值为 null 的口径如未传 --test-json 的
 *   用例数会自动跳过）。
 */
const DOC_RULES = [
    {
        file: 'reports',
        label: '「当前基线」行',
        required: true,
        match: (line) => line.includes('当前基线'),
        checks: ['version', 'tests', 'ipc', 'whitelist', 'pages', 'categories'],
        requiredFacts: [
            'testFiles',
            'testCases',
            'ipcChannels',
            'ipcGroups',
            'whitelistSend',
            'whitelistReceive',
            'whitelistApi',
            'reportMd',
            'reportHtmlPages',
            'reportCategories'
        ]
    },
    {
        file: 'reports',
        label: '「当前唯一现行口径」行',
        required: false,
        match: (line) => line.includes('当前唯一现行口径'),
        checks: ['ipc', 'whitelist'],
        requiredFacts: ['ipcChannels', 'ipcGroups', 'whitelistSend', 'whitelistReceive']
    },
    {
        file: 'reports',
        label: '历史值/当前口径段',
        required: false,
        match: (line) => line.includes('当前口径为'),
        checks: ['tests', 'ipc', 'whitelist'],
        requiredFacts: ['testFiles', 'testCases']
    },
    {
        file: 'reports',
        label: '2026-11-20 复核段',
        required: false,
        match: (line) => line.includes('当前基线按 HEAD 实测刷新为'),
        checks: ['tests', 'ipc', 'whitelist'],
        requiredFacts: ['testFiles', 'testCases']
    },
    {
        file: 'reports',
        label: '目录说明行',
        required: false,
        match: (line) => line.includes('本目录为项目检查'),
        checks: ['pages']
    },
    {
        file: 'reports',
        label: 'HTML Wiki 页面行',
        required: false,
        match: (line) => line.includes('页面：**'),
        checks: ['pages', 'categories']
    },
    {
        file: 'wiki',
        label: '文档中心头行',
        required: false,
        match: (line) => line.includes('文档中心'),
        checks: ['pages']
    },
    {
        file: 'wiki',
        label: 'IPC 通道常量行',
        required: true,
        match: (line) => /^\|\s*IPC 通道常量\s*\|/.test(line),
        checks: ['ipc'],
        requiredFacts: ['ipcChannels', 'ipcGroups']
    },
    {
        file: 'wiki',
        label: 'preload 白名单行',
        required: true,
        match: (line) => /^\|\s*preload 白名单\s*\|/.test(line),
        checks: ['whitelist'],
        requiredFacts: ['whitelistSend', 'whitelistReceive', 'whitelistApi']
    },
    {
        file: 'wiki',
        label: '单元测试行',
        required: true,
        match: (line) => /^\|\s*单元测试\s*\|/.test(line),
        checks: ['tests'],
        requiredFacts: ['testFiles', 'testCases']
    },
    {
        file: 'wiki',
        label: '报告规模行',
        required: true,
        match: (line) => /^\|\s*报告规模\s*\|/.test(line),
        checks: ['pages', 'categories'],
        requiredFacts: ['reportMd', 'reportHtmlPages', 'reportCategories']
    },
    {
        file: 'wiki',
        label: '门禁实测行',
        required: false,
        match: (line) => line.includes('门禁（2026-11-20'),
        checks: ['tests']
    },
    {
        file: 'wiki',
        label: '2026-11-20 实测口径段',
        required: false,
        match: (line) => line.includes('2026-11-20 实测口径'),
        checks: ['tests', 'ipc', 'whitelist']
    },
    {
        file: 'wiki',
        label: 'HTML Wiki 文档导航行',
        required: false,
        match: (line) => line.includes('报告 **HTML Wiki**'),
        checks: ['pages']
    },
    {
        file: 'readme',
        label: '统计表 IPC 通道行',
        required: true,
        match: (line) => /^\|\s*IPC 通道\s*\|/.test(line),
        checks: ['ipc'],
        requiredFacts: ['ipcChannels', 'ipcGroups']
    },
    {
        file: 'readme',
        label: '统计表 preload 白名单行',
        required: true,
        match: (line) => /^\|\s*preload 白名单\s*\|/.test(line),
        checks: ['whitelist'],
        requiredFacts: ['whitelistSend', 'whitelistReceive', 'whitelistApi']
    },
    {
        file: 'readme',
        label: '统计表单元测试行',
        required: true,
        match: (line) => /^\|\s*单元测试\s*\|/.test(line),
        checks: ['tests'],
        requiredFacts: ['testFiles', 'testCases']
    },
    {
        file: 'readme',
        label: '统计表文档规模行',
        required: true,
        match: (line) => /^\|\s*文档规模\s*\|/.test(line),
        checks: ['pages', 'categories'],
        requiredFacts: ['reportMd', 'reportHtmlPages', 'reportCategories']
    },
    {
        file: 'readme',
        label: '目录树 tests 行',
        required: false,
        match: (line) => line.includes('tests/') && line.includes('单元测试'),
        checks: ['tests']
    },
    {
        file: 'readme',
        label: '目录树 IPC 通道行',
        required: false,
        match: (line) => line.includes('ipc-channels.ts'),
        checks: ['ipc']
    },
    {
        file: 'readme',
        label: '目录树白名单行',
        required: false,
        match: (line) => line.includes('allowed-channels.generated.ts'),
        checks: ['whitelist']
    },
    {
        file: 'readme',
        label: '目录树报告 Markdown 行',
        required: false,
        match: (line) => line.includes('Markdown 报告（'),
        checks: ['pages', 'categories']
    },
    {
        file: 'readme',
        label: '目录树 HTML Wiki 行',
        required: false,
        match: (line) => line.includes('HTML 报告 Wiki（'),
        checks: ['pages']
    },
    {
        file: 'readme',
        label: 'Vitest 技术栈行',
        required: false,
        match: (line) => /^\|\s*Vitest\s*\|/.test(line),
        checks: ['tests']
    },
    {
        file: 'readme',
        label: '单元测试命令说明行',
        required: false,
        match: (line) => line.includes('# 运行单元测试（'),
        checks: ['tests']
    },
    {
        file: 'readme',
        label: '文档口径统一清单行',
        required: false,
        match: (line) => line.includes('文档口径统一（2026-11-20）'),
        checks: ['tests', 'ipc', 'whitelist', 'pages']
    },
    {
        file: 'readme',
        label: '代码规模分布·单元测试行',
        required: true,
        match: (line) => line.includes('单元测试（.test.ts）'),
        checks: ['testScaleRow'],
        requiredFacts: ['testFiles', 'testLines']
    }
]

/** 文档口径校验；返回 {errors, warnings, ruleCount, factCount} */
function validateDocs(expected, docsRoot) {
    const errors = []
    const warnings = []
    let ruleCount = 0
    let factCount = 0

    const docLines = new Map()
    for (const rel of Object.values(DOC_FILES)) {
        const abs = path.join(docsRoot, rel)
        docLines.set(rel, fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8').split(/\r?\n/) : null)
    }

    const displayFile = (rel) => (docsRoot === ROOT ? rel : `${rel}（--docs-root 副本）`)

    for (const rule of DOC_RULES) {
        const rel = DOC_FILES[rule.file]
        const lines = docLines.get(rel)
        if (!lines) {
            const message = `${displayFile(rel)}：文件不存在，无法校验 ${rule.label}`
            if (rule.required) errors.push(message)
            else warnings.push(message)
            continue
        }
        const lineIndex = lines.findIndex((line) => rule.match(line))
        if (lineIndex === -1) {
            const message = `${displayFile(rel)}：未找到 ${rule.label}（文档措辞可能已改；required 规则必须可定位）`
            if (rule.required) errors.push(message)
            else warnings.push(message)
            continue
        }
        ruleCount++
        const line = lines[lineIndex]
        const location = `${displayFile(rel)}:${lineIndex + 1} ${rule.label}`

        /** 同一指标可能在一行出现多次（如基线行同时写新旧口径），全部校验 */
        const found = new Map()
        for (const kind of rule.checks) {
            for (const fact of FACT_EXTRACTORS[kind](line)) {
                if (!found.has(fact.key)) found.set(fact.key, [])
                found.get(fact.key).push(fact.value)
            }
        }

        for (const key of rule.requiredFacts || []) {
            const spec = FACT_SPECS[key]
            const expectedValue = spec.expected(expected)
            if (expectedValue == null) continue
            if (!found.has(key)) {
                errors.push(
                    `${location} 缺少「${spec.label}」口径（期望 ${spec.format(expectedValue)}）`
                )
            }
        }

        for (const [key, values] of found) {
            const spec = FACT_SPECS[key]
            const expectedValue = spec.expected(expected)
            if (expectedValue == null) {
                warnings.push(
                    `${location} 跳过「${spec.label}」校验：未提供 vitest JSON（--test-json=<path>）`
                )
                continue
            }
            for (const value of values) {
                factCount++
                if (factsEqual(key, expectedValue, value)) continue
                errors.push(
                    `${location} 「${spec.label}」不一致：文档=${spec.format(value)} / 期望=${spec.format(expectedValue)}`
                )
            }
        }
    }

    return { errors, warnings, ruleCount, factCount }
}

function factsEqual(key, expectedValue, actualValue) {
    if (key === 'version') return String(actualValue) === String(expectedValue)
    if (Array.isArray(expectedValue) || Array.isArray(actualValue)) {
        return JSON.stringify(actualValue) === JSON.stringify(expectedValue)
    }
    return Number(actualValue) === Number(expectedValue)
}

/** 解析 CLI 参数（支持 --test-json=<path> 与 --test-json <path> 两种写法） */
function parseArgs(argv) {
    const options = { check: false, testJson: '', docsRoot: '', help: false }
    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index]
        if (arg === '--check') options.check = true
        else if (arg === '--help' || arg === '-h') options.help = true
        else if (arg === '--test-json' || arg === '--docs-root') {
            const value = argv[index + 1]
            index++
            if (!value || value.startsWith('--')) {
                return { error: `${arg} 缺少路径参数` }
            }
            if (arg === '--test-json') options.testJson = value
            else options.docsRoot = value
        } else if (arg.startsWith('--test-json=')) {
            options.testJson = arg.slice('--test-json='.length)
            if (!options.testJson) return { error: '--test-json= 路径不能为空' }
        } else if (arg.startsWith('--docs-root=')) {
            options.docsRoot = arg.slice('--docs-root='.length)
            if (!options.docsRoot) return { error: '--docs-root= 路径不能为空' }
        } else {
            return {
                error: `未知参数：${arg}（可用：--check / --test-json=<path> / --docs-root=<dir>）`
            }
        }
    }
    return { options }
}

function printUsage() {
    console.log(
        [
            '用法：node build/generate-quality-baseline.js [--check] [--test-json=<path>] [--docs-root=<dir>]',
            '  --check               生成基线并校验 README / docs/wiki/README.md / docs/reports/README.md 口径',
            '  --test-json=<path>    vitest `--reporter=json` 产物；提供后校验测试文件数 / 用例数',
            '  --docs-root=<dir>     用指定文档根目录做口径校验（自测/注入验证用，默认仓库根）'
        ].join('\n')
    )
}

function main() {
    const parsed = parseArgs(process.argv.slice(2))
    if (parsed.error) {
        console.error(`[quality-baseline] ❌ ${parsed.error}`)
        process.exit(1)
    }
    const { check, testJson, docsRoot } = parsed.options
    if (parsed.options.help) {
        printUsage()
        return
    }
    const docsRootAbs = docsRoot ? path.resolve(ROOT, docsRoot) : ROOT

    const testJsonResult = getTestJsonStats(testJson)
    if (!testJsonResult.ok) {
        console.error(`[quality-baseline] ❌ ${testJsonResult.error}`)
        process.exit(1)
    }
    const testJsonStats = testJsonResult.stats

    const { version, appVersion } = getVersion()
    const ipc = getIpcStats()
    const tests = getTestStats()
    const whitelist = getWhitelistStats()
    const reports = getReportStats()
    const dist = getDistStats()

    const expected = {
        version,
        appVersion,
        testFiles: testJsonStats ? testJsonStats.files : tests.files,
        testCases: testJsonStats ? testJsonStats.cases : null,
        testLines: tests.lines,
        testSource: testJsonStats ? testJsonStats.rel : '',
        ipc,
        whitelist,
        reports
    }

    const baseline = {
        generatedAt: new Date().toISOString(),
        version,
        appVersion,
        ipc,
        whitelist: { send: whitelist.send, receive: whitelist.receive, api: whitelist.api },
        tests: {
            files: expected.testFiles,
            fileCountSource: testJsonStats
                ? `vitest-json:${testJsonStats.rel}`
                : 'tests/**/*.test.ts',
            cases: expected.testCases,
            passed: testJsonStats ? testJsonStats.passed : null,
            failed: testJsonStats ? testJsonStats.failed : null,
            lines: tests.lines
        },
        reports: {
            md: reports.md,
            htmlPages: reports.htmlPages,
            htmlFragments: reports.htmlFragments,
            categories: reports.categories
        },
        dist
    }

    fs.mkdirSync(OUT_DIR, { recursive: true })
    const outFile = path.join(OUT_DIR, 'quality-baseline.json')
    fs.writeFileSync(outFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8')
    console.log(`[quality-baseline] 已生成 ${path.relative(ROOT, outFile)}`)
    console.log(
        `  version=${version} appVersion=${appVersion} IPC=${ipc.channels}/${ipc.groups} ` +
            `白名单=${whitelist.send ?? '?'}+${whitelist.receive ?? '?'}+api ${whitelist.api ?? '?'} ` +
            `测试=${expected.testFiles} 文件/${tests.lines} 行` +
            (testJsonStats
                ? `/${testJsonStats.cases} 用例（来源 ${testJsonStats.rel}）`
                : '（用例数需 --test-json）') +
            ` 报告=md ${reports.md} 篇/HTML ${reports.htmlPages} 页`
    )
    if (dist.length) console.log(`  dist 产物 ${dist.length} 个，最大 ${dist[0].name}`)
    if (whitelist.missing) {
        console.warn(`[quality-baseline] ⚠️ 未找到白名单生成物：${whitelist.missing}`)
    }

    if (!check) {
        console.log('[quality-baseline] 生成模式完成（未校验文档；加 --check 执行口径校验）')
        return
    }

    const result = validateDocs(expected, docsRootAbs)
    for (const warning of result.warnings) console.warn(`[quality-baseline] ⚠️ ${warning}`)
    if (result.errors.length) {
        console.error('[quality-baseline] ❌ 文档「当前基线」口径与代码/实测不一致：')
        for (const error of result.errors) console.error(`  - ${error}`)
        console.error(
            '  请更新上述文档口径行（期望值来源：代码常量 / vitest JSON / 目录实测），' +
                '或确认代码变更是否属实；历史报告中的时点数字不需要改。'
        )
        process.exit(1)
    }
    console.log(
        `[quality-baseline] ✅ 文档口径一致（${result.ruleCount} 条规则 / ${result.factCount} 项事实；` +
            `docs-root=${docsRoot ? path.relative(ROOT, docsRootAbs) : '仓库根'}）`
    )
    if (!testJsonStats) {
        console.log('  提示：未传 --test-json，本次未校验测试用例数（CI 已传入 vitest JSON）')
    }
}

if (require.main === module) main()
