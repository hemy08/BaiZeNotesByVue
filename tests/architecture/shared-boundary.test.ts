/**
 * shared 层边界架构测试（结构优化第 1 批 1.3 / L4：shared 边界例外收口）
 *
 * ## 约定（shared 纯函数 / 纯数据边界）
 * `src/shared/**` 是主进程、preload、渲染进程共同依赖的**叶子层**：
 * 只允许放「纯类型 / 纯数据 / 纯函数」，禁止依赖任何运行环境（Node 内建、Electron、
 * Vue），禁止反向 import 任何进程层实现（main / renderer / preload），
 * 也禁止直接使用 DOM 全局。本次 1.3 已把唯一例外
 * `src/shared/utils/backup-dir.ts` 的 `node:path` 依赖改为 `PathApi` 显式注入，
 * 本测试把该边界固化为硬门禁，防止例外回流。
 *
 * ## 强制规则（存在违规即失败）
 * 1. 禁止 `import/export ... from 'node:*'`（Node 内建模块，如 node:path）；
 * 2. 禁止 `import/export ... from 'electron'` / `'electron/*'`；
 * 3. 禁止 `import/export ... from 'vue'` / `'vue/*'`；
 * 4. 禁止 `@renderer/*`、`@main/*`、`@preload/*` 别名，以及任何**解析后**落在
 *    `src/main/`、`src/renderer/`、`src/preload/` 的相对路径 import；
 * 5. 禁止裸 `window.xxx` / `document.xxx` / `navigator.xxx` / `localStorage.xxx` /
 *    `sessionStorage.xxx` 等 DOM 全局直接使用。
 *
 * ## 实现约定
 * - 用 TypeScript 编译器 API 解析 AST：**注释与字符串字面量天然不参与判定**
 *   （i18n 词典里的 `window.plantumlRender` 文案、注释中的示例 import 不会误报），
 *   满足「剥离行注释与块注释」的检查意图且比正则剥离更可靠；TypeScript 本就是
 *   仓库开发依赖，未新增任何依赖；
 * - 除静态 import/export 外，同时拦截 `import('...')` 动态导入与 `require('...')`；
 * - 违规输出「仓库相对路径:行号 [规则] 说明」，断言违规数为 0；
 * - 附「规则自检」用例：用内联违例源码证明扫描/判定确实生效，避免路径失效或规则
 *   写错导致空断言假绿；
 * - 若 shared 内出现新的合法例外，必须改本文件并写明原因，不得静默放宽规则。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'

/** 仓库根目录：vitest 以仓库根为工作目录运行（npm test / npx vitest 均如此） */
const REPO_ROOT = process.cwd()
/** shared 源码根目录 */
const SHARED_ROOT = path.join(REPO_ROOT, 'src', 'shared')

/** 进程层目录前缀（相对仓库根，正斜杠）：shared 不得以相对路径进入 */
const CROSS_LAYER_ROOTS = ['src/main/', 'src/renderer/', 'src/preload/'] as const

/** 允许出现在 import 说明符中的进程层别名（shared 一律禁止） */
const CROSS_LAYER_ALIASES = ['@main/', '@renderer/', '@preload/'] as const

/** 禁止的 npm 包前缀（精确名为自身或以 `/` 开头进入子路径） */
const RESTRICTED_PACKAGES = ['electron', 'vue'] as const

/** 禁止直接使用的 DOM 全局（对应 ESLint no-restricted-globals 规则） */
const DOM_GLOBALS = new Set(['window', 'document', 'navigator', 'localStorage', 'sessionStorage'])

/** 相对路径 import 说明符（`.` / `..` 开头） */
const RELATIVE_SPECIFIER_RE = /^\.{1,2}(?:\/|\\|$)/

/** 一条 shared 边界违规 */
interface BoundaryViolation {
    /** 仓库相对路径（正斜杠） */
    file: string
    /** 违规语句所在行号（1-based） */
    line: number
    /** 规则标识 */
    rule: string
    /** 违规明细（说明符 / 全局名等） */
    detail: string
}

/** 归一化为仓库相对路径 + 正斜杠（跨平台稳定） */
function toRepoRelative(absolutePath: string): string {
    return path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/')
}

/** 递归收集 shared 下全部 .ts 源码（含 .d.ts，统一按“源码边界”检查） */
function collectSharedFiles(directory: string = SHARED_ROOT, collected: string[] = []): string[] {
    if (!fs.existsSync(directory)) {
        return collected
    }
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            collectSharedFiles(absolute, collected)
            continue
        }
        if (entry.name.endsWith('.ts')) {
            collected.push(absolute)
        }
    }
    return collected
}

/** 说明符是否命中「进程层相对路径 import」规则，命中时返回解析后的目标 */
function matchCrossLayerTarget(fromFile: string, specifier: string): string | null {
    if (!RELATIVE_SPECIFIER_RE.test(specifier)) {
        return null
    }
    const target = toRepoRelative(path.resolve(path.dirname(fromFile), specifier))
    for (const layerRoot of CROSS_LAYER_ROOTS) {
        const layerDirectory = layerRoot.slice(0, -1)
        if (target === layerDirectory || target.startsWith(layerRoot)) {
            return target
        }
    }
    return null
}

/**
 * 检查单个模块说明符是否违反依赖边界。
 * @returns 违规明细（含规则名）；合法说明符返回 null
 */
function inspectModuleSpecifier(
    fromFile: string,
    specifier: string
): { rule: string; detail: string } | null {
    if (specifier.startsWith('node:')) {
        return { rule: 'shared-no-node-builtin', detail: `依赖 Node 内建模块 ${specifier}` }
    }
    for (const packageName of RESTRICTED_PACKAGES) {
        if (specifier === packageName || specifier.startsWith(`${packageName}/`)) {
            return { rule: `shared-no-${packageName}`, detail: `依赖运行时包 ${specifier}` }
        }
    }
    for (const alias of CROSS_LAYER_ALIASES) {
        if (specifier === alias.slice(0, -1) || specifier.startsWith(alias)) {
            return {
                rule: 'shared-no-cross-layer',
                detail: `经别名 ${alias}* 引用进程层实现 ${specifier}`
            }
        }
    }
    const crossLayerTarget = matchCrossLayerTarget(fromFile, specifier)
    if (crossLayerTarget) {
        return {
            rule: 'shared-no-cross-layer',
            detail: `相对路径引用进程层实现 ${specifier} -> ${crossLayerTarget}`
        }
    }
    return null
}

/**
 * 扫描单个源码文本，返回全部边界违规。
 *
 * 用 AST 遍历而不是正则：注释、字符串字面量中的 `node:path` / `window.xxx` 等
 * 字样不会参与判定；只识别真实的 import/export、动态 import、require 与
 * 「全局 DOM 对象.成员」访问。
 *
 * @param absoluteFile 源码绝对路径（仅用于解析相对 import 与输出）
 * @param content 源码文本（真实文件内容或自检样例）
 */
function collectViolations(absoluteFile: string, content: string): BoundaryViolation[] {
    const sourceFile = ts.createSourceFile(
        absoluteFile,
        content,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    )
    const violations: BoundaryViolation[] = []

    const report = (node: ts.Node, rule: string, detail: string): void => {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        violations.push({
            file: toRepoRelative(absoluteFile),
            line: position.line + 1,
            rule,
            detail
        })
    }

    /** 检查一个模块说明符节点（import/export 的模块名、动态 import/require 的实参） */
    const checkSpecifier = (node: ts.Node): void => {
        if (!ts.isStringLiteralLike(node)) {
            return
        }
        const hit = inspectModuleSpecifier(absoluteFile, node.text)
        if (hit) {
            report(node, hit.rule, hit.detail)
        }
    }

    /** 检查「全局 DOM 对象.成员」访问（只认 window.xxx / window[xxx] 形式） */
    const checkDomGlobalAccess = (node: ts.Node): void => {
        const isPropertyAccess = ts.isPropertyAccessExpression(node)
        const isElementAccess = ts.isElementAccessExpression(node)
        if (!isPropertyAccess && !isElementAccess) {
            return
        }
        const target = node.expression
        if (ts.isIdentifier(target) && DOM_GLOBALS.has(target.text)) {
            report(node, 'shared-no-dom-global', `直接使用 DOM 全局 ${target.text}`)
        }
    }

    const visit = (node: ts.Node): void => {
        // 规则 1~4：静态 import / export、动态 import()、require()
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            if (node.moduleSpecifier) {
                checkSpecifier(node.moduleSpecifier)
            }
        } else if (ts.isImportEqualsDeclaration(node)) {
            // import x = require('...')（仅说明符为外部模块引用时检查）
            if (ts.isExternalModuleReference(node.moduleReference)) {
                checkSpecifier(node.moduleReference.expression)
            }
        } else if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
            for (const argument of node.arguments) {
                checkSpecifier(argument)
            }
        }
        // 规则 5：DOM 全局直接使用
        checkDomGlobalAccess(node)
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return violations
}

/** 扫描全部 shared 源码，收集未登记违规 */
function collectSharedViolations(): BoundaryViolation[] {
    const violations: BoundaryViolation[] = []
    for (const absoluteFile of collectSharedFiles()) {
        violations.push(...collectViolations(absoluteFile, fs.readFileSync(absoluteFile, 'utf-8')))
    }
    return violations
}

/** 格式化为可读违规清单（断言失败信息：文件 + 行号 + 规则 + 明细） */
function formatViolations(violations: BoundaryViolation[]): string {
    return violations
        .map(
            (violation) =>
                `${violation.file}:${violation.line} [${violation.rule}] ${violation.detail}`
        )
        .join('\n')
}

describe('shared 层边界（L4：纯函数/纯数据硬门禁）', () => {
    const sharedFiles = collectSharedFiles()
    const allViolations = collectSharedViolations()
    const byRule = (rule: string): BoundaryViolation[] =>
        allViolations.filter((violation) => violation.rule === rule)

    it('扫描范围有效（防止路径失效导致 0 文件空断言）', () => {
        const relativeFiles = sharedFiles.map((file) => toRepoRelative(file))
        // shared 现有约 60 个 .ts 文件；阈值取保守下沿，避免目录迁移后静默失效
        expect(relativeFiles.length).toBeGreaterThan(20)
        // 1.3 的关键改造文件必须在扫描范围内（node:path 例外已收口到 PathApi 注入）
        expect(relativeFiles).toContain('src/shared/utils/backup-dir.ts')
        expect(relativeFiles).toContain('src/shared/ipc-channels.ts')
        expect(relativeFiles).toContain('src/shared/types/index.ts')
    })

    it('shared 不得依赖 Node 内建模块（node:*）', () => {
        const violations = byRule('shared-no-node-builtin')
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('shared 不得依赖 electron / vue 运行时', () => {
        const violations = [...byRule('shared-no-electron'), ...byRule('shared-no-vue')]
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('shared 不得 import 进程层（相对路径或 @renderer/@main 别名）', () => {
        const violations = byRule('shared-no-cross-layer')
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('shared 不得直接使用 DOM 全局（window/document/navigator/storage）', () => {
        const violations = byRule('shared-no-dom-global')
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('规则自检：违例源码必须被检出，注释/字符串中的字样不得误报', () => {
        const probeFile = path.join(SHARED_ROOT, 'utils', '__boundary-probe__.ts')
        const probeSource = [
            "// 注释中的伪违规不应命中：import { x } from 'node:path'",
            "import { isAbsolute } from 'node:path'",
            "import type { BrowserWindow } from 'electron'",
            "import { ref } from 'vue'",
            "import { helper } from '../../main/utils/helper'",
            "import { rendererHelper } from '@renderer/utils/helper'",
            "const lazy = () => import('node:fs/promises')",
            "export const label = 'window.plantumlRender 未暴露（字符串不应命中）'",
            'export function probe(): void {',
            '    window.alert(label)',
            '    document.title = label',
            '    navigator.userAgent',
            '}'
        ].join('\n')
        const probeViolations = collectViolations(probeFile, probeSource)
        const probeRules = probeViolations.map((violation) => violation.rule)
        // 7 条真实违例：node:path / electron / vue / 相对 main / @renderer / 动态 import node:fs / 3 处 DOM
        expect(probeRules.filter((rule) => rule === 'shared-no-node-builtin')).toHaveLength(2)
        expect(probeRules.filter((rule) => rule === 'shared-no-electron')).toHaveLength(1)
        expect(probeRules.filter((rule) => rule === 'shared-no-vue')).toHaveLength(1)
        expect(probeRules.filter((rule) => rule === 'shared-no-cross-layer')).toHaveLength(2)
        expect(probeRules.filter((rule) => rule === 'shared-no-dom-global')).toHaveLength(3)
        // 行号必须准确（import 从第 2 行开始，第 1 行注释不得命中）
        expect(probeViolations.some((violation) => violation.line === 1)).toBe(false)
        expect(
            probeViolations.some(
                (violation) =>
                    violation.file === 'src/shared/utils/__boundary-probe__.ts' &&
                    violation.line === 2
            )
        ).toBe(true)
    })
})
