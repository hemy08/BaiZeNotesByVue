# EventBus 事件总线

应用内全局事件总线，用于组件间解耦通信。

## 可用方法

| 方法 | 说明 |
|------|------|
| `$on(event, handler, options?)` | 注册监听器，`options.componentId` 支持按组件清理 |
| `$off(event, handler)` | 移除指定监听器 |
| `$emit(event, ...args)` | 触发事件 |
| `$cleanup(componentId)` | 清理指定组件的所有监听器 |

## 使用示例

```typescript
import EventBus from '@/common/event_bus/event-bus'

onMounted(() => {
  EventBus.$on('event-name', handleEvent)
  EventBus.$on('other-event', handleOther, { componentId: 'my-component' })
})

onUnmounted(() => {
  EventBus.$off('event-name', handleEvent)
  // 或者批量清理:
  EventBus.$cleanup('my-component')
})
```
