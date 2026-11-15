/// <reference types="vite/client" />

declare module '*.vue' {
    import type { DefineComponent } from 'vue'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-object-type -- 与 Vite 官方模板一致的 .vue 兜底声明，空对象表示任意 props
    const component: DefineComponent<{}, {}, any>
    export default component
}
