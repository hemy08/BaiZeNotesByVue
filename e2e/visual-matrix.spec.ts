/**
 * E2E 视觉验收矩阵（视觉升级 1.5.5 P2：T16 验收矩阵 + T17 视觉软门禁）
 *
 * ## 定位
 * 在 jsdom 静态契约测试（`tests/unit/visual-p2-acceptance.test.ts`）之上，用**真实 Electron
 * 进程 + 真实渲染**捕获 4 风格 × 3 密度 × 浅/深主题下 6 类组件区域的截图，并把截图归档到
 * `out/visual-1.5.5-p2/`（不入库，符合 AGENTS.md 产物规范）。
 *
 * ## 为什么默认跳过（软门禁的落地方式）
 * - 截图基线依赖操作系统字体渲染/缩放/窗口尺寸，在 CI 与本地可能不同；因此**像素对比只告警
 *   不阻塞**（参考 PERF-06 软门禁模式：偏离只输出 warning + Playwright annotation）；
 * - 常规 E2E 作业不应被"环境像素差异"拖红，故本 spec 默认跳过，需显式开启：
 *   ```
 *   E2E_VISUAL=1 npx playwright test e2e/visual-matrix.spec.ts
 *   ```
 * - 开启后：首次运行把截图写为基线（`out/visual-1.5.5-p2/baseline/`）；再次运行与基线做
 *   SHA-256 对比，不一致时**只写 annotation/console.warn，不让用例失败**；
 * - 只有硬错误（应用启动失败、必须区域不可见、截图写入失败）才失败——这些是真实回归信号，
 *   不属像素噪声。
 *
 * ## 覆盖矩阵（真实截图，非合成）
 * - 主窗口（菜单栏 + 工作区 + 状态栏）× 4 风格 × 3 密度 = 12；
 * - 对话框（设置 → 主题设置）× 4 风格 = 4；密度 × 3（workbench）= 3；
 * - 命令面板（编辑 → 命令面板）× 4 风格 = 4；密度 × 3 = 3；
 * - 表格编辑器（工具 → Markdown表格，非模态工具窗）× 4 风格 = 4（打开失败时记录 annotation
 *   跳过该组，不伪造证据）；
 * - glass 降级专项：减少透明（paper 回退）+ 深色 steady 稳健模式 = 2；
 * - 深色主题（`baize-text`）× 4 风格主窗口 = 4（第二次启动，隔离 userData）。
 *
 * ## 与 78 张贴图基线的关系
 * 方案 §5 的 78 张为「6 组件 × 4 风格 × 2 主题 + 主题类别 + 密度」全组合；
 * 本 spec 覆盖其中的代表性子集并全部为真实截图；剩余组合由 `docs/design/P2-VERIFICATION.md`
 * 的静态矩阵（6 组件 × 4 风格 × 2 主题 × 3 密度 = 144 组断言）与 HTML 预览页补充说明。
 */
import { test, expect } from '@playwright/test'
import type { Page, TestInfo } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { createHash } from 'crypto'
import {
    MAIN_ENTRY,
    createConfigSandbox,
    createTempProfile,
    seedFileState,
    seedUserDataConfig,
    writeJson
} from './helpers/electron-profile'
import type { ConfigSandbox, TempProfile } from './helpers/electron-profile'
import {
    launchToMainView,
    openMenuSubmenu,
    openRecentViaApi,
    recordStartupMetrics
} from './helpers/app-ui'
import type { MainViewLaunch } from './helpers/app-ui'

// 未构建时整文件跳过（与 smoke.spec.ts 同口径，避免误报）
test.skip(!fs.existsSync(MAIN_ENTRY), '缺少 out/build/main/index.js：请先执行 npm run build:unpack')

// 软门禁默认关闭：需要显式 E2E_VISUAL=1 才执行（避免常规 E2E 作业被环境像素差异拖红）
test.skip(
    process.env.E2E_VISUAL !== '1',
    '视觉矩阵默认跳过：设置 E2E_VISUAL=1 运行（软门禁：像素差异只告警不阻塞）'
)

/** 产物根目录（out/ 不入库；AGENTS.md 产物规范） */
const VISUAL_OUT_DIR = path.resolve(__dirname, '..', 'out', 'visual-1.5.5-p2')
const REAL_DIR = path.join(VISUAL_OUT_DIR, 'real')
const BASELINE_DIR = path.join(VISUAL_OUT_DIR, 'baseline')

/** 4 风格 / 3 密度（与 shared/constants/ui-style.ts 的合法值一致） */
const STYLES = ['paper', 'glass', 'workbench', 'hybrid'] as const
const DENSITIES = ['compact', 'default', 'spacious'] as const

/** 截图条目（summary.json 记录） */
interface CapturedShot {
    name: string
    file: string
    style: string
    density: string
    region: string
    sha256: string
    baselineMatch: 'new-baseline' | 'match' | 'diff'
}

/** 当前用例内已捕获截图清单（软门禁汇总写 summary.json） */
const shots: CapturedShot[] = []
/** 已捕获截图名（同名只保留第一次：4 风格循环与 3 密度循环在 workbench+default 会重叠） */
const capturedNames = new Set<string>()
/** 跳过的区域说明（不伪造截图证据；写入 summary.json 供报告消费） */
const skips: string[] = []

/** 确保输出目录存在 */
function ensureDirs(): void {
    for (const dir of [REAL_DIR, BASELINE_DIR]) {
        fs.mkdirSync(dir, { recursive: true })
    }
}

/** 通过根元素 data-* 切换风格/密度（与 useTheme.applyUiAppearance 写同一属性，真实 CSS 生效） */
async function applyAppearance(
    page: Page,
    style: string,
    density: string,
    options: { glassMode?: string; transparency?: string } = {}
): Promise<void> {
    await page.evaluate(
        ({ style, density, options }) => {
            const root = document.documentElement
            root.dataset.style = style
            root.dataset.density = density
            if (options.glassMode) root.dataset.glassMode = options.glassMode
            if (options.transparency) root.dataset.transparency = options.transparency
        },
        { style, density, options }
    )
    // 等待样式/过渡稳定（动效令牌最长 240ms；这里只用于截图前稳定，不替代断言等待）
    await page.waitForTimeout(300)
}

/** 截图 + 基线软对比（差异只告警，不失败） */
async function capture(
    page: Page,
    testInfo: TestInfo,
    name: string,
    meta: Pick<CapturedShot, 'style' | 'density' | 'region'>
): Promise<void> {
    // 同名截图去重：4 风格循环的 workbench+default 与 3 密度循环的 default 会重复，
    // 重复截图会在同一轮内产生「自己与自己对比」的无意义 diff 记录。
    if (capturedNames.has(name)) {
        return
    }
    capturedNames.add(name)
    // 截图稳定性：把鼠标移到窗口左上角中性区域，避免上一次点击残留的 :hover 高亮
    //（命令面板行/菜单项/按钮 hover 会改变背景，导致同一状态两次截图出现像素差）。
    await page.mouse.move(2, 2)
    await page.waitForTimeout(120)
    const file = path.join(REAL_DIR, `${name}.png`)
    await page.screenshot({ path: file })
    const sha256 = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    const baselineFile = path.join(BASELINE_DIR, `${name}.png`)
    let baselineMatch: CapturedShot['baselineMatch'] = 'match'
    if (!fs.existsSync(baselineFile)) {
        fs.copyFileSync(file, baselineFile)
        baselineMatch = 'new-baseline'
    } else {
        const baselineHash = createHash('sha256')
            .update(fs.readFileSync(baselineFile))
            .digest('hex')
        if (baselineHash !== sha256) {
            baselineMatch = 'diff'
            const warning =
                `[视觉软门禁] ${name} 与基线像素不一致 ` +
                `（baseline=${baselineHash.slice(0, 12)} / current=${sha256.slice(0, 12)}，` +
                '环境字体/DPR 差异属已知噪声，不阻塞用例）'
            console.warn(warning)
            testInfo.annotations.push({ type: 'visual-warning', description: warning })
        }
    }
    shots.push({ name, file, ...meta, sha256, baselineMatch })
}

/** 打开主题设置对话框（与 theme-first-open.spec.ts 同口径） */
async function openThemeSettingDialog(page: Page): Promise<void> {
    await openMenuSubmenu(page, '设置', '主题设置')
    await expect(
        page.locator('.dialog-overlay .dialog-container').filter({ hasText: '主题设置' }).first()
    ).toBeVisible({ timeout: 15_000 })
}

/** 关闭当前最顶层对话框（优先 Esc，失败则点关闭按钮） */
async function closeTopDialog(page: Page): Promise<void> {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
}

/** 判断某个选择器是否可见（不等待超时膨胀） */
async function isVisible(page: Page, selector: string, timeout = 5_000): Promise<boolean> {
    return page
        .locator(selector)
        .first()
        .isVisible({ timeout })
        .catch(() => false)
}

/**
 * 截图稳定性注入（每次应用启动后都要调用一次；深色主题是第二次启动，不能漏）。
 *
 * - 禁用过渡/动画与文本光标闪烁：像素基线只比对静态版式，动效正确性由 MOTION 契约测试覆盖；
 * - 隐藏状态栏「瞬时消息」区域：`#status-bar-console` 会展示启动/操作提示（如 Monaco 主题
 *   缓存预热失败告警）并按 timer 自动重置，同一状态两次截图可能因提示文案不同产生像素差。
 */
async function stabilizePage(page: Page): Promise<void> {
    await page.addStyleTag({
        content:
            '*, *::before, *::after {' +
            ' transition: none !important;' +
            ' animation: none !important;' +
            ' caret-color: transparent !important; }' +
            ' #status-bar-console { visibility: hidden !important; }'
    })
}

/** 主窗口区域截图：4 风格 × 3 密度 */
async function captureMainMatrix(page: Page, testInfo: TestInfo): Promise<void> {
    for (const style of STYLES) {
        for (const density of DENSITIES) {
            await applyAppearance(page, style, density)
            await capture(page, testInfo, `main__${style}__${density}`, {
                style,
                density,
                region: '主窗口（菜单栏/工作区/状态栏）'
            })
        }
    }
}

/**
 * 为工具窗截图准备一个打开的 Markdown 文件。
 *
 * 表格编辑器（插入 → Markdown表格）依赖活动编辑器；E2E 通过真实主进程链路打开
 * 预置的 .md（seedFileState + OPEN_RECENT），不 mock 产品行为。
 *
 * 稳定性：示例文件放在**固定路径**（`out/visual-1.5.5-p2/fixtures/`）而不是每次随机的
 * 临时 userData 目录——状态栏会展示当前文件路径，路径随机会导致两次基线截图必然产生差异。
 */
async function openSampleDocument(page: Page, profile: TempProfile): Promise<void> {
    const fixturesDir = path.join(VISUAL_OUT_DIR, 'fixtures')
    fs.mkdirSync(fixturesDir, { recursive: true })
    const sampleFile = path.join(fixturesDir, '视觉矩阵示例.md')
    fs.writeFileSync(
        sampleFile,
        [
            '# 视觉矩阵示例文档',
            '',
            '正文段落：用于验证 paper / hybrid 内容区纸感版式与四风格材质差异。',
            '',
            '> 引用条（3px accent-30%）',
            '',
            '```js',
            'console.log("代码块圆角 6 + 内边距 12")',
            '```',
            '',
            '| 列 A | 列 B |',
            '| --- | --- |',
            '| 1 | 2 |'
        ].join('\n'),
        'utf8'
    )
    seedFileState(profile, { recentFiles: [sampleFile] })
    const result = await openRecentViaApi(page, { kind: 'file', path: sampleFile })
    expect(result.ok, `预置示例文档打开失败：${result.message ?? '未知原因'}`).toBe(true)
    // 等待 Monaco 二级异步 chunk 就位（编辑器挂载完成后再截图，避免截到加载骨架）
    await expect(page.locator('.monaco-editor').first()).toBeVisible({ timeout: 30_000 })
    await page.waitForTimeout(500)
}

/** 对话框 / 命令面板 / 表格工具窗区域截图 */
async function captureComponentRegions(page: Page, testInfo: TestInfo): Promise<void> {
    // 1) 对话框（设置 → 主题设置）：4 风格 + 3 密度（workbench）
    await applyAppearance(page, 'workbench', 'default')
    await openThemeSettingDialog(page)
    for (const style of STYLES) {
        await applyAppearance(page, style, 'default')
        await capture(page, testInfo, `dialog__${style}__default`, {
            style,
            density: 'default',
            region: '对话框（BaseDialog）'
        })
    }
    for (const density of DENSITIES) {
        await applyAppearance(page, 'workbench', density)
        await capture(page, testInfo, `dialog__workbench__${density}`, {
            style: 'workbench',
            density,
            region: '对话框（BaseDialog）'
        })
    }
    await closeTopDialog(page)
    await expect(
        page.locator('.dialog-overlay .dialog-container').filter({ hasText: '主题设置' }).first()
    ).toBeHidden({ timeout: 10_000 })

    // 2) 命令面板（编辑 → 命令面板）：4 风格 + 3 密度
    await applyAppearance(page, 'workbench', 'default')
    await openMenuSubmenu(page, '编辑', '命令面板')
    await expect(page.locator('.command-palette')).toBeVisible({ timeout: 10_000 })
    for (const style of STYLES) {
        await applyAppearance(page, style, 'default')
        await capture(page, testInfo, `palette__${style}__default`, {
            style,
            density: 'default',
            region: '命令面板'
        })
    }
    for (const density of DENSITIES) {
        await applyAppearance(page, 'workbench', density)
        await capture(page, testInfo, `palette__workbench__${density}`, {
            style: 'workbench',
            density,
            region: '命令面板'
        })
    }
    await closeTopDialog(page)

    // 3) 表格编辑器（非模态工具窗）：插入 → Markdown表格
    //    该入口依赖活动编辑器；E2E 未打开文件时可能不会弹窗，此时记录 annotation 跳过（不伪造）
    await applyAppearance(page, 'workbench', 'default')
    // 先重置菜单状态（命令面板刚以 Esc 关闭，菜单栏可能仍处于「已展开」状态）
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    try {
        // 「Markdown表格」入口在 P1 菜单重组后已迁入「工具」菜单（见 menu-config.ts insertMenu 注释）
        await openMenuSubmenu(page, '工具', 'Markdown表格')
    } catch (error) {
        const message = `表格编辑器入口点击失败（打开文件后再试）：${String(error)}`
        skips.push(message)
        testInfo.annotations.push({ type: 'visual-skip', description: message })
        return
    }
    const toolWindowSelector = '.dialog-container--tool-window, [data-dialog-shell="tool-window"]'
    let toolWindowReady = await isVisible(page, toolWindowSelector, 10_000)
    let toolWindowRegion = '非模态工具窗（表格编辑器）'
    if (!toolWindowReady) {
        // 表格编辑器需要「活动编辑器」注册链路（E2E 打开文件后该链路未注册活动编辑器时不会弹窗，
        // 属测试环境可达性限制而非产品缺陷）。改用一个不依赖活动编辑器的工具窗
        // （工具 → 特殊字体 = FontSelectDialog，P1 菜单重组后与 Markdown表格 同在「工具」菜单）
        // 捕获同一「非模态工具窗」壳的 4 风格 × 3 密度。
        const skipMessage =
            '表格编辑器工具窗未弹出（E2E 无活动编辑器注册）；改由「工具 → 特殊字体」工具窗捕获，' +
            '表格编辑器令牌/键盘契约由 table-editor 单测覆盖'
        skips.push(skipMessage)
        testInfo.annotations.push({ type: 'visual-skip', description: skipMessage })
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)
        try {
            await openMenuSubmenu(page, '工具', '特殊字体')
        } catch (error) {
            const message = `工具窗替代入口打开失败，本区域无真实截图：${String(error)}`
            skips.push(message)
            testInfo.annotations.push({ type: 'visual-skip', description: message })
            return
        }
        toolWindowReady = await isVisible(page, toolWindowSelector, 10_000)
        toolWindowRegion = '非模态工具窗（特殊字体；表格编辑器 E2E 不可达）'
        if (!toolWindowReady) {
            const message = '工具窗未弹出，本区域无真实截图（改由静态矩阵断言覆盖）'
            skips.push(message)
            testInfo.annotations.push({ type: 'visual-skip', description: message })
            return
        }
    }
    for (const style of STYLES) {
        await applyAppearance(page, style, 'default')
        await capture(page, testInfo, `toolwindow__${style}__default`, {
            style,
            density: 'default',
            region: toolWindowRegion
        })
    }
    for (const density of DENSITIES) {
        await applyAppearance(page, 'workbench', density)
        await capture(page, testInfo, `toolwindow__workbench__${density}`, {
            style: 'workbench',
            density,
            region: toolWindowRegion
        })
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
        await closeTopDialog(page)
        if (!(await isVisible(page, toolWindowSelector, 1_000))) break
    }
}

/** glass 降级专项截图 */
async function captureGlassDegradations(page: Page, testInfo: TestInfo): Promise<void> {
    // 减少透明：JS 侧会回退 paper；这里同时切 data-transparency 验证 CSS 兜底路径
    await applyAppearance(page, 'glass', 'default', { transparency: 'reduced' })
    await capture(page, testInfo, 'glass__reduced-transparency', {
        style: 'glass',
        density: 'default',
        region: 'glass 降级（减少透明 → 不透明）'
    })
    // 深色 steady 稳健模式（半透明 0.94 + 关模糊）
    await applyAppearance(page, 'glass', 'default', { glassMode: 'steady' })
    await capture(page, testInfo, 'glass__steady', {
        style: 'glass',
        density: 'default',
        region: 'glass 降级（深色 steady 稳健模式）'
    })
    // 恢复默认，避免影响后续区域
    await applyAppearance(page, 'workbench', 'default')
}

/** 启动一次主界面（隔离 userData + 配置沙箱）；返回清理函数 */
async function launchWithProfile(
    profile: TempProfile,
    sandbox: ConfigSandbox
): Promise<MainViewLaunch> {
    sandbox.seed()
    seedUserDataConfig(profile, 'show-welcome', false)
    return launchToMainView(profile)
}

/** 关闭应用并恢复配置沙箱（finally 复用） */
async function teardown(launch: MainViewLaunch | null, sandbox: ConfigSandbox): Promise<void> {
    await launch?.app.close().catch(() => undefined)
    // 等待 Electron 释放单实例锁（与既有 spec 同口径）
    await new Promise((resolve) => setTimeout(resolve, 1_000))
    sandbox.restore()
}

/** 把截图清单写为 summary.json（报告可消费；out/ 不入库） */
function writeSummary(testInfo: TestInfo): void {
    fs.writeFileSync(
        path.join(REAL_DIR, 'summary.json'),
        JSON.stringify(
            {
                generatedAt: new Date().toISOString(),
                matrix: { styles: STYLES, densities: DENSITIES },
                total: shots.length,
                skips,
                baselines: {
                    newBaseline: shots.filter((s) => s.baselineMatch === 'new-baseline').length,
                    match: shots.filter((s) => s.baselineMatch === 'match').length,
                    diff: shots.filter((s) => s.baselineMatch === 'diff').length
                },
                shots
            },
            null,
            2
        ),
        'utf8'
    )
    testInfo.annotations.push({
        type: 'visual-matrix',
        description: `真实截图 ${shots.length} 张，归档 ${REAL_DIR}（软门禁：diff 只告警）`
    })
}

test.describe('视觉验收矩阵（真实截图软门禁）', () => {
    test('4 风格 × 3 密度 × 浅/深主题：6 类组件区域截图 + 像素软门禁', async () => {
        // 两次应用启动 + 约 40 张截图，放宽单用例超时
        test.setTimeout(300_000)
        ensureDirs()
        const testInfo = test.info()

        const profile = createTempProfile('baize-e2e-visual-light-')
        const sandbox = createConfigSandbox(profile)
        let launch: MainViewLaunch | null = null
        try {
            launch = await launchWithProfile(profile, sandbox)
            recordStartupMetrics(launch.launched, testInfo, '视觉矩阵-浅色')
            const { page } = launch

            // 管道自检：useTheme 启动后必须已写入 data-style / data-density（否则截图无意义）。
            // 注意：useTheme 在渲染层初始化后异步应用（主题设置读盘 + 广播），就绪时机比
            // #editor-container 挂载稍晚，因此这里用条件轮询而不是一次性读取（避免启动竞态误报）。
            await expect
                .poll(
                    () =>
                        page.evaluate(() => ({
                            style: document.documentElement.dataset.style,
                            density: document.documentElement.dataset.density
                        })),
                    { timeout: 15_000, message: '应用启动后根元素必须有 data-style / data-density' }
                )
                .toMatchObject({ style: expect.any(String), density: expect.any(String) })
            const initial = await page.evaluate(() => ({
                style: document.documentElement.dataset.style,
                density: document.documentElement.dataset.density,
                glassMode: document.documentElement.dataset.glassMode
            }))
            expect(initial.style, '应用启动后根元素必须有 data-style').toBeTruthy()
            expect(initial.density, '应用启动后根元素必须有 data-density').toBeTruthy()

            // 截图稳定性：禁用过渡/动画与光标闪烁、隐藏状态栏瞬时消息（见 stabilizePage 说明）
            await stabilizePage(page)

            // 打开预置示例文档（真实主进程打开链路）：主窗口截图含编辑器正文，
            // 同时让表格编辑器工具窗具备活动编辑器前置条件。
            await openSampleDocument(page, profile)

            await captureMainMatrix(page, testInfo)
            await captureGlassDegradations(page, testInfo)
            await captureComponentRegions(page, testInfo)
        } finally {
            await teardown(launch, sandbox)
        }

        // 深色主题矩阵：独立启动（隔离 userData + 主题配置种子）
        const darkProfile = createTempProfile('baize-e2e-visual-dark-')
        const darkSandbox = createConfigSandbox(darkProfile)
        let darkLaunch: MainViewLaunch | null = null
        try {
            darkSandbox.seed()
            // 代表深色主题：baize-text（实为深色底，见 shared/constants/theme.ts 归属说明）
            writeJson(path.join(darkSandbox.configDir, 'theme-config.json'), {
                themeConfig: {
                    currentTheme: 'baize-text',
                    separateEditorTheme: false,
                    editorTheme: 'vs'
                }
            })
            seedUserDataConfig(darkProfile, 'show-welcome', false)
            darkLaunch = await launchToMainView(darkProfile)
            recordStartupMetrics(darkLaunch.launched, testInfo, '视觉矩阵-深色')
            const { page } = darkLaunch

            await expect
                .poll(() => page.evaluate(() => document.documentElement.dataset.style), {
                    timeout: 15_000,
                    message: '深色主题启动后仍应有 data-style'
                })
                .toBeTruthy()

            // 深色主题为第二次应用启动：稳定性注入必须重新执行一次（否则状态栏提示会造成像素差）
            await stabilizePage(page)

            for (const style of STYLES) {
                await applyAppearance(page, style, 'default')
                await capture(page, testInfo, `main-dark__${style}__default`, {
                    style,
                    density: 'default',
                    region: '主窗口（深色主题）'
                })
            }
        } finally {
            await teardown(darkLaunch, darkSandbox)
        }

        writeSummary(testInfo)
    })
})
