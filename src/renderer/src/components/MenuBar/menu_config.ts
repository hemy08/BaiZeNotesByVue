// 菜单数据结构
import { ref } from "vue";
import {BaiZeMenuItem} from "../../../../main/global-types";
import * as MenuConst from '../../../../main/common/menu_consts';
import * as Templates from '../../../../main/common/templates';

// 辅助函数：从UrlMaps生成菜单项
function generateMenuItems(urlMaps: Array<{id: string, label: string, url: string}>): BaiZeMenuItem[] {
    return urlMaps.map(item => ({
        label: item.label,
        menu_action: item.id
    }));
}

const importMenu: BaiZeMenuItem = {
    label: '从文件导入',
    submenu: [
        { label: '从 Word 导入', menu_action: 'baize:menu:file:import:word' },
        { label: '从 HTML 导入', menu_action: 'baize:menu:file:import:html' },
        { label: '从 JSON 导入', menu_action: 'baize:menu:file:import:json' },
        { label: '从 YAML 导入', menu_action: 'baize:menu:file:import:yaml' },
        { label: '从 XML 导入', menu_action: 'baize:menu:file:import:xml' },
        { label: '从文本文件导入', menu_action: 'baize:menu:file:import:text' }
    ]
}

const exportMenu: BaiZeMenuItem = {
    label: '导出到文件',
    submenu: [
        { label: '导出为Word', menu_action: 'baize:menu:file:export:word' },
        { label: '导出为JSON', menu_action: 'baize:menu:file:export:json' },
        { label: '导出为XML', menu_action: 'baize:menu:file:export:xml' },
        { label: '导出为YAML', menu_action: 'baize:menu:file:export:yaml' },
        { label: '导出为HTML', menu_action: 'baize:menu:file:export:html' },
        { label: '导出为PDF', menu_action: 'baize:menu:file:export:pdf' }
    ]
}

const fileMenu: BaiZeMenuItem = {
    label: '文件',
    accelerator: 'Alt+N',
    submenu: [
        { label: '新建文件(N)', accelerator: 'Ctrl+N', menu_action: 'baize:menu:file:new-file' },
        { label: '新建文件夹(D)', accelerator: 'Ctrl+D', menu_action: 'baize:menu:file:new-folder' },
        { label: '打开文件', menu_action: 'baize:menu:file:open-file' },
        { label: '打开文件夹', accelerator: 'Ctrl+O', menu_action: 'baize:menu:file:open-folder' },
        { type: 'separator'},
        importMenu,
        exportMenu,
        { type: 'separator' },
        { label: '保存', accelerator: 'Ctrl+S', menu_action: 'baize:menu:file:save' },
        { label: '另存为', menu_action: 'baize:menu:file:save-as' },
        { label: '从磁盘重新加载', accelerator: 'Ctrl+R', menu_action: 'baize:menu:file:reload' },
        { type: 'separator' },
        { label: '重启应用', accelerator: 'Ctrl+Shift+R', menu_action: 'baize:menu:file:relaunch' },
        { type: 'separator' },
        { label: '退出', accelerator: 'F4', menu_action: 'baize:menu:file:exit' }
    ]
}

const editMenu: BaiZeMenuItem = {
    label: '编辑',
    submenu: [
        { label: '撤销', accelerator: 'Ctrl+Z', menu_action: 'baize:menu:edit:undo' },
        { label: '重做', accelerator: 'Ctrl+Y', menu_action: 'baize:menu:edit:redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'Ctrl+X', menu_action: 'baize:menu:edit:cut' },
        { label: '复制', accelerator: 'Ctrl+C', menu_action: 'baize:menu:edit:copy' },
        { label: '粘贴', accelerator: 'Ctrl+V', menu_action: 'baize:menu:edit:paste' },
        { type: 'separator' },
        { label: '跳转到行', accelerator: 'Ctrl+G', menu_action: 'baize:menu:edit:go-line' },
        { label: '查找', accelerator: 'Ctrl+F', menu_action: 'baize:menu:edit:find-in-file' },
        { label: '替换', accelerator: 'Ctrl+H', menu_action: 'baize:menu:edit:replace-in-file' },
        { label: '在文件中查找', accelerator: 'Ctrl+Shift+F', menu_action: 'baize:menu:edit:find-in-dir' },
        { label: '在文件中替换', accelerator: 'Ctrl+Shift+H', menu_action: 'baize:menu:edit:replace-in-dir' }
    ]
}

const viewMenu: BaiZeMenuItem = {
    label: '视图',
    submenu: [
        { label: '编辑模式', accelerator: 'F9', menu_action: 'baize:menu:view:edit-mode' },
        { label: '预览模式', accelerator: 'F10', menu_action: 'baize:menu:view:preview-mode' },
        { label: '编辑/预览模式', accelerator: 'F11', menu_action: 'baize:menu:view:edit-preview-mode' },
        { label: '开发人员工具', accelerator: 'F12', menu_action: 'baize:menu:view:dev-tools' },
        { type: 'separator' },
        { label: '显示/隐藏资源管理器', menu_action: 'baize:menu:view:toggle-resource-manager' },
        { label: '显示/隐藏行号', menu_action: 'baize:menu:view:toggle-line-number' },
        { label: '显示/隐藏空白字符', menu_action: 'baize:menu:view:toggle-whitespace' },
        { label: '显示/隐藏文章大纲', menu_action: 'baize:menu:view:toggle-outline' },
        { type: 'separator' },
        { label: '折叠/展开标题',
            submenu: [
                { label: '全部折叠', menu_action: 'baize:menu:view:fold:all-fold' },
                { label: '全部展开', menu_action: 'baize:menu:view:fold:all-expand' },
                { label: '一级标题', menu_action: 'baize:menu:view:fold:level1' },
                { label: '二级标题', menu_action: 'baize:menu:view:fold:level2' },
                { label: '三级标题', menu_action: 'baize:menu:view:fold:level3' },
                { label: '四级标题', menu_action: 'baize:menu:view:fold:level4' },
                { label: '五级标题', menu_action: 'baize:menu:view:fold:level5' },
                { label: '六级标题', menu_action: 'baize:menu:view:fold:level6' },
            ]}
    ]
}

const opeFileEncoding: BaiZeMenuItem = {
    label: '重新用...编码打开',
    submenu: [
        { label: 'UTF-8', menu_action: 'baize:menu:coding:encoding:utf8' },
        { label: 'UTF-16LE', menu_action: 'baize:menu:coding:encoding:utf16-le' },
        { label: 'UTF-16BE', menu_action: 'baize:menu:coding:encoding:utf16-be' },
        { type: 'separator' },
        { label: 'GBK(简体中文)', menu_action: 'baize:menu:coding:encoding:gbk' },
        { label: 'GB2312(简体中文)', menu_action: 'baize:menu:coding:encoding:gb2312' },
        { label: 'GB18030(简体中文)', menu_action: 'baize:menu:coding:encoding:gb18030' },
        { label: 'Big5(繁体中文)', menu_action: 'baize:menu:coding:encoding:big5' },
        { label: 'Big5-HKSCS(繁体中文)', menu_action: 'baize:menu:coding:encoding:big5-hkscs' },
        { type: 'separator' },
        { label: '十六进制', menu_action: 'baize:menu:coding:encoding:hex' },
        { label: '注意: 请勿直接编辑乱码文件。'},
    ]
}

const switchEncodingMenu: BaiZeMenuItem = {
    label: '转为...编码',
    submenu: [
        { label: 'UTF-8', menu_action: 'baize:menu:coding:switch:utf8' },
        { label: 'UTF-16LE', menu_action: 'baize:menu:coding:switch:utf16-le' },
        { label: 'UTF-16BE', menu_action: 'baize:menu:coding:switch:utf16-be' },
        { type: 'separator' },
        { label: 'GBK(简体中文)', menu_action: 'baize:menu:coding:switch:gbk' },
        { label: 'GB2312(简体中文)', menu_action: 'baize:menu:coding:switch:gb2312' },
        { label: 'GB18030(简体中文)', menu_action: 'baize:menu:coding:switch:gb18030' },
        { label: 'Big5(繁体中文)', menu_action: 'baize:menu:coding:switch:big5' },
        { label: 'Big5-HKSCS(繁体中文)', menu_action: 'baize:menu:coding:switch:big5-hkscs' },
        { type: 'separator' },
        { label: '十六进制', menu_action: 'baize:menu:coding:switch:hex' },
        { label: '注意: 请勿直接编辑乱码文件。'},
    ]
}
const codingMenu: BaiZeMenuItem = {
    label: '编码',
    submenu: [
        opeFileEncoding, // 编码
        switchEncodingMenu, // 切换编码
    ]
}

const insertMaterial: BaiZeMenuItem = {
    label: 'Material',
    submenu: [
        {label: 'Admonition', menu_action: 'baize:menu:insert:material:admonition'},
    ]
}

const insertMermaid: BaiZeMenuItem = {
    label: 'Mermaid',
    submenu: [
        {label: 'Mermaid Part1', submenu: Templates.MermaidPart1 },
        {label: 'Mermaid Part2', submenu: Templates.MermaidPart2 },
    ]
}

const insertPlantUML: BaiZeMenuItem = {
    label: 'PlantUML',
    submenu: [
        {label: 'PlantUML Part1', submenu: Templates.PlantUMLPart1 },
        {label: 'PlantUML Part2', submenu: Templates.PlantUMLPart2 },
    ]
}

const insertMenu: BaiZeMenuItem = {
    label: '插入',
    submenu: [
        { label: '特殊字体', menu_action: 'baize:menu:insert:special-text' },
        { label: '数学公式', menu_action: 'baize:menu:insert:math' },
        { label: 'Markdown表格', menu_action: 'baize:menu:insert:md-table' },
        { label: '网页链接', menu_action: 'baize:menu:insert:web-link' },
        { type: 'separator' },
        {label: '写作模板', submenu: Templates.Writing },
        {label: '文本块', submenu: Templates.TextBlock },
        {label: '来自文件', submenu: Templates.InsertFromFiles },
        { type: 'separator' },
        insertMaterial,
        insertMermaid, // 编码
        insertPlantUML, // 切换编码
        { type: 'separator' },
        { label: '自定义模板', menu_action: 'baize:menu:insert:custom-template' },
        { label: '模板管理', menu_action: 'baize:menu:insert:template-manager' }
    ]
}

const settingMenu: BaiZeMenuItem = {
    label: '设置',
    submenu: [
        { label: '系统设置', menu_action: 'baize:menu:setting:system' },
        { label: '主题设置', menu_action: 'baize:menu:setting:theme' },
        { type: 'separator' },
        { label: '快速链接设置', menu_action: 'baize:menu:setting:quick-link' },
        { label: '编辑器设置', menu_action: 'baize:menu:setting:monaco-editor' }
    ]
}

const toolsMenu: BaiZeMenuItem = {
    label: '工具',
    submenu: [
        { label: 'mermaid绘图', menu_action: 'baize:menu:tools:mermaid' },
        { label: '公式编辑器', menu_action: 'baize:menu:tools:katex' },
        { label: '电子表格', menu_action: 'baize:menu:tools:table' },
        { label: '配图制作', menu_action: 'baize:menu:tools:images' },
        { label: '绘图工具', menu_action: 'baize:menu:tools:drawing' }
    ]
}

const pluginsMenu: BaiZeMenuItem = {
    label: '插件',
    submenu: [
        {
            label: '语言语法关键字对照表',
            submenu: MenuConst.PluginCodeDef
        },
        {
            label: '加解密插件',
            submenu: MenuConst.PluginGeneratorMaps
        },
        {
            label: '各类转换器',
            submenu: [
                {
                    label: '编解码转换',
                    submenu: MenuConst.PluginCodeConvertMaps
                },
                {
                    label: '格式转换器',
                    submenu: MenuConst.PluginConvertMaps
                },
                {
                    label: '大小写转换',
                    submenu: MenuConst.PluginUpLowerMaps
                },
                {
                    label: '格式化工具',
                    submenu: MenuConst.PluginFormatMaps
                },
            ]
        },
        {
            label: '网络计算插件',
            submenu: [
                {
                    label: '地址转换器',
                    submenu: MenuConst.PluginNetAddrs
                },
                {
                    label: '解析器',
                    submenu: MenuConst.PluginNetGenerators
                },
                ...MenuConst.PluginNetWork
            ]
        },
        {
            label: '常用对照表',
            submenu: [
                {
                    label: '对照表一',
                    submenu: MenuConst.PluginInfoNormal
                }, // 常用对照表
                {
                    label: '数据和命令对照表',
                    submenu: MenuConst.PluginInfoCmd
                },
                {
                    label: '科学符号对照表',
                    submenu: MenuConst.PluginInfoScience
                },
                //{ label: 'Unicode编码表', menu_action: 'baize:menu:plugins:info:unicode-table' },
                //{ label: 'MIME类型表', menu_action: 'baize:menu:plugins:info:mime-type-table' },
            ]
        }
    ]
}

// 在线工具菜单
// 工具网站菜单
const onlineMenu: BaiZeMenuItem = {
    label: '工具网站',
    submenu: generateMenuItems(MenuConst.OnlineToolMaps)
}

// 快速链接菜单
const quickLinkMenu: BaiZeMenuItem = {
    label: '快速链接',
    submenu: [
        {
            label: '菜鸟在线工具',
            submenu: generateMenuItems(MenuConst.CaiNiaoUrlMaps)
        },
        {
            label: '编程狮在线工具',
            submenu: generateMenuItems(MenuConst.W3SchoolUrlMaps)
        },
        {
            label: '在线编解码工具',
            submenu: generateMenuItems(MenuConst.EncDecUrlMaps)
        },
        {
            label: '在线IDE编辑器',
            submenu: generateMenuItems(MenuConst.IdeUrlMaps)
        },
        {
            label: '开发者工具',
            submenu: generateMenuItems(MenuConst.DevelopUrlMaps)
        },
        {
            label: '国内知名前端团队',
            submenu: generateMenuItems(MenuConst.TeamUrlMaps)
        },
        {
            label: '云计算平台',
            submenu: generateMenuItems(MenuConst.CloudUrlMaps)
        }
    ]
}

const gitHubMenu: BaiZeMenuItem = {
    label: 'GitHub',
    submenu: generateMenuItems(MenuConst.GitHubUrlMaps)
}


const helpMenu: BaiZeMenuItem = {
    label: '帮助',
    submenu: [
        { label: '版本发布', menu_action: 'baize:menu:help:release-notes' },
        { label: '修改日志', menu_action: 'baize:menu:help:change-log' },
        { type: 'separator' },
        { label: '键盘快捷方式', menu_action: 'baize:menu:help:shortkeys' },
        { label: '使用文档', menu_action: 'baize:menu:help:usage' },
        { label: '提交创意/意见', menu_action: 'baize:menu:help:issues' },
        { type: 'separator' },
        { label: '技术栈', menu_action: 'baize:menu:help:tech-stack' },
        { label: '关于', menu_action: 'baize:menu:help:about' },
        { label: '主页', menu_action: 'baize:menu:help:home' },
        { type: 'separator' },
        { label: '检查更新', menu_action: 'baize:menu:help:update' },
        { label: '联系我们', menu_action: 'baize:menu:help:contact-us' },
    ]
}

export const menuMap = ref<BaiZeMenuItem[]>([
    fileMenu, // 文件
    editMenu, // 编辑
    viewMenu, // 视图
    codingMenu, // 编码
    insertMenu,
    settingMenu,
    toolsMenu,
    pluginsMenu,
    onlineMenu,
    quickLinkMenu,
    gitHubMenu,
    helpMenu
])
