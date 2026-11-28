// @vitest-environment jsdom
/**
 * 1.5.7 构建预算修复：WorkSpace 异步组件（迁移弹窗 / 批量编译宿主）加载契约。
 *
 * 背景：`WorkSpace.vue` 把 `MigrationWizardDialog` 与 `BatchCompileHost` 改为
 * `defineAsyncComponent`（其依赖约 100 KiB 不再进入主界面壳 chunk）。异步化后必须保证：
 * 1. 迁移弹窗 chunk 加载失败时**不静默**：记录日志 + 渲染「加载失败，请重试」占位
 *    （errorComponent 复用既有异步占位，onError 显式 fail() 才可落到错误态）；
 * 2. 批量编译宿主 chunk 加载失败时：记录日志，但**不渲染任何可见占位**（宿主本身零 UI，
 *    不能在主界面留下「加载失败」文本）；
 * 3. 加载中占位（AsyncSilentPlaceholder）与失败态都不产生可见 DOM。
 *
 * 本文件用「mock 工厂抛错」模拟本地 chunk 加载失败（loader 的 `import()` 拒绝 → 走
 * defineAsyncComponent 的 onError 分支），其余子组件按 props/事件契约最小 mock
 * （与 workspace-shell 测试同口径）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

// ============ 子组件最小 mock（避免加载真实 Monaco / 资源管理器依赖） ============
vi.mock('@renderer/components/WorkSpaceArea/NaviTab.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'NaviTabStub',
            props: { position: { type: String, required: true } },
            setup(props) {
                return () => h('div', { class: `navi-stub navi-stub-${props.position}` })
            }
        })
    }
})

vi.mock('@renderer/components/ResourceManager/ResourceManager.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 同上
        default: defineComponent({
            name: 'ResManagerStub',
            props: { naviShow: { type: String, default: '' } },
            setup() {
                return () => h('div', { class: 'res-manager-stub' })
            }
        })
    }
})

vi.mock('@renderer/components/Markdown/MarkdownContainer.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 同上
        default: defineComponent({
            name: 'MdContainerStub',
            props: { mdContainerWidth: { type: String, default: '' } },
            setup() {
                return () => h('div', { class: 'md-container-stub' })
            }
        })
    }
})

vi.mock('@renderer/components/PluginTools/PluginTools.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 同上
        default: defineComponent({
            name: 'PluginToolsStub',
            props: { pluginsAreaWidth: { type: String, default: '' } },
            emits: ['window-state-change'],
            setup() {
                return () => h('div', { class: 'plugin-tools-stub' })
            }
        })
    }
})

vi.mock('@renderer/components/HemyTools/HemyTools.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 同上
        default: defineComponent({
            name: 'HemyToolsStub',
            props: { toolsAreaWidth: { type: String, default: '' } },
            setup() {
                return () => h('div', { class: 'hemy-tools-stub' })
            }
        })
    }
})

// ============ 模拟两个异步 chunk 加载失败（mock 工厂抛错 = loader 的 import() reject） ============
// 说明：异步组件 loader 的 Promise 拒绝才会走 defineAsyncComponent 的 onError 分支
// （模块 default 抛错发生在后续 .then 解包阶段，不会进入 onError；同步 throw 则会被 Vue
// 直接记为「loader 执行异常」）。因此用 async 工厂异步拒绝，模拟真实 chunk import 失败。
vi.mock('@renderer/components/dialogs/simple/MigrationWizardDialog.vue', async () => {
    await Promise.resolve()
    throw new Error('模拟迁移弹窗 chunk 加载失败')
})

vi.mock('@renderer/components/llm-wiki/BatchCompileHost.vue', async () => {
    await Promise.resolve()
    throw new Error('模拟批量编译宿主 chunk 加载失败')
})

// ============ 日志 mock（断言失败不静默） ============
vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import WorkSpace from '@renderer/components/WorkSpaceArea/WorkSpace.vue'
import { logger } from '@renderer/common/logger'
import { workspaceModeSwitchState } from '@renderer/composables/useWorkspaceModeSwitch'

let wrapper: VueWrapper | null = null

beforeEach(() => {
    workspaceModeSwitchState.visible = false
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined),
            removeListener: vi.fn()
        }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    workspaceModeSwitchState.visible = false
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

/** 挂载工作区并等待异步组件 loader 结算（成功 / 失败都落到稳定态） */
async function mountWorkspace(): Promise<VueWrapper> {
    const mounted = mount(WorkSpace, { attachTo: document.body })
    await flushPromises()
    await flushPromises()
    return mounted
}

describe('WorkSpace 异步组件：chunk 加载失败兜底', () => {
    it('批量编译宿主加载失败：记录日志且不渲染可见占位（宿主零 UI）', async () => {
        wrapper = await mountWorkspace()

        expect(logger.error).toHaveBeenCalledWith('批量编译宿主组件加载失败:', expect.any(Error))
        // 宿主无可见 UI：失败不产生占位文本，避免主界面出现突兀的「加载失败」
        expect(wrapper.text()).not.toContain('加载失败')
    })

    it('迁移弹窗加载失败：记录日志并渲染可重试错误占位（不静默）', async () => {
        wrapper = await mountWorkspace()

        workspaceModeSwitchState.visible = true
        await flushPromises()
        await flushPromises()

        expect(logger.error).toHaveBeenCalledWith('迁移弹窗组件加载失败:', expect.any(Error))
        expect(wrapper.text()).toContain('加载失败，请重试')
    })
})
