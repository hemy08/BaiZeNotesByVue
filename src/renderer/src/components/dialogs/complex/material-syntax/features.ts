/**
 * Material 语法插入对话框 —— 15 项功能项的表单定义
 * （结构优化第 5 批 5.5：从 MaterialSyntaxDialog.vue 抽出的纯数据目录）。
 *
 * 字段标签/占位符复用 dialogRenderer.common.* 与 materialSyntax.labels/placeholders；
 * 新增/调整扩展语法时只需改本文件 + shared/constants/material-syntax.ts（id 类型真源）。
 */

import {
    ALIGN_OPTIONS,
    ATTR_MODE_OPTIONS,
    BLOCK_TYPE_OPTIONS,
    COLLAPSIBLE_TYPE_OPTIONS,
    I18N_PREFIX,
    INSERT_DELETE_MODE_OPTIONS,
    SCRIPT_MODE_OPTIONS,
    type MaterialFeatureDefinition
} from './form'

/**
 * 15 项 mkdocs-material 扩展语法的表单定义。
 * 字段标签/占位符复用 dialogRenderer.common.* 与 materialSyntax.labels/placeholders。
 */
export const materialFeatures: readonly MaterialFeatureDefinition[] = [
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
