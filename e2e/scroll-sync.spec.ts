/**
 * E2E：编辑器 → 预览滚动同步（1.5.0 分栏模式体验）
 *
 * 覆盖链路（真实主进程 + 真实窗口 + 隔离用户数据）：
 *   预置长 Markdown（100+ 行，含标题/代码块）与 autoOpenLastFile 启动恢复
 *   → 启动进入主界面分栏模式 → 预览渲染出带 `data-source-line` 锚点的内容
 *   → 编辑器滚轮/PageDown/Ctrl+End 滚动 → 断言预览 scrollTop 跟随并滚到对应块
 *   → 光标在末尾连续回车（光标自动 reveal）→ 预览继续跟随到新增内容
 *   → 在当前可视区修改正文（编辑器不再滚动）→ 预览不得跳回顶部
 *
 * 为什么需要 E2E：滚动同步依赖真实布局（Monaco 视口滚动、预览 offsetTop、
 * CSS 零高度锚点标记），jsdom 无法验证；单测只覆盖纯计算与组件编排。
 *
 * 隔离：Electron userData 经 `--user-data-dir` 重定向到临时目录；home 下真实配置目录
 * `~/.baizenotes/config` 由 ConfigSandbox 备份 → 写入种子 → finally 恢复。
 *
 * 运行前提：`npx electron-vite build`（缺产物时整文件跳过）。
 * 断言全部使用条件轮询（expect.poll / locator 文本），不使用固定 sleep 等待同步完成。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, Page, TestInfo } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedFileState,
    seedSystemSetting
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import { launchToMainView, recordStartupMetrics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 长文档章节数（12 章节 × 8 行 ≈ 100+ 行，保证编辑器与预览都需要滚动） */
const SECTION_COUNT = 12
/** 预览滚动容器快照（scrollTop / 最大滚动距离 / 当前视口内的源行锚点） */
interface PreviewScrollSnapshot {
    scrollTop: number
    maxScrollTop: number
    visibleSourceLines: number[]
}

/**
 * 构造确定行号的 E2E 长 Markdown（标题 + 正文 + 代码块循环，末尾带可断言标记）。
 * @returns markdown 文本与末尾标记标题的 1 起始行号
 */
function buildLongMarkdown(): { markdown: string; tailLine: number } {
    const lines: string[] = ['# 滚动同步 E2E 长文档', '']
    for (let index = 1; index <= SECTION_COUNT; index += 1) {
        lines.push(`## 章节 ${index}`)
        lines.push('')
        lines.push(`章节 ${index} 的正文段落，用于填充预览高度并验证滚动同步。`)
        lines.push('')
        lines.push('```js')
        lines.push(`const section${index} = ${index}`)
        lines.push('```')
        lines.push('')
    }
    lines.push('## 文档末尾标记 E2E_TAIL_MARKER')
    lines.push('')
    lines.push('这是最后一节正文，用于验证预览已滚动到文档末尾。')
    lines.push('')
    const tailLine = lines.indexOf('## 文档末尾标记 E2E_TAIL_MARKER') + 1
    return { markdown: lines.join('\n'), tailLine }
}

/** 一次滚动同步用例的运行上下文（app/page + 隔离目录 + 清理函数） */
interface ScrollSyncCase {
    app: ElectronApplication
    page: Page
    tailLine: number
    close: () => Promise<void>
}

/** 启动应用并打开预置长文档（失败时自动清理，避免残留 Electron 进程） */
async function launchScrollSyncCase(testInfo: TestInfo): Promise<ScrollSyncCase> {
    const profile: TempProfile = createTempProfile('baize-e2e-scroll-sync-')
    const sandbox: ConfigSandbox = createConfigSandbox(profile)
    const longDoc = buildLongMarkdown()
    let app: ElectronApplication | undefined
    let page: Page | undefined
    const close = async (): Promise<void> => {
        // 用例会真实修改编辑器内容（回车/输入）→ 应用处于「未保存」态；新版的关闭确认
        // 对话框会阻止窗口直接关闭，导致 app.close() 挂起（worker teardown 超时）。
        // 清理前先 Ctrl+S 真实保存到临时文件，再等待状态栏回到已保存态，最后关闭。
        try {
            await page?.keyboard.press('Control+S')
            await page
                ?.locator('#status-bar-file-path.saved')
                .waitFor({ state: 'visible', timeout: 10_000 })
                .catch(() => undefined)
        } catch {
            // 页面已关闭/无焦点时忽略，继续走关闭流程
        }
        await app?.close().catch(() => undefined)
        sandbox.restore()
        profile.cleanup()
    }
    try {
        sandbox.seed()
        const workspaceFile = path.join(profile.root, 'scroll-sync-long.md')
        fs.writeFileSync(workspaceFile, `${longDoc.markdown}\n`, 'utf-8')
        seedSystemSetting(sandbox, { language: 'zh-cn', autoOpenLastFile: true })
        seedFileState(profile, { lastOpenedFile: workspaceFile, recentFiles: [workspaceFile] })

        const launched = await launchToMainView(profile)
        app = launched.app
        page = launched.page
        recordStartupMetrics(launched.launched, testInfo, '滚动同步', {
            compensationReloads: launched.compensationReloads
        })
        return { app, page, tailLine: longDoc.tailLine, close }
    } catch (error) {
        await close()
        throw error
    }
}

/** 等待编辑器与预览（含源行锚点）渲染完成、预览具备可滚动内容 */
async function waitForEditorAndPreview(page: Page): Promise<void> {
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('#monaco-editor-container .monaco-editor')).toBeVisible({
        timeout: 60_000
    })
    const preview = page.locator('#markdown-preview-html')
    await expect(preview).toBeVisible({ timeout: 60_000 })
    // 分栏模式：编辑区与预览区同时可见。
    // 注意：#md-edit-component 是既有设计的「容器 + 内层编排组件」双重复用 id，
    // 严格模式会解析到 2 个元素，这里显式取 first()（修复前 3 个用例均因此失败）。
    await expect(page.locator('#md-edit-component').first()).toBeVisible()
    await expect(page.locator('#md-preview')).toBeVisible()
    // 预览已渲染出内容与源行锚点，且内容高度足以滚动
    await expect(preview.locator('h1')).toContainText('滚动同步 E2E 长文档', {
        timeout: 60_000
    })
    await expect
        .poll(async () => (await readPreviewScroll(page)).maxScrollTop, {
            timeout: 60_000,
            message: '预置长文档应让预览产生可滚动内容'
        })
        .toBeGreaterThan(400)
}

/** 聚焦编辑器（点击视口内固定点位，避免点到折叠/大纲控件） */
async function focusEditor(page: Page): Promise<void> {
    const editor = page.locator('#monaco-editor-container .monaco-editor').first()
    await expect(editor).toBeVisible({ timeout: 60_000 })
    await editor.click({ position: { x: 120, y: 40 } })
}

/** 读取预览滚动快照（scrollTop / 最大滚动距离 / 视口内源行锚点） */
async function readPreviewScroll(page: Page): Promise<PreviewScrollSnapshot> {
    return page.evaluate(() => {
        const container = document.getElementById('markdown-preview-html')
        if (!container) {
            throw new Error('预览滚动容器 #markdown-preview-html 不存在')
        }
        const containerRect = container.getBoundingClientRect()
        const visibleSourceLines: number[] = []
        for (const element of Array.from(container.querySelectorAll('[data-source-line]'))) {
            const rect = element.getBoundingClientRect()
            if (rect.top >= containerRect.top - 1 && rect.top <= containerRect.bottom) {
                visibleSourceLines.push(
                    Number.parseInt(element.getAttribute('data-source-line') ?? '0', 10)
                )
            }
        }
        return {
            scrollTop: container.scrollTop,
            maxScrollTop: container.scrollHeight - container.clientHeight,
            visibleSourceLines
        }
    })
}

/** 轮询等待预览滚动满足条件（条件式等待，不使用固定 sleep） */
async function waitForPreviewScroll(
    page: Page,
    check: (snapshot: PreviewScrollSnapshot) => boolean,
    message: string
): Promise<PreviewScrollSnapshot> {
    await expect
        .poll(async () => check(await readPreviewScroll(page)), { timeout: 30_000, message })
        .toBe(true)
    return readPreviewScroll(page)
}

test.describe('编辑器 → 预览滚动同步', () => {
    test('滚轮 / PageDown 滚动编辑器：预览跟随下滚，Ctrl+End 后末尾章节进入视口', async () => {
        const testCase = await launchScrollSyncCase(test.info())
        try {
            const { page, tailLine } = testCase
            await waitForEditorAndPreview(page)

            // 初始位置接近顶部即可（打开文件后编辑器可能已发过一次同步目标，
            // 把预览对齐到首个标题块；这里不假设精确 0，只用相对增量断言滚动跟随）
            const initial = await readPreviewScroll(page)
            expect(
                initial.scrollTop,
                `初始预览应接近顶部，实际 scrollTop=${initial.scrollTop}`
            ).toBeLessThan(Math.max(120, initial.maxScrollTop * 0.2))

            await focusEditor(page)
            const editorBox = await page
                .locator('#monaco-editor-container .monaco-editor')
                .first()
                .boundingBox()
            expect(editorBox, '编辑器应有可点击区域').not.toBeNull()
            await page.mouse.move(
                editorBox!.x + editorBox!.width / 2,
                editorBox!.y + editorBox!.height / 2
            )
            // 1) 鼠标滚轮向下：预览 scrollTop 必须跟随增加
            await page.mouse.wheel(0, 1200)
            const afterWheel = await waitForPreviewScroll(
                page,
                (snapshot) => snapshot.scrollTop > initial.scrollTop + 40,
                '滚轮滚动编辑器后预览应同步下滚'
            )

            // 2) PageDown 继续下滚：预览 scrollTop 继续增加
            for (let index = 0; index < 3; index += 1) {
                await page.keyboard.press('PageDown')
            }
            await waitForPreviewScroll(
                page,
                (snapshot) => snapshot.scrollTop > afterWheel.scrollTop + 40,
                'PageDown 后预览应继续跟随下滚'
            )

            // 3) Ctrl+End 跳到文档末尾：预览滚到下半部，末尾标题块进入视口
            await page.keyboard.press('Control+End')
            const atEnd = await waitForPreviewScroll(
                page,
                (snapshot) =>
                    snapshot.maxScrollTop > 0 && snapshot.scrollTop > snapshot.maxScrollTop * 0.5,
                'Ctrl+End 后预览应滚动到文档下半部'
            )
            expect(
                atEnd.visibleSourceLines.some((line) => line >= tailLine),
                `末尾章节（第 ${tailLine} 行）应进入预览视口，实际可见锚点：${atEnd.visibleSourceLines.join(',')}`
            ).toBe(true)
        } finally {
            await testCase.close()
        }
    })

    test('键盘输入触发编辑器自动滚动：预览跟随到新增内容', async () => {
        const testCase = await launchScrollSyncCase(test.info())
        try {
            const { page, tailLine } = testCase
            await waitForEditorAndPreview(page)

            await focusEditor(page)
            await page.keyboard.press('Control+End')
            const atEnd = await waitForPreviewScroll(
                page,
                (snapshot) =>
                    snapshot.maxScrollTop > 0 && snapshot.scrollTop > snapshot.maxScrollTop * 0.4,
                'Ctrl+End 后预览应先同步到文档末尾'
            )

            // 连续回车 + 追加文本：新行会让 Monaco 自动滚动，预览必须跟随
            for (let index = 0; index < 15; index += 1) {
                await page.keyboard.press('Enter')
            }
            await page.keyboard.insertText('E2E_APPEND_MARKER')
            await expect(page.locator('#markdown-preview-html')).toContainText(
                'E2E_APPEND_MARKER',
                { timeout: 30_000 }
            )

            const afterTyping = await waitForPreviewScroll(
                page,
                (snapshot) =>
                    snapshot.maxScrollTop > 0 &&
                    snapshot.scrollTop > snapshot.maxScrollTop * 0.5 &&
                    snapshot.visibleSourceLines.some((line) => line >= tailLine + 10),
                '连续输入后预览应跟随到新增内容（末尾块进入视口）'
            )
            // 输入过程中预览整体向下移动，不能反向跳回顶部
            expect(afterTyping.scrollTop).toBeGreaterThanOrEqual(Math.max(0, atEnd.scrollTop - 40))
        } finally {
            await testCase.close()
        }
    })

    test('在可视区输入但不滚动编辑器：预览不得跳回顶部', async () => {
        const testCase = await launchScrollSyncCase(test.info())
        try {
            const { page } = testCase
            await waitForEditorAndPreview(page)

            await focusEditor(page)
            await page.keyboard.press('Control+End')
            const atEnd = await waitForPreviewScroll(
                page,
                (snapshot) =>
                    snapshot.maxScrollTop > 0 && snapshot.scrollTop > snapshot.maxScrollTop * 0.4,
                'Ctrl+End 后预览应先同步到文档末尾'
            )

            // 光标上移几行（仍在当前视口内，不产生编辑器滚动），再原地修改正文：
            // 预览会因内容变化整篇重渲染，必须重放最后目标而不是回到顶部。
            for (let index = 0; index < 3; index += 1) {
                await page.keyboard.press('ArrowUp')
            }
            await page.keyboard.insertText('E2E_VISIBLE_EDIT')
            await expect(page.locator('#markdown-preview-html')).toContainText('E2E_VISIBLE_EDIT', {
                timeout: 30_000
            })

            const afterEdit = await waitForPreviewScroll(
                page,
                (snapshot) =>
                    snapshot.maxScrollTop > 0 && snapshot.scrollTop > snapshot.maxScrollTop * 0.4,
                '可视区编辑后预览应保持原位置（不得跳回顶部）'
            )
            // 位置允许小幅漂移（内容高度变化），但不能回到顶部附近
            expect(afterEdit.scrollTop).toBeGreaterThan(atEnd.scrollTop * 0.6)
        } finally {
            await testCase.close()
        }
    })
})
