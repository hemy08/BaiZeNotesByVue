// event-bus.js
const EventBus = {
  // 你可以使用 ref 创建一个响应式的数据源（如果需要的话）
  // 也可以使用 Map 或其他数据结构来存储事件和回调
  callbacks: new Map(),

  $on(eventName, callback) {
    if (!this.callbacks.has(eventName)) {
      this.callbacks.set(eventName, [])
    }
    this.callbacks.get(eventName).push(callback)
  },
  $emit(eventName, payload) {
    if (this.callbacks.has(eventName)) {
      this.callbacks.get(eventName).forEach((callback) => {
        callback(payload)
      })
    }
  },
  $off(eventName, callback) {
    if (this.callbacks.has(eventName)) {
      this.callbacks.set(
        eventName,
        this.callbacks.get(eventName).filter((cb) => cb !== callback)
      )
    }
  },
  // 修改 $off 方法以支持移除所有事件的所有监听器
  $offAll() {
    this.callbacks.clear()
  }
}

export default EventBus
