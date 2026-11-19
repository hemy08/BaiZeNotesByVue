// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount, VueWrapper } from '@vue/test-utils'
import type { DOMWrapper } from '@vue/test-utils'

import Ipv4SubnetCalc from '@renderer/components/PluginTools/NetWork/Ipv4SubnetCalc.vue'

// 第 4 批 4.5（M6）：原「NetWork 占位工具组件」用例（Ipv4AddrConvert / Ipv6UlaGenerator /
// MacAddrGenerator / MacAddrLookup）已随 4 个无菜单入口、无注册、仅跳外链的占位页一起删除
// （目录收缩为「已注册且有入口」的 Ipv4SubnetCalc / RegexTester；删除清单见
// out/tool-results/opt-batch4-theme.md）。

/** 在模板中按 label 文本定位一行（div-style-display-row）：find 返回 DOMWrapper 而非 VueWrapper */
function findRow(wrapper: VueWrapper, label: string): DOMWrapper<Element> {
    const row = wrapper
        .findAll('.div-style-display-row')
        .find((r) => r.find('.subnet-label').text().trim() === label)
    expect(row, `row with label "${label}"`).toBeTruthy()
    return row!
}

/** 读取一行中所有 input 的 value（字符串数组） */
function rowValues(wrapper: VueWrapper, label: string): string[] {
    return findRow(wrapper, label)
        .findAll('input')
        .map((input) => (input.element as HTMLInputElement).value)
}

describe('Ipv4SubnetCalc', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    function mountCalc() {
        return mount(Ipv4SubnetCalc, { props: { workAreaWidth: '1000px' } })
    }

    /** 三个“设置：”行分别是：网络掩码→掩码位、掩码位→掩码、IP数量→掩码 */
    function setupRows(wrapper: VueWrapper): DOMWrapper<Element>[] {
        return wrapper
            .findAll('.div-style-display-row')
            .filter((r) => r.find('.subnet-label').text().trim() === '设置：')
    }

    it('computes network, mask, first, last and broadcast addresses for 192.168.16.0/24', async () => {
        const wrapper = mountCalc()
        const row = findRow(wrapper, 'IP/掩码位:')
        await row.findAll('button')[0].trigger('click') // 计算

        // 注意：GetHostNumber 的实现为 2^bit-1-2，/24 得到 253（疑似 off-by-one，见报告）
        expect(rowValues(wrapper, '可用地址：')).toEqual(['253'])
        expect(rowValues(wrapper, '网络掩码：')).toEqual(['255', '255', '255', '0'])
        expect(rowValues(wrapper, '网络地址：')).toEqual(['192', '168', '16', '0'])
        expect(rowValues(wrapper, '第一个可用：')).toEqual(['192', '168', '16', '1'])
        expect(rowValues(wrapper, '最后可用：')).toEqual(['192', '168', '16', '254'])
        expect(rowValues(wrapper, '广播：')).toEqual(['192', '168', '16', '255'])
    })

    it('alerts when the IP address is invalid', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mountCalc()
        const row = findRow(wrapper, 'IP/掩码位:')
        const inputs = row.findAll('input')
        await inputs[0].setValue('999')
        await row.findAll('button')[0].trigger('click')

        expect(alertSpy).toHaveBeenCalledWith('输入IP地址无效')
        // 输出未被更新，保持初始 0
        expect(rowValues(wrapper, '网络地址：')).toEqual(['0', '0', '0', '0'])
    })

    it('converts a dotted-decimal mask to its bit count', async () => {
        const wrapper = mountCalc()
        const maskRow = setupRows(wrapper)[0]
        // 默认掩码 255.255.255.0 → /24
        await maskRow.findAll('button')[0].trigger('click')
        const resultInput = maskRow.findAll('input')[4]
        expect((resultInput.element as HTMLInputElement).value).toBe('24')
    })

    it('reports 无效 when the mask is not a valid prefix', async () => {
        const wrapper = mountCalc()
        const maskRow = setupRows(wrapper)[0]
        const inputs = maskRow.findAll('input')
        await inputs[0].setValue('255')
        await inputs[1].setValue('0')
        await inputs[2].setValue('255')
        await inputs[3].setValue('0')
        await maskRow.findAll('button')[0].trigger('click')
        expect((inputs[4].element as HTMLInputElement).value).toBe('无效')
    })

    it('computes decimal and hex masks from mask bits', async () => {
        const wrapper = mountCalc()
        const bitRow = setupRows(wrapper)[1]
        // 默认输入 24
        await bitRow.findAll('button')[0].trigger('click')

        expect(rowValues(wrapper, 'Dec 十进制：')[0]).toBe('255')
        const decRows = wrapper
            .findAll('.div-style-display-row')
            .filter((r) => r.find('.subnet-label').text().trim() === 'Dec 十进制：')
        expect(
            decRows[0].findAll('input').map((i) => (i.element as HTMLInputElement).value)
        ).toEqual(['255', '255', '255', '0'])
        const hexRows = wrapper
            .findAll('.div-style-display-row')
            .filter((r) => r.find('.subnet-label').text().trim() === 'Hex 十六进制：')
        // BinaryToIPString 的 16 进制输出不做 2 位补零，所以最后一组是 '0' 而不是 '00'
        expect(
            hexRows[0].findAll('input').map((i) => (i.element as HTMLInputElement).value)
        ).toEqual(['ff', 'ff', 'ff', '0'])

        const validRows = wrapper
            .findAll('.div-style-display-row')
            .filter((r) => r.find('.subnet-label').text().trim() === '可用地址数：')
        const totalRows = wrapper
            .findAll('.div-style-display-row')
            .filter((r) => r.find('.subnet-label').text().trim() === '地址总数量：')
        // GetHostNumber(24) = 253（代码行为），总数量 = 253 + 2 = 255
        expect((validRows[0].find('input').element as HTMLInputElement).value).toBe('253')
        expect((totalRows[0].find('input').element as HTMLInputElement).value).toBe('255')
    })

    it('computes the mask from a required IP count', async () => {
        const wrapper = mountCalc()
        const numberRow = setupRows(wrapper)[2]
        // 默认 255 个 IP → 最小 2 的幂为 256 → /24
        await numberRow.findAll('button')[0].trigger('click')

        expect(rowValues(wrapper, '掩码位数：')).toEqual(['24'])
        const decRows = wrapper
            .findAll('.div-style-display-row')
            .filter((r) => r.find('.subnet-label').text().trim() === 'Dec 十进制：')
        expect(
            decRows[1].findAll('input').map((i) => (i.element as HTMLInputElement).value)
        ).toEqual(['255', '255', '255', '0'])
        const validRows = wrapper
            .findAll('.div-style-display-row')
            .filter((r) => r.find('.subnet-label').text().trim() === '可用地址数：')
        expect((validRows[1].find('input').element as HTMLInputElement).value).toBe('253')
    })

    it('resets subnet outputs to zero when clicking the reset button', async () => {
        const wrapper = mountCalc()
        const row = findRow(wrapper, 'IP/掩码位:')
        await row.findAll('button')[0].trigger('click') // 计算
        expect(rowValues(wrapper, '网络地址：')).toEqual(['192', '168', '16', '0'])

        await row.findAll('button')[1].trigger('click') // 重置
        expect(rowValues(wrapper, '可用地址：')).toEqual(['0'])
        expect(rowValues(wrapper, '网络掩码：')).toEqual(['0', '0', '0', '0'])
        expect(rowValues(wrapper, '广播：')).toEqual(['0', '0', '0', '0'])
    })

    it('opens the two reference links via window.open', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mountCalc()
        const links = wrapper.findAll('a.plugin-tools-openurl')
        expect(links).toHaveLength(2)
        await links[0].trigger('click')
        await links[1].trigger('click')
        expect(openSpy).toHaveBeenCalledWith(
            'https://tools.w3cschool.cn/ipv4-subnet-labelulator',
            '_blank',
            'noopener, noreferrer'
        )
        expect(openSpy).toHaveBeenCalledWith(
            'https://ipv4calc.bmcx.com/',
            '_blank',
            'noopener, noreferrer'
        )
    })
})
