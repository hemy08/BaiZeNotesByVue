import mermaid from '../../main/lib/mermaid/dist/mermaid.esm.mjs'

export default function getMermaidSvg(graphDefinition: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      // 使用mermaid的API渲染图表
      mermaid.render('mermaidSvg', graphDefinition, (svgGraph) => {
        // 渲染完成后，svgGraph是包含SVG的字符串
        resolve(svgGraph)
      })
    } catch (error) {
      reject(error)
    }
  })
}
