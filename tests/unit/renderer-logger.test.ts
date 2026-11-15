/**
 * 渲染层统一日志封装（CQ-10）单元测试
 *
 * 覆盖：
 * 1. 开发/测试模式：debug/info/log 正常输出（带级别前缀，便于过滤）；
 * 2. warn/error：参数原样透传（既有组件测试对 console 的断言依赖该语义）；
 * 3. 生产静默：`import.meta.env.PROD === true` 时 debug/info/log 不输出。
 *
 * 说明：vitest 运行在非生产模式（import.meta.env.PROD=false），
 * 生产分支通过临时改写 import.meta.env.PROD 模拟。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { logger } from '../../src/renderer/src/common/logger'

/** 临时改写 import.meta.env.PROD（Vite 注入对象在测试环境可写） */
function setProd(value: boolean): void {
    ;(import.meta.env as unknown as Record<string, unknown>).PROD = value
}

afterEach(() => {
    setProd(false)
    vi.restoreAllMocks()
})

describe('renderer logger（CQ-10）', () => {
    it('开发模式下 debug/info/log 输出且带级别前缀', () => {
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

        logger.debug('调试信息')
        logger.info('普通信息')
        logger.log('日志')

        expect(debugSpy).toHaveBeenCalledWith('[Renderer][DEBUG]', '调试信息')
        expect(infoSpy).toHaveBeenCalledWith('[Renderer][INFO]', '普通信息')
        expect(logSpy).toHaveBeenCalledWith('[Renderer]', '日志')
    })

    it('warn/error 参数原样透传（不额外加前缀，保证既有断言与日志检索习惯）', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const err = new Error('boom')

        logger.warn('未知的配置项: key')
        logger.error('加载 HTML 文件失败:', err)

        expect(warnSpy).toHaveBeenCalledWith('未知的配置项: key')
        expect(errorSpy).toHaveBeenCalledWith('加载 HTML 文件失败:', err)
    })

    it('生产模式静默 debug/info/log，但保留 warn/error', () => {
        setProd(true)
        const debugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {})
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})
        const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

        logger.debug('d')
        logger.info('i')
        logger.log('l')
        logger.warn('w')
        logger.error('e')

        expect(debugSpy).not.toHaveBeenCalled()
        expect(infoSpy).not.toHaveBeenCalled()
        expect(logSpy).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith('w')
        expect(errorSpy).toHaveBeenCalledWith('e')
    })
})
