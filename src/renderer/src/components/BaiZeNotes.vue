<template>
    <div id="editor-container" :style="containerStyles">
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
        <!-- 菜单栏区域，高度24px，宽度与app一致 -->
        <div v-show="electronMenu" id="menu-bar" class="menu-bar"><MenuBar /></div>
        <!-- 应用工具栏和下方区域分割部分，2px高度，宽度与app一致 -->
        <div id="file-bar"></div>
        <!-- 整个工作区域 -->
        <div id="workspace-area" class="workspace-area"><WorkSpace /></div>
        <!-- 状态栏区域，高度10px，宽度与app一致 -->
        <div id="status-bar" class="status-bar" :style="statusBarStyles"><StatusBar /></div>
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
            @close="configStore.hideDialog('message')"
        />
        <BaiZeDialogs.ThemeSettingDialog
            :visible="configStore.dialogs.themeSettings.visible"
            @close="configStore.hideDialog('themeSettings')"
            @change="handleThemeChange"
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
        <BaiZeDialogs.MdSheetDialog
            :visible="configStore.dialogs.mdSheet.visible"
            @close="configStore.hideDialog('mdSheet')"
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
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import WorkSpace from './WorkSpaceArea/WorkSpace.vue'
import StatusBar from './StatusBar.vue'
import MenuBar from './MenuBar.vue'
import EventBus from '../common/event-bus/event-bus'
import type {
    DialogActionResult,
    SelectImageResult,
    SystemSetting,
    ThemeStyles,
    ThemeUpdateData
} from '../../../shared/types'
// 第 2 批契约重构：主题明暗归属统一走 shared 常量（不再本地维护 darkThemeTypes 清单）
import { isDarkThemeType } from '../../../shared/constants/theme'
// 对话框组件导入（统一命名空间导出）
import * as BaiZeDialogs from './dialogs'
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
import { IPC } from '../../../shared/ipc-channels'
import { t } from '../common/i18n'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import { logger } from '../common/logger'

const configStore = getConfigStore()

// =============================================================================================
// 结构优化第 2 批 2.2（H4）：主界面二级分块——Monaco 不再静态进入主界面壳 chunk。
//
// 改造前：本组件 `import * as monaco from 'monaco-editor'` 只为应用编辑器主题，
// 却让 Monaco（约 7.3 MB）随主界面壳同步求值；现在改用动态 import，打包器会生成
// 独立的 Monaco chunk，并让编辑器组件（MarkdownMonacoEditor）与本组件共享同一模块
// 实例（同一 chunk 只下载/求值一次）。
//
// 语义保证：主题应用是异步的，但 setTheme 是 Monaco 全局主题服务的状态；无论编辑器
// 先创建还是主题先应用，最终都会命中当前主题（「编辑器创建晚于主题」时新编辑器直接
// 使用已设置的全局主题）。加载失败仅跳过主题更新，不影响主界面其他功能。
// =============================================================================================

/** Monaco 模块形态（仅类型引用，编译后不产生静态依赖） */
type MonacoModule = typeof import('monaco-editor')

/** Monaco 模块动态加载 Promise（失败后清空，允许主题更新时重试） */
let monacoModulePromise: Promise<MonacoModule> | null = null

/** 按需加载 Monaco 模块（与编辑器组件共享同一打包 chunk） */
async function loadMonacoModule(): Promise<MonacoModule> {
    if (monacoModulePromise === null) {
        monacoModulePromise = import('monaco-editor').catch((error: unknown) => {
            monacoModulePromise = null
            throw error
        })
    }
    return monacoModulePromise
}

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

// 当前主题样式
const currentTheme = ref<ThemeStyles | null>(null)

// 第 2 批契约重构：标题栏 logo 的明暗切换改用 shared/constants/theme 的
// isDarkThemeType（主题明暗归属的唯一真源）——原先本地 darkThemeTypes 清单与
// useConfigStore 的「按名字含 dark 猜明暗」互相矛盾，本次统一（含 baize-text /
// baize-starry / forest 三处历史归属差异，口径以主题设置对话框 UI 分类为准）。
const logoSrc = computed(() => {
    const themeType = configStore.themeConfig.value.currentTheme
    return isDarkThemeType(themeType) ? logoLightLarge : logoDarkUltra
})

// 是否单独配置编辑器主题
const separateEditorTheme = ref(false)

// Monaco 编辑器主题
const monacoEditorTheme = ref('vs')

// 计算容器样式
const containerStyles = computed(() => {
    if (!currentTheme.value) return {}
    return {
        backgroundColor: currentTheme.value.backgroundColor,
        color: currentTheme.value.textColor
    }
})

// 计算状态栏样式
const statusBarStyles = computed(() => {
    if (!currentTheme.value) return {}
    return {
        backgroundColor: currentTheme.value.cardBackground,
        color: currentTheme.value.secondaryTextColor
    }
})

// 应用主题样式
// 主题切换处理函数
async function handleThemeChange(themeType?: string, monacoTheme?: string, separate?: boolean) {
    try {
        // 如果有参数，使用传入的值，否则使用当前配置
        const targetTheme = themeType || configStore.themeConfig.value.currentTheme
        const targetSeparate =
            separate !== undefined ? separate : configStore.themeConfig.value.separateEditorTheme
        const targetMonacoTheme = monacoTheme || configStore.themeConfig.value.editorTheme || 'vs'

        // 更新配置
        configStore.updateThemeConfig({
            currentTheme: targetTheme,
            separateEditorTheme: targetSeparate,
            editorTheme: targetMonacoTheme
        })

        // 获取新的主题样式
        const themeStyles = await window.electron.ipcRenderer.invoke(
            IPC.THEME.GET_CURRENT_THEME_STYLES,
            targetTheme
        )

        if (themeStyles) {
            // 应用新主题
            separateEditorTheme.value = targetSeparate
            monacoEditorTheme.value = targetMonacoTheme
            applyTheme(themeStyles)

            // 更新 Monaco 编辑器主题
            await updateMonacoEditorTheme(themeStyles, targetSeparate, targetMonacoTheme)

            // A-3/FUN-20：主题应用成功后通知主进程向所有窗口广播
            // {themeStyles, monacoTheme, separateEditorTheme} 形态的更新事件，
            // 使主窗口与其他窗口（主进程 HTML 对话框等）正确热同步。
            window.electron.ipcRenderer.send(
                IPC.THEME.UPDATE_THEME,
                targetTheme,
                targetMonacoTheme,
                targetSeparate
            )
        }
    } catch (error) {
        logger.error('Failed to handle theme change:', error)
    }
}

function applyTheme(theme: ThemeStyles) {
    currentTheme.value = theme

    // 应用CSS变量到根元素
    const root = document.documentElement

    // 带前缀的变量（原始）
    root.style.setProperty('--theme-background-color', theme.backgroundColor)
    root.style.setProperty('--theme-card-background', theme.cardBackground)
    root.style.setProperty('--theme-text-color', theme.textColor)
    root.style.setProperty('--theme-secondary-text-color', theme.secondaryTextColor)
    root.style.setProperty('--theme-border-color', theme.borderColor)
    root.style.setProperty('--theme-accent-color', theme.accentColor)
    root.style.setProperty('--theme-button-background', theme.buttonBackground)
    root.style.setProperty('--theme-button-text-color', theme.buttonTextColor)
    root.style.setProperty('--theme-hover-background', theme.hoverBackground)
    root.style.setProperty('--theme-title-bar-gradient', theme.titleBarGradient)

    // 无前缀的别名（对话框组件使用）
    root.style.setProperty('--bg-color', theme.backgroundColor)
    root.style.setProperty('--card-bg', theme.cardBackground)
    root.style.setProperty('--text-color', theme.textColor)
    root.style.setProperty('--secondary-text-color', theme.secondaryTextColor)
    root.style.setProperty('--border-color', theme.borderColor)
    root.style.setProperty('--accent-color', theme.accentColor)
    root.style.setProperty('--button-bg', theme.buttonBackground)
    root.style.setProperty('--button-text-color', theme.buttonTextColor)
    root.style.setProperty('--hover-bg', theme.hoverBackground)
    root.style.setProperty('--title-bar-gradient', theme.titleBarGradient)

    // 更新标题栏样式
    const titleBar = document.querySelector('.title-bar') as HTMLElement
    if (titleBar) {
        titleBar.style.background = theme.titleBarGradient
    }

    // 更新菜单栏样式
    const menuContainer = document.querySelector('.menu-container') as HTMLElement
    if (menuContainer) {
        menuContainer.style.backgroundColor = theme.cardBackground
        menuContainer.style.color = theme.textColor
    }

    // 更新预览区域样式
    const previewContainer = document.querySelector('#markdown-preview-html') as HTMLElement
    if (previewContainer) {
        previewContainer.style.backgroundColor = theme.cardBackground
        previewContainer.style.color = theme.textColor
    }

    // 强制所有组件重新应用主题
    document.querySelectorAll('[data-theme]').forEach((element) => {
        ;(element as HTMLElement).setAttribute('data-theme', theme.name)
    })
}

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
            await window.electron.ipcRenderer.invoke(IPC.FILE.IMPORT_NEW_FILE, content)
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

// 更新Monaco编辑器主题
async function updateMonacoEditorTheme(
    theme: ThemeStyles,
    separate: boolean,
    monacoThemeName: string
) {
    // 结构优化第 2 批 2.2（H4）：主题应用是唯一需要 Monaco 的壳层逻辑，改为按需加载；
    // 加载失败的兜底：只跳过编辑器主题（界面/预览主题仍由 applyTheme 生效），不阻塞启动。
    let monaco: MonacoModule
    try {
        monaco = await loadMonacoModule()
    } catch (error) {
        logger.warn('Monaco 模块加载失败，已跳过编辑器主题更新:', error)
        return
    }

    // 如果单独配置了编辑器主题，使用配置的主题
    if (separate) {
        // 加载 Monaco 主题（loadMonacoTheme 内部已完成 defineTheme + setTheme）
        // 2026-11-18：删除无接收方的 UPDATE_OPTIONS R→M 发送（主进程无该通道监听，
        // 主题实际已由 loadMonacoTheme 本地应用，属空转死分支）
        await loadMonacoTheme(monaco, monacoThemeName)
    } else {
        // 否则根据应用主题自动选择
        const themeName =
            theme.name.includes('dark') ||
            theme.name.includes('深') ||
            theme.name.includes('Dark') ||
            theme.name.includes('黑')
                ? 'vs-dark'
                : 'vs'

        // 动态定义自定义主题
        monaco.editor.defineTheme('custom-theme', {
            base: themeName,
            inherit: true,
            rules: [],
            colors: {
                'editor.background': theme.cardBackground,
                'editor.foreground': theme.textColor,
                'editor.lineHighlightBackground': theme.hoverBackground,
                'editorCursor.foreground': theme.accentColor,
                'editor.selectionBackground': theme.accentColor + '40',
                'editor.inactiveSelectionBackground': theme.accentColor + '20'
            }
        })
        monaco.editor.setTheme('custom-theme')
    }

    // 发送事件通知编辑器组件更新主题
    EventBus.$emit(EVENT_BUS.THEME_UPDATED, theme)
}

// 加载 Monaco 编辑器主题（monaco 模块由调用方按需加载后传入，避免重复动态 import）
async function loadMonacoTheme(monaco: MonacoModule, themeName: string): Promise<string | null> {
    // 内置主题直接设置
    if (themeName === 'vs' || themeName === 'vs-dark' || themeName === 'hc-black') {
        monaco.editor.setTheme(themeName)
        return themeName
    }

    // 从主进程 resources/themes/monaco-themes/ 加载扩展主题
    try {
        const themeData = await window.electron.ipcRenderer.invoke(
            IPC.THEME.LOAD_MONACO_THEME,
            themeName
        )
        if (themeData) {
            monaco.editor.defineTheme(themeName, themeData)
            monaco.editor.setTheme(themeName)
            return themeName
        }
        logger.error(`Monaco theme not found: ${themeName}`)
        monaco.editor.setTheme('vs')
        return 'vs'
    } catch (error) {
        logger.error(`Failed to load Monaco theme: ${themeName}`, error)
        // 失败时回退到默认主题
        monaco.editor.setTheme('vs')
        return 'vs'
    }
}

// 监听主题更新事件
async function handleThemeUpdate(_event: unknown, data: ThemeUpdateData) {
    if (!data || !data.themeStyles) {
        logger.error('[Renderer] Received invalid theme data')
        return
    }

    // 更新配置状态
    separateEditorTheme.value = data.separateEditorTheme
    monacoEditorTheme.value = data.monacoTheme

    // 应用主题样式
    applyTheme(data.themeStyles)

    // 更新 Monaco 编辑器主题
    await updateMonacoEditorTheme(data.themeStyles, data.separateEditorTheme, data.monacoTheme)
}

// P2 死通道清理：原 handleOpenUrlInWebBrowserWindow + IPC.OVERLAY.OPEN_URL
// 监听已删除——该通道主进程零发送方（在线网页由 OpenOnlineWebPages 在主进程侧
// 用 BrowserWindow/shell 打开，不再经渲染层 window.open）。

function handleSystemSettingUpdate(_event: unknown, setting: SystemSetting) {
    electronMenu.value = setting.menuBarStyle === 'electron' || setting.menuBarStyle === 'default'
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
    if (data) {
        configStore.showDialog(dialogName as DialogName, data)
    } else {
        configStore.showDialog(dialogName as DialogName)
    }
}

onMounted(async () => {
    window.electron.ipcRenderer.on(IPC.SETTING.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
    window.electron.ipcRenderer.on(IPC.THEME.THEME_UPDATED, handleThemeUpdate)
    window.electron.ipcRenderer.on(IPC.DIALOG.OPEN_VUE_DIALOG, handleOpenVueDialog)

    // 2026-11-19 修复（第 3 批组件化后）：标题栏最大化状态同步（初始查询 + resize 监听）
    // 已随按钮内聚到 WindowControls 组件，本组件只保留拖拽/缩放相关的清理逻辑。

    // 以上监听器已同步注册完成（子组件的 onMounted 早于本组件的 onMounted 执行），
    // 通知外壳主界面已就绪；App.vue 在此之后才发送 READY 握手，保证启动恢复数据不丢失。
    emit('main-view-mounted')

    // 加载所有配置
    try {
        await configStore.loadAllConfigs()

        // 应用主题配置
        const themeConfig = configStore.themeConfig.value
        const themeStyles = await window.electron.ipcRenderer.invoke(
            IPC.THEME.GET_CURRENT_THEME_STYLES,
            themeConfig.currentTheme
        )

        separateEditorTheme.value = themeConfig.separateEditorTheme
        monacoEditorTheme.value = themeConfig.editorTheme || 'vs'

        if (themeStyles) {
            applyTheme(themeStyles)
            await updateMonacoEditorTheme(
                themeStyles,
                separateEditorTheme.value,
                monacoEditorTheme.value
            )
        }
    } catch (error) {
        logger.error('Failed to load configs:', error)
    }
    EditorReLayout()
})

onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener(
        IPC.SETTING.SYSTEM_SETTING_UPDATE,
        handleSystemSettingUpdate
    )
    window.electron.ipcRenderer.removeListener(IPC.THEME.THEME_UPDATED, handleThemeUpdate)
    window.electron.ipcRenderer.removeListener(IPC.DIALOG.OPEN_VUE_DIALOG, handleOpenVueDialog)
    cleanupWindowEvents()
})
</script>

<style scoped>
.menu-bar {
    height: 35px;
}

.title-bar {
    background: var(--theme-title-bar-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 0 0 12px;
    color: #fff;
    font-size: 13px;
    height: 30px;
    user-select: none;
    -webkit-app-region: drag;
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
/* 需要隐藏滚动条，如果不隐藏，在区域内部，窗口会层叠*/
.workspace-area {
    flex: 1;
    display: flex;
    flex-direction: row;
    overflow: hidden;
    height: calc(100vh - 2px - 30px - 30px - 30px);
}

#workspace-area {
    width: 100%;
    display: flex;
    flex-direction: row;
}

.status-bar {
    height: 24px;
    display: flex;
    align-items: center;
    padding: 0 12px;
    font-size: 12px;
    border-top: 1px solid var(--theme-border-color, #e0e0e0);
}

#file-bar {
    height: 2px;
    background: var(--theme-accent-color, #764ba2);
}

#editor-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    position: relative;
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
