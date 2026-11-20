/**
 * IPC 注册收口（P2 架构债）：系统信息域（应用版本）
 *
 * 从 `src/main/utils/utils.ts` 的 `MainWindowListenUtilsEvent` 按域拆出。
 * SYSTEM.APP_VERSION 的读取逻辑、字段补齐、异常兜底与返回契约（shared AppVersionInfo）
 * 均保持不变：
 * - 优先读取 resources/config/version.json（构建脚本生成），缺失字段用 process.versions 补齐；
 * - 读取失败/文件缺失时返回空版本结构（不向 invoke 调用方抛错）。
 */
import * as fs from 'fs'
import * as path from 'path'
import { getAppResourcesPath } from '../utils/app-paths'
import { ipcListenerManager } from './ipc-listener-manager'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { IPC } from '../../shared/ipc-channels'
// 第 2 批契约重构：版本信息返回结构统一引用 shared AppVersionInfo（唯一真源）
import type { AppVersionInfo } from '../../shared/types'

/**
 * 注册系统信息域 IPC（当前仅 APP_VERSION 一个通道）。
 *
 * @param componentId 监听台账组件 ID（拆分前统一为 `global-utils-ipc`，保持不变）
 */
export function registerSystemIpc(componentId: string): void {
    // 获取应用版本信息
    // AS-6：版本信息读取（含 resources/config/version.json 内容）补发送方校验
    // 第 2 批契约重构：返回形状显式标注 shared AppVersionInfo（唯一真源），
    // preload 的 window.api.app.getVersion() 类型声明与渲染层 HelpAboutDialog 同源。
    ipcListenerManager.registerHandleOnce(
        IPC.SYSTEM.APP_VERSION,
        withSenderCheck(
            IPC.SYSTEM.APP_VERSION,
            async (): Promise<AppVersionInfo> => {
                try {
                    const versionFilePath = path.join(
                        getAppResourcesPath(),
                        'config',
                        'version.json'
                    )
                    if (fs.existsSync(versionFilePath)) {
                        // version.json 由构建脚本（build/generate-version-config.js）生成，
                        // 字段形状即 shared AppVersionInfo；electron/chrome/node 版本可能为空，
                        // 在 Electron 主进程中用 process.versions 补齐。
                        const versionData = JSON.parse(
                            fs.readFileSync(versionFilePath, 'utf-8')
                        ) as AppVersionInfo
                        if (!versionData.electronVersion) {
                            versionData.electronVersion = process.versions.electron || ''
                        }
                        if (!versionData.chromeVersion) {
                            versionData.chromeVersion = process.versions.chrome || ''
                        }
                        if (!versionData.nodeVersion) {
                            versionData.nodeVersion = process.versions.node || ''
                        }
                        return versionData
                    }
                } catch (error) {
                    logger.error('读取版本配置文件失败:', error)
                }
                return {
                    appVersion: '',
                    electronVersion: process.versions.electron || '',
                    chromeVersion: process.versions.chrome || '',
                    nodeVersion: process.versions.node || '',
                    vueVersion: '',
                    viteVersion: '',
                    typescriptVersion: '',
                    monacoEditorVersion: '',
                    markdownItVersion: ''
                }
            },
            { kind: 'handle' }
        ),
        componentId
    )
}
