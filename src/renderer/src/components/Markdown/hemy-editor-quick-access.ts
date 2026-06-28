import { showEmojiQuickAccess } from './hemy-quick-access-emojis'
import { showSymbolQuickAccess } from './hemy-quick-access-symbols'
import * as Templates from '../../common/templates'
import ContextMenu, { MenuItem } from '@imengyu/vue3-context-menu'
import EventBus from '../../common/event_bus/event-bus'
import { getConfigStore } from '../../common/useConfigStore'
import {
    SVG_HEADER_1, SVG_HEADER_2, SVG_HEADER_3, SVG_HEADER_4, SVG_HEADER_5, SVG_HEADER_6,
    SVG_FONT_FAMILY, SVG_FONT_SIZE, SVG_FONT_BOLD, SVG_FONT_ITALIC, SVG_FONT_DELETE, SVG_FONT_UNDER,
    SVG_FONT_QUOTE, SVG_FONT_SUPER, SVG_FONT_SUB,
    SVG_ALIGN_LEFT, SVG_ALIGN_CENTER, SVG_ALIGN_JUSTIFY, SVG_ALIGN_RIGHT,
    SVG_LIST_NUMBERED, SVG_LIST_BULLETED, SVG_LINE_SCAN, SVG_LINE_ENTER,
    SVG_CODE_LINE, SVG_CODE_BLOCK, SVG_MATH_LINE, SVG_MATH_BLOCK,
    SVG_WEB_LINKS, SVG_TASK_LISTS,
    SVG_INSERT_IMAGES, SVG_INSERT_TABLE, SVG_INSERT_EMOJI, SVG_INSERT_SYMBOL,
    SVG_INSERT_MERMAID, SVG_INSERT_PLANTUML
} from './hemy-editor-quick-access-svgs'


const mermaidContextMenuItems = Object.keys(Templates.Mermaid).map((diagram) => {
    return {
        label: Templates.Mermaid[diagram].label,
        onClick: () => {
            EventBus.$emit('baize:notes:monaco-editor:insert-text', Templates.Mermaid[diagram].context)
        }
    }
})


const plantumlContextMenuItems = Object.keys(Templates.PlantUML).map((diagram) => {
    return {
        label: Templates.PlantUML[diagram].label, // 根据类别设置标签
        onClick: () => {
            EventBus.$emit('baize:notes:monaco-editor:insert-text', Templates.PlantUML[diagram].context)
        }
    }
})

function showMermaidQuickAccess(e: MouseEvent) {
    ContextMenu.showContextMenu({
        x: e.x,
        y: e.y + 10,
        items: mermaidContextMenuItems as MenuItem[]
    })
}

function showPlantUmlQuickAccess(e: MouseEvent) {
    ContextMenu.showContextMenu({
        x: e.x,
        y: e.y + 10,
        items: plantumlContextMenuItems as MenuItem[]
    })
}

type MarkdownEditQuickAccess = {
    [key: string]: {
        id: string
        title: string
        class: string
        clickFn: (event: Event, context: string, ...args: never[]) => void
        param: string
        svg: string
    } // 键是字符串，值是数字
}

function onFontHeaderFormat(_, context: string) {
    EventBus.$emit('monaco-editor-update-header-format', context)
}

function onFontFormat(_, context: string) {
    EventBus.$emit('monaco-editor-update-font-format', context)
}

function onInsertTable() {
    const configStore = getConfigStore()
    configStore.showDialog('mdSheet')
}

function onInsertWebLinks() {
    const configStore = getConfigStore()
    configStore.showDialog('insertLink')
}

function onInsertImage() {
    const configStore = getConfigStore()
    configStore.showDialog('insertImage')
}

function onShowEmojiMenu(e: Event) {
    showEmojiQuickAccess(e as MouseEvent)
}

function onShowSymbolsMenu(e: Event) {
    showSymbolQuickAccess(e as MouseEvent)
}

function onShowMermaidMenu(e: Event) {
    showMermaidQuickAccess(e as MouseEvent)
}

function onShowPlantUmlMenu(e: Event) {
    showPlantUmlQuickAccess(e as MouseEvent)
}

export const MdEditQuickAccess: MarkdownEditQuickAccess = {
    'header-1': {
        id: 'header-1',
        title: '一级标题',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'h1',
        svg: SVG_HEADER_1
    },
    'header-2': {
        id: 'header-2',
        title: '二级标题',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'h2',
        svg: SVG_HEADER_2
    },
    'header-3': {
        id: 'header-3',
        title: '三级标题',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H3',
        svg: SVG_HEADER_3
    },
    'header-4': {
        id: 'header-4',
        title: '四级标题',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H4',
        svg: SVG_HEADER_4
    },
    'header-5': {
        id: 'header-5',
        title: '五级标题',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H5',
        svg: SVG_HEADER_5
    },
    'header-6': {
        id: 'header-6',
        title: '六级标题',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H6',
        svg: SVG_HEADER_6
    },
    'font-family': {
        id: 'font-family',
        title: '字体样式',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontfamily',
        svg: SVG_FONT_FAMILY
    },
    'font-size': {
        id: 'font-size',
        title: '字体大小',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontsize',
        svg: SVG_FONT_SIZE
    },
    'font-bold': {
        id: 'font-bold',
        title: '加粗',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'bold',
        svg: SVG_FONT_BOLD
    },
    'font-italic': {
        id: 'font-italic',
        title: '倾斜',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'italic',
        svg: SVG_FONT_ITALIC
    },
    'font-delete': {
        id: 'font-delete',
        title: '删除线',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'deleteline',
        svg: SVG_FONT_DELETE
    },
    'font-under': {
        id: 'font-under',
        title: '下划线',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'underline',
        svg: SVG_FONT_UNDER
    },
    /*'font-color': {
    id: 'font-color',
    title: '颜色',
    class: 'tool-btn',
    clickFn: onHandleFontColor,
    param: 'fontcolor',
    svg: '<svg class="fixed-size-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 11.5s-2 2.17-2 3.5a2 2 0 0 0 2 2 2 2 0 0 0 2-2c0-1.33-2-3.5-2-3.5M5.21 10 10 5.21 14.79 10m1.77-1.06L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.56-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.59.59-1.56 0-2.12Z"/></svg>'
  },*/
    'font-quote': {
        id: 'font-quote',
        title: '引用',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontquote',
        svg: SVG_FONT_QUOTE
    },
    'font-super': {
        id: 'font-super',
        title: '上标',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontsuper',
        svg: SVG_FONT_SUPER
    },
    'font-sub': {
        id: 'font-sub',
        title: '下标',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontsub',
        svg: SVG_FONT_SUB
    },
    'align-left': {
        id: 'align-left',
        title: '左对齐',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'alignleft',
        svg: SVG_ALIGN_LEFT
    },
    'align-center': {
        id: 'align-center',
        title: '文字居中',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'aligncenter',
        svg: SVG_ALIGN_CENTER
    },
    'align-justify': {
        id: 'align-justify',
        title: '两边对齐',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'alignjustify',
        svg: SVG_ALIGN_JUSTIFY
    },
    'align-right': {
        id: 'align-right',
        title: '右对齐',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'alignright',
        svg: SVG_ALIGN_RIGHT
    },
    'list-numbered': {
        id: 'list-numbered',
        title: '有序列表',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'listnumbered',
        svg: SVG_LIST_NUMBERED
    },
    'list-bulleted': {
        id: 'list-bulleted',
        title: '无序列表',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'listbulleted',
        svg: SVG_LIST_BULLETED
    },
    'line-scan': {
        id: 'line-scan',
        title: '水平线',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'linescan',
        svg: SVG_LINE_SCAN
    },
    'line-enter': {
        id: 'line-enter',
        title: '段内换行',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'lineenter',
        svg: SVG_LINE_ENTER
    },
    'code-line': {
        id: 'code-line',
        title: '行内代码',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'codeline',
        svg: SVG_CODE_LINE
    },
    'code-block': {
        id: 'code-block',
        title: '代码块',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'codeblock',
        svg: SVG_CODE_BLOCK
    },
    'math-line': {
        id: 'math-line',
        title: '行内公式',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'mathline',
        svg: SVG_MATH_LINE
    },
    'math-block': {
        id: 'math-block',
        title: '公式块',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'mathblock',
        svg: SVG_MATH_BLOCK
    },
    'web-links': {
        id: 'web-links',
        title: '网站链接',
        class: 'tool-btn',
        clickFn: onInsertWebLinks,
        param: 'weblinks',
        svg: SVG_WEB_LINKS
    },
    'task-lists': {
        id: 'task-lists',
        title: '任务列表',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'tasklists',
        svg: SVG_TASK_LISTS
    },
    'insert-images': {
        id: 'insert-images',
        title: '插入图片',
        class: 'tool-btn',
        clickFn: onInsertImage,
        param: 'insertimage',
        svg: SVG_INSERT_IMAGES
    },
    'insert-table': {
        id: 'insert-table',
        title: '表格',
        class: 'tool-btn',
        clickFn: onInsertTable,
        param: 'insertable',
        svg: SVG_INSERT_TABLE
    },
    'insert-emoji': {
        id: 'insert-emoji',
        title: 'Emoji',
        class: 'tool-btn',
        clickFn: onShowEmojiMenu,
        param: '',
        svg: SVG_INSERT_EMOJI
    },
    'insert-symbol': {
        id: 'insert-symbol',
        title: '特殊符号',
        class: 'tool-btn',
        clickFn: onShowSymbolsMenu,
        param: '',
        svg: SVG_INSERT_SYMBOL
    },
    'insert-mermaid': {
        id: 'insert-mermaid',
        title: 'mermaid',
        class: 'tool-btn',
        clickFn: onShowMermaidMenu,
        param: '',
        svg: SVG_INSERT_MERMAID
    },
    'insert-plantuml': {
        id: 'insert-plantuml',
        title: 'plantuml',
        class: 'tool-btn',
        clickFn: onShowPlantUmlMenu,
        param: '',
        svg: SVG_INSERT_PLANTUML
    }
}
