/**
 * 设置页 panel 的字段桥接（设置页拆分 P0）
 *
 * 背景：4 个页签拆分前共用一个 `settings` 响应式对象，模板里直接 `v-model="settings.x"`。
 * 拆分后草稿仍由壳层（useSystemSettingForm）唯一持有，panel 通过 `:settings` 只读接收；
 * 为避免子组件直接改 props（破坏单向数据流），本模块把「字段读取 + 变更上报」包装为
 * 可写 computed：模板仍写 `v-model="字段"`（含 `v-model.number` 语义），set 时向壳层
 * emit `update` 补丁，由壳层浅合并回共享草稿。
 *
 * 4 个 panel 的对外契约（见各组件 script 顶部）：
 * - props：`settings: SystemDialogSettings`（必填，壳层共享草稿）；
 * - emits：`(e: 'update', patch: Partial<SystemDialogSettings>)`；外观/备份页签另有
 *   面板级事件（open-theme-setting / reload）。
 */
import { computed } from 'vue'
import type { WritableComputedRef } from 'vue'
import type { SystemDialogSettings } from './model'

/**
 * 生成 panel 字段工厂：`field('autoSaveInterval')` 返回可写 computed，模板可直接 v-model。
 *
 * @param getSettings 读取壳层草稿（传 `() => props.settings`）
 * @param update      向上报告字段补丁（传 `(patch) => emit('update', patch)`）
 */
export function usePanelFields(
    getSettings: () => SystemDialogSettings,
    update: (patch: Partial<SystemDialogSettings>) => void
): <K extends keyof SystemDialogSettings>(key: K) => WritableComputedRef<SystemDialogSettings[K]> {
    return function field<K extends keyof SystemDialogSettings>(
        key: K
    ): WritableComputedRef<SystemDialogSettings[K]> {
        return computed<SystemDialogSettings[K]>({
            get: () => getSettings()[key],
            set: (value) => update({ [key]: value } as Partial<SystemDialogSettings>)
        })
    }
}
