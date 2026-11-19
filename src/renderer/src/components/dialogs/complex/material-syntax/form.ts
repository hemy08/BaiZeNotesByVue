/**
 * Material 语法插入对话框 —— 表单模型与功能项元数据类型
 * （结构优化第 5 批 5.5：从 MaterialSyntaxDialog.vue 抽出的表单/选项纯数据与纯函数目录）。
 *
 * 本文件只放「表单状态类型 + 控件/功能项类型 + 下拉选项常量 + 默认值 + 纯查询函数」，
 * 不涉及 Vue 响应式状态与 DOM；15 项功能项的字段定义见 features.ts，
 * markdown 生成纯函数见 generators.ts，统一由 index.ts 聚合导出。
 */

import { t } from '../../../../common/i18n'
import {
    MATERIAL_SYNTAX_FEATURE_IDS,
    type MaterialSyntaxFeatureId
} from '../../../../../../shared/constants/material-syntax'

/** material 语法功能项 id（类型与顺序来自 shared manifest，顺序即左侧列表顺序，与菜单 15 项一一对应） */
export const MATERIAL_FEATURE_IDS: readonly MaterialSyntaxFeatureId[] = MATERIAL_SYNTAX_FEATURE_IDS

/** i18n 键前缀（对话框文案统一命名空间） */
export const I18N_PREFIX = 'dialogRenderer.materialSyntax'

/** 表单状态：15 个功能项共用一份扁平状态，切换功能项时各自字段互不干扰 */
export interface MaterialSyntaxForm {
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

export type MaterialFormKey = keyof MaterialSyntaxForm

/** 表单控件类型：text/textarea/select 写字符串，checkbox 写布尔 */
export interface MaterialFeatureField {
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

/** 单个功能项定义（左侧入口 + 右侧表单字段） */
export interface MaterialFeatureDefinition {
    id: MaterialSyntaxFeatureId
    icon: string
    nameKey: string
    fields: ReadonlyArray<MaterialFeatureField>
}

/** 下拉选项：value 为写进 markdown 的语法关键字（不翻译），labelKey 为界面文案 */
export const COLLAPSIBLE_TYPE_OPTIONS = [
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

export const BLOCK_TYPE_OPTIONS = [
    { value: 'note', labelKey: `${I18N_PREFIX}.types.note` },
    { value: 'tip', labelKey: `${I18N_PREFIX}.types.tip` },
    { value: 'warning', labelKey: `${I18N_PREFIX}.types.warning` },
    { value: 'success', labelKey: `${I18N_PREFIX}.types.success` },
    { value: 'details', labelKey: `${I18N_PREFIX}.types.details` },
    { value: 'tabbed', labelKey: `${I18N_PREFIX}.types.tabbed` }
] as const

export const INSERT_DELETE_MODE_OPTIONS = [
    { value: 'insert', labelKey: `${I18N_PREFIX}.insertDeleteModes.insert` },
    { value: 'delete', labelKey: `${I18N_PREFIX}.insertDeleteModes.delete` },
    { value: 'critic-insert', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticInsert` },
    { value: 'critic-delete', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticDelete` },
    { value: 'critic-highlight', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticHighlight` },
    { value: 'critic-comment', labelKey: `${I18N_PREFIX}.insertDeleteModes.criticComment` }
] as const

export const SCRIPT_MODE_OPTIONS = [
    { value: 'sup', labelKey: `${I18N_PREFIX}.scriptModes.superscript` },
    { value: 'sub', labelKey: `${I18N_PREFIX}.scriptModes.subscript` }
] as const

export const ATTR_MODE_OPTIONS = [
    { value: 'button', labelKey: `${I18N_PREFIX}.attrModes.button` },
    { value: 'inline', labelKey: `${I18N_PREFIX}.attrModes.inline` },
    { value: 'align', labelKey: `${I18N_PREFIX}.attrModes.align` }
] as const

export const ALIGN_OPTIONS = [
    { value: 'left', labelKey: `${I18N_PREFIX}.alignOptions.left` },
    { value: 'center', labelKey: `${I18N_PREFIX}.alignOptions.center` },
    { value: 'right', labelKey: `${I18N_PREFIX}.alignOptions.right` }
] as const

/** 各功能项默认值：保证打开对话框直接点「插入」也能产出合法片段 */
export function createDefaultForm(): MaterialSyntaxForm {
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

/** preset/菜单传入的字符串是否为已登记功能项 id（类型收窄） */
export function isMaterialFeatureId(value: string | undefined): value is MaterialSyntaxFeatureId {
    return typeof value === 'string' && (MATERIAL_FEATURE_IDS as readonly string[]).includes(value)
}

/** 按 visibleWhen 裁剪当前功能项要渲染的字段（纯函数，供对话框 computed 使用） */
export function filterVisibleFields(
    fields: ReadonlyArray<MaterialFeatureField>,
    form: MaterialSyntaxForm
): ReadonlyArray<MaterialFeatureField> {
    return fields.filter((field) => !field.visibleWhen || field.visibleWhen(form))
}
