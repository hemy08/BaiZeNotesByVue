/**
 * 跨进程共享的格式化纯函数（第 1 批公共接口归位：src/shared/utils/format.ts）。
 *
 * 背景：项目内没有统一的文件大小格式化函数，大文件提示处各自内联除法：
 * - `src/main/utils/file-utils/file-operations.ts:421`（日志：`${(fileSize / 1024 / 1024).toFixed(2)}MB`）；
 * - `file-operations.ts:430`（对话框文案：`size: (fileSize / 1024 / 1024).toFixed(2)`）；
 * - `src/main/utils/utils.ts:767`（PDF 上限提示：`${MAX_READ_BINARY_SIZE / 1024 / 1024}MB`）。
 * 本模块统一为一种格式，供后续调用方替换（第 1 批只新建，不改现有调用点）。
 */

/** 1 KB 的字节数（1024 进制，与项目现有除法口径一致） */
const BYTES_PER_KB = 1024

/** 1 MB 的字节数 */
const BYTES_PER_MB = BYTES_PER_KB * 1024

/** 1 GB 的字节数 */
const BYTES_PER_GB = BYTES_PER_MB * 1024

/**
 * 格式化文件大小（1024 进制）。
 *
 * 统一格式（本项目约定，供后续替换 3 处内联除法）：
 * - `< 1 KB`：`B` 单位、整数、无小数（如 `0 B`、`1023 B`）；
 * - 其余：按 KB / MB / GB 取最大合适单位，保留**两位小数**，数值与单位之间一个空格
 *   （如 `1.00 KB`、`1.50 MB`、`2.25 GB`）；
 * - 超过 1 TB 仍以 GB 表示（不引入 TB，保持单位集合固定为 B/KB/MB/GB）；
 * - 负数、`NaN`、`±Infinity` 等非法输入按 0 处理，输出 `0 B`（避免把非法值带进 UI）。
 *
 * 与旧内联实现 `${(size / 1024 / 1024).toFixed(2)}MB` 的差异：单位前增加空格、B 级不保留
 * 小数、单位自动选择——这是任务要求的「统一格式」，数值精度口径（toFixed(2)）保持不变。
 *
 * @param bytes 文件字节数
 * @returns 格式化后的大小字符串（如 `1.50 MB`）
 */
export function formatFileSize(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return '0 B'
    }
    if (bytes < BYTES_PER_KB) {
        return `${Math.floor(bytes)} B`
    }
    if (bytes < BYTES_PER_MB) {
        return `${(bytes / BYTES_PER_KB).toFixed(2)} KB`
    }
    if (bytes < BYTES_PER_GB) {
        return `${(bytes / BYTES_PER_MB).toFixed(2)} MB`
    }
    return `${(bytes / BYTES_PER_GB).toFixed(2)} GB`
}
