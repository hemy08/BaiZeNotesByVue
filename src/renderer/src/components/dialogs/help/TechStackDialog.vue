<template>
    <!--
        C-2 迁移：regular（40px 标题栏 / 14px 标题）+ circle（28px 圆形关闭按钮）+ 900×700 容器；
        迁移前标题栏是 Electron 无边框窗口拖拽区（-webkit-app-region: drag，且无 cursor:move /
        user-select:none），关闭按钮为 no-drag，这里经 titleBarStyle / closeButtonStyle 内联还原，
        保证拖拽区域与关闭按钮可点击行为不变；底栏为居中的信息条（10px 20px 内边距、11px 次要文字）
        而非操作按钮行，经 footerStyle 将默认的 flex 布局改回块级布局以还原居中文案。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.techStack.title')"
        title-bar-variant="regular"
        close-button-variant="circle"
        width="900px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
        <div class="container">
            <div class="header">
                <h1>🛠️ {{ t('dialogRenderer.techStack.title') }}</h1>
                <p>{{ t('dialogRenderer.techStack.intro') }}</p>
            </div>

            <div class="section">
                <div class="section-title">
                    {{ t('dialogRenderer.techStack.sectionCore') }}
                </div>
                <div class="tech-grid">
                    <div
                        v-for="tech in coreFrameworks"
                        :key="tech.name"
                        class="tech-card"
                        @click="openLink(tech.url)"
                    >
                        <div class="tech-name">{{ tech.name }}</div>
                        <div class="tech-version">
                            {{
                                t('dialogRenderer.common.versionLabel', {
                                    version: tech.version
                                })
                            }}
                        </div>
                        <div class="tech-desc">{{ t(tech.descKey) }}</div>
                        <div class="tech-url">
                            <span>{{ tech.url }}</span>
                            <span class="external-icon">↗</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">
                    {{ t('dialogRenderer.techStack.sectionEditors') }}
                </div>
                <div class="tech-grid">
                    <div
                        v-for="tech in editors"
                        :key="tech.name"
                        class="tech-card"
                        @click="openLink(tech.url)"
                    >
                        <div class="tech-name">{{ tech.name }}</div>
                        <div class="tech-version">
                            {{
                                t('dialogRenderer.common.versionLabel', {
                                    version: tech.version
                                })
                            }}
                        </div>
                        <div class="tech-desc">{{ t(tech.descKey) }}</div>
                        <div class="tech-url">
                            <span>{{ tech.url }}</span>
                            <span class="external-icon">↗</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">
                    {{ t('dialogRenderer.techStack.sectionData') }}
                </div>
                <div class="tech-grid">
                    <div
                        v-for="tech in dataStorage"
                        :key="tech.name"
                        class="tech-card"
                        @click="openLink(tech.url)"
                    >
                        <div class="tech-name">{{ tech.name }}</div>
                        <div class="tech-version">
                            {{
                                t('dialogRenderer.common.versionLabel', {
                                    version: tech.version
                                })
                            }}
                        </div>
                        <div class="tech-desc">{{ t(tech.descKey) }}</div>
                        <div class="tech-url">
                            <span>{{ tech.url }}</span>
                            <span class="external-icon">↗</span>
                        </div>
                    </div>
                </div>
            </div>

            <div class="section">
                <div class="section-title">
                    {{ t('dialogRenderer.techStack.sectionUtilities') }}
                </div>
                <div class="tech-grid">
                    <div
                        v-for="tech in utilities"
                        :key="tech.name"
                        class="tech-card"
                        @click="openLink(tech.url)"
                    >
                        <div class="tech-name">{{ tech.name }}</div>
                        <div class="tech-version">
                            {{
                                t('dialogRenderer.common.versionLabel', {
                                    version: tech.version
                                })
                            }}
                        </div>
                        <div class="tech-desc">{{ t(tech.descKey) }}</div>
                        <div class="tech-url">
                            <span>{{ tech.url }}</span>
                            <span class="external-icon">↗</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            {{ t('dialogRenderer.techStack.footer') }}
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

/**
 * Electron 专有内联样式：BaseDialog 内部的 DialogStyleProperties 未导出，
 * 这里按同构方式在 Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。
 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

interface Props {
    visible: boolean
}

// 迁移前不重置拖拽位置（useDialogDrag 未调用 resetPosition），与 BaseDialog 默认 false 等价。
defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
}>()

// 迁移前标题栏：-webkit-app-region: drag + flex-shrink: 0，且未声明 cursor / user-select
// （BaseDialog 默认标题栏带 cursor:move / user-select:none，这里显式还原为 CSS 初始值 auto，
//   与迁移前未声明时的计算值一致）。
const titleBarStyle: DialogStyleOverrides = {
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    cursor: 'auto',
    userSelect: 'auto'
}
// 迁移前关闭按钮：-webkit-app-region: no-drag（拖拽区内的按钮必须 no-drag 才能点击）。
const closeButtonStyle: DialogStyleOverrides = { WebkitAppRegion: 'no-drag' }
// 迁移前容器固定高 700px（宽度由 width 属性承载）。
const containerStyle: CSSProperties = { height: '700px' }
// 迁移前底栏是居中的信息条（块级布局、10px 20px 内边距、11px 次要文字、不随内容压缩），
// 与 BaseDialog 默认的 flex 操作按钮行不同：改回 display:block 才能保持文案居中。
const footerStyle: CSSProperties = {
    display: 'block',
    padding: '10px 20px',
    textAlign: 'center',
    fontSize: '11px',
    color: 'var(--secondary-text-color)',
    flexShrink: 0
}

const coreFrameworks = [
    {
        name: 'Electron',
        version: '^43.8.10',
        descKey: 'dialogRenderer.techStack.descElectron',
        url: 'https://www.electronjs.org/'
    },
    {
        name: 'Vue 3',
        version: '^3.5.45',
        descKey: 'dialogRenderer.techStack.descVue',
        url: 'https://vuejs.org/'
    },
    {
        name: 'TypeScript',
        version: '^6.0.3',
        descKey: 'dialogRenderer.techStack.descTypeScript',
        url: 'https://www.typescriptlang.org/'
    },
    {
        name: 'Vite',
        version: '^8.3.8',
        descKey: 'dialogRenderer.techStack.descVite',
        url: 'https://vitejs.dev/'
    },
    {
        name: 'electron-vite',
        version: '^6.0.0',
        descKey: 'dialogRenderer.techStack.descElectronVite',
        url: 'https://electron-vite.org/'
    }
]

const editors = [
    {
        name: 'Monaco Editor',
        version: '^0.57.0',
        descKey: 'dialogRenderer.techStack.descMonaco',
        url: 'https://microsoft.github.io/monaco-editor/'
    },
    {
        name: 'markdown-it',
        version: '^15.0.3',
        descKey: 'dialogRenderer.techStack.descMarkdownIt',
        url: 'https://markdown-it.github.io/'
    },
    {
        name: 'Mermaid',
        version: '^12.3.0',
        descKey: 'dialogRenderer.techStack.descMermaid',
        url: 'https://mermaid-js.github.io/mermaid/'
    },
    {
        name: 'KaTeX',
        version: '^0.18.4',
        descKey: 'dialogRenderer.techStack.descKaTeX',
        url: 'https://katex.org/'
    },
    {
        name: 'highlight.js',
        version: '^11.12.0',
        descKey: 'dialogRenderer.techStack.descHighlight',
        url: 'https://highlightjs.org/'
    }
]

const dataStorage = [
    {
        name: 'electron-store',
        version: '^11.0.2',
        descKey: 'dialogRenderer.techStack.descElectronStore',
        url: 'https://github.com/sindresorhus/electron-store'
    },
    {
        name: 'electron-updater',
        version: '^6.8.9',
        descKey: 'dialogRenderer.techStack.descElectronUpdater',
        url: 'https://www.electron.build/auto-update'
    }
]

const utilities = [
    {
        name: 'crypto-js',
        version: '^4.2.0',
        descKey: 'dialogRenderer.techStack.descCryptoJs',
        url: 'https://cryptojs.gitbook.io/docs/'
    },
    {
        name: 'mammoth',
        version: '^1.12.1',
        descKey: 'dialogRenderer.techStack.descMammoth',
        url: 'https://github.com/mwilliamson/mammoth.js'
    },
    {
        name: 'turndown',
        version: '^7.2.4',
        descKey: 'dialogRenderer.techStack.descTurndown',
        url: 'https://github.com/mixmark-io/turndown'
    }
]

function openLink(url: string) {
    if (typeof window !== 'undefined' && window.open) {
        window.open(url, '_blank')
    }
}

function handleClose() {
    emit('close')
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留正文（头部/技术分组卡片）样式。 */
.container {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
}

.header {
    text-align: center;
    margin-bottom: 30px;
}

.header h1 {
    font-size: 28px;
    color: var(--text-color);
    margin-bottom: 10px;
}

.header p {
    font-size: 14px;
    color: var(--secondary-text-color);
}

.section {
    margin-bottom: 30px;
}

.section-title {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 15px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--accent-color);
}

.tech-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 15px;
}

.tech-card {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.3s;
}

.tech-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    border-color: var(--accent-color);
}

.tech-name {
    font-size: 16px;
    font-weight: 600;
    color: var(--accent-color);
    margin-bottom: 8px;
}

.tech-version {
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-bottom: 5px;
}

.tech-desc {
    font-size: 13px;
    color: var(--text-color);
    margin-bottom: 10px;
}

.tech-url {
    font-size: 11px;
    color: var(--accent-color);
    display: flex;
    align-items: center;
    gap: 5px;
}

.external-icon {
    font-size: 10px;
}
</style>
