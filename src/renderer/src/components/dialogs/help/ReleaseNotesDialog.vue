<template>
    <!--
        结构优化第 2 批 2.1（H3）：版本发布说明对话框（帮助 → 版本发布 vX.Y.Z）。
        迁移自主进程 JSDOM ShowReleaseNotesDialog：版本徽标 / 标题 / 发布日期 / 重大更新 /
        新功能 / 问题修复 / 优化改进 / 技术栈 / 页脚结构与迁移前一致；外壳改为 BaseDialog。
        数据见 help/release-notes-data.ts，文案复用共享词典 dialogMain.releaseNotes.*。
    -->
    <BaseDialog
        :visible="visible"
        :title="windowTitle"
        width="800px"
        reset-position-on-open
        @close="handleClose"
    >
        <div v-if="note" class="container">
            <div class="header">
                <div class="version-badge">v{{ note.version }}</div>
                <h1>{{ noteText(note, 'title') }}</h1>
                <div class="release-date">
                    {{ t('dialogMain.releaseNotes.releaseDate', { date: note.date }) }}
                </div>
                <div class="highlight-box">
                    <div v-for="key in note.highlightKeys" :key="key" class="highlight-item">
                        <span class="bullet">★</span>
                        <span>{{ noteText(note, key) }}</span>
                    </div>
                </div>
            </div>

            <div v-if="note.featureKeys?.length" class="section">
                <div class="section-title">✨ {{ t('dialogMain.releaseNotes.featuresTitle') }}</div>
                <div class="note-list">
                    <div v-for="key in note.featureKeys" :key="key" class="note-item">
                        <span class="icon">✨</span>
                        <span>{{ noteText(note, key) }}</span>
                    </div>
                </div>
            </div>

            <div v-if="note.fixKeys?.length" class="section">
                <div class="section-title">🐛 {{ t('dialogMain.releaseNotes.fixesTitle') }}</div>
                <div class="note-list">
                    <div v-for="key in note.fixKeys" :key="key" class="note-item">
                        <span class="icon">🐛</span>
                        <span>{{ noteText(note, key) }}</span>
                    </div>
                </div>
            </div>

            <div v-if="note.improvementKeys?.length" class="section">
                <div class="section-title">
                    ⚡ {{ t('dialogMain.releaseNotes.improvementsTitle') }}
                </div>
                <div class="note-list">
                    <div v-for="key in note.improvementKeys" :key="key" class="note-item">
                        <span class="icon">⚡</span>
                        <span>{{ noteText(note, key) }}</span>
                    </div>
                </div>
            </div>

            <div v-if="note.techStack?.length" class="section">
                <div class="section-title">
                    🔧 {{ t('dialogMain.releaseNotes.techStackTitle') }}
                </div>
                <div class="tech-list">
                    <div v-for="tech in note.techStack" :key="tech.name" class="tech-row">
                        <span class="tech-name">{{ tech.name }}</span>
                        <span class="tech-value">v{{ tech.value }}</span>
                    </div>
                </div>
            </div>
        </div>

        <div v-else class="container not-found">
            {{ t('dialogMain.releaseNotes.notFound', { version: version || '' }) }}
        </div>

        <template #footer>
            <span v-if="note" class="footer-text">
                {{
                    t('dialogMain.releaseNotes.footer', {
                        version: note.version,
                        date: note.date
                    })
                }}
            </span>
            <button class="dialog-btn dialog-btn--ghost btn btn-close" @click="handleClose">
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 版本发布说明对话框（结构优化第 2 批 2.1：JSDOM → Vue + BaseDialog）。
 *
 * 受控组件：显隐与 version 来自 useConfigStore.dialogs.releaseNotes
 * （由主进程 OPEN_VUE_DIALOG('releaseNotes', { version }) 填充）；
 * 版本数据由 help/release-notes-data.ts 提供（从主进程迁移的纯数据），
 * 高亮/新功能/修复/优化/技术栈仅在有数据时渲染（与迁移前条件区块一致）。
 */
import { computed } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import { findReleaseNote, type ReleaseNoteEntry } from './release-notes-data'

interface Props {
    visible: boolean
    /** 发布版本号（如 '1.3.5'）；缺省/未找到时按 notFound 词条提示 */
    version?: string
}

const props = withDefaults(defineProps<Props>(), {
    version: ''
})

const emit = defineEmits<{
    (e: 'close'): void
}>()

const note = computed<ReleaseNoteEntry | undefined>(() => findReleaseNote(props.version))

const windowTitle = computed(() =>
    t('dialogMain.releaseNotes.windowTitle', { version: props.version || '' })
)

/** 取分组发布说明词条（完整键 = dialogMain.releaseNotes.<版本key>.<suffix>） */
function noteText(entry: ReleaseNoteEntry, suffix: string): string {
    return t(`dialogMain.releaseNotes.${entry.key}.${suffix}`)
}

function handleClose(): void {
    emit('close')
}
</script>

<style scoped>
.container {
    max-height: 62vh;
    overflow-y: auto;
    padding: 24px;
}

.container.not-found {
    padding: 32px 24px;
    font-size: 14px;
    color: var(--secondary-text-color);
    text-align: center;
}

.header {
    margin-bottom: 20px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
}

.version-badge {
    display: inline-block;
    padding: 4px 12px;
    background: var(--accent-color);
    color: #fff;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 8px;
}

.header h1 {
    font-size: 20px;
    margin: 0 0 6px 0;
    color: var(--text-color);
}

.release-date {
    font-size: 13px;
    color: var(--secondary-text-color);
}

.highlight-box {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 12px;
}

.highlight-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    padding: 3px 0;
    line-height: 1.5;
}

.bullet {
    color: var(--accent-color);
    font-size: 14px;
    flex-shrink: 0;
}

.section {
    margin-bottom: 20px;
}

.section-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 10px;
    padding-left: 8px;
    border-left: 3px solid var(--accent-color);
}

.note-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.note-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    line-height: 1.5;
}

.icon {
    flex-shrink: 0;
}

.tech-list {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 16px;
}

.tech-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    padding: 4px 0;
    border-bottom: 1px solid var(--border-color);
}

.tech-row:last-child {
    border-bottom: none;
}

.tech-name {
    color: var(--secondary-text-color);
}

.tech-value {
    color: var(--accent-color);
    font-weight: 500;
}

/* 底栏：左侧页脚说明 + 右侧关闭按钮（按钮视觉见全局 assets/dialog-buttons.css） */
.footer-text {
    flex: 1;
    font-size: 12px;
    color: var(--secondary-text-color);
    align-self: center;
}
</style>
