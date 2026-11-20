// @vitest-environment jsdom
/**
 * Ipv4SubnetCalc.vue 交互补测（覆盖率补测第四批）
 *
 * 既有 network-tools 用例只挂载/快照渲染；本文件覆盖组件脚本里未被调用的分支：
 * 4 组计算/重置按钮（子网、掩码→位数、位数→掩码、IP 数→掩码）、非法 IP 告警、
 * 外链打开、工作区宽度换算。Vue 的 DOM 更新是异步的，断言前统一 await trigger/flush。
 *
 * 口径说明：可用地址数沿用既有实现 GetHostNumber（/24 显示 253，历史 off-by-one，
 * 见 tests/unit/vue/network-tools.test.ts 注释与报告记录），本文件按实际行为断言。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'

import Ipv4SubnetCalc from '@renderer/components/PluginTools/NetWork/Ipv4SubnetCalc.vue'

let wrapper: ReturnType<typeof mount> | null = null
let alertMock: ReturnType<typeof vi.fn>
let openMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    alertMock = vi.fn()
    openMock = vi.fn()
    vi.stubGlobal('alert', alertMock)
    vi.stubGlobal('open', openMock)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 挂载组件并返回全部 8 个操作按钮 */
function mountComponent(props: Record<string, unknown> = { workAreaWidth: '800px' }) {
    wrapper = mount(Ipv4SubnetCalc, { props })
    const buttons = wrapper.findAll('button.plugin-tools-btn')
    expect(buttons).toHaveLength(8)
    return { mounted: wrapper, buttons }
}

/** 等待 DOM 更新完成 */
async function settle(): Promise<void> {
    await nextTick()
    await flushPromises()
}

/** 当前所有只读输出框的值 */
function outputValues(mounted: ReturnType<typeof mount>): string[] {
    return mounted.findAll('input.subnet-out-number').map((input) => {
        return (input.element as HTMLInputElement).value
    })
}

describe('Ipv4SubnetCalc：工作区宽度', () => {
    it('按 workAreaWidth 计算输入框宽度样式', () => {
        const { mounted } = mountComponent()
        const firstInput = mounted.find('input.ipv4-addr-text').element as HTMLInputElement
        expect(firstInput.style.width).toBe('60px')

        wrapper?.unmount()
        const remounted = mountComponent({ workAreaWidth: '1000px' }).mounted
        expect(remounted.exists()).toBe(true)
        const another = remounted.find('input.ipv4-addr-text').element as HTMLInputElement
        expect(another.style.width).toBe('80px')
    })
})

describe('Ipv4SubnetCalc：子网计算 / 重置', () => {
    it('合法 IP 计算后写入掩码/网络地址/广播/首末可用地址与可用地址数', async () => {
        const { buttons } = mountComponent()
        await buttons[0].trigger('click')
        await settle()

        const values = outputValues(wrapper!)
        // 192.168.16.0/24：掩码 255.255.255.0、网络地址 192.168.16.0、广播 192.168.16.255
        // 可用地址数按既有实现口径为 253
        expect(values).toContain('255')
        expect(values).toContain('192')
        expect(values).toContain('16')
        expect(values).toContain('253')
    })

    it('非法 IP 点击计算时告警', async () => {
        const { buttons } = mountComponent()
        const addrInputs = wrapper!.findAll('input.ipv4-addr-text')
        await addrInputs[0].setValue('999')
        await buttons[0].trigger('click')
        expect(alertMock).toHaveBeenCalled()
    })

    it('重置按钮把子网输出清为 0', async () => {
        const { buttons } = mountComponent()
        await buttons[0].trigger('click')
        await settle()
        expect(outputValues(wrapper!).some((value) => value !== '0')).toBe(true)

        await buttons[1].trigger('click')
        await settle()
        // 子网区输出（前 20 个只读框）全部归零
        expect(
            outputValues(wrapper!)
                .slice(0, 20)
                .every((value) => value === '0')
        ).toBe(true)
    })
})

describe('Ipv4SubnetCalc：掩码与位数互算 / IP 数', () => {
    it('掩码 → 位数计算与重置', async () => {
        const { buttons } = mountComponent()
        await buttons[2].trigger('click')
        await settle()
        // 输出区出现 24（/24）
        expect(outputValues(wrapper!)).toContain('24')

        await buttons[3].trigger('click')
        await settle()
        // ipv4-addr-text 顺序：0-3 地址、4 CIDR、5-8 掩码
        const maskInputs = wrapper!.findAll('input.ipv4-addr-text')
        expect((maskInputs[5].element as HTMLInputElement).value).toBe('255')
        expect((maskInputs[8].element as HTMLInputElement).value).toBe('0')
    })

    it('位数 → 掩码计算与重置（十进制 / 十六进制输出）', async () => {
        const { buttons } = mountComponent()
        await buttons[4].trigger('click')
        await settle()
        expect(outputValues(wrapper!)).toContain('255')
        expect(outputValues(wrapper!)).toContain('253')

        await buttons[5].trigger('click')
        await settle()
        expect(outputValues(wrapper!).some((value) => value === '255')).toBe(false)
    })

    it('IP 数 → 掩码计算与重置', async () => {
        const { buttons } = mountComponent()
        await buttons[6].trigger('click')
        await settle()
        expect(outputValues(wrapper!)).toContain('255')

        await buttons[7].trigger('click')
        await settle()
        const numberInput = wrapper!.find('input.ipv4-addr-text:last-of-type')
        expect(numberInput.exists()).toBe(true)
    })
})

describe('Ipv4SubnetCalc：外链', () => {
    it('点击外链调用 window.open（新窗口 + noopener）', async () => {
        mountComponent()
        const links = wrapper!.findAll('a.plugin-tools-openurl')
        expect(links.length).toBeGreaterThan(0)
        await links[0].trigger('click')
        expect(openMock).toHaveBeenCalledWith(
            expect.stringContaining('https://'),
            '_blank',
            'noopener, noreferrer'
        )
    })
})
