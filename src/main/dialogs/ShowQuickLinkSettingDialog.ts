/**
 * 快速链接设置对话框
 * 用于管理NaviTab中的快速链接配置
 */

import { BrowserWindow, ipcMain } from 'electron'
import { JSDOM } from 'jsdom'
import {
    getQuickLinks,
    saveQuickLinks,
    QuickLinkItem,
    resetToDefault
} from '../config/quick-link-config'
import { getCurrentThemeStyles } from '../config'
import { windowManager } from '../config/window-manager'
import { createDialogOptions } from './dialog-defaults'

/**
 * 显示快速链接设置对话框
 */
export function ShowQuickLinkSettingDialog() {
    const existing = windowManager.getWindowByType('quick-link-setting-dialog')
    if (existing) {
        existing.focus()
        return
    }

    const quickLinkSettingDialog = windowManager.createWindow('quick-link-setting-dialog', createDialogOptions({
        width: 900,
        height: 600,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '快速链接设置'
    }), 'quick-link-setting-dialog', true)

    quickLinkSettingDialog.setMenu(null)

    const tempHtml = makeQuickLinkSettingDialogHtml()
    quickLinkSettingDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)

    quickLinkSettingDialog.show()

    // 初始化时发送当前配置
    quickLinkSettingDialog.webContents.on('did-finish-load', () => {
        const links = getQuickLinks()
        quickLinkSettingDialog?.webContents.send('baize-notes:init-quick-links', links)
        const theme = getCurrentThemeStyles()
        quickLinkSettingDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    // 保存配置
    function handleSaveQuickLinks(_, links: QuickLinkItem[]) {
        saveQuickLinks(links)
        quickLinkSettingDialog?.webContents.send('baize-notes:save-success')
        BrowserWindow.getAllWindows().forEach(win => {
            if (win !== windowManager.getWindowByType('quick-link-setting-dialog')) {
                win.webContents.send('baize-notes:quick-links-updated')
            }
        })
    }

    // 重置配置
    function handleResetQuickLinks() {
        resetToDefault()
        const links = getQuickLinks()
        quickLinkSettingDialog?.webContents.send('baize-notes:init-quick-links', links)
        BrowserWindow.getAllWindows().forEach(win => {
            if (win !== windowManager.getWindowByType('quick-link-setting-dialog')) {
                win.webContents.send('baize-notes:quick-links-updated')
            }
        })
    }

    ipcMain.on('baize-notes:save-quick-links', handleSaveQuickLinks)
    ipcMain.on('baize-notes:reset-quick-links', handleResetQuickLinks)
}

/**
 * 生成快速链接设置对话框HTML
 */
function makeQuickLinkSettingDialogHtml(): string {
    const { document } = new JSDOM(
        `<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <title>快速链接设置</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }

        html, body {
            height: 100%;
            overflow: hidden;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: var(--bg-color);
            color: var(--text-color);
        }

        :root {
            --bg-color: #f5f5f5;
            --card-bg: #ffffff;
            --text-color: #333333;
            --secondary-text-color: #666666;
            --border-color: #e0e0e0;
            --accent-color: #764ba2;
            --hover-bg: #f0e8ff;
            --title-bar-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }

        .app-layout {
            display: flex;
            flex-direction: column;
            height: 100vh;
        }

        /* 标题栏 */
        .title-bar {
            height: 32px;
            background: var(--title-bar-gradient);
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0 10px;
            -webkit-app-region: drag;
            flex-shrink: 0;
        }

        .title-bar-title {
            color: #fff;
            font-size: 13px;
            font-weight: 500;
        }

        .close-btn {
            width: 28px;
            height: 28px;
            border: none;
            background: rgba(255,255,255,0.2);
            border-radius: 50%;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 14px;
            color: #fff;
            transition: all 0.2s;
            -webkit-app-region: no-drag;
        }

        .close-btn:hover {
            background: rgba(255,100,100,0.9);
        }

        /* 主内容区 */
        .main-content {
            flex: 1;
            overflow-y: auto;
            padding: 16px;
            min-height: 0;
        }

        .container {
            background: var(--card-bg);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            padding: 16px;
            border: 1px solid var(--border-color);
        }

        h2 {
            color: var(--text-color);
            margin-bottom: 16px;
            font-size: 18px;
            border-bottom: 2px solid var(--accent-color);
            padding-bottom: 8px;
        }

        /* 工具栏 */
        .toolbar {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
            padding: 8px;
            background: var(--bg-color);
            border-radius: 4px;
            flex-wrap: wrap;
        }

        button {
            padding: 6px 14px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            font-size: 13px;
            transition: all 0.2s;
            white-space: nowrap;
        }

        button:hover {
            background: var(--hover-bg);
            border-color: var(--accent-color);
        }

        button.primary {
            background: var(--accent-color);
            color: var(--card-bg);
            border-color: var(--accent-color);
        }

        button.primary:hover {
            opacity: 0.9;
        }

        button.danger {
            background: #d73a49;
            color: white;
            border-color: #d73a49;
        }

        button.danger:hover {
            background: #cb2431;
        }

        /* 链接列表 */
        .links-list {
            border: 1px solid var(--border-color);
            border-radius: 4px;
        }

        .link-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            border-bottom: 1px solid var(--border-color);
            gap: 10px;
            transition: background 0.2s;
        }

        .link-item:last-child {
            border-bottom: none;
        }

        .link-item:hover {
            background: var(--hover-bg);
        }

        .link-item.disabled {
            opacity: 0.5;
        }

        .link-icon {
            width: 32px;
            height: 32px;
            flex-shrink: 0;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .link-icon img {
            max-width: 100%;
            max-height: 100%;
        }

        .link-icon svg {
            width: 24px;
            height: 24px;
        }

        .link-info {
            flex: 1;
            min-width: 0;
        }

        .link-name {
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 2px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .link-path {
            font-size: 12px;
            color: var(--secondary-text-color);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        /* 位置选择 */
        .field-position {
            width: 80px;
            flex-shrink: 0;
            padding: 4px 6px;
            border: 1px solid var(--border-color);
            border-radius: 3px;
            font-size: 12px;
            background: var(--card-bg);
            color: var(--text-color);
            outline: none;
        }

        .field-position:focus {
            border-color: var(--accent-color);
        }

        /* 启用开关 */
        .toggle-switch {
            position: relative;
            width: 36px;
            height: 20px;
            flex-shrink: 0;
        }

        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }

        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0; left: 0; right: 0; bottom: 0;
            background-color: #ccc;
            border-radius: 20px;
            transition: 0.3s;
        }

        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 16px;
            width: 16px;
            left: 2px;
            bottom: 2px;
            background-color: white;
            border-radius: 50%;
            transition: 0.3s;
        }

        .toggle-switch input:checked + .toggle-slider {
            background-color: var(--accent-color);
        }

        .toggle-switch input:checked + .toggle-slider:before {
            transform: translateX(16px);
        }

        /* 操作按钮组 */
        .link-actions {
            display: flex;
            gap: 4px;
            flex-shrink: 0;
        }

        .link-actions button {
            padding: 3px 8px;
            font-size: 12px;
        }

        /* 编辑表单（弹出） */
        .edit-form {
            display: none;
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(0,0,0,0.5);
            z-index: 1000;
            align-items: center;
            justify-content: center;
        }

        .edit-form.active {
            display: flex;
        }

        .edit-form-content {
            background: var(--card-bg);
            padding: 24px;
            border-radius: 8px;
            width: 700px;
            max-height: 85vh;
            overflow-y: auto;
            border: 1px solid var(--border-color);
        }

        .edit-form-content h3 {
            color: var(--text-color);
            margin-bottom: 16px;
        }

        .form-group {
            margin-bottom: 12px;
        }

        .form-group label {
            display: block;
            margin-bottom: 4px;
            font-size: 13px;
            color: var(--secondary-text-color);
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 8px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 14px;
            background: var(--card-bg);
            color: var(--text-color);
        }

        .form-group textarea {
            min-height: 120px;
            font-family: monospace;
            font-size: 13px;
        }

        .form-row {
            display: flex;
            gap: 16px;
            margin-bottom: 12px;
        }

        .form-row .form-group {
            flex: 1;
            margin-bottom: 0;
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .checkbox-group input[type="checkbox"] {
            width: auto;
        }

        .form-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 16px;
        }

        /* 底部按钮栏 */
        .footer-bar {
            flex-shrink: 0;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            padding: 12px 16px;
            background: var(--card-bg);
            border-top: 1px solid var(--border-color);
        }

        .footer-bar button {
            padding: 8px 24px;
            font-size: 14px;
        }

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--secondary-text-color);
        }

        /* 提示消息 */
        .toast {
            position: fixed;
            bottom: 60px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--accent-color);
            color: var(--card-bg);
            padding: 10px 20px;
            border-radius: 4px;
            opacity: 0;
            transition: opacity 0.3s;
            z-index: 2000;
        }

        .toast.show {
            opacity: 1;
        }
    </style>
</head>
<body>
    <div class="app-layout">
        <div class="title-bar">
            <span class="title-bar-title">快速链接设置</span>
            <button class="close-btn" onclick="closeDialog()">✕</button>
        </div>
        <div class="main-content">
            <div class="container">
                <h2>快速链接配置</h2>
                <div class="toolbar">
                    <button class="primary" onclick="showAddForm()">+ 添加链接</button>
                    <button onclick="resetToDefault()">重置为默认</button>
                </div>
                <div class="links-list" id="linksList">
                </div>
            </div>
        </div>
        <div class="footer-bar">
            <button onclick="closeDialog()">关闭</button>
            <button class="primary" onclick="applyConfig()">应用</button>
            <button class="primary" onclick="confirmAndClose()">确定</button>
        </div>
    </div>

    <!-- 编辑表单（弹出） -->
    <div class="edit-form" id="editForm">
        <div class="edit-form-content">
            <h3 id="formTitle">添加快速链接</h3>
            <div class="form-row">
                <div class="form-group">
                    <label>名称 *</label>
                    <input type="text" id="linkName" placeholder="例如: QQ">
                </div>
                <div class="form-group">
                    <label>类型 *</label>
                    <select id="linkType">
                        <option value="url">网页链接</option>
                        <option value="exe">本地程序</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>路径 *</label>
                <input type="text" id="linkPath" placeholder="URL地址或本地程序路径">
            </div>
            <div class="form-group">
                <label>图标类型 *</label>
                <select id="iconType">
                    <option value="svg">SVG代码</option>
                    <option value="img">图片URL</option>
                    <option value="emoji">Emoji</option>
                    <option value="text">文字(1-2字)</option>
                </select>
            </div>
            <div class="form-group">
                <label>图标内容 *</label>
                <textarea id="iconContent" placeholder="SVG代码、图片URL、Emoji或文字(1-2字)"></textarea>
            </div>
            <div class="form-actions">
                <button onclick="hideEditForm()">取消</button>
                <button class="primary" onclick="saveLink()">保存</button>
            </div>
        </div>
    </div>

    <!-- 提示消息 -->
    <div class="toast" id="toast">保存成功!</div>

    <script>
        const ipcRenderer = window.electronAPI.ipcRenderer

        function initThemeStyles(theme) {
            document.documentElement.style.setProperty('--bg-color', theme.backgroundColor)
            document.documentElement.style.setProperty('--card-bg', theme.cardBackground)
            document.documentElement.style.setProperty('--text-color', theme.textColor)
            document.documentElement.style.setProperty('--secondary-text-color', theme.secondaryTextColor)
            document.documentElement.style.setProperty('--border-color', theme.borderColor)
            document.documentElement.style.setProperty('--accent-color', theme.accentColor)
            document.documentElement.style.setProperty('--hover-bg', theme.hoverBackground)
            document.documentElement.style.setProperty('--title-bar-gradient', theme.titleBarGradient)
        }

        ipcRenderer.on('baize-notes:init-theme-styles', (event, theme) => {
            initThemeStyles(theme)
        })

        ipcRenderer.on('baize-notes:theme-updated', () => {
            location.reload()
        })

        let currentLinks = []
        let editingId = null

        ipcRenderer.on('baize-notes:init-quick-links', (event, links) => {
            currentLinks = links
            renderLinksList()
        })

        ipcRenderer.on('baize-notes:save-success', () => {
            showToast('保存成功!')
        })

        // 渲染链接列表
        function renderLinksList() {
            const container = document.getElementById('linksList')

            if (currentLinks.length === 0) {
                container.innerHTML = '<div class="empty-state">暂无快速链接，点击"添加链接"按钮创建</div>'
                return
            }

            container.innerHTML = currentLinks.map((link, index) => \`
                <div class="link-item \${!link.enabled ? 'disabled' : ''}" data-id="\${link.id}">
                    <div class="link-icon">
                        \${renderIcon(link)}
                    </div>
                    <div class="link-info">
                        <div class="link-name">\${escapeHtml(link.name)}</div>
                        <div class="link-path">\${escapeHtml(link.path)}</div>
                    </div>
                    <select class="field-position" onchange="updatePosition('\${link.id}', this.value)" title="显示位置">
                        <option value="left" \${link.position !== 'right' ? 'selected' : ''}>左侧</option>
                        <option value="right" \${link.position === 'right' ? 'selected' : ''}>右侧</option>
                    </select>
                    <label class="toggle-switch" title="启用/禁用">
                        <input type="checkbox" \${link.enabled ? 'checked' : ''} onchange="updateEnabled('\${link.id}', this.checked)">
                        <span class="toggle-slider"></span>
                    </label>
                    <div class="link-actions">
                        <button onclick="moveUp(\${index})" \${index === 0 ? 'disabled' : ''} title="上移">↑</button>
                        <button onclick="moveDown(\${index})" \${index === currentLinks.length - 1 ? 'disabled' : ''} title="下移">↓</button>
                        <button onclick="editLink('\${link.id}')" title="编辑">编辑</button>
                        <button class="danger" onclick="deleteLink('\${link.id}')" title="删除">✕</button>
                    </div>
                </div>
            \`).join('')
        }

        function renderIcon(link) {
            if (link.icon === 'svg') {
                return escapeHtml(link.iconContent)
            } else if (link.icon === 'img') {
                return \`<img src="\${escapeHtml(link.iconContent)}" alt="\${escapeHtml(link.name)}">\`
            } else {
                return \`<span style="font-size: 20px;">\${escapeHtml(link.iconContent)}</span>\`
            }
        }

        function escapeHtml(str) {
            return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
        }

        // 列表内快速配置：位置
        function updatePosition(id, value) {
            const link = currentLinks.find(l => l.id === id)
            if (link) link.position = value
        }

        // 列表内快速配置：启用
        function updateEnabled(id, value) {
            const link = currentLinks.find(l => l.id === id)
            if (link) {
                link.enabled = value
                const item = document.querySelector(\`.link-item[data-id="\${id}"]\`)
                if (item) {
                    if (value) item.classList.remove('disabled')
                    else item.classList.add('disabled')
                }
            }
        }

        // 显示添加表单
        function showAddForm() {
            editingId = null
            document.getElementById('formTitle').textContent = '添加快速链接'
            document.getElementById('linkName').value = ''
            document.getElementById('linkType').value = 'url'
            document.getElementById('linkPath').value = ''
            document.getElementById('iconType').value = 'text'
            document.getElementById('iconContent').value = ''
            document.getElementById('editForm').classList.add('active')
        }

        // 编辑链接
        function editLink(id) {
            const link = currentLinks.find(l => l.id === id)
            if (!link) return
            editingId = id
            document.getElementById('formTitle').textContent = '编辑快速链接'
            document.getElementById('linkName').value = link.name
            document.getElementById('linkType').value = link.type
            document.getElementById('linkPath').value = link.path
            document.getElementById('iconType').value = link.icon
            document.getElementById('iconContent').value = link.iconContent
            document.getElementById('editForm').classList.add('active')
        }

        // 隐藏编辑表单
        function hideEditForm() {
            document.getElementById('editForm').classList.remove('active')
        }

        // 保存链接（编辑表单）
        function saveLink() {
            const name = document.getElementById('linkName').value.trim()
            const type = document.getElementById('linkType').value
            const path = document.getElementById('linkPath').value.trim()
            const icon = document.getElementById('iconType').value
            const iconContent = document.getElementById('iconContent').value.trim()

            if (!name || !path || !iconContent) {
                alert('请填写所有必填项!')
                return
            }

            if (editingId) {
                const index = currentLinks.findIndex(l => l.id === editingId)
                if (index !== -1) {
                    currentLinks[index] = {
                        ...currentLinks[index],
                        name, type, path, icon, iconContent
                    }
                }
            } else {
                const newLink = {
                    id: 'link_' + Date.now(),
                    name, type, path, icon, iconContent,
                    enabled: true,
                    order: currentLinks.length + 1,
                    position: 'left'
                }
                currentLinks.push(newLink)
            }

            renderLinksList()
            hideEditForm()
        }

        // 删除链接
        function deleteLink(id) {
            if (!confirm('确定要删除这个快速链接吗?')) return
            currentLinks = currentLinks.filter(l => l.id !== id)
            currentLinks.forEach((link, index) => { link.order = index + 1 })
            renderLinksList()
        }

        // 上移
        function moveUp(index) {
            if (index === 0) return
            const temp = currentLinks[index]
            currentLinks[index] = currentLinks[index - 1]
            currentLinks[index - 1] = temp
            currentLinks.forEach((link, i) => { link.order = i + 1 })
            renderLinksList()
        }

        // 下移
        function moveDown(index) {
            if (index === currentLinks.length - 1) return
            const temp = currentLinks[index]
            currentLinks[index] = currentLinks[index + 1]
            currentLinks[index + 1] = temp
            currentLinks.forEach((link, i) => { link.order = i + 1 })
            renderLinksList()
        }

        // 应用：保存但不关闭对话框
        function applyConfig() {
            ipcRenderer.send('baize-notes:save-quick-links', currentLinks)
        }

        // 确定：保存并关闭对话框
        function confirmAndClose() {
            ipcRenderer.send('baize-notes:save-quick-links', currentLinks)
            setTimeout(() => { window.close() }, 200)
        }

        // 关闭对话框
        function closeDialog() {
            window.close()
        }

        // 重置为默认
        function resetToDefault() {
            if (!confirm('确定要重置为默认配置吗? 这将丢失所有自定义配置!')) return
            ipcRenderer.send('baize-notes:reset-quick-links')
        }

        // 提示消息
        function showToast(message) {
            const toast = document.getElementById('toast')
            toast.textContent = message
            toast.classList.add('show')
            setTimeout(() => { toast.classList.remove('show') }, 2000)
        }
    </script>
</body>
</html>
        `
    ).window

    return document.documentElement.outerHTML
}
