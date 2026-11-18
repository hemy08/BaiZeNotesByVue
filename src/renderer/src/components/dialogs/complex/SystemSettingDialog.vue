<template>
    <Teleport to="body">
        <Transition name="dialog-fade">
            <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
                <Transition name="dialog-scale">
                    <div
                        v-if="visible"
                        class="dialog-container"
                        :style="dialogStyle"
                        @mousedown="onDialogMouseDown"
                    >
                        <div class="title-bar">
                            <span class="title-text">{{
                                t('dialogRenderer.systemSetting.title')
                            }}</span>
                            <button class="close-btn" @click.stop="handleClose">×</button>
                        </div>

                        <div class="main-container">
                            <div class="sidebar">
                                <div
                                    v-for="item in sidebarItems"
                                    :key="item.id"
                                    :class="['sidebar-item', { active: activePanel === item.id }]"
                                    @click="activePanel = item.id"
                                >
                                    <span class="sidebar-icon">{{ item.icon }}</span>
                                    <span class="sidebar-name">{{ t(item.nameKey) }}</span>
                                </div>
                            </div>

                            <div class="content-area">
                                <div v-show="activePanel === 'general'" class="setting-panel">
                                    <div class="panel-header">
                                        <h3>
                                            {{
                                                t('dialogRenderer.systemSetting.panelGeneralTitle')
                                            }}
                                        </h3>
                                        <p>
                                            {{ t('dialogRenderer.systemSetting.panelGeneralDesc') }}
                                        </p>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupStartup') }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelAutoOpenLastFile'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.autoOpenLastFile"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelAutoOpenLastFolder'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.autoOpenLastFolder"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t('dialogRenderer.systemSetting.labelAutoStart')
                                            }}</label>
                                            <input
                                                v-model="settings.autoStart"
                                                type="checkbox"
                                                class="setting-checkbox"
                                                :title="
                                                    t('dialogRenderer.systemSetting.hintAutoStart')
                                                "
                                            />
                                        </div>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupWindow') }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelMinimizeToTray'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.minimizeToTray"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelRememberWindowSize'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.rememberWindowSize"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                    </div>

                                    <!-- CMP-30：界面语言选择（保存后主进程刷新语言并广播，渲染层即时切换） -->
                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('settings.language.group') }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t('settings.language.label')
                                            }}</label>
                                            <select
                                                v-model="settings.language"
                                                class="setting-select"
                                            >
                                                <option value="zh-CN">
                                                    {{ t('settings.language.zhCN') }}
                                                </option>
                                                <option value="en-US">
                                                    {{ t('settings.language.enUS') }}
                                                </option>
                                            </select>
                                        </div>
                                    </div>

                                    <!-- AS-9（P3 隐私）：远程图片加载开关，默认关闭；保存后主进程广播 system-setting-update，
                       预览（MarkdownPreviewComponent）据此拦截/放行远程图片，无需重启。 -->
                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupPrivacy') }}
                                        </div>
                                        <p class="group-hint">
                                            {{
                                                t(
                                                    'dialogRenderer.systemSetting.hintAllowRemoteImages'
                                                )
                                            }}
                                        </p>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelAllowRemoteImages'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.allowRemoteImages"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div v-show="activePanel === 'file'" class="setting-panel">
                                    <div class="panel-header">
                                        <h3>
                                            {{ t('dialogRenderer.systemSetting.panelFileTitle') }}
                                        </h3>
                                        <p>{{ t('dialogRenderer.systemSetting.panelFileDesc') }}</p>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupDefaultPath') }}
                                        </div>
                                        <p class="group-hint">
                                            {{
                                                t(
                                                    'dialogRenderer.systemSetting.hintDefaultFilePath'
                                                )
                                            }}
                                        </p>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelDefaultFilePath'
                                                )
                                            }}</label>
                                            <div class="path-input-group">
                                                <input
                                                    v-model="settings.defaultFilePath"
                                                    type="text"
                                                    class="setting-input"
                                                    readonly
                                                    :title="
                                                        t(
                                                            'dialogRenderer.systemSetting.hintDefaultFilePath'
                                                        )
                                                    "
                                                />
                                                <button
                                                    class="browse-btn"
                                                    @click="browseDefaultPath"
                                                >
                                                    {{ t('common.browse') }}
                                                </button>
                                            </div>
                                        </div>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{
                                                t(
                                                    'dialogRenderer.systemSetting.groupFileOperations'
                                                )
                                            }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelEnableAutoSave'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.autoSaveEnabled"
                                                type="checkbox"
                                                class="setting-checkbox"
                                                @change="handleAutoSaveChange"
                                            />
                                        </div>
                                        <div v-if="settings.autoSaveEnabled" class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelAutoSaveInterval'
                                                )
                                            }}</label>
                                            <input
                                                v-model.number="settings.autoSaveInterval"
                                                type="number"
                                                class="setting-input"
                                                min="10"
                                                max="300"
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelRecentFilesCount'
                                                )
                                            }}</label>
                                            <input
                                                v-model.number="settings.recentFilesCount"
                                                type="number"
                                                class="setting-input"
                                                min="5"
                                                max="20"
                                                :title="
                                                    t(
                                                        'dialogRenderer.systemSetting.hintRecentFilesCount'
                                                    )
                                                "
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div v-show="activePanel === 'appearance'" class="setting-panel">
                                    <div class="panel-header">
                                        <h3>
                                            {{
                                                t(
                                                    'dialogRenderer.systemSetting.panelAppearanceTitle'
                                                )
                                            }}
                                        </h3>
                                        <p>
                                            {{
                                                t(
                                                    'dialogRenderer.systemSetting.panelAppearanceDesc'
                                                )
                                            }}
                                        </p>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupTheme') }}
                                        </div>
                                        <!-- 批次 C #10：应用主题收口到主题设置对话框（方案 A）——
                                        下拉替换为只读显示当前主题 + 「打开主题设置」按钮，
                                        复用菜单动作同款调用链（configStore.showDialog('themeSettings')），
                                        不新增 IPC；主题切换路径唯一（主题设置对话框）。 -->
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t('dialogRenderer.systemSetting.labelAppTheme')
                                            }}</label>
                                            <div class="theme-current-group">
                                                <span
                                                    class="theme-current-name"
                                                    :title="
                                                        t(
                                                            'dialogRenderer.systemSetting.hintThemeManaged'
                                                        )
                                                    "
                                                >
                                                    {{ appThemeDisplay }}
                                                </span>
                                                <button
                                                    class="browse-btn"
                                                    @click="handleOpenThemeSetting"
                                                >
                                                    {{
                                                        t(
                                                            'dialogRenderer.systemSetting.labelOpenThemeSetting'
                                                        )
                                                    }}
                                                </button>
                                            </div>
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelUseSystemTheme'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.useSystemTheme"
                                                type="checkbox"
                                                class="setting-checkbox"
                                                :title="
                                                    t(
                                                        'dialogRenderer.systemSetting.hintUseSystemTheme'
                                                    )
                                                "
                                            />
                                        </div>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupFont') }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t('dialogRenderer.systemSetting.labelSystemFont')
                                            }}</label>
                                            <select
                                                v-model="settings.fontFamily"
                                                class="setting-select"
                                            >
                                                <option value="Microsoft YaHei">
                                                    {{
                                                        t(
                                                            'dialogRenderer.systemSetting.fontMicrosoftYaHei'
                                                        )
                                                    }}
                                                </option>
                                                <option value="PingFang SC">
                                                    {{
                                                        t(
                                                            'dialogRenderer.systemSetting.fontPingFang'
                                                        )
                                                    }}
                                                </option>
                                                <option value="Segoe UI">Segoe UI</option>
                                                <option value="Arial">Arial</option>
                                            </select>
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t('dialogRenderer.systemSetting.labelFontSize')
                                            }}</label>
                                            <input
                                                v-model.number="settings.fontSize"
                                                type="number"
                                                class="setting-input"
                                                min="12"
                                                max="20"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div v-show="activePanel === 'backup'" class="setting-panel">
                                    <div class="panel-header">
                                        <h3>
                                            {{ t('dialogRenderer.systemSetting.panelBackupTitle') }}
                                        </h3>
                                        <p>
                                            {{ t('dialogRenderer.systemSetting.panelBackupDesc') }}
                                        </p>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupAutoBackup') }}
                                        </div>
                                        <!-- 批次 C #8/#9：自动备份已实现（主进程 auto-backup.ts），
                                        「暂未实现」提示替换为行为说明 -->
                                        <p class="group-hint">
                                            {{
                                                t(
                                                    'dialogRenderer.systemSetting.hintAutoBackupGroup'
                                                )
                                            }}
                                        </p>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelEnableAutoBackup'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.enableAutoBackup"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.systemSetting.labelBackupInterval'
                                                )
                                            }}</label>
                                            <input
                                                v-model.number="settings.backupInterval"
                                                type="number"
                                                class="setting-input"
                                                min="1"
                                                max="72"
                                                :title="
                                                    t(
                                                        'dialogRenderer.systemSetting.hintBackupInterval'
                                                    )
                                                "
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t('dialogRenderer.systemSetting.labelBackupCount')
                                            }}</label>
                                            <input
                                                v-model.number="settings.backupCount"
                                                type="number"
                                                class="setting-input"
                                                min="1"
                                                max="10"
                                                :title="
                                                    t(
                                                        'dialogRenderer.systemSetting.hintBackupRetention'
                                                    )
                                                "
                                            />
                                        </div>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.systemSetting.groupOperations') }}
                                        </div>
                                        <div class="button-group">
                                            <button class="action-btn" @click="handleBackupNow">
                                                {{ t('dialogRenderer.systemSetting.backupNow') }}
                                            </button>
                                            <button class="action-btn" @click="handleRestore">
                                                {{
                                                    t(
                                                        'dialogRenderer.systemSetting.restoreFromBackup'
                                                    )
                                                }}
                                            </button>
                                        </div>
                                        <p v-if="backupStatus" class="backup-status">
                                            {{ backupStatus }}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="footer">
                            <button class="btn btn-cancel" @click="handleCancel">
                                {{ t('common.cancel') }}
                            </button>
                            <button class="btn btn-apply" @click="handleApply">
                                {{ t('common.apply') }}
                            </button>
                            <button class="btn btn-confirm" @click="handleConfirm">
                                {{ t('common.ok') }}
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'
import { IPC } from '../../../../../shared/ipc-channels'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
// 批次 C #10：「打开主题设置」复用菜单动作同款调用链（menu-actions.ts 的
// configStore.showDialog('themeSettings')），不新增 IPC 通道
import { getConfigStore } from '../../../common/useConfigStore'

interface Props {
    visible: boolean
}

// 系统设置对话框的全部字段（含渲染层扩展字段，与主进程 systemSetting.json 同源持久化）
export interface SystemDialogSettings {
    autoOpenLastFile: boolean
    autoOpenLastFolder: boolean
    autoStart: boolean
    minimizeToTray: boolean
    rememberWindowSize: boolean
    language: string
    defaultFilePath: string
    autoSaveEnabled: boolean
    autoSaveInterval: number
    recentFilesCount: number
    appTheme: string
    useSystemTheme: boolean
    fontFamily: string
    fontSize: number
    enableAutoBackup: boolean
    backupInterval: number
    backupCount: number
    // AS-9（P3 隐私）：允许预览加载文档中的远程图片（默认 false，仅本地图片）
    allowRemoteImages: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'apply', settings: SystemDialogSettings): void
}>()

const { dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const activePanel = ref('general')

const sidebarItems = [
    { id: 'general', nameKey: 'dialogRenderer.systemSetting.sidebarGeneral', icon: '⚙️' },
    { id: 'file', nameKey: 'dialogRenderer.systemSetting.sidebarFile', icon: '📁' },
    { id: 'appearance', nameKey: 'dialogRenderer.systemSetting.sidebarAppearance', icon: '🎨' },
    { id: 'backup', nameKey: 'dialogRenderer.systemSetting.sidebarBackup', icon: '💾' }
]

// 保存初始状态，用于取消时恢复（与主进程 system-setting.ts 的新默认值一致：
// P2-10 minimizeToTray / P2-11 enableAutoBackup 均默认关闭，opt-in）
const initialSettings = ref({
    autoOpenLastFile: false,
    autoOpenLastFolder: false,
    autoStart: false,
    minimizeToTray: false,
    rememberWindowSize: true,
    language: 'zh-CN',
    defaultFilePath: '',
    autoSaveEnabled: true,
    autoSaveInterval: 30,
    recentFilesCount: 10,
    appTheme: 'baize',
    useSystemTheme: false,
    fontFamily: 'Microsoft YaHei',
    fontSize: 14,
    enableAutoBackup: false,
    backupInterval: 24,
    backupCount: 5,
    // AS-9（P3 隐私）：安全默认——不加载远程图片
    allowRemoteImages: false
})

const settings = ref<SystemDialogSettings>({ ...initialSettings.value })

/**
 * 批次 C #10：应用主题收口（方案 A）——只读展示当前主题显示名，
 * 数据来自 config:read('theme')（主进程 theme-config 真源）经既有
 * IPC.THEME.GET_ALL_THEMES 通道映射 i18n 显示名；两个通道均为既有通道，
 * 不新增 IPC。读取失败时回退显示主题 type。
 */
const appThemeDisplay = ref('baize')

/** 主进程 getAllThemes() 返回的主题列表项结构（仅取显示名所需字段） */
interface ThemeListItem {
    type: string
    styles?: {
        name?: string
        /** CMP-30：主题名称 i18n key（缺省时回退 name 原文字段） */
        nameKey?: string
    }
}

/** 读取当前主题显示名（打开对话框时随 loadSettings 一并刷新） */
async function loadThemeDisplay(): Promise<void> {
    try {
        const themeConfig = await window.api.config.read<{ currentTheme?: string }>('theme')
        const current = themeConfig?.currentTheme || 'baize'
        const allThemes: unknown = await window.electron.ipcRenderer.invoke(
            IPC.THEME.GET_ALL_THEMES
        )
        if (Array.isArray(allThemes)) {
            const found = (allThemes as ThemeListItem[]).find((item) => item?.type === current)
            const styles = found?.styles
            if (styles?.nameKey) {
                appThemeDisplay.value = t(styles.nameKey)
                return
            }
            if (typeof styles?.name === 'string' && styles.name) {
                appThemeDisplay.value = styles.name
                return
            }
        }
        appThemeDisplay.value = current
    } catch (error) {
        logger.error('读取当前主题显示名失败:', error)
    }
}

/**
 * 批次 C #10：「打开主题设置」——先关闭本对话框（避免两个模态叠加），
 * 再经 configStore.showDialog('themeSettings') 打开主题设置对话框
 * （与菜单动作 baize:menu:setting:theme 同一调用链，不新增 IPC）。
 */
function handleOpenThemeSetting(): void {
    emit('close')
    getConfigStore().showDialog('themeSettings')
}

/** P1-FE-06：备份/恢复操作结果提示（成功后展示备份名与文件数） */
const backupStatus = ref('')

interface BackupListItem {
    name: string
    fileCount: number
}

interface BackupState {
    backups?: BackupListItem[]
    latest?: string | null
}

/** P1-FE-06：备份/恢复都复用既有 CONFIG 通道（configName = 'backup'），不新增 IPC 通道 */
const BACKUP_CONFIG_NAME = 'backup'

// ARC-04：打开对话框时从主进程 systemSetting.json 读取当前值
// （config:read('system') 已由 config-manager 路由到主进程 store），
// 只合并返回中已定义的字段，未返回的字段保持默认值。
async function loadSettings(): Promise<void> {
    try {
        const stored = await window.api.config.read<Partial<SystemDialogSettings>>('system')
        if (stored && typeof stored === 'object') {
            for (const key of Object.keys(settings.value) as (keyof SystemDialogSettings)[]) {
                const value = stored[key]
                if (value !== undefined && typeof value === typeof settings.value[key]) {
                    ;(settings.value as Record<string, unknown>)[key] = value
                }
            }
        }
        // 语言历史值归一化（主进程默认 'zh-cn'，下拉选项值为 'zh-CN' / 'en-US'）
        settings.value.language = String(settings.value.language || '')
            .toLowerCase()
            .startsWith('en')
            ? 'en-US'
            : 'zh-CN'
        // 记录加载后的初始状态，供「取消」还原
        initialSettings.value = { ...settings.value }
    } catch (error) {
        logger.error('加载系统设置失败:', error)
    }
    // 批次 C #10：应用主题只读显示——读取当前主题显示名（独立 try/catch，失败不影响设置加载）
    await loadThemeDisplay()
}

watch(
    () => props.visible,
    async (newVal) => {
        if (!newVal) return
        await loadSettings()
    }
)

/**
 * P1-FE-06：「浏览」默认路径——经既有 IPC.FILE.SELECT_DIRECTORY 拉起系统目录选择器，
 * 选中的路径写入设置，点击「应用/确定」后持久化到 systemSetting.json。
 */
async function browseDefaultPath(): Promise<void> {
    try {
        const selected: unknown = await window.electron.ipcRenderer.invoke(
            IPC.FILE.SELECT_DIRECTORY
        )
        if (typeof selected === 'string' && selected) {
            settings.value.defaultFilePath = selected
        }
    } catch (error) {
        logger.error('选择默认路径失败:', error)
    }
}

// P0-B：主进程该通道以 ipcMain.handle 注册（registerHandleOnce），只有 invoke 可达。
// 原实现用 send 与 handle 模式不匹配 → 切换自动保存开关静默失效；此处统一为 invoke，
// 失败时 console.error 留痕（与上方加载系统设置失败的提示风格一致）。
async function handleAutoSaveChange(): Promise<void> {
    try {
        const result: unknown = await window.electron.ipcRenderer.invoke(
            IPC.SETTING.AUTO_SAVE_CHANGED,
            {
                autoSaveEnabled: settings.value.autoSaveEnabled,
                autoSaveInterval: settings.value.autoSaveInterval
            }
        )
        // 主进程正常路径返回 { ok: true }；显式失败标志时补一条错误日志，便于排查
        if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === false) {
            logger.error('同步自动保存设置失败: 主进程返回失败标志', result)
        }
    } catch (error) {
        logger.error('同步自动保存设置失败:', error)
    }
}

/**
 * P1-FE-06：「立即备份」——主进程把配置目录拷贝到 ~/.baizenotes/config-backups/，
 * 保留数量取当前设置的 backupCount。结果写入 backupStatus 供用户确认。
 */
async function handleBackupNow(): Promise<void> {
    backupStatus.value = ''
    try {
        const ok = await window.api.config.write(BACKUP_CONFIG_NAME, {
            action: 'create',
            keep: settings.value.backupCount
        })
        if (!ok) {
            backupStatus.value = t('dialogRenderer.systemSetting.backupStatusFailed')
            return
        }
        const state = await window.api.config.read<BackupState>(BACKUP_CONFIG_NAME)
        const latest = state?.backups?.[0]
        backupStatus.value = latest
            ? t('dialogRenderer.systemSetting.backupStatusSuccess', {
                  name: latest.name,
                  count: latest.fileCount
              })
            : t('dialogRenderer.systemSetting.backupStatusFailed')
    } catch (error) {
        logger.error('配置备份失败:', error)
        backupStatus.value = t('dialogRenderer.systemSetting.backupStatusFailed')
    }
}

/**
 * P1-FE-06：「从备份恢复」——恢复到最近一次备份（读取备份列表取最新），
 * 主进程拷回配置目录并重新载入各 store，随后刷新对话框显示。
 */
async function handleRestore(): Promise<void> {
    backupStatus.value = ''
    try {
        const state = await window.api.config.read<BackupState>(BACKUP_CONFIG_NAME)
        const name = state?.latest ?? state?.backups?.[0]?.name
        if (!name) {
            backupStatus.value = t('dialogRenderer.systemSetting.restoreStatusNoBackup')
            return
        }
        const ok = await window.api.config.write(BACKUP_CONFIG_NAME, { action: 'restore', name })
        if (!ok) {
            backupStatus.value = t('dialogRenderer.systemSetting.restoreStatusFailed')
            return
        }
        backupStatus.value = t('dialogRenderer.systemSetting.restoreStatusSuccess', { name })
        await loadSettings()
    } catch (error) {
        logger.error('从备份恢复失败:', error)
        backupStatus.value = t('dialogRenderer.systemSetting.restoreStatusFailed')
    }
}

function handleClose() {
    emit('close')
}

// 应用当前配置，不关闭窗口
function handleApply() {
    // 保存配置
    window.api.config.write('system', { ...settings.value })

    // 通知主进程
    emit('apply', { ...settings.value })
}

// 应用配置并关闭窗口
async function handleConfirm() {
    handleApply()
    handleClose()
}

// 取消：恢复初始配置，关闭窗口
function handleCancel() {
    settings.value = { ...initialSettings.value }
    handleClose()
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
    transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
    opacity: 0;
}

.dialog-scale-enter-active,
.dialog-scale-leave-active {
    transition: transform 0.2s ease;
}

.dialog-scale-enter-from,
.dialog-scale-leave-to {
    transform: scale(0.9);
}

.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.dialog-container {
    width: 900px;
    height: 650px;
    background: var(--bg-color);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.title-bar {
    height: 40px;
    background: var(--title-bar-gradient);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 16px;
    cursor: move;
    user-select: none;
    flex-shrink: 0;
}

.title-text {
    color: #fff;
    font-size: 16px;
    font-weight: 600;
}

.close-btn {
    -webkit-app-region: no-drag;
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #fff;
    transition: all 0.2s;
}

.close-btn:hover {
    background: rgba(255, 80, 80, 0.95);
}

.main-container {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.sidebar {
    width: 200px;
    background: var(--card-bg);
    border-right: 1px solid var(--border-color);
    padding: 16px 0;
    flex-shrink: 0;
}

.sidebar-item {
    height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 20px;
    cursor: pointer;
    color: var(--text-color);
    transition: all 0.2s;
    border-left: 3px solid transparent;
}

.sidebar-item:hover {
    background: var(--hover-bg);
}

.sidebar-item.active {
    background: var(--hover-bg);
    color: var(--accent-color);
    border-left-color: var(--accent-color);
}

.sidebar-icon {
    font-size: 18px;
}

.sidebar-name {
    font-size: 13px;
}

.content-area {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}

.setting-panel {
    height: 100%;
}

.panel-header {
    margin-bottom: 24px;
}

.panel-header h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 8px;
}

.panel-header p {
    font-size: 13px;
    color: var(--secondary-text-color);
}

.settings-group {
    margin-bottom: 24px;
    padding: 16px;
    background: var(--card-bg);
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.group-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
}

/* P1-FE-06：分组级提示（暂未实现标注 / 功能说明） */
.group-hint {
    font-size: 12px;
    color: #d48806;
    margin: -8px 0 12px;
}

.backup-status {
    margin-top: 12px;
    font-size: 12px;
    color: var(--secondary-text-color);
    word-break: break-all;
}

/* 暂未实现的设置项：禁用态输入统一弱化展示 */
.setting-checkbox:disabled,
.setting-input:disabled,
.setting-select:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.setting-row:last-child {
    margin-bottom: 0;
}

.setting-label {
    font-size: 13px;
    color: var(--text-color);
}

.setting-input {
    width: 200px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--bg-color);
    transition: border-color 0.2s;
}

.setting-input:focus {
    border-color: var(--accent-color);
    outline: none;
}

.setting-select {
    width: 200px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--bg-color);
    cursor: pointer;
}

.setting-checkbox {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--accent-color);
}

.path-input-group {
    display: flex;
    gap: 8px;
}

/* 批次 C #10：应用主题只读显示 + 「打开主题设置」按钮 */
.theme-current-group {
    display: flex;
    align-items: center;
    gap: 8px;
}

.theme-current-name {
    min-width: 96px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--secondary-text-color);
    background: var(--bg-color);
    text-align: center;
}

.browse-btn {
    padding: 8px 16px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.browse-btn:hover {
    border-color: var(--accent-color);
}

.button-group {
    display: flex;
    gap: 12px;
}

.action-btn {
    padding: 10px 20px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.footer {
    padding: 15px 24px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    border-top: 1px solid var(--border-color);
    background: var(--card-bg);
    flex-shrink: 0;
}

.btn {
    padding: 10px 24px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-cancel {
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    color: var(--text-color);
}

.btn-cancel:hover {
    background: var(--border-color);
}

.btn-apply {
    background: var(--card-bg);
    border: 1px solid var(--accent-color);
    color: var(--accent-color);
}

.btn-apply:hover {
    background: var(--accent-color);
    color: #fff;
}

.btn-confirm {
    background: var(--accent-color);
    color: #fff;
}

.btn:hover {
    opacity: 0.9;
}
</style>
