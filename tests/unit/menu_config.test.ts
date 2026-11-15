import { describe, it, expect } from 'vitest'
import { translate } from '../../src/shared/i18n'
import { menuMap, pruneEmptySubmenus } from '../../src/renderer/src/components/MenuBar/menu-config'
import type { BaiZeMenuEntry } from '../../src/renderer/src/components/MenuBar/menu-config'

// CMP-30：菜单数据只存 labelKey，渲染时由 MenuBar.vue 调用 t(labelKey) 输出。
// 测试辅助：按指定语言还原「渲染后文本」，并对非 labelKey 的存量 label（品牌名/版本号等）原样使用。
function displayText(item: BaiZeMenuEntry, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
    return item.labelKey ? translate(item.labelKey, locale) : (item.label ?? '')
}

// 把菜单项还原成「带 label 的渲染态对象」（去掉 labelKey 字段），便于沿用原有断言
function resolved(
    item: BaiZeMenuEntry,
    locale: 'zh-CN' | 'en-US' = 'zh-CN'
): Record<string, unknown> {
    const { labelKey, ...rest } = item as BaiZeMenuEntry & { labelKey?: string }
    return { ...rest, label: labelKey ? translate(labelKey, locale) : rest.label }
}

function resolvedList(
    items: BaiZeMenuEntry[],
    locale: 'zh-CN' | 'en-US' = 'zh-CN'
): Array<Record<string, unknown>> {
    return items.map((item) => resolved(item, locale))
}

// 递归收集菜单树中所有 menuAction 值
function collectActions(items: unknown[]): string[] {
    const actions: string[] = []
    const walk = (list: unknown[]) => {
        for (const item of list as Array<{ menuAction?: string; submenu?: unknown[] }>) {
            if (item.menuAction) {
                actions.push(item.menuAction)
            }
            if (item.submenu) {
                walk(item.submenu)
            }
        }
    }
    walk(items)
    return actions
}

// 递归收集所有 labelKey
function collectLabelKeys(items: BaiZeMenuEntry[]): string[] {
    const keys: string[] = []
    const walk = (list: BaiZeMenuEntry[]) => {
        for (const item of list) {
            if (item.labelKey) keys.push(item.labelKey)
            if (item.submenu) walk(item.submenu)
        }
    }
    walk(items)
    return keys
}

describe('menu-config', () => {
    it('should expose menuMap as a vue ref with 11 top-level menus', () => {
        expect(menuMap.value.length).toBe(11)
    })

    it('should declare the expected top-level labels in order (zh-CN renders verbatim)', () => {
        const labels = menuMap.value.map((item) => displayText(item))
        expect(labels).toEqual([
            '文件',
            '编辑',
            '视图',
            '编码',
            '插入',
            '设置',
            '工具',
            '插件',
            '在线',
            'GitHub',
            '帮助'
        ])
    })

    it('should translate top-level labels to English when locale is en-US', () => {
        const labels = menuMap.value.map((item) => displayText(item, 'en-US'))
        expect(labels).toEqual([
            'File',
            'Edit',
            'View',
            'Encoding',
            'Insert',
            'Settings',
            'Tools',
            'Plugins',
            'Online',
            'GitHub',
            'Help'
        ])
    })

    it('should keep every top-level menu with a submenu', () => {
        for (const menu of menuMap.value) {
            expect(menu.submenu).toBeDefined()
            expect(menu.submenu!.length).toBeGreaterThan(0)
        }
    })

    it('should keep every menuAction value unique across the whole tree', () => {
        const actions = collectActions(menuMap.value)
        expect(actions.length).toBeGreaterThan(50)
        expect(new Set(actions).size).toBe(actions.length)
    })

    it('should store visible labels as i18n keys instead of literal Chinese', () => {
        // 递归校验：labelKey 必须能在中英词典中解析；仍使用 label 的项不得含中文（品牌名/版本号/格式名）
        const walk = (list: BaiZeMenuEntry[]) => {
            for (const item of list) {
                if (item.labelKey) {
                    expect(translate(item.labelKey, 'zh-CN')).not.toBe(item.labelKey)
                    expect(translate(item.labelKey, 'en-US')).not.toBe(item.labelKey)
                }
                if (item.label) {
                    expect(item.label).not.toMatch(/[\u4e00-\u9fff]/)
                }
                if (!item.labelKey && item.label === undefined && item.type !== 'separator') {
                    expect(item.submenu, '菜单项应至少具有 labelKey 或 label').toBeDefined()
                }
                if (item.submenu) walk(item.submenu)
            }
        }
        walk(menuMap.value)
        expect(collectLabelKeys(menuMap.value).length).toBeGreaterThan(100)
    })

    it('should mark separator items with type separator and no menuAction', () => {
        const walk = (list: unknown[]) => {
            for (const item of list as Array<{
                type?: string
                menuAction?: string
                submenu?: unknown[]
            }>) {
                if (item.type === 'separator') {
                    expect(item.menuAction).toBeUndefined()
                } else if (item.submenu) {
                    walk(item.submenu)
                }
            }
        }
        walk(menuMap.value)
    })

    it('should declare file menu with expected actions and accelerators', () => {
        const fileMenu = menuMap.value.find((item) => displayText(item) === '文件')!
        // FUN-26：顶层 'Alt+N' 未绑定且菜单栏不渲染顶层 accelerator，已移除
        expect(fileMenu.accelerator).toBeUndefined()
        const submenu = resolvedList(fileMenu.submenu!)
        expect(submenu).toContainEqual({
            label: '新建',
            accelerator: 'Ctrl+N',
            menuAction: 'baize:menu:file:new'
        })
        expect(submenu).toContainEqual({
            label: '保存',
            accelerator: 'Ctrl+S',
            menuAction: 'baize:menu:file:save'
        })
        expect(submenu).toContainEqual({
            label: '退出',
            accelerator: 'F4',
            menuAction: 'baize:menu:file:exit'
        })
    })

    it('should declare import and export submenus inside file menu', () => {
        const fileMenu = menuMap.value.find((item) => displayText(item) === '文件')!
        const importMenu = fileMenu.submenu!.find((item) => displayText(item) === '从文件导入')
        const exportMenu = fileMenu.submenu!.find((item) => displayText(item) === '导出到文件')
        expect(importMenu?.submenu).toHaveLength(6)
        expect(exportMenu?.submenu).toHaveLength(6)
        expect(resolvedList(importMenu!.submenu!)).toContainEqual({
            label: '从 Word 导入',
            menuAction: 'baize:menu:file:import:word'
        })
        expect(resolvedList(exportMenu!.submenu!)).toContainEqual({
            label: '导出为PDF',
            menuAction: 'baize:menu:file:export:pdf'
        })
    })

    it('should declare edit menu with standard editing actions', () => {
        const editMenu = menuMap.value.find((item) => displayText(item) === '编辑')!
        const actions = editMenu.submenu!.map((item) => item.menuAction)
        expect(actions).toContain('baize:menu:edit:undo')
        expect(actions).toContain('baize:menu:edit:redo')
        expect(actions).toContain('baize:menu:edit:cut')
        expect(actions).toContain('baize:menu:edit:copy')
        expect(actions).toContain('baize:menu:edit:paste')
        expect(actions).toContain('baize:menu:edit:go-line')
        // FUN-09：在文件中查找/替换无法低成本实现，已隐藏（A-4 模式）
        expect(actions).not.toContain('baize:menu:edit:find-in-dir')
        expect(actions).not.toContain('baize:menu:edit:replace-in-dir')
    })

    it('should declare tools menu with the drawing template submenu (FUN-09)', () => {
        const toolsMenu = menuMap.value.find((item) => displayText(item) === '工具')!
        const drawing = toolsMenu.submenu!.find((item) => displayText(item) === '绘图工具')
        expect(resolvedList(drawing!.submenu!)).toEqual([
            { label: 'Mermaid 绘图', menuAction: 'baize:menu:tools:drawing:mermaid' },
            { label: 'PlantUML 绘图', menuAction: 'baize:menu:tools:drawing:plantuml' }
        ])
        // 原单条目 'baize:menu:tools:drawing'（'OpenFile' 死通道）已移除
        const actions = collectActions(toolsMenu.submenu!)
        expect(actions).not.toContain('baize:menu:tools:drawing')
    })

    it('should hide unimplemented insert template items (FUN-09)', () => {
        const insertMenu = menuMap.value.find((item) => displayText(item) === '插入')!
        const actions = collectActions(insertMenu.submenu!)
        expect(actions).not.toContain('baize:menu:insert:custom-template')
        expect(actions).not.toContain('baize:menu:insert:template-manager')
    })

    it('should declare view menu with F9-F12 accelerators and fold levels', () => {
        const viewMenu = menuMap.value.find((item) => displayText(item) === '视图')!
        const submenu = resolvedList(viewMenu.submenu!)
        expect(submenu).toContainEqual({
            label: '编辑模式',
            accelerator: 'F9',
            menuAction: 'baize:menu:view:edit-mode'
        })
        expect(submenu).toContainEqual({
            label: '预览模式',
            accelerator: 'F10',
            menuAction: 'baize:menu:view:preview-mode'
        })
        expect(submenu).toContainEqual({
            label: '编辑/预览模式',
            accelerator: 'F11',
            menuAction: 'baize:menu:view:edit-preview-mode'
        })
        expect(submenu).toContainEqual({
            label: '开发人员工具',
            accelerator: 'F12',
            menuAction: 'baize:menu:view:dev-tools'
        })
        const fold = viewMenu.submenu!.find((item) => displayText(item) === '折叠/展开标题')
        expect(fold?.submenu).toHaveLength(8)
        expect(resolved(fold!.submenu![0])).toEqual({
            label: '全部折叠',
            menuAction: 'baize:menu:view:fold:all-fold'
        })
        expect(resolved(fold!.submenu![7])).toEqual({
            label: '六级标题',
            menuAction: 'baize:menu:view:fold:level6'
        })
    })

    it('should declare encoding menu with two nested encoding groups', () => {
        const codingMenu = menuMap.value.find((item) => displayText(item) === '编码')!
        expect(codingMenu.submenu).toHaveLength(2)
        expect(displayText(codingMenu.submenu![0])).toBe('重新用...编码打开')
        expect(displayText(codingMenu.submenu![1])).toBe('转为...编码')
        expect(resolvedList(codingMenu.submenu![0].submenu!)).toContainEqual({
            label: 'UTF-8',
            menuAction: 'baize:menu:coding:encoding:utf8'
        })
        expect(resolvedList(codingMenu.submenu![1].submenu!)).toContainEqual({
            label: 'GBK(简体中文)',
            menuAction: 'baize:menu:coding:switch:gbk'
        })
    })

    it('should declare insert menu with material/mermaid/plantuml groups', () => {
        const insertMenu = menuMap.value.find((item) => displayText(item) === '插入')!
        const labels = insertMenu.submenu!.map((item) => displayText(item))
        expect(labels).toContain('特殊字体')
        expect(labels).toContain('数学公式')
        expect(labels).toContain('写作模板')
        expect(labels).toContain('文本块')
        expect(labels).toContain('Material')
        expect(labels).toContain('Mermaid')
        expect(labels).toContain('PlantUML')
    })

    it('should declare plugins menu with encrypt/network/info groups (FE-16：空组已剔除)', () => {
        const pluginsMenu = menuMap.value.find((item) => displayText(item) === '插件')!
        const labels = pluginsMenu.submenu!.map((item) => displayText(item))
        // FE-16：语言语法关键字对照表 / 各类转换器（4 个空子组）等空组不再渲染
        expect(labels).not.toContain('语言语法关键字对照表')
        expect(labels).not.toContain('各类转换器')
        expect(labels).not.toContain('数据和命令对照表')
        // 仍有数据的组保留
        expect(labels).toContain('加解密插件')
        expect(labels).toContain('网络计算插件')
        expect(labels).toContain('常用对照表')
        const encrypt = pluginsMenu.submenu!.find((item) => displayText(item) === '加解密插件')
        expect(encrypt?.submenu).toHaveLength(8)
    })

    it('should expose every registered plugin tool in the plugins menu (FE-17)', () => {
        const pluginsMenu = menuMap.value.find((item) => displayText(item) === '插件')!
        const actions = collectActions(pluginsMenu.submenu!)
        // plugin-tools-const.ts 注册表中已实现但此前无菜单入口的 4 个工具
        expect(actions).toContain('baize:menu:plugins:net:http-status-codes')
        expect(actions).toContain('baize:menu:plugins:net:subnet-mask-map-table')
        expect(actions).toContain('baize:menu:plugins:info:numeric-case-table')
        expect(actions).toContain('baize:menu:plugins:info:normal-font-style-table')

        // 新条目使用 menu 命名空间的 i18n key，中英文案均可解析
        const network = pluginsMenu.submenu!.find((item) => displayText(item) === '网络计算插件')!
        expect(resolvedList(network.submenu!)).toContainEqual({
            label: 'HTTP状态码对照表',
            menuAction: 'baize:menu:plugins:net:http-status-codes'
        })
        expect(resolvedList(network.submenu!)).toContainEqual({
            label: '子网掩码对照表',
            menuAction: 'baize:menu:plugins:net:subnet-mask-map-table'
        })
        expect(resolvedList(network.submenu!, 'en-US')).toContainEqual({
            label: 'Subnet Mask Table',
            menuAction: 'baize:menu:plugins:net:subnet-mask-map-table'
        })
        const cheatSheet = pluginsMenu.submenu!.find((item) => displayText(item) === '常用对照表')!
        const cheatSheet1 = cheatSheet.submenu!.find((item) => displayText(item) === '对照表一')!
        expect(resolvedList(cheatSheet1.submenu!)).toContainEqual({
            label: '数字大小写对照表',
            menuAction: 'baize:menu:plugins:info:numeric-case-table'
        })
        expect(resolvedList(cheatSheet1.submenu!)).toContainEqual({
            label: '常见字体样式对照表',
            menuAction: 'baize:menu:plugins:info:normal-font-style-table'
        })
    })

    it('should not render any empty submenu group (FE-16 回归防护)', () => {
        // 空组既没有箭头也没有 menuAction，点击永远无反应；剪枝后菜单树中不允许存在
        const walk = (list: BaiZeMenuEntry[], path: string): void => {
            for (const item of list) {
                if (item.submenu) {
                    expect(
                        item.submenu.length,
                        `空子菜单组: ${path} > ${displayText(item)}`
                    ).toBeGreaterThan(0)
                    walk(item.submenu, `${path} > ${displayText(item)}`)
                } else if (item.type !== 'separator') {
                    // 叶子项必须有可触发的动作（或为纯展示文案）
                    const hasAction = Boolean(item.menuAction)
                    expect(
                        hasAction || item.enabled === false || displayText(item).length > 0,
                        `不可触发的叶子菜单项: ${path} > ${displayText(item)}`
                    ).toBe(true)
                }
            }
        }
        walk(menuMap.value, 'menu')
    })

    it('should declare online menu with seven tool groups', () => {
        const onlineMenu = menuMap.value.find((item) => displayText(item) === '在线')!
        expect(onlineMenu.submenu).toHaveLength(7)
        const labels = onlineMenu.submenu!.map((item) => displayText(item))
        expect(labels).toContain('菜鸟在线工具')
        expect(labels).toContain('编程狮在线工具')
        expect(labels).toContain('在线编解码工具')
        expect(labels).toContain('在线IDE编辑器')
        expect(labels).toContain('开发者工具')
        expect(labels).toContain('国内知名前端团队')
        expect(labels).toContain('云计算平台')
        // 在线菜单项由 url maps 生成：labelKey + menuAction(id) 形式
        const cainiao = onlineMenu.submenu!.find((item) => displayText(item) === '菜鸟在线工具')
        expect(resolved(cainiao!.submenu![0])).toEqual({
            label: '菜鸟SVG图片编辑器',
            menuAction: 'baize:menu:online:cainiao:svg-editor'
        })
    })

    it('should declare github menu with five project entries', () => {
        const gitHubMenu = menuMap.value.find((item) => displayText(item) === 'GitHub')!
        expect(gitHubMenu.submenu).toHaveLength(5)
        expect(resolved(gitHubMenu.submenu![0])).toEqual({
            label: 'IT TOOLS 助力开发人员和IT工作者',
            menuAction: 'baize:menu:github:it-tools'
        })
    })

    it('should declare help menu with release notes ordered newest first', () => {
        const helpMenu = menuMap.value.find((item) => displayText(item) === '帮助')!
        const releases = helpMenu.submenu!.find((item) => displayText(item) === '版本发布')
        expect(releases?.submenu).toHaveLength(12)
        expect(resolved(releases!.submenu![0])).toEqual({
            label: 'v1.3.0',
            menuAction: 'baize:menu:help:release-notes:v1.3.0'
        })
        expect(resolved(releases!.submenu![1])).toEqual({
            label: 'v1.2.2',
            menuAction: 'baize:menu:help:release-notes:v1.2.2'
        })
        expect(resolved(releases!.submenu![11])).toEqual({
            label: 'v1.0.0',
            menuAction: 'baize:menu:help:release-notes:v1.0.0'
        })
    })

    it('should keep top-level accelerator values unique', () => {
        const accelerators = menuMap.value
            .map((item) => item.accelerator)
            .filter((value): value is string => typeof value === 'string')
        expect(new Set(accelerators).size).toBe(accelerators.length)
    })

    // P1/C-06：contact 动作 id 必须与渲染层 menu-actions 拦截值一致，
    // 否则会漏到主进程 JSDOM 联系对话框（两套对话框并存）
    it('should declare contact menu action matching the renderer interception id', () => {
        const helpMenu = menuMap.value.find((item) => displayText(item) === '帮助')!
        const contact = helpMenu.submenu!.find((item) => displayText(item) === '联系我们')
        expect(contact ?? null).toMatchObject({ menuAction: 'baize:menu:help:contact-us' })
    })

    // FE-28：插入菜单的 Material/Mermaid/PlantUML 分组与 Part1/Part2 子组
    // 原为硬编码 label，现全部改走 menu 命名空间 labelKey（中英均可解析）。
    it('should resolve insert template group labels through i18n keys (FE-28)', () => {
        const insertMenu = menuMap.value.find((item) => displayText(item) === '插入')!
        const insertLabels = insertMenu.submenu!.map((item) => displayText(item))
        for (const label of ['Material', 'Mermaid', 'PlantUML']) {
            expect(insertLabels).toContain(label)
        }

        const mermaidGroup = insertMenu.submenu!.find(
            (item) => item.labelKey === 'menu.insert.mermaid.label'
        )!
        expect(mermaidGroup.submenu!.map((item) => item.labelKey)).toEqual([
            'menu.insert.mermaid.part1',
            'menu.insert.mermaid.part2'
        ])
        const mermaidLabelsEn = mermaidGroup.submenu!.map((item) => displayText(item, 'en-US'))
        expect(mermaidLabelsEn).toEqual(['Mermaid Part 1', 'Mermaid Part 2'])
        const mermaidLabelsZh = mermaidGroup.submenu!.map((item) => displayText(item))
        expect(mermaidLabelsZh).toEqual(['Mermaid 第一部分', 'Mermaid 第二部分'])

        const plantUmlGroup = insertMenu.submenu!.find(
            (item) => item.labelKey === 'menu.insert.plantuml.label'
        )!
        expect(plantUmlGroup.submenu!.map((item) => displayText(item, 'en-US'))).toEqual([
            'PlantUML Part 1',
            'PlantUML Part 2'
        ])

        const materialGroup = insertMenu.submenu!.find(
            (item) => item.labelKey === 'menu.insert.material.label'
        )!
        expect(materialGroup.submenu!.map((item) => item.labelKey)).toEqual([
            'menu.insert.material.admonition'
        ])
    })

    // FE-28：菜单树中不允许残留「结构性」硬编码中文/英文标签——
    // 保留 label 的仅限品牌名/版本号/扩展名/图格式名等豁免项（不含中文，且在白名单内）。
    it('should keep non-i18n literal labels limited to documented exemptions (FE-28)', () => {
        const literalLabels: string[] = []
        const walk = (list: BaiZeMenuEntry[]) => {
            for (const item of list) {
                if (!item.labelKey && item.label) {
                    literalLabels.push(item.label)
                }
                if (item.submenu) walk(item.submenu)
            }
        }
        walk(menuMap.value)

        // 品牌名 / 版本号 / 模板图格式名（flowchart、*.json 等）之外的硬编码标签均应已 key 化
        const exemptions = new Set([
            'GitHub',
            'WebIDE Online',
            'THX from Alimama FE',
            'flowchart',
            'BlockDiagram',
            'Packet',
            'XYChart',
            'Zenuml',
            'AsciiMath',
            '*.json',
            '*.txt;*.log',
            '*.ini',
            '*.yaml;*.yml',
            '*.xml',
            '*.html',
            '*.csv',
            '*.xls;*.xlsx'
        ])
        const unexpected = literalLabels.filter(
            (label) => !exemptions.has(label) && !/^v\d+\.\d+\.\d+$/.test(label)
        )
        expect(unexpected).toEqual([])
    })
})

// FE-16：空组剪枝工具函数的边界用例
describe('pruneEmptySubmenus（FE-16）', () => {
    const action = (id: string): BaiZeMenuEntry => ({ label: id, menuAction: id })

    it('should drop a group whose submenu is empty', () => {
        const pruned = pruneEmptySubmenus([
            { label: 'empty-group', submenu: [] },
            action('baize:menu:file:new')
        ])
        expect(pruned).toEqual([action('baize:menu:file:new')])
    })

    it('should drop a group whose descendants are all empty (转换器外层组场景)', () => {
        const pruned = pruneEmptySubmenus([
            {
                label: 'converters',
                submenu: [
                    { label: 'codec', submenu: [] },
                    { label: 'formatConvert', submenu: [] }
                ]
            },
            action('baize:menu:plugins:encrypt:token-generator')
        ])
        expect(pruned.map((item) => item.label)).toEqual([
            'baize:menu:plugins:encrypt:token-generator'
        ])
    })

    it('should keep groups that still contain action leaves and preserve their order', () => {
        const pruned = pruneEmptySubmenus([
            {
                label: 'group',
                submenu: [action('a'), { label: 'nested-empty', submenu: [] }, action('b')]
            }
        ])
        expect(pruned).toHaveLength(1)
        expect(pruned[0].submenu!.map((item) => item.menuAction)).toEqual(['a', 'b'])
    })

    it('should clean leading/trailing/consecutive separators exposed by pruning', () => {
        const pruned = pruneEmptySubmenus([
            { type: 'separator' },
            action('a'),
            { type: 'separator' },
            { label: 'empty-group', submenu: [] },
            { type: 'separator' },
            action('b'),
            { type: 'separator' }
        ])
        expect(pruned.map((item) => item.type ?? item.menuAction)).toEqual(['a', 'b'])
    })

    it('should not mutate the input tree', () => {
        const input: BaiZeMenuEntry[] = [
            { label: 'group', submenu: [action('a')] },
            { label: 'empty-group', submenu: [] }
        ]
        const snapshot = JSON.parse(JSON.stringify(input))
        pruneEmptySubmenus(input)
        expect(JSON.parse(JSON.stringify(input))).toEqual(snapshot)
    })
})
