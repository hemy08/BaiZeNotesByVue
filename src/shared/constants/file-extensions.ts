/**
 * 文件扩展名清单共享常量（公共接口归位第 1 批 1.16）。
 *
 * 现状（散落 5 处、口径不完全一致，本文件按语义拆成 4 组常量）：
 * - `src/main/utils/file-utils/directory-tree.ts:77-87`：目录树展示白名单（8 项，大小写敏感）；
 * - `src/main/ipc/handlers.ts:324-330`：图片选择框 / 复制到 images/ 的图片白名单（7 项，不带点）；
 * - `src/renderer/src/components/ResourceManager/resource-manager.ts:115-139`：文件图标映射
 *   （仅 `.md` / `.png` / `.jpg` 有专属图标，其余走 default，不是完整白名单）；
 * - `src/renderer/src/components/ResourceManager/FileTreeNode.vue:126-139`：文件点击路由
 *   （`.md` 打开编辑器 / `.html` / `.pdf` 切换查看器）；
 * - `src/renderer/src/components/Markdown/preview-md-blocks.ts:523-568`：snippets 可包含的
 *   文本扩展名白名单（43 项）。
 *
 * 注意「图片扩展名」在 main 中存在两套，本文件保留为两个常量并注释差异（低风险，不合并）：
 * - `IMAGE_EXTENSIONS`（7 项）：选择图片对话框 filters 与复制图片文件名白名单；
 * - `TREE_IMAGE_EXTENSIONS`（4 项）：目录树实际展示的图片子集。
 * 任务说明中的「树展示 5 项 vs 选择/复制 7 项」与当前代码不符：`directory-tree.ts` 的树白名单
 * 共 8 项，其中图片为 `.png/.jpg/.jpeg/.svg` 4 项；此处以实际代码为准，不自行补 `gif` 等。
 *
 * 本批次只新建常量、不改任何使用方（引用迁移由后续阶段负责）。
 */

/* ==================== 一、Markdown 主扩展名 ==================== */

/**
 * Markdown 主扩展名（小写带点，仅 `.md`）。
 * 进程 / 用途：主进程新建 / 导入 / 自动备份 / 目录树与渲染层点击路由均只认 `.md`
 * （`.markdown` 仅作为 snippets 可包含文本出现在下方 `SNIPPET_SUPPORTED_EXTENSIONS`）。
 * 来源：`src/main/utils/file-utils/directory-tree.ts:79`（树白名单首项）、
 * `src/main/dialogs/ShowCreateFileFolderDialog.ts:66`、`src/main/utils/auto-backup.ts:310`、
 * `src/renderer/src/components/ResourceManager/FileTreeNode.vue:128`。
 */
export const MARKDOWN_EXTENSIONS: readonly string[] = ['.md']

/* ==================== 二、目录树展示白名单 ==================== */

/**
 * 目录树支持展示的文件扩展名（8 项，小写带点，大小写敏感——保持优化前行为）。
 * 进程 / 用途：主进程 / `TraverseDirectory` 扫描与增量重扫时过滤文件条目。
 * 来源：`src/main/utils/file-utils/directory-tree.ts:77-87`（源码名 `SUPPORTED_FILE_EXTENSIONS`）。
 */
export const TREE_SUPPORTED_EXTENSIONS: readonly string[] = [
    '.md',
    '.png',
    '.jpg',
    '.jpeg',
    '.svg',
    '.pdf',
    '.txt',
    '.html'
]

/* ==================== 三、图片扩展名（两套口径） ==================== */

/**
 * 图片选择 / 复制白名单（7 项，小写带点）。
 * 进程 / 用途：主进程 / `SELECT_IMAGE` 对话框 filters 与复制到 `images/` 的文件名白名单
 * （源码中由不带点的 `IMAGE_FILE_EXTENSIONS` 加 `.` 派生为 `ALLOWED_IMAGE_EXTENSIONS`）。
 * 来源：`src/main/ipc/handlers.ts:324-330`。
 */
export const IMAGE_EXTENSIONS: readonly string[] = [
    '.png',
    '.jpg',
    '.jpeg',
    '.gif',
    '.webp',
    '.bmp',
    '.svg'
]

/**
 * 目录树中按图片展示的扩展名（4 项，小写带点）：`TREE_SUPPORTED_EXTENSIONS` 的图片子集。
 * 进程 / 用途：主进程 / 目录树文件条目；与 `IMAGE_EXTENSIONS` 的差异（树不展示
 * `.gif/.webp/.bmp`）是既有产品行为，本批次原样保留、不合并两套清单。
 * 来源：`src/main/utils/file-utils/directory-tree.ts:79-87`。
 */
export const TREE_IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.svg']

/* ==================== 四、snippets 片段包含白名单 ==================== */

/**
 * 允许作为 Markdown snippets（`--8<--`）包含的文本扩展名白名单（43 项，小写带点）。
 * 进程 / 用途：渲染进程 / Markdown 预览 snippets 展开时的路径安全校验。
 * 来源：`src/renderer/src/components/Markdown/preview-md-blocks.ts:523-568`
 * （源码导出名 `SNIPPET_ALLOWED_EXTENSIONS`）。
 */
export const SNIPPET_SUPPORTED_EXTENSIONS: readonly string[] = [
    '.md',
    '.markdown',
    '.txt',
    '.text',
    '.py',
    '.js',
    '.mjs',
    '.cjs',
    '.jsx',
    '.ts',
    '.tsx',
    '.json',
    '.yaml',
    '.yml',
    '.toml',
    '.ini',
    '.cfg',
    '.sh',
    '.bash',
    '.zsh',
    '.ps1',
    '.bat',
    '.cmd',
    '.c',
    '.h',
    '.cpp',
    '.hpp',
    '.cs',
    '.java',
    '.go',
    '.rs',
    '.rb',
    '.php',
    '.sql',
    '.css',
    '.html',
    '.htm',
    '.xml',
    '.vue',
    '.log',
    '.csv',
    '.diff',
    '.patch'
]

/* ==================== 五、READ_HTML 文本读取白名单 ==================== */

/**
 * 允许经 `FILE.READ_HTML`（`baize:file:read-html`）按 UTF-8 读取的文本/文档扩展名
 * （44 项，小写带点）。
 *
 * 进程 / 用途：主进程 / READ_HTML handler 的扩展名白名单（安全剩余项 P3 加固：
 * 该通道此前只做 Path Guard，受信根内任意文件（含二进制）都可被读成字符串，
 * 若渲染层出现 XSS 可借道读取 SSH 私钥之外的各类非文本文件/探测路径）。
 *
 * 口径：
 * - 与 `SNIPPET_SUPPORTED_EXTENSIONS`（Markdown snippets `--8<--` 异步展开）同源——
 *   snippets 的渲染层扩展名白名单是 READ_HTML 唯一「任意文本」消费方，二者必须同口径，
 *   否则主进程会拒绝渲染层已放行的片段文件；
 * - 额外补 `.svg`：SVG 为文本/XML 文档（非二进制），HTML 查看器/文本预览可安全按字符串读取；
 * - 白名单外的一律拒绝（`.exe/.dll/.pdf/.bin` 等二进制、无扩展名文件均不读取）。
 */
export const READ_HTML_TEXT_EXTENSIONS: readonly string[] = [
    ...SNIPPET_SUPPORTED_EXTENSIONS,
    '.svg'
]
