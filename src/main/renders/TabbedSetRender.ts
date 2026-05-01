/**
 * Tabbed Set 渲染器
 * 将 Markdown 中的 === 语法转换为 tabbed-set tabbed-alternate HTML 结构
 *
 * 核心逻辑：
 * 1. 找到 === "Label" 标记（支持任意缩进）
 * 2. 收集到下一个 === 或 # 之前的所有内容
 * 3. 移除内容相对于 === 的额外缩进（4个空格）
 * 4. 保留原始换行
 * 5. 将处理后的内容传递给 markdown-it 渲染
 */

let tabbedSetCounter = 0

interface TabContent {
    label: string
    content: string
}

/**
 * 计算字符串的前导空格数
 */
function getIndentLevel(line: string): number {
    const match = line.match(/^(\s*)/)
    return match ? match[1].length : 0
}

/**
 * 解析 Tabbed Set
 */
function parseTabbedSet(lines: string[], startIndex: number): { tabs: TabContent[]; endIndex: number } {
    const tabs: TabContent[] = []
    let currentIndex = startIndex

    while (currentIndex < lines.length) {
        const line = lines[currentIndex]
        // 检查是否是新的 tab 定义
        const tabMatch = line.match(/^(\s*)===\s+"([^"]+)"/)
        if (tabMatch) {
            const baseIndent = tabMatch[1].length  // === 的缩进级别

            const tab: TabContent = {
                label: tabMatch[2],
                content: ''
            }

            currentIndex++

            // 收集内容
            const contentLines: string[] = []

            while (currentIndex < lines.length) {
                const nextLine = lines[currentIndex]
                const nextIndent = getIndentLevel(nextLine)
                // 检查是否遇到新的 tab（相同缩进级别的 ===）
                if (nextLine.match(/^(\s*)===\s+"[^"]+"/)) {
                    if (nextIndent == baseIndent) {
                        break // 同级别的 tab，停止收集
                    }

                }

                // 检查是否遇到标题（相同或更小缩进）
                if (nextLine.match(/^#/)) {
                    if (nextIndent == baseIndent) {
                        break // 同级别的 tab，停止收集
                    }
                }

                // 检查是否遇到"<"
                if (nextLine.match(/^</)) {
                    if (nextIndent == baseIndent) {
                        break // 同级别的 tab，停止收集
                    }
                }

                // 移除缩进：基础缩进 + 4个空格
                const expectedIndent = baseIndent + 4
                let processedLine = nextLine

                if (nextIndent >= expectedIndent) {
                    // 移除基础缩进 + 4个空格
                    processedLine = nextLine.substring(expectedIndent)
                } else if (nextLine.trim() === '') {
                    // 空行：移除基础缩进
                    processedLine = nextLine.substring(Math.min(nextIndent, baseIndent))
                }

                contentLines.push(processedLine)
                currentIndex++
            }

            // 保存内容（保留换行，只移除首尾纯空白）
            tab.content = contentLines.join('\n').replace(/^\n+|\n+$/g, '')
            tabs.push(tab)
        } else {
            break;
        }
    }

    return { tabs, endIndex: currentIndex }
}

/**
 * 生成 tabbed-set HTML
 */
function generateTabbedSetHTML(tabs: TabContent[], setId: number): string {
    if (tabs.length === 0) {
        return ''
    }

    const htmlParts: string[] = []

    // <div tabbed-set tabbed-alternate
    htmlParts.push(`<div class="tabbed-set tabbed-alternate" data-tabs="${setId}:${tabs.length}">`)

    tabs.forEach((_, index) => {
        const checked = index === 0 ? ' checked="checked"' : ''
        htmlParts.push(
            `<input${checked} id="__tabbed_${setId}_${index + 1}" name="__tabbed_${setId}" type="radio" />`
        )
    })

    htmlParts.push('<div class="tabbed-labels">')
    tabs.forEach((tab, index) => {
        htmlParts.push(`<label for="__tabbed_${setId}_${index + 1}">${tab.label}</label>`)
    })
    htmlParts.push('</div> <!-- tabbed-labels -->')

    htmlParts.push('<div class="tabbed-content">')
    tabs.forEach((tab) => {
        htmlParts.push('<div class="tabbed-block">\n')
        htmlParts.push(tab.content)
        htmlParts.push('</div>\n <!-- tabbed-block -->')
    })
    htmlParts.push('</div> <!-- tabbed-content -->')
    htmlParts.push('</div> <!-- tabbed-set tabbed-alternate -->')
    return htmlParts.join('\n')
}

/**
 * 渲染 Tabbed Set
 */
export function tabbedSetRender(text: string): string {
    const lines = text.split('\n')
    const result: string[] = []
    let i = 0

    while (i < lines.length) {
        const line = lines[i]

        if (line.match(/^\s*===\s+"[^"]+"/)) {
            const { tabs, endIndex } = parseTabbedSet(lines, i)
            if (tabs.length > 0) {
                tabbedSetCounter++
                const html = generateTabbedSetHTML(tabs, tabbedSetCounter)
                result.push(html)
                i = endIndex
                continue
            }
        }
        result.push(line)
        i++
    }

    return result.join('\n')
}

/**
 * 重置计数器
 */
export function resetTabbedSetCounter(): void {
    tabbedSetCounter = 0
}
