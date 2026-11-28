<template>
    <div class="welcome-screen">
        <!-- 窗口控制按钮（第 3 批组件化：统一走公共 WindowControls；欢迎页使用 welcome 变体） -->
        <WindowControls variant="welcome" />

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
import { defineAsyncComponent, ref, onMounted } from 'vue'
// 固定使用深色图标
import logoDarkUltra from '../assets/icons/dark/baize_mirror_dark.svg'
import { t } from '../common/i18n'
import { logger } from '../common/logger'
import { clampRecentFilesLimit } from '../../../shared/constants/recent-files'
// 第 3 批组件化：窗口控制按钮统一为公共组件（内部复用 useWindowManagement）
// 首屏预算：窗口控制条异步加载，减少欢迎页静态入口 chunk；主界面另有同一组件实例。
const WindowControls = defineAsyncComponent(() => import('./common/WindowControls.vue'))

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

// 窗口控制（最小化 / 最大化·还原 / 关闭）已抽取到公共组件 WindowControls.vue：
// - 点击发送 MINIMIZE / TOGGLE_MAXIMIZE / CLOSE 的 IPC 逻辑与最大化状态同步
//   （初始查询 + resize 监听）统一由 useWindowManagement 提供；
// - 原 2026-11-18/19 的两处修复（TOGGLE 二次点击还原、系统级最大化后图标同步）随逻辑
//   一并迁移，本组件不再保留第二份实现。

onMounted(() => {
    loadRecentFolders()
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
    background: var(--theme-title-bar-gradient);
    /* 应用层欢迎层：相对阶梯令牌 --ui-z-welcome-app（1.5.6 P2-E：9999 → 110，与对话框同层；
       二者互斥渲染不竞争）。变量真源 UI_Z_INDEX_APP_BASE.welcome（ui-style.css :root 声明）。 */
    z-index: var(--ui-z-welcome-app);
    overflow: hidden;
}

/* 窗口控制容器（按钮本体的尺寸/悬停/no-drag 样式已随组件抽取到 WindowControls.vue）：
   - 容器整体保留 drag，作为无框窗口的拖动条；
   - 子组件的按钮与 SVG 在 WindowControls 内统一声明 no-drag，保证按钮可点击。 */
.window-controls {
    width: 100%;
    height: 30px;
    display: flex;
    justify-content: flex-end;
    -webkit-app-region: drag;
    flex-shrink: 0;
    /* 欢迎层内部窗口控制条：恒比欢迎层高 1 档（welcome + 1 = 111）。
       .welcome-screen 为 fixed + z-index 的独立层叠上下文，控制条仅在本层内参与局部排序，
       不改变与对话框/缩放热区的既有栈序（相对阶梯化前后关系一致）。 */
    z-index: calc(var(--ui-z-welcome-app) + 1);
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
    background: var(--theme-title-bar-gradient);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
}

.welcome-subtitle {
    font-size: 18px;
    color: var(--ui-text-secondary);
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
    background: var(--theme-title-bar-gradient);
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
    color: var(--ui-accent);
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
