import * as monaco from 'monaco-editor'
import EventBus from '../../event-bus'
import { EventHandleMaps } from './hemy-editor-common'

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
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, function () {
    EventHandleMaps['keyboard'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL, function () {
    EventHandleMaps['link'](editor)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, function () {
    EventBus.$emit('monaco-editor-save-file-content-to-disk', true)
  })
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyV, async function () {
    const items = await navigator.clipboard.read()
    let isImage = false
    for (const item of items) {
      // 检查项目类型是否为图片
      // console.log('item.types', item.types)
      let context: Blob
      if (item.types.includes('image/png') || item.types.includes('image/jpeg')) {
        context = await item.getType('image/png') // 或者使用其他 MIME 类型
        const reader = new FileReader()
        reader.onload = function (event) {
          isImage = true
          const context = event.target?.result?.toString()
          if (context) {
            EventHandleMaps['insertimage'](context)
          }
        }
        // 以 DataURL 的形式读取 Blob
        reader.readAsDataURL(context)
      }
    }

    if (!isImage) {
      const text = await navigator.clipboard.readText()
      // console.log('text', text)
      EventHandleMaps['paste'](editor, text)
    }
  })
}

function onDidChange(editor: monaco.editor.IStandaloneCodeEditor) {
  editor.setPosition({ lineNumber: 1, column: 1 })

  // 监听光标位置
  editor.onDidChangeCursorPosition((e) => {
    if (editor != null) {
      EventBus.$emit('monaco-editor-statusbar-cursor-position', e.position)
    }
  })

  /*console.log('onDidChange getScrollTop', editor.getScrollTop())
  console.log('onDidChange getScrollHeight', editor.getScrollHeight())
  console.log('onDidChange getScrollHeight', editor.getScrollHeight())
  console.log('onDidChange getScrollLeft', editor.getScrollLeft())
  console.log('onDidChange editor.getLayoutInfo().contentLeft', editor.getLayoutInfo().contentLeft)
  console.log('onDidChange editor.getLayoutInfo().height', editor.getLayoutInfo().height)
  console.log('onDidChange editor.getLayoutInfo()', editor.getLayoutInfo())*/
}

export const MonacoEditorKeyMaps = registerEditorKeyMaps
export const MonacoEditorDidChange = onDidChange
