import { computed, markRaw } from 'vue'

// 图标映射配置
const iconMap: Record<string, { light: string; dark: string }> = markRaw({
  'file': { light: 'icon-file-light.svg', dark: 'icon-file.svg' },
  'edit': { light: 'icon-edit-light.svg', dark: 'icon-edit.svg' },
  'view': { light: 'icon-view-light.svg', dark: 'icon-view.svg' },
  'coding': { light: 'icon-coding-light.svg', dark: 'icon-coding.svg' },
  'insert': { light: 'icon-insert-light.svg', dark: 'icon-insert.svg' },
  'setting': { light: 'icon-setting-light.svg', dark: 'icon-setting.svg' },
  'tools': { light: 'icon-tools-light.svg', dark: 'icon-tools.svg' },
  'plugins': { light: 'icon-plugins-light.svg', dark: 'icon-plugins.svg' },
  'online': { light: 'icon-online-light.svg', dark: 'icon-online.svg' },
  'quicklink': { light: 'icon-quicklink-light.svg', dark: 'icon-quicklink.svg' },
  'github': { light: 'icon-github-light.svg', dark: 'icon-github.svg' },
  'help': { light: 'icon-help-light.svg', dark: 'icon-help.svg' },
  'new-file': { light: 'icon-new-file-light.svg', dark: 'icon-new-file.svg' },
  'open-file': { light: 'icon-open-file-light.svg', dark: 'icon-open-file.svg' },
  'save': { light: 'icon-save-light.svg', dark: 'icon-save.svg' },
  'export': { light: 'icon-export-light.svg', dark: 'icon-export.svg' },
  'import': { light: 'icon-import-light.svg', dark: 'icon-import.svg' },
  'search': { light: 'icon-search-light.svg', dark: 'icon-search.svg' },
  'theme': { light: 'icon-theme-switch-light.svg', dark: 'icon-theme-switch.svg' },
  'md-edit': { light: 'icon-md-edit-light.svg', dark: 'icon-md-edit.svg' },
  'live-preview': { light: 'icon-live-preview-light.svg', dark: 'icon-live-preview.svg' },
  'multi-cursor': { light: 'icon-multi-cursor-light.svg', dark: 'icon-multi-cursor.svg' },
  'katex': { light: 'icon-katex-light.svg', dark: 'icon-katex.svg' },
  'mermaid': { light: 'icon-mermaid-light.svg', dark: 'icon-mermaid.svg' },
  'html-convert': { light: 'icon-html-convert-light.svg', dark: 'icon-html-convert.svg' },
  'multi-format': { light: 'icon-multi-format-light.svg', dark: 'icon-multi-format.svg' },
  'import-export': { light: 'icon-import-export-light.svg', dark: 'icon-import-export.svg' }
})

// 判断主题是否为深色主题
function isDarkTheme(themeType: string): boolean {
  const darkThemes = [
    'dark', 'deepdark', 'icon', 'ocean', 'forest',
    'baize-data-dark', 'baize-mirror-dark'
  ]
  return darkThemes.includes(themeType)
}

// 获取图标路径
export function getIconPath(iconName: string, themeType: string): string {
  const icon = iconMap[iconName]
  if (!icon) {
    console.warn(`Icon "${iconName}" not found in icon map`)
    return ''
  }

  const isDark = isDarkTheme(themeType)
  const iconFile = isDark ? icon.dark : icon.light
  const folder = isDark ? 'dark' : 'light'

  return `@/assets/icons/${folder}/${iconFile}`
}

// 组合式函数：根据主题自动切换图标
export function useThemeIcons(currentTheme: { value: string }) {
  const isDark = computed(() => isDarkTheme(currentTheme.value))

  const getIcon = (iconName: string): string => {
    return getIconPath(iconName, currentTheme.value)
  }

  return {
    isDark,
    getIcon
  }
}

// 导出图标映射供外部使用
export { iconMap, isDarkTheme }