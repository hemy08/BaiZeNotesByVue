# 对话框改为 Vue 计划

---

## 🤔 回答你的问题

> **如果我将对话框改为Vue的话，是不是IPC的处理也得改呢？**

**答案**：
- **现有 IPC 消息协议**：✅ **完全不需要改！**（保持 `baize-notes:theme-update`）
- **IPC 通信方式**：需要做**少量调整**（补充 invoke API，或者保持 send）
- **向后兼容**：非常重要！必须同时支持新老方式

---

## 📊 方案对比总表

| 维度 | 方案 A：独立窗口 | 方案 B：主窗口内 Modal |
| --- | --- | --- |
| **IPC 改动** | 很少（保持 send） | 很少（可简化或保持） |
| **架构影响** | 中等 | 低 |
| **性能** | 稍低（额外窗口） | 最好 |
| **用户体验** | 接近原生对话框 | 应用内体验 |
| **代码量** | 中等 | 少 |
| **推荐度** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

---

## 🎯 我的建议

**优先考虑方案 B（Modal）**，理由：
1. ✅ 主题设置不是很频繁的操作，不需要独立窗口
2. ✅ 完全复用 App.vue 中的 `applyTheme` 等代码
3. ✅ IPC 可以简化甚至直接在渲染进程内处理
4. ✅ 实现更简单，风险更小

---

## 📁 已创建的示例文件

```
doc/trae/theme-settings-examples/
├── ThemeSettingModal.vue         # 方案 B：Modal 组件
├── preload-updates.ts            # Preload API 补充
├── main-process-ipc.ts           # IPC 监听器（兼容新旧）
├── SchemeA-Independent-Window.md # 方案 A 完整文档
└── (本文档)
```

---

## 🚀 实施步骤（以方案 B 为例）

### 第 1 步：补充 Preload API（保持兼容）
```
修改 src/preload/index.ts
暴露 theme.getThemeConfig 等 API
```

### 第 2 步：注册 IPC 监听器（保持兼容）
```
新增/修改 src/main/themes/theme-ipc.ts
同时支持：
- 老方式：ipcRenderer.send('baize-notes:theme-update')
- 新方式：ipcRenderer.invoke('theme:set-config')
```

### 第 3 步：创建 Vue 组件
```
新增 src/renderer/src/components/ThemeSettingModal.vue
复用已有 applyTheme 逻辑
```

### 第 4 步：集成到 App.vue
```
在 App.vue 中添加状态 showThemeSetting
点击菜单时设置为 true 显示 Modal
```

### 第 5 步：保留 ShowThemeSettingDialog 备用
```
可以暂时保留，或者：
- 老代码：ShowThemeSettingDialog 还是 JSDOM（暂时）
- 新代码：调用 Vue Modal
```

---

## 🔧 关键技术点

### 1. IPC 通信方式

| 类型 | 老方式 | 新方式 |
| --- | --- | --- |
| 通信 | `ipcRenderer.send()` | `ipcRenderer.invoke()` |
| 返回 | 单向 | Promise (支持返回值) |
| 实现 | `ipcMain.on()` | `ipcMain.handle()` |

**推荐**：两种都支持！（见 `main-process-ipc.ts` 示例）

### 2. 主题配置更新

```
✅ 保持现有广播协议：'baize-notes:theme-updated'
✅ 保持配置格式完全兼容
```

### 3. 渐进式迁移

- 第 1 阶段：Modal 组件上线，同时保留 JSDOM 对话框作为备用
- 第 2 阶段：验证稳定后，完全移除 JSDOM 实现
- 第 3 阶段：将其他对话框（如编辑器设置）逐步迁移

---

## ✨ 其他对话框迁移建议

主题设置改完后，可以用同样的方式迁移其他对话框：
- `ShowEditorSettingDialog.ts`
- `ShowSystemSettingDialog.ts`
- `ShowMermaidEditDialog.ts`
- `ShowQuickLinkSettingDialog.ts`
- ...

**迁移优先级建议**：
1. 🎨 主题设置（复杂度中等，可作为试点）
2. ⚙️ 编辑器设置（类似，复杂度类似）
3. 📝 Mermaid 编辑（相对独立）
4. ...
