/**
 * mkdocs-material 扩展语法单一 manifest（结构优化第 5 批 M3：字符串协议单真源）
 *
 * 背景（原 M3）：同一批 15 项扩展语法的 featureId 曾在三处重复维护——
 *   ① menu-config.ts 的 insertMaterial.submenu（15 个 labelKey + menuAction 字面量）；
 *   ② menu-actions.ts 的 MATERIAL_SYNTAX_FEATURE_IDS 数组（动作 id 后缀清单）；
 *   ③ MaterialSyntaxDialog.vue 的 MATERIAL_FEATURE_IDS / materialFeatures 定义。
 * 任一新增/改名都要多处同步，漏改即出现「菜单有入口但对话框无语法」或反向死入口。
 *
 * 本文件收敛为唯一真源：
 *   - 菜单项由 MATERIAL_SYNTAX_FEATURES 生成（labelKey + menuAction）；
 *   - menu-actions 的拦截 id 清单由 MATERIAL_SYNTAX_FEATURES 派生；
 *   - 对话框功能项 id 联合类型由本 manifest 推导（类型层面禁止新增未登记 id）；
 *   - 一致性由 tests/unit/vue2/material-syntax-dialog.test.ts 的「M3 manifest 一致性」用例守护
 *     （菜单动作顺序、对话框 15 项渲染、zh-CN/en-US 词条存在性）。
 *
 * 约束：shared 层纯数据模块，禁止 import vue/electron/node 能力。
 */

/** 菜单动作前缀：`baize:menu:insert:material:<featureId>`（menu-actions.ts 据此打开对话框） */
export const MATERIAL_SYNTAX_ACTION_PREFIX = 'baize:menu:insert:material:'

/** 菜单标签 i18n 键前缀（menu 命名空间，中英文案见 shared/i18n/messages/*\/menu.ts） */
export const MATERIAL_SYNTAX_MENU_LABEL_PREFIX = 'menu.insert.material'

/** 单项扩展语法：id 同时作为菜单动作后缀与 MaterialSyntaxDialog 的 preset */
export interface MaterialSyntaxFeature {
    /** 功能项 id（kebab-case；顺序即菜单与对话框左侧列表展示顺序） */
    readonly id: string
    /** 菜单标签 i18n 键（menu 命名空间） */
    readonly menuLabelKey: string
}

/**
 * 15 项 mkdocs-material 扩展语法（顺序即展示顺序）。
 * 注意：既有的 material:admonition 走原主进程链路，不在本 manifest 内（其菜单项在 menu-config 中单独保留）。
 */
export const MATERIAL_SYNTAX_FEATURES = [
    { id: 'collapsible', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.collapsible` },
    { id: 'task-list', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.taskList` },
    { id: 'highlight', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.highlight` },
    { id: 'insert-delete', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.insertDelete` },
    { id: 'sup-sub', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.supSub` },
    { id: 'keys', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.keys` },
    { id: 'attr-list', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.attrList` },
    { id: 'footnote', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.footnote` },
    {
        id: 'definition-list',
        menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.definitionList`
    },
    { id: 'grid-cards', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.gridCards` },
    { id: 'code-block', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.codeBlock` },
    { id: 'icon', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.icon` },
    { id: 'blocks', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.blocks` },
    { id: 'snippet', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.snippet` },
    { id: 'tab-link', menuLabelKey: `${MATERIAL_SYNTAX_MENU_LABEL_PREFIX}.tabLink` }
] as const satisfies readonly MaterialSyntaxFeature[]

/** 15 项扩展语法 id 联合类型（对话框 preset / 表单定义的类型护栏） */
export type MaterialSyntaxFeatureId = (typeof MATERIAL_SYNTAX_FEATURES)[number]['id']

/** 由 manifest 派生的 id 顺序清单（menu-actions 拦截、测试与对话框复用） */
export const MATERIAL_SYNTAX_FEATURE_IDS: readonly MaterialSyntaxFeatureId[] =
    MATERIAL_SYNTAX_FEATURES.map((feature) => feature.id)

/** 由 manifest 生成菜单动作 id（menu-config 生成菜单项时使用） */
export function getMaterialSyntaxMenuAction(id: MaterialSyntaxFeatureId): string {
    return `${MATERIAL_SYNTAX_ACTION_PREFIX}${id}`
}
