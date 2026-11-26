import { showEmojiQuickAccess } from './hemy-quick-access-emojis'
import { showSymbolQuickAccess } from './hemy-quick-access-symbols'
import { t } from '../../common/i18n'
import * as Templates from '../../common/templates'
import ContextMenu, { MenuItem } from '@imengyu/vue3-context-menu'
import EventBus from '../../common/event-bus/event-bus'
import { getConfigStore } from '../../common/useConfigStore'
import { logger } from '../../common/logger'
import {
    SVG_HEADER_1,
    SVG_HEADER_2,
    SVG_HEADER_3,
    SVG_HEADER_4,
    SVG_HEADER_5,
    SVG_HEADER_6,
    SVG_FONT_FAMILY,
    SVG_FONT_SIZE,
    SVG_FONT_BOLD,
    SVG_FONT_ITALIC,
    SVG_FONT_DELETE,
    SVG_FONT_UNDER,
    SVG_FONT_QUOTE,
    SVG_FONT_SUPER,
    SVG_FONT_SUB,
    SVG_ALIGN_LEFT,
    SVG_ALIGN_CENTER,
    SVG_ALIGN_JUSTIFY,
    SVG_ALIGN_RIGHT,
    SVG_LIST_NUMBERED,
    SVG_LIST_BULLETED,
    SVG_LINE_SCAN,
    SVG_LINE_ENTER,
    SVG_CODE_LINE,
    SVG_CODE_BLOCK,
    SVG_MATH_LINE,
    SVG_MATH_BLOCK,
    SVG_WEB_LINKS,
    SVG_TASK_LISTS,
    SVG_INSERT_IMAGES,
    SVG_INSERT_TABLE,
    SVG_INSERT_EMOJI,
    SVG_INSERT_SYMBOL,
    SVG_INSERT_MERMAID,
    SVG_INSERT_PLANTUML
} from './hemy-editor-quick-access-svgs'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'

interface TemplateMenuEntry {
    labelKey?: string
    label?: string
    context: string
}

/**
 * 模板菜单项文案：优先使用 templates.ts 的 labelKey（由壳层菜单代理维护），
 * 兼容历史 label 字段；在菜单打开时取词，切换语言后新开菜单即时生效。
 */
function templateMenuLabel(template: TemplateMenuEntry): string {
    return template.labelKey ? t(template.labelKey) : (template.label ?? '')
}

function buildTemplateMenuItems(templates: readonly TemplateMenuEntry[]): MenuItem[] {
    return templates.map((template) => ({
        label: templateMenuLabel(template),
        onClick: () => {
            EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, template.context)
        }
    })) as MenuItem[]
}

function showMermaidQuickAccess(e: MouseEvent) {
    ContextMenu.showContextMenu({
        x: e.x,
        y: e.y + 10,
        items: buildTemplateMenuItems(Templates.Mermaid)
    })
}

function showPlantUmlQuickAccess(e: MouseEvent) {
    ContextMenu.showContextMenu({
        x: e.x,
        y: e.y + 10,
        items: buildTemplateMenuItems(Templates.PlantUML)
    })
}

type MarkdownEditQuickAccess = {
    [key: string]: {
        id: string
        titleKey: string
        class: string
        clickFn: (event: Event, context: string, ...args: never[]) => void
        param: string
        svg: string
    } // 键是字符串，值是数字
}

function onFontHeaderFormat(_event: Event, context: string) {
    EventBus.$emit(EVENT_BUS.MONACO_UPDATE_HEADER_FORMAT, context)
}

function onFontFormat(_event: Event, context: string) {
    EventBus.$emit(EVENT_BUS.MONACO_UPDATE_FONT_FORMAT, context)
}

function onInsertTable() {
    // P0：光标在 GFM 表格内 → 打开可视化表格编辑器；否则回退原有插入表格对话框。
    void import('../dialogs/medium/table-editor')
        .then((module) => module.openTableEditorForActiveEditor())
        .then((opened) => {
            if (!opened) {
                logger.info('[table] 当前光标不在标准 GFM 表格内，回退插入表格对话框')
                getConfigStore().showDialog('mdSheet')
            }
        })
        .catch((error) => {
            logger.warn('[table] 可视化表格编辑器加载失败，回退插入表格对话框', error)
            getConfigStore().showDialog('mdSheet')
        })
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
        titleKey: 'editorUi.toolbar.h1',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'h1',
        svg: SVG_HEADER_1
    },
    'header-2': {
        id: 'header-2',
        titleKey: 'editorUi.toolbar.h2',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'h2',
        svg: SVG_HEADER_2
    },
    'header-3': {
        id: 'header-3',
        titleKey: 'editorUi.toolbar.h3',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H3',
        svg: SVG_HEADER_3
    },
    'header-4': {
        id: 'header-4',
        titleKey: 'editorUi.toolbar.h4',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H4',
        svg: SVG_HEADER_4
    },
    'header-5': {
        id: 'header-5',
        titleKey: 'editorUi.toolbar.h5',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H5',
        svg: SVG_HEADER_5
    },
    'header-6': {
        id: 'header-6',
        titleKey: 'editorUi.toolbar.h6',
        class: 'tool-btn',
        clickFn: onFontHeaderFormat,
        param: 'H6',
        svg: SVG_HEADER_6
    },
    'font-family': {
        id: 'font-family',
        titleKey: 'editorUi.toolbar.fontFamily',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontfamily',
        svg: SVG_FONT_FAMILY
    },
    'font-size': {
        id: 'font-size',
        titleKey: 'editorUi.toolbar.fontSize',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontsize',
        svg: SVG_FONT_SIZE
    },
    'font-bold': {
        id: 'font-bold',
        titleKey: 'editorUi.toolbar.bold',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'bold',
        svg: SVG_FONT_BOLD
    },
    'font-italic': {
        id: 'font-italic',
        titleKey: 'editorUi.toolbar.italic',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'italic',
        svg: SVG_FONT_ITALIC
    },
    'font-delete': {
        id: 'font-delete',
        titleKey: 'editorUi.toolbar.deleteLine',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'deleteline',
        svg: SVG_FONT_DELETE
    },
    'font-under': {
        id: 'font-under',
        titleKey: 'editorUi.toolbar.underline',
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
        titleKey: 'editorUi.toolbar.quote',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontquote',
        svg: SVG_FONT_QUOTE
    },
    'font-super': {
        id: 'font-super',
        titleKey: 'editorUi.toolbar.superscript',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontsuper',
        svg: SVG_FONT_SUPER
    },
    'font-sub': {
        id: 'font-sub',
        titleKey: 'editorUi.toolbar.subscript',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'fontsub',
        svg: SVG_FONT_SUB
    },
    'align-left': {
        id: 'align-left',
        titleKey: 'editorUi.toolbar.alignLeft',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'alignleft',
        svg: SVG_ALIGN_LEFT
    },
    'align-center': {
        id: 'align-center',
        titleKey: 'editorUi.toolbar.alignCenter',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'aligncenter',
        svg: SVG_ALIGN_CENTER
    },
    'align-justify': {
        id: 'align-justify',
        titleKey: 'editorUi.toolbar.alignJustify',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'alignjustify',
        svg: SVG_ALIGN_JUSTIFY
    },
    'align-right': {
        id: 'align-right',
        titleKey: 'editorUi.toolbar.alignRight',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'alignright',
        svg: SVG_ALIGN_RIGHT
    },
    'list-numbered': {
        id: 'list-numbered',
        titleKey: 'editorUi.toolbar.listNumbered',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'listnumbered',
        svg: SVG_LIST_NUMBERED
    },
    'list-bulleted': {
        id: 'list-bulleted',
        titleKey: 'editorUi.toolbar.listBulleted',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'listbulleted',
        svg: SVG_LIST_BULLETED
    },
    'line-scan': {
        id: 'line-scan',
        titleKey: 'editorUi.toolbar.lineScan',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'linescan',
        svg: SVG_LINE_SCAN
    },
    'line-enter': {
        id: 'line-enter',
        titleKey: 'editorUi.toolbar.lineEnter',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'lineenter',
        svg: SVG_LINE_ENTER
    },
    'code-line': {
        id: 'code-line',
        titleKey: 'editorUi.toolbar.codeLine',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'codeline',
        svg: SVG_CODE_LINE
    },
    'code-block': {
        id: 'code-block',
        titleKey: 'editorUi.toolbar.codeBlock',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'codeblock',
        svg: SVG_CODE_BLOCK
    },
    'math-line': {
        id: 'math-line',
        titleKey: 'editorUi.toolbar.mathLine',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'mathline',
        svg: SVG_MATH_LINE
    },
    'math-block': {
        id: 'math-block',
        titleKey: 'editorUi.toolbar.mathBlock',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'mathblock',
        svg: SVG_MATH_BLOCK
    },
    'web-links': {
        id: 'web-links',
        titleKey: 'editorUi.toolbar.webLinks',
        class: 'tool-btn',
        clickFn: onInsertWebLinks,
        param: 'weblinks',
        svg: SVG_WEB_LINKS
    },
    'task-lists': {
        id: 'task-lists',
        titleKey: 'editorUi.toolbar.taskLists',
        class: 'tool-btn',
        clickFn: onFontFormat,
        param: 'tasklists',
        svg: SVG_TASK_LISTS
    },
    'insert-images': {
        id: 'insert-images',
        titleKey: 'editorUi.toolbar.insertImages',
        class: 'tool-btn',
        clickFn: onInsertImage,
        param: 'insertimage',
        svg: SVG_INSERT_IMAGES
    },
    'insert-table': {
        id: 'insert-table',
        titleKey: 'editorUi.toolbar.insertTable',
        class: 'tool-btn',
        clickFn: onInsertTable,
        param: 'insertable',
        svg: SVG_INSERT_TABLE
    },
    'insert-emoji': {
        id: 'insert-emoji',
        titleKey: 'editorUi.toolbar.insertEmoji',
        class: 'tool-btn',
        clickFn: onShowEmojiMenu,
        param: '',
        svg: SVG_INSERT_EMOJI
    },
    'insert-symbol': {
        id: 'insert-symbol',
        titleKey: 'editorUi.toolbar.insertSymbol',
        class: 'tool-btn',
        clickFn: onShowSymbolsMenu,
        param: '',
        svg: SVG_INSERT_SYMBOL
    },
    'insert-mermaid': {
        id: 'insert-mermaid',
        titleKey: 'editorUi.toolbar.insertMermaid',
        class: 'tool-btn',
        clickFn: onShowMermaidMenu,
        param: '',
        svg: SVG_INSERT_MERMAID
    },
    'insert-plantuml': {
        id: 'insert-plantuml',
        titleKey: 'editorUi.toolbar.insertPlantuml',
        class: 'tool-btn',
        clickFn: onShowPlantUmlMenu,
        param: '',
        svg: SVG_INSERT_PLANTUML
    }
}
