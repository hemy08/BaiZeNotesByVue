import * as monaco from 'monaco-editor'
import EventBus from '../../event-bus'
import { EventHandleMaps } from './monaco-editor-common'

function registerEditorKeyMaps(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit1, function () {
    EventHandleMaps['h1'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit2, function () {
    EventHandleMaps['h2'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit3, function () {
    EventHandleMaps['h3'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit4, function () {
    EventHandleMaps['h4'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit5, function () {
    EventHandleMaps['h5'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Digit6, function () {
    EventHandleMaps['h6'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, function () {
    EventHandleMaps['bold'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, function () {
    EventHandleMaps['italic'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyD, function () {
    EventHandleMaps['deleteline'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, function () {
    EventHandleMaps['underline'](editor)
  })
}

export function monacoEditorEvent(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.setPosition({ lineNumber: 1, column: 1 })

  // 监听光标位置
  editor.onDidChangeCursorPosition((e) => {
    if (editor != null) {
      EventBus.$emit('monaco-editor-cursor-position', e.position)
    }
  })

  editor.onDidPaste((e) => {
    console.log('onDidPaste ', e)
  })

  registerEditorKeyMaps(editor)
}
