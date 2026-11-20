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
 * MEM-10：ipcMain.handle 直连注册迁移至统一 IPC 注册台账的一次性注册
 * （P1-1 起经 utils/ipc-registration 的依赖倒置 provider 调用，台账口径不变；
 * 全局一次性注册，重复注册跳过而非抛错，防 ARC-06 回归）。
 *
 * P1-1（架构方向门禁）：本文件属 config 业务层，禁止静态 import `src/main/ipc/**`。
 * 为此 IPC 注册能力改为「依赖倒置」——经 utils/ipc-registration 的注入式提供者调用
 * 注册台账，真实实现由 ipc/registry 在启动早期注入（行为/调用顺序/台账口径不变）。
 */
import { app } from 'electron'
import * as fs from 'fs-extra'
import * as path from 'path'
// P1-1：IPC 注册能力经注入式 provider 获取（config 不再直接依赖 ipc/ipc-listener-manager）
import { registerIpcHandleOnce } from '../utils/ipc-registration'
// 2026-11-19：主题广播收敛——配置写入/备份恢复后的主题广播复用主进程唯一广播实现，
// 载荷经 buildThemeBroadcastPayload 统一组装（shared ThemeUpdateData 契约），
// 不再在本文件自行遍历 BrowserWindow 发送 THEME_UPDATED。
// 2026-11-20（P1-1）：广播实现从 ipc/theme-broadcast 迁到中性层 utils/theme-broadcast，
// config 不再静态 import ipc/**。
import { broadcastThemeToAllWindows, buildThemeBroadcastPayload } from '../utils/theme-broadcast'
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
// 批次 B #7：跟随系统主题——useSystemTheme 开启时立即按当前系统深浅色应用一次主题
import { applySystemThemeNow } from './system-theme'
// 批次 B #4：关闭时最小化到托盘——minimizeToTray 开启时确保托盘已创建（单例防护在 tray.ts）
import { ensureTrayCreated } from '../utils/tray'
import { getRendererQuickLinks, saveRendererQuickLinks } from './quick-link-config'
// AS-4：配置写入白名单 + 字段级 schema 校验（fontFamily CSS 注入 / 非法主题 / 未知配置名）
import {
    isAllowedConfigName,
    isMainProcessOnlyConfigName,
    validateConfigData
} from './config-schema'
// P1-FE-06：配置目录备份/恢复（系统设置对话框「立即备份 / 从备份恢复」）
import { getBackupState, handleConfigBackupCommand } from './config-backup'
// 批次 C #8/#9：自动备份——enableAutoBackup/backupInterval 保存后同步定时器
// （仅重启调度，不立即执行备份：首次备份发生在下一个间隔到点）
import { syncAutoBackupTimer } from '../utils/auto-backup'
import { StartAutoSaveFileTime, StopAutoSaveFileTime } from '../utils/file-utils/auto-save'
import { appState } from '../utils/app-state'
// CQ-10：主进程统一日志出口（本文件旧配置迁移曾用 console.log，改为 logger 才落盘/可见）
import { logger } from '../utils/logger'
// ARC-13：SystemSetting 已收敛到 src/shared/types/system.ts（唯一真源）
import type { SystemSetting } from '../../shared/types'
// 「最近文件列表数量」：存量裁剪（file-state 最近文件）与 recent-folders 写入侧截断
import { getLastOpenedDirectory, trimRecentFiles } from '../utils/file-state-store'
import { clampRecentFilesLimit } from '../../shared/constants/recent-files'
// 公共接口归位第 2 批：纯对象判定统一引用 shared/utils/validate 真源
import { isPlainObject } from '../../shared/utils/validate'
// 公共接口归位第 2 批：路径比较前归一化（分隔符/大小写）统一引用 shared/utils/path 真源
import { normalizePathForCompare } from '../../shared/utils/path'
// P1-1（工作区受信根来源收敛）：启动时由主进程持久化历史播种受信根；
// config 层可 import utils（单向），utils 侧不反向依赖 config（架构门禁）
import { seedApprovedWorkspaceRoots } from '../utils/workspace-approval'
import { detectDangerousWorkspaceRoot } from '../utils/workspace-root'

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

/* 公共接口归位第 2 批：isPlainObject 本地副本已删除，统一引用 shared/utils/validate */

/**
 * 开机自启动：把 OS 实际状态校正进 system 配置的读取结果。
 * 用户可能在系统设置（Windows 启动项）中手动改过，或上次 setLoginItemSettings
 * 因权限失败未生效——对话框显示值以 OS 为准，保存时再同步回 store。
 * 开发模式（未打包 electron）下该 API 读取的是开发用 electron 的启动项，
 * 读取失败时回退 store 中的值。
 */
function getLoginItemOpenAtLogin(): boolean {
    try {
        return app.getLoginItemSettings().openAtLogin
    } catch (error) {
        logger.warn('[ConfigManager] 读取开机自启动状态失败（开发模式无效属预期）:', error)
        return getSystemSetting().autoStart === true
    }
}

/**
 * 「最近文件列表数量」变更后的存量裁剪：
 * 1. fileState.recentFiles（最近文件，file-state-store 内部按提供者截断）；
 * 2. recent-folders.json（欢迎页「最近文件夹」裸 JSON 配置）就地裁剪。
 * 同步 fs 仅处理小 JSON 文件，异常时记日志不阻断保存流程。
 */
function trimRecentListsToLimit(): void {
    trimRecentFiles()
    try {
        const recentFoldersPath = path.join(CONFIG_DIR, 'recent-folders.json')
        if (!fs.existsSync(recentFoldersPath)) {
            return
        }
        const folders = fs.readJsonSync(recentFoldersPath) as unknown
        if (!Array.isArray(folders)) {
            return
        }
        const limit = clampRecentFilesLimit(getSystemSetting().recentFilesCount)
        if (folders.length > limit) {
            fs.writeJsonSync(recentFoldersPath, folders.slice(0, limit), { spaces: 2 })
        }
    } catch (error) {
        logger.warn('[ConfigManager] 裁剪最近文件夹列表失败:', error)
    }
}

/**
 * ARC-04：系统设置写入后的副作用应用——自动保存定时器按新值重启，
 * 界面字体 CSS 重新注入，并向渲染层广播最新系统设置（FUN-04 收口）。
 * 补充（系统设置补充实现批次 A）：
 * - autoStart 变更时调用 app.setLoginItemSettings 同步系统登录项；
 * - recentFilesCount 变更时即时裁剪最近文件/最近文件夹存量列表。
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

    // 开机自启动：同步系统登录项（开发模式/未打包时 API 无效，属预期，仅记日志）
    if (typeof data.autoStart === 'boolean') {
        try {
            app.setLoginItemSettings({ openAtLogin: data.autoStart })
        } catch (error) {
            logger.warn('[ConfigManager] 应用开机自启动设置失败（开发模式无效属预期）:', error)
        }
    }

    // 「最近文件列表数量」变更：即时裁剪最近文件与最近文件夹的存量列表
    if (typeof data.recentFilesCount === 'number') {
        trimRecentListsToLimit()
    }

    // 批次 B #4：关闭时最小化到托盘——开启后立即确保托盘已创建（即时生效，无需重启）；
    // 关闭开关时不销毁已有托盘：托盘常驻开销可忽略，保留可避免反复创建/销毁带来的
    // 系统通知闪烁，且用户可能只是临时关闭；托盘由 cleanupApp 在进程退出时统一销毁。
    if (data.minimizeToTray === true) {
        ensureTrayCreated()
    }

    // 批次 B #7：跟随系统主题——开启后立即按当前系统深浅色应用一次主题并广播
    // （nativeTheme 的持续监听在 main/index.ts whenReady 时由 startSystemThemeWatcher 启动）；
    // 关闭时仅停止跟随，不自动改回手动主题（保持用户最后看到的样式）。
    if (data.useSystemTheme === true) {
        applySystemThemeNow()
    }

    // 批次 C #8/#9：自动备份——开关或间隔变更时按最新设置同步定时器（保存即生效）：
    // 仅重启定时器（enableAutoBackup===true 时从下一个间隔到点开始调度、===false 停止），
    // 不立即执行备份（P1-2：避免保存动作在大工作区下同步触发全量备份冻结主进程）。
    if (typeof data.enableAutoBackup === 'boolean' || typeof data.backupInterval === 'number') {
        syncAutoBackupTimer()
    }

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
        mainWindow.webContents.send(IPC.SETTING.SYSTEM_SETTING_UPDATE, getSystemSetting())
    }
}

/**
 * ARC-04：主题配置写入后的广播——经主进程唯一广播实现向所有窗口发送最新主题数据
 * （载荷由 buildThemeBroadcastPayload 统一组装，形态与 shared ThemeUpdateData 契约一致，
 * 与 main/index.ts 的 UPDATE_THEME 广播同源）。
 */
function applyThemeConfig(data: Record<string, unknown>): void {
    const partial: Partial<ThemeConfig> = {}
    if (typeof data.currentTheme === 'string') partial.currentTheme = data.currentTheme as ThemeType
    if (typeof data.separateEditorTheme === 'boolean')
        partial.separateEditorTheme = data.separateEditorTheme
    if (typeof data.editorTheme === 'string') partial.editorTheme = data.editorTheme
    // 批次 B #7：手动切换主题与「跟随系统主题」互斥——本次写入携带 currentTheme
    // （主题设置对话框保存路径）即视为用户手动选择主题，自动关闭跟随开关，
    // 避免下次系统深浅色变化时把用户刚选的手动主题覆盖掉；仅写 editorTheme /
    // separateEditorTheme（不携带 currentTheme）时不关闭跟随。
    if (typeof data.currentTheme === 'string') {
        saveSystemSetting({ useSystemTheme: false })
    }
    setThemeConfig(partial)
    broadcastThemeConfig()
}

/**
 * 向所有窗口广播当前主题（写入后 / 备份恢复后复用同一负载组装与唯一广播实现）。
 * 行为等价改写：原实现自行 BrowserWindow.getAllWindows().forEach + isDestroyed 过滤，
 * 与 broadcastThemeToAllWindows 完全一致（后者另对单窗口 send 抛错做告警容错）。
 */
function broadcastThemeConfig(): void {
    broadcastThemeToAllWindows(
        buildThemeBroadcastPayload(
            getCurrentThemeStyles(),
            getMonacoTheme(),
            getSeparateEditorTheme()
        )
    )
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
        // 开机自启动：读取时用 OS 实际状态校正显示值（用户可能在系统设置中手动改过），
        // 其余字段返回 store 原值。
        read: () => ({ ...getSystemSetting(), autoStart: getLoginItemOpenAtLogin() }),
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

/**
 * 配置写入来源（P1-1 工作区受信根来源收敛）。
 * - `renderer`（默认）：经 IPC.CONFIG.WRITE 的渲染层写入，受「仅主进程可写」清单限制；
 * - `main`：主进程自身维护写入（recent-folders 置顶维护等），不受该清单限制。
 */
export type ConfigWriteSource = 'renderer' | 'main'

/**
 * 写入配置文件。
 *
 * P1-1：`recent-folders` 是工作区受信根的历史来源，渲染层写入一律拒绝——
 * 否则 XSS 可写入任意目录，再从「最近文件夹」入口合法打开（来源收敛失效）。
 * 主进程内部维护走 source='main'（见 recordRecentFolder）。
 */
async function writeConfig(
    configName: string,
    data: unknown,
    source: ConfigWriteSource = 'renderer'
): Promise<boolean> {
    if (!isValidConfigName(configName)) {
        logger.warn('[ConfigManager] 拒绝非法配置名（防路径逃逸）:', configName)
        return false
    }
    // AS-4：配置名白名单——只允许已知业务配置名，未知名称一律拒绝（不落任意 JSON）
    if (!isAllowedConfigName(configName)) {
        logger.warn('[ConfigManager] 拒绝白名单外的配置名:', configName)
        return false
    }
    // P1-1：仅主进程可写配置（recent-folders）——渲染层写入请求无条件拒绝
    if (source === 'renderer' && isMainProcessOnlyConfigName(configName)) {
        logger.warn(
            '[ConfigManager] 拒绝渲染层写入主进程专属配置（工作区受信根来源收敛）:',
            configName
        )
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
    // 「最近文件列表数量」截断前需要原地改写 sanitizedData，故用 let
    let sanitizedData = validation.value
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
        // 「最近文件列表数量」：recent-folders 写入侧按当前设置截断（主进程置顶写入，
        // 主进程保证落盘条数不超过 recentFilesCount）。
        if (configName === 'recent-folders' && Array.isArray(sanitizedData)) {
            const limit = clampRecentFilesLimit(getSystemSetting().recentFilesCount)
            sanitizedData = sanitizedData.slice(0, limit)
        }
        await fs.writeJson(configPath, sanitizedData, { spaces: 2 })
        return true
    } catch (error) {
        logger.error(`[ConfigManager] Error writing config ${configName}:`, error)
        return false
    }
}

/* ============================================================================
 * P1-1（工作区受信根来源收敛）：recent-folders 主进程专属写入 + 受信根播种
 *
 * 历史实现：渲染层经 config:write('recent-folders') 维护最近文件夹列表，XSS 后可写入
 * 任意目录并再从「最近文件夹」入口打开。收敛后：
 * - 渲染层仍可 config:read（欢迎页展示），但 config:write 一律拒绝（见 writeConfig）；
 * - 主进程在用户真正打开目录后自行「去重置顶 + 条数截断」写入（recordRecentFolder）；
 * - 启动时主进程读取自身持久化的 recent-folders 与 lastOpenedDirectory，播种
 *   AppContext.workspace.approvedRoots（ensureApprovedWorkspaceRootsInitialized），
 *   保证升级/重启后欢迎页最近文件夹与启动恢复不被来源收敛破坏。
 * ========================================================================== */

/** recent-folders 配置名（主进程专属写入） */
const RECENT_FOLDERS_CONFIG_NAME = 'recent-folders'

/** 读取当前最近文件夹列表（仅保留非空字符串条目；读取失败按空列表，不抛异常） */
async function readRecentFolderList(): Promise<string[]> {
    try {
        const raw: unknown = await readConfig(RECENT_FOLDERS_CONFIG_NAME)
        if (!Array.isArray(raw)) {
            return []
        }
        return raw.filter((item): item is string => typeof item === 'string' && item.length > 0)
    } catch (error) {
        logger.warn('[ConfigManager] 读取最近文件夹列表失败（按空列表处理）:', error)
        return []
    }
}

/** 最近文件夹去重比较键（Windows 大小写不敏感；统一分隔符） */
function toRecentFolderCompareKey(folderPath: string): string {
    return normalizePathForCompare(path.resolve(folderPath), process.platform === 'win32')
}

/**
 * P1-1：主进程专属——把目录置顶写入「最近文件夹」历史（渲染层无写权限）。
 *
 * 语义与历史渲染层实现保持一致：去重置顶、条数按「最近文件列表数量」设置截断；
 * 写入失败仅记日志，不影响目录打开主流程。
 *
 * @param folderPath 用户已打开（或刚被主进程确认）的目录绝对路径
 */
export async function recordRecentFolder(folderPath: unknown): Promise<void> {
    if (
        typeof folderPath !== 'string' ||
        folderPath.trim() === '' ||
        !path.isAbsolute(folderPath)
    ) {
        return
    }
    try {
        const resolvedPath = path.resolve(folderPath)
        const targetKey = toRecentFolderCompareKey(resolvedPath)
        const history = await readRecentFolderList()
        const deduplicated = history.filter((item) => {
            try {
                return toRecentFolderCompareKey(item) !== targetKey
            } catch {
                // 损坏条目（无法解析的路径）不参与比较，保留原样由 schema 清洗
                return true
            }
        })
        const limit = clampRecentFilesLimit(getSystemSetting().recentFilesCount)
        const nextHistory = [resolvedPath, ...deduplicated].slice(0, limit)
        const ok = await writeConfig(RECENT_FOLDERS_CONFIG_NAME, nextHistory, 'main')
        if (!ok) {
            logger.warn('[ConfigManager] 写入最近文件夹历史失败:', resolvedPath)
        }
    } catch (error) {
        logger.warn('[ConfigManager] 更新最近文件夹历史失败:', error)
    }
}

/** 主进程启动时播种受信工作区根的 Promise（并发调用共享，失败后不再重试） */
let approvedRootsSeedPromise: Promise<void> | null = null

/**
 * P1-1：启动时用主进程持久化数据初始化受信工作区根（幂等）。
 *
 * 数据来源（均由主进程读取，不经渲染层写入）：
 * 1. `recent-folders` 裸 JSON 配置（历史最近文件夹；升级前的历史条目视为已批准）；
 * 2. fileState 的 `lastOpenedDirectory`（启动恢复目标）。
 *
 * 危险根/敏感目录（磁盘根、系统目录、用户主目录、.ssh/AppData 等）不进入受信集合
 * ——它们是「第二道防线」，即便历史数据被写入也不会获得受信根身份。
 */
export function ensureApprovedWorkspaceRootsInitialized(): Promise<void> {
    if (approvedRootsSeedPromise === null) {
        approvedRootsSeedPromise = seedApprovedWorkspaceRootsFromPersistedState()
    }
    return approvedRootsSeedPromise
}

/** 播种实现（异常统一兜底为告警：初始化失败按空集合处理，不阻断启动） */
async function seedApprovedWorkspaceRootsFromPersistedState(): Promise<void> {
    try {
        const candidates: unknown[] = []
        candidates.push(...(await readRecentFolderList()))
        try {
            candidates.push(getLastOpenedDirectory())
        } catch (error) {
            logger.warn('[Security] 读取上次打开目录失败（跳过该来源）:', error)
        }
        // 危险根/敏感目录不进受信集合（黑名单作为来源收敛之后的第二道防线）
        const safeCandidates = candidates.filter(
            (candidate): candidate is string =>
                typeof candidate === 'string' &&
                candidate.trim() !== '' &&
                path.isAbsolute(candidate) &&
                detectDangerousWorkspaceRoot(candidate) === null
        )
        const approvedCount = await seedApprovedWorkspaceRoots(safeCandidates)
        logger.info(
            `[Security] 已初始化工作区受信根 ${approvedCount} 个（来源：主进程持久化的最近文件夹/上次打开目录）`
        )
    } catch (error) {
        logger.warn('[Security] 初始化工作区受信根失败（按空集合处理）:', error)
    }
}

/** 复位播种状态（单元测试隔离用；生产代码不调用） */
export function resetWorkspaceApprovalSeedForTesting(): void {
    approvedRootsSeedPromise = null
}

/** 主进程专属写入入口（测试/主进程内部使用；渲染层不可达） */
export async function writeConfigFromMainProcess(
    configName: string,
    data: unknown
): Promise<boolean> {
    return writeConfig(configName, data, 'main')
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
    registerIpcHandleOnce(
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
    registerIpcHandleOnce(
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
    // 注意：此入口等价渲染层 config:write（默认 source='renderer'），
    // recent-folders 等主进程专属配置会被拒绝；主进程内部维护走 writeConfigFromMainProcess。
    writeConfig,
    writeConfigFromMainProcess,
    recordRecentFolder,
    ensureApprovedWorkspaceRootsInitialized,
    CONFIG_DIR
}
