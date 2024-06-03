// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars

export function getAppInsertMenuItem(mainWindow: Electron.BrowserWindow) {
  const insertMenuItemCodeBlock: Electron.MenuItemConstructorOptions[] = [
    {
      label: '特殊字体 ...待开发',
      click: () => {
        import('../../lib/templates/textblock/textblock').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.showFontDialog()
          )
        })
      }
    },
    {
      label: 'markdown表格 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Html表格 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '折叠代码块',
      click: () => {
        import('../../lib/templates/textblock/textblock').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.blockcode)
        })
      }
    },
    {
      label: '内容选项卡 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '网格模板 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'xxxx模板 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '图片链接',
      click: () => {
        insertTextBlockImagesLinks(mainWindow)
      }
    },
    {
      label: '文章更新日期',
      click: () => {
        insertTextBlockArticleUpdateDate(mainWindow)
      }
    }
  ]
  const insertMenuItemWriteTemp: Electron.MenuItemConstructorOptions[] = [
    {
      label: '力扣解题模板',
      click: () => {
        insertLeetCodeProblemSolving(mainWindow)
      }
    },
    {
      label: '问题处理模板 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '帖子模板 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '文章封面 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'xxxx模板 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  const insertMenuItemMermaid: Electron.MenuItemConstructorOptions[] = [
    {
      label: '基本流程图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.graph)
        })
      }
    },
    {
      label: 'flowchart',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.flowchart)
        })
      }
    },
    {
      label: '序列图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.sequenceDiagram)
        })
      }
    },
    {
      label: '类图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.classDiagram)
        })
      }
    },
    {
      label: '状态图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.stateDiagram)
        })
      }
    },
    {
      label: '实体关系图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.erDiagram)
        })
      }
    },
    {
      label: '用户旅程图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.journey)
        })
      }
    },
    {
      label: '甘特图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.gantt)
        })
      }
    },
    {
      label: '饼图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.pie)
        })
      }
    },
    {
      label: '象限图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.quadrantChart)
        })
      }
    },
    {
      label: '需求图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.requirementDiagram
          )
        })
      }
    },
    {
      label: 'GitGraph',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.gitGraph)
        })
      }
    },
    {
      label: 'C4图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.C4Context)
        })
      }
    },
    {
      label: '思维导图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.mindmap)
        })
      }
    },
    {
      label: '时间线图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.timeline)
        })
      }
    },
    {
      label: 'Zenuml',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.zenuml)
        })
      }
    },
    {
      label: '桑基图',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.sankey)
        })
      }
    },
    {
      label: 'XYChart',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.xychart)
        })
      }
    },
    {
      label: 'BlockDiagram',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.blockDiagram)
        })
      }
    },
    {
      label: 'Packet',
      click: () => {
        import('../../lib/templates/mermaid/mermaid').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.packet)
        })
      }
    }
  ]
  const insertMenuItemPlantUML: Electron.MenuItemConstructorOptions[] = [
    {
      label: '序列图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.SequenceDiagram)
        })
      }
    },
    {
      label: '用例图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.UseCaseDiagram)
        })
      }
    },
    {
      label: '类图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.ClassDiagram)
        })
      }
    },
    {
      label: '对象图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.ObjectDiagram)
        })
      }
    },
    {
      label: '活动图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.ActivityDiagram)
        })
      }
    },
    {
      label: '组件图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.ComponentDiagram)
        })
      }
    },
    {
      label: '部署图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.DeploymentDiagram
          )
        })
      }
    },
    {
      label: '状态图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.StateDiagram)
        })
      }
    },
    {
      label: '定时图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.TimingDiagram)
        })
      }
    },
    {
      label: 'JSON 数据',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.JsonDiagram)
        })
      }
    },
    {
      label: 'YAML 数据',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.YamlDiagram)
        })
      }
    },
    {
      label: 'EBNF 图表',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.ExtendedBackusNaurForm
          )
        })
      }
    },
    {
      label: 'Regex 图表',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.RegularExpression
          )
        })
      }
    },
    {
      label: '网络图 (nwdiag)',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.nwdiag)
        })
      }
    },
    {
      label: '用户界面模型 (salt)',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.salt)
        })
      }
    },
    {
      label: '架构图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.ArchimateDiagram)
        })
      }
    },
    {
      label: '规范和描述语言（SDL）',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.ActivityDiagram)
        })
      }
    },
    {
      label: 'Ditaa 图表',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.DitaaDiagram)
        })
      }
    },
    {
      label: '甘特图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.GanttDiagram)
        })
      }
    },
    {
      label: '思维导图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.MindmapDiagram)
        })
      }
    },
    {
      label: 'WBS 图表',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.WBSDiagram)
        })
      }
    },
    {
      label: '信息工程图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.InformationEngineering
          )
        })
      }
    },
    {
      label: '实体关系图',
      click: () => {
        import('../../lib/templates/plantuml/plantuml').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.EntityRelationship
          )
        })
      }
    }
  ]
  const insertMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '插入写作模板',
      submenu: insertMenuItemWriteTemp
    },
    {
      label: '插入卡片 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '插入文本',
      submenu: insertMenuItemCodeBlock
    },
    {
      label: '插入数学公式 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '插入链接 ...待开发',
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
      label: '自定义模板 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '模板管理 ...待开发',
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

function insertLeetCodeProblemSolving(mainWindow: Electron.BrowserWindow) {
  import('../../lib/templates/writing/writing').then((module) => {
    mainWindow.webContents.send('monaco-insert-writing-templates', module.leetcode_problem_solving)
  })
}

function insertTextBlockArticleUpdateDate(mainWindow: Electron.BrowserWindow) {
  import('../../lib/templates/textblock/textblock').then((module) => {
    mainWindow.webContents.send('monaco-insert-text-block-templates', module.getFormattedDate())
  })
}

function insertTextBlockImagesLinks(mainWindow: Electron.BrowserWindow) {
  import('../../lib/templates/textblock/textblock').then((module) => {
    mainWindow.webContents.send('monaco-insert-text-block-templates', module.image_links)
  })
}
