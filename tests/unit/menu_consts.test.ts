import { describe, it, expect } from 'vitest'
import { translate } from '../../src/shared/i18n'
import {
    CHANNEL_PLUGIN_TOOL_SHOW,
    OnlineToolMaps,
    CaiNiaoUrlMaps,
    W3SchoolUrlMaps,
    EncDecUrlMaps,
    IdeUrlMaps,
    DevelopUrlMaps,
    TeamUrlMaps,
    CloudUrlMaps,
    GitHubUrlMaps,
    OnlineUrlMaps,
    PluginGeneratorMaps,
    PluginNetAddrs,
    PluginInfoNormal,
    PluginInfoScience
} from '../../src/renderer/src/components/MenuBar/menu-consts'
// 以下 8 个插件映射表在 src 中声明为 `const X = []`（无元素类型的演进式数组），
// 直接按名导入会让 tsc 在消费端报 TS7034/TS7005；测试侧通过命名空间 + 精确元素类型收口。
import * as MenuConstsModule from '../../src/renderer/src/components/MenuBar/menu-consts'

// CMP-30：菜单常量数据只存 labelKey（menu 命名空间），渲染时由 MenuBar.vue 调 t(labelKey) 输出；
// 纯英文工具名/插件名保持原样 label。测试辅助：还原「渲染后文本」。
interface MenuLabelLike {
    label?: string
    labelKey?: string
}

function displayText(item: MenuLabelLike, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
    return item.labelKey ? translate(item.labelKey, locale) : (item.label ?? '')
}

function resolved(item: MenuLabelLike): Record<string, unknown> {
    const { labelKey, ...rest } = item
    return { ...rest, label: labelKey ? translate(labelKey, 'zh-CN') : rest.label }
}

// 汇总各在线工具映射表，用于统一的结构校验。
// 2026-11-19 重构：映射项已删除死数据 url 字段（渲染层只消费 id/labelKey，
// URL 真源在 shared/constants/urls.ts，由主进程 menu-tools.ts 按 id 命中）。
const urlMaps: Array<{ name: string; table: Array<MenuLabelLike & { id: string }> }> = [
    { name: 'OnlineToolMaps', table: OnlineToolMaps },
    { name: 'CaiNiaoUrlMaps', table: CaiNiaoUrlMaps },
    { name: 'W3SchoolUrlMaps', table: W3SchoolUrlMaps },
    { name: 'EncDecUrlMaps', table: EncDecUrlMaps },
    { name: 'IdeUrlMaps', table: IdeUrlMaps },
    { name: 'DevelopUrlMaps', table: DevelopUrlMaps },
    { name: 'TeamUrlMaps', table: TeamUrlMaps },
    { name: 'CloudUrlMaps', table: CloudUrlMaps },
    { name: 'GitHubUrlMaps', table: GitHubUrlMaps }
]

// 插件菜单项最小结构（label/labelKey 见 MenuLabelLike）
type PluginMenuItem = MenuLabelLike & { menuAction: string }

/** src 中被清空但仍导出的 8 个插件映射表 + 1.3.5 新增的两个映射表（元素类型由测试侧断言） */
interface EmptyPluginMenuMapExports {
    PluginCodeConvertMaps: PluginMenuItem[]
    PluginFormatMaps: PluginMenuItem[]
    PluginConvertMaps: PluginMenuItem[]
    PluginUpLowerMaps: PluginMenuItem[]
    PluginNetGenerators: PluginMenuItem[]
    PluginNetWork: PluginMenuItem[]
    PluginInfoCmd: PluginMenuItem[]
    PluginCodeDef: PluginMenuItem[]
    PluginMiscToolsMaps: PluginMenuItem[]
    PluginTextToolsMaps: PluginMenuItem[]
}

const {
    PluginCodeConvertMaps,
    PluginFormatMaps,
    PluginConvertMaps,
    PluginUpLowerMaps,
    PluginNetGenerators,
    PluginNetWork,
    PluginInfoCmd,
    PluginCodeDef,
    PluginMiscToolsMaps,
    PluginTextToolsMaps
} = MenuConstsModule as unknown as EmptyPluginMenuMapExports

// 汇总各插件菜单映射表
const pluginMenuMaps: Array<{ name: string; table: PluginMenuItem[] }> = [
    { name: 'PluginGeneratorMaps', table: PluginGeneratorMaps },
    { name: 'PluginCodeConvertMaps', table: PluginCodeConvertMaps },
    { name: 'PluginFormatMaps', table: PluginFormatMaps },
    { name: 'PluginConvertMaps', table: PluginConvertMaps },
    { name: 'PluginUpLowerMaps', table: PluginUpLowerMaps },
    { name: 'PluginNetAddrs', table: PluginNetAddrs },
    { name: 'PluginNetGenerators', table: PluginNetGenerators },
    { name: 'PluginNetWork', table: PluginNetWork },
    { name: 'PluginInfoNormal', table: PluginInfoNormal },
    { name: 'PluginInfoScience', table: PluginInfoScience },
    { name: 'PluginInfoCmd', table: PluginInfoCmd },
    { name: 'PluginCodeDef', table: PluginCodeDef },
    { name: 'PluginMiscToolsMaps', table: PluginMiscToolsMaps },
    { name: 'PluginTextToolsMaps', table: PluginTextToolsMaps }
]

describe('menu-consts', () => {
    describe('CHANNEL_PLUGIN_TOOL_SHOW', () => {
        it('should be plugin-tools-show', () => {
            expect(CHANNEL_PLUGIN_TOOL_SHOW).toBe('plugin-tools-show')
        })
    })

    describe('url maps', () => {
        for (const { name, table } of urlMaps) {
            it(`${name} should not be empty and keep fields complete`, () => {
                expect(table.length).toBeGreaterThan(0)
                for (const item of table) {
                    expect(item.id.length).toBeGreaterThan(0)
                    // CMP-30：可见文案改为 labelKey（可解析到中英文），英文工具名保留 label
                    expect(displayText(item).length).toBeGreaterThan(0)
                    if (item.labelKey) {
                        expect(translate(item.labelKey, 'en-US')).not.toBe(item.labelKey)
                    } else {
                        expect(item.label).not.toMatch(/[\u4e00-\u9fff]/)
                    }
                    // 2026-11-19 重构：渲染层菜单项不得再携带 url 死数据
                    // （URL 单一真源在 shared/constants/urls.ts，由主进程命中）
                    expect('url' in item).toBe(false)
                }
            })

            it(`${name} should keep ids unique`, () => {
                const ids = table.map((item) => item.id)
                expect(new Set(ids).size).toBe(ids.length)
            })
        }
    })

    it('OnlineUrlMaps should merge all nine url maps', () => {
        const total = urlMaps.reduce((sum, { table }) => sum + table.length, 0)
        expect(OnlineUrlMaps.length).toBe(total)
        expect(OnlineUrlMaps.length).toBe(50)
    })

    it('OnlineUrlMaps should keep merged ids unique', () => {
        const ids = OnlineUrlMaps.map((item) => item.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it('should sample key online tools', () => {
        const byId = (id: string) => OnlineUrlMaps.find((item) => item.id === id)
        // URL 字段已删除（真源在 shared/constants/urls.ts、主进程 menu-tools.ts 消费），
        // 渲染层菜单只保留 id + labelKey；此处锁死代表性条目的 id 与 i18n 键。
        expect(byId('baize:menu:online:tools:cainiao-tools')?.labelKey).toBe(
            'menu.online.tools.cainiaoTools'
        )
        expect(byId('baize:menu:online:cainiao:svg-editor')?.labelKey).toBe(
            'menu.online.cainiao.svgEditor'
        )
        expect(byId('baize:menu:online:cloud:aliyun')?.labelKey).toBe('menu.online.cloud.aliyun')
        // 中文工具名经 labelKey 还原为原文案；英文工具名原样展示
        expect(displayText(byId('baize:menu:online:tools:cainiao-tools')!)).toBe('菜鸟工具')
        expect(displayText(byId('baize:menu:online:tools:toolfk')!)).toBe('ToolFK')
    })

    describe('plugin menu maps', () => {
        for (const { name, table } of pluginMenuMaps) {
            it(`${name} should keep fields complete`, () => {
                for (const item of table) {
                    expect(displayText(item).length).toBeGreaterThan(0)
                    expect(item.menuAction).toMatch(/^baize:menu:plugins:/)
                    if (item.labelKey) {
                        expect(translate(item.labelKey, 'en-US')).not.toBe(item.labelKey)
                    } else {
                        expect(item.label).not.toMatch(/[\u4e00-\u9fff]/)
                    }
                }
            })

            it(`${name} should keep menuAction values unique`, () => {
                const actions = table.map((item) => item.menuAction)
                expect(new Set(actions).size).toBe(actions.length)
            })
        }

        it('should declare the expected entry counts per map', () => {
            // A-4/ARC-09：无注册组件的插件菜单项已从渲染中隐藏；
            // CMP-29：原以注释形式滞留的未实现条目已清理并归档至
            // out/tool-results/r2-completeness-changes.md，因此仅统计仍展示的条目。
            // 1.3.5：jyshare 常用工具集成补齐 codec/convert/format/net(text)/misc/text 组。
            expect(PluginGeneratorMaps).toHaveLength(8)
            expect(PluginCodeConvertMaps).toHaveLength(5)
            expect(PluginFormatMaps).toHaveLength(2)
            expect(PluginConvertMaps).toHaveLength(5)
            expect(PluginUpLowerMaps).toHaveLength(0)
            expect(PluginNetAddrs).toHaveLength(1)
            expect(PluginNetGenerators).toHaveLength(1)
            expect(PluginNetWork).toHaveLength(0)
            expect(PluginInfoNormal).toHaveLength(4)
            expect(PluginInfoScience).toHaveLength(2)
            expect(PluginInfoCmd).toHaveLength(0)
            expect(PluginCodeDef).toHaveLength(0)
            expect(PluginMiscToolsMaps).toHaveLength(3)
            expect(PluginTextToolsMaps).toHaveLength(3)
        })

        it('should sample key menu entries', () => {
            // FE-28：Token Generator 原为硬编码英文 label，现经 menu 命名空间词典
            // 输出中文「令牌生成器」（英文界面仍为 Token Generator，见下条用例）。
            expect(resolved(PluginGeneratorMaps[0])).toEqual({
                label: '令牌生成器',
                menuAction: 'baize:menu:plugins:encrypt:token-generator'
            })
            expect(resolved(PluginNetAddrs[0])).toEqual({
                label: 'IPv4子网计算器',
                menuAction: 'baize:menu:plugins:net:ipv4-subnet-calculator'
            })
            expect(resolvedListSample(PluginInfoScience)).toContainEqual({
                label: '数学符号对照表',
                menuAction: 'baize:menu:plugins:info:math-symbol-table'
            })
        })

        it('should keep menuAction values unique across all plugin maps', () => {
            const allActions = pluginMenuMaps.flatMap(({ table }) =>
                table.map((item) => item.menuAction)
            )
            expect(new Set(allActions).size).toBe(allActions.length)
        })

        it('should translate plugin labels to English', () => {
            expect(displayText(PluginNetAddrs[0], 'en-US')).toBe('IPv4 Subnet Calculator')
            expect(displayText(PluginInfoNormal[0], 'en-US')).toBe('ASCII Table')
            // 英文插件名不翻译（词典英文值即原品牌/功能名）
            expect(displayText(PluginGeneratorMaps[0], 'en-US')).toBe('Token Generator')
        })
    })

    // FE-28：此前硬编码的菜单 label 全部改走 menu 命名空间 labelKey，
    // 中英词典可解析；品牌名保留原文（中英同文）。
    describe('FE-28 i18n 硬编码标签收口', () => {
        it('Token Generator / Hash Text 中英均可解析', () => {
            expect(PluginGeneratorMaps[0].labelKey).toBe('menu.plugins.encrypt.tokenGenerator')
            expect(displayText(PluginGeneratorMaps[0], 'zh-CN')).toBe('令牌生成器')
            expect(displayText(PluginGeneratorMaps[0], 'en-US')).toBe('Token Generator')
            expect(PluginGeneratorMaps[1].labelKey).toBe('menu.plugins.encrypt.hashText')
            expect(displayText(PluginGeneratorMaps[1], 'zh-CN')).toBe('哈希文本')
            expect(displayText(PluginGeneratorMaps[1], 'en-US')).toBe('Hash Text')
        })

        it('ToolFK / Linux Crontab 改走 labelKey（ToolFK 品牌名中英同文）', () => {
            const byId = (id: string) => OnlineUrlMaps.find((item) => item.id === id)!
            expect(byId('baize:menu:online:tools:toolfk').labelKey).toBe('menu.online.tools.toolfk')
            expect(displayText(byId('baize:menu:online:tools:toolfk'), 'zh-CN')).toBe('ToolFK')
            expect(displayText(byId('baize:menu:online:tools:toolfk'), 'en-US')).toBe('ToolFK')
            expect(byId('baize:menu:online:dev:linux-crontab').labelKey).toBe(
                'menu.online.dev.linuxCrontab'
            )
            expect(displayText(byId('baize:menu:online:dev:linux-crontab'), 'zh-CN')).toBe(
                'Linux 定时任务'
            )
            expect(displayText(byId('baize:menu:online:dev:linux-crontab'), 'en-US')).toBe(
                'Linux Crontab'
            )
        })

        it('保留原文的品牌名仍只使用 label 且不含中文', () => {
            const byId = (id: string): MenuLabelLike =>
                OnlineUrlMaps.find((item) => item.id === id)!
            for (const id of [
                'baize:menu:online:ide:webide-online',
                'baize:menu:online:team:thx-alimama-fe'
            ]) {
                const item = byId(id)
                expect(item.labelKey).toBeUndefined()
                expect(item.label).not.toMatch(/[\u4e00-\u9fff]/)
            }
        })
    })
})

function resolvedListSample(
    table: Array<MenuLabelLike & { menuAction: string }>
): Array<Record<string, unknown>> {
    return table.map((item) => resolved(item))
}
