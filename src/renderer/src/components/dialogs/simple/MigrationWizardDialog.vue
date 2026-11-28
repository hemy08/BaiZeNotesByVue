<template>
    <!--
        1.5.7 LLM Wiki 迁移批次（M1）：单个迁移弹窗（三处模式切换入口统一走这里）。
        - 入口：工作区模式切换（设置页 / 菜单栏 / 右侧边栏）→ useWorkspaceModeSwitch；
        - 所有用户决策集中在本弹窗：迁移方式 / 迁移范围 / 是否编译 / 编译范围；
        - 「移动到 raw」→ 顶部警告条（role=alert）+ Markdown 链接影响预警（迁移后断链）；
        - AI 未配置 → 编译开关禁用 + 提示条 + 「去配置 AI 助手」（关闭本弹窗后打开配置框）；
        - 完成后展示结果明细 + 回滚入口（move）；复制后可「升级为移动方案」；
        - 编译执行由 M2 批次提供：本弹窗只经 EventBus 交接选择并明确提示。
        使用模态 BaseDialog 外壳（UI-11：统一外壳/a11y/焦点管理，禁止复制外壳结构）。
    -->
    <BaseDialog
        :visible="true"
        :title="t('dialogRenderer.migrationWizard.title')"
        :aria-describedby="descriptionId"
        width-size="medium"
        reset-position-on-open
        :close-on-overlay="false"
        container-class="migration-wizard-dialog"
        @close="handleClose"
    >
        <div class="migration-wizard">
            <p :id="descriptionId" class="migration-wizard-subtitle">
                {{ t('dialogRenderer.migrationWizard.subtitle') }}
            </p>

            <!-- 移动到 raw/ 的顶部警告条（仅选中移动时显示） -->
            <div
                v-if="view === 'form' && migrationMode === 'move'"
                class="migration-warning migration-warning--move"
                role="alert"
                data-testid="move-warning"
            >
                <strong>{{ t('dialogRenderer.migrationWizard.moveWarningTitle') }}</strong>
                <p>{{ t('dialogRenderer.migrationWizard.moveWarningBody') }}</p>
            </div>

            <!-- 迁移前链接影响预警（移动到 raw 时，受影响链接 > 0 才显示） -->
            <div
                v-if="view === 'form' && migrationMode === 'move' && impactedLinkCount > 0"
                class="migration-info"
                role="status"
                data-testid="link-impact"
            >
                <p>
                    {{
                        t('dialogRenderer.migrationWizard.linkImpactTitle', {
                            count: impactedLinkCount
                        })
                    }}
                </p>
                <p class="migration-hint">
                    {{ t('dialogRenderer.migrationWizard.linkImpactHint') }}
                </p>
                <button
                    type="button"
                    class="migration-link-toggle"
                    data-action="toggle-link-details"
                    @click="showLinkDetails = !showLinkDetails"
                >
                    {{
                        showLinkDetails
                            ? t('dialogRenderer.migrationWizard.hideResult')
                            : t('dialogRenderer.migrationWizard.viewResult')
                    }}
                </button>
                <ul v-if="showLinkDetails" class="migration-issue-list">
                    <li
                        v-for="(link, index) in impactedLinks"
                        :key="`${link.file}:${link.line}:${index}`"
                    >
                        {{ formatLinkPosition(link) }}
                    </li>
                </ul>
            </div>

            <!-- 扫描中 -->
            <p v-if="scanLoading" class="migration-status" role="status" data-testid="scan-loading">
                {{ t('dialogRenderer.migrationWizard.loading') }}
            </p>

            <!-- 扫描失败（内联错误 + 重试，不打断弹窗） -->
            <div
                v-else-if="scanError"
                class="migration-status migration-status--error"
                role="alert"
                data-testid="scan-error"
            >
                <p>
                    {{ t('dialogRenderer.migrationWizard.scanFailed', { error: scanError }) }}
                </p>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary"
                    data-action="retry-scan"
                    @click="loadScan"
                >
                    {{ t('dialogRenderer.common.retry') }}
                </button>
            </div>

            <!-- 表单 -->
            <template v-else-if="view === 'form'">
                <section class="migration-section">
                    <h4 class="migration-section-title">
                        {{ t('dialogRenderer.migrationWizard.stepMigrationMode') }}
                    </h4>
                    <div
                        class="migration-choice-list"
                        role="radiogroup"
                        :aria-label="t('dialogRenderer.migrationWizard.stepMigrationMode')"
                    >
                        <label
                            v-for="option in migrationModeOptions"
                            :key="option.value"
                            class="migration-choice"
                            :class="{
                                'migration-choice--disabled': total === 0 && option.value !== 'none'
                            }"
                        >
                            <input
                                type="radio"
                                name="migration-mode"
                                :value="option.value"
                                :checked="migrationMode === option.value"
                                :disabled="total === 0 && option.value !== 'none'"
                                :data-testid="`migration-mode-${option.value}`"
                                @change="selectMigrationMode(option.value)"
                            />
                            <span class="migration-choice-body">
                                <span class="migration-choice-label">{{ t(option.labelKey) }}</span>
                                <small class="migration-choice-hint">{{ t(option.hintKey) }}</small>
                            </span>
                        </label>
                    </div>
                    <p v-if="total === 0" class="migration-hint" data-testid="no-files">
                        {{ t('dialogRenderer.migrationWizard.noFiles') }}
                    </p>
                    <p
                        v-else-if="scanTruncated"
                        class="migration-hint"
                        data-testid="scan-truncated"
                    >
                        {{ t('dialogRenderer.migrationWizard.truncated') }}
                    </p>
                </section>

                <!-- 迁移范围（按格式多选；不迁移时忽略范围） -->
                <section
                    v-if="migrationMode !== 'none' && total > 0"
                    class="migration-section"
                    data-testid="format-scope"
                >
                    <h4 class="migration-section-title">
                        {{ t('dialogRenderer.migrationWizard.stepScope') }}
                    </h4>
                    <p class="migration-hint">
                        {{ t('dialogRenderer.migrationWizard.scopeHint') }}
                    </p>
                    <div class="migration-checkbox-list">
                        <label
                            v-for="stat in formatStats"
                            :key="stat.id"
                            class="migration-checkbox"
                            :class="{ 'migration-choice--disabled': stat.count === 0 }"
                        >
                            <input
                                type="checkbox"
                                :value="stat.id"
                                :checked="selectedFormats.includes(stat.id)"
                                :disabled="stat.count === 0"
                                :data-testid="`format-${stat.id}`"
                                @change="toggleFormat(stat.id)"
                            />
                            <span>{{ t(formatLabelKey(stat.id)) }}</span>
                            <small class="migration-format-meta">
                                {{
                                    t('dialogRenderer.migrationWizard.formatCount', {
                                        count: stat.count,
                                        size: formatBytes(stat.bytes)
                                    })
                                }}
                            </small>
                        </label>
                    </div>
                    <p
                        v-if="selectedFormats.length === 0"
                        class="migration-error"
                        role="alert"
                        data-testid="scope-required"
                    >
                        {{ t('dialogRenderer.migrationWizard.scopeRequired') }}
                    </p>
                </section>

                <!-- 是否启动编译 + AI 配置检测 -->
                <section class="migration-section">
                    <h4 class="migration-section-title">
                        {{ t('dialogRenderer.migrationWizard.stepCompile') }}
                    </h4>
                    <label class="migration-switch">
                        <input
                            type="checkbox"
                            :checked="compileEnabled"
                            :disabled="!aiConfigured"
                            data-testid="compile-enabled"
                            @change="toggleCompile"
                        />
                        <span>{{ t('dialogRenderer.migrationWizard.compileEnable') }}</span>
                    </label>

                    <!-- AI 未配置（或配置读取失败）：提示条 + 去配置入口；编译开关禁用 -->
                    <div
                        v-if="!aiConfigured"
                        class="migration-warning migration-warning--ai"
                        role="alert"
                        data-testid="ai-not-configured"
                    >
                        <strong>{{
                            t('dialogRenderer.migrationWizard.aiNotConfiguredTitle')
                        }}</strong>
                        <p>
                            {{
                                aiConfigReadFailed
                                    ? t('dialogRenderer.migrationWizard.aiConfigFailed')
                                    : t('dialogRenderer.migrationWizard.aiNotConfiguredBody')
                            }}
                        </p>
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--secondary"
                            data-action="open-ai-config"
                            @click="handleOpenAiConfig"
                        >
                            {{ t('dialogRenderer.migrationWizard.aiConfigure') }}
                        </button>
                        <p class="migration-hint">
                            {{ t('dialogRenderer.migrationWizard.aiConfigureHint') }}
                        </p>
                    </div>

                    <!-- 编译范围（仅开关开启时显示） -->
                    <template v-if="compileEnabled && aiConfigured">
                        <div
                            class="migration-choice-list"
                            role="radiogroup"
                            :aria-label="t('dialogRenderer.migrationWizard.stepCompileScope')"
                        >
                            <label
                                v-for="option in compileScopeOptions"
                                :key="option.value"
                                class="migration-choice"
                            >
                                <input
                                    type="radio"
                                    name="compile-scope"
                                    :value="option.value"
                                    :checked="compileScope === option.value"
                                    :data-testid="`compile-scope-${option.value}`"
                                    @change="compileScope = option.value"
                                />
                                <span class="migration-choice-label">{{ t(option.labelKey) }}</span>
                            </label>
                        </div>
                        <div v-if="compileScope === 'directory'" class="migration-field">
                            <label class="migration-field-label" :for="directoryInputId">
                                {{ t('dialogRenderer.migrationWizard.compileDirectoryLabel') }}
                            </label>
                            <input
                                :id="directoryInputId"
                                v-model="compileDirectory"
                                type="text"
                                class="migration-input"
                                :placeholder="
                                    t('dialogRenderer.migrationWizard.compileDirectoryPlaceholder')
                                "
                                data-testid="compile-directory"
                            />
                        </div>
                        <div v-if="compileScope === 'batch'" class="migration-field">
                            <label class="migration-field-label" :for="batchSizeInputId">
                                {{ t('dialogRenderer.migrationWizard.compileBatchSizeLabel') }}
                            </label>
                            <input
                                :id="batchSizeInputId"
                                v-model.number="compileBatchSize"
                                type="number"
                                :min="COMPILE_BATCH_MIN"
                                :max="COMPILE_BATCH_MAX"
                                step="1"
                                class="migration-input migration-input--number"
                                data-testid="compile-batch-size"
                            />
                        </div>
                        <p
                            v-if="compileError"
                            class="migration-error"
                            role="alert"
                            data-testid="compile-error"
                        >
                            {{ compileError }}
                        </p>
                        <p class="migration-hint">
                            {{ t('dialogRenderer.migrationWizard.compileUnavailable') }}
                        </p>
                    </template>
                </section>

                <p
                    v-if="submitError"
                    class="migration-error"
                    role="alert"
                    data-testid="submit-error"
                >
                    {{ submitError }}
                </p>
            </template>

            <!-- 提交中 -->
            <p
                v-else-if="view === 'submitting'"
                class="migration-status"
                role="status"
                data-testid="submitting"
            >
                {{ t('dialogRenderer.migrationWizard.submitting') }}
            </p>

            <!-- 结果视图 -->
            <div v-else-if="view === 'result' && outcome" class="migration-result">
                <h4 class="migration-section-title">
                    {{ t('dialogRenderer.migrationWizard.resultTitle') }}
                </h4>
                <p
                    v-if="outcome.migration"
                    class="migration-result-summary"
                    role="status"
                    data-testid="result-summary"
                >
                    {{
                        t('dialogRenderer.migrationWizard.resultSummary', {
                            migrated: migratedCount,
                            copied: outcome.migration.copied.length,
                            moved: outcome.migration.moved.length,
                            skipped: outcome.migration.skipped.length,
                            failed: outcome.migration.failed.length
                        })
                    }}
                </p>
                <p
                    v-if="!outcome.switched && outcome.error"
                    class="migration-error"
                    role="alert"
                    data-testid="switch-failed"
                >
                    {{ t('dialogRenderer.migrationWizard.switchFailed', { error: outcome.error }) }}
                </p>
                <p v-if="outcome.switched" class="migration-hint" data-testid="result-guide">
                    {{ t('dialogRenderer.migrationWizard.resultGuide') }}
                </p>

                <!-- 断链清单（move 迁移后） -->
                <div
                    v-if="outcome.migration?.mode === 'move' && resultLinkImpacts.length > 0"
                    class="migration-info migration-info--result"
                    data-testid="broken-link-list"
                >
                    <p>
                        {{
                            t('dialogRenderer.migrationWizard.linkImpactTitle', {
                                count: resultLinkCount
                            })
                        }}
                    </p>
                    <p class="migration-hint">
                        {{ t('dialogRenderer.migrationWizard.linkImpactHint') }}
                    </p>
                    <ul class="migration-issue-list">
                        <li
                            v-for="(link, index) in resultLinkImpacts"
                            :key="`broken-${link.file}:${link.line}:${index}`"
                        >
                            {{ formatLinkPosition(link) }}
                        </li>
                    </ul>
                    <p v-if="resultLinkCount > resultLinkImpacts.length" class="migration-hint">
                        {{
                            t('dialogRenderer.migrationWizard.linkMore', {
                                limit: resultLinkImpacts.length,
                                total: resultLinkCount
                            })
                        }}
                    </p>
                </div>

                <!-- 逐项明细默认收起：点「查看结果」展开（任务书结果页入口） -->
                <button
                    v-if="hasResultDetails"
                    type="button"
                    class="migration-link-toggle"
                    data-action="toggle-result-details"
                    @click="showResultDetails = !showResultDetails"
                >
                    {{
                        showResultDetails
                            ? t('dialogRenderer.migrationWizard.hideResult')
                            : t('dialogRenderer.migrationWizard.viewResult')
                    }}
                </button>

                <!-- 跳过明细（默认收起） -->
                <div
                    v-if="
                        showResultDetails &&
                        outcome.migration &&
                        outcome.migration.skipped.length > 0
                    "
                    class="migration-block"
                    data-testid="result-skipped"
                >
                    <h5 class="migration-block-title">
                        {{ t('dialogRenderer.migrationWizard.resultSkipped') }}
                    </h5>
                    <ul class="migration-issue-list">
                        <li
                            v-for="(issue, index) in outcome.migration.skipped"
                            :key="`skipped-${issue.path}-${index}`"
                        >
                            {{ issue.path }} — {{ issue.reason }}
                        </li>
                    </ul>
                </div>

                <!-- 失败明细（默认收起） -->
                <div
                    v-if="
                        showResultDetails &&
                        outcome.migration &&
                        outcome.migration.failed.length > 0
                    "
                    class="migration-block"
                    data-testid="result-failed"
                >
                    <h5 class="migration-block-title">
                        {{ t('dialogRenderer.migrationWizard.resultFailed') }}
                    </h5>
                    <ul class="migration-issue-list">
                        <li
                            v-for="(issue, index) in outcome.migration.failed"
                            :key="`failed-${issue.path}-${index}`"
                        >
                            {{ issue.path }} — {{ issue.reason }}
                        </li>
                    </ul>
                </div>

                <!-- 复制完成后的「原文件如何处理」（§7.5 ②） -->
                <div
                    v-if="copyFollowUpVisible"
                    class="migration-block"
                    data-testid="copy-follow-up"
                >
                    <h5 class="migration-block-title">
                        {{ t('dialogRenderer.migrationWizard.copyFollowUpTitle') }}
                    </h5>
                    <div class="migration-choice-list">
                        <label class="migration-choice">
                            <input
                                type="radio"
                                name="copy-follow-up"
                                value="keep"
                                :checked="copyFollowUpChoice === 'keep'"
                                data-testid="copy-follow-up-keep"
                                @change="copyFollowUpChoice = 'keep'"
                            />
                            <span class="migration-choice-label">
                                {{ t('dialogRenderer.migrationWizard.copyFollowUpKeep') }}
                            </span>
                        </label>
                        <label class="migration-choice">
                            <input
                                type="radio"
                                name="copy-follow-up"
                                value="move"
                                :checked="copyFollowUpChoice === 'move'"
                                :disabled="copyUpgrading"
                                data-testid="copy-follow-up-move"
                                @change="copyFollowUpChoice = 'move'"
                            />
                            <span class="migration-choice-label">
                                {{ t('dialogRenderer.migrationWizard.copyFollowUpMove') }}
                            </span>
                        </label>
                        <label class="migration-choice migration-choice--disabled">
                            <input type="radio" name="copy-follow-up" value="delete" disabled />
                            <span class="migration-choice-label">
                                {{ t('dialogRenderer.migrationWizard.copyFollowUpDelete') }}
                            </span>
                        </label>
                    </div>
                    <p class="migration-hint">
                        {{ t('dialogRenderer.migrationWizard.copyFollowUpHint') }}
                    </p>
                    <div
                        v-if="copyFollowUpChoice === 'move' && !copyUpgradeApplied"
                        class="migration-confirm"
                    >
                        <p>
                            {{
                                t('dialogRenderer.migrationWizard.copyFollowUpMoveConfirmBody', {
                                    count: outcome.migration?.copied.length ?? 0
                                })
                            }}
                        </p>
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--primary"
                            :disabled="copyUpgrading"
                            data-action="confirm-upgrade-move"
                            @click="upgradeCopyToMove"
                        >
                            {{
                                copyUpgrading
                                    ? t('dialogRenderer.migrationWizard.copyFollowUpMoving')
                                    : t('dialogRenderer.migrationWizard.copyFollowUpMoveConfirm')
                            }}
                        </button>
                    </div>
                    <p
                        v-else-if="copyFollowUpChoice === 'keep'"
                        class="migration-hint"
                        data-testid="copy-follow-up-keep-done"
                    >
                        {{ t('dialogRenderer.migrationWizard.copyFollowUpKeepDone') }}
                    </p>
                    <p
                        v-if="copyUpgradeError"
                        class="migration-error"
                        role="alert"
                        data-testid="copy-upgrade-error"
                    >
                        {{ copyUpgradeError }}
                    </p>
                </div>

                <!-- 编译选择交接提示（M2 批次执行） -->
                <p
                    v-if="compileRequested"
                    class="migration-hint"
                    data-testid="compile-request-recorded"
                >
                    {{
                        t('dialogRenderer.migrationWizard.compileRequestRecorded', {
                            scope: compileScopeLabel
                        })
                    }}
                </p>
                <p
                    v-else-if="outcome.switched && hasMigratedFiles && !aiConfigured"
                    class="migration-hint"
                    data-testid="configure-ai-guide"
                >
                    {{ t('dialogRenderer.migrationWizard.copyGuide') }}
                </p>

                <!-- 回滚（move 迁移且存在操作日志） -->
                <div
                    v-if="canRollback && !rollbackResult"
                    class="migration-block"
                    data-testid="rollback-block"
                >
                    <div v-if="!rollbackConfirmVisible">
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--secondary"
                            data-action="rollback"
                            @click="rollbackConfirmVisible = true"
                        >
                            {{ t('dialogRenderer.migrationWizard.rollback') }}
                        </button>
                    </div>
                    <div v-else class="migration-confirm" data-testid="rollback-confirm">
                        <p>{{ t('dialogRenderer.migrationWizard.rollbackConfirmTitle') }}</p>
                        <p class="migration-hint">
                            {{
                                t('dialogRenderer.migrationWizard.rollbackConfirmBody', {
                                    move: outcome.migration?.moved.length ?? 0,
                                    copy: outcome.migration?.copied.length ?? 0
                                })
                            }}
                        </p>
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--primary"
                            :disabled="rollbackRunning"
                            data-action="confirm-rollback"
                            @click="executeRollback"
                        >
                            {{
                                rollbackRunning
                                    ? t('dialogRenderer.migrationWizard.rollbackRunning')
                                    : t('dialogRenderer.migrationWizard.rollback')
                            }}
                        </button>
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--secondary"
                            :disabled="rollbackRunning"
                            data-action="cancel-rollback"
                            @click="rollbackConfirmVisible = false"
                        >
                            {{ t('common.cancel') }}
                        </button>
                    </div>
                </div>
                <p
                    v-if="rollbackResult"
                    :class="[
                        'migration-status',
                        rollbackResult.ok ? '' : 'migration-status--error'
                    ]"
                    :role="rollbackResult.ok ? 'status' : 'alert'"
                    data-testid="rollback-result"
                >
                    {{
                        rollbackResult.ok
                            ? t('dialogRenderer.migrationWizard.rollbackSuccess', {
                                  restored: rollbackResult.restored
                              })
                            : t('dialogRenderer.migrationWizard.rollbackPartial', {
                                  restored: rollbackResult.restored,
                                  failed: rollbackResult.failed.length
                              })
                    }}
                </p>
            </div>
        </div>

        <template #footer>
            <template v-if="view === 'form'">
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    data-action="cancel"
                    @click="handleClose"
                >
                    {{ t('common.cancel') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--primary btn btn-confirm"
                    data-action="submit"
                    :disabled="!canSubmit"
                    @click="submit"
                >
                    {{ primaryButtonLabel }}
                </button>
            </template>
            <template v-else-if="view === 'result'">
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    data-action="finish"
                    @click="handleClose"
                >
                    {{ t('common.close') }}
                </button>
            </template>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 迁移弹窗（1.5.7 LLM Wiki 迁移批次 M1）。
 *
 * ## 结构（单个弹窗，全部决策现场选择，不预置隐藏默认）
 * ① 迁移方式：不迁移（默认）/ 复制到 raw/ / 移动到 raw/（顶部警告条 + 断链预警）；
 * ② 迁移范围：按文件格式多选（显示数量与大小；至少一种格式才可迁移）；
 * ③ 是否启动编译：开关（默认关；AI 未配置时禁用 + 提示条 + 「去配置 AI 助手」）；
 * ④ 编译范围：全量 / 指定目录 / 分批（每批大小可设，默认 10）；仅开关开启时显示；
 * ⑤ 完成视图：迁移结果明细 + 断链清单 + 回滚入口（move）+ 复制后「原文件如何处理」。
 *
 * ## 职责边界
 * - 迁移/初始化/写配置的编排在 `useWorkspaceModeSwitch.completeSwitchToLlmWiki()`
 *   （本组件只收集决策 + 展示结果 + 触发回滚）；
 * - 编译执行不在本批实现：经 EventBus `LLM_WIKI_COMPILE_REQUEST` 把选择交接给 M2 批量
 *   编译批次，并在界面明确提示「编译由后续批次执行」，不静默丢失用户选择；
 * - AI 配置读取复用既有 `AI.GET_CONFIG`（`readLlmWikiAiCompileStatus`），不新增 IPC；
 * - 回滚/复制升级复用 `IPC.LLM_WIKI.*` 通道（不新增 IPC）。
 *
 * ## 测试锚点
 * 关键交互元素带 `data-testid` / `data-action`；结果/错误区带 role=status/alert，
 * 组件测试据此断言（见 tests/unit/vue/migration-wizard-dialog.test.ts）。
 */
import { computed, onMounted, ref, useId, watch } from 'vue'
import { t } from '@renderer/common/i18n'
import { logger } from '@renderer/common/logger'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import BaseDialog from '../BaseDialog.vue'
import { openAiAssistantDialogState } from '../complex/ai-assistant-dialog-state'
import {
    formatLlmWikiMigrationBytes,
    normalizeCompileBatchSize,
    normalizeCompileDirectoryInput,
    LLM_WIKI_COMPILE_BATCH_SIZE_DEFAULT,
    LLM_WIKI_COMPILE_BATCH_SIZE_MAX,
    LLM_WIKI_COMPILE_BATCH_SIZE_MIN,
    readLlmWikiAiCompileStatus,
    rollbackWorkspaceMigration,
    runWorkspaceMigration,
    scanWorkspaceMigratableFiles,
    type LlmWikiCompileRequest,
    type LlmWikiCompileScope
} from '../../../common/llm-wiki-migration-actions'
import {
    cancelWorkspaceModeSwitch,
    completeSwitchToLlmWiki,
    finishWorkspaceModeSwitch,
    workspaceModeSwitchState,
    type LlmWikiMigrationChoice,
    type LlmWikiSwitchOutcome
} from '../../../composables/useWorkspaceModeSwitch'
import type {
    LlmWikiLinkImpact,
    LlmWikiMigratableFormatId,
    LlmWikiRollbackResult,
    LlmWikiScanResult
} from '../../../../../shared/types/ipc'

/** 弹窗视图状态（form = 决策表单；submitting = 提交中；result = 结果视图） */
type DialogView = 'form' | 'submitting' | 'result'

/** 编译范围选项（与 LlmWikiCompileScope 对应） */
const COMPILE_SCOPE_OPTIONS: ReadonlyArray<{ value: LlmWikiCompileScope; labelKey: string }> = [
    { value: 'all', labelKey: 'dialogRenderer.migrationWizard.compileScopeAll' },
    { value: 'directory', labelKey: 'dialogRenderer.migrationWizard.compileScopeDirectory' },
    { value: 'batch', labelKey: 'dialogRenderer.migrationWizard.compileScopeBatch' }
]

/** 迁移方式选项（与 LlmWikiMigrationChoice 对应） */
const MIGRATION_MODE_OPTIONS: ReadonlyArray<{
    value: LlmWikiMigrationChoice
    labelKey: string
    hintKey: string
}> = [
    {
        value: 'none',
        labelKey: 'dialogRenderer.migrationWizard.modeNone',
        hintKey: 'dialogRenderer.migrationWizard.modeNoneHint'
    },
    {
        value: 'copy',
        labelKey: 'dialogRenderer.migrationWizard.modeCopy',
        hintKey: 'dialogRenderer.migrationWizard.modeCopyHint'
    },
    {
        value: 'move',
        labelKey: 'dialogRenderer.migrationWizard.modeMove',
        hintKey: 'dialogRenderer.migrationWizard.modeMoveHint'
    }
]

/** 格式 id → i18n 文案键（固定 5 类，与主进程口径一致） */
const FORMAT_LABEL_KEYS: Readonly<Record<LlmWikiMigratableFormatId, string>> = {
    markdown: 'dialogRenderer.migrationWizard.formatMarkdown',
    image: 'dialogRenderer.migrationWizard.formatImage',
    pdf: 'dialogRenderer.migrationWizard.formatPdf',
    html: 'dialogRenderer.migrationWizard.formatHtml',
    text: 'dialogRenderer.migrationWizard.formatText'
}

/** 编译批次默认大小 */
const DEFAULT_BATCH_SIZE = LLM_WIKI_COMPILE_BATCH_SIZE_DEFAULT

const descriptionId = useId()
const directoryInputId = useId()
const batchSizeInputId = useId()

const view = ref<DialogView>('form')
const scanLoading = ref(true)
const scanError = ref<string | null>(null)
const scanResult = ref<LlmWikiScanResult | null>(null)
const migrationMode = ref<LlmWikiMigrationChoice>('none')
const selectedFormats = ref<LlmWikiMigratableFormatId[]>([])
const compileEnabled = ref(false)
const compileScope = ref<LlmWikiCompileScope>('batch')
const compileDirectory = ref('')
const compileBatchSize = ref(DEFAULT_BATCH_SIZE)
const compileError = ref<string | null>(null)
const submitError = ref<string | null>(null)
const outcome = ref<LlmWikiSwitchOutcome | null>(null)
const showLinkDetails = ref(false)
/** 结果页逐项明细（跳过/失败）默认收起，由「查看结果」按钮展开 */
const showResultDetails = ref(false)
const compileRequested = ref<LlmWikiCompileRequest | null>(null)
const rolledBack = ref(false)
const rollbackConfirmVisible = ref(false)
const rollbackRunning = ref(false)
const rollbackResult = ref<LlmWikiRollbackResult | null>(null)
/** AI 配置状态：null=检测中；configured=已配置可用模型 */
const aiConfigured = ref(false)
const aiConfigReadFailed = ref(false)
/** 提交时的格式快照（复制后升级为移动方案时复用同一范围） */
const submittedFormats = ref<LlmWikiMigratableFormatId[]>([])
/** 复制迁移结果页「原文件如何处理」选择（keep / move；delete 本批延后） */
const copyFollowUpChoice = ref<'keep' | 'move'>('keep')
const copyUpgrading = ref(false)
const copyUpgradeApplied = ref(false)
const copyUpgradeError = ref<string | null>(null)

/** 迁移方式选项（模板 v-for） */
const migrationModeOptions = MIGRATION_MODE_OPTIONS
/** 编译范围选项（模板 v-for） */
const compileScopeOptions = COMPILE_SCOPE_OPTIONS

/** 格式统计（固定 5 类；扫描未完成时按 0 渲染） */
const formatStats = computed(
    () =>
        scanResult.value?.formats ?? [
            { id: 'markdown' as const, count: 0, bytes: 0 },
            { id: 'image' as const, count: 0, bytes: 0 },
            { id: 'pdf' as const, count: 0, bytes: 0 },
            { id: 'html' as const, count: 0, bytes: 0 },
            { id: 'text' as const, count: 0, bytes: 0 }
        ]
)
/** 可迁移文件总数 */
const total = computed(() => scanResult.value?.total ?? 0)
/** 扫描是否被上限截断 */
const scanTruncated = computed(() => scanResult.value?.truncated === true)

/** 选中格式的链接影响明细（move 预警：按所选格式过滤） */
const impactedLinks = computed<LlmWikiLinkImpact[]>(() => {
    const items = scanResult.value?.links.items ?? []
    if (migrationMode.value === 'none') {
        return []
    }
    return items.filter((item) => selectedFormats.value.includes(item.format))
})

/** 选中格式的受影响链接总数（按目标格式汇总；items 截断时按可见条数兜底提示） */
const impactedLinkCount = computed(() => {
    const items = scanResult.value?.links.items ?? []
    const totalLinks = scanResult.value?.links.total ?? 0
    if (migrationMode.value === 'none') {
        return 0
    }
    if (items.length >= totalLinks) {
        return items.filter((item) => selectedFormats.value.includes(item.format)).length
    }
    // 明细被截断：按格式占比无法精确拆分，展示可见条数（偏保守，不会夸大）
    return items.filter((item) => selectedFormats.value.includes(item.format)).length
})

/** 结果页断链清单（move 迁移后展示） */
const resultLinkImpacts = computed<LlmWikiLinkImpact[]>(() => {
    if (!outcome.value?.migration || outcome.value.migration.mode !== 'move') {
        return []
    }
    return impactedLinks.value
})

/** 结果页断链总数（按提交时的格式快照过滤） */
const resultLinkCount = computed(() => {
    const items = scanResult.value?.links.items ?? []
    const totalLinks = scanResult.value?.links.total ?? 0
    if (items.length >= totalLinks) {
        const formats = submittedFormats.value
        return items.filter((item) => formats.includes(item.format)).length
    }
    return items.filter((item) => submittedFormats.value.includes(item.format)).length
})

/** 是否展示复制后的「原文件如何处理」 */
const copyFollowUpVisible = computed(
    () =>
        outcome.value?.switched === true &&
        outcome.value.migration?.mode === 'copy' &&
        (outcome.value.migration?.copied.length ?? 0) > 0 &&
        !rolledBack.value
)

/** 是否存在可展开的结果明细（跳过/失败逐项清单） */
const hasResultDetails = computed(() => {
    const migration = outcome.value?.migration
    return Boolean(migration && (migration.skipped.length > 0 || migration.failed.length > 0))
})

/** 本次是否成功迁移了文件（结果页引导文案用） */
const hasMigratedFiles = computed(() => {
    const migration = outcome.value?.migration
    return Boolean(migration && migration.moved.length + migration.copied.length > 0)
})

/** 迁移文件数（结果摘要） */
const migratedCount = computed(() => {
    const migration = outcome.value?.migration
    return migration ? migration.moved.length + migration.copied.length : 0
})

/** 是否可回滚（move 迁移 + 有操作日志 + 尚未回滚） */
const canRollback = computed(
    () =>
        outcome.value?.migration?.mode === 'move' &&
        Boolean(outcome.value?.migration?.logId) &&
        !rolledBack.value
)

/** 主按钮文案：不迁移 + 不编译 → 「完成初始化」；否则「开始迁移」/「开始迁移并初始化」 */
const primaryButtonLabel = computed(() => {
    if (migrationMode.value === 'none' && !compileEnabled.value) {
        return t('dialogRenderer.migrationWizard.startInit')
    }
    return t('dialogRenderer.migrationWizard.startMigrate')
})

/** 是否可提交（表单校验通过） */
const canSubmit = computed(() => {
    if (scanLoading.value || scanError.value !== null) {
        return false
    }
    if (migrationMode.value !== 'none') {
        if (total.value === 0 || selectedFormats.value.length === 0) {
            return false
        }
    }
    // 编译范围输入不阻断按钮（否则内联校验错误永远无法触发）：提交时校验并展示错误
    return true
})

/** 编译范围展示文案（结果页「已记录编译选择」） */
const compileScopeLabel = computed(() => {
    const request = compileRequested.value
    if (!request) {
        return ''
    }
    if (request.scope === 'directory') {
        return `${t('dialogRenderer.migrationWizard.compileScopeDirectory')}（${request.directory ?? ''}）`
    }
    if (request.scope === 'batch') {
        return `${t('dialogRenderer.migrationWizard.compileScopeBatch')}（${request.batchSize ?? DEFAULT_BATCH_SIZE}）`
    }
    return t('dialogRenderer.migrationWizard.compileScopeAll')
})

/** 格式 id 的文案键 */
function formatLabelKey(format: LlmWikiMigratableFormatId): string {
    return FORMAT_LABEL_KEYS[format]
}

/** 字节数格式化（统一实现见 common/llm-wiki-migration-actions，便于单测覆盖） */
function formatBytes(bytes: number): string {
    return formatLlmWikiMigrationBytes(bytes)
}

/** 链接位置展示（文件:行 → 目标） */
function formatLinkPosition(link: LlmWikiLinkImpact): string {
    return t('dialogRenderer.migrationWizard.linkItem', {
        file: link.file,
        line: link.line,
        target: link.target
    })
}

/** 切换迁移方式（同时清理与模式无关的校验错误） */
function selectMigrationMode(mode: LlmWikiMigrationChoice): void {
    migrationMode.value = mode
    submitError.value = null
    if (mode === 'none') {
        selectedFormats.value = []
    } else if (selectedFormats.value.length === 0) {
        selectedFormats.value = defaultFormatSelection(formatStats.value)
    }
}

/** 勾选/取消格式（至少保留一种；取消最后一种时显示内联错误） */
function toggleFormat(format: LlmWikiMigratableFormatId): void {
    const index = selectedFormats.value.indexOf(format)
    if (index >= 0) {
        selectedFormats.value = selectedFormats.value.filter((item) => item !== format)
    } else {
        selectedFormats.value = [...selectedFormats.value, format]
    }
}

/** 切换编译开关（关闭时清理编译范围错误） */
function toggleCompile(): void {
    compileEnabled.value = !compileEnabled.value
    compileError.value = null
}

/**
 * 默认迁移范围：Markdown 优先（方案确认默认勾选）；无 Markdown 时回退第一个有文件的格式。
 */
function defaultFormatSelection(
    stats: ReadonlyArray<{ id: LlmWikiMigratableFormatId; count: number }>
): LlmWikiMigratableFormatId[] {
    const markdown = stats.find((stat) => stat.id === 'markdown')
    if (markdown && markdown.count > 0) {
        return ['markdown']
    }
    const firstAvailable = stats.find((stat) => stat.count > 0)
    return firstAvailable ? [firstAvailable.id] : []
}

/** 归一化编译目录输入（空/绝对/含 `..` 返回 null） */
const COMPILE_BATCH_MIN = LLM_WIKI_COMPILE_BATCH_SIZE_MIN
const COMPILE_BATCH_MAX = LLM_WIKI_COMPILE_BATCH_SIZE_MAX

/** 校验编译范围输入：null = 合法；返回文案 = 非法 */
function validateCompileInput(): string | null {
    if (!compileEnabled.value) {
        return null
    }
    if (
        compileScope.value === 'directory' &&
        normalizeCompileDirectoryInput(compileDirectory.value) === null
    ) {
        return t('dialogRenderer.migrationWizard.compileDirectoryInvalid')
    }
    if (
        compileScope.value === 'batch' &&
        normalizeCompileBatchSize(compileBatchSize.value) === null
    ) {
        return t('dialogRenderer.migrationWizard.compileBatchSizeInvalid')
    }
    return null
}

/** 扫描当前工作区可迁移文件（失败内联提示 + 重试） */
async function loadScan(): Promise<void> {
    scanLoading.value = true
    scanError.value = null
    try {
        const result = await scanWorkspaceMigratableFiles()
        if (!result.ok) {
            scanError.value = result.error ?? t('common.unknown')
            scanResult.value = result
            return
        }
        scanResult.value = result
        // 迁移方式默认「不迁移」；格式范围默认 Markdown（用户切到复制/移动时才生效）
        selectedFormats.value = defaultFormatSelection(result.formats)
    } catch (error) {
        logger.error('[LlmWiki迁移] 扫描异常：', error)
        scanError.value = t('common.unknown')
    } finally {
        scanLoading.value = false
    }
}

/** 检测 AI 编译可用性（未配置 → 编译开关禁用并提示去配置） */
async function loadAiStatus(): Promise<void> {
    try {
        const status = await readLlmWikiAiCompileStatus()
        aiConfigured.value = status.configured
        aiConfigReadFailed.value = status.readFailed
        if (!status.configured) {
            compileEnabled.value = false
        }
    } catch (error) {
        logger.warn('[LlmWiki迁移] 读取 AI 配置失败，按未配置处理：', error)
        aiConfigured.value = false
        aiConfigReadFailed.value = true
        compileEnabled.value = false
    }
}

/** 打开「AI 助手」配置对话框（先关闭本弹窗，避免叠层；用户可稍后重新切换） */
function handleOpenAiConfig(): void {
    if (workspaceModeSwitchState.busy) {
        return
    }
    finishWorkspaceModeSwitch()
    openAiAssistantDialogState()
}

/** 构造编译请求交接载荷（校验通过后调用） */
function buildCompileRequest(): LlmWikiCompileRequest | null {
    if (!compileEnabled.value) {
        return null
    }
    if (compileScope.value === 'directory') {
        const directory = normalizeCompileDirectoryInput(compileDirectory.value)
        return directory ? { scope: 'directory', directory } : null
    }
    if (compileScope.value === 'batch') {
        const batchSize = normalizeCompileBatchSize(compileBatchSize.value)
        return batchSize ? { scope: 'batch', batchSize } : null
    }
    return { scope: 'all' }
}

/** 提交：迁移（可选）→ 初始化 → 写配置；编译选择经 EventBus 交接（M2 执行） */
async function submit(): Promise<void> {
    if (view.value === 'submitting' || !canSubmit.value) {
        return
    }
    submitError.value = null
    if (migrationMode.value !== 'none' && selectedFormats.value.length === 0) {
        submitError.value = t('dialogRenderer.migrationWizard.scopeRequired')
        return
    }
    const compileValidationError = validateCompileInput()
    if (compileValidationError !== null) {
        compileError.value = compileValidationError
        return
    }
    compileError.value = null
    submittedFormats.value = migrationMode.value === 'none' ? [] : [...selectedFormats.value]
    view.value = 'submitting'
    let closeImmediately = false
    try {
        const result = await completeSwitchToLlmWiki({
            mode: migrationMode.value,
            formats: submittedFormats.value
        })
        outcome.value = result
        if (result.switched && compileEnabled.value) {
            const request = buildCompileRequest()
            if (request) {
                compileRequested.value = request
                // M1 只交接选择（不执行编译）；M2 批量编译队列批次新增订阅方
                EventBus.$emit(EVENT_BUS.LLM_WIKI_COMPILE_REQUEST, request)
            }
        }
        // 不迁移模式没有迁移内容可展示：切换成功后直接关闭弹窗，不进入「迁移完成」结果页
        closeImmediately = migrationMode.value === 'none' && result.switched
    } catch (error) {
        logger.error('[LlmWiki迁移] 提交切换异常：', error)
        outcome.value = { switched: false, error: t('common.unknown') }
    } finally {
        if (closeImmediately) {
            finishWorkspaceModeSwitch()
        } else {
            view.value = 'result'
        }
    }
}

/** 执行回滚（move 迁移；冲突项逐项报告、不阻塞） */
async function executeRollback(): Promise<void> {
    const logId = outcome.value?.migration?.logId
    if (!logId || rollbackRunning.value) {
        return
    }
    rollbackRunning.value = true
    try {
        const result = await rollbackWorkspaceMigration(logId)
        rollbackResult.value = result
        if (result.ok || result.restored > 0) {
            rolledBack.value = true
            rollbackConfirmVisible.value = false
        }
    } catch (error) {
        logger.error('[LlmWiki迁移] 回滚异常：', error)
        rollbackResult.value = {
            ok: false,
            restored: 0,
            failed: [],
            error: t('common.unknown')
        }
    } finally {
        rollbackRunning.value = false
    }
}

/**
 * 复制迁移完成后升级为移动方案（§7.5 ②）：
 * 先回滚复制（删除 raw/ 中的复制体）→ 再以同一格式范围执行移动迁移。
 * 回滚冲突（复制体被修改）时中止，原文件保持不动，逐项报告。
 */
async function upgradeCopyToMove(): Promise<void> {
    const migration = outcome.value?.migration
    if (!migration || migration.mode !== 'copy' || copyUpgrading.value) {
        return
    }
    copyUpgradeError.value = null
    copyUpgrading.value = true
    try {
        const formats = submittedFormats.value
        if (formats.length === 0) {
            copyUpgradeError.value = t('dialogRenderer.migrationWizard.scopeRequired')
            return
        }
        const rollback = await rollbackWorkspaceMigration(migration.logId)
        if (!rollback.ok || rollback.failed.length > 0) {
            const failedCount = rollback.failed.length
            copyUpgradeError.value = t('dialogRenderer.migrationWizard.rollbackPartial', {
                restored: rollback.restored,
                failed: failedCount
            })
            return
        }
        const moveResult = await runWorkspaceMigration({ mode: 'move', formats })
        if (!moveResult.ok) {
            copyUpgradeError.value = t('dialogRenderer.migrationWizard.switchFailed', {
                error: moveResult.error ?? t('common.unknown')
            })
            return
        }
        outcome.value = { switched: outcome.value?.switched === true, migration: moveResult }
        copyUpgradeApplied.value = true
        copyUpgradeError.value = null
    } catch (error) {
        logger.error('[LlmWiki迁移] 升级为移动方案异常：', error)
        copyUpgradeError.value = t('common.unknown')
    } finally {
        copyUpgrading.value = false
    }
}

/** 关闭弹窗：表单阶段 = 取消（不写配置）；结果阶段 = 完成（模式已切换） */
function handleClose(): void {
    if (workspaceModeSwitchState.busy || view.value === 'submitting') {
        return
    }
    if (view.value === 'result') {
        finishWorkspaceModeSwitch()
        return
    }
    cancelWorkspaceModeSwitch()
}

onMounted(() => {
    void loadScan()
    void loadAiStatus()
})

// AI 配置读取完成后若开关曾被开启但不可用，强制关闭（防御异步竞态）
watch(aiConfigured, (configured) => {
    if (!configured) {
        compileEnabled.value = false
    }
})
</script>

<style scoped>
/* 正文内边距走密度令牌（--ui-pad 8/12/16），颜色走语义令牌（四风格 × 三密度零硬编码） */
.migration-wizard {
    padding: var(--ui-pad, 12px);
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad, 12px);
    max-height: 68vh;
    overflow: auto;
    font-size: var(--ui-font-size, 13px);
    color: var(--ui-text, var(--theme-text-color));
}

.migration-wizard-subtitle {
    margin: 0;
    color: var(--ui-text-secondary, var(--text-color));
    line-height: 1.6;
}

.migration-warning,
.migration-info {
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 6px);
    padding: var(--ui-pad, 12px);
    background: var(--ui-bg-sunken, var(--card-bg));
    line-height: 1.6;
}

.migration-warning {
    border-left: 3px solid var(--ui-warning, var(--accent-color));
}

.migration-warning strong {
    color: var(--ui-warning, var(--accent-color));
    display: block;
    margin-bottom: 4px;
}

.migration-warning p,
.migration-info p {
    margin: 4px 0;
}

.migration-section {
    border-top: 1px solid var(--ui-border, var(--border-color));
    padding-top: var(--ui-pad, 12px);
}

.migration-section:first-of-type {
    border-top: none;
    padding-top: 0;
}

.migration-section-title {
    margin: 0 0 8px;
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
}

.migration-choice-list,
.migration-checkbox-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.migration-choice,
.migration-checkbox,
.migration-switch {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    cursor: pointer;
    line-height: 1.5;
}

.migration-choice--disabled {
    cursor: not-allowed;
    opacity: 0.6;
}

.migration-choice-body {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.migration-choice-label {
    font-weight: 500;
}

.migration-choice-hint,
.migration-hint,
.migration-format-meta {
    color: var(--ui-text-secondary, var(--text-color));
    font-size: calc(var(--ui-font-size, 13px) - 1px);
}

.migration-format-meta {
    margin-left: auto;
    white-space: nowrap;
}

.migration-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 8px;
}

.migration-field-label {
    font-size: calc(var(--ui-font-size, 13px) - 1px);
    color: var(--ui-text-secondary, var(--text-color));
}

.migration-input {
    width: 100%;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 6px);
    background: var(--ui-surface, var(--bg-color));
    color: inherit;
    font: inherit;
}

.migration-input--number {
    max-width: 120px;
}

.migration-status {
    margin: 0;
    line-height: 1.6;
    color: var(--ui-text-secondary, var(--text-color));
}

.migration-status--error {
    color: var(--ui-danger, var(--danger-color));
}

.migration-error {
    margin: 4px 0;
    color: var(--ui-danger, var(--danger-color));
    line-height: 1.6;
}

.migration-link-toggle {
    background: none;
    border: none;
    padding: 0;
    color: var(--ui-accent, var(--accent-color));
    cursor: pointer;
    font: inherit;
    text-decoration: underline;
}

.migration-issue-list {
    margin: 6px 0 0;
    padding-left: 18px;
    max-height: 160px;
    overflow: auto;
    line-height: 1.6;
}

.migration-result {
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad, 12px);
}

.migration-block {
    border-top: 1px solid var(--ui-border, var(--border-color));
    padding-top: var(--ui-pad, 12px);
}

.migration-block-title {
    margin: 0 0 6px;
    font-size: calc(var(--ui-font-size, 13px) + 1px);
    font-weight: 600;
}

.migration-confirm {
    margin-top: 8px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
}

.migration-confirm p {
    margin: 0;
    flex-basis: 100%;
    line-height: 1.6;
}

.migration-result-summary {
    margin: 0;
    line-height: 1.6;
}
</style>
