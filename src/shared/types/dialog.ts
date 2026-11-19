/**
 * 对话框名与 data 契约（第 2 批契约重构：主进程 → 渲染层 OPEN_VUE_DIALOG 载荷真源）
 *
 * ## 通信链路
 * 主进程所有 Vue 对话框统一经 `IPC.DIALOG.OPEN_VUE_DIALOG` 广播：
 *   `webContents.send(OPEN_VUE_DIALOG, dialogName, data?)`
 * 渲染层 `BaiZeNotes.vue` 的 handleOpenVueDialog 收到后原样交给
 * `useConfigStore().showDialog(dialogName, data)`：
 * - 消息类伪名称（message / success / error / warning / info / failed）写入
 *   `dialogs.messageDialog`；
 * - 其余名称按同名 `dialogs.<name>` 状态对象 `Object.assign` 合并 data。
 *
 * ## 为什么拆两层名称
 * - 渲染层可展示的对话框不止主进程能打开的：设置类/帮助类对话框由渲染层
 *   `menu-actions.ts` 本地打开（themeSettings / fontSelect / editorSettings /
 *   systemSettings / helpAbout / helpContact / techStack / quickLinks /
 *   materialSyntax 等），主进程从不发送；
 * - 因此 `VueDialogName` 是渲染层完整可接收集合（= `keyof DialogState` + 消息伪名称），
 *   `MainProcessDialogName` 是主进程实际发送的子集。两者关系为「子集」而非「相等」——
 *   `tests/unit/dialog-contract.test.ts` 静态核对：
 *     ① 主进程全部 OPEN_VUE_DIALOG 发送点的名称集合 == MainProcessDialogName；
 *     ② MainProcessDialogName ⊆ VueDialogName；
 *     ③ VueDialogName == useConfigStore 的 DialogState 键 + 消息伪名称。
 *
 * ## 历史清理记录（2026-11-19 第 2 批）
 * - `menu-file.ts` 的 'new-file'/'new-folder' 原发送 `{ isFolder: boolean }`，
 *   但渲染层 CreateFileFolderDialog 的 props 只有 `title`/`dirPath`（文件/文件夹类型
 *   由对话框内部选择），全仓无任何消费方；实际带 data 的发送点是快捷键 Ctrl+N 的
 *   `{ dirPath }`。该死字段已删除，本文件 CreateFileFolderDialogData 只保留
 *   `title`/`dirPath` 两个真实消费字段。
 */

/** 消息对话框类型（渲染层 MessageDialog.vue 的 Props.type 字面量联合） */
export type MessageDialogType = 'success' | 'error' | 'warning' | 'info' | 'failed'

/**
 * 消息类伪名称：并非 `dialogs` 状态对象的键，而是 `showDialog` 的快捷入口。
 * 'message' 从 data.type 取具体类型，其余直接以名称作为类型。
 */
export type MessageDialogPseudoName = 'message' | MessageDialogType

/**
 * 渲染层 `dialogs` 状态对象的键（= useConfigStore.ts 的 `keyof DialogState`）。
 * 这些名称都可由渲染层本地 `showDialog(name, data?)` 打开；
 * 其中子集同时可由主进程经 OPEN_VUE_DIALOG 广播打开（见 MainProcessDialogName）。
 */
export type VueDialogStateName =
    | 'messageDialog'
    | 'themeSettings'
    | 'fontSelect'
    | 'editorSettings'
    | 'systemSettings'
    | 'mermaidEdit'
    | 'admonition'
    | 'mathText'
    | 'insertImage'
    | 'mdSheet'
    | 'insertLink'
    | 'createFileFolder'
    | 'helpAbout'
    | 'helpContact'
    | 'techStack'
    | 'quickLinks'
    | 'importOption'
    | 'materialSyntax'

/**
 * 渲染层可接收的完整对话框名称集合（= useConfigStore.ts 的 `DialogName`）。
 * `IPC.DIALOG.OPEN_VUE_DIALOG` 的 dialogName 参数按本联合标注。
 */
export type VueDialogName = VueDialogStateName | MessageDialogPseudoName

/**
 * 主进程实际发送的 dialogName 集合（覆盖 7 个文件的 17 处发送点，逐一核实）：
 * - `src/main/ipc/menu-file.ts`：createFileFolder ×2；
 * - `src/main/ipc/menu-view.ts`：admonition / mathText / mdSheet / insertLink；
 * - `src/main/ipc/menu-tools.ts`：mermaidEdit / mathText / mdSheet / insertImage；
 * - `src/main/config/short-key-register.ts`（Ctrl+N）：createFileFolder；
 * - `src/main/utils/file-utils/dialog-helpers.ts`：message ×3（错误/信息/警告）；
 * - `src/main/utils/file-utils/import.ts`：importOption；
 * - `src/main/utils/file-utils/file-operations.ts`：message ×2（另存为成功/失败）。
 */
export type MainProcessDialogName =
    | 'message'
    | 'createFileFolder'
    | 'importOption'
    | 'admonition'
    | 'mathText'
    | 'mdSheet'
    | 'insertLink'
    | 'mermaidEdit'
    | 'insertImage'

/**
 * 消息对话框 data 契约（主进程 dialog-helpers / file-operations 发送）。
 * 消费方：useConfigStore.showDialog('message', data) → dialogs.messageDialog →
 * MessageDialog.vue 的 Props（visible/type/title/message）。
 */
export interface MessageDialogData {
    /** 对话框标题 */
    title: string
    /** 消息类型（决定图标与配色） */
    type: MessageDialogType
    /** 正文内容 */
    message: string
}

/**
 * 新建文件/文件夹对话框 data 契约。
 * 消费方：useConfigStore.dialogs.createFileFolder（dialog.dirPath）→
 * CreateFileFolderDialog.vue 的 props（title / dirPath）。
 * 注意：不含 `isFolder`（历史死字段已删除，文件/文件夹类型由对话框内部选择）。
 */
export interface CreateFileFolderDialogData {
    /** 自定义标题（可选，缺省由对话框按动作取默认标题） */
    title?: string
    /** 预填的目标目录（可选，快捷键 Ctrl+N 传入当前文件目录） */
    dirPath?: string
}

/**
 * 导入选项对话框 data 契约。
 * 消费方：useConfigStore.dialogs.importOption.content → BaiZeNotes.vue
 * handleImportOptionConfirm 读取内容后按用户选择替换/新建文件/插入。
 */
export interface ImportOptionDialogData {
    /** 待导入的文本内容 */
    content: string
}

/**
 * 主进程可携带的 data 联合（仅这 3 个对话框会带 data，其余对话框发送时无 data）。
 */
export type MainProcessDialogData =
    MessageDialogData | CreateFileFolderDialogData | ImportOptionDialogData

/**
 * 主进程 dialogName → data 契约映射。
 *
 * 值为 `undefined` 表示该对话框主进程发送时**不携带 data**（渲染层 showDialog(name)
 * 单独打开，对话框内部自行维护状态）；带 data 的三个对话框的键集合由上方
 * MessageDialogData / CreateFileFolderDialogData / ImportOptionDialogData 精确约束。
 */
export interface MainProcessDialogDataMap {
    message: MessageDialogData
    createFileFolder: CreateFileFolderDialogData
    importOption: ImportOptionDialogData
    admonition: undefined
    mathText: undefined
    mdSheet: undefined
    insertLink: undefined
    mermaidEdit: undefined
    insertImage: undefined
}
