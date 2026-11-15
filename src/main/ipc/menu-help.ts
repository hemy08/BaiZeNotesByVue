import * as dialogs from '../dialogs/dialogs'
import { openExternalSafely } from '../utils/security'

export const helpMenuHandlers = {
    'release-notes': {
        'v1.3.0': () => dialogs.ShowReleaseNotesDialog('1.3.0'),
        'v1.2.2': () => dialogs.ShowReleaseNotesDialog('1.2.2'),
        'v1.2.1': () => dialogs.ShowReleaseNotesDialog('1.2.1'),
        'v1.2.0': () => dialogs.ShowReleaseNotesDialog('1.2.0'),
        'v1.1.5': () => dialogs.ShowReleaseNotesDialog('1.1.5'),
        'v1.1.3': () => dialogs.ShowReleaseNotesDialog('1.1.3'),
        'v1.1.2': () => dialogs.ShowReleaseNotesDialog('1.1.2'),
        'v1.1.1': () => dialogs.ShowReleaseNotesDialog('1.1.1'),
        'v1.1.0': () => dialogs.ShowReleaseNotesDialog('1.1.0'),
        'v1.0.2': () => dialogs.ShowReleaseNotesDialog('1.0.2'),
        'v1.0.1': () => dialogs.ShowReleaseNotesDialog('1.0.1'),
        'v1.0.0': () => dialogs.ShowReleaseNotesDialog('1.0.0')
    },
    'change-log': () => {
        console.warn('[Menu] Change log not implemented yet')
    },
    shortkeys: () => {
        // FE-07：原实现仅 console.warn（菜单可点但无任何界面反馈）。
        // 现复用主进程 HTML 对话框体系展示完整快捷键说明（只读、无新增 IPC 通道）。
        dialogs.ShowShortcutKeysDialog()
    },
    // P0 安全：帮助菜单的外部链接统一走 shell 协议白名单封装（固定 https 也走同一实现，
    // 保证主进程所有 openExternal 调用点行为一致、可审计）
    usage: () => {
        void openExternalSafely('https://hemy08.github.io/hemynotes/')
    },
    issues: () => {
        void openExternalSafely('https://github.com/hemy08/BaiZeNotesByVue/issues')
    },
    // P2 死代码清理：'tech-stack' / 'about' 的 JSDOM 对话框已删除——渲染层
    // menu_actions.ts 对这两个动作优先拦截并展示 Vue 对话框，主进程 handler 不可达。
    'update-log': () => dialogs.ShowUpdateLogDialog(),
    home: () => {
        void openExternalSafely('https://github.com/hemy08/BaiZeNotesByVue')
    },
    update: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        // FUN-10/CMP-21：接入 electron-updater 检查更新，结果经对话框反馈；
        // 更新源为占位地址时诚实提示"未配置更新源"，不假装自动更新。
        // 动态 import 避免 electron-updater 在模块顶层被加载（测试环境无 Electron 运行时）
        // CQ-10：动态 import 失败必须有兜底，否则打包产物缺失依赖时产生 unhandledRejection，
        // 用户点击"检查更新"无任何反馈。
        void import('../utils/auto-updater.js')
            .then(({ checkForUpdatesAndNotify }) => checkForUpdatesAndNotify(mainWindow))
            .catch((error: unknown) => {
                console.warn('[Menu] 检查更新模块加载失败:', error)
            })
    }
    // P2/CQ-4：'contact-us' 主进程 handler 与 JSDOM 版 ShowHelpContactUsDialog 已删除。
    // 渲染层 menu-actions.ts 对 'baize:menu:help:contact-us'（及历史别名 'contact'）
    // 优先拦截并展示 Vue HelpContactUsDialog，菜单入口不会到达主进程；若其他入口
    // 恢复该动作，menu-handle 会以「Unknown menu action」告警而非静默打开第二套对话框。
}
