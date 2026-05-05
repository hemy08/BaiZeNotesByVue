
import {
    CHANNEL_PLUGIN_TOOL_SHOW,
} from './menu_consts';
import * as Templates from '../../common/templates';
import EventBus from "@renderer/common/event_bus/event-bus";
import { getConfigStore } from '@renderer/common/useConfigStore';

export function HandleMenuAction(action: string) {
    // 获取配置 store
    const configStore = getConfigStore()

    // ========== 前端可直接处理的对话框 ==========

    // 主题设置对话框
    if (action === 'baize:menu:setting:theme') {
        configStore.showDialog('themeSettings')
        return
    }

    // 编辑器设置对话框
    if (action === 'baize:menu:setting:editor') {
        configStore.showDialog('editorSettings')
        return
    }

    // 系统设置对话框
    if (action === 'baize:menu:setting:system') {
        configStore.showDialog('systemSettings')
        return
    }

    // 快捷链接设置
    if (action === 'baize:menu:setting:quicklinks') {
        configStore.showDialog('quickLinks')
        return
    }

    // 插入特殊文字
    if (action === 'baize:menu:insert:special-text') {
        configStore.showDialog('fontSelect')
        return
    }

    // 插入 Mermaid 图表
    if (action === 'baize:menu:insert:mermaid') {
        configStore.showDialog('mermaidEdit')
        return
    }

    // 插入 Admonition
    if (action === 'baize:menu:insert:admonition') {
        configStore.showDialog('admonition')
        return
    }

    // 插入数学公式
    if (action === 'baize:menu:insert:math') {
        configStore.showDialog('mathText')
        return
    }

    // 插入图片
    if (action === 'baize:menu:insert:image') {
        configStore.showDialog('insertImage')
        return
    }

    // 插入表格
    if (action === 'baize:menu:insert:table') {
        configStore.showDialog('mdSheet')
        return
    }

    // 插入链接
    if (action === 'baize:menu:insert:link') {
        configStore.showDialog('insertLink')
        return
    }

    // 新建文件/文件夹
    if (action === 'baize:menu:file:new') {
        // 获取当前打开文件的路径作为默认目录
        window.electron.ipcRenderer.invoke('baize-notes:get-current-file-path').then((dirPath: string) => {
            configStore.showDialog('createFileFolder', { dirPath })
        })
        return
    }

    // 导入选项
    if (action === 'baize:menu:file:import') {
        configStore.showDialog('importOption')
        return
    }

    // 关于对话框
    if (action === 'baize:menu:help:about') {
        configStore.showDialog('helpAbout')
        return
    }

    // 联系我们
    if (action === 'baize:menu:help:contact') {
        configStore.showDialog('helpContact')
        return
    }

    // 技术栈
    if (action === 'baize:menu:help:tech-stack') {
        configStore.showDialog('techStack')
        return
    }

    // ========== 需要主进程处理的菜单项 ==========

    // 插件菜单
    if (action.startsWith('baize:menu:plugins:')) {
        EventBus.$emit(CHANNEL_PLUGIN_TOOL_SHOW, action)
        return
    }

    // 插入 Mermaid 模板
    if (action.startsWith('baize:menu:insert:mermaid:')) {
        const item = Templates.Mermaid.find(item => item.menu_action === action)
        EventBus.$emit('baize:notes:monaco-editor:insert-text', item?.context)
        return
    }

    // 插入文本块模板
    if (action.startsWith('baize:menu:insert:textblock:')) {
        const item = Templates.TextBlock.find(item => item.menu_action === action)
        EventBus.$emit('baize:notes:monaco-editor:insert-text', item?.context)
        return
    }

    // 插入写作模板
    if (action.startsWith('baize:menu:insert:writing:')) {
        const item = Templates.Writing.find(item => item.menu_action === action)
        EventBus.$emit('baize:monaco-editor-use-template', item?.context)
        return
    }

    // PlantUML 模板
    if (action.startsWith('baize:menu:insert:plantuml:')) {
        const item = Templates.PlantUML.find(item => item.menu_action === action)
        EventBus.$emit('baize:notes:monaco-editor:insert-text', item?.context)
        return
    }

    // 其他菜单动作通过 IPC 发送到主进程处理
    window.electron.ipcRenderer.send('baize-notes:menu-action', action)
}
