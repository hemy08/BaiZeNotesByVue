/**
 * 快捷链接设置对话框 —— 共享草稿 / 读写编排 composable（设置对话框二期拆分）
 *
 * 拆分前 QuickLinkSettingDialog.vue 同时持有链接草稿、初始快照、表单显隐与
 * 主进程读写；拆分后这些状态与副作用收敛到本 composable，壳层只保留外壳覆盖、
 * footer 按钮编排与「visible → 重新加载」的 watch，列表/表单子组件只做展示与事件上报。
 *
 * 对外契约（拆分前后等价）：
 * - `links`：对话框草稿（唯一一份；初始为 DEFAULT_LINKS 的深拷贝）；
 * - `loadLinksOnOpen()`：每次打开重置「用户已改动」标记并从主进程 QUICK_LINKS.GET 读取，
 *   读取失败保留兜底默认值；迟到的读取结果不覆盖用户已做的增删改；
 * - `selectedIndex` / `showForm` / `isEditing` / `editingLink`：列表选中与表单显隐状态；
 * - `openAddForm` / `openEditForm` / `deleteLink` / `closeForm` / `submitForm`：增删改表单编排；
 * - `saveLinksToMain()`：主进程 QUICK_LINKS.SAVE 保存，返回是否成功（失败时壳层保持对话框打开）；
 * - `snapshotLinks()`：emit('apply') 的深拷贝载荷；`resetLinks()`：取消时恢复打开时数据源状态。
 */
import { computed, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { IPC } from '../../../../../../shared/ipc-channels'
// 第 4 批 P3：裸 console.* 收敛到渲染层统一日志出口（失败时对话框保持打开等用户可见逻辑不变）
import { logger } from '../../../../common/logger'
import {
    cloneLinks,
    DEFAULT_LINKS,
    getDisplayIcon,
    isQuickLinkItem,
    toDialogLink,
    toQuickLinkItem,
    type Link,
    type QuickLinkDraft
} from './model'

/** useQuickLinkSettingForm 的返回值（壳层与测试共用同一份契约） */
export interface QuickLinkSettingForm {
    /** 链接草稿（唯一数据源，列表/表单只读消费） */
    links: Ref<Link[]>
    /** 列表当前选中项（-1 表示未选中） */
    selectedIndex: Ref<number>
    /** 编辑表单是否展开 */
    showForm: Ref<boolean>
    /** 表单是否为「编辑已有链接」（false 为新增） */
    isEditing: Ref<boolean>
    /** 编辑中的原始链接（新增时为 undefined；表单子组件以它初始化草稿） */
    editingLink: ComputedRef<Link | undefined>
    /** 打开对话框：重置用户改动标记并从主进程读取最新 quickLinks */
    loadLinksOnOpen: () => Promise<void>
    /** 列表选中项切换 */
    selectLink: (index: number) => void
    /** 打开新增表单（清空草稿字段） */
    openAddForm: () => void
    /** 打开编辑表单（回填指定链接） */
    openEditForm: (index: number) => void
    /** 删除指定链接 */
    deleteLink: (index: number) => void
    /** 关闭编辑表单（不保存） */
    closeForm: () => void
    /** 提交表单：校验名称/URL，写入草稿并关闭表单 */
    submitForm: (draft: QuickLinkDraft) => void
    /** 保存到主进程 quickLinks，返回是否成功（失败时壳层保持对话框打开） */
    saveLinksToMain: () => Promise<boolean>
    /** emit('apply') 的深拷贝载荷 */
    snapshotLinks: () => Link[]
    /** 取消：恢复打开时的数据源状态（不写配置） */
    resetLinks: () => void
}

export function useQuickLinkSettingForm(): QuickLinkSettingForm {
    const links = ref<Link[]>(cloneLinks(DEFAULT_LINKS))
    const initialLinks = ref<Link[]>(cloneLinks(DEFAULT_LINKS))
    // 打开对话框后用户是否已改动列表：主进程读取是异步的，若用户在读取返回前已增删改，
    // 迟到的读取结果不得覆盖用户操作（否则表现为「刚删掉的链接又回来了」）。
    let userModifiedSinceOpen = false

    const selectedIndex = ref(-1)
    const showForm = ref(false)
    const isEditing = ref(false)
    const editingIndex = ref(-1)

    /** 编辑中的原始链接（表单子组件以它初始化草稿；新增时为 undefined） */
    const editingLink = computed<Link | undefined>(() =>
        isEditing.value && editingIndex.value >= 0 ? links.value[editingIndex.value] : undefined
    )

    /**
     * P1-FE-04：从主进程读取 quickLinks（与 NaviTab 同一数据源），
     * 保证设置对话框展示的是导航栏当前生效配置，避免用兜底默认值覆盖用户已保存的链接。
     */
    async function loadLinksFromMain(): Promise<void> {
        let loaded: Link[] | null = null
        try {
            const items: unknown = await window.electron.ipcRenderer.invoke(IPC.QUICK_LINKS.GET)
            if (Array.isArray(items)) {
                // 主进程返回空数组是合法状态（用户删除了全部链接），仅读取失败时保留兜底默认值
                loaded = items.filter(isQuickLinkItem).map(toDialogLink)
            }
        } catch (error) {
            logger.warn('[QuickLinkSettingDialog] 读取主进程快捷链接失败，使用兜底默认值:', error)
        }
        // 取消操作始终回滚到「打开时的数据源状态」；读取失败时回滚到当前兜底列表
        initialLinks.value = cloneLinks(loaded ?? links.value)
        if (loaded !== null && !userModifiedSinceOpen) {
            links.value = loaded
        }
    }

    /** 打开对话框：每次打开重新读取主进程最新数据（FE-34） */
    async function loadLinksOnOpen(): Promise<void> {
        userModifiedSinceOpen = false
        await loadLinksFromMain()
    }

    function selectLink(index: number): void {
        selectedIndex.value = index
    }

    function openAddForm(): void {
        isEditing.value = false
        editingIndex.value = -1
        showForm.value = true
    }

    function openEditForm(index: number): void {
        isEditing.value = true
        editingIndex.value = index
        showForm.value = true
    }

    function deleteLink(index: number): void {
        userModifiedSinceOpen = true
        links.value.splice(index, 1)
        if (selectedIndex.value === index) {
            selectedIndex.value = -1
        }
    }

    function closeForm(): void {
        showForm.value = false
        editingIndex.value = -1
    }

    function submitForm(draft: QuickLinkDraft): void {
        if (!draft.name || !draft.url) return

        userModifiedSinceOpen = true
        const link: Link = {
            name: draft.name,
            url: draft.url,
            icon: draft.icon || '🌐',
            description: draft.description
        }

        if (isEditing.value && editingIndex.value >= 0) {
            // 名称/URL 编辑不改变图标时，保留主进程原始项的不可编辑字段（id/enabled/position 等）
            const previous = links.value[editingIndex.value]
            if (previous?.source !== undefined && getDisplayIcon(previous.source) === link.icon) {
                link.source = previous.source
            }
            links.value[editingIndex.value] = link
        } else {
            links.value.push(link)
        }

        showForm.value = false
    }

    /**
     * P1-FE-04：经 IPC.QUICK_LINKS.SAVE 保存到主进程 quickLinks（唯一数据源），
     * 主进程保存成功后广播 UPDATED，NaviTab 监听后即时刷新。
     * @returns 是否保存成功（失败时对话框保持打开，避免用户改动丢失）
     */
    async function saveLinksToMain(): Promise<boolean> {
        const items = links.value.map((link, index) => toQuickLinkItem(link, index))
        try {
            const result: unknown = await window.electron.ipcRenderer.invoke(
                IPC.QUICK_LINKS.SAVE,
                items
            )
            if (
                result !== null &&
                typeof result === 'object' &&
                (result as { ok?: unknown }).ok === false
            ) {
                logger.error('[QuickLinkSettingDialog] 主进程拒绝保存快捷链接:', result)
                return false
            }
            return true
        } catch (error) {
            logger.error('[QuickLinkSettingDialog] 保存快捷链接失败:', error)
            return false
        }
    }

    function snapshotLinks(): Link[] {
        return cloneLinks(links.value)
    }

    function resetLinks(): void {
        links.value = cloneLinks(initialLinks.value)
    }

    return {
        links,
        selectedIndex,
        showForm,
        isEditing,
        editingLink,
        loadLinksOnOpen,
        selectLink,
        openAddForm,
        openEditForm,
        deleteLink,
        closeForm,
        submitForm,
        saveLinksToMain,
        snapshotLinks,
        resetLinks
    }
}
