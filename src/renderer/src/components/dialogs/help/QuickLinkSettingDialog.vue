<template>
    <!--
        C-3 迁移：large（48px 标题栏 / 16px 标题）+ rounded（32px 圆角关闭按钮）+ 800×600 容器。
        迁移前后的外壳差异全部用 BaseDialog 现有能力等价表达：
        - 标题 16px（large 变体默认 16px/600，显式锁定字号防变体后续调整）；
        - 关闭按钮 18px 图标 + Electron no-drag → closeButtonStyle；
        - 标题栏迁移前是 Electron 原生拖拽区（-webkit-app-region: drag，无 JS 拖拽 /
          cursor: move / user-select: none）→ draggable=false + titleBarStyle 还原
          （app-region drag、flex-shrink:0，cursor/user-select 显式恢复初始值）；
        - 底栏内边距 15px 20px（与默认壳一致）、按钮间距 12px 且不随内容压缩 → footerStyle；
        - 容器固定高 600px → containerStyle（宽度由 width 属性承载）。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.quickLink.title')"
        title-bar-variant="large"
        close-button-variant="rounded"
        width="800px"
        :draggable="false"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :title-text-style="titleTextStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
        <div class="main-content">
            <div class="content-wrapper">
                <div class="link-list">
                    <div class="list-header">
                        <h3>{{ t('dialogRenderer.quickLink.listTitle') }}</h3>
                        <button class="add-btn" @click="handleAdd">+ {{ t('common.add') }}</button>
                    </div>

                    <div class="link-items">
                        <div
                            v-for="(link, index) in links"
                            :key="index"
                            class="link-item"
                            :class="{ selected: selectedIndex === index }"
                            @click="selectedIndex = index"
                        >
                            <div class="link-info">
                                <span class="link-icon">{{ link.icon }}</span>
                                <span class="link-name">{{ link.name }}</span>
                            </div>
                            <div class="link-actions">
                                <button class="action-btn" @click.stop="handleEdit(index)">
                                    {{ t('dialogRenderer.common.edit') }}
                                </button>
                                <button class="action-btn delete" @click.stop="handleDelete(index)">
                                    {{ t('common.delete') }}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="showForm" class="link-form">
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
                            v-model="formData.name"
                            type="text"
                            class="form-input"
                            :placeholder="t('dialogRenderer.quickLink.namePlaceholder')"
                        />
                    </div>

                    <div class="form-group">
                        <label>URL</label>
                        <input
                            v-model="formData.url"
                            type="text"
                            class="form-input"
                            placeholder="https://..."
                        />
                    </div>

                    <div class="form-group">
                        <label>{{ t('dialogRenderer.quickLink.iconLabel') }}</label>
                        <input
                            v-model="formData.icon"
                            type="text"
                            class="form-input"
                            placeholder="🌐"
                            maxlength="2"
                        />
                    </div>

                    <div class="form-group">
                        <label>{{ t('dialogRenderer.quickLink.descLabel') }}</label>
                        <textarea
                            v-model="formData.description"
                            class="form-textarea"
                            :placeholder="t('dialogRenderer.quickLink.descPlaceholder')"
                        ></textarea>
                    </div>

                    <div class="form-actions">
                        <button class="btn btn-cancel" @click="handleCancelForm">
                            {{ t('common.cancel') }}
                        </button>
                        <button class="btn btn-primary" @click="handleSaveForm">
                            {{ t('common.save') }}
                        </button>
                    </div>
                </div>

                <div v-else-if="links.length === 0" class="empty-state">
                    <p>{{ t('dialogRenderer.quickLink.emptyState') }}</p>
                    <button class="add-btn" @click="handleAdd">
                        {{ t('dialogRenderer.quickLink.addFirst') }}
                    </button>
                </div>
            </div>
        </div>

        <template #footer>
            <button class="btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button class="btn btn-apply" @click="handleApply">
                {{ t('common.apply') }}
            </button>
            <button class="btn btn-confirm" @click="handleConfirm">
                {{ t('common.ok') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
// P1-FE-04：快捷链接设置数据源统一——读写统一走主进程 quickLinks（与 NaviTab 同源）
import { IPC } from '../../../../../shared/ipc-channels'
import type { QuickLinkItem } from '../../../../../shared/types'

interface Link {
    name: string
    url: string
    icon: string
    description: string
    /**
     * P1-FE-04：从主进程加载的原始 QuickLinkItem。
     * 保留对话框不可编辑的 id/enabled/position 以及 svg/img 图标类型，
     * 保存时未改动的字段原样回写，避免往返丢失。
     */
    source?: QuickLinkItem
}

interface Props {
    visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'apply', links: Link[]): void
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

// 迁移前容器固定高 600px（宽度由 width 属性承载 800px）。
const containerStyle: CSSProperties = { height: '600px' }
// 迁移前标题栏是 Electron 原生拖拽区（-webkit-app-region: drag），且没有 JS 拖拽、
// 未声明 cursor / user-select / flex-shrink：BaseDialog 默认标题栏带 cursor:move /
// user-select:none / 可压缩，这里逐项还原（cursor/user-select 显式恢复初始值 auto）。
const titleBarStyle: DialogStyleOverrides = {
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    cursor: 'auto',
    userSelect: 'auto'
}
// 迁移前标题为 16px（large 变体默认 16px/600，显式锁定字号防变体调整造成偏差）。
const titleTextStyle: CSSProperties = { fontSize: '16px' }
// 迁移前关闭按钮为 18px 图标（rounded 变体默认 16px），并保留 no-drag 使按钮在拖拽区内可点击。
const closeButtonStyle: DialogStyleOverrides = {
    fontSize: '18px',
    WebkitAppRegion: 'no-drag'
}
// 迁移前底栏按钮间距 12px 且不随内容压缩（默认壳 gap 10px / 可压缩；内边距 15px 20px 与默认一致）。
const footerStyle: CSSProperties = { gap: '12px', flexShrink: 0 }

// 主进程读取失败时的兜底展示（正常情况下会被主进程 quickLinks 覆盖）
const DEFAULT_LINKS: Link[] = [
    {
        name: 'GitHub',
        url: 'https://github.com',
        icon: '🐙',
        description: t('dialogRenderer.quickLink.defaultGitHubDesc')
    },
    {
        name: 'Google',
        url: 'https://google.com',
        icon: '🔍',
        description: t('dialogRenderer.quickLink.defaultGoogleDesc')
    },
    {
        name: 'Stack Overflow',
        url: 'https://stackoverflow.com',
        icon: '📚',
        description: t('dialogRenderer.quickLink.defaultStackOverflowDesc')
    }
]

function cloneLinks(list: Link[]): Link[] {
    return JSON.parse(JSON.stringify(list)) as Link[]
}

const links = ref<Link[]>(cloneLinks(DEFAULT_LINKS))
const initialLinks = ref<Link[]>(cloneLinks(DEFAULT_LINKS))
// 打开对话框后用户是否已改动列表：主进程读取是异步的，若用户在读取返回前已增删改，
// 迟到的读取结果不得覆盖用户操作（否则表现为「刚删掉的链接又回来了」）。
let userModifiedSinceOpen = false

/** 主进程 QuickLinkItem 在对话框内的展示图标（svg/img 无法在 2 字符输入框内编辑，用通用图标占位） */
function getDisplayIcon(item: QuickLinkItem): string {
    return item.icon === 'svg' || item.icon === 'img' ? '🔗' : item.iconContent
}

/** 主进程 QuickLinkItem → 对话框 Link */
function toDialogLink(item: QuickLinkItem): Link {
    return {
        name: item.name,
        url: item.path,
        icon: getDisplayIcon(item),
        description: '',
        source: item
    }
}

/** 主进程返回值形状校验（IPC 返回 unknown，防御异常数据） */
function isQuickLinkItem(value: unknown): value is QuickLinkItem {
    return (
        value !== null &&
        typeof value === 'object' &&
        typeof (value as QuickLinkItem).name === 'string' &&
        typeof (value as QuickLinkItem).path === 'string'
    )
}

/**
 * P1-FE-04：从主进程读取 quickLinks（与 NaviTab 同一数据源），
 * 保证设置对话框展示的是导航栏当前生效配置，避免用兜底默认值覆盖用户已保存的链接。
 */
async function loadLinksFromMain(): Promise<void> {
    let loaded: Link[] | null = null
    try {
        const items: unknown = await window.electron.ipcRenderer.invoke(IPC.QUICK_LINKS.GET)
        if (Array.isArray(items)) {
            // 主进程返回空数组是合法状态（用户删除了全部链接），仅读取失败时保留兜底默认值
            loaded = items.filter(isQuickLinkItem).map(toDialogLink)
        }
    } catch (error) {
        console.warn('[QuickLinkSettingDialog] 读取主进程快捷链接失败，使用兜底默认值:', error)
    }
    // 取消操作始终回滚到「打开时的数据源状态」；读取失败时回滚到当前兜底列表
    initialLinks.value = cloneLinks(loaded ?? links.value)
    if (loaded !== null && !userModifiedSinceOpen) {
        links.value = loaded
    }
}

/** 对话框 Link → 主进程 QuickLinkItem（source 未改动时保留 id/enabled/position/原始图标） */
function toQuickLinkItem(link: Link, index: number): QuickLinkItem {
    const source = link.source
    const samePath = source !== undefined && source.path === link.url
    const iconUnchanged = source !== undefined && samePath && getDisplayIcon(source) === link.icon
    return {
        id: source?.id || `quick-link-${index + 1}`,
        name: link.name,
        type: samePath ? source.type : 'url',
        path: link.url,
        // 'auto' 不是主进程图标白名单值：主进程按 iconContent 推断实际渲染分支（svg/img/emoji/text）
        icon: iconUnchanged ? source.icon : 'auto',
        iconContent: iconUnchanged ? source.iconContent : link.icon,
        enabled: source?.enabled ?? true,
        order: index + 1,
        position: source?.position ?? 'left'
    }
}

/**
 * P1-FE-04：经 IPC.QUICK_LINKS.SAVE 保存到主进程 quickLinks（唯一数据源），
 * 主进程保存成功后广播 UPDATED，NaviTab 监听后即时刷新。
 * @returns 是否保存成功（失败时对话框保持打开，避免用户改动丢失）
 */
async function saveLinksToMain(): Promise<boolean> {
    const items = links.value.map((link, index) => toQuickLinkItem(link, index))
    try {
        const result: unknown = await window.electron.ipcRenderer.invoke(
            IPC.QUICK_LINKS.SAVE,
            items
        )
        if (
            result !== null &&
            typeof result === 'object' &&
            (result as { ok?: unknown }).ok === false
        ) {
            console.error('[QuickLinkSettingDialog] 主进程拒绝保存快捷链接:', result)
            return false
        }
        return true
    } catch (error) {
        console.error('[QuickLinkSettingDialog] 保存快捷链接失败:', error)
        return false
    }
}

const selectedIndex = ref(-1)
const showForm = ref(false)
const isEditing = ref(false)
const editingIndex = ref(-1)

const formData = reactive({
    name: '',
    url: '',
    icon: '🌐',
    description: ''
})

watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            userModifiedSinceOpen = false
            void loadLinksFromMain()
        }
    },
    { immediate: true }
)

function handleAdd() {
    isEditing.value = false
    editingIndex.value = -1
    Object.assign(formData, { name: '', url: '', icon: '🌐', description: '' })
    showForm.value = true
}

function handleEdit(index: number) {
    isEditing.value = true
    editingIndex.value = index
    Object.assign(formData, links.value[index])
    showForm.value = true
}

function handleDelete(index: number) {
    userModifiedSinceOpen = true
    links.value.splice(index, 1)
    if (selectedIndex.value === index) {
        selectedIndex.value = -1
    }
}

function handleCancelForm() {
    showForm.value = false
    editingIndex.value = -1
}

function handleSaveForm() {
    if (!formData.name || !formData.url) return

    userModifiedSinceOpen = true
    const link: Link = {
        name: formData.name,
        url: formData.url,
        icon: formData.icon || '🌐',
        description: formData.description
    }

    if (isEditing.value && editingIndex.value >= 0) {
        // 名称/URL 编辑不改变图标时，保留主进程原始项的不可编辑字段（id/enabled/position 等）
        const previous = links.value[editingIndex.value]
        if (previous?.source !== undefined && getDisplayIcon(previous.source) === link.icon) {
            link.source = previous.source
        }
        links.value[editingIndex.value] = link
    } else {
        links.value.push(link)
    }

    showForm.value = false
}

function handleClose() {
    emit('close')
}

async function handleApply() {
    if (!(await saveLinksToMain())) {
        return
    }
    emit('apply', cloneLinks(links.value))
}

async function handleConfirm() {
    if (!(await saveLinksToMain())) {
        return
    }
    emit('apply', cloneLinks(links.value))
    emit('close')
}

function handleCancel() {
    links.value = cloneLinks(initialLinks.value)
    handleClose()
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/title-text/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留正文（链接列表/编辑表单）与按钮样式。 */
.main-content {
    flex: 1;
    padding: 20px;
    overflow: hidden;
}

.content-wrapper {
    height: 100%;
    display: flex;
    gap: 20px;
}

.link-list {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--card-bg);
    border-radius: 8px;
    border: 1px solid var(--border-color);
    overflow: hidden;
}

.list-header {
    padding: 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
}

.list-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
}

.add-btn {
    padding: 6px 12px;
    border: none;
    border-radius: 4px;
    background: var(--accent-color);
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    transition: opacity 0.2s;
}

.add-btn:hover {
    opacity: 0.9;
}

.link-items {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
}

.link-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: background 0.2s;
    margin-bottom: 4px;
}

.link-item:hover {
    background: var(--hover-bg);
}

.link-item.selected {
    background: var(--hover-bg);
    border-left: 3px solid var(--accent-color);
}

.link-info {
    display: flex;
    align-items: center;
    gap: 10px;
}

.link-icon {
    font-size: 20px;
}

.link-name {
    font-size: 13px;
    color: var(--text-color);
}

.link-actions {
    display: flex;
    gap: 8px;
    opacity: 0;
    transition: opacity 0.2s;
}

.link-item:hover .link-actions {
    opacity: 1;
}

.action-btn {
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.action-btn.delete:hover {
    border-color: #ff4d4f;
    color: #ff4d4f;
}

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

.empty-state {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    color: var(--secondary-text-color);
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
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    color: var(--text-color);
}

.btn-cancel:hover {
    background: var(--border-color);
}

.btn-apply {
    background: var(--card-bg);
    border: 1px solid var(--accent-color);
    color: var(--accent-color);
}

.btn-apply:hover {
    background: var(--accent-color);
    color: #fff;
}

.btn-confirm {
    background: var(--accent-color);
    color: #fff;
}

.btn:hover {
    opacity: 0.9;
}
</style>
