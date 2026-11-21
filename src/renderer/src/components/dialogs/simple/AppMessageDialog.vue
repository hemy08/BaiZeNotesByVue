<template>
    <!--
        通用应用内消息/确认对话框（2026-11-21：替换主进程全部用户可见原生 dialog.showMessageBox）。

        由主进程 `utils/app-message-box.ts` 的 showAppMessageBox() 经
        IPC.DIALOG.APP_MESSAGE_REQUEST 请求展示；本组件只负责展示与 emit 选择，
        选择经 IPC.DIALOG.APP_MESSAGE_SUBMIT 回传主进程（见 useAppMessageBox.ts）。

        受控约定：visible/kind/title/message/detail/buttons/defaultId/cancelId 全部来自主进程
        载荷（文案已由主进程按当前语言本地化），本组件不修改状态。
    -->
    <BaseDialog
        :visible="visible"
        :title="title"
        :aria-describedby="messageId"
        width="480px"
        reset-position-on-open
        :close-on-overlay="false"
        :container-class="['app-message-dialog', `app-message-dialog--${kind}`]"
        @close="handleCancel"
    >
        <div ref="contentRef" class="content">
            <p :id="messageId" class="message">{{ message }}</p>
            <p v-if="detail" class="detail">{{ detail }}</p>
        </div>

        <template #footer>
            <button
                v-for="button in buttons"
                :key="button.id"
                type="button"
                :class="buttonClass(button)"
                :data-button-id="button.id"
                :data-default="button.id === resolvedDefaultId ? 'true' : undefined"
                @click="handleChoose(button.id)"
            >
                {{ button.label }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 通用应用内消息/确认对话框（BaseDialog 外壳）。
 *
 * UI-11/12/13：复用 BaseDialog（overlay/title-bar/footer/动画/拖拽），不复制外壳结构；
 * 容器 role="dialog" + aria-modal + aria-labelledby 由 BaseDialog 提供，正文经
 * aria-describedby 关联为描述；打开时把焦点移到 defaultId 对应按钮（与旧原生框
 * defaultId 语义等价）；Esc / 标题栏关闭按钮 → cancelId（与原生框 cancelId 语义等价）；
 * Tab/Shift+Tab 焦点陷阱与 body 滚动锁由 BaseDialog 既有能力提供。
 * 遮罩外点击显式禁用：与原生消息框一致，避免误触关闭安全确认类对话。
 */
import { computed, nextTick, ref, useId, watch } from 'vue'
import type { AppMessageBoxButton, AppMessageBoxKind } from '../../../../../shared/types'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    /** 显隐开关（真源在控制器 useAppMessageBox） */
    visible: boolean
    /** 消息框类型（info / warning / error / confirm，仅用于视觉语义） */
    kind?: AppMessageBoxKind
    /** 标题（主进程已本地化） */
    title: string
    /** 正文（主进程已本地化） */
    message: string
    /** 补充说明（可选） */
    detail?: string
    /** 按钮列表（至少 1 个；缺省为空数组，展示时按空列表兜底） */
    buttons?: AppMessageBoxButton[]
    /** 默认聚焦/回车触发的按钮 id */
    defaultId?: string
    /** 取消语义按钮 id（Esc / 标题栏关闭按钮） */
    cancelId?: string
}

const props = withDefaults(defineProps<Props>(), {
    kind: 'info',
    detail: '',
    defaultId: '',
    cancelId: '',
    buttons: () => []
})

const emit = defineEmits<{
    (e: 'choose', choiceId: string): void
}>()

/** 正文节点 id：经 BaseDialog 的 aria-describedby 关联为对话框描述，读屏可补充播报 */
const messageId = useId()

/** 正文容器引用（打开时按 defaultId 定位默认焦点按钮） */
const contentRef = ref<HTMLElement | null>(null)

/** 实际生效的默认按钮 id（载荷异常时回退第一个按钮） */
const resolvedDefaultId = computed(() => {
    const ids = props.buttons.map((button) => button.id)
    return ids.includes(props.defaultId) ? props.defaultId : (ids[0] ?? '')
})

/** 实际生效的取消按钮 id（载荷异常时回退最后一个按钮；无 id 时返回空串） */
const resolvedCancelId = computed(() => {
    const ids = props.buttons.map((button) => button.id)
    return ids.includes(props.cancelId) ? props.cancelId : (ids[ids.length - 1] ?? '')
})

/**
 * 按钮 class：`dialog-btn` 基础类 + 语义变体（统一视觉见全局 assets/dialog-buttons.css）；
 * 同时保留迁移前的 `btn` / `btn-primary` / `btn-danger` class 作为选择器兼容层
 * （应用内消息框单测与既有调用方按这些 class 断言，行为/语义不变）。
 */
function buttonClass(button: AppMessageBoxButton): string[] {
    const classes = ['dialog-btn', 'btn']
    if (button.kind === 'primary') {
        classes.push('dialog-btn--primary', 'btn-primary')
    } else if (button.kind === 'danger') {
        classes.push('dialog-btn--danger', 'btn-danger')
    } else {
        // 未指定 kind 的按钮等价于旧版普通按钮（卡背景 + 边框），映射为次要按钮
        classes.push('dialog-btn--secondary')
    }
    return classes
}

/**
 * 打开时把焦点移到 defaultId 对应按钮（默认焦点）。
 * BaseDialog 打开时会先聚焦容器；其子组件（本组件）的 post watch 在其之后执行，
 * 因此这里聚焦按钮后 BaseDialog 的 focusDialog 会因 activeElement 已在对话框内而跳过，
 * 不会把焦点抢回容器（与 UnsavedChangesDialog 相同的既有约定）。
 */
watch(
    () => props.visible,
    async (isVisible) => {
        if (!isVisible) {
            return
        }
        await nextTick()
        const container = contentRef.value?.closest('.dialog-container')
        const target = container?.querySelector<HTMLButtonElement>(
            `[data-button-id="${resolvedDefaultId.value}"]`
        )
        target?.focus()
    },
    { flush: 'post', immediate: true }
)

/** 用户点击按钮：emit 选择的按钮 id（由控制器收起并回传主进程） */
function handleChoose(choiceId: string): void {
    emit('choose', choiceId)
}

/** Esc / 标题栏关闭按钮 → 取消语义按钮（cancelId） */
function handleCancel(): void {
    if (!resolvedCancelId.value) {
        return
    }
    emit('choose', resolvedCancelId.value)
}
</script>

<style scoped>
.content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.message {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-color);
    white-space: pre-wrap;
    word-break: break-word;
}

.detail {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--secondary-text-color, var(--text-color));
    opacity: 0.85;
    white-space: pre-wrap;
    word-break: break-word;
}
</style>
