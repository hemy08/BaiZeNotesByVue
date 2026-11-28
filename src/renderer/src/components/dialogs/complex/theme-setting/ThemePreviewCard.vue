<template>
    <div :class="['theme-card', { selected }]" @click="emit('select')">
        <div class="theme-preview" :style="previewStyle">
            <div class="preview-title-bar" :style="titleBarStyle"></div>
            <div class="preview-content">
                <div class="preview-sidebar" :style="sidebarStyle"></div>
                <div class="preview-main">
                    <div
                        v-for="(line, index) in lines"
                        :key="index"
                        class="preview-line"
                        :style="line"
                    ></div>
                </div>
            </div>
        </div>
        <div class="theme-info">
            <div class="theme-name-row">
                <div class="theme-name">
                    {{ name }}
                </div>
                <!-- 1.5.6 UI 简洁化：主题描述由卡片常显改为名称旁 ⓘ（悬停/键盘聚焦/点击查看）。
                     InfoTip 的点击自带 stop，不会触发卡片 select。 -->
                <InfoTip
                    class="theme-desc-tip"
                    :text="description"
                    :aria-label="`${name} - ${t('common.infoTipLabel')}`"
                />
            </div>
            <div class="theme-colors">
                <div
                    v-for="(dot, index) in colorDots"
                    :key="index"
                    class="color-dot"
                    :style="dot.style"
                    :title="dot.title"
                ></div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 主题预览卡片（设置对话框二期拆分；原 ThemeSettingDialog.vue 应用主题/编辑器主题两处
 * 结构相同、仅配色来源不同的卡片合并为本组件）
 *
 * 契约：纯展示组件——名称/描述/预览配色/色块全部由父级页签计算后以 props 传入，
 * 点击时只 emit('select')，不持有任何主题状态（草稿由壳层 composable 唯一持有）。
 *
 * 1.5.6 UI 简洁化：28 套主题的 description 不再常显在卡片上，收进名称旁 ⓘ（InfoTip，
 * 悬停/键盘聚焦/点击查看）；DOM 结构变为 .theme-card > .theme-preview + .theme-info
 * > .theme-name-row（.theme-name + InfoTip）+ .theme-colors。选中态/点击选中/预览配色
 * 与键盘可达性（ⓘ 按钮可 Tab 聚焦，点击不会误选主题）均保持不变。
 */
import type { CSSProperties } from 'vue'
import { t } from '../../../../common/i18n'
import InfoTip from '../../../common/InfoTip.vue'
import type { ThemeColorDot } from './model'

defineProps<{
    /** 是否为当前选中主题（由父级比较主题 type 得出） */
    selected: boolean
    /** 卡片预览区底色 */
    previewStyle: CSSProperties
    /** 预览标题栏样式 */
    titleBarStyle: CSSProperties
    /** 预览侧边栏样式 */
    sidebarStyle: CSSProperties
    /** 3 条示意文本行样式 */
    lines: CSSProperties[]
    /** 主题显示名（i18n 映射后） */
    name: string
    /** 主题描述（i18n 映射后） */
    description: string
    /** 底部预览色块（背景/强调/文字） */
    colorDots: ThemeColorDot[]
}>()

const emit = defineEmits<{
    (e: 'select'): void
}>()
</script>

<style scoped>
/* 主题卡片样式按子组件归属收敛在卡片自身 scoped 样式（3 个页签共用同一套卡片外观）。
   1.5.6 UI 简洁化：描述移入 ⓘ 后卡片收紧内边距/间距，缩略预览高度降低，
   单卡高度较改造前（含 2 行描述）显著下降，同一屏可容纳更多主题。 */
.theme-card {
    border: 2px solid var(--border-color);
    border-radius: 12px;
    padding: 8px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--card-bg);
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.theme-card:hover {
    border-color: var(--accent-color);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.theme-card.selected {
    border-color: var(--accent-color);
    background: rgba(102, 126, 234, 0.08);
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.2);
}

/* 缩略预览：标题栏 + 侧栏 + 3 条示意文本行 */
.theme-preview {
    height: 88px;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.1);
}

.preview-title-bar {
    height: 12px;
    flex-shrink: 0;
}

.preview-content {
    flex: 1;
    display: flex;
    padding: 6px;
    gap: 4px;
}

.preview-sidebar {
    width: 20px;
    border-radius: 2px;
    flex-shrink: 0;
}

.preview-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 2px;
}

.preview-line {
    height: 3px;
    border-radius: 1px;
    width: 100%;
}

/* 卡片信息：名称（含 ⓘ 描述提示） / 色块 */
.theme-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

/* 名称 + ⓘ：ⓘ 固定在行尾，不挤压/换行主题名 */
.theme-name-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
}

.theme-name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
    text-align: left;
    line-height: 1.3;
    overflow-wrap: anywhere;
}

.theme-desc-tip {
    flex-shrink: 0;
}

.theme-colors {
    display: flex;
    gap: 6px;
}

.color-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid var(--border-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s;
}

.color-dot:hover {
    transform: scale(1.2);
}
</style>
