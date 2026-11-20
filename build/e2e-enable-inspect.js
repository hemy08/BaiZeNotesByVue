/**
 * E2E 专用 fuse 例外：为 Playwright 放开主进程 inspect（P3-4 余项评估落地配套）
 *
 * 背景：发布配置（electron-builder.yml）已禁用 `enableNodeCliInspectArguments`，而
 * Playwright `_electron.launch()` 固定以 `--inspect=0` 启动 Electron 并等待主进程 Node
 * 调试器输出 `Debugger listening on ...`——禁用该 fuse 后启动会一直等待直至超时（实测
 * 120s TimeoutError），因此 E2E 无法直接对硬化产物运行。
 *
 * 方案（E2E 与硬化构建分离，发布配置不保留测试后门）：
 * 1. `npm run build:unpack` 产出**发布口径（全部硬化）**产物；
 * 2. `node build/verify-packaged-fuses.js` 在翻转前对硬化产物做 fuse 断言 + 无调试器启动冒烟；
 * 3. 本脚本**仅**把 `enableNodeCliInspectArguments` 翻回启用，供 Playwright 自动化；
 * 4. 上一步产物只用于测试，禁止发布/分发；发布流水线（build:win、build:win:all、
 *    release.yml）不调用本脚本，因此发布产物不受影响。
 *
 * 安全护栏：
 * - 必须显式设置环境变量 `ELECTRON_BUILDER_E2E=1`（防止误在发布流程中执行）；
 * - 翻转前断言当前 fuse 位与发布矩阵完全一致（避免对非硬化产物「假放行」）；
 * - 翻转后断言仅 inspect 一位变化、其余 7 位保持不变。
 *
 * 用法（仅本地/CI E2E）：
 *   node build/verify-packaged-fuses.js
 *   ELECTRON_BUILDER_E2E=1 node build/e2e-enable-inspect.js
 * 或一键：ELECTRON_BUILDER_E2E=1 npm run build:unpack:e2e
 */
const path = require('node:path')
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')

const { RELEASE_FUSE_MATRIX, readFuseStates, diffFuseStates } = require('./electron-fuses-matrix')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_APP = path.join(ROOT, 'out', 'build', 'dist', 'win-unpacked', 'BaiZeNotes.exe')

function log(...args) {
    console.log('[e2e-enable-inspect]', ...args)
}

function parseArgs(argv) {
    let app = DEFAULT_APP
    for (const arg of argv) {
        if (arg.startsWith('--app=')) {
            app = path.resolve(ROOT, arg.slice('--app='.length))
        } else {
            throw new Error(`未知参数：${arg}（支持 --app=）`)
        }
    }
    return { app }
}

/** 发布矩阵 + 仅 inspect 例外 = E2E 构建期望矩阵 */
const E2E_FUSE_MATRIX = { ...RELEASE_FUSE_MATRIX, enableNodeCliInspectArguments: true }

async function main() {
    if (process.env.ELECTRON_BUILDER_E2E !== '1') {
        throw new Error(
            '拒绝执行：必须显式设置环境变量 ELECTRON_BUILDER_E2E=1（该操作会给产物放开主进程 inspect，' +
                '仅允许用于 E2E 测试构建）。PowerShell 示例：$env:ELECTRON_BUILDER_E2E="1"; ' +
                'node build/e2e-enable-inspect.js'
        )
    }
    const { app } = parseArgs(process.argv.slice(2))
    log(`app = ${path.relative(ROOT, app)}`)

    const before = await readFuseStates(app)
    const releaseDiffs = diffFuseStates(before, RELEASE_FUSE_MATRIX)
    if (releaseDiffs.length > 0) {
        throw new Error(
            '当前产物不是发布硬化矩阵，拒绝放开 inspect（E2E 例外只能叠加在硬化产物上）：' +
                releaseDiffs.map((item) => `${item.key} 期望=${String(item.expected)}`).join('；')
        )
    }
    log('✓ 当前产物为发布硬化矩阵（inspect 已禁用）')

    log('翻转 enableNodeCliInspectArguments → 启用（仅 E2E 产物）')
    await flipFuses(app, {
        version: FuseVersion.V1,
        [FuseV1Options.EnableNodeCliInspectArguments]: true
    })

    const after = await readFuseStates(app)
    const unexpected = diffFuseStates(after, E2E_FUSE_MATRIX)
    if (unexpected.length > 0) {
        throw new Error(
            'E2E 例外翻转结果与期望不一致：' +
                unexpected
                    .map(
                        (item) =>
                            `${item.key} 期望=${String(item.expected)} 实际=${String(item.actual)}`
                    )
                    .join('；')
        )
    }
    log('✓ 仅 enableNodeCliInspectArguments 一位变化，其余 7 位保持发布矩阵')
    console.warn(
        '[e2e-enable-inspect] ⚠ 当前产物为 E2E 测试专用（主进程 inspect 已放开），禁止发布/分发；' +
            '发布构建请使用 npm run build:win:all'
    )
}

main().catch((error) => {
    console.error(
        `[e2e-enable-inspect] ✗ ${error instanceof Error ? error.message : String(error)}`
    )
    process.exitCode = 1
})
