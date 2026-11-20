<template>
    <!--
        关闭/退出「未保存修改」确认框（2026-11-20：原生 dialog.showMessageBox → 应用内 BaseDialog）。

        由主进程关闭/退出协议经 IPC.DIALOG.UNSAVED_CLOSE_REQUEST 请求打开（App.vue 接收并驱动）；
        三个按钮语义与旧原生框一致：保存并关闭（默认焦点）/ 不保存 / 取消（Esc / 关闭按钮 = 取消）。
        受控组件：visible/busy/error 等状态由 useUnsavedCloseConfirm 维护，本组件只负责展示与 emit。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('mainMsg.closeConfirm.title')"
        :aria-describedby="messageId"
        width="480px"
        reset-position-on-open
        :close-on-overlay="false"
        container-class="unsaved-close-dialog"
        @close="handleCloseRequest"
    >
        <div class="content">
            <p :id="messageId" class="message">{{ messageText }}</p>
            <p class="detail">{{ detailText }}</p>
            <!-- 保存失败等错误反馈（保留对话框，用户可重试 / 改选不保存 / 取消） -->
            <p v-if="error" class="error" role="alert">{{ error }}</p>
        </div>

        <template #footer>
            <button
                ref="saveButton"
                type="button"
                class="btn btn-save"
                :disabled="busy"
                @click="emit('save')"
            >
                {{ busy ? t('mainMsg.closeConfirm.saving') : saveText }}
            </button>
            <button type="button" class="btn btn-discard" :disabled="busy" @click="emit('discard')">
                {{ t('mainMsg.closeConfirm.discard') }}
            </button>
            <button type="button" class="btn btn-cancel" :disabled="busy" @click="emit('cancel')">
                {{ t('mainMsg.closeConfirm.cancel') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 关闭/退出「未保存修改」确认对话框（应用内 BaseDialog 风格）。
 *
 * UI-11/12/13：复用 BaseDialog 外壳（overlay/title-bar/footer/动画/拖拽），不复制外壳结构；
 * 容器 role="dialog" + aria-modal + aria-labelledby（BaseDialog）；正文经 aria-describedby
 * 关联为描述；打开时把焦点移到「保存并关闭」（默认焦点，符合旧原生框 defaultId=0 的语义）；
 * Esc / 关闭按钮 / 遮罩外点击（本组件显式禁用遮罩关闭，避免误触）→ 取消；
 * Tab/Shift+Tab 焦点陷阱与 body 滚动锁由 BaseDialog 既有能力提供。
 *
 * 受控约定：visible/busy/error/minimizeToTray 由 useUnsavedCloseConfirm 维护；
 * 本组件不修改状态，只 emit save / discard / cancel，由控制器回传主进程并决定后续状态。
 */
import { computed, nextTick, ref, useId, watch } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    /** 显隐开关（真源在控制器） */
    visible: boolean
    /** 本次关闭实际是隐藏到系统托盘（minimizeToTray 开启）：使用「保存并隐藏」语义 */
    minimizeToTray?: boolean
    /** 「保存并关闭」执行中：按钮禁用、保存按钮显示进行中文案 */
    busy?: boolean
    /** 保存失败等错误提示（空字符串 = 无错误） */
    error?: string
}

const props = withDefaults(defineProps<Props>(), {
    minimizeToTray: false,
    busy: false,
    error: ''
})

const emit = defineEmits<{
    (e: 'save'): void
    (e: 'discard'): void
    (e: 'cancel'): void
}>()

/** 正文节点 id：经 BaseDialog 的 aria-describedby 关联为对话框描述，读屏可补充播报 */
const messageId = useId()

/** 「保存并关闭」按钮引用（默认焦点目标） */
const saveButton = ref<HTMLButtonElement | null>(null)

/** 托盘常驻场景文案与普通关闭场景区分（与主进程 native 兜底文案同源词典） */
const saveText = computed(() =>
    props.minimizeToTray ? t('mainMsg.closeConfirm.traySave') : t('mainMsg.closeConfirm.save')
)
const messageText = computed(() =>
    props.minimizeToTray ? t('mainMsg.closeConfirm.trayMessage') : t('mainMsg.closeConfirm.message')
)
const detailText = computed(() =>
    props.minimizeToTray ? t('mainMsg.closeConfirm.trayDetail') : t('mainMsg.closeConfirm.detail')
)

/**
 * 打开时把焦点移到「保存并关闭」（默认焦点）。
 * BaseDialog 打开时默认聚焦容器本身；子组件在父外壳注册的 watch 之后执行，
 * 这里在内容根节点（按钮）上聚焦后，BaseDialog 的 focusDialog 会因 activeElement
 * 已在对话框内而跳过，不会把焦点抢回容器。
 */
watch(
    () => props.visible,
    async (isVisible) => {
        if (!isVisible) {
            return
        }
        await nextTick()
        saveButton.value?.focus()
    },
    { flush: 'post', immediate: true }
)

/**
 * BaseDialog 的 close（Esc / 标题栏关闭按钮）统一映射为「取消」；
 * 保存执行中忽略关闭请求（避免保存与取消并发）。
 */
function handleCloseRequest(): void {
    if (props.busy) {
        return
    }
    emit('cancel')
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
}

.detail {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--secondary-text-color, var(--text-color));
    opacity: 0.85;
}

/* 保存失败提示：使用破坏性操作语义色（与 ConfirmDeleteDialog 的 .btn-danger 同一约定） */
.error {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: #e74c3c;
}

.btn {
    min-width: 78px;
    height: 30px;
    padding: 0 16px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn:hover:not(:disabled) {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
}

/* 主操作：保存并关闭（默认焦点）——使用主题强调色，文字白色（深色底上的白字例外，见 UI-01） */
.btn-save {
    border: none;
    background: var(--accent-color);
    color: #fff;
}

.btn-save:hover:not(:disabled) {
    opacity: 0.9;
    color: #fff;
}

/* 破坏性操作：不保存（丢弃修改）——与迁移前原生框的语义一致 */
.btn-discard {
    border: none;
    background: #e74c3c;
    color: #fff;
}

.btn-discard:hover:not(:disabled) {
    opacity: 0.9;
    color: #fff;
}
</style>
