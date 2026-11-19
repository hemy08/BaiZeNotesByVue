/**
 * URL 常量单一真源单元测试
 * 覆盖：src/shared/constants/urls.ts（唯一真源）与 src/main/constants/urls.ts（re-export 门面）
 * 断言：真源常量非空、协议格式合法（http/https）、模块内无重复值、完整键集合、
 * 关键 URL 抽样值，以及 main 门面与真源「导出表面 + 值」完全一致。
 *
 * 背景：2026-11-19 重构前 main/shared 各存一份逐字相同的 52 个常量（仅注释/顺序不同），
 * 旧测试用「两份键集合相同 + 同名值一致」把重复副本锁死。真源收敛后本测试改为：
 *   - 对唯一真源做完整键集合 + 值断言（唯一锁死点）；
 *   - 对 main 门面只断言「与真源全等」（防止再次长出第二份副本）。
 */
import { describe, it, expect } from 'vitest'
import * as mainUrls from '../../src/main/constants/urls'
import * as sharedUrls from '../../src/shared/constants/urls'

// 收集模块导出的全部字符串常量
function collectUrlConstants(mod: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(mod)) {
        if (typeof value === 'string') {
            result[key] = value
        }
    }
    return result
}

const sharedConstants = collectUrlConstants(sharedUrls)
const mainConstants = collectUrlConstants(mainUrls)

/**
 * 真源模块的完整键集合（52 个常量）。
 * 新增/删除 URL 常量时必须同步更新本清单：键集合全量锁死可防止误删常量
 * （主进程菜单动作会指向不存在的链接）或在其它模块复制出第二份副本。
 */
const EXPECTED_URL_KEYS = [
    // 在线工具
    'TOOLS_JYSHARE',
    'TOOLS_W3CSCHOOL',
    'TOOLS_TOOLNB',
    'TOOLS_TOOLFK',
    'TOOLS_BEJSON',
    'TOOLS_67TOOL',
    'TOOLS_TOOLLU',
    'TOOLS_SOJSON',
    'TOOLS_LATEX',
    'TOOLS_MERMAID_LIVE',
    'TOOLS_PLANTTEXT',
    'TOOLS_MINDMAP',
    'TOOLS_DIAGRAMS',
    'TOOLS_PLANTUML',
    'TOOLS_TOOLSHI',
    // 菜鸟（jyshare）在线工具
    'CAINIAO_SVG_EDITOR',
    'CAINIAO_DRAW',
    'CAINIAO_OFFICE',
    'CAINIAO_TABLE',
    // 编解码工具
    'ENCODE_CSV_TO_HTML',
    'ENCODE_SQL_FORMATTER',
    'ENCODE_FULLWIDTH_HALFWIDTH',
    'ENCODE_QRCODE_GENERATOR',
    'ENCODE_QRCODE_DECODER',
    'ENCODE_CONVERTER',
    // 在线 IDE
    'IDE_CODEPEN',
    'IDE_CODEPEN_PEN',
    'IDE_PYTHON',
    'IDE_C',
    'IDE_GO',
    // 开发者工具
    'DEV_QRCODEDESIGNER',
    'DEV_IMG_CONVERT',
    'DEV_CRONTAB',
    'DEV_JWT',
    // 国内前端团队
    'TEAM_TAOBAO_FED',
    'TEAM_TMALL_FE',
    'TEAM_THX',
    'TEAM_ALIYUN_NODEJS',
    'TEAM_BAIDU_FEX',
    // 云计算平台
    'CLOUD_ALIYUN',
    'CLOUD_TENCENT',
    'CLOUD_HUAWEI',
    'CLOUD_CTYUN',
    'CLOUD_KSYUN',
    // GitHub 开源项目
    'GITHUB_IT_TOOLS',
    'GITHUB_GHOST',
    'GITHUB_PRIOSPACE',
    'GITHUB_PLANE',
    'GITHUB_OPENPROJECT',
    // 默认快速链接
    'DEFAULT_GITHUB',
    'DEFAULT_GOOGLE',
    'DEFAULT_STACKOVERFLOW'
].sort()

describe('shared/constants/urls（URL 单一真源）', () => {
    it('should export exactly the expected constant key set', () => {
        expect(Object.keys(sharedConstants).sort()).toEqual(EXPECTED_URL_KEYS)
    })

    it('should export non-empty valid URLs without duplicates', () => {
        const seen = new Set<string>()
        expect(Object.keys(sharedConstants).length).toBeGreaterThan(0)
        for (const [name, url] of Object.entries(sharedConstants)) {
            expect(url, `${name} 不应为空字符串`).not.toBe('')
            expect(
                url.startsWith('https://') || url.startsWith('http://'),
                `${name} 协议格式不合法: ${url}`
            ).toBe(true)
            expect(seen.has(url), `真源模块存在重复 URL: ${url}`).toBe(false)
            seen.add(url)
        }
    })

    it('should contain the three default quick links', () => {
        expect(sharedUrls.DEFAULT_GITHUB).toBe('https://github.com')
        expect(sharedUrls.DEFAULT_GOOGLE).toBe('https://google.com')
        expect(sharedUrls.DEFAULT_STACKOVERFLOW).toBe('https://stackoverflow.com')
    })

    it('should keep representative tool URLs', () => {
        // 抽样锁定主进程 menu-tools.ts 高频命中的 URL，防止值被意外改动
        expect(sharedUrls.TOOLS_JYSHARE).toBe('https://www.jyshare.com/')
        expect(sharedUrls.TOOLS_MERMAID_LIVE).toBe('https://mermaid.live/')
        expect(sharedUrls.TOOLS_67TOOL).toBe('http://www.67tool.com/')
        expect(sharedUrls.ENCODE_QRCODE_GENERATOR).toBe('https://cli.im/')
        expect(sharedUrls.DEV_CRONTAB).toBe('https://tool.box3.cn/crontab.html')
        expect(sharedUrls.GITHUB_PLANE).toBe('https://github.com/makeplane/plane')
    })
})

describe('main/constants/urls（re-export 门面）', () => {
    it('should re-export every constant from the single source unchanged', () => {
        // main 模块只允许做 `export *`，不得再持有本地常量副本：
        // 导出键集合与全部值必须和真源完全一致。
        expect(Object.keys(mainConstants).sort()).toEqual(Object.keys(sharedConstants).sort())
        expect(mainConstants).toEqual(sharedConstants)
    })

    it('should expose exactly the truth source key set', () => {
        expect(Object.keys(mainConstants).sort()).toEqual(EXPECTED_URL_KEYS)
    })

    it('should keep representative values identical to the single source', () => {
        // 主进程 menu-tools.ts 经此门面引用常量，抽样断言门面取到的值与真源一致
        expect(mainUrls.TOOLS_JYSHARE).toBe(sharedUrls.TOOLS_JYSHARE)
        expect(mainUrls.CAINIAO_SVG_EDITOR).toBe(sharedUrls.CAINIAO_SVG_EDITOR)
        expect(mainUrls.IDE_PYTHON).toBe(sharedUrls.IDE_PYTHON)
        expect(mainUrls.CLOUD_ALIYUN).toBe(sharedUrls.CLOUD_ALIYUN)
        expect(mainUrls.GITHUB_IT_TOOLS).toBe(sharedUrls.GITHUB_IT_TOOLS)
        expect(mainUrls.DEFAULT_STACKOVERFLOW).toBe(sharedUrls.DEFAULT_STACKOVERFLOW)
    })
})
