// @vitest-environment jsdom
/**
 * NaviTab 分支覆盖补测（`src/renderer/src/components/WorkSpaceArea/**` branches 门禁 95%）：
 * 1. loadQuickLinks 防御：主进程 invoke(GET) 返回非数组时忽略载荷、保持空列表（不崩溃）；
 * 2. 大纲按钮二次点击收起：currentNaviTal === 'markdown-toc' 时上抛 switch-open-close。
 *
 * 说明：仅补测分支，不改业务源码；快速链接正常加载/过滤/点击/安全消毒等行为由
 * `tests/unit/quick-link-sync.test.ts`、`tests/unit/vue2/renderer-xss-hardening.test.ts`
 * 与 `tests/unit/vue2/workspace-components.test.ts` 覆盖。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import NaviTab from '@renderer/components/WorkSpaceArea/NaviTab.vue'

let wrapper: VueWrapper | null = null
let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
    invoke = vi.fn().mockResolvedValue([])
    vi.stubGlobal('electron', {
        ipcRenderer: {
            invoke,
            send: vi.fn(),
            on: vi.fn(),
            removeListener: vi.fn()
        }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

describe('NaviTab 分支补测：快速链接加载防御', () => {
    it('invoke(GET) 返回非数组时忽略并保持空列表', async () => {
        // 主进程返回非法载荷（null / 对象等）：loadQuickLinks 的 !Array.isArray 分支直接 return
        invoke.mockResolvedValueOnce(null)
        wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        // 三个内置按钮仍在，且不渲染任何快速链接项（空列表而非异常）
        expect(wrapper.findAll('button[data-index]')).toHaveLength(3)
        expect(wrapper.findAll('.navi-tab-item:not([data-index])')).toHaveLength(0)
    })
})

describe('NaviTab 分支补测：大纲按钮二次点击收起', () => {
    it('再次点击大纲按钮时上抛 switch-open-close（currentNaviTal === markdown-toc）', async () => {
        wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()

        // 第一次点击：file-explorer → markdown-toc（else 分支）
        await wrapper.find('button[data-index="1"]').trigger('click')
        expect(wrapper.emitted('update:navi:tab')![0]).toEqual(['markdown-toc'])

        // 第二次点击：已是 markdown-toc → 收起（if 分支）
        await wrapper.find('button[data-index="1"]').trigger('click')
        expect(wrapper.emitted('update:navi:tab')![1]).toEqual(['switch-open-close'])
        // 仅两次上抛，无额外副作用
        expect(wrapper.emitted('update:navi:tab')).toHaveLength(2)
    })
})
