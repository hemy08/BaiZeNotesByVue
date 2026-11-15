@echo off
rem ET-15：copyfile.bat 已删除（其复制的 src\renderer\src\lib|dialogs|style 等旧目录
rem 与 out\mermaid|katex 布局已不存在）；主题/图标/PlantUML 等资源现由
rem electron-builder.yml 的 extraResources 在打包阶段复制，无需再手动复制到 out。
npm run typecheck

electron-vite build
