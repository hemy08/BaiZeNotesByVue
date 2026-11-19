// ============ URL 常量（主进程入口 · 单一真源 re-export） ============
// 2026-11-19 重构：原 src/main/constants/urls.ts 与 src/shared/constants/urls.ts
// 为两份逐字重复的常量副本（52 个导出，仅注释/顺序不同），且渲染层菜单数据中的
// 另一份 URL 副本已与主进程真源漂移约 40%。现收敛为单一真源：
//   - 唯一真源：src/shared/constants/urls.ts（主进程与渲染层共用）
//   - 本文件仅做 re-export（门面），保留既有引用路径与 52 个导出表面不变，
//     主进程消费方（src/main/ipc/menu-tools.ts 等）零改动即可继续使用。
// 约束：新增/修改 URL 一律只改 shared/constants/urls.ts，禁止在本文件再写常量副本，
// 否则测试 tests/unit/urls-constants.test.ts 的「门面与真源全等」断言会失败。
export * from '../../shared/constants/urls'
