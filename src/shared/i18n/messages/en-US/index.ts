/**
 * en-US 词典聚合入口（P1-3：首屏 i18n 拆包）
 *
 * 背景：改造前 `src/shared/i18n/index.ts` 静态 import 了中英两套共 24 个消息文件，
 * 导致首屏 modulepreload 共享 chunk 同时包含双语全量词典（英文用户同样白加载中文词典）。
 * 现按语言拆出本聚合入口：渲染层启动时只动态 `import('./messages/<locale>')` 当前语言，
 * 另一语言在语言切换时按需加载（见 shared/i18n/index.ts 的 loadLocale）。
 *
 * 维护约定：新增命名空间时，本文件与 `../zh-CN/index.ts` 必须同步补充 import 与键值；
 * `tests/unit/i18n-dict.test.ts` 的「语言聚合入口覆盖全部命名空间文件」用例守护该约定。
 */
import common from './common'
import menu from './menu'
import status from './status'
import workspace from './workspace'
import dialogRenderer from './dialogRenderer'
import dialogMain from './dialogMain'
import mainMsg from './mainMsg'
import editorUi from './editorUi'
import toolsConvert from './toolsConvert'
import toolsNetwork from './toolsNetwork'
import settings from './settings'
import themeNames from './themeNames'
import type { MessageNode } from '../../types'

const messages: MessageNode = {
    common,
    menu,
    status,
    workspace,
    dialogRenderer,
    dialogMain,
    mainMsg,
    editorUi,
    toolsConvert,
    toolsNetwork,
    settings,
    themeNames
}

export default messages
