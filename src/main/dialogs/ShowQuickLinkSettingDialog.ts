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
} from '../utils/quick-link-config'
import { getCurrentThemeStyles } from '../themes/theme-config'

let quickLinkSettingDialog: Electron.BrowserWindow | null

/**
 * 显示快速链接设置对话框
 */
export function ShowQuickLinkSettingDialog() {
    quickLinkSettingDialog = new BrowserWindow({
        width: 1100,
        height: 600,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: '快速链接设置',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    quickLinkSettingDialog.setMenu(null)

    const tempHtml = makeQuickLinkSettingDialogHtml()
    quickLinkSettingDialog.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(tempHtml)}`)

    quickLinkSettingDialog.show()

    // 初始化时发送当前配置
    quickLinkSettingDialog.webContents.on('did-finish-load', () => {
        const links = getQuickLinks()
        quickLinkSettingDialog?.webContents.send('baize-notes:init-quick-links', links)
        // 发送当前主题样式
        const theme = getCurrentThemeStyles()
        quickLinkSettingDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    quickLinkSettingDialog.on('closed', () => {
        quickLinkSettingDialog = null
        ipcMain.removeListener('baize-notes:save-quick-links', handleSaveQuickLinks)
        ipcMain.removeListener('baize-notes:reset-quick-links', handleResetQuickLinks)
    })

    // 保存配置
    function handleSaveQuickLinks(_, links: QuickLinkItem[]) {
        saveQuickLinks(links)
        quickLinkSettingDialog?.webContents.send('baize-notes:save-success')
        // 通知所有渲染进程更新快速链接
        BrowserWindow.getAllWindows().forEach(win => {
            if (win !== quickLinkSettingDialog) {
                win.webContents.send('baize-notes:quick-links-updated')
            }
        })
    }

    // 重置配置
    function handleResetQuickLinks() {
        resetToDefault()
        const links = getQuickLinks()
        quickLinkSettingDialog?.webContents.send('baize-notes:init-quick-links', links)
        // 通知所有渲染进程更新快速链接
        BrowserWindow.getAllWindows().forEach(win => {
            if (win !== quickLinkSettingDialog) {
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

        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: var(--bg-color);
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .title-bar {
            width: 100%;
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
            letter-spacing: 0.5px;
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
        
        .main-content {
            flex: 1;
            padding: 20px;
            overflow-y: auto;
        }

        .container {
            max-width: 1050px;
            margin: 0 auto;
            background: var(--card-bg);
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            padding: 20px;
            border: 1px solid var(--border-color);
        }
        
        h2 {
            color: var(--text-color);
            margin-bottom: 20px;
            font-size: 20px;
            border-bottom: 2px solid var(--accent-color);
            padding-bottom: 10px;
        }

        .toolbar {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
            padding: 10px;
            background: var(--bg-color);
            border-radius: 4px;
        }

        button {
            padding: 8px 16px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--card-bg);
            color: var(--text-color);
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
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

        .links-list {
            /* 移除高度限制和滚动条 */
            border: 1px solid var(--border-color);
            border-radius: 4px;
        }

        .link-item {
            display: flex;
            align-items: center;
            padding: 12px;
            border-bottom: 1px solid var(--border-color);
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
            margin-right: 12px;
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
        }

        .link-name {
            font-weight: 600;
            color: var(--text-color);
            margin-bottom: 4px;
        }

        .link-path {
            font-size: 12px;
            color: var(--secondary-text-color);
            word-break: break-all;
        }

        .link-actions {
            display: flex;
            gap: 8px;
        }

        .link-actions button {
            padding: 4px 8px;
            font-size: 12px;
        }

        .edit-form {
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
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
            width: 650px;
            /* 移除滚动条 */
            border: 1px solid var(--border-color);
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-group label {
            display: block;
            margin-bottom: 6px;
            font-weight: 600;
            color: var(--text-color);
        }

        .form-group input,
        .form-group select,
        .form-group textarea {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid var(--border-color);
            border-radius: 4px;
            font-size: 14px;
            background: var(--card-bg);
            color: var(--text-color);
        }

        .form-group textarea {
            min-height: 100px;
            font-family: monospace;
        }

        .form-actions {
            display: flex;
            gap: 10px;
            justify-content: flex-end;
            margin-top: 20px;
        }

        .form-row {
            display: flex;
            gap: 16px;
            margin-bottom: 16px;
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

        .empty-state {
            text-align: center;
            padding: 40px;
            color: var(--secondary-text-color);
        }

        .toast {
            position: fixed;
            bottom: 20px;
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

        @keyframes slideIn {
            from {
                transform: translateX(-20px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
    </style>
</head>
<body>
    <div class="title-bar">
        <span class="title-bar-title">🔗 快速链接设置</span>
        <button class="close-btn" onclick="window.close()">✕</button>
    </div>
    <div class="main-content">
    <div class="container">
        

        <div class="toolbar">
            <button class="primary" onclick="showAddForm()">➕ 添加链接</button>
            <button onclick="resetToDefault()">🔄 重置为默认</button>
            <button class="primary" onclick="saveAll()">💾 保存配置</button>
        </div>

        <div class="links-list" id="linksList">
            <!-- 链接列表将在这里动态生成 -->
        </div>
    </div>

    <!-- 编辑表单 -->
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
                <div class="form-group">
                    <label>图标类型 *</label>
                    <select id="iconType">
                        <option value="svg">SVG代码</option>
                        <option value="img">图片URL</option>
                        <option value="emoji">Emoji</option>
                        <option value="text">文字(1-2字)</option>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label>路径 *</label>
                <input type="text" id="linkPath" placeholder="URL地址或本地程序路径">
            </div>

            <div class="form-group">
                <label>图标内容 *</label>
                <textarea id="iconContent" placeholder="SVG代码、图片URL、Emoji或文字(1-2字)"></textarea>
            </div>

            <div class="form-group">
                <div class="checkbox-group">
                    <input type="checkbox" id="linkEnabled" checked>
                    <label for="linkEnabled">启用</label>
                </div>
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
        const { ipcRenderer } = require('electron')

        // 初始化主题变量
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

        // 监听主题初始化
        ipcRenderer.on('baize-notes:init-theme-styles', (event, theme) => {
            initThemeStyles(theme)
        })

        // 监听主题更新
        ipcRenderer.on('baize-notes:theme-updated', () => {
            location.reload()
        })

        let currentLinks = []
        let editingId = null

        // 初始化
        ipcRenderer.on('baize-notes:init-quick-links', (event, links) => {
            currentLinks = links
            renderLinksList()
        })

        // 保存成功
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
                        <div class="link-name">\${link.name}</div>
                        <div class="link-path">\${link.path}</div>
                    </div>
                    <div class="link-actions">
                        <button onclick="moveUp(\${index})" \${index === 0 ? 'disabled' : ''}>⬆️</button>
                        <button onclick="moveDown(\${index})" \${index === currentLinks.length - 1 ? 'disabled' : ''}>⬇️</button>
                        <button onclick="editLink('\${link.id}')">✏️ 编辑</button>
                        <button class="danger" onclick="deleteLink('\${link.id}')">🗑️ 删除</button>
                    </div>
                </div>
            \`).join('')
        }

        // 渲染图标
        function renderIcon(link) {
            if (link.icon === 'svg') {
                return link.iconContent
            } else if (link.icon === 'img') {
                return \`<img src="\${link.iconContent}" alt="\${link.name}">\`
            } else {
                return \`<span style="font-size: 24px;">\${link.iconContent}</span>\`
            }
        }

        // 显示添加表单
        function showAddForm() {
            editingId = null
            document.getElementById('formTitle').textContent = '添加快速链接'
            document.getElementById('linkName').value = ''
            document.getElementById('linkType').value = 'url'
            document.getElementById('linkPath').value = ''
            document.getElementById('iconType').value = 'svg'
            document.getElementById('iconContent').value = ''
            document.getElementById('linkEnabled').checked = true
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
            document.getElementById('linkEnabled').checked = link.enabled
            document.getElementById('editForm').classList.add('active')
        }

        // 隐藏编辑表单
        function hideEditForm() {
            document.getElementById('editForm').classList.remove('active')
        }

        // 保存链接
        function saveLink() {
            const name = document.getElementById('linkName').value.trim()
            const type = document.getElementById('linkType').value
            const path = document.getElementById('linkPath').value.trim()
            const icon = document.getElementById('iconType').value
            const iconContent = document.getElementById('iconContent').value.trim()
            const enabled = document.getElementById('linkEnabled').checked

            if (!name || !path || !iconContent) {
                alert('请填写所有必填项!')
                return
            }

            if (editingId) {
                // 更新
                const index = currentLinks.findIndex(l => l.id === editingId)
                if (index !== -1) {
                    currentLinks[index] = {
                        ...currentLinks[index],
                        name,
                        type,
                        path,
                        icon,
                        iconContent,
                        enabled
                    }
                }
            } else {
                // 添加
                const newLink = {
                    id: 'link_' + Date.now(),
                    name,
                    type,
                    path,
                    icon,
                    iconContent,
                    enabled,
                    order: currentLinks.length + 1
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
            // 重新排序
            currentLinks.forEach((link, index) => {
                link.order = index + 1
            })
            renderLinksList()
        }

        // 上移
        function moveUp(index) {
            if (index === 0) return
            const temp = currentLinks[index]
            currentLinks[index] = currentLinks[index - 1]
            currentLinks[index - 1] = temp

            // 更新排序
            currentLinks.forEach((link, i) => {
                link.order = i + 1
            })

            renderLinksList()
        }

        // 下移
        function moveDown(index) {
            if (index === currentLinks.length - 1) return
            const temp = currentLinks[index]
            currentLinks[index] = currentLinks[index + 1]
            currentLinks[index + 1] = temp

            // 更新排序
            currentLinks.forEach((link, i) => {
                link.order = i + 1
            })

            renderLinksList()
        }

        // 保存所有配置
        function saveAll() {
            ipcRenderer.send('baize-notes:save-quick-links', currentLinks)
        }

        // 重置为默认
        function resetToDefault() {
            if (!confirm('确定要重置为默认配置吗? 这将丢失所有自定义配置!')) return
            ipcRenderer.send('baize-notes:reset-quick-links')
        }

        // 显示提示消息
        function showToast(message) {
            const toast = document.getElementById('toast')
            toast.textContent = message
            toast.classList.add('show')
            setTimeout(() => {
                toast.classList.remove('show')
            }, 2000)
        }
    </script>
    </div>
</body>
</html>
        `
    ).window

    return document.documentElement.outerHTML
}
