// @vitest-environment jsdom
/**
 * 文件打开协调器测试：
 * - 无草稿：直接发送 OPEN_SELECT_FILE；
 * - 有草稿：保存 / 不保存 / 取消三条路径；
 * - 保存取消或失败时不得打开目标文件，草稿保留。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'
import type { FileProperties } from '../../src/shared/types'

const promptMock = vi.hoisted(() => vi.fn())

vi.mock('@renderer/components/Markdown/untitled-draft-prompt', () => ({
    showUntitledDraftPrompt: promptMock
}))

import {
    requestOpenFile,
    saveUntitledDraftAs
} from '@renderer/components/Markdown/request-open-file'
import {
    readUntitledDraft,
    resetUntitledDraftForTesting,
    writeUntitledDraft
} from '@renderer/components/Markdown/untitled-draft'

const TARGET: FileProperties = {
    name: '目标.md',
    path: 'D:/notes/目标.md',
    type: 'file',
    content: ''
}

describe('requestOpenFile 未命名草稿保护', () => {
    let send: ReturnType<typeof vi.fn>
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        resetUntitledDraftForTesting()
        promptMock.mockReset()
        send = vi.fn()
        invoke = vi.fn()
        vi.stubGlobal('electron', { ipcRenderer: { send, invoke } })
    })

    afterEach(() => {
        resetUntitledDraftForTesting()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('无草稿时直接打开文件，不弹确认框', async () => {
        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(true)
        expect(promptMock).not.toHaveBeenCalled()
        expect(send).toHaveBeenCalledWith(IPC.FILE.OPEN_SELECT_FILE, TARGET)
    })

    it('取消时保持草稿且不打开目标文件', async () => {
        writeUntitledDraft('未命名草稿')
        promptMock.mockResolvedValue('cancel')

        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(false)
        expect(send).not.toHaveBeenCalled()
        expect(readUntitledDraft()).toBe('未命名草稿')
    })

    it('选择不保存时清空草稿并打开目标文件', async () => {
        writeUntitledDraft('未命名草稿')
        promptMock.mockResolvedValue('discard')

        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(true)
        expect(readUntitledDraft()).toBe('')
        expect(send).toHaveBeenCalledWith(IPC.FILE.OPEN_SELECT_FILE, TARGET)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('选择保存且另存成功后清空草稿并打开目标文件', async () => {
        writeUntitledDraft('要保存的草稿')
        promptMock.mockResolvedValue('save')
        invoke.mockResolvedValueOnce({ success: true, filePath: 'D:/notes/草稿.md' })

        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(true)
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.IMPORT_NEW_FILE, '要保存的草稿')
        expect(readUntitledDraft()).toBe('')
        expect(send).toHaveBeenCalledWith(IPC.FILE.OPEN_SELECT_FILE, TARGET)
    })

    it('另存为被取消时保留草稿且不打开目标文件', async () => {
        writeUntitledDraft('要保存的草稿')
        promptMock.mockResolvedValue('save')
        invoke.mockResolvedValueOnce({ success: false })

        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(false)
        expect(send).not.toHaveBeenCalled()
        expect(readUntitledDraft()).toBe('要保存的草稿')
    })

    it('另存为抛错时保留草稿且不打开目标文件', async () => {
        writeUntitledDraft('要保存的草稿')
        promptMock.mockResolvedValue('save')
        invoke.mockRejectedValueOnce(new Error('磁盘只读'))

        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(false)
        expect(send).not.toHaveBeenCalled()
        expect(readUntitledDraft()).toBe('要保存的草稿')
    })

    it('无 preload 环境时安全返回 false', async () => {
        vi.stubGlobal('electron', undefined)

        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(false)
        expect(send).not.toHaveBeenCalled()
    })

    it('发送打开请求抛错时返回 false', async () => {
        send.mockImplementationOnce(() => {
            throw new Error('ipc down')
        })

        const opened = await requestOpenFile(TARGET)

        expect(opened).toBe(false)
    })

    it('空草稿不触发另存为', async () => {
        await expect(saveUntitledDraftAs('')).resolves.toBe(false)
        expect(invoke).not.toHaveBeenCalled()
    })

    it('preload 不提供 invoke 时另存为安全失败', async () => {
        vi.stubGlobal('electron', { ipcRenderer: { send } })
        writeUntitledDraft('草稿内容')

        await expect(saveUntitledDraftAs()).resolves.toBe(false)
        expect(send).not.toHaveBeenCalled()
    })
})
