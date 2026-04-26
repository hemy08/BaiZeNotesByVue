import * as monaco from 'monaco-editor'
import * as fileUtils from './utils/file-utils'
import * as dialogs from '../dialogs/dialogs'
import { Store } from 'electron-store'

class BaiZeStore {
    private store: Store
    private fileCache: Map<string, FileContent> = new Map()
    private readonly MAX_CACHE_SIZE = 50 // 最多缓存 50 个文件

    constructor() {
        this.store = new Store({
            name: 'app-state',
            defaults: {
                lastOpenedFile: null,
                lastOpenedDirectory: null,
                editorSettings: {},
                themeSettings: {}
            }
        })
    }

    // LRU 缓存策略
    setFileContent(path: string, content: string): void {
        if (this.fileCache.size >= this.MAX_CACHE_SIZE) {
            // 删除最旧的缓存
            const oldestKey = this.fileCache.keys().next().value
            this.fileCache.delete(oldestKey)
        }
        this.fileCache.set(path, {
            content,
            timestamp: Date.now(),
            size: content.length
        })
    }

    getFileContent(path: string): string | null {
        return this.fileCache.get(path)?.content || null
    }

    clearCache(): void {
        this.fileCache.clear()
    }
}

export const configStore = new BaiZeStore()

// global-types.d.ts
declare global {
    interface FileProperties {
        name: string
        path: string
        type: 'file' | 'folder'
        content: string
        children?: []
    }

    interface FileSysItem {
        id: never
        name: string
        path: string
        type: 'file' | 'folder'
        fileExtension: string
        isDirectory?: boolean
        isIndented?: boolean
        isExpanded?: boolean
        children?: {
            id: never
            name: string
            path: string
            fileExtension: string
            type: 'folder' | 'file'
            isDirectory: boolean
            isIndented: boolean
            isExpanded: boolean
            children?: never[]
        }[]
    }

    interface GlobalEmoji {
        file_icon: string
        folder_open: string
        folder_close: string
    }

    interface GlobalSvg {
        file_icon: string
        folder_collapse_close: string
        folder_collapse_open: string
        folder_open: string
        folder_close: string
        md_file_svg: string
        png_file_svg: string
        jpg_file_svg: string
    }

    interface GlobalEditToolBar {
        Font: string
    }

    interface Hemy {
        file: fileUtils
        dialog: dialogs
    }

    interface CryptoData {
        context: string
        secretKey: string
        secretKeyEncoding: BufferEncoding
        algorithm: string
        inputEncoding?: BufferEncoding
        outputEncoding?: BufferEncoding
        iv?: string
    }

    interface CryptoResult {
        context: string
        secretKey: string
        secretKeyEncoding: BufferEncoding
        iv: string
    }

    interface Global extends NodeJS.Global {
        current_active_file?: FileProperties // 使用 ? 表示它可能是 undefined
        ImagePath: string
        hemy: Hemy
        MainWindow: Electron.BrowserWindow
        MainShowWarn: string
        RootPath: string
        SavingFile: boolean
        SaveFileInterval: string
        srcDirCopyCut: string
        isCopyOrCut: 'copy' | 'cut'
        isCopyCutFile: boolean
        Emoji: GlobalEmoji
        FileMgrSvgs: GlobalSvg
        EditorToolBar: GlobalEditToolBar
        mdFileTree: ''
        MonacoEditorConfig: monaco.editor.IStandaloneEditorConstructionOptions
        KatexConfig: NonNullable<unknown>
        SupportLanguage: []
    }
}

// 系统设置配置接口
export interface SystemSetting {
    language: string
    resourceManager: string
    editorModel: string
    pluginOpen: string
    menuBarStyle: string // 'electron' | 'windows-native'
    autoSaveEnabled: boolean // 是否启用自动保存，默认true
    autoSaveInterval: number // 自动保存间隔（秒），最小5秒，最大86400秒（24小时）
    fontFamily: string // 界面字体，如 'Microsoft YaHei', 'Segoe UI', 'PingFang SC'
    fontSize: number // 界面字体大小(px)，范围 10-24，默认 13
    // 窗口浮动控制（模态/非模态）
    editorSettingModal: boolean // 编辑器设置对话框是否模态，默认false
    systemSettingModal: boolean // 系统设置对话框是否模态，默认false
    themeSettingModal: boolean // 主题设置对话框是否模态，默认false
    helpAboutModal: boolean // 帮助关于对话框是否模态，默认false
    helpContactUsModal: boolean // 帮助联系我们对话框是否模态，默认false
    admonitionsModal: boolean // Admonitions对话框是否模态，默认false
    fontSelectModal: boolean // 字体选择对话框是否模态，默认false
    mathTextModal: boolean // 数学文本对话框是否模态，默认false
    mdSheetModal: boolean // Markdown速查表对话框是否模态，默认false
    importOptionModal: boolean // 导入选项对话框是否模态，默认false
    mermaidEditModal: boolean // Mermaid编辑对话框是否模态，默认false
    quickLinkSettingModal: boolean // 快速链接设置对话框是否模态，默认false
    techStackModal: boolean // 技术栈对话框是否模态，默认false
    webUrlModal: boolean // Web URL对话框是否模态，默认false
}

export interface MenuContext {
    label: string
    context: string
}

export interface BaiZeMenuItem {
    label?: string
    accelerator?: string
    menu_action?: string
    submenu?: BaiZeMenuItem[]
    type?: string
    enabled?: boolean
    usl?:string
} // 白泽编辑器菜单项

export interface FileItem {
    name: string
    path: string
    type: 'file' | 'folder'
    isDirectory: boolean
    fileExtension: string
    children: FileItem[]
}


// 主题样式接口
export interface ThemeStyles {
    name: string
    description: string
    titleBarGradient: string
    backgroundColor: string
    cardBackground: string
    textColor: string
    secondaryTextColor: string
    borderColor: string
    accentColor: string
    buttonBackground: string
    buttonTextColor: string
    hoverBackground: string
}

// 主题更新数据接口
export interface ThemeUpdateData {
    themeType: string
    separateEditorTheme: boolean
    monacoTheme: string
    themeStyles: ThemeStyles
}

export interface MarkdownTOC {
    id: string
    level: string
    text: string
    lineNumber: number
}
