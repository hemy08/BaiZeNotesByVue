// eslint-disable-next-line @typescript-eslint/no-var-requires
const { globalShortcut } = require('electron')
import * as fs from 'fs'

globalShortcut.register('Control+S', () => {
  const curFile = global.current_active_file
  console.log('curFile', curFile)
  fs.writeFile(curFile.path, curFile.content, (err) => {
    console.log('error', err)
  })
})
