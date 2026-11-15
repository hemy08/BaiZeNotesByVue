/**
 * 配置文件管理器
 * 负责在 ~/.baizenotes/config/ 目录下读写 JSON 配置文件
 *
 * ARC-04/05（配置单真源）：渲染层经 config:read/config:write 读写
 * 'system' / 'theme' / 'editor' / 'quick-links' / 'quickLinks' 五个配置名时，
 * 不再落裸 JSON 文件，而是路由到主进程对应的 electron-store 模块
 * （systemSetting.json / theme-config.json / editor-setting.json /
 * quick-link-config.json），与主进程实际读取的配置同源：
 * - 'system' 写入后同步应用自动保存定时器与界面字体 CSS，并广播
 *   system-setting-update 到渲染层（FUN-04 遗留收口）；
 * - 'theme' 写入后向所有窗口广播最新主题（ARC-05 收口）；
 * - 其余配置名仍走裸 JSON 文件（如 recent-folders / show-welcome）。
 *
 * 兼容迁移：启动时一次性把旧渲染层裸写的 system.json 等合并进对应
 * store 并改名标记（详见 migrateLegacyConfigFiles），只执行一次。
 *
 * MEM-10：ipcMain.handle 直连注册迁移至 ipcListenerManager.registerHandleOnce
 * （全局一次性注册，重复注册跳过而非抛错，防 ARC-06 回归）。
 */
import { app, BrowserWindow } from 'electron'
import * as fs from 'fs-extra'
import * as path from 'path'
import { ipcListenerManager } from '../ipc/ipc-listener-manager'
// P1/N-05：配置读写为高风险通道（可改写自动保存/主题/编辑器/快速链接等主进程配置），
// 仅接受主窗口发送方；拒绝时 handle 返回统一错误对象（不执行读写）。
import { withSenderCheck } from '../utils/ipc-security'
import { CONFIG_DIR_NAME } from '../utils/app-paths'
import { IPC } from '../../shared/ipc-channels'
import { saveSystemSetting, getSystemSetting, buildFontCss } from './system-setting'
// CMP-30：语言变更后刷新主进程 i18n 缓存
import { refreshMainLocale } from '../utils/i18n'
import {
    getThemeConfig,
    setThemeConfig,
    getCurrentThemeStyles,
    getMonacoTheme,
    getSeparateEditorTheme
} from './theme-config'
import type { ThemeConfig, ThemeType } from './theme-config'
import {
    applyRendererEditorConfig,
    getEditorSetting,
    getRendererEditorConfig,
    migrateRendererEditorConfig
} from './editor-setting'
import { getRendererQuickLinks, saveRendererQuickLinks } from './quick-link-config'
// AS-4：配置写入白名单 + 字段级 schema 校验（fontFamily CSS 注入 / 非法主题 / 未知配置名）
import { isAllowedConfigName, validateConfigData } from './config-schema'
// P1-FE-06：配置目录备份/恢复（系统设置对话框「立即备份 / 从备份恢复」）
import { getBackupState, handleConfigBackupCommand } from './config-backup'
import { StartAutoSaveFileTime, StopAutoSaveFileTime } from '../utils/file-utils/auto-save'
import { appState } from '../utils/app-state'
// CQ-10：主进程统一日志出口（本文件旧配置迁移曾用 console.log，改为 logger 才落盘/可见）
import { logger } from '../utils/logger'
// ARC-13：SystemSetting 已收敛到 src/shared/types/system.ts（唯一真源）
import type { SystemSetting } from '../../shared/types'

// MEM-10：本模块所有注册均归属的组件 ID（进程级全局注册）
const GLOBAL_CONFIG_IPC_COMPONENT_ID = 'global-config-ipc'

// 配置文件目录（CQ-11：目录名段统一引用 app-paths.CONFIG_DIR_NAME，路径本身不变）
const CONFIG_DIR = path.join(app.getPath('userData'), CONFIG_DIR_NAME)

// ARC-17：configName 白名单正则 —— 仅允许字母/数字/下划线/连字符。
// 排除 ..、/、\ 等路径片段，防止 path.join 拼接被路径逃逸到配置目录之外。
const VALID_CONFIG_NAME_PATTERN = /^[A-Za-z0-9_-]+$/

function isValidConfigName(configName: unknown): configName is string {
    return typeof configName === 'string' && VALID_CONFIG_NAME_PATTERN.test(configName)
}

function isPlainObject(data: unknown): data is Record<string, unknown> {
    return typeof data === 'object' && data !== null && !Array.isArray(data)
}

/**
 * ARC-04：系统设置写入后的副作用应用——自动保存定时器按新值重启，
 * 界面字体 CSS 重新注入，并向渲染层广播最新系统设置（FUN-04 收口）。
 */
function applySystemSettings(data: Record<string, unknown>): void {
    const partial: Partial<SystemSetting> = {}
    if (typeof data.autoSaveEnabled === 'boolean') partial.autoSaveEnabled = data.autoSaveEnabled
    if (typeof data.autoSaveInterval === 'number') partial.autoSaveInterval = data.autoSaveInterval
    if (typeof data.fontFamily === 'string') partial.fontFamily = data.fontFamily
    if (typeof data.fontSize === 'number') partial.fontSize = data.fontSize
    // 其余字段（language/menuBarStyle/扩展字段等）原样透传，由 saveSystemSetting 逐字段校验非 undefined
    const rest: Record<string, unknown> = { ...data }
    delete rest.autoSaveEnabled
    delete rest.autoSaveInterval
    delete rest.fontFamily
    delete rest.fontSize
    saveSystemSetting({ ...partial, ...(rest as Partial<SystemSetting>) })
    // CMP-30：language 变更后使主进程 i18n 缓存失效（HTML 对话框模板随即使用新语言）
    refreshMainLocale()

    // 自动保存定时器：与 handlers.ts 的 AUTO_SAVE_CHANGED 逻辑一致
    if (typeof data.autoSaveEnabled === 'boolean') {
        if (data.autoSaveEnabled) {
            const sec =
                typeof data.autoSaveInterval === 'number' && data.autoSaveInterval >= 5
                    ? data.autoSaveInterval
                    : 60
            StartAutoSaveFileTime(sec * 1000)
        } else {
            StopAutoSaveFileTime()
        }
    }

    // 界面字体：字体设置变更后立即重新注入 CSS（与启动注入一致）
    if (typeof data.fontFamily === 'string' || typeof data.fontSize === 'number') {
        const mainWindow = appState.mainWindow
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.insertCSS(buildFontCss(getSystemSetting()))
        }
    }

    // 广播系统设置变更（渲染层 handleSystemSettingUpdate 依据 menuBarStyle 更新菜单形态）
    const mainWindow = appState.mainWindow
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.EDITOR.SYSTEM_SETTING_UPDATE, getSystemSetting())
    }
}

/**
 * ARC-04：主题配置写入后的广播——向所有窗口发送最新主题数据
 * （payload 形态与 main/index.ts 的 UPDATE_THEME 广播一致）。
 */
function applyThemeConfig(data: Record<string, unknown>): void {
    const partial: Partial<ThemeConfig> = {}
    if (typeof data.currentTheme === 'string') partial.currentTheme = data.currentTheme as ThemeType
    if (typeof data.separateEditorTheme === 'boolean')
        partial.separateEditorTheme = data.separateEditorTheme
    if (typeof data.editorTheme === 'string') partial.editorTheme = data.editorTheme
    setThemeConfig(partial)
    broadcastThemeConfig()
}

/** 向所有窗口广播当前主题（写入后 / 备份恢复后复用同一负载组装） */
function broadcastThemeConfig(): void {
    const themeData = {
        themeStyles: getCurrentThemeStyles(),
        monacoTheme: getMonacoTheme(),
        separateEditorTheme: getSeparateEditorTheme()
    }
    BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) {
            window.webContents.send(IPC.THEME.THEME_UPDATED, themeData)
        }
    })
}

/**
 * P1-FE-05：编辑器设置写入后的广播——向主窗口发送完整 EditorSetting，
 * 渲染层 MarkdownMonacoEditor 已监听 IPC.EDITOR.INIT_SETTING 并即时
 * updateOptions 应用（与启动时 main/index.ts 的初始化广播同一通道、同一形状）。
 */
function broadcastEditorSetting(): void {
    const mainWindow = appState.mainWindow
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send(IPC.EDITOR.INIT_SETTING, getEditorSetting())
    }
}

/**
 * P1-FE-05：渲染层 EditorSettingDialog 保存后的主进程副作用：
 * 1. 映射写入 Monaco 唯一真源 editorSetting（config:write('editor') 不再落双轨键）；
 * 2. 对话框中的自动保存字段属于系统设置（主进程自动保存定时器），复用其副作用；
 * 3. 广播最新编辑器设置，让已挂载的 Monaco 立即应用新配置。
 */
function applyEditorSettingsFromRenderer(data: Record<string, unknown>): void {
    applyRendererEditorConfig(data)

    const autoSave: Record<string, unknown> = {}
    if (typeof data.autoSave === 'boolean') autoSave.autoSaveEnabled = data.autoSave
    if (typeof data.autoSaveInterval === 'number') autoSave.autoSaveInterval = data.autoSaveInterval
    if (Object.keys(autoSave).length > 0) {
        applySystemSettings(autoSave)
    }

    broadcastEditorSetting()
}

/** P1-FE-06：'backup' 配置名承载备份/恢复命令（不落 JSON 文件） */
const BACKUP_CONFIG_NAME = 'backup'

/**
 * ARC-04：路由表——这些配置名不再落裸 JSON，而是读写主进程 electron-store。
 */
const STORE_BACKED_CONFIGS: Record<
    string,
    { read: () => unknown; write: (data: unknown) => void }
> = {
    system: {
        read: () => getSystemSetting(),
        write: (data) => {
            if (isPlainObject(data)) {
                applySystemSettings(data)
            }
        }
    },
    theme: {
        read: () => getThemeConfig(),
        write: (data) => {
            if (isPlainObject(data)) {
                applyThemeConfig(data)
            }
        }
    },
    editor: {
        // P1-FE-05：读写均与主进程 Monaco 唯一真源 editorSetting 同源——
        // 读：反算成渲染层对话框可直接回填的字段；写：映射后落盘并广播刷新。
        read: () => getRendererEditorConfig(),
        write: (data) => {
            if (isPlainObject(data)) {
                applyEditorSettingsFromRenderer(data)
            }
        }
    },
    'quick-links': {
        read: () => getRendererQuickLinks(),
        write: (data) => saveRendererQuickLinks(data)
    },
    quickLinks: {
        read: () => getRendererQuickLinks(),
        write: (data) => saveRendererQuickLinks(data)
    }
}

// 确保配置目录存在
async function ensureConfigDir() {
    await fs.ensureDir(CONFIG_DIR)
}

// 读取配置文件
async function readConfig(configName: string): Promise<Record<string, unknown> | null> {
    if (!isValidConfigName(configName)) {
        logger.warn('[ConfigManager] 拒绝非法配置名（防路径逃逸）:', configName)
        return null
    }
    // ARC-04：store 支撑的配置名路由到主进程 store
    const storeBacked = STORE_BACKED_CONFIGS[configName]
    if (storeBacked) {
        return storeBacked.read() as Record<string, unknown> | null
    }
    // P1-FE-06：'backup' 为备份命令读通道——返回备份列表与最新一次备份名
    if (configName === BACKUP_CONFIG_NAME) {
        // CQ-15：getBackupState() 的具名 interface 无字符串索引签名，而 IPC 返回值契约是
        // 可序列化的 Record<string, unknown>；双重断言仅用于跨"具名结构 → 可序列化字典"
        // 的边界，运行时就是同一对象，未做任何字段改写。
        return getBackupState() as unknown as Record<string, unknown>
    }
    try {
        await ensureConfigDir()
        const configPath = path.join(CONFIG_DIR, `${configName}.json`)

        if (await fs.pathExists(configPath)) {
            const data = await fs.readJson(configPath)
            return data
        }

        return null
    } catch (error) {
        logger.error(`[ConfigManager] Error reading config ${configName}:`, error)
        return null
    }
}

// 写入配置文件
async function writeConfig(configName: string, data: unknown): Promise<boolean> {
    if (!isValidConfigName(configName)) {
        logger.warn('[ConfigManager] 拒绝非法配置名（防路径逃逸）:', configName)
        return false
    }
    // AS-4：配置名白名单——只允许已知业务配置名，未知名称一律拒绝（不落任意 JSON）
    if (!isAllowedConfigName(configName)) {
        logger.warn('[ConfigManager] 拒绝白名单外的配置名:', configName)
        return false
    }
    // AS-4：字段级 schema 校验——结构非法 / fontFamily CSS 注入 / 非法主题等直接拒绝；
    // 未知字段丢弃、超范围数值钳制后仅保留 adjusted 日志（不抛未捕获异常）
    const validation = validateConfigData(configName, data)
    if (!validation.ok) {
        logger.warn(
            `[ConfigManager] 拒绝写入配置 ${configName}（AS-4 校验未通过）：${validation.reason}`
        )
        return false
    }
    if (validation.adjusted && validation.adjusted.length > 0) {
        logger.warn(
            `[ConfigManager] 配置 ${configName} 写入已收敛：`,
            validation.adjusted.join('；')
        )
    }
    const sanitizedData = validation.value
    // ARC-04：store 支撑的配置名路由到主进程 store
    const storeBacked = STORE_BACKED_CONFIGS[configName]
    if (storeBacked) {
        storeBacked.write(sanitizedData)
        return true
    }
    // P1-FE-06：'backup' 为备份命令写通道——data 形如 { action: 'create' | 'restore', ... }。
    // 备份/恢复属于低频动作，复用既有 CONFIG.WRITE 通道而非新增 IPC 通道。
    if (configName === BACKUP_CONFIG_NAME) {
        const ok = handleConfigBackupCommand(sanitizedData)
        if (ok && isPlainObject(sanitizedData) && sanitizedData.action === 'restore') {
            // 恢复后 store 内容已变化：重新应用系统设置副作用并广播主题/编辑器
            // CQ-15：applySystemSettings 的入参是"可序列化设置字典"，而 getSystemSetting
            // 返回具名 SystemSetting（无索引签名）；双重断言用于跨该类型边界，未改写运行时值。
            applySystemSettings(getSystemSetting() as unknown as Record<string, unknown>)
            broadcastThemeConfig()
            broadcastEditorSetting()
        }
        return ok
    }
    try {
        await ensureConfigDir()
        const configPath = path.join(CONFIG_DIR, `${configName}.json`)
        await fs.writeJson(configPath, sanitizedData, { spaces: 2 })
        return true
    } catch (error) {
        logger.error(`[ConfigManager] Error writing config ${configName}:`, error)
        return false
    }
}

// P2 死代码清理：deleteConfig / listConfigs 原仅被 CONFIG.DELETE / CONFIG.LIST
// 两个死通道调用，渲染层 window.api.config.delete/list 已随 preload 一并删除，
// 函数自身也一并移除。

/**
 * ARC-04：一次性兼容迁移——历史版本渲染层经 config:write 在 CONFIG_DIR
 * 落下的裸 JSON（system.json / theme.json / editor.json / quick-links.json /
 * quickLinks.json）若仍然存在，把其中的值合并进主进程对应 store，
 * 随后把旧文件改名加 .legacy-migrated 后缀作为迁移标记，保证只迁移一次
 * （数据保留在磁盘上，可人工回滚）。
 *
 * 行为兼容准则：合并走 saveSystemSetting/setThemeConfig 的"只覆盖传入字段"
 * 语义，主进程 store 中已有的值不会被旧文件清空。
 */
export function migrateLegacyConfigFiles(): void {
    // P1-FE-05：ARC-04 双轨时期渲染层写入的 rendererEditorConfig 键一次性并入
    // editorSetting 后删除（该键 Monaco 从未读取，属于历史数据而非现行格式）
    migrateRendererEditorConfig()

    const legacyMigrators: Array<{ fileName: string; migrate: (data: unknown) => void }> = [
        {
            fileName: 'system',
            migrate: (data) => {
                if (isPlainObject(data)) {
                    saveSystemSetting(data as Partial<SystemSetting>)
                }
            }
        },
        {
            fileName: 'theme',
            migrate: (data) => {
                if (isPlainObject(data)) {
                    const partial: Partial<ThemeConfig> = {}
                    if (typeof data.currentTheme === 'string')
                        partial.currentTheme = data.currentTheme as ThemeType
                    if (typeof data.separateEditorTheme === 'boolean')
                        partial.separateEditorTheme = data.separateEditorTheme
                    if (typeof data.editorTheme === 'string') partial.editorTheme = data.editorTheme
                    setThemeConfig(partial)
                }
            }
        },
        {
            fileName: 'editor',
            migrate: (data) => {
                if (isPlainObject(data)) {
                    // P1-FE-05：旧裸 editor.json（渲染层对话框形状）经映射合并进
                    // Monaco 唯一真源 editorSetting，不再落 rendererEditorConfig 双轨键
                    applyRendererEditorConfig(data)
                }
            }
        },
        {
            fileName: 'quick-links',
            migrate: (data) => saveRendererQuickLinks(data)
        },
        {
            fileName: 'quickLinks',
            migrate: (data) => saveRendererQuickLinks(data)
        }
    ]

    for (const { fileName, migrate } of legacyMigrators) {
        const legacyPath = path.join(CONFIG_DIR, `${fileName}.json`)
        if (!fs.existsSync(legacyPath)) {
            continue
        }
        try {
            const data = fs.readJsonSync(legacyPath)
            migrate(data)
            fs.renameSync(legacyPath, `${legacyPath}.legacy-migrated`)
            // CQ-10：原 console.log 改为 logger.info——旧配置迁移属低频启动日志，
            // 走 logger 才能按级别过滤并写入日志文件（console.log 在打包后不可追溯）。
            logger.info(
                `[ConfigManager] 旧配置 ${fileName}.json 已合并到主进程 store，原文件标记为 .legacy-migrated`
            )
        } catch (error) {
            logger.error(`[ConfigManager] 迁移旧配置 ${fileName}.json 失败:`, error)
        }
    }
}

// 注册 IPC 处理器
export function registerConfigIpcHandlers() {
    // ARC-04：注册时先执行一次旧配置兼容迁移（幂等：迁移完成后旧文件已改名标记）
    migrateLegacyConfigFiles()

    // 读取配置
    // P1/N-05：配置读取暴露主进程配置内容（含主题/编辑器/快速链接等），仅主窗口可信。
    ipcListenerManager.registerHandleOnce(
        IPC.CONFIG.READ,
        withSenderCheck(
            IPC.CONFIG.READ,
            async (_, configName: string) => {
                return await readConfig(configName)
            },
            { kind: 'handle' }
        ),
        GLOBAL_CONFIG_IPC_COMPONENT_ID
    )

    // 写入配置
    // P1/N-05：配置写入会触发主进程 store 落盘与主题/系统设置副作用，仅主窗口可信。
    ipcListenerManager.registerHandleOnce(
        IPC.CONFIG.WRITE,
        withSenderCheck(
            IPC.CONFIG.WRITE,
            async (_, configName: string, data: Record<string, unknown>) => {
                return await writeConfig(configName, data)
            },
            { kind: 'handle' }
        ),
        GLOBAL_CONFIG_IPC_COMPONENT_ID
    )

    // P2 死通道清理：CONFIG.DELETE / CONFIG.LIST / CONFIG.ENSURE_DIR 渲染层
    // （window.api.config.*）零消费，preload 暴露的 delete/list 方法同步删除。
}

// 导出配置管理器实例（P2：deleteConfig/listConfigs 仅被已删除的死通道调用，一并移除）
export const configManager = {
    readConfig,
    writeConfig,
    CONFIG_DIR
}
