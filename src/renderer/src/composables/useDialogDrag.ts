import { ref, CSSProperties, onUnmounted } from 'vue'

export interface UseDialogDragOptions {
    initialPosition?: 'center' | 'top' | { x: number; y: number }
}

export function useDialogDrag(options: UseDialogDragOptions = {}) {
    const isDragging = ref(false)
    const dragStart = ref({ x: 0, y: 0 })
    const dialogStart = ref({ x: 0, y: 0 })

    // CQ-15：原实现用 ref<StyleValue> 时，Vue 的 UnwrapRef 会对 StyleValue 联合类型
    // （string | CSSProperties | 数组）深度解包，与对象字面量推断不一致，只能靠
    // `@ts-expect-error` 指令压制；而 ThemeSettingDialog 还在模板里做 `{ ...dialogStyle }`
    // 展开，要求值必须是对象类型。这里把返回类型精确收敛为 CSSProperties：
    // 既满足模板展开，也让类型检查通过（并移除 1 处 @ts-expect-error 指令）。
    const getInitialStyle = (): CSSProperties => {
        if (options.initialPosition === 'center') {
            return {
                position: 'fixed' as const,
                left: '50%',
                top: '50%',
                transform: 'translate(-50%, -50%)',
                margin: '0'
            }
        } else if (options.initialPosition === 'top') {
            return {
                position: 'fixed' as const,
                left: '50%',
                top: '10%',
                transform: 'translateX(-50%)',
                margin: '0'
            }
        } else if (options.initialPosition) {
            return {
                position: 'fixed' as const,
                left: `${options.initialPosition.x}px`,
                top: `${options.initialPosition.y}px`,
                transform: 'none',
                margin: '0'
            }
        }
        return {}
    }

    // CQ-15：值类型为 CSSProperties（getInitialStyle 已收敛返回类型），
    // 本 hook 只整体替换样式对象、不原地改字段，ref 深度响应与原行为一致。
    const dialogStyle = ref<CSSProperties>(getInitialStyle())

    const resetPosition = () => {
        dialogStyle.value = getInitialStyle()
    }

    const onDialogMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement
        if (target.closest('.title-bar') && !target.closest('.close-btn')) {
            if (e.button !== 0) return

            isDragging.value = true
            dragStart.value = { x: e.clientX, y: e.clientY }

            // CQ-08：拖拽矩形直接读事件 currentTarget（mousedown 绑定在对话框容器上），
            // 不再依赖模板 ref 暴露的 dialogRef，避免各对话框解构出的 dialogRef
            // 仅被模板 ref="dialogRef" 字符串引用而触发 TS6133（未使用局部变量）。
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
            dialogStart.value = { x: rect.left, y: rect.top }

            document.addEventListener('mousemove', onDragMove)
            document.addEventListener('mouseup', onDragEnd)
            e.preventDefault()
            e.stopPropagation()
        }
    }

    const onDragMove = (e: MouseEvent) => {
        if (!isDragging.value) return

        const deltaX = e.clientX - dragStart.value.x
        const deltaY = e.clientY - dragStart.value.y

        dialogStyle.value = {
            position: 'fixed' as const,
            left: `${dialogStart.value.x + deltaX}px`,
            top: `${dialogStart.value.y + deltaY}px`,
            transform: 'none',
            margin: '0'
        }
    }

    const onDragEnd = () => {
        isDragging.value = false
        document.removeEventListener('mousemove', onDragMove)
        document.removeEventListener('mouseup', onDragEnd)
    }

    // MEM-13：组件卸载兜底移除 document 级拖拽监听器，
    // 防止拖拽过程中对话框组件被卸载（v-if 关闭）导致监听器残留
    onUnmounted(() => {
        isDragging.value = false
        document.removeEventListener('mousemove', onDragMove)
        document.removeEventListener('mouseup', onDragEnd)
    })

    return {
        dialogStyle,
        isDragging,
        onDialogMouseDown,
        resetPosition
    }
}
