<template>
    <div class="welcome-screen">
        <!-- 窗口控制按钮 -->
        <div class="window-controls">
            <button
                type="button"
                class="window-btn minimize"
                :title="t('workspace.window.minimize')"
                @click="minimizeWindow"
            >
                <svg viewBox="0 0 12 12"><path d="M2 6h8" /></svg>
            </button>
            <button
                type="button"
                class="window-btn maximize"
                :title="isMaximized ? t('workspace.window.restore') : t('workspace.window.maximize')"
                @click="maximizeWindow"
            >
                <svg v-if="!isMaximized" viewBox="0 0 12 12">
                    <rect x="2" y="2" width="8" height="8" fill="none" />
                </svg>
                <svg v-else viewBox="0 0 12 12">
                    <rect x="2" y="4" width="6" height="6" fill="none" />
                    <path d="M4 4V2h6v6H8" fill="none" />
                </svg>
            </button>
            <button type="button" class="window-btn close" :title="t('common.close')" @click="closeWindow">
                <svg viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" /></svg>
            </button>
        </div>

        <div class="welcome-content">
            <!-- Logo 和标题 -->
            <div class="welcome-header">
                <img :src="logoSrc" alt="Baize Logo" width="80" height="80" />
                <h1 class="welcome-title">{{ t('workspace.welcome.title') }}</h1>
                <p class="welcome-subtitle">
                    Markdown Editor Powered By Electron + Vue + TypeScript
                </p>
            </div>

            <!-- 主要操作按钮 -->
            <div class="welcome-actions">
                <button class="welcome-btn primary" @click="openFile">
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <path
                            fill="currentColor"
                            d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20M12,12L16,16H13.5V19H10.5V16H8L12,12Z"
                        />
                    </svg>
                    <span>{{ t('workspace.welcome.openFile') }}</span>
                </button>
                <button class="welcome-btn primary" @click="openFolder">
                    <svg viewBox="0 0 24 24" width="32" height="32">
                        <path
                            fill="currentColor"
                            d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"
                        />
                    </svg>
                    <span>{{ t('workspace.welcome.openFolder') }}</span>
                </button>
            </div>

            <!-- 历史记录 -->
            <div v-if="recentFolders.length > 0" class="welcome-history">
                <h3 class="history-title">{{ t('workspace.welcome.recentFolders') }}</h3>
                <div class="history-list">
                    <div
                        v-for="(folder, index) in recentFolders"
                        :key="index"
                        class="history-item"
                        @click="openRecentFolder(folder)"
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path
                                fill="currentColor"
                                d="M10,4H4C2.89,4 2,4.89 2,6V18A2,2 0 0,0 4,20H20A2,2 0 0,0 22,18V8C22,6.89 21.1,6 20,6H12L10,4Z"
                            />
                        </svg>
                        <span class="history-path">{{ folder }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
// 固定使用深色图标
import logoDarkUltra from '../assets/icons/dark/baize_mirror_dark.svg'
import { IPC } from '../../../shared/ipc-channels'
import { t } from '../common/i18n'
import { logger } from '../common/logger'
import { clampRecentFilesLimit } from '../../../shared/constants/recent-files'

const emit = defineEmits(['openFile', 'openFolder', 'openRecentFolder'])

// 最近打开的文件夹列表
const recentFolders = ref<string[]>([])

// 固定使用深色 logo
const logoSrc = logoDarkUltra

// 加载最近打开的文件夹（展示条数遵循系统设置「最近文件列表数量」）
async function loadRecentFolders() {
    try {
        const [history, systemSetting] = await Promise.all([
            window.api.config.read<string[]>('recent-folders'),
            window.api.config.read<{ recentFilesCount?: number }>('system')
        ])
        const limit = clampRecentFilesLimit(systemSetting?.recentFilesCount)
        if (history && Array.isArray(history)) {
            recentFolders.value = history.slice(0, limit)
        }
    } catch (error) {
        logger.error('Failed to load recent folders:', error)
    }
}

// 打开文件
function openFile() {
    emit('openFile')
}

// 打开文件夹
function openFolder() {
    emit('openFolder')
}

// 打开最近的文件夹
function openRecentFolder(folder: string) {
    emit('openRecentFolder', folder)
}

// 窗口控制
// 2026-11-18（用户反馈）：最大化按钮需支持「再次点击还原」——原实现只发送 MAXIMIZE
// （进入主界面自动最大化专用语义），二次点击无效。改为发送 TOGGLE_MAXIMIZE 并刷新
// 当前最大化状态以切换「最大化/还原」图标。
const isMaximized = ref(false)
// 2026-11-19：最大化状态刷新定时器（点击切换后延迟查询；卸载清理）
let maximizeRefreshTimer: ReturnType<typeof setTimeout> | null = null

async function refreshMaximizedState(): Promise<void> {
    try {
        isMaximized.value = (await window.electron.ipcRenderer.invoke(
            IPC.WINDOW.IS_MAXIMIZED
        )) as boolean
    } catch {
        // 查询失败保持现有状态（不影响按钮操作）
    }
}

function scheduleMaximizeRefresh(delay = 100): void {
    if (maximizeRefreshTimer !== null) {
        clearTimeout(maximizeRefreshTimer)
    }
    maximizeRefreshTimer = setTimeout(() => {
        maximizeRefreshTimer = null
        void refreshMaximizedState()
    }, delay)
}

/** 系统方式（双击拖动条 / Win+Up 等）最大化/还原同样触发 resize，据此同步图标 */
function handleWindowResize(): void {
    scheduleMaximizeRefresh(50)
}

function minimizeWindow() {
    window.electron.ipcRenderer.send(IPC.WINDOW.MINIMIZE)
}

function maximizeWindow() {
    window.electron.ipcRenderer.send(IPC.WINDOW.TOGGLE_MAXIMIZE)
    // 主进程切换完成后刷新图标（延迟查询，避免读到切换前的旧状态）
    scheduleMaximizeRefresh()
}

function closeWindow() {
    window.electron.ipcRenderer.send(IPC.WINDOW.CLOSE)
}

onMounted(() => {
    loadRecentFolders()
    // 2026-11-18：初始化最大化图标状态（欢迎页期间窗口可能已被最大化）
    void refreshMaximizedState()
    window.addEventListener('resize', handleWindowResize)
})

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleWindowResize)
    if (maximizeRefreshTimer !== null) {
        clearTimeout(maximizeRefreshTimer)
        maximizeRefreshTimer = null
    }
})
</script>

<style scoped>
.welcome-screen {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    z-index: 9999;
    overflow: hidden;
}

/* 窗口控制按钮 */
.window-controls {
    width: 100%;
    height: 30px;
    display: flex;
    justify-content: flex-end;
    /* 控制条整体可拖动窗口（无框窗口）；按钮区域经下方 no-drag 恢复交互 */
    -webkit-app-region: drag;
    flex-shrink: 0;
    z-index: 10000;
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
    /* 修复「欢迎页右上角按钮不生效」：drag 区域内的 SVG 子元素默认仍被当作拖动
       热区（-webkit-app-region 非继承、子元素未显式声明 no-drag 时命中祖先 drag），
       导致点击图标本身开始拖动窗口而非触发 click。按钮及其全部子元素显式声明
       no-drag，保证按钮任意位置都可点击。 */
}

.window-btn,
.window-btn svg,
.window-btn svg * {
    -webkit-app-region: no-drag;
}

.window-btn:hover {
    background: rgba(255, 255, 255, 0.25);
}

.window-btn.close:hover {
    background: #e81123;
}

.window-btn svg {
    width: 12px;
    height: 12px;
    stroke: white;
    stroke-width: 1;
    fill: none;
}

.welcome-content {
    width: 100%;
    padding: 2% 3% 3% 3%;
    background: rgba(255, 255, 255, 0.95);
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    backdrop-filter: blur(10px);
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
}

.welcome-header {
    text-align: center;
    margin-bottom: 2%;
    flex-shrink: 0;
}

.welcome-header img {
    margin-bottom: 15px;
    filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
}

.welcome-title {
    font-size: 48px;
    font-weight: 700;
    margin: 0 0 10px 0;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.welcome-subtitle {
    font-size: 18px;
    color: #666;
    margin: 0;
}

.welcome-actions {
    display: flex;
    gap: 30px;
    justify-content: center;
    margin-bottom: 2%;
    flex-shrink: 0;
}

.welcome-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    padding: 20px 40px;
    border: none;
    border-radius: 15px;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 18px;
    font-weight: 600;
}

.welcome-btn.primary {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 8px 20px rgba(102, 126, 234, 0.4);
}

.welcome-btn.primary:hover {
    transform: translateY(-5px);
    box-shadow: 0 12px 30px rgba(102, 126, 234, 0.6);
}

.welcome-btn svg {
    transition: transform 0.3s ease;
}

.welcome-btn:hover svg {
    transform: scale(1.1);
}

.welcome-history {
    margin-top: 2%;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    width: 80%;
    margin-left: auto;
    margin-right: auto;
}
.history-title {
    font-size: 20px;
    font-weight: 600;
    color: #333;
    margin-bottom: 1%;
    padding-bottom: 0.5%;
    border-bottom: 2px solid #e0e0e0;
    flex-shrink: 0;
}

.history-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
    padding-right: 10px;
}

.history-list::-webkit-scrollbar {
    width: 8px;
}

.history-list::-webkit-scrollbar-track {
    background: #f1f1f1;
    border-radius: 4px;
}

.history-list::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 4px;
}

.history-list::-webkit-scrollbar-thumb:hover {
    background: #555;
}

.history-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 20px;
    background: #f5f5f5;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.history-item:hover {
    background: #e8e8e8;
    transform: translateX(5px);
}

.history-item svg {
    color: #764ba2;
    flex-shrink: 0;
}

.history-path {
    font-size: 14px;
    color: #555;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 暗色主题适配 */
@media (prefers-color-scheme: dark) {
    .welcome-content {
        background: rgba(30, 30, 40, 0.95);
        color: #fff;
    }

    .welcome-subtitle {
        color: #aaa;
    }

    .history-title {
        color: #fff;
        border-bottom-color: #444;
    }

    .history-item {
        background: #2a2a3a;
    }

    .history-item:hover {
        background: #3a3a4a;
    }

    .history-path {
        color: #ccc;
    }

    .history-list::-webkit-scrollbar-track {
        background: #2a2a3a;
    }

    .history-list::-webkit-scrollbar-thumb {
        background: #555;
    }

    .history-list::-webkit-scrollbar-thumb:hover {
        background: #777;
    }
}
</style>
