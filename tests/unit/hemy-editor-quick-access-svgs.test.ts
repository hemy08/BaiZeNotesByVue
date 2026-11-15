import { describe, it, expect } from 'vitest'
import * as SVGs from '../../src/renderer/src/components/Markdown/hemy-editor-quick-access-svgs'

// 收集全部导出的 SVG 常量
const svgConstants = Object.values(SVGs) as string[]
const svgNames = Object.keys(SVGs)

describe('hemy-editor-quick-access-svgs', () => {
    it('should export the 35 toolbar svg constants', () => {
        expect(svgNames).toHaveLength(35)
        for (const name of svgNames) {
            expect(typeof SVGs[name as keyof typeof SVGs], `${name} 应为字符串`).toBe('string')
        }
    })

    it('should keep every svg a valid standalone svg snippet', () => {
        for (const [index, svg] of svgConstants.entries()) {
            expect(svg.startsWith('<svg'), `${svgNames[index]} 应以 <svg 开头`).toBe(true)
            expect(svg.endsWith('</svg>'), `${svgNames[index]} 应以 </svg> 结尾`).toBe(true)
            expect(svg, `${svgNames[index]} 应包含 viewBox`).toContain('viewBox')
            expect(svg, `${svgNames[index]} 应包含路径`).toContain('<path')
            expect(svg, `${svgNames[index]} 应声明 svg 命名空间`).toContain(
                'xmlns="http://www.w3.org/2000/svg"'
            )
        }
    })

    it('should keep every svg distinct', () => {
        expect(new Set(svgConstants).size).toBe(svgConstants.length)
    })

    it('should include the known header icon content', () => {
        expect(SVGs.SVG_HEADER_1).toContain('viewBox="0 0 24 24"')
        expect(SVGs.SVG_HEADER_1).toContain('M3 4h2v6h4V4h2v14H9v-6H5v6H3V4')
    })
})
