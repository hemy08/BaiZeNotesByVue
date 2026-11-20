/**
 * E2E 共享 UI 夹具（P2 E2E 覆盖扩展：主题设置首开 / HTML 查看器导航 / 文件打开保存）
 *
 * 本文件在既有的 e2e/helpers/electron-profile.ts 之上补充「用例级」公共动作，避免新增
 * spec 各自复制启动补偿、菜单点击与启动恢复计数断言：
 *
 * 1. `launchToMainView()`：启动开发构建并进入主界面（复用既有 helper 的渲染就绪等待；
 *    极少数启动仍落在欢迎页时，与 settings-persistence 同口径重写 show-welcome=false 后
 *    reload 补偿，补偿次数经返回值 `compensationReloads` 暴露，不静默吞掉）；
 * 2. `launchToMainViewZeroRecovery()`：Q-01「启动零恢复」可观测断言入口——期望首启即
 *    零恢复；若命中 Electron 43.x 上游 sandboxed preload 启动数据 mojo 竞态（helper 的
 *    `reloadRecoveries>0`，属已知环境竞态而非产品逻辑），记录诊断并重试启动，最终仍要求
 *    返回实例为 `launchAttempts===1 && reloadRecoveries===0`，同时把命中记录交回用例写入
 *    Playwright annotation / 报告，不做假绿；
 * 3. `recordStartupMetrics()`：**所有功能 spec 启动后的统一指标入口**（P1-4）。始终把
 *    `launchAttempts` / `reloadRecoveries` / 测试侧补偿 reload 次数写入 Playwright annotation
 *    与 console（CI 日志/HTML 报告可消费）；默认**只记录不失败**（避免已知 Electron 上游
 *    preload 竞态误伤功能用例）；CI 启动稳定性 job 设置 `E2E_STRICT_LAUNCH=1` 时，恢复/
 *    进程重启一律硬失败并打印 `launchFailures` 诊断，防止启动链退化被静默吸收；
 * 4. 菜单动作、主进程配置读取、「最近项」打开等真实 IPC 小工具。
 *
 * P1-4（E2E 自动恢复掩盖启动稳定性）配套：
 * - 量化 spec `e2e/startup-stability.spec.ts` 连续启动 N 次，汇总本文件的指标并做
 *   「恢复率 ≤ 25% 且零进程重启」的软门禁（阈值依据见该文件头部）；
 * - 本文件只消费 `electron-profile.ts` 已有的 `launchAttempts` / `reloadRecoveries` /
 *   `launchFailures`，不修改也不绕过其恢复逻辑。
 *
 * 约束：本文件只被 e2e/** 引用，不修改产品源码；所有等待均使用条件轮询（locator 断言 /
 * expect.poll），不引入固定 sleep 作为同步手段（启动重试间的最小退避除外）。
 */
import { expect } from '@playwright/test'
import type { ElectronApplication, Page, TestInfo } from '@playwright/test'
import {
    launchDevAppWithRenderer,
    seedUserDataConfig,
    waitForRendererReady
} from './electron-profile'
import type { LaunchedDevApp, TempProfile } from './electron-profile'

/** 启动到主界面的结果（app/page + helper 的启动诊断数据） */
export interface MainViewLaunch {
    app: ElectronApplication
    page: Page
    launched: LaunchedDevApp
    /**
     * 测试侧欢迎页补偿 reload 次数（0 = 启动即主界面）。
     * 这是「show-welcome 读取/主进程时序竞态」的测试侧补偿，**不是** preload 恢复，
     * 因此与 `launched.reloadRecoveries` 分开统计，不混入启动恢复率。
     */
    compensationReloads: number
}

/** 等待两个事件循环轮次（启动重试间退避；不用于代替条件等待） */
function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * 启动开发构建并等待主界面就绪。
 *
 * 与 settings-persistence.spec.ts 的本地 launchToMainView 同口径：
 * - 真源就绪等待由 launchDevAppWithRenderer 完成（preload 桥 + IPC 往返 + Vue 挂载）；
 * - 极少数启动仍落在欢迎页（show-welcome 读取/主进程读取时序竞态）时，写入隔离 userData
 *   的 show-welcome=false 并 reload 补偿（补偿后重新做完整就绪等待）。
 */
export async function launchToMainView(profile: TempProfile): Promise<MainViewLaunch> {
    const launched = await launchDevAppWithRenderer(profile)
    const { app, page } = launched
    let compensationReloads = 0
    const mainViewVisible = await page
        .locator('#editor-container')
        .isVisible({ timeout: 3_000 })
        .catch(() => false)
    if (!mainViewVisible) {
        const welcomeVisible = await page
            .getByRole('button', { name: '打开文件' })
            .isVisible()
            .catch(() => false)
        if (welcomeVisible) {
            seedUserDataConfig(profile, 'show-welcome', false)
            await page.reload()
            compensationReloads += 1
            await waitForRendererReady(page)
        }
    }
    await expect(page.locator('#editor-container')).toBeVisible({ timeout: 60_000 })
    return { app, page, launched, compensationReloads }
}

/** launchToMainViewZeroRecovery 的选项 */
export interface ZeroRecoveryOptions {
    /** 命中已知 preload 竞态时允许的额外启动次数（默认 2，即最多启动 3 次） */
    maxRetries?: number
}

/** 零恢复启动结果（额外字段记录为达成零恢复所付出的启动次数与命中记录） */
export interface ZeroRecoveryLaunch extends MainViewLaunch {
    /** 为达成零恢复而额外启动的次数（0 = 首次启动即零恢复） */
    recoveryRetries: number
    /** 命中已知环境竞态的记录（供用例写入 annotation / 报告；空数组 = 未命中） */
    recoveryNotes: string[]
}

/**
 * 启动到主界面并断言「零恢复」。
 *
 * Q-01（E2E 启动链可见性）：既有 helper 会在首次导航 preload 未注入时用 page.reload()
 * 恢复（Electron 43.x 上游竞态），但此前所有用例都不消费 `launchAttempts` /
 * `reloadRecoveries`，导致「9/9 通过」可能掩盖产品启动链真实退化。
 *
 * 本函数语义：
 * - 优先返回「首次启动即 launchAttempts===1 且 reloadRecoveries===0」的实例；
 * - 若命中已知上游竞态（reloadRecoveries>0），把命中记录写入 recoveryNotes（供报告），
 *   关闭实例后重新启动（最多 maxRetries 次），最终实例仍要求零恢复；
 * - 连续多次仍命中恢复时**照常返回**最后一次结果，由用例的硬断言失败并带上这些记录，
 *   不静默改判（既不让环境竞态变成假绿，也不把它伪装成产品缺陷而不提供证据）。
 */
export async function launchToMainViewZeroRecovery(
    profile: TempProfile,
    options: ZeroRecoveryOptions = {}
): Promise<ZeroRecoveryLaunch> {
    const maxRetries = Math.max(0, options.maxRetries ?? 2)
    const recoveryNotes: string[] = []
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        const result = await launchToMainView(profile)
        const { launchAttempts, reloadRecoveries } = result.launched
        if (launchAttempts === 1 && reloadRecoveries === 0) {
            return { ...result, recoveryRetries: attempt, recoveryNotes }
        }
        const note =
            `第 ${attempt + 1} 次启动命中已知 Electron sandboxed preload 启动竞态：` +
            `launchAttempts=${launchAttempts}，reloadRecoveries=${reloadRecoveries}` +
            `（测试侧 page.reload() 已恢复，非产品逻辑；重试启动以取得零恢复基线）`
        recoveryNotes.push(note)
        console.warn(`[e2e] ${note}`)
        if (attempt === maxRetries) {
            return { ...result, recoveryRetries: attempt + 1, recoveryNotes }
        }
        await result.app.close().catch(() => undefined)
        await delay(500)
    }
    // 循环内已覆盖全部分支，此处仅为满足类型收窄
    throw new Error('launchToMainViewZeroRecovery：未返回启动结果（不可达分支）')
}

/** 启动稳定性指标（P1-4：所有启动用例统一口径，供 annotation/报告与 startup-stability 汇总消费） */
export interface StartupLaunchMetrics {
    /** 进程级启动次数（1 = 首启即就绪；>1 = helper 关闭实例重启过） */
    launchAttempts: number
    /** helper 的页面 reload 恢复次数（已知 Electron 43.x 上游 sandboxed preload 竞态） */
    reloadRecoveries: number
    /** 测试侧欢迎页补偿 reload 次数（非 preload 恢复，不计入恢复率） */
    compensationReloads: number
    /** helper 记录的启动失败/恢复诊断条数（launchFailures.length） */
    launchFailureCount: number
    /** 从启动到主界面就绪耗时（ms；未采集时为 null） */
    readyMs: number | null
}

/** 可派生启动指标的最小来源（开发构建的 LaunchedDevApp；打包启动路径用普通对象补齐） */
export interface StartupLaunchSource {
    launchAttempts: number
    reloadRecoveries: number
    launchFailures: string[]
}

/** 指标补充信息（测试侧统计，不属于 helper 恢复逻辑） */
export interface StartupMetricsExtra {
    /** 测试侧欢迎页补偿 reload 次数 */
    compensationReloads?: number
    /** 启动到主界面就绪耗时（ms） */
    readyMs?: number | null
}

/** annotation 类型：统一用该 type，便于在 HTML 报告/CI 日志中筛选启动稳定性指标 */
export const STARTUP_METRICS_ANNOTATION = 'startup-metrics'

/**
 * 是否严格启动模式（CI 启动稳定性 job 设置 E2E_STRICT_LAUNCH=1）。
 * 严格模式下功能用例「零恢复 + 零进程重启」硬失败；默认容错模式只记录指标。
 */
export function isStrictLaunchMode(): boolean {
    return process.env.E2E_STRICT_LAUNCH === '1'
}

/** 由启动结果派生统一口径的指标 */
export function startupMetricsOf(
    source: StartupLaunchSource,
    extra: StartupMetricsExtra = {}
): StartupLaunchMetrics {
    return {
        launchAttempts: source.launchAttempts,
        reloadRecoveries: source.reloadRecoveries,
        compensationReloads: extra.compensationReloads ?? 0,
        launchFailureCount: source.launchFailures.length,
        readyMs: extra.readyMs ?? null
    }
}

/** 指标的单行文本（console 与 annotation 共用，便于 grep/汇总） */
export function formatStartupMetrics(label: string, metrics: StartupLaunchMetrics): string {
    return (
        `[${label}] launchAttempts=${metrics.launchAttempts}` +
        ` reloadRecoveries=${metrics.reloadRecoveries}` +
        ` compensationReloads=${metrics.compensationReloads}` +
        ` launchFailureCount=${metrics.launchFailureCount}` +
        ` readyMs=${metrics.readyMs ?? '-'}`
    )
}

/** recordStartupMetrics 的选项 */
export interface RecordStartupMetricsOptions extends StartupMetricsExtra {
    /**
     * 覆盖严格模式判定（默认跟随 E2E_STRICT_LAUNCH）。
     * 量化 spec `startup-stability.spec.ts` 逐样本记录时显式传 false：其门禁是
     * 「恢复率 ≤ 阈值 + 零进程重启」，不做逐样本零恢复硬失败。
     */
    strict?: boolean
}

/**
 * 记录启动稳定性指标（P1-4：所有功能 spec 启动后必须调用）。
 *
 * 行为：
 * - **始终**写入 Playwright annotation（type=`startup-metrics`）与 console（前缀
 *   `[e2e][startup-metrics]`）：即使用例最终通过，启动恢复/进程重试的事实也进入报告与
 *   CI 日志，不再被「9/9 通过」静默吸收；
 * - 默认（容错模式）：只记录，不改变用例结果——已知 Electron 43.x sandboxed preload
 *   上游竞态属环境噪声，不应误伤功能用例；
 * - `E2E_STRICT_LAUNCH=1`（CI 启动稳定性 job）：`launchAttempts>1`（进程级重启）或
 *   `reloadRecoveries>0`（启动恢复）硬失败，并打印 `launchFailures` 诊断，保证启动链
 *   真实退化不会被容错模式掩盖。
 */
export function recordStartupMetrics(
    source: StartupLaunchSource,
    testInfo: TestInfo,
    label: string,
    options: RecordStartupMetricsOptions = {}
): StartupLaunchMetrics {
    const metrics = startupMetricsOf(source, options)
    const description = formatStartupMetrics(label, metrics)
    // 始终写 annotation + console：即使用例最终通过，启动恢复事实也进入报告/CI 日志（拒绝静默吸收）
    testInfo.annotations.push({ type: STARTUP_METRICS_ANNOTATION, description })
    console.log(`[e2e][startup-metrics] ${description}`)

    const failureDiagnostics =
        source.launchFailures.length > 0
            ? `\n启动诊断（launchFailures，共 ${source.launchFailures.length} 条）：\n` +
              source.launchFailures.join('\n')
            : ''
    const strict = options.strict ?? isStrictLaunchMode()
    if (strict) {
        expect(
            metrics.launchAttempts,
            `[${label}] E2E_STRICT_LAUNCH=1 但启动发生进程级重试（launchAttempts=${metrics.launchAttempts}，期望 1）${failureDiagnostics}`
        ).toBe(1)
        expect(
            metrics.reloadRecoveries,
            `[${label}] E2E_STRICT_LAUNCH=1 但启动命中 reload 恢复（reloadRecoveries=${metrics.reloadRecoveries}，期望 0）${failureDiagnostics}`
        ).toBe(0)
        return metrics
    }
    // 容错模式（默认）：只记录，不改用例结果——避免已知 Electron 上游竞态误伤功能用例
    if (metrics.launchAttempts > 1) {
        const text =
            `[${label}] 启动发生进程级重试 launchAttempts=${metrics.launchAttempts}` +
            `（属异常信号；E2E_STRICT_LAUNCH=1 时该用例会失败）`
        console.warn(`[e2e] ${text}`)
        testInfo.annotations.push({ type: 'startup-retry', description: text })
    }
    if (metrics.reloadRecoveries > 0) {
        const text =
            `[${label}] 命中已知 Electron sandboxed preload 启动竞态，` +
            `reloadRecoveries=${metrics.reloadRecoveries}（测试侧 reload 恢复，非产品逻辑；` +
            `E2E_STRICT_LAUNCH=1 时该用例会失败）`
        console.warn(`[e2e] ${text}`)
        testInfo.annotations.push({ type: 'known-issue', description: text })
    }
    return metrics
}

/**
 * 通过渲染层菜单栏打开「一级菜单 → 二级菜单项」。
 *
 * 菜单栏为渲染层 DOM（.menu-bar / .menu-item / .submenu-container），点击后子菜单容器
 * teleport 到 body；与 settings-persistence.spec.ts 的打开设置对话框同口径。
 */
export async function openMenuSubmenu(
    page: Page,
    topLevelLabel: string,
    submenuLabel: string
): Promise<void> {
    await page.locator('.menu-bar .menu-item').filter({ hasText: topLevelLabel }).first().click()
    await page
        .locator('.submenu-container .menu-submenu-item')
        .filter({ hasText: submenuLabel })
        .first()
        .click()
}

/** 读取主进程配置（经 preload 高层 API window.api.config.read，真实 IPC 往返） */
export async function readMainConfig<T>(page: Page, configName: string): Promise<T | null> {
    return page.evaluate(async (name) => {
        const api = (
            window as unknown as {
                api: { config: { read: (configName: string) => Promise<unknown> } }
            }
        ).api
        return (await api.config.read(name)) as unknown
    }, configName) as Promise<T | null>
}

/** 「最近项」打开结果（主进程 OPEN_RECENT 返回结构） */
export interface OpenRecentResult {
    ok: boolean
    message?: string
}

/**
 * 经 preload 高层 API 打开「最近文件 / 最近文件夹」（真实主进程链路）。
 *
 * 主进程会按当前最近列表做白名单校验后复用既有打开链路（文件：读盘 + USER_SELECT_FILE /
 * SHOW_SELECTED_FILE_CONTEXT 下发；文件夹：工作区根校验 + 进入主界面 + 目录树下发），
 * 因此不是「mock 打开」，只是绕过了原生文件对话框（E2E 无法操作系统对话框）。
 */
export async function openRecentViaApi(
    page: Page,
    payload: { kind: 'file' | 'folder'; path: string }
): Promise<OpenRecentResult> {
    return page.evaluate(async (request) => {
        const api = (
            window as unknown as {
                api: {
                    file: {
                        openRecent: (input: {
                            kind: 'file' | 'folder'
                            path: string
                        }) => Promise<OpenRecentResult>
                    }
                }
            }
        ).api
        return api.file.openRecent(request)
    }, payload)
}
