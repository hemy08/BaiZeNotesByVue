/**
 * E2E 共享夹具（P0 E2E 补齐：启动恢复 / 设置保存 / 打包启动）
 *
 * 目标：让所有 E2E 用例都满足「临时用户数据 + 运行后清理」，不污染开发者的真实数据，
 * 同时保证本地与 CI 使用同一套启动方式。
 *
 * ## 路径隔离方案（为什么不是一个 setPath 解决）
 * 产品代码把配置目录固定为 `app.getPath('home')/.baizenotes`，而 Electron 的
 * `app.getPath('home')` 不支持环境变量覆盖；测试侧只有两条路可走：
 * 1. 用 `-r` 预加载夹具在应用主脚本之前 `app.setPath('home', 临时目录)`；
 * 2. 保留真实 home，只把「配置目录」做备份/替换/恢复。
 *
 * 本仓库实测方案 1 **不稳定**：`app.setPath('home')` 在 ready 之前执行时，约 40%~60% 的启动
 * 会偶发 preload 未注入（`window.api` undefined → 欢迎页回退、主界面不加载），属 Electron
 * 内部路径服务时序问题，测试侧无法可靠规避。因此采用组合方案：
 * - `userData`（fileState.json / 渲染层裸 JSON 配置 / 缓存 / 单实例锁）：经 `-r` 夹具
 *   `app.setPath('userData', 临时目录)` 重定向。该操作实测稳定（0/8 失败），且完全避开真实
 *   `%APPDATA%`；
 * - `home/.baizenotes/config`（主进程 systemSetting 等 electron-store 配置）：真实目录，
 *   由 `createConfigSandbox()` 在用例内「备份 → 清空（可写种子）→ finally 恢复」，
 *   测试写入的配置由用例自己隔离并在结束后还原（config 目录仅几 KB）。
 *
 * ## Electron 可执行文件
 * Windows 下统一使用 `node_modules/electron/dist` 的**副本**（out/tmp 下，首次运行复制一次）：
 * 受限沙箱环境（如 DSH 的 Windows 沙箱）中，直接执行 node_modules 内的 electron.exe 会以
 * Low 完整性级别运行，无法写临时目录/创建 GUI 窗口。副本路径让本地与 CI 行为完全一致。
 * 可用 `E2E_ELECTRON_EXECUTABLE` 显式覆盖；非 Windows 平台回退到 Playwright 默认启动方式。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication } from '@playwright/test'

/** 仓库根目录 */
export const ROOT = path.resolve(__dirname, '..', '..')
/** electron-vite 构建产物主进程入口（M7 产物治理：out/build/main） */
export const MAIN_ENTRY = path.join(ROOT, 'out', 'build', 'main', 'index.js')
/** electron-builder --dir 解包产物（打包启动用例使用） */
export const PACKAGED_EXE = path.join(
    ROOT,
    'out',
    'build',
    'dist',
    'win-unpacked',
    'BaiZeNotes.exe'
)
/** 测试专用主进程预加载夹具（重定向 userData 到临时目录） */
export const USER_DATA_FIXTURE = path.join(ROOT, 'e2e', 'fixtures', 'redirect-user-data.cjs')

/** 真实用户配置根目录（产品代码固定为 home/.baizenotes） */
const BAIZE_HOME_DIR = path.join(os.homedir(), '.baizenotes')
/** 真实主进程配置目录（electron-store 文件所在目录，由 ConfigSandbox 备份/恢复） */
const BAIZE_CONFIG_DIR = path.join(BAIZE_HOME_DIR, 'config')

const ELECTRON_DIST_DIR = path.join(ROOT, 'node_modules', 'electron', 'dist')
const RUNTIME_ELECTRON_DIR = path.join(ROOT, 'out', 'tmp', 'e2e-electron-runtime')

/** 临时用户目录集合（每个用例独立一份，finally 中整体删除） */
export interface TempProfile {
    /** 临时根目录（用例自己的 md 工作区等也放这里） */
    root: string
    /** 重定向后的 userData（app.getPath('userData')） */
    userData: string
    /** 删除整个临时目录 */
    cleanup: () => void
}

/** 创建一个临时用户目录集合：root/ 与 userData/ 均为独立空目录 */
export function createTempProfile(prefix = 'baize-e2e-'): TempProfile {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    const userData = path.join(root, 'userData')
    fs.mkdirSync(userData, { recursive: true })
    return {
        root,
        userData,
        cleanup: () => fs.rmSync(root, { recursive: true, force: true })
    }
}

/** 写 JSON 文件（自动创建父目录；测试种子数据用） */
export function writeJson(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 真实主进程配置目录沙箱：备份 → 清空（写种子）→ 用例结束恢复。
 *
 * 仅操作 `~/.baizenotes/config`（几 KB），不触碰 `backups/` 等大目录；恢复时会把测试期间
 * 新建的 `.baizenotes` 顶层条目（cache/logs 等）一并清理；若测试前 `.baizenotes` 不存在，
 * 则结束后整体删除。
 *
 * 注意：本地运行 E2E 前请先关闭正在运行的 BaiZeNotes 应用，避免两个进程同时使用真实配置目录。
 */
export interface ConfigSandbox {
    /** 真实配置目录路径（清空后可向其中写种子 JSON） */
    configDir: string
    /** 清空真实配置目录，得到确定性初始配置（可重复调用） */
    seed: () => void
    /** 恢复测试前快照（幂等；必须在 finally 中调用） */
    restore: () => void
}

/**
 * 创建真实配置目录沙箱。
 * @param profile 临时用户目录（备份文件存放在 profile.root 内，随 profile.cleanup 一起清理）
 */
export function createConfigSandbox(profile: TempProfile): ConfigSandbox {
    const homeExisted = fs.existsSync(BAIZE_HOME_DIR)
    const homeEntries = homeExisted ? fs.readdirSync(BAIZE_HOME_DIR) : []
    const configExisted = fs.existsSync(BAIZE_CONFIG_DIR)
    const backupDir = path.join(profile.root, 'real-config-backup')
    if (configExisted) {
        fs.cpSync(BAIZE_CONFIG_DIR, backupDir, { recursive: true })
    }

    const seed = (): void => {
        fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
        fs.mkdirSync(BAIZE_CONFIG_DIR, { recursive: true })
    }
    const restore = (): void => {
        // 1) 恢复 config：测试前不存在 → 删除测试期间创建的 config
        fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
        if (configExisted) {
            fs.cpSync(backupDir, BAIZE_CONFIG_DIR, { recursive: true })
        }
        // 2) 清理测试期间新增的 .baizenotes 顶层条目（cache/logs 等）
        if (!homeExisted) {
            fs.rmSync(BAIZE_HOME_DIR, { recursive: true, force: true })
            return
        }
        if (fs.existsSync(BAIZE_HOME_DIR)) {
            for (const entry of fs.readdirSync(BAIZE_HOME_DIR)) {
                if (!homeEntries.includes(entry)) {
                    fs.rmSync(path.join(BAIZE_HOME_DIR, entry), {
                        recursive: true,
                        force: true
                    })
                }
            }
        }
    }
    return { configDir: BAIZE_CONFIG_DIR, seed, restore }
}

/**
 * 预置主进程 store-backed 系统设置（真实配置目录内的 systemSetting.json）。
 *
 * 调用前必须先 `createConfigSandbox(profile).seed()`。
 * 只写需要覆盖的字段：system-setting 的 electron-store 会与默认值合并，
 * 其余字段保持产品默认值；`settingsSchemaVersion: 2` 用于跳过 1.3.6 存量迁移写入。
 */
export function seedSystemSetting(
    sandbox: ConfigSandbox,
    patch: Record<string, unknown> = {}
): void {
    writeJson(path.join(sandbox.configDir, 'systemSetting.json'), {
        ...patch,
        settingsSchemaVersion: 2
    })
}

/**
 * 预置 userData/config 下的「裸 JSON」配置（show-welcome / recent-folders 等）。
 * config-manager 的 CONFIG_DIR 基于 app.getPath('userData')，即本函数的 profile.userData。
 */
export function seedUserDataConfig(profile: TempProfile, name: string, data: unknown): void {
    writeJson(path.join(profile.userData, 'config', `${name}.json`), data)
}

/** 预置启动恢复记录（`userData/fileState.json`，与主进程 file-state-store 同文件同结构） */
export function seedFileState(
    profile: TempProfile,
    state: {
        lastOpenedFile?: string | null
        lastOpenedDirectory?: string | null
        recentFiles?: string[]
    }
): void {
    writeJson(path.join(profile.userData, 'fileState.json'), {
        lastOpenedFile: state.lastOpenedFile ?? null,
        lastOpenedDirectory: state.lastOpenedDirectory ?? null,
        recentFiles: state.recentFiles ?? []
    })
}

/**
 * 解析 E2E 使用的 Electron 可执行文件（见文件头部设计说明）。
 * @returns Windows 下为 out/tmp 副本路径；非 Windows 或缺少 electron 包时返回 undefined，
 *          此时回退到 Playwright 默认启动方式（node_modules/electron + loader 注入）。
 */
export function resolveElectronExecutable(): string | undefined {
    const override = process.env.E2E_ELECTRON_EXECUTABLE
    if (override) {
        return fs.existsSync(override) ? override : undefined
    }
    if (process.platform !== 'win32') {
        return undefined
    }
    const source = path.join(ELECTRON_DIST_DIR, 'electron.exe')
    if (!fs.existsSync(source)) {
        return undefined
    }
    const target = path.join(RUNTIME_ELECTRON_DIR, 'electron.exe')
    const needCopy =
        !fs.existsSync(target) ||
        fs.statSync(target).size !== fs.statSync(source).size ||
        fs.statSync(target).mtimeMs < fs.statSync(source).mtimeMs
    if (needCopy) {
        fs.rmSync(RUNTIME_ELECTRON_DIR, { recursive: true, force: true })
        fs.mkdirSync(path.dirname(RUNTIME_ELECTRON_DIR), { recursive: true })
        fs.cpSync(ELECTRON_DIST_DIR, RUNTIME_ELECTRON_DIR, { recursive: true })
    }
    return target
}

/** 去除继承自宿主/沙箱的环境变量，避免 Electron 以纯 Node 模式启动 */
function buildChildEnv(extra: Record<string, string>): Record<string, string> {
    const env = { ...process.env } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE
    return { ...env, ...extra }
}

/** E2E 启动选项（仅暴露常用项，其余沿用默认） */
export interface LaunchAppOptions {
    /** 启动总超时（毫秒），默认 60s */
    timeout?: number
}

/**
 * 启动开发构建（out/build/main/index.js）：userData 重定向到临时目录。
 *
 * 夹具经 `-r` 在 Electron 主进程启动早期执行，早于应用主脚本读取 userData 派生路径，
 * 因此 fileState.json / userData/config 下的裸 JSON 种子文件均落在临时目录。
 * home（`~/.baizenotes/config`）不重定向，由调用方的 ConfigSandbox 负责备份/恢复。
 */
export function launchDevApp(
    profile: TempProfile,
    options: LaunchAppOptions = {}
): Promise<ElectronApplication> {
    return electron.launch({
        executablePath: resolveElectronExecutable(),
        args: ['-r', USER_DATA_FIXTURE, MAIN_ENTRY],
        env: buildChildEnv({ BAIZE_E2E_USER_DATA: profile.userData }),
        timeout: options.timeout ?? 60_000
    })
}

/**
 * 启动打包产物（out/build/dist/win-unpacked/BaiZeNotes.exe）。
 *
 * 打包版 Electron 不支持 `-r` 预加载注入（实测被忽略），因此：
 * - Electron userData 走 `--user-data-dir=<临时目录>`；
 * - `~/.baizenotes/config` 同样由调用方的 ConfigSandbox 备份/恢复。
 */
export function launchPackagedApp(
    userDataDir: string,
    options: LaunchAppOptions = {}
): Promise<ElectronApplication> {
    return electron.launch({
        executablePath: PACKAGED_EXE,
        args: [`--user-data-dir=${userDataDir}`],
        env: buildChildEnv({}),
        timeout: options.timeout ?? 120_000
    })
}
