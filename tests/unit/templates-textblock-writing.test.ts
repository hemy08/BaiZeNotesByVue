import { describe, it, expect, afterEach, vi } from 'vitest'
import {
    blockcode,
    linksList,
    image_links,
    getFmtData
} from '../../src/renderer/src/common/templates/textblock'
import {
    leetcode_problem_solving,
    problemResolving,
    thesisTemplates,
    thesisCoverPage
} from '../../src/renderer/src/common/templates/writing'

describe('textblock templates', () => {
    describe('blockcode', () => {
        it('should start with a newline and a details block', () => {
            expect(blockcode.startsWith('\n<details>\n')).toBe(true)
            expect(blockcode).toContain('</details>')
        })

        it('should contain the blue summary placeholder', () => {
            expect(blockcode).toContain(
                '<summary style="color:rgb(0,0,255);font-weight:bold">xxxx</summary>'
            )
        })

        it('should wrap the code fence in blockcode/pre/code tags', () => {
            expect(blockcode).toContain('<blockcode><pre><code>')
            expect(blockcode).toContain('```\n\n```')
            expect(blockcode.endsWith('</code></pre></blockcode></details>\n')).toBe(true)
        })
    })

    describe('image_links', () => {
        it('should be a plain markdown image link', () => {
            expect(image_links).toBe('![]()\n')
        })
    })

    describe('linksList', () => {
        it('should contain exactly 7 empty link list items', () => {
            expect(linksList).toBe('- []()\n- []()\n- []()\n- []()\n- []()\n- []()\n- []()\n')
            expect(linksList.split('\n').filter(Boolean)).toHaveLength(7)
        })
    })

    describe('getFmtData', () => {
        afterEach(() => {
            vi.useRealTimers()
        })

        it('should format the mocked date with padded numbers', () => {
            // 固定系统时间，保证日期格式断言确定
            vi.useFakeTimers()
            vi.setSystemTime(new Date(2024, 0, 2, 3, 4, 5))

            expect(getFmtData()).toBe(
                '<span style="color:rgb(100,180,246);font-size:11pt">最后更新：2024-01-02 03:04:05</span>\n'
            )
        })

        it('should always match the yyyy-MM-dd HH:mm:ss pattern', () => {
            expect(getFmtData()).toMatch(
                /^<span style="color:rgb\(100,180,246\);font-size:11pt">最后更新：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}<\/span>\n$/
            )
        })
    })
})

describe('writing templates', () => {
    describe('leetcode_problem_solving', () => {
        it('should start with a title and a fixed update date', () => {
            expect(leetcode_problem_solving.startsWith('# 标题\n\n')).toBe(true)
            expect(leetcode_problem_solving).toContain('最后更新：2023-12-02')
        })

        it('should contain question/example/tip admonitions', () => {
            expect(leetcode_problem_solving).toContain('!!! Question "题目描述"')
            expect(leetcode_problem_solving).toContain('!!! example "题目示例"')
            expect(leetcode_problem_solving).toContain('!!! tip "提示："')
            expect(leetcode_problem_solving).toContain('!!! tip "进阶："')
        })

        it('should contain C and Go answer blocks', () => {
            expect(leetcode_problem_solving).toContain('=== "C"')
            expect(leetcode_problem_solving).toContain('```c')
            expect(leetcode_problem_solving).toContain('=== "Go"')
            expect(leetcode_problem_solving).toContain('```go')
        })
    })

    describe('problemResolving', () => {
        it('should contain all five problem-solving sections in order', () => {
            expect(problemResolving).toContain('## 一、问题现象')
            expect(problemResolving).toContain('## 二、定位分析')
            expect(problemResolving).toContain('## 三、问题根因')
            expect(problemResolving).toContain('## 四、规避手段')
            expect(problemResolving).toContain('## 五、解决方案')
            expect(problemResolving.indexOf('一、问题现象')).toBeLessThan(
                problemResolving.indexOf('五、解决方案')
            )
        })

        it('should start with an empty level-1 title', () => {
            expect(problemResolving.startsWith('# \n\n')).toBe(true)
        })
    })

    describe('thesisTemplates', () => {
        it('should contain cover title, abstract and keywords placeholders', () => {
            expect(thesisTemplates).toContain('文章标题（宋体，一般不超过20字）')
            expect(thesisTemplates).toContain('**【摘要】**：')
            expect(thesisTemplates).toContain('**【关键词】**：')
        })

        it('should contain three chapters and the closing sections', () => {
            expect(thesisTemplates).toContain('## 第一章 xxx')
            expect(thesisTemplates).toContain('## 第二章 xxx')
            expect(thesisTemplates).toContain('## 第三章 xxx')
            expect(thesisTemplates).toContain('结束语、结论')
            expect(thesisTemplates).toContain('参考文献')
        })

        it('should contain reference placeholders', () => {
            expect(thesisTemplates).toContain('- [作者，题目，刊物，卷(期)：起止页码]()')
            expect(thesisTemplates).toContain('- [作者，题目，出版社，出版者，年：起止页码]()')
        })
    })

    describe('thesisCoverPage', () => {
        it('should contain cover image, big title and author placeholders', () => {
            expect(thesisCoverPage).toContain('![一个图片]()')
            expect(thesisCoverPage).toContain('font-size: 60px')
            expect(thesisCoverPage).toContain('作者信息')
            expect(thesisCoverPage).toContain('一句话简介')
        })
    })
})
