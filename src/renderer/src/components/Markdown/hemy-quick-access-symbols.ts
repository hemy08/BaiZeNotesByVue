import ContextMenu, { MenuItem } from '@imengyu/vue3-context-menu'
import EventBus from '../../common/event-bus/event-bus'
import { h } from 'vue'
import { symbolGroupsPartA } from './hemy-quick-access-symbols-data-a'
import type { SymbolGroup } from './hemy-quick-access-symbols-data-a'
import { symbolGroupsPartB } from './hemy-quick-access-symbols-data-b'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { t } from '../../common/i18n'

// CQ-07：本文件已拆分为"数据（hemy-quick-access-symbols-data-a/b.ts）+ 逻辑（本文件）"。
// 对外 API 不变：showSymbolQuickAccess(e: MouseEvent)。
// 合并 A/B 两段数据，保持原 object 键顺序不变。
const symbolGroups: Record<string, SymbolGroup> = { ...symbolGroupsPartA, ...symbolGroupsPartB }

const symbolMenuStyle = {
    width: '750px',
    fontSize: '12pt',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
}

const symbolTabMenuStyle = {
    width: '370px',
    fontSize: '12pt',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
}

const symbolNumberMenuStyle = {
    width: '800px',
    fontSize: '12pt',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
}

const symbolButtonStyle = {
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '15pt',
    width: '30px',
    height: '30px'
}

const phoneticButtonStyle = {
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '15pt',
    width: '40px',
    height: '30px'
}

// 创建一个函数来生成表情按钮的列表
function createSymbolButtons(
    symbol: string,
    emojiStyle: Record<string, string>,
    buttonStyle: Record<string, string>
) {
    return h(
        'div',
        { style: emojiStyle },
        symbolGroups[symbol].data.map((text: string) => {
            if (symbol === 'chinesePhonetic') {
                return h(
                    'button',
                    {
                        style: phoneticButtonStyle,
                        title: text.substring(2, text.length - 1),
                        onClick: () => {
                            EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, text[0])
                        }
                    },
                    text[0]
                )
            }
            return h(
                'button',
                {
                    style: symbol === 'chinesePhonetic' ? phoneticButtonStyle : buttonStyle,
                    onClick: () => {
                        EventBus.$emit(
                            EVENT_BUS.MONACO_INSERT_TEXT,
                            symbol === 'chinesePhonetic' ? text[0] : text
                        )
                    }
                },
                text
            )
        })
    )
}

// 分类标签来自 i18n 词典（按分类键取词），在打开菜单时构建，切换语言后新开菜单即时生效
function buildSymbolContextMenus(): MenuItem[] {
    return Object.keys(symbolGroups).map((symbol) => {
        let menuStyle = symbolMenuStyle
        if (
            symbol === 'spcial3' ||
            symbol === 'tabls1' ||
            symbol === 'tabls2' ||
            symbol === 'tabls3'
        ) {
            menuStyle = symbolTabMenuStyle
        }

        if (symbol.startsWith('number') || symbol === 'chinesePhonetic') {
            menuStyle = symbolNumberMenuStyle
        }

        return {
            label: t(`editorUi.symbolCategories.${symbol}`), // 根据类别设置标签
            direction: 'br',
            children: [
                {
                    label: createSymbolButtons(symbol, menuStyle, symbolButtonStyle)
                }
            ]
        }
        // CQ-15：同 emojis——MenuItem.label 官方类型不接受 h() 生成的 VNode（库内实际支持），
        // 保留断言、不改窄类型以免改变菜单渲染语义。
    }) as unknown as MenuItem[]
}

export function showSymbolQuickAccess(e: MouseEvent) {
    ContextMenu.showContextMenu({
        x: e.x,
        y: e.y + 10,
        items: buildSymbolContextMenus()
    })
}
