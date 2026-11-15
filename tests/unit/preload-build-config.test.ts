/**
 * preload 构建配置回归防护（沙箱自包含）
 *
 * 背景（2026-11-15 实机问题）：主窗口与对话框均为 `sandbox: true`，而 Sandboxed
 * preload 只能 require('electron') / 少量内置模块，**不能 require 相对路径文件**。
 * 此前 preload 的两个入口（index/dialog）共享 `src/shared/ipc-channels.ts`，Rollup
 * 将其提取为 `out/preload/chunks/ipc-channels-*.js`，产物出现
 * `require("./chunks/...")` → preload 启动即抛错 → contextBridge 未执行 →
 * 渲染层 `window.electron` / `window.api` 缺失 →
 * 「打开文件 / 打开文件夹 / 窗口最小化 / 最大化 / 关闭」全部无反应。
 *
 * 修复：preload 构建启用 `isolatedEntries: true`（每个入口自包含、无共享 chunk）
 * 并禁用 `externalizeDeps`（第三方依赖一并内联，Electron sandbox 硬性要求）。
 *
 * 本用例对配置文本做静态断言（不新增构建依赖），防止后续重构把配置改回分块模式。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const CONFIG_FILE = path.resolve(__dirname, '../../electron.vite.config.ts')

describe('preload 构建配置（沙箱自包含护栏）', () => {
    it('preload 必须启用 isolatedEntries 且禁用 externalizeDeps', () => {
        const source = fs.readFileSync(CONFIG_FILE, 'utf-8')
        const preloadBlock = source.slice(source.indexOf('preload:'), source.indexOf('renderer:'))
        expect(preloadBlock.length).toBeGreaterThan(0)
        expect(preloadBlock).toMatch(/isolatedEntries:\s*true/)
        expect(preloadBlock).toMatch(/externalizeDeps:\s*false/)
    })

    it('不应再使用会拆出共享 chunk 的 externalizeDeps 白名单写法', () => {
        const source = fs.readFileSync(CONFIG_FILE, 'utf-8')
        // 旧写法 externalizeDeps: { exclude: [...] } 允许 node_modules 共享打包成 chunk，
        // 与 sandbox preload 的单文件要求冲突，回归即报错。
        expect(source).not.toMatch(/externalizeDeps:\s*\{\s*exclude/)
    })
})
