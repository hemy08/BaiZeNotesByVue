import { dialog } from 'electron'
import { tMain } from '../utils/i18n'

/**
 * 主进程 JSDOM 对话框通用工具（P2/CQ-4 清理后仅剩本函数）。
 *
 * 历史背景：本文件原为 JSDOM 时代对话框 HTML 构建工具的集中地，含 5 组颜色调色板
 * （WebSafe216Colors/CommonColors/GreenBlueColors/RedBlueColors/RedGreenColors 共约
 * 400 行）与 NewOption/NewSelect/NewButton/NewButtonList/NewLabel/NewLabelDiv/
 * NewLabelList/NewCheckBox/NewTextArea/ApplyCancelButton 等 DOM 构建辅助函数。
 *
 * CQ-4 清理结论（删除前全仓 grep 核实）：上述导出在生产代码中零消费，仅被
 * tests/unit/dialog-common.test.ts 直接引用；对应 JSDOM 对话框（主题设置/编辑器设置/
 * 字体选择等）均已改为 Vue 组件并从主进程删除。现保留唯一生产可达的
 * ShowAlreadyExistDialog（ShowCreateFileFolderDialog 新建同名文件/文件夹时提示）。
 */
export function ShowAlreadyExistDialog() {
    dialog.showMessageBox({
        title: tMain('dialogMain.common.alreadyExists.title'),
        type: 'info',
        message: tMain('dialogMain.common.alreadyExists.message'),
        detail: tMain('dialogMain.common.alreadyExists.detail'),
        noLink: true,
        buttons: [tMain('common.ok')]
    })
}
