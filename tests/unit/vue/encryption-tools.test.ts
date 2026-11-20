// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import CryptoJS from 'crypto-js'
import { setLocale, t } from '@renderer/common/i18n'

import TokenGenerator from '@renderer/components/PluginTools/Encryption/TokenGenerator.vue'
import RSAGenerator from '@renderer/components/PluginTools/Encryption/RSAGenerator.vue'
import EncryptDecrypt from '@renderer/components/PluginTools/Encryption/EncryptDecrypt.vue'
import CryptoEncDec from '@renderer/components/PluginTools/Encryption/CryptoEncDec.vue'
import UUIDSGenerator from '@renderer/components/PluginTools/Encryption/UUIDSGenerator.vue'
import ULIDGenerator from '@renderer/components/PluginTools/Encryption/ULIDGenerator.vue'
import HashText from '@renderer/components/PluginTools/Encryption/HashText.vue'
import HmacGenerator from '@renderer/components/PluginTools/Encryption/HmacGenerator.vue'

// jsdom 未实现 navigator.clipboard，统一注入 mock
function installClipboardMock() {
    const writeText = vi.fn()
    Object.defineProperty(window.navigator, 'clipboard', {
        value: { writeText },
        configurable: true
    })
    return writeText
}

describe('TokenGenerator', () => {
    afterEach(() => {
        vi.restoreAllMocks()
        document.body.innerHTML = ''
    })

    function mountToken() {
        // 组件通过 document.getElementById('token-output') 写结果，必须挂到真实 DOM
        return mount(TokenGenerator, { attachTo: document.body })
    }

    function getOutput(): string {
        const el = document.getElementById('token-output')
        return el ? (el.textContent ?? '') : ''
    }

    it('renders title and four character type checkboxes with default selections', () => {
        const wrapper = mountToken()
        expect(wrapper.find('h1').text()).toBe(t('toolsConvert.token.title'))
        const boxes = wrapper.findAll('input[type="checkbox"]')
        expect(boxes).toHaveLength(4)
        // findAll 的 element 静态类型是 Element，勾选状态需按 HTMLInputElement 读取
        expect((boxes[0].element as HTMLInputElement).checked).toBe(true) // 大写
        expect((boxes[1].element as HTMLInputElement).checked).toBe(true) // 小写
        expect((boxes[2].element as HTMLInputElement).checked).toBe(true) // 数字
        expect((boxes[3].element as HTMLInputElement).checked).toBe(false) // 符号
        wrapper.unmount()
    })

    it('generates a 64-character token using only the selected charsets', async () => {
        const wrapper = mountToken()
        await wrapper.find('#token-generator').trigger('click')
        const output = getOutput()
        expect(output).toHaveLength(64)
        expect(output).toMatch(/^[A-Za-z0-9]{64}$/)
        wrapper.unmount()
    })

    it('respects the token length entered by the user', async () => {
        const wrapper = mountToken()
        await wrapper.find('#text-token-length').setValue(10)
        await wrapper.find('#token-generator').trigger('click')
        expect(getOutput()).toHaveLength(10)
        wrapper.unmount()
    })

    it('falls back to uppercase charset when no character type is selected', async () => {
        const wrapper = mountToken()
        for (const box of wrapper.findAll('input[type="checkbox"]')) {
            await box.setValue(false)
        }
        await wrapper.find('#token-generator').trigger('click')
        expect(getOutput()).toMatch(/^[A-Z]{64}$/)
        wrapper.unmount()
    })

    it('includes symbols when the symbol checkbox is enabled', async () => {
        const wrapper = mountToken()
        // 只勾选符号，其余全部取消
        const boxes = wrapper.findAll('input[type="checkbox"]')
        for (let i = 0; i < boxes.length; i++) {
            await boxes[i].setValue(i === 3)
        }
        await wrapper.find('#token-generator').trigger('click')
        expect(getOutput()).toMatch(/^[!@#$%^&*()_+{}:<>?[\]\\|~]{64}$/)
        wrapper.unmount()
    })

    it('clears the generated token when clicking the clear button', async () => {
        const wrapper = mountToken()
        await wrapper.find('#token-generator').trigger('click')
        expect(getOutput()).toHaveLength(64)
        await wrapper.find('#token-clear').trigger('click')
        expect(getOutput()).toBe('')
        wrapper.unmount()
    })

    it('regenerates a different token when clicking the refresh button', async () => {
        const wrapper = mountToken()
        await wrapper.find('#token-generator').trigger('click')
        const first = getOutput()
        await wrapper.find('#token-refresh').trigger('click')
        const second = getOutput()
        expect(second).toHaveLength(64)
        expect(second).not.toBe(first)
        wrapper.unmount()
    })
})

describe('RSAGenerator', () => {
    let ipcRenderer: {
        send: ReturnType<typeof vi.fn>
        on: ReturnType<typeof vi.fn>
        removeListener: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
        ipcRenderer = { send: vi.fn(), on: vi.fn(), removeListener: vi.fn() }
        vi.stubGlobal('electron', { ipcRenderer })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders default 2048 bits and computed textarea widths', () => {
        const wrapper = mount(RSAGenerator, { props: { workAreaWidth: '1000px' } })
        expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe(
            '2048'
        )
        const textareas = wrapper.findAll('textarea')
        // 宽度 = workAreaWidth(1000) - 200 = 800px
        expect(textareas[0].attributes('style')).toContain('width: 800px')
        expect(textareas[1].attributes('style')).toContain('width: 800px')
    })

    it('registers the rsa result listener on mount and removes it on unmount', () => {
        const wrapper = mount(RSAGenerator, { props: { workAreaWidth: '1000px' } })
        expect(ipcRenderer.on).toHaveBeenCalledWith('baize:plugin:rsa-result', expect.any(Function))
        const handler = ipcRenderer.on.mock.calls[0][1]
        wrapper.unmount()
        expect(ipcRenderer.removeListener).toHaveBeenCalledWith('baize:plugin:rsa-result', handler)
    })

    it('sends the bits value to the main process when refreshing the key pair', async () => {
        const wrapper = mount(RSAGenerator, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#rsa-key-pair-refresh').trigger('click')
        expect(ipcRenderer.send).toHaveBeenCalledWith('baize:plugin:rsa-generate', 2048)

        await wrapper.find('input[type="number"]').setValue(4096)
        await wrapper.find('#rsa-key-pair-refresh').trigger('click')
        // Vue3 的 v-model 对 type="number" 输入框会自动转成 number
        expect(ipcRenderer.send).toHaveBeenLastCalledWith('baize:plugin:rsa-generate', 4096)
    })

    it('fills public and private key textareas from the main process result', async () => {
        const wrapper = mount(RSAGenerator, { props: { workAreaWidth: '1000px' } })
        const handler = ipcRenderer.on.mock.calls[0][1]
        handler(null, 'PUBLIC-KEY-PEM', 'PRIVATE-KEY-PEM')
        await wrapper.vm.$nextTick()

        const textareas = wrapper.findAll('textarea')
        expect((textareas[0].element as HTMLTextAreaElement).value).toBe('PUBLIC-KEY-PEM')
        expect((textareas[1].element as HTMLTextAreaElement).value).toBe('PRIVATE-KEY-PEM')
    })
})

describe('EncryptDecrypt（crypto-js 对称加解密）', () => {
    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders default algorithm, mode and padding selections', () => {
        const wrapper = mount(EncryptDecrypt, { props: { workAreaWidth: '1000px' } })
        const selects = wrapper.findAll('select')
        expect(selects).toHaveLength(3)
        expect((selects[0].element as HTMLSelectElement).value).toBe('AES')
        expect((selects[1].element as HTMLSelectElement).value).toBe('CBC')
        expect((selects[2].element as HTMLSelectElement).value).toBe('Pkcs7')
        expect(selects[0].findAll('option')).toHaveLength(7)
        expect(selects[1].findAll('option')).toHaveLength(6)
        expect(selects[2].findAll('option')).toHaveLength(6)
    })

    it('alerts when encrypting without input text', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mount(EncryptDecrypt, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#text-encrypt').trigger('click')
        expect(alertSpy).toHaveBeenCalledWith('请输入要加密的文本...')
    })

    it('encrypts plain text into a non-empty cipher string', async () => {
        const wrapper = mount(EncryptDecrypt, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#input-enc-dec-text').setValue('Hello 白泽')
        await wrapper.find('#input-secret-key').setValue('12345678')
        await wrapper.find('#text-encrypt').trigger('click')

        const cipher = (wrapper.find('#encrypt-result').element as HTMLTextAreaElement).value
        expect(cipher.length).toBeGreaterThan(0)
        expect(cipher).not.toContain('Hello')
        // CMP-20：输出为 "随机IV十六进制(32位):密文Base64" 前缀拼接格式
        expect(cipher).toMatch(/^[0-9a-f]{32}:[A-Za-z0-9+/=]+$/)
    })

    it('round-trips: decrypting the cipher restores the original text', async () => {
        const wrapper = mount(EncryptDecrypt, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#input-enc-dec-text').setValue('Hello 白泽')
        await wrapper.find('#input-secret-key').setValue('12345678')
        await wrapper.find('#text-encrypt').trigger('click')

        expect(
            (wrapper.find('#encrypt-result').element as HTMLTextAreaElement).value.length
        ).toBeGreaterThan(0)

        await wrapper.find('#text-decrypt').trigger('click')
        expect((wrapper.find('#input-enc-dec-text').element as HTMLTextAreaElement).value).toBe(
            'Hello 白泽'
        )
    })

    // CMP-20：无前缀输入按旧格式兼容（不注入 IV，交由 crypto-js 默认方式解密；
    // ECB 模式不依赖 IV，可自洽还原）。
    it('CMP-20: decrypts legacy ciphertext without the IV prefix (ECB mode)', async () => {
        const wrapper = mount(EncryptDecrypt, { props: { workAreaWidth: '1000px' } })
        const secretKey = CryptoJS.enc.Utf8.parse('12345678')
        const legacy = CryptoJS.AES.encrypt('旧格式密文', secretKey, {
            mode: CryptoJS.mode.ECB,
            padding: CryptoJS.pad.Pkcs7
        }).toString()
        await wrapper.findAll('select')[1].setValue('ECB')
        await wrapper.find('#input-secret-key').setValue('12345678')
        await wrapper.find('#encrypt-result').setValue(legacy)
        await wrapper.find('#text-decrypt').trigger('click')
        expect((wrapper.find('#input-enc-dec-text').element as HTMLTextAreaElement).value).toBe(
            '旧格式密文'
        )
    })

    it('alerts when decrypting with an empty cipher area', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mount(EncryptDecrypt, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#text-decrypt').trigger('click')
        expect(alertSpy).toHaveBeenCalledWith('请输入要解密的文本...')
    })
})

describe('CryptoEncDec（Node crypto 经 IPC 加解密）', () => {
    let invoke: ReturnType<typeof vi.fn>
    /** AS-13：GCM 加密结果中的 authTag 固定桩值（16 字节 hex） */
    const GCM_TAG = 'f'.repeat(32)

    // CQ-10/PF-11/ARC-21：加密工具改为 invoke 异步调用（原 sendSync 同步）
    beforeEach(() => {
        invoke = vi.fn(async (channel: string, data?: { algorithm?: string }) => {
            if (channel === 'baize:plugin:crypto-encrypt') {
                const response = {
                    context: 'deadbeef',
                    iv: '0102',
                    secretKey: 'k'.repeat(32),
                    secretKeyEncoding: 'hex'
                }
                // AS-13：GCM 算法额外返回 authTag；非 GCM 保持历史返回结构
                return data?.algorithm?.endsWith('-gcm')
                    ? { ...response, authTag: GCM_TAG }
                    : response
            }
            return 'plain-text-result'
        })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders default algorithm aes-256-cbc and encoding options', () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        const selects = wrapper.findAll('select')
        expect(selects).toHaveLength(4)
        // 默认：算法 aes-256-cbc，密钥编码 utf8，输入编码 utf8，输出编码 hex
        expect((selects[0].element as HTMLSelectElement).value).toBe('utf8')
        expect((selects[1].element as HTMLSelectElement).value).toBe('aes-256-cbc')
        expect((selects[2].element as HTMLSelectElement).value).toBe('utf8')
        expect((selects[3].element as HTMLSelectElement).value).toBe('hex')
    })

    it('alerts when encrypting without input text', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#text-encrypt').trigger('click')
        expect(alertSpy).toHaveBeenCalledWith('请输入要加密/解密的文本...')
    })

    it('alerts when the secret key length does not match the algorithm', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('hello')
        // aes-256-cbc 需要 32 字节密钥，这里只给 5 个字符
        await wrapper.find('#input-crypto-secret-key').setValue('short')
        await wrapper.find('#text-encrypt').trigger('click')
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('需要秘钥长度'))
        expect(invoke).not.toHaveBeenCalled()
    })

    it('encrypts through IPC and fills result, IV, secret key from the response', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('hello')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(32))
        await wrapper.find('#text-encrypt').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        const [channel, data] = invoke.mock.calls[0]
        expect(channel).toBe('baize:plugin:crypto-encrypt')
        expect(data.context).toBe('hello')
        expect(data.algorithm).toBe('aes-256-cbc')
        expect(data.secretKeyEncoding).toBe('utf8')
        expect(data.inputEncoding).toBe('utf8')
        expect(data.outputEncoding).toBe('hex')

        expect((wrapper.find('#encrypt-result').element as HTMLTextAreaElement).value).toBe(
            'deadbeef'
        )
        expect((wrapper.find('#crypto-iv').element as HTMLInputElement).value).toBe('0102')
        expect((wrapper.find('#input-crypto-secret-key').element as HTMLInputElement).value).toBe(
            'k'.repeat(32)
        )
        const selects = wrapper.findAll('select')
        expect((selects[0].element as HTMLSelectElement).value).toBe('hex')
    })

    it('decrypts through IPC and writes the plain text into the result area', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('deadbeef')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(32))
        await wrapper.find('#text-decrypt').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        const [channel, data] = invoke.mock.calls[0]
        expect(channel).toBe('baize:plugin:crypto-decrypt')
        expect(data.context).toBe('deadbeef')
        expect(data.algorithm).toBe('aes-256-cbc')
        expect((wrapper.find('#encrypt-result').element as HTMLTextAreaElement).value).toBe(
            'plain-text-result'
        )
    })

    // AS-13：ECB/DES/RC2/RC4/Blowfish 弱算法提示 + GCM authTag 协议提示
    it('shows an insecure-algorithm warning for ECB/DES/RC4 selections (AS-13)', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        // 默认 aes-256-cbc 不是弱算法：不显示警示
        expect(wrapper.find('[data-testid="crypto-security-warning"]').exists()).toBe(false)

        const algorithmSelect = wrapper.findAll('select')[1]
        for (const algorithm of ['aes-256-ecb', 'des-cbc', 'rc4', 'bf-ecb']) {
            await algorithmSelect.setValue(algorithm)
            const warning = wrapper.find('[data-testid="crypto-security-warning"]')
            expect(warning.exists(), algorithm).toBe(true)
            expect(warning.text(), algorithm).toContain('不安全')
        }
    })

    it('explains that GCM requires authTag participation and reveals the authTag input (AS-13)', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        // 非 GCM：不展示 authTag 输入区
        expect(wrapper.find('#crypto-auth-tag').exists()).toBe(false)

        await wrapper.findAll('select')[1].setValue('aes-256-gcm')
        const warning = wrapper.find('[data-testid="crypto-security-warning"]')
        expect(warning.exists()).toBe(true)
        expect(warning.text()).toContain('authTag')
        // 新文案：GCM 需要 authTag 参与认证（而不是笼统的"未打通/不可用"）
        expect(warning.text()).toContain('认证')
        expect(warning.text()).toContain('解密失败')

        // 选中 GCM 后展示 authTag 输入区；切回非 GCM 后隐藏
        expect(wrapper.find('#crypto-auth-tag').exists()).toBe(true)
        await wrapper.findAll('select')[1].setValue('aes-256-cbc')
        expect(wrapper.find('#crypto-auth-tag').exists()).toBe(false)
    })

    it('fills the authTag from the encrypt response in GCM mode (AS-13)', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('hello')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(32))
        await wrapper.findAll('select')[1].setValue('aes-256-gcm')
        await wrapper.find('#text-encrypt').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        const [channel, data] = invoke.mock.calls[0]
        expect(channel).toBe('baize:plugin:crypto-encrypt')
        expect(data.algorithm).toBe('aes-256-gcm')
        expect((wrapper.find('#encrypt-result').element as HTMLTextAreaElement).value).toBe(
            'deadbeef'
        )
        // 加密成功后 authTag 自动填入并展示
        expect((wrapper.find('#crypto-auth-tag').element as HTMLInputElement).value).toBe(GCM_TAG)
    })

    it('sends the entered authTag when decrypting in GCM mode (AS-13)', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('deadbeef')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(32))
        await wrapper.findAll('select')[1].setValue('aes-256-gcm')
        await wrapper.find('#crypto-auth-tag').setValue(GCM_TAG)
        await wrapper.find('#text-decrypt').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        const [channel, data] = invoke.mock.calls[0]
        expect(channel).toBe('baize:plugin:crypto-decrypt')
        expect(data.authTag).toBe(GCM_TAG)
        expect((wrapper.find('#encrypt-result').element as HTMLTextAreaElement).value).toBe(
            'plain-text-result'
        )
    })

    it('alerts instead of calling IPC when decrypting GCM without an authTag (AS-13)', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('deadbeef')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(32))
        await wrapper.findAll('select')[1].setValue('aes-256-gcm')
        await wrapper.find('#text-decrypt').trigger('click')
        await flushPromises()

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('authTag'))
        expect(invoke).not.toHaveBeenCalled()
    })

    it('does not send authTag for non-GCM algorithms (AS-13 兼容性)', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('deadbeef')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(32))
        expect(wrapper.find('#crypto-auth-tag').exists()).toBe(false)
        await wrapper.find('#text-decrypt').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        const [, data] = invoke.mock.calls[0]
        expect(data.authTag).toBeUndefined()
        expect('authTag' in data).toBe(false)
    })

    it('renders the security warning in English after switching locale (AS-13)', async () => {
        setLocale('en-US')
        try {
            const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
            await wrapper.findAll('select')[1].setValue('aes-128-ecb')
            await nextTick()
            const warning = wrapper.find('[data-testid="crypto-security-warning"]')
            expect(warning.text()).toContain('insecure')
            expect(warning.text()).toContain('Security notice')
        } finally {
            setLocale('zh-CN')
            await nextTick()
        }
    })

    it('uses the algorithm selected by the user', async () => {
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('hello')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(16))
        // 第二个下拉框是算法选择，切换为 aes-128-cbc（16 字节密钥）
        await wrapper.findAll('select')[1].setValue('aes-128-cbc')
        await wrapper.find('#text-encrypt').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke.mock.calls[0][1].algorithm).toBe('aes-128-cbc')
    })

    // CQ-05：异步 IPC 失败需 catch 并提示用户（原同步实现无此路径）
    it('alerts when the encrypt IPC call rejects', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValueOnce(new Error('cipher broken'))
        const wrapper = mount(CryptoEncDec, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#crypto-input-text').setValue('hello')
        await wrapper.find('#input-crypto-secret-key').setValue('a'.repeat(32))
        await wrapper.find('#text-encrypt').trigger('click')
        await flushPromises()

        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('加密失败'))
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('cipher broken'))
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })
})

describe('UUIDSGenerator', () => {
    let writeText: ReturnType<typeof vi.fn>

    beforeEach(() => {
        writeText = installClipboardMock()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function mountUuid() {
        return mount(UUIDSGenerator, { props: { workAreaWidth: '1000px' } })
    }

    function getList(wrapper: ReturnType<typeof mountUuid>): string {
        return (wrapper.find('textarea').element as HTMLTextAreaElement).value
    }

    function clickVersion(wrapper: ReturnType<typeof mountUuid>, version: string) {
        return wrapper
            .findAll('.uuid-btn-style')
            .find((b) => b.text() === version)!
            .trigger('click')
    }

    it('generates a v1 UUID when clicking refresh', async () => {
        const wrapper = mountUuid()
        expect(getList(wrapper)).toBe('')
        await wrapper.find('#uuids-refresh').trigger('click')
        expect(getList(wrapper).trim()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-1[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )
    })

    it('generates the all-zero UUID for the NIL version', async () => {
        const wrapper = mountUuid()
        await clickVersion(wrapper, 'NIL')
        expect(getList(wrapper).trim()).toBe('00000000-0000-0000-0000-000000000000')
    })

    it('generates a v4 random UUID when selecting v4', async () => {
        const wrapper = mountUuid()
        await clickVersion(wrapper, 'v4')
        expect(getList(wrapper).trim()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )
    })

    it('shows namespace options and generates a deterministic v3 UUID from the name', async () => {
        const wrapper = mountUuid()
        await clickVersion(wrapper, 'v3')

        // 命名空间区显示，默认 DNS 命名空间
        expect((wrapper.find('#uuids-namespace').element as HTMLInputElement).value).toBe(
            '6ba7b810-9dad-11d1-80b4-00c04fd430c8'
        )

        await wrapper.find('#uuids-name').setValue('demo')
        const first = getList(wrapper).trim()
        expect(first).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-3[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )

        // v3 是确定性算法：相同名称产生相同 UUID，不同名称产生不同 UUID
        await wrapper.find('#uuids-name').setValue('other')
        const second = getList(wrapper).trim()
        expect(second).not.toBe(first)

        await wrapper.find('#uuids-name').setValue('demo')
        expect(getList(wrapper).trim()).toBe(first)
    })

    it('switches the namespace when clicking a namespace button', async () => {
        const wrapper = mountUuid()
        await clickVersion(wrapper, 'v5')
        const urlBtn = wrapper.findAll('.uuid-btn-style').find((b) => b.text() === 'URL')!
        await urlBtn.trigger('click')
        expect((wrapper.find('#uuids-namespace').element as HTMLInputElement).value).toBe(
            '6ba7b811-9dad-11d1-80b4-00c04fd430c9'
        )
        // v5 版本号字段为 5
        expect(getList(wrapper).trim()).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
        )
    })

    it('generates the requested number of UUIDs', async () => {
        const wrapper = mountUuid()
        await wrapper.find('input[type="number"]').setValue(3)
        const lines = getList(wrapper)
            .split(/\r?\n/)
            .filter((line) => line.length > 0)
        expect(lines).toHaveLength(3)
        for (const line of lines) {
            expect(line).toMatch(/^[0-9a-f-]{36}$/)
        }
    })

    it('copies the UUID list to the clipboard', async () => {
        const wrapper = mountUuid()
        await clickVersion(wrapper, 'v4')
        await wrapper.find('#uuids-copy').trigger('click')
        // 组件直接复制 ref 值（含 \r\n 换行），jsdom 的 textarea.value 会把 \r\n 归一化为 \n
        expect(writeText).toHaveBeenCalledWith(
            expect.stringMatching(
                /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\r\n$/
            )
        )
    })
})

describe('ULIDGenerator', () => {
    let writeText: ReturnType<typeof vi.fn>

    beforeEach(() => {
        writeText = installClipboardMock()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function mountUlid() {
        return mount(ULIDGenerator, { props: { workAreaWidth: '1000px' } })
    }

    function getList(wrapper: ReturnType<typeof mountUlid>): string {
        return (wrapper.find('textarea').element as HTMLTextAreaElement).value
    }

    it('generates one 26-character ULID in RAW format when clicking refresh', async () => {
        const wrapper = mountUlid()
        expect(getList(wrapper)).toBe('')
        await wrapper.find('#ulids-refresh').trigger('click')
        const lines = getList(wrapper)
            .split(/\r?\n/)
            .filter((line) => line.length > 0)
        expect(lines).toHaveLength(1)
        expect(lines[0]).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
    })

    it('generates the requested number of ULIDs', async () => {
        const wrapper = mountUlid()
        await wrapper.find('input[type="number"]').setValue(3)
        const lines = getList(wrapper)
            .split(/\r?\n/)
            .filter((line) => line.length > 0)
        expect(lines).toHaveLength(3)
        for (const line of lines) {
            expect(line).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)
        }
    })

    it('formats the list as a JSON array when the JSON style is selected', async () => {
        const wrapper = mountUlid()
        const jsonBtn = wrapper.findAll('.ulid-btn-style').find((b) => b.text() === 'JSON')!
        await jsonBtn.trigger('click')

        const value = getList(wrapper)
        expect(value.replace(/\r/g, '')).toMatch(/^\[\n {4}"[0-9A-HJKMNP-TV-Z]{26}",\n\]\n?$/)
        // 选中后按钮带高亮 class
        expect(jsonBtn.classes()).toContain('ulid-btn-active')
    })

    it('copies the ULID list to the clipboard', async () => {
        const wrapper = mountUlid()
        await wrapper.find('#ulids-refresh').trigger('click')
        await wrapper.find('#ulids-copy').trigger('click')
        // RAW 格式：一行 ULID + 空行（\r\n\r\n 结尾）
        expect(writeText).toHaveBeenCalledWith(
            expect.stringMatching(/^[0-9A-HJKMNP-TV-Z]{26}\r\n\r\n$/)
        )
    })
})

describe('HashText', () => {
    let invoke: ReturnType<typeof vi.fn>
    let writeText: ReturnType<typeof vi.fn>

    // CQ-10/PF-11/ARC-21：哈希计算改为 invoke 异步调用（原 sendSync 同步）
    beforeEach(() => {
        writeText = installClipboardMock()
        invoke = vi.fn(async () => ({
            MD4: 'md4val',
            MD5: 'md5val',
            SHA1: 'sha1val',
            SHA224: 'sha224val',
            SHA256: 'sha256val',
            SHA384: 'sha384val',
            SHA512: 'sha512val',
            'SHA512-256': 'sha512-256val',
            RIPEMD160: 'ripemdval'
        }))
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('computes hashes through IPC when the input text changes', async () => {
        const wrapper = mount(HashText, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hash-text-input').setValue('hello')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith('baize:plugin:hash-text', 'hello', 'Hexadecimal')
        expect((wrapper.find('#hash-text-md5').element as HTMLInputElement).value).toBe('md5val')
        expect((wrapper.find('#hash-text-sha256').element as HTMLInputElement).value).toBe(
            'sha256val'
        )
        expect((wrapper.find('#hash-text-sha512-256').element as HTMLInputElement).value).toBe(
            'sha512-256val'
        )
        // 结果输入框只读
        expect((wrapper.find('#hash-text-md5').element as HTMLInputElement).readOnly).toBe(true)
    })

    it('recomputes hashes when the encoding type changes', async () => {
        const wrapper = mount(HashText, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hash-text-input').setValue('hello')
        await flushPromises()
        await wrapper.find('#hash-text-encode-type').setValue('base64')
        await flushPromises()
        expect(invoke).toHaveBeenLastCalledWith('baize:plugin:hash-text', 'hello', 'base64')
    })

    it('alerts when changing encoding without input text', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mount(HashText, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hash-text-input').setValue('')
        await wrapper.find('#hash-text-encode-type').setValue('Binary')
        await flushPromises()
        expect(alertSpy).toHaveBeenCalledWith('请先输入要进行Hash的文本....')
    })

    it('alerts when the hash IPC call rejects (CQ-05)', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValueOnce(new Error('hash broken'))
        const wrapper = mount(HashText, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hash-text-input').setValue('hello')
        await flushPromises()
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('计算哈希失败'))
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('hash broken'))
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('copies a hash result to the clipboard', async () => {
        const wrapper = mount(HashText, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hash-text-input').setValue('hello')
        await flushPromises()
        const copyButtons = wrapper.findAll('button').filter((b) => b.text() === '复制')
        expect(copyButtons).toHaveLength(9)
        await copyButtons[1].trigger('click') // MD5 行
        expect(writeText).toHaveBeenCalledWith('md5val')
    })

    // CMP-30：标签/占位/按钮改为 t() 后，切换语言应实时重渲染（默认 zh-CN 文案保持逐字不变）
    it('re-renders labels, placeholders and buttons after switching locale to en-US', async () => {
        const wrapper = mount(HashText, { props: { workAreaWidth: '1000px' } })
        expect(wrapper.find('h1').text()).toBe('Hash 哈希文本生成，非对称加密')
        expect(wrapper.find('#hash-text-input').attributes('placeholder')).toBe('请输入你的文本...')
        expect(wrapper.findAll('button').filter((b) => b.text() === '复制')).toHaveLength(9)

        setLocale('en-US')
        try {
            await nextTick()
            expect(wrapper.find('h1').text()).toBe('Hash text generator, asymmetric encryption')
            expect(wrapper.find('#hash-text-input').attributes('placeholder')).toBe(
                'Enter your text...'
            )
            expect(wrapper.findAll('button').filter((b) => b.text() === 'Copy')).toHaveLength(9)
            expect(wrapper.find('#hash-text-md5').attributes('placeholder')).toBe(
                'MD5 hash result...'
            )
        } finally {
            setLocale('zh-CN')
            await nextTick()
        }
        expect(wrapper.find('h1').text()).toBe('Hash 哈希文本生成，非对称加密')
    })
})

describe('HmacGenerator', () => {
    let invoke: ReturnType<typeof vi.fn>
    let writeText: ReturnType<typeof vi.fn>

    // CQ-10/PF-11/ARC-21：HMAC 计算改为 invoke 异步调用（原 sendSync 同步）
    beforeEach(() => {
        writeText = installClipboardMock()
        invoke = vi.fn(async () => ({
            MD4: 'hmac-md4',
            MD5: 'hmac-md5',
            SHA1: 'hmac-sha1',
            SHA224: 'hmac-sha224',
            SHA256: 'hmac-sha256',
            SHA384: 'hmac-sha384',
            SHA512: 'hmac-sha512',
            'SHA512-256': 'hmac-sha512-256',
            RIPEMD160: 'hmac-ripemd160'
        }))
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('computes HMAC through IPC when the input text changes', async () => {
        const wrapper = mount(HmacGenerator, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hmac-text-input').setValue('hello')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(
            'baize:plugin:hmac-text',
            'hello',
            '12345678',
            'Hexadecimal'
        )
        expect((wrapper.find('#hmac-text-md5').element as HTMLInputElement).value).toBe('hmac-md5')
        expect((wrapper.find('#hmac-text-sha512').element as HTMLInputElement).value).toBe(
            'hmac-sha512'
        )
    })

    it('recomputes HMAC when the secret key changes', async () => {
        const wrapper = mount(HmacGenerator, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hmac-text-input').setValue('hello')
        await flushPromises()
        await wrapper.find('input[placeholder="请输入密钥，默认123456"]').setValue('another-key')
        await flushPromises()
        expect(invoke).toHaveBeenLastCalledWith(
            'baize:plugin:hmac-text',
            'hello',
            'another-key',
            'Hexadecimal'
        )
    })

    it('alerts when changing encoding without input text', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const wrapper = mount(HmacGenerator, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hmac-text-input').setValue('')
        await wrapper.find('#hmac-text-encode-type').setValue('Binary')
        await flushPromises()
        expect(alertSpy).toHaveBeenCalledWith('请先输入要进行Hmac的文本....')
    })

    it('alerts when the HMAC IPC call rejects (CQ-05)', async () => {
        const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValueOnce(new Error('hmac broken'))
        const wrapper = mount(HmacGenerator, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hmac-text-input').setValue('hello')
        await flushPromises()
        expect(alertSpy).toHaveBeenCalledWith(expect.stringContaining('计算 HMAC 失败'))
        expect(consoleError).toHaveBeenCalled()
        consoleError.mockRestore()
    })

    it('copies an HMAC result to the clipboard', async () => {
        const wrapper = mount(HmacGenerator, { props: { workAreaWidth: '1000px' } })
        await wrapper.find('#hmac-text-input').setValue('hello')
        await flushPromises()
        const copyButtons = wrapper.findAll('button').filter((b) => b.text() === '复制')
        await copyButtons[0].trigger('click') // MD4 行
        expect(writeText).toHaveBeenCalledWith('hmac-md4')
    })
})
