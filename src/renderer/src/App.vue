<template>
    <div id="app-root">
        <!-- 欢迎界面 -->
        <WelcomeScreen
            v-if="showWelcome"
            @open-file="handleOpenFile"
            @open-folder="handleOpenFolder"
            @open-recent-folder="handleOpenRecentFolder"
        />

        <!-- 主应用界面（异步分块：Monaco / highlight.js / KaTeX 等大依赖随该分块加载，不再进入入口 chunk） -->
        <BaiZeNotes v-else @main-view-mounted="handleMainViewMounted" />
    </div>
</template>

<script setup lang="ts">
/* eslint-disable vue/one-component-per-file -- 本文件除 App 外壳外还定义「主界面加载中 / 加载失败」两个极轻量占位组件（渲染函数实现，不值得拆独立 SFC/文件） */
import {
    defineAsyncComponent,
    defineComponent,
    h,
    nextTick,
    onBeforeUnmount,
    onMounted,
    ref
} from 'vue'
import type { Component, PropType } from 'vue'
// 主界面只在用户进入时才需要，改为动态 import 后欢迎页首屏不再解析 Monaco 等约 9MB 依赖；
// 具体加载/就绪时序见下方 preloadMainView / onMounted 的说明。
import WelcomeScreen from './components/WelcomeScreen.vue'
import { IPC } from '../../shared/ipc-channels'
import type { SystemSetting } from '../../shared/types'
// FE-35：配置写盘去抖窗口内的最后修改需要关窗前主动落盘
import { flushConfigWrites } from './common/useConfigStore'
import { t } from './common/i18n'
// 第 4 批 P3：裸 console.* 收敛到渲染层统一日志出口（仅替换输出出口，启动时序/兜底逻辑不变）
import { logger } from './common/logger'
// P1 性能基线：启动阶段轻量标记（默认关闭，诊断开关下才输出；见 common/perf.ts）
import { PERF_MARK, perfMark, perfMeasure } from './common/perf'

// 欢迎界面显示状态
const showWelcome = ref(true)

// =============================================================================================
// 启动恢复与欢迎页（产品决策 2026-11-15）
//
// 主进程启动时（src/main/index.ts ready-to-show → restoreLastOpenedFile）会在后台恢复上次
// 打开的文件/目录并下发数据事件；但渲染层**不会因此自动跳过欢迎页**——启动后始终显示
// 欢迎界面，由用户点击「最近文件夹 / 打开文件 / 打开文件夹」主动进入主界面。
// 理由：欢迎页是应用入口与最近工作列表，自动跳转会让用户失去选择入口的机会。
// （此前 FE-18 的「收到恢复数据即进入主界面」实现已按此决策移除。）
//
// 用户主动进入主界面时，主进程会重新下发目录树/文件内容（handlers.ts 的 WELCOME_* 与
// OPEN_SPECIFIC_FOLDER 流程），因此欢迎页期间被丢弃的恢复数据不影响后续使用。
// =============================================================================================

/** 进入主界面后最大化窗口的延迟（与 handleEnterMain 的历史行为保持一致） */
const MAXIMIZE_DELAY_MS = 100

/** 空闲预加载超时：超时后即使浏览器仍忙碌也启动主界面模块加载（避免长时间不预加载） */
const MAIN_VIEW_IDLE_TIMEOUT_MS = 2000

// =============================================================================================
// 主界面按需异步加载（性能改造）
//
// 改造前：App.vue 静态 import BaiZeNotes.vue → WorkSpace / MarkdownContainer /
// MarkdownMonacoEditor → monaco-editor、highlight.js、KaTeX 全部静态进入入口 chunk
// （实测入口 chunk ≈ 9.86MB，欢迎页首屏必须解析/编译这些依赖）。
// 改造后：BaiZeNotes.vue 改为 defineAsyncComponent 动态分块，入口 chunk 只保留欢迎页；
// 上述大依赖随主界面分块按需加载。加载器抽成 loadMainViewModule / preloadMainView，
// 让「异步组件加载」与「主动预加载」复用同一个模块 Promise（同一模块只求值一次）。
// =============================================================================================

/** Vue SFC 动态导入模块形态（只有 default 导出） */
type MainViewModule = { default: Component }

/** 主界面模块的真实动态导入（打包器据此生成独立异步 chunk） */
const loadMainViewModule = (): Promise<MainViewModule> => import('./components/BaiZeNotes.vue')

/** 主界面模块加载 Promise（缓存：异步组件 loader 与预加载共用，失败后清空以允许重试） */
let mainViewModulePromise: Promise<MainViewModule> | null = null

/**
 * 预加载主界面模块（幂等）。
 *
 * 返回的 Promise 同时是 defineAsyncComponent 的 loader 结果，因此预加载完成后异步组件
 * 挂载时不需要再发起一次模块请求；加载失败时清空缓存，让错误占位上的「重试」可以重新加载。
 */
function preloadMainView(): Promise<MainViewModule> {
    if (mainViewModulePromise === null) {
        mainViewModulePromise = loadMainViewModule().catch((error: unknown) => {
            mainViewModulePromise = null
            throw error
        })
    }
    return mainViewModulePromise
}

/** 主界面加载中的轻量占位（不依赖任何重型库，避免占位本身拖慢首屏） */
const MainViewLoading = defineComponent({
    name: 'MainViewLoading',
    setup() {
        return () =>
            h(
                'div',
                {
                    class: 'main-view-loading',
                    role: 'status',
                    'aria-live': 'polite'
                },
                [
                    h('span', { class: 'main-view-loading-spinner', 'aria-hidden': 'true' }),
                    h('span', { class: 'main-view-loading-text' }, t('common.loading'))
                ]
            )
    }
})

/** 主界面加载失败的兜底提示 + 重试（defineAsyncComponent 传入 error / retry 两个 props） */
const MainViewError = defineComponent({
    name: 'MainViewError',
    props: {
        error: {
            type: Object as PropType<Error>,
            required: true
        },
        retry: {
            type: Function as PropType<() => void>,
            // 同 MarkdownEditComponent 的错误占位：Vue 3 的 defineAsyncComponent 只向
            // errorComponent 传 `error`、不传 `retry`（retry 仅存在于 onError 回调签名）。
            // 原实现 required:true 使「重试」按钮点击抛 TypeError，这里给默认空实现兜底。
            required: false,
            default: () => undefined
        }
    },
    setup(props) {
        return () =>
            h('div', { class: 'main-view-error', role: 'alert' }, [
                h('p', { class: 'main-view-error-title' }, t('common.error')),
                h(
                    'p',
                    { class: 'main-view-error-detail' },
                    props.error instanceof Error ? props.error.message : String(props.error ?? '')
                ),
                // 复用既有 i18n 词条（本批次改动范围限定在 src/renderer，不新增 shared 词典键）
                h(
                    'button',
                    {
                        type: 'button',
                        class: 'main-view-error-retry',
                        onClick: () => props.retry?.()
                    },
                    t('dialogRenderer.common.retry')
                )
            ])
    }
})

/**
 * 主界面异步组件。
 *
 * loader 显式取出模块的 default 组件再返回：defineAsyncComponent 的模块解包依赖
 * `__esModule` / `Symbol.toStringTag` 标记，显式解包可避免不同打包/测试模块形态下的
 * 互操作差异，行为最确定。
 *
 * delay: 0 —— 模块未就绪时立即显示占位，避免用户点击后出现无反馈的空白。
 * suspensible: false —— 与对话框懒加载保持一致的挂载语义（不依赖 Suspense 边界）。
 */
const BaiZeNotes = defineAsyncComponent({
    loader: async () => (await preloadMainView()).default,
    loadingComponent: MainViewLoading,
    errorComponent: MainViewError,
    delay: 0,
    timeout: 60000,
    // 与对话框懒加载保持一致的挂载语义：不依赖 Suspense 边界
    suspensible: false
})

/**
 * 在首帧之后空闲预加载主界面模块（仅欢迎页启动路径使用）。
 *
 * 先等 requestAnimationFrame（首帧渲染机会之后再启动重型分块请求/求值），再走
 * requestIdleCallback（避开启动恢复等待办），保证不会因为预加载拖慢欢迎页首屏；
 * 用户点击打开文件/文件夹/最近文件夹时还会各自触发/等待 preloadMainView 兜底。
 */
function scheduleMainViewPreload(): void {
    const startPreload = (): void => {
        void preloadMainView().catch((error: unknown) => {
            // 预加载失败不弹窗：用户真正进入主界面时异步组件的 errorComponent 会给出提示与重试
            logger.error('预加载主界面模块失败:', error)
        })
    }
    if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(() => {
            if (typeof requestIdleCallback === 'function') {
                requestIdleCallback(startPreload, { timeout: MAIN_VIEW_IDLE_TIMEOUT_MS })
            } else {
                setTimeout(startPreload, 0)
            }
        })
        return
    }
    // 无 rAF 的运行环境（极旧内核/测试桩）退化为宏任务，行为仍为「让出当前任务后再预加载」
    setTimeout(startPreload, 0)
}

/**
 * 主界面挂载完成信号（BaiZeNotes.vue 在其 onMounted 中注册完全部 IPC 监听后 emit）。
 *
 * 为什么不能只用 nextTick 推测挂载：defineAsyncComponent 的「模块解析 → 渲染 → 挂载」
 * 跨若干轮微任务，且受模块加载完成时点的异步性影响，nextTick 次数无法构成确定性保证；
 * 由主界面组件自己上报「监听器已注册」才是 READY 握手时序的可靠依据。
 */
let mainViewMounted = false
const pendingMainViewMountResolvers: Array<() => void> = []

/** 主界面组件挂载完成（来自 BaiZeNotes.vue 的 main-view-mounted 事件） */
function handleMainViewMounted(): void {
    // P1 性能基线：主界面挂载确认（标记本体在 BaiZeNotes.vue onMounted 内，此处补一条
    // 渲染层时间轴上的 measure，便于报告里直接看到 main-view-mounted 相对导航起点的耗时）
    perfMeasure(PERF_MARK.MAIN_VIEW_MOUNTED)
    mainViewMounted = true
    while (pendingMainViewMountResolvers.length > 0) {
        pendingMainViewMountResolvers.shift()?.()
    }
}

/**
 * 确保主界面模块加载完成（不等待挂载）。
 *
 * 用途：自动打开上次会话的启动恢复路径——主进程收到 READY 后会先发 WELCOME_ENTER_MAIN
 * 再于下一 tick 投递数据事件；此时欢迎页仍在显示（主界面尚未渲染），但只要模块已加载，
 * WELCOME_ENTER_MAIN 到达后异步组件即可在微任务内完成解析与挂载、赶在数据事件前注册监听。
 */
async function ensureMainViewModuleLoaded(): Promise<void> {
    try {
        await preloadMainView()
    } catch (error) {
        logger.error('主界面模块加载失败:', error)
    }
}

/**
 * 等待主界面异步组件完成加载与挂载（监听器已注册）。
 *
 * 用途：`show-welcome=false` 启动即主界面的场景必须在发送 READY 前确保主界面组件
 * （及其子组件的 onMounted IPC 监听器）已经就位，否则主进程收到握手后立即发送的
 * 启动恢复数据事件会早于监听器注册到达而丢失（FE-01）。
 */
async function waitMainViewMounted(): Promise<void> {
    // 已挂载（例如等待前组件已就绪）直接返回
    if (mainViewMounted) return
    try {
        // 先确保模块加载完成（正常由 showWelcome=false 触发的异步组件 loader 共享该 Promise）
        await preloadMainView()
    } catch (error) {
        // 模块加载失败时不再等待挂载：保持后续 READY / 启动恢复流程不被无限阻塞，
        // 界面由 errorComponent 展示错误与重试入口。
        logger.error('主界面模块加载失败:', error)
        return
    }
    // 让 showWelcome=false 引起的这次渲染先提交（异步组件开始解析/挂载）
    await nextTick()
    if (mainViewMounted) return
    // 等待主界面组件上报挂载完成（事件在 onMounted 中同步触发，不存在竞态窗口）
    await new Promise<void>((resolve) => {
        pendingMainViewMountResolvers.push(resolve)
    })
}

// 处理打开文件
function handleOpenFile() {
    // 主进程弹出系统文件对话框、用户选择后才进入主界面，这段时间足够完成分块加载；
    // 这里顺带触发（或等待已在进行的）预加载，避免进入主界面后才发现模块尚未加载。
    void preloadMainView().catch(() => undefined)
    // 发送 IPC 信号打开文件
    window.electron.ipcRenderer.send(IPC.FILE.WELCOME_OPEN_FILE)
}

// 处理打开文件夹
function handleOpenFolder() {
    void preloadMainView().catch(() => undefined)
    // 发送 IPC 信号打开文件夹
    window.electron.ipcRenderer.send(IPC.FILE.WELCOME_OPEN_DIRECTORY)
}

// 处理打开最近的文件夹
async function handleOpenRecentFolder(folder: string) {
    // 主进程收到 OPEN_SPECIFIC_FOLDER 后会立即 send WELCOME_ENTER_MAIN、并在下一 tick 投递
    // 目录数据事件（FE-01 时序），因此必须先把主界面模块准备好再发请求；预加载失败时
    // 不阻塞进入主界面（由异步组件的 errorComponent 兜底提示）。
    await preloadMainView().catch(() => undefined)
    // 立即隐藏欢迎界面和最大化窗口
    showWelcome.value = false
    window.electron.ipcRenderer.send(IPC.WINDOW.MAXIMIZE)
    // 打开指定文件夹
    window.electron.ipcRenderer.send(IPC.FILE.OPEN_SPECIFIC_FOLDER, folder)
    // 保存到最近打开列表
    await saveToRecentFolders(folder)
}

// 保存到最近打开的文件夹列表
async function saveToRecentFolders(folderPath: string) {
    try {
        let history = (await window.api.config.read<string[]>('recent-folders')) || []
        if (!Array.isArray(history)) {
            history = []
        }
        // 移除重复项并添加到开头
        history = history.filter((path: string) => path !== folderPath)
        history.unshift(folderPath)
        // 只保留最近20个
        history = history.slice(0, 20)
        await window.api.config.write('recent-folders', history)
    } catch (error) {
        logger.error('Failed to save recent folders:', error)
    }
}

/** 最大化主窗口（延迟到主界面首帧渲染之后，避免欢迎页/主界面切换动画期间调用无效） */
function maximizeMainWindow(): void {
    setTimeout(() => {
        window.electron.ipcRenderer.send(IPC.WINDOW.MAXIMIZE)
    }, MAXIMIZE_DELAY_MS)
}

// 监听主进程的进入主界面通知
function handleEnterMain(_event: unknown, data: { type: string; path: string }) {
    // 兜底：正常情况下（show-welcome=false / 自动打开上次会话 / 用户主动打开）主界面模块
    // 都已在 READY 或用户操作前预加载完成，这里仅复用缓存 Promise，不产生额外加载；
    // 若确实尚未加载（例如主进程超时兜底恢复），异步组件会展示加载占位，不会阻塞。
    void preloadMainView().catch(() => undefined)
    // 隐藏欢迎界面
    showWelcome.value = false
    // 最大化窗口
    maximizeMainWindow()

    // 如果是文件夹,保存到最近打开列表
    if (data.type === 'directory') {
        saveToRecentFolders(data.path)
    }
}

/**
 * FE-35：立即落盘渲染层配置去抖窗口内的最后修改。
 *
 * 主进程关闭流程（main/index.ts 的 close/before-quit）会先发送 IPC.EDITOR.FLUSH_CONTENT
 * 并等待渲染层回执（2s 超时）后才真正关窗——此刻渲染层仍存活，配置写盘的 invoke
 * 可以送达主进程；beforeunload / onBeforeUnmount 作为刷新、卸载场景的兜底。
 */
function handleFlushConfigWrites(): void {
    void flushConfigWrites()
}

/** FE-35：页面刷新/关闭兜底 flush（异步 IPC 若来不及完成，由主进程关窗流程兜底） */
function handleBeforeUnload(): void {
    void flushConfigWrites()
}

// 检查是否应该显示欢迎界面
onMounted(async () => {
    // 监听进入主界面事件
    window.electron.ipcRenderer.on(IPC.FILE.WELCOME_ENTER_MAIN, handleEnterMain)
    // FE-35：主进程关窗前 flush 配置写盘 + 页面卸载兜底
    window.electron.ipcRenderer.on(IPC.EDITOR.FLUSH_CONTENT, handleFlushConfigWrites)
    window.addEventListener('beforeunload', handleBeforeUnload)

    // 读取欢迎页配置与系统设置（后者用于判断主进程是否会在 READY 后自动进入主界面）。
    // 两个读取互不影响（allSettled）：任一失败都不阻塞启动——show-welcome 读取失败沿用
    // 历史行为「显示欢迎页、立即握手」，system 读取失败按「无自动打开」处理。
    let showWelcomeConfig: unknown = undefined
    let systemSetting: Partial<SystemSetting> | null = null
    const [welcomeResult, systemResult] = await Promise.allSettled([
        window.api.config.read('show-welcome'),
        window.api.config.read<Partial<SystemSetting>>('system')
    ])
    if (welcomeResult.status === 'fulfilled') {
        showWelcomeConfig = welcomeResult.value
    } else {
        logger.error('Failed to load welcome config:', welcomeResult.reason)
    }
    if (systemResult.status === 'fulfilled') {
        systemSetting = systemResult.value
    } else {
        logger.error('Failed to load system setting:', systemResult.reason)
    }

    // 启动恢复时序（P2-5 / FE-01）：
    // 主进程收到 READY 后才执行启动恢复；若「自动打开上次文件/文件夹」开启，恢复流程会先 send
    // WELCOME_ENTER_MAIN（渲染层切到主界面），再于下一 tick 投递数据事件。主界面组件改成异步
    // 分块后，必须保证数据事件到达前主界面监听器已注册，因此三条路径分别处理：
    //  ① show-welcome=false：先完成加载与挂载，再发 READY（组件已就位）；
    //  ② 自动打开上次会话：READY 前先完成模块加载（WELCOME_ENTER_MAIN 到达时异步组件可立即解析）；
    //  ③ 普通欢迎页：保持既有 READY 时序（欢迎页不需要主界面监听器），随后空闲预加载主界面。
    try {
        const autoEnterMainView =
            systemSetting?.autoOpenLastFile === true || systemSetting?.autoOpenLastFolder === true

        if (showWelcomeConfig === false) {
            // ① 启动即主界面：异步组件先出占位，完成加载与挂载（监听器注册）后再握手
            showWelcome.value = false
            await waitMainViewMounted()
        } else if (autoEnterMainView) {
            // ② 启动恢复会自动进入主界面：主界面模块必须在 READY 前加载完毕
            await ensureMainViewModuleLoaded()
        } else {
            // ③ 欢迎页：握手时序保持现状，主界面模块改由首帧后的空闲预加载
            scheduleMainViewPreload()
        }
    } catch (error) {
        logger.error('准备主界面时序失败:', error)
    }

    // P2-5：渲染层就绪握手——主进程（main/index.ts）收到后才执行启动恢复
    // （autoOpenLastFile / autoOpenLastFolder / 后台恢复）。监听器（WELCOME_ENTER_MAIN 等）
    // 与主界面组件就位均已在上方完成；握手放在 try 之外，保证配置读取失败时监听器已就位
    // 仍能通知主进程。
    // P1 性能基线：renderer-ready 标记紧贴握手发送点（主进程收到后记录同名标记）
    perfMark(PERF_MARK.RENDERER_READY)
    perfMeasure(PERF_MARK.RENDERER_READY)
    window.api.app.notifyRendererReady()
})

onBeforeUnmount(() => {
    // 移除监听器
    window.electron.ipcRenderer.removeListener(IPC.FILE.WELCOME_ENTER_MAIN, handleEnterMain)
    // FE-35：移除配置 flush 监听，并在卸载前兜底落盘待写配置
    window.electron.ipcRenderer.removeListener(IPC.EDITOR.FLUSH_CONTENT, handleFlushConfigWrites)
    window.removeEventListener('beforeunload', handleBeforeUnload)
    void flushConfigWrites()
})
</script>

<style scoped>
#app-root {
    width: 100%;
    height: 100%;
}

/* 主界面分块加载中的占位（根节点由父组件 scoped CSS 命中；内部元素样式写在本组件内） */
.main-view-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    width: 100%;
    height: 100vh;
    color: var(--theme-secondary-text-color, #888);
    font-size: 13px;
    background: var(--theme-background-color, transparent);
}

.main-view-loading-spinner {
    width: 22px;
    height: 22px;
    border: 2px solid var(--theme-border-color, rgba(0, 0, 0, 0.15));
    border-top-color: var(--theme-accent-color, #764ba2);
    border-radius: 50%;
    animation: main-view-loading-spin 0.8s linear infinite;
}

@keyframes main-view-loading-spin {
    to {
        transform: rotate(360deg);
    }
}

/* 主界面分块加载失败的提示（同样只依赖主题变量，不引入额外样式文件） */
.main-view-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    width: 100%;
    height: 100vh;
    padding: 24px;
    box-sizing: border-box;
    text-align: center;
    color: var(--theme-text-color, #333);
    background: var(--theme-background-color, transparent);
}

.main-view-error-title {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
}

.main-view-error-detail {
    margin: 0;
    max-width: 560px;
    font-size: 12px;
    color: var(--theme-secondary-text-color, #888);
    word-break: break-all;
}

.main-view-error-retry {
    padding: 6px 18px;
    font-size: 13px;
    cursor: pointer;
    color: var(--theme-button-text-color, #fff);
    background: var(--theme-button-background, var(--theme-accent-color, #764ba2));
    border: 1px solid var(--theme-border-color, transparent);
    border-radius: 4px;
}
</style>
