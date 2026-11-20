/**
 * 依赖分类策略与审计口径架构测试（P2-5：生产/开发依赖分类与安全审计口径）
 *
 * ## 背景
 * 2026-11-20 安全扫描 P2-5 指出：会被 Vite 内联进 renderer bundle 的运行时安全库
 * （dompurify / mermaid / katex / highlight.js / crypto-js / markdown-it-* 等）位于
 * devDependencies，而 CI 的 `npm audit --omit=dev` 只审计生产依赖，导致这些实际运行
 * 在用户机器上的库不在审计门禁内。同时「哪些运行时库可以留在 devDependencies」
 * 一直没有书面策略与自动门禁，新增依赖时只能靠人工判断。
 *
 * ## 本项目采用的依赖分类策略（本测试即唯一可执行口径）
 * 依赖分三类，判定依据是**产物边界**而不是「库是否在运行时被调用」：
 *
 * 1. **dependencies（生产依赖）**：主进程 `externalizeDeps: true` 时会被保留为
 *    `require('pkg')` 外部引用的库。electron-builder 会把 dependencies 的
 *    node_modules 复制进 app.asar（本轮实测 app.asar 含 3,522 条 node_modules 条目），
 *    因此只有「主进程运行时真的会 require node_modules」的库才放这里
 *    （fs-extra / electron-store / markdown-it / mammoth 等 11 个）。
 * 2. **devDependencies 中的打包期运行时库**：被 Vite 打包（内联）进 renderer 或
 *    preload 产物的库。产物里不存在 `require('pkg')`，运行时不需要 node_modules，
 *    因此留在 devDependencies：
 *      - 不会让 electron-builder 把 node_modules 重复打进 asar（vue/monaco/mermaid
 *        等体积巨大，重复打包会显著膨胀安装包）；
 *      - 依然受依赖审计覆盖——审计口径已改为全量树（含 dev），见本文件「审计口径」用例；
 *      - 但必须逐条登记到下方 `BUNDLED_DEV_DEPENDENCY_ALLOWLIST` 并写明理由，
 *        新增条目需要同步修改期望数量，避免 allowlist 无理由增长。
 * 3. **运行时由宿主提供**：`electron`（由 Electron 二进制运行时提供，不属于 npm
 *    运行时依赖），以及 Node 内建模块（`fs` / `path` / `node:*` 等）。
 *
 * ## 强制规则（存在违规即失败）
 * - `src/renderer` / `src/preload` 中 import 的裸包名，必须满足其一：
 *   a) 在 package.json dependencies 中；或
 *   b) 在 allowlist 中且声明了对应层与理由（本文件逐条列出）。
 * - `src/main` 中 import 的裸包名（除 electron 与 Node 内建外）必须在 dependencies 中，
 *   因为主进程 externalizeDeps=true，devDependencies 不会随安装包分发。
 * - allowlist 条目必须：有 ≥20 字的理由、确实位于 devDependencies、确实被声明的层
 *   import、条目总数与 `EXPECTED_ALLOWLIST_SIZE` 一致（新增必须显式改数字 + 写理由）。
 * - 审计口径：package.json 的 audit 脚本、CI 与 release 工作流必须存在全量树
 *   `npm audit --audit-level=high`（经官方 registry，本地可复现），不得回退到只看
 *   生产依赖的 `--omit=dev` 作为唯一门禁。
 *
 * ## 实现约定
 * - 用 TypeScript 编译器 API 解析 AST（静态 import/export、动态 import()、require），
 *   `.vue` 文件抽取全部 `<script>` 块后同样走 AST，注释与字符串字面量不会误报；
 * - 扫描范围自检（文件数/关键文件/import 数下限）防止路径失效导致空断言假绿；
 * - 附「规则自检」用例：用内联违例源码证明分类与 allowlist 判定确实生效；
 * - 若新增合法的 devDependencies 运行时库，必须改本文件 allowlist 并写明理由，
 *   不得静默放宽规则。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import { builtinModules } from 'module'
import ts from 'typescript'

/** 仓库根目录：vitest 以仓库根为工作目录运行（npm test / npx vitest 均如此） */
const REPO_ROOT = process.cwd()

/** 三层进程目录（相对仓库根，正斜杠） */
const LAYER_ROOTS = {
    main: 'src/main',
    renderer: 'src/renderer',
    preload: 'src/preload'
} as const

type Layer = keyof typeof LAYER_ROOTS

/** 参与依赖分类判定的层（main 走 externalize 规则，renderer/preload 走打包规则） */
type BundledLayer = 'renderer' | 'preload'

/** Electron 由运行时二进制提供，不属于 npm 依赖分类对象 */
const RUNTIME_PROVIDED_PACKAGES = new Set(['electron'])

/** Node 内建模块（含 `node:` 前缀写法）；`builtinModules` 同时覆盖 `fs/promises` 等子路径 */
const NODE_BUILTIN_MODULES = new Set(builtinModules)

/** 相对路径说明符（`.` / `..` 开头） */
const RELATIVE_SPECIFIER_RE = /^\.{1,2}(?:\/|\\|$)/

/** 进程层内部别名（不视为 npm 包） */
const LAYER_ALIAS_PREFIXES = ['@renderer/', '@main/', '@mainer/', '@preload/'] as const

/** 允许扫描的源码扩展名（.vue 额外抽取 <script> 块） */
const SOURCE_EXTENSIONS = /\.(?:ts|tsx|vue)$/

/** 打包形态：renderer = Vite 内联进渲染产物；preload = externalizeDeps:false 内联进单文件 preload */
type BundledBy = 'vite-renderer' | 'vite-preload-inline'

/** allowlist 条目：声明某个 devDependency 运行时库为何可以留在 devDependencies */
interface BundledDevDependencyEntry {
    /** npm 包名（精确名，不含子路径） */
    package: string
    /** 实际 import 该包的层（必须与真实使用完全一致，用于清理过期条目） */
    layers: readonly BundledLayer[]
    /** 打包方式（与 layers 保持一致，便于评审理解产物边界） */
    bundledBy: BundledBy
    /** 书面理由（≥20 字，说明为何放 devDependencies 安全） */
    reason: string
}

/**
 * devDependencies 运行时库 allowlist（P2-5 策略核心）。
 *
 * 加入条件（三条同时满足）：
 * 1. 只被 renderer / preload 源码 import，产物经 Vite 内联，运行时不存在
 *    `require('pkg')` 的 node_modules 解析路径；
 * 2. 不放进 dependencies 可以避免 electron-builder 把 node_modules 重复打包进 asar；
 * 3. 安全审计由「全量树 audit（含 dev）」覆盖（见本文件「审计口径」）。
 */
const BUNDLED_DEV_DEPENDENCY_ALLOWLIST: readonly BundledDevDependencyEntry[] = [
    {
        package: 'vue',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'Vue 3 运行时由 Vite 打包进 renderer bundle（102 个文件消费），产物内无 require(node_modules) 路径；移入 dependencies 会被 electron-builder 重复复制进 asar。'
    },
    {
        package: 'monaco-editor',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'Monaco 经 electron.vite.config.ts 别名指向 editor.api 并按需打包（含 worker chunk），属构建期依赖；移入 dependencies 会把约 7.5 MiB 的 node_modules 重复复制进 asar。'
    },
    {
        package: 'mermaid',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: '图表渲染仅经动态 import() 进入独立懒加载 chunk，由 Vite 构建期打进 renderer 产物，运行时从 bundle 加载而非 node_modules。'
    },
    {
        package: 'katex',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: '数学公式渲染按需动态 import() 并随 katex.css 打包进 renderer，运行时无需 node_modules；devDependencies 不影响全量审计覆盖。'
    },
    {
        package: 'highlight.js',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: '预览代码高亮使用 core + 显式语言子路径导入，全部由 Vite 构建期打包；不再从 node_modules 运行时解析。'
    },
    {
        package: 'dompurify',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: '预览 HTML/SVG 消毒（唯一 v-html 富文本 sink 的安全防线）；由 Vite 打包进 renderer，overrides 钉版 3.4.18 且 CI 全量 audit 覆盖 dev 树。'
    },
    {
        package: 'crypto-js',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: '加密解密插件工具的渲染层实现（主进程加密走 Node crypto），Vite 打包进工具 chunk，运行时无 node_modules 依赖。'
    },
    {
        package: 'markdown-it-emoji',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'Markdown 预览 emoji 插件，随预览管线由 Vite 打包进 renderer chunk，运行时从 bundle 加载。'
    },
    {
        package: 'markdown-it-highlightjs',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'Markdown 预览高亮桥接插件（core 子路径），随预览管线由 Vite 打包进 renderer chunk。'
    },
    {
        package: 'markdown-it-plantuml',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'Markdown 预览 PlantUML 语法桥接插件，随预览管线由 Vite 打包进 renderer chunk。'
    },
    {
        package: '@imengyu/vue3-context-menu',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: '渲染层快捷菜单组件库及其 CSS，由 Vite 打包进 renderer，运行时不需要 node_modules 副本。'
    },
    {
        package: 'pdfjs-dist',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'PDF 查看器懒加载依赖（pdf.js + worker chunk 由 Vite 打包），仅渲染进程使用，运行时无 node_modules 解析。'
    },
    {
        package: 'uuid',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'UUID 生成插件工具仅渲染层使用，随工具 chunk 由 Vite 打包，运行时从 bundle 加载。'
    },
    {
        package: 'ulid',
        layers: ['renderer'],
        bundledBy: 'vite-renderer',
        reason: 'ULID 生成插件工具仅渲染层使用，随工具 chunk 由 Vite 打包，运行时从 bundle 加载。'
    },
    {
        package: '@electron-toolkit/preload',
        layers: ['preload'],
        bundledBy: 'vite-preload-inline',
        reason: 'preload 必须为单文件（sandbox 硬性要求），externalizeDeps:false 将其内联进 preload 产物；electron API 由运行时提供，无 node_modules 依赖。'
    }
]

/**
 * allowlist 期望条目数（P2-5 冻结基线）。
 *
 * 新增 devDependencies 运行时库时必须同时：① 追加带理由的条目；② 把本常量 +1。
 * 这个数字是「新增依赖需要评审」的显式信号，防止 allowlist 无理由、静默增长。
 */
const EXPECTED_ALLOWLIST_SIZE = 15

/** allowlist 理由的最小长度（字符数，去掉首尾空白后） */
const MIN_REASON_LENGTH = 20

/** 一条源码 import 记录 */
interface SourceImport {
    /** 层 */
    layer: Layer
    /** 仓库相对路径（正斜杠） */
    file: string
    /** 行号（1-based） */
    line: number
    /** 原始模块说明符 */
    specifier: string
    /** 归一化后的 npm 包名（裸包才有值） */
    packageName: string
}

/** 一条分类违规 */
interface ClassificationViolation {
    /** 仓库相对路径（正斜杠） */
    file: string
    /** 行号（1-based） */
    line: number
    /** 包名 */
    packageName: string
    /** 违规说明 */
    detail: string
}

/** 一条 allowlist 卫生问题 */
interface AllowlistIssue {
    /** 条目包名（或 `*` 表示整体） */
    packageName: string
    /** 问题说明 */
    detail: string
}

/** 归一化为仓库相对路径 + 正斜杠（跨平台稳定） */
function toRepoRelative(absolutePath: string): string {
    return path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/')
}

/** 递归收集某层下全部源码文件（.ts/.tsx/.vue） */
function collectSourceFiles(layer: Layer): string[] {
    const root = path.join(REPO_ROOT, LAYER_ROOTS[layer])
    const collected: string[] = []
    const walk = (directory: string): void => {
        if (!fs.existsSync(directory)) {
            return
        }
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const absolute = path.join(directory, entry.name)
            if (entry.isDirectory()) {
                walk(absolute)
            } else if (SOURCE_EXTENSIONS.test(entry.name)) {
                collected.push(absolute)
            }
        }
    }
    walk(root)
    return collected
}

/** 抽取单文件中的待解析文本块（.vue 拆出全部 <script> 块并记录行偏移） */
function extractScriptBlocks(
    absoluteFile: string,
    content: string
): { code: string; lineOffset: number }[] {
    if (!absoluteFile.endsWith('.vue')) {
        return [{ code: content, lineOffset: 0 }]
    }
    const blocks: { code: string; lineOffset: number }[] = []
    const scriptRe = /<script\b[^>]*>([\s\S]*?)<\/script>/g
    let match: RegExpExecArray | null
    while ((match = scriptRe.exec(content)) !== null) {
        const codeStart = match.index + match[0].indexOf('>') + 1
        const lineOffset = (content.slice(0, codeStart).match(/\n/g) || []).length
        blocks.push({ code: match[1], lineOffset })
    }
    return blocks
}

/** 是否为 Node 内建模块（兼容 `node:fs`、`fs`、`fs/promises`） */
function isNodeBuiltin(specifier: string): boolean {
    if (specifier.startsWith('node:')) {
        return true
    }
    return NODE_BUILTIN_MODULES.has(specifier) || NODE_BUILTIN_MODULES.has(specifier.split('/')[0])
}

/**
 * 从模块说明符提取 npm 包名；相对路径 / 进程层别名 / Node 内建 / Vite 虚拟模块返回 null。
 *
 * 说明：子路径导入（`highlight.js/lib/core`）、Vite 资源查询（`...?worker` / `...?url`）
 * 均归一化到包名；样式与 worker 入口同属该包，必须一并纳入分类判定。
 */
function packageNameOf(specifier: string): string | null {
    if (!specifier) {
        return null
    }
    if (RELATIVE_SPECIFIER_RE.test(specifier)) {
        return null
    }
    if (LAYER_ALIAS_PREFIXES.some((alias) => specifier.startsWith(alias))) {
        return null
    }
    if (specifier.startsWith('virtual:') || specifier.startsWith('@vite/')) {
        return null
    }
    if (isNodeBuiltin(specifier)) {
        return null
    }
    const clean = specifier.split('?')[0].split('#')[0]
    if (clean.startsWith('.')) {
        return null
    }
    if (clean.startsWith('@')) {
        const [scope, name] = clean.split('/')
        return scope && name ? `${scope}/${name}` : null
    }
    const name = clean.split('/')[0]
    return name || null
}

/** 解析单个文本块中的全部模块说明符（静态 import/export、import = require、动态 import()、require()） */
function collectImportsFromCode(
    absoluteFile: string,
    code: string,
    lineOffset: number
): { line: number; specifier: string }[] {
    const sourceFile = ts.createSourceFile(
        absoluteFile,
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    )
    const found: { line: number; specifier: string }[] = []
    const record = (node: ts.Node, specifier: string): void => {
        const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
        found.push({ line: lineOffset + position.line + 1, specifier })
    }
    const visit = (node: ts.Node): void => {
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
                record(node.moduleSpecifier, node.moduleSpecifier.text)
            }
        } else if (ts.isImportEqualsDeclaration(node)) {
            if (
                ts.isExternalModuleReference(node.moduleReference) &&
                ts.isStringLiteralLike(node.moduleReference.expression)
            ) {
                record(node.moduleReference.expression, node.moduleReference.expression.text)
            }
        } else if (
            ts.isCallExpression(node) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
            for (const argument of node.arguments) {
                if (ts.isStringLiteralLike(argument)) {
                    record(argument, argument.text)
                }
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return found
}

/** 扫描某层全部源码，收集所有裸包 import */
function collectLayerImports(layer: Layer): SourceImport[] {
    const imports: SourceImport[] = []
    for (const absoluteFile of collectSourceFiles(layer)) {
        const content = fs.readFileSync(absoluteFile, 'utf-8')
        const file = toRepoRelative(absoluteFile)
        for (const block of extractScriptBlocks(absoluteFile, content)) {
            for (const { line, specifier } of collectImportsFromCode(
                absoluteFile,
                block.code,
                block.lineOffset
            )) {
                const packageName = packageNameOf(specifier)
                if (packageName) {
                    imports.push({ layer, file, line, specifier, packageName })
                }
            }
        }
    }
    return imports
}

/** package.json 依赖分类视图 */
interface DependencyClassification {
    /** dependencies（生产依赖） */
    production: Set<string>
    /** devDependencies（开发依赖） */
    development: Set<string>
}

/** 读取 package.json 的依赖分类 */
function readDependencyClassification(): DependencyClassification {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')
    ) as Record<string, Record<string, string> | undefined>
    return {
        production: new Set(Object.keys(pkg.dependencies ?? {})),
        development: new Set(Object.keys(pkg.devDependencies ?? {}))
    }
}

/** 校验 renderer/preload 的裸包 import 分类（dependencies 或同层 allowlist） */
function inspectBundledLayer(
    layer: BundledLayer,
    imports: readonly SourceImport[],
    classification: DependencyClassification,
    allowlist: readonly BundledDevDependencyEntry[] = BUNDLED_DEV_DEPENDENCY_ALLOWLIST
): ClassificationViolation[] {
    const allowedByAllowlist = new Set(
        allowlist.filter((entry) => entry.layers.includes(layer)).map((entry) => entry.package)
    )
    return imports
        .filter(
            (item) =>
                item.layer === layer &&
                !classification.production.has(item.packageName) &&
                !RUNTIME_PROVIDED_PACKAGES.has(item.packageName) &&
                !allowedByAllowlist.has(item.packageName)
        )
        .map((item) => ({
            file: item.file,
            line: item.line,
            packageName: item.packageName,
            detail:
                `裸包 '${item.specifier}' 既不在 dependencies，也未登记到 ${layer} 层 allowlist；` +
                '打包期运行时库请留在 devDependencies 并登记理由，主进程运行时依赖请移入 dependencies'
        }))
}

/** 校验 main 的 externalize 依赖必须在 dependencies（electron / Node 内建除外） */
function inspectMainExternalized(
    imports: readonly SourceImport[],
    classification: DependencyClassification
): ClassificationViolation[] {
    return imports
        .filter(
            (item) =>
                item.layer === 'main' &&
                !classification.production.has(item.packageName) &&
                !RUNTIME_PROVIDED_PACKAGES.has(item.packageName)
        )
        .map((item) => ({
            file: item.file,
            line: item.line,
            packageName: item.packageName,
            detail:
                `主进程 import 的 '${item.specifier}' 不在 dependencies；` +
                'externalizeDeps=true 会保留为运行时 require，devDependencies 不随安装包分发（asar 内没有该包）'
        }))
}

/**
 * allowlist 卫生检查：
 * - 条目包名唯一、理由足够长、bundledBy 与 layers 一致；
 * - 包必须在 devDependencies（在 dependencies 则无需 allowlist）；
 * - 必须被声明的层真实 import（避免过期条目）；
 * - 条目总数必须等于 EXPECTED_ALLOWLIST_SIZE（新增需显式评审）。
 */
function inspectAllowlist(
    allowlist: readonly BundledDevDependencyEntry[],
    classification: DependencyClassification,
    actualUsage: ReadonlyMap<string, Set<BundledLayer>>,
    expectedSize: number = EXPECTED_ALLOWLIST_SIZE
): AllowlistIssue[] {
    const issues: AllowlistIssue[] = []
    const seen = new Set<string>()
    for (const entry of allowlist) {
        if (seen.has(entry.package)) {
            issues.push({
                packageName: entry.package,
                detail: 'allowlist 条目重复，请合并为一条'
            })
        }
        seen.add(entry.package)
        if (entry.reason.trim().length < MIN_REASON_LENGTH) {
            issues.push({
                packageName: entry.package,
                detail: `缺少书面理由（去空白后至少 ${MIN_REASON_LENGTH} 字，当前 ${entry.reason.trim().length} 字）`
            })
        }
        if (classification.production.has(entry.package)) {
            issues.push({
                packageName: entry.package,
                detail: '该包已在 dependencies，allowlist 条目失效，应删除'
            })
        } else if (!classification.development.has(entry.package)) {
            issues.push({
                packageName: entry.package,
                detail: '该包不在 package.json devDependencies 中，allowlist 条目失效'
            })
        }
        const expectedBundledBy: BundledBy =
            entry.layers.length === 1 && entry.layers[0] === 'renderer'
                ? 'vite-renderer'
                : 'vite-preload-inline'
        if (entry.bundledBy !== expectedBundledBy) {
            issues.push({
                packageName: entry.package,
                detail: `bundledBy='${entry.bundledBy}' 与 layers=${JSON.stringify(entry.layers)} 不匹配（期望 '${expectedBundledBy}'）`
            })
        }
        const usedLayers = actualUsage.get(entry.package) ?? new Set<BundledLayer>()
        for (const declared of entry.layers) {
            if (!usedLayers.has(declared)) {
                issues.push({
                    packageName: entry.package,
                    detail: `过期条目：源码 ${declared} 层已不再 import 该包，应删除 allowlist 条目`
                })
            }
        }
        for (const used of usedLayers) {
            if (!entry.layers.includes(used)) {
                issues.push({
                    packageName: entry.package,
                    detail: `声明层不完整：${used} 层也在 import 该包，请补进 layers 并更新 bundledBy`
                })
            }
        }
    }
    if (allowlist.length !== expectedSize) {
        issues.push({
            packageName: '*',
            detail: `allowlist 条目数 ${allowlist.length} 与 EXPECTED_ALLOWLIST_SIZE=${expectedSize} 不一致：新增/删除运行时库必须显式评审并同步该数字`
        })
    }
    return issues
}

/** 统计 allowlist 包在各打包层的实际使用情况（用于清理过期条目） */
function collectActualAllowlistUsage(
    layerImports: readonly SourceImport[]
): Map<string, Set<BundledLayer>> {
    const usage = new Map<string, Set<BundledLayer>>()
    for (const item of layerImports) {
        if (item.layer !== 'renderer' && item.layer !== 'preload') {
            continue
        }
        const layers = usage.get(item.packageName) ?? new Set<BundledLayer>()
        layers.add(item.layer)
        usage.set(item.packageName, layers)
    }
    return usage
}

/** 格式化为可读违规清单（断言失败信息：文件 + 行号 + 包名 + 说明） */
function formatViolations(violations: readonly ClassificationViolation[]): string {
    return violations
        .map(
            (violation) =>
                `${violation.file}:${violation.line} [${violation.packageName}] ${violation.detail}`
        )
        .join('\n')
}

/** 格式化为可读 allowlist 问题清单 */
function formatAllowlistIssues(issues: readonly AllowlistIssue[]): string {
    return issues.map((issue) => `[${issue.packageName}] ${issue.detail}`).join('\n')
}

/** 读取工作流文本（不存在时返回空串，由用例显式断言） */
function readWorkflow(relativePath: string): string {
    const absolute = path.join(REPO_ROOT, relativePath)
    return fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf-8') : ''
}

/** 扫描层导入（模块级缓存：三个层各扫一次，供多个用例复用） */
const MAIN_IMPORTS = collectLayerImports('main')
const RENDERER_IMPORTS = collectLayerImports('renderer')
const PRELOAD_IMPORTS = collectLayerImports('preload')
const BUNDLED_IMPORTS = [...RENDERER_IMPORTS, ...PRELOAD_IMPORTS]
const PACKAGE_CLASSIFICATION = readDependencyClassification()
const ALLOWLIST_USAGE = collectActualAllowlistUsage(BUNDLED_IMPORTS)

describe('依赖分类策略（P2-5：生产依赖 vs 打包期运行时库）', () => {
    it('扫描范围有效（防止路径失效导致空断言假绿）', () => {
        const mainFiles = collectSourceFiles('main')
        const rendererFiles = collectSourceFiles('renderer')
        const preloadFiles = collectSourceFiles('preload')
        expect(mainFiles.length).toBeGreaterThan(40)
        expect(rendererFiles.length).toBeGreaterThan(150)
        expect(preloadFiles.length).toBeGreaterThanOrEqual(3)
        expect(RENDERER_IMPORTS.length).toBeGreaterThan(100)
        expect(MAIN_IMPORTS.length).toBeGreaterThan(30)
        expect(PRELOAD_IMPORTS.length).toBeGreaterThan(0)
        // 关键消费文件必须在扫描范围内（类型声明/组件/动态 import 三类入口）
        const scannedRenderer = rendererFiles.map(toRepoRelative)
        const scannedMain = mainFiles.map(toRepoRelative)
        expect(scannedRenderer).toContain(
            'src/renderer/src/components/Markdown/MarkdownPreviewComponent.vue'
        )
        expect(scannedRenderer).toContain('src/renderer/src/main.ts')
        expect(scannedMain).toContain('src/main/index.ts')
    })

    it('renderer 的裸包 import 必须在 dependencies 或 renderer 层 allowlist 中', () => {
        const violations = inspectBundledLayer('renderer', RENDERER_IMPORTS, PACKAGE_CLASSIFICATION)
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('preload 的裸包 import 必须在 dependencies 或 preload 层 allowlist 中', () => {
        const violations = inspectBundledLayer('preload', PRELOAD_IMPORTS, PACKAGE_CLASSIFICATION)
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('main 的 externalize 依赖必须在 dependencies（electron / Node 内建除外）', () => {
        const violations = inspectMainExternalized(MAIN_IMPORTS, PACKAGE_CLASSIFICATION)
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('allowlist 条目必须带理由、在 devDependencies、被真实使用且数量受控', () => {
        const issues = inspectAllowlist(
            BUNDLED_DEV_DEPENDENCY_ALLOWLIST,
            PACKAGE_CLASSIFICATION,
            ALLOWLIST_USAGE
        )
        expect(issues, formatAllowlistIssues(issues)).toEqual([])
        expect(BUNDLED_DEV_DEPENDENCY_ALLOWLIST).toHaveLength(EXPECTED_ALLOWLIST_SIZE)
        // 15 个条目全部是 devDependencies 运行时库，不得混入 dependencies
        for (const entry of BUNDLED_DEV_DEPENDENCY_ALLOWLIST) {
            expect(PACKAGE_CLASSIFICATION.development.has(entry.package)).toBe(true)
        }
    })

    it('规则自检：分类、allowlist 与解析器必须能检出违例（防规则写错假绿）', () => {
        // 1) 解析器：动态 import / require / 子路径 / ?worker 查询 / .vue script 块行号
        const vueProbe = [
            '<template><div /></template>',
            '<script setup lang="ts">',
            "import { ref } from 'vue'",
            "import hljs from 'highlight.js/lib/core'",
            "const worker = import('monaco-editor/esm/vs/editor/editor.worker?worker')",
            "const pdf = () => import('pdfjs-dist/build/pdf.worker.min.mjs?url')",
            "const fsLike = require('node:fs')",
            'export const probe = ref(0)',
            '</script>'
        ].join('\n')
        const probeFile = path.join(REPO_ROOT, LAYER_ROOTS.renderer, 'src', '__probe__.vue')
        const blocks = extractScriptBlocks(probeFile, vueProbe)
        expect(blocks).toHaveLength(1)
        const parsed = blocks.flatMap((block) =>
            collectImportsFromCode(probeFile, block.code, block.lineOffset)
        )
        expect(parsed.map((item) => item.specifier)).toContain('vue')
        expect(parsed.map((item) => item.specifier)).toContain('highlight.js/lib/core')
        expect(parsed.map((item) => item.specifier)).toContain(
            'monaco-editor/esm/vs/editor/editor.worker?worker'
        )
        // 行号：'vue' import 位于 .vue 文件第 3 行
        expect(parsed.find((item) => item.specifier === 'vue')?.line).toBe(3)
        expect(packageNameOf('highlight.js/lib/core')).toBe('highlight.js')
        expect(packageNameOf('@imengyu/vue3-context-menu/lib/index.css')).toBe(
            '@imengyu/vue3-context-menu'
        )
        expect(packageNameOf('pdfjs-dist/build/pdf.worker.min.mjs?url')).toBe('pdfjs-dist')
        expect(packageNameOf('node:fs')).toBeNull()
        expect(packageNameOf('fs/promises')).toBeNull()
        expect(packageNameOf('./relative')).toBeNull()
        expect(packageNameOf('@renderer/utils/helper')).toBeNull()
        expect(isNodeBuiltin('fs')).toBe(true)
        expect(isNodeBuiltin('electron')).toBe(false)

        // 2) 分类判定：renderer 未登记裸包必须报违规；allowlist 命中则放行
        const classification: DependencyClassification = {
            production: new Set(['fs-extra', 'markdown-it']),
            development: new Set(['vue', 'highlight.js'])
        }
        const probeImports: SourceImport[] = [
            {
                layer: 'renderer',
                file: 'src/renderer/src/__probe__.ts',
                line: 1,
                specifier: 'left-pad',
                packageName: 'left-pad'
            },
            {
                layer: 'renderer',
                file: 'src/renderer/src/__probe__.ts',
                line: 2,
                specifier: 'vue',
                packageName: 'vue'
            },
            {
                layer: 'renderer',
                file: 'src/renderer/src/__probe__.ts',
                line: 3,
                specifier: 'markdown-it',
                packageName: 'markdown-it'
            },
            {
                layer: 'preload',
                file: 'src/preload/__probe__.ts',
                line: 4,
                specifier: 'dompurify',
                packageName: 'dompurify'
            }
        ]
        const rendererViolations = inspectBundledLayer(
            'renderer',
            probeImports,
            classification,
            BUNDLED_DEV_DEPENDENCY_ALLOWLIST
        )
        expect(rendererViolations.map((violation) => violation.packageName)).toEqual(['left-pad'])
        const preloadViolations = inspectBundledLayer(
            'preload',
            probeImports,
            classification,
            BUNDLED_DEV_DEPENDENCY_ALLOWLIST
        )
        expect(preloadViolations.map((violation) => violation.packageName)).toEqual(['dompurify'])

        // 3) main externalize 判定：devDependency 违规；生产依赖 / electron / Node 内建放行
        const mainProbe: SourceImport[] = [
            {
                layer: 'main',
                file: 'src/main/__probe__.ts',
                line: 1,
                specifier: 'dompurify',
                packageName: 'dompurify'
            },
            {
                layer: 'main',
                file: 'src/main/__probe__.ts',
                line: 2,
                specifier: 'fs-extra',
                packageName: 'fs-extra'
            },
            {
                layer: 'main',
                file: 'src/main/__probe__.ts',
                line: 3,
                specifier: 'electron',
                packageName: 'electron'
            }
        ]
        const mainViolations = inspectMainExternalized(mainProbe, classification)
        expect(mainViolations.map((violation) => violation.packageName)).toEqual(['dompurify'])

        // 4) allowlist 卫生判定：无理由 / 过期 / 已进 dependencies / 数量漂移 必须被检出
        const hygieneIssues = inspectAllowlist(
            [
                {
                    package: 'vue',
                    layers: ['renderer'],
                    bundledBy: 'vite-renderer',
                    reason: ''
                },
                {
                    package: 'left-pad',
                    layers: ['renderer'],
                    bundledBy: 'vite-renderer',
                    reason: '这是一个长度足够但源码已不再使用该包的过期条目，用于自检'
                },
                {
                    package: 'markdown-it',
                    layers: ['renderer'],
                    bundledBy: 'vite-renderer',
                    reason: '这是一个已在 dependencies 中的包，allowlist 条目应判定失效'
                }
            ],
            classification,
            new Map([['vue', new Set<BundledLayer>(['renderer'])]]),
            15
        )
        const hygieneText = formatAllowlistIssues(hygieneIssues)
        expect(hygieneText).toContain('缺少书面理由')
        expect(hygieneText).toContain('过期条目')
        expect(hygieneText).toContain('已在 dependencies')
        expect(hygieneText).toContain('EXPECTED_ALLOWLIST_SIZE')
    })
})

describe('审计口径（P2-5：全量依赖树纳入门禁，本地可复现）', () => {
    /** 读取 package.json scripts */
    const scripts =
        (
            JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')) as {
                scripts?: Record<string, string>
            }
        ).scripts ?? {}

    it('package.json 的 audit 脚本覆盖全量树且带 --audit-level=high', () => {
        // 全量审计（含 dev）：P2-5 的核心门禁，必须显式限定官方 registry（本地 .npmrc 指向镜像，
        // 镜像不实现 audit 端点，不限定 registry 会导致 `npm audit` 直接报错、门禁不可复现）
        const auditAll = scripts['audit:all'] ?? ''
        expect(auditAll).toContain('npm audit')
        expect(auditAll).toContain('--audit-level=high')
        expect(auditAll).not.toContain('--omit=dev')
        expect(auditAll).toContain('registry=https://registry.npmjs.org')

        // 生产专项审计保留（主进程 externalize 依赖快速核对）
        const auditProd = scripts['audit:prod'] ?? ''
        expect(auditProd).toContain('npm audit')
        expect(auditProd).toContain('--omit=dev')
        expect(auditProd).toContain('--audit-level=high')

        // 短别名：本地一条命令复现 CI 全量门禁
        const audit = scripts.audit ?? ''
        expect(audit).toContain('npm audit')
        expect(audit).toContain('--audit-level=high')
        expect(audit).not.toContain('--omit=dev')
    })

    it('CI 与 release 工作流使用全量 audit 门禁（不得回退为仅生产依赖）', () => {
        for (const workflow of ['.github/workflows/ci.yml', '.github/workflows/release.yml']) {
            const content = readWorkflow(workflow)
            expect(content, `${workflow} 不存在或为空`).not.toBe('')
            // 使用 package.json audit:all（单一真源，本地可复现）
            expect(content, `${workflow} 缺少全量依赖审计步骤（npm run audit:all）`).toContain(
                'npm run audit:all'
            )
            // 任何直接写的 npm audit 命令都必须带 --audit-level=high（口径统一）
            const auditLines = content
                .split('\n')
                .map((line) => line.trim())
                .filter((line) => line.includes('npm audit') && !line.startsWith('#'))
            for (const line of auditLines) {
                expect(
                    line,
                    `${workflow} 的 audit 命令未限定 --audit-level=high：${line}`
                ).toContain('--audit-level=high')
            }
        }
    })
})
