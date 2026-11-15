/**
 * 「最近文件列表数量」（SystemSetting.recentFilesCount）共享常量与钳制函数。
 *
 * 主进程 file-state-store（最近文件写入侧）、config-manager（recent-folders 写入侧与
 * 存量裁剪）与渲染层 WelcomeScreen（欢迎页展示条数）共用同一范围语义，避免三处
 * 各自硬编码 5/10/20。
 */

/** 默认保留条数（与 system-setting 默认值一致） */
export const DEFAULT_RECENT_FILES_LIMIT = 10

/** 允许范围（系统设置对话框 number 输入 min/max 同步） */
export const RECENT_FILES_LIMIT_MIN = 5
export const RECENT_FILES_LIMIT_MAX = 20

/**
 * 把任意来源的 recentFilesCount 归一化到 [5, 20] 的整数。
 * 非法值（undefined / NaN / 字符串等）回落默认 10；超范围钳制到边界。
 */
export function clampRecentFilesLimit(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return DEFAULT_RECENT_FILES_LIMIT
    }
    return Math.min(RECENT_FILES_LIMIT_MAX, Math.max(RECENT_FILES_LIMIT_MIN, Math.round(value)))
}
