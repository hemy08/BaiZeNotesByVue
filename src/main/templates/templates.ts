import { mermaidDiagrams } from './mermaid/mermaidTemplates'
import { plantumlDiagrams } from './plantuml/plantumlTemplates'
import { textBlocks } from './textblock/textblockTemplates'
import { fileTemplates } from './writing/writingTemplates'

const mermaid = mermaidDiagrams
const plantuml = plantumlDiagrams
const texts = textBlocks
const files = fileTemplates

export { mermaid, plantuml, texts, files }
