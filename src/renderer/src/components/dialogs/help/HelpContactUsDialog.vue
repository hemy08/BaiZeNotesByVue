<template>
    <!--
        C-3 迁移：large（48px 标题栏 / 16px 标题）+ rounded（32px 圆角关闭按钮）+ 600px 宽度。
        迁移前后的外壳差异全部用 BaseDialog 现有能力等价表达：
        - 标题 16px/600 显式锁定（large 变体默认即 16px/600，防变体后续调整）；
        - 关闭按钮 18px 图标 + Electron no-drag → closeButtonStyle；
        - 标题栏迁移前是 Electron 原生拖拽区（-webkit-app-region: drag，无 JS 拖拽 /
          cursor: move / user-select: none）→ draggable=false + titleBarStyle 还原
          （app-region drag、flex-shrink:0，cursor/user-select 显式恢复初始值）；
        - 底栏居中且不随内容压缩 → footerAlign="center" + footerStyle（flex-shrink:0，
          gap 归零：迁移前未声明间距，默认壳 gap 10px 在单按钮下无可见差异，显式归零保持计算值一致）。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.helpContactUs.title')"
        title-bar-variant="large"
        close-button-variant="rounded"
        width="600px"
        :draggable="false"
        footer-align="center"
        :title-bar-style="titleBarStyle"
        :title-text-style="titleTextStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
        <div class="main-content">
            <div class="contact-info">
                <h2>{{ t('dialogRenderer.helpContactUs.title') }}</h2>
                <p class="subtitle">
                    {{ t('dialogRenderer.helpContactUs.subtitle') }}
                </p>

                <div class="contact-cards">
                    <div
                        class="contact-card"
                        @click="openLink('https://github.com/hemy08/BaiZeNotesByVue/issues')"
                    >
                        <div class="card-icon">🐛</div>
                        <div class="card-title">
                            {{ t('dialogRenderer.helpContactUs.feedback') }}
                        </div>
                        <div class="card-desc">
                            {{ t('dialogRenderer.helpContactUs.feedbackDesc') }}
                        </div>
                    </div>

                    <div
                        class="contact-card"
                        @click="openLink('https://github.com/hemy08/BaiZeNotesByVue')"
                    >
                        <div class="card-icon">⭐</div>
                        <div class="card-title">
                            {{ t('dialogRenderer.helpContactUs.star') }}
                        </div>
                        <div class="card-desc">
                            {{ t('dialogRenderer.helpContactUs.starDesc') }}
                        </div>
                    </div>

                    <div
                        class="contact-card"
                        @click="openLink('https://github.com/hemy08/BaiZeNotesByVue/pulls')"
                    >
                        <div class="card-icon">🔧</div>
                        <div class="card-title">
                            {{ t('dialogRenderer.helpContactUs.contribute') }}
                        </div>
                        <div class="card-desc">
                            {{ t('dialogRenderer.helpContactUs.contributeDesc') }}
                        </div>
                    </div>

                    <div class="contact-card" @click="openLink('mailto:hemy08@example.com')">
                        <div class="card-icon">📧</div>
                        <div class="card-title">
                            {{ t('dialogRenderer.helpContactUs.email') }}
                        </div>
                        <div class="card-desc">hemy08@example.com</div>
                    </div>
                </div>

                <div class="social-links">
                    <h3>{{ t('dialogRenderer.common.followUs') }}</h3>
                    <div class="social-icons">
                        <div class="social-icon" @click="openLink('https://github.com/hemy08')">
                            <span>🐙</span>
                            <span>GitHub</span>
                        </div>
                        <div
                            class="social-icon"
                            @click="openLink('https://hemy08.github.io/hemynotes/')"
                        >
                            <span>📖</span>
                            <span>{{ t('dialogRenderer.common.docs') }}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <button class="btn btn-cancel" @click="handleClose">
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
}>()

/**
 * C-3 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳一致）。
 *
 * Electron 专有内联样式：BaseDialog 内部的 DialogStyleProperties 未导出，
 * 这里按同构方式在 Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。
 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

// 迁移前标题栏是 Electron 原生拖拽区（-webkit-app-region: drag），且没有 JS 拖拽、
// 未声明 cursor / user-select / flex-shrink：BaseDialog 默认标题栏带 cursor:move /
// user-select:none / 可压缩，这里逐项还原（cursor/user-select 显式恢复初始值 auto）。
const titleBarStyle: DialogStyleOverrides = {
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    cursor: 'auto',
    userSelect: 'auto'
}
// 迁移前标题为 16px/600（large 变体默认一致，显式锁定防变体调整造成偏差）。
const titleTextStyle: CSSProperties = { fontSize: '16px', fontWeight: 600 }
// 迁移前关闭按钮为 18px 图标（rounded 变体默认 16px），并保留 no-drag 使按钮在拖拽区内可点击。
const closeButtonStyle: DialogStyleOverrides = {
    fontSize: '18px',
    WebkitAppRegion: 'no-drag'
}
// 迁移前底栏不随内容压缩；仅一个按钮，迁移前未声明 gap（默认壳 gap 10px 无可见间距），
// 显式归零以保持计算样式与迁移前一致。
const footerStyle: CSSProperties = { gap: '0', flexShrink: 0 }

function openLink(url: string) {
    if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank')
    }
}

function handleClose() {
    emit('close')
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/title-text/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留正文（联系卡片/社交链接）与按钮样式。 */
.main-content {
    flex: 1;
    padding: 30px;
    overflow-y: auto;
}

.contact-info {
    text-align: center;
}

.contact-info h2 {
    font-size: 24px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 8px;
}

.subtitle {
    font-size: 14px;
    color: var(--secondary-text-color);
    margin-bottom: 30px;
}

.contact-cards {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    margin-bottom: 30px;
}

.contact-card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 20px;
    cursor: pointer;
    transition: all 0.2s;
}

.contact-card:hover {
    border-color: var(--accent-color);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.card-icon {
    font-size: 36px;
    margin-bottom: 12px;
}

.card-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 6px;
}

.card-desc {
    font-size: 12px;
    color: var(--secondary-text-color);
}

.social-links h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 16px;
}

.social-icons {
    display: flex;
    justify-content: center;
    gap: 20px;
}

.social-icon {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 20px;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
}

.social-icon:hover {
    border-color: var(--accent-color);
}

.social-icon span:first-child {
    font-size: 20px;
}

.social-icon span:last-child {
    font-size: 13px;
    color: var(--text-color);
}

.btn {
    padding: 10px 24px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-cancel {
    background: var(--button-bg);
    color: var(--text-color);
}

.btn:hover {
    opacity: 0.9;
}
</style>
