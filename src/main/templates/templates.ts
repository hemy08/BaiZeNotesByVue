import { mermaidTemplates } from './mermaid/mermaidTemplates'
import { plantUmlTemplates } from './plantuml/plantumlTemplates'
import { textBlockTemplates } from './textblock/textblockTemplates'
import { writeTemplates } from './writing/writingTemplates'

export class hemyTemplates {
  mermaid: mermaidTemplates
  plantuml: plantUmlTemplates
  textblock: textBlockTemplates
  writing: writeTemplates

  constructor() {
    this.mermaid = new mermaidTemplates()
    this.plantuml = new plantUmlTemplates()
    this.textblock = new textBlockTemplates()
    this.writing = new writeTemplates()
  }
}
