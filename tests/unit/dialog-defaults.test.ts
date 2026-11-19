import { describe, it, expect, vi, beforeEach } from 'vitest'

// CQ-06：notifyReloadDirFromDisk 通过动态 import 惰性加载文件工具模块，
// 此处 mock 掉真实 file-utils 依赖链（避免 electron-store/logger 在纯 node 测试环境实例化）
const fileOpsMocks = vi.hoisted(() => ({
    ReloadDirFromDisk: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/file-operations', () => fileOpsMocks)

// 新增的 createDialogHtmlUrl/loadDialogHtml 不依赖 electron API，
// loadDialogHtml 只需一个带 loadURL 的窗口桩
import {
    DIALOG_WEB_PREFERENCES,
    createDialogOptions,
    createDialogHtmlUrl,
    loadDialogHtml,
    getJSDOM,
    createJSDOM,
    notifyReloadDirFromDisk
} from '../../src/main/dialogs/dialog-defaults'

describe('DIALOG_WEB_PREFERENCES', () => {
    it('should disable nodeIntegration and enable contextIsolation', () => {
        expect(DIALOG_WEB_PREFERENCES.nodeIntegration).toBe(false)
        expect(DIALOG_WEB_PREFERENCES.contextIsolation).toBe(true)
    })

    it('should enable sandbox for dialog windows', () => {
        expect(DIALOG_WEB_PREFERENCES.sandbox).toBe(true)
    })

    it('should point preload to the dialog preload script', () => {
        expect(DIALOG_WEB_PREFERENCES.preload).toContain('preload')
        expect(DIALOG_WEB_PREFERENCES.preload).toContain('dialog')
    })
})

describe('createDialogOptions', () => {
    it('should use frameless window and hide menu bar by default', () => {
        const options = createDialogOptions()
        expect(options.frame).toBe(false)
        expect(options.autoHideMenuBar).toBe(true)
    })

    it('should merge width/height overrides', () => {
        const options = createDialogOptions({ width: 800, height: 600 })
        expect(options.width).toBe(800)
        expect(options.height).toBe(600)
        expect(options.frame).toBe(false)
    })

    it('should merge webPreferences while keeping dialog defaults', () => {
        const options = createDialogOptions({ webPreferences: { sandbox: false } })
        expect(options.webPreferences?.sandbox).toBe(false)
        expect(options.webPreferences?.nodeIntegration).toBe(false)
        expect(options.webPreferences?.contextIsolation).toBe(true)
        expect(options.webPreferences?.preload).toBe(DIALOG_WEB_PREFERENCES.preload)
    })

    it('should keep extra overrides like title and minimizable', () => {
        const options = createDialogOptions({
            title: '测试',
            minimizable: false,
            maximizable: false
        })
        expect(options.title).toBe('测试')
        expect(options.minimizable).toBe(false)
        expect(options.maximizable).toBe(false)
    })
})

describe('createDialogHtmlUrl', () => {
    it('should wrap html into a data url with utf-8 charset (含 CSP 注入)', () => {
        const url = createDialogHtmlUrl('<html><body>你好</body></html>')
        expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true)
        const payload = url.substring(url.indexOf(',') + 1)
        const decoded = decodeURIComponent(payload)
        // 2026-11-19（P3）：对话框 HTML 注入严格 CSP，原文保留在页面体内
        expect(decoded).toContain('<body>你好</body>')
        expect(decoded).toContain('Content-Security-Policy')
        expect(decoded).toContain("default-src 'none'")
        expect(decoded).toContain("connect-src 'none'")
    })

    it('should percent-encode special characters in html', () => {
        const url = createDialogHtmlUrl('<div class="a b">#100%</div>')
        // 空格、引号与 # 等必须被编码，避免 data URL 提前结束
        expect(url).not.toContain('<div class="a b">')
        expect(url).toContain('%20')
        expect(decodeURIComponent(url.substring(url.indexOf(',') + 1))).toContain(
            '<div class="a b">#100%</div>'
        )
    })

    it('should keep existing CSP untouched', () => {
        const html =
            '<html><head><meta http-equiv="Content-Security-Policy" content="default-src \'self\'"></head><body>x</body></html>'
        const decoded = decodeURIComponent(
            createDialogHtmlUrl(html).substring(createDialogHtmlUrl(html).indexOf(',') + 1)
        )
        expect(decoded).toBe(html)
    })
})

describe('loadDialogHtml', () => {
    it('should load the data url through window.loadURL', async () => {
        const loadURL = vi.fn().mockResolvedValue(undefined)
        const win = { loadURL }
        await loadDialogHtml(win as never, '<p>内容</p>')
        expect(loadURL).toHaveBeenCalledTimes(1)
        const url = loadURL.mock.calls[0][0] as string
        expect(url.startsWith('data:text/html;charset=utf-8,')).toBe(true)
        expect(decodeURIComponent(url.substring(url.indexOf(',') + 1))).toContain('<p>内容</p>')
    })
})

// PF-07：jsdom 惰性加载与模块缓存复用
describe('getJSDOM / createJSDOM', () => {
    it('should cache the jsdom module across calls', () => {
        const first = getJSDOM()
        const second = getJSDOM()
        expect(first).toBe(second)
        expect(typeof first.JSDOM).toBe('function')
    })

    it('should create a JSDOM instance that parses html synchronously', () => {
        const dom = createJSDOM(
            '<!DOCTYPE html><html><body><span id="r3">白泽</span></body></html>'
        )
        expect(dom.window.document.getElementById('r3')?.textContent).toBe('白泽')
        dom.window.close()
    })
})

// CQ-06：延迟刷新资源管理器公共函数
describe('notifyReloadDirFromDisk', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        fileOpsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
    })

    it('should defer reload by delay and resolve after reload finishes', async () => {
        vi.useFakeTimers()
        try {
            const pending = notifyReloadDirFromDisk(500)
            expect(fileOpsMocks.ReloadDirFromDisk).not.toHaveBeenCalled()
            await vi.advanceTimersByTimeAsync(500)
            await pending
            expect(fileOpsMocks.ReloadDirFromDisk).toHaveBeenCalledTimes(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('should swallow reload errors, log them and still resolve', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        try {
            fileOpsMocks.ReloadDirFromDisk.mockRejectedValueOnce(new Error('磁盘繁忙'))
            await expect(notifyReloadDirFromDisk(0)).resolves.toBeUndefined()
            expect(fileOpsMocks.ReloadDirFromDisk).toHaveBeenCalledTimes(1)
            expect(errorSpy).toHaveBeenCalled()
        } finally {
            errorSpy.mockRestore()
        }
    })
})
