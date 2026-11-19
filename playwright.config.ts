/**
 * Playwright E2E 配置（ET-11：Electron 端到端冒烟）
 *
 * 定位：在单元测试（jsdom mock）之上补一层「真实 Electron 进程 + 真实窗口」的冒烟验证，
 * 覆盖单元测试无法覆盖的部分：主进程启动、BrowserWindow 创建、preload contextBridge 注入、
 * 渲染层 Vue 挂载与 IPC 往返。
 *
 * 运行前提：
 * - 先执行 `npx electron-vite build`（或 `npm run build`）生成 `out/build/main/index.js`；
 * - 需要可用的桌面环境（Electron 需要窗口系统）；
 * - CI 中由 .github/workflows/ci.yml 的独立 `e2e` job 在 windows-latest 上自动执行
 *   （push / pull_request / workflow_dispatch 均触发）。
 *
 * 说明：本仓库仅做冒烟级 E2E，不做完整业务流程回放；用例集中在 e2e/ 目录，
 * 与单元测试（tests/unit）完全隔离，`npm test` 不会包含它们。
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    // Electron 应用启动 + 首屏渲染通常 < 15s；失败重试留给 CI 吸收偶发环境抖动
    timeout: 60_000,
    expect: { timeout: 15_000 },
    // 单个 Electron 实例串行执行，避免多窗口/单例锁互相干扰
    fullyParallel: false,
    workers: 1,
    retries: process.env.CI ? 1 : 0,
    reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
    use: {
        trace: 'retain-on-failure'
    }
})
