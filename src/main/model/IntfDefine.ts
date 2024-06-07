// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BrowserWindow } from 'electron'

export interface FileItem {
  name: string
  path: string
  type: 'file' | 'folder'
  isDirectory: boolean
  children: FileItem[]
}


