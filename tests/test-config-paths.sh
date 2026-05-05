#!/bin/bash

echo "========================================="
echo "白泽笔记配置路径测试"
echo "========================================="
echo ""

echo "1. 检查 electron-builder.yml 配置"
echo "-----------------------------------"
if grep -q "from: \"resources/config\"" electron-builder.yml; then
    echo "✅ 资源文件配置正确"
else
    echo "❌ 资源文件配置错误"
fi

echo ""
echo "2. 检查卸载脚本"
echo "-----------------------------------"
if [ -f "build/uninstaller.nsh" ]; then
    echo "✅ 卸载脚本存在"
    if grep -q "\.baizenotes" build/uninstaller.nsh; then
        echo "✅ 卸载脚本包含配置目录引用"
    else
        echo "❌ 卸载脚本缺少配置目录引用"
    fi
else
    echo "❌ 卸载脚本不存在"
fi

echo ""
echo "3. 检查新增工具文件"
echo "-----------------------------------"
if [ -f "src/main/utils/app-paths.ts" ]; then
    echo "✅ app-paths.ts 存在"
else
    echo "❌ app-paths.ts 不存在"
fi

if [ -f "src/main/utils/store-factory.ts" ]; then
    echo "✅ store-factory.ts 存在"
else
    echo "❌ store-factory.ts 不存在"
fi

echo ""
echo "4. 检查主进程修改"
echo "-----------------------------------"
if grep -q "initUserDataDirectory" src/main/index.ts; then
    echo "✅ 主进程已添加初始化调用"
else
    echo "❌ 主进程缺少初始化调用"
fi

echo ""
echo "5. 检查文档"
echo "-----------------------------------"
if [ -f "doc/配置文件路径优化说明.md" ]; then
    echo "✅ 配置优化说明文档存在"
else
    echo "❌ 配置优化说明文档不存在"
fi

echo ""
echo "========================================="
echo "测试完成"
echo "========================================="
