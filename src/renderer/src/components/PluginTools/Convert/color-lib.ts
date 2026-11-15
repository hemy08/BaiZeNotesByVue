/**
 * 颜色转换纯函数库（jyshare 颜色转换工具站能力移植）
 *
 * 设计约定：
 * - RGB：r/g/b ∈ [0, 255]（整数）
 * - HEX：支持 #RGB / #RRGGBB / #RRGGBBAA（AA 透明度忽略）与不带 # 的形式，输出大写
 * - HSV：h ∈ [0, 360)（度），s/v ∈ [0, 100]（百分比）——比 jyshare 的 0-1 归一化更直观
 * - HSL：h ∈ [0, 360)（度），s/l ∈ [0, 100]（百分比）
 * - CMYK：c/m/y/k ∈ [0, 100]（百分比）
 * - 所有互转经 RGB 中转；cmyk2rgb 修正了调研发现的 bug（原实现 else-if 链导致
 *   只有第一个 >0 的分量才被 /100，此处四个分量一律 /100）。
 */

/** RGB 颜色 */
export interface RgbColor {
    r: number
    g: number
    b: number
}

/** HSV 颜色：h 度、s/v 百分比 */
export interface HsvColor {
    h: number
    s: number
    v: number
}

/** HSL 颜色：h 度、s/l 百分比 */
export interface HslColor {
    h: number
    s: number
    l: number
}

/** CMYK 颜色：四分量均为百分比 */
export interface CmykColor {
    c: number
    m: number
    y: number
    k: number
}

/** 通用夹取工具 */
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/**
 * HEX 字符串解析为 RGB。
 * 支持 "#RGB"、"#RRGGBB"、"#RRGGBBAA"（AA 忽略）与不带 # 的写法。
 * 非法输入抛错。
 */
export function hexToRgb(hex: string): RgbColor {
    const cleaned = String(hex).trim().replace(/^#/, '').toUpperCase()
    let expanded: string
    if (cleaned.length === 3) {
        // 三位缩写：每个字符重复一次
        expanded = cleaned
            .split('')
            .map((c) => c + c)
            .join('')
    } else if (cleaned.length === 6 || cleaned.length === 8) {
        expanded = cleaned.slice(0, 6)
    } else {
        throw new Error('无效的 HEX 颜色值：' + hex)
    }
    if (!/^[0-9A-F]{6}$/.test(expanded)) {
        throw new Error('无效的 HEX 颜色值：' + hex)
    }
    return {
        r: parseInt(expanded.slice(0, 2), 16),
        g: parseInt(expanded.slice(2, 4), 16),
        b: parseInt(expanded.slice(4, 6), 16)
    }
}

/** RGB 转 HEX（大写 #RRGGBB），分量自动夹取到 0-255 并取整 */
export function rgbToHex(rgb: RgbColor): string {
    const toHex = (n: number): string => {
        const v = clamp(Math.round(n), 0, 255)
        return v.toString(16).padStart(2, '0')
    }
    return '#' + (toHex(rgb.r) + toHex(rgb.g) + toHex(rgb.b)).toUpperCase()
}

/**
 * RGB 转 HSV（h 度 0-360，s/v 百分比 0-100）。
 * 公式源自 jyshare color.js 的 rgb2hsv，输出从 0-1 归一化改为度/百分比。
 */
export function rgbToHsv(rgb: RgbColor): HsvColor {
    const r = clamp(rgb.r, 0, 255) / 255
    const g = clamp(rgb.g, 0, 255) / 255
    const b = clamp(rgb.b, 0, 255) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min

    let h = 0
    if (max !== min) {
        if (max === r) {
            h = (g - b) / d + (g < b ? 6 : 0)
        } else if (max === g) {
            h = (b - r) / d + 2
        } else {
            h = (r - g) / d + 4
        }
        h = (h / 6) * 360
    }
    const s = max === 0 ? 0 : (d / max) * 100
    const v = max * 100
    return { h, s, v }
}

/**
 * HSV 转 RGB（h 度 0-360，s/v 百分比 0-100）。
 * 公式源自 jyshare color.js 的 hsv2rgb（H 输入由 0-1 改为度）。
 */
export function hsvToRgb(hsv: HsvColor): RgbColor {
    const h = ((hsv.h % 360) + 360) % 360
    const s = clamp(hsv.s, 0, 100) / 100
    const v = clamp(hsv.v, 0, 100) / 100

    const i = Math.floor(h / 60)
    const f = h / 60 - i
    const p = v * (1 - s)
    const q = v * (1 - f * s)
    const t = v * (1 - (1 - f) * s)

    let r = 0
    let g = 0
    let b = 0
    switch (i % 6) {
        case 0:
            r = v
            g = t
            b = p
            break
        case 1:
            r = q
            g = v
            b = p
            break
        case 2:
            r = p
            g = v
            b = t
            break
        case 3:
            r = p
            g = q
            b = v
            break
        case 4:
            r = t
            g = p
            b = v
            break
        default:
            r = v
            g = p
            b = q
            break
    }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) }
}

/** RGB 转 HSL（h 度 0-360，s/l 百分比 0-100） */
export function rgbToHsl(rgb: RgbColor): HslColor {
    const r = clamp(rgb.r, 0, 255) / 255
    const g = clamp(rgb.g, 0, 255) / 255
    const b = clamp(rgb.b, 0, 255) / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    const l = (max + min) / 2

    let h = 0
    if (max !== min) {
        if (max === r) {
            h = (g - b) / d + (g < b ? 6 : 0)
        } else if (max === g) {
            h = (b - r) / d + 2
        } else {
            h = (r - g) / d + 4
        }
        h = (h / 6) * 360
    }
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
    return { h, s: s * 100, l: l * 100 }
}

/** HSL 转 RGB（h 度 0-360，s/l 百分比 0-100） */
export function hslToRgb(hsl: HslColor): RgbColor {
    const h = ((hsl.h % 360) + 360) % 360
    const s = clamp(hsl.s, 0, 100) / 100
    const l = clamp(hsl.l, 0, 100) / 100

    const c = (1 - Math.abs(2 * l - 1)) * s
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
    const m = l - c / 2

    let r = 0
    let g = 0
    let b = 0
    if (h < 60) {
        r = c
        g = x
        b = 0
    } else if (h < 120) {
        r = x
        g = c
        b = 0
    } else if (h < 180) {
        r = 0
        g = c
        b = x
    } else if (h < 240) {
        r = 0
        g = x
        b = c
    } else if (h < 300) {
        r = x
        g = 0
        b = c
    } else {
        r = c
        g = 0
        b = x
    }
    return {
        r: Math.round((r + m) * 255),
        g: Math.round((g + m) * 255),
        b: Math.round((b + m) * 255)
    }
}

/** RGB 转 CMYK（c/m/y/k 百分比 0-100），纯黑特判 k=100 */
export function rgbToCmyk(rgb: RgbColor): CmykColor {
    const r = clamp(rgb.r, 0, 255) / 255
    const g = clamp(rgb.g, 0, 255) / 255
    const b = clamp(rgb.b, 0, 255) / 255
    const k = 1 - Math.max(r, g, b)
    if (k >= 1) {
        return { c: 0, m: 0, y: 0, k: 100 }
    }
    const c = (1 - r - k) / (1 - k)
    const m = (1 - g - k) / (1 - k)
    const y = (1 - b - k) / (1 - k)
    return { c: c * 100, m: m * 100, y: y * 100, k: k * 100 }
}

/**
 * CMYK 转 RGB（c/m/y/k 百分比 0-100）。
 * 修复 jyshare 原 bug：原实现用 else-if 链只把第一个 >0 的分量 /100，
 * 此处四个分量一律 /100，并按标准公式 r = 255 * (1-c) * (1-k) 计算。
 */
export function cmykToRgb(cmyk: CmykColor): RgbColor {
    const c = clamp(cmyk.c, 0, 100) / 100
    const m = clamp(cmyk.m, 0, 100) / 100
    const y = clamp(cmyk.y, 0, 100) / 100
    const k = clamp(cmyk.k, 0, 100) / 100
    return {
        r: Math.round(255 * (1 - c) * (1 - k)),
        g: Math.round(255 * (1 - m) * (1 - k)),
        b: Math.round(255 * (1 - y) * (1 - k))
    }
}

/**
 * 解析 RGB 输入字符串。
 * 支持 "255,0,0" / "255, 0, 0" / "rgb(255,0,0)" / "255 0 0" 等分隔形式；
 * 非法输入返回 null（由调用方决定提示方式）。
 */
export function parseRgbInput(input: string): RgbColor | null {
    const cleaned = String(input).trim()
    if (!cleaned) return null
    const body = cleaned.replace(/^rgb\(|\)$/gi, '')
    const parts = body
        .split(/[,\s;]+/)
        .map((p) => p.trim())
        .filter((p) => p !== '')
    if (parts.length < 3) return null
    const nums = parts.slice(0, 3).map((p) => Number(p))
    if (nums.some((n) => !Number.isFinite(n))) return null
    return {
        r: clamp(Math.round(nums[0]), 0, 255),
        g: clamp(Math.round(nums[1]), 0, 255),
        b: clamp(Math.round(nums[2]), 0, 255)
    }
}
