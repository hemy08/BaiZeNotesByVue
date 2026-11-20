/**
 * CMP-30 P4：i18n 词典质量门禁单测
 *
 * 把原一次性审计脚本（out/tool-results/i18n-audit/）的核心校验固化为可重复执行的用例：
 * 1. 递归校验 12 个命名空间（含 P1 新增的 themeNames；P2 已删除仅服务不可达
 *    主进程编辑器设置对话框的 editorSettings 命名空间）zh-CN / en-US 叶子键集合完全一致；
 * 2. en-US 词条不含中日韩汉字（品牌「白泽」、语言自名等少量白名单）；
 * 3. 全仓静态 t('...') / tMain('...') 引用键在两语言词典均可解析（模板拼接等动态键自然跳过）；
 * 4. 中英占位符 {xxx} 集合一致，防止翻译丢参数；
 * 5. themeNames 主题 key 与主题配置数据（theme-config / theme-registry）一一对应、中英可解析，
 *    且中文词典值与主题数据原中文字段逐字一致（保证中文界面零变化）；
 * 6. P2 新增：词典无空值/纯空白值；语言目录与命名空间文件、MESSAGES 命名空间三方一一对应
 *    （防止新增语言目录漏接入或词典文件漏 merge）。
 *
 * 本用例只读源码与词典文件，不启动主进程 / 渲染层，不依赖运行中的 app，可稳定在 CI 复跑。
 *
 * ET-19 说明：本文件有 3 处 `readFileSync(src)`，均属于「静态引用/主题数据 ↔ 词典」的
 * 架构护栏，行为化改造成本高且会失去覆盖面，保留并说明：
 * - collectStaticRefs()：需要扫描全仓 t()/tMain() 调用点（含 .vue 模板），只能源码级扫描；
 * - themeNames 一致性：theme-config.ts / theme-registry.ts 依赖 electron-store 等运行时依赖，
 *   在 node 环境下直接 import 会拉起主进程依赖链，故按源码解析 nameKey/descKey 字面量。
 * 解析只针对固定 struct 字段（nameKey/descKey/name/description），对格式微调有一定容忍度。
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MESSAGES, SUPPORTED_LOCALES } from '../../src/shared/i18n'

const ROOT = resolve(__dirname, '../..')
const SRC_DIR = join(ROOT, 'src')
const MESSAGES_DIR = join(SRC_DIR, 'shared/i18n/messages')
const THEME_CONFIG_FILE = join(SRC_DIR, 'main/config/theme-config.ts')
const THEME_REGISTRY_FILE = join(SRC_DIR, 'main/config/theme-registry.ts')

/** 递归展开词典：点分叶子键 → 字符串值 */
type Dict = { [key: string]: string | Dict }

function flatten(node: Dict, prefix = '', acc = new Map<string, string>()): Map<string, string> {
    for (const [key, value] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${key}` : key
        if (typeof value === 'string') {
            acc.set(path, value)
        } else {
            flatten(value, path, acc)
        }
    }
    return acc
}

function flattenLocale(locale: 'zh-CN' | 'en-US'): Map<string, string> {
    const dict = MESSAGES[locale] as unknown as Dict
    const acc = new Map<string, string>()
    for (const [namespace, node] of Object.entries(dict)) {
        flatten(node as Dict, namespace, acc)
    }
    return acc
}

/** 递归收集源码目录下的 ts / vue / js 文件 */
function walkSourceFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name === '.git') continue
            walkSourceFiles(full, out)
        } else if (/\.(ts|vue|js)$/.test(entry.name)) {
            out.push(full)
        }
    }
    return out
}

/**
 * 收集静态 i18n 引用键。
 * - 只匹配 `t('ns.key')` / `tMain("ns.key")` 这类首个实参为字符串字面量的调用；
 * - 模板字符串 / 变量拼接等动态键不会命中，按约定跳过；
 * - 先剥离块注释，避免 JSDoc 中的示例键（如 dialogMain.xxx.yyy）被误判。
 */
function collectStaticRefs(): Map<string, string[]> {
    const refs = new Map<string, string[]>()
    const callPattern = /\bt(?:Main)?\(\s*(['"])([^'"\n]+)\1\s*[,)]/g
    for (const file of walkSourceFiles(SRC_DIR)) {
        const source = readFileSync(file, 'utf-8').replace(/\/\*[\s\S]*?\*\//g, '')
        for (const match of source.matchAll(callPattern)) {
            const key = match[2]
            const owners = refs.get(key) ?? []
            owners.push(file)
            refs.set(key, owners)
        }
    }
    return refs
}

function extractPlaceholders(text: string): string {
    return [...text.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1])
        .sort()
        .join(',')
}

const zhMap = flattenLocale('zh-CN')
const enMap = flattenLocale('en-US')

/** 允许 en-US 保留中文的白名单（品牌名 / 语言自名 / 技术名词音译解释），与审计报告 §2.2 一致 */
const EN_CJK_WHITELIST = new Set([
    'dialogRenderer.techStack.intro',
    'toolsNetwork.tools.latexEditor.introPronounce',
    'settings.language.zhCN'
])

const CJK_PATTERN = /[\u3400-\u4dbf\u4e00-\u9fff]/

describe('CMP-30 词典质量门禁', () => {
    it('12 个命名空间的 zh-CN / en-US 叶子键集合完全一致（含 themeNames）', () => {
        const zhNamespaces = Object.keys(MESSAGES['zh-CN']).sort()
        const enNamespaces = Object.keys(MESSAGES['en-US']).sort()

        expect(enNamespaces).toEqual(zhNamespaces)
        expect(zhNamespaces).toHaveLength(12)
        expect(zhNamespaces).toContain('themeNames')

        // 逐命名空间比对叶子键：既能发现「一边多键」，也能发现「同键在一边是字符串、另一边是对象」的结构冲突
        const zhDict = MESSAGES['zh-CN'] as unknown as Dict
        const enDict = MESSAGES['en-US'] as unknown as Dict
        const diffs: string[] = []
        for (const namespace of zhNamespaces) {
            const zhKeys = [...flatten(zhDict[namespace] as Dict, namespace).keys()]
            const enKeys = [...flatten(enDict[namespace] as Dict, namespace).keys()]
            const enKeySet = new Set(enKeys)
            const zhKeySet = new Set(zhKeys)
            const onlyZh = zhKeys.filter((key) => !enKeySet.has(key))
            const onlyEn = enKeys.filter((key) => !zhKeySet.has(key))
            if (onlyZh.length > 0 || onlyEn.length > 0) {
                diffs.push(
                    `${namespace}: onlyZh=[${onlyZh.join(', ')}], onlyEn=[${onlyEn.join(', ')}]`
                )
            }
        }
        expect(diffs).toEqual([])

        // P1 收尾：应用主题 28 个 × name/description + Monaco 3 个 × 2 + 动态描述模板 = 63 个叶子键
        const themeNameKeys = [...zhMap.keys()].filter((key) => key.startsWith('themeNames.'))
        expect(themeNameKeys).toHaveLength(63)
        expect(enMap.size).toBe(zhMap.size)
    })

    it('语言目录、词典文件与 MESSAGES 命名空间三方一一对应', () => {
        // 实际存在的语言目录（唯一真源：messages/ 下的子目录）
        const localeDirs = readdirSync(MESSAGES_DIR, { withFileTypes: true })
            .filter((entry) => entry.isDirectory())
            .map((entry) => entry.name)
            .sort()
        expect(localeDirs).toEqual([...SUPPORTED_LOCALES].sort())
        expect(localeDirs).toEqual(Object.keys(MESSAGES).sort())

        const expectedNamespaces = Object.keys(MESSAGES['zh-CN']).sort()
        expect(expectedNamespaces).toHaveLength(12)
        for (const locale of localeDirs) {
            const files = readdirSync(join(MESSAGES_DIR, locale))
                .filter((name) => name.endsWith('.ts'))
                // P1-3：index.ts 为语言聚合入口（动态 import 的按语言拆包单元），
                // 不计入命名空间文件；其覆盖性由下一条用例单独守护。
                .map((name) => name.replace(/\.ts$/, ''))
                .filter((name) => name !== 'index')
                .sort()
            // 每个语言目录必须与 MESSAGES 的命名空间集合完全一致（漏文件会在 index.ts 中 import 报错前先被拦下）
            expect(files, `${locale} 词典文件`).toEqual(expectedNamespaces)
        }
    })

    it('语言聚合入口 index.ts 覆盖全部命名空间文件；词典动态 import 只在渲染层（P1-3 首屏拆包回归防线）', () => {
        const namespaces = Object.keys(MESSAGES['zh-CN']).sort()
        for (const locale of SUPPORTED_LOCALES) {
            const indexPath = join(MESSAGES_DIR, locale, 'index.ts')
            const source = readFileSync(indexPath, 'utf-8')
            // 聚合入口必须 import 本语言目录下每个命名空间文件，并挂到同名 key 上
            for (const namespace of namespaces) {
                expect(source, `${locale}/index.ts 缺少 import`).toMatch(
                    new RegExp(`import ${namespace} from '\\./${namespace}'`)
                )
            }
            // default 导出必须包含全部命名空间键（防止 import 了但忘记 merge）
            const exported =
                /\bconst messages: MessageNode = \{([\s\S]*?)\n\}/.exec(source)?.[1] ?? ''
            for (const namespace of namespaces) {
                expect(exported, `${locale}/index.ts 未 merge ${namespace}`).toMatch(
                    new RegExp(`\\b${namespace}\\b`)
                )
            }
        }

        // shared/i18n/index.ts 不得以任何形式（静态 import / 动态 import）引用词典文件：
        // 它被 main/renderer 共同依赖，一旦引用就会把双语词典重新拉回首屏共享 chunk。
        const sharedIndexSource = readFileSync(join(SRC_DIR, 'shared/i18n/index.ts'), 'utf-8')
        expect(sharedIndexSource).not.toMatch(/from '\.\/messages\//)
        expect(sharedIndexSource).not.toMatch(/import\('\.\/messages\//)

        // 词典动态 import 只允许出现在渲染层 i18n 门面（Vite 据此按语言拆 chunk）；
        // 首屏 initI18n 仅 await 当前语言，另一语言切换时按需加载。
        const rendererSource = readFileSync(join(SRC_DIR, 'renderer/src/common/i18n.ts'), 'utf-8')
        for (const locale of SUPPORTED_LOCALES) {
            expect(rendererSource, `渲染层未注册 ${locale} 动态加载器`).toContain(
                `import('../../../shared/i18n/messages/${locale}')`
            )
        }
        expect(rendererSource).toMatch(/registerLocaleLoader\('zh-CN'/)
        expect(rendererSource).toMatch(/registerLocaleLoader\('en-US'/)
    })

    it('词典无空值/纯空白值（中英全部叶子键）', () => {
        const empties: string[] = []
        for (const locale of Object.keys(MESSAGES)) {
            const map = flattenLocale(locale as 'zh-CN' | 'en-US')
            for (const [key, value] of map) {
                if (value.trim() === '') empties.push(`${locale}:${key}`)
            }
        }
        expect(empties).toEqual([])
    })

    it('en-US 词条不含中日韩汉字（白名单除外，且白名单必须真实存在）', () => {
        const hits = [...enMap.entries()]
            .filter(([key, value]) => CJK_PATTERN.test(value) && !EN_CJK_WHITELIST.has(key))
            .map(([key, value]) => `${key} = ${value}`)

        expect(hits).toEqual([])

        // 白名单自身若被改名/删除，本用例会提醒同步维护，避免白名单悄悄失效
        for (const key of EN_CJK_WHITELIST) {
            expect(enMap.has(key), `白名单键不存在: ${key}`).toBe(true)
        }
    })

    it('中英同键占位符 {xxx} 集合一致', () => {
        const diffs: string[] = []
        for (const [key, zhValue] of zhMap) {
            const enValue = enMap.get(key)
            if (enValue === undefined) continue
            const zhPlaceholders = extractPlaceholders(zhValue)
            const enPlaceholders = extractPlaceholders(enValue)
            if (zhPlaceholders !== enPlaceholders) {
                diffs.push(`${key}: {${zhPlaceholders}} != {${enPlaceholders}}`)
            }
        }
        expect(diffs).toEqual([])
    })

    it('全仓静态 t() / tMain() 引用键在中英词典均可解析且形态合法', () => {
        const refs = collectStaticRefs()
        // 防回归：扫描到足够多的静态引用，避免正则/遍历失效后用例空跑通过。
        // P2 死代码清理删除了主进程编辑器设置对话框等大量 tMain 调用点后，
        // 唯一静态键数由 1000+ 降至约 660，阈值按实际值下调。
        expect(refs.size).toBeGreaterThan(500)

        const keyShape = /^[A-Za-z][A-Za-z0-9_-]*\.[A-Za-z0-9_.-]+$/
        const badShape: string[] = []
        const missingZh: string[] = []
        const missingEn: string[] = []

        for (const key of refs.keys()) {
            if (!keyShape.test(key)) {
                badShape.push(`${key} @ ${refs.get(key)?.[0] ?? '?'}`)
                continue
            }
            if (!zhMap.has(key)) missingZh.push(key)
            if (!enMap.has(key)) missingEn.push(key)
        }

        expect(badShape).toEqual([])
        expect(missingZh).toEqual([])
        expect(missingEn).toEqual([])
    })

    it('themeNames 与主题配置数据中的 key 一一对应且中英可解析', () => {
        const configSource = readFileSync(THEME_CONFIG_FILE, 'utf-8')
        const registrySource = readFileSync(THEME_REGISTRY_FILE, 'utf-8')

        // 应用主题：28 个 nameKey + 28 个 descKey，且名称/描述成对
        const appNameKeys = [
            ...configSource.matchAll(/nameKey: '(themeNames\.app\.[A-Za-z0-9_-]+\.name)'/g)
        ].map((match) => match[1])
        const appDescKeys = [
            ...configSource.matchAll(/descKey: '(themeNames\.app\.[A-Za-z0-9_-]+\.description)'/g)
        ].map((match) => match[1])
        expect(appNameKeys).toHaveLength(28)
        expect(appDescKeys).toHaveLength(28)
        expect(appDescKeys.map((key) => key.replace(/\.description$/, '.name'))).toEqual(
            appNameKeys
        )

        // Monaco：3 个内置主题的 name/desc + 磁盘动态主题描述模板
        const monacoKeys = [
            ...new Set(
                [...registrySource.matchAll(/'(themeNames\.monaco\.[A-Za-z0-9_.-]+)'/g)].map(
                    (match) => match[1]
                )
            )
        ]
        expect(monacoKeys).toHaveLength(7)
        expect(monacoKeys).toContain('themeNames.monaco.dynamicDescription')

        const dataKeys = [...appNameKeys, ...appDescKeys, ...monacoKeys]
        expect(new Set(dataKeys).size).toBe(63)
        expect(dataKeys.filter((key) => !zhMap.has(key))).toEqual([])
        expect(dataKeys.filter((key) => !enMap.has(key))).toEqual([])

        // 中文界面零变化：主题数据中的原中文字段必须与 zh-CN 词典逐字一致（回退字段 == 词典值）
        const configBlocks = [
            ...configSource.matchAll(
                /^ {4}(?:'([\w-]+)'|([\w-]+)): \{\r?\n {8}name: '([^']*)',\r?\n {8}nameKey: 'themeNames\.app\.([\w-]+)\.name',\r?\n {8}description: '([^']*)',\r?\n {8}descKey: 'themeNames\.app\.([\w-]+)\.description',/gm
            )
        ]
        expect(configBlocks).toHaveLength(28)
        const zhValueDiffs: string[] = []
        for (const block of configBlocks) {
            const id = block[1] ?? block[2]
            const [, , , name, nameId, description, descId] = block
            if (nameId !== id) zhValueDiffs.push(`${id}: nameKey 指向 ${nameId}`)
            if (descId !== id) zhValueDiffs.push(`${id}: descKey 指向 ${descId}`)
            if (zhMap.get(`themeNames.app.${id}.name`) !== name)
                zhValueDiffs.push(`${id}.name 词典值与主题数据不一致`)
            if (zhMap.get(`themeNames.app.${id}.description`) !== description) {
                zhValueDiffs.push(`${id}.description 词典值与主题数据不一致`)
            }
        }
        expect(zhValueDiffs).toEqual([])

        // Monaco 内置主题：中文描述与原数据一致；动态主题保留「{name} 主题」模板与原文回退
        const monacoZhDescriptions: Record<string, string> = {
            vs: 'Visual Studio 浅色主题',
            'vs-dark': 'Visual Studio 深色主题',
            'hc-black': '高对比度主题'
        }
        for (const [id, description] of Object.entries(monacoZhDescriptions)) {
            expect(zhMap.get(`themeNames.monaco.${id}.description`)).toBe(description)
            expect(registrySource).toContain(`'${description}'`)
            expect(registrySource).toContain(`nameKey: 'themeNames.monaco.${id}.name'`)
        }
        expect(zhMap.get('themeNames.monaco.dynamicDescription')).toBe('{name} 主题')
        expect(registrySource).toContain("description: themeName + ' 主题'")

        // 反向校验：词典内的主题 key 不允许存在未被主题数据引用的孤儿键
        const dictThemeKeys = [...zhMap.keys()].filter(
            (key) => key.startsWith('themeNames.app.') || key.startsWith('themeNames.monaco.')
        )
        const dataKeySet = new Set(dataKeys)
        expect(dictThemeKeys.filter((key) => !dataKeySet.has(key))).toEqual([])
    })
})
