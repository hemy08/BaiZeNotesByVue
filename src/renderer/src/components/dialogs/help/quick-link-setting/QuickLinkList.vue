<template>
    <div class="link-list">
        <div class="list-header">
            <h3>{{ t('dialogRenderer.quickLink.listTitle') }}</h3>
            <button class="add-btn" @click="emit('add')">+ {{ t('common.add') }}</button>
        </div>

        <div class="link-items">
            <div
                v-for="(link, index) in links"
                :key="index"
                class="link-item"
                :class="{ selected: selectedIndex === index }"
                @click="emit('select', index)"
            >
                <div class="link-info">
                    <span class="link-icon">{{ link.icon }}</span>
                    <span class="link-name">{{ link.name }}</span>
                </div>
                <div class="link-actions">
                    <button class="action-btn" @click.stop="emit('edit', index)">
                        {{ t('dialogRenderer.common.edit') }}
                    </button>
                    <button class="action-btn delete" @click.stop="emit('delete', index)">
                        {{ t('common.delete') }}
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 快捷链接列表（设置对话框二期拆分；原 QuickLinkSettingDialog.vue 的 .link-list 区段）
 *
 * 契约：props.links 为壳层共享草稿（只读），selectedIndex 为当前选中项；
 * 选中 / 新增 / 编辑 / 删除均只 emit 索引与动作事件，由壳层 composable 修改草稿。
 */
import { t } from '../../../../common/i18n'
import type { Link } from './model'

defineProps<{
    /** 链接草稿（壳层唯一数据源） */
    links: Link[]
    /** 当前选中项索引（-1 表示未选中） */
    selectedIndex: number
}>()

const emit = defineEmits<{
    (e: 'select', index: number): void
    (e: 'add'): void
    (e: 'edit', index: number): void
    (e: 'delete', index: number): void
}>()
</script>

<style scoped>
/* 列表样式（含 .add-btn / .action-btn）见 link-list.css；底栏按钮视觉见全局
   assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*）。 */
@import './link-list.css';
</style>
