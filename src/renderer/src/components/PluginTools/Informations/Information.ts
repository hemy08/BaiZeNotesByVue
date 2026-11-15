/**
 * CQ-07：本文件由 1,375 行的大文件拆分为"索引 + information-tables/ 数据文件"结构。
 * 所有数据表与 CompressedArray 仍从此文件导出，对外 API 保持不变。
 */

export type {
    ASCIIInfo,
    FormulaSymInfo,
    HTMLChar,
    PhySymInfo,
    SubNetMaskBitsInfo,
    HTTPStatusCodeInfo,
    NumericCaseInfo,
    NormalFontStyle,
    HTMLMimeType,
    GreeceLetterInfo
} from './information-tables/types'

export { ASCIITable } from './information-tables/ascii-table'
export { FormulaSymbolTable } from './information-tables/formula-symbol-table'
export { HTMLSpecCharTable } from './information-tables/html-special-char-table'
export { PhysicalTable } from './information-tables/physical-table'
export { SubnetMaskBitsTable } from './information-tables/subnet-mask-bits-table'
export { HTTPStatusCodeTable } from './information-tables/http-status-code-table'
export { NumericCaseTable } from './information-tables/numeric-case-table'
export { NormalFontTable } from './information-tables/normal-font-table'
export { HTMLMimeTypeTable } from './information-tables/html-mime-type-table'
export { GreeceLetterTable } from './information-tables/greece-letter-table'
export { CompressedArray } from './information-tables/compressed-array'
