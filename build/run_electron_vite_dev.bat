@echo off
rem ET-15：原流程里的 copyfile.bat 已删除（复制的旧 src\renderer\src\lib|dialogs|style
rem 与 out\mermaid|katex 目录均不存在）；资源改由 electron-builder.yml 的
rem extraResources 在打包阶段处理，dev 预览无需手动拷贝。
setlocal
echo "======================================"
echo "begin build electron applications"
echo "======================================"
electron-vite build
echo "======================================"
echo "run electron dev"
echo "======================================"
electron-vite dev
