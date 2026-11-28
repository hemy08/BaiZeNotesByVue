// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译宿主单测（`components/llm-wiki/BatchCompileHost.vue`）
 *
 * 覆盖：
 * 1. EventBus `LLM_WIKI_COMPILE_REQUEST` 订阅：收到选择后打开对话框（载荷宽容归一化）；
 * 2. 与迁移弹窗的先后：迁移弹窗仍打开时等待其关闭后再打开；新请求覆盖旧等待；
 * 3. 宿主卸载：EventBus 监听清理、等待中的 watcher 取消、迟到事件不再打开对话框；
 * 4. 对话框关闭回调清空共享状态。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import { workspaceModeSwitchState } from '../../../src/renderer/src/composables/useWorkspaceModeSwitch'
import {
    batchCompileDialogState,
    resetBatchCompileDialogStateForTesting
} from '../../../src/renderer/src/components/llm-wiki/batch-compile-dialog-state'

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import BatchCompileHost from '../../../src/renderer/src/components/llm-wiki/BatchCompileHost.vue'

/** 对话框桩：只保留 props/emit 契约，避免宿主测试触发真实队列 IPC 流程 */
const DialogStub = defineComponent({
    name: 'BatchCompileDialog',
    props: {
        request: { type: Object, default: null }
    },
    emits: ['close'],
    template: '<div class="batch-dialog-stub" @click="$emit(\'close\')"></div>'
})

const mountOptions = {
    global: {
        stubs: { BatchCompileDialog: DialogStub, teleport: true }
    }
}

let wrappers: VueWrapper[] = []

function mountHost(): VueWrapper {
    const wrapper = mount(BatchCompileHost, {
        ...mountOptions,
        attachTo: document.body
    }) as VueWrapper
    wrappers.push(wrapper)
    return wrapper
}

beforeEach(() => {
    wrappers = []
    resetBatchCompileDialogStateForTesting()
    workspaceModeSwitchState.visible = false
    workspaceModeSwitchState.busy = false
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    resetBatchCompileDialogStateForTesting()
    workspaceModeSwitchState.visible = false
    document.body.innerHTML = ''
})

describe('BatchCompileHost：EventBus 订阅与打开时序', () => {
    it('迁移弹窗未打开：收到编译请求立即打开对话框（载荷归一化）', async () => {
        const wrapper = mountHost()
        await flushPromises()

        EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, {
            scope: 'batch',
            batchSize: 3
        })
        await nextTick()
        await flushPromises()

        expect(batchCompileDialogState.visible).toBe(true)
        expect(batchCompileDialogState.sequence).toBe(1)
        expect(batchCompileDialogState.request).toMatchObject({ scope: 'batch', batchSize: 3 })
        const dialog = wrapper.findComponent(DialogStub)
        expect(dialog.exists()).toBe(true)
        expect(dialog.props('request')).toMatchObject({ scope: 'batch', batchSize: 3 })
    })

    it('非法载荷 → 全量编译并标记降级（不阻塞打开）', async () => {
        mountHost()
        await flushPromises()
        EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, 'bad-payload')
        await nextTick()
        await flushPromises()
        expect(batchCompileDialogState.visible).toBe(true)
        expect(batchCompileDialogState.request).toMatchObject({
            scope: 'all',
            degraded: true
        })
    })

    it('迁移弹窗仍打开：等其关闭后再打开（避免双模态叠层）', async () => {
        workspaceModeSwitchState.visible = true
        mountHost()
        await flushPromises()

        EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, { scope: 'all' })
        await nextTick()
        await flushPromises()
        expect(batchCompileDialogState.visible).toBe(false)

        workspaceModeSwitchState.visible = false
        await nextTick()
        await flushPromises()
        expect(batchCompileDialogState.visible).toBe(true)
        expect(batchCompileDialogState.request?.scope).toBe('all')
    })

    it('等待期间新请求到达：以最新请求为准（只打开一次）', async () => {
        workspaceModeSwitchState.visible = true
        mountHost()
        await flushPromises()

        EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, { scope: 'all' })
        EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, {
            scope: 'directory',
            directory: 'notes'
        })
        await nextTick()
        await flushPromises()
        expect(batchCompileDialogState.visible).toBe(false)

        workspaceModeSwitchState.visible = false
        await nextTick()
        await flushPromises()
        expect(batchCompileDialogState.visible).toBe(true)
        expect(batchCompileDialogState.sequence).toBe(1)
        expect(batchCompileDialogState.request).toMatchObject({
            scope: 'directory',
            directory: 'notes'
        })
    })

    it('对话框关闭回调：清空显隐与请求', async () => {
        const wrapper = mountHost()
        await flushPromises()
        EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, { scope: 'all' })
        await nextTick()
        await flushPromises()
        expect(wrapper.findComponent(DialogStub).exists()).toBe(true)

        await wrapper.findComponent(DialogStub).trigger('click')
        await flushPromises()
        expect(batchCompileDialogState.visible).toBe(false)
        expect(batchCompileDialogState.request).toBeNull()
        expect(wrapper.findComponent(DialogStub).exists()).toBe(false)
    })

    it('宿主挂载注册监听、卸载清理监听（EventBus 监听数回到基线）', async () => {
        const baseline = EventBus.$stats().totalListeners
        const wrapper = mountHost()
        await flushPromises()
        expect(EventBus.$stats().totalListeners).toBeGreaterThan(baseline)

        wrapper.unmount()
        wrappers = wrappers.filter((item) => item !== wrapper)
        expect(EventBus.$stats().totalListeners).toBe(baseline)
    })

    it('卸载时取消等待中的打开：迟到事件不再打开对话框', async () => {
        workspaceModeSwitchState.visible = true
        const wrapper = mountHost()
        await flushPromises()
        EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, { scope: 'all' })
        await nextTick()
        await flushPromises()

        wrapper.unmount()
        wrappers = wrappers.filter((item) => item !== wrapper)
        workspaceModeSwitchState.visible = false
        await nextTick()
        await flushPromises()
        expect(batchCompileDialogState.visible).toBe(false)
    })
})
