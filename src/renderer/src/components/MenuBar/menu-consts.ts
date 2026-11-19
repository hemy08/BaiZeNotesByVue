// 渲染层菜单常量（在线工具菜单数据源）。
// 2026-11-19 更新：PDF 预览已改 pdf.js（pdfjs-dist）渲染并恢复菜单入口
// （misc:pdf-preview，见 src/shared/constants/plugin-tools-manifest.ts 与 MenuBar 插件菜单）；
// HemyTools 工具面板仍不提供菜单入口（模板仅"返回编辑器"按钮，属未完成空壳，
// 其容器开关由 WorkSpace.vue 事件控制）。
//
// 2026-11-19 重构：在线工具映射项中的 url 字段属死数据——渲染层 generateMenuItems
// （menu-config.ts）只消费 id/labelKey，url 从未被读取；且该副本与主进程真源已漂移约 40%
// （w3cschool、tool.lu、latexlive 等地址不一致）。现全部删除（共 50 项），
// URL 单一真源收敛到 src/shared/constants/urls.ts，由主进程
// src/main/ipc/menu-tools.ts 按菜单动作 id 命中真正的跳转地址。
// 注意：下列映射表为兼容既有消费方仍保留 *UrlMaps 历史导出名，但已不含任何 URL 数据。
//
// M3（结构优化收尾）：38 项插件工具的 14 张 Plugin*Maps 映射表已删除，菜单数据统一由
// src/shared/constants/plugin-tools-manifest.ts 的 PLUGIN_TOOL_MENU 单一 manifest 生成；
// 本文件现仅保留「在线工具」菜单映射表。

// ARC-14：插件工具显示事件名收敛至 EventBus 集中常量文件（字符串不变），
// 此处 re-export 保持历史调用方（menu-actions.ts / PluginTools.vue / 测试）兼容。
export { CHANNEL_PLUGIN_TOOL_SHOW } from '../../common/event-bus/event-bus-events'

const OnlineToolMaps = [
    // ==================== 在线工具 ====================
    {
        id: 'baize:menu:online:tools:cainiao-tools',
        labelKey: 'menu.online.tools.cainiaoTools'
    },
    {
        id: 'baize:menu:online:tools:w3cschool-tools',
        labelKey: 'menu.online.tools.w3cschoolTools'
    },
    {
        id: 'baize:menu:online:tools:baibaoxiang',
        labelKey: 'menu.online.tools.baibaoxiang'
    },
    {
        id: 'baize:menu:online:tools:toolfk',
        labelKey: 'menu.online.tools.toolfk'
    },
    {
        id: 'baize:menu:online:tools:json-bejson',
        labelKey: 'menu.online.tools.bejson'
    },
    {
        id: 'baize:menu:online:tools:67tool',
        labelKey: 'menu.online.tools.tool67'
    },
    {
        id: 'baize:menu:online:tools:toollu',
        labelKey: 'menu.online.tools.toollu'
    },
    {
        id: 'baize:menu:online:tools:sojson-parser',
        labelKey: 'menu.online.tools.sojson'
    },
    {
        id: 'baize:menu:online:tools:latex-editor',
        labelKey: 'menu.online.tools.latexEditor'
    },
    {
        id: 'baize:menu:online:tools:mermaid-editor',
        labelKey: 'menu.online.tools.mermaidEditor'
    },
    {
        id: 'baize:menu:online:tools:planttext-editor',
        labelKey: 'menu.online.tools.planttextEditor'
    },
    {
        id: 'baize:menu:online:tools:mindmap-tool',
        labelKey: 'menu.online.tools.mindmapTool'
    },
    {
        id: 'baize:menu:online:tools:diagrams-tool',
        labelKey: 'menu.online.tools.diagramsTool'
    },
    {
        id: 'baize:menu:online:tools:plantuml-server',
        labelKey: 'menu.online.tools.plantumlServer'
    },
    {
        id: 'baize:menu:online:tools:chuizi-tools',
        labelKey: 'menu.online.tools.chuiziTools'
    }
]

const CaiNiaoUrlMaps = [
    // ==================== 菜鸟在线工具 ====================
    {
        id: 'baize:menu:online:cainiao:svg-editor',
        labelKey: 'menu.online.cainiao.svgEditor'
    },
    {
        id: 'baize:menu:online:cainiao:draw-tool',
        labelKey: 'menu.online.cainiao.drawTool'
    },
    {
        id: 'baize:menu:online:cainiao:office-tools',
        labelKey: 'menu.online.cainiao.officeTools'
    },
    {
        id: 'baize:menu:online:cainiao:table-generator',
        labelKey: 'menu.online.cainiao.tableGenerator'
    }
]

const W3SchoolUrlMaps = [
    // ==================== 编程狮在线工具 ====================
    {
        id: 'baize:menu:online:encode:csv-to-html',
        labelKey: 'menu.online.w3school.csvToHtml'
    },
    {
        id: 'baize:menu:online:encode:sql-formatter',
        labelKey: 'menu.online.w3school.sqlFormatter'
    },
    {
        id: 'baize:menu:online:encode:fullwidth-halfwidth-converter',
        labelKey: 'menu.online.w3school.fullwidthHalfwidth'
    }
]

const EncDecUrlMaps = [
    // ==================== 在线编解码工具 ====================
    {
        id: 'baize:menu:online:encode:qrcode-generator',
        labelKey: 'menu.online.encode.qrcodeGenerator'
    },
    {
        id: 'baize:menu:online:encode:qrcode-decoder',
        labelKey: 'menu.online.encode.qrcodeDecoder'
    },
    {
        id: 'baize:menu:online:encode:encoding-converter',
        labelKey: 'menu.online.encode.encodingConverter'
    }
]

const IdeUrlMaps = [
    // ==================== 在线IDE编辑器 ====================
    // FE-28：WebIDE Online 为产品品牌名，按 i18n 约定保留原文 label（不翻译）
    {
        id: 'baize:menu:online:ide:webide-online',
        label: 'WebIDE Online'
    },
    {
        id: 'baize:menu:online:ide:html-lang',
        labelKey: 'menu.online.ide.html'
    },
    {
        id: 'baize:menu:online:ide:python-lang',
        labelKey: 'menu.online.ide.python'
    },
    {
        id: 'baize:menu:online:ide:c-lang',
        labelKey: 'menu.online.ide.c'
    },
    {
        id: 'baize:menu:online:ide:go-lang',
        labelKey: 'menu.online.ide.go'
    }
]

const DevelopUrlMaps = [
    // ==================== 开发者工具 ====================
    {
        id: 'baize:menu:online:dev:pretty-qrcode-generator',
        labelKey: 'menu.online.dev.prettyQrcode'
    },
    {
        id: 'baize:menu:online:dev:qrcode-decoder-box3',
        labelKey: 'menu.online.dev.qrcodeDecoder'
    },
    {
        id: 'baize:menu:online:dev:image-format-converter',
        labelKey: 'menu.online.dev.imageFormatConverter'
    },
    {
        id: 'baize:menu:online:dev:linux-crontab',
        labelKey: 'menu.online.dev.linuxCrontab'
    },
    {
        id: 'baize:menu:online:dev:jwt-decoder',
        labelKey: 'menu.online.dev.jwtDecoder'
    }
]

const TeamUrlMaps = [
    // ==================== 国内知名前端团队 ====================
    {
        id: 'baize:menu:online:team:taobao-fed',
        labelKey: 'menu.online.team.taobaoFed'
    },
    {
        id: 'baize:menu:online:team:tmall-fe',
        labelKey: 'menu.online.team.tmallFe'
    },
    // FE-28：THX from Alimama FE 为团队/品牌名，按 i18n 约定保留原文 label（不翻译）
    {
        id: 'baize:menu:online:team:thx-alimama-fe',
        label: 'THX from Alimama FE'
    },
    {
        id: 'baize:menu:online:team:ali-nodejs-platform',
        labelKey: 'menu.online.team.aliNodejs'
    },
    {
        id: 'baize:menu:online:team:baidu-fex',
        labelKey: 'menu.online.team.baiduFex'
    }
]

const CloudUrlMaps = [
    // ==================== 云计算平台 ====================
    {
        id: 'baize:menu:online:cloud:aliyun',
        labelKey: 'menu.online.cloud.aliyun'
    },
    {
        id: 'baize:menu:online:cloud:tencent-cloud',
        labelKey: 'menu.online.cloud.tencent'
    },
    {
        id: 'baize:menu:online:cloud:huawei-cloud',
        labelKey: 'menu.online.cloud.huawei'
    },
    {
        id: 'baize:menu:online:cloud:tianyi-cloud',
        labelKey: 'menu.online.cloud.tianyi'
    },
    {
        id: 'baize:menu:online:cloud:jinshan-cloud',
        labelKey: 'menu.online.cloud.jinshan'
    }
]

const GitHubUrlMaps = [
    // ==================== GitHub 开源项目 ====================
    {
        id: 'baize:menu:github:it-tools',
        labelKey: 'menu.github.itTools'
    },
    {
        id: 'baize:menu:github:ghost-website',
        labelKey: 'menu.github.ghost'
    },
    {
        id: 'baize:menu:github:priospace',
        labelKey: 'menu.github.priospace'
    },
    {
        id: 'baize:menu:github:plane-project',
        labelKey: 'menu.github.plane'
    },
    {
        id: 'baize:menu:github:openproject',
        labelKey: 'menu.github.openproject'
    }
]

const OnlineUrlMaps = [
    ...OnlineToolMaps,
    ...CaiNiaoUrlMaps,
    ...W3SchoolUrlMaps,
    ...EncDecUrlMaps,
    ...IdeUrlMaps,
    ...DevelopUrlMaps,
    ...TeamUrlMaps,
    ...CloudUrlMaps,
    ...GitHubUrlMaps
]

export {
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
}
