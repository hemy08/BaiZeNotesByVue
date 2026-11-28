<template>
    <!--
        1.5.7 体验微调（用户反馈 2026-11-28）：AI 助手配置从「系统设置」对话框的第 7 页签
        改为菜单栏「设置 → AI 助手」打开的**独立对话框**。

        - 外壳复用 BaseDialog，尺寸（900×650）/ 标题栏变体 / 关闭按钮 / 底栏内边距与
          系统设置对话框保持同一视觉口径（标题 16px/600、关闭按钮 18px + Electron no-drag）；
        - 正文复用 `system-setting/AiAssistantPanel.vue`（多模型管理 + MCP 服务配置，
          面板自身逻辑零改动，配置独立保存、立即生效，不经过系统设置草稿）；
        - 打开即刷新：BaseDialog 以 v-if 渲染正文，每次重新打开都会重新挂载面板，
          面板 onMounted 重新读取 AI 配置与 MCP 状态，不会展示上一次打开时的过期状态；
        - 关闭途径：右上角 ×、ESC、遮罩空白处点击、底栏「关闭」按钮（均由 BaseDialog
          既有行为/本组件 handleClose 提供）。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.aiAssistant.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="900px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :title-text-style="titleTextStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
        <!-- 正文滚动容器：面板自身按系统设置页签的「内容区」形态设计（padding 24px 滚动），
             这里补等价容器，不修改面板内部布局/逻辑。 -->
        <div class="ai-assistant-dialog-body">
            <AiAssistantPanel />
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--primary btn ai-assistant-close-btn"
                @click="handleClose"
            >
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * AI 助手独立对话框（1.5.7 体验微调，用户反馈：配置入口应在菜单「设置」下，
 * 而不是系统设置对话框里）。
 *
 * 对外契约：props `visible`；emits `close`（与其它受控对话框一致，显隐真源为
 * `./ai-assistant-dialog-state.ts` 的模块单例，菜单动作 `menu-actions.ts` 只切该状态，
 * 宿主 `BaiZeNotes.vue` 只挂载并绑定 `visible`）。
 *
 * 内容：完全复用 `system-setting/AiAssistantPanel.vue`（原来的系统设置第 7 页签面板），
 * 本壳层只负责 BaseDialog 外壳 + 正文滚动容器 + 底栏「关闭」按钮，不重写面板逻辑。
 */
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import AiAssistantPanel from './system-setting/AiAssistantPanel.vue'

interface Props {
    visible: boolean
}

defineProps<Props>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

/** Electron 专有内联样式：BaseDialog 的 DialogStyleProperties 未导出，按同构方式在
 *  Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

// 与系统设置对话框同一尺寸口径：900 × 650（宽度由 width 属性承载）。
const containerStyle: CSSProperties = { height: '650px' }
// 标题栏不随内容压缩（容器固定高，显式 flex-shrink: 0 保持布局稳定）。
const titleBarStyle: CSSProperties = { flexShrink: 0 }
// 标题 16px/600（regular 变体默认 14px/500，与系统设置对话框一致）。
const titleTextStyle: CSSProperties = { fontSize: '16px', fontWeight: 600 }
// 关闭按钮 18px 图标（rounded 变体默认 16px），并声明 Electron no-drag 保持原状。
const closeButtonStyle: DialogStyleOverrides = {
    fontSize: '18px',
    WebkitAppRegion: 'no-drag'
}
// 底栏内边距 15px 24px、按钮间距 12px 且不随内容压缩（与系统设置对话框一致）。
const footerStyle: CSSProperties = {
    padding: '15px 24px',
    gap: '12px',
    flexShrink: 0
}

function handleClose(): void {
    emit('close')
}
</script>

<style scoped>
/* 正文容器：占满 BaseDialog 标题栏与底栏之间的剩余高度，独立滚动；
   内边距沿用系统设置「内容区」的 24px 节奏（面板本身以此为设计基准）。 */
.ai-assistant-dialog-body {
    flex: 1;
    min-height: 0;
    padding: 24px;
    overflow-y: auto;
}

/* 标题适配（最小调整，不修改面板）：对话框标题栏已展示「AI 助手」，面板自带的
   页签标题会与其重复；这里只隐藏该行标题、收紧间距，保留「用途说明」段落。 */
.ai-assistant-dialog-body :deep(.panel-header h3) {
    display: none;
}

.ai-assistant-dialog-body :deep(.panel-header) {
    margin-bottom: 16px;
}
</style>
