// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ipcRenderer } = require('electron')

function sendUserInputToCustomFontDialog() {
  const input = document.getElementById('fontFamily').value
  console.log('fontFamily', fontFamily)
  ipcRenderer.send('user-input-to-custom-font-dialog', input)
}
