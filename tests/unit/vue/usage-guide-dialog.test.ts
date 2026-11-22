// @vitest-environment jsdom
/**
 * 帮助 → 使用指导：本地 HTML 地址解析、对话框状态、宿主挂载与卸载。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import UsageGuideDialog from '../../../src/renderer/src/components/dialogs/help/usage-guide/UsageGuideDialog.vue'
import {
    disposeUsageGuideHost,
    openUsageGuideDialog,
    USAGE_GUIDE_HOST_ID
} from '../../../src/renderer/src/components/dialogs/help/usage-guide'
import {
    closeUsageGuideDialogState,
    getUsageGuideUrl,
    openUsageGuideDialogState,
    resolveUsageGuideUrl,
    usageGuideDialogState,
    USAGE_GUIDE_FALLBACK_URL
} from '../../../src/renderer/src/components/dialogs/help/usage-guide/usage-guide-state'

afterEach(() => {
    disposeUsageGuideHost()
    closeUsageGuideDialogState()
    document.body.innerHTML = ''
})

describe('resolveUsageGuideUrl', () => {
    it('生产 app:// 入口解析为同源 guide 地址', () => {
        expect(resolveUsageGuideUrl('app://baize/index.html')).toBe('app://baize/usage-guide.html')
    })

    it('开发 http 入口解析为同源 guide 地址', () => {
        expect(resolveUsageGuideUrl('http://localhost:5173/index.html')).toBe(
            'http://localhost:5173/usage-guide.html'
        )
    })

    it('无/非法 location 使用兜底地址', () => {
        expect(resolveUsageGuideUrl(undefined)).toBe(USAGE_GUIDE_FALLBACK_URL)
        expect(resolveUsageGuideUrl('not a url')).toBe(USAGE_GUIDE_FALLBACK_URL)
    })

    it('运行时 getUsageGuideUrl 不抛错且以 usage-guide.html 结尾', () => {
        expect(getUsageGuideUrl()).toMatch(/usage-guide\.html$/)
    })
})

describe('usage guide dialog state/host', () => {
    it('打开/关闭只切显隐', () => {
        openUsageGuideDialogState()
        expect(usageGuideDialogState.visible).toBe(true)
        closeUsageGuideDialogState()
        expect(usageGuideDialogState.visible).toBe(false)
    })

    it('openUsageGuideDialog 挂载宿主并打开；重复打开复用宿主', async () => {
        const first = await openUsageGuideDialog()
        expect(first).toBe(true)
        expect(usageGuideDialogState.visible).toBe(true)
        expect(document.getElementById(USAGE_GUIDE_HOST_ID)).not.toBeNull()
        const host = document.getElementById(USAGE_GUIDE_HOST_ID)
        const second = await openUsageGuideDialog()
        expect(second).toBe(true)
        expect(document.getElementById(USAGE_GUIDE_HOST_ID)).toBe(host)
    })

    it('dispose 清理宿主；之后可重新打开', async () => {
        await openUsageGuideDialog()
        disposeUsageGuideHost()
        expect(document.getElementById(USAGE_GUIDE_HOST_ID)).toBeNull()
        expect(usageGuideDialogState.visible).toBe(false)
        expect(await openUsageGuideDialog()).toBe(true)
    })
})

describe('UsageGuideDialog', () => {
    beforeEach(() => {
        openUsageGuideDialogState()
    })

    it('渲染 iframe，src 指向本地 usage-guide.html，sandbox 仅 same-origin', () => {
        const wrapper = mount(UsageGuideDialog, {
            global: { stubs: { teleport: true } },
            attachTo: document.body
        })
        const iframe = wrapper.find('.usage-guide-frame')
        expect(iframe.exists()).toBe(true)
        expect(iframe.attributes('src')).toMatch(/usage-guide\.html$/)
        expect(iframe.attributes('sandbox')).toBe('allow-same-origin')
        wrapper.unmount()
    })

    it('点击关闭按钮切回隐藏状态', async () => {
        const wrapper = mount(UsageGuideDialog, {
            global: { stubs: { teleport: true } },
            attachTo: document.body
        })
        await wrapper.find('.btn-usage-guide-close').trigger('click')
        expect(usageGuideDialogState.visible).toBe(false)
        wrapper.unmount()
    })
})
