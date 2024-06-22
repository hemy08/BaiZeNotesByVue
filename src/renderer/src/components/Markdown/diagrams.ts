import { mermaidDiagrams } from '../../../../main/templates/mermaid/mermaidTemplates'
import { plantumlDiagrams } from '../../../../main/templates/plantuml/plantumlTemplates'

import ContextMenu, { MenuItem } from '@imengyu/vue3-context-menu'
import EventBus from '../../event-bus'


const mermaidContextMenuItems = Object.keys(mermaidDiagrams).map((diagram) => {
  return {
    label: mermaidDiagrams[diagram].label, // 根据类别设置标签
    onClick: () => {
      EventBus.$emit('monaco-editor-insert-text', mermaidDiagrams[diagram].diagram)
    }
  }
})

const plantumlContextMenuItems = Object.keys(plantumlDiagrams).map((diagram) => {
  return {
    label: plantumlDiagrams[diagram].label, // 根据类别设置标签
    onClick: () => {
      EventBus.$emit('monaco-editor-insert-text', plantumlDiagrams[diagram].diagram)
    }
  }
})

export function handleMermaidContextMenu(e: MouseEvent) {
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    items: mermaidContextMenuItems as MenuItem[]
  })
}

export function handlePlantUmlContextMenu(e: MouseEvent) {
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    items: plantumlContextMenuItems as MenuItem[]
  })
}
