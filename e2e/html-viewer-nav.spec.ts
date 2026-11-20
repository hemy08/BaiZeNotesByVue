/**
 * E2E：HTML 查看器顶部导航跳转与路径切换（P2 关键链路补齐）
 *
 * 背景（2026-11-20 用户反馈修复，CHANGELOG「HTML 查看器导航修复」）：
 * 报告 HTML 页面改为引用共享 assets（report.css / report-nav.js）；应用内查看器用
 * `srcdoc` + `sandbox="allow-same-origin"`（无 allow-scripts）渲染，页面脚本不执行，
 * 由渲染层读取静态片段注入 `#report-nav`。查看器内点击本地 `.html` 链接时，此前 iframe
 * 直接跳 `file://` 目标页 → 目标页 report-nav.js 不执行 → 顶部导航消失、查看器路径不切换。
 * 修复后父页在 iframe 文档做事件委托，拦截本地 `.html` 链接改走查看器加载器（重新读取 +
 * 注入静态导航 + 更新 filePath）。
 *
 * 本用例覆盖链路（真实主进程 + 真实窗口 + 隔离用户数据）：
 *   复制 docs/reports/html 到临时工作区（fixture，不依赖网络/仓库改动）
 *   → 经 preload API 打开最近文件夹（真实主进程 OPEN_RECENT → 工作区/目录树事件）
 *   → 资源管理器点击 README.html（HTML_FILE_SELECTED + 切换 HTML 查看器）
 *   → 断言 iframe 内 #report-nav 已注入（首页深度片段，含 README.html 链接）
 *   → 展开顶部导航 01 分类并点击「总体优化项报告」
 *   → 断言查看器路径栏切换为目标文件、目标页 #report-nav 仍存在（分类深度片段，
 *     `../01-检查与扫描/...` 链接）且页面正文渲染（无白屏）。
 *
 * 不依赖外部网络：整份报告站点（含 assets 共享资源）从仓库本地复制，只走 file: 链路。
 *
 * 隔离：Electron userData 重定向到临时目录（show-welcome / recent-folders 种子）；
 * home 下真实配置目录由 ConfigSandbox 备份 → 清空 → finally 恢复。
 */
import { test, expect } from '@playwright/test'
import type { ElectronApplication, FrameLocator, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import {
    MAIN_ENTRY,
    ROOT,
    createConfigSandbox,
    createTempProfile,
    seedUserDataConfig
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import { launchToMainView, openRecentViaApi, recordStartupMetrics } from './helpers/app-ui'

test.skip(
    !fs.existsSync(MAIN_ENTRY),
    '缺少 out/build/main/index.js：请先执行 npx electron-vite build'
)

/** 本地报告 HTML Wiki 源目录（含 assets 共享导航/样式，复制到临时目录作为 fixture） */
const REPORT_HTML_SOURCE = path.join(ROOT, 'docs', 'reports', 'html')
test.skip(
    !fs.existsSync(path.join(REPORT_HTML_SOURCE, 'README.html')),
    '缺少 docs/reports/html/README.html：报告 HTML Wiki fixture 不可用'
)

/** 目标页：01 分类下第一篇报告（导航静态片段中的第一个链接） */
const TARGET_REPORT_FILE = '总体优化项报告.html'
const TARGET_REPORT_DIR = '01-检查与扫描'
/** 首页深度导航片段中的链接（相对报告根目录，无 ../ 前缀） */
const HOME_NAV_LINK_SELECTOR = '#report-nav a[href="README.html"]'
/** 分类页深度导航片段中的链接（相对分类目录，带 ../ 前缀） */
const CATEGORY_NAV_LINK_SELECTOR = `#report-nav a[href="../${TARGET_REPORT_DIR}/${TARGET_REPORT_FILE}"]`

/** 关闭应用并等待文件句柄/单实例锁释放 */
async function closeApp(app: ElectronApplication | undefined): Promise<void> {
    await app?.close().catch(() => undefined)
    await new Promise((resolve) => setTimeout(resolve, 1_000))
}

/** 取 HTML 查看器 iframe 的 FrameLocator（容器与 iframe 由 ShowHtmlView/FileViewerShell 渲染） */
function getHtmlViewerFrame(page: Page): FrameLocator {
    return page.frameLocator('#html-containers iframe.html-iframe')
}

test.describe('HTML 查看器导航', () => {
    test('打开 README.html → 顶部导航跳转 01 分类报告 → 目标页 #report-nav 保留且路径栏切换', async () => {
        const testInfo = test.info()
        const profile: TempProfile = createTempProfile('baize-e2e-html-viewer-')
        const sandbox: ConfigSandbox = createConfigSandbox(profile)
        sandbox.seed()
        // 启动即主界面（不走欢迎页），随后用「最近文件夹」打开被复制的报告站点
        seedUserDataConfig(profile, 'show-welcome', false)

        // fixture：整份报告 HTML Wiki 复制到临时工作区（含 assets/report-nav*.html 与全部分类页）
        const workspaceDir = path.join(profile.root, 'report-workspace')
        fs.cpSync(REPORT_HTML_SOURCE, workspaceDir, { recursive: true })
        const readmePath = path.join(workspaceDir, 'README.html')
        expect(fs.existsSync(readmePath), 'fixture 缺少 README.html').toBe(true)
        seedUserDataConfig(profile, 'recent-folders', [workspaceDir])

        let app: ElectronApplication | undefined
        try {
            const {
                app: electronApp,
                page,
                launched,
                compensationReloads
            } = await launchToMainView(profile)
            app = electronApp
            recordStartupMetrics(launched, testInfo, 'HTML 查看器导航', { compensationReloads })

            // 1) 经真实主进程链路打开最近文件夹：工作区校验 → WELCOME_ENTER_MAIN → 目录树下发
            const openResult = await openRecentViaApi(page, {
                kind: 'folder',
                path: workspaceDir
            })
            expect(openResult.ok, `打开最近文件夹失败：${openResult.message ?? '未知原因'}`).toBe(
                true
            )

            // 2) 资源管理器目录树出现被打开的工作区（根节点）
            const fileTree = page.locator('#file-tree')
            await expect(fileTree).toContainText('report-workspace', { timeout: 30_000 })

            // 3) 展开根目录并点击 README.html（FileTreeNode：.html → HTML_FILE_SELECTED + WORKSPACE_SHOW('html')）
            const readmeNode = fileTree
                .locator('.file-manager-node')
                .filter({ hasText: 'README.html' })
            if (!(await readmeNode.isVisible().catch(() => false))) {
                await fileTree.locator('.node-content button').first().click()
            }
            await expect(readmeNode).toBeVisible({ timeout: 15_000 })
            await fileTree
                .locator('.node-content')
                .filter({ hasText: 'README.html' })
                .first()
                .click()

            // 4) HTML 查看器挂载：容器可见、路径栏展示 README.html（应用内路径展示可定位）
            await expect(page.locator('#html-containers')).toBeVisible({ timeout: 30_000 })
            const pathBar = page.locator('#html-containers .file-name')
            await expect(pathBar).toContainText('README.html', { timeout: 30_000 })

            // 5) 首页静态导航已注入（srcdoc 不执行 report-nav.js，由渲染层注入片段）：
            //    #report-nav 存在，且为首页深度片段（README.html 相对链接）。
            //    说明：.rgnav 为 position:fixed 导航条，其容器 #report-nav 自身高度为 0
            //    （Playwright 判定 hidden），因此可见性断言落在 nav.rgnav 上。
            const frame = getHtmlViewerFrame(page)
            await expect(frame.locator('#report-nav')).toHaveCount(1)
            await expect(frame.locator('#report-nav nav.rgnav')).toBeVisible({ timeout: 30_000 })
            await expect(frame.locator(HOME_NAV_LINK_SELECTOR)).toHaveCount(1)

            // 6) 展开顶部导航「01-检查与扫描」，点击分类报告链接
            await frame
                .locator('#report-nav summary')
                .filter({ hasText: TARGET_REPORT_DIR })
                .click()
            const targetLink = frame.locator(
                `#report-nav a[href="${TARGET_REPORT_DIR}/${TARGET_REPORT_FILE}"]`
            )
            await expect(targetLink).toBeVisible({ timeout: 15_000 })
            await targetLink.click()

            // 7) 查看器路径切换为目标页（真实文件读取 + filePath 更新，非 iframe 直接跳 file://）
            await expect(pathBar).toContainText(TARGET_REPORT_FILE, { timeout: 30_000 })

            // 8) 目标页顶部导航仍在（修复前会消失）：分类页深度片段已注入，
            //    链接为 ../01-检查与扫描/... 形式，证明导航随路径深度正确切换
            const targetFrame = getHtmlViewerFrame(page)
            await expect(targetFrame.locator('#report-nav')).toHaveCount(1)
            await expect(targetFrame.locator('#report-nav nav.rgnav')).toBeVisible({
                timeout: 30_000
            })
            await expect(targetFrame.locator(CATEGORY_NAV_LINK_SELECTOR)).toHaveCount(1)

            // 9) 目标页正文真实渲染（无白屏）：标题与正文字符数下限
            await expect(targetFrame.locator('h1').first()).toContainText('总体优化项报告', {
                timeout: 15_000
            })
            const bodyText = (await targetFrame.locator('body').innerText()).trim()
            expect(bodyText.length, '目标页正文为空（白屏）').toBeGreaterThan(200)
        } finally {
            await closeApp(app)
            sandbox.restore()
            profile.cleanup()
        }
    })
})
