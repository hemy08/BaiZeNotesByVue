/**
 * 架构依赖边界自动化测试（结构优化第 1 批 1.1 / H1 + 2026-11-20 P1-1：依赖方向门禁扩展）
 *
 * ## 目的
 * 把「进程间/层间的依赖方向」从注释约定升级为可执行门禁：扫描 src/ 下全部源码的
 * **静态 import/export、动态 `import()`、`require()` 与类型层 `import()` 查询**，
 * 解析相对路径目标所在层，断言不存在反向/跨层依赖。
 *
 * ## 强制规则（violation 即失败）
 * 1. `src/main/utils/**` 禁止 import `src/main/config/**`
 *    —— H1 核心：utils → config 反向依赖必须为 0，**不允许任何 KNOWN_EXCEPTIONS**；
 * 2. `src/main/utils/**` 禁止 import `src/main/ipc/**`（P2 IPC 注册收口后硬门禁，无例外）
 *    —— 历史上 utils.ts 是 IPC 注册枢纽、startup-restore 依赖 ipc/welcome-state；本轮把
 *       29 处注册按域拆到 ipc/ 各模块、welcome-state 迁到 utils 层后，该方向违规清零；
 * 3. `src/main/config/**` 禁止 import `src/main/ipc/**`（P1-1 新增）
 *    —— config 是业务层（L2），ipc 是编排层（L1）；历史上 config-manager /
 *       system-theme 反向依赖 ipc 的监听台账与主题广播实现。本轮已把
 *       theme-broadcast 迁到中性层 utils，并把 IPC 注册能力改为依赖倒置注入
 *       （utils/ipc-registration），**本规则为硬门禁、无任何例外**；
 * 4. `src/shared/**` 禁止 import `src/main|src/renderer|src/preload/**`
 *    —— 共享层是两侧共同依赖的叶子，不得反向依赖任何进程层；
 * 5. `src/main/**` 禁止 import `src/renderer/**`（P1-1 新增）
 *    —— 主进程不得依赖渲染层实现（跨进程契约走 shared/preload）；
 * 6. `src/main/**` 禁止 import `src/preload/**`（P1-1 新增）
 *    —— 主进程不得依赖 preload 包装层（同规则 5）；
 * 7. `src/renderer/**` 禁止 import `src/main/**` 与直接 import 'electron'；
 * 8. `src/renderer/**` 禁止 import `src/preload/**`（P1-1 新增）
 *    —— 渲染层只允许经 contextBridge 暴露的运行时 API（`window.api` 等），
 *       不得以源码路径直接依赖 preload 实现；
 * 9. `src/preload/**` 禁止 import `src/main/**`、`src/renderer/**`。
 *
 * ## 实现约定
 * - 用 TypeScript 编译器 API 解析 AST（复用 shared-boundary.test.ts 的方案）：
 *   注释、字符串字面量中的伪 import 天然不参与判定，比正则更可靠；TypeScript 本就是
 *   仓库开发依赖，未新增依赖；
 * - 除静态 import/export 外，同时拦截 `import('...')` 动态导入、`require('...')`
 *   与类型层 `typeof import('...')` 查询（防止以懒加载/类型查询绕开方向门禁）；
 * - `.vue` SFC 先提取 `<script>` / `<script setup>` 块再解析，并把块内行号还原为
 *   文件真实行号（仅扫描真实脚本，模板/样式不参与）；
 * - 排除 `*.d.ts`（纯类型声明，且 preload/index.d.ts 等全局声明不构成运行时依赖）
 *   与资源文件，只扫描 .ts/.tsx/.js/.mjs/.cjs/.vue（保留 H1 批的扫描口径）；
 * - 输出违规文件 + 行号 + 依赖种类 + 目标路径，断言未登记违规数为 0；
 * - 允许的例外必须写入 KNOWN_EXCEPTIONS 且附中文原因；同时反向校验例外仍然命中真实
 *   违规，防止「例外过期后长期豁免」；
 * - 附「规则自检」用例：用内联违例源码（含 .vue SFC / 动态 import / require）证明
 *   扫描与判定确实生效，避免路径失效或规则写错导致空断言假绿。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import ts from 'typescript'

/** 仓库根目录：vitest 以仓库根为工作目录运行（npm test / npx vitest 均如此） */
const REPO_ROOT = process.cwd()
/** 源码根目录 */
const SRC_ROOT = path.join(REPO_ROOT, 'src')

/** 参与扫描的源码扩展名（.vue 覆盖渲染层 SFC 内的 import） */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue'])

/** 相对路径导入（. 或 .. 开头） */
const RELATIVE_IMPORT_RE = /^\.{1,2}(?:\/|\\|$)/

/** 渲染层别名（electron.vite.config.ts / vitest.config.ts 中的 @renderer） */
const RENDERER_ALIAS_PREFIX = '@renderer/'

/** SFC 脚本块：`<script ...>内容</script>`（含 setup；属性内不含 '>'，足够覆盖本仓库） */
const VUE_SCRIPT_BLOCK_RE = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi

/** 一条依赖引用（静态/动态/require/类型查询） */
interface ModuleReference {
    /** import 说明符原文 */
    specifier: string
    /** 引用所在行号（1-based） */
    line: number
    /** 依赖种类（用于失败信息定位） */
    kind: 'static' | 'dynamic' | 'require' | 'type'
}

/** 一条未登记依赖违规 */
interface LayerViolation {
    /** 规则标识（同时用于 KNOWN_EXCEPTIONS 匹配） */
    rule: string
    /** 违规文件（仓库相对路径，正斜杠） */
    file: string
    /** import 语句所在行号（1-based） */
    line: number
    /** 依赖种类 */
    kind: ModuleReference['kind']
    /** import 说明符原文 */
    specifier: string
    /** 解析后的目标（仓库相对路径；非相对导入为说明符原文） */
    target: string
    /** 违规说明 */
    reason: string
}

/** 已登记的例外（必须附原因；新增前先确认不在本批范围） */
interface KnownException {
    rule: string
    file: string
    specifier: string
    reason: string
}

/**
 * 例外清单（P2 IPC 注册收口后为 **0 条**；只减不增）。
 * 注意：
 * - utils → config 的违规**禁止**登记为例外（H1 验收要求清零）；
 * - config → ipc 的违规**禁止**登记为例外（P1-1 验收要求清零）；
 * - utils → ipc 的违规**禁止**登记为例外（P2 收口验收要求清零：注册已拆到 ipc/、
 *   welcome-state 已迁 utils 层，方向改为合法的 ipc → utils）。
 */
const KNOWN_EXCEPTIONS: KnownException[] = []

/** 归一化为仓库相对路径 + 正斜杠（跨平台稳定） */
function toRepoRelative(absolutePath: string): string {
    return path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/')
}

/** 是否为主进程 utils 层文件 */
function isMainUtils(relativeFile: string): boolean {
    return relativeFile.startsWith('src/main/utils/')
}

/** 是否为主进程 config 层文件 */
function isMainConfig(relativeFile: string): boolean {
    return relativeFile.startsWith('src/main/config/')
}

/** 递归收集参与扫描的源码文件（排除 *.d.ts） */
function collectSourceFiles(directory: string, collected: string[] = []): string[] {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) {
            collectSourceFiles(absolute, collected)
            continue
        }
        if (entry.name.endsWith('.d.ts')) {
            continue
        }
        if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
            collected.push(absolute)
        }
    }
    return collected
}

/**
 * 解析 import 说明符到实际文件（相对导入按文件所在目录解析，补全省略的扩展名与
 * /index 入口；渲染层 @renderer 别名映射到 src/renderer/src）。
 * 非相对且非别名导入（npm 包等）返回 null，不参与层级规则。
 */
function resolveSpecifier(fromFile: string, specifier: string): string | null {
    if (specifier.startsWith(RENDERER_ALIAS_PREFIX)) {
        return path.join(SRC_ROOT, 'renderer', 'src', specifier.slice(RENDERER_ALIAS_PREFIX.length))
    }
    if (!RELATIVE_IMPORT_RE.test(specifier)) {
        return null
    }
    const base = path.resolve(path.dirname(fromFile), specifier)
    const candidates = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}.js`,
        `${base}.mjs`,
        `${base}.cjs`,
        `${base}.vue`,
        path.join(base, 'index.ts'),
        path.join(base, 'index.tsx'),
        path.join(base, 'index.js'),
        path.join(base, 'index.vue')
    ]
    for (const candidate of candidates) {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate
        }
    }
    // 未解析到实体文件时仍返回规范化路径，按前缀判断（例如资源/目录级导入）
    return base
}

/** 统计字符串中某个下标之前的换行数（SFC 脚本块行号还原用） */
function countNewlinesBefore(content: string, index: number): number {
    let count = 0
    for (let cursor = 0; cursor < index; cursor += 1) {
        if (content.charCodeAt(cursor) === 10) {
            count += 1
        }
    }
    return count
}

/**
 * 解析一段 TS/JS 源码，提取全部依赖引用（附行号）。
 * @param lineOffset 该段源码首行在真实文件中的行偏移（0-based；纯文件为 0）
 */
function collectTsModuleReferences(
    fileName: string,
    content: string,
    lineOffset: number,
    scriptKind: ts.ScriptKind
): ModuleReference[] {
    const sourceFile = ts.createSourceFile(
        fileName,
        content,
        ts.ScriptTarget.Latest,
        true,
        scriptKind
    )
    const references: ModuleReference[] = []

    const push = (node: ts.Node, kind: ModuleReference['kind']): void => {
        if (!ts.isStringLiteralLike(node)) {
            return
        }
        const line =
            sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
            1 +
            lineOffset
        references.push({ specifier: node.text, line, kind })
    }

    const visit = (node: ts.Node): void => {
        // 静态 import / export ... from '...'
        if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
            if (node.moduleSpecifier) {
                push(node.moduleSpecifier, 'static')
            }
        } else if (ts.isImportEqualsDeclaration(node)) {
            // import x = require('...')
            if (ts.isExternalModuleReference(node.moduleReference)) {
                push(node.moduleReference.expression, 'static')
            }
        } else if (ts.isImportTypeNode(node)) {
            // 类型层查询 typeof import('...') / import('...').T：同样纳入方向约束
            const argument = node.argument
            if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
                push(argument.literal, 'type')
            }
        } else if (ts.isCallExpression(node)) {
            const isDynamicImport = node.expression.kind === ts.SyntaxKind.ImportKeyword
            const isRequire = ts.isIdentifier(node.expression) && node.expression.text === 'require'
            if (isDynamicImport || isRequire) {
                for (const argument of node.arguments) {
                    push(argument, isDynamicImport ? 'dynamic' : 'require')
                }
            }
        }
        ts.forEachChild(node, visit)
    }
    visit(sourceFile)
    return references
}

/** 提取单文件内的全部依赖引用（.vue 先拆 <script> 块，行号还原为文件真实行号） */
function collectModuleReferences(absoluteFile: string, content: string): ModuleReference[] {
    const extension = path.extname(absoluteFile).toLowerCase()
    if (extension !== '.vue') {
        return collectTsModuleReferences(absoluteFile, content, 0, ts.ScriptKind.TS)
    }

    const references: ModuleReference[] = []
    VUE_SCRIPT_BLOCK_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = VUE_SCRIPT_BLOCK_RE.exec(content)) !== null) {
        const attributes = match[1] ?? ''
        const scriptContent = match[2] ?? ''
        // 外部脚本（src="..."）与空脚本块不参与解析
        if (/\bsrc\s*=/i.test(attributes) || scriptContent.trim().length === 0) {
            continue
        }
        // 脚本内容起点 = 开标签结束的 '>' 之后
        const contentStart = match.index + match[0].indexOf('>') + 1
        const lineOffset = countNewlinesBefore(content, contentStart)
        const scriptKind = /\blang\s*=\s*["']tsx["']/i.test(attributes)
            ? ts.ScriptKind.TSX
            : ts.ScriptKind.TS
        references.push(
            ...collectTsModuleReferences(absoluteFile, scriptContent, lineOffset, scriptKind)
        )
    }
    return references
}

/**
 * 按层方向规则判定单条依赖引用。
 * @param file 引用方文件（仓库相对路径，正斜杠）
 * @param specifier 说明符原文
 * @param target 解析后的目标（仓库相对路径）；非相对/非别名导入为 null
 * @returns 命中规则与原因；合法依赖返回 null
 */
function inspectLayerRules(
    file: string,
    specifier: string,
    target: string | null
): { rule: string; reason: string } | null {
    const targetPath = target ?? ''

    // 规则 7 前置：渲染层禁止直接 import electron（含子路径）
    if (
        file.startsWith('src/renderer/') &&
        (specifier === 'electron' || specifier.startsWith('electron/'))
    ) {
        return {
            rule: 'renderer-no-electron',
            reason: '渲染层禁止直接 import electron（须经 preload 暴露的受限 API）'
        }
    }
    // 规则 1：utils 禁止 import config（H1 硬门禁，无例外）
    if (isMainUtils(file) && targetPath.startsWith('src/main/config/')) {
        return {
            rule: 'utils-no-config',
            reason: 'utils 反向依赖 config（H1 禁止，须改为 utils/providers 注入）'
        }
    }
    // 规则 2：utils 禁止 import ipc（P2 IPC 注册收口后硬门禁，无例外）
    if (isMainUtils(file) && targetPath.startsWith('src/main/ipc/')) {
        return {
            rule: 'utils-no-ipc',
            reason: 'utils 反向依赖 ipc（P2 收口后禁止：IPC 注册在 ipc 层，utils 只保留纯工具函数）'
        }
    }
    // 规则 3：config 禁止 import ipc（P1-1 硬门禁，无例外）
    if (isMainConfig(file) && targetPath.startsWith('src/main/ipc/')) {
        return {
            rule: 'config-no-ipc',
            reason: 'config 反向依赖 ipc（P1-1 禁止：主题广播/注册能力须经中性层或 provider 注入）'
        }
    }
    // 规则 4：shared 禁止反向 import 任一进程层
    if (
        file.startsWith('src/shared/') &&
        (targetPath.startsWith('src/main/') ||
            targetPath.startsWith('src/renderer/') ||
            targetPath.startsWith('src/preload/'))
    ) {
        return {
            rule: 'shared-no-cross-layer',
            reason: '共享层不得反向 import 进程层（main/renderer/preload）'
        }
    }
    // 规则 5：main 禁止 import renderer（P1-1 新增）
    if (file.startsWith('src/main/') && targetPath.startsWith('src/renderer/')) {
        return {
            rule: 'main-no-renderer',
            reason: '主进程禁止 import 渲染层实现（跨进程契约走 shared/preload）'
        }
    }
    // 规则 6：main 禁止 import preload（P1-1 新增）
    if (file.startsWith('src/main/') && targetPath.startsWith('src/preload/')) {
        return {
            rule: 'main-no-preload',
            reason: '主进程禁止 import preload 包装层（preload 只服务渲染进程）'
        }
    }
    // 规则 7：renderer 禁止 import main
    if (file.startsWith('src/renderer/') && targetPath.startsWith('src/main/')) {
        return {
            rule: 'renderer-no-main',
            reason: '渲染层禁止 import 主进程代码（跨进程契约走 shared/preload）'
        }
    }
    // 规则 8：renderer 禁止 import preload（P1-1 新增）
    if (file.startsWith('src/renderer/') && targetPath.startsWith('src/preload/')) {
        return {
            rule: 'renderer-no-preload',
            reason: '渲染层禁止以源码路径 import preload（只允许经 contextBridge 暴露的运行时 API）'
        }
    }
    // 规则 9：preload 禁止 import main / renderer
    if (
        file.startsWith('src/preload/') &&
        (targetPath.startsWith('src/main/') || targetPath.startsWith('src/renderer/'))
    ) {
        return {
            rule: 'preload-no-cross-layer',
            reason: 'preload 禁止 import main/renderer（仅可依赖 shared 与 electron）'
        }
    }
    return null
}

/** 对单份源码文本执行全部方向规则（供真实文件扫描与规则自检共用） */
function collectViolationsFromSource(file: string, content: string): LayerViolation[] {
    const absoluteFile = path.isAbsolute(file) ? file : path.join(REPO_ROOT, file)
    const relativeFile = toRepoRelative(absoluteFile)
    const violations: LayerViolation[] = []
    for (const reference of collectModuleReferences(absoluteFile, content)) {
        const resolved = resolveSpecifier(absoluteFile, reference.specifier)
        const target = resolved ? toRepoRelative(resolved) : reference.specifier
        const hit = inspectLayerRules(relativeFile, reference.specifier, resolved ? target : null)
        if (!hit) {
            continue
        }
        violations.push({
            rule: hit.rule,
            file: relativeFile,
            line: reference.line,
            kind: reference.kind,
            specifier: reference.specifier,
            target,
            reason: hit.reason
        })
    }
    return violations
}

/** 扫描 src/ 全部源码，收集未过滤例外的方向违规 */
function collectLayerViolations(): LayerViolation[] {
    const violations: LayerViolation[] = []
    for (const absoluteFile of collectSourceFiles(SRC_ROOT)) {
        const file = toRepoRelative(absoluteFile)
        violations.push(
            ...collectViolationsFromSource(file, fs.readFileSync(absoluteFile, 'utf-8'))
        )
    }
    return violations
}

/** 例外是否命中某条违规 */
function matchesException(violation: LayerViolation, exception: KnownException): boolean {
    return (
        violation.rule === exception.rule &&
        violation.file === exception.file &&
        violation.specifier === exception.specifier
    )
}

/** 格式化为可读的违规清单（用于断言失败信息：文件 + 行号 + 依赖种类 + 目标） */
function formatViolations(violations: LayerViolation[]): string {
    return violations
        .map(
            (violation) =>
                `${violation.file}:${violation.line} [${violation.rule}/${violation.kind}] ` +
                `"${violation.specifier}" -> ${violation.target}（${violation.reason}）`
        )
        .join('\n')
}

describe('架构依赖边界（H1 + P1-1：依赖方向自动化守护）', () => {
    const scannedFiles = collectSourceFiles(SRC_ROOT).map((file) => toRepoRelative(file))
    const allViolations = collectLayerViolations()
    const byRule = (rule: string): LayerViolation[] =>
        allViolations.filter((violation) => violation.rule === rule)
    const excepted = allViolations.filter((violation) =>
        KNOWN_EXCEPTIONS.some((exception) => matchesException(violation, exception))
    )
    const unexpected = allViolations.filter(
        (violation) => !KNOWN_EXCEPTIONS.some((exception) => matchesException(violation, exception))
    )

    it('扫描范围有效（防止路径失效导致 0 文件空断言）', () => {
        expect(scannedFiles.length).toBeGreaterThan(100)
        // H1/P1-1 关键文件必须在扫描范围内
        expect(scannedFiles).toContain('src/main/utils/auto-backup.ts')
        expect(scannedFiles).toContain('src/main/index.ts')
        expect(scannedFiles).toContain('src/main/config/config-manager.ts')
        expect(scannedFiles).toContain('src/main/config/system-theme.ts')
        expect(scannedFiles).toContain('src/main/utils/ipc-registration.ts')
        expect(scannedFiles).toContain('src/main/utils/theme-broadcast.ts')
        expect(scannedFiles).toContain('src/preload/index.ts')
        // theme-broadcast 已迁出 ipc 层（P1-1 反向边修复），不得残留旧路径
        expect(scannedFiles).not.toContain('src/main/ipc/theme-broadcast.ts')
        // P2 IPC 注册收口：原 utils.ts 的 29 处注册已拆到 ipc/ 各域模块，
        // 新模块必须进入扫描范围、welcome-state 不得残留旧 ipc 路径
        for (const migratedModule of [
            'src/main/ipc/utils-ipc.ts',
            'src/main/ipc/file-manager-ipc.ts',
            'src/main/ipc/crypto-ipc.ts',
            'src/main/ipc/navigation-ipc.ts',
            'src/main/ipc/theme-ipc.ts',
            'src/main/ipc/file-editor-ipc.ts',
            'src/main/ipc/system-ipc.ts',
            'src/main/utils/welcome-state.ts'
        ]) {
            expect(scannedFiles).toContain(migratedModule)
        }
        expect(scannedFiles).not.toContain('src/main/ipc/welcome-state.ts')
        // .vue SFC 必须进入扫描范围（动态 import/require 的 SFC 解析依赖于此）
        expect(scannedFiles.filter((file) => file.endsWith('.vue')).length).toBeGreaterThan(50)
        expect(scannedFiles).toContain('src/renderer/src/App.vue')
    })

    it('utils 不得静态 import config（H1 硬门禁，无任何例外）', () => {
        const utilsToConfig = byRule('utils-no-config')
        expect(utilsToConfig, formatViolations(utilsToConfig)).toEqual([])
    })

    it('config 不得 import ipc（P1-1 硬门禁，无任何例外）', () => {
        const configToIpc = byRule('config-no-ipc')
        expect(configToIpc, formatViolations(configToIpc)).toEqual([])
    })

    it('main 不得 import renderer / preload（P1-1 新增 0 基线）', () => {
        const violations = [...byRule('main-no-renderer'), ...byRule('main-no-preload')]
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('renderer 不得 import preload / main / electron（P1-1 补齐矩阵）', () => {
        const violations = [
            ...byRule('renderer-no-preload'),
            ...byRule('renderer-no-main'),
            ...byRule('renderer-no-electron')
        ]
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('shared / preload 不得反向依赖进程层（既有规则保持）', () => {
        const violations = [...byRule('shared-no-cross-layer'), ...byRule('preload-no-cross-layer')]
        expect(violations, formatViolations(violations)).toEqual([])
    })

    it('utils → ipc 必须为 0（P2 IPC 注册收口硬门禁，无任何例外）', () => {
        const utilsToIpc = byRule('utils-no-ipc')
        // 收口后：utils.ts 只保留纯工具函数，welcome-state 已迁 utils 层；
        // 架构测试的例外清单只减不增，本类违规不允许再登记例外
        expect(utilsToIpc, formatViolations(utilsToIpc)).toEqual([])
        expect(excepted).toHaveLength(0)
    })

    it('不得存在未登记的跨层/反向依赖违规', () => {
        expect(unexpected, formatViolations(unexpected)).toEqual([])
    })

    it('KNOWN_EXCEPTIONS 每条都附原因且仍命中真实违规（防例外过期后继续豁免）', () => {
        for (const exception of KNOWN_EXCEPTIONS) {
            expect(
                exception.reason.trim().length,
                `例外缺少原因：${exception.file}`
            ).toBeGreaterThan(0)
            const hit = allViolations.some((violation) => matchesException(violation, exception))
            expect(
                hit,
                `例外已过期（不再命中真实违规，请删除）：[${exception.rule}] ${exception.file} "${exception.specifier}"`
            ).toBe(true)
        }
        // 例外不得覆盖 utils → config（H1 验收要求该类违规清零）
        expect(KNOWN_EXCEPTIONS.some((exception) => exception.rule === 'utils-no-config')).toBe(
            false
        )
        // 例外不得覆盖 config → ipc（P1-1 验收要求该类违规清零）
        expect(KNOWN_EXCEPTIONS.some((exception) => exception.rule === 'config-no-ipc')).toBe(false)
        // 例外不得覆盖 utils → ipc（P2 收口验收要求该类违规清零）
        expect(KNOWN_EXCEPTIONS.some((exception) => exception.rule === 'utils-no-ipc')).toBe(false)
        // P2 收口后例外清单应为空（只减不增；新增需在代码评审中说明）
        expect(KNOWN_EXCEPTIONS).toHaveLength(0)
        expect(excepted).toHaveLength(0)
    })

    it('规则自检：AST 扫描须命中静态/动态/require/类型查询/SFC 违例，注释与字符串不得误报', () => {
        /** 自检样例：file 为仓库相对路径（无需真实存在，路径前缀决定规则） */
        const probes: Array<{ file: string; source: string }> = [
            {
                file: 'src/main/utils/__arch_probe__.ts',
                source: [
                    "// 注释中的伪违规不应命中：import { fake } from '../ipc/ipc-listener-manager'",
                    "import { themeConfig } from '../config/theme-config'",
                    "const lazyConfig = () => import('../config/system-setting')",
                    "const legacy = require('../ipc/ipc-listener-manager')",
                    "export { helper } from '../ipc/ipc-listener-manager'",
                    "export const label = 'import x from ../ipc/ipc-listener-manager'"
                ].join('\n')
            },
            {
                file: 'src/main/config/__arch_probe__.ts',
                source: [
                    "import { manager } from '../ipc/ipc-listener-manager'",
                    "const lazyBroadcast = () => import('../ipc/theme-broadcast')",
                    "type ConfigIpcModule = typeof import('../ipc/ipc-listener-manager')"
                ].join('\n')
            },
            {
                file: 'src/main/__arch_probe__.ts',
                source: [
                    "import App from '../renderer/src/App.vue'",
                    "import { rendererHelper } from '@renderer/common/logger'",
                    "const lazyPreload = () => import('../preload/index')"
                ].join('\n')
            },
            {
                file: 'src/renderer/src/__arch_probe__.ts',
                source: [
                    "import { ipcRenderer } from 'electron'",
                    "import { logger } from '../../main/utils/logger'",
                    "import preloadApi from '../../preload/index'",
                    "const lazyPreload = () => import('../../preload/index')"
                ].join('\n')
            },
            {
                file: 'src/preload/__arch_probe__.ts',
                source: [
                    "import { mainThing } from '../main/index'",
                    "import RendererThing from '../renderer/src/App.vue'"
                ].join('\n')
            },
            {
                file: 'src/shared/__arch_probe__.ts',
                source: ["import { logger } from '../main/utils/logger'"].join('\n')
            },
            {
                file: 'src/renderer/src/components/__arch_probe__.vue',
                source: [
                    '<template>',
                    '    <div>{{ label }}</div>',
                    '</template>',
                    '<script setup lang="ts">',
                    "import { logger } from '../../../main/utils/logger'",
                    "const lazyPreload = () => import('../../../preload/index')",
                    "export const label = '导入 ../main 仅是文案，不应命中'",
                    '</script>'
                ].join('\n')
            }
        ]

        const probeViolations = probes.flatMap((probe) =>
            collectViolationsFromSource(probe.file, probe.source)
        )
        const countRule = (rule: string): number =>
            probeViolations.filter((violation) => violation.rule === rule).length

        // utils 层：静态 import config + 动态 import config = 2；utils → ipc 2（require + export from）
        expect(countRule('utils-no-config')).toBe(2)
        expect(countRule('utils-no-ipc')).toBe(2)
        // config 层：静态 + 动态 + 类型查询 = 3（P1-1 硬门禁，含绕行方式）
        expect(countRule('config-no-ipc')).toBe(3)
        // main 层：renderer 2（相对路径 + @renderer 别名）/ preload 1
        expect(countRule('main-no-renderer')).toBe(2)
        expect(countRule('main-no-preload')).toBe(1)
        // renderer 层：electron 1 + main 2（静态 + SFC 内静态）+ preload 3（静态 + 动态 + SFC 内动态）
        expect(countRule('renderer-no-electron')).toBe(1)
        expect(countRule('renderer-no-main')).toBe(2)
        expect(countRule('renderer-no-preload')).toBe(3)
        // preload / shared 各 2 / 1
        expect(countRule('preload-no-cross-layer')).toBe(2)
        expect(countRule('shared-no-cross-layer')).toBe(1)
        // 注释行（utils probe 第 1 行）与字符串文案（第 6 行）不得误报
        expect(
            probeViolations.some(
                (violation) =>
                    violation.file === 'src/main/utils/__arch_probe__.ts' && violation.line === 1
            )
        ).toBe(false)
        // 行号必须准确：utils probe 的第 2/3/4/5 行分别命中
        expect(
            probeViolations
                .filter((violation) => violation.file === 'src/main/utils/__arch_probe__.ts')
                .map((violation) => violation.line)
                .sort((left, right) => left - right)
        ).toEqual([2, 3, 4, 5])
        // SFC 行号还原：.vue 内静态 import 位于第 5 行、动态 import 位于第 6 行
        expect(
            probeViolations
                .filter(
                    (violation) =>
                        violation.file === 'src/renderer/src/components/__arch_probe__.vue'
                )
                .map((violation) => violation.line)
                .sort((left, right) => left - right)
        ).toEqual([5, 6])
    })
})
