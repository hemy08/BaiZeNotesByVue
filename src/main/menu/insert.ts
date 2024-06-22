// eslint-disable-next-line no-unused-vars
export function getAppInsertMenuItem(mainWindow: Electron.BrowserWindow) {
  const insertMenuItemCodeBlock: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'markdown表格',
      click: () => {
        global.hemy.dialog.markdownSheet()
      }
    },
    {
      label: '折叠代码块',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.textblock.blockcode
        )
      }
    },
    {
      label: '图片链接',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.textblock.imageLinks
        )
      }
    },
    {
      label: '文章更新日期',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.textblock.getFmtData()
        )
      }
    },
    {
      label: '链接列表',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.textblock.linksList
        )
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
        mainWindow.webContents.send(
          'monaco-insert-writing-templates',
          global.hemy.template.writing.leetcodeIssue
        )
      }
    },
    {
      label: '问题处理模板',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-writing-templates',
          global.hemy.template.writing.problemResolving
        )
      }
    },
    {
      label: '文章封面',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-writing-templates',
          global.hemy.template.writing.thesisCoverPage
        )
      }
    },
    {
      label: '论文模板',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-writing-templates',
          global.hemy.template.writing.thesisTemplates
        )
      }
    }
  ]
  const insertMaterialItem: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Admonition',
      click: () => {
        global.hemy.dialog.admonition()
      }
    }
  ]
  const insertMenuItemMermaid: Electron.MenuItemConstructorOptions[] = [
    {
      label: '基本流程图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.graph
        )
      }
    },
    {
      label: 'flowchart',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.flowchart
        )
      }
    },
    {
      label: '序列图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.sequenceDiagram
        )
      }
    },
    {
      label: '类图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.classDiagram
        )
      }
    },
    {
      label: '状态图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.stateDiagram
        )
      }
    },
    {
      label: '实体关系图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.erDiagram
        )
      }
    },
    {
      label: '用户旅程图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.journey
        )
      }
    },
    {
      label: '甘特图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.gantt
        )
      }
    },
    {
      label: '饼图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.pie
        )
      }
    },
    {
      label: '象限图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.quadrantChart
        )
      }
    },
    {
      label: '需求图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.requirementDiagram
        )
      }
    },
    {
      label: 'GitGraph',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.gitGraph
        )
      }
    },
    {
      label: 'C4图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.C4Context
        )
      }
    },
    {
      label: '思维导图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.mindmap
        )
      }
    },
    {
      label: '时间线图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.timeline
        )
      }
    },
    {
      label: 'Zenuml',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.zenuml
        )
      }
    },
    {
      label: '桑基图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.sankey
        )
      }
    },
    {
      label: 'XYChart',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.xychart
        )
      }
    },
    {
      label: 'BlockDiagram',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.blockDiagram
        )
      }
    },
    {
      label: 'Packet',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.mermaid.packet
        )
      }
    }
  ]
  const insertMenuItemPlantUML: Electron.MenuItemConstructorOptions[] = [
    {
      label: '序列图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.SequenceDiagram
        )
      }
    },
    {
      label: '用例图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.UseCaseDiagram
        )
      }
    },
    {
      label: '类图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.ClassDiagram
        )
      }
    },
    {
      label: '对象图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.ObjectDiagram
        )
      }
    },
    {
      label: '活动图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.ActivityDiagram
        )
      }
    },
    {
      label: '组件图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.ComponentDiagram
        )
      }
    },
    {
      label: '部署图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.DeploymentDiagram
        )
      }
    },
    {
      label: '状态图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.StateDiagram
        )
      }
    },
    {
      label: '定时图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.TimingDiagram
        )
      }
    },
    {
      label: 'JSON 数据',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.JsonDiagram
        )
      }
    },
    {
      label: 'YAML 数据',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.YamlDiagram
        )
      }
    },
    {
      label: 'EBNF 图表',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.ExtendedBackusNaurForm
        )
      }
    },
    {
      label: 'Regex 图表',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.RegularExpression
        )
      }
    },
    {
      label: '网络图 (nwdiag)',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.nwdiag
        )
      }
    },
    {
      label: '用户界面模型 (salt)',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.salt
        )
      }
    },
    {
      label: '架构图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.ArchimateDiagram
        )
      }
    },
    {
      label: '规范和描述语言（SDL）',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.ActivityDiagram
        )
      }
    },
    {
      label: 'Ditaa 图表',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.DitaaDiagram
        )
      }
    },
    {
      label: '甘特图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.GanttDiagram
        )
      }
    },
    {
      label: '思维导图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.MindmapDiagram
        )
      }
    },
    {
      label: 'WBS 图表',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.WBSDiagram
        )
      }
    },
    {
      label: '信息工程图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.InformationEngineering
        )
      }
    },
    {
      label: '实体关系图',
      click: () => {
        mainWindow.webContents.send(
          'monaco-insert-text-block-templates',
          global.hemy.template.plantuml.EntityRelationship
        )
      }
    }
  ]
  const insertMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '写作模板',
      submenu: insertMenuItemWriteTemp
    },
    {
      label: '文本',
      submenu: insertMenuItemCodeBlock
    },
    {
      type: 'separator'
    },
    {
      label: '特殊字体',
      click: () => {
        global.hemy.dialog.selectFont()
      }
    },
    {
      label: '数学公式',
      click: () => {
        global.hemy.dialog.mathKatex()
      }
    },
    {
      type: 'separator'
    },
    {
      label: 'Material',
      submenu: insertMaterialItem
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
      type: 'separator'
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
