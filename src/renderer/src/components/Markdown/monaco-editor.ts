import * as monaco from 'monaco-editor'
import { UpdateContextFormat, OnInsertAfterCursor } from './monaco-editor-common'
import { MdEditQuickAccess } from './monaco-editor-quick-access'
import { MonacoEditorKeyMaps, MonacoEditorDidChange } from './monaco-editor-shortcut'
import * as Render from './monaco-editor-render'

const MonacoEditorOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
  value: '',
  language: 'markdown',
  theme: 'default',
  wordWrap: 'on', // 启用自动换行
  automaticLayout: true, // 设置自动布局为 true
  minimap: {
    enabled: false //关闭小型缩略图，它显示整个文档的概览，并且允许用户快速导航到文档的不同部分。
  },
  tabSize: 4,
  fontFamily: 'Hack',
  fontSize: 16,
  lineNumbers: 'on'
}

const MonacoEditorOverride: monaco.editor.IEditorOverrideServices = {}

const Options = MonacoEditorOptions
const Override = MonacoEditorOverride
const QuickAccess = MdEditQuickAccess
const KeyMaps = MonacoEditorKeyMaps
const DidChange = MonacoEditorDidChange
const InsertAfterCursor = OnInsertAfterCursor
const UpdateContext = UpdateContextFormat

export {
  UpdateContext,
  InsertAfterCursor,
  KeyMaps,
  DidChange,
  Options,
  Override,
  QuickAccess,
  Render
}
