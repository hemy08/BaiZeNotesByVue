<template>
    <div id="editor-container" :style="containerStyles">
        <!-- 应用工具栏和下发区域分割部分，2px高度，宽度与app一致 -->
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
import EventBus from './event-bus'
import * as monaco from 'monaco-editor'

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

// 当前主题样式
const currentTheme = ref<ThemeStyles | null>(null)

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

    // 更新Monaco编辑器主题
    updateMonacoEditorTheme(theme)

    // 强制所有组件重新应用主题
    document.querySelectorAll('[data-theme]').forEach(element => {
        (element as HTMLElement).setAttribute('data-theme', theme.name)
    })
}

// 更新Monaco编辑器主题
function updateMonacoEditorTheme(theme: ThemeStyles) {
    // 根据主题名称设置Monaco编辑器主题
    const themeName = theme.name.includes('dark') || theme.name.includes('深') ? 'vs-dark' : 'vs'

    // 动态定义自定义主题
    if (typeof monaco !== 'undefined') {
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
    EventBus.$emit('theme-updated', theme)
}

// 监听主题更新事件
function handleThemeUpdate(_event: any, theme: ThemeStyles | undefined) {
    console.log('[Renderer] Received theme update:', theme)
    if (!theme) {
        console.error('[Renderer] Received undefined theme data')
        return
    }
    applyTheme(theme)
}

// 打开浏览器网页地址
window.electron.ipcRenderer.on('open-url-in-web-browser-window', (_, link: string) => {
    window.open(link, '_blank', 'noopener, noreferrer')
})

// 监听主题更新
window.electron.ipcRenderer.on('baize-notes:theme-updated', handleThemeUpdate)

onMounted(async () => {
    // 初始化时请求当前主题
    try {
        const theme = await window.electron.ipcRenderer.invoke('get-current-theme')
        if (theme) {
            applyTheme(theme)
        }
    } catch (error) {
        console.error('Failed to get current theme:', error)
    }
})

onBeforeUnmount(() => {
    window.electron.ipcRenderer.removeListener('baize-notes:theme-updated', handleThemeUpdate)
})
</script>

<style scoped>
/* 需要隐藏滚动条，如果不隐藏，在区域内部，窗口会层叠*/
#editor-container {
    width: 100%;
    height: 100vh;
    overflow: hidden;
}

#file-bar {
    width: 100%;
    height: 0.5px;
}

#workspace-area {
    width: 100%;
    display: flex;
    flex-direction: row;
}

.workspace-area {
    height: calc(100vh - 2px - 20px);
}

.status-bar {
    font-size: 13px;
    height: 20px;
    background-color: var(--theme-card-background, #ffffff);
    color: var(--theme-secondary-text-color, #f5f7fa);
    padding: 0;
    display: flex;
    justify-content: space-between;
    cursor: default;
    user-select: none;
    align-items: center;
    margin: 0;
    z-index: 1000;
}
</style>
