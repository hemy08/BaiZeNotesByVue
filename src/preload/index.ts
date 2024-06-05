import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const remoteDialog = require('@electron/remote').dialog

// Custom APIs for renderer
const api = {}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}

declare global {
  interface Window {
    saveImage: (name: string, data: never) => void
  }
}

window.saveImage = (name, data) => {
  remoteDialog
    .showSaveDialog({
      title: '保存图片',
      buttonLabel: '保存',
      nameFieldLabel: name,
      filters: [
        {
          extensions: ['png'],
          name: 'PNG图片'
        }
      ],
      properties: ['showOverwriteConfirmation']
    })
    .then(async ({ canceled, filePath }) => {
      if (canceled) {
        return
      }
      console.log('', filePath)
      try {
        // let buffer
        if (typeof data === 'string') {
          // buffer = new Buffer(data.replace(/^data:image\/\w+;base64,/, ''), 'base64')
        } else {
          //buffer = await data.arrayBuffer()
        }
        // fs.writeFileSync(filePath, Buffer.from(buffer))
        // shell.showItemInFolder(filePath)
      } catch (e) {
        /* empty */
      }
    })
}
