#!/usr/bin/env node
/**
 * 拉取 GitHub Dependabot 全量 open 告警并生成分类聚合 JSON。
 *
 * 用法：
 *   node build/fetch-dependabot-alerts.mjs [--repo owner/name] [--out out/dependabot]
 *
 * 凭据：通过 `git credential fill` 从本机 Git 凭据管理器读取 github.com 的 token，
 * 不在脚本或仓库中硬编码任何密钥。
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const API_VERSION = '2022-11-28'
const PER_PAGE = 100
const MAX_PAGES = 50

function parseArgs(argv) {
    const args = { repo: 'hemy08/BaiZeNotesByVue', out: 'out/dependabot' }
    for (let i = 2; i < argv.length; i++) {
        const key = argv[i]
        if (key === '--repo') args.repo = argv[++i]
        else if (key === '--out') args.out = argv[++i]
        else throw new Error(`未知参数: ${key}`)
    }
    return args
}

function readGitHubToken() {
    const result = spawnSync('git', ['credential', 'fill'], {
        input: 'protocol=https\nhost=github.com\n\n',
        encoding: 'utf8',
        windowsHide: true
    })
    if (result.error) throw new Error(`git credential fill 执行失败: ${result.error.message}`)
    const passwordLine = String(result.stdout || '')
        .split(/\r?\n/)
        .find((line) => line.startsWith('password='))
    if (!passwordLine) throw new Error('git credential fill 未返回 password，请先登录 github.com')
    return passwordLine.slice('password='.length).trim()
}

async function apiGet(url, token) {
    const res = await fetch(url, {
        headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': API_VERSION,
            'User-Agent': 'baize-dependabot-audit'
        }
    })
    if (!res.ok) {
        const body = await res.text()
        throw new Error(`HTTP ${res.status} ${url}\n${body.slice(0, 500)}`)
    }
    const link = res.headers.get('link') || ''
    const nextMatch = link.match(/<([^>]+)>;\s*rel="next"/)
    return { data: await res.json(), next: nextMatch ? nextMatch[1] : null }
}

async function fetchAllAlerts(repo, token) {
    // Dependabot alerts 接口不支持 page 参数，使用 Link rel="next" 游标分页
    const all = []
    const pageInfo = []
    let url = `https://api.github.com/repos/${repo}/dependabot/alerts?state=open&per_page=${PER_PAGE}`
    for (let page = 1; url && page <= MAX_PAGES; page++) {
        const { data, next } = await apiGet(url, token)
        pageInfo.push({ page, count: data.length, hasNext: Boolean(next) })
        all.push(...data)
        url = next
    }
    return { alerts: all, pages: pageInfo }
}

function countBy(items, keyFn) {
    const map = new Map()
    for (const item of items) {
        const keys = [].concat(keyFn(item) ?? 'unknown')
        for (const key of keys) map.set(key, (map.get(key) || 0) + 1)
    }
    return Object.fromEntries(
        [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    )
}

function fixedVersionOf(alert) {
    const vuln = alert.security_vulnerability || {}
    return vuln.first_patched_version?.identifier ?? null
}

function summarize(alerts) {
    const manifest = (a) => a.dependency?.manifest_path ?? 'unknown'
    const pkg = (a) => a.dependency?.package?.name ?? 'unknown'
    const scope = (a) => a.dependency?.scope ?? 'unknown'
    const relationship = (a) => a.dependency?.relationship ?? 'unknown'

    const bySeverity = countBy(alerts, (a) => a.security_advisory?.severity)
    const byScope = countBy(alerts, scope)
    const byRelationship = countBy(alerts, relationship)
    const byManifest = countBy(alerts, manifest)
    const byPackage = countBy(alerts, pkg)

    const cross = {
        severityByScope: {},
        severityByRelationship: {},
        manifestByScope: {}
    }
    for (const a of alerts) {
        const sev = a.security_advisory?.severity ?? 'unknown'
        const sc = scope(a)
        const rel = relationship(a)
        cross.severityByScope[sev] ??= {}
        cross.severityByScope[sev][sc] = (cross.severityByScope[sev][sc] || 0) + 1
        cross.severityByRelationship[sev] ??= {}
        cross.severityByRelationship[sev][rel] = (cross.severityByRelationship[sev][rel] || 0) + 1
        const mf = manifest(a)
        cross.manifestByScope[mf] ??= {}
        cross.manifestByScope[mf][sc] = (cross.manifestByScope[mf][sc] || 0) + 1
    }

    // 包 × 严重级别 × scope × 关系 × manifest 明细
    const perPackage = new Map()
    for (const a of alerts) {
        const name = pkg(a)
        const entry = perPackage.get(name) || {
            package: name,
            count: 0,
            severities: {},
            scopes: {},
            relationships: {},
            manifests: {},
            advisories: [],
            fixedVersions: new Set()
        }
        entry.count += 1
        const sev = a.security_advisory?.severity ?? 'unknown'
        entry.severities[sev] = (entry.severities[sev] || 0) + 1
        entry.scopes[scope(a)] = (entry.scopes[scope(a)] || 0) + 1
        entry.relationships[relationship(a)] = (entry.relationships[relationship(a)] || 0) + 1
        entry.manifests[manifest(a)] = (entry.manifests[manifest(a)] || 0) + 1
        const ghsa = a.security_advisory?.ghsa_id
        if (ghsa && !entry.advisories.includes(ghsa)) entry.advisories.push(ghsa)
        const fixed = fixedVersionOf(a)
        if (fixed) entry.fixedVersions.add(fixed)
        perPackage.set(name, entry)
    }
    const packageDetails = [...perPackage.values()]
        .map((p) => ({ ...p, fixedVersions: [...p.fixedVersions].sort() }))
        .sort((a, b) => b.count - a.count || a.package.localeCompare(b.package))

    // 告警明细（便于报告引用）
    const details = alerts.map((a) => ({
        number: a.number,
        package: pkg(a),
        severity: a.security_advisory?.severity ?? null,
        ghsa_id: a.security_advisory?.ghsa_id ?? null,
        cve_id: a.security_advisory?.cve_id ?? null,
        summary: a.security_advisory?.summary ?? null,
        manifest_path: manifest(a),
        scope: scope(a),
        relationship: relationship(a),
        vulnerable_range: a.security_vulnerability?.vulnerable_version_range ?? null,
        first_patched_version: fixedVersionOf(a),
        created_at: a.created_at ?? null,
        updated_at: a.updated_at ?? null,
        html_url: a.html_url ?? null
    }))

    return {
        total: alerts.length,
        bySeverity,
        byScope,
        byRelationship,
        byManifest,
        byPackage: Object.fromEntries(Object.entries(byPackage).slice(0, 50)),
        cross,
        packageDetails,
        details
    }
}

async function main() {
    const args = parseArgs(process.argv)
    const token = readGitHubToken()
    const { alerts, pages } = await fetchAllAlerts(args.repo, token)
    const summary = summarize(alerts)
    const outDir = resolve(args.out)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(
        resolve(outDir, 'alerts.raw.json'),
        JSON.stringify(
            {
                repo: args.repo,
                fetchedAt: new Date().toISOString(),
                pages,
                total: alerts.length,
                alerts
            },
            null,
            2
        )
    )
    writeFileSync(
        resolve(outDir, 'alerts-summary.json'),
        JSON.stringify(
            { repo: args.repo, fetchedAt: new Date().toISOString(), pages, ...summary },
            null,
            2
        )
    )
    console.log(
        `OK repo=${args.repo} pages=${pages.map((p) => p.count).join(',')} total=${alerts.length}`
    )
    console.log('severity:', JSON.stringify(summary.bySeverity))
    console.log('scope:', JSON.stringify(summary.byScope))
    console.log('relationship:', JSON.stringify(summary.byRelationship))
    console.log('manifest:', JSON.stringify(summary.byManifest))
    console.log('top packages:')
    for (const p of summary.packageDetails.slice(0, 20)) {
        console.log(
            `  ${p.package}: ${p.count} ${JSON.stringify(p.severities)} scope=${JSON.stringify(p.scopes)} rel=${JSON.stringify(p.relationships)} fixed=${p.fixedVersions.join('|')}`
        )
    }
}

main().catch((err) => {
    console.error('FAILED:', err.message)
    process.exit(1)
})
