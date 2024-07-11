import * as dialogs from '../dialogs/dialogs'

export const WebLinks: MenuContext[] = [
  { label: 'Mermaid在线编辑器', context: 'https://mermaid.live/edit' },
  { label: 'PlantText编辑器', context: 'https://www.planttext.com/' },
  { label: '在线思维导图工具', context: 'https://www.mindline.cn/webapp' },
  { label: '在线流程图绘制', context: 'https://app.diagrams.net/' },
  { label: 'PlantUml 网页服务器', context: 'http://www.plantuml.com/plantuml/uml/' }
]

function GenWebOnlineSubMenu(items: MenuContext[]): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    return {
      label: item.label, // 根据类别设置标签
      click: () => {
        dialogs.OpenOnlineWebPage(item.context)
      }
    }
  })
}

// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(): Electron.MenuItemConstructorOptions {
  const pluginsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '在线工具网站',
      submenu: GenWebOnlineSubMenu(WebLinks)
    }
  ]

  return {
    label: '插件(P)',
    enabled: true,
    accelerator: 'alt+p',
    submenu: pluginsMenuItems
  }
}
