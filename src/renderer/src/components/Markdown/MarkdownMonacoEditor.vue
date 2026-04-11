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
let editorInstance: monaco.editor.IStandaloneCodeEditor

// 初始化编辑器
onMounted(() => {
    if (monacoEditorContainer.value) {
        monacoEditorContainer.value.style.width = '100%'
        monacoEditorContainer.value.style.height = '100%'
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
            editorInstance.layout()
        }, 100)
    }

    onBeforeUnmount(() => {
        editorInstance.dispose()
    })
})

window.electron.ipcRenderer.on('monaco-editor-insert-after-cursor', (_, context: string) => {
    if (context) {
        editor.InsertAfterCursor(editorInstance, context)
    }
})

window.electron.ipcRenderer.on('monaco-insert-text-block-templates', (_, context: string) => {
    if (context) {
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
    editorInstance.trigger('keyboard', option, {})
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

onMounted(() => {
    EventBus.$on('monaco-editor-update-header-format', (value: string) => {
        editor.UpdateContext(editorInstance, value)
    })
    EventBus.$on('monaco-editor-update-font-format', (value: string) => {
        editor.UpdateContext(editorInstance, value)
    })
    EventBus.$on('monaco-editor-insert-text', (value: string) => {
        editor.InsertAfterCursor(editorInstance, value)
    })
    EventBus.$on('monaco-editor-locate-target-line', (item: MarkdownTOC) => {
        editorInstance.revealLines(
            item.lineNumber,
            item.lineNumber + 20,
            monaco.editor.ScrollType.Smooth
        )
    })

    // 监听视图切换后的重新布局事件
    EventBus.$on('monaco-editor-relayout', () => {
        if (editorInstance) {
            editorInstance.layout()
        }
    })

    // 监听编辑器配置更新
    window.electron.ipcRenderer.on('baize-notes:editor-setting-updated', (_, settings: any) => {
        console.log('baize-notes:editor-setting-updated:', settings)
        if (editorInstance) {
            editor.updateEditorOptions(editorInstance, settings)
        }
    })

    // 监听编辑器配置初始化
    window.electron.ipcRenderer.on('baize-notes:init-editor-setting', (_, settings: any) => {
        console.log('baize-notes:init-editor-setting:', settings)
        if (editorInstance) {
            editor.updateEditorOptions(editorInstance, settings)
        }
    })

    onBeforeUnmount(() => {
        EventBus.$off('monaco-editor-update-header-format', (value: string) => {
            editor.UpdateContext(editorInstance, value)
        })
        EventBus.$off('monaco-editor-update-font-format', (value: string) => {
            editor.UpdateContext(editorInstance, value)
        })
        EventBus.$on('monaco-editor-insert-text', (value: string) => {
            editor.InsertAfterCursor(editorInstance, value)
        })
        EventBus.$on('monaco-editor-locate-target-line', (value: string) => {
            editor.InsertAfterCursor(editorInstance, value)
        })
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
