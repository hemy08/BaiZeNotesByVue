function materialParserAdmonitionsContent(text: string[]): { content: string; other: string } {
  let result = ''
  let otherStr = ''
  // 使用 for 循环遍历，跳过首行
  for (let i = 1; i < text.length; i++) {
    const lineStr = text[i]
    console.log('lineStr', lineStr)
    if (lineStr.match(/^ {2}|^\t/)) {
      result += '<p>' + lineStr + '</p>'
    } else {
      otherStr += lineStr
    }
  }
  return {
    content: result,
    other: otherStr
  }
}

function materialParserAdmonitions(text: string): {
  type: string
  title: string
  content: string
  other: string
} {
  const defaults = {
    type: 'undefined',
    title: 'undefined',
    content: 'undefined',
    other: text
  }
  // 字符串按照行分割
  const lines = text.split('\n')
  if (lines.length < 2) {
    return defaults
  }
  // 第一行是type和title
  // 去掉两边的空白，然后按照空格分割，part1是type， part2是title
  const firstLine = lines[0].trim().split(' ')
  //console.log('firstLine', firstLine)
  if (firstLine.length < 2) {
    return defaults
  }
  const typeStr = firstLine[0].trim()
  // 去掉开头和结束的双引号
  const titleStr = firstLine[1].trim().replace(/^"|"$/g, '')
  // 内容项从第二行开始，遍历所有内容，每行内容前后加上<p></p>
  const contentStr = materialParserAdmonitionsContent(lines)
  return {
    type: typeStr,
    title: titleStr,
    content: contentStr.content,
    other: contentStr.other
  }
}

export function materialAdmonitionsPreRender(text: string): string {
  let renderResult = text
  console.log('text', text)
  let match: RegExpExecArray | null = null
  // 匹配字符串中所有以!!!开始的内容（直到遇到另一个!!!、#或者字符串的结尾）
  const regex = /!!!([\s\S]*?)(?=!!!|#|$)/g
  // 使用全局搜索来查找所有匹配项，匹配到的字符串，已经去掉了前缀和后缀
  while ((match = regex.exec(renderResult)) !== null) {
    const content = materialParserAdmonitions(match[1])
    console.log('content', content)
    //const content = materialAdmonitionsParserContent(match[1])
    //console.log('content', content)*/
    const renderHtml =
      `<div class="admonition ${content.type}">` +
      `<p class="admonition-title">${content.title}</p>` +
      `${content.content}</div>` +
      content.other
    renderResult = renderResult.replace(match[0], renderHtml)
  }

  return renderResult
}

export function materialAdmonitionsPostRender(text: string): string {
  return text
}
