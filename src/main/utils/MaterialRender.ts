function materialParserAdmonitionsContent(text: string): {
  type: string
  title: string
  content: string
} {
  return {
    type: 'note',
    title: 'string',
    content: text
  }
}

export function materialAdmonitions(text: string): string {
  let renderResult = text
  let match: RegExpExecArray | null = null
  // 匹配字符串中所有以!!!开始的内容（直到遇到另一个!!!、#或者字符串的结尾）
  const regex = /!!!([\s\S]*?)(?=!!!|#|$)/g
  // 使用全局搜索来查找所有匹配项，匹配到的字符串，已经去掉了前缀和后缀
  while ((match = regex.exec(renderResult)) !== null) {
    console.log('title', match[1])
    const content = materialParserAdmonitionsContent(match[1])
    //console.log('title', title)
    //const content = materialAdmonitionsParserContent(match[1])
    //console.log('content', content)*/
    const renderHtml =
      `<div class="admonition ${content.content}">` +
      `<p class="admonition-title">${content.title}</p>` +
      `<p>${content.content}</p></div><br><br>`
    renderResult = renderResult.replace(match[0], renderHtml)
  }

  return renderResult
}
