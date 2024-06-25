import { OpenOnlineWebPage } from './OpenOnlineWebPages'
import { ShowFontSelectDialog } from './ShowFontSelectDialog'
import { ShowMarkdownSheetDialog } from './ShowMdSheetDialog'
import { ShowMathTextDialog } from './ShowMathTextDialog'
import { ShowMermaidEditDialog } from './ShowMermaidEditDialog'
import { HandleMermaidGetRenderResult, CreateMermaidRenderFrame } from './OpenMermaidRenderFrame'
import { ShowAdmonitionDialog } from './ShowAdmonitionsDialog'
import { ShowCreateFileFolderDialog } from './showCreateDialog'
import { ShowFileFolderRenameDialog } from './ShowRemaneDialog'
import { dialog } from 'electron'
import * as fileUtils from '../utils/file-utils'

function ShowConfirmDeleteDialog(path: string) {
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
        fileUtils.DeleteFileFolder(path)
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
  ShowConfirmDeleteDialog
}

export const webDialogs = {
  mermaidWeb: { label: 'Mermaid在线编辑器', link: 'https://mermaid.live/edit' },
  plantTextWeb: { label: 'PlantText编辑器', link: 'https://www.planttext.com/' },
  mindline: { label: '在线思维导图工具', link: 'https://www.mindline.cn/webapp' },
  diagrams: { label: '在线流程图绘制', link: 'https://app.diagrams.net/' },
  plantumlWeb: { label: 'PlantUml 网页服务器', link: 'http://www.plantuml.com/plantuml/uml/' },
  jyShare: { label: '菜鸟工具首页', link: 'https://www.jyshare.com/' },
  jySvgEditor: { label: '菜鸟SVG图片编辑器', link: 'https://www.jyshare.com/more/svgeditor/' },
  jyShapeFlyDiagram: {
    label: '菜鸟绘图工具',
    link: 'https://www.jyshare.com/more/shapefly-diagram/'
  },
  jyOffice: { label: '菜鸟在线办公工具大全', link: 'https://www.jyshare.com/office/' },
  jyFrontEnd: { label: '菜鸟在线表格生成', link: 'https://www.jyshare.com/front-end/7688/' }
}
