import { describe, expect, it, vi, beforeEach } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const mocks = vi.hoisted(() => ({
    openSelectFile: vi.fn(),
    registerTrustedPath: vi.fn(),
    isPackaged: false
}))

vi.mock('electron', () => ({
    app: {
        get isPackaged() {
            return mocks.isPackaged
        }
    }
}))

vi.mock('../../src/main/utils/file-utils/file-operations', () => ({
    OpenSelectFile: mocks.openSelectFile
}))

vi.mock('../../src/main/utils/security', () => ({
    registerTrustedPath: mocks.registerTrustedPath
}))

import {
    resolveFileAssociationArg,
    openAssociatedFile,
    getStartupAssociationFile
} from '../../src/main/utils/file-open-args'

let tmpDir = ''

beforeEach(async () => {
    vi.clearAllMocks()
    mocks.openSelectFile.mockResolvedValue(undefined)
    mocks.isPackaged = false
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'baize-file-assoc-'))
})

describe('D2 文件关联命令行解析', () => {
    it('从参数中解析存在的 .md/.markdown/.txt 文件', () => {
        const md = path.join(tmpDir, 'note.md')
        const txt = path.join(tmpDir, 'note.txt')
        fs.writeFileSync(md, '# note')
        fs.writeFileSync(txt, 'text')
        expect(resolveFileAssociationArg(['app.exe', '--no-sandbox', md])).toBe(md)
        expect(resolveFileAssociationArg(['app.exe', txt])).toBe(txt)
        expect(resolveFileAssociationArg(['app.exe', path.join(tmpDir, 'missing.md')])).toBeNull()
        expect(resolveFileAssociationArg(['app.exe', tmpDir])).toBeNull()
        expect(resolveFileAssociationArg(['app.exe', path.join(tmpDir, 'file.exe')])).toBeNull()
    })

    it('packaged 模式跳过可执行文件参数', () => {
        const md = path.join(tmpDir, 'note.md')
        fs.writeFileSync(md, '# note')
        expect(getStartupAssociationFile(['app.exe', md], true)).toBe(md)
        expect(getStartupAssociationFile(['electron.exe', '.', '--foo', md], false)).toBe(md)
    })

    it('openAssociatedFile 登记受信路径并复用 OpenSelectFile', async () => {
        const md = path.join(tmpDir, 'note.md')
        fs.writeFileSync(md, '# note')
        await expect(openAssociatedFile(md)).resolves.toBe(true)
        expect(mocks.registerTrustedPath).toHaveBeenCalledWith(md)
        expect(mocks.openSelectFile).toHaveBeenCalledWith({
            name: 'note.md',
            path: md,
            type: 'file'
        })
        await expect(openAssociatedFile(null)).resolves.toBe(false)
        await expect(openAssociatedFile(path.join(tmpDir, 'missing.md'))).resolves.toBe(false)
    })

    it('openAssociatedFile 拒绝非白名单扩展名/目录/读取失败', async () => {
        const png = path.join(tmpDir, 'image.png')
        fs.writeFileSync(png, 'png')
        await expect(openAssociatedFile(png)).resolves.toBe(false)
        const directoryLikeFile = path.join(tmpDir, 'folder.md')
        fs.mkdirSync(directoryLikeFile)
        await expect(openAssociatedFile(directoryLikeFile)).resolves.toBe(false)

        const md = path.join(tmpDir, 'note.md')
        fs.writeFileSync(md, '# note')
        mocks.openSelectFile.mockRejectedValueOnce(new Error('read failed'))
        await expect(openAssociatedFile(md)).resolves.toBe(false)
    })

    it('非数组 argv 安全返回 null', () => {
        expect(resolveFileAssociationArg(undefined as unknown as string[])).toBeNull()
    })
})
