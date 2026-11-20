/**
 * Playwright E2E 配置（ET-11：Electron 端到端；P0 E2E 补齐：启动恢复/设置保存/打包启动）
 *
 * 定位：在单元测试（jsdom mock）之上补一层「真实 Electron 进程 + 真实窗口」的验证，
 * 覆盖单元测试无法覆盖的部分：主进程启动、BrowserWindow 创建、preload contextBridge 注入、
 * 渲染层 Vue 挂载与 IPC 往返、启动恢复时序、系统设置落盘/跨重启持久化、打包产物（asar）启动。
 *
 * ## 运行前提（runbook）
 * 1. 先构建开发产物：`npx electron-vite build`（或一步到位 `npm run build:unpack`，
 *    该命令同时产出 out/build/main|preload|renderer 与 out/build/dist/win-unpacked）；
 *    注意：发布配置已禁用主进程 `--inspect`（enableNodeCliInspectArguments:false），
 *    Playwright 的 `_electron.launch` 依赖 `--inspect=0` 连接主进程，因此**打包启动用例**
 *    必须使用 `ELECTRON_BUILDER_E2E=1 npm run build:unpack:e2e` 构建的测试产物
 *    （发布硬化矩阵 + 仅 inspect 例外；该脚本会先断言硬化矩阵并做无调试器启动冒烟，
 *    详见 build/e2e-enable-inspect.js / out/tool-results/fix-fuses2.md）；
 * 2. 需要可用的桌面环境（Electron 需要窗口系统）；CI 在 windows-latest 的 `e2e` job 自动执行；
 * 3. Windows 下用例统一经 e2e/helpers/electron-profile.ts 使用 `out/tmp/e2e-electron-runtime`
 *    的 Electron 运行时副本（首次运行自动从 node_modules/electron/dist 复制一次）；
 *    受限沙箱（如 DSH）中 node_modules 里的 electron.exe 会以 Low 完整性级别运行、
 *    无法创建 GUI 窗口与写临时目录，复制到 out/tmp 后恢复正常。CI 无此限制但使用同一路径，
 *    保证本地与 CI 行为一致。该目录在 out/ 下、随构建产物一起被 git 忽略，可随时删除。
 * 4. 每个用例使用独立临时 home/userData（系统临时目录），结束后整体删除；
 *    打包启动用例的隔离策略见 e2e/packaged-launch.spec.ts 文件头注释。
 *
 * ## 用例文件
 * - e2e/smoke.spec.ts              开发构建冒烟（窗口/欢迎页/桥注入/产物契约/主界面分块）
 * - e2e/startup-restore.spec.ts    启动恢复（autoOpenLastFile / autoOpenLastFolder）
 * - e2e/settings-persistence.spec.ts 系统设置保存与跨重启持久化
 * - e2e/packaged-launch.spec.ts    打包产物（win-unpacked/BaiZeNotes.exe）直接启动
 * - e2e/startup-stability.spec.ts  启动链稳定性独立量化（`@startup-stability`，CI 独立 job）
 *
 * ## 启动稳定性与重试口径（P1-4：E2E 自动恢复掩盖启动稳定性）
 * - 所有功能 spec 启动后经 helpers/app-ui.ts 的 `recordStartupMetrics()` 把
 *   launchAttempts / reloadRecoveries 写入 annotation + console；默认容错只记录，
 *   仅在 `E2E_STRICT_LAUNCH=1`（CI 启动稳定性 job）时零恢复/零进程重启硬失败。
 * - **CI retries 由 1 调整为 0**：已知 Electron 43.x sandboxed preload 上游竞态由 helper 的
 *   reload 恢复兜底，用例本身不依赖 Playwright retry；此前 retries=1 会把「需要恢复/重试的
 *   启动」洗成绿色，让真实恢复率无法观测。取舍：放弃「偶发环境抖动自动重跑」的一层保险，
 *   换取启动稳定性指标的真实性——真实偶发失败会直接红并暴露在报告里，量化容忍度由
 *   `startup-stability` job 的软门禁（恢复率 ≤25% 且零进程重启）承担。
 *
 * 说明：本仓库仅做冒烟/回归级 E2E，不做完整业务流程回放；用例集中在 e2e/ 目录，
 * 与单元测试（tests/unit）完全隔离，`npm test` 不会包含它们。
 */
import { defineConfig } from '@playwright/test'

/** CI 无头/冷启动环境更慢：E2E 单个用例超时放宽到 120s（含两次应用启动的持久化用例） */
const TEST_TIMEOUT_MS = 120_000
/** 断言超时：Monaco/预览/打包版冷启动需要等待异步分块加载 */
const EXPECT_TIMEOUT_MS = 20_000

export default defineConfig({
    testDir: './e2e',
    testMatch: '**/*.spec.ts',
    // 单个 Electron 应用启动 + 首屏渲染通常 < 15s；失败重试留给 CI 吸收偶发环境抖动
    timeout: TEST_TIMEOUT_MS,
    expect: { timeout: EXPECT_TIMEOUT_MS },
    // 完整用例串行执行：避免多个 Electron 实例（单实例锁/窗口焦点/磁盘 IO）互相干扰
    fullyParallel: false,
    workers: 1,
    // P1-4：CI 也固定 0 次重试（此前 CI retries=1）——重试会掩盖 helper 的启动恢复事实，
    // 使「启动链稳定性」无法被观测；启动稳定性由 startup-stability job 的量化软门禁承担
    // （恢复率 ≤25% 且零进程重启，见 e2e/startup-stability.spec.ts 与报告）。
    retries: 0,
    forbidOnly: Boolean(process.env.CI),
    reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
    outputDir: 'test-results',
    use: {
        // 失败保留 trace（本地可用 npx playwright show-trace 回放）；不自动录屏降低开销
        trace: 'retain-on-failure',
        video: 'off',
        screenshot: 'only-on-failure'
    }
})
