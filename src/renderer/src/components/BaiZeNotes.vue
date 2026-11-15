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
            <div class="window-controls">
                <button
                    class="window-btn minimize"
                    :title="t('workspace.window.minimize')"
                    @click="minimizeWindow"
                >
                    <svg viewBox="0 0 12 12"><path d="M2 6h8" /></svg>
                </button>
                <button
                    class="window-btn maximize"
                    :title="t('workspace.window.maximize')"
                    @click="maximizeWindow"
                >
                    <svg viewBox="0 0 12 12">
                        <rect x="2" y="2" width="8" height="8" fill="none" />
                    </svg>
                </button>
                <button class="window-btn close" :title="t('common.close')" @click="closeWindow">
                    <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" /></svg>
                </button>
            </div>
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
        <!-- FE-27/P2 死代码清理：Vue RenameDialog 死轨已删除（showRename 全仓无调用方、
             父组件未绑定 @confirm，对话框永远不可见；实际重命名走主进程 HTML 对话框
             ShowRenameDialog，见 FE-09/右键菜单路径）。 -->
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
import * as monaco from 'monaco-editor'
import type { SystemSetting, ThemeStyles, ThemeUpdateData } from '../../../shared/types'
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
import { IPC } from '../../../shared/ipc-channels'
import { t } from '../common/i18n'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import { logger } from '../common/logger'

const configStore = getConfigStore()

const {
    minimizeWindow,
    maximizeWindow,
    closeWindow,
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

const darkThemeTypes = [
    'dark',
    'deepdark',
    'icon',
    'ocean',
    'baize-text',
    'baize-starry',
    'baize-data-dark',
    'baize-mirror-dark'
]

const logoSrc = computed(() => {
    const themeType = configStore.themeConfig.value.currentTheme
    const isDark = darkThemeTypes.includes(themeType)
    return isDark ? logoLightLarge : logoDarkUltra
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
 */
async function handleBrowseImageFile() {
    try {
        const result = (await window.electron.ipcRenderer.invoke(IPC.FILE.SELECT_IMAGE)) as {
            canceled?: boolean
            filePath?: string | null
            imageSrc?: string | null
        } | null
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
    const extension = '.md'

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

// 更新Monaco编辑器主题
async function updateMonacoEditorTheme(
    theme: ThemeStyles,
    separate: boolean,
    monacoThemeName: string
) {
    if (typeof monaco === 'undefined') return

    // 如果单独配置了编辑器主题，使用配置的主题
    if (separate) {
        // 加载 Monaco 主题
        const loadedTheme = await loadMonacoTheme(monacoThemeName)
        if (loadedTheme) {
            // 通过 IPC 发送主题更新事件
            window.electron.ipcRenderer.send(IPC.EDITOR.UPDATE_OPTIONS, 'theme', loadedTheme)
        }
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

// 加载 Monaco 编辑器主题
async function loadMonacoTheme(themeName: string): Promise<string | null> {
    if (typeof monaco === 'undefined') return null

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
    window.electron.ipcRenderer.on(IPC.EDITOR.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
    window.electron.ipcRenderer.on(IPC.THEME.THEME_UPDATED, handleThemeUpdate)
    window.electron.ipcRenderer.on(IPC.DIALOG.OPEN_VUE_DIALOG, handleOpenVueDialog)

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
        IPC.EDITOR.SYSTEM_SETTING_UPDATE,
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

.window-controls {
    display: flex;
    align-items: right;
    gap: 0;
    -webkit-app-region: no-drag;
}

.window-btn {
    width: 46px;
    height: 30px;
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
    -webkit-app-region: no-drag;
}

.window-btn:hover {
    background: rgba(255, 255, 255, 0.1);
}

.window-btn.close:hover {
    background: #e81123;
}

.window-btn svg {
    width: 12px;
    height: 12px;
    stroke: #fff;
    stroke-width: 1.5;
    fill: none;
}

.window-btn.close:hover svg {
    stroke: #fff;
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
