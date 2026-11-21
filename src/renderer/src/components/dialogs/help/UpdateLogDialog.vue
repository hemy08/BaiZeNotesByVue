<template>
    <!--
        结构优化第 2 批 2.1（H3）：更新日志对话框（帮助 → 修改日志）。
        迁移自主进程 JSDOM ShowUpdateLogDialog：内容结构（重大更新 / 依赖升级表 /
        代码适配修复 / 验证结果 / 页脚）与迁移前一致；外壳改为 BaseDialog，
        主题统一走 CSS 变量，i18n 复用共享词典 dialogMain.updateLog.*。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogMain.updateLog.title')"
        width="900px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="container">
            <div class="header">
                <h1>📋 {{ t('dialogMain.updateLog.heading') }}</h1>
                <p class="update-date">{{ t('dialogMain.updateLog.updateDate') }}</p>
                <p class="update-summary">{{ t('dialogMain.updateLog.updateSummary') }}</p>
            </div>

            <div class="section">
                <div class="section-title">{{ t('dialogMain.updateLog.highlightsTitle') }}</div>
                <div class="highlight-box">
                    <div v-for="key in HIGHLIGHT_KEYS" :key="key" class="highlight-item">
                        <span class="bullet">★</span>
                        <span>{{ t('dialogMain.updateLog.highlights.' + key) }}</span>
                    </div>
                </div>
            </div>

            <div v-for="group in UPGRADE_GROUPS" :key="group.titleKey" class="section">
                <div class="section-title">{{ t(group.titleKey) }}</div>
                <div class="table-wrapper">
                    <table class="upgrade-table">
                        <thead>
                            <tr>
                                <th>{{ t('dialogMain.updateLog.table.dependency') }}</th>
                                <th>{{ t('dialogMain.updateLog.table.oldVersion') }}</th>
                                <th>{{ t('dialogMain.updateLog.table.newVersion') }}</th>
                                <th>{{ t('dialogMain.updateLog.table.type') }}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr v-for="item in group.items" :key="`${group.titleKey}-${item.name}`">
                                <td class="dep-name">{{ item.name }}</td>
                                <td class="dep-old">{{ item.old }}</td>
                                <td class="dep-new">{{ item.new }}</td>
                                <td>
                                    <span
                                        class="badge"
                                        :style="badgeStyle(item.type)"
                                        :data-type="item.type"
                                    >
                                        {{ typeLabel(item.type) }}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="section">
                <div class="section-title">{{ t('dialogMain.updateLog.codeFixesTitle') }}</div>
                <div class="fix-list">
                    <div v-for="key in CODE_FIX_KEYS" :key="key" class="fix-item">
                        <span>✅</span>
                        <span>{{ t('dialogMain.updateLog.codeFixes.' + key) }}</span>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">{{ t('dialogMain.updateLog.verifyTitle') }}</div>
                <div class="verify-grid">
                    <div v-for="key in VERIFY_KEYS" :key="key" class="verify-item">
                        <span>✅</span>
                        <span>{{ t('dialogMain.updateLog.verify.' + key) }}</span>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <span class="footer-text">{{ t('dialogMain.updateLog.footer') }}</span>
            <button class="dialog-btn dialog-btn--ghost btn btn-close" @click="handleClose">
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 更新日志对话框（结构优化第 2 批 2.1：JSDOM → Vue + BaseDialog）。
 *
 * 展示内容为本版本（1.3.0）相对 1.2.2 的依赖变化/代码适配修复/验证结果，
 * 数据为纯展示常量（随对话框迁移到渲染层，避免经 IPC 传输大块静态数据）。
 * 所有文案走共享词典 dialogMain.updateLog.*（中英双语），类型标签同样 i18n 化。
 */
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
}

defineProps<Props>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

/** 依赖升级类型（决定类型标签 i18n 键与徽标配色） */
type UpgradeType = 'major' | 'minor' | 'patch' | 'keep' | 'added' | 'removed'

interface UpgradeItem {
    name: string
    old: string
    new: string
    type: UpgradeType
}

interface UpgradeGroup {
    /** 分组标题的词典键（渲染时再 t()，保证语言切换后重新打开对话框可生效） */
    titleKey: string
    items: UpgradeItem[]
}

/** 依赖升级清单（与迁移前主进程常量逐项一致） */
const UPGRADE_GROUPS: UpgradeGroup[] = [
    {
        titleKey: 'dialogMain.updateLog.groups.coreFramework',
        items: [
            { name: 'electron', old: '^43.0.0', new: '^43.8.10', type: 'patch' },
            { name: 'electron-builder', old: '^26.0.0', new: '^26.18.0', type: 'minor' },
            { name: 'electron-vite', old: '^6.0.0-beta.1', new: '^6.0.0', type: 'major' },
            { name: 'vite', old: '^8.2.2', new: '^8.3.8', type: 'minor' },
            { name: 'vue', old: '^3.5.41', new: '^3.5.45', type: 'patch' },
            { name: 'typescript', old: '^6.0.2', new: '^6.0.3', type: 'patch' }
        ]
    },
    {
        titleKey: 'dialogMain.updateLog.groups.editorRendering',
        items: [
            { name: 'monaco-editor', old: '^0.56.0', new: '^0.57.0', type: 'minor' },
            { name: 'mermaid', old: '^11.17.0', new: '^12.3.0', type: 'major' },
            { name: 'markdown-it', old: '^15.0.0', new: '^15.0.3', type: 'patch' },
            { name: 'markdown-it-anchor', old: '^9.2.1', new: '—', type: 'removed' }
        ]
    },
    {
        titleKey: 'dialogMain.updateLog.groups.dataTools',
        items: [
            { name: 'jschardet', old: '—', new: '^3.1.3', type: 'added' },
            { name: 'sharp', old: '^0.35.3', new: '—', type: 'removed' }
        ]
    },
    {
        titleKey: 'dialogMain.updateLog.groups.devTools',
        items: [
            { name: 'vitest', old: '^4.1.11', new: '^4.1.12', type: 'patch' },
            { name: 'app-builder-bin', old: '^4.2.0', new: '—', type: 'removed' }
        ]
    }
]

/** 1.3.0 重大更新词条的词典键后缀（按展示顺序） */
const HIGHLIGHT_KEYS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'] as const

/** 代码适配修复清单的词典键后缀（按展示顺序） */
const CODE_FIX_KEYS = [
    'materialRender',
    'editorOptions',
    'hemyEditorRender',
    'tsconfigWeb',
    'vitest',
    'encryptDecrypt',
    'useConfigStore',
    'preloadTypes',
    'quickLinkXss',
    'cleanup'
] as const

/** 验证结果清单的词典键后缀（按展示顺序） */
const VERIFY_KEYS = [
    'typescriptNode',
    'typescriptWeb',
    'eslint',
    'unitTests',
    'audit',
    'build'
] as const

/** 类型徽标语义配色（与迁移前主进程常量一致；用于表达升级风险等级，不随主题变化） */
const TYPE_COLORS: Record<UpgradeType, { background: string; color: string }> = {
    major: { background: '#fee2e2', color: '#dc2626' },
    minor: { background: '#fef3c7', color: '#d97706' },
    patch: { background: '#d1fae5', color: '#059669' },
    keep: { background: '#e5e7eb', color: '#6b7280' },
    added: { background: '#d1fae5', color: '#15803d' },
    removed: { background: '#fee2e2', color: '#dc2626' }
}

function typeLabel(type: UpgradeType): string {
    return t(`dialogMain.updateLog.typeLabels.${type}`)
}

function badgeStyle(type: UpgradeType): Record<string, string> {
    const palette = TYPE_COLORS[type]
    return { background: palette.background, color: palette.color }
}

function handleClose(): void {
    emit('close')
}
</script>

<style scoped>
.container {
    max-height: 64vh;
    overflow-y: auto;
    padding: 24px;
}

.header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--border-color);
}

.header h1 {
    font-size: 22px;
    margin: 0 0 8px 0;
    color: var(--text-color);
}

.update-date {
    font-size: 13px;
    color: var(--secondary-text-color);
    margin: 0 0 4px 0;
}

.update-summary {
    font-size: 13px;
    color: var(--secondary-text-color);
    margin: 0;
    line-height: 1.5;
}

.section {
    margin-bottom: 24px;
}

.section-title {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 12px;
    padding-left: 8px;
    border-left: 3px solid var(--accent-color);
}

.table-wrapper {
    overflow-x: auto;
}

.upgrade-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
}

.upgrade-table th {
    text-align: left;
    padding: 8px 12px;
    background: var(--card-bg);
    color: var(--text-color);
    font-weight: 600;
    border-bottom: 2px solid var(--border-color);
}

.upgrade-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-color);
}

.dep-name {
    font-weight: 500;
}

.dep-old {
    color: var(--secondary-text-color);
}

.dep-new {
    color: var(--accent-color);
    font-weight: 500;
}

.badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 500;
}

.highlight-box {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px 16px;
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
    flex-shrink: 0;
}

.fix-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.fix-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}

.verify-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}

.verify-item {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
}

/* 底栏：左侧页脚说明 + 右侧关闭按钮（按钮视觉见全局 assets/dialog-buttons.css） */
.footer-text {
    flex: 1;
    font-size: 12px;
    color: var(--secondary-text-color);
    align-self: center;
}
</style>
