import { OpenOnlineWebPage } from '../dialogs/dialogs'
import {
    TOOLS_JYSHARE,
    TOOLS_W3CSCHOOL,
    TOOLS_TOOLNB,
    TOOLS_TOOLFK,
    TOOLS_BEJSON,
    TOOLS_67TOOL,
    TOOLS_TOOLLU,
    TOOLS_SOJSON,
    TOOLS_LATEX,
    TOOLS_MERMAID_LIVE,
    TOOLS_PLANTTEXT,
    TOOLS_MINDMAP,
    TOOLS_DIAGRAMS,
    TOOLS_PLANTUML,
    TOOLS_TOOLSHI,
    CAINIAO_SVG_EDITOR,
    CAINIAO_DRAW,
    CAINIAO_OFFICE,
    CAINIAO_TABLE,
    ENCODE_CSV_TO_HTML,
    ENCODE_SQL_FORMATTER,
    ENCODE_FULLWIDTH_HALFWIDTH,
    ENCODE_QRCODE_GENERATOR,
    ENCODE_QRCODE_DECODER,
    ENCODE_CONVERTER,
    IDE_CODEPEN,
    IDE_CODEPEN_PEN,
    IDE_PYTHON,
    IDE_C,
    IDE_GO,
    DEV_QRCODEDESIGNER,
    DEV_IMG_CONVERT,
    DEV_CRONTAB,
    DEV_JWT,
    TEAM_TAOBAO_FED,
    TEAM_TMALL_FE,
    TEAM_THX,
    TEAM_ALIYUN_NODEJS,
    TEAM_BAIDU_FEX,
    CLOUD_ALIYUN,
    CLOUD_TENCENT,
    CLOUD_HUAWEI,
    CLOUD_CTYUN,
    CLOUD_KSYUN,
    GITHUB_IT_TOOLS,
    GITHUB_GHOST,
    GITHUB_PRIOSPACE,
    GITHUB_PLANE,
    GITHUB_OPENPROJECT
} from '../constants/urls'
import { IPC } from '../../shared/ipc-channels'

export const toolsMenuHandlers = {
    mermaid: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'mermaidEdit')
    },
    katex: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'mathText')
    },
    table: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'mdSheet')
    },
    images: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'insertImage')
    }
    // FUN-09：'drawing'（绘图工具）原 send 'OpenFile' 通道全库无任何监听（点击无反应），
    // 已删除。菜单项改为插入 mermaid/plantuml 基础框架模板，由渲染层 menu_actions.ts
    // 复用模板插入事件链路（'baize:notes:monaco-editor:insert-text'）处理。
}

// P2 死代码清理：pluginsMenuHandlers（26 个插件工具 handler）已整体删除。
// 全仓无原生菜单，渲染层 menu_actions.ts 对所有 'baize:menu:plugins:*' 动作
// 优先拦截并 emit EventBus(PLUGIN_TOOL_SHOW) 直接展示组件；这些 handler 的唯一
// 实现是向 'baize:dialog:open-plugin-tool' 通道 send，而该通道渲染层零监听，
// 属"主进程菜单树不可达 + 通道无监听"的双死路径。OPEN_PLUGIN_TOOL 常量一并删除。

export const onlineMenuHandlers = {
    tools: {
        'cainiao-tools': () => OpenOnlineWebPage(TOOLS_JYSHARE),
        'w3cschool-tools': () => OpenOnlineWebPage(TOOLS_W3CSCHOOL),
        baibaoxiang: () => OpenOnlineWebPage(TOOLS_TOOLNB),
        toolfk: () => OpenOnlineWebPage(TOOLS_TOOLFK),
        'json-bejson': () => OpenOnlineWebPage(TOOLS_BEJSON),
        '67tool': () => OpenOnlineWebPage(TOOLS_67TOOL),
        toollu: () => OpenOnlineWebPage(TOOLS_TOOLLU),
        'sojson-parser': () => OpenOnlineWebPage(TOOLS_SOJSON),
        'latex-editor': () => OpenOnlineWebPage(TOOLS_LATEX),
        'mermaid-editor': () => OpenOnlineWebPage(TOOLS_MERMAID_LIVE),
        'planttext-editor': () => OpenOnlineWebPage(TOOLS_PLANTTEXT),
        'mindmap-tool': () => OpenOnlineWebPage(TOOLS_MINDMAP),
        'diagrams-tool': () => OpenOnlineWebPage(TOOLS_DIAGRAMS),
        'plantuml-server': () => OpenOnlineWebPage(TOOLS_PLANTUML),
        'chuizi-tools': () => OpenOnlineWebPage(TOOLS_TOOLSHI)
    },
    cainiao: {
        'svg-editor': () => OpenOnlineWebPage(CAINIAO_SVG_EDITOR),
        'draw-tool': () => OpenOnlineWebPage(CAINIAO_DRAW),
        'office-tools': () => OpenOnlineWebPage(CAINIAO_OFFICE),
        'table-generator': () => OpenOnlineWebPage(CAINIAO_TABLE)
    },
    encode: {
        'csv-to-html': () => OpenOnlineWebPage(ENCODE_CSV_TO_HTML),
        'sql-formatter': () => OpenOnlineWebPage(ENCODE_SQL_FORMATTER),
        'fullwidth-halfwidth-converter': () => OpenOnlineWebPage(ENCODE_FULLWIDTH_HALFWIDTH),
        'qrcode-generator': () => OpenOnlineWebPage(ENCODE_QRCODE_GENERATOR),
        'qrcode-decoder': () => OpenOnlineWebPage(ENCODE_QRCODE_DECODER),
        'encoding-converter': () => OpenOnlineWebPage(ENCODE_CONVERTER)
    },
    ide: {
        'webide-online': () => OpenOnlineWebPage(IDE_CODEPEN),
        'html-lang': () => OpenOnlineWebPage(IDE_CODEPEN_PEN),
        'python-lang': () => OpenOnlineWebPage(IDE_PYTHON),
        'c-lang': () => OpenOnlineWebPage(IDE_C),
        'go-lang': () => OpenOnlineWebPage(IDE_GO)
    },
    dev: {
        'pretty-qrcode-generator': () => OpenOnlineWebPage(DEV_QRCODEDESIGNER),
        'qrcode-decoder-box3': () => OpenOnlineWebPage(ENCODE_QRCODE_DECODER),
        'image-format-converter': () => OpenOnlineWebPage(DEV_IMG_CONVERT),
        'linux-crontab': () => OpenOnlineWebPage(DEV_CRONTAB),
        'jwt-decoder': () => OpenOnlineWebPage(DEV_JWT)
    },
    team: {
        'taobao-fed': () => OpenOnlineWebPage(TEAM_TAOBAO_FED),
        'tmall-fe': () => OpenOnlineWebPage(TEAM_TMALL_FE),
        'thx-alimama-fe': () => OpenOnlineWebPage(TEAM_THX),
        'ali-nodejs-platform': () => OpenOnlineWebPage(TEAM_ALIYUN_NODEJS),
        'baidu-fex': () => OpenOnlineWebPage(TEAM_BAIDU_FEX)
    },
    cloud: {
        aliyun: () => OpenOnlineWebPage(CLOUD_ALIYUN),
        'tencent-cloud': () => OpenOnlineWebPage(CLOUD_TENCENT),
        'huawei-cloud': () => OpenOnlineWebPage(CLOUD_HUAWEI),
        'tianyi-cloud': () => OpenOnlineWebPage(CLOUD_CTYUN),
        'jinshan-cloud': () => OpenOnlineWebPage(CLOUD_KSYUN)
    }
}

export const githubMenuHandlers = {
    'it-tools': () => OpenOnlineWebPage(GITHUB_IT_TOOLS),
    'ghost-website': () => OpenOnlineWebPage(GITHUB_GHOST),
    priospace: () => OpenOnlineWebPage(GITHUB_PRIOSPACE),
    'plane-project': () => OpenOnlineWebPage(GITHUB_PLANE),
    openproject: () => OpenOnlineWebPage(GITHUB_OPENPROJECT)
}

// ============ AI 导航（task-50） ============
// 数据源：菜鸟 AI 导航（https://www.jyshare.com/ai/）精选 70 条核心条目（2026-11-15 核对页面）。
// 约定：
// 1) 统一官方干净地址：去掉 utm_* / cps_key / invitecode / redirect 等推广或返利参数；
// 2) 全部使用 https（菜单末跳统一 OpenOnlineWebPage 打开内置在线网页窗口）；
// 3) 全菜单 URL 唯一（tests/unit/menu-ipc-trees.test.ts 守护）；
// 4) URL 单一真源在主进程：渲染层菜单树（menu-config.ts 的 aiMenuGroups）只存 labelKey 与
//    menuAction，不重复存 URL，避免两进程两份 URL 漂移。
// 动作 id 契约：baize:menu:ai:<group>:<tool-id>，与 menu-config.ts 的 aiMenuGroups 一一对应，
// 由 menu-handle.ts 的 ai 域按路径命中，复用既有 IPC.MENU.ACTION 通道（未新增 IPC 通道）。
export const aiMenuUrlMaps: Record<string, Record<string, string>> = {
    hot: {
        chatgpt: 'https://chat.openai.com/',
        deepseek: 'https://www.deepseek.com/',
        doubao: 'https://www.doubao.com/',
        kimi: 'https://www.kimi.com/',
        tongyi: 'https://www.tongyi.com/',
        wenxin: 'https://yiyan.baidu.com/',
        yuanbao: 'https://yuanbao.tencent.com/',
        claude: 'https://claude.ai/',
        gemini: 'https://gemini.google.com/',
        grok: 'https://grok.com/',
        copilot: 'https://copilot.microsoft.com/',
        perplexity: 'https://www.perplexity.ai/',
        chatglm: 'https://chatglm.cn/',
        tiangong: 'https://www.tiangong.cn/'
    },
    coding: {
        cursor: 'https://www.cursor.so/',
        trae: 'https://www.trae.cn/',
        qoder: 'https://qoder.com/',
        'github-copilot': 'https://github.com/features/copilot',
        opencode: 'https://opencode.ai/',
        'google-ai-studio': 'https://aistudio.google.com/',
        'coding-plan': 'https://www.volcengine.com/activity/codingplan',
        zcode: 'https://zcode.z.ai/',
        'deepseek-harness': 'https://www.deepseek.com/harness'
    },
    image: {
        midjourney: 'https://www.midjourney.com/home',
        'stable-diffusion': 'https://stability.ai/',
        leonardo: 'https://leonardo.ai/',
        'adobe-firefly': 'https://firefly.adobe.com/',
        runway: 'https://runwayml.com/',
        canva: 'https://www.canva.com/',
        figma: 'https://www.figma.com/',
        'remove-bg': 'https://www.remove.bg/',
        clipdrop: 'https://clipdrop.co/',
        civitai: 'https://civitai.com/'
    },
    writing: {
        'notion-ai': 'https://www.notion.so/',
        grammarly: 'https://www.grammarly.com/',
        quillbot: 'https://quillbot.com/',
        gamma: 'https://gamma.app/',
        notebooklm: 'https://notebooklm.google.com/',
        metaso: 'https://metaso.cn/',
        poe: 'https://poe.com/'
    },
    office: {
        miro: 'https://miro.com/',
        'ima-copilot': 'https://ima.qq.com/',
        manus: 'https://manus.im/'
    },
    media: {
        suno: 'https://suno.com/',
        elevenlabs: 'https://elevenlabs.io/',
        veed: 'https://www.veed.io/',
        reccloud: 'https://reccloud.com/',
        turboscribe: 'https://turboscribe.ai/',
        genmo: 'https://www.genmo.ai/',
        kling: 'https://klingai.kuaishou.com/',
        hailuo: 'https://hailuoai.com/'
    },
    agent: {
        openclaw: 'https://openclaw.ai/',
        kimiclaw: 'https://www.kimi.com/bot',
        autoclaw: 'https://autoglm.zhipuai.cn/autoclaw/',
        maxclaw: 'https://agent.minimaxi.com/max-claw',
        arkclaw: 'https://www.volcengine.com/product/arkclaw',
        easyclaw: 'https://easyclaw.cn/',
        qoderwork: 'https://qwenwork.cn/',
        miaoda: 'https://www.miaoda.cn/',
        'agent-skills': 'https://skills.sh/',
        'skillhub-qq': 'https://skillhub.tencent.com/'
    },
    model: {
        'hugging-face': 'https://huggingface.co/',
        openrouter: 'https://openrouter.ai/',
        arena: 'https://arena.ai/leaderboard/agent',
        'artificial-analysis': 'https://artificialanalysis.ai/',
        'swe-bench': 'https://www.swebench.com/'
    },
    more: {
        'jyshare-ai': 'https://www.jyshare.com/ai/',
        'google-labs': 'https://labs.google/',
        skillsmp: 'https://skillsmp.com/zh',
        'character-ai': 'https://character.ai/'
    }
}

/**
 * 由「分组 → 工具 id → URL」映射表生成主进程 handler 树：
 * 每个叶子统一为 `() => OpenOnlineWebPage(url)`（与 onlineMenuHandlers 同构）。
 * 用生成函数而不是 70 行手写对象，保证「菜单 id ↔ URL」只有一处维护点。
 */
export const aiMenuHandlers: Record<string, Record<string, () => void>> = Object.fromEntries(
    Object.entries(aiMenuUrlMaps).map(([group, tools]) => [
        group,
        Object.fromEntries(
            Object.entries(tools).map(([toolId, url]) => [toolId, () => OpenOnlineWebPage(url)])
        )
    ])
)
