import { contextBridge, ipcRenderer, shell } from 'electron'

const dialogApi = {
  ipcRenderer: {
    send: (channel: string, ...args: unknown[]): void => {
      ipcRenderer.send(channel, ...args)
    },
    on: (channel: string, callback: (...args: unknown[]) => void): void => {
      ipcRenderer.on(channel, (_event, ...args) => callback(...args))
    },
    removeListener: (channel: string, callback: (...args: unknown[]) => void): void => {
      ipcRenderer.removeListener(channel, callback)
    }
  },
  shell: {
    openExternal: (url: string): Promise<void> => shell.openExternal(url)
  },
  broadcastTheme: (themeData: unknown): void => {
    ipcRenderer.send('dialog-broadcast-theme', themeData)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', dialogApi)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electronAPI = dialogApi
}
