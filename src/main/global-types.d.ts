import * as monaco from 'monaco-editor'
// global-types.d.ts
declare global {
  interface FileProperties {
    name: string
    path: string
    type: 'file' | 'folder'
    content: string
    children?: []
  }

  interface GlobalEmoji {
    file_icon: string
    folder_open: string
    folder_close: string
  }

  interface GlobalSvg {
    file_icon: string
    folder_collapse_close: string
    folder_collapse_open: string
    folder_open: string
    folder_close: string
    md_file_svg: string
    png_file_svg: string
    jpg_file_svg: string
  }

  interface GlobalEditToolBar {
    Font: string
  }

  interface Global extends NodeJS.Global {
    __current_active_file?: FileProperties // 使用 ? 表示它可能是 undefined
    MainShowWarn: string
    SavingFile: boolean
    SaveFileInterval: string
    Emoji: GlobalEmoji
    FileMgrSvgs: GlobalSvg
    EditorToolBar: GlobalEditToolBar
    mdEditor: monaco.editor.IStandaloneCodeEditor
    mdFileTree: ''
    MonacoEditorConfig: monaco.editor.IStandaloneEditorConstructionOptions
    KatexConfig: NonNullable<unknown>
    SupportLanguage: []
  }
}
