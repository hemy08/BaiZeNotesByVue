// @vitest-environment jsdom
/**
 * P1-FE-04 快捷链接设置数据源统一：端到端一致性测试。
 *
 * 背景：修复前设置对话框写 quick-link-config.json 的 rendererQuickLinks 键
 * （形状 {name,url,icon,description}），NaviTab 经 QUICK_LINKS.GET 读 quickLinks 键
 * （形状 QuickLinkItem[]），两套数据互不消费，保存后导航栏不生效。
 *
 * 本文件用「渲染层真实组件 + 主进程真实配置模块 + 内存 IPC 总线」验证：
 * 1. 设置对话框打开时从主进程 quickLinks 读取（唯一数据源）；
 * 2. 对话框保存经 QUICK_LINKS.SAVE → 主进程归一化落盘（与 handlers.ts 同一套
 *    normalizeQuickLinkItems/saveQuickLinks）→ 广播 UPDATED；
 * 3. NaviTab 读取/监听同一数据源，保存后立即刷新；
 * 4. NaviTab 卸载时正确移除 UPDATED 监听（防 IPC 监听泄漏）。
 *
 * IPC 总线按 handlers.ts 的 SAVE handler 逻辑模拟（归一化 → saveQuickLinks → 广播）；
 * 真实 handler 的注册/发送方校验/广播断言见 tests/unit/ipc-handlers.test.ts。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// 顶层 mock：electron（app-paths 需要 getPath('home')）与 electron-store 内存替身，
// 与 tests/unit/quick-link-config.test.ts 保持同一套主进程配置模块加载环境。
const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: { home: `${base}/baize-vitest-quick-link-sync/home` } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-quick-link-sync/app`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

// 让 theme-registry 目录扫描返回空（主题目录不存在），避免依赖磁盘状态
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

import { FakeStore } from './helpers/fake-store'
import {
    getQuickLinks,
    saveQuickLinks,
    normalizeQuickLinkItems
} from '../../src/main/config/quick-link-config'
import { IPC } from '../../src/shared/ipc-channels'
import QuickLinkSettingDialog from '@renderer/components/dialogs/help/QuickLinkSettingDialog.vue'
import NaviTab from '@renderer/components/WorkSpaceArea/NaviTab.vue'

type IpcListener = (event: unknown, payload?: unknown) => void

interface MockIpcBus {
    invoke: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    broadcast: (channel: string, payload: unknown) => void
    listenerCount: (channel: string) => number
}

/**
 * 内存 IPC 总线：invoke 分支镜像 handlers.ts 的 QUICK_LINKS.SAVE handler
 * （归一化 → 落盘 → 向主窗口广播 UPDATED），GET 直接读主进程真实配置模块。
 */
function createIpcBus(): MockIpcBus {
    const listeners = new Map<string, IpcListener[]>()

    const broadcast = (channel: string, payload: unknown): void => {
        for (const listener of listeners.get(channel) ?? []) {
            listener({}, payload)
        }
    }

    const invoke = vi.fn((channel: string, payload?: unknown) => {
        if (channel === IPC.QUICK_LINKS.GET) {
            return Promise.resolve(getQuickLinks())
        }
        if (channel === IPC.QUICK_LINKS.SAVE) {
            const normalized = normalizeQuickLinkItems(payload)
            if (normalized === null) {
                return Promise.resolve({ ok: false, reason: 'invalid-payload' })
            }
            saveQuickLinks(normalized)
            broadcast(IPC.QUICK_LINKS.UPDATED, normalized)
            return Promise.resolve({ ok: true, links: normalized })
        }
        return Promise.resolve(undefined)
    })

    const on = vi.fn((channel: string, listener: IpcListener) => {
        const channelListeners = listeners.get(channel) ?? []
        channelListeners.push(listener)
        listeners.set(channel, channelListeners)
    })

    const removeListener = vi.fn((channel: string, listener: IpcListener) => {
        const channelListeners = listeners.get(channel) ?? []
        const index = channelListeners.indexOf(listener)
        if (index !== -1) {
            channelListeners.splice(index, 1)
        }
    })

    return {
        invoke,
        on,
        removeListener,
        broadcast,
        listenerCount: (channel: string) => (listeners.get(channel) ?? []).length
    }
}

const dialogMountOptions = { global: { stubs: { teleport: true } } }

/** 挂载设置对话框并等待从主进程读取完成 */
async function mountDialog(): Promise<ReturnType<typeof mount>> {
    const wrapper = mount(QuickLinkSettingDialog, {
        ...dialogMountOptions,
        props: { visible: true }
    })
    await flushPromises()
    return wrapper
}

/** 挂载左侧 NaviTab 并等待快速链接加载完成 */
async function mountNaviTab(): Promise<ReturnType<typeof mount>> {
    const wrapper = mount(NaviTab, { props: { position: 'left' } })
    await flushPromises()
    return wrapper
}

/** NaviTab 快速链接按钮标题列表（排除三个内置按钮，其带 data-index 属性） */
function linkTitles(wrapper: ReturnType<typeof mount>): string[] {
    return wrapper
        .findAll('.navi-tab-item:not([data-index])')
        .map((button) => button.attributes('title') as string)
}

/** 对话框内通过表单新增一条链接 */
async function addDialogLink(
    wrapper: ReturnType<typeof mount>,
    name: string,
    url: string
): Promise<void> {
    await wrapper.find('.add-btn').trigger('click')
    const inputs = wrapper.findAll('.form-input')
    await inputs[0].setValue(name)
    await inputs[1].setValue(url)
    await wrapper.find('.btn-primary').trigger('click')
}

let bus: MockIpcBus
let wrapper: ReturnType<typeof mount> | null = null

beforeEach(() => {
    FakeStore.resetAll()
    bus = createIpcBus()
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke: bus.invoke,
            send: vi.fn(),
            on: bus.on,
            removeListener: bus.removeListener
        }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('P1-FE-04 快捷链接数据源统一（对话框 ↔ 主进程 quickLinks ↔ NaviTab）', () => {
    it('对话框打开时从主进程 quickLinks 读取（而不是硬编码默认值）', async () => {
        // 主进程已有一份自定义配置
        saveQuickLinks([
            {
                id: 'custom',
                name: '自定义链接',
                type: 'url',
                path: 'https://custom.example.com',
                icon: 'text',
                iconContent: 'C',
                enabled: true,
                order: 1,
                position: 'left'
            }
        ])

        wrapper = await mountDialog()

        const items = wrapper.findAll('.link-item')
        expect(items).toHaveLength(1)
        expect(items[0].text()).toContain('自定义链接')
        expect(wrapper.text()).not.toContain('GitHub')
        expect(bus.invoke).toHaveBeenCalledWith(IPC.QUICK_LINKS.GET)
    })

    // FE-34①：watch(visible) 修复后，每次打开都重新从主进程读取，
    // 不再只拷贝「上次打开时的内存值」（旧实现会导致外部更新后看到的仍是旧数据）。
    it('关闭后再次打开时重新从主进程读取最新 quickLinks（FE-34）', async () => {
        saveQuickLinks([
            {
                id: 'custom-a',
                name: '第一次打开',
                type: 'url',
                path: 'https://first.example.com',
                icon: 'text',
                iconContent: '1',
                enabled: true,
                order: 1,
                position: 'left'
            }
        ])
        wrapper = await mountDialog()
        expect(wrapper.text()).toContain('第一次打开')

        // 关闭对话框；期间主进程 quickLinks 被其他入口更新
        await wrapper.setProps({ visible: false })
        saveQuickLinks([
            {
                id: 'custom-b',
                name: '第二次打开',
                type: 'url',
                path: 'https://second.example.com',
                icon: 'text',
                iconContent: '2',
                enabled: true,
                order: 1,
                position: 'left'
            }
        ])

        const getCallsBefore = bus.invoke.mock.calls.filter(
            ([channel]) => channel === IPC.QUICK_LINKS.GET
        ).length

        // 再次打开：必须重新 invoke GET，并展示最新数据
        await wrapper.setProps({ visible: true })
        await flushPromises()

        expect(
            bus.invoke.mock.calls.filter(([channel]) => channel === IPC.QUICK_LINKS.GET).length
        ).toBe(getCallsBefore + 1)
        expect(wrapper.text()).toContain('第二次打开')
        expect(wrapper.text()).not.toContain('第一次打开')
    })

    it('对话框确认保存后主进程 quickLinks 更新为 QuickLinkItem[] 形状', async () => {
        wrapper = await mountDialog()
        await addDialogLink(wrapper, '知乎', 'https://www.zhihu.com')

        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        expect(wrapper.emitted('close')).toHaveLength(1)

        // 主进程真实存储（quickLinks 键）已更新，且为 QuickLinkItem[] 形状：
        // 历史 rendererQuickLinks 的 {name,url,icon,description} 形状不再写入。
        const saved = getQuickLinks()
        const zhihu = saved.find((link) => link.name === '知乎')
        expect(zhihu).toEqual(
            expect.objectContaining({
                type: 'url',
                path: 'https://www.zhihu.com',
                // 表单未填写图标时沿用对话框默认 '🌐'，主进程按内容推断为 emoji 渲染分支
                icon: 'emoji',
                iconContent: '🌐',
                enabled: true,
                position: 'left'
            })
        )
        // 保存载荷为对话框全部 4 条链接，order 按顺序重排
        expect(saved.map((link) => link.order)).toEqual([1, 2, 3, 4])
        expect(saved.map((link) => link.id)).toEqual(
            expect.arrayContaining(['deepseek', 'wenxin', 'chatgpt', zhihu!.id])
        )
    })

    it('保存后 NaviTab 读取到与对话框一致的数据（同一数据源）', async () => {
        const dialog = await mountDialog()
        await addDialogLink(dialog, '知乎', 'https://www.zhihu.com')
        await dialog.find('.btn-confirm').trigger('click')
        await flushPromises()
        dialog.unmount()

        wrapper = await mountNaviTab()

        const titles = linkTitles(wrapper)
        // 主进程默认三条 + 新增一条，NaviTab 与对话框保存的配置完全一致
        expect(titles).toEqual(expect.arrayContaining(['DeepSeek', '文心一言', 'ChatGPT', '知乎']))
        expect(titles).toHaveLength(4)
    })

    it('主进程广播 UPDATED 后已挂载的 NaviTab 立即刷新（无需重挂载）', async () => {
        wrapper = await mountNaviTab()
        expect(linkTitles(wrapper)).toHaveLength(3)

        // 模拟另一次保存：主进程归一化落盘并广播（与 handlers.ts 同一逻辑）
        const current = getQuickLinks()
        const normalized = normalizeQuickLinkItems([
            ...current,
            {
                id: 'new-link',
                name: '新链接',
                type: 'url',
                path: 'https://new.example.com',
                icon: 'text',
                iconContent: 'N',
                enabled: true,
                order: current.length + 1,
                position: 'left'
            }
        ])
        expect(normalized).not.toBeNull()
        saveQuickLinks(normalized!)
        bus.broadcast(IPC.QUICK_LINKS.UPDATED, normalized)
        await flushPromises()

        expect(linkTitles(wrapper)).toContain('新链接')
        expect(linkTitles(wrapper)).toHaveLength(4)
        // NaviTab 只注册一次 UPDATED 监听，刷新走载荷应用而非重复订阅
        expect(bus.listenerCount(IPC.QUICK_LINKS.UPDATED)).toBe(1)
    })

    it('UPDATED 载荷异常时回退为重新 GET 拉取', async () => {
        wrapper = await mountNaviTab()
        expect(linkTitles(wrapper)).toHaveLength(3)

        const before = getQuickLinks()
        saveQuickLinks([
            ...before,
            {
                id: 'fallback',
                name: '回退链接',
                type: 'url',
                path: 'https://fallback.example.com',
                icon: 'text',
                iconContent: 'F',
                enabled: true,
                order: before.length + 1,
                position: 'left'
            }
        ])
        const getCallsBefore = bus.invoke.mock.calls.filter(
            ([channel]) => channel === IPC.QUICK_LINKS.GET
        ).length
        bus.broadcast(IPC.QUICK_LINKS.UPDATED, undefined)
        await flushPromises()

        expect(
            bus.invoke.mock.calls.filter(([channel]) => channel === IPC.QUICK_LINKS.GET).length
        ).toBe(getCallsBefore + 1)
        expect(linkTitles(wrapper)).toContain('回退链接')
    })

    it('NaviTab 卸载时移除 UPDATED 监听（防 IPC 监听泄漏）', async () => {
        wrapper = await mountNaviTab()
        expect(bus.listenerCount(IPC.QUICK_LINKS.UPDATED)).toBe(1)

        wrapper.unmount()
        wrapper = null

        expect(bus.removeListener).toHaveBeenCalledWith(
            IPC.QUICK_LINKS.UPDATED,
            expect.any(Function)
        )
        expect(bus.listenerCount(IPC.QUICK_LINKS.UPDATED)).toBe(0)
    })
})
