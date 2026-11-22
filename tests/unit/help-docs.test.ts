/**
 * 帮助 → 使用指导交付物守卫：
 * - HTML 指南已生成到 renderer public，构建后随 asar 分发；
 * - PDF 指南已生成到 resources/help，经 extraResources 进入安装包；
 * - 两份文档都包含导航与关键章节，避免“文件存在但内容为空/导航丢失”。
 */
import { describe, expect, it } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const root = process.cwd()
const htmlPath = path.join(root, 'src/renderer/public/usage-guide.html')
const pdfPath = path.join(root, 'resources/help/usage-guide.pdf')

describe('使用指导交付物', () => {
    it('HTML 指南存在且包含侧边导航、内页锚点与关键章节', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        expect(html).toContain('class="side"')
        expect(html).toContain('href="#sec-1"')
        expect(html).toContain('使用指导导航')
        expect(html).toContain('插件工具（38 项）')
        expect(html).toContain('Wiki 双链与反向链接')
    })

    it('PDF 指南存在、非空且以 PDF 头开始', () => {
        const buffer = fs.readFileSync(pdfPath)
        expect(buffer.length).toBeGreaterThan(10_000)
        expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    })

    it('HTML 指南不引用外部脚本/样式，保持应用内 iframe 安全边界', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        expect(html).not.toMatch(/<script\b/i)
        expect(html).not.toMatch(/<link[^>]+stylesheet/i)
    })
})
