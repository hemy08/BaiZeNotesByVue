<template>
    <!--
        C-2 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 900px 宽度；
        容器 max-width 94vw / 高 640px / max-height 88vh、标题栏与底栏 flex-shrink:0、
        底栏内边距 14px 20px 通过 containerStyle / titleBarStyle / footerStyle 覆盖还原
        （遮罩、容器底色/圆角/阴影、右对齐 gap10 底栏与 0.2s 动画同默认壳）。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.materialSyntax.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="900px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :footer-style="footerStyle"
        @close="handleCancel"
    >
        <div class="main-content">
            <!-- 左侧：15 项 mkdocs-material 扩展语法入口 -->
            <aside class="feature-list">
                <button
                    v-for="feature in materialFeatures"
                    :key="feature.id"
                    class="feature-item"
                    :class="{ selected: selectedFeatureId === feature.id }"
                    :data-feature="feature.id"
                    @click="selectedFeatureId = feature.id"
                >
                    <span class="feature-icon">{{ feature.icon }}</span>
                    <span class="feature-name">{{ t(feature.nameKey) }}</span>
                </button>
            </aside>

            <!-- 右侧：当前语法项的表单（字段由 FEATURES 数据驱动） -->
            <section class="form-panel" :data-active-feature="selectedFeatureId">
                <div
                    v-for="field in visibleFields"
                    :key="field.key"
                    class="input-group"
                    :data-field="field.key"
                >
                    <label v-if="field.kind === 'checkbox'" class="checkbox-row">
                        <input
                            type="checkbox"
                            :checked="readBoolean(field.key)"
                            @change="onCheckboxChange(field.key, $event)"
                        />
                        <span class="checkbox-text">{{ t(field.labelKey) }}</span>
                    </label>
                    <template v-else>
                        <label class="input-label">{{ t(field.labelKey) }}</label>
                        <select
                            v-if="field.kind === 'select'"
                            class="select-input"
                            :value="readString(field.key)"
                            @change="onSelectChange(field.key, $event)"
                        >
                            <option
                                v-for="option in field.options || []"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ t(option.labelKey) }}
                            </option>
                        </select>
                        <textarea
                            v-else-if="field.kind === 'textarea'"
                            class="textarea-input"
                            :value="readString(field.key)"
                            :placeholder="placeholderOf(field)"
                            @input="onTextInput(field.key, $event)"
                        ></textarea>
                        <input
                            v-else
                            class="text-input"
                            type="text"
                            :value="readString(field.key)"
                            :placeholder="placeholderOf(field)"
                            :list="field.iconSuggestions ? ICON_DATALIST_ID : undefined"
                            @input="onTextInput(field.key, $event)"
                        />
                    </template>
                </div>
                <!-- Material 图标名候选（来自预览渲染同一份 MDI 图标表，避免两套名单漂移） -->
                <datalist v-if="selectedFeatureId === 'icon'" :id="ICON_DATALIST_ID">
                    <option
                        v-for="iconName in iconNames"
                        :key="iconName"
                        :value="iconName"
                    ></option>
                </datalist>
            </section>
        </div>

        <!-- 底部：将要插入的 markdown 实时预览（纯文本，不做 HTML 渲染） -->
        <div class="preview-section">
            <label class="preview-label">{{ t('dialogRenderer.common.preview') }}</label>
            <pre class="preview" :class="{ empty: !previewMarkdown }">{{ previewText }}</pre>
        </div>

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button class="dialog-btn dialog-btn--primary btn btn-insert" @click="handleInsert">
                {{ t('dialogRenderer.common.insert') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import { getMdiIconNames, loadMdiIconData } from '../../Markdown/mdi-icons-loader'
// M3（结构优化第 5 批）：功能项 id 联合类型与顺序清单由 shared 单一 manifest 提供，
// 新增/改名扩展语法只改 shared/constants/material-syntax.ts（类型层面禁止未登记 id）。
import type { MaterialSyntaxFeatureId } from '../../../../../shared/constants/material-syntax'
// 结构优化第 5 批 5.5：表单模型 / 15 项功能项定义 / markdown 生成纯函数抽到 ./material-syntax 目录，
// 组件只保留模板、响应式状态与 DOM 事件绑定（生成规则见 material-syntax/generators.ts）。
import {
    buildMaterialSyntaxSnippet,
    createDefaultForm,
    filterVisibleFields,
    I18N_PREFIX,
    isMaterialFeatureId,
    MATERIAL_FEATURE_IDS,
    materialFeatures,
    type MaterialFeatureDefinition,
    type MaterialFeatureField,
    type MaterialFormKey,
    type MaterialSyntaxForm
} from './material-syntax'

/**
 * Material 语法插入对话框（覆盖 15 项 mkdocs-material 扩展语法）。
 *
 * 契约（与菜单代理约定）：
 * - 对话框名 `materialSyntax`，状态 `dialogs.materialSyntax = { visible, preset? }`；
 * - 打开：`configStore.showDialog('materialSyntax', { preset: '<featureId>' })`；
 * - props：`visible` / `preset`；emits：`close` / `insert(markdown)`（插入后不自动关闭）。
 *
 * 实现要点：
 * 1. 左侧 15 项功能列表 + 右侧表单均为数据驱动（MATERIAL_FEATURES），新增/调整字段只需改常量；
 * 2. 生成逻辑集中在纯函数 `buildMaterialSyntaxSnippet(featureId, form)`（不读全局状态/不调 t()），
 *    底部预览与实际插入共用同一结果，保证「所见即所插」；
 * 3. 每个功能项的默认值经 `createDefaultForm()` 预填，打开即点「插入」也能产出合法片段；
 * 4. 预览区是纯文本 `<pre>` 文本插值（Vue 自动转义），不渲染 HTML，无 XSS 面。
 */

interface Props {
    visible: boolean
    /** featureId：由菜单动作传入，决定打开时左侧选中项；缺省/非法时选第一项 */
    preset?: string
}

const props = defineProps<Props>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', markdown: string): void
}>()

// C-2 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳一致）。
// 迁移前容器：宽 900px / max-width 94vw / 高 640px / max-height 88vh；
// 标题栏：底部不放大的固定高度栏（flex-shrink: 0）；
// 底栏：内边距 14px 20px（默认壳为 15px 20px），且不随内容压缩（flex-shrink: 0）。
const containerStyle: CSSProperties = {
    maxWidth: '94vw',
    height: '640px',
    maxHeight: '88vh'
}
const titleBarStyle: CSSProperties = { flexShrink: 0 }
const footerStyle: CSSProperties = { padding: '14px 20px', flexShrink: 0 }

const ICON_DATALIST_ID = 'material-syntax-icon-list'
/**
 * 图标名候选：复用预览渲染的 MDI 图标表（键即 `:material-<name>:` 中的 <name>）。
 * P2-4 修复：全量数据动态 import 懒加载——初始为同步内嵌的核心子集名，
 * 全量数据到达后刷新（挂载时触发加载并更新，datalist 从核心集平滑扩展到全量）。
 */
const iconNames = ref<string[]>(getMdiIconNames())

onMounted(async () => {
    try {
        await loadMdiIconData()
        iconNames.value = getMdiIconNames()
    } catch {
        // 全量数据加载失败时保留核心子集名，对话框功能不受影响
    }
})

const form = reactive<MaterialSyntaxForm>(createDefaultForm())

const selectedFeatureId = ref<MaterialSyntaxFeatureId>(MATERIAL_FEATURE_IDS[0])

const activeFeature = computed<MaterialFeatureDefinition>(() => {
    return (
        materialFeatures.find((feature) => feature.id === selectedFeatureId.value) ??
        materialFeatures[0]
    )
})

/** 当前功能项要渲染的字段（按 visibleWhen 裁剪，如 attr-list 按模式只显示相关字段） */
const visibleFields = computed<ReadonlyArray<MaterialFeatureField>>(() =>
    filterVisibleFields(activeFeature.value.fields, form)
)

/**
 * 每次打开时按 preset 选中对应功能项；无 preset / 非法 id 时选第一项。
 * 同时监听 preset：对话框保持打开时菜单再次切换语法项也能立即生效。
 */
watch(
    [() => props.visible, () => props.preset],
    () => {
        if (!props.visible) {
            return
        }
        selectedFeatureId.value = isMaterialFeatureId(props.preset)
            ? props.preset
            : MATERIAL_FEATURE_IDS[0]
    },
    { immediate: true }
)

/* ============================== 表单读写 ============================== */

function setFormValue(key: MaterialFormKey, value: string | boolean): void {
    const target = form as Record<MaterialFormKey, string | boolean>
    target[key] = value
}

function readString(key: MaterialFormKey): string {
    const value = form[key]
    return typeof value === 'string' ? value : ''
}

function readBoolean(key: MaterialFormKey): boolean {
    return form[key] === true
}

function placeholderOf(field: MaterialFeatureField): string {
    return field.placeholderKey ? t(field.placeholderKey) : ''
}

function onTextInput(key: MaterialFormKey, event: Event): void {
    setFormValue(key, (event.target as HTMLInputElement | HTMLTextAreaElement).value)
}

function onSelectChange(key: MaterialFormKey, event: Event): void {
    setFormValue(key, (event.target as HTMLSelectElement).value)
}

function onCheckboxChange(key: MaterialFormKey, event: Event): void {
    setFormValue(key, (event.target as HTMLInputElement).checked)
}

/* ============================== 预览与插入 ============================== */

const previewMarkdown = computed(() => buildMaterialSyntaxSnippet(selectedFeatureId.value, form))

const previewText = computed(() => {
    if (selectedFeatureId.value === 'icon' && previewMarkdown.value.length === 0) {
        return t(`${I18N_PREFIX}.iconNameRequired`)
    }
    if (previewMarkdown.value.length === 0) {
        return t(`${I18N_PREFIX}.previewEmptyHint`)
    }
    return previewMarkdown.value
})

function handleCancel(): void {
    emit('close')
}

/** 点「插入」只 emit insert（父组件插入到编辑器），不自动关闭对话框，方便连续插入 */
function handleInsert(): void {
    if (previewMarkdown.value.length === 0) {
        return
    }
    emit('insert', previewMarkdown.value)
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   底栏按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   这里只保留正文（功能列表/表单/预览）样式。 */
.main-content {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
}

.feature-list {
    width: 218px;
    flex-shrink: 0;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
    border-right: 1px solid var(--border-color);
    background: var(--card-bg);
}

.feature-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-color);
    font-size: 13px;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s;
}

.feature-item:hover {
    background: var(--hover-bg);
}

.feature-item.selected {
    border-color: var(--accent-color);
    background: var(--hover-bg);
    color: var(--accent-color);
    font-weight: 600;
}

.feature-icon {
    width: 18px;
    flex-shrink: 0;
    text-align: center;
    font-size: 15px;
    line-height: 1;
}

.feature-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.form-panel {
    flex: 1;
    min-width: 0;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.input-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
}

.text-input,
.select-input,
.textarea-input {
    width: 100%;
    padding: 9px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--card-bg);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
}

.select-input {
    cursor: pointer;
}

.textarea-input {
    min-height: 92px;
    resize: vertical;
    font-family: var(--code-font-family, 'SF Mono', Monaco, 'Cascadia Code', monospace);
    line-height: 1.5;
}

.text-input:focus,
.select-input:focus,
.textarea-input:focus {
    border-color: var(--accent-color);
}

.checkbox-row {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-color);
    cursor: pointer;
    user-select: none;
}

.checkbox-row input[type='checkbox'] {
    width: 15px;
    height: 15px;
    accent-color: var(--accent-color);
    cursor: pointer;
    margin: 0;
}

.preview-section {
    flex-shrink: 0;
    padding: 12px 20px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-top: 1px solid var(--border-color);
    background: var(--card-bg);
}

.preview-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
}

.preview {
    margin: 0;
    padding: 10px 12px;
    max-height: 132px;
    overflow: auto;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-color);
    color: var(--text-color);
    font-family: var(--code-font-family, 'SF Mono', Monaco, 'Cascadia Code', monospace);
    font-size: 12px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-all;
}

.preview.empty {
    color: var(--secondary-text-color);
    font-style: italic;
}
</style>
