import { describe, it, expect } from 'vitest'
import {
    isValidIPV4,
    IpToBinary,
    BinaryToIPArr,
    BinaryToIPString,
    GetHostNumber,
    GetBitsWithMask,
    GetMaskWithBits,
    GetMaskByIpNumber,
    IPV4
} from '../../src/renderer/src/components/PluginTools/NetWork/NetWork'

describe('NetWork', () => {
    describe('isValidIPV4', () => {
        it('should accept a valid IPv4 octet array', () => {
            expect(isValidIPV4([192, 168, 1, 1])).toBe(true)
            expect(isValidIPV4([0, 0, 0, 0])).toBe(true)
            expect(isValidIPV4([255, 255, 255, 255])).toBe(true)
        })

        it('should reject arrays whose length is not 4', () => {
            expect(isValidIPV4([])).toBe(false)
            expect(isValidIPV4([1, 2, 3])).toBe(false)
            expect(isValidIPV4([1, 2, 3, 4, 5])).toBe(false)
        })

        it('should reject octets out of the 0-255 range', () => {
            expect(isValidIPV4([256, 0, 0, 0])).toBe(false)
            expect(isValidIPV4([-1, 0, 0, 0])).toBe(false)
            expect(isValidIPV4([192, 168, 1, 256])).toBe(false)
        })
    })

    describe('IpToBinary', () => {
        it('should convert a dotted decimal IP to a 32-bit binary string', () => {
            expect(IpToBinary('192.168.1.1')).toBe('11000000101010000000000100000001')
            expect(IpToBinary('255.255.255.0')).toBe('11111111111111111111111100000000')
            expect(IpToBinary('0.0.0.0')).toBe('00000000000000000000000000000000')
        })

        it('should support other radix inputs', () => {
            // 16 进制输入：C0.A8.01.01 = 192.168.1.1
            expect(IpToBinary('C0.A8.01.01', 16)).toBe('11000000101010000000000100000001')
        })
    })

    describe('BinaryToIPArr', () => {
        it('should split a binary string into 4 octets', () => {
            expect(BinaryToIPArr('11000000101010000000000100000001')).toEqual([192, 168, 1, 1])
            expect(BinaryToIPArr('11111111111111111111111100000000')).toEqual([255, 255, 255, 0])
        })
    })

    describe('BinaryToIPString', () => {
        it('should convert binary back to dotted decimal', () => {
            expect(BinaryToIPString('11000000101010000000000100000001')).toBe('192.168.1.1')
        })

        it('should support hex output', () => {
            expect(BinaryToIPString('11000000101010000000000100000001', 16)).toBe('c0.a8.1.1')
        })
    })

    describe('GetHostNumber', () => {
        // 注意：实现为 2^(32-maskLen) - 1 - 2，比常规的 2^n - 2 少 1
        it('should compute host count for /24', () => {
            expect(GetHostNumber(24)).toBe(253)
        })

        it('should compute host count for /30', () => {
            expect(GetHostNumber(30)).toBe(1)
        })

        it('should compute host count for /16', () => {
            expect(GetHostNumber(16)).toBe(65533)
        })
    })

    describe('GetBitsWithMask', () => {
        it('should count leading 1 bits of a valid mask', () => {
            expect(GetBitsWithMask('255.255.255.0')).toBe('24')
            expect(GetBitsWithMask('255.0.0.0')).toBe('8')
            expect(GetBitsWithMask('255.255.255.255')).toBe('32')
        })

        it('should return invalid for a non-contiguous mask', () => {
            expect(GetBitsWithMask('255.0.255.0')).toBe('无效')
        })
    })

    describe('GetMaskWithBits', () => {
        it('should build a subnet mask from a bit count', () => {
            expect(GetMaskWithBits(24)).toBe('255.255.255.0')
            expect(GetMaskWithBits(8)).toBe('255.0.0.0')
            expect(GetMaskWithBits(0)).toBe('0.0.0.0')
            expect(GetMaskWithBits(32)).toBe('255.255.255.255')
        })

        it('should fall back to 255.255.255.255 for out-of-range bits', () => {
            expect(GetMaskWithBits(-1)).toBe('255.255.255.255')
            expect(GetMaskWithBits(33)).toBe('255.255.255.255')
        })

        it('should support hex output', () => {
            expect(GetMaskWithBits(24, 16)).toBe('ff.ff.ff.0')
        })
    })

    describe('GetMaskByIpNumber', () => {
        it('should derive the mask length from a host count', () => {
            expect(GetMaskByIpNumber(254)).toBe(24)
            expect(GetMaskByIpNumber(256)).toBe(24)
            expect(GetMaskByIpNumber(300)).toBe(23)
            expect(GetMaskByIpNumber(1)).toBe(32)
            expect(GetMaskByIpNumber(2)).toBe(31)
            expect(GetMaskByIpNumber(1024)).toBe(22)
            expect(GetMaskByIpNumber(65536)).toBe(16)
            expect(GetMaskByIpNumber(65537)).toBe(15)
        })
    })

    describe('IPV4', () => {
        it('should compute all fields for 192.168.1.10/24', () => {
            const ip = new IPV4('192.168.1.10', '24')
            expect(ip.ipv4Addr).toBe('192.168.1.10')
            expect(ip.cidr).toBe('24')
            expect(ip.netmask).toBe('192.168.1.10/24')
            expect(ip.maskLen).toBe(24)
            expect(ip.ipv4AddrBinary).toBe('11000000101010000000000100001010')
            expect(ip.networkAddr).toBe('192.168.1.0')
            expect(ip.networkMask).toBe('255.255.255.0')
            expect(ip.broadcastAddr).toBe('192.168.1.255')
            expect(ip.firstAddress).toBe('192.168.1.1')
            expect(ip.lastAddress).toBe('192.168.1.254')
            expect(ip.hostNumber).toBe(253)
            // 实现会补足两位并带前导 0，属于当前真实行为
            expect(ip.wildcardMask).toBe('00.00.00.255')
        })

        it('should compute class A fields for 10.20.30.40/8', () => {
            const ip = new IPV4('10.20.30.40', '8')
            expect(ip.networkAddr).toBe('10.0.0.0')
            expect(ip.networkMask).toBe('255.0.0.0')
            expect(ip.broadcastAddr).toBe('10.255.255.255')
            expect(ip.firstAddress).toBe('10.0.0.1')
            expect(ip.lastAddress).toBe('10.255.255.254')
            expect(ip.wildcardMask).toBe('00.255.255.255')
        })

        it('should compute class B fields for 172.16.0.0/16', () => {
            const ip = new IPV4('172.16.0.0', '16')
            expect(ip.networkAddr).toBe('172.16.0.0')
            expect(ip.broadcastAddr).toBe('172.16.255.255')
        })

        it('should support an explicit mask length parameter', () => {
            const ip = new IPV4('192.168.1.10', '24')
            expect(ip.NetWorkAddr(16)).toBe('192.168.0.0')
            expect(ip.NetWorkMask(16)).toBe('255.255.0.0')
            expect(ip.NetWorkAddr(-1)).toBe('255.255.255.255')
            expect(ip.NetWorkMask(33)).toBe('255.255.255.255')
        })
    })
})
