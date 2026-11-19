/**
 * file-utils 模块入口
 * 重新导出所有子模块的函数，保持向后兼容
 */

// 路径工具
export {
    GetCurrentFileDirectory,
    SelectDirectory,
    ParserFileName,
    ParseDirectoryPath,
    BuildFileTree
} from './path-utils'

// 对话框辅助（第 4 批 P3 清理：死包装 showConfirmDialog/showSaveDialog/showOpenDialog 已删除）
export { showErrorMessageBox, showInfoMessageBox, showWarningMessageBox } from './dialog-helpers'

// 自动保存
export { StartAutoSaveFileTime, StopAutoSaveFileTime, IsAutoSaveRunning } from './auto-save'

// 基础文件操作
export {
    SaveActiveFile,
    SaveActiveFileAs,
    TraverseDirectory,
    CreateFileFolder,
    ReloadDirFromDisk,
    OpenSelectFile,
    OpenFile,
    CreateFile,
    OpenDirectory,
    GetSelectDir,
    CreateDirectory,
    Rename,
    Delete,
    OpenFolderExplorer,
    getMathRandom,
    RenameFileFolder,
    DeleteFileFolder,
    ReopenActiveFileWithEncoding,
    ConvertActiveFileEncoding,
    normalizeEncoding,
    decodeFileContent,
    encodeFileContent
} from './file-operations'

// 图片操作
export {
    SaveImageDataToFile,
    InsertImagesToFile,
    CopyRelativePath,
    CopyFileLink,
    CopyImageLink
} from './image-operations'

// 剪贴板操作
export {
    FileManagerContextMenuCopy,
    FileManagerContextMenuCut,
    FileManagerContextMenuPaste
} from './clipboard-operations'

// 导入模块
export { InsertImportFormFile, InsertImportFrom, ImportCreateNewFile } from './import'

// 导出模块
export { ExportToFile } from './export'
