# 白泽笔记 UI样式规范文档

## 目录
- [概述](#概述)
- [字体系统](#字体系统)
- [颜色系统](#颜色系统)
- [布局规范](#布局规范)
- [组件样式](#组件样式)
- [对话框样式](#对话框样式)
- [配置页面样式](#配置页面样式)

---

## 概述

本文档定义了白泽笔记应用的UI样式规范，确保所有界面元素保持一致的视觉风格和交互体验。

### 设计原则
- **一致性**：所有界面元素使用统一的样式规范
- **可访问性**：支持系统字体配置，确保良好的可读性
- **响应式**：使用相对单位和CSS变量，便于主题切换
- **交互性**：提供清晰的视觉反馈和流畅的过渡动画

---

## 字体系统

### 字体变量定义
```css
:root {
    --system-font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
    --system-font-size: 13px;
    
    /* 相对字体大小 */
    --font-size-xs: calc(var(--system-font-size) - 2px);  /* 11px - 提示文字 */
    --font-size-sm: calc(var(--system-font-size) - 1px);  /* 12px */
    --font-size-base: var(--system-font-size);            /* 13px - 基础大小 */
    --font-size-lg: calc(var(--system-font-size) + 1px);  /* 14px - 标题、图标 */
    --font-size-xl: calc(var(--system-font-size) + 2px);  /* 15px - 大按钮 */
    --font-size-2xl: calc(var(--system-font-size) + 4px); /* 17px - 大标题 */
}
```

### 字体使用规范
| 元素 | 字体大小 | 字重 | 说明 |
|------|---------|------|------|
| 正文内容 | var(--font-size-base) | normal | 基础文字大小 |
| 提示文字 | var(--font-size-xs) | normal | 辅助说明文字 |
| 配置项标签 | var(--font-size-base) | 500 | 配置项名称 |
| 区域标题 | var(--font-size-2xl) | 600 | 大标题 |
| 分组标题 | var(--font-size-lg) | 600 | 小标题 |
| 侧边栏菜单 | var(--font-size-base) | 500 | 导航菜单 |

---

## 颜色系统

### 主题颜色变量
```css
:root {
    --bg-color: #f5f5f5;           /* 背景色 */
    --card-bg: #ffffff;            /* 卡片背景色 */
    --text-color: #333333;         /* 主文字颜色 */
    --secondary-text-color: #666666; /* 次要文字颜色 */
    --border-color: #e0e0e0;       /* 边框颜色 */
    --accent-color: #764ba2;       /* 强调色 */
    --hover-bg: #f0e8ff;           /* 悬停背景色 */
    --title-bar-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}
```

### 颜色使用规范
- **主文字**：`var(--text-color)` - 用于主要内容和标签
- **次要文字**：`var(--secondary-text-color)` - 用于提示和说明
- **强调色**：`var(--accent-color)` - 用于激活状态、链接、按钮
- **边框**：`var(--border-color)` - 用于分割线和边框
- **悬停**：`var(--hover-bg)` - 用于鼠标悬停状态

---

## 布局规范

### 间距系统
```css
/* 基础间距单位：4px */
--spacing-xs: 4px;
--spacing-sm: 8px;
--spacing-md: 12px;
--spacing-lg: 16px;
--spacing-xl: 20px;
--spacing-2xl: 24px;
```

### 常用间距
| 场景 | 间距值 | 说明 |
|------|--------|------|
| 配置项行间距 | 8px | 配置项之间的垂直间距 |
| 配置项内边距 | 2px 0 | 配置项的上下内边距 |
| 配置项容器间距 | 8px | 容器内元素间距 |
| 配置项分组间距 | 12px | 分组之间的间距 |
| 内容区域内边距 | 16px 20px | 内容区域的padding |
| 侧边栏宽度 | 30% | 对话框宽度的30% |

---

## 组件样式

### 输入框 (Input)

#### 数字输入框
```css
.number-input {
    width: 100px;                  /* 固定宽度 */
    padding: 6px 10px;             /* 内边距 */
    border: 1px solid var(--border-color);
    border-radius: 6px;            /* 圆角 */
    background: var(--bg-color);
    color: var(--text-color);
    font-size: var(--font-size-base);
    transition: all 0.2s ease;     /* 过渡动画 */
}

.number-input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.1);
}
```

#### 文本输入框
```css
.setting-input {
    width: 200px;                  /* 固定宽度 */
    padding: 6px 10px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-color);
    color: var(--text-color);
    font-size: var(--font-size-base);
    transition: all 0.2s ease;
}

.setting-input:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.1);
}
```

### 下拉列表 (Select)

```css
.setting-select {
    width: 200px;                  /* 固定宽度 */
    padding: 6px 10px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-color);
    color: var(--text-color);
    font-size: var(--font-size-base);
    cursor: pointer;               /* 指针光标 */
    transition: all 0.2s ease;
}

.setting-select:focus {
    outline: none;
    border-color: var(--accent-color);
    box-shadow: 0 0 0 3px rgba(var(--accent-color-rgb), 0.1);
}
```

### 复选框 (Checkbox)

```css
.setting-checkbox {
    display: flex;
    align-items: center;
    gap: 8px;
}

.setting-checkbox input[type="checkbox"] {
    width: 16px;
    height: 16px;
    cursor: pointer;
    accent-color: var(--accent-color);
    border-radius: 4px;
}

.setting-checkbox label {
    font-size: var(--font-size-base);
    cursor: pointer;
    color: var(--text-color);
}
```

### 按钮 (Button)

```css
.btn {
    padding: 8px 20px;
    font-size: var(--font-size-base);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text-color);
    cursor: pointer;
    transition: all 0.2s ease;
    font-weight: 500;
}

.btn:hover {
    background: var(--hover-bg);
    border-color: var(--accent-color);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn-primary {
    background: var(--accent-color);
    color: var(--card-bg);
    border-color: var(--accent-color);
}
```

---

## 对话框样式

### 对话框尺寸
| 对话框类型 | 宽度 | 高度 | 最小宽度 | 最小高度 |
|-----------|------|------|---------|---------|
| 编辑器设置 | 1000px | 720px | 800px | 600px |
| 系统设置 | 800px | 520px | - | - |

### 标题栏
```css
.title-bar {
    height: 48px;
    padding: 0 24px;
    background: var(--title-bar-gradient);
    color: white;
    display: flex;
    justify-content: space-between;
    align-items: center;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.title-text {
    font-size: var(--font-size-lg);
    font-weight: 600;
    letter-spacing: 0.3px;
}

.close-btn {
    background: rgba(255, 255, 255, 0.15);
    border: none;
    color: white;
    font-size: var(--font-size-xl);
    width: 32px;
    height: 32px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.close-btn:hover {
    background: rgba(255, 255, 255, 0.25);
    transform: scale(1.05);
}
```

### 侧边栏
```css
.sidebar {
    width: 30%;                    /* 对话框宽度的30% */
    background: var(--card-bg);
    border-right: 1px solid var(--border-color);
    padding: 16px 0;
    overflow-y: auto;
}

.sidebar-item {
    padding: 12px 24px;
    cursor: pointer;
    font-size: var(--font-size-base);
    transition: all 0.2s ease;
    color: var(--text-color);
    display: flex;
    align-items: center;
    border-left: 3px solid transparent;
    margin: 2px 0;
}

.sidebar-item:hover {
    background: var(--hover-bg);
}

.sidebar-item.active {
    background: var(--hover-bg);
    border-left-color: var(--accent-color);
    color: var(--accent-color);
    font-weight: 500;
}
```

### 内容区域
```css
.content-area {
    flex: 1;
    padding: 16px 20px;
    overflow-y: auto;
    background: var(--card-bg);
}
```

---

## 配置页面样式

### 配置项布局
```css
.setting-group {
    display: grid;
    grid-template-columns: 180px 1fr;  /* 标签宽度180px */
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 2px 0;
}

.setting-label {
    font-size: var(--font-size-base);
    color: var(--text-color);
    text-align: right;
    padding-right: 8px;
    font-weight: 500;
}

.setting-value {
    display: flex;
    align-items: center;
    gap: 8px;
}
```

### 配置项容器
```css
.settings-grid {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.settings-group-container {
    margin-bottom: 12px;
    padding: 10px;
    background: var(--bg-color);
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.settings-group-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--border-color);
    letter-spacing: 0.2px;
}
```

### 区域标题
```css
.section-title {
    font-size: var(--font-size-2xl);
    font-weight: 600;
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--border-color);
    color: var(--text-color);
    letter-spacing: 0.3px;
}
```

### 底部按钮栏
```css
.button-group {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px;
    background: var(--card-bg);
    border-top: 1px solid var(--border-color);
}
```

---

## 宽度规范总结

### 输入控件宽度
| 控件类型 | 宽度 | 使用场景 |
|---------|------|---------|
| 数字输入框 | 100px | 输入数值、像素值、时间等 |
| 下拉列表 | 200px | 选择选项、样式等 |
| 文本输入框 | 200px | 输入文本、路径等 |

### 布局宽度
| 元素 | 宽度 | 说明 |
|------|------|------|
| 配置项标签 | 180px | grid布局的第一列 |
| 侧边栏 | 30% | 对话框宽度的30% |
| 内容区域 | 70% | 对话框宽度的70% |

---

## 交互状态

### Focus状态
所有可交互元素在获得焦点时：
- 移除默认outline
- 边框颜色变为强调色
- 添加3px的外阴影（rgba格式的强调色，透明度0.1）

### Hover状态
- 按钮：背景色变化 + 轻微上移(translateY(-1px)) + 阴影
- 菜单项：背景色变化
- 关闭按钮：背景色变化 + 缩放(scale(1.05))

### 过渡动画
```css
transition: all 0.2s ease;
```

---

## 最佳实践

### 1. 使用CSS变量
- 优先使用预定义的CSS变量
- 避免硬编码颜色值和字体大小
- 使用相对字体大小变量

### 2. 保持一致性
- 相同类型的控件使用相同的样式
- 统一使用圆角6px
- 统一使用过渡动画

### 3. 可访问性
- 确保足够的对比度
- 提供清晰的focus状态
- 使用合适的字体大小

### 4. 性能优化
- 使用transform代替top/left
- 使用opacity代替visibility
- 合理使用will-change

### 5. 配置项布局规范
- **必须使用 `settings-grid` 容器**包裹配置项，容器有 `gap: 8px` 的间距
- **禁止使用 `setting-row`**，统一使用 `setting-group`
- 所有标签、标题等字体必须使用 `var(--system-font-family)` 和 `var(--system-font-size)` 变量

---

## 更新日志

### v1.1.0 (2024-01-XX)
- 更新侧边栏宽度为30%
- 更新配置项行间距为8px
- 规范化配置项布局，使用settings-grid容器
- 禁止使用setting-row，统一使用setting-group
- 强制使用系统字体变量

### v1.0.0 (2024-01-XX)
- 初始版本
- 定义基础字体系统
- 定义颜色系统
- 定义组件样式规范
- 统一配置页面样式
- 优化行间距和布局

---

## 参考资源

- [Material Design](https://material.io/design)
- [Ant Design](https://ant.design/docs/spec/introduce)
- [Element UI](https://element.eleme.io/#/zh-CN/component/installation)
- [VS Code Design](https://code.visualstudio.com/api/references/vscode-api)
