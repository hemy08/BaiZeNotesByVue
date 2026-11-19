<template>
    <div class="mermaid"></div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch } from 'vue'
import mermaid from 'mermaid'
import { t } from '../../common/i18n'
import { MERMAID_INIT_CONFIG } from './hemy-editor-render'
import { escapeHtml } from '../../../../shared/utils/html'
import { randomAlnum } from '../../../../shared/utils/random'

// P2 死通道清理：原 mermaidContainer 模板 ref 仅服务已删除的 OVERLAY.MERMAID_GRAPH_DEF
// 监听（把主进程推送的图定义直接写入容器）；渲染结果现统一经 emit 交给父组件预览链路。

const props = defineProps({
    graphCode: {
        type: String,
        default: ''
    }
})

const emit = defineEmits(['mermaid-render-result'])

// FUN-21：mermaid.render 要求传入 id 全局唯一，固定 id 第二次渲染会报错。
// 每次渲染生成唯一 id，渲染结束后清理 mermaid 遗留的临时节点。
// 迁移（渲染层公共接口归位）：随机尾串改用 `shared/utils/random.randomAlnum`（6 位字母数字），
// 与原 `Math.random().toString(36).substring(2, 8)` 语义等价（仅用作非安全场景的 DOM id 随机段，
// 且不引入 `:` 等需要转义的字符，避免 id 选择器失效）。
function generateUniqueMermaidId(): string {
    return 'mermaidContainer-' + Date.now() + '-' + randomAlnum(6)
}

function removeMermaidTempDiv(mermaidId: string): void {
    const tempElement = document.getElementById('d' + mermaidId)
    if (tempElement) {
        tempElement.remove()
    }
}

// HTML 转义（FUN-21：错误回显中的图表源码/错误信息避免注入）
// 迁移（渲染层公共接口归位）：原本地实现已删除，统一复用 `shared/utils/html.escapeHtml`
// （5 字符转义、`&` 最先替换，与原实现逐字等价；与 hemy-editor-render 的错误回显同源）。

// FUN-21：渲染失败降级为"源码回显 + 错误提示"，不再静默空白
function buildErrorHtml(graphCode: string, error: unknown): string {
    const errMessage = error instanceof Error ? error.message : String(error)
    return (
        '<div class="mermaid-render-error" style="border:1px solid #d97706;border-radius:4px;' +
        'padding:8px 12px;background:#fff7ed;color:#9a3412;">' +
        '<p style="margin:0 0 6px;font-weight:600;">' +
        t('editorUi.render.mermaidFailed') +
        '</p>' +
        '<pre style="margin:0 0 6px;white-space:pre-wrap;"><code>' +
        escapeHtml(graphCode) +
        '</code></pre>' +
        '<p style="margin:0;font-size:12px;">' +
        t('editorUi.render.errorInfo') +
        escapeHtml(errMessage) +
        '</p></div>'
    )
}

onMounted(() => {
    // 2026-11-15：与 hemy-editor-render 共用同一初始化配置——htmlLabels: false 保证标签用
    // SVG <text> 渲染，避免被预览管线的 DOMPurify svg 白名单移除 foreignObject 后文字丢失。
    mermaid.initialize(MERMAID_INIT_CONFIG)
})

// P2 死通道清理：原 OVERLAY.MERMAID_GRAPH_DEF 监听 + handleMermaidGraphDef 已删除
// ——主进程零发送方；Mermaid 渲染唯一路径为下方 watch 中的 npm mermaid 包本地渲染。

let mermaidDebounceTimer: ReturnType<typeof setTimeout> | null = null
const MERMAID_DEBOUNCE_DELAY = 300

// 监听代码内容变化（带防抖）
watch(
    () => props.graphCode,
    async (newCode) => {
        if (mermaidDebounceTimer) {
            clearTimeout(mermaidDebounceTimer)
        }
        mermaidDebounceTimer = setTimeout(async () => {
            // FUN-21：使用唯一 id 渲染，避免固定 id 导致的重复渲染报错
            const uniqueId = generateUniqueMermaidId()
            try {
                const renderSvg = await mermaid.render(uniqueId, newCode)
                removeMermaidTempDiv(uniqueId)
                emit(
                    'mermaid-render-result',
                    '<pre class="mermaid"><code>' + renderSvg.svg + '</code></pre>'
                )
            } catch (error) {
                // FUN-21：渲染失败回显源码 + 错误提示（降级显示）
                removeMermaidTempDiv(uniqueId)
                emit('mermaid-render-result', buildErrorHtml(newCode, error))
            }
        }, MERMAID_DEBOUNCE_DELAY)
    }
)

onBeforeUnmount(() => {
    if (mermaidDebounceTimer) {
        clearTimeout(mermaidDebounceTimer)
    }
})
</script>

<style scoped>
.mermaid {
    width: 100%;
    font-size: 14px;
}
</style>
