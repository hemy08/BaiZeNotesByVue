#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS 构建脚本，由 node 直接运行 */
/**
 * 质量基线生成/校验脚本（结构优化第 3 批 3.1：文档口径自动化）
 *
 * 背景：README / docs/reports 的「当前基线」长期靠人工同步（H5 曾出现 158/172/174 多口径）。
 * 本脚本从**代码与产物**生成唯一基线（版本 / IPC 通道 / 测试文件数 / 测试用例数 / dist 产物），
 * 并可通过 `--check` 与 docs/reports/README.md 的当前基线行比对，不一致即失败，供 CI 门禁使用。
 *
 * 用法：
 *   node build/generate-quality-baseline.js                生成 out/analysis/quality-baseline.json
 *   node build/generate-quality-baseline.js --check        与 docs 基线比对（不含用例数）
 *   node build/generate-quality-baseline.js --check --test-json=out/test-results.json
 *                                                         额外核对 vitest JSON 的用例数
 *
 * 口径说明：测试文件数只统计 tests/**\/*.test.ts；用例数需 vitest `--reporter=json` 报告；
 * dist 产物取 dist/ 下最新 *_Setup_<version>_*.exe（不存在时留空，不阻断）。
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const OUT_DIR = path.join(ROOT, 'out', 'analysis')
const DOC_BASELINE = path.join(ROOT, 'docs', 'reports', 'README.md')

function readText(rel) {
    return fs.readFileSync(path.join(ROOT, rel), 'utf-8')
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

function getDistStats() {
    const dist = path.join(ROOT, 'dist')
    if (!fs.existsSync(dist)) return []
    return fs
        .readdirSync(dist)
        .filter((n) => n.endsWith('.exe') && fs.statSync(path.join(dist, n)).isFile())
        .map((n) => ({ name: n, bytes: fs.statSync(path.join(dist, n)).size }))
        .sort((a, b) => b.bytes - a.bytes)
}

function getTestJsonStats(file) {
    if (!file) return null
    const abs = path.isAbsolute(file) ? file : path.join(ROOT, file)
    if (!fs.existsSync(abs)) return null
    try {
        const j = JSON.parse(fs.readFileSync(abs, 'utf-8'))
        const cases = Number(j.numTotalTests ?? 0)
        return cases > 0 ? { cases } : null
    } catch {
        return null
    }
}

/** 解析 docs/reports/README.md 的当前基线行：版本 X；测试 N 文件 / M 用例；IPC C 通道 / G 组 */
function parseDocBaseline() {
    if (!fs.existsSync(DOC_BASELINE)) return null
    const line = fs
        .readFileSync(DOC_BASELINE, 'utf-8')
        .split('\n')
        .find((l) => l.includes('当前基线') && l.includes('版本'))
    if (!line) return null
    const version = /版本\s*\*\*(\d+\.\d+\.\d+)\*\*/.exec(line)?.[1] ?? ''
    const tests = /测试\s*\*\*(\d+)\s*文件\s*\/\s*([\d,]+)\s*用例/.exec(line)
    const ipc = /IPC\s*\*\*(\d+)\s*通道\s*\/\s*(\d+)\s*组\*\*/.exec(line)
    return {
        version,
        testFiles: tests ? Number(tests[1]) : null,
        testCases: tests ? Number(tests[2].replace(/,/g, '')) : null,
        ipcChannels: ipc ? Number(ipc[1]) : null,
        ipcGroups: ipc ? Number(ipc[2]) : null,
        raw: line.trim()
    }
}

function main() {
    const args = process.argv.slice(2)
    const check = args.includes('--check')
    const testJsonArg = args.find((a) => a.startsWith('--test-json='))
    const testJson = testJsonArg ? testJsonArg.slice('--test-json='.length) : ''

    const { version, appVersion } = getVersion()
    const ipc = getIpcStats()
    const tests = getTestStats()
    const dist = getDistStats()
    const cases = getTestJsonStats(testJson)
    const baseline = {
        generatedAt: new Date().toISOString(),
        version,
        appVersion,
        ipc,
        tests: { ...tests, cases: cases?.cases ?? null },
        dist
    }
    fs.mkdirSync(OUT_DIR, { recursive: true })
    const outFile = path.join(OUT_DIR, 'quality-baseline.json')
    fs.writeFileSync(outFile, `${JSON.stringify(baseline, null, 2)}\n`, 'utf-8')
    console.log(`[quality-baseline] 已生成 ${path.relative(ROOT, outFile)}`)
    console.log(
        `  version=${version} appVersion=${appVersion} IPC=${ipc.channels}/${ipc.groups} 测试=${tests.files} 文件/${tests.lines} 行` +
            (cases ? `/${cases.cases} 用例` : '（用例数需 --test-json）')
    )
    if (dist.length) console.log(`  dist 产物 ${dist.length} 个，最大 ${dist[0].name}`)

    if (!check) return
    const doc = parseDocBaseline()
    if (!doc) {
        console.error('[quality-baseline] 未找到 docs/reports/README.md 当前基线行')
        process.exit(1)
    }
    const errors = []
    if (doc.version && doc.version !== version)
        errors.push(`版本：docs=${doc.version} / 实际=${version}`)
    if (doc.testFiles != null && doc.testFiles !== tests.files)
        errors.push(`测试文件：docs=${doc.testFiles} / 实际=${tests.files}`)
    if (cases && doc.testCases != null && doc.testCases !== cases.cases)
        errors.push(`测试用例：docs=${doc.testCases} / 实际=${cases.cases}`)
    if (doc.ipcChannels != null && doc.ipcChannels !== ipc.channels)
        errors.push(`IPC 通道：docs=${doc.ipcChannels} / 实际=${ipc.channels}`)
    if (doc.ipcGroups != null && doc.ipcGroups !== ipc.groups)
        errors.push(`IPC 分组：docs=${doc.ipcGroups} / 实际=${ipc.groups}`)
    if (errors.length) {
        console.error('[quality-baseline] ❌ 文档基线与代码/产物不一致：')
        for (const e of errors) console.error(`  - ${e}`)
        console.error(`  基线行：${doc.raw}`)
        process.exit(1)
    }
    console.log('[quality-baseline] ✅ docs 当前基线与代码/产物一致')
}

if (require.main === module) main()
