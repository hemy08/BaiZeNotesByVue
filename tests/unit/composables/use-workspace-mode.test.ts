// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L5：工作区模式运行时读取（`composables/useWorkspaceMode.ts`）。
 *
 * 覆盖：
 * 1. 默认 traditional、配置读取成功后的响应式切换（含非法/缺字段容错）；
 * 2. 系统设置广播 `SYSTEM_SETTING_UPDATE` 实时生效（设置保存后无需重启）；
 * 3. 读取失败/无配置 API 时保持默认且不抛错、不注册与组件挂载无关的订阅；
 * 4. 监听幂等与释放（避免热重载/测试场景累积订阅）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import {
    disposeWorkspaceModeListener,
    initWorkspaceMode,
    refreshWorkspaceMode,
    resetWorkspaceModeForTesting,
    useWorkspaceMode
} from '../../../src/renderer/src/composables/useWorkspaceMode'
import { IPC } from '../../../src/shared/ipc-channels'

type Listener = (event?: unknown, setting?: unknown) => void

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let readMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    resetWorkspaceModeForTesting()
    readMock = vi.fn().mockResolvedValue({ workspaceMode: 'traditional' })
    ipcRenderer = { on: vi.fn(), removeListener: vi.fn() }
    vi.stubGlobal('electron', { ipcRenderer })
    vi.stubGlobal('api', { config: { read: readMock } })
})

afterEach(() => {
    disposeWorkspaceModeListener()
    resetWorkspaceModeForTesting()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 取出已注册的 SYSTEM_SETTING_UPDATE 广播回调 */
function getBroadcastListener(): Listener {
    const call = ipcRenderer.on.mock.calls.find(
        (args) => args[0] === IPC.SETTING.SYSTEM_SETTING_UPDATE
    )
    expect(call, '应注册 SYSTEM_SETTING_UPDATE 监听').toBeTruthy()
    return call![1] as Listener
}

describe('useWorkspaceMode：配置读取与默认值', () => {
    it('初始（未读取）默认 traditional，useWorkspaceMode 触发幂等初始化', async () => {
        const { isLlmWikiMode, workspaceMode } = useWorkspaceMode()
        expect(workspaceMode.value).toBe('traditional')
        expect(isLlmWikiMode.value).toBe(false)
        await initWorkspaceMode()
        expect(readMock).toHaveBeenCalledWith('system')
        // 幂等：重复调用不再重复读取
        await initWorkspaceMode()
        expect(readMock).toHaveBeenCalledTimes(1)
    })

    it('配置为 llm-wiki 时切换为 LLM Wiki 模式', async () => {
        readMock.mockResolvedValue({ workspaceMode: 'llm-wiki' })
        const { isLlmWikiMode } = useWorkspaceMode()
        await initWorkspaceMode()
        await nextTick()
        expect(isLlmWikiMode.value).toBe(true)
    })

    it('非法/缺失值经 normalize 回落 traditional（CFG-10 白名单归一化口径）', async () => {
        readMock.mockResolvedValue({ workspaceMode: 'not-a-mode' })
        const { workspaceMode } = useWorkspaceMode()
        await initWorkspaceMode()
        expect(workspaceMode.value).toBe('traditional')

        // 缺字段同样保持默认
        readMock.mockResolvedValue({})
        await refreshWorkspaceMode()
        expect(workspaceMode.value).toBe('traditional')
        // 读取返回 null（配置不存在）保持默认
        readMock.mockResolvedValue(null)
        await refreshWorkspaceMode()
        expect(workspaceMode.value).toBe('traditional')
    })

    it('配置读取失败不抛错且保持默认值', async () => {
        readMock.mockRejectedValue(new Error('ipc unavailable'))
        const { workspaceMode } = useWorkspaceMode()
        await expect(initWorkspaceMode()).resolves.toBeUndefined()
        expect(workspaceMode.value).toBe('traditional')
    })
})

describe('useWorkspaceMode：系统设置广播实时生效', () => {
    it('广播合法模式即时切换；未知值回落 traditional', async () => {
        const { isLlmWikiMode } = useWorkspaceMode()
        await initWorkspaceMode()
        const listener = getBroadcastListener()

        listener({}, { workspaceMode: 'llm-wiki' })
        await nextTick()
        expect(isLlmWikiMode.value).toBe(true)

        listener({}, { workspaceMode: 'bogus-mode' })
        await nextTick()
        expect(isLlmWikiMode.value).toBe(false)
    })

    it('广播载荷缺 workspaceMode 字段时保持当前模式', async () => {
        readMock.mockResolvedValue({ workspaceMode: 'llm-wiki' })
        const { isLlmWikiMode } = useWorkspaceMode()
        await initWorkspaceMode()
        expect(isLlmWikiMode.value).toBe(true)

        getBroadcastListener()({}, { language: 'en-US' })
        await nextTick()
        expect(isLlmWikiMode.value).toBe(true)
    })

    it('广播载荷为非对象/空值时安全忽略', async () => {
        const { workspaceMode } = useWorkspaceMode()
        await initWorkspaceMode()
        const listener = getBroadcastListener()

        listener({}, null)
        listener({}, 'not-an-object')
        listener({}, 42)
        await nextTick()
        expect(workspaceMode.value).toBe('traditional')
    })
})

describe('useWorkspaceMode：订阅生命周期与测试桩环境', () => {
    it('无真实配置 API（测试桩环境）时不注册广播订阅，且读取安全降级', async () => {
        vi.stubGlobal('api', undefined)
        const { workspaceMode } = useWorkspaceMode()
        await initWorkspaceMode()
        await refreshWorkspaceMode()
        expect(workspaceMode.value).toBe('traditional')
        expect(ipcRenderer.on).not.toHaveBeenCalled()
    })

    it('配置 API 读取属性抛错时安全降级（不阻塞界面）', async () => {
        vi.stubGlobal('api', {
            config: {
                get read(): never {
                    throw new Error('config bridge broken')
                }
            }
        })
        const { workspaceMode } = useWorkspaceMode()
        await expect(initWorkspaceMode()).resolves.toBeUndefined()
        expect(workspaceMode.value).toBe('traditional')
        expect(ipcRenderer.on).not.toHaveBeenCalled()
    })

    it('受限 ipcRenderer 缺少 on / removeListener 时不注册/不抛错', async () => {
        vi.stubGlobal('electron', { ipcRenderer: { removeListener: vi.fn() } })
        const { workspaceMode } = useWorkspaceMode()
        await expect(initWorkspaceMode()).resolves.toBeUndefined()
        expect(workspaceMode.value).toBe('traditional')
        expect(() => disposeWorkspaceModeListener()).not.toThrow()

        // removeListener 缺失：注册后释放走安全降级分支
        const onMock = vi.fn()
        vi.stubGlobal('electron', { ipcRenderer: { on: onMock } })
        await initWorkspaceMode()
        expect(onMock).toHaveBeenCalledTimes(1)
        expect(() => disposeWorkspaceModeListener()).not.toThrow()
    })

    it('无 window 的极端环境（typeof window === undefined）初始化/释放安全降级', async () => {
        vi.stubGlobal('window', undefined)
        const { workspaceMode } = useWorkspaceMode()
        await expect(initWorkspaceMode()).resolves.toBeUndefined()
        expect(workspaceMode.value).toBe('traditional')
        expect(() => disposeWorkspaceModeListener()).not.toThrow()
    })

    it('dispose 释放广播监听，再次初始化可重新注册', async () => {
        await initWorkspaceMode()
        expect(ipcRenderer.on).toHaveBeenCalledTimes(1)
        const listener = getBroadcastListener()

        disposeWorkspaceModeListener()
        expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
            IPC.SETTING.SYSTEM_SETTING_UPDATE,
            listener
        )

        await initWorkspaceMode()
        expect(ipcRenderer.on).toHaveBeenCalledTimes(2)
    })
})
