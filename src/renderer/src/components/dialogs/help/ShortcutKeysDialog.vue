<template>
    <!--
        结构优化第 2 批 2.1（H3）：键盘快捷键说明对话框（只读）。
        迁移自主进程 JSDOM ShowShortcutKeysDialog：布局（分组标题 + kbd 快捷键 + 说明）
        与迁移前一致，外壳改为 BaseDialog（32px 标题栏 / 主题 CSS 变量 / ESC 等交互统一）。
        文案复用共享词典 dialogMain.shortcutKeys.*，中英双语无需新增词条。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogMain.shortcutKeys.title')"
        width="620px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="container">
            <div class="intro">{{ t('dialogMain.shortcutKeys.intro') }}</div>

            <div v-for="group in SHORTCUT_GROUPS" :key="group.titleKey" class="section">
                <div class="section-title">{{ t(group.titleKey) }}</div>
                <div class="shortcut-list">
                    <div
                        v-for="item in group.items"
                        :key="`${group.titleKey}-${item.keys}-${item.labelKey}`"
                        class="shortcut-row"
                    >
                        <kbd>{{ item.keys }}</kbd>
                        <span class="shortcut-label">{{ t(item.labelKey) }}</span>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <span class="footer-hint">{{ t('dialogMain.shortcutKeys.close') }}</span>
            <button class="btn btn-close" @click="handleClose">
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 键盘快捷键说明对话框（结构优化第 2 批 2.1：JSDOM → Vue + BaseDialog）。
 *
 * 快捷键清单与真实绑定对齐（主进程全局键 Config/short-key-register.ts +
 * 渲染层编辑器键 Markdown/hemy-editor-shortcut.ts）。数据为纯展示常量，
 * 无需从主进程经 IPC 传输，避免大载荷与两套数据源。
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

interface ShortcutItem {
    /** 按键组合展示文本（不翻译） */
    keys: string
    /** 说明文案的 i18n 键 */
    labelKey: string
}

interface ShortcutGroup {
    titleKey: string
    items: ShortcutItem[]
}

/** 快捷键清单（顺序即界面展示顺序，与迁移前主进程常量逐项一致） */
const SHORTCUT_GROUPS: ShortcutGroup[] = [
    {
        titleKey: 'dialogMain.shortcutKeys.groups.file',
        items: [
            { keys: 'Ctrl+N', labelKey: 'dialogMain.shortcutKeys.items.newFile' },
            { keys: 'Ctrl+O', labelKey: 'dialogMain.shortcutKeys.items.openFolder' },
            { keys: 'Ctrl+S', labelKey: 'dialogMain.shortcutKeys.items.save' },
            { keys: 'Ctrl+R', labelKey: 'dialogMain.shortcutKeys.items.reload' },
            { keys: 'Ctrl+Shift+R', labelKey: 'dialogMain.shortcutKeys.items.relaunch' },
            { keys: 'F4', labelKey: 'dialogMain.shortcutKeys.items.exit' }
        ]
    },
    {
        titleKey: 'dialogMain.shortcutKeys.groups.edit',
        items: [
            { keys: 'Ctrl+Z', labelKey: 'dialogMain.shortcutKeys.items.undo' },
            { keys: 'Ctrl+Y', labelKey: 'dialogMain.shortcutKeys.items.redo' },
            { keys: 'Ctrl+X', labelKey: 'dialogMain.shortcutKeys.items.cut' },
            { keys: 'Ctrl+C', labelKey: 'dialogMain.shortcutKeys.items.copy' },
            { keys: 'Ctrl+V', labelKey: 'dialogMain.shortcutKeys.items.paste' },
            { keys: 'Ctrl+F', labelKey: 'dialogMain.shortcutKeys.items.find' },
            { keys: 'Ctrl+H', labelKey: 'dialogMain.shortcutKeys.items.replace' },
            { keys: 'Ctrl+G', labelKey: 'dialogMain.shortcutKeys.items.goLine' }
        ]
    },
    {
        titleKey: 'dialogMain.shortcutKeys.groups.format',
        items: [
            { keys: 'Ctrl+1 ~ 6', labelKey: 'dialogMain.shortcutKeys.items.headings' },
            { keys: 'Ctrl+B', labelKey: 'dialogMain.shortcutKeys.items.bold' },
            { keys: 'Ctrl+I', labelKey: 'dialogMain.shortcutKeys.items.italic' },
            { keys: 'Ctrl+U', labelKey: 'dialogMain.shortcutKeys.items.underline' },
            { keys: 'Ctrl+D', labelKey: 'dialogMain.shortcutKeys.items.strikethrough' },
            { keys: 'Ctrl+K', labelKey: 'dialogMain.shortcutKeys.items.keyboard' },
            { keys: 'Ctrl+L', labelKey: 'dialogMain.shortcutKeys.items.link' },
            { keys: 'Ctrl+V', labelKey: 'dialogMain.shortcutKeys.items.pasteImage' }
        ]
    },
    {
        titleKey: 'dialogMain.shortcutKeys.groups.view',
        items: [
            { keys: 'F9', labelKey: 'dialogMain.shortcutKeys.items.editMode' },
            { keys: 'F10', labelKey: 'dialogMain.shortcutKeys.items.previewMode' },
            { keys: 'F11', labelKey: 'dialogMain.shortcutKeys.items.editPreviewMode' },
            { keys: 'F12', labelKey: 'dialogMain.shortcutKeys.items.devTools' }
        ]
    }
]

function handleClose(): void {
    emit('close')
}
</script>

<style scoped>
.container {
    max-height: 62vh;
    overflow-y: auto;
    padding: 18px 24px 20px;
}

.intro {
    font-size: 12px;
    line-height: 1.6;
    color: var(--secondary-text-color);
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 8px 12px;
    margin-bottom: 16px;
}

.section {
    margin-bottom: 16px;
}

.section-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 8px;
    padding-left: 8px;
    border-left: 3px solid var(--accent-color);
}

.shortcut-list {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 4px 14px;
}

.shortcut-row {
    display: flex;
    align-items: center;
    padding: 6px 0;
    font-size: 13px;
    border-bottom: 1px solid var(--border-color);
}

.shortcut-row:last-child {
    border-bottom: none;
}

kbd {
    flex: 0 0 150px;
    font-family: 'Consolas', 'Courier New', monospace;
    font-size: 12px;
    color: var(--accent-color);
}

.shortcut-label {
    flex: 1;
    color: var(--text-color);
}

/* 底栏：左侧只读说明 + 右侧关闭按钮（保留迁移前 footer 的说明文案） */
.footer-hint {
    flex: 1;
    font-size: 12px;
    color: var(--secondary-text-color);
    align-self: center;
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

.btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}
</style>
