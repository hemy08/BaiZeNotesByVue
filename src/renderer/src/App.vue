<template>
    <div id="editor-container" :style="containerStyles">
        <!-- 标题栏区域，高度30px，宽度与app一致，支持拖动移动窗口 -->
        <div v-show="electronMenu" id="title-bar" class="title-bar"
            @mousedown="onTitleBarMouseDown"
            @dblclick="onTitleBarDblClick">
            <div class="title-left">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="24" height="24">
                    <defs>
                        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#0B1120"/>
                            <stop offset="100%" style="stop-color:#111B33"/>
                        </linearGradient>
                        <linearGradient id="accent" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#00E0FF"/>
                            <stop offset="100%" style="stop-color:#6C5CE7"/>
                        </linearGradient>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="8" result="blur"/>
                            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
                        </filter>
                    </defs>
                    <rect width="512" height="512" rx="100" fill="url(#bg)"/>
                    <!-- 抽象透镜（科技洞察） -->
                    <path d="M256 128 L384 256 L256 384 L128 256 Z" fill="none" stroke="url(#accent)" stroke-width="12" stroke-linejoin="round" filter="url(#glow)"/>
                    <!-- 内核数据点 -->
                    <circle cx="256" cy="256" r="16" fill="#00E0FF" filter="url(#glow)"/>
                    <circle cx="256" cy="256" r="6" fill="#FFFFFF"/>
                    <!-- 数据轨迹环 -->
                    <ellipse cx="256" cy="256" rx="140" ry="50" fill="none" stroke="#6C5CE7" stroke-width="3" stroke-dasharray="8 12" opacity="0.6" transform="rotate(45 256 256)"/>
                    <!-- 品牌字 -->
                    <text x="256" y="460" font-family="'Inter','Segoe UI',sans-serif" font-size="36" font-weight="700" fill="#FFFFFF" text-anchor="middle" letter-spacing="10">白泽笔记</text>
                    <text x="256" y="492" font-family="'Inter','Segoe UI',sans-serif" font-size="14" font-weight="300" fill="#00E0FF" text-anchor="middle" letter-spacing="6">BAIZE NOTES</text>
                </svg>
                <span class="title-text">白泽笔记 - Markdown Editor Powered By Election + Vue</span>
            </div>
            <div class="window-controls">
                <button class="window-btn minimize" @click="minimizeWindow" title="最小化">
                    <svg viewBox="0 0 12 12"><path d="M2 6h8"/></svg>
                </button>
                <button class="window-btn maximize" @click="maximizeWindow" title="最大化">
                    <svg viewBox="0 0 12 12"><rect x="2" y="2" width="8" height="8" fill="none"/></svg>
                </button>
                <button class="window-btn close" @click="closeWindow" title="关闭">
                    <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8"/></svg>
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
        <div class="resize-edge resize-bottom" @mousedown="onResizeMouseDown('bottom', $event)"></div>
        <div class="resize-edge resize-left" @mousedown="onResizeMouseDown('left', $event)"></div>
        <div class="resize-edge resize-right" @mousedown="onResizeMouseDown('right', $event)"></div>
        <div class="resize-corner resize-top-left" @mousedown="onResizeMouseDown('top-left', $event)"></div>
        <div class="resize-corner resize-top-right" @mousedown="onResizeMouseDown('top-right', $event)"></div>
        <div class="resize-corner resize-bottom-left" @mousedown="onResizeMouseDown('bottom-left', $event)"></div>
        <div class="resize-corner resize-bottom-right" @mousedown="onResizeMouseDown('bottom-right', $event)"></div>

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
        <BaiZeDialogs.MathTextDialog
            :visible="configStore.dialogs.mathText.visible"
            @close="configStore.hideDialog('mathText')"
            @insert="handleDialogInsert"
        />
        <BaiZeDialogs.InsertImageDialog
            :visible="configStore.dialogs.insertImage.visible"
            @close="configStore.hideDialog('insertImage')"
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
        <BaiZeDialogs.RenameDialog
            :visible="configStore.dialogs.rename.visible"
            :current-path="configStore.dialogs.rename.currentPath"
            @close="configStore.hideDialog('rename')"
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
import WorkSpace from './components/WorkSpaceArea/WorkSpace.vue'
import StatusBar from './components/StatusBar.vue'
import MenuBar from './components/MenuBar.vue'
import EventBus from './common/event_bus/event-bus'
import * as monaco from 'monaco-editor'
import { SystemSetting, ThemeStyles, ThemeUpdateData } from "../../main/global-types"

// 对话框组件导入（统一命名空间导出）
import * as BaiZeDialogs from './components/dialogs'

// 配置 Store
import { getConfigStore } from './common/useConfigStore'
const configStore = getConfigStore()

// 暴露 configStore 到 window 对象，供其他模块使用
;(window as any).configStore = configStore

const electronMenu = ref(true)

// 当前主题样式
const currentTheme = ref<ThemeStyles | null>(null)

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
        const targetSeparate = separate !== undefined ? separate : configStore.themeConfig.value.separateEditorTheme
        const targetMonacoTheme = monacoTheme || configStore.themeConfig.value.editorTheme || 'vs'

        // 更新配置
        configStore.updateThemeConfig({
            currentTheme: targetTheme,
            separateEditorTheme: targetSeparate,
            editorTheme: targetMonacoTheme
        })

        // 获取新的主题样式
        const themeStyles = await window.electron.ipcRenderer.invoke('get-current-theme-styles', targetTheme)

        if (themeStyles) {
            // 应用新主题
            separateEditorTheme.value = targetSeparate
            monacoEditorTheme.value = targetMonacoTheme
            applyTheme(themeStyles)

            // 更新 Monaco 编辑器主题
            await updateMonacoEditorTheme(themeStyles, targetSeparate, targetMonacoTheme)
        }
    } catch (error) {
        console.error('Failed to handle theme change:', error)
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
    document.querySelectorAll('[data-theme]').forEach(element => {
        (element as HTMLElement).setAttribute('data-theme', theme.name)
    })
}

// 对话框 insert 事件处理 - 将内容插入到编辑器
function handleDialogInsert(markdown: string) {
    EventBus.$emit('baize:notes:monaco-editor:insert-text', markdown)
}

// 导入选项确认处理
async function handleImportOptionConfirm(option: 'replace' | 'newfile' | 'insert') {
    const content = configStore.dialogs.importOption.content || ''
    configStore.hideDialog('importOption')

    switch (option) {
        case 'replace':
            EventBus.$emit('monaco-editor-replace-text', content)
            break

        case 'newfile':
            await window.electron.ipcRenderer.invoke('baize-notes:import-new-file', content)
            break

        case 'insert':
            EventBus.$emit('baize:notes:monaco-editor:insert-text', content)
            break
    }
}

// 创建文件/文件夹处理
async function handleCreateFileFolder(data: { type: 'file' | 'folder'; name: string; dirPath: string }) {
    const { type, name, dirPath } = data
    const extension = '.md'

    configStore.hideDialog('createFileFolder')

    try {
        await window.electron.ipcRenderer.invoke('baize-notes:create-file-folder', name, dirPath, type === 'folder', extension)
    } catch (error) {
        console.error('创建文件/文件夹失败:', error)
    }
}

// 更新Monaco编辑器主题
async function updateMonacoEditorTheme(theme: ThemeStyles, separate: boolean, monacoThemeName: string) {
    if (typeof monaco === 'undefined') return

    // 如果单独配置了编辑器主题，使用配置的主题
    if (separate) {
        // 加载 Monaco 主题
        const loadedTheme = await loadMonacoTheme(monacoThemeName)
        if (loadedTheme) {
            // 通过 IPC 发送主题更新事件
            window.electron.ipcRenderer.send("baize-notes:monaco-editor-update-options", "theme", loadedTheme)
        }
    } else {
        // 否则根据应用主题自动选择
        const themeName = theme.name.includes('dark') || theme.name.includes('深') ? 'vs-dark' : 'vs'

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

        // 通过 IPC 发送主题更新事件
        window.electron.ipcRenderer.send("monaco-editor-update-options", "theme", "custom-theme")
    }

    // 发送事件通知编辑器组件更新主题
    EventBus.$emit('theme-updated', theme)
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
        const themeData = await window.electron.ipcRenderer.invoke('baize-notes:load-monaco-theme', themeName)
        if (themeData) {
            monaco.editor.defineTheme(themeName, themeData)
            monaco.editor.setTheme(themeName)
            return themeName
        }
        console.error(`Monaco theme not found: ${themeName}`)
        monaco.editor.setTheme('vs')
        return 'vs'
    } catch (error) {
        console.error(`Failed to load Monaco theme: ${themeName}`, error)
        // 失败时回退到默认主题
        monaco.editor.setTheme('vs')
        return 'vs'
    }
}

// 监听主题更新事件
async function handleThemeUpdate(_event: any, data: ThemeUpdateData) {
    console.log('[Renderer] Received theme update:', data)

    if (!data || !data.themeStyles) {
        console.error('[Renderer] Received invalid theme data')
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

function handleOpenUrlInWebBrowserWindow(_event, link: string) {
    window.open(link, '_blank', 'noopener, noreferrer');
}

function handleSystemSettingUpdate(_event: any, setting: SystemSetting) {
    electronMenu.value = setting.menuBarStyle === 'electron' || setting.menuBarStyle === 'default';
}

function EditorReLayout() {
    // 调整大小后通知编辑器重新布局
    setTimeout(() => {
        EventBus.$emit('monaco-editor-relayout')
    }, 100)
}

// 窗口控制函数
function minimizeWindow() {
    window.electron.ipcRenderer.send('window-minimize');
    // 通知Monaco编辑器重新布局
    EditorReLayout()
}

function maximizeWindow() {
    window.electron.ipcRenderer.send('window-maximize');
    // 通知Monaco编辑器重新布局
    EditorReLayout()
}

function closeWindow() {
    window.electron.ipcRenderer.send('window-close');
}

// ========== 标题栏拖动移动窗口 ==========
const isDragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

function onTitleBarMouseDown(e: MouseEvent) {
    // 忽略窗口控制按钮区域的点击
    if ((e.target as HTMLElement).closest('.window-controls')) return
    // 仅响应左键
    if (e.button !== 0) return

    isDragging.value = true

    // 通知主进程开始拖动（如果最大化则还原窗口）
    window.electron.ipcRenderer.send('window-start-drag')

    // 获取窗口当前位置
    const bounds = window.electron.ipcRenderer.sendSync('window-get-bounds')
    if (bounds) {
        // 计算鼠标在窗口内的偏移比例，使窗口还原时鼠标位置合理
        const isMaximized = window.electron.ipcRenderer.sendSync('window-is-maximized')
        if (isMaximized) {
            // 最大化还原后，将鼠标点击位置映射到还原窗口的对应位置
            dragOffset.value = {
                x: bounds.width * (e.screenX - bounds.x) / window.innerWidth,
                y: e.clientY
            }
            // 立即移动窗口使鼠标在标题栏的正确位置
            const newX = e.screenX - dragOffset.value.x
            const newY = e.screenY - dragOffset.value.y
            window.electron.ipcRenderer.send('window-move', newX, newY)
        } else {
            dragOffset.value = {
                x: e.screenX - bounds.x,
                y: e.screenY - bounds.y
            }
        }
    }

    document.addEventListener('mousemove', onDragMouseMove)
    document.addEventListener('mouseup', onDragMouseUp)
    e.preventDefault()
    EditorReLayout()
}

function onDragMouseMove(e: MouseEvent) {
    if (!isDragging.value) return
    const newX = e.screenX - dragOffset.value.x
    const newY = e.screenY - dragOffset.value.y
    window.electron.ipcRenderer.send('window-move', newX, newY)
}

function onDragMouseUp() {
    isDragging.value = false
    document.removeEventListener('mousemove', onDragMouseMove)
    document.removeEventListener('mouseup', onDragMouseUp)
}

// 双击标题栏切换最大化/还原
function onTitleBarDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.window-controls')) return

    console.log('[Renderer] Double click on title bar')
    window.electron.ipcRenderer.send('window-toggle-maximize')
    // 通知Monaco编辑器重新布局
    EditorReLayout()
}

// ========== 窗口大小调整 ==========
type ResizeDirection = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
const isResizing = ref(false)
const resizeInfo = ref<{ direction: ResizeDirection; startX: number; startY: number; startBounds: { x: number; y: number; width: number; height: number } } | null>(null)
const MIN_WIDTH = 800
const MIN_HEIGHT = 600

function onResizeMouseDown(direction: ResizeDirection, e: MouseEvent) {
    if (e.button !== 0) return
    // 最大化状态下不允许调整大小
    const isMaximized = window.electron.ipcRenderer.sendSync('window-is-maximized')
    if (isMaximized) return

    isResizing.value = true
    const bounds = window.electron.ipcRenderer.sendSync('window-get-bounds')
    if (!bounds) return

    resizeInfo.value = {
        direction,
        startX: e.screenX,
        startY: e.screenY,
        startBounds: { ...bounds }
    }

    document.addEventListener('mousemove', onResizeMouseMove)
    document.addEventListener('mouseup', onResizeMouseUp)
    e.preventDefault()
}

function onResizeMouseMove(e: MouseEvent) {
    if (!isResizing.value || !resizeInfo.value) return
    const { direction, startX, startY, startBounds } = resizeInfo.value
    const dx = e.screenX - startX
    const dy = e.screenY - startY

    let { x, y, width, height } = startBounds

    if (direction.includes('right')) {
        width = Math.max(MIN_WIDTH, startBounds.width + dx)
    }
    if (direction.includes('left')) {
        const newWidth = Math.max(MIN_WIDTH, startBounds.width - dx)
        x = startBounds.x + (startBounds.width - newWidth)
        width = newWidth
    }
    if (direction.includes('bottom')) {
        height = Math.max(MIN_HEIGHT, startBounds.height + dy)
    }
    if (direction.includes('top')) {
        const newHeight = Math.max(MIN_HEIGHT, startBounds.height - dy)
        y = startBounds.y + (startBounds.height - newHeight)
        height = newHeight
    }

    window.electron.ipcRenderer.send('window-move', x, y)
    window.electron.ipcRenderer.send('window-set-size', width, height)
}

function onResizeMouseUp() {
    isResizing.value = false
    resizeInfo.value = null
    document.removeEventListener('mousemove', onResizeMouseMove)
    document.removeEventListener('mouseup', onResizeMouseUp)
    // 调整大小后通知编辑器重新布局
    EditorReLayout()
}

window.electron.ipcRenderer.on('baize-notes:system-setting-update', handleSystemSettingUpdate);
// 打开浏览器网页地址
window.electron.ipcRenderer.on('open-url-in-web-browser-window', handleOpenUrlInWebBrowserWindow);
// 监听主题更新
window.electron.ipcRenderer.on('baize-notes:theme-updated', handleThemeUpdate);
// 监听系统设置更新
window.electron.ipcRenderer.on('baize-notes:editor-relayout', EditorReLayout);

onMounted(async () => {
    // 监听 Electron 菜单触发的 Vue 对话框
    window.electron.ipcRenderer.on('open-vue-dialog', (_, dialogName: string, data?: any) => {
        if (data) {
            configStore.showDialog(dialogName as any, data)
        } else {
            configStore.showDialog(dialogName as any)
        }
    })

    // 加载所有配置
    try {
        await configStore.loadAllConfigs()

        // 应用主题配置
        const themeConfig = configStore.themeConfig.value
        const themeStyles = await window.electron.ipcRenderer.invoke('get-current-theme-styles', themeConfig.currentTheme)

        separateEditorTheme.value = themeConfig.separateEditorTheme
        monacoEditorTheme.value = themeConfig.editorTheme || 'vs'

        if (themeStyles) {
            applyTheme(themeStyles)
            await updateMonacoEditorTheme(themeStyles, separateEditorTheme.value, monacoEditorTheme.value)
        }
    } catch (error) {
        console.error('Failed to load configs:', error)
    }
    EditorReLayout()
})


onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener('baize-notes:theme-updated', handleThemeUpdate)
    window.electron.ipcRenderer.removeListener('open-url-in-web-browser-window', handleOpenUrlInWebBrowserWindow)
    window.electron.ipcRenderer.removeListener('window-minimize', minimizeWindow)
    window.electron.ipcRenderer.removeListener('window-maximize', maximizeWindow)
    window.electron.ipcRenderer.removeListener('window-close', closeWindow)
    window.electron.ipcRenderer.removeListener('baize-notes:system-setting-update', handleSystemSettingUpdate)
    window.electron.ipcRenderer.removeListener('open-vue-dialog', () => {})
    // 清理拖动和调整大小的事件监听
    document.removeEventListener('mousemove', onDragMouseMove)
    document.removeEventListener('mouseup', onDragMouseUp)
    document.removeEventListener('mousemove', onResizeMouseMove)
    document.removeEventListener('mouseup', onResizeMouseUp)
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
    padding: 0 12px;
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
    align-items: center;
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
