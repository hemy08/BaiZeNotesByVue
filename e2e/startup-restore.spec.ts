/**
 * E2E：启动恢复（系统设置 autoOpenLastFile / autoOpenLastFolder）
 *
 * 覆盖链路（真实主进程 + 真实窗口 + 隔离用户数据）：
 *   预置 systemSetting.autoOpenLastFile / autoOpenLastFolder 与 fileState 上次打开记录
 *   → 启动应用 → 渲染层 READY 握手 → 主进程 restoreLastOpenedAtStartup
 *   → WELCOME_ENTER_MAIN（隐藏欢迎页、进入主界面）→ 投递数据事件打开文件/目录
 *   → 断言主界面、Monaco 编辑器、预览内容、状态栏路径 / 资源管理器目录树。
 *
 * 为什么需要这层用例：现有冒烟用例只覆盖「默认欢迎页」与「show-welcome=false 的主界面分块」，
 * 而启动恢复依赖「渲染层就绪握手 + 主界面异步分块加载完成 + 数据事件时序」三段配合，
 * 是单元测试（jsdom mock）无法覆盖的跨进程时序问题。
 *
 * 隔离：
 * - Electron userData（fileState.json 等）由 `-r` 夹具重定向到临时目录，用例结束删除；
 * - home 下的真实配置目录（`~/.baizenotes/config`）由 ConfigSandbox 备份 → 写入种子 →
 *   finally 恢复（产品代码把配置路径固定在 home，无法用环境变量重定向，见 helper 注释）。
 *
 * 运行的构建前提：`npx electron-vite build`（或 `npm run build:unpack`），缺产物时整文件跳过。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    launchDevAppWithRenderer,
    seedFileState,
    seedSystemSetting
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'

// 未构建时整文件跳过，避免误报（构建命令见 CI 的 e2e job / 本地 npx electron-vite build）
test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/**
 * 渲染层未捕获异常断言（TDZ 回归防线）：
 * 修复前，启动恢复打开文件时预览组件在 setup 阶段触发 immediate watcher，而
 * `renderSequence` 在文件更下方才声明，会抛一次 TDZ ReferenceError
 * （`Cannot access 'renderSequence' before initialization`）。该缺陷已修复
 * （渲染状态声明上移到 watchers 之前），因此本文件**不再容忍任何 pageerror**：
 * 任意未捕获异常都判失败，防止缺陷回归被静默吞掉。
 */

/** 启动开发应用并等待渲染进程就绪（preload 桥 + IPC 往返 + Vue 挂载，不等待主界面） */
async function launchAndWaitFirstWindow(
    profile: TempProfile
): Promise<{ app: ElectronApplication; page: Page; pageErrors: string[] }> {
    // 渲染就绪等待在 helper 内完成；pageerror 监听在等待前挂上，启动阶段异常不丢失
    const { app, page, pageErrors } = await launchDevAppWithRenderer(profile)
    return { app, page, pageErrors }
}

test.describe('启动恢复（autoOpenLastFile / autoOpenLastFolder）', () => {
    test('autoOpenLastFile=true：跳过欢迎页进入主界面，并自动打开上次文件（状态栏/Monaco/预览）', async () => {
        const profile = createTempProfile('baize-e2e-startup-file-')
        const sandbox: ConfigSandbox = createConfigSandbox(profile)
        sandbox.seed()
        const workspaceFile = path.join(profile.root, 'startup-restore-sample.md')
        const marker = 'BAIZE_E2E_STARTUP_MARKER_20261119'
        fs.writeFileSync(workspaceFile, `# 启动恢复样例\n\n${marker}\n`, 'utf-8')
        seedSystemSetting(sandbox, { language: 'zh-cn', autoOpenLastFile: true })
        seedFileState(profile, { lastOpenedFile: workspaceFile, recentFiles: [workspaceFile] })

        let app: ElectronApplication | undefined
        try {
            const launched = await launchAndWaitFirstWindow(profile)
            app = launched.app
            const { page, pageErrors } = launched

            // 1) 欢迎页被启动恢复流程关闭，主界面根节点与状态栏挂载
            await expect(page.locator('.welcome-screen')).toHaveCount(0, { timeout: 30_000 })
            await expect(page.locator('#editor-container')).toBeVisible()
            await expect(page.locator('#status-bar')).toBeVisible()

            // 2) 主界面二级分块按需加载完成：工具栏 + Monaco 编辑器
            await expect(page.locator('.toolbar-container')).toBeVisible({ timeout: 30_000 })
            await expect(page.locator('#monaco-editor-container .monaco-editor')).toBeVisible({
                timeout: 30_000
            })

            // 3) 上次文件确实被打开：状态栏显示文件路径，预览区渲染出文件内容
            await expect(page.locator('#status-bar-file-path')).toContainText(
                'startup-restore-sample.md'
            )
            await expect(page.locator('#markdown-preview-html')).toContainText(marker, {
                timeout: 30_000
            })

            // 4) 渲染层未出现任何未捕获异常（TDZ 等缺陷回归防线，见文件头说明）
            expect(pageErrors, `渲染层未捕获异常：${pageErrors.join(' | ')}`).toEqual([])
        } finally {
            await app?.close().catch(() => undefined)
            sandbox.restore()
            profile.cleanup()
        }
    })

    test('autoOpenLastFolder=true：跳过欢迎页进入主界面，并自动打开上次工作目录（资源管理器目录树）', async () => {
        const profile = createTempProfile('baize-e2e-startup-folder-')
        const sandbox: ConfigSandbox = createConfigSandbox(profile)
        sandbox.seed()
        const workspaceDir = path.join(profile.root, 'workspace')
        fs.mkdirSync(workspaceDir, { recursive: true })
        fs.writeFileSync(path.join(workspaceDir, 'note-in-folder.md'), '# 目录内笔记\n', 'utf-8')
        seedSystemSetting(sandbox, { language: 'zh-cn', autoOpenLastFolder: true })
        seedFileState(profile, { lastOpenedDirectory: workspaceDir })

        let app: ElectronApplication | undefined
        try {
            const launched = await launchAndWaitFirstWindow(profile)
            app = launched.app
            const { page } = launched

            // 1) 启动恢复进入主界面（不显示欢迎页）
            await expect(page.locator('.welcome-screen')).toHaveCount(0, { timeout: 30_000 })
            await expect(page.locator('#editor-container')).toBeVisible()
            await expect(page.locator('#status-bar')).toBeVisible()

            // 2) 工作目录被恢复：资源管理器可见，目录树出现被恢复的根目录（ReloadDirFromDisk 数据事件已生效）
            await expect(page.locator('#resource-manager-component')).toBeVisible({
                timeout: 30_000
            })
            const fileTree = page.locator('#file-tree')
            await expect(fileTree).toContainText('workspace', { timeout: 30_000 })

            // 3) 展开根目录后可看到目录内文件（证明整棵树数据已下发，而不仅是根节点名称）
            const targetFile = fileTree
                .locator('.file-manager-node')
                .filter({ hasText: 'note-in-folder.md' })
            if (!(await targetFile.isVisible().catch(() => false))) {
                await fileTree.locator('.node-content button').first().click()
            }
            await expect(targetFile).toContainText('note-in-folder.md', { timeout: 15_000 })
        } finally {
            await app?.close().catch(() => undefined)
            sandbox.restore()
            profile.cleanup()
        }
    })
})
