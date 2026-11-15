/**
 * preview-chapters.ts 单元测试（P1/PF-2：预览大纲增量解析判定）
 *
 * 覆盖：
 * 1. 正文内容变化（无标题行、无行号平移）→ 指纹不变，可跳过第二次全文解析；
 * 2. 标题改名 / 新增 / 删除 → 指纹变化，触发全文解析；
 * 3. 标题上方增删行（标题行号平移）→ 指纹变化，保证目录跳转行号准确（PF-14）；
 * 4. 标题下方追加正文（行号不平移）→ 指纹不变；
 * 5. setext 标题下划线、围栏内 `#` 行都作为"候选行"纳入指纹（保守超集，只多解析不遗漏）；
 * 6. 空文本 / 无标题文本指纹稳定。
 */
import { describe, it, expect } from 'vitest'
import { ComputeChaptersFingerprint } from '../../src/renderer/src/components/Markdown/preview-chapters'

describe('ComputeChaptersFingerprint', () => {
    it('should keep the fingerprint stable when only body text changes', () => {
        const before = '# 标题\n\n第一段正文\n'
        const after = '# 标题\n\n第二段正文（已修改）\n'

        expect(ComputeChaptersFingerprint(after)).toBe(ComputeChaptersFingerprint(before))
    })

    it('should change the fingerprint when a heading is renamed', () => {
        expect(ComputeChaptersFingerprint('# 新标题\n\n正文\n')).not.toBe(
            ComputeChaptersFingerprint('# 旧标题\n\n正文\n')
        )
    })

    it('should change the fingerprint when a heading is added or removed', () => {
        const one = '# 标题甲\n\n正文\n'
        const two = '# 标题甲\n\n## 标题乙\n\n正文\n'

        expect(ComputeChaptersFingerprint(two)).not.toBe(ComputeChaptersFingerprint(one))
    })

    it('should change the fingerprint when lines added above shift heading line numbers (PF-14)', () => {
        const before = '# 标题\n\n正文\n'
        const after = '新增的第一行\n\n# 标题\n\n正文\n'

        // 标题文本相同但行号从 0 → 2：目录跳转行号依赖该变化，必须触发重解析
        expect(ComputeChaptersFingerprint(after)).not.toBe(ComputeChaptersFingerprint(before))
    })

    it('should keep the fingerprint stable when lines are appended after the last heading', () => {
        const before = '# 标题\n\n正文\n'
        const after = '# 标题\n\n正文\n\n末尾追加的正文行\n'

        expect(ComputeChaptersFingerprint(after)).toBe(ComputeChaptersFingerprint(before))
    })

    it('should include setext heading underline candidates', () => {
        const setext = '标题\n====\n\n正文\n'
        const changed = '标题\n----\n\n正文\n'

        // `====` 与 `----` 都是候选行，内容变化进入指纹（实际语义由 markdown-it 解析决定）
        expect(ComputeChaptersFingerprint(changed)).not.toBe(ComputeChaptersFingerprint(setext))
    })

    it('should include heading-like lines inside code fences as candidates (conservative superset)', () => {
        const first = '```\n# 示例注释\n```\n'
        const second = '```\n# 另一条注释\n```\n'

        expect(ComputeChaptersFingerprint(second)).not.toBe(ComputeChaptersFingerprint(first))
    })

    it('should include blockquote and list-prefixed heading candidates', () => {
        expect(ComputeChaptersFingerprint('> # 引用内标题\n')).not.toBe(
            ComputeChaptersFingerprint('> # 引用内标题（改）\n')
        )
        expect(ComputeChaptersFingerprint('- # 列表内标题\n')).not.toBe(
            ComputeChaptersFingerprint('- # 列表内标题（改）\n')
        )
        // 嵌套列表标记（markdown-it 仍会在列表项内解析出 heading token）
        expect(ComputeChaptersFingerprint('- - # 嵌套列表标题\n')).not.toBe(
            ComputeChaptersFingerprint('- - # 嵌套列表标题（改）\n')
        )
        expect(ComputeChaptersFingerprint('1. # 有序列表标题\n')).not.toBe(
            ComputeChaptersFingerprint('1. # 有序列表标题（改）\n')
        )
    })

    it('should handle empty and heading-free documents', () => {
        expect(ComputeChaptersFingerprint('')).toBe(ComputeChaptersFingerprint(''))
        expect(ComputeChaptersFingerprint('只有正文\n没有标题\n')).toBe(
            ComputeChaptersFingerprint('只有正文\n没有标题\n')
        )
        expect(ComputeChaptersFingerprint('正文变化一\n')).toBe(
            ComputeChaptersFingerprint('正文变化二\n')
        )
    })

    it('should support CRLF documents', () => {
        const lf = '# 标题\n\n正文\n'
        const crlf = lf.replace(/\n/g, '\r\n')

        // 同一文档的两种换行表示应产生相同指纹（标题行内容一致、行号一致）
        expect(ComputeChaptersFingerprint(crlf)).toBe(ComputeChaptersFingerprint(lf))
    })
})
