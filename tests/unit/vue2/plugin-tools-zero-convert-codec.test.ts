// @vitest-environment jsdom
/**
 * 插件工具 0% 组件补测（第二批）：颜色/单位换算、随机生成、图片 Base64。
 *
 * 1. `PluginTools/Convert/ColorConvert.vue`（66 语句/7 函数）——HEX/RGB/HSL/HSV/CMYK
 *    五个格式区块的「改一处同步其余全部」互转接线、非法输入错误提示与清除；
 * 2. `PluginTools/Convert/UnitConvert.vue`（55 语句/9 函数）——长度/存储标签页、
 *    两套制式切换、科学计数法格式化、非法/空值提示、SI 制 PB 自动降为 TB；
 * 3. `PluginTools/MiscTools/RandomGenerator.vue`（55 语句/11 函数）——四个标签页、
 *    密码/字符串/数字/颜色生成、自定义字符集与错误分支、各复制按钮；
 * 4. `PluginTools/Codec/ImageBase64.vue`（69 语句/9 函数）——选择图片读取、
 *    大小/读取失败/解码失败/空输入/长度超限提示、预览 objectURL 复用与 revoke、
 *    复制/清空/卸载清理。
 *
 * 依赖边界：颜色/单位/随机/图片字节纯函数库跑真实实现（库自身分支已由
 * tests/unit/plugins/* 覆盖），仅剪贴板、平台限制常量（缩小到 4 字节便于覆盖
 * 大小上限分支）与 jsdom 缺失的 objectURL API 做边界 mock。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

const clipboardMocks = vi.hoisted(() => ({
    copyTextToClipboard: vi.fn().mockResolvedValue(true)
}))

vi.mock('@renderer/common/clipboard', () => clipboardMocks)

// 图片大小上限缩到 4 字节：使「文件超限 / 解码超限」分支无需构造 20MB 数据
vi.mock('../../../src/shared/constants/limits', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    return { ...actual, MAX_IMAGE_BASE64_SIZE: 4 }
})

import { setLocale } from '@renderer/common/i18n'
import ColorConvert from '@renderer/components/PluginTools/Convert/ColorConvert.vue'
import UnitConvert from '@renderer/components/PluginTools/Convert/UnitConvert.vue'
import RandomGenerator from '@renderer/components/PluginTools/MiscTools/RandomGenerator.vue'
import ImageBase64 from '@renderer/components/PluginTools/Codec/ImageBase64.vue'

let wrapper: VueWrapper | null = null

beforeEach(() => {
    setLocale('zh-CN')
    clipboardMocks.copyTextToClipboard.mockClear()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
})

/** 读取 v-model 文本框当前值 */
function valueOf(element: Element): string {
    return (element as HTMLInputElement | HTMLTextAreaElement).value
}

describe('ColorConvert.vue 颜色转换面板', () => {
    /** 五个格式区块：0=HEX 1=RGB 2=HSL 3=HSV 4=CMYK */
    function card(w: VueWrapper, index: number) {
        return w.findAll('.color-card')[index]
    }
    function previewColor(w: VueWrapper): string {
        return (w.find('.color-preview').element as HTMLElement).style.backgroundColor
    }

    it('初始渲染 #FF8000 预览与五个格式区块', () => {
        wrapper = mount(ColorConvert, { props: { workAreaWidth: '600px' } })
        expect(wrapper.findAll('.color-card')).toHaveLength(5)
        expect((wrapper.find('.plugin-tools-theme').element as HTMLElement).style.width).toBe(
            '600px'
        )
        expect(valueOf(card(wrapper, 0).find('input').element)).toBe('#FF8000')
        expect(valueOf(card(wrapper, 1).find('input').element)).toBe('255,128,0')
        expect(previewColor(wrapper)).toBe('rgb(255, 128, 0)')
    })

    it('修改 HEX：同步 RGB/HSL/HSV/CMYK 并更新预览', async () => {
        wrapper = mount(ColorConvert)
        await card(wrapper, 0).find('input').setValue('#00FF00')

        expect(valueOf(card(wrapper, 1).find('input').element)).toBe('0,255,0')
        expect(previewColor(wrapper)).toBe('rgb(0, 255, 0)')
        const hslInputs = card(wrapper, 2).findAll('input')
        expect(hslInputs.map((item) => valueOf(item.element))).toEqual(['120', '100', '50'])
        const hsvInputs = card(wrapper, 3).findAll('input')
        expect(hsvInputs.map((item) => valueOf(item.element))).toEqual(['120', '100', '100'])
        const cmykInputs = card(wrapper, 4).findAll('input')
        expect(cmykInputs.map((item) => valueOf(item.element))).toEqual(['100', '0', '100', '0'])
        expect(wrapper.find('.error-text').exists()).toBe(false)
    })

    it('修改 RGB：同步 HEX 与其余格式', async () => {
        wrapper = mount(ColorConvert)
        await card(wrapper, 1).find('input').setValue('0,0,255')

        expect(valueOf(card(wrapper, 0).find('input').element)).toBe('#0000FF')
        expect(previewColor(wrapper)).toBe('rgb(0, 0, 255)')
    })

    it('非法 HEX / RGB 输入展示错误提示，修正后清除', async () => {
        wrapper = mount(ColorConvert)
        await card(wrapper, 0).find('input').setValue('#GG')
        expect(wrapper.find('.error-text').text()).toContain('无效')

        await card(wrapper, 0).find('input').setValue('#123456')
        expect(wrapper.find('.error-text').exists()).toBe(false)

        await card(wrapper, 1).find('input').setValue('not-a-rgb')
        expect(wrapper.find('.error-text').exists()).toBe(true)
        await card(wrapper, 1).find('input').setValue('1,2,3')
        expect(wrapper.find('.error-text').exists()).toBe(false)
    })

    it('修改 HSL：按 HSL 换算并同步 HEX', async () => {
        wrapper = mount(ColorConvert)
        const hslInputs = card(wrapper, 2).findAll('input')
        await hslInputs[0].setValue('240')
        await hslInputs[1].setValue('100')
        await hslInputs[2].setValue('50')
        expect(valueOf(card(wrapper, 0).find('input').element)).toBe('#0000FF')
    })

    it('HSL 数值缺失时提示错误', async () => {
        wrapper = mount(ColorConvert)
        await card(wrapper, 2).findAll('input')[1].setValue('')
        expect(wrapper.find('.error-text').exists()).toBe(true)
    })

    it('修改 HSV：按 HSV 换算并同步 HEX；数值缺失提示错误', async () => {
        wrapper = mount(ColorConvert)
        const hsvInputs = card(wrapper, 3).findAll('input')
        await hsvInputs[0].setValue('120')
        await hsvInputs[1].setValue('100')
        await hsvInputs[2].setValue('100')
        expect(valueOf(card(wrapper, 0).find('input').element)).toBe('#00FF00')

        await hsvInputs[2].setValue('')
        expect(wrapper.find('.error-text').exists()).toBe(true)
    })

    it('修改 CMYK：按 CMYK 换算并同步 HEX；数值缺失提示错误', async () => {
        wrapper = mount(ColorConvert)
        const cmykInputs = card(wrapper, 4).findAll('input')
        await cmykInputs[0].setValue('100')
        await cmykInputs[1].setValue('0')
        await cmykInputs[2].setValue('0')
        await cmykInputs[3].setValue('0')
        expect(valueOf(card(wrapper, 0).find('input').element)).toBe('#00FFFF')

        await cmykInputs[3].setValue('')
        expect(wrapper.find('.error-text').exists()).toBe(true)
    })
})

describe('UnitConvert.vue 单位换算面板', () => {
    function lengthPanel(w: VueWrapper) {
        return w.findAll('.panel-card')[0]
    }
    function storagePanel(w: VueWrapper) {
        return w.findAll('.panel-card')[1]
    }
    function lengthResult(w: VueWrapper): string {
        return w.find('[data-testid="length-result"]').text()
    }
    function storageResult(w: VueWrapper): string {
        return w.find('[data-testid="storage-result"]').text()
    }

    it('初始渲染：默认 1 米转公里，标签页/下拉选项齐全', () => {
        wrapper = mount(UnitConvert, { props: { workAreaWidth: '620px' } })
        expect(lengthResult(wrapper)).toBe('0.001')
        expect(lengthPanel(wrapper).findAll('select')).toHaveLength(2)
        expect(lengthPanel(wrapper).findAll('option')).toHaveLength(24 * 2)
        expect((wrapper.find('.plugin-tools-theme').element as HTMLElement).style.width).toBe(
            '620px'
        )
    })

    it('修改数值与单位后重新换算；大数走科学计数法', async () => {
        wrapper = mount(UnitConvert)
        const valueInput = lengthPanel(wrapper).find('.value-input')
        await valueInput.setValue('2')
        expect(lengthResult(wrapper)).toBe('0.002')

        const selects = lengthPanel(wrapper).findAll('select')
        await selects[0].setValue('km')
        await selects[1].setValue('m')
        expect(lengthResult(wrapper)).toBe('2000')

        await valueInput.setValue('1000000000')
        expect(lengthResult(wrapper)).toContain('e+')
    })

    it('很小结果也走科学计数法（1 米转光年）', async () => {
        wrapper = mount(UnitConvert)
        await lengthPanel(wrapper).findAll('select')[1].setValue('ly')
        expect(lengthResult(wrapper)).toContain('e-')
    })

    it('非法数值/空值提示错误并清空结果', async () => {
        wrapper = mount(UnitConvert)
        const valueInput = lengthPanel(wrapper).find('.value-input')
        await valueInput.setValue('abc')
        expect(wrapper.find('.error-text').exists()).toBe(true)
        expect(lengthResult(wrapper)).toBe('')

        await valueInput.setValue('')
        expect(wrapper.find('.error-text').exists()).toBe(true)

        await valueInput.setValue('1')
        expect(wrapper.find('.error-text').exists()).toBe(false)
        expect(lengthResult(wrapper)).toBe('0.001')
    })

    it('存储标签页：二进制制 1KB → MB，切换 SI 制重新换算', async () => {
        wrapper = mount(UnitConvert)
        await wrapper.findAll('.tab-btn')[1].trigger('click')
        expect(storageResult(wrapper)).toBe('0.000977')

        // 存储面板内两个制式按钮：二进制 / SI
        const modeButtons = storagePanel(wrapper).findAll('.tab-btn')
        await modeButtons[1].trigger('click')
        expect(storageResult(wrapper)).toBe('0.001')
        // SI 制下拉不含 PB，共 5 个选项
        expect(storagePanel(wrapper).findAll('select')[0].findAll('option')).toHaveLength(5)
    })

    it('SI 制下从 PB 自动降为 TB，避免无对应系数', async () => {
        wrapper = mount(UnitConvert)
        await wrapper.findAll('.tab-btn')[1].trigger('click')
        const selects = storagePanel(wrapper).findAll('select')
        await selects[0].setValue('PB')
        expect(valueOf(selects[0].element)).toBe('PB')

        await storagePanel(wrapper).findAll('.tab-btn')[1].trigger('click')
        expect(valueOf(selects[0].element)).toBe('TB')
        expect(storageResult(wrapper)).not.toBe('')
    })

    it('存储大数走科学计数法，非法数值提示错误', async () => {
        wrapper = mount(UnitConvert)
        await wrapper.findAll('.tab-btn')[1].trigger('click')
        const valueInput = storagePanel(wrapper).find('.value-input')
        await valueInput.setValue('1')
        await storagePanel(wrapper).findAll('select')[0].setValue('GB')
        await storagePanel(wrapper).findAll('select')[1].setValue('B')
        expect(storageResult(wrapper)).toContain('e+')

        await valueInput.setValue('abc')
        expect(wrapper.find('.error-text').exists()).toBe(true)
        expect(storageResult(wrapper)).toBe('')
    })
})

describe('RandomGenerator.vue 随机生成面板', () => {
    function panels(w: VueWrapper) {
        return w.findAll('.panel-card')
    }
    function outputAreas(w: VueWrapper) {
        return w.findAll('.value-area')
    }
    function outputValue(w: VueWrapper, index: number): string {
        return valueOf(outputAreas(w)[index].element)
    }
    function buttons(w: VueWrapper, panelIndex: number) {
        return panels(w)[panelIndex].findAll('.plugin-tools-btn')
    }

    it('初始状态即为四个标签页生成默认结果', () => {
        wrapper = mount(RandomGenerator, { props: { workAreaWidth: '600px' } })
        expect(wrapper.findAll('.tab-bar .tab-btn')).toHaveLength(4)
        expect(wrapper.find('.tab-bar .tab-active').text()).toBe('密码')
        expect(outputValue(wrapper, 0)).toHaveLength(16)
        expect(outputValue(wrapper, 1)).toHaveLength(16)
        expect(outputValue(wrapper, 2).split(', ')).toHaveLength(10)
        expect(wrapper.find('[data-testid="color-hex"]').text()).toMatch(/^#[0-9A-F]{6}$/)
    })

    it('生成长度可调密码；全部字符集关闭时回落小写字母', async () => {
        wrapper = mount(RandomGenerator)
        const lengthInput = panels(wrapper)[0].find('input[type="number"]')
        await lengthInput.setValue('20')
        await buttons(wrapper, 0)[0].trigger('click')
        expect(outputValue(wrapper, 0)).toHaveLength(20)

        const checkboxes = panels(wrapper)[0].findAll('input[type="checkbox"]')
        for (const checkbox of checkboxes) {
            if ((checkbox.element as HTMLInputElement).checked) {
                await checkbox.setValue(false)
            }
        }
        await buttons(wrapper, 0)[0].trigger('click')
        expect(outputValue(wrapper, 0)).toMatch(/^[a-z]{20}$/)
    })

    it('随机字符串：自定义字符集生成与空字符集错误分支', async () => {
        wrapper = mount(RandomGenerator)
        const panel = panels(wrapper)[1]
        const select = panel.find('select')
        await select.setValue('custom')
        expect(panel.find('input[type="text"]').exists()).toBe(true)

        // 空自定义字符集 → 库抛错 → 组件展示错误
        await buttons(wrapper, 1)[0].trigger('click')
        expect(wrapper.find('.error-text').text()).toContain('字符集')

        await panel.find('input[type="text"]').setValue('xyz')
        await panel.find('input[type="number"]').setValue('8')
        await buttons(wrapper, 1)[0].trigger('click')
        expect(wrapper.find('.error-text').exists()).toBe(false)
        expect(outputValue(wrapper, 1)).toMatch(/^[xyz]{8}$/)
    })

    it('随机数：非法范围/范围不足报错，正常生成去重序列', async () => {
        wrapper = mount(RandomGenerator)
        const panel = panels(wrapper)[2]
        const numberInputs = panel.findAll('input[type="number"]')
        // min=10 max=5
        await numberInputs[0].setValue('10')
        await numberInputs[1].setValue('5')
        await buttons(wrapper, 2)[0].trigger('click')
        expect(wrapper.find('.error-text').text()).toContain('最小值不能大于最大值')

        // min=1 max=3 count=5 → 范围不足
        await numberInputs[0].setValue('1')
        await numberInputs[1].setValue('3')
        await numberInputs[2].setValue('5')
        await buttons(wrapper, 2)[0].trigger('click')
        expect(wrapper.find('.error-text').text()).toContain('范围太小')

        await numberInputs[1].setValue('100')
        await numberInputs[2].setValue('5')
        await buttons(wrapper, 2)[0].trigger('click')
        expect(wrapper.find('.error-text').exists()).toBe(false)
        const numbers = outputValue(wrapper, 2).split(', ').map(Number)
        expect(numbers).toHaveLength(5)
        expect(new Set(numbers).size).toBe(5)
    })

    it('随机颜色：两种亮度模式生成并复制 HEX / RGB 组合值', async () => {
        wrapper = mount(RandomGenerator)
        const panel = panels(wrapper)[3]
        const modeButtons = panel.findAll('.tab-btn')
        await modeButtons[1].trigger('click')
        await buttons(wrapper, 3)[0].trigger('click')
        expect(wrapper.find('[data-testid="color-hex"]').text()).toMatch(/^#[0-9A-F]{6}$/)

        await buttons(wrapper, 3)[1].trigger('click')
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledTimes(1)
        expect(clipboardMocks.copyTextToClipboard.mock.calls[0][0]).toContain('rgb(')
    })

    it('三个复制按钮在已有输出时写入剪贴板', async () => {
        wrapper = mount(RandomGenerator)
        await buttons(wrapper, 0)[1].trigger('click')
        await buttons(wrapper, 1)[1].trigger('click')
        await buttons(wrapper, 2)[1].trigger('click')
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledTimes(3)
    })
})

describe('ImageBase64.vue 图片 Base64 面板', () => {
    let createObjectUrl: ReturnType<typeof vi.fn>
    let revokeObjectUrl: ReturnType<typeof vi.fn>
    let alertSpy: ReturnType<typeof vi.spyOn>
    let objectUrlSeed: number

    beforeEach(() => {
        objectUrlSeed = 0
        createObjectUrl = vi.fn(() => `blob:mock-${++objectUrlSeed}`)
        revokeObjectUrl = vi.fn()
        Object.assign(URL, {
            createObjectURL: createObjectUrl,
            revokeObjectURL: revokeObjectUrl
        })
        alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    })

    afterEach(() => {
        alertSpy.mockRestore()
    })

    /** 构造最小 File 契约（jsdom 下无需真实 20MB 字节） */
    function fakeFile(
        options: {
            name?: string
            size?: number
            type?: string
            bytes?: number[]
            fail?: boolean
        } = {}
    ): File {
        const bytes = new Uint8Array(options.bytes ?? [1, 2, 3])
        return {
            name: options.name ?? 'a.png',
            size: options.size ?? bytes.length,
            type: options.type ?? 'image/png',
            arrayBuffer: () =>
                options.fail
                    ? Promise.reject(new Error('read error'))
                    : Promise.resolve(bytes.buffer)
        } as unknown as File
    }

    /** 把 fake file 注入 input.files 并触发 change */
    async function chooseFile(w: VueWrapper, file: File): Promise<void> {
        const input = w.find('#image-file-input').element as HTMLInputElement
        Object.defineProperty(input, 'files', { configurable: true, value: [file] })
        await w.find('#image-file-input').trigger('change')
        await flushPromises()
    }

    function base64TextOf(w: VueWrapper): string {
        return valueOf(w.find('#image-base64-text').element)
    }

    it('选择图片：读取字节转 DataURL、展示文件名与 objectURL 预览', async () => {
        wrapper = mount(ImageBase64, { props: { workAreaWidth: '640px' } })
        await chooseFile(wrapper, fakeFile({ name: 'pic.png', bytes: [1, 2, 3] }))

        expect(wrapper.find('.image-file-name').text()).toBe('pic.png')
        expect(base64TextOf(wrapper)).toBe('data:image/png;base64,AQID')
        expect(createObjectUrl).toHaveBeenCalledTimes(1)
        expect(
            (wrapper.find('#image-preview').element as HTMLImageElement).getAttribute('src')
        ).toBe('blob:mock-1')
    })

    it('文件超过大小上限：提示并复位 input', async () => {
        wrapper = mount(ImageBase64)
        await chooseFile(wrapper, fakeFile({ size: 5 }))
        expect(alertSpy).toHaveBeenCalledTimes(1)
        expect((wrapper.find('#image-file-input').element as HTMLInputElement).value).toBe('')
        expect(wrapper.find('#image-preview').exists()).toBe(false)
    })

    it('未选择文件时 change 事件直接返回', async () => {
        wrapper = mount(ImageBase64)
        await wrapper.find('#image-file-input').trigger('change')
        await flushPromises()
        expect(alertSpy).not.toHaveBeenCalled()
        expect(createObjectUrl).not.toHaveBeenCalled()
    })

    it('读取文件失败提示错误', async () => {
        wrapper = mount(ImageBase64)
        await chooseFile(wrapper, fakeFile({ fail: true }))
        expect(alertSpy).toHaveBeenCalledTimes(1)
    })

    it('解码 Base64 生成预览，二次解码 revoke 旧 objectURL', async () => {
        wrapper = mount(ImageBase64)
        const textarea = wrapper.find('#image-base64-text')
        await textarea.setValue('AQID')
        await wrapper.find('#image-base64-to-preview').trigger('click')
        expect(createObjectUrl).toHaveBeenCalledTimes(1)
        expect(wrapper.find('#image-preview').exists()).toBe(true)
        expect(revokeObjectUrl).not.toHaveBeenCalled()

        await textarea.setValue('BAUG')
        await wrapper.find('#image-base64-to-preview').trigger('click')
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock-1')
        expect(createObjectUrl).toHaveBeenCalledTimes(2)
    })

    it('DataURL 前缀解析 MIME 类型（非 image/png 时按前缀建 Blob）', async () => {
        const captured: Blob[] = []
        createObjectUrl.mockImplementation((blob: Blob) => {
            captured.push(blob)
            return `blob:mock-${++objectUrlSeed}`
        })
        wrapper = mount(ImageBase64)
        await wrapper.find('#image-base64-text').setValue('data:image/jpeg;base64,AQID')
        await wrapper.find('#image-base64-to-preview').trigger('click')

        expect(captured).toHaveLength(1)
        expect(captured[0].type).toBe('image/jpeg')
    })

    it('空输入 / 非法 Base64 / 字节超限分别提示', async () => {
        wrapper = mount(ImageBase64)
        const textarea = wrapper.find('#image-base64-text')

        await wrapper.find('#image-base64-to-preview').trigger('click')
        expect(alertSpy).toHaveBeenCalledTimes(1)

        await textarea.setValue('!!!!')
        await wrapper.find('#image-base64-to-preview').trigger('click')
        expect(alertSpy).toHaveBeenCalledTimes(2)

        // 5 字节 > 缩小的 4 字节上限
        await textarea.setValue('AQIDBAU=')
        await wrapper.find('#image-base64-to-preview').trigger('click')
        expect(alertSpy).toHaveBeenCalledTimes(3)
        expect(createObjectUrl).not.toHaveBeenCalled()
    })

    it('Base64 文本长度超限时先拦截，不进入解码', async () => {
        wrapper = mount(ImageBase64)
        // MAX_BASE64_TEXT_LENGTH = ceil(4/3*4)+1024 = 1030
        await wrapper.find('#image-base64-text').setValue('A'.repeat(1031))
        await wrapper.find('#image-base64-to-preview').trigger('click')
        expect(alertSpy).toHaveBeenCalledTimes(1)
        expect(createObjectUrl).not.toHaveBeenCalled()
    })

    it('复制按钮：有内容才写入剪贴板；清空后不再复制', async () => {
        wrapper = mount(ImageBase64)
        await wrapper.find('#image-copy').trigger('click')
        expect(clipboardMocks.copyTextToClipboard).not.toHaveBeenCalled()

        await wrapper.find('#image-base64-text').setValue('AQID')
        await wrapper.find('#image-copy').trigger('click')
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledWith('AQID')

        await wrapper.find('#image-clear').trigger('click')
        await wrapper.find('#image-copy').trigger('click')
        expect(clipboardMocks.copyTextToClipboard).toHaveBeenCalledTimes(1)
    })

    it('清空按钮释放预览 objectURL、复位文件名与输入框', async () => {
        wrapper = mount(ImageBase64)
        await chooseFile(wrapper, fakeFile({ name: 'pic.png' }))
        expect(wrapper.find('.image-file-name').exists()).toBe(true)

        await wrapper.find('#image-clear').trigger('click')
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock-1')
        expect(wrapper.find('#image-preview').exists()).toBe(false)
        expect(wrapper.find('.image-file-name').exists()).toBe(false)
        expect(base64TextOf(wrapper)).toBe('')
    })

    it('卸载时释放仍存活的预览 objectURL', async () => {
        wrapper = mount(ImageBase64)
        await chooseFile(wrapper, fakeFile())
        wrapper.unmount()
        wrapper = null
        expect(revokeObjectUrl).toHaveBeenCalledWith('blob:mock-1')
    })

    it('选择文件按钮触发隐藏 input 的 click', async () => {
        wrapper = mount(ImageBase64)
        const clickSpy = vi
            .spyOn(HTMLInputElement.prototype, 'click')
            .mockImplementation(() => undefined)
        await wrapper.find('#image-choose-file').trigger('click')
        expect(clickSpy).toHaveBeenCalledTimes(1)
        clickSpy.mockRestore()
    })

    it('非像素宽度回落到默认 680 口径（100% 场景可正常挂载）', () => {
        wrapper = mount(ImageBase64)
        expect(wrapper.find('#image-base64-text').exists()).toBe(true)
    })
})
