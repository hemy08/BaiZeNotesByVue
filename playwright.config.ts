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
    retries: process.env.CI ? 1 : 0,
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
