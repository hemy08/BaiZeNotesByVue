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
    OnlineUrlMaps
} from '../../src/renderer/src/components/MenuBar/menu-consts'

// M3（结构优化收尾）：menu-consts.ts 原有 14 张 Plugin*Maps 插件菜单映射表已删除，
// 38 项插件菜单统一由 shared/constants/plugin-tools-manifest.ts 生成；插件菜单 ↔ 懒加载
// 注册表 ↔ i18n 的一致性断言见 tests/unit/plugin_tools_manifest.test.ts。
// 本文件只保留「在线工具映射表」与通道常量的结构断言。

// CMP-30：菜单常量数据只存 labelKey（menu 命名空间），渲染时由 MenuBar.vue 调 t(labelKey) 输出；
// 纯英文工具名保持原样 label。测试辅助：还原「渲染后文本」。
interface MenuLabelLike {
    label?: string
    labelKey?: string
}

function displayText(item: MenuLabelLike, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
    return item.labelKey ? translate(item.labelKey, locale) : (item.label ?? '')
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

    // FE-28：此前硬编码的菜单 label 全部改走 menu 命名空间 labelKey，
    // 中英词典可解析；品牌名保留原文（中英同文）。
    describe('FE-28 i18n 硬编码标签收口', () => {
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
