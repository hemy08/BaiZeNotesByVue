<template>
    <!--
        1.5.7 LLM Wiki L3：AI ingest diff 审批 UI（BaseDialog 外壳，不复制 dialog 结构与 a11y 行为）。
        打开即调用 IPC.AI.INGEST 生成草案与行级 diff（主进程不写盘）；用户「确认应用」后
        才调用 IPC.AI.APPLY_INGEST 写入 wiki/；「取消/关闭」不改变任何磁盘内容（回滚语义）。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('editorUi.llmIngest.title')"
        width-size="complex"
        reset-position-on-open
        container-class="llm-ingest-diff-dialog"
        @close="handleClose"
    >
        <div class="llm-ingest-diff" data-testid="llm-ingest-diff">
            <!-- 生成中 -->
            <div v-if="loading" class="ingest-loading" data-testid="ingest-loading">
                <span class="ingest-spinner" aria-hidden="true"></span>
                <span>{{ t('editorUi.llmIngest.loading') }}</span>
            </div>

            <!-- 生成失败（结构化错误 + 引导提示） -->
            <div v-else-if="loadError" class="ingest-error-block" data-testid="ingest-error">
                <p class="ingest-error-title">
                    {{ t('editorUi.llmIngest.loadFailed', { error: loadError }) }}
                </p>
                <p v-if="loadErrorHint" class="ingest-error-hint">{{ loadErrorHint }}</p>
            </div>

            <!-- 审批内容：展示部分复用批量编译批次抽取的共享子组件（两处 diff 口径一致） -->
            <template v-else-if="draft">
                <LlmIngestDiffView :draft="draft" />

                <p v-if="appliedPath" class="ingest-applied" data-testid="ingest-applied">
                    {{ t('editorUi.llmIngest.applied', { path: appliedPath }) }}
                </p>
                <p v-if="applyError" class="ingest-apply-error" data-testid="ingest-apply-error">
                    {{ t('editorUi.llmIngest.applyFailed', { error: applyError }) }}
                </p>
            </template>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn btn-cancel"
                :disabled="applying"
                @click="handleClose"
            >
                {{ t('editorUi.llmIngest.close') }}
            </button>
            <button
                v-if="canApply"
                type="button"
                class="dialog-btn dialog-btn--primary btn btn-confirm"
                :disabled="applying || appliedPath !== ''"
                data-testid="ingest-apply-btn"
                @click="handleApply"
            >
                {{ applying ? t('editorUi.llmIngest.applying') : t('editorUi.llmIngest.apply') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 1.5.7 LLM Wiki L3：AI ingest diff 审批组件（计划 §5.3 任务 T3.3）
 *
 * ## 职责
 * - 打开时调用 `IPC.AI.INGEST`（无参 = 主进程扫描 raw/ 取首个可处理文件）生成 wiki 页面草案；
 * - 展示「原始资料 → 目标页面」元信息 + 行级 diff（新增/删除/上下文行 + 行号高亮）；
 * - 「确认应用」= `IPC.AI.APPLY_INGEST({ draftPath, content, approved: true })` 写入 wiki/；
 *   失败显示内联原因（结构化 code 的 message，不抛堆栈）；成功显示写入路径；
 * - 「取消 / 关闭」不写盘（回滚语义：草案只存在于主进程返回值与本组件内存中）。
 *
 * ## 边界
 * - 只经白名单 IPC 通道（AI.INGEST / AI.APPLY_INGEST），不直接接触文件系统；
 * - 不改变既有编辑器行为：不打开/修改活动文档，写盘后用户可自行刷新工作区；
 * - 主题：全部颜色走 `--ui-*` / `--theme-*` 变量（禁止硬编码主题色）；
 * - 展示部分（元信息 + 行级 diff）复用批量编译批次抽取的共享子组件
 *   `components/llm-wiki/LlmIngestDiffView.vue`，保证单文件与批量审批口径一致。
 */
import { computed, ref, watch } from 'vue'
import type { AiDiffLine, AiIngestSuccess } from '../../../../shared/types/ai'
import { IPC } from '../../../../shared/ipc-channels'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import BaseDialog from '../dialogs/BaseDialog.vue'
import LlmIngestDiffView from '../llm-wiki/LlmIngestDiffView.vue'

interface Props {
    /** 显隐开关（真源在宿主组件；由 false → true 时自动开始编译） */
    visible?: boolean
}

const props = withDefaults(defineProps<Props>(), { visible: false })

const emit = defineEmits<{
    (e: 'close'): void
}>()

/** 受限 ipcRenderer 最小结构（与设置页/渲染层其它动作模块同款守卫，不直接依赖 Electron 类型） */
interface LlmIngestIpcRendererLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 取受限 ipcRenderer；非 Electron 环境（测试桩/旧 preload）返回 null */
function getRestrictedIpcRenderer(): LlmIngestIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const ipcRenderer = (window as { electron?: { ipcRenderer?: LlmIngestIpcRendererLike } })
        .electron?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/** 草案状态（null = 尚未生成/生成失败） */
const draft = ref<AiIngestSuccess | null>(null)
/** 生成中 */
const loading = ref(false)
/** 加载/生成失败的可读原因 */
const loadError = ref('')
/** 失败提示补充（未配置/无工作区时的操作引导） */
const loadErrorHint = ref('')
/** 应用写盘进行中 */
const applying = ref(false)
/** 应用失败的可读原因 */
const applyError = ref('')
/** 已成功写入的目标路径（空串 = 尚未应用） */
const appliedPath = ref('')

/** 是否可显示「确认应用」按钮（草案存在且未应用） */
const canApply = computed(() => draft.value !== null && appliedPath.value === '')

/** 读取结构化失败中的可读原因（ok=false 结构） */
function readStructuredFailure(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (record.ok !== false) {
        return null
    }
    if (typeof record.message === 'string' && record.message.length > 0) {
        return record.message
    }
    return typeof record.code === 'string' ? record.code : t('common.unknown')
}

/** 运行时结构守卫：把主进程返回值收敛为 AiIngestSuccess（非法返回 null） */
function readIngestSuccess(raw: unknown): AiIngestSuccess | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (record.ok !== true) {
        return null
    }
    if (
        typeof record.draftPath !== 'string' ||
        record.draftPath.length === 0 ||
        typeof record.content !== 'string' ||
        typeof record.sourcePath !== 'string'
    ) {
        return null
    }
    const diff = Array.isArray(record.diff)
        ? record.diff.filter((item): item is AiDiffLine => {
              if (!item || typeof item !== 'object') {
                  return false
              }
              const line = item as Record<string, unknown>
              return (
                  (line.type === 'add' || line.type === 'del' || line.type === 'context') &&
                  typeof line.content === 'string'
              )
          })
        : []
    return {
        ok: true,
        draftPath: record.draftPath,
        content: record.content,
        sourcePath: record.sourcePath,
        diff,
        isUpdate: record.isUpdate === true,
        diffTruncated: record.diffTruncated === true,
        model: typeof record.model === 'string' ? record.model : undefined
    }
}

/** 失败时根据结构化 code 给出操作引导（未配置 → 引导到设置页；无工作区 → 引导初始化） */
function resolveErrorHint(raw: unknown): string {
    if (!raw || typeof raw !== 'object') {
        return ''
    }
    const code = (raw as Record<string, unknown>).code
    if (code === 'AI_NOT_CONFIGURED') {
        return t('editorUi.llmIngest.notConfiguredHint')
    }
    if (code === 'AI_WORKSPACE_UNAVAILABLE' || code === 'AI_NO_RAW_FILES') {
        return t('editorUi.llmIngest.noWorkspaceHint')
    }
    return ''
}

/** 复位全部状态（每次打开重新开始；关闭时清空草案，防止误应用旧内容） */
function resetState(): void {
    draft.value = null
    loading.value = false
    loadError.value = ''
    loadErrorHint.value = ''
    applying.value = false
    applyError.value = ''
    appliedPath.value = ''
}

/**
 * 开始一次 AI ingest：调用主进程生成草案 + diff（不写盘）。
 * 失败只显示内联原因与引导，不抛异常、不写盘。
 */
async function startIngest(): Promise<void> {
    resetState()
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        loadError.value = t('editorUi.llmIngest.ipcUnavailable')
        return
    }
    loading.value = true
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.INGEST, {})
        const failure = readStructuredFailure(raw)
        if (failure !== null) {
            loadError.value = failure
            loadErrorHint.value = resolveErrorHint(raw)
            return
        }
        const success = readIngestSuccess(raw)
        if (success === null) {
            loadError.value = t('common.unknown')
            return
        }
        draft.value = success
    } catch (error) {
        logger.error('[LlmIngest] AI 编译失败：', error)
        loadError.value = error instanceof Error ? error.message : String(error)
    } finally {
        loading.value = false
    }
}

/** 确认应用：审批通过后写入 wiki/（主进程再做 Path Guard + raw 只读守卫） */
async function handleApply(): Promise<void> {
    if (applying.value || !draft.value || appliedPath.value !== '') {
        return
    }
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        applyError.value = t('editorUi.llmIngest.ipcUnavailable')
        return
    }
    applying.value = true
    applyError.value = ''
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.APPLY_INGEST, {
            draftPath: draft.value.draftPath,
            content: draft.value.content,
            approved: true
        })
        const failure = readStructuredFailure(raw)
        if (failure !== null) {
            applyError.value = failure
            return
        }
        const record = raw as { draftPath?: unknown } | null
        appliedPath.value =
            typeof record?.draftPath === 'string' && record.draftPath.length > 0
                ? record.draftPath
                : draft.value.draftPath
        logger.info('[LlmIngest] 已写入 wiki 页面：', appliedPath.value)
    } catch (error) {
        logger.error('[LlmIngest] 写入 wiki 页面失败：', error)
        applyError.value = error instanceof Error ? error.message : String(error)
    } finally {
        applying.value = false
    }
}

/** 关闭对话框（不写盘；清空草案后通知宿主） */
function handleClose(): void {
    if (applying.value) {
        return
    }
    resetState()
    emit('close')
}

/** 打开时自动开始编译；关闭时清空状态（防止下次打开残留旧草案） */
watch(
    () => props.visible,
    (visible) => {
        if (visible) {
            void startIngest()
        } else {
            resetState()
        }
    },
    { immediate: true }
)
</script>

<style scoped>
/* 1.5.7 LLM Wiki L3：diff 审批 UI（主题令牌 --ui-* / 既有 --theme-* 兼容变量） */
.llm-ingest-diff {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 160px;
    max-height: 60vh;
    padding: 16px;
    overflow: auto;
    color: var(--text-color);
}

.ingest-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 24px 0;
    font-size: 13px;
    color: var(--secondary-text-color);
}

.ingest-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-color);
    border-top-color: var(--accent-color);
    border-radius: 50%;
    animation: ingest-spin 0.8s linear infinite;
}

@keyframes ingest-spin {
    to {
        transform: rotate(360deg);
    }
}

.ingest-error-block,
.ingest-empty {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
    border: 1px solid var(--ui-danger, var(--danger-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--card-bg);
}

.ingest-error-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--ui-danger, var(--danger-color));
}

.ingest-error-message {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
}

.ingest-error-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--secondary-text-color);
}

.ingest-applied {
    margin: 0;
    font-size: 12px;
    color: var(--ui-success, var(--accent-color));
}

.ingest-apply-error {
    margin: 0;
    font-size: 12px;
    color: var(--ui-danger, var(--danger-color));
}

@media (prefers-reduced-motion: reduce) {
    .ingest-spinner {
        animation: none;
    }
}
</style>
