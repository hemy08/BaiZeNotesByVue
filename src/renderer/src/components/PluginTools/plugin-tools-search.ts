/**
 * 插件工具可发现性纯逻辑（1.5.6 批次 B / REQ-04 搜索 + REQ-05 最近使用/收藏）
 * 1.5.6 批次 A 增补：REQ-06 分类分组 + 折叠状态持久化、每工具图标接线（图标数据见
 * plugin-tools-icons.ts），保持本文件「纯函数 + 注入存储」的既有边界。
 *
 * 设计约束（与开发规范对齐）：
 * - PLUGIN-08：算法/数据逻辑抽成本目录 `*-lib` 风格的纯函数模块，不依赖 Vue/DOM/localStorage，
 *   组件（PluginTools.vue）只做接线；存储通过 `PluginToolsStorageLike` 显式注入，测试用内存替身。
 * - PLUGIN-01/03：工具清单唯一真源仍是 shared/constants/plugin-tools-manifest.ts，
 *   本文件只从 manifest 派生「检索元数据」（名称 i18n key / 分类路径 / 额外关键词 / 图标），
 *   不复制 38 项 id 清单；新增工具只要改 manifest 即自动进入搜索（关键词缺失时按 id 兜底）。
 * - I18N-07/08：名称与分类只存 i18n key，翻译在渲染期经 `translate` 注入解析，不缓存翻译结果。
 * - 无 IPC / 无配置文件：最近使用与收藏只落本机 localStorage（键见下方常量），
 *   读取容错（JSON 损坏/非法值→空数组），写入失败静默降级为「本次会话内存生效」。
 * - PLUGIN-11：本文件是 .ts 而非 .vue，不触发「PluginTools 下每个 .vue 必须登记 manifest」的约束。
 */
import {
    PLUGIN_TOOL_ACTION_PREFIX,
    PLUGIN_TOOL_MENU,
    getPluginToolGroupLabelKey,
    getPluginToolMenuAction
} from '../../../../shared/constants/plugin-tools-manifest'
import type { PluginToolMenuNode } from '../../../../shared/constants/plugin-tools-manifest'
import { PLUGIN_TOOL_ITEM_ICON_PATHS } from './plugin-tools-icons'

// ==================== 存储契约（localStorage 键 / 容量上限） ====================

/** 最近使用工具（≤20，去重置顶）的本机存储键 */
export const PLUGIN_TOOLS_RECENT_STORAGE_KEY = 'baize:plugin-tools:recent'

/** 收藏工具（≤10）的本机存储键 */
export const PLUGIN_TOOLS_FAVORITES_STORAGE_KEY = 'baize:plugin-tools:favorites'

/**
 * 分类折叠状态的本机存储键（1.5.6 REQ-06）：
 * 值为「已折叠的分类 id 数组」（如 `["encrypt","net"]`），未出现的分类 = 展开。
 * 与最近使用/收藏一致：只落本机 localStorage、无 IPC / 无配置文件，读取容错。
 */
export const PLUGIN_TOOLS_COLLAPSED_GROUPS_STORAGE_KEY = 'baize:plugin-tools:collapsed-groups'

/**
 * 最近使用上限（1.5.6：需求「空白查询展示最近使用的 20 个插件」→ 5 调整为 20）。
 * 与收藏上限 10 的关系：最近使用是「按打开顺序自动维护的浏览历史」，容量按需求取 20；
 * 收藏是「用户显式标记的常用清单」，容量保持 10（避免两分区无限膨胀、且不给用户
 * 制造「收藏越多越难找」的长列表）。两者分别由 recordRecentPluginToolId /
 * toggleFavoritePluginToolId 的 limit 参数约束，互不影响。
 */
export const PLUGIN_TOOLS_RECENT_LIMIT = 20

/** 收藏上限（需求允许「不限或上限 10」，取上限 10 防止分区无限膨胀） */
export const PLUGIN_TOOLS_FAVORITES_LIMIT = 10

/**
 * 最小存储接口（`window.localStorage` 结构兼容）。
 * 用注入而非直接读全局，保证纯逻辑可在 node/jsdom 单测中用内存替身复跑。
 */
export interface PluginToolsStorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

/** 收藏切换结果：`rejected=true` 表示已达上限未新增（调用方可提示用户） */
export interface PluginToolFavoriteToggleResult {
    readonly ids: readonly string[]
    readonly added: boolean
    readonly rejected: boolean
}

// ==================== 检索元数据（由 manifest 派生 + 额外关键词表） ====================

/**
 * 38 项工具的额外检索关键词（中英双语，可含常见缩写/别名）。
 * 键为 manifest 的短 id（`<section>:<tool>`）；只补「名称与分类名之外」的检索词，
 * 名称/分类本身经 i18n 参与搜索，无需在此重复。
 */
const PLUGIN_TOOL_KEYWORDS: Readonly<Record<string, readonly string[]>> = {
    'encrypt:token-generator': ['token', '令牌', '随机令牌', 'generator', '生成器'],
    'encrypt:hash-text': [
        'hash',
        '哈希',
        '散列',
        '摘要',
        'md5',
        'sha',
        'sha1',
        'sha256',
        'sha512',
        'digest'
    ],
    'encrypt:uuids-generator': ['uuid', 'guid', '唯一标识', '生成器', 'generator'],
    'encrypt:ulid-generator': ['ulid', '有序唯一标识', '排序', '生成器', 'generator'],
    'encrypt:encrypt-decrypt': ['aes', 'des', '对称加密', '加密', '解密', '加解密', 'encrypt'],
    'encrypt:crypto-encrypt-decrypt': [
        'crypto',
        'cryptojs',
        'aes',
        '加密',
        '解密',
        '加解密',
        'encrypt'
    ],
    'encrypt:hmac-generator': ['hmac', '签名', '消息认证码', 'signature'],
    'encrypt:rsa-generator': [
        'rsa',
        '非对称',
        '密钥对',
        '公钥',
        '私钥',
        'public key',
        'private key'
    ],
    'codec:base64-codec': ['base64', 'b64', '编码', '解码', '转换'],
    'codec:url-codec': ['url', 'urlencode', 'urldecode', '百分号编码', '网址', '编码', '解码'],
    'codec:html-codec': ['html', '实体', '转义', 'escape', 'htmlencode', 'htmldecode'],
    'codec:unicode': ['unicode', '转义', '编码', 'escape', '\\u'],
    'codec:image-base64': ['图片', 'image', 'base64', 'dataurl', 'data url', '转换'],
    'convert:color-convert': [
        '颜色',
        'color',
        'colour',
        'rgb',
        'rgba',
        'hex',
        'hsl',
        'hsv',
        'cmyk'
    ],
    'convert:unit-convert': ['单位', 'unit', '换算', '长度', '重量', '温度', '存储', '转换'],
    'convert:rmb-case': ['人民币', '金额', '大写', 'rmb', 'money', '财务', '数字大小写'],
    'convert:timestamp-convert': ['时间戳', 'timestamp', 'unix', '日期', '时间', 'date', 'time'],
    'convert:base-convert': ['进制', 'base', '二进制', '八进制', '十进制', '十六进制', 'radix'],
    'format:json-tool': ['json', '格式化', '压缩', '校验', '美化', 'format', 'minify'],
    'format:xml-format': ['xml', '格式化', '压缩', '美化', 'format', 'minify'],
    'text:chinese-text': ['中文', '简繁', '繁体', '简体', '汉字', '转换', 'chinese'],
    'text:word-count': ['字数', '统计', '字符', '单词', 'word', 'count', 'counter'],
    'text:text-diff': ['diff', '差异', '对比', '比较', '文本比较', 'compare'],
    'misc:random-generator': ['随机', 'random', '密码', '口令', '生成', 'generate', 'password'],
    'misc:calculator': ['计算器', 'calculator', '数学', '计算', '算数', '算术'],
    'misc:pdf-preview': ['pdf', '预览', '文档', 'preview', '阅读器'],
    'net:ipv4-subnet-calculator': [
        'ip',
        'ipv4',
        '子网',
        '子网掩码',
        '掩码',
        '网段',
        'subnet',
        'netmask',
        'cidr',
        '网络'
    ],
    'net:http-status-codes': ['http', '状态码', 'status', 'statuscode', '404', '500', '协议'],
    'net:subnet-mask-map-table': ['子网掩码', 'subnet', 'mask', '掩码', '对照表', 'netmask'],
    'net:regex-tester': ['正则', '正则表达式', 'regex', 'regexp', '匹配', '测试', 'pattern'],
    'info:ascii-table': ['ascii', '对照表', '字符编码', '字符', '编码'],
    'info:file-extension-table': ['扩展名', '后缀', '文件类型', 'mime', 'extension', 'file type'],
    'info:greece-letter-table': ['希腊字母', '希腊', 'greek', '字母', 'letter'],
    'info:html-entity-table': ['html', '实体', '特殊字符', 'entity', '转义字符'],
    'info:numeric-case-table': ['数字', '大小写', '单位', '金额', '金额大写', '数字大小写'],
    'info:normal-font-style-table': ['字体', 'font', '样式', 'style', 'css'],
    'info:math-symbol-table': ['数学', '符号', '公式', 'math', 'symbol', 'mathematical'],
    'info:physical-constant-table': ['物理', '常量', '符号', 'physics', 'constant', '常数']
}

/** 分区图标（24 网格线性图标 path 集合；按工具 id 的 section 段取，未知分区用兜底图标） */
export const PLUGIN_TOOL_SECTION_ICON_PATHS: Readonly<Record<string, readonly string[]>> = {
    encrypt: ['M7 10V8a5 5 0 0 1 10 0v2', 'M5 10h14v10H5z', 'M12 14v2'],
    codec: ['M9 7 4 12l5 5', 'M15 7l5 5-5 5'],
    convert: ['M4 8h13', 'M14 4l3 4-3 4', 'M20 16H7', 'M10 12l-3 4 3 4'],
    format: [
        'M8 4H6a2 2 0 0 0-2 2v3a2 2 0 0 1-2 2 2 2 0 0 1 2 2v3a2 2 0 0 0 2 2h2',
        'M16 4h2a2 2 0 0 1 2 2v3a2 2 0 0 0 2 2 2 2 0 0 0-2 2v3a2 2 0 0 1-2 2h-2'
    ],
    text: ['M5 6h14', 'M5 12h14', 'M5 18h9'],
    misc: ['M12 3l2.6 5.5 6 .9-4.3 4.2 1 6-5.3-2.9-5.3 2.9 1-6L3.4 9.4l6-.9L12 3z'],
    net: [
        'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18',
        'M3 12h18',
        'M12 3c3 3 3 15 0 18',
        'M12 3c-3 3-3 15 0 18'
    ],
    info: ['M6 4h12v16l-6-4-6 4V4z']
}

/** 未知分区（含单测桩工具 id）的兜底图标 */
export const PLUGIN_TOOL_ICON_FALLBACK_PATHS: readonly string[] = ['M12 4v16', 'M4 12h16']

/** 由工具短 id 取分区段（`<section>:<tool>` → section；无前缀时原样返回） */
export function getPluginToolSectionId(toolId: string): string {
    return toolId.split(':')[0] ?? toolId
}

/** 取分区图标 path 集合（未知分区回落兜底图标，避免列表行缺图标） */
export function getPluginToolIconPaths(sectionId: string): readonly string[] {
    return PLUGIN_TOOL_SECTION_ICON_PATHS[sectionId] ?? PLUGIN_TOOL_ICON_FALLBACK_PATHS
}

/**
 * 8 个分类（分区）id：顺序 = 分区图标表声明顺序（与 manifest 工具分组顺序一致）。
 * 用途：①「全部工具」分区分组渲染；② 折叠状态 localStorage 的合法值集合（读取时过滤旧值）。
 */
export const PLUGIN_TOOL_SECTION_IDS: readonly string[] = Object.keys(
    PLUGIN_TOOL_SECTION_ICON_PATHS
)

/**
 * 分类（分区）标题的 i18n 键：复用菜单分组词条（menu.plugins.group.*），不新增重复文案。
 * 说明：section id 由工具 id 前缀派生（encrypt/codec/convert/format/text/misc/net/info），
 * 与菜单树分组 id 不完全同名（如 convert → formatConvert、misc → miscTools），故需显式映射。
 */
const PLUGIN_TOOL_SECTION_LABEL_KEYS: Readonly<Record<string, string>> = {
    encrypt: 'menu.plugins.group.encrypt',
    codec: 'menu.plugins.group.codec',
    convert: 'menu.plugins.group.formatConvert',
    format: 'menu.plugins.group.formatTools',
    text: 'menu.plugins.group.textConvert',
    misc: 'menu.plugins.group.miscTools',
    net: 'menu.plugins.group.network',
    info: 'menu.plugins.group.cheatSheets'
}

/** 取分类标题 i18n 键；未知分类返回 undefined（渲染层回退到条目分类路径末级 / 分区 id） */
export function getPluginToolSectionLabelKey(sectionId: string): string | undefined {
    return PLUGIN_TOOL_SECTION_LABEL_KEYS[sectionId]
}

/** 把工具短 id 拆成可检索词（`encrypt:hash-text` → encrypt / hash / text） */
function splitToolIdWords(toolId: string): string[] {
    return toolId
        .split(/[:-]/)
        .map((word) => word.trim())
        .filter((word) => word.length > 0)
}

/**
 * 检索元数据源：每个 manifest 工具一条（渲染层只消费该结构）。
 * - `nameKey`：工具名 i18n 键（menu 命名空间）；
 * - `categoryLabelKeys`：从顶层到直属分组的分类 i18n 键路径（如 各类转换器/编解码转换）；
 * - `keywords`：额外中英关键词（同时参与「中英关键词均可搜」）。
 */
export interface PluginToolSearchSource {
    readonly actionId: string
    readonly toolId: string
    readonly nameKey: string
    readonly sectionId: string
    readonly categoryLabelKeys: readonly string[]
    readonly keywords: readonly string[]
}

/** 由 manifest 菜单树生成检索元数据（深度优先，顺序 = manifest 声明顺序） */
function buildPluginToolSearchSources(): PluginToolSearchSource[] {
    const sources: PluginToolSearchSource[] = []
    const walk = (
        nodes: readonly PluginToolMenuNode[],
        categoryLabelKeys: readonly string[]
    ): void => {
        for (const node of nodes) {
            if ('children' in node) {
                walk(node.children, [...categoryLabelKeys, getPluginToolGroupLabelKey(node.id)])
                continue
            }
            const sectionId = getPluginToolSectionId(node.id)
            sources.push({
                actionId: getPluginToolMenuAction(node.id),
                toolId: node.id,
                nameKey: node.menuLabelKey,
                sectionId,
                categoryLabelKeys,
                keywords: PLUGIN_TOOL_KEYWORDS[node.id] ?? splitToolIdWords(node.id)
            })
        }
    }
    walk(PLUGIN_TOOL_MENU, [])
    return sources
}

/** 38 项工具的检索元数据（含分类路径与关键词；测试锁定覆盖性与中英可检索性） */
export const PLUGIN_TOOL_SEARCH_SOURCES: readonly PluginToolSearchSource[] =
    buildPluginToolSearchSources()

/** actionId → 检索元数据（渲染层按注册表 id 反查；未登记 id 走兜底） */
export const PLUGIN_TOOL_SEARCH_SOURCE_MAP: ReadonlyMap<string, PluginToolSearchSource> = new Map(
    PLUGIN_TOOL_SEARCH_SOURCES.map((source) => [source.actionId, source])
)

// ==================== 搜索条目构建 ====================

/** 单条可搜索工具（翻译后的展示字段 + 预拼接检索串） */
export interface PluginToolSearchEntry {
    /** 菜单动作 id（= 插件注册表 id，如 `baize:menu:plugins:encrypt:hash-text`） */
    readonly actionId: string
    /** manifest 短 id（如 `encrypt:hash-text`） */
    readonly toolId: string
    /** 当前语言的工具名 */
    readonly name: string
    /** 当前语言的分类路径展示串（各级以「 / 」连接；未知工具为空串） */
    readonly category: string
    /** 当前语言的分类路径各级名称 */
    readonly categoryPath: readonly string[]
    /** 额外关键词（中英双语） */
    readonly keywords: readonly string[]
    /** 分区 id（决定分类分组与图标兜底） */
    readonly sectionId: string
    /** 列表图标 path 集合（每工具专属 24 网格线框；未知工具回退所属分类图标） */
    readonly iconPaths: readonly string[]
    /** 预拼接的小写检索串（名称/分类/短 id/动作 id/关键词） */
    readonly haystack: string
}

/** 翻译函数形态（渲染层传 `t`，单测传 `translate(key, locale)` 包装） */
export type PluginToolTranslate = (key: string) => string

/** 由 actionId / 短 id 兜底生成展示名（注册表有但 manifest 未登记时，如单测桩工具） */
function fallbackToolName(actionId: string, toolId: string): string {
    return toolId.length > 0 ? toolId : actionId
}

/** 由检索元数据 + 翻译函数构造一条搜索条目（纯函数，不读写 DOM） */
export function createPluginToolSearchEntry(
    source: PluginToolSearchSource | undefined,
    actionId: string,
    translate: PluginToolTranslate
): PluginToolSearchEntry {
    const toolId = source?.toolId ?? actionId.split(PLUGIN_TOOL_ACTION_PREFIX)[1] ?? actionId
    const name = source ? translate(source.nameKey) : fallbackToolName(actionId, toolId)
    const categoryPath = source ? source.categoryLabelKeys.map((key) => translate(key)) : []
    const keywords = source ? source.keywords : splitToolIdWords(toolId)
    const sectionId = source?.sectionId ?? getPluginToolSectionId(toolId)
    const haystack = [toolId, actionId, name, ...categoryPath, ...keywords].join(' ').toLowerCase()

    return {
        actionId,
        toolId,
        name,
        category: categoryPath.join(' / '),
        categoryPath,
        keywords,
        sectionId,
        // REQ-06：每工具专属图标（plugin-tools-icons.ts）；未知工具回退分类图标，避免行缺图标
        iconPaths: PLUGIN_TOOL_ITEM_ICON_PATHS[toolId] ?? getPluginToolIconPaths(sectionId),
        haystack
    }
}

/**
 * 按注册表顺序解析可搜索条目（组件传入 `pluginTools.map(tool => tool.id)`）。
 * 只包含实际注册的工具，保证「搜索结果 = 可打开工具」，避免死入口。
 */
export function resolvePluginToolSearchEntries(
    actionIds: readonly string[],
    translate: PluginToolTranslate
): PluginToolSearchEntry[] {
    return actionIds.map((actionId) =>
        createPluginToolSearchEntry(
            PLUGIN_TOOL_SEARCH_SOURCE_MAP.get(actionId),
            actionId,
            translate
        )
    )
}

// ==================== 分类分组 / 折叠状态（REQ-06） ====================

/** 分类分组视图（折叠最小单元：同一 section 的工具集合；sectionId 为空串表示「不分组的伪分组」） */
export interface PluginToolSectionGroup {
    readonly sectionId: string
    readonly tools: readonly PluginToolSearchEntry[]
}

/**
 * 把工具条目按 section 分组（1.5.6 REQ-06「全部工具」8 分类折叠）：
 * - 组顺序 = 各 section 在入参中首次出现的顺序（入参来自 manifest 派生顺序 → 与菜单一致）；
 * - 未知 section（如单测桩工具 id / 未来新增分区未登记图标）也各自成组，不丢行、不抛错；
 * - 纯函数：不读写 DOM/localStorage，渲染层与单测共用同一口径。
 */
export function groupPluginToolEntriesBySection(
    entries: readonly PluginToolSearchEntry[]
): PluginToolSectionGroup[] {
    const groups: Array<{ sectionId: string; tools: PluginToolSearchEntry[] }> = []
    const groupIndex = new Map<string, number>()
    for (const entry of entries) {
        const existingIndex = groupIndex.get(entry.sectionId)
        if (existingIndex === undefined) {
            groupIndex.set(entry.sectionId, groups.length)
            groups.push({ sectionId: entry.sectionId, tools: [entry] })
            continue
        }
        groups[existingIndex].tools.push(entry)
    }
    return groups
}

/**
 * 切换某分类的折叠状态（纯函数，返回新数组，不修改入参）：
 * 已折叠 → 从清单移除（展开）；未折叠 → 追加（折叠）。空 sectionId（伪分组/未知）忽略。
 */
export function toggleCollapsedPluginToolGroup(
    current: readonly string[],
    sectionId: string
): string[] {
    if (sectionId.length === 0) {
        return [...current]
    }
    return current.includes(sectionId)
        ? current.filter((id) => id !== sectionId)
        : [...current, sectionId]
}

// ==================== 搜索匹配 ====================

/** 归一化查询串：全角空格→半角、去首尾空白、转小写（空查询由调用方按「未搜索」处理） */
export function normalizePluginToolSearchQuery(query: string): string {
    return query
        .replace(/\u3000/g, ' ')
        .trim()
        .toLowerCase()
}

/** 单条目标准度评分：名称精确/前缀/包含优先，其次分类，最后关键词/id（同分按原顺序） */
function scorePluginToolEntry(entry: PluginToolSearchEntry, normalizedQuery: string): number {
    const name = entry.name.toLowerCase()
    if (name === normalizedQuery) return 0
    if (name.startsWith(normalizedQuery)) return 1
    if (name.includes(normalizedQuery)) return 2
    if (entry.category.toLowerCase().includes(normalizedQuery)) return 3
    return 4
}

/**
 * 过滤工具：查询按空白拆 token，全部 token 命中任一检索字段（名称/分类/关键词/id）才算匹配；
 * 结果按相关度排序（名称精确 > 名称前缀 > 名称包含 > 分类 > 关键词/id），同分保持注册表顺序。
 * 空查询返回空数组（组件用「是否搜索中」区分默认视图，而不是用空结果）。
 */
export function searchPluginTools(
    entries: readonly PluginToolSearchEntry[],
    query: string
): PluginToolSearchEntry[] {
    const normalizedQuery = normalizePluginToolSearchQuery(query)
    if (!normalizedQuery) {
        return []
    }
    const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 0)
    const matched: Array<{ entry: PluginToolSearchEntry; score: number; order: number }> = []
    entries.forEach((entry, order) => {
        if (!tokens.every((token) => entry.haystack.includes(token))) {
            return
        }
        matched.push({ entry, score: scorePluginToolEntry(entry, normalizedQuery), order })
    })
    matched.sort((left, right) => left.score - right.score || left.order - right.order)
    return matched.map((item) => item.entry)
}

// ==================== 最近使用 / 收藏（纯函数 + 注入存储） ====================

/** 去重并只保留非空字符串 id（存储内容可能被手改/历史版本污染） */
function normalizePluginToolIds(ids: readonly unknown[]): string[] {
    const result: string[] = []
    for (const id of ids) {
        if (typeof id !== 'string' || id.length === 0 || result.includes(id)) {
            continue
        }
        result.push(id)
    }
    return result
}

/**
 * 读取已持久化的工具 id 列表：
 * - localStorage 缺失（隐私模式/被禁用）→ []；
 * - JSON 解析失败、非数组、元素非字符串 → []（回退空，不抛错）；
 * - 只保留 `validIds` 内仍在注册表中的 id（工具删除后旧记录自动失效）；
 * - 截断到 limit。
 */
export function readPluginToolIds(
    storage: PluginToolsStorageLike | null,
    key: string,
    options: { validIds?: ReadonlySet<string>; limit?: number } = {}
): string[] {
    if (!storage) {
        return []
    }
    let parsed: unknown
    try {
        const raw = storage.getItem(key)
        if (!raw) {
            return []
        }
        parsed = JSON.parse(raw)
    } catch {
        return []
    }
    if (!Array.isArray(parsed)) {
        return []
    }
    const ids = normalizePluginToolIds(parsed).filter(
        (id) => !options.validIds || options.validIds.has(id)
    )
    const limit = options.limit ?? Number.POSITIVE_INFINITY
    return ids.slice(0, Math.max(0, limit))
}

/** 写入工具 id 列表；失败（配额/权限/存储不可用）返回 false，调用方静默降级 */
export function writePluginToolIds(
    storage: PluginToolsStorageLike | null,
    key: string,
    ids: readonly string[]
): boolean {
    if (!storage) {
        return false
    }
    try {
        storage.setItem(key, JSON.stringify(ids))
        return true
    } catch {
        return false
    }
}

/**
 * 记录一次「最近使用」：去重置顶，最多保留 PLUGIN_TOOLS_RECENT_LIMIT（20）个。
 * 纯函数：返回新数组，不修改入参。
 */
export function recordRecentPluginToolId(
    currentIds: readonly string[],
    actionId: string,
    limit: number = PLUGIN_TOOLS_RECENT_LIMIT
): string[] {
    const normalized = normalizePluginToolIds(currentIds)
    if (actionId.length === 0) {
        return normalized.slice(0, Math.max(0, limit))
    }
    const next = [actionId, ...normalized.filter((id) => id !== actionId)]
    return next.slice(0, Math.max(1, limit))
}

/**
 * 切换收藏：已收藏→取消；未收藏且未达上限→置顶新增；已达上限→原样返回并标记 rejected。
 * 纯函数：返回新数组，不修改入参。
 */
export function toggleFavoritePluginToolId(
    currentIds: readonly string[],
    actionId: string,
    limit: number = PLUGIN_TOOLS_FAVORITES_LIMIT
): PluginToolFavoriteToggleResult {
    const normalized = normalizePluginToolIds(currentIds)
    if (actionId.length === 0) {
        return { ids: normalized, added: false, rejected: false }
    }
    if (normalized.includes(actionId)) {
        return { ids: normalized.filter((id) => id !== actionId), added: false, rejected: false }
    }
    if (normalized.length >= Math.max(0, limit)) {
        return { ids: normalized, added: false, rejected: true }
    }
    return {
        ids: [actionId, ...normalized].slice(0, Math.max(1, limit)),
        added: true,
        rejected: false
    }
}
