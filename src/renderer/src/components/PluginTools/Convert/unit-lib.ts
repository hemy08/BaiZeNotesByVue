/**
 * 单位换算纯函数库（jyshare 单位换算工具站能力移植）
 *
 * 长度换算：以米为基准的系数表（源自调研报告 out/jyshare-src/5575.html），
 * 并补充任务要求的 pt（点）与 px（CSS 参考像素）两个排版/屏幕单位。
 * 市制单位（丈/尺/寸/分/厘/里）采用调研报告系数（1 里 = 500 米，
 * 1 丈 = 3.3333 米，逐级十进制）；“厘”key 用 li2（lí）、“里”key 用 li3（lǐ）区分。
 *
 * 存储换算：两套制式共用单位 key（B/KB/MB/GB/TB/PB）——
 * - si = false：二进制 1024 制（1 KB = 1024 B，与 IEC 命名 KiB/MiB/GiB/TiB/PiB 同系数）；
 * - si = true：SI 十进制 1000 制（1 KB = 1000 B）。
 * 两套制式可互转：IEC 命名 key 恒按 1024 制，普通 key 由 si 参数决定系数。
 */

/** 长度单位 key 类型 */
export type LengthUnitKey =
    | 'mm'
    | 'cm'
    | 'dm'
    | 'm'
    | 'km'
    | 'um'
    | 'nm'
    | 'pm'
    | 'inch'
    | 'foot'
    | 'yard'
    | 'mile'
    | 'nmi'
    | 'ly'
    | 'au'
    | 'pc'
    | 'pt'
    | 'px'
    | 'zhang'
    | 'chi'
    | 'cun'
    | 'fen'
    | 'li2'
    | 'li3'

/** 长度单位系数表（以米为基准） */
export const LENGTH_FACTORS: Readonly<Record<LengthUnitKey, number>> = {
    // 公制
    mm: 0.001,
    cm: 0.01,
    dm: 0.1,
    m: 1,
    km: 1000,
    um: 1e-6,
    nm: 1e-9,
    pm: 1e-12,
    // 英制
    inch: 0.0254,
    foot: 0.3048,
    yard: 0.9144,
    mile: 1609.344,
    nmi: 1852, // 海里
    // 天文
    ly: 9460730472580800, // 光年
    au: 149597870700, // 天文单位
    // 秒差距（天文常数，超出 float64 精确整数范围，用字符串解析保留原调研系数）
    pc: Number.parseFloat('30856775814913672.789'),
    // 排版/屏幕
    pt: 0.0254 / 72, // 点：1/72 英寸
    px: 0.0254 / 96, // CSS 参考像素：1/96 英寸
    // 市制
    zhang: 3.3333, // 丈
    chi: 0.33333, // 尺
    cun: 0.033333, // 寸
    fen: 0.0033333, // 分
    li2: 0.00033333, // 厘（lí，1/3000 米）
    li3: 500 // 里（lǐ，市里）
}

/** 长度单位显示顺序（下拉选项顺序） */
export const LENGTH_UNIT_ORDER: readonly LengthUnitKey[] = [
    'mm',
    'cm',
    'dm',
    'm',
    'km',
    'um',
    'nm',
    'pm',
    'inch',
    'foot',
    'yard',
    'mile',
    'nmi',
    'ly',
    'au',
    'pc',
    'pt',
    'px',
    'zhang',
    'chi',
    'cun',
    'fen',
    'li2',
    'li3'
]

/** 存储单位 key（普通命名，由 si 参数决定系数） */
export type StorageUnitKey = 'B' | 'KB' | 'MB' | 'GB' | 'TB' | 'PB'

/** 存储单位显示顺序（二进制 1024 制，含 PB） */
export const STORAGE_BINARY_ORDER: readonly StorageUnitKey[] = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

/** 存储单位显示顺序（SI 十进制，到 TB） */
export const STORAGE_SI_ORDER: readonly StorageUnitKey[] = ['B', 'KB', 'MB', 'GB', 'TB']

/**
 * 取存储单位换算到字节的系数。
 * IEC 命名（KiB/MiB/GiB/TiB/PiB）恒按 1024 制，不受 si 影响；
 * 普通命名（B/KB/MB/GB/TB/PB）按 si 参数选择 1024 制或 1000 制。
 */
export function storageFactorToBytes(key: string, si: boolean): number {
    const norm = String(key).trim().toUpperCase()
    if (norm === 'B') return 1
    const match = norm.match(/^([KMGTP])I?B$/)
    if (!match) {
        throw new Error('无效的存储单位：' + key)
    }
    // 指数：K=1, M=2, G=3, T=4, P=5
    const exp = 'KMGTP'.indexOf(match[1]) + 1
    if (exp === 0) {
        throw new Error('无效的存储单位：' + key)
    }
    // IEC 命名恒为 1024 制
    const isIec = norm.endsWith('IB')
    const base = isIec || !si ? 1024 : 1000
    return Math.pow(base, exp)
}

/**
 * 长度换算：value × from 系数 ÷ to 系数（均以米为基准）。
 * 非法单位抛错；非有限数值抛错。
 */
export function convertLength(value: number, from: LengthUnitKey, to: LengthUnitKey): number {
    const fromFactor = LENGTH_FACTORS[from]
    const toFactor = LENGTH_FACTORS[to]
    if (fromFactor === undefined || toFactor === undefined) {
        throw new Error('无效的长度单位')
    }
    if (!Number.isFinite(value)) {
        throw new Error('无效的数值')
    }
    return (value * fromFactor) / toFactor
}

/**
 * 存储换算：value × from 系数 ÷ to 系数（均以字节为基准）。
 * @param si true 时普通单位 key 按 1000 制解析，false 时按 1024 制；
 *           IEC 命名（KiB 等）恒按 1024 制，可用于两套制式之间的互转。
 */
export function convertStorage(value: number, from: string, to: string, si: boolean): number {
    if (!Number.isFinite(value)) {
        throw new Error('无效的数值')
    }
    const fromFactor = storageFactorToBytes(from, si)
    const toFactor = storageFactorToBytes(to, si)
    return (value * fromFactor) / toFactor
}
