// @vitest-environment jsdom
/**
 * 1.5.7 迁移批次：迁移弹窗组件单测（`MigrationWizardDialog.vue`）
 *
 * 覆盖：
 * 1. 打开即并行加载：扫描格式统计（loading → 数据/失败重试）+ AI 配置检测；
 * 2. 迁移方式：默认不迁移；选「移动到 raw」显示顶部警告条（role=alert）与断链预警
 *    （受影响链接数量/明细可展开）；
 * 3. 迁移范围：按格式多选（显示数量与大小）；至少选一种格式才可提交；
 * 4. 编译选项：AI 未配置 → 开关禁用 + 提示条 + 「去配置 AI 助手」；已配置 → 开关可用，
 *    开启后显示范围（全量/指定目录/分批）+ 目录/批量大小校验；
 * 5. 提交：载荷正确（mode/formats）；完成视图展示迁移结果/跳过/失败明细/断链清单；
 * 6. 复制后「原文件如何处理」：保留 / 升级为移动（回滚复制 + 执行移动）；
 * 7. move 结果页回滚：二次确认 → 回滚动作 → 结果提示；
 * 8. 编译选择经 EventBus 交接（不新增 IPC）；取消/关闭语义。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import { t } from '../../../src/renderer/src/common/i18n'

const {
    scanMock,
    runMigrationMock,
    rollbackMock,
    aiStatusMock,
    completeSwitchMock,
    finishSwitchMock,
    cancelSwitchMock,
    openAiAssistantMock,
    loggerErrorMock
} = vi.hoisted(() => ({
    scanMock: vi.fn(),
    runMigrationMock: vi.fn(),
    rollbackMock: vi.fn(),
    aiStatusMock: vi.fn(),
    completeSwitchMock: vi.fn(),
    finishSwitchMock: vi.fn(),
    cancelSwitchMock: vi.fn(),
    openAiAssistantMock: vi.fn(),
    loggerErrorMock: vi.fn()
}))

vi.mock('@renderer/common/llm-wiki-migration-actions', async () => {
    const actual = await vi.importActual<
        typeof import('../../../src/renderer/src/common/llm-wiki-migration-actions')
    >('@renderer/common/llm-wiki-migration-actions')
    return {
        ...actual,
        scanWorkspaceMigratableFiles: scanMock,
        runWorkspaceMigration: runMigrationMock,
        rollbackWorkspaceMigration: rollbackMock,
        readLlmWikiAiCompileStatus: aiStatusMock
    }
})

vi.mock('@renderer/composables/useWorkspaceModeSwitch', async () => {
    const { reactive: createReactive } = await import('vue')
    return {
        workspaceModeSwitchState: createReactive({ visible: true, busy: false }),
        completeSwitchToLlmWiki: completeSwitchMock,
        finishWorkspaceModeSwitch: finishSwitchMock,
        cancelWorkspaceModeSwitch: cancelSwitchMock
    }
})

vi.mock('@renderer/components/dialogs/complex/ai-assistant-dialog-state', () => ({
    openAiAssistantDialogState: openAiAssistantMock
}))

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: loggerErrorMock, debug: vi.fn() }
}))

import MigrationWizardDialog from '../../../src/renderer/src/components/dialogs/simple/MigrationWizardDialog.vue'

/** 对话框默认 <Teleport to="body">，测试里 stub 成内联渲染以便断言 */
const mountOptions = { global: { stubs: { teleport: true } } }

let wrappers: VueWrapper[] = []
let eventEmitSpy: ReturnType<typeof vi.spyOn>

function track(wrapper: VueWrapper): VueWrapper {
    wrappers.push(wrapper)
    return wrapper
}

/** 构造扫描结果替身 */
function scanPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ok: true,
        formats: [
            { id: 'markdown', count: 2, bytes: 2048 },
            { id: 'image', count: 1, bytes: 512 },
            { id: 'pdf', count: 0, bytes: 0 },
            { id: 'html', count: 0, bytes: 0 },
            { id: 'text', count: 0, bytes: 0 }
        ],
        total: 3,
        links: {
            total: 2,
            items: [
                {
                    file: 'index.md',
                    line: 2,
                    target: 'a.md',
                    targetFile: 'a.md',
                    format: 'markdown'
                },
                {
                    file: 'index.md',
                    line: 3,
                    target: 'pic.png',
                    targetFile: 'pic.png',
                    format: 'image'
                }
            ]
        },
        ...overrides
    }
}

/** 构造迁移结果替身 */
function migratePayload(
    mode: 'copy' | 'move' = 'move',
    overrides: Record<string, unknown> = {}
): Record<string, unknown> {
    const isCopy = mode === 'copy'
    return {
        ok: true,
        mode,
        moved: isCopy
            ? []
            : [
                  {
                      path: 'C:/ws/a.md',
                      relativePath: 'a.md',
                      targetPath: 'C:/ws/raw/a.md',
                      bytes: 10
                  }
              ],
        copied: isCopy
            ? [
                  {
                      path: 'C:/ws/a.md',
                      relativePath: 'a.md',
                      targetPath: 'C:/ws/raw/a.md',
                      bytes: 10
                  },
                  {
                      path: 'C:/ws/b.md',
                      relativePath: 'b.md',
                      targetPath: 'C:/ws/raw/b.md',
                      bytes: 20
                  }
              ]
            : [],
        skipped: [{ path: 'c.md', reason: '目标已存在同名文件（不覆盖，已跳过）' }],
        failed: [{ path: 'd.md', reason: '复制失败：EACCES' }],
        logId: '20261128-120000-123',
        ...overrides
    }
}

async function mountDialog(): Promise<VueWrapper> {
    const wrapper = track(mount(MigrationWizardDialog, mountOptions) as VueWrapper)
    await flushPromises()
    return wrapper
}

beforeEach(() => {
    wrappers = []
    scanMock.mockReset()
    scanMock.mockResolvedValue(scanPayload())
    runMigrationMock.mockReset()
    runMigrationMock.mockResolvedValue(migratePayload('move'))
    rollbackMock.mockReset()
    rollbackMock.mockResolvedValue({ ok: true, restored: 1, failed: [], logId: 'log-1' })
    aiStatusMock.mockReset()
    aiStatusMock.mockResolvedValue({ configured: true, readFailed: false })
    completeSwitchMock.mockReset()
    completeSwitchMock.mockResolvedValue({ switched: true, migration: migratePayload('move') })
    finishSwitchMock.mockReset()
    cancelSwitchMock.mockReset()
    openAiAssistantMock.mockReset()
    loggerErrorMock.mockReset()
    eventEmitSpy = vi.spyOn(EventBus, '$emit').mockImplementation(() => undefined)
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
    vi.restoreAllMocks()
})

describe('MigrationWizardDialog：打开即加载与扫描降级', () => {
    it('打开时并行调用扫描与 AI 配置检测；表单渲染迁移方式（默认不迁移）', async () => {
        const wrapper = await mountDialog()

        expect(scanMock).toHaveBeenCalledTimes(1)
        expect(aiStatusMock).toHaveBeenCalledTimes(1)
        expect(wrapper.find('.migration-wizard-dialog').exists()).toBe(true)
        expect(wrapper.find('.title-text').text()).toBe(t('dialogRenderer.migrationWizard.title'))
        expect(wrapper.find('.migration-wizard-subtitle').text()).toBe(
            t('dialogRenderer.migrationWizard.subtitle')
        )
        const none = wrapper.find('[data-testid="migration-mode-none"]')
        expect((none.element as HTMLInputElement).checked).toBe(true)
        // 默认不迁移：不显示格式范围与移动警告
        expect(wrapper.find('[data-testid="format-scope"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="move-warning"]').exists()).toBe(false)
        // 主按钮：不迁移 + 不编译 = 完成初始化
        expect(wrapper.find('.btn-confirm').text()).toBe(
            t('dialogRenderer.migrationWizard.startInit')
        )
    })

    it('扫描失败：内联错误（role=alert）+ 重试按钮重新扫描', async () => {
        scanMock.mockResolvedValueOnce({
            ok: false,
            formats: [],
            total: 0,
            links: { total: 0, items: [] },
            error: '根目录不可访问'
        })
        scanMock.mockResolvedValueOnce(scanPayload())
        const wrapper = await mountDialog()

        const errorBox = wrapper.find('[data-testid="scan-error"]')
        expect(errorBox.exists()).toBe(true)
        expect(errorBox.attributes('role')).toBe('alert')
        expect(errorBox.text()).toContain('根目录不可访问')
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeDefined()

        await errorBox.find('[data-action="retry-scan"]').trigger('click')
        await flushPromises()
        expect(scanMock).toHaveBeenCalledTimes(2)
        expect(wrapper.find('[data-testid="scan-error"]').exists()).toBe(false)
    })

    it('无工作区等扫描失败时展示可读错误（error 缺省用未知错误兜底）', async () => {
        scanMock.mockResolvedValueOnce({
            ok: false,
            formats: [],
            total: 0,
            links: { total: 0, items: [] }
        })
        const wrapper = await mountDialog()
        expect(wrapper.find('[data-testid="scan-error"]').text()).toContain(
            t('dialogRenderer.migrationWizard.scanFailed', { error: t('common.unknown') })
        )
    })
})

describe('MigrationWizardDialog：迁移方式与断链预警', () => {
    it('选择「移动到 raw」：顶部警告条（role=alert）+ 链接影响预警与明细展开', async () => {
        const wrapper = await mountDialog()

        await wrapper.find('[data-testid="migration-mode-move"]').setValue(true)
        await wrapper.find('[data-testid="format-image"]').setValue(true)
        await flushPromises()

        const warning = wrapper.find('[data-testid="move-warning"]')
        expect(warning.exists()).toBe(true)
        expect(warning.attributes('role')).toBe('alert')
        expect(warning.text()).toContain(t('dialogRenderer.migrationWizard.moveWarningTitle'))

        const linkImpact = wrapper.find('[data-testid="link-impact"]')
        expect(linkImpact.exists()).toBe(true)
        expect(linkImpact.text()).toContain(
            t('dialogRenderer.migrationWizard.linkImpactTitle', { count: 2 })
        )
        expect(wrapper.find('.migration-issue-list').exists()).toBe(false)

        await wrapper.find('[data-action="toggle-link-details"]').trigger('click')
        await flushPromises()
        const items = wrapper.findAll('.migration-issue-list li')
        expect(items).toHaveLength(2)
        expect(items[0]!.text()).toContain('index.md:2 → a.md')
    })

    it('选择「复制到 raw」不显示移动警告与断链预警', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-copy"]').setValue(true)
        await flushPromises()

        expect(wrapper.find('[data-testid="move-warning"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="link-impact"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="format-scope"]').exists()).toBe(true)
        expect(wrapper.find('.btn-confirm').text()).toBe(
            t('dialogRenderer.migrationWizard.startMigrate')
        )
    })

    it('选择移动后取消格式勾选：显示至少选一种格式错误且提交禁用', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-move"]').setValue(true)
        await flushPromises()

        const markdown = wrapper.find('[data-testid="format-markdown"]')
        expect((markdown.element as HTMLInputElement).checked).toBe(true)
        await markdown.setValue(false)
        await flushPromises()

        expect(wrapper.find('[data-testid="scope-required"]').exists()).toBe(true)
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeDefined()
    })

    it('格式显示数量与大小；文件数为 0 的格式禁用', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-copy"]').setValue(true)
        await flushPromises()

        expect(wrapper.text()).toContain(
            t('dialogRenderer.migrationWizard.formatCount', { count: 2, size: '2 KB' })
        )
        expect(wrapper.text()).toContain(
            t('dialogRenderer.migrationWizard.formatCount', { count: 1, size: '512 B' })
        )
        expect(
            (wrapper.find('[data-testid="format-pdf"]').element as HTMLInputElement).disabled
        ).toBe(true)
    })

    it('无可迁移文件（total=0）：复制/移动禁用、显示提示，主按钮为完成初始化', async () => {
        scanMock.mockResolvedValueOnce(
            scanPayload({
                formats: [
                    { id: 'markdown', count: 0, bytes: 0 },
                    { id: 'image', count: 0, bytes: 0 },
                    { id: 'pdf', count: 0, bytes: 0 },
                    { id: 'html', count: 0, bytes: 0 },
                    { id: 'text', count: 0, bytes: 0 }
                ],
                total: 0,
                links: { total: 0, items: [] }
            })
        )
        const wrapper = await mountDialog()

        expect(wrapper.find('[data-testid="no-files"]').exists()).toBe(true)
        expect(
            (wrapper.find('[data-testid="migration-mode-copy"]').element as HTMLInputElement)
                .disabled
        ).toBe(true)
        expect(
            (wrapper.find('[data-testid="migration-mode-move"]').element as HTMLInputElement)
                .disabled
        ).toBe(true)
        expect(wrapper.find('.btn-confirm').text()).toBe(
            t('dialogRenderer.migrationWizard.startInit')
        )
    })
})

describe('MigrationWizardDialog：AI 配置检测与编译选项', () => {
    it('AI 未配置：编译开关禁用、提示条（role=alert）、「去配置」先关闭弹窗再打开 AI 助手', async () => {
        aiStatusMock.mockResolvedValue({ configured: false, readFailed: false })
        const wrapper = await mountDialog()

        expect(
            (wrapper.find('[data-testid="compile-enabled"]').element as HTMLInputElement).disabled
        ).toBe(true)
        const hint = wrapper.find('[data-testid="ai-not-configured"]')
        expect(hint.exists()).toBe(true)
        expect(hint.attributes('role')).toBe('alert')
        expect(hint.text()).toContain(t('dialogRenderer.migrationWizard.aiNotConfiguredTitle'))

        await hint.find('[data-action="open-ai-config"]').trigger('click')
        await flushPromises()
        expect(finishSwitchMock).toHaveBeenCalledTimes(1)
        expect(openAiAssistantMock).toHaveBeenCalledTimes(1)
    })

    it('AI 配置读取失败：按未配置处理并显示可稍后配置文案', async () => {
        aiStatusMock.mockResolvedValue({ configured: false, readFailed: true })
        const wrapper = await mountDialog()
        expect(wrapper.find('[data-testid="ai-not-configured"]').text()).toContain(
            t('dialogRenderer.migrationWizard.aiConfigFailed')
        )
        expect(
            (wrapper.find('[data-testid="compile-enabled"]').element as HTMLInputElement).disabled
        ).toBe(true)
    })

    it('AI 已配置：编译开关可用；开启后显示范围（默认分批 10）与后续批次提示', async () => {
        const wrapper = await mountDialog()
        const compileSwitch = wrapper.find('[data-testid="compile-enabled"]')
        expect((compileSwitch.element as HTMLInputElement).disabled).toBe(false)

        await compileSwitch.setValue(true)
        await flushPromises()

        expect(wrapper.find('[data-testid="compile-scope-all"]').exists()).toBe(true)
        expect(wrapper.find('[data-testid="compile-scope-directory"]').exists()).toBe(true)
        const batch = wrapper.find('[data-testid="compile-scope-batch"]')
        expect((batch.element as HTMLInputElement).checked).toBe(true)
        expect(
            (wrapper.find('[data-testid="compile-batch-size"]').element as HTMLInputElement).value
        ).toBe('10')
        expect(wrapper.text()).toContain(t('dialogRenderer.migrationWizard.compileUnavailable'))
    })

    it('指定目录编译：空目录 / 含 .. 提交时内联报错；合法目录可提交', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="compile-enabled"]').setValue(true)
        await wrapper.find('[data-testid="compile-scope-directory"]').setValue(true)
        await flushPromises()

        expect(wrapper.find('[data-testid="compile-error"]').exists()).toBe(false)
        // 目录为空 → 提交时内联报错，且不触发切换
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="compile-error"]').text()).toBe(
            t('dialogRenderer.migrationWizard.compileDirectoryInvalid')
        )
        expect(completeSwitchMock).not.toHaveBeenCalled()

        await wrapper.find('[data-testid="compile-directory"]').setValue('../outside')
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="compile-error"]').text()).toBe(
            t('dialogRenderer.migrationWizard.compileDirectoryInvalid')
        )

        await wrapper.find('[data-testid="compile-directory"]').setValue('notes/sub')
        await flushPromises()
        expect(wrapper.find('.btn-confirm').attributes('disabled')).toBeUndefined()
    })

    it('分批编译：非法批量大小（0）显示错误', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="compile-enabled"]').setValue(true)
        await flushPromises()

        await wrapper.find('[data-testid="compile-batch-size"]').setValue('0')
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="compile-error"]').text()).toBe(
            t('dialogRenderer.migrationWizard.compileBatchSizeInvalid')
        )
    })
})

describe('MigrationWizardDialog：提交与结果视图', () => {
    it('不迁移 + 不编译：提交 {mode:none,formats:[]} → 结果视图摘要 → 完成关闭', async () => {
        completeSwitchMock.mockResolvedValue({ switched: true })
        const wrapper = await mountDialog()

        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(completeSwitchMock).toHaveBeenCalledWith({ mode: 'none', formats: [] })
        expect(wrapper.find('[data-testid="result-summary"]').exists()).toBe(false)
        expect(wrapper.find('.migration-result').exists()).toBe(true)
        expect(wrapper.find('[data-testid="result-guide"]').text()).toBe(
            t('dialogRenderer.migrationWizard.resultGuide')
        )
        expect(eventEmitSpy).not.toHaveBeenCalled()

        await wrapper.find('[data-action="finish"]').trigger('click')
        expect(finishSwitchMock).toHaveBeenCalledTimes(1)
    })

    it('移动到 raw：提交迁移与格式范围；结果展示摘要/跳过/失败明细/断链清单', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-move"]').setValue(true)
        await wrapper.find('[data-testid="format-image"]').setValue(true)
        await flushPromises()

        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(completeSwitchMock).toHaveBeenCalledWith({
            mode: 'move',
            formats: ['markdown', 'image']
        })
        expect(wrapper.find('[data-testid="result-summary"]').text()).toContain(
            t('dialogRenderer.migrationWizard.resultSummary', {
                migrated: 1,
                copied: 0,
                moved: 1,
                skipped: 1,
                failed: 1
            })
        )
        // 明细默认收起，点「查看结果」展开（任务书：结果页提供「查看结果」入口）
        expect(wrapper.find('[data-testid="result-skipped"]').exists()).toBe(false)
        const toggle = wrapper.find('[data-action="toggle-result-details"]')
        expect(toggle.exists()).toBe(true)
        expect(toggle.text()).toBe(t('dialogRenderer.migrationWizard.viewResult'))
        await toggle.trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="result-skipped"]').text()).toContain('c.md')
        expect(wrapper.find('[data-testid="result-failed"]').text()).toContain('d.md')
        expect(wrapper.find('[data-action="toggle-result-details"]').text()).toBe(
            t('dialogRenderer.migrationWizard.hideResult')
        )
        // 收起后明细再次隐藏
        await wrapper.find('[data-action="toggle-result-details"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="result-skipped"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="broken-link-list"]').exists()).toBe(true)
    })

    it('切换失败：结果页展示失败原因（role=alert）', async () => {
        completeSwitchMock.mockResolvedValue({
            switched: false,
            error: '尚未打开工作区，无法扫描或迁移文件。'
        })
        const wrapper = await mountDialog()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        const failed = wrapper.find('[data-testid="switch-failed"]')
        expect(failed.exists()).toBe(true)
        expect(failed.attributes('role')).toBe('alert')
        expect(failed.text()).toContain('尚未打开工作区')
    })

    it('编译选择经 EventBus 交接（不新增 IPC），结果页明确提示由后续批次执行', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="compile-enabled"]').setValue(true)
        await wrapper.find('[data-testid="compile-batch-size"]').setValue('20')
        await flushPromises()

        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(eventEmitSpy).toHaveBeenCalledWith(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, {
            scope: 'batch',
            batchSize: 20
        })
        const recorded = wrapper.find('[data-testid="compile-request-recorded"]')
        expect(recorded.exists()).toBe(true)
        expect(recorded.text()).toContain(t('dialogRenderer.migrationWizard.compileScopeBatch'))
    })

    it('全量编译/指定目录编译的交接载荷', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="compile-enabled"]').setValue(true)
        await wrapper.find('[data-testid="compile-scope-all"]').setValue(true)
        await flushPromises()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        expect(eventEmitSpy).toHaveBeenCalledWith(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, {
            scope: 'all'
        })

        wrappers.pop()?.unmount()
        eventEmitSpy.mockClear()
        const second = await mountDialog()
        await second.find('[data-testid="compile-enabled"]').setValue(true)
        await second.find('[data-testid="compile-scope-directory"]').setValue(true)
        await second.find('[data-testid="compile-directory"]').setValue('notes')
        await flushPromises()
        await second.find('.btn-confirm').trigger('click')
        await flushPromises()
        expect(eventEmitSpy).toHaveBeenCalledWith(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, {
            scope: 'directory',
            directory: 'notes'
        })
    })

    it('迁移完成但 AI 未配置：结果页给出「配置模型后 AI 编译」引导', async () => {
        aiStatusMock.mockResolvedValue({ configured: false, readFailed: false })
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-copy"]').setValue(true)
        await flushPromises()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="configure-ai-guide"]').text()).toBe(
            t('dialogRenderer.migrationWizard.copyGuide')
        )
    })
})

describe('MigrationWizardDialog：回滚与复制后升级为移动', () => {
    it('移动迁移结果页：回滚二次确认 → 调用回滚动作 → 展示恢复数量', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-move"]').setValue(true)
        await flushPromises()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        const rollbackBlock = wrapper.find('[data-testid="rollback-block"]')
        expect(rollbackBlock.exists()).toBe(true)
        await rollbackBlock.find('[data-action="rollback"]').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="rollback-confirm"]').exists()).toBe(true)

        await wrapper.find('[data-action="confirm-rollback"]').trigger('click')
        await flushPromises()

        expect(rollbackMock).toHaveBeenCalledWith('20261128-120000-123')
        expect(wrapper.find('[data-testid="rollback-result"]').text()).toBe(
            t('dialogRenderer.migrationWizard.rollbackSuccess', { restored: 1 })
        )
    })

    it('回滚部分失败：展示冲突未回滚提示', async () => {
        rollbackMock.mockResolvedValue({
            ok: false,
            restored: 1,
            failed: [{ path: 'a.md', reason: '文件在迁移后被修改，已跳过回滚（避免误删/误移）' }],
            logId: 'log-1'
        })
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-move"]').setValue(true)
        await flushPromises()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        await wrapper.find('[data-action="rollback"]').trigger('click')
        await wrapper.find('[data-action="confirm-rollback"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="rollback-result"]').text()).toBe(
            t('dialogRenderer.migrationWizard.rollbackPartial', { restored: 1, failed: 1 })
        )
    })

    it('复制完成：结果页提供「原文件如何处理」；选择升级为移动先回滚复制再执行移动', async () => {
        completeSwitchMock.mockResolvedValue({ switched: true, migration: migratePayload('copy') })
        runMigrationMock.mockResolvedValue(migratePayload('move'))
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-copy"]').setValue(true)
        await flushPromises()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        const followUp = wrapper.find('[data-testid="copy-follow-up"]')
        expect(followUp.exists()).toBe(true)
        expect(followUp.text()).toContain(t('dialogRenderer.migrationWizard.copyFollowUpTitle'))
        expect(wrapper.find('[data-testid="copy-follow-up-keep-done"]').exists()).toBe(true)

        await wrapper.find('[data-testid="copy-follow-up-move"]').setValue(true)
        await flushPromises()
        await wrapper.find('[data-action="confirm-upgrade-move"]').trigger('click')
        await flushPromises()

        expect(rollbackMock).toHaveBeenCalledWith('20261128-120000-123')
        expect(runMigrationMock).toHaveBeenCalledWith({
            mode: 'move',
            formats: ['markdown']
        })
        // 升级后结果视图切换为移动方案：回滚入口可用、复制后续区消失
        expect(wrapper.find('[data-testid="copy-follow-up"]').exists()).toBe(false)
        expect(wrapper.find('[data-testid="rollback-block"]').exists()).toBe(true)
    })

    it('复制升级失败（回滚冲突）：展示错误并保留复制结果', async () => {
        completeSwitchMock.mockResolvedValue({ switched: true, migration: migratePayload('copy') })
        rollbackMock.mockResolvedValue({
            ok: false,
            restored: 0,
            failed: [{ path: 'a.md', reason: '文件在迁移后被修改' }]
        })
        const wrapper = await mountDialog()
        await wrapper.find('[data-testid="migration-mode-copy"]').setValue(true)
        await flushPromises()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        await wrapper.find('[data-testid="copy-follow-up-move"]').setValue(true)
        await flushPromises()
        await wrapper.find('[data-action="confirm-upgrade-move"]').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="copy-upgrade-error"]').exists()).toBe(true)
        expect(runMigrationMock).not.toHaveBeenCalled()
        expect(wrapper.find('[data-testid="copy-follow-up"]').exists()).toBe(true)
    })
})

describe('MigrationWizardDialog：取消与关闭', () => {
    it('表单阶段点击取消：调用取消（不迁移/不初始化）', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('[data-action="cancel"]').trigger('click')
        expect(cancelSwitchMock).toHaveBeenCalledTimes(1)
        expect(finishSwitchMock).not.toHaveBeenCalled()
    })

    it('右上角关闭 = 取消（表单阶段）', async () => {
        const wrapper = await mountDialog()
        await wrapper.find('.close-btn').trigger('click')
        expect(cancelSwitchMock).toHaveBeenCalledTimes(1)
    })

    it('结果阶段右上角关闭 = 完成（不重复调用取消）', async () => {
        completeSwitchMock.mockResolvedValue({ switched: true })
        const wrapper = await mountDialog()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        await wrapper.find('.close-btn').trigger('click')
        expect(finishSwitchMock).toHaveBeenCalledTimes(1)
        expect(cancelSwitchMock).not.toHaveBeenCalled()
    })
})
