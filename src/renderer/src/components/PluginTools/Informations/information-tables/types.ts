/**
 * CQ-07：Information.ts 数据表拆分（原 Information.ts 第 1-56 行接口定义）。
 * 索引文件 Information.ts 统一 re-export，对外 API 保持不变。
 */
export interface ASCIIInfo {
    bin: string
    oct: string
    dec: string
    hex: string
    abridge: string
    mark: string
}

export interface FormulaSymInfo {
    id: string
    mark: string
}

export interface HTMLChar {
    id: string
    mark: string
}

export interface PhySymInfo {
    symbol: string
    name: string
    mark: string
}

export interface SubNetMaskBitsInfo {
    mask: string
    bit: string
    nums: string
}

export interface HTTPStatusCodeInfo {
    code: string
    desc: string
}

export interface NumericCaseInfo {
    number: string
    lower: string
    upper: string
}

export interface NormalFontStyle {
    name: string
    cssStyle: string
}

export interface HTMLMimeType {
    ext: string
    type: string
}

export interface GreeceLetterInfo {
    char: string
    code: string
}
