import * as fs from 'fs'
import * as path from 'path'
import { dialog } from 'electron'
// @ts-ignore
import Store from 'electron-store'

const store = new Store()

/**
 * 节点类型
 */
export type NodeType = 'dir' | 'file'

/**
 * 文件树节点接口
 */
export interface TreeNode {
  nodeType: NodeType
  icon: string
  text: string
  path: string
  id: string
  children: TreeNode[]
  state?: {
    opened: boolean
    selected: boolean
  }
}

/**
 * 文件信息接口
 */
export interface FileInfo {
  name: string
  path: string
  value: string
}

/**
 * 扫描结果接口
 */
export interface ScanResult {
  fileName: string
  filePath: string
}

class Reader {
  /**
   * 打开并解码文件
   * @param filePath 文件路径
   * @param encoding 编码格式
   * @returns 文件内容或错误对象
   */
  static openAndDecode(filePath: string, encoding: BufferEncoding = 'utf-8'): string | Error {
    try {
      const content = fs.readFileSync(filePath, { encoding })
      return content
    } catch (e: any) {
      return new Error(`文件打开失败: ${e.message}`)
    }
  }

  /**
   * 解析文件名
   * @param fileAbsolutePath 文件绝对路径
   * @param extension 扩展名
   * @returns 文件名
   */
  static parseFileName(fileAbsolutePath: string, extension?: string): string {
    if (typeof extension === 'string' && extension.length > 0) {
      return path.basename(fileAbsolutePath, extension)
    }
    return path.basename(fileAbsolutePath)
  }

  /**
   * 读取文件内容
   * @param filePath 文件路径
   * @param encoding 文件编码
   * @returns Promise<string>
   */
  static readFile(filePath: string, encoding: BufferEncoding = 'utf8'): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!fs.existsSync(filePath)) {
        reject(new Error('读取HTML文件模板失败: 文件不存在。'))
        return
      }
      fs.readFile(filePath, { encoding }, (err, data) => {
        if (err) {
          reject(new Error(`读取HTML文件模板失败: ${err.message}`))
        } else {
          resolve(data)
        }
      })
    })
  }

  /**
   * 递归删除文件夹
   * @param pathToDelete 要删除的路径
   */
  static deleteFolderRecursive(pathToDelete: string): void {
    if (fs.existsSync(pathToDelete)) {
      fs.readdirSync(pathToDelete).forEach(function (file) {
        const curPath = path.join(pathToDelete, file)
        if (fs.lstatSync(curPath).isDirectory()) {
          Reader.deleteFolderRecursive(curPath)
        } else {
          fs.unlinkSync(curPath)
        }
      })
      fs.rmdirSync(pathToDelete)
    }
  }

  /**
   * 保存文件对话框
   * @param filters 文件过滤器
   * @param title 对话框标题
   * @param nameFieldLabel 名称字段标签
   * @returns Promise<string | undefined>
   */
  static saveAs(filters: any[], title?: string, nameFieldLabel: string = ''): Promise<string | undefined> {
    return new Promise((resolve) => {
      dialog
        .showSaveDialog({
          title: title ?? '文件另存为',
          buttonLabel: '保存',
          filters: filters ?? [
            {
              name: 'Markdown文件',
              extensions: ['md'],
            },
            {
              name: 'HTML文件',
              extensions: ['html'],
            },
            {
              name: 'PDF文件',
              extensions: ['pdf'],
            },
          ],
          nameFieldLabel: nameFieldLabel,
          properties: ['showOverwriteConfirmation'],
        })
        .then((file) => {
          if (!file.canceled && file.filePath) {
            resolve(file.filePath)
          } else {
            resolve(undefined)
          }
        })
        .catch((err) => {
          console.log(err)
          resolve(undefined)
        })
    })
  }

  /**
   * 保存文件
   * @param filePath 文件路径
   * @param fileValue 文件内容
   * @param showWarning 是否显示警告
   * @returns Promise<void>
   */
  static saveFile(filePath: string, fileValue: string, showWarning: boolean = true): Promise<void> {
    return new Promise((resolve, reject) => {
      // 文件不存在，先创建文件
      if (!fs.existsSync(filePath)) {
        try {
          fs.writeFileSync(filePath, '', { encoding: 'utf8' })
        } catch (e: any) {
          if (showWarning) {
            console.error('无法创建文件:', e)
          }
          reject(e)
          return
        }
      }

      // 简化版本，直接写入文件
      try {
        fs.writeFileSync(filePath, fileValue, { encoding: 'utf8' })
        resolve()
      } catch (err: any) {
        if (showWarning) {
          console.error('无法写入文件:', err)
        }
        reject(err)
      }
    })
  }

  /**
   * 打开文件对话框
   * @returns Promise<FileInfo | undefined>
   */
  static openFile(): Promise<FileInfo | undefined> {
    return new Promise((resolve) => {
      dialog
        .showOpenDialog({
          title: '打开文件',
          properties: ['openFile'],
          filters: [
            {
              extensions: ['md', 'markdown'],
              name: 'Markdown文件',
            },
          ],
        })
        .then((value) => {
          if (!value.canceled && value.filePaths.length > 0) {
            const splitNames = value.filePaths[0].split(path.sep)
            const str = Reader.openAndDecode(value.filePaths[0])
            if (typeof str === 'string') {
              resolve({
                name: splitNames[splitNames.length - 1],
                path: value.filePaths[0],
                value: str,
              })
            } else {
              resolve(undefined)
            }
          } else {
            resolve(undefined)
          }
        })
        .catch((e) => {
          console.log(e)
          resolve(undefined)
        })
    })
  }

  /**
   * 打开目录对话框
   * @param title 对话框标题
   * @returns Promise<TreeNode | null>
   */
  static openDirectory(title: string = '打开文件夹'): Promise<TreeNode | null> {
    return new Promise((resolve) => {
      dialog
        .showOpenDialog({
          title,
          properties: ['openDirectory'],
        })
        .then((value) => {
          if (!value.canceled && Array.isArray(value.filePaths) && value.filePaths.length > 0) {
            const directory = new Directory(value.filePaths[0])
            resolve(directory.getRoot())
          }
          resolve(null)
        })
        .catch((e) => {
          console.log(e)
          resolve(null)
        })
    })
  }

  /**
   * 重新加载目录
   * @param dirPath 目录路径
   * @returns Promise<TreeNode>
   */
  static reload(dirPath: string): Promise<TreeNode> {
    return new Promise((resolve) => {
      const directory = new Directory(dirPath)
      resolve(directory.getRoot())
    })
  }

  /**
   * 扫描给定文件夹路径下的文件
   * @param dirPath 待扫描文件夹路径
   * @param onlyScanMarkdown 是否只扫描Markdown文件
   * @returns 返回全路径列表
   */
  static scanDirectory(dirPath: string, onlyScanMarkdown: boolean = true): ScanResult[] {
    if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) return []

    const res: ScanResult[] = []
    const children = fs.readdirSync(dirPath).map((item) => ({
      fileName: item,
      filePath: path.join(dirPath, item),
    }))

    const traverse = (folderDir: ScanResult[]) => {
      for (let i = 0; i < folderDir.length; i++) {
        const stat = fs.lstatSync(folderDir[i].filePath)
        if (stat.isFile()) {
          if (/\.(md|markdown)$/i.test(folderDir[i].fileName)) {
            res.push({
              filePath: folderDir[i].filePath,
              fileName: folderDir[i].fileName,
            })
          } else if (!onlyScanMarkdown) {
            res.push({
              filePath: folderDir[i].filePath,
              fileName: folderDir[i].fileName,
            })
          }
        } else {
          traverse(
            fs.readdirSync(folderDir[i].filePath).map((item) => ({
              filePath: path.join(folderDir[i].filePath, item),
              fileName: item,
            }))
          )
        }
      }
    }

    traverse(children)

    return res
  }
}

class Directory {
  private onlyShowMd: boolean
  private id: number
  private root: TreeNode

  constructor(rootPath: string) {
    // 简化版本，不依赖config
    const preference = store.get('preference') as any || {}
    this.onlyShowMd = preference?.onlyShowMd === 'on'
    this.id = 0
    const splitPath = rootPath.split(path.sep)

    this.root = {
      nodeType: 'dir',
      text: splitPath[splitPath.length - 1],
      icon: 'jstree-folder',
      path: rootPath,
      id: this.id.toString(),
      children: [],
      // 默认展开根节点
      state: { opened: true, selected: true },
    }
    this.root.children = this.traverse(this.root)
  }

  /**
   * 生成节点ID
   * @param absolutePath 绝对路径
   * @returns 节点ID
   */
  static genNodeId(absolutePath: string): string {
    const stat = fs.lstatSync(absolutePath)
    return (stat.isFile() ? 'file_' : 'fir_') + absolutePath
  }

  /**
   * 生成文件节点ID
   * @param absolutePath 绝对路径
   * @returns 节点ID或null
   */
  static genFileNodeId(absolutePath: string): string | null {
    const stat = fs.lstatSync(absolutePath)
    return stat.isFile() ? `file_${absolutePath}` : null
  }

  /**
   * 综合排序
   * @param arr 字符串数组
   */
  static generalSort(arr: string[]): void {
    const reg = /^[a-zA-Z0-9.]/
    arr.sort((x, y) => {
      if (reg.test(x) || reg.test(y)) {
        if (x.startsWith('.') && !y.startsWith('.')) {
          return -1
        }
        if (!x.startsWith('.') && y.startsWith('.')) {
          return 1
        }

        const prevLowerCase = x.toLocaleLowerCase()
        const nextLowerCase = y.toLocaleLowerCase()

        const prevNumber = parseInt(prevLowerCase)
        const nextNumber = parseInt(nextLowerCase)

        // 数字排在字符串前面
        if (!isNaN(prevNumber) && isNaN(nextNumber)) {
          return -1
        }

        if (isNaN(prevNumber) && !isNaN(nextNumber)) {
          return 1
        }

        // 同时为数字时比较数字
        if (!isNaN(prevNumber) && !isNaN(nextNumber) && prevNumber !== nextNumber) {
          return prevNumber > nextNumber ? 1 : -1
        }

        // 同时不为数字，使用字典序
        return prevLowerCase.localeCompare(nextLowerCase)
      }
      return 0
    })
  }

  /**
   * 遍历目录树
   * @param node 节点
   * @returns 子节点数组
   */
  private traverse(node: TreeNode): TreeNode[] {
    if (!fs.existsSync(node.path) || !fs.lstatSync(node.path).isDirectory()) return []

    const children = fs.readdirSync(node.path)

    let sortedDirectories: string[] = []
    let sortedFiles: string[] = []

    // 按先目录，后文件的顺序排序
    children.forEach((child) => {
      const childPath = path.join(node.path, child)
      const stat = fs.lstatSync(childPath)
      if (stat.isDirectory()) {
        sortedDirectories.push(child)
        // 不展示Windows隐藏文件
      } else if (stat.isFile() && !/^~\$/.test(child)) {
        // 隐藏非md文件
        if ((this.onlyShowMd && /\.(md|markdown)$/i.test(child)) || !this.onlyShowMd) {
          sortedFiles.push(child)
        }
      }
    })

    // 综合排序
    Directory.generalSort(sortedDirectories)
    Directory.generalSort(sortedFiles)

    const directoryChildren = sortedDirectories.map((child) => {
      const childPath = path.join(node.path, child)
      const tempNode: TreeNode = {
        nodeType: 'dir',
        icon: 'jstree-folder',
        text: child,
        path: childPath,
        id: 'dir_' + childPath,
        children: [],
      }

      tempNode.children = this.traverse(tempNode)

      return tempNode
    })

    const fileChildren = sortedFiles.map((child) => {
      const childPath = path.join(node.path, child)
      const tempNode: TreeNode = {
        nodeType: 'file',
        icon: `jstree-file ${/\.(md|markdown)$/i.test(child) ? 'md-file' : 'regular-file'}`,
        text: child,
        path: childPath,
        id: 'file_' + childPath,
        children: [],
      }

      tempNode.children = this.traverse(tempNode)

      return tempNode
    })

    return directoryChildren.concat(fileChildren)
  }

  /**
   * 获取根节点
   * @returns 根节点
   */
  getRoot(): TreeNode {
    return this.root
  }

  /**
   * 获取根节点ID
   * @returns 根节点ID
   */
  static get ROOT_ID(): string {
    return '#j1_1'
  }
}

export { Reader, Directory }
