<template>
    <div
        id="monaco-editor-container"
        ref="monacoEditorContainer"
        class="monaco-editor-container"
    ></div>
</template>

<script setup lang="ts">
// 引入 Monaco Editor
import * as monaco from 'monaco-editor'
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import EventBus from '../../event-bus'
import * as editor from './hemy-editor'
import { MarkdownTOC } from '../hemy'

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
    }
})

const monacoEditorContainer = ref<HTMLElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
//let model: monaco.editor.ITextModel | null = null
//const registeredActions: string[] = []
//const registeredDecorations: string[] = []

// 初始化编辑器
onMounted(() => {
    if (monacoEditorContainer.value) {
        monacoEditorContainer.value.style.width = '100%'
        monacoEditorContainer.value.style.height = '100%'

        // 创建模型
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
                editorInstance.layout ()
            }
        }, 100)
    }

    onBeforeUnmount(() => {
        if (editorInstance) {
            editorInstance.dispose()
            editorInstance = null
        }
    })
})

window.electron.ipcRenderer.on('monaco-editor-insert-after-cursor', (_, context: string) => {
    if (context && editorInstance) {
        editor.InsertAfterCursor(editorInstance, context)
    }
})

window.electron.ipcRenderer.on('monaco-insert-text-block-templates', (_, context: string) => {
    if (context && editorInstance) {
        editor.InsertAfterCursor(editorInstance, context)
    }
})

window.electron.ipcRenderer.on(
    'baize-notes:monaco-editor-update-options',
    (_, option: string, newValue: string) => {
        editor.OptMaps[option](editorInstance, newValue)
    }
)

window.electron.ipcRenderer.on('monaco-editor-trigger-undo-redo', (_, option: string) => {
    if (editorInstance) {
        editorInstance.trigger ('keyboard', option, {})
    }
})

// 监听代码内容变化
watch(
    () => props.code,
    (newCode) => {
        if (editorInstance) {
            if (newCode.length === 0) {
                newCode = '# '
            }
            console.log('update code:', newCode)
            editorInstance.setValue(newCode)
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
        editor.UpdateContext (editorInstance, value)
    }
}

const handleInsertAfterCursor = (value: string) => {
    if (editorInstance) {
        editor.InsertAfterCursor (editorInstance, value)
    }
}

const handleUpdateEditorOptions = (settings: any) => {
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

const handleRelayout = () => {
    if (editorInstance) {
        editorInstance.layout()
    }
}

onMounted(() => {
    EventBus.$on('monaco-editor-update-header-format', handleUpdateContext)
    EventBus.$on('monaco-editor-update-font-format', handleUpdateContext)
    EventBus.$on('monaco-editor-insert-text', handleInsertAfterCursor)
    EventBus.$on('monaco-editor-locate-target-line', handleLocateTargetLine)
    EventBus.$on('monaco-editor-relayout', handleRelayout)

    // 监听编辑器配置更新
    window.electron.ipcRenderer.on('baize-notes:editor-setting-updated', handleUpdateEditorOptions)

    // 监听编辑器配置初始化
    window.electron.ipcRenderer.on('baize-notes:init-editor-setting', handleUpdateEditorOptions)

    onBeforeUnmount(() => {
        EventBus.$off('monaco-editor-update-header-format', handleUpdateContext)
        EventBus.$off('monaco-editor-update-font-format', handleUpdateContext)
        EventBus.$off('monaco-editor-insert-text', handleInsertAfterCursor)
        EventBus.$off('monaco-editor-locate-target-line', handleLocateTargetLine)
        EventBus.$off('monaco-editor-relayout', handleRelayout)
    })
})

onMounted(() => {
    function handleEditCompResize() {
        if (editorInstance && monacoEditorContainer.value) {
            // 使用 Monaco Editor 的 layout 方法来更新大小
            editorInstance.layout()
        }
    }

    function handleScrollEvent(event) {
        console.log('handleScrollEvent', event)
        EventBus.$emit('monaco-editor-scroll-event', null)
    }

    editorInstance?.getDomNode()?.addEventListener('scroll', function () {
        console.log('scroll')
    })

    window.addEventListener('resize', handleEditCompResize)
    window.addEventListener('scroll', handleScrollEvent)

    // 销毁编辑器实例
    onBeforeUnmount(() => {
        // 完整清理
        if (editorInstance) {
            const model = editorInstance.getModel()
            if (model) {
                model.dispose() // 清理模型
            }
            editorInstance.dispose() // 清理编辑器
            // editorInstance = null
        }

        // 清理Monaco内部缓存
        monaco.editor.getModels().forEach(model => {
            if (!model.isAttachedToEditor()) {
                model.dispose()
            }
        })
        window.removeEventListener('resize', handleEditCompResize)
    })
})
</script>

<style scoped>
.monaco-editor-container {
    height: 100%;
    width: 100%;
    overflow: auto;
    /* 隐藏水平滚动条 */
    overflow-x: hidden;
    overflow-y: hidden;
}
</style>
