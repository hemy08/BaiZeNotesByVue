// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import AdmonitionDialog from '@renderer/components/dialogs/medium/AdmonitionDialog.vue'
import InsertImageDialog from '@renderer/components/dialogs/medium/InsertImageDialog.vue'
import MdSheetDialog from '@renderer/components/dialogs/medium/MdSheetDialog.vue'
import MathTextDialog from '@renderer/components/dialogs/medium/MathTextDialog.vue'
import ImportOptionDialog from '@renderer/components/dialogs/medium/ImportOptionDialog.vue'

// 对话框使用 <Teleport to="body">，测试时 stub 成内联渲染以便断言
const dialogMountOptions = { global: { stubs: { teleport: true } } }

describe('AdmonitionDialog', () => {
    it('does not render the overlay when visible is false', () => {
        const wrapper = mount(AdmonitionDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
    })

    it('renders 12 admonition types with note selected by default', () => {
        const wrapper = mount(AdmonitionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const cards = wrapper.findAll('.type-card')
        expect(cards).toHaveLength(12)
        expect(cards[0].classes()).toContain('selected')
        expect(cards[0].text()).toContain('Note')
        expect(cards[11].text()).toContain('Quote')
    })

    it('selects a type when clicking its card', async () => {
        const wrapper = mount(AdmonitionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const tipCard = wrapper.findAll('.type-card').find((card) => card.text().includes('Tip'))!
        await tipCard.trigger('click')
        expect(tipCard.classes()).toContain('selected')
        expect(wrapper.findAll('.type-card')[0].classes()).not.toContain('selected')
    })

    it('emits insert with the markdown built from type, title and content', async () => {
        const wrapper = mount(AdmonitionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper
            .findAll('.type-card')
            .find((card) => card.text().includes('Tip'))!
            .trigger('click')
        await wrapper.find('input.text-input').setValue('小提示')
        await wrapper.find('textarea.textarea-input').setValue('注意备份数据')
        await wrapper.find('.btn-confirm').trigger('click')

        expect(wrapper.emitted('insert')).toHaveLength(1)
        expect(wrapper.emitted('insert')![0][0]).toBe('!!! tip "小提示"\n    注意备份数据\n')
    })

    it('uses the default content when the textarea is empty', async () => {
        const wrapper = mount(AdmonitionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('insert')![0][0]).toBe('!!! note\n这里是内容...\n')
    })

    it('emits close when clicking cancel or the close button', async () => {
        const wrapper = mount(AdmonitionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)

        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(2)
    })

    it('shows the live preview with the selected type color', async () => {
        const wrapper = mount(AdmonitionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('input.text-input').setValue('预览标题')
        expect(wrapper.find('.preview-title').text()).toBe('预览标题')
        // note 类型颜色 #667eea，jsdom 将其归一化为 rgb 形式
        expect(wrapper.find('.preview-card').attributes('style')).toContain('rgb(102, 126, 234)')
    })
})

describe('InsertImageDialog', () => {
    it('does not render the overlay when visible is false', () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
    })

    it('renders two tabs with the local tab active by default', () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const tabs = wrapper.findAll('.tab-btn')
        expect(tabs).toHaveLength(2)
        expect(tabs[0].classes()).toContain('active')
        expect(tabs[0].text()).toBe('本地文件')
        expect(tabs[1].text()).toBe('网络图片')
    })

    it('disables the insert button while no source is set', () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeDefined()
    })

    it('emits browseFile when clicking the browse button', async () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.browse-btn').trigger('click')
        expect(wrapper.emitted('browseFile')).toHaveLength(1)
    })

    it('inserts the local path as markdown once a path is set', async () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // 本地路径输入框为 readonly，通过组件内部状态注入路径
        ;(wrapper.vm as unknown as { localFilePath: string }).localFilePath = 'C:/notes/logo.png'
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeUndefined()
        expect(wrapper.find('.preview-image').attributes('src')).toBe('C:/notes/logo.png')

        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('insert')![0][0]).toBe('![image](C:/notes/logo.png)')
    })

    // P1-FE-03：父组件「浏览」→ 主进程选择图片（复制到 images/）→ 经 pickedImage 回填
    it('fills the picked local image from the parent and inserts the copied relative src', async () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true, pickedImage: null }
        })
        // 未选择前：本地路径为空、插入按钮禁用
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeDefined()

        await wrapper.setProps({
            pickedImage: {
                filePath: 'C:/notes/pic/logo.png',
                imageSrc: './images/logo-abc123.png'
            }
        })
        const input = wrapper.find('.path-input-wrapper input').element as HTMLInputElement
        expect(input.value).toBe('C:/notes/pic/logo.png')
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeUndefined()

        await wrapper.find('.btn-confirm').trigger('click')
        // 插入时优先使用复制后的相对引用（预览可正常解析），而非绝对路径
        expect(wrapper.emitted('insert')![0][0]).toBe('![image](./images/logo-abc123.png)')
    })

    it('falls back to the absolute path when the picked image has no copied src', async () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: {
                visible: true,
                pickedImage: { filePath: 'C:/notes/pic/logo.png', imageSrc: '' }
            }
        })
        await wrapper.vm.$nextTick()
        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('insert')![0][0]).toBe('![image](C:/notes/pic/logo.png)')
    })

    it('inserts the URL with alt text and title', async () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.tab-btn')[1].trigger('click')
        await wrapper
            .find('input[placeholder="输入图片 URL"]')
            .setValue('https://example.com/a.png')
        await wrapper.find('input[placeholder="图片描述"]').setValue('示例图片')
        await wrapper.find('input[placeholder="可选的图片标题"]').setValue('我的标题')
        await wrapper.find('.btn-confirm').trigger('click')

        expect(wrapper.emitted('insert')![0][0]).toBe(
            '![示例图片](https://example.com/a.png "我的标题")'
        )
    })

    it('switches the preview between local path and URL', async () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.tab-btn')[1].trigger('click')
        await wrapper
            .find('input[placeholder="输入图片 URL"]')
            .setValue('https://example.com/b.png')
        expect(wrapper.find('.preview-image').attributes('src')).toBe('https://example.com/b.png')
    })

    it('emits close when clicking cancel', async () => {
        const wrapper = mount(InsertImageDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('MdSheetDialog', () => {
    it('does not render the overlay when visible is false', () => {
        const wrapper = mount(MdSheetDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
    })

    it('emits a default 3x3 markdown table', async () => {
        const wrapper = mount(MdSheetDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-primary').trigger('click')
        const markdown = wrapper.emitted('insert')![0][0] as string
        // 生成的 markdown 以 \n 结尾，去掉尾部空行后按行断言
        const lines = markdown.trimEnd().split('\n')
        expect(lines).toHaveLength(5)
        expect(lines[0]).toBe('| 列1 | 列2 | 列3 |')
        expect(lines[1]).toBe('| --- | --- | --- |')
        expect(lines[2]).toBe('| 列1 | 列2 | 列3 |')
    })

    it('generates the table from custom rows and columns', async () => {
        const wrapper = mount(MdSheetDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const inputs = wrapper.findAll('input.input-style')
        await inputs[0].setValue('2')
        await inputs[1].setValue('2')
        await wrapper.find('.btn-primary').trigger('click')

        const markdown = wrapper.emitted('insert')![0][0] as string
        const lines = markdown.trimEnd().split('\n')
        expect(lines).toHaveLength(4)
        expect(lines[0]).toBe('| 列1 | 列2 |')
    })

    it('renders four align options with default selected', () => {
        const wrapper = mount(MdSheetDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const labels = wrapper.findAll('.checkbox-list label')
        expect(labels).toHaveLength(4)
        expect(labels[0].classes()).toContain('active')
        expect(labels.map((label) => label.text())).toEqual([
            '默认对齐',
            '左对齐',
            '居中对齐',
            '右对齐'
        ])
    })

    it('uses the left align marker in the generated markdown', async () => {
        const wrapper = mount(MdSheetDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // 第二个 radio 是左对齐
        await wrapper.findAll('.checkbox-list input[type="radio"]')[1].setValue()
        await wrapper.find('.btn-primary').trigger('click')

        const markdown = wrapper.emitted('insert')![0][0] as string
        expect(markdown.split('\n')[1]).toBe('| :-- | :-- | :-- |')
    })

    it('uses the center align marker in the generated markdown', async () => {
        const wrapper = mount(MdSheetDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.checkbox-list input[type="radio"]')[2].setValue()
        await wrapper.find('.btn-primary').trigger('click')

        const markdown = wrapper.emitted('insert')![0][0] as string
        expect(markdown.split('\n')[1]).toBe('| :--: | :--: | :--: |')
    })

    it('emits close when clicking cancel', async () => {
        const wrapper = mount(MdSheetDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn:not(.btn-primary)').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('MathTextDialog', () => {
    it('renders the initial LaTeX formula with katex', () => {
        const wrapper = mount(MathTextDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // katex 渲染出的 DOM 带 .katex 类
        expect(wrapper.find('.preview-container .katex').exists()).toBe(true)
    })

    it('clears the preview when the formula input becomes empty', async () => {
        const wrapper = mount(MathTextDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('#textInput').setValue('')
        expect(wrapper.find('.preview-container .katex').exists()).toBe(false)
        expect(wrapper.find('.preview-container').text()).toBe('')
    })

    it('emits an inline formula with dollar signs', async () => {
        const wrapper = mount(MathTextDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('#textInput').setValue('x^2')
        const buttons = wrapper.findAll('.btn')
        await buttons[0].trigger('click')
        expect(wrapper.emitted('insert')![0][0]).toBe('$x^2$\n')
    })

    it('emits a block formula', async () => {
        const wrapper = mount(MathTextDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('#textInput').setValue('x^2')
        await wrapper.findAll('.btn')[1].trigger('click')
        expect(wrapper.emitted('insert')![0][0]).toBe('$$\r\nx^2\r\n$$\r\n')
    })

    it('emits math, katex and latex code blocks', async () => {
        const wrapper = mount(MathTextDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('#textInput').setValue('y=ax+b')
        const buttons = wrapper.findAll('.btn')
        await buttons[2].trigger('click')
        await buttons[3].trigger('click')
        await buttons[4].trigger('click')

        const insert = wrapper.emitted('insert')!
        expect(insert[0][0]).toBe('~~~math\r\ny=ax+b\r\n~~~')
        expect(insert[1][0]).toBe('~~~katex\r\ny=ax+b\r\n~~~')
        expect(insert[2][0]).toBe('~~~latex\r\ny=ax+b\r\n~~~')
    })

    it('emits close when clicking cancel edit', async () => {
        const wrapper = mount(MathTextDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.btn')[5].trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('ImportOptionDialog', () => {
    it('does not render the overlay when visible is false', () => {
        const wrapper = mount(ImportOptionDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
    })

    it('renders three import options and disables confirm initially', () => {
        const wrapper = mount(ImportOptionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const cards = wrapper.findAll('.option-card')
        expect(cards).toHaveLength(3)
        expect(cards.map((card) => card.find('.option-title').text())).toEqual([
            '替换当前内容',
            '新建文件',
            '插入到当前位置'
        ])
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeDefined()
    })

    it('selects an option and enables the confirm button', async () => {
        const wrapper = mount(ImportOptionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const newFileCard = wrapper.findAll('.option-card')[1]
        await newFileCard.trigger('click')
        expect(newFileCard.classes()).toContain('selected')
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeUndefined()
    })

    it('emits the selected option when confirming', async () => {
        const wrapper = mount(ImportOptionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.option-card')[2].trigger('click')
        await wrapper.find('.btn-confirm').trigger('click')
        expect(wrapper.emitted('confirm')).toHaveLength(1)
        expect(wrapper.emitted('confirm')![0][0]).toBe('insert')
    })

    it('emits close when clicking cancel', async () => {
        const wrapper = mount(ImportOptionDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
