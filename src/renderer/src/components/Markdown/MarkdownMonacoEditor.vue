<template>
    <div
        id="monaco-editor-container"
        ref="monacoEditorContainer"
        class="monaco-editor-container"
    ></div>
</template>

<script setup lang="ts">
// 引入 Monaco Editor
import { registerCustomLanguages } from './register-languages'
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import EventBus from '../../common/event_bus/event-bus'
import * as editor from './hemy-editor'
import { MarkdownTOC } from '../../../../main/global-types'

// 定义 emit 函数
const emit = defineEmits(['update:code'])

const props = defineProps({
    // 代码内容
    code: {
        type: String,
        default: 'test'
    },
    // 编辑器宽度
    editorAreaWidth: {
        type: String,
        default: '50%'
    },
    // 文件路径
    filePath: {
        type: String,
        default: ''
    }
})

const monacoEditorContainer = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
//let model: monaco.editor.ITextModel | null = null
//const registeredActions: string[] = []
//const registeredDecorations: string[] = []

// 定义 IPC 监听器处理函数（用于正确清理）
const handleInsertAfterCursorIPC = (_: any, context: string) => {
    if (context && editorInstance) {
        editor.InsertAfterCursor(editorInstance, context)
    }
}

const handleInsertTextBlockTemplates = (_: any, context: string) => {
    if (context && editorInstance) {
        editor.InsertAfterCursor(editorInstance, context)
    }
}

const handleUpdateOptions = (_: any, option: string, newValue: string) => {
    editor.OptMaps[option](editorInstance, newValue)
}

const handleTriggerUndoRedo = (_: any, option: string) => {
    if (editorInstance) {
        editorInstance.trigger('keyboard', option, {})
    }
}

// 初始化编辑器 - 注册 IPC 监听器
window.electron.ipcRenderer.on('monaco-editor-insert-after-cursor', handleInsertAfterCursorIPC)
window.electron.ipcRenderer.on('monaco-insert-text-block-templates', handleInsertTextBlockTemplates)
window.electron.ipcRenderer.on('baize-notes:monaco-editor-update-options', handleUpdateOptions)
window.electron.ipcRenderer.on('monaco-editor-trigger-undo-redo', handleTriggerUndoRedo)

// 监听代码内容变化
watch(
    () => props.code,
    (newCode) => {
        if (editorInstance) {
            if (newCode.length === 0) {
                newCode = '# '
            }
            //console.log('update code:', newCode)
            editorInstance.setValue(newCode)
        }
    }
)

// 监听文件路径变化,清理旧Model
watch(
    () => props.filePath,
    (newPath, oldPath) => {
        if (oldPath && editorInstance) {
            // 清理旧文件的 model
            const oldUri = monaco.Uri.parse(`file://${oldPath}`)
            const oldModel = monaco.editor.getModel(oldUri)
            if (oldModel) {
                oldModel.dispose()
                console.log(`[Monaco] Disposed model for: ${oldPath}`)
            }
        }

        if (newPath && editorInstance) {
            // 创建或获取新文件的 model
            const newUri = monaco.Uri.parse(`file://${newPath}`)
            let newModel = monaco.editor.getModel(newUri)

            if (!newModel) {
                newModel = monaco.editor.createModel(
                    props.code,
                    'markdown',
                    newUri
                )
                console.log(`[Monaco] Created model for: ${newPath}`)
            }

            editorInstance.setModel(newModel)
        }
    }
)

// 监听父组件区域变化
watch(
    () => props.editorAreaWidth,
    () => {
        // 当父容器宽度变化时，只需要调用 layout() 让 Monaco 重新计算尺寸
        // 不需要设置容器宽度，因为容器始终是 100% 相对于父容器
        if (editorInstance) {
            editorInstance.layout()
        }
    }
)

const handleUpdateContext = (value: string) => {
    if (editorInstance) {
        editor.UpdateContext(editorInstance, value)
    }
}

const handleRelayout = () => {
    if (editorInstance) {
        editorInstance.layout()
    }
}

function handleEditCompResize() {
    if (editorInstance && monacoEditorContainer.value) {
        // 使用 Monaco Editor 的 layout 方法来更新大小
        editorInstance.layout()
    }
}

const handleInsertAfterCursor = (value: string) => {
    if (editorInstance) {
        editor.InsertAfterCursor (editorInstance, value)
    }
}

const handleUpdateEditorOptions = (_event: any, settings: any) => {
    //console.log('handleUpdateEditorOptions', settings)
    if (editorInstance) {
        editor.updateEditorOptions(editorInstance, settings)
    }
}

const handleLocateTargetLine = (item: MarkdownTOC) => {
    if (editorInstance) {
        editorInstance.revealLines(
            item.lineNumber,
            item.lineNumber + 20,
            monaco.editor.ScrollType.Smooth
        )
    }
}

function handleScrollEvent(event) {
    console.log('handleScrollEvent', event)
    EventBus.$emit('monaco-editor-scroll-event', null)
}

onMounted(async () => {
    if (monacoEditorContainer.value) {
        monacoEditorContainer.value.style.width = '100%'
        monacoEditorContainer.value.style.height = '100%'

        // 创建模型

        // 注册自定义语言支持
        registerCustomLanguages()
        /*model = monaco.editor.createModel(
            props.code,
            'markdown',
            monaco.Uri.parse(`file://${props.filePath || 'untitled.md'}`)
        )*/

        editorInstance = monaco.editor.create(
            monacoEditorContainer.value,
            editor.Options,
            editor.Override
        )

        editorInstance.onDidChangeModelContent(() => {
            if (editorInstance != null) {
                const context = editorInstance.getValue()
                emit('update:code', context)
                EventBus.$emit('monaco-editor-statusbar-content-length', context.length)
            }
        })

        editor.DidChange(editorInstance)
        editor.KeyMaps(editorInstance)
        editor.AddActions(editorInstance)
        editor.LoadScript()

        // 初始化后立即布局，确保编辑器尺寸正确
        editorInstance.layout()

        // 延迟再次布局，确保DOM完全渲染后尺寸正确
        setTimeout(() => {
            if (editorInstance) {
                editorInstance.layout()
            }
        }, 100)

        // 主动请求编辑器配置，解决初始化时序问题
        // 主进程的 init-editor-setting 可能在 editorInstance 创建前就已发送
        try {
            const settings = await window.electron.ipcRenderer.invoke('baize-notes:get-editor-setting')
            if (settings && editorInstance) {
                editor.updateEditorOptions(editorInstance, settings)
            }
        } catch (e) {
            console.warn('Failed to get editor setting on mount:', e)
        }
    }

    // 注册 EventBus 监听器
    EventBus.$on('monaco-editor-update-header-format', handleUpdateContext)
    EventBus.$on('monaco-editor-update-font-format', handleUpdateContext)
    EventBus.$on('monaco-editor-insert-text', handleInsertAfterCursor)
    EventBus.$on('monaco-editor-locate-target-line', handleLocateTargetLine)
    EventBus.$on('monaco-editor-relayout', handleRelayout)

    // 注册 IPC 监听器
    // 监听编辑器配置更新
    window.electron.ipcRenderer.on('baize-notes:editor-setting-updated', handleUpdateEditorOptions)
    // 监听编辑器配置初始化
    window.electron.ipcRenderer.on('baize-notes:init-editor-setting', handleUpdateEditorOptions)

    // 窗口事件监听
    editorInstance?.getDomNode()?.addEventListener('scroll', function () {
        console.log('scroll')
    })
    window.addEventListener('resize', handleEditCompResize)
    window.addEventListener('scroll', handleScrollEvent)
})

onBeforeUnmount(() => {
    // 1. 清理 EventBus 监听器
    EventBus.$off('monaco-editor-update-header-format', handleUpdateContext)
    EventBus.$off('monaco-editor-update-font-format', handleUpdateContext)
    EventBus.$off('monaco-editor-insert-text', handleInsertAfterCursor)
    EventBus.$off('monaco-editor-locate-target-line', handleLocateTargetLine)
    EventBus.$off('monaco-editor-relayout', handleRelayout)

    // 2. 清理 IPC 监听器 - 使用具体的监听器函数引用
    window.electron.ipcRenderer.removeListener('monaco-editor-insert-after-cursor', handleInsertAfterCursorIPC)
    window.electron.ipcRenderer.removeListener('monaco-insert-text-block-templates', handleInsertTextBlockTemplates)
    window.electron.ipcRenderer.removeListener('baize-notes:monaco-editor-update-options', handleUpdateOptions)
    window.electron.ipcRenderer.removeListener('monaco-editor-trigger-undo-redo', handleTriggerUndoRedo)
    window.electron.ipcRenderer.removeListener('baize-notes:editor-setting-updated', handleUpdateEditorOptions)
    window.electron.ipcRenderer.removeListener('baize-notes:init-editor-setting', handleUpdateEditorOptions)

    // 3. 清理窗口事件监听器
    window.removeEventListener('resize', handleEditCompResize)
    window.removeEventListener('scroll', handleScrollEvent)

    // 4. 完整清理 Monaco Editor
    if (editorInstance) {
        const model = editorInstance.getModel()
        if (model) {
            // 先分离模型，再销毁
            editorInstance.setModel(null)
            model.dispose()
        }
        editorInstance.dispose()
        editorInstance = null
    }

    // 5. 清理 Monaco 内部缓存（只清理未附加到编辑器的模型）
    monaco.editor.getModels().forEach(model => {
        if (!model.isAttachedToEditor()) {
            model.dispose()
        }
    })
})
</script>

<style scoped>
.monaco-editor-container {
    height: 100%;
    width: 100%;
    overflow: auto;
}
</style>
