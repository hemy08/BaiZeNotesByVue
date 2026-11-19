/**
 * 架构依赖边界自动化测试（结构优化第 1 批 1.1 / H1：依赖边界自动化）
 *
 * ## 目的
 * 把「进程间/层间的依赖方向」从注释约定升级为可执行门禁：扫描 src/ 下全部源码的
 * 静态 import/export 语句，解析相对路径目标所在层，断言不存在反向/跨层依赖。
 *
 * ## 强制规则（violation 即失败）
 * 1. `src/main/utils/**` 禁止静态 import `src/main/config/**`
 *    —— H1 核心：utils → config 反向依赖必须为 0，**不允许任何 KNOWN_EXCEPTIONS**；
 * 2. `src/main/utils/**` 禁止静态 import `src/main/ipc/**`
 *    —— 历史遗留 IPC 注册枢纽（utils.ts → ipcListenerManager）登记为例外，
 *       属后续「IPC 注册收口」批次范围，不在本批处理；
 * 3. `src/main/config/**` 允许 import utils（config → utils 是既有注入方向，不设规则），
 *    但 utils 不能回向（由规则 1 保证单向）；
 * 4. `src/shared/**` 禁止 import `src/main|src/renderer|src/preload/**`
 *    —— 共享层是两侧共同依赖的叶子，不得反向依赖任何进程层；
 *    1.3 批已完成：shared 的 node/electron 内置模块约束由 shared-boundary.test.ts 强制执行；原 TODO 保留说明——
 *    fs/path 等 Node 内建）在本文件预留规则位，本批先不启用，避免与既有 shared
 *    纯类型/纯常量现状冲突；
 * 5. `src/renderer/**` 禁止 import `src/main/**` 与直接 import 'electron'；
 * 6. `src/preload/**` 禁止 import `src/main/**`、`src/renderer/**`。
 *
 * ## 实现约定
 * - 纯 fs 读取 + 正则提取 import/export 语句，不引入 TypeScript 编译器/打包工具依赖；
 * - 排除 `*.d.ts`（纯类型声明）与资源文件，只扫描 .ts/.tsx/.js/.mjs/.vue（SFC 内
 *   <script> 的 import 也能被正则覆盖）；
 * - 输出违规文件 + 行号 + 目标路径，断言未登记违规数为 0；
 * - 允许的例外必须写入 KNOWN_EXCEPTIONS 且附中文原因；同时反向校验例外仍然命中真实
 *   违规，防止「例外过期后长期豁免」。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

/** 仓库根目录：vitest 以仓库根为工作目录运行（npm test / npx vitest 均如此） */
const REPO_ROOT = process.cwd()
/** 源码根目录 */
const SRC_ROOT = path.join(REPO_ROOT, 'src')

/** 参与扫描的源码扩展名（.vue 覆盖渲染层 SFC 内的 import） */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.vue'])

/**
 * 静态 import/export 语句提取：支持
 * - `import x from 'a'` / `import { a, b } from 'a'` / `import type { T } from 'a'`（可跨行）
 * - `import 'a'`（副作用导入）
 * - `export { x } from 'a'` / `export * from 'a'` / `export type { T } from 'a'`
 * 说明：刻意不解析注释中的示例代码（注释内若无真实 import 关键字通常不会命中；
 * 若命中且指向层级路径，会作为真实依赖处理——宁可多拦截也不漏）。
 */
const STATIC_IMPORT_RE =
    /(?:^|\n)[ \t]*(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\sfrom\s+)?['"]([^'"]+)['"]/g

/** 相对路径导入（. 或 .. 开头） */
const RELATIVE_IMPORT_RE = /^\.{1,2}(?:\/|\\|$)/

/** 渲染层别名（electron.vite.config.ts / vitest.config.ts 中的 @renderer） */
const RENDERER_ALIAS_PREFIX = '@renderer/'

/** 一条未登记依赖违规 */
interface LayerViolation {
    /** 规则标识（同时用于 KNOWN_EXCEPTIONS 匹配） */
    rule: string
    /** 违规文件（仓库相对路径，正斜杠） */
    file: string
    /** import 语句所在行号（1-based） */
    line: number
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
 * 例外清单（当前仅 1 条，且均不在 H1 范围）。
 * 注意：utils → config 的违规**禁止**登记为例外（H1 验收要求清零）。
 */
const KNOWN_EXCEPTIONS: KnownException[] = [
    {
        rule: 'utils-no-ipc',
        file: 'src/main/utils/utils.ts',
        specifier: '../ipc/ipc-listener-manager',
        reason: 'H1 范围外：utils.ts 是 IPC 注册枢纽，需经 ipcListenerManager 统一台账注册；清理需随 IPC 注册整体迁移批次进行（本批只强制 utils→config 清零）'
    },
    {
        rule: 'utils-no-ipc',
        file: 'src/main/utils/startup-restore.ts',
        specifier: '../ipc/welcome-state',
        reason: 'H1 范围外：启动恢复需读写欢迎页状态，而 welcome-state 历史归属 ipc 目录；应随 IPC/启动模块归属调整批次一并迁移'
    }
]

/** 归一化为仓库相对路径 + 正斜杠（跨平台稳定） */
function toRepoRelative(absolutePath: string): string {
    return path.relative(REPO_ROOT, absolutePath).split(path.sep).join('/')
}

/** 是否为主进程 utils 层文件 */
function isMainUtils(relativeFile: string): boolean {
    return relativeFile.startsWith('src/main/utils/')
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
    // 未解析到实体文件时仍返回规范化路径，按前缀判断（例如目录级导入）
    return base
}

/** 统计字符串中某个下标之前的换行数，得到 1-based 行号 */
function lineNumberAt(content: string, index: number): number {
    let line = 1
    for (let cursor = 0; cursor < index; cursor += 1) {
        if (content.charCodeAt(cursor) === 10) {
            line += 1
        }
    }
    return line
}

/** 提取单个文件内的全部静态 import/export 说明符（附行号） */
function extractStaticImports(file: string): Array<{ specifier: string; line: number }> {
    const content = fs.readFileSync(file, 'utf-8')
    const imports: Array<{ specifier: string; line: number }> = []
    STATIC_IMPORT_RE.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = STATIC_IMPORT_RE.exec(content)) !== null) {
        imports.push({ specifier: match[1], line: lineNumberAt(content, match.index) })
    }
    return imports
}

/** 按规则收集全部层级违规（未过滤例外） */
function collectLayerViolations(): LayerViolation[] {
    const files = collectSourceFiles(SRC_ROOT)
    const violations: LayerViolation[] = []
    for (const absoluteFile of files) {
        const file = toRepoRelative(absoluteFile)
        for (const { specifier, line } of extractStaticImports(absoluteFile)) {
            const resolved = resolveSpecifier(absoluteFile, specifier)
            const target = resolved ? toRepoRelative(resolved) : specifier

            // 规则 1：utils 禁止 import config（H1 硬门禁，无例外）
            if (isMainUtils(file) && target.startsWith('src/main/config/')) {
                violations.push({
                    rule: 'utils-no-config',
                    file,
                    line,
                    specifier,
                    target,
                    reason: 'utils 反向依赖 config（H1 禁止，须改为 utils/providers 注入）'
                })
                continue
            }
            // 规则 2：utils 禁止 import ipc（历史遗留按 KNOWN_EXCEPTIONS 登记）
            if (isMainUtils(file) && target.startsWith('src/main/ipc/')) {
                violations.push({
                    rule: 'utils-no-ipc',
                    file,
                    line,
                    specifier,
                    target,
                    reason: 'utils 反向依赖 ipc（应经 IPC 注册收口批次迁移）'
                })
                continue
            }
            // 规则 4：shared 禁止反向 import 任一进程层
            if (
                file.startsWith('src/shared/') &&
                (target.startsWith('src/main/') ||
                    target.startsWith('src/renderer/') ||
                    target.startsWith('src/preload/'))
            ) {
                violations.push({
                    rule: 'shared-no-cross-layer',
                    file,
                    line,
                    specifier,
                    target,
                    reason: '共享层不得反向 import 进程层（main/renderer/preload）'
                })
                continue
            }
            // 规则 5：renderer 禁止 import main 与直接 import electron
            if (file.startsWith('src/renderer/') && specifier === 'electron') {
                violations.push({
                    rule: 'renderer-no-electron',
                    file,
                    line,
                    specifier,
                    target,
                    reason: '渲染层禁止直接 import electron（须经 preload 暴露的受限 API）'
                })
                continue
            }
            if (file.startsWith('src/renderer/') && target.startsWith('src/main/')) {
                violations.push({
                    rule: 'renderer-no-main',
                    file,
                    line,
                    specifier,
                    target,
                    reason: '渲染层禁止 import 主进程代码（跨进程契约走 shared/preload）'
                })
                continue
            }
            // 规则 6：preload 禁止 import main / renderer
            if (
                file.startsWith('src/preload/') &&
                (target.startsWith('src/main/') || target.startsWith('src/renderer/'))
            ) {
                violations.push({
                    rule: 'preload-no-cross-layer',
                    file,
                    line,
                    specifier,
                    target,
                    reason: 'preload 禁止 import main/renderer（仅可依赖 shared 与 electron）'
                })
                continue
            }
        }
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

/** 格式化为可读的违规清单（用于断言失败信息：文件 + 行号 + 目标） */
function formatViolations(violations: LayerViolation[]): string {
    return violations
        .map(
            (violation) =>
                `${violation.file}:${violation.line} [${violation.rule}] ` +
                `"${violation.specifier}" -> ${violation.target}（${violation.reason}）`
        )
        .join('\n')
}

describe('架构依赖边界（H1：依赖方向自动化守护）', () => {
    const allViolations = collectLayerViolations()
    const excepted = allViolations.filter((violation) =>
        KNOWN_EXCEPTIONS.some((exception) => matchesException(violation, exception))
    )
    const unexpected = allViolations.filter(
        (violation) => !KNOWN_EXCEPTIONS.some((exception) => matchesException(violation, exception))
    )

    it('扫描范围有效（防止路径失效导致 0 文件空断言）', () => {
        const files = collectSourceFiles(SRC_ROOT)
        expect(files.length).toBeGreaterThan(100)
        // H1 关键文件必须在扫描范围内
        expect(files.map((file) => toRepoRelative(file))).toContain(
            'src/main/utils/auto-backup.ts'
        )
        expect(files.map((file) => toRepoRelative(file))).toContain('src/main/index.ts')
    })

    it('utils 不得静态 import config（H1 硬门禁，无任何例外）', () => {
        const utilsToConfig = allViolations.filter(
            (violation) => violation.rule === 'utils-no-config'
        )
        expect(utilsToConfig, formatViolations(utilsToConfig)).toEqual([])
    })

    it('不得存在未登记的跨层/反向依赖违规', () => {
        expect(unexpected, formatViolations(unexpected)).toEqual([])
    })

    it('KNOWN_EXCEPTIONS 每条都附原因且仍命中真实违规（防例外过期后继续豁免）', () => {
        for (const exception of KNOWN_EXCEPTIONS) {
            expect(exception.reason.trim().length, `例外缺少原因：${exception.file}`).toBeGreaterThan(
                0
            )
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
        // 已登记例外数量保持可控，新增需在代码评审中说明
        expect(excepted.length).toBeLessThanOrEqual(KNOWN_EXCEPTIONS.length)
    })
})
