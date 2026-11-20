// @vitest-environment jsdom
/**
 * plugin-tools-const.ts 异步工具加载占位补测。
 *
 * 背景：插件工具注册表把 38 个工具组件改为 `defineAsyncComponent`（每工具独立 chunk），
 * 首次打开时显示「加载中…」占位（ToolLoading）。既有测试只校验注册表与 manifest 一致性，
 * 未渲染过占位组件；本文件把首个工具的模块加载挂起，验证：
 * 1. 加载延迟（120ms）内不渲染内容，延迟后渲染 `.plugin-tool-async-loading` 占位与文案；
 * 2. 注册表键与 manifest 声明的组件模块一一对应（懒加载表覆盖全部工具）。
 *
 * 说明：只把注册表首项 `Encryption/TokenGenerator.vue` mock 为永不落定的模块（不请求
 * 真实 chunk，也不污染其它用例）；其它工具的模块不会因本用例被加载。
 */
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock(
    '@renderer/components/PluginTools/Encryption/TokenGenerator.vue',
    () => new Promise(() => {})
)

import {
    pluginTools,
    pluginToolModuleKeys
} from '@renderer/components/PluginTools/plugin-tools-const'
import { PLUGIN_TOOL_ITEMS } from '../../../src/shared/constants/plugin-tools-manifest'

afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
})

describe('plugin-tools-const 异步加载占位', () => {
    it('工具模块加载中显示「加载中」占位（loadingComponent）', async () => {
        vi.useFakeTimers()
        const tool = pluginTools[0]
        expect(tool.component).toBeDefined()

        // 异步组件加载前根节点为空，直接对真实 DOM 断言（避免 VTU 空根节点报错）
        mount(tool.component, { attachTo: document.body })
        await flushPromises()
        // 加载延迟 120ms 内：尚无占位（避免闪屏）
        expect(document.body.querySelector('.plugin-tool-async-loading')).toBeNull()

        await vi.advanceTimersByTimeAsync(130)
        await flushPromises()

        const loading = document.body.querySelector('.plugin-tool-async-loading')
        expect(loading).not.toBeNull()
        expect(loading!.textContent).toContain('加载中')

        // 模块加载被挂起，异步组件无法完成挂载，故不做 wrapper.unmount（根节点为空）
        document.body.innerHTML = ''
    })

    it('懒加载表覆盖 manifest 声明的全部工具组件', () => {
        const manifestComponents = PLUGIN_TOOL_ITEMS.map((item) => item.component).sort()
        expect([...pluginToolModuleKeys].sort()).toEqual(manifestComponents)
        // 注册表条目数与 manifest 一致，且每项都映射到异步组件
        expect(pluginTools).toHaveLength(PLUGIN_TOOL_ITEMS.length)
        expect(pluginTools.length).toBeGreaterThan(0)
        for (const tool of pluginTools) {
            expect(tool.id.startsWith('baize:menu:plugins:')).toBe(true)
            expect(tool.component).toBeDefined()
        }
    })
})
