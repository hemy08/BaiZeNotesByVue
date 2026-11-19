#!/usr/bin/env node
/**
 * 分析 Dependabot 告警与当前依赖树（package.json + package-lock.json）的差异。
 *
 * 输入：out/dependabot/alerts.raw.json
 * 输出：out/dependabot/alerts-analysis.json
 *
 * 判定口径（每条告警）：
 *   STALE_MANIFEST 告警引用的清单文件在当前仓库已不存在（vendor 副本删除/迁移）
 *   REMOVED        清单存在，但该依赖已不在对应清单中，且 lockfile 中无安装副本
 *   FIXED          当前 lockfile 中该包的所有副本均不在 vulnerable_version_range 内
 *   ACTIVE         当前 lockfile 中仍存在落在 vulnerable_version_range 内的副本
 *   NO_SEMVER      版本范围无法解析（保底）
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const semver = require('semver')

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readJson = (p) => JSON.parse(readFileSync(resolve(ROOT, p), 'utf8'))

const raw = readJson('out/dependabot/alerts.raw.json')
const pkg = readJson('package.json')
const lock = readJson('package-lock.json')

/** 收集 lockfile 中每个包名的全部已解析副本 */
const installed = new Map()
for (const [path, meta] of Object.entries(lock.packages || {})) {
    if (!path || !meta.version) continue
    const name = meta.name || path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length)
    if (!installed.has(name)) installed.set(name, new Set())
    installed.get(name).add(meta.version)
}
const installedVersions = (name) => [...(installed.get(name) || [])].sort(semver.compare)

const declared = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.optionalDependencies || {}),
    ...(pkg.peerDependencies || {})
}

const bool = (range, version) => {
    try {
        // GitHub 返回的范围形如 ">= 2.0.0, < 2.1.5"，semver 不识别逗号分隔，需归一化为空格分隔
        const normalized = String(range).replace(/,/g, ' ').replace(/\s+/g, ' ').trim()
        return semver.satisfies(version, normalized, { includePrerelease: true })
    } catch {
        return null
    }
}

const statusOf = (alert) => {
    const name = alert.dependency.package.name
    const manifest = alert.dependency.manifest_path
    const range = alert.security_vulnerability?.vulnerable_version_range
    const versions = installedVersions(name)
    const inRange = versions.filter((v) => bool(range, v) === true)
    const manifestExists =
        manifest === 'package.json' ||
        manifest === 'package-lock.json' ||
        existsSync(resolve(ROOT, manifest))

    if (!manifestExists)
        return { status: 'STALE_MANIFEST', currentVersions: versions, inRange, manifestExists }
    if (versions.length === 0)
        return { status: 'REMOVED', currentVersions: versions, inRange, manifestExists }
    if (inRange.length > 0)
        return { status: 'ACTIVE', currentVersions: versions, inRange, manifestExists }
    return { status: 'FIXED', currentVersions: versions, inRange, manifestExists }
}

const details = raw.alerts.map((a) => {
    const verdict = statusOf(a)
    return {
        number: a.number,
        package: a.dependency.package.name,
        severity: a.security_advisory?.severity ?? null,
        advisory: a.security_advisory?.ghsa_id ?? null,
        cve: a.security_advisory?.cve_id ?? null,
        summary: a.security_advisory?.summary ?? null,
        manifest_path: a.dependency.manifest_path,
        scope: a.dependency.scope,
        relationship: a.dependency.relationship,
        version_requirement: a.dependency.version_requirement,
        vulnerable_range: a.security_vulnerability?.vulnerable_version_range ?? null,
        first_patched_version: a.security_vulnerability?.first_patched_version?.identifier ?? null,
        current_versions: verdict.currentVersions,
        declared_range: declared[a.dependency.package.name] ?? null,
        manifest_exists: verdict.manifestExists,
        status: verdict.status,
        created_at: a.created_at
    }
})

const countBy = (rows, fn) => {
    const map = new Map()
    for (const r of rows) {
        const keys = [].concat(fn(r) ?? 'unknown')
        for (const k of keys) map.set(k, (map.get(k) || 0) + 1)
    }
    return Object.fromEntries(
        [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    )
}

const severityRank = { critical: 0, high: 1, medium: 2, low: 3 }
const byStatus = countBy(details, (r) => r.status)
const statusBySeverity = Object.fromEntries(
    ['critical', 'high', 'medium', 'low'].map((sev) => [
        sev,
        {
            total: details.filter((r) => r.severity === sev).length,
            ...Object.fromEntries(
                ['STALE_MANIFEST', 'REMOVED', 'FIXED', 'ACTIVE', 'NO_SEMVER'].map((s) => [
                    s,
                    details.filter((r) => r.severity === sev && r.status === s).length
                ])
            )
        }
    ])
)
const statusByScope = {}
for (const scope of ['runtime', 'development']) {
    statusByScope[scope] = countBy(
        details.filter((r) => r.scope === scope),
        (r) => r.status
    )
}
const statusByManifest = {}
for (const man of [...new Set(details.map((r) => r.manifest_path))]) {
    const rows = details.filter((r) => r.manifest_path === man)
    statusByManifest[man] = { total: rows.length, ...countBy(rows, (r) => r.status) }
}

const perPackage = new Map()
for (const r of details) {
    const entry = perPackage.get(r.package) || {
        package: r.package,
        alerts: 0,
        severities: {},
        statuses: {},
        manifests: {},
        scopes: {},
        relationships: {},
        advisories: new Set(),
        fixedVersions: new Set(),
        currentVersions: r.current_versions,
        declaredRange: r.declared_range
    }
    entry.alerts += 1
    entry.severities[r.severity] = (entry.severities[r.severity] || 0) + 1
    entry.statuses[r.status] = (entry.statuses[r.status] || 0) + 1
    entry.manifests[r.manifest_path] = (entry.manifests[r.manifest_path] || 0) + 1
    entry.scopes[r.scope] = (entry.scopes[r.scope] || 0) + 1
    entry.relationships[r.relationship] = (entry.relationships[r.relationship] || 0) + 1
    if (r.advisory) entry.advisories.add(r.advisory)
    if (r.first_patched_version) entry.fixedVersions.add(r.first_patched_version)
    perPackage.set(r.package, entry)
}
const packageRows = [...perPackage.values()]
    .map((p) => {
        const worst = Object.keys(p.severities).sort((a, b) => severityRank[a] - severityRank[b])[0]
        return {
            ...p,
            advisories: [...p.advisories],
            fixedVersions: [...p.fixedVersions],
            worstSeverity: worst,
            residual: (p.statuses.ACTIVE || 0) > 0
        }
    })
    .sort((a, b) => b.alerts - a.alerts || a.package.localeCompare(b.package))

// 与 npm audit 的差异证据
const overrides = pkg.overrides || {}
const overrideTopLevel = Object.keys(overrides)
const fixedByOverride = packageRows.filter((p) => overrideTopLevel.includes(p.package))
const staleRequirement = details.filter(
    (r) =>
        r.manifest_path === 'package.json' &&
        r.declared_range &&
        r.version_requirement !== r.declared_range
)
const vulnerabilityCoveredByOverrides = details.filter(
    (r) =>
        overrideTopLevel.includes(r.package) &&
        ['FIXED', 'STALE_MANIFEST', 'REMOVED'].includes(r.status)
)

const analysis = {
    generatedAt: new Date().toISOString(),
    repo: raw.repo,
    head: process.env.GIT_HEAD || null,
    total: details.length,
    byStatus,
    statusBySeverity,
    statusByScope,
    statusByManifest,
    residualActive: details.filter((r) => r.status === 'ACTIVE'),
    staleManifestAlerts: details
        .filter((r) => r.status === 'STALE_MANIFEST')
        .map((r) => ({
            number: r.number,
            package: r.package,
            manifest_path: r.manifest_path,
            severity: r.severity,
            advisory: r.advisory
        })),
    removedPackages: countBy(
        details.filter((r) => r.status === 'REMOVED'),
        (r) => r.package
    ),
    fixedPackages: countBy(
        details.filter((r) => r.status === 'FIXED'),
        (r) => r.package
    ),
    npmAuditDiff: {
        npmAuditTotal: 0,
        overrideTopLevel,
        fixedByOverride: fixedByOverride.map((p) => ({
            package: p.package,
            alerts: p.alerts,
            currentVersions: p.currentVersions,
            fixedVersions: p.fixedVersions
        })),
        alertsCoveredByOverrides: vulnerabilityCoveredByOverrides.length,
        staleVersionRequirementCount: staleRequirement.length,
        staleVersionRequirementSamples: staleRequirement.slice(0, 15).map((r) => ({
            package: r.package,
            alertRequirement: r.version_requirement,
            declaredRange: r.declared_range,
            created_at: r.created_at
        })),
        manifestMissingCount: details.filter((r) => !r.manifest_exists).length,
        installedDependencyCount: Object.keys(lock.packages || {}).filter((k) => k).length
    },
    packages: packageRows,
    details
}

writeFileSync(
    resolve(ROOT, 'out/dependabot/alerts-analysis.json'),
    JSON.stringify(analysis, null, 2)
)
console.log('status:', JSON.stringify(byStatus))
console.log('statusBySeverity:', JSON.stringify(statusBySeverity))
console.log('statusByScope:', JSON.stringify(statusByScope))
console.log('statusByManifest:', JSON.stringify(statusByManifest))
console.log('residualActive:', analysis.residualActive.length)
for (const r of analysis.residualActive) {
    console.log(
        `  #${r.number} ${r.package} ${r.severity} range=${r.vulnerable_range} installed=${r.current_versions.join(',')} manifest=${r.manifest_path} fixed=${r.first_patched_version}`
    )
}
console.log('removed:', JSON.stringify(analysis.removedPackages))
console.log(
    'npmAuditDiff:',
    JSON.stringify({
        ...analysis.npmAuditDiff,
        fixedByOverride: undefined,
        staleVersionRequirementSamples: undefined
    })
)
console.log('stale samples:', analysis.npmAuditDiff.staleVersionRequirementCount)
