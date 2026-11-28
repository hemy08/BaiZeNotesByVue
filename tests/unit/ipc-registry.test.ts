/**
 * 主进程 IPC 注册清单（src/main/ipc/registry.ts）单元测试
 *
 * 结构优化第 2 批 2.4（M2）：覆盖把 main/index.ts 散落的注册调用收口为 registry 后的
 * 编排契约：
 * - 两个阶段：registerPreWindowIpc（建窗前，配置 IPC + 旧配置迁移）→ registerAll
 *   （建窗后：主题更新 → 渲染层就绪握手 → 对话框右键 → utils 侧 29 通道（P2 已拆分到
 *   ipc/ 各域模块，由 utils-ipc.ts 编排）→ handlers → PlantUML）；
 * - registerAll 内部调用顺序与改造前 main/index.ts 一致，不得调整；
 * - 主题更新通道仍按旧行为组装载荷并广播（含无参回退默认值）、只接受受信主窗口；
 * - 渲染层就绪握手经 onRendererReady 钩子回调入口（sender 校验后再回调）；
 * - 缺少钩子时只告警、不抛错（正常启动流程必传）。
 *
 * 说明：本文件 mock 掉各注册实现模块，只验证「清单编排」；各模块内部通道注册细节
 * 仍由 handlers/utils/dialogs/plantuml-local 各自的单测覆盖。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

/**
 * registerAll 内部各注册实现的调用顺序记录
 */
const callOrder: string[] = []

/** 台账 mock：记录 registerOnce 的通道/监听器/组件 ID，供模拟渲染层消息触发 */
interface RegisteredListener {
    channel: string
    listener: (...args: unknown[]) => unknown
    componentId: string
}
const listenerRegistry = new Map<string, RegisteredListener>()

const implementationMocks = vi.hoisted(() => ({
    // 各注册实现（按调用顺序 push 到 callOrder）
    registerConfigIpcHandlers: vi.fn(),
    mainWindowListenDialogsEvent: vi.fn(),
    // P2 IPC 注册收口：原 utils/utils.ts 的注册入口已迁到 ipc/utils-ipc.ts
    registerUtilsIpcHandlers: vi.fn(),
    registerIpcHandlers: vi.fn(),
    registerPlantumlLocalRenderIpc: vi.fn(),
    // A2（2026-11-21）：全工作区搜索/替换独立域注册入口
    registerWorkspaceSearchIpc: vi.fn(),
    // 1.5.1：工作区索引独立域注册入口
    registerWorkspaceIndexIpc: vi.fn(),
    // 1.5.1 B5：附件管理独立域注册入口
    registerAttachmentIpc: vi.fn(),
    // 1.5.2 E6：今日日记 / 快速收件箱独立域注册入口
    registerCaptureIpc: vi.fn(),
    // 1.5.2 E2：PDF 标注与摘录独立域注册入口
    registerPdfAnnotationsIpc: vi.fn(),
    // 1.5.2 E3：图片 OCR 独立域注册入口
    registerOcrIpc: vi.fn(),
    // 1.5.7 LLM Wiki L1：工作区初始化独立域注册入口
    registerLlmWikiIpc: vi.fn(),
    // 1.5.7 LLM Wiki L2：MCP 只读桥（设置页状态/开关）独立域注册入口
    registerMcpIpc: vi.fn(),
    // 1.5.7 LLM Wiki L3：AI Provider / AI ingest / diff 审批（5 个 invoke 通道）独立域注册入口
    registerAiIpc: vi.fn(),
    // 主题广播依赖
    getCurrentThemeStyles: vi.fn(),
    getThemeStylesByType: vi.fn(),
    getMonacoTheme: vi.fn(),
    getSeparateEditorTheme: vi.fn(),
    broadcastThemeToAllWindows: vi.fn(),
    buildThemeBroadcastPayload: vi.fn(),
    // 日志
    loggerError: vi.fn(),
    loggerWarn: vi.fn()
}))

vi.mock('../../src/main/config/config-manager', () => ({
    registerConfigIpcHandlers: implementationMocks.registerConfigIpcHandlers
}))

vi.mock('../../src/main/config/theme-config', () => ({
    getCurrentThemeStyles: implementationMocks.getCurrentThemeStyles,
    getThemeStylesByType: implementationMocks.getThemeStylesByType,
    getMonacoTheme: implementationMocks.getMonacoTheme,
    getSeparateEditorTheme: implementationMocks.getSeparateEditorTheme
}))

vi.mock('../../src/main/dialogs/dialogs', () => ({
    MainWindowListenDialogsEvent: implementationMocks.mainWindowListenDialogsEvent
}))

vi.mock('../../src/main/ipc/handlers', () => ({
    registerIpcHandlers: implementationMocks.registerIpcHandlers
}))

vi.mock('../../src/main/renders/plantuml-local', () => ({
    registerPlantumlLocalRenderIpc: implementationMocks.registerPlantumlLocalRenderIpc
}))

// A2（2026-11-21）：工作区搜索/替换为独立域模块（本文件只验证编排，不加载真实实现）
vi.mock('../../src/main/ipc/workspace-search-ipc', () => ({
    registerWorkspaceSearchIpc: implementationMocks.registerWorkspaceSearchIpc
}))

// 1.5.1：工作区索引独立域模块（本文件只验证编排，不加载真实实现）
vi.mock('../../src/main/ipc/workspace-index-ipc', () => ({
    registerWorkspaceIndexIpc: implementationMocks.registerWorkspaceIndexIpc
}))

// 1.5.1 B5：附件管理独立域模块（本文件只验证编排）
vi.mock('../../src/main/ipc/attachment-ipc', () => ({
    registerAttachmentIpc: implementationMocks.registerAttachmentIpc
}))

// 1.5.2 E6：今日日记 / 快速收件箱独立域模块（本文件只验证编排）
vi.mock('../../src/main/ipc/capture-ipc', () => ({
    registerCaptureIpc: implementationMocks.registerCaptureIpc
}))

// 1.5.2 E2：PDF 标注与摘录独立域模块（本文件只验证编排）
vi.mock('../../src/main/ipc/pdf-annotations-ipc', () => ({
    registerPdfAnnotationsIpc: implementationMocks.registerPdfAnnotationsIpc
}))

// 1.5.2 E3：图片 OCR 独立域模块（本文件只验证编排）
vi.mock('../../src/main/ipc/ocr-ipc', () => ({
    registerOcrIpc: implementationMocks.registerOcrIpc
}))

// 1.5.7 LLM Wiki L1：工作区初始化独立域模块（本文件只验证编排）
vi.mock('../../src/main/ipc/llm-wiki-ipc', () => ({
    registerLlmWikiIpc: implementationMocks.registerLlmWikiIpc
}))

// 1.5.7 LLM Wiki L2：MCP 只读桥独立域模块（本文件只验证编排）
vi.mock('../../src/main/ipc/mcp-ipc', () => ({
    registerMcpIpc: implementationMocks.registerMcpIpc
}))

// 1.5.7 LLM Wiki L3：AI Provider / ingest / diff 审批独立域模块（本文件只验证编排）
vi.mock('../../src/main/ipc/ai-ipc', () => ({
    registerAiIpc: implementationMocks.registerAiIpc
}))

// P1-1：主题广播实现已迁到中性层 utils/theme-broadcast（config 不再 import ipc/**）
vi.mock('../../src/main/utils/theme-broadcast', () => ({
    broadcastThemeToAllWindows: implementationMocks.broadcastThemeToAllWindows,
    buildThemeBroadcastPayload: implementationMocks.buildThemeBroadcastPayload
}))

// 台账 mock：registerOnce（registry 注册主题/握手两条 persistent 监听）+
// registerHandleOnce（工作区索引 IPC 由 registry 调用注册函数，函数内部会访问台账）
vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: {
        registerOnce: vi.fn(
            (
                channel: string,
                listener: (...args: unknown[]) => unknown,
                componentId: string
            ): string | null => {
                listenerRegistry.set(channel, { channel, listener, componentId })
                return `${channel}:once`
            }
        ),
        registerHandleOnce: vi.fn(() => 'mock-handle-id')
    }
}))

// P2 IPC 注册收口：原 utils/utils.ts 的 29 处注册已按域拆到 ipc/ 各模块，
// registry 只调用 ipc/utils-ipc.ts 的统一编排入口（本文件 mock 该入口，验证编排顺序）
vi.mock('../../src/main/ipc/utils-ipc', () => ({
    registerUtilsIpcHandlers: implementationMocks.registerUtilsIpcHandlers
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: {
        error: implementationMocks.loggerError,
        warn: implementationMocks.loggerWarn
    }
}))

import { IPC } from '../../src/shared/ipc-channels'
// 真实 ipc-security / app-context：验证「注册即登记受信主窗口」与 sender 校验接线
import { getTrustedMainWindow, resetTrustedSenderRegistry } from '../../src/main/utils/ipc-security'
// 台账 mock 实例（与 registry 内部使用的是同一模块实例）
import { ipcListenerManager } from '../../src/main/ipc/ipc-listener-manager'
import { registerAll, registerPreWindowIpc } from '../../src/main/ipc/registry'

/** 最小主窗口桩（sender 校验只用到 webContents 引用与 isDestroyed） */
function makeMainWindow(): {
    webContents: { id: number; send: ReturnType<typeof vi.fn> }
    isDestroyed: () => boolean
} {
    return {
        webContents: { id: 101, send: vi.fn() },
        isDestroyed: () => false
    }
}

/** 取 registry 注册的 on 监听器（找不到直接失败，避免空断言） */
function getRegisteredListener(channel: string): (...args: unknown[]) => unknown {
    const entry = listenerRegistry.get(channel)
    expect(entry, `registry 应注册通道 ${channel}`).toBeDefined()
    return entry!.listener
}

/** 受信主窗口事件桩（sender 必须与 AppContext.mainWindow.webContents 是同一对象） */
function makeTrustedEvent(mainWindow: ReturnType<typeof makeMainWindow>): { sender: unknown } {
    return { sender: mainWindow.webContents }
}

let mainWindow: ReturnType<typeof makeMainWindow>

beforeEach(() => {
    vi.clearAllMocks()
    listenerRegistry.clear()
    callOrder.length = 0
    resetTrustedSenderRegistry()

    mainWindow = makeMainWindow()
    implementationMocks.registerConfigIpcHandlers.mockImplementation(() => {
        callOrder.push('config-ipc')
    })
    implementationMocks.mainWindowListenDialogsEvent.mockImplementation(() => {
        callOrder.push('dialogs')
    })
    implementationMocks.registerUtilsIpcHandlers.mockImplementation(() => {
        callOrder.push('utils')
    })
    implementationMocks.registerIpcHandlers.mockImplementation(() => {
        callOrder.push('handlers')
    })
    implementationMocks.registerPlantumlLocalRenderIpc.mockImplementation(() => {
        callOrder.push('plantuml')
    })
    implementationMocks.registerWorkspaceSearchIpc.mockImplementation(() => {
        callOrder.push('workspace-search')
    })
    implementationMocks.registerWorkspaceIndexIpc.mockImplementation(() => {
        callOrder.push('workspace-index')
    })
    implementationMocks.registerAttachmentIpc.mockImplementation(() => {
        callOrder.push('attachment')
    })
    implementationMocks.registerCaptureIpc.mockImplementation(() => {
        callOrder.push('capture')
    })
    implementationMocks.registerPdfAnnotationsIpc.mockImplementation(() => {
        callOrder.push('pdf-annotations')
    })
    implementationMocks.registerOcrIpc.mockImplementation(() => {
        callOrder.push('ocr')
    })
    implementationMocks.registerLlmWikiIpc.mockImplementation(() => {
        callOrder.push('llm-wiki')
    })
    implementationMocks.registerMcpIpc.mockImplementation(() => {
        callOrder.push('mcp')
    })
    implementationMocks.registerAiIpc.mockImplementation(() => {
        callOrder.push('ai')
    })
    implementationMocks.getCurrentThemeStyles.mockReturnValue({ name: 'baize' })
    implementationMocks.getThemeStylesByType.mockImplementation((themeType: string) => ({
        name: themeType
    }))
    implementationMocks.getMonacoTheme.mockReturnValue('vs-dark')
    implementationMocks.getSeparateEditorTheme.mockReturnValue(false)
    implementationMocks.buildThemeBroadcastPayload.mockImplementation(
        (themeStyles: unknown, monacoTheme: unknown, separateEditorTheme: unknown) => ({
            themeStyles,
            monacoTheme,
            separateEditorTheme
        })
    )
})

afterEach(() => {
    resetTrustedSenderRegistry()
})

describe('registerPreWindowIpc（建窗前阶段）', () => {
    it('should register config IPC before the main window exists', () => {
        registerPreWindowIpc()
        expect(implementationMocks.registerConfigIpcHandlers).toHaveBeenCalledTimes(1)
        expect(callOrder).toEqual(['config-ipc'])
    })
})

describe('registerAll（建窗后一次性注册清单）', () => {
    it('should call the existing registration functions in the historical order', () => {
        const onRendererReady = vi.fn()
        registerAll(mainWindow as never, { onRendererReady })

        // 改造前 main/index.ts 的注册顺序：对话框 → utils → handlers → PlantUML
        // （A2 工作区搜索/替换、1.5.1 工作区索引为新增独立域，依次追加在 PlantUML 之后；
        //  主题/握手为 persistent 注册，见下一条用例；它们不进入 callOrder）
        expect(callOrder).toEqual([
            'dialogs',
            'utils',
            'handlers',
            'plantuml',
            'workspace-search',
            'workspace-index',
            'attachment',
            'capture',
            'pdf-annotations',
            'ocr',
            'llm-wiki',
            'mcp',
            'ai'
        ])
        expect(implementationMocks.mainWindowListenDialogsEvent).toHaveBeenCalledWith(mainWindow)
        expect(implementationMocks.registerUtilsIpcHandlers).toHaveBeenCalledWith(mainWindow)
        expect(implementationMocks.registerIpcHandlers).toHaveBeenCalledWith(mainWindow)
        expect(implementationMocks.registerPlantumlLocalRenderIpc).toHaveBeenCalledTimes(1)
        expect(implementationMocks.registerWorkspaceSearchIpc).toHaveBeenCalledWith(
            mainWindow,
            'global-workspace-search-ipc'
        )
        expect(implementationMocks.registerWorkspaceIndexIpc).toHaveBeenCalledWith(
            mainWindow,
            'global-workspace-index-ipc'
        )
        expect(implementationMocks.registerAttachmentIpc).toHaveBeenCalledWith(
            mainWindow,
            'global-attachment-ipc'
        )
        expect(implementationMocks.registerCaptureIpc).toHaveBeenCalledWith(
            mainWindow,
            'global-capture-ipc'
        )
        expect(implementationMocks.registerPdfAnnotationsIpc).toHaveBeenCalledWith(
            mainWindow,
            'global-pdf-annotations-ipc'
        )
        expect(implementationMocks.registerOcrIpc).toHaveBeenCalledWith(
            mainWindow,
            'global-ocr-ipc'
        )
        // 1.5.7 LLM Wiki L1：工作区初始化 handler（无窗口参数，仅台账组件 ID）
        expect(implementationMocks.registerLlmWikiIpc).toHaveBeenCalledWith('global-llm-wiki-ipc')
        // 1.5.7 LLM Wiki L2：MCP 只读桥状态/开关 handler（无窗口参数，仅台账组件 ID）
        expect(implementationMocks.registerMcpIpc).toHaveBeenCalledWith('global-mcp-ipc')
        // 1.5.7 LLM Wiki L3：AI Provider / ingest / diff 审批 handler（无窗口参数，仅台账组件 ID）
        expect(implementationMocks.registerAiIpc).toHaveBeenCalledWith('global-ai-ipc')
    })

    it('should register the persistent theme/ready listeners before the window-level registrations', () => {
        registerAll(mainWindow as never, { onRendererReady: vi.fn() })

        const registerOnce = vi.mocked(ipcListenerManager.registerOnce)
        expect(registerOnce).toHaveBeenCalledTimes(2)
        const channels = registerOnce.mock.calls.map((call) => call[0])
        // 主题更新广播 → 渲染层就绪握手（与改造前 index.ts 的相对顺序一致）
        expect(channels).toEqual([IPC.THEME.UPDATE_THEME, IPC.RENDER.READY])
        for (const call of registerOnce.mock.calls) {
            expect(call[2]).toBe('global-main-index')
        }
        // 两条 persistent 注册必须早于任何窗口级注册实现（顺序不可调整）
        const themeOrder = registerOnce.mock.invocationCallOrder[0]
        const readyOrder = registerOnce.mock.invocationCallOrder[1]
        const firstWindowLevelOrder =
            implementationMocks.mainWindowListenDialogsEvent.mock.invocationCallOrder[0]
        expect(themeOrder).toBeLessThan(readyOrder)
        expect(readyOrder).toBeLessThan(firstWindowLevelOrder)
    })

    it('should register the main window as trusted sender before any listener', () => {
        registerAll(mainWindow as never, { onRendererReady: vi.fn() })
        expect(getTrustedMainWindow()).toBe(mainWindow)
    })
})

describe('主题更新广播（原 main/index.ts 内联逻辑）', () => {
    it('should broadcast the given theme type with explicit monaco/separate values', () => {
        registerAll(mainWindow as never, { onRendererReady: vi.fn() })
        const themeListener = getRegisteredListener(IPC.THEME.UPDATE_THEME)

        themeListener(makeTrustedEvent(mainWindow) as never, 'dark', 'vs-light', true)

        expect(implementationMocks.getThemeStylesByType).toHaveBeenCalledWith('dark')
        expect(implementationMocks.buildThemeBroadcastPayload).toHaveBeenCalledWith(
            { name: 'dark' },
            'vs-light',
            true
        )
        expect(implementationMocks.broadcastThemeToAllWindows).toHaveBeenCalledWith({
            themeStyles: { name: 'dark' },
            monacoTheme: 'vs-light',
            separateEditorTheme: true
        })
    })

    it('should fall back to current store values when no arguments are given', () => {
        registerAll(mainWindow as never, { onRendererReady: vi.fn() })
        const themeListener = getRegisteredListener(IPC.THEME.UPDATE_THEME)

        themeListener(makeTrustedEvent(mainWindow) as never)

        expect(implementationMocks.getCurrentThemeStyles).toHaveBeenCalled()
        expect(implementationMocks.getMonacoTheme).toHaveBeenCalled()
        expect(implementationMocks.getSeparateEditorTheme).toHaveBeenCalled()
        expect(implementationMocks.broadcastThemeToAllWindows).toHaveBeenCalledWith({
            themeStyles: { name: 'baize' },
            monacoTheme: 'vs-dark',
            separateEditorTheme: false
        })
    })

    it('should ignore theme updates from an untrusted sender and log the rejection', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        registerAll(mainWindow as never, { onRendererReady: vi.fn() })
        const themeListener = getRegisteredListener(IPC.THEME.UPDATE_THEME)

        themeListener({ sender: { id: 999 } } as never, 'dark')

        expect(implementationMocks.getThemeStylesByType).not.toHaveBeenCalled()
        expect(implementationMocks.broadcastThemeToAllWindows).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })
})

describe('渲染层就绪握手（原 main/index.ts 内联逻辑）', () => {
    it('should invoke the onRendererReady hook for the trusted main window', () => {
        const onRendererReady = vi.fn()
        registerAll(mainWindow as never, { onRendererReady })
        const readyListener = getRegisteredListener(IPC.RENDER.READY)

        readyListener(makeTrustedEvent(mainWindow) as never)

        expect(onRendererReady).toHaveBeenCalledTimes(1)
    })

    it('should not invoke the hook for an untrusted sender', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const onRendererReady = vi.fn()
        registerAll(mainWindow as never, { onRendererReady })
        const readyListener = getRegisteredListener(IPC.RENDER.READY)

        readyListener({ sender: { id: 202 } } as never)

        expect(onRendererReady).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('should warn but not throw when the hook is omitted', () => {
        registerAll(mainWindow as never)
        const readyListener = getRegisteredListener(IPC.RENDER.READY)
        expect(() => readyListener(makeTrustedEvent(mainWindow) as never)).not.toThrow()
        expect(implementationMocks.loggerWarn).toHaveBeenCalledWith(
            expect.stringContaining('onRendererReady')
        )
    })
})
