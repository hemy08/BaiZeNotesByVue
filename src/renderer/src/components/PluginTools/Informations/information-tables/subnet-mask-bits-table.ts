/**
 * CQ-07：Information.ts 数据表拆分（原 Information.ts 第 658-692 行）。
 * 内容与原文件逐字一致；索引文件 Information.ts 统一 re-export。
 */
import type { SubNetMaskBitsInfo } from './types'

export const SubnetMaskBitsTable: SubNetMaskBitsInfo[] = [
    { mask: '255.255.255.255', bit: '32', nums: '1' },
    { mask: '255.255.255.254', bit: '31', nums: '2' },
    { mask: '255.255.255.252', bit: '30', nums: '4' },
    { mask: '255.255.255.248', bit: '29', nums: '8' },
    { mask: '255.255.255.240', bit: '28', nums: '16' },
    { mask: '255.255.255.224', bit: '27', nums: '32' },
    { mask: '255.255.255.192', bit: '26', nums: '64' },
    { mask: '255.255.255.128', bit: '25', nums: '128' },
    { mask: '255.255.255.0', bit: '24', nums: '256' },
    { mask: '255.255.254.0', bit: '23', nums: '512' },
    { mask: '255.255.252.0', bit: '22', nums: '1024' },
    { mask: '255.255.248.0', bit: '21', nums: '2048' },
    { mask: '255.255.240.0', bit: '20', nums: '4096' },
    { mask: '255.255.224.0', bit: '19', nums: '8192' },
    { mask: '255.255.192.0', bit: '18', nums: '16384' },
    { mask: '255.255.128.0', bit: '17', nums: '32768' },
    { mask: '255.255.0.0', bit: '16', nums: '65536' },
    { mask: '255.254.0.0', bit: '15', nums: '131072' },
    { mask: '255.252.0.0', bit: '14', nums: '262144' },
    { mask: '255.248.0.0', bit: '13', nums: '524288' },
    { mask: '255.240.0.0', bit: '12', nums: '1048576' },
    { mask: '255.224.0.0', bit: '11', nums: '2097152' },
    { mask: '255.192.0.0', bit: '10', nums: '4194304' },
    { mask: '255.128.0.0', bit: '9', nums: '8388608' },
    { mask: '255.0.0.0', bit: '8', nums: '16777216' },
    { mask: '254.0.0.0', bit: '7', nums: '33554432' },
    { mask: '252.0.0.0', bit: '6', nums: '67108864' },
    { mask: '248.0.0.0', bit: '5', nums: '134217728' },
    { mask: '240.0.0.0', bit: '4', nums: '268435456' },
    { mask: '224.0.0.0', bit: '3', nums: '536870912' },
    { mask: '192.0.0.0', bit: '2', nums: '1073741824' },
    { mask: '128.0.0.0', bit: '1', nums: '2147483648' },
    { mask: '0.0.0.0', bit: '0', nums: '4294967296' }
]
