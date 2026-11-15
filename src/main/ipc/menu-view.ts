import { InsertImportFormFile } from '../utils/file-utils/import'
import { IPC } from '../../shared/ipc-channels'
import { is } from '@electron-toolkit/utils'
import type { EditorSetting } from '../../shared/types'

/**
 * 视图菜单里「纯显示开关」的选项名——二者都存在于编辑器配置唯一真源
 * （editor-setting.json 的 editorSetting）中，菜单点击是「切换」语义。
 */
type EditorViewToggleOption = 'lineNumbers' | 'renderWhitespace'

/** 计算行号开关的下一个值（与渲染层 editor-utils 的切换语义一致：只有 'off' 视为关闭） */
function nextLineNumbers(current: EditorSetting['lineNumbers']): EditorSetting['lineNumbers'] {
    return current === 'off' ? 'on' : 'off'
}

/** 计算空白字符开关的下一个值（与渲染层 editor-utils 的切换语义一致：只有 'all' 视为显示） */
function nextRenderWhitespace(
    current: EditorSetting['renderWhitespace']
): EditorSetting['renderWhitespace'] {
    return current === 'all' ? 'none' : 'all'
}

/**
 * 把视图菜单的切换结果写回编辑器配置唯一真源，并向渲染层广播 INIT_SETTING。
 *
 * 修复「视图菜单切换行号/空白字符被 INIT_SETTING 覆盖」：
 * 切换前该动作只向渲染层发 UPDATE_OPTIONS 做内存态切换，Monaco 下一次收到
 * INIT_SETTING（设置保存/备份恢复等广播）或 GET_SETTING 兜底时，会按 editorSetting
 * 的旧配置重新 updateOptions，把用户刚切换的状态覆盖回去。这里在切换时同步把新值
 * 落盘，使后续任何一次 INIT_SETTING / GET_SETTING 都携带最新值；同时立即以
 * INIT_SETTING 广播完整新配置（与启动/设置保存同一通道、按值应用），保证
 * 「持久化值 == 界面状态」且不会被并发中的旧配置广播回退。
 *
 * 动态 import：menu-view 被 handlers.ts 在启动早期静态引用，editor-setting 会静态
 * 带入 electron-store/config 链，故沿用 menu-handle / menu-help 的 lazy import 约定。
 */
function persistViewToggle(
    mainWindow: Electron.CrossProcessExports.BrowserWindow,
    option: EditorViewToggleOption
): void {
    void import('../config/editor-setting.js')
        .then(({ getEditorSetting, saveEditorSetting }) => {
            const current = getEditorSetting()
            const next: EditorSetting =
                option === 'lineNumbers'
                    ? { ...current, lineNumbers: nextLineNumbers(current.lineNumbers) }
                    : {
                          ...current,
                          renderWhitespace: nextRenderWhitespace(current.renderWhitespace)
                      }
            saveEditorSetting(next)
            mainWindow.webContents.send(IPC.EDITOR.INIT_SETTING, next)
        })
        .catch((error: unknown) => {
            // 持久化失败不阻塞当前会话：仅记录日志（开关在本次会话内仍已生效）
            console.warn('[Menu] 视图开关持久化失败（本次切换仅在当前会话生效）:', error)
        })
}

export const viewMenuHandlers = {
    'edit-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.EDIT_MODE, null)
    },
    'preview-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.PREVIEW_MODE, null)
    },
    'edit-preview-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.EDIT_PREVIEW_MODE, null)
    },
    'dev-tools': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        // AS-12 对齐：全局 F12 热键已仅开发环境注册（short-key-register.ts），
        // 生产包的菜单「开发人员工具」同样不得打开 DevTools——生产环境忽略并记录日志。
        if (!is.dev) {
            console.warn('[Menu] 开发人员工具仅在开发环境可用，生产包已忽略该操作')
            return
        }
        mainWindow.webContents.toggleDevTools()
    },
    'toggle-resource-manager': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.VIEW.TOGGLE_RES_MANAGER, null)
    },
    'toggle-line-number': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        // 先做即时内存态切换，再持久化新值并广播 INIT_SETTING（修复被配置覆盖回退的问题）
        mainWindow.webContents.send(IPC.EDITOR.UPDATE_OPTIONS, 'lineNumbers')
        persistViewToggle(mainWindow, 'lineNumbers')
    },
    'toggle-whitespace': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.EDITOR.UPDATE_OPTIONS, 'renderWhitespace')
        persistViewToggle(mainWindow, 'renderWhitespace')
    }
    // FUN-09：'toggle-outline' 与 fold 折叠树已删除——由渲染层 menu_actions.ts 接管并
    // emit EventBus 事件（'editor-toggle-outline' / 'editor-toggle-fold'），编辑器侧由
    // Monaco 代理实现监听。
    // 原 'toggle-outline' 实现错误地 send 'baize:view:toggle-resource-manager'
    // （与资源管理器开关串线）；原折叠树 send 的 'editor-fold-all'/'editor-expand-all'/
    // 'editor-fold-level' 通道渲染端零监听，均为死路径。
}

export const insertMenuHandlers = {
    material: {
        admonition: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'admonition')
        }
    },
    math: (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'mathText')
    },
    'md-table': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'mdSheet')
    },
    'web-link': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'insertLink')
    },
    // FUN-09：'custom-template'（自定义模板）与 'template-manager'（模板管理）原为
    // console.warn 空实现，模板体系（自定义模板编辑/管理界面）本轮无法低成本实现，
    // 菜单项已在 menu_config.ts 隐藏（A-4 模式，数据保留）；此处 handler 已删除。
    // Roadmap：自定义模板编辑与模板管理界面。
    'from-file': {
        json: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'json', false),
        text: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'text', false),
        ini: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'ini', false),
        yaml: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'yaml', false),
        xml: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'xml', false),
        html: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'html', false),
        csv: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'csv', false),
        excel: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'excel', false)
    }
}

// P2 死代码清理：'special-text'（渲染层 menu_actions 接管字体选择对话框）与
// setting:* 四个设置对话框 handler（渲染层 menu_actions 已全部接管并打开 Vue 对话框）
// 对应的主进程 JSDOM 对话框不可达，随 dialogs/ShowFontSelectDialog 等文件一并删除，
// 本文件不再导出 settingMenuHandlers。
