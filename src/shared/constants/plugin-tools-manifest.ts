/**
 * 插件工具 38 项单一 manifest（结构优化收尾 M3：字符串协议单真源）
 *
 * 背景：同一批 38 个插件工具曾在三处重复维护——
 *   ① plugin-tools-const.ts 的懒加载注册表（id + 组件动态 import 路径）；
 *   ② menu-consts.ts 的 14 张 Plugin*Maps 映射表（labelKey + menuAction）与
 *      menu-config.ts 的 pluginsMenu 分组/顺序（另有 4 项 FE-17 内联补入口）；
 *   ③ 测试与文档中的 38 项 id 清单。
 * 任一新增/改名/移动都要多处同步，漏改即出现「菜单有入口但注册表无组件」或反向死入口。
 *
 * 本文件收敛为唯一真源：
 *   - 菜单树（分区/分组/顺序/名称 i18n key）由 PLUGIN_TOOL_MENU 生成（menu-config.ts）；
 *   - 懒加载注册表由 PLUGIN_TOOL_ITEMS 生成（plugin-tools-const.ts 用 import.meta.glob
 *     把 component 模块路径映射为 defineAsyncComponent 懒加载，保持每工具独立 chunk）；
 *   - menu-actions.ts 的插件动作拦截前缀、测试的 id 全集均由本文件派生；
 *   - 一致性由 tests/unit/plugin_tools_manifest.test.ts 守护（38 项覆盖 / 无重复 /
 *     菜单与注册表顺序一致 / zh-CN 与 en-US 词条齐全 / 组件模块路径与懒加载表一致）。
 *
 * 约束：
 *   - shared 层纯数据模块（边界规则见 tests/architecture/shared-boundary.test.ts），
 *     禁止 import vue/electron/node。component 字段只存模块路径字符串，
 *     真正的 import() 由渲染层 plugin-tools-const.ts 的 import.meta.glob 静态分析生成。
 *   - 菜单展示顺序 = 本文件节点声明顺序；空组（children: []）保留，导出前由
 *     pruneEmptySubmenus 剔除，数据补齐后无需改 menu-config 即自动展示（FE-16 语义不变）。
 */

/** 插件菜单动作前缀：`baize:menu:plugins:<section>:<tool-id>`（menu-actions.ts 据此拦截） */
export const PLUGIN_TOOL_ACTION_PREFIX = 'baize:menu:plugins:'

/** 插件菜单标签 i18n 键前缀（menu 命名空间，组标签为 `<前缀>.group.<组 id>`） */
export const PLUGIN_TOOL_MENU_LABEL_PREFIX = 'menu.plugins'

/** 单个插件工具（菜单叶子） */
export interface PluginToolItem {
    /** 工具唯一 id（不含动作前缀）：`<section>:<tool-id>`，如 `encrypt:token-generator` */
    readonly id: string
    /** 菜单标签 i18n 键（menu 命名空间，中英文案见 shared/i18n/messages/*\/menu.ts） */
    readonly menuLabelKey: string
    /**
     * 懒加载组件模块路径（相对 PluginTools 目录）：
     * 本地工具如 `Encryption/TokenGenerator.vue`；
     * HemyTools 下工具（PDF 预览）如 `../HemyTools/ShowPdfEditor.vue`。
     * 渲染层 plugin-tools-const.ts 据此从 import.meta.glob 静态表中取懒加载器。
     */
    readonly component: string
}

/** 插件菜单组（可递归；children 顺序即菜单展示顺序，工具叶子与子组可混排） */
export interface PluginToolMenuGroup {
    /** 组 id：同时决定 i18n 键 `menu.plugins.group.<id>` */
    readonly id: string
    readonly children: readonly PluginToolMenuNode[]
}

/** 菜单节点：组（含 children）或工具叶子（含 component） */
export type PluginToolMenuNode = PluginToolItem | PluginToolMenuGroup

/** 由组 id 生成组标签 i18n 键（菜单渲染时 t() 输出） */
export function getPluginToolGroupLabelKey(groupId: string): string {
    return `${PLUGIN_TOOL_MENU_LABEL_PREFIX}.group.${groupId}`
}

/** 由工具 id 生成菜单动作 id（菜单项 menuAction 与懒加载注册表键共用） */
export function getPluginToolMenuAction(toolId: string): string {
    return `${PLUGIN_TOOL_ACTION_PREFIX}${toolId}`
}

/**
 * 插件菜单树：顺序即菜单展示顺序，与重构前 menu-config.ts 的 pluginsMenu 逐项一致。
 * 分区：加解密 8 / 各类转换器 15（编解码 5 + 格式转换 5 + 格式化 2 + 文本转换 3）/
 * 常用小工具 3 / 网络计算 4 / 常用对照表 8，合计 38 项。
 */
export const PLUGIN_TOOL_MENU: readonly PluginToolMenuGroup[] = [
    {
        // 空组保留（当前无注册组件，导出前由 pruneEmptySubmenus 剪除）
        id: 'languageKeywords',
        children: []
    },
    {
        id: 'encrypt',
        children: [
            {
                id: 'encrypt:token-generator',
                menuLabelKey: 'menu.plugins.encrypt.tokenGenerator',
                component: 'Encryption/TokenGenerator.vue'
            },
            {
                id: 'encrypt:hash-text',
                menuLabelKey: 'menu.plugins.encrypt.hashText',
                component: 'Encryption/HashText.vue'
            },
            {
                id: 'encrypt:uuids-generator',
                menuLabelKey: 'menu.plugins.encrypt.uuids',
                component: 'Encryption/UUIDSGenerator.vue'
            },
            {
                id: 'encrypt:ulid-generator',
                menuLabelKey: 'menu.plugins.encrypt.ulid',
                component: 'Encryption/ULIDGenerator.vue'
            },
            {
                id: 'encrypt:encrypt-decrypt',
                menuLabelKey: 'menu.plugins.encrypt.encryptDecrypt',
                component: 'Encryption/EncryptDecrypt.vue'
            },
            {
                id: 'encrypt:crypto-encrypt-decrypt',
                menuLabelKey: 'menu.plugins.encrypt.cryptoEncryptDecrypt',
                component: 'Encryption/CryptoEncDec.vue'
            },
            {
                id: 'encrypt:hmac-generator',
                menuLabelKey: 'menu.plugins.encrypt.hmac',
                component: 'Encryption/HmacGenerator.vue'
            },
            {
                id: 'encrypt:rsa-generator',
                menuLabelKey: 'menu.plugins.encrypt.rsa',
                component: 'Encryption/RSAGenerator.vue'
            }
        ]
    },
    {
        id: 'converters',
        children: [
            {
                id: 'codec',
                children: [
                    {
                        id: 'codec:base64-codec',
                        menuLabelKey: 'menu.plugins.codec.base64Codec',
                        component: 'Codec/Base64Codec.vue'
                    },
                    {
                        id: 'codec:url-codec',
                        menuLabelKey: 'menu.plugins.codec.urlCodec',
                        component: 'Codec/UrlCodec.vue'
                    },
                    {
                        id: 'codec:html-codec',
                        menuLabelKey: 'menu.plugins.codec.htmlCodec',
                        component: 'Codec/HtmlCodec.vue'
                    },
                    {
                        id: 'codec:unicode',
                        menuLabelKey: 'menu.plugins.codec.unicode',
                        component: 'Codec/UnicodeConvert.vue'
                    },
                    {
                        id: 'codec:image-base64',
                        menuLabelKey: 'menu.plugins.codec.imageBase64',
                        component: 'Codec/ImageBase64.vue'
                    }
                ]
            },
            {
                id: 'formatConvert',
                children: [
                    {
                        id: 'convert:color-convert',
                        menuLabelKey: 'menu.plugins.convert.colorConvert',
                        component: 'Convert/ColorConvert.vue'
                    },
                    {
                        id: 'convert:unit-convert',
                        menuLabelKey: 'menu.plugins.convert.unitConvert',
                        component: 'Convert/UnitConvert.vue'
                    },
                    {
                        id: 'convert:rmb-case',
                        menuLabelKey: 'menu.plugins.convert.rmbCase',
                        component: 'Convert/RmbCase.vue'
                    },
                    {
                        id: 'convert:timestamp-convert',
                        menuLabelKey: 'menu.plugins.convert.timestampConvert',
                        component: 'Convert/TimestampConvert.vue'
                    },
                    {
                        id: 'convert:base-convert',
                        menuLabelKey: 'menu.plugins.convert.baseConvert',
                        component: 'Convert/BaseConvert.vue'
                    }
                ]
            },
            {
                // 空组保留（大小写转换家族当前无注册组件）
                id: 'caseConvert',
                children: []
            },
            {
                id: 'formatTools',
                children: [
                    {
                        id: 'format:json-tool',
                        menuLabelKey: 'menu.plugins.format.jsonTool',
                        component: 'FormatTools/JsonTool.vue'
                    },
                    {
                        id: 'format:xml-format',
                        menuLabelKey: 'menu.plugins.format.xmlFormatter',
                        component: 'FormatTools/XmlFormatter.vue'
                    }
                ]
            },
            {
                id: 'textConvert',
                children: [
                    {
                        id: 'text:chinese-text',
                        menuLabelKey: 'menu.plugins.text.chineseText',
                        component: 'TextTools/ChineseTextTool.vue'
                    },
                    {
                        id: 'text:word-count',
                        menuLabelKey: 'menu.plugins.text.wordCount',
                        component: 'TextTools/WordCount.vue'
                    },
                    {
                        id: 'text:text-diff',
                        menuLabelKey: 'menu.plugins.text.textDiff',
                        component: 'TextTools/TextDiff.vue'
                    }
                ]
            }
        ]
    },
    {
        id: 'miscTools',
        children: [
            {
                id: 'misc:random-generator',
                menuLabelKey: 'menu.plugins.misc.randomGenerator',
                component: 'MiscTools/RandomGenerator.vue'
            },
            {
                id: 'misc:calculator',
                menuLabelKey: 'menu.plugins.misc.calculator',
                component: 'MiscTools/Calculator.vue'
            },
            {
                // 2026-11-18（遗留清单 #9）：PDF 预览改走 pdf.js 后恢复注册；
                // 组件位于 HemyTools（工作区 PDF 视图容器复用同一实例，事件监听按 componentId 隔离）。
                id: 'misc:pdf-preview',
                menuLabelKey: 'menu.plugins.misc.pdfPreview',
                component: '../HemyTools/ShowPdfEditor.vue'
            }
        ]
    },
    {
        id: 'network',
        children: [
            {
                id: 'addressConverter',
                children: [
                    {
                        id: 'net:ipv4-subnet-calculator',
                        menuLabelKey: 'menu.plugins.net.ipv4SubnetCalculator',
                        component: 'NetWork/Ipv4SubnetCalc.vue'
                    }
                ]
            },
            {
                id: 'net:http-status-codes',
                menuLabelKey: 'menu.plugins.net.httpStatusCodes',
                component: 'Informations/HttpStatusCode.vue'
            },
            {
                id: 'net:subnet-mask-map-table',
                menuLabelKey: 'menu.plugins.net.subnetMaskMapTable',
                component: 'Informations/SubnetMaskMapTable.vue'
            },
            {
                id: 'parsers',
                children: [
                    {
                        id: 'net:regex-tester',
                        menuLabelKey: 'menu.plugins.net.regexTester',
                        component: 'NetWork/RegexTester.vue'
                    }
                ]
            }
        ]
    },
    {
        id: 'cheatSheets',
        children: [
            {
                id: 'cheatSheet1',
                children: [
                    {
                        id: 'info:ascii-table',
                        menuLabelKey: 'menu.plugins.info.asciiTable',
                        component: 'Informations/ASCIIComparison.vue'
                    },
                    {
                        id: 'info:file-extension-table',
                        menuLabelKey: 'menu.plugins.info.fileExtensionTable',
                        component: 'Informations/FileNameExtension.vue'
                    },
                    {
                        id: 'info:greece-letter-table',
                        menuLabelKey: 'menu.plugins.info.greeceLetterTable',
                        component: 'Informations/GreeceLetter.vue'
                    },
                    {
                        id: 'info:html-entity-table',
                        menuLabelKey: 'menu.plugins.info.htmlEntityTable',
                        component: 'Informations/HTMLSpecialChar.vue'
                    },
                    // FE-17：以下 2 项原为 menu-config.ts 内联补入口，顺序保持在常用对照表尾部
                    {
                        id: 'info:numeric-case-table',
                        menuLabelKey: 'menu.plugins.info.numericCaseTable',
                        component: 'Informations/NumericCase.vue'
                    },
                    {
                        id: 'info:normal-font-style-table',
                        menuLabelKey: 'menu.plugins.info.normalFontStyleTable',
                        component: 'Informations/NormalFontStyle.vue'
                    }
                ]
            },
            {
                // 空组保留（数据和命令对照表当前无注册组件）
                id: 'dataCommand',
                children: []
            },
            {
                id: 'science',
                children: [
                    {
                        id: 'info:math-symbol-table',
                        menuLabelKey: 'menu.plugins.info.mathSymbolTable',
                        component: 'Informations/FormulaSymbol.vue'
                    },
                    {
                        id: 'info:physical-constant-table',
                        menuLabelKey: 'menu.plugins.info.physicalConstantTable',
                        component: 'Informations/PhysicalSymbolic.vue'
                    }
                ]
            }
        ]
    }
]

/** 深度优先展开菜单树，得到 38 项工具（顺序 = 菜单叶子顺序 = 懒加载注册表顺序） */
function flattenPluginToolItems(nodes: readonly PluginToolMenuNode[]): PluginToolItem[] {
    const items: PluginToolItem[] = []
    for (const node of nodes) {
        if ('children' in node) {
            items.push(...flattenPluginToolItems(node.children))
        } else {
            items.push(node)
        }
    }
    return items
}

/** 38 项工具（唯一真源展开结果：菜单渲染与懒加载注册表都消费本清单） */
export const PLUGIN_TOOL_ITEMS: readonly PluginToolItem[] = flattenPluginToolItems(PLUGIN_TOOL_MENU)

/** 38 项完整菜单动作 id（顺序同 PLUGIN_TOOL_ITEMS；测试/文档/动作校验复用） */
export const PLUGIN_TOOL_ACTION_IDS: readonly string[] = PLUGIN_TOOL_ITEMS.map((item) =>
    getPluginToolMenuAction(item.id)
)
