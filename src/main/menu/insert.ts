// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars

export function getAppInsertMenuItem(mainWindow: Electron.BrowserWindow) {
  const insertMenuItemCodeBlock: Electron.MenuItemConstructorOptions[] = [
    {
      label: '特殊字体',
      click: () => {
        import('../dialogs/dialogs').then((module) => {
          module.showFontSelectDialog(mainWindow)
        })
      }
    },
    {
      label: 'markdown表格',
      click: () => {
        import('../dialogs/dialogs').then((module) => {
          module.showMarkdownSheetDialog(mainWindow)
        })
      }
    },
    {
      label: '折叠代码块',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_textblock.blockcode
          )
        })
      }
    },
    {
      label: '图片链接',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_textblock.image_links
          )
        })
      }
    },
    {
      label: '文章更新日期',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_textblock.getFormattedDate()
          )
        })
      }
    },
    {
      label: '链接列表',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_textblock.linksList
          )
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
    }
  ]
  const insertMenuItemWriteTemp: Electron.MenuItemConstructorOptions[] = [
    {
      label: '力扣解题模板',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-writing-templates',
            module.T_writing.leetcode_problem_solving
          )
        })
      }
    },
    {
      label: '问题处理模板',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-writing-templates',
            module.T_writing.problemResolving
          )
        })
      }
    },
    {
      label: '文章封面',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-writing-templates',
            module.T_writing.thesisCoverPage
          )
        })
      }
    },
    {
      label: '论文模板',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-writing-templates',
            module.T_writing.thesisTemplates
          )
        })
      }
    }
  ]
  const insertMenuItemMermaid: Electron.MenuItemConstructorOptions[] = [
    {
      label: '基本流程图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.T_mermaid.graph)
        })
      }
    },
    {
      label: 'flowchart',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.flowchart
          )
        })
      }
    },
    {
      label: '序列图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.sequenceDiagram
          )
        })
      }
    },
    {
      label: '类图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.classDiagram
          )
        })
      }
    },
    {
      label: '状态图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.stateDiagram
          )
        })
      }
    },
    {
      label: '实体关系图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.erDiagram
          )
        })
      }
    },
    {
      label: '用户旅程图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.journey
          )
        })
      }
    },
    {
      label: '甘特图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.T_mermaid.gantt)
        })
      }
    },
    {
      label: '饼图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.T_mermaid.pie)
        })
      }
    },
    {
      label: '象限图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.quadrantChart
          )
        })
      }
    },
    {
      label: '需求图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.requirementDiagram
          )
        })
      }
    },
    {
      label: 'GitGraph',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.gitGraph
          )
        })
      }
    },
    {
      label: 'C4图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.C4Context
          )
        })
      }
    },
    {
      label: '思维导图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.mindmap
          )
        })
      }
    },
    {
      label: '时间线图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.timeline
          )
        })
      }
    },
    {
      label: 'Zenuml',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.T_mermaid.zenuml)
        })
      }
    },
    {
      label: '桑基图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.T_mermaid.sankey)
        })
      }
    },
    {
      label: 'XYChart',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.xychart
          )
        })
      }
    },
    {
      label: 'BlockDiagram',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_mermaid.blockDiagram
          )
        })
      }
    },
    {
      label: 'Packet',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.T_mermaid.packet)
        })
      }
    }
  ]
  const insertMenuItemPlantUML: Electron.MenuItemConstructorOptions[] = [
    {
      label: '序列图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.SequenceDiagram
          )
        })
      }
    },
    {
      label: '用例图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.UseCaseDiagram
          )
        })
      }
    },
    {
      label: '类图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.ClassDiagram
          )
        })
      }
    },
    {
      label: '对象图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.ObjectDiagram
          )
        })
      }
    },
    {
      label: '活动图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.ActivityDiagram
          )
        })
      }
    },
    {
      label: '组件图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.ComponentDiagram
          )
        })
      }
    },
    {
      label: '部署图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.DeploymentDiagram
          )
        })
      }
    },
    {
      label: '状态图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.StateDiagram
          )
        })
      }
    },
    {
      label: '定时图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.TimingDiagram
          )
        })
      }
    },
    {
      label: 'JSON 数据',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.JsonDiagram
          )
        })
      }
    },
    {
      label: 'YAML 数据',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.YamlDiagram
          )
        })
      }
    },
    {
      label: 'EBNF 图表',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.ExtendedBackusNaurForm
          )
        })
      }
    },
    {
      label: 'Regex 图表',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.RegularExpression
          )
        })
      }
    },
    {
      label: '网络图 (nwdiag)',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.nwdiag
          )
        })
      }
    },
    {
      label: '用户界面模型 (salt)',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send('monaco-insert-text-block-templates', module.T_plantuml.salt)
        })
      }
    },
    {
      label: '架构图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.ArchimateDiagram
          )
        })
      }
    },
    {
      label: '规范和描述语言（SDL）',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.ActivityDiagram
          )
        })
      }
    },
    {
      label: 'Ditaa 图表',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.DitaaDiagram
          )
        })
      }
    },
    {
      label: '甘特图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.GanttDiagram
          )
        })
      }
    },
    {
      label: '思维导图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.MindmapDiagram
          )
        })
      }
    },
    {
      label: 'WBS 图表',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.WBSDiagram
          )
        })
      }
    },
    {
      label: '信息工程图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.InformationEngineering
          )
        })
      }
    },
    {
      label: '实体关系图',
      click: () => {
        import('../templates/templates').then((module) => {
          mainWindow.webContents.send(
            'monaco-insert-text-block-templates',
            module.T_plantuml.EntityRelationship
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
      label: '插入文本',
      submenu: insertMenuItemCodeBlock
    },
    {
      label: '插入数学公式',
      click: () => {
        import('../dialogs/dialogs').then((module) => {
          module.showMathTextDialog(mainWindow)
        })
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
