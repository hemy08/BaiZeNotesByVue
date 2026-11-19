/**
 * 主进程全局上下文（结构优化第 2 批 2.4 / M1：AppContext 集中化）
 *
 * ## 背景
 * 改造前主进程有 5 处以上「主窗口引用 / 欢迎页状态 / 快捷键状态 / 退出与托盘 flags」
 * 各持一份模块级可变量：
 * - `src/main/index.ts`：mainWindow、flushedForClose/flushedForQuit、rendererReadyReceived、
 *   startupRestorePendingWindow/startupRestoreFallbackTimer、disposeWindowBoundsPersistence；
 * - `src/main/utils/app-state.ts`：AppState._mainWindow、_isQuitting；
 * - `src/main/utils/ipc-security.ts`：trustedMainWindow；
 * - `src/main/ipc/welcome-state.ts`：mainViewEntered；
 * - `src/main/config/short-key-register.ts`：shortcutsRegistered/targetWindow；
 * - `src/main/utils/tray.ts`：trayHideNotified。
 *
 * 这些状态没有统一的读写入口，窗口重建（macOS activate）与单测复用都需要逐个模块
 * 手工复位，容易漏项。本模块把它们收敛到「唯一上下文单例」：
 *
 * 1. 状态本体集中：主窗口引用与全部生命周期 flags 只在本文件定义；
 * 2. 业务模块保留原有公开 API（如 welcome-state 的 markMainViewEntered、ipc-security 的
 *    setTrustedMainWindow），内部改为读写本上下文——调用方无需改动，行为不变；
 * 3. 提供 resetAppContext()：窗口重建/单测可在不重新加载模块的情况下整体复位。
 *
 * ## 边界约定
 * - 本文件是叶子模块：运行时只依赖全局计时器（clearTimeout），BrowserWindow 仅作
 *   **类型引用**（`import type`），因此单测无需 mock electron 运行时；
 * - 业务逻辑（窗口创建、IPC 注册、落盘协议）仍留在原模块，本文件只做「引用集中 +
 *   复位」，不重写任何行为。
 */
import type { BrowserWindow } from 'electron'

/**
 * 主进程全局上下文结构。
 *
 * 字段按用途分组；全部字段可由 resetAppContext() 一次性复原为默认值。
 * 分组内的引用/flag 均为「进程内唯一」，不跨窗口区分（应用为单主窗口模型）。
 */
export interface AppContext {
    /**
     * 主窗口引用（进程内唯一真源）。
     *
     * 收敛自：index.ts 的 mainWindow、AppState.mainWindow、ipc-security.trustedMainWindow、
     * handlers.currentMainWindow。createWindow() 写入，窗口销毁/重建时刷新；
     * macOS activate 重建窗口后所有消费方立即读到新窗口。
     */
    mainWindow: BrowserWindow | null

    /** 欢迎页 / 主界面可见状态（原 ipc/welcome-state.ts 的 mainViewEntered） */
    welcome: {
        /** 是否已进入主界面（false = 仍显示欢迎页） */
        mainViewEntered: boolean
    }

    /**
     * 全局快捷键状态（原 config/short-key-register.ts）。
     *
     * 收敛后仍保持 AS-12 语义：全局快捷键只注册一次（registered），
     * 窗口重建只更新 targetWindow。
     */
    shortKeys: {
        /** 是否已完成 globalShortcut 注册（进程级一次性） */
        registered: boolean
        /** 快捷键动作应作用的目标窗口（重建窗口时更新） */
        targetWindow: BrowserWindow | null
    }

    /**
     * 退出 / 关闭落盘协议状态。
     *
     * 收敛自：AppState._isQuitting、index.ts 的 flushedForQuit / flushedForClose。
     */
    quit: {
        /** 显式退出标志（before-quit / 托盘「退出」置位；close 拦截据此放行） */
        isQuitting: boolean
        /** 退出前 flush 是否已完成（防 before-quit 重复走落盘流程） */
        flushedForQuit: boolean
        /** 当前主窗口本次关闭是否已完成 flush（放行第二次 close；窗口重建时复位） */
        flushedForClose: boolean
    }

    /**
     * 渲染层就绪握手状态（原 index.ts 的 rendererReadyReceived）。
     * 渲染层 onMounted 后经 IPC.RENDER.READY 置位，窗口重建时复位。
     */
    rendererReady: {
        /** 是否已收到当前窗口的渲染层就绪握手 */
        received: boolean
    }

    /**
     * 启动恢复等待状态（原 index.ts 的 startupRestorePendingWindow /
     * startupRestoreFallbackTimer）：ready-to-show 挂起，握手或超时兜底后执行恢复。
     */
    startupRestore: {
        /** 等待渲染层就绪握手的主窗口（null = 无挂起恢复） */
        pendingWindow: BrowserWindow | null
        /** 握手超时兜底计时器句柄（null = 无计时器） */
        fallbackTimer: ReturnType<typeof setTimeout> | null
    }

    /** 「记住窗口位置和大小」持久化监听的清理函数（原 index.ts 模块级 let） */
    windowBounds: {
        /** 窗口边界持久化清理函数；null = 尚未挂接或已清理 */
        disposePersistence: (() => void) | null
    }

    /**
     * 托盘通知状态（原 utils/tray.ts 的 trayHideNotified）。
     *
     * 说明：本批允许修改范围不含 utils/tray.ts，因此该字段先统一登记，
     * tray.ts 的内存状态接线留待后续批次（行为与改造前一致，避免超范围改动）。
     */
    tray: {
        /** 因「最小化到托盘」隐藏窗口的系统通知是否已发送（每进程一次） */
        hideNotified: boolean
    }
}

/** 创建一份「全部复位为默认值」的上下文（不接管任何外部引用） */
export function createDefaultAppContext(): AppContext {
    return {
        mainWindow: null,
        welcome: { mainViewEntered: false },
        shortKeys: { registered: false, targetWindow: null },
        quit: { isQuitting: false, flushedForQuit: false, flushedForClose: false },
        rendererReady: { received: false },
        startupRestore: { pendingWindow: null, fallbackTimer: null },
        windowBounds: { disposePersistence: null },
        tray: { hideNotified: false }
    }
}

/** 进程内上下文单例（首次 getAppContext 时惰性创建） */
let appContext: AppContext | null = null

/**
 * 取全局上下文单例。
 *
 * 约定：消费方每次访问都调用本函数（不要长期缓存返回的对象引用），
 * 这样 resetAppContext() 替换单例后立即生效。
 */
export function getAppContext(): AppContext {
    if (appContext === null) {
        appContext = createDefaultAppContext()
    }
    return appContext
}

/**
 * 复位全局上下文（窗口重建 / 单元测试隔离用）。
 *
 * 复位前会取消挂起的启动恢复兜底计时器（避免复位后计时器仍触发旧恢复流程）；
 * 其余字段只丢弃引用，不主动执行清理函数（dispose 类函数已有各自的生命周期调用点）。
 */
export function resetAppContext(): void {
    const timer = appContext?.startupRestore.fallbackTimer ?? null
    if (timer !== null) {
        try {
            clearTimeout(timer)
        } catch {
            // 计时器句柄异常（极端环境/测试桩）时忽略：复位语义优先
        }
    }
    appContext = createDefaultAppContext()
}
