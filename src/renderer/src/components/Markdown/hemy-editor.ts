import { OnInsertAfterCursor, replaceSelection, UpdateContextFormat } from './hemy-editor-common'
import { MdEditQuickAccess } from './hemy-editor-quick-access'
import { MonacoEditorDidChange, MonacoEditorKeyMaps } from './hemy-editor-shortcut'
import { LoadLocalScript, MonacoEditorAddActions } from './hemy-editor-actions'
import * as Render from './hemy-editor-render'
import { MonacoEditorOptions, MonacoEditorOverride } from './editor-options'
import { updateEditorOptions } from './editor-option-maps'
import {
    UpdateLineNumber,
    UpdateEditorTheme,
    UpdateTableSize,
    UpdateFontSize,
    UpdateRenderWhitespace,
    MonacoEditorOpMaps
} from './editor-utils'

const Options = MonacoEditorOptions
const Override = MonacoEditorOverride
const OptMaps = MonacoEditorOpMaps
const QuickAccess = MdEditQuickAccess
const KeyMaps = MonacoEditorKeyMaps
const DidChange = MonacoEditorDidChange
const InsertAfterCursor = OnInsertAfterCursor
const UpdateContext = UpdateContextFormat
export { updateEditorOptions }

const AddActions = MonacoEditorAddActions
const LoadScript = LoadLocalScript

export {
    UpdateContext,
    InsertAfterCursor,
    KeyMaps,
    DidChange,
    AddActions,
    replaceSelection,
    LoadScript,
    Options,
    Override,
    QuickAccess,
    Render,
    OptMaps,
    UpdateLineNumber,
    UpdateEditorTheme,
    UpdateTableSize,
    UpdateFontSize,
    UpdateRenderWhitespace
}
