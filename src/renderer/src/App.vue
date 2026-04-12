<template>
    <div id="editor-container" :style="containerStyles">
        <!-- 标题栏区域，高度24px，宽度与app一致 -->
        <div v-show="electronMenu" id="title-bar" class="title-bar">
            <div class="title-left">
                <svg class="title-icon" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
                    <defs>
                        <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#667eea;stop-opacity:1" />
                            <stop offset="50%" style="stop-color:#764ba2;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#f093fb;stop-opacity:1" />
                        </linearGradient>
                        <linearGradient id="bodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" style="stop-color:#ffffff;stop-opacity:1" />
                            <stop offset="100%" style="stop-color:#e8e8e8;stop-opacity:1" />
                        </linearGradient>
                    </defs>
                    <rect width="512" height="512" rx="100" fill="url(#bgGrad)"/>
                    <g transform="translate(256, 280)">
                        <ellipse cx="0" cy="0" rx="120" ry="80" fill="url(#bodyGrad)" opacity="0.95"/>
                        <circle cx="0" cy="-60" r="70" fill="url(#bodyGrad)" opacity="0.95"/>
                        <circle cx="-25" cy="-70" r="12" fill="#333"/>
                        <circle cx="25" cy="-70" r="12" fill="#333"/>
                        <circle cx="-22" cy="-73" r="4" fill="#fff"/>
                        <circle cx="28" cy="-73" r="4" fill="#fff"/>
                        <path d="M -30 -120 Q -35 -150 -20 -160 Q -10 -150 -15 -120" fill="#ffd700" stroke="#daa520" stroke-width="2"/>
                        <path d="M 30 -120 Q 35 -150 20 -160 Q 10 -150 15 -120" fill="#ffd700" stroke="#daa520" stroke-width="2"/>
                        <path d="M -60 -40 Q -80 -60 -70 -90 Q -50 -70 -40 -50" fill="#e8e8e8" opacity="0.8"/>
                        <path d="M 60 -40 Q 80 -60 70 -90 Q 50 -70 40 -50" fill="#e8e8e8" opacity="0.8"/>
                        <path d="M -40 -50 Q -60 -40 -70 -20" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round"/>
                        <path d="M 40 -50 Q 60 -40 70 -20" fill="none" stroke="#ccc" stroke-width="2" stroke-linecap="round"/>
                        <rect x="-90" y="40" width="25" height="60" rx="10" fill="url(#bodyGrad)" opacity="0.9"/>
                        <rect x="65" y="40" width="25" height="60" rx="10" fill="url(#bodyGrad)" opacity="0.9"/>
                        <rect x="-50" y="50" width="20" height="50" rx="8" fill="url(#bodyGrad)" opacity="0.9"/>
                        <rect x="30" y="50" width="20" height="50" rx="8" fill="url(#bodyGrad)" opacity="0.9"/>
                        <path d="M 0 80 Q 30 100 50 90 Q 70 80 80 100" fill="none" stroke="url(#bodyGrad)" stroke-width="15" stroke-linecap="round" opacity="0.8"/>
                    </g>
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
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import WorkSpace from './components/WorkSpaceArea/WorkSpace.vue'
import StatusBar from './components/StatusBar.vue'
import MenuBar from './components/MenuBar.vue'
import EventBus from './event-bus'
import * as monaco from 'monaco-editor'
import { SystemSetting } from "../../main/global-types";
const electronMenu = ref(true)

// 主题样式接口
interface ThemeStyles {
    name: string
    description: string
    titleBarGradient: string
    backgroundColor: string
    cardBackground: string
    textColor: string
    secondaryTextColor: string
    borderColor: string
    accentColor: string
    buttonBackground: string
    buttonTextColor: string
    hoverBackground: string
}

// 主题更新数据接口
interface ThemeUpdateData {
    themeType: string
    separateEditorTheme: boolean
    monacoTheme: string
    themeStyles: ThemeStyles
}

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
function applyTheme(theme: ThemeStyles) {
    currentTheme.value = theme

    // 应用CSS变量到根元素
    const root = document.documentElement
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

    // 加载扩展主题
    try {
        const themeData = await import(`@libs/monaco-themes/themes/${themeName}.json`)
        monaco.editor.defineTheme(themeName, themeData.default || themeData)
        monaco.editor.setTheme(themeName)
        return themeName
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

// 窗口控制函数
function minimizeWindow() {
    window.electron.ipcRenderer.send('window-minimize');
}

function maximizeWindow() {
    window.electron.ipcRenderer.send('window-maximize');
}

function closeWindow() {
    window.electron.ipcRenderer.send('window-close');
}

window.electron.ipcRenderer.on('baize-notes:system-setting-update', handleSystemSettingUpdate);
// 打开浏览器网页地址
window.electron.ipcRenderer.on('open-url-in-web-browser-window', handleOpenUrlInWebBrowserWindow);
// 监听主题更新
window.electron.ipcRenderer.on('baize-notes:theme-updated', handleThemeUpdate);


onMounted(async () => {
    // 初始化时请求当前主题配置
    try {
        const themeStyles = await window.electron.ipcRenderer.invoke('get-current-theme-styles')
        const separate = window.electron.ipcRenderer.sendSync('get-separate-editor-theme')
        const monacoTheme = window.electron.ipcRenderer.sendSync('get-monaco-theme')

        if (themeStyles) {
            separateEditorTheme.value = separate
            monacoEditorTheme.value = monacoTheme
            applyTheme(themeStyles)
            await updateMonacoEditorTheme(themeStyles, separate, monacoTheme)
        }
    } catch (error) {
        console.error('Failed to get current theme:', error)
    }
})


onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener('baize-notes:theme-updated', handleThemeUpdate)
    window.electron.ipcRenderer.removeListener('open-url-in-web-browser-window', handleOpenUrlInWebBrowserWindow)
    window.electron.ipcRenderer.removeListener('window-minimize', minimizeWindow)
    window.electron.ipcRenderer.removeListener('window-maximize', maximizeWindow)
    window.electron.ipcRenderer.removeListener('window-close', closeWindow)
    window.electron.ipcRenderer.removeListener('baize-notes:system-setting-update', handleSystemSettingUpdate)
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

.title-left {
    display: flex;
    align-items: center;
    flex: 1;
}

.title-text {
    margin-left: 8px;
}

.window-controls {
    display: flex;
    align-items: center;
    gap: 0;
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
    font-weight: 500;
    height: 30px;
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
}
</style>
