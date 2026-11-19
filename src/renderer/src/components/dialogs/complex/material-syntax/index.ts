/**
 * material-syntax/ —— Material 语法插入对话框的表单/生成器纯函数目录
 * （结构优化第 5 批 5.5：从 MaterialSyntaxDialog.vue 抽出，组件只保留模板与 UI 状态）。
 *
 * - form.ts：表单状态/控件/功能项类型、下拉选项、默认值、可见字段裁剪；
 * - features.ts：15 项功能项的表单定义（纯数据）；
 * - generators.ts：15 项语法的 markdown 生成纯函数（预览与插入共用）。
 *
 * 组件与测试仍从 `./material-syntax` 统一导入，内部文件可独立调整。
 */

export {
    ALIGN_OPTIONS,
    ATTR_MODE_OPTIONS,
    BLOCK_TYPE_OPTIONS,
    COLLAPSIBLE_TYPE_OPTIONS,
    createDefaultForm,
    filterVisibleFields,
    I18N_PREFIX,
    INSERT_DELETE_MODE_OPTIONS,
    isMaterialFeatureId,
    MATERIAL_FEATURE_IDS,
    SCRIPT_MODE_OPTIONS
} from './form'
export type {
    MaterialFeatureDefinition,
    MaterialFeatureField,
    MaterialFormKey,
    MaterialSyntaxForm
} from './form'
export { materialFeatures } from './features'
export { buildMaterialSyntaxSnippet } from './generators'
