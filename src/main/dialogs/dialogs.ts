import { OpenOnlineWebPage } from './OpenOnlineWebPages'
import { ShowFontSelectDialog } from './ShowFontSelectDialog'
import { ShowMarkdownSheetDialog } from './ShowMdSheetDialog'
import { ShowMathTextDialog } from './ShowMathTextDialog'
import { ShowMermaidEditDialog } from './ShowMermaidEditDialog'
import { HandleMermaidGetRenderResult, CreateMermaidRenderFrame } from './OpenMermaidRenderFrame'
import { ShowAdmonitionDialog } from './ShowAdmonitionsDialog'
import { ShowCreateFileFolderDialog } from './ShowCreateFileFolderDialog'
import { ShowFileFolderRenameDialog } from './ShowRemaneDialog'
import { ShowWebUrlDialog } from './ShowWebUrlDialog'
import { ShowInsertImageDialog } from './ShowInsertImageDialog'
import { ShowNewFileFolderDialog } from './ShowNewFileFolderDialog'
import { ShowSystemSettingDialog } from './ShowSystemSettingDialog'
import { dialog } from 'electron'
import * as fileUtils from '../utils/file-utils'

function ShowConfirmDeleteDialog(path: string, isFile: boolean) {
  dialog
    .showMessageBox({
      type: 'question',
      buttons: ['是', '否'],
      title: '确认',
      message: '确定要删除[' + path + ']吗？'
    })
    .then((result) => {
      if (result.response === 0) {
        // console.log('用户点击了“是”')
        // 在这里执行“是”的操作
        fileUtils.DeleteFileFolder(path, isFile)
      } else {
        // console.log('用户点击了“否”')
        return
      }
    })
    .catch((err) => {
      console.error('显示对话框时出错:', err)
    })
}

export {
  OpenOnlineWebPage,
  ShowFontSelectDialog,
  ShowMarkdownSheetDialog,
  ShowMathTextDialog,
  ShowMermaidEditDialog,
  HandleMermaidGetRenderResult,
  CreateMermaidRenderFrame,
  ShowAdmonitionDialog,
  ShowCreateFileFolderDialog,
  ShowFileFolderRenameDialog,
  ShowConfirmDeleteDialog,
  ShowWebUrlDialog,
  ShowInsertImageDialog,
  ShowNewFileFolderDialog,
  ShowSystemSettingDialog
}

export const WebLinks: MenuContext[] = [
  { label: 'Mermaid在线编辑器', context: 'https://mermaid.live/edit' },
  { label: 'PlantText编辑器', context: 'https://www.planttext.com/' },
  { label: '在线思维导图工具', context: 'https://www.mindline.cn/webapp' },
  { label: '在线流程图绘制', context: 'https://app.diagrams.net/' },
  { label: 'PlantUml 网页服务器', context: 'http://www.plantuml.com/plantuml/uml/' },
  { label: '菜鸟工具首页', context: 'https://www.jyshare.com/' },
  { label: '菜鸟SVG图片编辑器', context: 'https://www.jyshare.com/more/svgeditor/' },
  { label: '菜鸟绘图工具', context: 'https://www.jyshare.com/more/shapefly-diagram/' },
  { label: '菜鸟在线办公工具大全', context: 'https://www.jyshare.com/office/' },
  { label: '菜鸟在线表格生成', context: 'https://www.jyshare.com/front-end/7688/' }
]
