/**
 * 默认配置值定义
 */

// 主题配置
export const defaultThemeConfig = {
  currentTheme: 'baize',
  separateEditorTheme: false,
  editorTheme: 'vs'
}

// 编辑器配置
export const defaultEditorConfig = {
  fontFamily: 'Consolas',
  fontSize: 14,
  lineHeight: 1.6,
  tabSize: 2,
  wordWrap: 'on',
  autoSave: true,
  autoSaveInterval: 30,
  showLineNumbers: true,
  showSpaces: false,
  showEndOfLine: false,
  minimap: {
    enabled: true,
    maxColumn: 120
  },
  spellcheck: {
    enabled: false,
    language: 'en'
  }
}

// 系统配置
export const defaultSystemConfig = {
  autoOpenLastFile: true,
  autoOpenLastFolder: false,
  autoStart: false,
  minimizeToTray: true,
  rememberWindowSize: true,
  defaultFilePath: '',
  recentFilesCount: 10,
  language: 'zh-CN',
  checkUpdateOnStart: true,
  enableAutoBackup: true,
  backupInterval: 24,
  backupCount: 5
}

// 快捷链接配置
export const defaultQuickLinksConfig = {
  links: [
    {
      name: 'GitHub',
      url: 'https://github.com',
      icon: '🐙',
      description: '代码托管平台'
    },
    {
      name: 'Google',
      url: 'https://google.com',
      icon: '🔍',
      description: '搜索引擎'
    },
    {
      name: 'Stack Overflow',
      url: 'https://stackoverflow.com',
      icon: '📚',
      description: '程序员问答社区'
    }
  ]
}

// 工作状态配置（临时状态，不需要持久化到文件）
export const defaultWorkState = {
  lastOpenedFiles: [] as string[],
  lastOpenedFolders: [] as string[],
  lastActiveFile: '' as string | null,
  windowBounds: {
    width: 1200,
    height: 800,
    x: undefined as number | undefined,
    y: undefined as number | undefined,
    isMaximized: false
  },
  editorState: {
    cursorPosition: { line: 1, column: 1 },
    scrollPosition: { top: 0, left: 0 }
  }
}

// 导出所有默认配置
export const defaultConfigs = {
  theme: defaultThemeConfig,
  editor: defaultEditorConfig,
  system: defaultSystemConfig,
  'quick-links': defaultQuickLinksConfig
}
