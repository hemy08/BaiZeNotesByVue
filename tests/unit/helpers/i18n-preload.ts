/**
 * P1-3（首屏 i18n 拆包）单测预载：把中英两套词典同步注册进 shared/i18n。
 *
 * 背景：shared/i18n 已改为按语言动态加载（渲染层首屏只装当前语言），但**单元测试**
 * 需要在模块加载期就同步读取两套词典（词典一致性/占位符/主题 key 对齐等用例在
 * 模块顶层就构建了 zh/en 键值映射，组件用例也直接断言中文/英文文案）。
 * 因此在 vitest setupFiles 中同步注册两套词典——只影响测试进程，不进入任何构建产物，
 * 不影响 electron-vite 构建后的首屏拆包结果。
 *
 * 动机与约束：
 * - 用静态 import + 同步 register，而不是 dynamic import + 顶层 await：
 *   setupFiles 在测试模块 import 之前执行，静态导入即可保证「模块顶层读词典」用例可用；
 * - 渲染层运行时不得复用本文件的注册方式（会把另一语言拉回首屏闭包），
 *   首屏拆包回归由 tests/unit/i18n-lazy.test.ts 与 build/check-bundle-budget.js 守护。
 */
import { registerLocaleMessages, type Locale } from '../../../src/shared/i18n'
import zhMessages from '../../../src/shared/i18n/messages/zh-CN'
import enMessages from '../../../src/shared/i18n/messages/en-US'

/** 语言 → 词典（与 shared/i18n/messages/<locale>/index.ts 聚合入口一一对应） */
const ALL_LOCALE_MESSAGES: Record<Locale, typeof zhMessages> = {
    'zh-CN': zhMessages,
    'en-US': enMessages
}

for (const locale of Object.keys(ALL_LOCALE_MESSAGES) as Locale[]) {
    registerLocaleMessages(locale, ALL_LOCALE_MESSAGES[locale])
}
