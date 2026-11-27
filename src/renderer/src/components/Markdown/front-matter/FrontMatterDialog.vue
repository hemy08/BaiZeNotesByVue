<template>
    <!--
        A5 Front matter 属性对话框（renderer-only，自挂载宿主）。
        - 打开时经既有编辑器内容桥 `readActiveMarkdownContent()` 读取当前 Markdown，
          读取失败 / 无活动文档时显示空态（可重试）；
        - 使用 `parseFrontMatter()` 解析现有 front matter，固定字段 + 已有自定义 key 均可编辑；
        - 保存使用 `updateFrontMatter()` 生成新 Markdown，内容有变化时经既有 EventBus
          `MONACO_REPLACE_TEXT` 写回编辑器（不新增 IPC / EventBus 事件）；
        - 无 front matter 且所有字段为空时保存不插入空块；已有块被清空则移除块；
        - 所有用户文案走 `editorUi.frontMatter.*` 建议键 + 中文兜底（词典由主控补）。
    -->
    <BaseDialog
        tool-window
        :visible="state.visible"
        :title="tOr(UI.title, 'Front matter 属性')"
        width="760px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="front-matter-body">
            <div class="fm-toolbar">
                <span class="fm-path" :title="documentHistoryState.activeFilePath">
                    {{ targetText }}
                </span>
                <span v-if="contentSource === 'saved'" class="fm-source-hint">
                    {{ tOr(UI.savedContentHint, '编辑器未就绪，保存后经编辑器内容桥写回') }}
                </span>
            </div>

            <div v-if="loading" class="fm-placeholder" role="status">
                {{ tOr(UI.loading, '正在读取当前文档…') }}
            </div>
            <div v-else-if="loadError" class="fm-placeholder fm-placeholder--error">
                <span>{{ tOr(UI.loadFailed, '读取当前文档内容失败，请稍后重试') }}</span>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary fm-retry"
                    @click="loadContent"
                >
                    {{ tOr(UI.retry, '重试') }}
                </button>
            </div>
            <div v-else-if="noContent" class="fm-placeholder fm-placeholder--empty">
                {{ tOr(UI.noContent, '当前没有可编辑的 Markdown 文档，请先打开或新建文件') }}
            </div>
            <div v-else class="fm-form">
                <div class="fm-hint">{{ formHint }}</div>

                <div class="fm-fields">
                    <label
                        v-for="field in FIELDS"
                        :key="field.key"
                        class="fm-field"
                        :class="{ 'fm-field--list': field.kind === 'list' }"
                    >
                        <span class="fm-label">{{ tOr(field.labelKey, field.fallback) }}</span>
                        <input
                            class="fm-input"
                            type="text"
                            spellcheck="false"
                            autocomplete="off"
                            :data-field="field.key"
                            :value="form[field.key]"
                            :placeholder="
                                field.kind === 'list'
                                    ? tOr(UI.listPlaceholder, '多个值以逗号分隔')
                                    : tOr(UI.scalarPlaceholder, '留空则不写入该属性')
                            "
                            @input="handleFieldInput(field.key, $event)"
                        />
                    </label>
                </div>

                <div class="fm-custom">
                    <div class="fm-section-title">{{ tOr(UI.customTitle, '自定义属性') }}</div>
                    <div v-if="customFields.length === 0" class="fm-custom-empty">
                        {{ tOr(UI.customEmpty, '没有其他自定义属性') }}
                    </div>
                    <div
                        v-for="row in customFields"
                        :key="row.key"
                        class="fm-custom-row"
                        :data-key="row.key"
                    >
                        <span class="fm-custom-key" :title="row.key">{{ row.key }}</span>
                        <input
                            class="fm-input fm-custom-input"
                            type="text"
                            spellcheck="false"
                            autocomplete="off"
                            :data-field="`custom:${row.key}`"
                            :value="row.valueText"
                            :placeholder="row.placeholder"
                            @input="handleCustomInput(row, $event)"
                        />
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--danger fm-custom-remove"
                            :title="tOr(UI.remove, '移除该属性')"
                            :aria-label="tOr(UI.remove, '移除该属性')"
                            @click="removeCustomField(row)"
                        >
                            ×
                        </button>
                    </div>
                </div>

                <div v-if="saveError" class="fm-error">
                    {{ tOr(UI.saveFailed, '保存失败，请稍后重试') }}
                </div>
            </div>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-cancel"
                @click="handleClose"
            >
                {{ tOr(UI.cancel, '取消') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--apply btn-save"
                :disabled="!editable"
                @click="handleSave"
            >
                {{ tOr(UI.save, '保存') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * A5 Front matter 属性对话框（renderer-only，不新增 IPC / 共享设置 / 菜单 / i18n 词典）。
 *
 * 数据流：
 * 1. 打开（或重新打开）→ `readActiveMarkdownContent()`（Monaco 实时模型 → 已保存内容兜底）；
 * 2. `parseFrontMatter()` → 固定字段（title/date/tags/status/summary/aliases）+ 自定义 key；
 * 3. 保存 → 收集表单为 data + keyOrder → `updateFrontMatter()` 生成新 Markdown；
 *    与原文不同时经既有 EventBus `MONACO_REPLACE_TEXT` 写回编辑器（复用全文替换接收器）；
 * 4. 无 front matter 且全部字段为空 → `updateFrontMatter()` 返回原文，不插入空块、不写回。
 *
 * 类型约定：tags / aliases 一律保存为 `string[]`；其余标量在「原值类型」基础上做合理转换
 * （原数字/布尔值编辑后仍是数字/布尔，新值保持字符串）；数组自定义属性按原元素类型尽量保留。
 *
 * i18n：UI 建议键 `editorUi.frontMatter.*` 由主控补词典；词典缺失时 tOr 回退中文兜底，
 * 界面在补齐词典前即可用。
 */
import { computed, reactive, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import EventBus from '../../../common/event-bus/event-bus'
import { EVENT_BUS } from '../../../common/event-bus/event-bus-events'
import {
    documentHistoryState,
    readActiveMarkdownContent,
    type MarkdownContentSource
} from '../../../composables/useDocumentHistory'
import {
    parseFrontMatter,
    updateFrontMatter,
    type FrontMatterScalar,
    type FrontMatterValue,
    type ParsedFrontMatter
} from '../../../../../shared/utils/front-matter'
import BaseDialog from '../../dialogs/BaseDialog.vue'
import { closeFrontMatterDialogState, frontMatterDialogState } from './front-matter-dialog-state'

/** 对话框 UI 文案建议键（主控补 `editorUi.frontMatter.*` 词典后自动生效） */
const UI = {
    title: 'editorUi.frontMatter.title',
    loading: 'editorUi.frontMatter.loading',
    loadFailed: 'editorUi.frontMatter.loadFailed',
    noContent: 'editorUi.frontMatter.noContent',
    retry: 'editorUi.frontMatter.retry',
    target: 'editorUi.frontMatter.target',
    targetFallback: 'editorUi.frontMatter.targetFallback',
    savedContentHint: 'editorUi.frontMatter.savedContentHint',
    presentHint: 'editorUi.frontMatter.presentHint',
    absentHint: 'editorUi.frontMatter.absentHint',
    scalarPlaceholder: 'editorUi.frontMatter.scalarPlaceholder',
    listPlaceholder: 'editorUi.frontMatter.listPlaceholder',
    customTitle: 'editorUi.frontMatter.customTitle',
    customEmpty: 'editorUi.frontMatter.customEmpty',
    remove: 'editorUi.frontMatter.remove',
    save: 'editorUi.frontMatter.save',
    saveFailed: 'editorUi.frontMatter.saveFailed',
    cancel: 'editorUi.frontMatter.cancel',
    fieldTitle: 'editorUi.frontMatter.fields.title',
    fieldDate: 'editorUi.frontMatter.fields.date',
    fieldTags: 'editorUi.frontMatter.fields.tags',
    fieldStatus: 'editorUi.frontMatter.fields.status',
    fieldSummary: 'editorUi.frontMatter.fields.summary',
    fieldAliases: 'editorUi.frontMatter.fields.aliases'
} as const

/** t() 取词，词典缺键时回退中文兜底（并手动补插值，保证补词典前界面可用） */
function tOr(key: string, fallback: string, params?: Record<string, string | number>): string {
    const text = t(key, params)
    if (text !== key) {
        return text
    }
    if (params === undefined) {
        return fallback
    }
    return fallback.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name])
    )
}

/** 字段类型：scalar=单值；list=逗号分隔字符串数组（保存为 string[]） */
type FieldKind = 'scalar' | 'list'

/** 固定字段定义（顺序即表单展示顺序；title/date/tags/status/summary/aliases 与任务约定一致） */
interface FieldDefinition {
    /** front matter 键名 */
    key: string
    /** 字段类型 */
    kind: FieldKind
    /** i18n 建议键 */
    labelKey: string
    /** 中文兜底 */
    fallback: string
}

/** 固定字段（顺序即界面顺序） */
const FIELDS: readonly FieldDefinition[] = [
    {
        key: 'title',
        kind: 'scalar',
        labelKey: UI.fieldTitle,
        fallback: '标题'
    },
    {
        key: 'date',
        kind: 'scalar',
        labelKey: UI.fieldDate,
        fallback: '日期'
    },
    {
        key: 'tags',
        kind: 'list',
        labelKey: UI.fieldTags,
        fallback: '标签'
    },
    {
        key: 'status',
        kind: 'scalar',
        labelKey: UI.fieldStatus,
        fallback: '状态'
    },
    {
        key: 'summary',
        kind: 'scalar',
        labelKey: UI.fieldSummary,
        fallback: '摘要'
    },
    {
        key: 'aliases',
        kind: 'list',
        labelKey: UI.fieldAliases,
        fallback: '别名'
    }
]

/** 固定字段键集合（用于从解析结果中挑出「自定义 key」） */
const FIXED_KEY_SET = new Set(FIELDS.map((field) => field.key))

/** 自定义属性行（已有 key；值以逗号分隔编辑或按标量编辑） */
interface CustomFieldRow {
    /** front matter 键名 */
    key: string
    /** 输入框文本 */
    valueText: string
    /** 原值是否为数组（数组按逗号分隔编辑） */
    list: boolean
    /** 输入框占位文案（按原值类型不同） */
    placeholder: string
}

/** 对话框状态（模块单例，宿主负责挂载 / 卸载） */
const state = frontMatterDialogState

/** 是否正在读取内容 */
const loading = ref(false)
/** 读取失败 */
const loadError = ref(false)
/** 无活动文档（内容桥返回 empty） */
const noContent = ref(false)
/** 内容来源（saved 时提示「基于已保存内容」） */
const contentSource = ref<MarkdownContentSource>('empty')
/** 当前文档是否存在 front matter 块 */
const present = ref(false)
/** 保存失败 */
const saveError = ref(false)
/** 最近一次读取到的完整 Markdown（保存时作为 updateFrontMatter 的输入） */
const originalMarkdown = ref('')
/** 最近一次读取到的 front matter 数据（用于保留原始值类型） */
const originalData = ref<Record<string, FrontMatterValue>>({})
/** 最近一次读取到的键顺序（保存时尽量保持原有顺序） */
const originalKeyOrder = ref<string[]>([])
/** 读取请求序号：连续打开 / 重试时只采用最后一次结果，避免旧结果回写 */
let loadSequence = 0

/** 固定字段表单值（字符串化展示，保存时按原类型转换回去） */
const form = reactive<Record<string, string>>({})

/** 自定义属性行 */
const customFields = ref<CustomFieldRow[]>([])

/** 表单顶部提示中文兜底（词典缺失时展示） */
const PRESENT_HINT_FALLBACK = '以下属性来自当前文件的 front matter，保存后会写回编辑器'
const ABSENT_HINT_FALLBACK = '当前文件没有 front matter，填写属性并保存后将创建（全部留空则不创建）'

/** 当前是否处于可编辑状态（加载中 / 错误 / 无文档时只读） */
const editable = computed(() => !loading.value && !loadError.value && !noContent.value)

/** 顶部目标文档展示 */
const targetText = computed(() =>
    documentHistoryState.activeFilePath
        ? tOr(UI.target, '目标：{path}', { path: documentHistoryState.activeFilePath })
        : tOr(UI.targetFallback, '当前编辑器')
)

/** 表单顶部提示（有无 front matter 两种文案） */
const formHint = computed(() =>
    present.value
        ? tOr(UI.presentHint, PRESENT_HINT_FALLBACK)
        : tOr(UI.absentHint, ABSENT_HINT_FALLBACK)
)

/** 把 front matter 值转换为输入框文本（数组以逗号分隔） */
function valueToText(value: FrontMatterValue | undefined): string {
    if (value === undefined) {
        return ''
    }
    if (value === null) {
        // 显式 null 以文本 "null" 回显，保证「打开后仅保存」不会意外删除该键
        return 'null'
    }
    if (Array.isArray(value)) {
        return value
            .map((item) => (item === null ? '' : String(item)))
            .filter((item) => item.length > 0)
            .join(', ')
    }
    return String(value)
}

/** 拆分逗号分隔的数组文本（兼容中文逗号；忽略空项） */
function splitListText(text: string): string[] {
    return text
        .split(/[,，]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
}

/**
 * 标量转换：空白 = 不写入该键（undefined）；否则按原值类型做合理转换。
 * - 原值为 number：可解析为有限数字则保持 number，否则退化为 string；
 * - 原值为 boolean：true/false（大小写不敏感）保持 boolean，否则退化为 string；
 * - 原值为 null：文本为 null / ~ 时保持 null，否则为 string；
 * - 原值为 string / 数组 / 不存在：一律 string。
 */
function convertScalarValue(
    text: string,
    original: FrontMatterValue | undefined
): FrontMatterScalar | undefined {
    const trimmed = text.trim()
    if (trimmed === '') {
        return undefined
    }
    if (original === null) {
        return /^(?:null|~)$/i.test(trimmed) ? null : trimmed
    }
    if (typeof original === 'number') {
        const numeric = Number(trimmed)
        return Number.isFinite(numeric) ? numeric : trimmed
    }
    if (typeof original === 'boolean') {
        const lower = trimmed.toLowerCase()
        if (lower === 'true') {
            return true
        }
        if (lower === 'false') {
            return false
        }
        return trimmed
    }
    return trimmed
}

/** 数组自定义属性：按原数组元素类型尽量保留（文本与前元素字符串化相同则沿用原值） */
function parseListPreservingTypes(
    text: string,
    original: FrontMatterValue | undefined
): FrontMatterScalar[] {
    const originals = Array.isArray(original) ? original : []
    return splitListText(text).map((item) => {
        const matched = originals.find(
            (originalItem) => originalItem !== null && String(originalItem) === item
        )
        return matched ?? item
    })
}

/** 安全写入数据键：`__proto__` 写成普通自有属性，避免污染对象原型 */
function setDataValue(
    data: Record<string, FrontMatterValue>,
    key: string,
    value: FrontMatterValue
): void {
    if (key === '__proto__') {
        Object.defineProperty(data, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true
        })
        return
    }
    data[key] = value
}

/** 重置编辑器数据（加载失败 / 无文档时） */
function resetEditor(): void {
    originalMarkdown.value = ''
    originalData.value = {}
    originalKeyOrder.value = []
    present.value = false
    customFields.value = []
    for (const field of FIELDS) {
        form[field.key] = ''
    }
}

/** 用解析结果填充表单（固定字段 + 已有自定义 key） */
function fillForm(parsed: ParsedFrontMatter): void {
    for (const field of FIELDS) {
        const value = parsed.data[field.key]
        // 列表字段的 null 视为空（tags / aliases 一律保存为 string[]，不保留 null）
        form[field.key] = field.kind === 'list' && value === null ? '' : valueToText(value)
    }

    const customKeys: string[] = []
    const collectCustomKey = (key: string): void => {
        if (FIXED_KEY_SET.has(key) || customKeys.includes(key)) {
            return
        }
        if (!Object.prototype.hasOwnProperty.call(parsed.data, key)) {
            return
        }
        customKeys.push(key)
    }
    // 先按原键顺序，再补 keyOrder 未覆盖但 data 中存在的键（防御性，正常解析两者一致）
    for (const key of parsed.keyOrder) {
        collectCustomKey(key)
    }
    for (const key of Object.keys(parsed.data)) {
        collectCustomKey(key)
    }

    customFields.value = customKeys.map((key) => {
        const value = parsed.data[key]
        const list = Array.isArray(value)
        return {
            key,
            valueText: valueToText(value),
            list,
            placeholder: list
                ? tOr(UI.listPlaceholder, '多个值以逗号分隔')
                : tOr(UI.scalarPlaceholder, '留空则不写入该属性')
        }
    })
}

/** 保存时使用的 front matter 数据与键顺序 */
interface FrontMatterFormResult {
    data: Record<string, FrontMatterValue>
    keyOrder: string[]
}

/** 收集表单为 updateFrontMatter 需要的 data + keyOrder（保持原键顺序优先） */
function buildFrontMatterData(): FrontMatterFormResult {
    const computedValues = new Map<string, FrontMatterValue | undefined>()

    for (const field of FIELDS) {
        if (field.kind === 'list') {
            // tags / aliases 一律保存为 string[]
            const items = splitListText(form[field.key] ?? '')
            computedValues.set(field.key, items.length > 0 ? items : undefined)
        } else {
            computedValues.set(
                field.key,
                convertScalarValue(form[field.key] ?? '', originalData.value[field.key])
            )
        }
    }

    for (const row of customFields.value) {
        const original = originalData.value[row.key]
        if (row.list || Array.isArray(original)) {
            const items = parseListPreservingTypes(row.valueText, original)
            computedValues.set(row.key, items.length > 0 ? items : undefined)
        } else {
            computedValues.set(row.key, convertScalarValue(row.valueText, original))
        }
    }

    const keyOrder: string[] = []
    const addKey = (key: string): void => {
        if (keyOrder.includes(key) || computedValues.get(key) === undefined) {
            return
        }
        keyOrder.push(key)
    }
    // 保留原 front matter 键顺序（含自定义 key 的位置），再补固定字段规范顺序
    for (const key of originalKeyOrder.value) {
        addKey(key)
    }
    for (const field of FIELDS) {
        addKey(field.key)
    }
    for (const row of customFields.value) {
        addKey(row.key)
    }

    const data: Record<string, FrontMatterValue> = {}
    for (const key of keyOrder) {
        const value = computedValues.get(key)
        if (value !== undefined) {
            setDataValue(data, key, value)
        }
    }
    return { data, keyOrder }
}

/** 读取当前文档内容并解析 front matter */
async function loadContent(): Promise<void> {
    const sequence = ++loadSequence
    loading.value = true
    loadError.value = false
    saveError.value = false
    try {
        const snapshot = await readActiveMarkdownContent()
        if (sequence !== loadSequence) {
            return
        }
        contentSource.value = snapshot.source
        if (snapshot.source === 'empty') {
            noContent.value = true
            resetEditor()
            return
        }
        noContent.value = false
        originalMarkdown.value = snapshot.content
        const parsed = parseFrontMatter(snapshot.content)
        present.value = parsed.present
        originalData.value = { ...parsed.data }
        originalKeyOrder.value = [...parsed.keyOrder]
        fillForm(parsed)
    } catch (error) {
        if (sequence !== loadSequence) {
            return
        }
        loadError.value = true
        noContent.value = false
        resetEditor()
        logger.warn('[Front matter 属性] 读取当前文档内容失败', error)
    } finally {
        if (sequence === loadSequence) {
            loading.value = false
        }
    }
}

/** 固定字段输入 */
function handleFieldInput(key: string, event: Event): void {
    form[key] = (event.target as HTMLInputElement).value
}

/** 自定义属性输入 */
function handleCustomInput(row: CustomFieldRow, event: Event): void {
    row.valueText = (event.target as HTMLInputElement).value
}

/** 移除自定义属性（保存时不再写入该键） */
function removeCustomField(row: CustomFieldRow): void {
    customFields.value = customFields.value.filter((item) => item.key !== row.key)
}

/** 保存：生成新 Markdown，内容有变化时经既有 EventBus 写回编辑器 */
function handleSave(): void {
    if (!editable.value) {
        return
    }
    saveError.value = false
    try {
        const { data, keyOrder } = buildFrontMatterData()
        const newMarkdown = updateFrontMatter(originalMarkdown.value, data, keyOrder)
        if (newMarkdown !== originalMarkdown.value) {
            // 复用既有全文替换接收器（MarkdownEditComponent 监听 MONACO_REPLACE_TEXT）
            EventBus.$emit(EVENT_BUS.MONACO_REPLACE_TEXT, newMarkdown)
        }
        closeFrontMatterDialogState()
    } catch (error) {
        saveError.value = true
        logger.warn('[Front matter 属性] 保存 front matter 失败', error)
    }
}

/** 关闭对话框 */
function handleClose(): void {
    closeFrontMatterDialogState()
}

// 打开即读取（宿主可能先挂载后设置 visible，故 immediate 兜底）
watch(
    () => state.visible,
    (visible) => {
        if (visible) {
            void loadContent()
        } else {
            // 关闭时丢弃在途读取结果，避免重新打开时看到旧文档的属性
            loadSequence += 1
            loading.value = false
        }
    },
    { immediate: true }
)
</script>

<style scoped>
.front-matter-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 8px;
    min-height: 340px;
}

.fm-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.fm-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.fm-source-hint {
    flex: none;
}

.fm-placeholder {
    min-height: 220px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-card-background);
    border: 1px dashed var(--theme-border-color);
    border-radius: 6px;
}

.fm-placeholder--error {
    color: var(--theme-accent-color);
}

.fm-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.fm-hint {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}

.fm-fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 16px;
}

.fm-field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
}

.fm-label {
    flex: none;
    width: 64px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.fm-input {
    flex: 1;
    min-width: 0;
    padding: 6px 8px;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    background: var(--theme-card-background);
    color: var(--theme-text-color);
    font-size: 12px;
    font-family: inherit;
    transition: all 0.2s ease;
}

.fm-input:focus {
    outline: none;
    border-color: var(--theme-accent-color);
}

.fm-custom {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid var(--theme-border-color);
}

.fm-section-title {
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.fm-custom-empty {
    padding: 6px 0;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.fm-custom-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.fm-custom-key {
    flex: none;
    width: 140px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--theme-accent-color);
}

.fm-custom-remove {
    flex: none;
    padding: 2px 8px;
}

.fm-error {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--theme-accent-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}
</style>
