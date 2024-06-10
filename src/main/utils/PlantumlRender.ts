async function renderPlantUML(plantumlCode: string): Promise<string | null> {
  try {
    const response = await fetch('http://www.plantuml.com/plantuml/svg/', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: `uml=${encodeURI(plantumlCode)}`
    })

    console.log('encodeURIComponent plantumlCode', `uml=${encodeURI(plantumlCode)}`)

    if (!response.ok) {
      throw new Error(`Failed to fetch PlantUML: ${response.status}`)
    }

    return await response.text()
  } catch (error) {
    console.error('Error rendering PlantUML:', error)
    return null
  }
}

// 字符串匹配，获取到svg数据，这个实际上是svg页面的地址
function extractSvgUrl(html: string) {
  const regex = /<a id="urlsvg" [^>]+href="([^"]+)">SVG<\/a>/
  const match = html.match(regex)
  return match ? match[1] : null
}

async function fetchSvgContent(svgUrl: string) {
  try {
    const response = await fetch(svgUrl)
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`)
    }
    // 获取SVG文本内容
    return await response.text()
  } catch (error) {
    console.error('Fetch error:', error)
    return null
  }
}

async function renderPlantUMLSvgString(graphDesc: string) {
  console.log('renderPlantUMLSvgString', graphDesc)
  // 发送给服务器页面，获取响应数据
  return renderPlantUML(graphDesc).then((html) => {
    // 响应的结果是一个html页面，需要从中解析得到svg数据
    if (html) {
      // 解析得到svg的url地址
      const svgUrl = extractSvgUrl(html)
      console.log('svgUrl', svgUrl)
      if (svgUrl) {
        // 从url地址发送消息，获取页面内容
        return fetchSvgContent('https:' + svgUrl).catch((error) => {
          console.error('Failed to fetch SVG:', error)
          throw error
        })
      }
    }

    return Promise.reject(new Error('No SVG URL found in the response HTML.'))
  })
}

async function plantumlRenderFromServer(text: string): Promise<string> {
  // 正则表达式匹配以 ```plantuml 开头和```结尾的文本（简单版本，不处理转义字符或嵌套）
  let renderResult = text
  let match: RegExpExecArray | null = null
  const regex = /```plantuml([\s\S]*?)```/g
  // 使用全局搜索来查找所有匹配项
  while ((match = regex.exec(text)) !== null) {
    const graphDesc = match[1]
    let plantumlRenderSvgString = ''
    // 发送给服务器进行渲染
    try {
      const result = await renderPlantUMLSvgString(graphDesc)
      if (result) {
        plantumlRenderSvgString = result
      }
    } catch (error) {
      console.error('Fetch error:', error)
    }

    console.log('plantumlRenderSvgString', plantumlRenderSvgString)
    // 替换原有文字内容
    plantumlRenderSvgString =
      '<div><pre class="plantuml"><code style="height: auto;display: flex">' +
      plantumlRenderSvgString +
      '</code></pre></div>'
    renderResult = renderResult.replace(match[0], plantumlRenderSvgString)
  }

  return renderResult
}

export { plantumlRenderFromServer }
