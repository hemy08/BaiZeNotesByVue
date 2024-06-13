import { ipcMain, BrowserWindow } from 'electron'

let customAdmonitionDialog: Electron.BrowserWindow | null

export function createAdmonitionDialog(mainWindow: Electron.BrowserWindow) {
  customAdmonitionDialog = new BrowserWindow({
    width: 550,
    height: 600,
    minimizable: false,
    maximizable: false,
    title: 'Admonition',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  if (!customAdmonitionDialog) {
    return
  }

  customAdmonitionDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customAdmonitionDialog.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(admonitionHtmlContent)}`
  )

  // 当窗口关闭时，清除引用
  customAdmonitionDialog.on('closed', () => {
    ipcMain.removeListener('user-input-insert-admonitions', processAdmonitionInsert)
    ipcMain.removeListener('user-input-cancel-admonitions', () => {})
  })

  // 显示窗口
  customAdmonitionDialog.show()

  function exitCustomFontDialog() {
    if (customAdmonitionDialog) {
      ipcMain.removeListener('user-input-insert-admonitions', processAdmonitionInsert)
      ipcMain.removeListener('user-input-cancel-admonitions', () => {})
      customAdmonitionDialog.close()
      customAdmonitionDialog = null
    }
  }

  function processAdmonitionInsert(_, Admonition) {
    mainWindow.webContents.send('monaco-insert-text-block-templates', Admonition + '\n')
    exitCustomFontDialog()
  }

  function processAdmonitionCancel() {
    exitCustomFontDialog()
  }

  ipcMain.on('user-input-insert-admonitions', processAdmonitionInsert)
  ipcMain.on('user-input-cancel-admonitions', processAdmonitionCancel)
}

const admonitionHtmlContent =
  '<!DOCTYPE html>\n' +
  '<html lang="en">\n' +
  '<head>\n' +
  '  <meta charset="UTF-8">\n' +
  '  <title>Admonitions</title>\n' +
  '  <style>' +
  ':root {\n' +
  '  --md-primary-fg-color: #4051b5;\n' +
  '  --md-primary-fg-color--light: #5d6cc0;\n' +
  '  --md-primary-fg-color--dark: #303fa1;\n' +
  '  --md-primary-bg-color: #fff;\n' +
  '  --md-primary-bg-color--light: #ffffffb3;\n' +
  '  --md-accent-fg-color: #526cfe;\n' +
  '  --md-accent-fg-color--transparent: #526cfe1a;\n' +
  '  --md-accent-bg-color: #fff;\n' +
  '  --md-accent-bg-color--light: #ffffffb3;\n' +
  '  --md-hue: 225deg;\n' +
  '  --md-default-fg-color: #000000de;\n' +
  '  --md-default-fg-color--light: #0000008a;\n' +
  '  --md-default-fg-color--lighter: #00000052;\n' +
  '  --md-default-fg-color--lightest: #00000012;\n' +
  '  --md-default-bg-color: #fff;\n' +
  '  --md-default-bg-color--light: #ffffffb3;\n' +
  '  --md-default-bg-color--lighter: #ffffff4d;\n' +
  '  --md-default-bg-color--lightest: #ffffff1f;\n' +
  '  --md-code-fg-color: #36464e;\n' +
  '  --md-code-bg-color: #f5f5f5;\n' +
  '  --md-code-bg-color--light: #f5f5f5b3;\n' +
  '  --md-code-bg-color--lighter: #f5f5f54d;\n' +
  '  --md-code-hl-color: #4287ff;\n' +
  '  --md-code-hl-color--light: #4287ff1a;\n' +
  '  --md-code-hl-number-color: #d52a2a;\n' +
  '  --md-code-hl-special-color: #db1457;\n' +
  '  --md-code-hl-function-color: #a846b9;\n' +
  '  --md-code-hl-constant-color: #6e59d9;\n' +
  '  --md-code-hl-keyword-color: #3f6ec6;\n' +
  '  --md-code-hl-string-color: #1c7d4d;\n' +
  '  --md-code-hl-name-color: var(--md-code-fg-color);\n' +
  '  --md-code-hl-operator-color: var(--md-default-fg-color--light);\n' +
  '  --md-code-hl-punctuation-color: var(--md-default-fg-color--light);\n' +
  '  --md-code-hl-comment-color: var(--md-default-fg-color--light);\n' +
  '  --md-code-hl-generic-color: var(--md-default-fg-color--light);\n' +
  '  --md-code-hl-variable-color: var(--md-default-fg-color--light);\n' +
  '  --md-typeset-color: var(--md-default-fg-color);\n' +
  '  --md-typeset-a-color: var(--md-primary-fg-color);\n' +
  '  --md-typeset-del-color: #f5503d26;\n' +
  '  --md-typeset-ins-color: #0bd57026;\n' +
  '  --md-typeset-kbd-color: #fafafa;\n' +
  '  --md-typeset-kbd-accent-color: #fff;\n' +
  '  --md-typeset-kbd-border-color: #b8b8b8;\n' +
  '  --md-typeset-mark-color: #ffff0080;\n' +
  '  --md-typeset-table-color: #0000001f;\n' +
  '  --md-typeset-table-color--light: rgba(0,0,0,.035);\n' +
  '  --md-admonition-fg-color: var(--md-default-fg-color);\n' +
  '  --md-admonition-bg-color: var(--md-default-bg-color);\n' +
  '  --md-warning-fg-color: #000000de;\n' +
  '  --md-warning-bg-color: #ff9;\n' +
  '  --md-footer-fg-color: #fff;\n' +
  '  --md-footer-fg-color--light: #ffffffb3;\n' +
  '  --md-footer-fg-color--lighter: #ffffff73;\n' +
  '  --md-footer-bg-color: #000000de;\n' +
  '  --md-footer-bg-color--dark: #00000052;\n' +
  '  --md-shadow-z1: 0 0.2rem 0.5rem #0000000d,0 0 0.05rem #0000001a;\n' +
  '  --md-shadow-z2: 0 0.2rem 0.5rem #0000001a,0 0 0.05rem #00000040;\n' +
  '  --md-shadow-z3: 0 0.2rem 0.5rem #0003,0 0 0.05rem #00000059\n' +
  '}\n' +
  ':root {\n' +
  '  --md-admonition-icon--abstract:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M2.5 1.75a.25.25 0 0 1 .25-.25h8.5a.25.25 0 0 1 .25.25v7.736a.75.75 0 1 0 1.5 0V1.75A1.75 1.75 0 0 0 11.25 0h-8.5A1.75 1.75 0 0 0 1 1.75v11.5c0 .966.784 1.75 1.75 1.75h3.17a.75.75 0 0 0 0-1.5H2.75a.25.25 0 0 1-.25-.25V1.75zM4.75 4a.75.75 0 0 0 0 1.5h4.5a.75.75 0 0 0 0-1.5h-4.5zM4 7.75A.75.75 0 0 1 4.75 7h2a.75.75 0 0 1 0 1.5h-2A.75.75 0 0 1 4 7.75zm11.774 3.537a.75.75 0 0 0-1.048-1.074L10.7 14.145 9.281 12.72a.75.75 0 0 0-1.062 1.058l1.943 1.95a.75.75 0 0 0 1.055.008l4.557-4.45z"/></svg>\');\n' +
  '  --md-admonition-icon--bug:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M4.72.22a.75.75 0 0 1 1.06 0l1 .999a3.492 3.492 0 0 1 2.441 0l.999-1a.75.75 0 1 1 1.06 1.061l-.775.776c.616.63.995 1.493.995 2.444v.327c0 .1-.009.197-.025.292.408.14.764.392 1.029.722l1.968-.787a.75.75 0 0 1 .556 1.392L13 7.258V9h2.25a.75.75 0 0 1 0 1.5H13v.5c0 .409-.049.806-.141 1.186l2.17.868a.75.75 0 0 1-.557 1.392l-2.184-.873A4.997 4.997 0 0 1 8 16a4.997 4.997 0 0 1-4.288-2.427l-2.183.873a.75.75 0 0 1-.558-1.392l2.17-.868A5.013 5.013 0 0 1 3 11v-.5H.75a.75.75 0 0 1 0-1.5H3V7.258L.971 6.446a.75.75 0 0 1 .558-1.392l1.967.787c.265-.33.62-.583 1.03-.722a1.684 1.684 0 0 1-.026-.292V4.5c0-.951.38-1.814.995-2.444L4.72 1.28a.75.75 0 0 1 0-1.06zM6.173 5h3.654A.173.173 0 0 0 10 4.827V4.5a2 2 0 1 0-4 0v.327c0 .096.077.173.173.173zM5.25 6.5a.75.75 0 0 0-.75.75V11a3.5 3.5 0 1 0 7 0V7.25a.75.75 0 0 0-.75-.75h-5.5z"/></svg>\');\n' +
  '  --md-admonition-icon--danger:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M10.561 1.5a.016.016 0 0 0-.01.004L3.286 8.571A.25.25 0 0 0 3.462 9H6.75a.75.75 0 0 1 .694 1.034l-1.713 4.188 6.982-6.793A.25.25 0 0 0 12.538 7H9.25a.75.75 0 0 1-.683-1.06l2.008-4.418.003-.006a.02.02 0 0 0-.004-.009.02.02 0 0 0-.006-.006L10.56 1.5zM9.504.43a1.516 1.516 0 0 1 2.437 1.713L10.415 5.5h2.123c1.57 0 2.346 1.909 1.22 3.004l-7.34 7.142a1.25 1.25 0 0 1-.871.354h-.302a1.25 1.25 0 0 1-1.157-1.723L5.633 10.5H3.462c-1.57 0-2.346-1.909-1.22-3.004L9.503.429z"/></svg>\');\n' +
  '  --md-admonition-icon--example:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M5 5.782V2.5h-.25a.75.75 0 0 1 0-1.5h6.5a.75.75 0 0 1 0 1.5H11v3.282l3.666 5.76C15.619 13.04 14.543 15 12.767 15H3.233c-1.776 0-2.852-1.96-1.899-3.458L5 5.782zM9.5 2.5h-3V6a.75.75 0 0 1-.117.403L4.73 9h6.54L9.617 6.403A.75.75 0 0 1 9.5 6V2.5zm-6.9 9.847L3.775 10.5h8.45l1.175 1.847a.75.75 0 0 1-.633 1.153H3.233a.75.75 0 0 1-.633-1.153z"/></svg>\');\n' +
  '  --md-admonition-icon--failure:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M3.404 12.596a6.5 6.5 0 1 1 9.192-9.192 6.5 6.5 0 0 1-9.192 9.192zM2.344 2.343a8 8 0 1 0 11.313 11.314A8 8 0 0 0 2.343 2.343zM6.03 4.97a.75.75 0 0 0-1.06 1.06L6.94 8 4.97 9.97a.75.75 0 1 0 1.06 1.06L8 9.06l1.97 1.97a.75.75 0 1 0 1.06-1.06L9.06 8l1.97-1.97a.75.75 0 1 0-1.06-1.06L8 6.94 6.03 4.97z"/></svg>\');\n' +
  '  --md-admonition-icon--info:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm6.5-.25A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75zM8 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>\');\n' +
  '  --md-admonition-icon--note:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M2.5 7.775V2.75a.25.25 0 0 1 .25-.25h5.025a.25.25 0 0 1 .177.073l6.25 6.25a.25.25 0 0 1 0 .354l-5.025 5.025a.25.25 0 0 1-.354 0l-6.25-6.25a.25.25 0 0 1-.073-.177zm-1.5 0V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.75 1.75 0 0 1 1 7.775zM6 5a1 1 0 1 0 0 2 1 1 0 0 0 0-2z"/></svg>\');\n' +
  '  --md-admonition-icon--question:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8zm9 3a1 1 0 1 1-2 0 1 1 0 0 1 2 0zM6.92 6.085c.081-.16.19-.299.34-.398.145-.097.371-.187.74-.187.28 0 .553.087.738.225A.613.613 0 0 1 9 6.25c0 .177-.04.264-.077.318a.956.956 0 0 1-.277.245c-.076.051-.158.1-.258.161l-.007.004a7.728 7.728 0 0 0-.313.195 2.416 2.416 0 0 0-.692.661.75.75 0 0 0 1.248.832.956.956 0 0 1 .276-.245 6.3 6.3 0 0 1 .26-.16l.006-.004c.093-.057.204-.123.313-.195.222-.149.487-.355.692-.662.214-.32.329-.702.329-1.15 0-.76-.36-1.348-.863-1.725A2.76 2.76 0 0 0 8 4c-.631 0-1.155.16-1.572.438-.413.276-.68.638-.849.977a.75.75 0 1 0 1.342.67z"/></svg>\');\n' +
  '  --md-admonition-icon--quote:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M1.75 2.5a.75.75 0 0 0 0 1.5h10.5a.75.75 0 0 0 0-1.5H1.75zm4 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5zm0 5a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5zM2.5 7.75a.75.75 0 0 0-1.5 0v6a.75.75 0 0 0 1.5 0v-6z"/></svg>\');\n' +
  '  --md-admonition-icon--success:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>\');\n' +
  '  --md-admonition-icon--tip:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M3.499.75a.75.75 0 0 1 1.5 0v.996C5.9 2.903 6.793 3.65 7.662 4.376l.24.202c-.036-.694.055-1.422.426-2.163C9.1.873 10.794-.045 12.622.26 14.408.558 16 1.94 16 4.25c0 1.278-.954 2.575-2.44 2.734l.146.508.065.22c.203.701.412 1.455.476 2.226.142 1.707-.4 3.03-1.487 3.898C11.714 14.671 10.27 15 8.75 15h-6a.75.75 0 0 1 0-1.5h1.376a4.489 4.489 0 0 1-.563-1.191 3.833 3.833 0 0 1-.05-2.063 4.636 4.636 0 0 1-2.025-.293.75.75 0 1 1 .525-1.406c1.357.507 2.376-.006 2.698-.318l.009-.01a.748.748 0 0 1 1.06 0 .75.75 0 0 1-.012 1.074c-.912.92-.992 1.835-.768 2.586.221.74.745 1.337 1.196 1.621H8.75c1.343 0 2.398-.296 3.074-.836.635-.507 1.036-1.31.928-2.602-.05-.603-.216-1.224-.422-1.93l-.064-.221c-.12-.407-.246-.84-.353-1.29a2.404 2.404 0 0 1-.507-.441 3.063 3.063 0 0 1-.633-1.248.75.75 0 0 1 1.455-.364c.046.185.144.436.31.627.146.168.353.305.712.305.738 0 1.25-.615 1.25-1.25 0-1.47-.95-2.315-2.123-2.51-1.172-.196-2.227.387-2.706 1.345-.46.92-.27 1.774.019 3.062l.042.19a.753.753 0 0 1 .01.05c.348.443.666.949.94 1.553a.75.75 0 1 1-1.365.62c-.553-1.217-1.32-1.94-2.3-2.768a85.08 85.08 0 0 0-.317-.265c-.814-.68-1.75-1.462-2.692-2.619a3.74 3.74 0 0 0-1.023.88c-.406.495-.663 1.036-.722 1.508.116.122.306.21.591.239.388.038.797-.06 1.032-.19a.75.75 0 0 1 .728 1.31c-.515.287-1.23.439-1.906.373-.682-.067-1.473-.38-1.879-1.193L.75 5.677V5.5c0-.984.48-1.94 1.077-2.664.46-.559 1.05-1.055 1.673-1.353V.75z"/></svg>\');\n' +
  '  --md-admonition-icon--warning:url(\'data:image/svg+xml;charset=utf-8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fill-rule="evenodd" d="M8.22 1.754a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368L8.22 1.754zm-1.763-.707c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575L6.457 1.047zM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0v-2.5z"/></svg>\');\n' +
  '}\n' +
  '.admonition, details {\n' +
  '  background-color: var(--md-admonition-bg-color);\n' +
  '  border: .075rem solid #448aff;\n' +
  '  border-radius: .2rem;\n' +
  '  box-shadow: var(--md-shadow-z1);\n' +
  '  color: var(--md-admonition-fg-color);\n' +
  '  display: flow-root;\n' +
  '  font-size: .94rem;\n' +
  '  margin: 1.5625em 0;\n' +
  '  padding: 0 .6rem;\n' +
  '  page-break-inside: avoid\n' +
  '}\n' +
  '@media print {\n' +
  '  .admonition,details {\n' +
  '    box-shadow: none\n' +
  '  }\n' +
  '}\n' +
  '.admonition:focus-within,details:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #448aff1a\n' +
  '}\n' +
  '.admonition .admonition,.admonition details,details .admonition,details details {\n' +
  '  margin-bottom: 1em;\n' +
  '  margin-top: 1em;\n' +
  '}\n' +
  '.admonition .md-typeset__scrollwrap,details .md-typeset__scrollwrap {\n' +
  '  margin: 1em -.6rem\n' +
  '}\n' +
  '.admonition .md-typeset__table,details .md-typeset__table {\n' +
  '  padding: 0 .6rem\n' +
  '}\n' +
  '.admonition>.tabbed-set:only-child,details>.tabbed-set:only-child {\n' +
  '  margin-top: 0\n' +
  '}\n' +
  'html .admonition>:last-child,html details>:last-child {\n' +
  '  margin-bottom: .6rem\n' +
  '}\n' +
  '[dir=ltr] .admonition-title,[dir=ltr] summary {\n' +
  '  padding-left: 2rem;\n' +
  '  padding-right: .6rem\n' +
  '}\n' +
  '[dir=rtl] .admonition-title,[dir=rtl] summary {\n' +
  '  padding-left: .6rem;\n' +
  '  padding-right: 2rem\n' +
  '}\n' +
  '[dir=ltr] .admonition-title,[dir=ltr] summary {\n' +
  '  border-left-width: .2rem\n' +
  '}\n' +
  '[dir=rtl] .admonition-title,[dir=rtl] summary {\n' +
  '  border-right-width: .2rem\n' +
  '}\n' +
  '[dir=ltr] .admonition-title,[dir=ltr] summary {\n' +
  '  border-top-left-radius: .1rem\n' +
  '}\n' +
  '[dir=ltr] .admonition-title,[dir=ltr] summary,[dir=rtl] .admonition-title,[dir=rtl] summary {\n' +
  '  border-top-right-radius: .1rem\n' +
  '}\n' +
  '[dir=rtl] .admonition-title,[dir=rtl] summary {\n' +
  '  border-top-left-radius: .1rem\n' +
  '}\n' +
  '.admonition-title, summary, details{\n' +
  '  border-top-left-radius: .1rem;\n' +
  '  border-top-right-radius: .1rem;\n' +
  '  border: none;\n' +
  '  font-weight: 700;\n' +
  '  margin: 0 -.6rem;\n' +
  '  padding: .4rem .6rem .4rem 2rem;\n' +
  '  position: relative\n' +
  '}\n' +
  'html .admonition-title:last-child,html summary:last-child {\n' +
  '  margin-bottom: 0\n' +
  '}\n' +
  '[dir=ltr] .admonition-title:before,[dir=ltr] summary:before {\n' +
  '  left: .6rem\n' +
  '}\n' +
  '[dir=rtl] .admonition-title:before,[dir=rtl] summary:before {\n' +
  '  right: .6rem\n' +
  '}\n' +
  '.admonition-title:before,summary:before {\n' +
  '  left: .6rem;\n' +
  '  right: .6rem;\n' +
  '  background-color: #448aff;\n' +
  '  content: "";\n' +
  '  height: 1rem;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--note);\n' +
  '  mask-image: var(--md-admonition-icon--note);\n' +
  '  -webkit-mask-position: center;\n' +
  '  mask-position: center;\n' +
  '  -webkit-mask-repeat: no-repeat;\n' +
  '  mask-repeat: no-repeat;\n' +
  '  -webkit-mask-size: contain;\n' +
  '  mask-size: contain;\n' +
  '  position: absolute;\n' +
  '  top: .625em;\n' +
  '  width: 1rem\n' +
  '}\n' +
  '.admonition-title code,summary code {\n' +
  '  box-shadow: 0 0 0 .05rem var(--md-default-fg-color--lightest)\n' +
  '}\n' +
  '.admonition.note,details.note {\n' +
  '  border-color: #448aff\n' +
  '}\n' +
  '.admonition.note:focus-within,details.note:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #448aff1a\n' +
  '}\n' +
  '.note>.admonition-title,.note>summary {\n' +
  '  background-color: #448aff1a\n' +
  '}\n' +
  '.note>.admonition-title:before,.note>summary:before {\n' +
  '  background-color: #448aff;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--note);\n' +
  '  mask-image: var(--md-admonition-icon--note)\n' +
  '}\n' +
  '.note>.admonition-title:after,.note>summary:after {\n' +
  '  color: #448aff\n' +
  '}\n' +
  '.admonition.abstract,details.abstract {\n' +
  '  border-color: #00b0ff\n' +
  '}\n' +
  '.admonition.abstract:focus-within,details.abstract:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #00b0ff1a\n' +
  '}\n' +
  '.abstract>.admonition-title,.abstract>summary {\n' +
  '  background-color: #00b0ff1a\n' +
  '}\n' +
  '.abstract>.admonition-title:before,.abstract>summary:before {\n' +
  '  background-color: #00b0ff;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--abstract);\n' +
  '  mask-image: var(--md-admonition-icon--abstract)\n' +
  '}\n' +
  '.abstract>.admonition-title:after,.abstract>summary:after {\n' +
  '  color: #00b0ff\n' +
  '}\n' +
  '.admonition.info,details.info {\n' +
  '  border-color: #00b8d4\n' +
  '}\n' +
  '.admonition.info:focus-within,details.info:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #00b8d41a\n' +
  '}\n' +
  '.info>.admonition-title,.info>summary {\n' +
  '  background-color: #00b8d41a\n' +
  '}\n' +
  '.info>.admonition-title:before,.info>summary:before {\n' +
  '  background-color: #00b8d4;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--info);\n' +
  '  mask-image: var(--md-admonition-icon--info)\n' +
  '}\n' +
  '.info>.admonition-title:after,.info>summary:after {\n' +
  '  color: #00b8d4\n' +
  '}\n' +
  '.admonition.tip,details.tip {\n' +
  '  border-color: #00bfa5\n' +
  '}\n' +
  '.admonition.tip:focus-within,details.tip:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #00bfa51a\n' +
  '}\n' +
  '.tip>.admonition-title,.tip>summary {\n' +
  '  background-color: #00bfa51a\n' +
  '}\n' +
  '.tip>.admonition-title:before,.tip>summary:before {\n' +
  '  background-color: #00bfa5;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--tip);\n' +
  '  mask-image: var(--md-admonition-icon--tip)\n' +
  '}\n' +
  '.tip>.admonition-title:after,.tip>summary:after {\n' +
  '  color: #00bfa5\n' +
  '}\n' +
  '.admonition.success,details.success {\n' +
  '  border-color: #00c853\n' +
  '}\n' +
  '.admonition.success:focus-within,details.success:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #00c8531a\n' +
  '}\n' +
  '.success>.admonition-title,.success>summary {\n' +
  '  background-color: #00c8531a\n' +
  '}\n' +
  '.success>.admonition-title:before,.success>summary:before {\n' +
  '  background-color: #00c853;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--success);\n' +
  '  mask-image: var(--md-admonition-icon--success)\n' +
  '}\n' +
  '.success>.admonition-title:after,.success>summary:after {\n' +
  '  color: #00c853\n' +
  '}\n' +
  '.admonition.question,details.question {\n' +
  '  border-color: #64dd17\n' +
  '}\n' +
  '.admonition.question:focus-within,details.question:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #64dd171a\n' +
  '}\n' +
  '.question>.admonition-title,.question>summary {\n' +
  '  background-color: #64dd171a\n' +
  '}\n' +
  '.question>.admonition-title:before,.question>summary:before {\n' +
  '  background-color: #64dd17;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--question);\n' +
  '  mask-image: var(--md-admonition-icon--question)\n' +
  '}\n' +
  '.question>.admonition-title:after,.question>summary:after {\n' +
  '  color: #64dd17\n' +
  '}\n' +
  '.admonition.warning,details.warning {\n' +
  '  border-color: #ff9100\n' +
  '}\n' +
  '.admonition.warning:focus-within,details.warning:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #ff91001a\n' +
  '}\n' +
  '.warning>.admonition-title,.warning>summary {\n' +
  '  background-color: #ff91001a\n' +
  '}\n' +
  '.warning>.admonition-title:before,.warning>summary:before {\n' +
  '  background-color: #ff9100;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--warning);\n' +
  '  mask-image: var(--md-admonition-icon--warning)\n' +
  '}\n' +
  '.warning>.admonition-title:after,.warning>summary:after {\n' +
  '  color: #ff9100\n' +
  '}\n' +
  '.admonition.failure,details.failure {\n' +
  '  border-color: #ff5252\n' +
  '}\n' +
  '.admonition.failure:focus-within,details.failure:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #ff52521a\n' +
  '}\n' +
  '.failure>.admonition-title,.failure>summary {\n' +
  '  background-color: #ff52521a\n' +
  '}\n' +
  '.failure>.admonition-title:before,.failure>summary:before {\n' +
  '  background-color: #ff5252;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--failure);\n' +
  '  mask-image: var(--md-admonition-icon--failure)\n' +
  '}\n' +
  '.failure>.admonition-title:after,.failure>summary:after {\n' +
  '  color: #ff5252\n' +
  '}\n' +
  '.admonition.danger,details.danger {\n' +
  '  border-color: #ff1744\n' +
  '}\n' +
  '.admonition.danger:focus-within,details.danger:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #ff17441a\n' +
  '}\n' +
  '.danger>.admonition-title,.danger>summary {\n' +
  '  background-color: #ff17441a\n' +
  '}\n' +
  '.danger>.admonition-title:before,.danger>summary:before {\n' +
  '  background-color: #ff1744;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--danger);\n' +
  '  mask-image: var(--md-admonition-icon--danger)\n' +
  '}\n' +
  '.danger>.admonition-title:after,.danger>summary:after {\n' +
  '  color: #ff1744\n' +
  '}\n' +
  '.admonition.bug,details.bug {\n' +
  '  border-color: #f50057\n' +
  '}\n' +
  '.admonition.bug:focus-within,details.bug:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #f500571a\n' +
  '}\n' +
  '.bug>.admonition-title,.bug>summary {\n' +
  '  background-color: #f500571a\n' +
  '}\n' +
  '.bug>.admonition-title:before,.bug>summary:before {\n' +
  '  background-color: #f50057;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--bug);\n' +
  '  mask-image: var(--md-admonition-icon--bug)\n' +
  '}\n' +
  '.bug>.admonition-title:after,.bug>summary:after {\n' +
  '  color: #f50057\n' +
  '}\n' +
  '.admonition.example,details.example {\n' +
  '  border-color: #7c4dff\n' +
  '}\n' +
  '.admonition.example:focus-within,details.example:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #7c4dff1a\n' +
  '}\n' +
  '.example>.admonition-title,.example>summary {\n' +
  '  background-color: #7c4dff1a\n' +
  '}\n' +
  '.example>.admonition-title:before,.example>summary:before {\n' +
  '  background-color: #7c4dff;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--example);\n' +
  '  mask-image: var(--md-admonition-icon--example)\n' +
  '}\n' +
  '.example>.admonition-title:after,.example>summary:after {\n' +
  '  color: #7c4dff\n' +
  '}\n' +
  '.admonition.quote,details.quote {\n' +
  '  border-color: #9e9e9e\n' +
  '}\n' +
  '.admonition.quote:focus-within,details.quote:focus-within {\n' +
  '  box-shadow: 0 0 0 .2rem #9e9e9e1a\n' +
  '}\n' +
  '.quote>.admonition-title,.quote>summary {\n' +
  '  background-color: #9e9e9e1a\n' +
  '}\n' +
  '.quote>.admonition-title:before,.quote>summary:before {\n' +
  '  background-color: #9e9e9e;\n' +
  '  -webkit-mask-image: var(--md-admonition-icon--quote);\n' +
  '  mask-image: var(--md-admonition-icon--quote)\n' +
  '}\n' +
  '.quote>.admonition-title:after,.quote>summary:after {\n' +
  '  color: #9e9e9e\n' +
  '}\n' +
  '</style>\n' +
  '</head>\n' +
  '<body>\n' +
  '  <div style="display: flex;flex-direction: row;margin-top: 10px">\n' +
  '    <div><label style="width:50px;margin-left:20px;">类型：</label></div>\n' +
  '    <div style="width: 200px">\n' +
  '      <select id="admonitionsType" style="width: 200px">\n' +
  '        <option value="Note">Note</option>\n' +
  '        <option value="Abstract">Abstract</option>\n' +
  '        <option value="Info">Info</option>\n' +
  '        <option value="Tip">Tip</option>\n' +
  '        <option value="Success">Success</option>\n' +
  '        <option value="Question">Question</option>\n' +
  '        <option value="Warning">Warning</option>\n' +
  '        <option value="Failure">Failure</option>\n' +
  '        <option value="Danger">Danger</option>\n' +
  '        <option value="Bug">Bug</option>\n' +
  '        <option value="Example">Example</option>\n' +
  '        <option value="Quote">Quote</option>\n' +
  '        <option value="Pied-Piper">Pied Piper</option>\n' +
  '      </select>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '  <div style="display: flex;flex-direction: row;margin-top: 10px">\n' +
  '    <div><label style="width:10px;margin-left:20px;">标题：</label></div>\n' +
  '    <input id="admonitionsTitle" style="width: 400px;">\n' +
  '  </div>\n' +
  '  <div style="display: flex;flex-direction: row;margin-top: 10px">\n' +
  '    <div><label style="width:10px;margin-left:20px;">内容：</label></div>\n' +
  '    <textarea id="admonitionsContent" style="width: 400px;height: 100px;overflow-y: auto;"></textarea>\n' +
  '  </div>\n' +
  '  <div style="display: flex;flex-direction: row;margin-top: 10px">\n' +
  '    <div><label style="width:10px;margin-left:20px;" for="previewText">预览：</label></div>\n' +
  '    <div style="width: 400px;height: 250px; overflow:auto;">\n' +
  '      <p id="previewText">这是一段预览文字。</p>\n' +
  '    </div>\n' +
  '  </div>\n' +
  '</body>\n' +
  '<div style="width:500px;margin-top:20px; display:flex; justify-content:center;align-items:center;gap: 10px">\n' +
  '  <button id="applyButton" onclick="sendInsertAdmonitions()" style="width: 125px;margin-top: 30px;margin-left: 50px;">应用</button>\n' +
  '  <button id="cancelButton" onclick="sendCancelAdmonitions()" style="width: 125px;margin-top: 30px;margin-left: 50px;">取消</button>\n' +
  '</div>\n' +
  '<script>\n' +
  "  const { ipcRenderer } = require('electron');\n" +
  "  let typeStr='note'\n" +
  "  let titleStr='这是一个演示'\n" +
  "  let contentStr = '这是一个演示'\n" +
  "  let fmtContent = '这是一个演示'\n" +
  "  let previewText = ''\n" +
  '  document.getElementById("previewText").innerHTML = \'<div class="admonition note"><p class="admonition-title">这是一个演示</p>这是一个演示</div>\'\n' +
  '  function updateType(event) {\n' +
  '    typeStr = event.target.value.toLowerCase()\n' +
  '    updatePreviewText()\n' +
  '  }\n' +
  '  function updateTitle(event) {\n' +
  '    titleStr = event.target.value.toLowerCase()\n' +
  '    updatePreviewText()\n' +
  '  }\n' +
  '  function updateContent(event) {\n' +
  "    contentStr = document.getElementById('admonitionsContent').value\n" +
  "    fmtContent = contentStr.replace(/\\n/g,'<br>')\n" +
  '    contentStr = contentStr.replace(/\\n/g,"\\n    ")\n' +
  '    updatePreviewText()\n' +
  '  }\n' +
  '  function updatePreviewText() {\n' +
  '    previewText = `<div class="admonition ${typeStr}">` +\n' +
  '      `<p class="admonition-title">${titleStr}</p>` +\n' +
  '      `${fmtContent}</div>`\n' +
  '    document.getElementById("previewText").innerHTML = previewText\n' +
  '  }\n' +
  '  // 监听文本输入和样式输入的变化\n' +
  '  document.getElementById("admonitionsType").addEventListener("input", updateType);\n' +
  '  document.getElementById("admonitionsTitle").addEventListener("input", updateTitle)\n' +
  '  document.getElementById("admonitionsContent").addEventListener("input", updateContent);\n' +
  '  function sendInsertAdmonitions() {\n' +
  '    const text = "!!! " + typeStr + " \\"" + titleStr + "\\"\\n\\t" + contentStr + "\\n"\n' +
  '    ipcRenderer.send("user-input-insert-admonitions", text);\n' +
  '  }\n' +
  '  function sendCancelAdmonitions() {\n' +
  '    ipcRenderer.send("user-input-cancel-admonitions");\n' +
  '  }\n' +
  '</script>\n' +
  '</html>\n'
