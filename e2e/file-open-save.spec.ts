/**
 * E2E：文件打开 → 编辑 → Ctrl+S 保存 → 磁盘内容更新（P2 关键链路补齐）
 *
 * 覆盖链路（真实主进程 + 真实窗口 + 隔离临时工作区）：
 *   临时工作区写入 md 文件（fileState 预置最近文件）
 *   → 经 preload API 打开最近文件（真实主进程 OPEN_RECENT → OpenSelectFile 读盘 →
 *     SHOW_SELECTED_FILE_CONTEXT / USER_SELECT_FILE 下发）
 *   → 渲染层 Monaco/预览/状态栏显示文件内容
 *   → 在 Monaco 中真实键入编辑（键盘事件 → v-model → markdownEditorContent）
 *   → Ctrl+S（渲染层 window keydown → IPC.FILE.SAVE_TO_DISK → 主进程 SaveActiveFile 写盘）
 *   → 断言磁盘文件内容包含新键入标记且保留原内容。
 *
 * 为什么不用原生文件对话框：E2E 无法操作系统「打开文件」对话框，改用主进程既有的
 * 「最近文件」白名单链路（OPEN_RECENT）打开，仍是真实主进程读盘/事件下发，不是 mock；
 * 保存动作完全走真实 UI 快捷键 + 真实主进程写盘链路。
 *
 * 隔离：Electron userData 重定向到临时目录（show-welcome=false 种子）；md 文件与打开记录
 * 都在临时目录，用例结束整体删除；home 下真实配置目录由 ConfigSandbox 备份/恢复。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedFileState,
    seedUserDataConfig
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import { launchToMainView, openRecentViaApi, recordLaunchDiagnostics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 初始文件内容标记（写入磁盘的基线） */
const INITIAL_MARKER = 'BAIZE_E2E_FILE_OPEN_INITIAL_20261120'
/** 编辑后键入的标记（保存后必须出现在磁盘上） */
const EDITED_MARKER = 'BAIZE_E2E_FILE_OPEN_EDITED_20261120'

/** 关闭应用并等待文件句柄/单实例锁释放 */
async function closeApp(app: ElectronApplication | undefined): Promise<void> {
    await app?.close().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
}

/** 读取磁盘文件内容（测试侧直接读文件，断言真实落盘结果） */
function readDiskFile(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
}

/** 等待磁盘文件内容满足条件（保存为异步 IPC，条件轮询代替固定 sleep） */
async function expectDiskContent(
    filePath: string,
    predicate: (content: string) => boolean,
    message: string
): Promise<void> {
    await expect
        .poll(() => predicate(readDiskFile(filePath)), { timeout: 15_000, message })
        .toBe(true)
}

test.describe('文件打开与保存', () => {
    test('打开临时 md → Monaco 编辑 → Ctrl+S → 磁盘内容更新', async () => {
        const testInfo = test.info()
        const profile: TempProfile = createTempProfile('baize-e2e-file-save-')
        const sandbox: ConfigSandbox = createConfigSandbox(profile)
        sandbox.seed()

        // 临时工作区 + 待打开文件（内容与最近文件记录都在临时目录，用例结束整体删除）
        const workspaceDir = path.join(profile.root, 'workspace')
        fs.mkdirSync(workspaceDir, { recursive: true })
        const targetFile = path.join(workspaceDir, 'note-save-e2e.md')
        fs.writeFileSync(
            targetFile,
            `# 保存链路样例\n\n${INITIAL_MARKER}\n\n- 打开：最近文件白名单链路\n- 保存：Ctrl+S\n`,
            'utf-8'
        )
        seedUserDataConfig(profile, 'show-welcome', false)
        seedFileState(profile, { recentFiles: [targetFile] })

        let app: ElectronApplication | undefined
        try {
            const { app: electronApp, page, launched } = await launchToMainView(profile)
            app = electronApp
            recordLaunchDiagnostics(launched, testInfo, '文件打开与保存')

            // 1) 真实主进程链路打开文件（最近文件白名单 → OpenSelectFile 读盘 → 事件下发）
            const openResult = await openRecentViaApi(page, {
                kind: 'file',
                path: targetFile
            })
            expect(openResult.ok, `打开最近文件失败：${openResult.message ?? '未知原因'}`).toBe(
                true
            )

            // 2) 状态栏路径 / Monaco / 预览三处均显示被打开文件内容（读盘事件链路生效）
            await expect(page.locator('#status-bar-file-path')).toContainText('note-save-e2e.md', {
                timeout: 30_000
            })
            const monacoLines = page.locator('#monaco-editor-container .monaco-editor .view-lines')
            await expect(monacoLines.first()).toBeVisible({ timeout: 30_000 })
            await expect(monacoLines.first()).toContainText(INITIAL_MARKER, { timeout: 30_000 })
            await expect(page.locator('#markdown-preview-html')).toContainText(INITIAL_MARKER, {
                timeout: 30_000
            })

            // 3) 在 Monaco 中真实键入编辑（键盘事件 → 编辑器 v-model → 保存载荷）
            await monacoLines.first().click()
            await page.keyboard.press('End')
            await page.keyboard.type(` ${EDITED_MARKER} `)
            await expect(monacoLines.first()).toContainText(EDITED_MARKER, { timeout: 15_000 })
            // 编辑后状态栏进入未保存态（内容长度事件驱动）
            await expect(page.locator('#status-bar-file-path')).toHaveClass(/unsaved/, {
                timeout: 15_000
            })

            // 4) Ctrl+S：渲染层 window keydown → FILE.SAVE_TO_DISK → 主进程写盘
            await page.keyboard.press('Control+S')
            await expectDiskContent(
                targetFile,
                (content) => content.includes(EDITED_MARKER),
                'Ctrl+S 后磁盘文件未包含新键入标记（保存链路未落盘）'
            )

            // 5) 落盘内容为编辑器全文：新标记在、原内容未丢失；状态栏恢复已保存态
            const savedContent = readDiskFile(targetFile)
            expect(savedContent).toContain(EDITED_MARKER)
            expect(savedContent).toContain(INITIAL_MARKER)
            expect(savedContent).toContain('# 保存链路样例')
            await expect(page.locator('#status-bar-file-path')).toHaveClass(/saved/, {
                timeout: 15_000
            })

            // 6) 重新打开同一文件（真实读盘链路）应读到编辑后的磁盘内容（非渲染层缓存）
            const reopenResult = await openRecentViaApi(page, {
                kind: 'file',
                path: targetFile
            })
            expect(reopenResult.ok).toBe(true)
            await expect(monacoLines.first()).toContainText(EDITED_MARKER, { timeout: 15_000 })
        } finally {
            await closeApp(app)
            sandbox.restore()
            profile.cleanup()
        }
    })
})
