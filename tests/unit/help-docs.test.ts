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
const mdPath = path.join(root, 'docs/help/usage-guide.md')

describe('使用指导交付物', () => {
    it('HTML 指南存在且包含侧边导航、内页锚点与关键章节', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        expect(html).toContain('class="side"')
        expect(html).toContain('href="#sec-1"')
        expect(html).toContain('使用指导导航')
        expect(html).toContain('插件工具（38 项）')
        expect(html).toContain('Wiki 双链与反向链接')
    })

    it('HTML 指南包含 1.5.5 新增能力的使用说明（外观三项 / 菜单栏键盘 / 纸感版式）', () => {
        const html = fs.readFileSync(htmlPath, 'utf8')
        // 外观三项：入口、取值、默认值与降级规则
        expect(html).toContain('1.5.5 新增：界面风格与密度')
        expect(html).toContain('界面风格')
        expect(html).toContain('界面密度')
        expect(html).toContain('减少透明效果')
        expect(html).toContain('高密度工作台')
        // 材质口径：纸感/玻璃由主题强调色派生（非固定暖黄色），且说明主窗口可见变化
        expect(html).toContain('低饱和薄雾')
        expect(html).toContain('主窗口可见变化')
        // 菜单栏键盘：按键表与三级子菜单规则
        expect(html).toContain('1.5.5 新增：菜单栏键盘操作')
        expect(html).toContain('三级子菜单的展开规则')
        // 写作模式纸感版式
        expect(html).toContain('1.5.5 新增：写作模式纸感版式')
        expect(html).toContain('纸感版式')
        // 系统设置矩阵同步：外观页签含三项新增配置
        expect(html).toContain('外观设置')
        expect(html).toContain('无需重启')
    })

    it('HTML 指南与 Markdown 内容源章节数一致（防止只改 md 未重新生成）', () => {
        const md = fs.readFileSync(mdPath, 'utf8')
        const html = fs.readFileSync(htmlPath, 'utf8')
        const mdH2 = (md.match(/^## /gm) || []).length
        const mdH3 = (md.match(/^### /gm) || []).length
        const htmlH2 = (html.match(/<h2/g) || []).length
        const htmlH3 = (html.match(/<h3/g) || []).length
        // HTML 比 md 多 1 个 <h2>：PDF 打印目录页固定标题「目录」
        expect(htmlH2).toBe(mdH2 + 1)
        expect(htmlH3).toBe(mdH3)
    })

    it('HTML 指南不残留 Markdown 标题破格（行首多余单引号）', () => {
        const md = fs.readFileSync(mdPath, 'utf8')
        const html = fs.readFileSync(htmlPath, 'utf8')
        // 历史文档曾有 4 处标题前多了单引号，生成后变成 <p>'### ...</p>（标题丢失、目录缺项）；
        // 同时校验内容源与生成物，避免只改 md 未重新生成、或生成后又被写坏。
        expect(md).not.toMatch(/^'#{1,6}\s/m)
        expect(html).not.toContain("'##")
        expect(html).not.toContain("'###")
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
