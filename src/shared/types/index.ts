export interface SystemSetting {
    language: string
    resourceManager: string
    editorModel: string
    pluginOpen: string
    menuBarStyle: string
    autoSaveEnabled: boolean
    autoSaveInterval: number
    fontFamily: string
    fontSize: number
    renderWhitespace: string
    editorSettingModal: boolean
    systemSettingModal: boolean
    themeSettingModal: boolean
    helpAboutModal: boolean
    helpContactUsModal: boolean
    insertImageModal: boolean
    admonitionsModal: boolean
    fontSelectModal: boolean
    mathTextModal: boolean
    mdSheetModal: boolean
    importOptionModal: boolean
    mermaidEditModal: boolean
    quickLinkSettingModal: boolean
    techStackModal: boolean
    webUrlModal: boolean
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
    usl?: string
    icon?: string
}

export interface FileItem {
    name: string
    path: string
    type: 'file' | 'folder'
    isDirectory: boolean
    fileExtension?: string
    children: FileItem[]
}

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
