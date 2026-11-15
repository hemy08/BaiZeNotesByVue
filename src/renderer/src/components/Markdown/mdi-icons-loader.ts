/**
 * MDI 图标数据统一加载器（P2-4 修复：95KB 全量图标数据不再同步 import 进主 chunk）。
 *
 * 方案选择与理由（在「动态 import + 首次使用缓存」与「Vite 分包」之间的取舍）：
 * - 预览渲染管线（markdown-it 渲染规则）是同步函数，若把 renderIcon 改成异步会破坏
 *   整条渲染管线；纯 manualChunks 分包只是把 95KB 挪出主 chunk 文件，仍然随首屏
 *   同步加载，未真正解决「图标数据随首屏加载」的问题；
 * - 因此采用「首屏核心子集 + 全量懒加载」：核心子集（77 个常用图标，见 mdi-icons-core.ts）
 *   同步内嵌，首屏渲染零异步等待；全量 264 图标经本模块动态 import，首次使用时
 *   缓存 Promise 与结果，之后查询全部 O(1)。核心图标永远不会因加载竞态降级为文本；
 *   非核心图标在全量数据到达前短暂降级为可见文本（与「未知图标」同一降级路径），
 *   Electron 本地磁盘加载为毫秒级，且下一次渲染即恢复，预览功能不受影响。
 */
import { MDI_ICON_PATHS_CORE } from './mdi-icons-core'

/** 全量图标数据模块形态（type-only：不产生运行时依赖） */
type MdiIconDataModule = typeof import('./mdi-icons-data')

let fullDataPromise: Promise<MdiIconDataModule> | null = null
let fullData: MdiIconDataModule | null = null

/**
 * 加载全量图标数据（动态 import，Promise 与结果均缓存，重复调用不重复加载）。
 */
export function loadMdiIconData(): Promise<MdiIconDataModule> {
    if (!fullDataPromise) {
        fullDataPromise = import('./mdi-icons-data').then((mod) => {
            fullData = mod
            return mod
        })
    }
    return fullDataPromise
}

/** 是否已加载全量图标数据（供测试/诊断） */
export function isMdiIconDataLoaded(): boolean {
    return fullData !== null
}

/**
 * 同步查询图标 path：核心子集 → 已加载的全量数据 → undefined（走可见文本降级）。
 * 渲染规则内使用，保持同步语义。
 */
export function getMdiIconPath(name: string): string | undefined {
    const core = MDI_ICON_PATHS_CORE[name]
    if (core !== undefined) return core
    return fullData ? fullData.MDI_ICON_PATHS[name] : undefined
}

/** 同步查询 octicons 图标 path（当前全量数据为空对象，恒为 undefined → 降级） */
export function getOcticonIconPath(name: string): string | undefined {
    return fullData ? fullData.OCTICON_ICON_PATHS[name] : undefined
}

/** 当前可用图标名列表（核心子集 ∪ 已加载的全量数据，供插入对话框 datalist 使用） */
export function getMdiIconNames(): string[] {
    const names = Object.keys(MDI_ICON_PATHS_CORE)
    if (fullData) {
        for (const name of Object.keys(fullData.MDI_ICON_PATHS)) {
            if (!(name in MDI_ICON_PATHS_CORE)) {
                names.push(name)
            }
        }
    }
    return names
}

/**
 * 预热：模块加载（应用启动、预览管线首次被 import）时立即开始拉取全量数据。
 * 此时距第一次实际渲染尚有应用初始化时间，绝大多数情况下首屏渲染前数据已就绪；
 * 即使未就绪，核心图标仍可用，非核心图标按降级路径渲染，不影响管线正确性。
 */
void loadMdiIconData()
