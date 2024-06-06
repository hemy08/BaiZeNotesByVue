import { KatexRenderMathInText } from './KatexRender'
import { MermaidRenderAllGraph } from './MermaidRender'

export function HemyRender(text: string): string {
  console.log('text111 ', text)
  let result = KatexRenderMathInText(text)
  console.log('katex result = ', result)
  result = MermaidRenderAllGraph(result)
  console.log('mermaid result = ', result)
  return result
}
