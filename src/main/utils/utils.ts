import { globalInitialize } from './global'
import * as FileUtils from './file-utils'
import { HemyRenderPre, HemyRenderPost } from './HemyRender'
import {
  CreateRsaKeyPair,
  CreateHash,
  CreateHmac,
  CryptoDecrypt,
  CryptoEncrypt
} from './encrypt_decrypt'
import { ipcMain } from 'electron'

export {
  globalInitialize,
  FileUtils,
  HemyRenderPre,
  HemyRenderPost,
  CreateRsaKeyPair,
  CreateHash,
  CreateHmac,
  CryptoEncrypt,
  CryptoDecrypt
}

export function MainWindowListenUtilsEvent(mainWindow: Electron.BrowserWindow) {
  ipcMain.on('open-select-file', (_, message) => {
    // console.log('open-select-file', message)
    FileUtils.OpenSelectFile(message)
  })

  ipcMain.on('pre-render-monaco-editor-content', (_, message) => {
    HemyRenderPre(mainWindow, message)
  })

  ipcMain.on('post-render-monaco-editor-content', (_, message) => {
    HemyRenderPost(mainWindow, message)
  })

  ipcMain.on('file-manager-context-menu-copy-relative-path', (_, path) => {
    FileUtils.CopyRelativePath(path)
  })

  ipcMain.on('file-manager-context-menu-copy-imagelink', (_, path) => {
    FileUtils.CopyImageLink(path)
  })

  ipcMain.on('file-manager-context-menu-copy-filelink', (_, path) => {
    FileUtils.CopyFileLink(path)
  })

  ipcMain.on('file-manager-context-menu-copy-file', (_, path, isFile) => {
    FileUtils.FileManagerContextMenuCopy(path, isFile)
  })

  ipcMain.on('file-manager-context-menu-cut', (_, path, isFile) => {
    FileUtils.FileManagerContextMenuCut(path, isFile)
  })

  ipcMain.on('file-manager-context-menu-paste', (_, value, isFile) => {
    FileUtils.FileManagerContextMenuPaste(value, isFile)
  })

  ipcMain.on('file-manager-context-menu-open-in-explorer', (_, path) => {
    // console.log('file-manager-context-menu-rename', path, name)
    FileUtils.OpenFolderExplorer(path)
  })

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ipcMain.on('file-manager-context-menu-reload-from-disk', (_) => {
    // console.log('file-manager-context-menu-reload-from-disk')
    FileUtils.ReloadDirFromDisk()
  })

  ipcMain.on('monaco-editor-container-insert-image', (_, context: string) => {
    const imageName = FileUtils.InsertImagesToFile(context)
    console.log('imageName', imageName)
    if (imageName.length !== 0) {
      mainWindow.webContents.send(
        'monaco-insert-text-block-templates',
        '\r\n\r\n![](./images/' + imageName + ')\r\n\r\n'
      )
    }
  })

  ipcMain.on('plugin-tools-generator-rsa-key-pairs', (_, bits: number) => {
    CreateRsaKeyPair(bits)
  })

  ipcMain.on('plugin-tools-generator-hash-text', (event, context: string, encType: string) => {
    event.returnValue = CreateHash(context, encType)
  })

  ipcMain.on(
    'plugin-tools-generator-hmac-text',
    (event, context: string, secKey: string, encType: string) => {
      event.returnValue = CreateHmac(context, secKey, encType)
    }
  )

  ipcMain.on('plugin-tools-crypto-encrypt', (event, data: CryptoData) => {
    event.returnValue = CryptoEncrypt(data)
  })

  ipcMain.on('plugin-tools-crypto-decrypt', (event, data: CryptoData) => {
    event.returnValue = CryptoDecrypt(data)
  })
}
