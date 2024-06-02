import { ipcMain } from 'electron'

ipcMain.on('pre-code-proc', (event, message) => {
  event.sender.send('pre-code-proc-result', message)
})
