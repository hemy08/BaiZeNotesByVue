/**
 * 可选能力开关（渲染层运行时读取）。
 *
 * 数据真源：system 配置（SystemSetting.featureXxx），由系统设置「功能」页签写入；
 * 默认值来自 shared/constants/feature-flags.ts（全部 false）。
 *
 * 生命周期：
 * - 首次调用 `useFeatureFlags()` / `initFeatureFlags()` 时异步读取配置；
 * - 订阅主进程 `SYSTEM_SETTING_UPDATE`，设置保存后即时生效，无需重启；
 * - 读取失败保持默认值（不阻塞界面），日志由调用方配置读取链路负责。
 */
import { reactive } from 'vue'
import { IPC } from '../../../shared/ipc-channels'
import type { SystemSetting } from '../../../shared/types'
import {
    OPTIONAL_FEATURE_FLAG_DEFAULTS,
    OPTIONAL_FEATURE_FLAG_IDS,
    OPTIONAL_FEATURE_FLAGS,
    WRITING_EXPERIENCE_DEFAULTS,
    WRITING_EXPERIENCE_FLAG_IDS,
    WRITING_EXPERIENCE_FLAGS,
    type OptionalFeatureFlagId,
    type WritingExperienceFlagId
} from '../../../shared/constants/feature-flags'

export type FeatureFlagState = Record<OptionalFeatureFlagId | WritingExperienceFlagId, boolean>

/** 运行时开关状态（模块单例；组件只读消费） */
const flags = reactive<FeatureFlagState>({
    ...OPTIONAL_FEATURE_FLAG_DEFAULTS,
    ...WRITING_EXPERIENCE_DEFAULTS
})

let initialized = false
let initPromise: Promise<void> | null = null
let listenerRegistered = false

/** 把主进程配置合并到运行时开关（未知/非布尔值保持默认） */
function applySettings(settings: Partial<SystemSetting> | null | undefined): void {
    for (const id of OPTIONAL_FEATURE_FLAG_IDS) {
        const value = settings?.[OPTIONAL_FEATURE_FLAGS[id].settingKey]
        flags[id] = value === true
    }
    for (const id of WRITING_EXPERIENCE_FLAG_IDS) {
        const value = settings?.[WRITING_EXPERIENCE_FLAGS[id].settingKey]
        flags[id] = value === true
    }
}

/** 主进程系统设置广播：全量设置对象（含 featureXxx） */
function handleSystemSettingUpdate(_event: unknown, settings?: Partial<SystemSetting>): void {
    if (settings && typeof settings === 'object') {
        applySettings(settings)
    }
}

/** 从 config:read('system') 刷新开关；读取失败保持当前值 */
export async function refreshFeatureFlags(): Promise<void> {
    try {
        const system = await window.api.config.read<SystemSetting>('system')
        applySettings(system)
    } catch {
        // 配置读取失败时保持默认/当前值，由设置对话框负责用户可见错误
    }
}

/** 初始化（幂等）：读取配置 + 注册一次广播监听 */
export async function initFeatureFlags(): Promise<void> {
    if (initialized) {
        return initPromise ?? Promise.resolve()
    }
    initialized = true
    if (!listenerRegistered && typeof window !== 'undefined' && window.electron?.ipcRenderer) {
        window.electron.ipcRenderer.on(IPC.SETTING.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
        listenerRegistered = true
    }
    initPromise = refreshFeatureFlags()
    await initPromise
}

/** 组件消费入口：返回响应式开关与判定函数 */
export function useFeatureFlags(): {
    flags: FeatureFlagState
    isFeatureEnabled: (id: OptionalFeatureFlagId) => boolean
} {
    void initFeatureFlags()
    return {
        flags,
        isFeatureEnabled: (id: OptionalFeatureFlagId): boolean => flags[id]
    }
}

/**
 * 移除系统设置广播监听（App 卸载时调用）。
 *
 * 单例模块的监听在应用生命周期内长期存在，但主界面/应用卸载时必须解绑，
 * 否则测试/热重载场景会累积监听（MEM 静态门禁也要求订阅/退订配对）。
 */
export function disposeFeatureFlagsListener(): void {
    if (!listenerRegistered || typeof window === 'undefined' || !window.electron?.ipcRenderer) {
        return
    }
    window.electron.ipcRenderer.removeListener(
        IPC.SETTING.SYSTEM_SETTING_UPDATE,
        handleSystemSettingUpdate
    )
    listenerRegistered = false
    initialized = false
    initPromise = null
}
