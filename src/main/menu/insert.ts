// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppInsertMenuItem(mainWindow: Electron.BrowserWindow) {
  const insertMenuItemCodeBlock: Electron.MenuItemConstructorOptions[] = [
    {
      label: '红色加粗字体',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'markdown表格',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Html表格',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '折叠代码块',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '内容选项卡',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '网格模板',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'xxxx模板',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  const insertMenuItemWriteTemp: Electron.MenuItemConstructorOptions[] = [
    {
      label: '力扣解题模板',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '问题处理模板',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '帖子模板',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '图片链接',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '文章更新日期',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '文章封面',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'xxxx模板',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  const insertMenuItemMermaid: Electron.MenuItemConstructorOptions[] = [
    {
      label: '流程图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '序列图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '类图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '状态图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '实体关系图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '用户旅程图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '甘特图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '饼图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '象限图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '需求图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '甘特图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'C4图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '思维导图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '时间线图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Zenuml',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '桑基图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'XYChart',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'BlockDiagram',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Packet',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  const insertMenuItemPlantUML: Electron.MenuItemConstructorOptions[] = [
    {
      label: '序列图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '用例图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '类图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '对象图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '活动图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '组件图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '部署图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '状态图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '时序图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'JSON 数据',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'YAML 数据',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'EBNF 图表',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Regex 图表',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '网络图 (nwdiag)',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '用户界面模型 (salt)',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '架构图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '规范和描述语言（SDL）',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Ditaa 图表',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '甘特图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '思维导图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'WBS 图表',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '信息工程图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '实体关系图',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  const insertMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '插入写作模板',
      submenu: insertMenuItemWriteTemp
    },
    {
      label: '插入卡片',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '插入代码块',
      submenu: insertMenuItemCodeBlock
    },
    {
      label: '插入数学公式',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '插入链接',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Mermaid',
      submenu: insertMenuItemMermaid
    },
    {
      label: 'PlantUML',
      submenu: insertMenuItemPlantUML
    },
    {
      label: '自定义模板',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '模板管理',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  return {
    label: '插入(I)',
    submenu: insertMenuItems
  }
}
