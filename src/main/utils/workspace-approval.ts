/**
 * P1-1 剩余（工作区受信根来源收敛）：主进程工作区受信根集合
 *
 * ## 背景
 * 历史实现中，`OPEN_SPECIFIC_FOLDER` 直接信任渲染层传入的 `folderPath`，只做
 * 「危险根/敏感目录黑名单」校验就把它设为工作区根；同时 `recent-folders` 允许渲染层
 * 经通用 `config:write` 任意写入。渲染层一旦取得脚本执行能力（XSS / 被污染依赖），
 * 即可把工作区指向任意非黑名单目录（如 `D:\secrets`），再经目录树/READ_HTML/删除通道
 * 读取或破坏文件。黑名单只能挡「已知敏感目录」，挡不住「任意目录」，因此必须做
 * **来源收敛**：只有用户通过主进程原生目录选择器确认过的目录（及其主进程持久化的
 * 历史记录）才可以成为工作区根。
 *
 * ## 职责（本模块是纯内存授权集合，不读写配置、不 import config/ipc）
 * 1. `approveWorkspaceRoot`：原生选择器/主进程确认目录后登记（realpath 归一化）；
 * 2. `seedApprovedWorkspaceRoots`：启动时由主进程持久化历史（最近文件夹 / 上次打开目录）
 *    恢复受信根，保证升级后欢迎页「最近文件夹」与启动恢复不被破坏；
 * 3. `touchApprovedWorkspaceRoot`：渲染层可触达入口（OPEN_SPECIFIC_FOLDER / OPEN_RECENT）
 *    的**只读判定**——命中则刷新 LRU 并返回 realpath 归一化路径，未命中返回 null；
 * 4. LRU：最多 `MAX_APPROVED_WORKSPACE_ROOTS` 项，Set 插入顺序即新旧顺序（命中/新增都
 *    移到尾部，超限从头部淘汰）。授权集合不持久化，重启后由主进程持久化数据重新播种。
 *
 * ## 信任边界
 * - 只有主进程代码路径可以调用 `approveWorkspaceRoot` / `seedApprovedWorkspaceRoots`；
 *   入口文件（handlers/file-operations/startup-restore）均在主进程侧，渲染层无法直接触达；
 * - `OPEN_SPECIFIC_FOLDER` 的判定顺序仍是「validateWorkspaceRoot（危险根/敏感目录黑名单，
 *   第二道防线）→ 受信根判定」，黑名单不因来源收敛而放宽。
 *
 * ## 依赖约束
 * 本文件属 `src/main/utils/**`：禁止 import `src/main/config/**` 与 `src/main/ipc/**`
 * （config 侧播种/写入实现见 config/config-manager，由 config → utils 单向依赖）。
 */
import * as fs from 'fs'
import * as path from 'path'
import { getAppContext } from '../app-context'
import { normalizePathForCompare } from '../../shared/utils/path'

/** 受信工作区根保留上限（LRU；与 recent-folders 配置的 50 条上限对齐） */
export const MAX_APPROVED_WORKSPACE_ROOTS = 50

/**
 * 路径 → 受信根比较键：realpath 归一化后的路径再按平台规则比较
 * （Windows 盘符/目录名大小写不敏感；分隔符统一为 `/`），仅用于集合判定，不落盘。
 */
function toApprovalKey(absolutePath: string): string {
    return normalizePathForCompare(path.resolve(absolutePath), process.platform === 'win32')
}

/**
 * 解析 realpath（符号链接/目录联接归一化），失败时回退 `path.resolve`：
 * 目录可能已被删除（历史最近文件夹），此时仍按词法路径登记——真正打开前一定会再经
 * `validateWorkspaceRoot` 校验存在性，不会因回退产生越权。
 */
async function resolveCanonicalPath(candidate: string): Promise<string> {
    const resolved = path.resolve(candidate)
    try {
        return await fs.promises.realpath(resolved)
    } catch {
        return resolved
    }
}

/** 受信根集合（AppContext 单例；每次调用实时取，resetAppContext 后自动生效） */
function getApprovedRoots(): Set<string> {
    return getAppContext().workspace.approvedRoots
}

/** 写入/刷新一个比较键并维持 LRU 上限（已存在先删除再插入 = 移到最新） */
function touchApprovalKey(roots: Set<string>, key: string): void {
    roots.delete(key)
    roots.add(key)
    while (roots.size > MAX_APPROVED_WORKSPACE_ROOTS) {
        const oldest = roots.values().next().value
        if (oldest === undefined) {
            return
        }
        roots.delete(oldest)
    }
}

/**
 * 登记工作区受信根（仅主进程调用；原生目录选择器/主进程确认流程使用）。
 *
 * @param candidate 目录绝对路径（字符串非法/非绝对路径返回 null）
 * @returns realpath 归一化后的路径；登记失败返回 null
 */
export async function approveWorkspaceRoot(candidate: unknown): Promise<string | null> {
    if (typeof candidate !== 'string' || candidate.trim() === '' || !path.isAbsolute(candidate)) {
        return null
    }
    const canonicalPath = await resolveCanonicalPath(candidate)
    touchApprovalKey(getApprovedRoots(), toApprovalKey(canonicalPath))
    return canonicalPath
}

/**
 * 批量播种受信根（启动时由主进程持久化历史恢复；仅主进程调用）。
 *
 * 入参按「从旧到新」处理：内部反序登记，保证最终 LRU 顺序与最近列表一致
 * （列表首项 = 最近使用，处于 Set 尾部 = 最新，超限淘汰时优先淘汰最旧项）。
 *
 * @returns 实际登记的条数（非法路径被忽略）
 */
export async function seedApprovedWorkspaceRoots(candidates: Iterable<unknown>): Promise<number> {
    const validCandidates = [...candidates].filter(
        (candidate): candidate is string =>
            typeof candidate === 'string' && candidate.trim() !== '' && path.isAbsolute(candidate)
    )
    const roots = getApprovedRoots()
    let approvedCount = 0
    // 反序登记：candidates 首项最新 → 最后登记，处于 Set 尾部
    for (const candidate of [...validCandidates].reverse()) {
        const canonicalPath = await resolveCanonicalPath(candidate)
        touchApprovalKey(roots, toApprovalKey(canonicalPath))
        approvedCount += 1
    }
    return approvedCount
}

/**
 * 只读判定：路径是否为已登记受信根；命中时刷新 LRU 并返回 realpath 归一化路径。
 *
 * 供渲染层可触达入口（OPEN_SPECIFIC_FOLDER / OPEN_RECENT 文件夹分支）使用：
 * 未命中返回 null（调用方拒绝并给出明确提示），不产生任何新授权。
 *
 * @param candidate 待判定的目录路径（绝对路径）
 * @returns 命中时返回 realpath 归一化路径，未命中/非法返回 null
 */
export async function touchApprovedWorkspaceRoot(candidate: unknown): Promise<string | null> {
    if (typeof candidate !== 'string' || candidate.trim() === '' || !path.isAbsolute(candidate)) {
        return null
    }
    const canonicalPath = await resolveCanonicalPath(candidate)
    const roots = getApprovedRoots()
    const key = toApprovalKey(canonicalPath)
    if (!roots.has(key)) {
        return null
    }
    // 命中刷新 LRU（保持在最近使用位置），但不扩大授权集合
    roots.delete(key)
    roots.add(key)
    return canonicalPath
}

/** 只读判定：路径是否为已登记受信根（不刷新 LRU；测试/审计用） */
export async function isWorkspaceRootApproved(candidate: unknown): Promise<boolean> {
    if (typeof candidate !== 'string' || candidate.trim() === '' || !path.isAbsolute(candidate)) {
        return false
    }
    const canonicalPath = await resolveCanonicalPath(candidate)
    return getApprovedRoots().has(toApprovalKey(canonicalPath))
}

/** 当前受信根快照（比较键，按 LRU 从旧到新；测试/审计用） */
export function getApprovedWorkspaceRootsForTesting(): string[] {
    return [...getApprovedRoots()]
}

/** 清空受信根（单元测试隔离用；生产代码不调用——重启后由主进程持久化数据重新播种） */
export function resetWorkspaceApprovalsForTesting(): void {
    getApprovedRoots().clear()
}
