const template = [
  {
    label: '文件(F)',
    accelerator: 'alt+f',
    submenu: [
      {
        label: '新建文件(N)',
        accelerator: 'ctrl+n',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '新建文件夹(D)',
        accelerator: 'ctrl+d',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '从文件导入',
        submenu: [
          {
            label: 'World',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Html',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Json',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Yaml',
            click: () => {
              /* 点击处理逻辑 */
            }
          }
        ]
      },
      {
        type: 'separator',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '打开文件',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '打开文件夹',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '导出',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '另存为',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '保存',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '保存所有',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: '历史记录',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '从磁盘重新读取',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: '退出',
        role: 'quit',
        accelerator: 'f4'
      }
    ]
  },
  {
    label: '编辑(E)',
    submenu: [
      {
        label: '撤销',
        role: 'undo',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '恢复',
        role: 'redo',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: '拷贝',
        role: 'copy',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '剪切',
        role: 'cut',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '黏贴',
        role: 'paste',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '删除',
        role: 'delete',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '查找',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '在文件中查找',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: '替换',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '在文件中替换',
        click: () => {
          /* 点击处理逻辑 */
        }
      }
    ]
  },
  {
    label: '视图(V)',
    submenu: [
      {
        label: '全屏',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '编辑模式',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '预览模式',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '编辑/预览模式',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: '显示/隐藏资源管理器',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '显示/隐藏行号',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '显示/隐藏制表符',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '显示/隐藏换行符',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '显示/隐藏文章大纲',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: '折叠/展开标题',
        submenu: [
          {
            label: '一级标题',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '二级标题',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '三级标题',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '四级标题',
            click: () => {
              /* 点击处理逻辑 */
            }
          }
        ]
      }
    ]
  },
  {
    label: '插入(I)',
    submenu: [
      {
        label: '插入写作模板',
        submenu: [
          {
            label: '力扣解题模板',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '问题处理模板',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '帖子模板',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '图片链接',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '文章更新日期',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '文章封面',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'xxxx模板',
            click: () => {
              /* 点击处理逻辑 */
            }
          }
        ]
      },
      {
        label: '插入卡片',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '插入代码块',
        submenu: [
          {
            label: '红色加粗字体',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'markdown表格',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Html表格',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '折叠代码块',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '内容选项卡',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '网格模板',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'xxxx模板',
            click: () => {
              /* 点击处理逻辑 */
            }
          }
        ]
      },
      {
        label: '插入数学公式',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '插入链接',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: 'Mermaid',
        submenu: [
          {
            label: '流程图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '序列图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '类图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '状态图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '实体关系图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '用户旅程图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '甘特图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '饼图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '象限图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '需求图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '甘特图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'C4图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '思维导图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '时间线图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Zenuml',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '桑基图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'XYChart',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'BlockDiagram',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Packet',
            click: () => {
              /* 点击处理逻辑 */
            }
          }
        ]
      },
      {
        label: 'PlantUML',
        submenu: [
          {
            label: '序列图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '用例图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '类图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '对象图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '活动图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '组件图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '部署图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '状态图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '时序图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'JSON 数据',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'YAML 数据',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'EBNF 图表',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Regex 图表',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '网络图 (nwdiag)',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '用户界面模型 (salt)',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '架构图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '规范和描述语言（SDL）',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'Ditaa 图表',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '甘特图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '思维导图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: 'WBS 图表',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '信息工程图',
            click: () => {
              /* 点击处理逻辑 */
            }
          },
          {
            label: '实体关系图',
            click: () => {
              /* 点击处理逻辑 */
            }
          }
        ]
      },
      {
        label: '自定义模板',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '模板管理',
        click: () => {
          /* 点击处理逻辑 */
        }
      }
    ]
  },
  {
    label: '设置(S)',
    submenu: [
      {
        label: '系统设置',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '主题',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '字体',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '编辑器',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: 'Markdown解析器',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: 'xxxx',
        click: () => {
          /* 点击处理逻辑 */
        }
      }
    ]
  },
  {
    label: '工具(T)',
    submenu: [
      {
        label: '电子表格',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '配图制作',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '绘图工具',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: 'xxxx',
        click: () => {
          /* 点击处理逻辑 */
        }
      }
    ]
  },
  {
    label: '插件(P)',
    submenu: [
      {
        label: 'PlantUML插件',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: 'Latex插件',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: 'JSON插件',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: 'Yaml插件',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: 'xxxx',
        click: () => {
          /* 点击处理逻辑 */
        }
      }
    ]
  },
  {
    label: '帮助(H)',
    submenu: [
      {
        label: '版本发行说明',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator'
      },
      {
        label: '键盘快捷方式',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '使用文档',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '提交创意/意见',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        type: 'separator',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '关于',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '主页',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '致谢',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '开源软件',
        click: () => {
          /* 点击处理逻辑 */
        }
      },
      {
        label: '检查更新',
        click: () => {
          /* 点击处理逻辑 */
        }
      }
    ]
  }
]

export function getApplicationMenu(mainWindow) {
  return template
}
