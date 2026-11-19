// PF-6（首屏 eager JS 10.36 MiB）：插件工具注册表从「静态 import 20 个工具组件」
// 改为「defineAsyncComponent + 动态 import」：
// 1. 每个工具（及其专属依赖，如加解密/Qrcode/Latex 相关库）拆为独立 chunk，不进入首屏主 chunk；
// 2. PluginTools.vue 仅渲染当前激活工具（`<component :is="visibleTool.component">`），
//    未点击过的工具不会请求模块，实现真正的按需加载；
// 3. 首次打开工具时显示 i18n 文案「加载中…」占位，避免点击菜单后无反馈；
// 4. 工具组件内部实现与外部调用方式（id/component 字段、work-area-width prop）保持不变。
import { defineAsyncComponent, defineComponent, h, markRaw } from 'vue'
import type { Component } from 'vue'
import { t } from '../../common/i18n'

/** PF-6：工具分块加载中的占位（轻量，无额外依赖） */
const ToolLoading = defineComponent({
    name: 'PluginToolLoading',
    setup() {
        return () =>
            h(
                'div',
                {
                    class: 'plugin-tool-async-loading',
                    style: 'display:flex;align-items:center;justify-content:center;width:100%;min-height:120px;padding:16px;color:var(--theme-secondary-text-color,#888);font-size:14px;'
                },
                t('common.loading')
            )
    }
})

/** Vue SFC 动态导入模块形态（只有 default 导出） */
type VueModule = { default: Component }

/**
 * PF-6：把一个插件工具 SFC 转为按需加载的异步组件。
 * 首次渲染（即用户点击对应菜单）时才请求并加载该工具模块。
 */
function lazyTool(loader: () => Promise<VueModule>) {
    return defineAsyncComponent({
        loader,
        loadingComponent: ToolLoading,
        delay: 120,
        timeout: 30000,
        suspensible: false
    })
}

export const pluginTools = markRaw([
    // ==================== 加解密插件 ====================
    {
        id: 'baize:menu:plugins:encrypt:token-generator',
        component: lazyTool(() => import('./Encryption/TokenGenerator.vue'))
    },
    {
        id: 'baize:menu:plugins:encrypt:hash-text',
        component: lazyTool(() => import('./Encryption/HashText.vue'))
    },
    {
        id: 'baize:menu:plugins:encrypt:uuids-generator',
        component: lazyTool(() => import('./Encryption/UUIDSGenerator.vue'))
    },
    {
        id: 'baize:menu:plugins:encrypt:ulid-generator',
        component: lazyTool(() => import('./Encryption/ULIDGenerator.vue'))
    },
    {
        id: 'baize:menu:plugins:encrypt:encrypt-decrypt',
        component: lazyTool(() => import('./Encryption/EncryptDecrypt.vue'))
    },
    {
        id: 'baize:menu:plugins:encrypt:crypto-encrypt-decrypt',
        component: lazyTool(() => import('./Encryption/CryptoEncDec.vue'))
    },
    {
        id: 'baize:menu:plugins:encrypt:hmac-generator',
        component: lazyTool(() => import('./Encryption/HmacGenerator.vue'))
    },
    {
        id: 'baize:menu:plugins:encrypt:rsa-generator',
        component: lazyTool(() => import('./Encryption/RSAGenerator.vue'))
    },

    // ==================== 网络计算插件 ====================
    {
        id: 'baize:menu:plugins:net:ipv4-subnet-calculator',
        component: lazyTool(() => import('./NetWork/Ipv4SubnetCalc.vue'))
    },
    {
        id: 'baize:menu:plugins:net:http-status-codes',
        component: lazyTool(() => import('./Informations/HttpStatusCode.vue'))
    },
    {
        id: 'baize:menu:plugins:net:subnet-mask-map-table',
        component: lazyTool(() => import('./Informations/SubnetMaskMapTable.vue'))
    },
    {
        id: 'baize:menu:plugins:net:regex-tester',
        component: lazyTool(() => import('./NetWork/RegexTester.vue'))
    },

    // ==================== 编解码转换（1.3.5 jyshare 常用工具集成） ====================
    {
        id: 'baize:menu:plugins:codec:base64-codec',
        component: lazyTool(() => import('./Codec/Base64Codec.vue'))
    },
    {
        id: 'baize:menu:plugins:codec:url-codec',
        component: lazyTool(() => import('./Codec/UrlCodec.vue'))
    },
    {
        id: 'baize:menu:plugins:codec:html-codec',
        component: lazyTool(() => import('./Codec/HtmlCodec.vue'))
    },
    {
        id: 'baize:menu:plugins:codec:unicode',
        component: lazyTool(() => import('./Codec/UnicodeConvert.vue'))
    },
    {
        id: 'baize:menu:plugins:codec:image-base64',
        component: lazyTool(() => import('./Codec/ImageBase64.vue'))
    },

    // ==================== 格式转换（1.3.5 jyshare 常用工具集成） ====================
    {
        id: 'baize:menu:plugins:convert:color-convert',
        component: lazyTool(() => import('./Convert/ColorConvert.vue'))
    },
    {
        id: 'baize:menu:plugins:convert:unit-convert',
        component: lazyTool(() => import('./Convert/UnitConvert.vue'))
    },
    {
        id: 'baize:menu:plugins:convert:rmb-case',
        component: lazyTool(() => import('./Convert/RmbCase.vue'))
    },
    {
        id: 'baize:menu:plugins:convert:timestamp-convert',
        component: lazyTool(() => import('./Convert/TimestampConvert.vue'))
    },
    {
        id: 'baize:menu:plugins:convert:base-convert',
        component: lazyTool(() => import('./Convert/BaseConvert.vue'))
    },

    // ==================== 常用小工具（1.3.5 jyshare 常用工具集成） ====================
    {
        id: 'baize:menu:plugins:misc:random-generator',
        component: lazyTool(() => import('./MiscTools/RandomGenerator.vue'))
    },
    {
        id: 'baize:menu:plugins:misc:calculator',
        component: lazyTool(() => import('./MiscTools/Calculator.vue'))
    },
    // 2026-11-18（遗留清单 #9）：PDF 预览改走 pdf.js（pdfjs-dist）渲染后恢复注册。
    // 2026-11-19 注释更新：资源管理器点击 .pdf 经 PDF_FILE_SELECTED + WORKSPACE_SHOW('pdf')
    // 打开的是 **WorkSpace 工作区内的 PDF 视图容器**（ShowPdfEditor 实例），本菜单注册的
    // 插件实例用于「工具 → 常用小工具 → PDF 预览」入口；两个实例通过唯一 componentId
    // 隔离事件监听（见 ShowPdfEditor.vue），互不影响。
    {
        id: 'baize:menu:plugins:misc:pdf-preview',
        component: lazyTool(() => import('@renderer/components/HemyTools/ShowPdfEditor.vue'))
    },

    // ==================== 文本转换（1.3.5 jyshare 常用工具集成） ====================
    {
        id: 'baize:menu:plugins:text:chinese-text',
        component: lazyTool(() => import('./TextTools/ChineseTextTool.vue'))
    },
    {
        id: 'baize:menu:plugins:text:word-count',
        component: lazyTool(() => import('./TextTools/WordCount.vue'))
    },
    {
        id: 'baize:menu:plugins:text:text-diff',
        component: lazyTool(() => import('./TextTools/TextDiff.vue'))
    },

    // ==================== 格式化工具（1.3.5 jyshare 常用工具集成） ====================
    {
        id: 'baize:menu:plugins:format:json-tool',
        component: lazyTool(() => import('./FormatTools/JsonTool.vue'))
    },
    {
        id: 'baize:menu:plugins:format:xml-format',
        component: lazyTool(() => import('./FormatTools/XmlFormatter.vue'))
    },

    // ==================== 常用对照表 - 对照表一 ====================
    {
        id: 'baize:menu:plugins:info:ascii-table',
        component: lazyTool(() => import('./Informations/ASCIIComparison.vue'))
    },
    {
        id: 'baize:menu:plugins:info:file-extension-table',
        component: lazyTool(() => import('./Informations/FileNameExtension.vue'))
    },
    {
        id: 'baize:menu:plugins:info:numeric-case-table',
        component: lazyTool(() => import('./Informations/NumericCase.vue'))
    },
    {
        id: 'baize:menu:plugins:info:normal-font-style-table',
        component: lazyTool(() => import('./Informations/NormalFontStyle.vue'))
    },
    {
        id: 'baize:menu:plugins:info:greece-letter-table',
        component: lazyTool(() => import('./Informations/GreeceLetter.vue'))
    },
    {
        id: 'baize:menu:plugins:info:html-entity-table',
        component: lazyTool(() => import('./Informations/HTMLSpecialChar.vue'))
    },

    // ==================== 常用对照表 - 科学符号对照表 ====================
    {
        id: 'baize:menu:plugins:info:math-symbol-table',
        component: lazyTool(() => import('./Informations/FormulaSymbol.vue'))
    },
    {
        id: 'baize:menu:plugins:info:physical-constant-table',
        component: lazyTool(() => import('./Informations/PhysicalSymbolic.vue'))
    }

    // CMP-19/CMP-27：以下一项故意不注册为插件工具（沿用第一轮 A-4 模式，不展示入口）：
    // HemyTools（工具面板）：模板仅一个"返回编辑器"按钮，属未完成空壳——补齐功能后再注册。
    // 容器开关由 WorkSpace.vue 的事件控制，本注册表与 menu_consts.ts 均不为其生成菜单入口。
    // （注：PDF 预览已于 2026-11-18 改为 pdf.js 方案并恢复注册，见上方 misc:pdf-preview。）
])
