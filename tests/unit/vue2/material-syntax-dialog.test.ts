// @vitest-environment jsdom
/**
 * Material 语法插入对话框单测（15 项 mkdocs-material 扩展语法）。
 *
 * 覆盖点：
 * 1. 左侧 15 项功能列表渲染、默认选中第一项、点击切换表单；
 * 2. preset 生效（打开即选中对应项、非法 preset 回退第一项、打开中切换 preset 立即生效）；
 * 3. 15 项语法逐一构造表单输入 → 点「插入」→ 断言 emit('insert') 的 markdown 精确内容；
 * 4. 条件字段显隐（attr-list 按模式、blocks 的 tab 标签仅 tabbed）；
 * 5. 默认值直接插入也能产出非空合法片段；
 * 6. 「取消 / ×」只 emit close；底部预览区随输入实时更新。
 */
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

import MaterialSyntaxDialog from '@renderer/components/dialogs/complex/MaterialSyntaxDialog.vue'
import { MaterialSyntaxDialog as LazyMaterialSyntaxDialog } from '@renderer/components/dialogs'
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'
// M3（结构优化第 5 批）：15 项扩展语法单一 manifest → 菜单/动作/对话框/i18n 一致性校验
import {
    MATERIAL_SYNTAX_ACTION_PREFIX,
    MATERIAL_SYNTAX_FEATURES,
    MATERIAL_SYNTAX_FEATURE_IDS,
    getMaterialSyntaxMenuAction
} from '../../../src/shared/constants/material-syntax'
import { menuMap } from '../../../src/renderer/src/components/MenuBar/menu-config'
import zhMenu from '../../../src/shared/i18n/messages/zh-CN/menu'
import enMenu from '../../../src/shared/i18n/messages/en-US/menu'

/** 代码块围栏（避免在源码里直接写三反引号） */
const FENCE = '```'

/** 15 个 feature id：顺序即左侧列表顺序（与 useConfigStore 的 preset 契约一致） */
const MATERIAL_FEATURE_IDS = MATERIAL_SYNTAX_FEATURE_IDS

// 对话框使用 <Teleport to="body">，测试时 stub 成内联渲染以便断言
const dialogMountOptions = { global: { stubs: { teleport: true } } }

function mountDialog(preset?: string): VueWrapper {
    return mount(MaterialSyntaxDialog, {
        ...dialogMountOptions,
        props: preset === undefined ? { visible: true } : { visible: true, preset }
    }) as VueWrapper
}

/** 取某个表单字段的容器（字段 key 与组件内 FormState 键一致） */
function field(wrapper: VueWrapper, key: string) {
    const found = wrapper.find(`[data-field="${key}"]`)
    expect(found.exists(), `表单字段 ${key} 应存在`).toBe(true)
    return found
}

async function fillInput(wrapper: VueWrapper, key: string, value: string): Promise<void> {
    await field(wrapper, key).find('input').setValue(value)
}

async function fillTextarea(wrapper: VueWrapper, key: string, value: string): Promise<void> {
    await field(wrapper, key).find('textarea').setValue(value)
}

async function selectOption(wrapper: VueWrapper, key: string, value: string): Promise<void> {
    await field(wrapper, key).find('select').setValue(value)
}

async function setCheckbox(wrapper: VueWrapper, key: string, checked: boolean): Promise<void> {
    await field(wrapper, key).find('input[type="checkbox"]').setValue(checked)
}

/** 点一次「插入」，返回本次 emit 的 markdown */
async function insertOnce(wrapper: VueWrapper): Promise<string> {
    await wrapper.find('.btn-insert').trigger('click')
    const emitted = wrapper.emitted('insert')
    expect(emitted).toBeDefined()
    const latest = emitted![emitted!.length - 1]
    return String(latest[0])
}

describe('MaterialSyntaxDialog 基础渲染与切换', () => {
    it('visible=false 时不渲染遮罩', () => {
        const wrapper = mount(MaterialSyntaxDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
    })

    it('渲染 15 个功能项且默认选中第一个（collapsible）', () => {
        const wrapper = mountDialog()
        const items = wrapper.findAll('.feature-item')
        expect(items).toHaveLength(15)
        expect(items.map((item) => item.attributes('data-feature'))).toEqual([
            ...MATERIAL_FEATURE_IDS
        ])
        expect(items[0].classes()).toContain('selected')
        expect(wrapper.find('.form-panel').attributes('data-active-feature')).toBe('collapsible')
        expect(field(wrapper, 'collapsibleType').exists()).toBe(true)
        expect(wrapper.find('.title-text').text()).toBe(t('dialogRenderer.materialSyntax.title'))
        const names = wrapper.findAll('.feature-name').map((name) => name.text())
        expect(names).toHaveLength(15)
        expect(names.every((name) => name.length > 0)).toBe(true)
    })

    it('点击左侧功能项可切换表单与选中态', async () => {
        const wrapper = mountDialog()
        await wrapper
            .findAll('.feature-item')
            .find((item) => item.attributes('data-feature') === 'highlight')!
            .trigger('click')

        expect(wrapper.find('.form-panel').attributes('data-active-feature')).toBe('highlight')
        expect(field(wrapper, 'highlightText').exists()).toBe(true)
        expect(wrapper.find('[data-field="collapsibleContent"]').exists()).toBe(false)
        const selected = wrapper
            .findAll('.feature-item')
            .filter((item) => item.classes().includes('selected'))
        expect(selected).toHaveLength(1)
        expect(selected[0].attributes('data-feature')).toBe('highlight')
    })

    it('preset 传入时打开即选中对应功能项；非法 preset 回退第一项', () => {
        const taskList = mountDialog('task-list')
        expect(taskList.find('.form-panel').attributes('data-active-feature')).toBe('task-list')
        expect(field(taskList, 'taskContent').exists()).toBe(true)

        const codeBlock = mountDialog('code-block')
        expect(codeBlock.find('.form-panel').attributes('data-active-feature')).toBe('code-block')
        expect(field(codeBlock, 'codeContent').exists()).toBe(true)

        const fallback = mountDialog('not-a-feature')
        expect(fallback.find('.form-panel').attributes('data-active-feature')).toBe('collapsible')
    })

    it('对话框打开时切换 preset 会同步切换选中项', async () => {
        const wrapper = mountDialog('collapsible')
        await wrapper.setProps({ preset: 'snippet' })
        expect(wrapper.find('.form-panel').attributes('data-active-feature')).toBe('snippet')
        expect(field(wrapper, 'snippetPath').exists()).toBe(true)
    })

    it('取消与关闭按钮都只 emit close，不触发插入', async () => {
        const wrapper = mountDialog()
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)

        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(2)
        expect(wrapper.emitted('insert')).toBeUndefined()
    })

    it('预览区随表单输入实时更新', async () => {
        const wrapper = mountDialog('highlight')
        expect(wrapper.find('.preview').text()).toBe(
            `==${t('dialogRenderer.materialSyntax.defaults.highlightText')}==`
        )

        await fillInput(wrapper, 'highlightText', '实时预览')
        expect(wrapper.find('.preview').text()).toBe('==实时预览==')

        // 切换到标签页深链后预览同步换成对应语法
        await wrapper
            .findAll('.feature-item')
            .find((item) => item.attributes('data-feature') === 'tab-link')!
            .trigger('click')
        await fillInput(wrapper, 'tabLinkText', '标题页')
        expect(wrapper.find('.preview').text()).toBe('[标题页](#__tabbed_1_2)')
    })
})

describe('MaterialSyntaxDialog 15 项语法生成规则', () => {
    it('collapsible：???+ type "标题" + 4 空格缩进内容', async () => {
        const wrapper = mountDialog('collapsible')
        await selectOption(wrapper, 'collapsibleType', 'warning')
        await fillInput(wrapper, 'collapsibleTitle', '安装说明')
        await fillTextarea(wrapper, 'collapsibleContent', '第一行\n第二行')
        await setCheckbox(wrapper, 'collapsibleExpanded', true)

        expect(await insertOnce(wrapper)).toBe('???+ warning "安装说明"\n    第一行\n    第二行\n')
    })

    it('task-list：每行 - [x] / - [ ] 项', async () => {
        const wrapper = mountDialog('task-list')
        await fillTextarea(wrapper, 'taskContent', '买牛奶\n写文档')

        expect(await insertOnce(wrapper)).toBe('- [ ] 买牛奶\n- [ ] 写文档')

        await setCheckbox(wrapper, 'taskCompleted', true)
        expect(await insertOnce(wrapper)).toBe('- [x] 买牛奶\n- [x] 写文档')
    })

    it('highlight：==文本==', async () => {
        const wrapper = mountDialog('highlight')
        await fillInput(wrapper, 'highlightText', '重点')
        expect(await insertOnce(wrapper)).toBe('==重点==')
    })

    it('insert-delete：普通标记与 critic 标记共 6 种模式', async () => {
        const wrapper = mountDialog('insert-delete')
        await fillInput(wrapper, 'insertDeleteText', '新增')
        expect(await insertOnce(wrapper)).toBe('^^新增^^')

        await selectOption(wrapper, 'insertDeleteMode', 'delete')
        await fillInput(wrapper, 'insertDeleteText', '废弃')
        expect(await insertOnce(wrapper)).toBe('~~废弃~~')

        await selectOption(wrapper, 'insertDeleteMode', 'critic-insert')
        await fillInput(wrapper, 'insertDeleteText', '插入')
        expect(await insertOnce(wrapper)).toBe('{++插入++}')

        await selectOption(wrapper, 'insertDeleteMode', 'critic-delete')
        await fillInput(wrapper, 'insertDeleteText', '删除')
        expect(await insertOnce(wrapper)).toBe('{--删除--}')

        await selectOption(wrapper, 'insertDeleteMode', 'critic-highlight')
        await fillInput(wrapper, 'insertDeleteText', '高亮')
        expect(await insertOnce(wrapper)).toBe('{==高亮==}')

        await selectOption(wrapper, 'insertDeleteMode', 'critic-comment')
        await fillInput(wrapper, 'insertDeleteText', '注释')
        expect(await insertOnce(wrapper)).toBe('{>>注释<<}')
    })

    it('sup-sub：上标 ^文本^ / 下标 ~文本~', async () => {
        const wrapper = mountDialog('sup-sub')
        await fillInput(wrapper, 'scriptText', 'x2')
        expect(await insertOnce(wrapper)).toBe('^x2^')

        await selectOption(wrapper, 'scriptMode', 'sub')
        await fillInput(wrapper, 'scriptText', 'H2O')
        expect(await insertOnce(wrapper)).toBe('~H2O~')
    })

    it('keys：++按键++', async () => {
        const wrapper = mountDialog('keys')
        await fillInput(wrapper, 'keysText', 'ctrl+shift+p')
        expect(await insertOnce(wrapper)).toBe('++ctrl+shift+p++')
    })

    it('attr-list：按钮 / 行内 class / 对齐三种模式 + 条件字段显隐', async () => {
        const wrapper = mountDialog('attr-list')
        // 默认按钮模式：只显示 URL 字段
        expect(field(wrapper, 'attrUrl').exists()).toBe(true)
        expect(wrapper.find('[data-field="attrClass"]').exists()).toBe(false)
        expect(wrapper.find('[data-field="attrAlign"]').exists()).toBe(false)

        await fillInput(wrapper, 'attrText', '官方文档')
        await fillInput(wrapper, 'attrUrl', 'https://example.com/doc')
        expect(await insertOnce(wrapper)).toBe('[官方文档](https://example.com/doc){ .md-button }')

        // 行内 class 模式：只显示 class 字段
        await selectOption(wrapper, 'attrMode', 'inline')
        expect(wrapper.find('[data-field="attrUrl"]').exists()).toBe(false)
        expect(field(wrapper, 'attrClass').exists()).toBe(true)
        await fillInput(wrapper, 'attrText', '行内文本')
        await fillInput(wrapper, 'attrClass', 'highlight')
        expect(await insertOnce(wrapper)).toBe('行内文本{ .highlight }')

        // 对齐模式：只显示 align 字段
        await selectOption(wrapper, 'attrMode', 'align')
        expect(wrapper.find('[data-field="attrClass"]').exists()).toBe(false)
        expect(field(wrapper, 'attrAlign').exists()).toBe(true)
        await fillInput(wrapper, 'attrText', '居右内容')
        await selectOption(wrapper, 'attrAlign', 'right')
        expect(await insertOnce(wrapper)).toBe('居右内容{ align=right }')
    })

    it('footnote：文本[^1] + 空行 + [^1]: 内容', async () => {
        const wrapper = mountDialog('footnote')
        await fillInput(wrapper, 'footnoteText', '引用')
        await fillTextarea(wrapper, 'footnoteContent', '脚注内容')
        expect(await insertOnce(wrapper)).toBe('引用[^1]\n\n[^1]: 脚注内容')
    })

    it('definition-list：术语 + 换行 + : 定义', async () => {
        const wrapper = mountDialog('definition-list')
        await fillInput(wrapper, 'definitionTerm', '白泽')
        await fillTextarea(wrapper, 'definitionText', '上古神兽')
        expect(await insertOnce(wrapper)).toBe('白泽\n: 上古神兽')
    })

    it('grid-cards：div.grid.cards + 每张卡图标/标题/分隔线/描述', async () => {
        const wrapper = mountDialog('grid-cards')
        await fillTextarea(
            wrapper,
            'cardsText',
            'pencil|快速开始|几分钟完成安装\n\nrocket|开箱即用|无需额外依赖'
        )
        expect(await insertOnce(wrapper)).toBe(
            [
                '<div class="grid cards" markdown>',
                '',
                '-   :material-pencil: **快速开始**',
                '',
                '    ---',
                '',
                '    几分钟完成安装',
                '',
                '-   :material-rocket: **开箱即用**',
                '',
                '    ---',
                '',
                '    无需额外依赖',
                '',
                '</div>'
            ].join('\n')
        )

        // 图标可留空：此时卡片行不带 :material-*: 前缀
        await fillTextarea(wrapper, 'cardsText', '|无图标卡片|仅标题与描述')
        expect(await insertOnce(wrapper)).toBe(
            [
                '<div class="grid cards" markdown>',
                '',
                '-   **无图标卡片**',
                '',
                '    ---',
                '',
                '    仅标题与描述',
                '',
                '</div>'
            ].join('\n')
        )
    })

    it('code-block：语言/行号/高亮行/标题属性按勾选与填写裁剪', async () => {
        const wrapper = mountDialog('code-block')
        await fillInput(wrapper, 'codeLang', 'js')
        await fillInput(wrapper, 'codeTitle', '示例')
        await fillTextarea(wrapper, 'codeContent', 'console.log(1)')
        await setCheckbox(wrapper, 'codeLinenums', true)
        await fillInput(wrapper, 'codeHlLines', '2 3')

        expect(await insertOnce(wrapper)).toBe(
            [`${FENCE}js linenums="1" hl_lines="2 3" title="示例"`, 'console.log(1)', FENCE].join(
                '\n'
            )
        )

        // 取消行号、清空高亮行与标题 → 仅保留语言
        await setCheckbox(wrapper, 'codeLinenums', false)
        await fillInput(wrapper, 'codeHlLines', '')
        await fillInput(wrapper, 'codeTitle', '')
        expect(await insertOnce(wrapper)).toBe([`${FENCE}js`, 'console.log(1)', FENCE].join('\n'))
    })

    it('icon：:material-<name>:（可选追加文本）；名称为空时预览提示且不插入', async () => {
        const wrapper = mountDialog('icon')
        await fillInput(wrapper, 'iconName', 'github')
        await fillInput(wrapper, 'iconText', '仓库')
        expect(await insertOnce(wrapper)).toBe(':material-github: 仓库')

        // 名称清空：预览显示提示文案，点插入不产生空片段
        await fillInput(wrapper, 'iconName', '')
        expect(wrapper.find('.preview').text()).toBe(
            t('dialogRenderer.materialSyntax.iconNameRequired')
        )
        const emittedBefore = wrapper.emitted('insert')!.length
        await wrapper.find('.btn-insert').trigger('click')
        expect(wrapper.emitted('insert')!.length).toBe(emittedBefore)
    })

    it('blocks：/// type | 标题；tabbed 生成 tab 子块且条件显示标签字段', async () => {
        const wrapper = mountDialog('blocks')
        await fillInput(wrapper, 'blocksTitle', '块标题')
        await fillTextarea(wrapper, 'blocksContent', '块内容')
        // note 类型不显示 tab 标签字段
        expect(wrapper.find('[data-field="blocksTabLabel"]').exists()).toBe(false)
        expect(await insertOnce(wrapper)).toBe('/// note | 块标题\n块内容\n///')

        await selectOption(wrapper, 'blocksType', 'tabbed')
        expect(field(wrapper, 'blocksTabLabel').exists()).toBe(true)
        await fillInput(wrapper, 'blocksTabLabel', '标签一')
        await fillTextarea(wrapper, 'blocksContent', '标签内容')
        expect(await insertOnce(wrapper)).toBe('/// tabbed\n/// tab | 标签一\n标签内容\n///\n///')
    })

    it('snippet：--8<-- "path" / 带起止行号', async () => {
        const wrapper = mountDialog('snippet')
        await fillInput(wrapper, 'snippetPath', 'snippets/intro.md')

        // 只填路径：整文件包含
        expect(await insertOnce(wrapper)).toBe('--8<-- "snippets/intro.md"')

        // 起止行均填写：行号区间形式
        await fillInput(wrapper, 'snippetStart', '10')
        await fillInput(wrapper, 'snippetEnd', '20')
        expect(await insertOnce(wrapper)).toBe('--8<-- "snippets/intro.md:10:20"')
    })

    it('tab-link：[文本](#__tabbed_<set>_<tab>)，set 默认 1、tab 默认 2', async () => {
        const wrapper = mountDialog('tab-link')
        await fillInput(wrapper, 'tabLinkText', '跳转')
        await fillInput(wrapper, 'tabLinkSet', '3')
        await fillInput(wrapper, 'tabLinkTab', '5')
        expect(await insertOnce(wrapper)).toBe('[跳转](#__tabbed_3_5)')

        // 清空序号回退默认值 1 / 2
        await fillInput(wrapper, 'tabLinkSet', '')
        await fillInput(wrapper, 'tabLinkTab', '')
        expect(await insertOnce(wrapper)).toBe('[跳转](#__tabbed_1_2)')
    })

    it('15 项功能项使用默认值时直接插入均产出非空片段', async () => {
        for (const featureId of MATERIAL_FEATURE_IDS) {
            const wrapper = mountDialog(featureId)
            const markdown = await insertOnce(wrapper)
            expect(markdown.length, `${featureId} 的默认片段不应为空`).toBeGreaterThan(0)
            expect(wrapper.emitted('insert')).toHaveLength(1)
            wrapper.unmount()
        }
    })
})

describe('MaterialSyntaxDialog 契约与懒加载导出', () => {
    it('configStore.showDialog 合并 preset，hideDialog 只关闭不清空 preset', () => {
        const store = getConfigStore()
        expect(store.dialogs.materialSyntax.visible).toBe(false)

        store.showDialog('materialSyntax', { preset: 'task-list' })
        expect(store.dialogs.materialSyntax.visible).toBe(true)
        expect(store.dialogs.materialSyntax.preset).toBe('task-list')

        store.hideDialog('materialSyntax')
        expect(store.dialogs.materialSyntax.visible).toBe(false)
        expect(store.dialogs.materialSyntax.preset).toBe('task-list')
    })

    it('dialogs/index 懒加载导出可透传 preset 并渲染对应表单', async () => {
        const wrapper = mount(LazyMaterialSyntaxDialog, {
            ...dialogMountOptions,
            props: { visible: true },
            // preset 不在懒加载包装组件的 props 声明里，经 $attrs 透传给真实对话框
            attrs: { preset: 'keys' }
        })
        await flushPromises()
        await vi.waitFor(() => {
            expect(wrapper.find('.form-panel').attributes('data-active-feature')).toBe('keys')
        })
        expect(wrapper.find('[data-field="keysText"]').exists()).toBe(true)
        wrapper.unmount()
    })
})

// M3（结构优化第 5 批）：Material 15 项扩展语法单一 manifest 一致性。
// 原三处重复维护（menu-config.ts 菜单字面量 / menu-actions.ts 动作 id 数组 /
// MaterialSyntaxDialog.vue 功能项 id 清单）已收敛为 shared/constants/material-syntax.ts，
// 本组用例守护「菜单由 manifest 生成 + 对话框渲染顺序 + 中英词条」三者同步。
describe('M3 Material 语法 manifest 一致性', () => {
    interface MenuNode {
        labelKey?: string
        menuAction?: string
        submenu?: MenuNode[]
    }

    function findByLabelKey(items: MenuNode[], labelKey: string): MenuNode | undefined {
        for (const item of items) {
            if (item.labelKey === labelKey) return item
            if (item.submenu) {
                const found = findByLabelKey(item.submenu, labelKey)
                if (found) return found
            }
        }
        return undefined
    }

    /** 按点分路径解析 i18n 字典（menu 命名空间对象的键不含 `menu.` 前缀） */
    function resolveI18nKey(dict: Record<string, unknown>, key: string): unknown {
        return key
            .replace(/^menu\./, '')
            .split('.')
            .reduce<unknown>((acc, part) => {
                if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
                return undefined
            }, dict)
    }

    it('manifest 自身：15 项、id 唯一、kebab-case、动作前缀契约', () => {
        expect(MATERIAL_SYNTAX_FEATURES).toHaveLength(15)
        const ids = MATERIAL_SYNTAX_FEATURES.map((feature) => feature.id)
        expect(new Set(ids).size).toBe(ids.length)
        for (const feature of MATERIAL_SYNTAX_FEATURES) {
            expect(feature.id).toMatch(/^[a-z]+(-[a-z]+)*$/)
            expect(feature.menuLabelKey.startsWith('menu.insert.material.')).toBe(true)
            expect(getMaterialSyntaxMenuAction(feature.id)).toBe(
                `${MATERIAL_SYNTAX_ACTION_PREFIX}${feature.id}`
            )
        }
    })

    it('菜单由 manifest 生成：Material 子菜单 = legacy admonition + manifest 15 项（顺序一致）', () => {
        const materialMenu = findByLabelKey(
            menuMap.value as unknown as MenuNode[],
            'menu.insert.material.label'
        )
        expect(materialMenu?.submenu).toBeDefined()
        const actions = (materialMenu!.submenu as MenuNode[]).map((item) => item.menuAction)
        expect(actions).toEqual([
            'baize:menu:insert:material:admonition',
            ...MATERIAL_SYNTAX_FEATURES.map((feature) => getMaterialSyntaxMenuAction(feature.id))
        ])
    })

    it('对话框左侧 15 项渲染顺序与 manifest 完全一致', () => {
        const wrapper = mountDialog()
        const rendered = wrapper
            .findAll('.feature-item')
            .map((item) => item.attributes('data-feature'))
        expect(rendered).toEqual([...MATERIAL_SYNTAX_FEATURE_IDS])
        wrapper.unmount()
    })

    it('menu 命名空间 i18n：zh-CN 与 en-US 均存在全部 15 项词条', () => {
        const locales: Array<[string, Record<string, unknown>]> = [
            ['zh-CN', zhMenu as unknown as Record<string, unknown>],
            ['en-US', enMenu as unknown as Record<string, unknown>]
        ]
        for (const [locale, dict] of locales) {
            for (const feature of MATERIAL_SYNTAX_FEATURES) {
                const value = resolveI18nKey(dict, feature.menuLabelKey)
                expect(typeof value, `${locale} 缺少 ${feature.menuLabelKey}`).toBe('string')
                expect(
                    (value as string).length,
                    `${locale} 的 ${feature.menuLabelKey} 为空`
                ).toBeGreaterThan(0)
            }
            expect(resolveI18nKey(dict, 'menu.insert.material.label'), `缺少分组标签`).toBeTruthy()
        }
    })
})
