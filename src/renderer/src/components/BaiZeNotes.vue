<template>
    <div id="editor-container">
        <!-- 标题栏区域，高度30px，宽度与app一致，支持拖动移动窗口 -->
        <div
            v-show="electronMenu"
            id="title-bar"
            class="title-bar"
            @mousedown="onTitleBarMouseDown"
            @dblclick="onTitleBarDblClick"
        >
            <div class="title-left">
                <img :src="logoSrc" alt="Baize Logo" width="24" height="24" />
                <span class="title-text">{{ t('workspace.appTitle') }}</span>
            </div>
            <!-- 窗口控制按钮（第 3 批组件化：与欢迎页共用 WindowControls，最大化状态同步
                 逻辑内聚在组件复用的 useWindowManagement 中；布局回调经 re-layout 上抛） -->
            <WindowControls @re-layout="EditorReLayout" />
        </div>
        <!-- 菜单栏区域（高度由密度令牌派生：控件高 + 4px = 32/36/40），宽度与 app 一致 -->
        <div v-show="electronMenu" id="menu-bar" class="menu-bar"><MenuBar /></div>
        <!-- 应用工具栏和下方区域分割部分，2px高度，宽度与app一致 -->
        <div id="file-bar"></div>
        <!-- 整个工作区域 -->
        <div id="workspace-area" class="workspace-area"><WorkSpace /></div>
        <!-- 状态栏区域，高度10px，宽度与app一致 -->
        <div id="status-bar" class="status-bar"><StatusBar /></div>
        <!-- 窗口大小调整边框 -->
        <div class="resize-edge resize-top" @mousedown="onResizeMouseDown('top', $event)"></div>
        <div
            class="resize-edge resize-bottom"
            @mousedown="onResizeMouseDown('bottom', $event)"
        ></div>
        <div class="resize-edge resize-left" @mousedown="onResizeMouseDown('left', $event)"></div>
        <div class="resize-edge resize-right" @mousedown="onResizeMouseDown('right', $event)"></div>
        <div
            class="resize-corner resize-top-left"
            @mousedown="onResizeMouseDown('top-left', $event)"
        ></div>
        <div
            class="resize-corner resize-top-right"
            @mousedown="onResizeMouseDown('top-right', $event)"
        ></div>
        <div
            class="resize-corner resize-bottom-left"
            @mousedown="onResizeMouseDown('bottom-left', $event)"
        ></div>
        <div
            class="resize-corner resize-bottom-right"
            @mousedown="onResizeMouseDown('bottom-right', $event)"
        ></div>

        <!-- 对话框组件 -->
        <BaiZeDialogs.MessageDialog
            :visible="configStore.dialogs.messageDialog.visible"
            :type="configStore.dialogs.messageDialog.type"
            :title="configStore.dialogs.messageDialog.title"
            :message="configStore.dialogs.messageDialog.message"
            @close="handleMessageDialogClose"
        >
            <!-- P2 功能错误处理修复：可重试错误（编码转换/按编码重开失败等）显示「重试」按钮；
                 重试动作由 store 的 messageDialogRetry 保存（不污染 messageDialog data 契约）。
                 按钮视觉统一走全局 assets/dialog-buttons.css（dialog-btn / dialog-btn--*），
                 保留 .btn-message-retry 作为既有选择器锚点。 -->
            <template #footer-extra>
                <button
                    v-if="hasMessageDialogRetry"
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn-message-retry"
                    @click="handleMessageDialogRetry"
                >
                    {{ t('dialogRenderer.common.retry') }}
                </button>
            </template>
        </BaiZeDialogs.MessageDialog>
        <!-- 第 4 批 4.2（M4）：主题切换入口直接绑定 useTheme 单例，组件不再自行读盘/写 DOM -->
        <BaiZeDialogs.ThemeSettingDialog
            :visible="configStore.dialogs.themeSettings.visible"
            @close="configStore.hideDialog('themeSettings')"
            @change="theme.changeTheme"
        />
        <BaiZeDialogs.FontSelectDialog
            :visible="configStore.dialogs.fontSelect.visible"
            @close="configStore.hideDialog('fontSelect')"
            @apply="handleDialogInsert"
        />
        <BaiZeDialogs.EditorSettingDialog
            :visible="configStore.dialogs.editorSettings.visible"
            @close="configStore.hideDialog('editorSettings')"
        />
        <BaiZeDialogs.SystemSettingDialog
            :visible="configStore.dialogs.systemSettings.visible"
            @close="configStore.hideDialog('systemSettings')"
        />
        <BaiZeDialogs.MermaidEditDialog
            :visible="configStore.dialogs.mermaidEdit.visible"
            @close="configStore.hideDialog('mermaidEdit')"
            @insert="handleDialogInsert"
        />
        <BaiZeDialogs.AdmonitionDialog
            :visible="configStore.dialogs.admonition.visible"
            @close="configStore.hideDialog('admonition')"
            @insert="handleDialogInsert"
        />
        <!-- Material 语法插入：15 项 mkdocs-material 扩展语法，preset 指定打开时选中的语法项 -->
        <BaiZeDialogs.MaterialSyntaxDialog
            :visible="configStore.dialogs.materialSyntax.visible"
            :preset="configStore.dialogs.materialSyntax.preset"
            @close="configStore.hideDialog('materialSyntax')"
            @insert="handleDialogInsert"
        />
        <BaiZeDialogs.MathTextDialog
            :visible="configStore.dialogs.mathText.visible"
            @close="configStore.hideDialog('mathText')"
            @insert="handleDialogInsert"
        />
        <BaiZeDialogs.InsertImageDialog
            :visible="configStore.dialogs.insertImage.visible"
            :picked-image="pickedLocalImage"
            @close="handleCloseInsertImageDialog"
            @browse-file="handleBrowseImageFile"
            @insert="handleDialogInsert"
        />
        <BaiZeDialogs.WebUrlDialog
            :visible="configStore.dialogs.insertLink.visible"
            @close="configStore.hideDialog('insertLink')"
            @insert="handleDialogInsert"
        />
        <BaiZeDialogs.CreateFileFolderDialog
            :visible="configStore.dialogs.createFileFolder.visible"
            :dir-path="configStore.dialogs.createFileFolder.dirPath || ''"
            @close="configStore.hideDialog('createFileFolder')"
            @create="handleCreateFileFolder"
        />
        <!-- 结构优化第 2 批 2.1（H3）：文件管理器右键「重命名/删除」与「新建」统一为
             渲染层 Vue 对话框。主进程只发 OPEN_VUE_DIALOG 请求（含 path/isFile），
             用户在 Vue 对话框确认后由本组件 invoke 主进程动作通道执行。 -->
        <BaiZeDialogs.RenameFileFolderDialog
            :visible="configStore.dialogs.renameFileFolder.visible"
            :path="configStore.dialogs.renameFileFolder.path || ''"
            :is-file="Boolean(configStore.dialogs.renameFileFolder.isFile)"
            @close="configStore.hideDialog('renameFileFolder')"
            @confirm="handleRenameConfirm"
        />
        <BaiZeDialogs.ConfirmDeleteDialog
            :visible="configStore.dialogs.confirmDelete.visible"
            :path="configStore.dialogs.confirmDelete.path || ''"
            :is-file="Boolean(configStore.dialogs.confirmDelete.isFile)"
            @close="configStore.hideDialog('confirmDelete')"
            @confirm="handleConfirmDelete"
        />
        <BaiZeDialogs.HelpAboutDialog
            :visible="configStore.dialogs.helpAbout.visible"
            @close="configStore.hideDialog('helpAbout')"
        />
        <BaiZeDialogs.HelpContactUsDialog
            :visible="configStore.dialogs.helpContact.visible"
            @close="configStore.hideDialog('helpContact')"
        />
        <BaiZeDialogs.TechStackDialog
            :visible="configStore.dialogs.techStack.visible"
            @close="configStore.hideDialog('techStack')"
        />
        <!-- 结构优化第 2 批 2.1（H3）：帮助类 JSDOM 对话框迁移为 Vue + BaseDialog，
             由主进程 help 菜单 handler 经 OPEN_VUE_DIALOG 请求打开。 -->
        <BaiZeDialogs.ShortcutKeysDialog
            :visible="configStore.dialogs.shortcutKeys.visible"
            @close="configStore.hideDialog('shortcutKeys')"
        />
        <BaiZeDialogs.UpdateLogDialog
            :visible="configStore.dialogs.updateLog.visible"
            @close="configStore.hideDialog('updateLog')"
        />
        <BaiZeDialogs.ReleaseNotesDialog
            :visible="configStore.dialogs.releaseNotes.visible"
            :version="configStore.dialogs.releaseNotes.version || ''"
            @close="configStore.hideDialog('releaseNotes')"
        />
        <BaiZeDialogs.QuickLinkSettingDialog
            :visible="configStore.dialogs.quickLinks.visible"
            @close="configStore.hideDialog('quickLinks')"
        />
        <BaiZeDialogs.ImportOptionDialog
            :visible="configStore.dialogs.importOption.visible"
            @close="configStore.hideDialog('importOption')"
            @confirm="handleImportOptionConfirm"
        />
        <!--
            2026-11-20（关闭确认应用内对话框）：关闭/退出「未保存修改」确认宿主。
            主进程 close / before-quit 在脏文件时经 IPC.DIALOG.UNSAVED_CLOSE_REQUEST 请求，
            宿主注册监听并驱动 BaseDialog 风格的 UnsavedChangesDialog（保存并关闭 / 不保存 / 取消）。
            脏文件只可能出现在主界面编辑场景，故宿主随主界面挂载即可；代码随本异步 chunk 加载
            （不进入 150 KiB 入口 chunk 预算）。
        -->
        <UnsavedCloseConfirmHost />
        <!--
            2026-11-21（应用内消息/确认对话框通用服务）：通用消息框宿主。
            主进程 showAppMessageBox() 经 IPC.DIALOG.APP_MESSAGE_REQUEST 请求，宿主驱动
            AppMessageDialog（BaseDialog 外壳）展示并回传选择；挂载/卸载经
            APP_MESSAGE_HOST_READY 通知主进程（宿主未就绪时主进程回退原生框）。
            代码随本异步 chunk 加载，不进入 150 KiB 渲染入口 chunk 预算。
        -->
        <AppMessageBoxHost />
        <!--
            2026-11-21（A2/A9 默认开启）：全工作区搜索/替换对话框 + 命令面板/Quick Open 宿主。
            宿主持有 Ctrl+Shift+F / Ctrl+Shift+P / Ctrl+P 全局快捷键监听，卸载时自动清理；
            两个浮层互斥展示，内部搜索/替换全部走主进程 IPC（只信任工作区根）。
            代码随主界面异步 chunk 加载，不进入渲染入口 chunk 预算。
        -->
        <SearchOverlayHost />
        <!-- 写作模式（P0）：沉浸布局 + 顶部写作控制条；关闭时只保留状态栏入口 -->
        <WritingModeHost />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import WorkSpace from './WorkSpaceArea/WorkSpace.vue'
import StatusBar from './StatusBar.vue'
import MenuBar from './MenuBar.vue'
import EventBus from '../common/event-bus/event-bus'
import type { DialogActionResult, SelectImageResult, SystemSetting } from '../../../shared/types'
// 对话框组件导入（统一命名空间导出）
import * as BaiZeDialogs from './dialogs'
// 2026-11-20（关闭确认应用内对话框）：主界面常驻的关闭确认宿主（监听主进程请求 + 展示确认框）
import UnsavedCloseConfirmHost from './dialogs/UnsavedCloseConfirmHost.vue'
// 2026-11-21（应用内消息/确认对话框通用服务）：通用消息框宿主（OPEN_EXE / 大文件 / 更新提示）
import AppMessageBoxHost from './dialogs/AppMessageBoxHost.vue'
// 2026-11-21（A2/A9 默认开启）：工作区搜索/替换 + 命令面板/Quick Open 宿主
// （快捷键监听与浮层显隐内聚在宿主；本组件只负责挂载与跟随主界面卸载）
import SearchOverlayHost from './search/SearchOverlayHost.vue'
import WritingModeHost from './Markdown/WritingModeHost.vue'
import { initDocumentHistoryFeature } from '../composables/useDocumentHistory'
// 配置 Store
import { getConfigStore } from '../common/useConfigStore'
import type { DialogName } from '../common/useConfigStore'
// 导入 logo SVG 图标
import logoDarkUltra from '../assets/icons/dark/logo-baize-dark-A-ultra.svg'
import logoLightLarge from '../assets/icons/light/logo-baize-light-A-large.svg'
// 窗口管理 composable
import { useWindowManagement } from '../composables/useWindowManagement'
// 第 3 批组件化：标题栏窗口控制按钮统一为公共组件（内部复用 useWindowManagement）
import WindowControls from './common/WindowControls.vue'
// 第 4 批 4.2（M4）：主题单真源——读配置 / CSS 变量应用 / Monaco 主题 / 广播订阅统一收敛到
// useTheme 单例（本组件此前内联了全部主题实现，并与 MenuBar 各自读盘、各自监听广播）。
import { useTheme } from '../composables/useTheme'
import { IPC } from '../../../shared/ipc-channels'
import { t } from '../common/i18n'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import { logger } from '../common/logger'
// P2 功能错误处理修复：导入失败等用户操作错误的详情归一化
import { describeActionError } from '../common/action-feedback'
// P1 性能基线：主界面挂载阶段标记（默认关闭，诊断开关下才输出）
import { PERF_MARK, perfMark, perfMeasure } from '../common/perf'

const configStore = getConfigStore()
// 主题单例（模块级，多组件共享同一状态与订阅；重复挂载不会二次读盘）
const theme = useTheme()

// 性能改造（主界面按需异步加载）配套：向 App.vue 上报「主界面已挂载、IPC 监听器已注册」。
// App.vue 以此作为发送渲染层就绪握手（RENDER.READY）的时序依据——show-welcome=false 等
// 「启动即主界面」路径必须等主界面监听器就位后再握手，否则主进程随后投递的启动恢复数据
// 事件会早于监听器注册到达而丢失（FE-01）。
const emit = defineEmits<{ (event: 'main-view-mounted'): void }>()

const {
    // 标题栏拖拽/双击最大化/窗口缩放仍由本组件实例处理；
    // 最小化/最大化/关闭按钮与 isMaximized 状态同步已内聚到 WindowControls 组件。
    onTitleBarMouseDown,
    onTitleBarDblClick,
    onResizeMouseDown,
    cleanupWindowEvents
} = useWindowManagement({
    onReLayout: EditorReLayout
})

const electronMenu = ref(true)

// 标题栏 logo 明暗：第 4 批 4.2 起统一由 useTheme.isDarkTheme 提供（内部仍走
// shared/constants/theme 的 isDarkThemeType 唯一口径，含 baize-text / baize-starry /
// forest 三处历史归属差异，口径以主题设置对话框 UI 分类为准）。
const logoSrc = computed(() => (theme.isDarkTheme.value ? logoLightLarge : logoDarkUltra))

// 对话框 apply/insert 事件处理 —— 将对话框产生的内容插入到 Monaco 编辑器。
// 历史说明：原 handleFontApply 经 IPC.EDITOR.UPDATE_FONT 发送字体 HTML，但主进程
// 全仓无该通道监听（P2 死通道清理时删除）；该对话框本身不写配置，唯一产物就是
// generateHtml() 生成的 HTML 片段，因此 P1-FE-02 修复后直接复用本函数，
// 经 EventBus MONACO_INSERT_TEXT 插入当前光标位置。

// P1-FE-03：插入图片对话框「本地文件」经主进程选择后的回填数据。
// filePath 用于输入框展示，imageSrc 为实际写入 Markdown 的地址（通常已复制到
// 当前文档 images/ 下，相对引用才能在预览中正常显示）。
const pickedLocalImage = ref<{ filePath: string; imageSrc: string } | null>(null)

function handleDialogInsert(markdown: string) {
    EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, markdown)
}

/**
 * P2 功能错误处理修复：消息对话框是否存在「重试」动作。
 *
 * messageDialogRetry 为模块级 ref（不在 reactive 的 dialogs 内），模板中经 computed
 * 解包；存在时底部渲染「重试」按钮（见模板 #footer-extra 插槽）。
 */
const hasMessageDialogRetry = computed(() => configStore.messageDialogRetry.value !== null)

/** 关闭消息对话框：隐藏 + 清空残留的重试动作（普通消息框不得残留「重试」按钮） */
function handleMessageDialogClose(): void {
    configStore.hideDialog('message')
    configStore.clearMessageDialogRetry()
}

/** 点击「重试」：关闭消息框并重新执行原失败操作（重试动作与日志由 store/helper 负责） */
function handleMessageDialogRetry(): void {
    configStore.runMessageDialogRetry()
}

/**
 * P1-FE-03：插入图片对话框关闭。
 * 除关闭对话框外清空本次本地图片选择：相对引用是相对「复制时活动文件」的，
 * 关闭后再打开时应重新选择，避免把旧文件的 ./images/xxx 插入到别的文件。
 */
function handleCloseInsertImageDialog() {
    configStore.hideDialog('insertImage')
    pickedLocalImage.value = null
}

/**
 * P1-FE-03：「插入图片 → 本地文件 → 浏览」处理。
 * 主进程弹出图片选择框并返回 { canceled, filePath, imageSrc }，选中后回填对话框；
 * 取消或异常不改变对话框已有内容（避免把上次的路径当成本次选择）。
 * 第 2 批契约重构：返回结构统一引用 shared SelectImageResult（主进程 handlers.ts 的
 * selectLocalImageFile 返回形状），不再在调用点内联匿名断言。
 */
async function handleBrowseImageFile() {
    try {
        const result = (await window.electron.ipcRenderer.invoke(
            IPC.FILE.SELECT_IMAGE
        )) as SelectImageResult | null
        if (
            !result ||
            result.canceled ||
            typeof result.filePath !== 'string' ||
            result.filePath.length === 0
        ) {
            return
        }
        const imageSrc =
            typeof result.imageSrc === 'string' && result.imageSrc.length > 0
                ? result.imageSrc
                : result.filePath
        pickedLocalImage.value = { filePath: result.filePath, imageSrc }
    } catch (error) {
        logger.error('选择本地图片失败:', error)
    }
}

// 导入选项确认处理
async function handleImportOptionConfirm(option: 'replace' | 'newfile' | 'insert') {
    const content = configStore.dialogs.importOption.content || ''
    configStore.hideDialog('importOption')

    switch (option) {
        case 'replace':
            EventBus.$emit(EVENT_BUS.MONACO_REPLACE_TEXT, content)
            break

        case 'newfile':
            // P2 功能错误处理修复（导入路径）：invoke 异常（写盘失败/IPC 不可用）此前
            // 成为未捕获 Promise 拒绝，用户看不到反馈。现在弹错误对话框说明失败原因。
            try {
                await window.electron.ipcRenderer.invoke(IPC.FILE.IMPORT_NEW_FILE, content)
            } catch (error) {
                logger.error('导入新文件失败:', error)
                configStore.showError(
                    t('mainMsg.dialog.errorTitle'),
                    t('mainMsg.file.importFailed', {
                        error: describeActionError(error, t('common.unknown'))
                    })
                )
            }
            break

        case 'insert':
            EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, content)
            break
    }
}

// 创建文件/文件夹处理
async function handleCreateFileFolder(data: {
    type: 'file' | 'folder'
    name: string
    dirPath: string
}) {
    const { type, name, dirPath } = data
    // 结构优化第 2 批 2.1（H3）：菜单/右键「新建」收敛到同一 Vue 对话框后，扩展名规则
    // 保持迁移前 JSDOM 对话框语义——文件夹不加后缀；文件名已自带扩展名时不再追加；
    // 纯名称的新建文件默认补 .md（与迁移前「文件默认后缀 .md」提示一致）。
    const extension = type === 'folder' || name.includes('.') ? '' : '.md'

    configStore.hideDialog('createFileFolder')

    try {
        await window.electron.ipcRenderer.invoke(
            IPC.FILE.CREATE_FILE_FOLDER,
            name,
            dirPath,
            type === 'folder',
            extension
        )
    } catch (error) {
        // FE-10：失败不再只打控制台（对话框已关闭、用户看不到任何反馈）。
        // 经全局消息对话框提示主进程异常信息；"已存在/名称非法"等受控分支由主进程自行提示。
        configStore.showError(
            t('workspace.createFileFolder.failedTitle'),
            t('workspace.createFileFolder.failedMessage', {
                name,
                error: error instanceof Error ? error.message : String(error)
            })
        )
        logger.error('创建文件/文件夹失败:', error)
    }
}

/**
 * 结构优化第 2 批 2.1（H3）：重命名对话框确认。
 *
 * 主进程只发 OPEN_VUE_DIALOG('renameFileFolder', { path, isFile }) 请求（原 JSDOM
 * ShowRenameDialog 已删除），确认后由渲染层 invoke RENAME_FILE_FOLDER_SUBMIT：
 * - ok=true：关闭对话框（主进程内部已完成目录刷新/文件重新打开）；
 * - ok=false：主进程已按 FE-09 语义弹出 Vue 消息对话框说明失败原因，这里保留重命名
 *   对话框供用户改名重试（与迁移前「失败保留窗口」行为一致）。
 * invoke 本身异常（IPC 不可用等）走全局消息对话框兜底，不静默。
 */
async function handleRenameConfirm(newName: string) {
    const { path, isFile } = configStore.dialogs.renameFileFolder
    if (!path) {
        configStore.hideDialog('renameFileFolder')
        return
    }
    try {
        const result = (await window.electron.ipcRenderer.invoke(
            IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT,
            path,
            Boolean(isFile),
            newName
        )) as DialogActionResult | null
        if (result?.ok) {
            configStore.hideDialog('renameFileFolder')
        }
    } catch (error) {
        configStore.showError(
            t('mainMsg.dialog.errorTitle'),
            t('mainMsg.status.menuActionFailed', {
                message: error instanceof Error ? error.message : String(error)
            })
        )
        logger.error('重命名失败:', error)
    }
}

/**
 * 结构优化第 2 批 2.1（H3）：删除确认对话框确认。
 *
 * 主进程只发 OPEN_VUE_DIALOG('confirmDelete', { path, isFile }) 请求（原 electron
 * dialog.showMessageBox 已删除），确认后关闭对话框并 invoke DELETE_FILE_FOLDER_CONFIRM；
 * 删除失败提示仍由主进程（DeleteFileFolder 内部 + Vue 消息对话框）负责，
 * invoke 异常走全局消息对话框兜底。
 */
async function handleConfirmDelete() {
    const { path, isFile } = configStore.dialogs.confirmDelete
    configStore.hideDialog('confirmDelete')
    if (!path) {
        return
    }
    try {
        await window.electron.ipcRenderer.invoke(
            IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM,
            path,
            Boolean(isFile)
        )
    } catch (error) {
        configStore.showError(
            t('mainMsg.dialog.errorTitle'),
            t('mainMsg.status.menuActionFailed', {
                message: error instanceof Error ? error.message : String(error)
            })
        )
        logger.error('删除文件/文件夹失败:', error)
    }
}

// 第 4 批 4.2（M4）：Monaco 编辑器主题应用（updateMonacoEditorTheme / loadMonacoTheme）
// 与 THEME_UPDATED 广播处理（handleThemeUpdate）已整体迁移到 composables/useTheme.ts，
// 本组件不再持有 Monaco 动态导入与主题 DOM 写入逻辑。

// P2 死通道清理：原 handleOpenUrlInWebBrowserWindow + IPC.OVERLAY.OPEN_URL
// 监听已删除——该通道主进程零发送方（在线网页由 OpenOnlineWebPages 在主进程侧
// 用 BrowserWindow/shell 打开，不再经渲染层 window.open）。

function handleSystemSettingUpdate(_event: unknown, setting: SystemSetting) {
    electronMenu.value = setting.menuBarStyle === 'electron' || setting.menuBarStyle === 'default'
    // 视觉升级（P0）：界面风格/密度/减少透明变更后即时生效（保存设置 → 主进程广播 →
    // useTheme 写根元素 data-style/data-density，无需重启）。
    theme.applyUiAppearance(setting)
}

function EditorReLayout() {
    setTimeout(() => {
        EventBus.$emit(EVENT_BUS.MONACO_RELAYOUT)
    }, 100)
}

// 打开 Vue 对话框
const handleOpenVueDialog = (
    _event: unknown,
    dialogName: string,
    data?: Record<string, unknown>
) => {
    // P0：主进程菜单/工具入口的「表格」统一走可视化表格编辑器，不再打开旧 mdSheet 对话框
    if (dialogName === 'mdSheet') {
        void import('./dialogs/medium/table-editor')
            .then((module) => module.openTableEditorForActiveEditor())
            .catch((error) => {
                logger.warn('[table] 主进程入口打开统一表格编辑器失败', error)
            })
        return
    }
    if (data) {
        configStore.showDialog(dialogName as DialogName, data)
    } else {
        configStore.showDialog(dialogName as DialogName)
    }
}

// 第 4 批 4.2（M4）：主题广播订阅清理函数由 useTheme 单例提供（订阅实现在 composable 内）。
let unsubscribeThemeUpdates: (() => void) | null = null

onMounted(async () => {
    window.electron.ipcRenderer.on(IPC.SETTING.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
    window.electron.ipcRenderer.on(IPC.DIALOG.OPEN_VUE_DIALOG, handleOpenVueDialog)
    // 第 4 批 4.2：THEME_UPDATED 广播订阅收敛为 useTheme 单例（MenuBar 的重复订阅已删除）
    unsubscribeThemeUpdates = theme.subscribeThemeUpdates()

    // 2026-11-19 修复（第 3 批组件化后）：标题栏最大化状态同步（初始查询 + resize 监听）
    // 已随按钮内聚到 WindowControls 组件，本组件只保留拖拽/缩放相关的清理逻辑。

    // 以上监听器已同步注册完成（子组件的 onMounted 早于本组件的 onMounted 执行），
    // 通知外壳主界面已就绪；App.vue 在此之后才发送 READY 握手，保证启动恢复数据不丢失。
    // P1 性能基线：main-view-mounted 标记放在 emit 之前（组件监听器已就位、主界面 DOM 已挂载）
    perfMark(PERF_MARK.MAIN_VIEW_MOUNTED)
    perfMeasure(PERF_MARK.MAIN_VIEW_MOUNTED)
    emit('main-view-mounted')

    // 第 4 批 4.2（M4）：主题初始化（配置读盘 → 拉取主题样式 → CSS 变量 + Monaco 应用）
    // 由 useTheme 单例统一实现；错误日志与「初始化只执行一次」的防重入语义均在 composable 内。
    await theme.initializeTheme()
    // A3（可选能力）：开启时主界面挂载即开始记录保存快照；关闭时内部直接返回
    void initDocumentHistoryFeature()
    EditorReLayout()
})

onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener(
        IPC.SETTING.SYSTEM_SETTING_UPDATE,
        handleSystemSettingUpdate
    )
    window.electron.ipcRenderer.removeListener(IPC.DIALOG.OPEN_VUE_DIALOG, handleOpenVueDialog)
    unsubscribeThemeUpdates?.()
    unsubscribeThemeUpdates = null
    cleanupWindowEvents()
})
</script>

<style scoped>
.menu-bar {
    /* 视觉升级 T12：菜单栏宿主高度 = 控件高令牌 + 4px 纵向留白（compact 32 / default 36 /
       spacious 40）。此前写死 35px，且由 MenuBar.vue 的非 scoped `#menu-bar` 全局规则
       反向覆盖；现收敛为唯一实现（MenuBar.vue 的全局覆盖已移除）。 */
    height: calc(var(--ui-control-height, 32px) + 4px);
    flex-shrink: 0;
}

.title-bar {
    background: var(--theme-title-bar-gradient);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 0 12px;
    /* 视觉升级（主窗口可见性修复）：paper / glass 标题栏切换为纸感/玻璃面（--bz-shell-*），
       workbench / hybrid 壳层强度为 0 → color-mix 取 100% #fff，与既有白字完全一致。 */
    color: color-mix(
        in srgb,
        var(--ui-text, var(--theme-text-color)) calc(var(--bz-style-on, 0) * 100%),
        #fff
    );
    font-size: 13px;
    height: 30px;
    flex-shrink: 0;
    user-select: none;
    -webkit-app-region: drag;
    /* 为标题栏材质覆盖层（::after）建立局部层叠上下文：覆盖层位于渐变背景之上、文字/按钮之下 */
    position: relative;
    z-index: 0;
}

/* paper / glass 标题栏面：纸感底 + 主题色薄雾 + 底部 hairline + glass 顶部高光边。
   workbench / hybrid（壳层强度 0）时 opacity 0 → 完全不参与绘制（默认观感零变化）。 */
.title-bar::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    pointer-events: none;
    opacity: 0;
    opacity: var(--bz-style-on, 0);
    background-color: transparent;
    background-color: var(--bz-shell-surface, transparent);
    background-image: linear-gradient(
        var(--bz-shell-veil, transparent),
        var(--bz-shell-veil, transparent)
    );
    box-shadow:
        inset 0 calc(-1 * var(--bz-shell-hairline, 0)) 0 var(--ui-border, var(--theme-border-color)),
        inset 0 1px 0 rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0));
}

/* 窗口控制按钮图标跟随标题栏文字颜色：paper / glass 浅色标题栏需要深色描边；
   workbench / hybrid 下 color-mix 取 100% #fff = 既有白描边（默认观感零变化）。 */
.title-bar :deep(.window-btn svg) {
    stroke: color-mix(
        in srgb,
        var(--ui-text, var(--theme-text-color)) calc(var(--bz-style-on, 0) * 100%),
        #fff
    );
}

.title-left {
    display: flex;
    align-items: center;
    flex: 1;
    -webkit-app-region: drag;
}

.title-text {
    margin-left: 8px;
}

/* 窗口控制容器（按钮本体的尺寸/悬停/no-drag 样式已随组件抽取到 WindowControls.vue） */
.window-controls {
    display: flex;
    /* 2026-11-19：原值 align-items: right 为非法 CSS（交叉轴对齐不接受 right），
       改为合法值 flex-end；按钮自身高 30px 撑满标题栏，横向位置由标题栏的
       justify-content: space-between 决定。 */
    align-items: flex-end;
    gap: 0;
    -webkit-app-region: no-drag;
}

.title-icon {
    width: 20px;
    height: 20px;
    margin-right: 8px;
    vertical-align: middle;
}
/* 需要隐藏滚动条，如果不隐藏，在区域内部，窗口会层叠。
   2026-11-20（编辑器底部光标不可见修复）：工作区高度由 flex 分配，禁止再用
   `calc(100vh - 固定条高)` 推算——顶部条/状态栏高度变化（菜单 35px、状态栏 24px）
   会让写死值失真，编辑器底部被 `.workspace-area` 裁掉，Monaco 视口延伸到裁剪区，
   回车后光标行落在状态栏后面。min-height:0 保证 flex 子项可收缩。 */
.workspace-area {
    flex: 1 1 auto;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    min-height: 0;
    height: auto;
}

#workspace-area {
    width: 100%;
    display: flex;
    flex-direction: row;
}

.status-bar {
    height: 24px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 12px;
    /* 视觉升级（主窗口可见性修复）：上边框走 1px hairline 令牌（--ui-border 与既有
       --theme-border-color 同值，workbench 观感不变）；表面按风格切换（paper 纸感底 /
       glass 半透明 / workbench 现状），顶部圆角由 --ui-radius-lg 派生（workbench 0 = 现状）。 */
    border-top: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--theme-border-color));
    background-color: var(--theme-card-background);
    background-color: var(--bz-shell-surface, var(--theme-card-background));
    background-image: linear-gradient(
        var(--bz-shell-veil, transparent),
        var(--bz-shell-veil, transparent)
    );
    border-radius: var(--bz-shell-radius, 0) var(--bz-shell-radius, 0) 0 0;
}

#file-bar {
    height: 2px;
    flex-shrink: 0;
    /* 视觉升级（主窗口可见性修复）：paper / glass 收为主题分区线色，workbench / hybrid
       保持 --ui-accent 分隔条（与既有 --theme-accent-color 同值，默认观感零变化）。 */
    background: color-mix(
        in srgb,
        var(--ui-accent, var(--theme-accent-color)) calc(100% - var(--bz-style-on, 0) * 100%),
        var(--ui-border, var(--theme-border-color))
    );
}

@supports (width: calc(1px / 1px * 1px)) and
    (color: color-mix(in srgb, currentColor 0%, transparent)) {
    #editor-container {
        /* ========================================================================
     * 主窗口壳层材质派生（视觉升级 1.5.5 修复：四风格主窗口可见差异）
     *
     * 只读消费 P0 冻结层令牌（ui-style.css / useTheme / shared 常量），**不写 style/density
     * 分支**：四风格差异全部由令牌数值经 calc/color-mix 连续派生，组件内不含风格判断。
     * - 风格强度 = 大圆角令牌相对 workbench 基准 6px 的差值（paper 2 / glass 6 / workbench 0 /
     *   hybrid 壳层 0、内容区 2）→ workbench 下所有派生值为 0，默认观感基线零变化；
     * - 玻璃强度 = 高光边 alpha 令牌（glass 0.14 / 深色 steady 0.10 / 其余 0）；
     * - 依赖 CSS 类型化除法与 color-mix（Electron 43 = Chromium 150 已支持）；整块用
     *   @supports 包裹：不支持时变量不定义，各消费点 var(--bz-*, 兜底) 回退升级前观感
     *   （workbench 默认观感不变），不会出现半套材质。
     * 变量定义在本元素、经自定义属性继承供标题栏 / 状态栏 / 侧栏 / 内容区消费。
     * ====================================================================== */
        --bz-style-ratio: calc((var(--ui-radius-lg, 6px) - 6px) / 1px);
        --bz-content-ratio: calc((var(--ui-content-radius-lg, 6px) - 6px) / 1px);
        --bz-style-on: min(1, var(--bz-style-ratio));
        --bz-content-on: min(1, var(--bz-content-ratio));
        --bz-glass-alpha: var(--ui-highlight-border-alpha, 0);

        /* 壳层表面：glass 半透明（--ui-surface-opacity 0.86）/ 其余不透明（1 = 现状卡片底） */
        --bz-shell-surface: color-mix(
            in srgb,
            var(--ui-bg-elevated, var(--theme-card-background))
                calc(var(--ui-surface-opacity, 1) * 100%),
            transparent
        );
        /* 主题色低饱和薄雾（叠在壳层表面/窗口底色上）：paper 4% / glass 12% / 其余 0% */
        --bz-shell-veil: color-mix(
            in srgb,
            var(--ui-accent) calc(var(--bz-style-ratio) * 2%),
            transparent
        );
        /* 壳层圆角 / hairline 线宽（由 --ui-radius-lg 与 --ui-hairline-width 派生；workbench 0） */
        --bz-shell-radius: calc((var(--ui-radius-lg, 6px) - 6px) * 1.5);
        --bz-shell-hairline: calc(var(--ui-hairline-width, 1px) * var(--bz-style-on));

        /* 内容区表面/薄雾：hybrid 内容区 = paper，故一律消费 --ui-content-* 令牌 */
        --bz-content-surface: color-mix(
            in srgb,
            var(--ui-bg, var(--theme-background-color))
                calc(var(--ui-content-surface-opacity, 1) * 100%),
            transparent
        );
        --bz-content-veil: color-mix(
            in srgb,
            var(--ui-accent) calc(var(--bz-content-ratio) * 2%),
            transparent
        );
        /* 内容区卡片面（编辑器工具栏 / 预览区）：workbench 取 --ui-bg-elevated = 既有
       --theme-card-background（零变化）；paper / hybrid 叠主题色低饱和薄雾（4%），
       glass 再乘内容区不透明度变成半透明面。 */
        --bz-content-card: color-mix(
            in srgb,
            var(--ui-bg-elevated, var(--theme-card-background))
                calc(100% - var(--bz-content-ratio) * 2%),
            var(--ui-accent) calc(var(--bz-content-ratio) * 2%)
        );
        --bz-content-card-surface: color-mix(
            in srgb,
            var(--bz-content-card) calc(var(--ui-content-surface-opacity, 1) * 100%),
            transparent
        );
        --bz-content-radius: calc((var(--ui-content-radius-lg, 6px) - 6px) * 2);
        --bz-content-hairline: calc(var(--ui-hairline-width, 1px) * var(--bz-content-on));
    }
}

#editor-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    position: relative;
    /* 第 4 批 4.2：原 :style="containerStyles" 内联主题色改为 CSS 变量（与主题单真源一致；
       styles/theme.css 的 :root 默认值提供未应用主题时的兜底） */
    color: var(--theme-text-color);

    /* 窗口底色：workbench / hybrid 保持既有 --theme-background-color（--ui-bg 与它同值）；
       paper 叠主题色低饱和薄雾（本次派生 4%）；glass 叠主题强调色/信息色渐层光斑（α 由高光边
       令牌放大，非 glass 时为 0 → 不绘制）。不使用整窗 backdrop-filter（DESIGN.md §3 性能约束）。 */
    background-color: var(--theme-background-color);
    background-color: var(--ui-bg, var(--theme-background-color));
    background-image:
        radial-gradient(
            1100px 620px at 8% -12%,
            color-mix(in srgb, var(--ui-accent) calc(var(--bz-glass-alpha, 0) * 55%), transparent),
            transparent 70%
        ),
        radial-gradient(
            900px 520px at 92% 112%,
            color-mix(
                in srgb,
                var(--ui-info, var(--ui-accent)) calc(var(--bz-glass-alpha, 0) * 28%),
                transparent
            ),
            transparent 72%
        ),
        linear-gradient(
            color-mix(in srgb, var(--ui-accent) calc(var(--bz-style-ratio, 0) * 2%), transparent),
            color-mix(in srgb, var(--ui-accent) calc(var(--bz-style-ratio, 0) * 2%), transparent)
        );
}

/* 窗口大小调整边框 */
.resize-edge {
    position: absolute;
    z-index: 9999;
}

.resize-top {
    top: -3px;
    left: 6px;
    right: 6px;
    height: 6px;
    cursor: n-resize;
}

.resize-bottom {
    bottom: -3px;
    left: 6px;
    right: 6px;
    height: 6px;
    cursor: s-resize;
}

.resize-left {
    left: -3px;
    top: 6px;
    bottom: 6px;
    width: 6px;
    cursor: w-resize;
}

.resize-right {
    right: -3px;
    top: 6px;
    bottom: 6px;
    width: 6px;
    cursor: e-resize;
}

.resize-corner {
    position: absolute;
    z-index: 10000;
    width: 12px;
    height: 12px;
}

.resize-top-left {
    top: -3px;
    left: -3px;
    cursor: nw-resize;
}

.resize-top-right {
    top: -3px;
    right: -3px;
    cursor: ne-resize;
}

.resize-bottom-left {
    bottom: -3px;
    left: -3px;
    cursor: sw-resize;
}

.resize-bottom-right {
    bottom: -3px;
    right: -3px;
    cursor: se-resize;
}
</style>
