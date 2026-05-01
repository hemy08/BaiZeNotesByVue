# 组合式API使用指南

## useEventBus - EventBus监听器自动管理

### 功能特性

- ✅ 自动在组件卸载时清理所有监听器
- ✅ 防止内存泄漏
- ✅ 简化代码，无需手动清理
- ✅ 支持TypeScript类型推断

### 基本用法

```typescript
import { defineComponent } from 'vue'
import { useEventBus } from '@/composables/useEventBus'

export default defineComponent({
  setup() {
    const { on, once, emit, off } = useEventBus()
    
    // 注册监听器（组件卸载时自动清理）
    on('event-name', (data) => {
      console.log('Received:', data)
    })
    
    // 一次性监听器
    once('one-time-event', (data) => {
      console.log('This will only fire once:', data)
    })
    
    // 触发事件
    const handleClick = () => {
      emit('my-event', { message: 'Hello' })
    }
    
    return {
      handleClick
    }
  }
})
```

### 迁移指南

#### 旧代码（需要手动清理）

```typescript
import EventBus from '@/event-bus'

export default defineComponent({
  setup() {
    const handleEvent = (data) => {
      console.log(data)
    }
    
    onMounted(() => {
      EventBus.$on('event-name', handleEvent)
    })
    
    onUnmounted(() => {
      EventBus.$off('event-name', handleEvent) // 必须手动清理
    })
  }
})
```

#### 新代码（自动清理）

```typescript
import { useEventBus } from '@/composables/useEventBus'

export default defineComponent({
  setup() {
    const { on } = useEventBus()
    
    // 自动清理，无需手动off
    on('event-name', (data) => {
      console.log(data)
    })
  }
})
```

### 调试工具

```typescript
import { useEventBusStats } from '@/composables/useEventBus'

export default defineComponent({
  setup() {
    const { getStats, checkLeaks } = useEventBusStats()
    
    // 获取统计信息
    const stats = getStats()
    console.log('Total listeners:', stats.totalListeners)
    console.log('Event details:', stats.eventDetails)
    console.log('Component details:', stats.componentDetails)
    
    // 检查内存泄漏
    const leaks = checkLeaks()
    if (leaks.hasLeaks) {
      console.warn('Memory leaks detected:', leaks.warnings)
    }
  }
})
```

## 最佳实践

1. **优先使用组合式API**：在Vue 3的setup函数中，优先使用`useEventBus`
2. **避免直接使用EventBus**：除非在非组件上下文中（如工具函数）
3. **定期检查泄漏**：在开发环境中使用`checkLeaks()`检查潜在问题
4. **合理使用once**：对于只需要监听一次的事件，使用`once`而不是手动`off`

## 性能优化

- 组件监听器使用Map映射，清理速度从O(n)提升到O(1)
- 添加内存泄漏检测功能，帮助发现问题
- 统计信息支持，便于性能监控
