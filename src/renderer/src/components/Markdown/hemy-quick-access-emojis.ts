import ContextMenu, { MenuItem } from '@imengyu/vue3-context-menu'
import EventBus from '../../common/event-bus/event-bus'
import { h } from 'vue'
import { emojiGroupsPartA } from './hemy-quick-access-emojis-data-a'
import type { EmojiGroup } from './hemy-quick-access-emojis-data-a'
import { emojiGroupsPartB } from './hemy-quick-access-emojis-data-b'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { t } from '../../common/i18n'

// CQ-07：本文件已拆分为"数据（hemy-quick-access-emojis-data-a/b.ts）+ 逻辑（本文件）"。
// 对外 API 不变：showEmojiQuickAccess(e: MouseEvent)。
// 合并 A/B 两段数据，保持原 object 键顺序不变。
const emojiGroups: Record<string, EmojiGroup> = { ...emojiGroupsPartA, ...emojiGroupsPartB }

const emojiMenuChildrenStyle = {
    width: '400px',
    fontSize: '15pt',
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center'
}

const emojiMenuChildrenButtonStyle = {
    border: 'none',
    backgroundColor: 'transparent',
    fontSize: '20pt',
    width: '40px',
    height: '40px'
}

// 创建一个函数来生成表情按钮的列表
function createEmojiButtons(
    emojiCategory: string,
    emojiStyle: Record<string, string>,
    buttonStyle: Record<string, string>
) {
    return h(
        'div',
        { style: emojiStyle },
        emojiGroups[emojiCategory].data.map((text: string) => {
            return h(
                'button',
                {
                    style: buttonStyle,
                    onClick: () => {
                        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, text)
                    }
                },
                text
            )
        })
    )
}

// 分类标签来自 i18n 词典（按分类键取词），在打开菜单时构建，切换语言后新开菜单即时生效
function buildEmojiContextMenus(): MenuItem[] {
    return Object.keys(emojiGroups).map((category) => {
        return {
            label: t(`editorUi.emojiCategories.${category}`), // 根据类别设置标签
            direction: 'lr',
            children: [
                {
                    label: createEmojiButtons(
                        category,
                        emojiMenuChildrenStyle,
                        emojiMenuChildrenButtonStyle
                    )
                }
            ]
        }
        // CQ-15：MenuItem.label 的官方类型不接受 h() 生成的 VNode（库内实际支持渲染 VNode），
        // 且 direction: 'lr' 也不在其字面量联合类型内；运行时按库的宽类型工作，故保留断言，
        // 不改成更窄类型以免改变菜单位置语义。
    }) as unknown as MenuItem[]
}

export function showEmojiQuickAccess(e: MouseEvent) {
    ContextMenu.showContextMenu({
        x: e.x,
        y: e.y + 10,
        items: buildEmojiContextMenus()
    })
}
