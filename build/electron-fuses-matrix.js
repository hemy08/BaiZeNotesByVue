/**
 * Electron Fuses 矩阵单一真源（P3-4 余项评估落地配套）
 *
 * 背景、逐项评估证据与「为什么 grantFileProtocolExtraPrivileges 保持启用」见
 * out/tool-results/fix-fuses2.md；配置真源仍是 electron-builder.yml 的 electronFuses。
 *
 * 约定：
 * - RELEASE_FUSE_MATRIX 描述「发布产物（win-unpacked / NSIS / portable）应具备的 fuse 位」；
 *   build/verify-packaged-fuses.js 在构建后读取 exe 实际 fuse 线并逐项断言，避免
 *   「配置写了但未生效」；electron-builder.yml 与本矩阵不一致时该断言会失败。
 * - E2E 构建只在发布矩阵之上放开 enableNodeCliInspectArguments（Playwright
 *   `_electron.launch` 依赖 `--inspect=0` 连接主进程），由 build/e2e-enable-inspect.js
 *   显式翻转并断言其余位保持不变——发布配置（electron-builder.yml）不保留测试例外。
 */
const { FuseV1Options } = require('@electron/fuses')

/**
 * @electron/fuses 的 fuse 线状态值（FuseState 枚举未从包入口导出，按常量镜像；
 * 对应 node_modules/@electron/fuses/dist/constants.js 的 FuseState）。
 */
const FUSE_STATE = {
    DISABLE: 48,
    ENABLE: 49,
    REMOVED: 114,
    INHERIT: 144
}

/** FuseV1Options（fuse 线序号）→ electron-builder.yml 中的 electronFuses 字段名 */
const FUSE_KEYS = {
    [FuseV1Options.RunAsNode]: 'runAsNode',
    [FuseV1Options.EnableCookieEncryption]: 'enableCookieEncryption',
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: 'enableNodeOptionsEnvironmentVariable',
    [FuseV1Options.EnableNodeCliInspectArguments]: 'enableNodeCliInspectArguments',
    [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: 'enableEmbeddedAsarIntegrityValidation',
    [FuseV1Options.OnlyLoadAppFromAsar]: 'onlyLoadAppFromAsar',
    [FuseV1Options.LoadBrowserProcessSpecificV8Snapshot]: 'loadBrowserProcessSpecificV8Snapshot',
    [FuseV1Options.GrantFileProtocolExtraPrivileges]: 'grantFileProtocolExtraPrivileges'
}

/**
 * 发布产物 fuse 矩阵（8 项全量显式声明；值语义 = 该 Electron 特性是否启用，与
 * electron-builder.yml / @electron/fuses 一致）。
 *
 * 逐项理由（完整版见报告 out/tool-results/fix-app-protocol.md 与 fix-fuses2.md）：
 * - runAsNode:false                        禁止 ELECTRON_RUN_AS_NODE 把应用当 Node 运行；
 * - enableCookieEncryption:false           应用不使用 Cookie（无登录态），保持默认；
 * - enableNodeOptionsEnvironmentVariable:false  NODE_OPTIONS/NODE_EXTRA_CA_CERTS 不被读取，
 *                                          阻断环境变量注入 Node 参数；代价是企业自定义 CA 场景
 *                                          需改用系统证书库（已在报告记录取舍）；
 * - enableNodeCliInspectArguments:false    禁用 --inspect/--inspect-brk/SIGUSR1 调试入口；
 *                                          E2E 构建由 build/e2e-enable-inspect.js 单独放开；
 * - enableEmbeddedAsarIntegrityValidation:true 校验 app.asar 完整性（Windows ≥ Electron 30）；
 * - onlyLoadAppFromAsar:true               只从 app.asar 加载应用代码，阻断旁加载；
 * - loadBrowserProcessSpecificV8Snapshot:false 无自定义 V8 快照需求，保持默认；
 * - grantFileProtocolExtraPrivileges:false **2026-11-20 起已关闭**：renderer 从 file:// 迁移到
 *                                          app:// 自定义标准安全协议（src/main/protocol/），
 *                                          本地用户文件走受 Path Guard 校验的 app://local；
 *                                          消除 file:// 页面的 fetch/ServiceWorker/子帧越权面。
 *                                          迁移与 A/B 证据见 out/tool-results/fix-app-protocol.md。
 */
const RELEASE_FUSE_MATRIX = {
    runAsNode: false,
    enableCookieEncryption: false,
    enableNodeOptionsEnvironmentVariable: false,
    enableNodeCliInspectArguments: false,
    enableEmbeddedAsarIntegrityValidation: true,
    onlyLoadAppFromAsar: true,
    loadBrowserProcessSpecificV8Snapshot: false,
    grantFileProtocolExtraPrivileges: false
}

/** fuse 线状态值 → 布尔（启用/禁用）；未知状态显式失败，避免静默放过 */
function fuseStateToBoolean(state) {
    if (state === FUSE_STATE.ENABLE) {
        return true
    }
    if (state === FUSE_STATE.DISABLE) {
        return false
    }
    throw new Error(`无法识别的 fuse 线状态值：${String(state)}`)
}

/**
 * 读取指定 Electron 可执行文件（打包产物 exe）的 fuse 状态。
 * @param {string} executablePath 打包后的可执行文件路径
 * @returns {Promise<Record<string, boolean>>} 键为 electronFuses 字段名，值为是否启用
 */
async function readFuseStates(executablePath) {
    const { getCurrentFuseWire } = require('@electron/fuses')
    const wire = await getCurrentFuseWire(executablePath)
    /** @type {Record<string, boolean>} */
    const states = {}
    for (const [optionIndex, key] of Object.entries(FUSE_KEYS)) {
        const state = wire[optionIndex]
        if (state === undefined) {
            throw new Error(`fuse 线中缺少 ${key}（线序号 ${optionIndex}）`)
        }
        states[key] = fuseStateToBoolean(state)
    }
    return states
}

/**
 * 对比实际 fuse 状态与期望矩阵。
 * @param {Record<string, boolean>} actual 实际状态
 * @param {Record<string, boolean>} expected 期望矩阵
 * @returns {Array<{ key: string, actual: boolean, expected: boolean }>} 差异项（空数组表示一致）
 */
function diffFuseStates(actual, expected) {
    return Object.keys(expected)
        .filter((key) => actual[key] !== expected[key])
        .map((key) => ({ key, actual: actual[key], expected: expected[key] }))
}

module.exports = {
    FUSE_STATE,
    FUSE_KEYS,
    RELEASE_FUSE_MATRIX,
    fuseStateToBoolean,
    readFuseStates,
    diffFuseStates
}
