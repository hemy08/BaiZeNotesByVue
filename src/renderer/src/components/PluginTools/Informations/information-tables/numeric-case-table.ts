/**
 * CQ-07：Information.ts 数据表拆分（原 Information.ts 第 891-913 行）。
 * 内容与原文件逐字一致；索引文件 Information.ts 统一 re-export。
 */
import type { NumericCaseInfo } from './types'

export const NumericCaseTable: NumericCaseInfo[] = [
    { number: '1', lower: '一', upper: '壹' },
    { number: '2', lower: '二', upper: '贰' },
    { number: '3', lower: '三', upper: '叁' },
    { number: '4', lower: '四', upper: '肆' },
    { number: '5', lower: '五', upper: '伍' },
    { number: '6', lower: '六', upper: '陆' },
    { number: '7', lower: '七', upper: '柒' },
    { number: '8', lower: '八', upper: '捌' },
    { number: '9', lower: '九', upper: '玖' },
    { number: '10', lower: '十', upper: '拾' },
    { number: '100', lower: '百', upper: '佰' },
    { number: '1000', lower: '千', upper: '仟' },
    { number: '10000', lower: '万', upper: '万' },
    { number: '10000万', lower: '亿', upper: '亿' },
    { number: '10000亿', lower: '兆', upper: '兆' },
    { number: '10000兆', lower: '京', upper: '京' },
    { number: '10000京', lower: '垓', upper: '垓' },
    { number: '10000垓', lower: '秭', upper: '秭' },
    { number: '10000秭', lower: '穰', upper: '穰' },
    { number: '10000穰', lower: '沟', upper: '沟' },
    { number: '10000沟', lower: '涧', upper: '涧' }
]
