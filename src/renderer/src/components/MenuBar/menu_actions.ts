
import {
    CHANNEL_PLUGIN_TOOL_SHOW,
    GitHubUrlMaps,
    OnlineUrlMaps
} from '../../../../main/common/menu_consts';
import * as Templates from '../../../../main/common/templates'
import EventBus from "@renderer/event-bus";


export function HandleMenuAction(action: string) {
    // 插件菜单
    if (action.startsWith('baize:menu:plugins:')) {
        EventBus.$emit(CHANNEL_PLUGIN_TOOL_SHOW, action)
        return
    }

    // 在线工具
    if (action.startsWith('baize:menu:online:')) {
        const item = OnlineUrlMaps.find(item => item.id === action)
        if (item) {
            window.open(item.url, '_blank', 'noopener, noreferrer')
        }
        return
    }

    if (action.startsWith('baize:menu:github:')) {
        const item = GitHubUrlMaps.find(item => item.id === action)
        if (item) {
            window.open(item.url, '_blank', 'noopener, noreferrer')
        }
        return
    }

    if (action.startsWith('baize:menu:insert:plantuml:')) {
        const item = Templates.PlantUML.find(item => item.menu_action === action)
        EventBus.$emit('monaco-editor-insert-text', item?.context)
        return
    }

    if (action.startsWith('baize:menu:insert:mermaid:')) {
        const item = Templates.Mermaid.find(item => item.menu_action === action)
        EventBus.$emit('monaco-editor-insert-text', item?.context)
        return
    }

    if (action.startsWith('baize:menu:insert:textblock:')) {
        const item = Templates.TextBlock.find(item => item.menu_action === action)
        EventBus.$emit('monaco-editor-insert-text', item?.context)
        return
    }

    if (action.startsWith('baize:menu:insert:writing:')) {
        const item = Templates.Writing.find(item => item.menu_action === action)
        EventBus.$emit('baize:monaco-editor-use-template', item?.context)
        //window.electron.ipcRenderer.send('monaco-insert-writing-templates', item?.context)
        return
    }


    window.electron.ipcRenderer.send('baize-notes:menu-action', action)
}
