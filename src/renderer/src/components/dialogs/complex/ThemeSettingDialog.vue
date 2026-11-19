<template>
    <!--
        C-4 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 900×600 容器；
        容器宽高由 useDialogResize 动态维护（初始 900×600，拖动 8 个 resize-handle 可调整），
        因此经 containerStyle 内联覆盖；8 个 resize-handle 放进 BaseDialog 的 #prepend 插槽
        （容器内、title-bar 之前，与迁移前 DOM 位置一致；容器由 useDialogDrag 内联 position:fixed
        定位，绝对定位的 resize-handle 仍以容器为基准）；标题栏/底栏 flex-shrink: 0、
        底栏 15px 24px 内边距与 12px 间距经样式 prop 覆盖还原；遮罩、容器底色/圆角/阴影、
        标题栏渐变、关闭按钮样式与 0.2s 动画均与默认壳逐项一致。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.themeSetting.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="900px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :footer-style="footerStyle"
        @close="handleCancel"
    >
        <template #prepend>
            <!--
                调整大小的边框：class 与指针事件处理与迁移前一致，且仍位于 title-bar 之前。
                第 4 批 P3 缺陷修复：useDialogResize 的 startResize(direction) 是「柯里化」函数——
                它返回真正的 mousedown 处理函数，本身不会启动缩放。此前模板写成
                `@mousedown="startResize('n')"` 只是求值了外层调用、返回的函数未被调用，
                导致 8 个 handle 全部失效（拖拽 resize 无任何反应）。现显式以 $event 调用
                返回的处理函数（内部会 preventDefault / stopPropagation，不会误触发标题栏拖拽）。
            -->
            <div class="resize-handle resize-n" @mousedown="startResize('n')($event)"></div>
            <div class="resize-handle resize-s" @mousedown="startResize('s')($event)"></div>
            <div class="resize-handle resize-e" @mousedown="startResize('e')($event)"></div>
            <div class="resize-handle resize-w" @mousedown="startResize('w')($event)"></div>
            <div class="resize-handle resize-ne" @mousedown="startResize('ne')($event)"></div>
            <div class="resize-handle resize-nw" @mousedown="startResize('nw')($event)"></div>
            <div class="resize-handle resize-se" @mousedown="startResize('se')($event)"></div>
            <div class="resize-handle resize-sw" @mousedown="startResize('sw')($event)"></div>
        </template>

        <div class="main-container">
            <div class="sidebar">
                <div
                    v-for="item in sidebarItems"
                    :key="item.id"
                    :class="['sidebar-item', { active: activePanel === item.id }]"
                    @click="activePanel = item.id"
                >
                    <span class="sidebar-icon">{{ item.icon }}</span>
                    <span class="sidebar-name">{{ t(item.nameKey) }}</span>
                </div>
            </div>

            <div class="content-area">
                <div v-if="activePanel === 'app-theme'" class="panel">
                    <div class="theme-list">
                        <div
                            v-for="category in themeCategories"
                            :key="category.nameKey"
                            class="theme-category"
                        >
                            <h3 class="category-title">
                                {{ t(category.nameKey) }}
                            </h3>
                            <div class="theme-grid">
                                <div
                                    v-for="theme in category.themes"
                                    :key="theme.type"
                                    :class="[
                                        'theme-card',
                                        { selected: currentTheme === theme.type }
                                    ]"
                                    @click="selectTheme(theme.type)"
                                >
                                    <div class="theme-preview" :style="getThemePreviewStyle(theme)">
                                        <div
                                            class="preview-title-bar"
                                            :style="{
                                                background:
                                                    theme.styles?.titleBarGradient ||
                                                    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                                            }"
                                        ></div>
                                        <div class="preview-content">
                                            <div
                                                class="preview-sidebar"
                                                :style="{
                                                    background:
                                                        theme.styles?.cardBackground || '#f5f5f5'
                                                }"
                                            ></div>
                                            <div class="preview-main">
                                                <div
                                                    class="preview-line"
                                                    :style="{
                                                        background:
                                                            theme.styles?.textColor || '#333',
                                                        opacity: 0.8
                                                    }"
                                                ></div>
                                                <div
                                                    class="preview-line"
                                                    :style="{
                                                        background:
                                                            theme.styles?.textColor || '#333',
                                                        opacity: 0.5,
                                                        width: '70%'
                                                    }"
                                                ></div>
                                                <div
                                                    class="preview-line"
                                                    :style="{
                                                        background:
                                                            theme.styles?.accentColor || '#00b0ff',
                                                        opacity: 0.6,
                                                        width: '50%'
                                                    }"
                                                ></div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="theme-info">
                                        <div class="theme-name">
                                            {{ getThemeDisplayName(theme) }}
                                        </div>
                                        <div class="theme-desc">
                                            {{ getThemeDisplayDesc(theme) }}
                                        </div>
                                        <div class="theme-colors">
                                            <div
                                                class="color-dot"
                                                :style="{
                                                    background:
                                                        theme.styles?.backgroundColor || '#fff'
                                                }"
                                                :title="
                                                    t('dialogRenderer.themeSetting.colorBackground')
                                                "
                                            ></div>
                                            <div
                                                class="color-dot"
                                                :style="{
                                                    background:
                                                        theme.styles?.accentColor || '#00b0ff'
                                                }"
                                                :title="
                                                    t('dialogRenderer.themeSetting.colorAccent')
                                                "
                                            ></div>
                                            <div
                                                class="color-dot"
                                                :style="{
                                                    background: theme.styles?.textColor || '#333'
                                                }"
                                                :title="t('dialogRenderer.themeSetting.colorText')"
                                            ></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="activePanel === 'editor-theme'" class="panel">
                    <div class="monaco-theme-list">
                        <div
                            v-for="theme in allMonacoThemes"
                            :key="theme.type"
                            :class="['theme-card', { selected: currentMonacoTheme === theme.type }]"
                            @click="selectMonacoTheme(theme.type)"
                        >
                            <div class="theme-preview" :style="{ background: theme.colors.bg }">
                                <div
                                    class="preview-title-bar"
                                    :style="{ background: theme.colors.bg }"
                                ></div>
                                <div class="preview-content">
                                    <div
                                        class="preview-sidebar"
                                        :style="{
                                            background: theme.colors.bg,
                                            opacity: 0.8
                                        }"
                                    ></div>
                                    <div class="preview-main">
                                        <div
                                            class="preview-line"
                                            :style="{
                                                background: theme.colors.text,
                                                opacity: 0.8
                                            }"
                                        ></div>
                                        <div
                                            class="preview-line"
                                            :style="{
                                                background: theme.colors.text,
                                                opacity: 0.5,
                                                width: '70%'
                                            }"
                                        ></div>
                                        <div
                                            class="preview-line"
                                            :style="{
                                                background: theme.colors.text,
                                                opacity: 0.6,
                                                width: '50%'
                                            }"
                                        ></div>
                                    </div>
                                </div>
                            </div>
                            <div class="theme-info">
                                <div class="theme-name">
                                    {{ getMonacoThemeDisplayName(theme) }}
                                </div>
                                <div class="theme-desc">
                                    {{ getMonacoThemeDisplayDesc(theme) }}
                                </div>
                                <div class="theme-colors">
                                    <div
                                        class="color-dot"
                                        :style="{ background: theme.colors.bg }"
                                        :title="t('dialogRenderer.themeSetting.colorBackground')"
                                    ></div>
                                    <div
                                        class="color-dot"
                                        :style="{ background: theme.colors.text }"
                                        :title="t('dialogRenderer.themeSetting.colorText')"
                                    ></div>
                                    <div
                                        class="color-dot"
                                        :style="{
                                            background: theme.colors.text
                                        }"
                                        :title="t('dialogRenderer.themeSetting.colorAccent')"
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="activePanel === 'font-settings'" class="panel">
                    <div class="setting-group">
                        <label class="setting-label">{{
                            t('dialogRenderer.themeSetting.labelEditorFont')
                        }}</label>
                        <select v-model="editorFont" class="setting-select">
                            <option v-for="font in editorFonts" :key="font" :value="font">
                                {{ font }}
                            </option>
                        </select>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">{{
                            t('dialogRenderer.themeSetting.labelPreviewFont')
                        }}</label>
                        <select v-model="previewFont" class="setting-select">
                            <option v-for="font in previewFonts" :key="font" :value="font">
                                {{ font }}
                            </option>
                        </select>
                    </div>

                    <div class="setting-group">
                        <label class="setting-label">{{
                            t('dialogRenderer.themeSetting.labelFontSize')
                        }}</label>
                        <input
                            v-model="fontSize"
                            type="number"
                            class="setting-input"
                            min="10"
                            max="32"
                        />
                    </div>
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
import { computed, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useDialogResize } from '../../../composables/useDialogResize'
import { IPC } from '../../../../../shared/ipc-channels'
// 第 2 批契约重构：主题领域类型以 shared/types/theme.ts 为唯一真源（不再本地维护 partial 副本）；
// 分组清单以 shared/constants/theme.ts 的 THEME_GROUPS 为唯一真源（浅色/深色/护眼 3 组）。
import type {
    AppThemeConfig,
    MonacoThemeListItem,
    ThemeListItem,
    ThemeStyles
} from '../../../../../shared/types'
import { THEME_GROUPS } from '../../../../../shared/constants/theme'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'change', themeType: string, monacoTheme: string, separateEditorTheme: boolean): void
}>()

const { width, height, startResize } = useDialogResize({
    minWidth: 700,
    minHeight: 500,
    initialWidth: 900,
    initialHeight: 600
})

/**
 * C-4 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳逐项一致）。
 * - 容器：useDialogResize 维护的宽高（初始 900×600）经 computed 同时写入宽与高；
 *   width 属性给出初始宽度声明，拖动 resize-handle 后由 containerStyle 覆盖为实时值；
 *   容器仍由 useDialogDrag（BaseDialog 内部）内联 position:fixed 定位，作为 resize-handle 的
 *   绝对定位基准，与迁移前模板 `{ ...dialogStyle, width, height }` 的定位方式一致。
 * - 标题栏：40px 高 / 0 16px 内边距由 regular 变体提供，旧外壳另声明 flex-shrink: 0；
 * - 底栏：旧外壳 15px 24px 内边距、12px 间距、flex-shrink: 0（默认壳为 15px 20px / gap 10px）。
 */
const containerStyle = computed<CSSProperties>(() => ({
    width: `${width.value}px`,
    height: `${height.value}px`
}))
const titleBarStyle: CSSProperties = { flexShrink: 0 }
const footerStyle: CSSProperties = { padding: '15px 24px', gap: '12px', flexShrink: 0 }

const activePanel = ref('app-theme')
const currentTheme = ref('baize')
const separateEditorTheme = ref(false)
const currentMonacoTheme = ref('vs')
const editorFont = ref('Consolas')
const previewFont = ref('Microsoft YaHei')
const fontSize = ref(14)

const initialSettings = ref({
    currentTheme: 'baize',
    separateEditorTheme: false,
    currentMonacoTheme: 'vs'
})

// 第 2 批契约重构：ThemeListItem / MonacoThemeListItem 直接引用 shared 主题领域类型
// （types/theme.ts）；主进程 getAllThemes() 返回的 styles 是完整 ThemeStyles，
// 不再是历史 partial 断言。本对话框内部只额外补充「预览配色」一个视图字段。

// 渲染层内部使用的编辑器主题视图项（在 shared MonacoThemeListItem 基础上补充预览配色）
interface MonacoThemeViewItem {
    type: string
    name: string
    colors: { bg: string; text: string; accent: string }
    config: MonacoThemeListItem['config']
}

// 第 2 批契约重构：删除本地 RendererThemeConfig（与主进程 ThemeConfig 字段一致但
// 全字段可选的历史断言），读取形状统一引用 shared AppThemeConfig（当前主题/独立编辑器主题）。
// 主题配置结构见 shared/types/config.ts 的 AppThemeConfig。

const themeCategories = ref<
    Array<{
        nameKey: string
        themes: ThemeListItem[]
    }>
>([])

const allMonacoThemes = ref<MonacoThemeViewItem[]>([])

const editorFonts = [
    'Consolas',
    'Monaco',
    'Courier New',
    'Fira Code',
    'Source Code Pro',
    'JetBrains Mono',
    'Menlo',
    'Ubuntu Mono'
]

const previewFonts = [
    'Microsoft YaHei',
    'PingFang SC',
    'Segoe UI',
    'Arial',
    'Helvetica',
    'SimSun',
    'SimHei',
    'KaiTi'
]

const sidebarItems = ref([
    { id: 'app-theme', nameKey: 'dialogRenderer.themeSetting.sidebarAppTheme', icon: '🎨' },
    { id: 'editor-theme', nameKey: 'dialogRenderer.themeSetting.sidebarEditorTheme', icon: '📝' },
    { id: 'font-settings', nameKey: 'dialogRenderer.themeSetting.sidebarFontSettings', icon: '🔤' }
])

async function loadThemes() {
    try {
        const allThemes = (await window.electron.ipcRenderer.invoke(
            IPC.THEME.GET_ALL_THEMES
        )) as ThemeListItem[]

        // 第 2 批契约重构：3 组分类清单统一引用 shared/constants/theme 的 THEME_GROUPS，
        // 本组件不再维护主题 id 硬编码数组（浅色/深色/护眼归属的唯一真源）。
        // 过滤条件与迁移前逐项一致：按组内 type 清单筛选主进程返回的全部主题，
        // 未在清单中的主题（历史/未知值）不展示。
        themeCategories.value = THEME_GROUPS.map((group) => ({
            nameKey: group.labelKey,
            themes: allThemes.filter((theme) => group.types.includes(theme.type))
        }))

        const monacoThemes = (await window.electron.ipcRenderer.invoke(
            IPC.THEME.GET_ALL_MONACO_THEMES
        )) as MonacoThemeListItem[]
        allMonacoThemes.value = monacoThemes.map((t) => ({
            type: t.type,
            name: t.config.name,
            config: t.config,
            colors: {
                bg: t.config.backgroundColor || (t.config.isDark ? '#1e1e1e' : '#ffffff'),
                text: t.config.foregroundColor || (t.config.isDark ? '#d4d4d4' : '#333333'),
                accent: t.config.isDark ? '#007acc' : '#007acc'
            }
        }))

        const themeConfig = await window.api.config.read<AppThemeConfig>('theme')
        if (themeConfig) {
            currentTheme.value = themeConfig.currentTheme || 'baize'
            separateEditorTheme.value = themeConfig.separateEditorTheme || false
            currentMonacoTheme.value = themeConfig.editorTheme || 'vs'

            initialSettings.value = {
                currentTheme: currentTheme.value,
                separateEditorTheme: separateEditorTheme.value,
                currentMonacoTheme: currentMonacoTheme.value
            }
        }
    } catch (error) {
        logger.error('加载主题失败:', error)
    }
}

function getThemePreviewStyle(theme: ThemeListItem) {
    // 第 2 批：shared ThemeStyles 只有 backgroundColor / textColor（主进程从不发送
    // 历史 partial 断言里的 background / color 字段），删除不可达的回退分支，
    // 颜色取值与迁移前实际生效路径一致（backgroundColor / textColor 兜底默认色）。
    const styles: ThemeStyles = theme.styles
    return {
        background: styles.backgroundColor || '#fff',
        color: styles.textColor || '#333'
    }
}

// CMP-30：主题名称/描述优先走 i18n key，词条或字段缺失时回退主题数据中的原文字段
function getThemeDisplayName(theme: ThemeListItem): string {
    const styles = theme.styles
    if (styles?.nameKey) return t(styles.nameKey)
    return styles?.name || theme.type
}

function getThemeDisplayDesc(theme: ThemeListItem): string {
    const styles = theme.styles
    if (styles?.descKey) return t(styles.descKey)
    return styles?.description || t('dialogRenderer.themeSetting.customTheme')
}

function getMonacoThemeDisplayName(theme: MonacoThemeViewItem): string {
    const config = theme.config
    if (config?.nameKey) return t(config.nameKey, { name: theme.name })
    return config?.name || theme.name
}

function getMonacoThemeDisplayDesc(theme: MonacoThemeViewItem): string {
    const config = theme.config
    if (config?.descKey) return t(config.descKey, { name: theme.name })
    return config?.description || t('dialogRenderer.themeSetting.editorThemeFallback')
}

function selectTheme(themeType: string) {
    currentTheme.value = themeType
    emit('change', currentTheme.value, currentMonacoTheme.value, separateEditorTheme.value)
}

function selectMonacoTheme(monacoTheme: string) {
    currentMonacoTheme.value = monacoTheme
    // P2 死通道清理：原此处 send IPC.THEME.UPDATE_MONACO_THEME 企图"立即应用"
    // 编辑器主题，但主进程全仓无该通道监听（实际生效路径为点击应用/确定 →
    // emit('change') → BaiZeNotes.handleThemeChange）。发送点与常量一并删除。
}

function handleCancel() {
    currentTheme.value = initialSettings.value.currentTheme
    separateEditorTheme.value = initialSettings.value.separateEditorTheme
    currentMonacoTheme.value = initialSettings.value.currentMonacoTheme
    emit('close')
}

function handleApply() {
    emit('change', currentTheme.value, currentMonacoTheme.value, separateEditorTheme.value)
}

function handleConfirm() {
    handleApply()
    emit('close')
}

watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            loadThemes()
        }
    }
)
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留正文（侧边栏 / 主题卡片 / 设置项 / 底栏按钮）与 resize-handle 样式。
   resize-handle 渲染在 BaseDialog 的 #prepend 插槽（容器内、title-bar 之前），仍是
   容器的直接子节点，绝对定位基准与迁移前一致。 */
.resize-handle {
    position: absolute;
    z-index: 10;
}

.resize-n,
.resize-s {
    left: 10px;
    right: 10px;
    height: 6px;
    cursor: ns-resize;
}

.resize-n {
    top: -3px;
}

.resize-s {
    bottom: -3px;
}

.resize-e,
.resize-w {
    top: 10px;
    bottom: 10px;
    width: 6px;
    cursor: ew-resize;
}

.resize-e {
    right: -3px;
}

.resize-w {
    left: -3px;
}

.resize-ne,
.resize-nw,
.resize-se,
.resize-sw {
    width: 12px;
    height: 12px;
}

.resize-ne {
    top: -6px;
    right: -6px;
    cursor: nesw-resize;
}

.resize-nw {
    top: -6px;
    left: -6px;
    cursor: nwse-resize;
}

.resize-se {
    bottom: -6px;
    right: -6px;
    cursor: nwse-resize;
}

.resize-sw {
    bottom: -6px;
    left: -6px;
    cursor: nesw-resize;
}

.main-container {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.sidebar {
    width: 180px;
    background: var(--card-bg);
    border-right: 1px solid var(--border-color);
    padding: 12px 0;
}

.sidebar-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 12px 20px;
    cursor: pointer;
    transition: all 0.2s;
    color: var(--text-color);
}

.sidebar-item:hover {
    background: var(--hover-bg);
}

.sidebar-item.active {
    background: rgba(102, 126, 234, 0.1);
    color: var(--accent-color);
    border-right: 3px solid var(--accent-color);
}

.sidebar-icon {
    font-size: 18px;
}

.sidebar-name {
    font-size: 13px;
    font-weight: 500;
}

.content-area {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
    background: var(--bg-color);
}

.panel {
    height: 100%;
}

.theme-list {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.theme-category {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.category-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
    margin: 0;
}

.theme-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
}

.theme-card {
    border: 2px solid var(--border-color);
    border-radius: 12px;
    padding: 12px;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: var(--card-bg);
    display: flex;
    flex-direction: column;
    gap: 10px;
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

.theme-preview {
    height: 100px;
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

.theme-info {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.theme-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
    text-align: left;
    line-height: 1.3;
}

.theme-desc {
    font-size: 11px;
    color: var(--secondary-text-color);
    text-align: left;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.theme-colors {
    display: flex;
    gap: 6px;
    margin-top: 2px;
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

.monaco-theme-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 16px;
}

.setting-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 20px;
}

.setting-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-color);
}

.setting-select,
.setting-input {
    width: 100%;
    max-width: 300px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--card-bg);
    outline: none;
    transition: border-color 0.2s;
}

.setting-select:focus,
.setting-input:focus {
    border-color: var(--accent-color);
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

.btn-confirm:hover {
    opacity: 0.9;
}
</style>
