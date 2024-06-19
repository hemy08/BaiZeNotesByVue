import ContextMenu from '@imengyu/vue3-context-menu'
import * as fs from 'fs'
import * as path from 'path'

export interface FileSysItem {
  id: never
  name: string
  path: string
  type: 'file' | 'folder'
  fileExtension: string
  isDirectory: boolean
  isIndented: boolean
  isExpanded: boolean
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

type MappingTable = {
  [key: string]: {
    className: string
    style: string
    viewBox: string
    path: string
  } // 键是字符串，值是数字
}

export const FileMgrSvgs: MappingTable = {
  '.md': {
    className: 'file-icon',
    style: 'fill: #ff9100;',
    viewBox: '0 0 16 10',
    path: 'M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3ZM9 11V5H7L5.5 7 4 5H2v6h2V8l1.5 1.92L7 8v3Zm2.99.5L14.5 8H13V5h-2v3H9.5Z'
  },
  '.png': {
    className: 'file-icon',
    style: 'fill: #ff00ff;',
    viewBox: '0 0 24 24',
    path: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 11.5c0 .8-.7 1.5-1.5 1.5h-1v2H5V9h2.5c.8 0 1.5.7 1.5 1.5v1m5 3.5h-1.5l-1-2.5V15H10V9h1.5l1 2.5V9H14v6m5-4.5h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2h.1m-12.5 0h1v1h-1v-1Z'
  },
  '.jpg': {
    className: 'file-icon',
    style: 'fill: #a846b9;',
    viewBox: '0 0 24 24',
    path: 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 13.5c0 1.1-.9 1.5-2 1.5s-2-.4-2-1.5V12h1.5v1.5h1V9H9v4.5m5-2c0 .8-.7 1.5-1.5 1.5h-1v2H10V9h2.5c.8 0 1.5.7 1.5 1.5v1m5-1h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2m-7.4 0h1v1h-1v-1Z'
  },
  default: {
    className: 'file-icon',
    style: 'fill: #9e9e9e;',
    viewBox: '0 0 24 24',
    path: 'M13 9V3.5L18.5 9M6 2c-1.11 0-2 .89-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Z'
  },
  'folder-open': {
    className: 'folder-icon',
    style: 'fill: #f0dc4e;',
    viewBox: '0 0 24 24',
    path: 'M19 20H4a2 2 0 0 1-2-2V6c0-1.11.89-2 2-2h6l2 2h7a2 2 0 0 1 2 2H4v10l2.14-8h17.07l-2.28 8.5c-.23.87-1.01 1.5-1.93 1.5Z'
  },
  'folder-close': {
    className: 'folder-icon',
    style: 'fill: #dcb67a;',
    viewBox: '0 0 24 24',
    path: 'M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z'
  },
  'folder-collapse-open': {
    className: 'folder-collapse',
    style: 'fill: #3f6ec6;',
    viewBox: '0 0 24 24',
    path: 'm7 10 5 5 5-5H7Z'
  },
  'folder-collapse-close': {
    className: 'folder-collapse',
    style: 'fill: #0184bb;',
    viewBox: '0 0 24 24',
    path: 'm10 17 5-5-5-5v10Z'
  }
}

export function getFileMgrSvg(isExpanded: boolean, extension: string) {
  if (extension == 'folder') {
    return isExpanded ? FileMgrSvgs['folder-open'] : FileMgrSvgs['folder-close']
  } else if (extension == 'collapse') {
    return isExpanded ? FileMgrSvgs['folder-collapse-open'] : FileMgrSvgs['folder-collapse-close']
  } else {
    return FileMgrSvgs[extension.toLowerCase()] || FileMgrSvgs['default']
  }
}

export function handleContextMenu(e: MouseEvent, node: FileSysItem) {
  ContextMenu.showContextMenu({
    x: e.x,
    y: e.y,
    items: [
      {
        label: '新建',
        children: [
          {
            label: '文件',
            onClick: () => {
              ctxMenuCreateFolder(node, false)
            }
          },
          {
            label: '文件夹',
            divided: true,
            onClick: () => {
              ctxMenuCreateFolder(node, true)
            }
          },
          {
            label: 'Markdown文件',
            onClick: () => {
              alert('Markdown文件')
            }
          },
          {
            label: '从Word文档导入',
            onClick: () => {
              alert('从Word文档导入')
            }
          },
          {
            label: '从HTML文档导入',
            onClick: () => {
              alert('从HTML文档导入')
            }
          }
        ],
        divided: true
      },
      {
        label: '复制',
        children: [
          {
            label: '文件夹/文件',
            divided: true,
            onClick: () => {
              alert('文件夹/文件')
            }
          },
          {
            label: '文件夹名称',
            onClick: () => {
              alert('文件夹名称')
            }
          },
          {
            label: '文件夹绝对路径',
            onClick: () => {
              alert('文件夹绝对路径')
            }
          },
          {
            label: '相对于当前打开文件路径',
            onClick: () => {
              alert('相对于当前打开文件路径')
            }
          },
          {
            label: '复制为本地图片链接',
            onClick: () => {
              alert('复制为本地图片链接')
            }
          },
          {
            label: '复制为本地文件链接',
            onClick: () => {
              alert('复制为本地文件链接')
            }
          }
        ]
      },
      {
        label: '剪切',
        onClick: () => {
          alert('剪切')
        }
      },
      {
        label: '粘贴',
        onClick: () => {
          alert('粘贴')
        }
      },
      {
        label: '删除',
        onClick: () => {
          alert('删除')
        },
        divided: true
      },
      {
        label: '查找',
        children: [
          {
            label: '在文件中查找',
            onClick: () => {
              alert('在文件中查找')
            }
          },
          {
            label: '在文件夹中查找',
            onClick: () => {
              alert('在文件夹中查找')
            }
          }
        ]
      },
      {
        label: '重命名',
        onClick: () => {
          alert('重命名')
        }
      },
      {
        label: '刷新',
        onClick: () => {
          alert('刷新')
        },
        divided: true
      },
      {
        label: '在资源管理器打开',
        onClick: () => {
          alert('在资源管理器打开')
        }
      },
      {
        label: '从磁盘重新加载',
        onClick: () => {
          alert('从磁盘重新加载')
        }
      },
      {
        label: '属性',
        onClick: () => {
          alert('属性')
        }
      }
    ]
  })
}

function ctxMenuCreateFolder(node: FileSysItem, isFolder: boolean) {
  let directoryPath
  if (node.type === 'folder') {
    directoryPath = node.path
  } else {
    const lastIndex1 = node.path.lastIndexOf('\\')
    const lastIndex2 = node.path.lastIndexOf('/')
    const lastIndex = Math.max(lastIndex1, lastIndex2)
    directoryPath = node.path.substring(0, lastIndex)
  }

  window.electron.ipcRenderer.send('file-manager-context-menu-create-file', directoryPath, isFolder)
}
