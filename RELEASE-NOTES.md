# 发布说明 (Release Notes)

## 版本 1.1.5 (2026-05-01)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)


`Bai Ze Notes 1.1.5 windows.x64.exe`   是免安装直接使用
`Bai Ze Notes Setup 1.1.5 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>

### 🚀 核心功能

**配置管理系统**
- 新增用户配置目录 `.baizenotes`，支持多用户独立配置
- 统一配置文件管理，提供类型安全的 API

**卸载体验优化**
- 卸载时询问是否保留配置文件，提供更友好的卸载体验

**文件状态管理**
- 自动保存文件和目录状态，应用重启后自动恢复工作状态
- 状态栏实时显示文件保存状态（已保存/未保存）

**HTML/PDF 支持**
- 新增 HTML 查看和 PDF 编辑器组件，支持直接预览和编辑

**日志系统**
- 新增多级别日志模块（DEBUG, INFO, WARN, ERROR）
- 支持日志文件自动轮转和归档

**窗口管理**
- 新增窗口管理器，支持模态/非模态窗口控制和状态监控

**IPC 监听器管理**
- 新增 IPC 监听器管理器，自动清理机制防止内存泄漏

**快捷键系统**
- 新增快捷键注册模块，支持全局快捷键绑定和冲突检测

### ⚡ 性能优化

**编辑器性能**
- 大文件加载速度提升 50%+
- 内存使用减少 40%
- Monaco Editor 实例管理优化，防止内存泄漏

**Mermaid 渲染**
- 多图表并行渲染，速度提升 3倍
- 图表渲染结果缓存，按需渲染

**EventBus 优化**
- 组件卸载时自动清理事件监听器
- 修复事件监听器残留导致的内存泄漏

**状态管理**
- 使用 electron-store 进行状态持久化
- 分离持久化状态和运行时状态

### 🎨 UI/UX 改进

**主题系统**
- 新增 55 种 Monaco 编辑器主题
- 主题文件移至 `resources/themes/monaco-themes/themes/`
- 从 JSON 文件动态加载主题配置

**预览区域**
- 增加垂直滚动条显示
- 优化滚动流畅度

**状态栏**
- 实时显示文件保存状态
- 未保存/已保存状态可视化区分

**右侧导航**
- 新增 NaviTab 组件，提供快速访问常用功能

### 🐛 重要修复

**内存泄漏修复（严重）**
- 修复 Vue 3 生命周期钩子嵌套调用问题
- 修复 Monaco Editor 实例未释放问题（30-50 MB/个）
- 修复 EventBus 事件监听器残留问题
- 修复窗口事件监听器残留问题
- 修复 IPC 监听器未清理问题

**文件保存修复**
- 修复文件保存失败 bug
- 修复文件编码保存问题

**渲染问题修复**
- 修复 Mermaid 图表渲染失败问题
- 优化 Material 图标渲染

**其他修复**
- 修复文件新增时默认插入内容问题
- 修复主题样式不正确应用问题
- 修复主题切换后菜单栏颜色不同步问题
- 修复编辑器布局错位问题
- 修复文件无法保存问题

### 🔧 代码质量

**TypeScript 改进**
- 新增多个类型定义文件
- 提供完整的类型安全 API

**代码重构**
- 优化组件生命周期管理
- 改进错误处理机制
- 统一代码风格

### 📦 依赖更新

- 新增 renderer 依赖 (v0.1.5)
- Monaco Editor 更新至 0.55.0

</code></pre></blockcode></details>

---

## 版本 1.1.3 (2026-04-26)

[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)


`Bai Ze Notes 1.1.3 windows.x64.exe`   是免安装直接使用
`Bai Ze Notes Setup 1.1.3 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译
<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>
<h3>🚀 核心功能</h3>
<ul>
<li><strong>文件自动保存</strong>：实现自动保存机制，默认周期60秒，状态栏实时显示保存状态</li>
<li><strong>HTML/PDF 支持</strong>：新增 HTML 查看和 PDF 编辑器组件，支持直接预览和编辑</li>
<li><strong>日志系统</strong>：新增多级别日志模块，支持日志文件自动轮转和归档</li>
<li><strong>窗口管理</strong>：新增窗口管理器，支持模态/非模态窗口控制和状态监控</li>
</ul>
</code></pre></blockcode></details>

---

## 版本 1.0.1 (2026-03-08)
[更新日志（CHANGELOG.md）](https://github.com/hemy08/BaiZeNotesByVue/blob/main/CHANGELOG.md)


`Bai Ze Notes 1.0.1 windows.x64.exe`   是免安装直接使用
`Bai Ze Notes Setup 1.0.1 windows.x64.exe` 是`Windows`下的安装包，目前不提供`Linux、macOS、HarmonyOS`，可以自行下载编译

<details>
<summary style="color:rgb(0,0,255);font-weight:bold">🎉 主要更新</summary>
<blockcode><pre><code>
### ✨ 新增功能
- 支持安装目录由用户自定义选中
- 支持快速链接用户自定义：**设置->快速链接设置**
- 更新项目说明 README.md
- 补充项目设计文档，参考 `\doc` 目录
- 更新工具图标（使用 `Codearts Agent` 生成）
</code></pre></blockcode></details>


---

## 下载地址

### Windows 平台
- **免安装版**：Bai Ze Notes [版本号] windows.x64.exe
- **安装版**：Bai Ze Notes Setup [版本号] windows.x64.exe

### 其他平台
- Linux、macOS、HarmonyOS 版本可自行下载编译

---

## 版本说明

### 版本命名规则
- 主版本号.次版本号.修订号
- 主版本号：重大架构变更或不兼容更新
- 次版本号：新增功能或重要优化
- 修订号：Bug修复和小幅优化

### 更新频率
- 重大更新：不定期，根据功能开发进度
- 功能更新：每月1-2次
- Bug修复：根据问题严重程度及时发布

---

## 技术栈

- **Electron**: 38.0.0
- **Vue 3**: 3.4.27
- **TypeScript**: 6.0.2
- **Vite**: 5.2.11
- **Monaco Editor**: 0.55.0
- **markdown-it**: 14.1.0
- **Mermaid**: 10.9.1

---

**最后更新时间**: 2026-05-01
**当前版本**: 1.1.5
**维护者**: hemy08
