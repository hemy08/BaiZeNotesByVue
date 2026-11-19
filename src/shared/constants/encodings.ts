/**
 * 文件编码清单与编码名归一化别名表共享常量（公共接口归位第 1 批 1.14）。
 *
 * 现状（4 处口径需对齐）：
 * - 主进程菜单路由 `src/main/ipc/menu-file.ts:80-120`：9 个编码 id（`codingMenuHandlers`
 *   的 `encoding` / `switch` 两组，值经 `OPEN_WITH_ENCODING` / `CONVERT_TO_ENCODING` 发往渲染层）；
 * - 渲染层菜单 `src/renderer/src/components/MenuBar/menu-config.ts:214-250`：9 个编码的
 *   labelKey 与菜单 action；
 * - 主进程编码名归一化 `src/main/utils/file-utils/file-encoding.ts:26-55`：jschardet 返回名
 *   → iconv-lite 可用的编码名别名表；
 * - 状态栏编码展示（`StatusBar.vue:41-42`，默认 utf-8）。
 *
 * 本文件只提供「编码 id + i18n labelKey + 别名表」常量清单，**不定义菜单 action 字符串**
 * （`baize:menu:coding:*` 属于跨进程路由契约，菜单路由本轮不迁移，避免与后续阶段冲突）。
 * 本批次只新建常量、不改任何使用方（引用迁移由后续阶段负责）。
 */

/* ==================== 一、文件编码清单（9 项） ==================== */

/**
 * 文件编码标识（与主进程菜单路由、渲染层菜单 action 后缀、`OPEN_WITH_ENCODING` /
 * `CONVERT_TO_ENCODING` IPC 载荷中的值逐字一致）。
 */
export type FileEncoding =
    'utf8' | 'utf16-le' | 'utf16-be' | 'gbk' | 'gb2312' | 'gb18030' | 'big5' | 'big5-hkscs' | 'hex'

/** 文件编码菜单项：id 为编码标识，labelKey 为 i18n 标签键（菜单渲染时 `t(labelKey)`） */
export interface FileEncodingOption {
    /** 编码标识（IPC 载荷 / 菜单 id 后缀使用的短标识） */
    readonly id: FileEncoding
    /** i18n 标签键（`src/shared/i18n/messages/{zh-CN,en-US}/menu.ts` 的 `menu.coding.*`） */
    readonly labelKey: string
}

/**
 * 9 项文件编码（顺序即菜单展示顺序：UTF-8 / UTF-16LE / UTF-16BE 一组，GBK 系与 Big5 系一组，
 * 十六进制单列；与 `menu-config.ts` 的 `opeFileEncoding` / `switchEncodingMenu` 分组一致）。
 * 进程 / 用途：主进程「重新用…编码打开 / 转为…编码」菜单路由；渲染层菜单展示；状态栏编码展示。
 * 来源：`src/main/ipc/menu-file.ts:80-120`（编码 id）与
 * `src/renderer/src/components/MenuBar/menu-config.ts:217-250`（labelKey）。
 */
export const FILE_ENCODINGS: readonly FileEncodingOption[] = [
    { id: 'utf8', labelKey: 'menu.coding.utf8' },
    { id: 'utf16-le', labelKey: 'menu.coding.utf16le' },
    { id: 'utf16-be', labelKey: 'menu.coding.utf16be' },
    { id: 'gbk', labelKey: 'menu.coding.gbk' },
    { id: 'gb2312', labelKey: 'menu.coding.gb2312' },
    { id: 'gb18030', labelKey: 'menu.coding.gb18030' },
    { id: 'big5', labelKey: 'menu.coding.big5' },
    { id: 'big5-hkscs', labelKey: 'menu.coding.big5hkscs' },
    { id: 'hex', labelKey: 'menu.coding.hex' }
]

/* ==================== 二、编码名归一化别名表 ==================== */

/**
 * 编码名归一化表（15 项）：将 jschardet 的返回名（如 GB2312 / ASCII）映射为
 * iconv-lite 可用的编码名；未识别名在 `normalizeEncoding` 中保守回退 `utf-8`。
 * 进程 / 用途：主进程 / 文件编码探测与按指定编码打开。
 * 来源：`src/main/utils/file-utils/file-encoding.ts:24-44`（模块私有常量 `ENCODING_ALIASES`）。
 */
export const ENCODING_ALIASES: Readonly<Record<string, string>> = {
    'utf-8': 'utf-8',
    utf8: 'utf-8',
    ascii: 'utf-8',
    gb2312: 'gbk',
    gbk: 'gbk',
    gb18030: 'gbk',
    big5: 'big5',
    'utf-16le': 'utf-16le',
    'utf-16be': 'utf-16be',
    shift_jis: 'shift_jis',
    sjis: 'shift_jis',
    'euc-jp': 'euc-jp',
    'euc-kr': 'euc-kr',
    'windows-1252': 'windows-1252',
    latin1: 'latin1'
}
