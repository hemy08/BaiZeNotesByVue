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
            <button class="btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button class="btn btn-insert" @click="handleInsert">
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
import {
    MATERIAL_SYNTAX_FEATURE_IDS,
    type MaterialSyntaxFeatureId
} from '../../../../../shared/constants/material-syntax'

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

/** material 语法功能项 id（类型与顺序来自 shared manifest，顺序即左侧列表顺序，与菜单 15 项一一对应） */
const MATERIAL_FEATURE_IDS: readonly MaterialSyntaxFeatureId[] = MATERIAL_SYNTAX_FEATURE_IDS

/** 表单状态：15 个功能项共用一份扁平状态，切换功能项时各自字段互不干扰 */
interface MaterialSyntaxForm {
    // collapsible
    collapsibleType: string
    collapsibleTitle: string
    collapsibleContent: string
    collapsibleExpanded: boolean
    // task-list
    taskContent: string
    taskCompleted: boolean
    // highlight
    highlightText: string
    // insert-delete
    insertDeleteMode: string
    insertDeleteText: string
    // sup-sub
    scriptMode: string
    scriptText: string
    // keys
    keysText: string
    // attr-list
    attrMode: string
    attrText: string
    attrUrl: string
    attrClass: string
    attrAlign: string
    // footnote
    footnoteText: string
    footnoteContent: string
    // definition-list
    definitionTerm: string
    definitionText: string
    // grid-cards
    cardsText: string
    // code-block
    codeLang: string
    codeTitle: string
    codeLinenums: boolean
    codeHlLines: string
    codeContent: string
    // icon
    iconName: string
    iconText: string
    // blocks
    blocksType: string
    blocksTitle: string
    blocksContent: string
    blocksTabLabel: string
    // snippet
    snippetPath: string
    snippetStart: string
    snippetEnd: string
    // tab-link
    tabLinkText: string
    tabLinkSet: string
    tabLinkTab: string
}

type MaterialFormKey = keyof MaterialSyntaxForm

/** 表单控件类型：text/textarea/select 写字符串，checkbox 写布尔 */
interface MaterialFeatureField {
    key: MaterialFormKey
    kind: 'text' | 'textarea' | 'select' | 'checkbox'
    labelKey: string
    placeholderKey?: string
    options?: ReadonlyArray<{ value: string; labelKey: string }>
    /** 依据其它字段值动态显隐（如 attr-list 按模式只显示相关字段、blocks 的 tab 标签仅 tabbed 显示） */
    visibleWhen?: (form: MaterialSyntaxForm) => boolean
    /** 是否用 MDI 图标名列表填充 datalist（仅 icon 功能项使用） */
    iconSuggestions?: boolean
}

interface MaterialFeatureDefinition {
    id: MaterialSyntaxFeatureId
    icon: string
    nameKey: string
    fields: ReadonlyArray<MaterialFeatureField>
}

const I18N_PREFIX = 'dialogRenderer.materialSyntax'

/** 下拉选项：value 为写进 markdown 的语法关键字（不翻译），labelKey 为界面文案 */
const COLLAPSIBLE_TYPE_OPTIONS = [
    { value: 'note', labelKey: `${I18N_PREFIX}.types.note` },
    { value: 'tip', labelKey: `${I18N_PREFIX}.types.tip` },
    { value: 'warning', labelKey: `${I18N_PREFIX}.types.warning` },
    { value: 'danger', labelKey: `${I18N_PREFIX}.types.danger` },
    { value: 'info', labelKey: `${I18N_PREFIX}.types.info` },
    { value: 'success', labelKey: `${I18N_PREFIX}.types.success` },
    { value: 'example', labelKey: `${I18N_PREFIX}.types.example` },
    { value: 'question', labelKey: `${I18N_PREFIX}.types.question` },
    { value: 'quote', labelKey: `${I18N_PREFIX}.types.quote` }
] as const

const BLOCK_TYPE_OPTIONS = [
    { value: 'note', labelKey: `${I18N_PREFIX}.types.note` },
    { value: 'tip', labelKey: `${I18N_PREFIX}.types.tip` },
    { value: 'warning', labelKey: `${I18N_PREFIX}.types.warning` },
    { value: 'success', labelKey: `${I18N_PREFIX}.types.success` },
    { value: 'details', labelKey: `${I18N_PREFIX}.types.details` },
    { value: 'tabbed', labelKey: `${I18N_PREFIX}.types.tabbed` }
] as const

const INSERT_DELETE_MODE_OPTIONS = [
    { value: 'insert', labelKey: `${I18N_PREFIX}.insertDeleteModes.insert` },
    { value: 'delete', labelKey: `${I18N_PREFIX}.insertDeleteModes.delete` },
    { value: 'critic-insert', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticInsert` },
    { value: 'critic-delete', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticDelete` },
    { value: 'critic-highlight', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticHighlight` },
    { value: 'critic-comment', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticComment` }
] as const

const SCRIPT_MODE_OPTIONS = [
    { value: 'sup', labelKey: `${I18N_PREFIX}.scriptModes.superscript` },
    { value: 'sub', labelKey: `${I18N_PREFIX}.scriptModes.subscript` }
] as const

const ATTR_MODE_OPTIONS = [
    { value: 'button', labelKey: `${I18N_PREFIX}.attrModes.button` },
    { value: 'inline', labelKey: `${I18N_PREFIX}.attrModes.inline` },
    { value: 'align', labelKey: `${I18N_PREFIX}.attrModes.align` }
] as const

const ALIGN_OPTIONS = [
    { value: 'left', labelKey: `${I18N_PREFIX}.alignOptions.left` },
    { value: 'center', labelKey: `${I18N_PREFIX}.alignOptions.center` },
    { value: 'right', labelKey: `${I18N_PREFIX}.alignOptions.right` }
] as const

/**
 * 15 项 mkdocs-material 扩展语法的表单定义。
 * 字段标签/占位符复用 dialogRenderer.common.* 与 materialSyntax.labels/placeholders。
 */
const materialFeatures: readonly MaterialFeatureDefinition[] = [
    {
        id: 'collapsible',
        icon: '🧩',
        nameKey: `${I18N_PREFIX}.features.collapsible`,
        fields: [
            {
                key: 'collapsibleType',
                kind: 'select',
                labelKey: `${I18N_PREFIX}.labels.type`,
                options: COLLAPSIBLE_TYPE_OPTIONS
            },
            {
                key: 'collapsibleTitle',
                kind: 'text',
                labelKey: 'dialogRenderer.common.titleLabel',
                placeholderKey: `${I18N_PREFIX}.placeholders.title`
            },
            {
                key: 'collapsibleContent',
                kind: 'textarea',
                labelKey: 'dialogRenderer.common.content',
                placeholderKey: `${I18N_PREFIX}.placeholders.content`
            },
            {
                key: 'collapsibleExpanded',
                kind: 'checkbox',
                labelKey: `${I18N_PREFIX}.labels.expanded`
            }
        ]
    },
    {
        id: 'task-list',
        icon: '☑️',
        nameKey: `${I18N_PREFIX}.features.taskList`,
        fields: [
            {
                key: 'taskContent',
                kind: 'textarea',
                labelKey: 'dialogRenderer.common.content',
                placeholderKey: `${I18N_PREFIX}.placeholders.taskContent`
            },
            {
                key: 'taskCompleted',
                kind: 'checkbox',
                labelKey: `${I18N_PREFIX}.labels.completed`
            }
        ]
    },
    {
        id: 'highlight',
        icon: '🖍️',
        nameKey: `${I18N_PREFIX}.features.highlight`,
        fields: [
            {
                key: 'highlightText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.text`,
                placeholderKey: `${I18N_PREFIX}.placeholders.text`
            }
        ]
    },
    {
        id: 'insert-delete',
        icon: '✂️',
        nameKey: `${I18N_PREFIX}.features.insertDelete`,
        fields: [
            {
                key: 'insertDeleteMode',
                kind: 'select',
                labelKey: `${I18N_PREFIX}.labels.mode`,
                options: INSERT_DELETE_MODE_OPTIONS
            },
            {
                key: 'insertDeleteText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.text`,
                placeholderKey: `${I18N_PREFIX}.placeholders.text`
            }
        ]
    },
    {
        id: 'sup-sub',
        icon: '🔤',
        nameKey: `${I18N_PREFIX}.features.supSub`,
        fields: [
            {
                key: 'scriptMode',
                kind: 'select',
                labelKey: `${I18N_PREFIX}.labels.mode`,
                options: SCRIPT_MODE_OPTIONS
            },
            {
                key: 'scriptText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.text`,
                placeholderKey: `${I18N_PREFIX}.placeholders.text`
            }
        ]
    },
    {
        id: 'keys',
        icon: '⌨️',
        nameKey: `${I18N_PREFIX}.features.keys`,
        fields: [
            {
                key: 'keysText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.keys`,
                placeholderKey: `${I18N_PREFIX}.placeholders.keys`
            }
        ]
    },
    {
        id: 'attr-list',
        icon: '🔖',
        nameKey: `${I18N_PREFIX}.features.attrList`,
        fields: [
            {
                key: 'attrMode',
                kind: 'select',
                labelKey: `${I18N_PREFIX}.labels.mode`,
                options: ATTR_MODE_OPTIONS
            },
            {
                key: 'attrText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.text`,
                placeholderKey: `${I18N_PREFIX}.placeholders.text`
            },
            {
                key: 'attrUrl',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.url`,
                placeholderKey: `${I18N_PREFIX}.placeholders.url`,
                visibleWhen: (form) => form.attrMode === 'button'
            },
            {
                key: 'attrClass',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.className`,
                placeholderKey: `${I18N_PREFIX}.placeholders.className`,
                visibleWhen: (form) => form.attrMode === 'inline'
            },
            {
                key: 'attrAlign',
                kind: 'select',
                labelKey: `${I18N_PREFIX}.labels.align`,
                options: ALIGN_OPTIONS,
                visibleWhen: (form) => form.attrMode === 'align'
            }
        ]
    },
    {
        id: 'footnote',
        icon: '📌',
        nameKey: `${I18N_PREFIX}.features.footnote`,
        fields: [
            {
                key: 'footnoteText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.refText`,
                placeholderKey: `${I18N_PREFIX}.placeholders.text`
            },
            {
                key: 'footnoteContent',
                kind: 'textarea',
                labelKey: `${I18N_PREFIX}.labels.footnoteContent`,
                placeholderKey: `${I18N_PREFIX}.placeholders.footnoteContent`
            }
        ]
    },
    {
        id: 'definition-list',
        icon: '📖',
        nameKey: `${I18N_PREFIX}.features.definitionList`,
        fields: [
            {
                key: 'definitionTerm',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.term`
            },
            {
                key: 'definitionText',
                kind: 'textarea',
                labelKey: `${I18N_PREFIX}.labels.definition`,
                placeholderKey: `${I18N_PREFIX}.placeholders.definition`
            }
        ]
    },
    {
        id: 'grid-cards',
        icon: '🗂️',
        nameKey: `${I18N_PREFIX}.features.gridCards`,
        fields: [
            {
                key: 'cardsText',
                kind: 'textarea',
                labelKey: `${I18N_PREFIX}.labels.cards`,
                placeholderKey: `${I18N_PREFIX}.placeholders.cards`
            }
        ]
    },
    {
        id: 'code-block',
        icon: '💻',
        nameKey: `${I18N_PREFIX}.features.codeBlock`,
        fields: [
            {
                key: 'codeLang',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.language`,
                placeholderKey: `${I18N_PREFIX}.placeholders.language`
            },
            {
                key: 'codeTitle',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.codeTitle`,
                placeholderKey: `${I18N_PREFIX}.placeholders.title`
            },
            {
                key: 'codeContent',
                kind: 'textarea',
                labelKey: `${I18N_PREFIX}.labels.code`,
                placeholderKey: `${I18N_PREFIX}.placeholders.code`
            },
            {
                key: 'codeLinenums',
                kind: 'checkbox',
                labelKey: `${I18N_PREFIX}.labels.linenums`
            },
            {
                key: 'codeHlLines',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.hlLines`,
                placeholderKey: `${I18N_PREFIX}.placeholders.hlLines`
            }
        ]
    },
    {
        id: 'icon',
        icon: '🎨',
        nameKey: `${I18N_PREFIX}.features.icon`,
        fields: [
            {
                key: 'iconName',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.iconName`,
                placeholderKey: `${I18N_PREFIX}.placeholders.iconName`,
                iconSuggestions: true
            },
            {
                key: 'iconText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.iconText`
            }
        ]
    },
    {
        id: 'blocks',
        icon: '🧱',
        nameKey: `${I18N_PREFIX}.features.blocks`,
        fields: [
            {
                key: 'blocksType',
                kind: 'select',
                labelKey: `${I18N_PREFIX}.labels.type`,
                options: BLOCK_TYPE_OPTIONS
            },
            {
                key: 'blocksTitle',
                kind: 'text',
                labelKey: 'dialogRenderer.common.titleLabel',
                placeholderKey: `${I18N_PREFIX}.placeholders.title`
            },
            {
                key: 'blocksTabLabel',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.tabLabel`,
                placeholderKey: `${I18N_PREFIX}.placeholders.tabLabel`,
                visibleWhen: (form) => form.blocksType === 'tabbed'
            },
            {
                key: 'blocksContent',
                kind: 'textarea',
                labelKey: 'dialogRenderer.common.content',
                placeholderKey: `${I18N_PREFIX}.placeholders.content`
            }
        ]
    },
    {
        id: 'snippet',
        icon: '📄',
        nameKey: `${I18N_PREFIX}.features.snippet`,
        fields: [
            {
                key: 'snippetPath',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.path`,
                placeholderKey: `${I18N_PREFIX}.placeholders.path`
            },
            {
                key: 'snippetStart',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.startLine`
            },
            {
                key: 'snippetEnd',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.endLine`
            }
        ]
    },
    {
        id: 'tab-link',
        icon: '🔗',
        nameKey: `${I18N_PREFIX}.features.tabLink`,
        fields: [
            {
                key: 'tabLinkText',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.linkText`,
                placeholderKey: `${I18N_PREFIX}.placeholders.linkText`
            },
            {
                key: 'tabLinkSet',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.setId`
            },
            {
                key: 'tabLinkTab',
                kind: 'text',
                labelKey: `${I18N_PREFIX}.labels.tabIndex`
            }
        ]
    }
]

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

/** 各功能项默认值：保证打开对话框直接点「插入」也能产出合法片段 */
function createDefaultForm(): MaterialSyntaxForm {
    return {
        collapsibleType: 'note',
        collapsibleTitle: '',
        collapsibleContent: t(`${I18N_PREFIX}.defaults.collapsibleContent`),
        collapsibleExpanded: false,
        taskContent: t(`${I18N_PREFIX}.defaults.taskContent`),
        taskCompleted: false,
        highlightText: t(`${I18N_PREFIX}.defaults.highlightText`),
        insertDeleteMode: 'insert',
        insertDeleteText: t(`${I18N_PREFIX}.defaults.insertDeleteText`),
        scriptMode: 'sup',
        scriptText: 'H2O',
        keysText: 'ctrl+alt+del',
        attrMode: 'button',
        attrText: t(`${I18N_PREFIX}.defaults.attrText`),
        attrUrl: 'https://example.com',
        attrClass: 'highlight',
        attrAlign: 'center',
        footnoteText: t(`${I18N_PREFIX}.defaults.footnoteText`),
        footnoteContent: t(`${I18N_PREFIX}.defaults.footnoteContent`),
        definitionTerm: t(`${I18N_PREFIX}.defaults.definitionTerm`),
        definitionText: t(`${I18N_PREFIX}.defaults.definitionText`),
        cardsText: t(`${I18N_PREFIX}.defaults.cards`),
        codeLang: 'python',
        codeTitle: t(`${I18N_PREFIX}.defaults.codeTitle`),
        codeLinenums: true,
        codeHlLines: '',
        codeContent: 'print("hello world")',
        iconName: 'pencil',
        iconText: '',
        blocksType: 'note',
        blocksTitle: t(`${I18N_PREFIX}.defaults.blocksTitle`),
        blocksContent: t(`${I18N_PREFIX}.defaults.blocksContent`),
        blocksTabLabel: t(`${I18N_PREFIX}.defaults.blocksTabLabel`),
        snippetPath: 'snippets/example.md',
        snippetStart: '',
        snippetEnd: '',
        tabLinkText: t(`${I18N_PREFIX}.defaults.tabLinkText`),
        tabLinkSet: '1',
        tabLinkTab: '2'
    }
}

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
    activeFeature.value.fields.filter((field) => !field.visibleWhen || field.visibleWhen(form))
)

function isMaterialFeatureId(value: string | undefined): value is MaterialSyntaxFeatureId {
    return typeof value === 'string' && (MATERIAL_FEATURE_IDS as readonly string[]).includes(value)
}

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

/* ============================== markdown 生成（纯函数） ============================== */

/** 归一化换行，避免 CRLF 文本表单把 `\r` 带进插入内容 */
function normalizeNewlines(value: string): string {
    return value.replace(/\r\n/g, '\n')
}

/** 单行化（行内语法不允许换行，把换行折叠为空格） */
function toSingleLine(value: string): string {
    return value.replace(/\r?\n/g, ' ').trim()
}

/** 按行拆分并丢弃空行（任务列表 / 卡片列表等「每行一项」输入） */
function toFilledLines(value: string): string[] {
    return normalizeNewlines(value)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
}

/** 缩进块内容（折叠提示块要求内容每行缩进 4 空格，空行不产生尾随空格） */
function indentBlock(value: string): string {
    return normalizeNewlines(value)
        .split('\n')
        .map((line) => (line.trim().length > 0 ? `    ${line}` : ''))
        .join('\n')
}

/** 生成折叠提示块（collapsible）：`??? note "标题"` + 4 空格缩进内容；默认展开用 `???+` */
function buildCollapsible(form: MaterialSyntaxForm): string {
    const title = toSingleLine(form.collapsibleTitle)
    const marker = form.collapsibleExpanded ? '???+' : '???'
    const header = `${marker} ${form.collapsibleType}${title ? ` "${title.replace(/"/g, "'")}"` : ''}`
    const content = indentBlock(form.collapsibleContent)
    return content.trim().length > 0 ? `${header}\n${content}\n` : `${header}\n`
}

/** 生成任务列表（task-list）：每行 `- [ ] 项` / `- [x] 项` */
function buildTaskList(form: MaterialSyntaxForm): string {
    const items = toFilledLines(form.taskContent)
    if (items.length === 0) {
        return ''
    }
    const marker = form.taskCompleted ? 'x' : ' '
    return items.map((item) => `- [${marker}] ${item}`).join('\n')
}

/** 生成文本高亮（highlight）：`==文本==` */
function buildHighlight(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.highlightText)
    return text.length > 0 ? `==${text}==` : ''
}

/** 插入/删除标记的包裹符号（含 critic 标记） */
const INSERT_DELETE_MARKERS: Readonly<Record<string, { open: string; close: string }>> = {
    insert: { open: '^^', close: '^^' },
    delete: { open: '~~', close: '~~' },
    'critic-insert': { open: '{++', close: '++}' },
    'critic-delete': { open: '{--', close: '--}' },
    'critic-highlight': { open: '{==', close: '==}' },
    'critic-comment': { open: '{>>', close: '<<}' }
}

/** 生成插入/删除标记（insert-delete）：普通标记与 critic 标记共 6 种模式 */
function buildInsertDelete(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.insertDeleteText)
    const marker = INSERT_DELETE_MARKERS[form.insertDeleteMode] ?? INSERT_DELETE_MARKERS.insert
    if (text.length === 0 || !marker) {
        return ''
    }
    return `${marker.open}${text}${marker.close}`
}

/** 生成上标/下标（sup-sub）：`^文本^` / `~文本~` */
function buildSupSub(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.scriptText)
    if (text.length === 0) {
        return ''
    }
    const marker = form.scriptMode === 'sub' ? '~' : '^'
    return `${marker}${text}${marker}`
}

/** 生成键盘按键（keys）：`++ctrl+alt+del++` */
function buildKeys(form: MaterialSyntaxForm): string {
    const keys = toSingleLine(form.keysText)
    return keys.length > 0 ? `++${keys}++` : ''
}

/** 生成属性列表（attr-list）：按钮 / 行内 class / 段落或图片对齐 */
function buildAttrList(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.attrText)
    if (text.length === 0) {
        return ''
    }
    if (form.attrMode === 'inline') {
        const className = toSingleLine(form.attrClass) || 'highlight'
        return `${text}{ .${className} }`
    }
    if (form.attrMode === 'align') {
        const align = form.attrAlign || 'center'
        return `${text}{ align=${align} }`
    }
    const url = toSingleLine(form.attrUrl)
    return url.length > 0 ? `[${text}](${url}){ .md-button }` : ''
}

/** 生成脚注（footnote）：引用处 `文本[^1]` + 空行 + `[^1]: 内容` */
function buildFootnote(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.footnoteText)
    if (text.length === 0) {
        return ''
    }
    const contentLines = toFilledLines(form.footnoteContent)
    if (contentLines.length === 0) {
        return `${text}[^1]\n\n[^1]:`
    }
    // 脚注正文的续行需缩进 4 空格，才能与 `[^1]:` 定义保持同一段落
    const [firstLine, ...restLines] = contentLines
    const body = [firstLine, ...restLines.map((line) => `    ${line}`)].join('\n')
    return `${text}[^1]\n\n[^1]: ${body}`
}

/** 生成定义列表（definition-list）：`术语` + 换行 + `: 定义` */
function buildDefinitionList(form: MaterialSyntaxForm): string {
    const term = toSingleLine(form.definitionTerm)
    if (term.length === 0) {
        return ''
    }
    const definition = toSingleLine(form.definitionText)
    return definition.length > 0 ? `${term}\n: ${definition}` : `${term}\n:`
}

/** 单行卡片定义：`图标名|标题|描述`（图标可空；无竖线时整行视为标题） */
interface GridCardDefinition {
    icon: string
    title: string
    description: string
}

function parseGridCard(line: string): GridCardDefinition {
    const parts = line.split('|')
    if (parts.length === 1) {
        return { icon: '', title: parts[0].trim(), description: '' }
    }
    const [icon = '', title = '', ...descriptionParts] = parts
    return {
        icon: icon.trim(),
        title: title.trim(),
        description: descriptionParts.join('|').trim()
    }
}

/** 生成网格卡片（grid-cards）：`<div class="grid cards" markdown>` + 每张卡三行结构 */
function buildGridCards(form: MaterialSyntaxForm): string {
    const cards = toFilledLines(form.cardsText).map(parseGridCard)
    if (cards.length === 0) {
        return ''
    }
    const cardBlocks = cards.map((card) => {
        const iconPrefix = card.icon.length > 0 ? `:material-${card.icon}: ` : ''
        const lines = [`-   ${iconPrefix}**${card.title}**`]
        if (card.description.length > 0) {
            lines.push('', '    ---', '', `    ${card.description}`)
        }
        return lines.join('\n')
    })
    return `<div class="grid cards" markdown>\n\n${cardBlocks.join('\n\n')}\n\n</div>`
}

/** 归一化高亮行号：接受 `2 3` / `2,3` / `2，3` 等写法，输出空格分隔的数字串 */
function normalizeHighlightedLines(value: string): string {
    return value
        .split(/[\s,，]+/)
        .map((part) => part.trim())
        .filter((part) => /^\d+$/.test(part))
        .join(' ')
}

/** 生成代码块增强（code-block）：```lang linenums="1" hl_lines="2 3" title="xxx" */
function buildCodeBlock(form: MaterialSyntaxForm): string {
    const fence = '```'
    const language = toSingleLine(form.codeLang)
    const attributes: string[] = []
    if (form.codeLinenums) {
        attributes.push('linenums="1"')
    }
    const highlightedLines = normalizeHighlightedLines(form.codeHlLines)
    if (highlightedLines.length > 0) {
        attributes.push(`hl_lines="${highlightedLines}"`)
    }
    const title = toSingleLine(form.codeTitle)
    if (title.length > 0) {
        attributes.push(`title="${title.replace(/"/g, "'")}"`)
    }
    const info = [language, ...attributes].filter((part) => part.length > 0).join(' ')
    const opening =
        info.length > 0 && language.length === 0 ? `${fence} ${info}` : `${fence}${info}`
    const code = normalizeNewlines(form.codeContent).replace(/\n+$/, '')
    return `${opening}\n${code}\n${fence}`
}

/** 生成 Material 图标（icon）：`:material-<name>:`，可选追加文本；名称为空时返回空串（预览显示提示） */
function buildIcon(form: MaterialSyntaxForm): string {
    const rawName = toSingleLine(form.iconName)
        .replace(/^:?material-/, '')
        .replace(/:$/, '')
    if (rawName.length === 0) {
        return ''
    }
    const text = toSingleLine(form.iconText)
    return `:material-${rawName}:${text.length > 0 ? ` ${text}` : ''}`
}

/** 生成 pymdownx 块语法（blocks）：`/// note` 或 `/// note | 标题`，tabbed 走 `/// tab | 标签` */
function buildBlocks(form: MaterialSyntaxForm): string {
    const content = normalizeNewlines(form.blocksContent).trim()
    const type = form.blocksType || 'note'
    if (type === 'tabbed') {
        const label = toSingleLine(form.blocksTabLabel) || 'Tab'
        return ['/// tabbed', `/// tab | ${label}`, content, '///', '///'].join('\n')
    }
    const title = toSingleLine(form.blocksTitle)
    const header = title.length > 0 ? `/// ${type} | ${title}` : `/// ${type}`
    return [header, content, '///'].join('\n')
}

/** 生成文件片段（snippet）：`--8<-- "path"` 或 `--8<-- "path:start:end"` */
function buildSnippet(form: MaterialSyntaxForm): string {
    const path = toSingleLine(form.snippetPath)
    if (path.length === 0) {
        return ''
    }
    const startLine = toSingleLine(form.snippetStart)
    const endLine = toSingleLine(form.snippetEnd)
    const target =
        startLine.length > 0 && endLine.length > 0 ? `${path}:${startLine}:${endLine}` : path
    return `--8<-- "${target}"`
}

/** 归一化 tab 深链序号（1 基正整数，非法值回退默认） */
function normalizeTabIndex(value: string, fallback: number): number {
    const parsed = Number.parseInt(toSingleLine(value), 10)
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** 生成标签页深链（tab-link）：`[文本](#__tabbed_<set>_<tab>)`（set 默认 1、tab 默认 2） */
function buildTabLink(form: MaterialSyntaxForm): string {
    const text = toSingleLine(form.tabLinkText)
    if (text.length === 0) {
        return ''
    }
    const setId = normalizeTabIndex(form.tabLinkSet, 1)
    const tabIndex = normalizeTabIndex(form.tabLinkTab, 2)
    return `[${text}](#__tabbed_${setId}_${tabIndex})`
}

/**
 * 生成指定语法项的待插入 markdown（纯函数：仅依赖入参，便于单测与预览复用）。
 *
 * @param featureId 15 个功能项 id 之一
 * @param form 当前表单状态
 * @returns 待插入的 markdown 片段；无法生成时返回空串（插入按钮不产生空内容）
 */
function buildMaterialSyntaxSnippet(
    featureId: MaterialSyntaxFeatureId,
    form: MaterialSyntaxForm
): string {
    switch (featureId) {
        case 'collapsible':
            return buildCollapsible(form)
        case 'task-list':
            return buildTaskList(form)
        case 'highlight':
            return buildHighlight(form)
        case 'insert-delete':
            return buildInsertDelete(form)
        case 'sup-sub':
            return buildSupSub(form)
        case 'keys':
            return buildKeys(form)
        case 'attr-list':
            return buildAttrList(form)
        case 'footnote':
            return buildFootnote(form)
        case 'definition-list':
            return buildDefinitionList(form)
        case 'grid-cards':
            return buildGridCards(form)
        case 'code-block':
            return buildCodeBlock(form)
        case 'icon':
            return buildIcon(form)
        case 'blocks':
            return buildBlocks(form)
        case 'snippet':
            return buildSnippet(form)
        case 'tab-link':
            return buildTabLink(form)
        default:
            return ''
    }
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
   这里只保留正文（功能列表/表单/预览）与按钮样式。 */
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

.btn {
    padding: 8px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-cancel {
    background: var(--border-color);
    color: var(--text-color);
}

.btn-insert {
    background: var(--accent-color);
    color: #fff;
}

.btn:hover {
    opacity: 0.9;
}
</style>
