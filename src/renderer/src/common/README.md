# EventBus 事件总线

应用内全局事件总线，用于渲染层组件间解耦通信。跨进程交互一律走 IPC（`src/shared/ipc-channels.ts`），不要用 EventBus 代替 IPC。

## 推荐用法（M5：useEventBus 组合式封装）

业务组件统一使用 `composables/useEventBus`，注册的监听随组件卸载**自动清理**（`onBeforeUnmount`），不要再手写 `$on/$off` 配对：

```typescript
import { useEventBus } from '@renderer/composables/useEventBus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'

const { on: onEventBus } = useEventBus({ componentIdPrefix: 'MyComponent' })

onMounted(() => {
    onEventBus(EVENT_BUS.STATUS_BAR_FILE_PATH, handleFilePathUpdate)
})

// 卸载时无需手写 $off：useEventBus 自动按 componentId 清理本次注册
```

- 同一组件内多次调用 `useEventBus()` 会得到相互独立的 componentId（只清自身）；
- 清理后再注册会被静默忽略并打警告（防止异步初始化晚到造成常驻监听）；
- 事件名必须引用 `event-bus-events.ts` 的 `EVENT_BUS` 常量；
- 「谁发 / 谁收」以 `event-bus-contract.ts` 为唯一登记表，由
  `tests/unit/event-bus-contract.test.ts` 静态核对（新增收发点必须同步契约）。

## 底层 API（EventBus 本体 / useEventBus 内部实现使用）

| 方法                            | 说明                                             |
| ------------------------------- | ------------------------------------------------ |
| `$on(event, handler, options?)` | 注册监听器，`options.componentId` 支持按组件清理 |
| `$off(event, handler)`          | 移除指定监听器                                   |
| `$emit(event, payload?)`        | 触发事件                                         |
| `$cleanup(componentId)`         | 清理指定组件的所有监听器                         |
| `$stats()` / `$checkLeaks()`    | 监听器统计 / 泄漏检测兜底（单测与排查使用）      |

## 已知空发事件

`EVENT_BUS.MONACO_SWITCH_EXPLORER` 当前无订阅方（历史遗留，EventBus 派发无副作用），
按「不改变事件语义」保留并在契约表中标注 `note`，待后续批次清理评估。
