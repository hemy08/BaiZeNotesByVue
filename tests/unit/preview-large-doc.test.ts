/**
 * P2-1 大文档预览性能优化：分级降级计划与「降级级别感知」渲染缓存单元测试。
 *
 * 覆盖：
 * 1. 文档规模测量（ASCII/中文/代理对字节估算、行数统计）；
 * 2. 三级判定（normal / degraded 256KiB·1 万行 / progressive 512KiB·2 万行）与边界；
 * 3. 渲染计划各插件跳过标志（简化档/渐进档必须跳过 KaTeX、图表、冷门语言预取）；
 * 4. 骨架屏低成本预判（IsPreviewContentProbablyLarge，只允许误报不允许漏报）；
 * 5. 计划单条目缓存（同一字符串重复判定复用结果，复位后重新计算）；
 * 6. 渲染缓存：只缓存大文档、缓存键包含降级级别/活动文件路径/远程图片策略，
 *    不同级别绝不串用；LRU 上限与 HTML 体积上限生效；内容逐字符校验兜底哈希碰撞；
 * 7. IsLargePreviewDocument 与渲染计划判定一致（阈值单一真源）。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    BuildPreviewRenderCacheKey,
    ClearPreviewRenderCache,
    GetCachedPreviewRenderHtml,
    GetPreviewRenderCacheSize,
    IsPreviewContentProbablyLarge,
    MeasurePreviewDocument,
    PREVIEW_RENDER_CACHE_MAX_ENTRIES,
    PREVIEW_RENDER_CACHE_MAX_HTML_CHARS,
    ResolvePreviewRenderPlan,
    ResetPreviewRenderPlanCache,
    SetCachedPreviewRenderHtml
} from '../../src/renderer/src/components/Markdown/preview-large-doc'
import { IsLargePreviewDocument } from '../../src/renderer/src/components/Markdown/preview-local-render'
import {
    PREVIEW_DEGRADE_FILE_SIZE,
    PREVIEW_DEGRADE_LINES,
    PREVIEW_PROGRESSIVE_FILE_SIZE,
    PREVIEW_PROGRESSIVE_LINES
} from '../../src/shared/constants/limits'

/** 生成指定行数的短 Markdown（每行 2 字符 + 换行） */
function buildLines(lineCount: number): string {
    return 'x\n'.repeat(lineCount)
}

/** 简化档样本（纯 ASCII，字节数刚超过简化档阈值） */
const DEGRADED_SAMPLE = 'a'.repeat(PREVIEW_DEGRADE_FILE_SIZE + 1)
/** 渐进档样本（纯 ASCII，字节数刚超过渐进档阈值） */
const PROGRESSIVE_SAMPLE = 'a'.repeat(PREVIEW_PROGRESSIVE_FILE_SIZE + 1)

beforeEach(() => {
    ClearPreviewRenderCache()
    ResetPreviewRenderPlanCache()
})

describe('P2-1 文档规模测量（MeasurePreviewDocument）', () => {
    it('空内容与普通短文档', () => {
        expect(MeasurePreviewDocument('')).toEqual({ estimatedBytes: 0, lineCount: 0 })
        expect(MeasurePreviewDocument('你好')).toEqual({ estimatedBytes: 6, lineCount: 1 })
        expect(MeasurePreviewDocument('a\nb\nc')).toEqual({ estimatedBytes: 5, lineCount: 3 })
    })

    it('中文按 3 字节、代理对按 4 字节估算', () => {
        // 「中」UTF-8 为 3 字节；「😀」为 4 字节代理对
        expect(MeasurePreviewDocument('中文').estimatedBytes).toBe(6)
        expect(MeasurePreviewDocument('😀').estimatedBytes).toBe(4)
        // 代理对只计一次：两个 emoji = 8 字节
        expect(MeasurePreviewDocument('😀😀').estimatedBytes).toBe(8)
    })

    it('行数按 \\n 计数 +1', () => {
        expect(MeasurePreviewDocument('a').lineCount).toBe(1)
        expect(MeasurePreviewDocument('a\n').lineCount).toBe(2)
        expect(MeasurePreviewDocument('a\r\nb').lineCount).toBe(2)
    })
})

describe('P2-1 分级判定（ResolvePreviewRenderPlan）', () => {
    it('普通短文档为 normal，各高成本插件不跳过', () => {
        const plan = ResolvePreviewRenderPlan('# 标题\n\n正文 $x^2$')
        expect(plan.tier).toBe('normal')
        expect(plan.degraded).toBe(false)
        expect(plan.progressive).toBe(false)
        expect(plan.skipKatex).toBe(false)
        expect(plan.skipDiagrams).toBe(false)
        expect(plan.skipLazyHighlight).toBe(false)
        expect(plan.chunkedSanitize).toBe(false)
    })

    it('超过 256KiB 进入简化档：跳过 KaTeX/图表/冷门语言预取，但仍整篇消毒', () => {
        const plan = ResolvePreviewRenderPlan(DEGRADED_SAMPLE)
        expect(plan.tier).toBe('degraded')
        expect(plan.degraded).toBe(true)
        expect(plan.progressive).toBe(false)
        expect(plan.skipKatex).toBe(true)
        expect(plan.skipDiagrams).toBe(true)
        expect(plan.skipLazyHighlight).toBe(true)
        expect(plan.chunkedSanitize).toBe(false)
    })

    it('超过 1 万行进入简化档（短行多、字节不高也降级）', () => {
        const source = buildLines(PREVIEW_DEGRADE_LINES + 1)
        expect(source.length).toBeLessThan(PREVIEW_DEGRADE_FILE_SIZE)
        expect(ResolvePreviewRenderPlan(source).tier).toBe('degraded')
    })

    it('超过 512KiB 进入渐进档：分块消毒 + 首块先显示', () => {
        const plan = ResolvePreviewRenderPlan(PROGRESSIVE_SAMPLE)
        expect(plan.tier).toBe('progressive')
        expect(plan.degraded).toBe(true)
        expect(plan.progressive).toBe(true)
        expect(plan.skipKatex).toBe(true)
        expect(plan.skipDiagrams).toBe(true)
        expect(plan.skipLazyHighlight).toBe(true)
        expect(plan.chunkedSanitize).toBe(true)
    })

    it('超过 2 万行进入渐进档', () => {
        const source = buildLines(PREVIEW_PROGRESSIVE_LINES + 1)
        expect(ResolvePreviewRenderPlan(source).tier).toBe('progressive')
    })

    it('阈值边界：恰好等于阈值不降级，超过才降级', () => {
        expect(ResolvePreviewRenderPlan('a'.repeat(PREVIEW_DEGRADE_FILE_SIZE)).tier).toBe('normal')
        expect(ResolvePreviewRenderPlan('a'.repeat(PREVIEW_DEGRADE_FILE_SIZE + 1)).tier).toBe(
            'degraded'
        )
        expect(ResolvePreviewRenderPlan('a'.repeat(PREVIEW_PROGRESSIVE_FILE_SIZE)).tier).toBe(
            'degraded'
        )
        expect(ResolvePreviewRenderPlan('a'.repeat(PREVIEW_PROGRESSIVE_FILE_SIZE + 1)).tier).toBe(
            'progressive'
        )
    })

    it('中文按 UTF-8 3 字节参与判定（8.7 万汉字 ≈ 256KiB）', () => {
        const chineseChars = Math.ceil(PREVIEW_DEGRADE_FILE_SIZE / 3) + 10
        const plan = ResolvePreviewRenderPlan('中'.repeat(chineseChars))
        expect(plan.tier).toBe('degraded')
        // 汉字数明显小于渐进档字符阈值，但字节数仍低于渐进档阈值
        expect(chineseChars * 3).toBeLessThan(PREVIEW_PROGRESSIVE_FILE_SIZE)
    })

    it('IsLargePreviewDocument 与渲染计划判定一致（阈值单一真源）', () => {
        const samples = [
            '',
            '# 短文档',
            DEGRADED_SAMPLE,
            PROGRESSIVE_SAMPLE,
            buildLines(PREVIEW_DEGRADE_LINES + 1)
        ]
        for (const sample of samples) {
            const plan = ResolvePreviewRenderPlan(sample)
            expect(IsLargePreviewDocument(sample)).toBe(plan.degraded)
        }
    })

    it('计划单条目缓存：同一字符串引用复用同一计划对象，复位后判定结果不变', () => {
        const source = DEGRADED_SAMPLE
        const first = ResolvePreviewRenderPlan(source)
        const second = ResolvePreviewRenderPlan(source)
        expect(second).toBe(first)
        expect(first.tier).toBe('degraded')
        ResetPreviewRenderPlanCache()
        const third = ResolvePreviewRenderPlan(source)
        expect(third.tier).toBe('degraded')
        // 三级计划为冻结的单例对象：缓存只影响扫描次数，不影响判定结果
        expect(third).toBe(ResolvePreviewRenderPlan(source))
    })
})

describe('P2-1 骨架屏低成本预判（IsPreviewContentProbablyLarge）', () => {
    it('超短文档不预判大文档；字符数达到「字节阈值/3」即预判（宁可误报不可漏报）', () => {
        expect(IsPreviewContentProbablyLarge('')).toBe(false)
        expect(IsPreviewContentProbablyLarge('# 短')).toBe(false)
        expect(
            IsPreviewContentProbablyLarge('a'.repeat(Math.floor(PREVIEW_DEGRADE_FILE_SIZE / 3)))
        ).toBe(true)
        expect(IsPreviewContentProbablyLarge(DEGRADED_SAMPLE)).toBe(true)
    })
})

describe('P2-1 降级级别感知渲染缓存', () => {
    const allowRemote = false

    it('普通小文档不入缓存（避免无意义常驻内存）', () => {
        const plan = ResolvePreviewRenderPlan('# 小文档')
        SetCachedPreviewRenderHtml(plan, '# 小文档', '', allowRemote, '<p>小文档</p>')
        expect(GetPreviewRenderCacheSize()).toBe(0)
        expect(GetCachedPreviewRenderHtml(plan, '# 小文档', '', allowRemote)).toBeNull()
    })

    it('大文档缓存命中：返回已消毒 HTML；缓存键包含降级级别', () => {
        const plan = ResolvePreviewRenderPlan(DEGRADED_SAMPLE)
        SetCachedPreviewRenderHtml(
            plan,
            DEGRADED_SAMPLE,
            'C:\\notes\\a.md',
            allowRemote,
            '<p>大文档</p>'
        )
        expect(GetPreviewRenderCacheSize()).toBe(1)
        expect(
            GetCachedPreviewRenderHtml(plan, DEGRADED_SAMPLE, 'C:\\notes\\a.md', allowRemote)
        ).toBe('<p>大文档</p>')
        const key = BuildPreviewRenderCacheKey(
            plan,
            DEGRADED_SAMPLE,
            'C:\\notes\\a.md',
            allowRemote
        )
        expect(key.startsWith('degraded|')).toBe(true)
        expect(key).toContain('C:\\notes\\a.md')
    })

    it('不同降级级别绝不串用缓存', () => {
        const degradedPlan = ResolvePreviewRenderPlan(DEGRADED_SAMPLE)
        const progressivePlan = ResolvePreviewRenderPlan(PROGRESSIVE_SAMPLE)
        SetCachedPreviewRenderHtml(
            degradedPlan,
            DEGRADED_SAMPLE,
            '',
            allowRemote,
            '<p>简化档产物</p>'
        )
        // 同内容但按渐进档读取：级别不同 → 未命中
        expect(
            GetCachedPreviewRenderHtml(progressivePlan, DEGRADED_SAMPLE, '', allowRemote)
        ).toBeNull()
    })

    it('活动文件路径 / 远程图片策略 / 内容变化都会使缓存未命中', () => {
        const plan = ResolvePreviewRenderPlan(DEGRADED_SAMPLE)
        SetCachedPreviewRenderHtml(plan, DEGRADED_SAMPLE, 'C:\\a.md', allowRemote, '<p>A</p>')
        // 路径不同
        expect(
            GetCachedPreviewRenderHtml(plan, DEGRADED_SAMPLE, 'C:\\b.md', allowRemote)
        ).toBeNull()
        // 远程图片策略不同
        expect(GetCachedPreviewRenderHtml(plan, DEGRADED_SAMPLE, 'C:\\a.md', true)).toBeNull()
        // 内容不同（同长度但内容不同，键哈希不同）
        const otherContent = 'b'.repeat(PREVIEW_DEGRADE_FILE_SIZE + 1)
        expect(GetCachedPreviewRenderHtml(plan, otherContent, 'C:\\a.md', allowRemote)).toBeNull()
    })

    it('缓存条目上限为 LRU 2：淘汰最久未使用条目', () => {
        const plan = ResolvePreviewRenderPlan(DEGRADED_SAMPLE)
        const sources = ['a', 'b', 'c'].map((char) => char.repeat(PREVIEW_DEGRADE_FILE_SIZE + 1))
        for (const [index, source] of sources.entries()) {
            SetCachedPreviewRenderHtml(plan, source, '', allowRemote, `<p>${index}</p>`)
        }
        expect(GetPreviewRenderCacheSize()).toBe(PREVIEW_RENDER_CACHE_MAX_ENTRIES)
        // 最早的 a 已被淘汰
        expect(GetCachedPreviewRenderHtml(plan, sources[0], '', allowRemote)).toBeNull()
        expect(GetCachedPreviewRenderHtml(plan, sources[1], '', allowRemote)).toBe('<p>1</p>')
        expect(GetCachedPreviewRenderHtml(plan, sources[2], '', allowRemote)).toBe('<p>2</p>')
    })

    it('HTML 体积超过上限的大文档不入缓存', () => {
        const plan = ResolvePreviewRenderPlan(DEGRADED_SAMPLE)
        const hugeHtml = 'x'.repeat(PREVIEW_RENDER_CACHE_MAX_HTML_CHARS + 1)
        SetCachedPreviewRenderHtml(plan, DEGRADED_SAMPLE, '', allowRemote, hugeHtml)
        expect(GetPreviewRenderCacheSize()).toBe(0)
    })

    it('清空缓存后不再命中（单元测试/诊断复位入口）', () => {
        const plan = ResolvePreviewRenderPlan(DEGRADED_SAMPLE)
        SetCachedPreviewRenderHtml(plan, DEGRADED_SAMPLE, '', allowRemote, '<p>x</p>')
        ClearPreviewRenderCache()
        expect(GetPreviewRenderCacheSize()).toBe(0)
        expect(GetCachedPreviewRenderHtml(plan, DEGRADED_SAMPLE, '', allowRemote)).toBeNull()
    })
})
