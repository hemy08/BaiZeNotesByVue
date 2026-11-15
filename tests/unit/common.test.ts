/**
 * common.ts 单元测试
 * 覆盖：FontFamily 列表的结构一致性、常用字体存在性、重复条目
 */
import { describe, it, expect } from 'vitest'
import { FontFamily } from '../../src/main/utils/common'

describe('FontFamily', () => {
    it('should contain 47 font entries', () => {
        expect(FontFamily.length).toBe(47)
    })

    it('should keep value/optCss structure consistent for every entry', () => {
        for (const font of FontFamily) {
            expect(typeof font.value, `value of ${font.value}`).toBe('string')
            expect(font.value.length, `value of ${font.value}`).toBeGreaterThan(0)
            // optCss 格式固定为 font-family:'<family>', serif;font-size:18px
            const match = font.optCss.match(/^font-family:'([^']+)', serif;font-size:18px$/)
            expect(match, `optCss of ${font.value}`).not.toBeNull()
            expect(match![1].length).toBeGreaterThan(0)
        }
    })

    it('should use the font value as css family for latin fonts', () => {
        for (const font of FontFamily) {
            if (/[\u4e00-\u9fff]/.test(font.value)) continue
            expect(font.optCss, font.value).toBe(
                `font-family:'${font.value}', serif;font-size:18px`
            )
        }
    })

    it('should map Chinese display names to their css families', () => {
        // 中文条目以英文 CSS 字体族呈现（展示名与 CSS 名不同）
        const byValue = new Map(FontFamily.map((f) => [f.value, f.optCss]))
        expect(byValue.get('黑体')).toContain("'SimHei'")
        expect(byValue.get('微软雅黑')).toContain("'Microsoft YaHei'")
        expect(byValue.get('宋体')).toContain("'SimSun'")
        expect(byValue.get('仿宋')).toContain("'FangSong'")
        expect(byValue.get('楷体')).toContain("'KaiTi'")
    })

    it('should include common coding fonts', () => {
        const values = FontFamily.map((f) => f.value)
        expect(values).toContain('Hack')
        expect(values).toContain('Consolas')
        expect(values).toContain('JetBrains Mono')
        expect(values).toContain('Fira Code')
        expect(values).toContain('Cascadia Code')
    })

    it('should include Chinese fonts', () => {
        const values = FontFamily.map((f) => f.value)
        expect(values).toContain('微软雅黑')
        expect(values).toContain('宋体')
        expect(values).toContain('黑体')
    })

    it('should contain the duplicate 华文楷体 entry exactly twice', () => {
        // 疑似 bug：列表中 华文楷体 出现了两次
        const count = FontFamily.filter((f) => f.value === '华文楷体').length
        expect(count).toBe(2)
    })
})
