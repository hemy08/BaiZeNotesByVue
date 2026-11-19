// ============ URL 常量单一真源 ============
// 2026-11-19 重构：全仓库在线工具/默认快速链接 URL 只在此文件维护。
//   - 主进程：经 src/main/constants/urls.ts 的 re-export 门面引用（导出表面不变）；
//   - 渲染层：src/renderer/src/common/useConfigStore.ts 使用 DEFAULT_* 快速链接。
// 渲染层菜单数据（MenuBar/menu-consts.ts）只存 id/labelKey，不再保存 URL 副本，
// 由主进程 src/main/ipc/menu-tools.ts 按菜单动作 id 命中本文件的 URL 常量。
// 新增/修改 URL 只需改本文件，禁止再复制到其他模块（避免多份副本漂移）。
export const TOOLS_JYSHARE = 'https://www.jyshare.com/'
export const TOOLS_W3CSCHOOL = 'https://www.w3cschool.cn/tools/'
export const TOOLS_TOOLNB = 'https://www.toolnb.com/'
export const TOOLS_TOOLFK = 'https://www.toolfk.com/'
export const TOOLS_BEJSON = 'https://www.bejson.com/'
export const TOOLS_67TOOL = 'http://www.67tool.com/'
export const TOOLS_TOOLLU = 'http://www.toollu.com/'
export const TOOLS_SOJSON = 'https://www.sojson.com/'
export const TOOLS_LATEX = 'https://www.latex-project.org/'
export const TOOLS_MERMAID_LIVE = 'https://mermaid.live/'
export const TOOLS_PLANTTEXT = 'https://www.planttext.com/'
export const TOOLS_MINDMAP = 'https://www.mindmapmaker.com/'
export const TOOLS_DIAGRAMS = 'https://www.diagrams.net/'
export const TOOLS_PLANTUML = 'https://www.plantuml.com/plantuml'
export const TOOLS_TOOLSHI = 'http://www.toolshi.com/'

export const CAINIAO_SVG_EDITOR = 'https://www.jyshare.com/more/svgeditor/'
export const CAINIAO_DRAW = 'https://www.jyshare.com/more/shapefly-diagram/'
export const CAINIAO_OFFICE = 'https://www.jyshare.com/office/'
export const CAINIAO_TABLE = 'https://www.jyshare.com/front-end/7688/'

export const ENCODE_CSV_TO_HTML = 'https://www.w3cschool.cn/tools/index?name=csv2tb'
export const ENCODE_SQL_FORMATTER = 'https://www.w3cschool.cn/tools/index?name=sql_formatter'
export const ENCODE_FULLWIDTH_HALFWIDTH = 'https://www.w3cschool.cn/tools/index?name=fullhalfcode'
export const ENCODE_QRCODE_GENERATOR = 'https://cli.im/'
export const ENCODE_QRCODE_DECODER = 'https://www.box3.cn/tool/qrcode/decode.html'
export const ENCODE_CONVERTER = 'https://www.branah.com/encoding'

export const IDE_CODEPEN = 'https://codepen.io/'
export const IDE_CODEPEN_PEN = 'https://codepen.io/pen/'
export const IDE_PYTHON = 'https://www.mycompiler.io/new/python'
export const IDE_C = 'https://www.mycompiler.io/new/c'
export const IDE_GO = 'https://www.mycompiler.io/new/go'

export const DEV_QRCODEDESIGNER = 'https://www.seventhqueen.com/product/qrdesigner'
export const DEV_IMG_CONVERT = 'https://www.box3.cn/tool/img/convert.html'
export const DEV_CRONTAB = 'https://tool.box3.cn/crontab.html'
export const DEV_JWT = 'https://tool.box3.cn/jwt.html'

export const TEAM_TAOBAO_FED = 'https://fed.taobao.org/'
export const TEAM_TMALL_FE = 'https://tmallfe.github.io/'
export const TEAM_THX = 'https://thx.github.io/'
export const TEAM_ALIYUN_NODEJS = 'https://www.aliyun.com/product/nodejs'
export const TEAM_BAIDU_FEX = 'https://fex-team.github.io/'

export const CLOUD_ALIYUN = 'https://www.aliyun.com/'
export const CLOUD_TENCENT = 'https://cloud.tencent.com/'
export const CLOUD_HUAWEI = 'https://activity.huaweicloud.com/'
export const CLOUD_CTYUN = 'https://www.ctyun.cn/'
export const CLOUD_KSYUN = 'https://www.ksyun.com/'

export const GITHUB_IT_TOOLS = 'https://it-tools.tech/'
export const GITHUB_GHOST = 'https://ghost.org/'
export const GITHUB_PRIOSPACE = 'https://github.com/AnoyRC/priospace'
export const GITHUB_PLANE = 'https://github.com/makeplane/plane'
export const GITHUB_OPENPROJECT = 'https://github.com/opf/openproject'

// MERMAID_CSS/MERMAID_JS 已删除（ARC-10 修复后 Mermaid 改为本地打包，全仓库零引用，grep 验证）

export const DEFAULT_GITHUB = 'https://github.com'
export const DEFAULT_GOOGLE = 'https://google.com'
export const DEFAULT_STACKOVERFLOW = 'https://stackoverflow.com'
