/**
 * CMP-30：i18n 类型定义（中英双语）
 *
 * 设计说明：采用轻量自研 i18n（不引入 vue-i18n），原因是：
 * - 主进程（HTML 对话框模板）与渲染层（Vue 组件）需要共用同一份词典；
 * - 现有组件测试直接 mount 组件，vue-i18n 需要插件注入会大面积改测试；
 * - 仅中/英两种语言，t() + 词典足够，且零新增依赖。
 */
export type Locale = 'zh-CN' | 'en-US'

/** 词典节点：字符串叶子或嵌套对象 */
export interface MessageNode {
    [key: string]: string | MessageNode
}
