// @vitest-environment jsdom
/**
 * HTML 查看器本地链接导航解析测试（2026-11-20 用户反馈修复）
 *
 * 背景：报告 HTML Wiki 顶部导航是跨文档 `.html` 链接。查看器 iframe 无 allow-scripts，
 * 直接导航到 file:// 目标页会导致目标页 `report-nav.js` 不执行（顶部导航消失）且
 * 查看器路径停留在旧文件。修复为拦截本地 .html 链接、走查看器自身加载器。
 *
 * 本测试覆盖纯函数契约：
 * 1. file:// URL → 本地 Windows 路径/文件名（含中文/编码字符）；
 * 2. 非 file、非 HTML、无法解析的链接返回 null（保持默认行为）；
 * 3. 点击动作分类：anchor / navigate / default（含当前页自身、分隔符/大小写差异）。
 */
import { describe, it, expect } from 'vitest'
import {
    resolveLocalHtmlTarget,
    resolveViewerHtmlLinkClick
} from '@renderer/components/HemyTools/html-view-utils'

describe('resolveLocalHtmlTarget', () => {
    it('解析 Windows 盘符 file:// URL 为本地路径与文件名', () => {
        expect(
            resolveLocalHtmlTarget(
                'file:///E:/github.com/hemy08/BaiZeNotesByVue/docs/reports/html/01-%E6%A3%80%E6%9F%A5/README.html'
            )
        ).toEqual({
            path: 'E:\\github.com\\hemy08\\BaiZeNotesByVue\\docs\\reports\\html\\01-检查\\README.html',
            name: 'README.html'
        })
    })

    it('解码中文与百分号编码路径', () => {
        expect(
            resolveLocalHtmlTarget(
                'file:///E:/repo/docs/%E6%8A%A5%E5%91%8A/01%20%E6%A3%80%E6%9F%A5%26%E6%89%AB%E6%8F%8F.html'
            )
        ).toEqual({
            path: 'E:\\repo\\docs\\报告\\01 检查&扫描.html',
            name: '01 检查&扫描.html'
        })
    })

    it('接受 .htm 扩展名（不区分大小写）', () => {
        expect(resolveLocalHtmlTarget('file:///E:/repo/a/b.HTM')).toEqual({
            path: 'E:\\repo\\a\\b.HTM',
            name: 'b.HTM'
        })
    })

    it('POSIX 绝对路径保留正斜杠', () => {
        expect(resolveLocalHtmlTarget('file:///home/user/report/index.html')).toEqual({
            path: '/home/user/report/index.html',
            name: 'index.html'
        })
    })

    it('非 file 协议返回 null', () => {
        expect(resolveLocalHtmlTarget('https://example.com/a.html')).toBeNull()
        expect(resolveLocalHtmlTarget('mailto:a@b.com')).toBeNull()
        expect(resolveLocalHtmlTarget('javascript:void(0)')).toBeNull()
    })

    it('非 HTML 扩展名返回 null（如报告 MD 索引）', () => {
        expect(resolveLocalHtmlTarget('file:///E:/repo/docs/reports/html/README.md')).toBeNull()
    })

    it('空串 / 无法解析的 URL 返回 null', () => {
        expect(resolveLocalHtmlTarget('')).toBeNull()
        expect(resolveLocalHtmlTarget('not a url')).toBeNull()
    })
})

describe('resolveViewerHtmlLinkClick', () => {
    const current = 'E:\\repo\\docs\\reports\\html\\README.html'
    const base = 'file:///E:/repo/docs/reports/html/'

    it('纯 fragment 链接归类为 anchor（交由现有锚点滚动守卫）', () => {
        expect(resolveViewerHtmlLinkClick('#sec-1', current)).toEqual({ kind: 'anchor' })
    })

    it('本地其他 HTML 链接归类为 navigate 并给出本地路径', () => {
        expect(
            resolveViewerHtmlLinkClick(`${base}01-%E6%A3%80%E6%9F%A5/README.html`, current)
        ).toEqual({
            kind: 'navigate',
            path: 'E:\\repo\\docs\\reports\\html\\01-检查\\README.html',
            name: 'README.html'
        })
    })

    it('当前页自身（分隔符/大小写不同）归类为 default，避免重复加载', () => {
        expect(
            resolveViewerHtmlLinkClick('file:///E:/repo/docs/reports/html/readme.html', current)
        ).toEqual({ kind: 'default' })
        expect(
            resolveViewerHtmlLinkClick('file:///e:/repo/docs/reports/html/README.html', current)
        ).toEqual({ kind: 'default' })
    })

    it('外部链接 / 非 HTML / 空 href 保持 default', () => {
        expect(resolveViewerHtmlLinkClick('https://example.com/x.html', current)).toEqual({
            kind: 'default'
        })
        expect(resolveViewerHtmlLinkClick('README.md', current)).toEqual({ kind: 'default' })
        expect(resolveViewerHtmlLinkClick('', current)).toEqual({ kind: 'default' })
    })
})
