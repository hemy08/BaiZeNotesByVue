// 计算地址是否有效
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function isValidIPV4(ip: number[]): boolean {
  if (ip.length !== 4) {
    return false // IP地址应该有4个八位字节
  }
  for (let i = 0; i < 4; i++) {
    if (ip[i] < 0 || ip[i] > 255) {
      return false // 任何一个八位字节不在0-255范围内都无效
    }
  }
  return true // 所有八位字节都在0-255范围内，IP地址有效
}

export function IpToBinary(ip: string, radix: number = 10): string {
  return ip
    .split('.')
    .map((part) => padStart(parseInt(part, radix).toString(2), 8, '0'))
    .join('')
}

export function BinaryToIPArr(binary: string): number[] {
  const segments: number[] = []
  for (let i = 0; i < binary.length; i += 8) {
    const substr = binary.substring(i, i + 8)
    const segNum = parseInt(substr, 2)
    segments.push(segNum)
  }
  return segments
}

export function BinaryToIPString(binary: string, radix: number = 10): string {
  const segments = BinaryToIPArr(binary)
  return segments.map((seg) => seg.toString(radix)).join('.')
}

export function GetHostNumber(maskLen: number): number {
  const hostAddrBits = 32 - maskLen
  const hostNum1 = 2 ** hostAddrBits - 1
  // 可用地址中，去掉网络地址和广播地址
  return hostNum1 - 2
}

export function GetBitsWithMask(ip: string, radix: number = 10): string {
  const ipBinary = ip
    .split('.')
    .map((part) => padStart(parseInt(part, radix).toString(2), 8, '0'))
    .join('')
  let count = 0

  for (const char of ipBinary) {
    if (char === '1') {
      count++
    } else {
      // 遇到0时跳出循环
      break
    }
  }

  const maxCount = ipBinary.replace(/0/g, '').length
  if (count === maxCount) {
    return count.toString()
  }

  return '无效'
}

export function GetMaskWithBits(maskBits: number, radix: number = 10): string {
  if (maskBits < 0 || maskBits > 32) {
    return '255.255.255.255'
  }
  // 取前cidr位的二进制，后面的全为0
  const networkMask = '1'.repeat(maskBits) + '0'.repeat(32 - maskBits)
  return BinaryToIPString(networkMask, radix)
}

export function GetMaskByIpNumber(numAddresses: number): number {
  // 由于子网大小是2的幂次方，我们找到大于或等于numAddresses的最小2的幂
  let subnetSize = 1
  while (subnetSize < numAddresses) {
    subnetSize *= 2
  }

  return 32 - Math.floor(Math.log2(subnetSize))
}

// 辅助函数：字符串填充
function padStart(str: string, targetLength: number, padString: string = '0'): string {
  return str.length < targetLength ? padStart(padString + str, targetLength, padString) : str
}

export class IPV4 {
  ipv4Addr: string
  ipv4AddrBinary: string
  cidr: string
  maskLen: number
  netmask: string
  networkMask: string
  networkAddr: string
  broadcastAddr: string
  firstAddress: string
  lastAddress: string
  wildcardMask: string
  hostNumber: number

  constructor(ipv4: string, cidr: string) {
    this.ipv4Addr = ipv4
    this.cidr = cidr
    this.netmask = ipv4 + '/' + cidr
    this.maskLen = parseInt(this.cidr, 10)
    this.ipv4AddrBinary = IpToBinary(this.ipv4Addr, 10)
    this.wildcardMask = this.WildcardMask()
    this.networkAddr = this.NetWorkAddr()
    this.networkMask = this.NetWorkMask()
    this.hostNumber = GetHostNumber(this.maskLen)
    this.broadcastAddr = this.getBroadcastAddr()
    this.firstAddress = this.FirstAddress()
    this.lastAddress = this.LastAddress()
  }

  // 将 IP 地址转换为数字（考虑每个部分都是 8 位）
  private ipToInt(ip: string): number {
    return ip
      .split('.')
      .map(Number)
      .reduce((acc, curr, idx) => {
        return acc + curr * Math.pow(256, 3 - idx)
      }, 0)
  }

  // 将数字转换回 IP 地址
  private intToIp(num: number): string {
    return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff]
      .map((byte) => byte.toString(10))
      .join('.')
  }

  NetWorkAddr(maskLen: number = this.maskLen): string {
    if (maskLen < 0 || maskLen > 32) {
      return '255.255.255.255'
    }

    // 取前cidr位的二进制，后面的全为0
    const networkMask = this.ipv4AddrBinary.substring(0, maskLen) + '0'.repeat(32 - maskLen)
    return BinaryToIPString(networkMask, 10)
  }

  NetWorkMask(maskLen: number = this.maskLen): string {
    if (maskLen < 0 || maskLen > 32) {
      return '255.255.255.255'
    }
    // 取前cidr位的二进制，后面的全为0
    const networkMask = '1'.repeat(maskLen) + '0'.repeat(32 - maskLen)
    return BinaryToIPString(networkMask, 10)
  }

  // 辅助函数：CIDR转WildcardMask
  WildcardMask(cidr: string = this.cidr, radix: number = 10): string {
    const mask = Math.pow(2, 32 - parseInt(cidr, 10)) - 1
    let result = ''
    for (let i = 0; i < 4; i++) {
      const segment = (mask >> (i * 8)) & 0xff
      result = segment.toString(radix).padStart(2, '0') + '.' + result
    }
    return result.slice(0, -1)
  }

  getBroadcastAddr(): string {
    // 将IP地址和子网掩码转换为二进制字符串
    const ipBinary = this.ipv4AddrBinary
    const maskBinary = IpToBinary(this.wildcardMask, 10)
    // 计算广播地址的二进制表示
    const mask1 = maskBinary.replace(/0/g, '')
    const broadcastBinary =
      ipBinary.substring(0, ipBinary.length - mask1.length) + '1'.repeat(mask1.length)

    // 将二进制广播地址转换回点分十进制格式
    return BinaryToIPString(broadcastBinary, 10)
  }

  FirstAddress(): string {
    // 转成二进制字符串
    // 计算首地址二进制表示，取基础的前cidr位，后面的全为0，最后一位位1
    const firstUsable =
      this.ipv4AddrBinary.substring(0, this.maskLen) + '0'.repeat(32 - this.maskLen - 1) + '1'
    return BinaryToIPString(firstUsable, 10)
  }

  LastAddress(): string {
    const broadcast = this.ipToInt(this.broadcastAddr)
    const lastUsable = broadcast - 1 // 最后一个可用地址

    return this.intToIp(lastUsable)
  }
}
