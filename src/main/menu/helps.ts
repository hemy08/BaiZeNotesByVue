// import { app } from 'electron'
import { dialog } from 'electron'
import os from 'os'

// eslint-disable-next-line no-unused-vars
function about() {
  const message = `Hemy Markdown Editor v1.0.0`
  const v8_v = `引擎版本：${process.versions.v8}\n`
  const sys_info = `当前系统：${os.type()} ${os.arch()} ${os.release()}\n`
  const sys_plt = `当前平台：${process.platform}\n`
  const ele_v = `Electron ：v${process.versions.electron}\n`
  const chrom_v = `Chromium ：v${process.versions.chrome}\n`
  const node_v = `Node ：v${process.versions.node}\n`
  const vue = `Vue ：v3.4.27\nVite ：v5.2.11\nTypeScript ：5.4.5\n`

  dialog.showMessageBox({
    title: `关于 Hemy Markdown Editor`,
    type: 'info',
    message: message,
    detail: v8_v + sys_info + sys_plt + ele_v + chrom_v + node_v + vue,
    noLink: true,
    buttons: ['确定']
  })
}

// eslint-disable-next-line no-unused-vars
function contactus() {
  const author = `开发者：Hemy08\n`
  const email = `电子邮件：zhaojunwei008@yeah.net\n`
  const repo = `源码：https://github.com/hemy08/HemyMarkdownEditor\n`
  dialog.showMessageBox({
    title: '联系我们',
    type: 'info',
    message: ``,
    detail: author + email + repo,
    noLink: true,
    buttons: ['确定']
  })
}
// eslint-disable-next-line no-unused-vars
export function getAppHelpsMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
  const helpMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '版本发布 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '键盘快捷方式 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '使用文档 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '提交创意/意见 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '关于',
      click: () => {
        about()
      }
    },
    {
      label: '主页 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '致谢 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '检查更新 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '联系我们',
      click: () => {
        contactus()
      }
    }
  ]
  return {
    label: '帮助(H)',
    enabled: true,
    accelerator: 'alt+h',
    submenu: helpMenuItems
  }
}
