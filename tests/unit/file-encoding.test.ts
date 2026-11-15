import { describe, it, expect, vi } from 'vitest'

// CMP-30：file-operations 经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// file-operations 的依赖链需要 mock：electron（含 app.getPath，避免写真实日志/用户目录）、
// electron-store、logger（其模块顶层会 new Logger() 并创建日志文件）
const mocks = vi.hoisted(() => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- vi.hoisted 块先于静态 import 执行，必须用 require 同步加载 os 模块
    const os = require('os') as typeof import('os')
    return {
        app: {
            getPath: (name: string) => (name === 'home' ? os.tmpdir() : 'C:/fake-app')
        }
    }
})

vi.mock('electron', () => ({
    app: mocks.app,
    BrowserWindow: class MockBrowserWindow {},
    shell: {},
    dialog: {}
}))

vi.mock('electron-store', () => ({
    default: class MockStore {
        get() {
            return null
        }
        set() {
            /* 无操作 */
        }
    }
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: {
        info: () => {},
        warn: () => {},
        error: () => {},
        setMainWindow: () => {}
    }
}))

import {
    normalizeEncoding,
    decodeFileContent,
    encodeFileContent
} from '../../src/main/utils/file-utils/file-operations'
import * as iconv from 'iconv-lite'

// D-4/FUN-02：文件编码探测与按原编码回写测试
describe('文件编码探测与回写', () => {
    describe('normalizeEncoding 编码名归一化', () => {
        it('GB2312/GBK/GB18030 归一化为 gbk', () => {
            expect(normalizeEncoding('GB2312')).toBe('gbk')
            expect(normalizeEncoding('GBK')).toBe('gbk')
            expect(normalizeEncoding('GB18030')).toBe('gbk')
        })

        it('ascii/UTF-8 归一化为 utf-8', () => {
            expect(normalizeEncoding('ascii')).toBe('utf-8')
            expect(normalizeEncoding('UTF-8')).toBe('utf-8')
        })

        it('未识别的编码保守回退 utf-8', () => {
            expect(normalizeEncoding('unknown-encoding')).toBe('utf-8')
            expect(normalizeEncoding(null)).toBe('utf-8')
            expect(normalizeEncoding(undefined)).toBe('utf-8')
            expect(normalizeEncoding('')).toBe('utf-8')
        })
    })

    describe('decodeFileContent 探测解码', () => {
        it('UTF-8 无 BOM 内容按 utf-8 解码', () => {
            const buffer = Buffer.from('hello 世界', 'utf8')
            const { content, encoding } = decodeFileContent(buffer)
            expect(encoding).toBe('utf-8')
            expect(content).toBe('hello 世界')
        })

        it('UTF-8 BOM 被剥除', () => {
            const buffer = Buffer.concat([
                Buffer.from([0xef, 0xbb, 0xbf]),
                Buffer.from('hello', 'utf8')
            ])
            const { content, encoding } = decodeFileContent(buffer)
            expect(encoding).toBe('utf-8')
            expect(content).toBe('hello')
        })

        it('GBK 字节被探测并按 gbk 解码为中文原文', () => {
            const text = '这是一段用于测试编码探测的中文文本，包含标点符号与数字 123456。'
            const gbkBytes = iconv.encode(text, 'gbk')
            const { content, encoding } = decodeFileContent(gbkBytes)
            expect(encoding).toBe('gbk')
            expect(content).toBe(text)
        })

        it('UTF-16 LE BOM 被正确识别解码', () => {
            const payload = iconv.encode('hello world', 'utf-16le')
            const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), payload])
            const { content, encoding } = decodeFileContent(buffer)
            expect(encoding).toBe('utf-16le')
            expect(content).toBe('hello world')
        })

        it('空文件解码为空字符串且编码 utf-8', () => {
            const { content, encoding } = decodeFileContent(Buffer.alloc(0))
            expect(encoding).toBe('utf-8')
            expect(content).toBe('')
        })
    })

    describe('encodeFileContent 按编码回写', () => {
        it('utf-8 写回不带 BOM', () => {
            const buffer = encodeFileContent('hello', 'utf-8')
            expect(buffer[0]).not.toBe(0xef)
            expect(buffer.toString('utf8')).toBe('hello')
        })

        it('gbk 写回字节与 iconv 一致', () => {
            const text = '中文编码回写测试'
            const buffer = encodeFileContent(text, 'gbk')
            expect(buffer.equals(iconv.encode(text, 'gbk'))).toBe(true)
        })

        it('gbk 写回后可按 gbk 解码还原（往返一致）', () => {
            // 使用足够长的中文文本，保证 jschardet 探测结果稳定为 GBK/GB2312
            const text =
                '往返测试：编码探测与回写一致性校验，这是一段较长的中文说明文字，用于避免短文本探测抖动。'
            const { content, encoding } = decodeFileContent(encodeFileContent(text, 'gbk'))
            expect(encoding).toBe('gbk')
            expect(content).toBe(text)
        })

        it('未识别编码回退 utf-8 写回', () => {
            const buffer = encodeFileContent('hello', 'unknown-encoding')
            expect(buffer.toString('utf8')).toBe('hello')
        })
    })
})
