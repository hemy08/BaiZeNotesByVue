function materialAdmonitionsParserContent(text: string): string {
  // 因为匹配的字符串，已经去掉了"!!! note "前缀，直接进行分割即可
  // 使用第一个换行符来分割字符串，获取 "!!! note " 后面的内容
  console.log('text', text)
  const content = text.split('\n')
  console.log('content', content)
  // 如果 remainingText 以换行符开始，则去掉它
  /*if (content.startsWith('\n')) {
    content = content.substring(1)
  }*/

  return content.slice(1).join('\n')
}

function materialAdmonitionsParserTitle(text: string): string {
  // 因为匹配的字符串，已经去掉了"!!! note "前缀，直接进行分割即可
  // 使用 split 分割字符串，找到第一个和第二个双引号之间的内容
  const parts = text.split('"')
  if (parts.length >= 3) {
    return parts[1]
  }
  return ''
}

export function materialAdmonitions(text: string): string {
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /^!!! note ([\s\S]*?)\n\s*\n$/g
  // 使用全局搜索来查找所有匹配项，匹配到的字符串，已经去掉了前缀和后缀
  while ((match = regex.exec(text)) !== null) {
    const title = materialAdmonitionsParserTitle(match[1])
    console.log('title', title)
    const content = materialAdmonitionsParserContent(match[1])
    console.log('content', content)
    const renderHtml =
      '<div class="admonition note" style="border-color: #448aff"><p class="admonition-title">"' +
      title +
      '"</p><p>"' +
      content +
      '"</p> </div>' +
      '\n\n'
    renderResult = renderResult.replace(match[0], renderHtml)
  }

  console.log('renderResult', renderResult)

  return renderResult
}
