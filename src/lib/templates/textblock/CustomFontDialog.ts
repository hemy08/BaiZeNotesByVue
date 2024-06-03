import { BrowserWindow, ipcMain } from 'electron'

let customDialogWindow: Electron.BrowserWindow | null

export function showFontDialog() {
  createCustomDialog()
}
// 创建一个自定义对话框的函数
function createCustomDialog() {
  customDialogWindow = new BrowserWindow({
    width: 700,
    height: 450,
    minimizable: false,
    maximizable: false,
    title: '文字样式选择',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  if (!customDialogWindow) {
    return
  }

  customDialogWindow.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customDialogWindow.loadURL(`data:text/html;charset=utf-8,${encodeURI(CustomFontDialogHtml)}`)

  // 当窗口关闭时，清除引用
  customDialogWindow.on('closed', () => {
    customDialogWindow = null
  })

  // 显示窗口
  customDialogWindow.show()

  ipcMain.on('user-input-to-custom-font-dialog', (_, inputData) => {
    console.log('inputData', inputData)
    customDialogWindow.close()
  })

  ipcMain.on('user-input-custom-font-dialog-cancel', () => {
    customDialogWindow.close()
  })
}

const CustomFontDialogHtml =
  '<!DOCTYPE html>\n' +
  '  <html lang="zh">\n' +
  '  <head>\n' +
  '    <meta charset="UTF-8">\n' +
  '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
  '    <title>文字样式选择</title>\n' +
  '    <style>\n' +
  '      .label-style {\n' +
  '         width: 80px;\n' +
  '         margin-top: 12px;\n' +
  '         text-align: center;\n' +
  '       }\n' +
  '      .input-style  {\n' +
  '         width: 170px;\n' +
  '         margin-top: 10px;\n' +
  '       }\n' +
  '    </style>\n' +
  '  </head>\n' +
  '  <body>\n' +
  '    <div style="display: flex; flex-direction: row; margin-left: 20px;">\n' +
  '      <div style="margin-top: 10px; margin-left 20px; display: flex; flex-direction: column;">\n' +
  '        <div class="label-style"><label for="fontFamily">选择字体：</label></div>\n' +
  '        <div class="label-style"><label for="fontSize">字体大小：</label></div>\n' +
  '        <div class="label-style"><label for="fontColor">字体颜色：</label></div>\n' +
  '        <div class="label-style"><label for="backgroundColor">背&nbsp;&nbsp;景&nbsp;色：</label></div>\n' +
  '        <div class="label-style"><label for="fontBold">加&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;粗：</label></div>\n' +
  '        <div class="label-style"><label for="fontItalic">倾&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;斜：</label></div>\n' +
  '        <div class="label-style"><label for="fontUnderline">下&nbsp;&nbsp;划&nbsp;线：</label></div>\n' +
  '        <div class="label-style"><label for="fontDeleteLine">删&nbsp;&nbsp;除&nbsp;线：</label></div>\n' +
  '        <div class="label-style"><label for="fontDoubleDeleteLine">双删除线：</label></div>\n' +
  '      </div>\n' +
  '      <div style="margin-top: 10px;display: flex; flex-direction: column;">\n' +
  '        <div class="input-style"><select name="editor-font" id="fontFamily">\n' +
  '          <option value="Cascadia Code" style="font-family: \'Cascadia Code\'">Cascadia Code</option>\n' +
  '          <option value="Consolas" style="font-family: \'Consolas\'">Consolas</option>\n' +
  '          <option value="DejaVu Sans Mono" style="font-family: \'DejaVu Sans Mono\'">DejaVuSans Mono</option>\n' +
  '          <option value="Fira Code" style="font-family: \'Droid Sans\'">Droid Sans</option>\n' +
  '          <option value="Fira Code" style="font-family: \'Fira Sans\'">Fira Sans</option>\n' +
  '          <option value="Fira Code" style="font-family: \'Fira Code\'">Fira Code</option>\n' +
  '          <option value="Hack" style="font-family: \'Hack\'">Hack</option>\n' +
  '          <option value="Hack" style="font-family: \'Helvetica Neue\'">Helvetica Neue</option>\n' +
  '          <option value="Hack" style="font-family: \'Inter\'">Inter</option>\n' +
  '          <option value="JetBrains Mono" style="font-family: \'JetBrains Mono\'">JetBrains Mono</option>\n' +
  '          <option value="Menlo" style="font-family: \'Menlo\'">Menlo</option>\n' +
  '          <option value="SimHei" style="font-family: \'Roboto\'">Roboto</option>\n' +
  '          <option value="SimHei" style="font-family: \'Oxygen\'">Oxygen</option>\n' +
  '          <option value="SimHei" style="font-family: \'sans-serif\'">sans-serif</option>\n' +
  '          <option value="SimHei" style="font-family: \'Segoe UI\'">Segoe UI</option>\n' +
  '          <option value="SimHei" style="font-family: \'SimHei\'">SimHei</option>\n' +
  '          <option value="Source Code Pro" style="font-family: \'Source Code Pro\'">Source Code Pro</option>\n' +
  '          <option value="SimHei" style="font-family: \'Ubuntu\'">Ubuntu</option>\n' +
  '          <option value="Ubuntu Mono" style="font-family: \'Ubuntu Mono\'">Ubuntu Mono</option>\n' +
  '        </select></div>\n' +
  '        <div class="input-style" style="width: 40px"><input type="text" id="fontSize" style="width: 100px"></div>\n' +
  '        <div class="input-style"><input type="color" id="fontColor" style="width: 100px"></div>\n' +
  '        <div class="input-style"><input type="color" id="backgroundColor" style="width: 100px" value="wihite"></div>\n' +
  '        <div class="input-style"><input type="checkbox" id="fontBold"></div>\n' +
  '        <div class="input-style"><input type="checkbox" id="fontItalic"></div>\n' +
  '        <div class="input-style"><input type="checkbox" id="fontUnderline"></div>\n' +
  '        <div class="input-style"><input type="checkbox" id="fontDeleteLine"></div>\n' +
  '        <div class="input-style"><input type="checkbox" id="fontDoubleDeleteLine"></div>\n' +
  '      </div>\n' +
  '      <div style="margin-top: 10px; width:2px; color:white; height:300px; display: flex; background-color: black"></div>\n' +
  '      <div style="margin-top: 10px; margin-left: 20px; display: flex; flex-direction: column;">\n' +
  '        <div>\n' +
  '          <div class="label-style"><label for="fontFamily">编辑区域：</label></div>\n' +
  '          <textarea id="fontSize" style="width: 350px;height: 100px;overflow-y: auto;"></textarea>\n' +
  '        </div>\n' +
  '      <div style="margin-top: 10px; height:2px; color:white; width:350px; display: flex; background-color: black"></div>\n' +
  '        <div style="margin-top: 10px">\n' +
  '          <div class="label-style"><label for="fontFamily">效果预览：</label></div>\n' +
  '          <div id="preview-area" style="width: 350px;height: 100px; overflow:auto;">\n' +
  '            <p class="preview-text" id="previewText">这是一段预览文字。</p>\n' +
  '          </div>\n' +
  '        </div>\n' +
  '      </div>\n' +
  '    </div>\n' +
  '\n' +
  '    <button id="applyButton" onclick="sendUserInputFontStyle()" STYLE="width: 125px;margin-top: 30px;margin-left: 100px;">应用</button>\n' +
  '    <button id="cancelButton" onclick="sendDialogCancelFontStyle()" STYLE="width: 125px;margin-top: 30px;margin-left: 200px;">取消</button>\n' +
  '    <script>\n' +
  "      const { ipcRenderer } = require('electron');\n" +
  '\n' +
  '      function sendUserInputFontStyle() {\n' +
  "        const fontFamily = document.getElementById('fontFamily').value;\n" +
  "        ipcRenderer.send('user-input-custom-font-dialog-apply', fontFamily);\n" +
  '      }\n' +
  '      function sendDialogCancelFontStyle() {\n' +
  "        console.log('closed');" +
  "        ipcRenderer.send('user-input-custom-font-dialog-cancel');\n" +
  '      }\n' +
  '    </script>\n' +
  '  </body>\n' +
  '</html>'
