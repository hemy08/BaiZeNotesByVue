/**
 * CQ-07：Information.ts 数据表拆分（原 Information.ts 第 1362-1375 行）。
 * 内容与原文件逐字一致；索引文件 Information.ts 统一 re-export。
 */
export function CompressedArray<T>(table: T[], num: number): T[][] {
    return table.reduce((acc: T[][], item, index) => {
        // 计算当前元素应该属于哪个子数组
        const subArrayIndex = Math.floor(index / num)
        // 如果子数组还不存在，则初始化它
        if (!acc[subArrayIndex]) {
            acc[subArrayIndex] = []
        }
        // 将当前元素添加到对应的子数组中
        acc[subArrayIndex].push(item)
        // 返回累加器，以便下一轮迭代可以使用
        return acc
    }, [])
}
