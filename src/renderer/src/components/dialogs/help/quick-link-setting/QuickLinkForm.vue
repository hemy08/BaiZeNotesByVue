<template>
    <div class="link-form">
        <h3>
            {{
                isEditing
                    ? t('dialogRenderer.quickLink.editLink')
                    : t('dialogRenderer.quickLink.addLink')
            }}
        </h3>

        <div class="form-group">
            <label>{{ t('dialogRenderer.common.name') }}</label>
            <input
                v-model="draft.name"
                type="text"
                class="form-input"
                :placeholder="t('dialogRenderer.quickLink.namePlaceholder')"
            />
        </div>

        <div class="form-group">
            <label>URL</label>
            <input v-model="draft.url" type="text" class="form-input" placeholder="https://..." />
        </div>

        <div class="form-group">
            <label>{{ t('dialogRenderer.quickLink.iconLabel') }}</label>
            <input
                v-model="draft.icon"
                type="text"
                class="form-input"
                placeholder="🌐"
                maxlength="2"
            />
        </div>

        <div class="form-group">
            <label>{{ t('dialogRenderer.quickLink.descLabel') }}</label>
            <textarea
                v-model="draft.description"
                class="form-textarea"
                :placeholder="t('dialogRenderer.quickLink.descPlaceholder')"
            ></textarea>
        </div>

        <div class="form-actions">
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="emit('cancel')">
                {{ t('common.cancel') }}
            </button>
            <button class="dialog-btn dialog-btn--primary btn btn-primary" @click="handleSave">
                {{ t('common.save') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 快捷链接编辑表单（设置对话框二期拆分；原 QuickLinkSettingDialog.vue 的 .link-form 区段）
 *
 * 契约：props.initial 为编辑中的原始链接（新增时 undefined），props.isEditing 决定标题；
 * 表单在 `v-if="showForm"` 下挂载，因此本地 draft 以 props.initial 初始化即可，
 * 不直接修改父级草稿（单向数据流）；保存时 emit('save', 表单草稿)，由壳层做校验/写草稿，
 * 取消时 emit('cancel') 由壳层关闭表单。
 */
import { reactive } from 'vue'
import { t } from '../../../../common/i18n'
import type { Link, QuickLinkDraft } from './model'

const props = defineProps<{
    /** 编辑中的原始链接（新增时不存在） */
    initial?: Link
    /** true 为编辑已有链接，false 为新增 */
    isEditing: boolean
}>()

const emit = defineEmits<{
    (e: 'save', draft: QuickLinkDraft): void
    (e: 'cancel'): void
}>()

/** 表单草稿：组件随 showForm 挂载/卸载，初始化时从 props.initial 回填 */
const draft = reactive<QuickLinkDraft>({
    name: props.initial?.name ?? '',
    url: props.initial?.url ?? '',
    icon: props.initial?.icon ?? '🌐',
    description: props.initial?.description ?? ''
})

/** 上报表单草稿；名称/URL 等业务校验由壳层 composable 统一承担 */
function handleSave(): void {
    emit('save', { ...draft })
}
</script>

<style scoped>
/* 表单内按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   本文件只保留编辑表单卡片与输入控件样式。 */

/* 编辑表单卡片（固定宽度，与左侧列表并排） */
.link-form {
    width: 280px;
    background: var(--card-bg);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    padding: 16px;
}

.link-form h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 16px;
}

.form-group {
    margin-bottom: 12px;
}

.form-group label {
    display: block;
    font-size: 12px;
    color: var(--text-color);
    margin-bottom: 6px;
}

.form-input {
    width: 100%;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--bg-color);
}

.form-textarea {
    width: 100%;
    min-height: 60px;
    padding: 8px 10px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--bg-color);
    resize: vertical;
}

.form-actions {
    display: flex;
    gap: 8px;
    margin-top: 16px;
}
</style>
