#!/bin/bash

echo "╔════════════════════════════════════════════════════════════╗"
echo "║          Store 修复验证脚本                                ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

ERRORS=0

# 检查每个文件
check_file() {
    local file=$1
    local name=$2
    
    echo "检查 $name..."
    
    # 检查是否导入了 createStore
    if grep -q "import { createStore }" "$file"; then
        echo "  ✅ 正确导入 createStore"
    else
        echo "  ❌ 缺少 createStore 导入"
        ERRORS=$((ERRORS + 1))
    fi
    
    # 检查是否使用了 new Store
    if grep -q "new Store" "$file"; then
        echo "  ❌ 仍在使用 new Store"
        ERRORS=$((ERRORS + 1))
    else
        echo "  ✅ 不使用 new Store"
    fi
    
    # 检查是否使用了 createStore
    if grep -q "createStore" "$file"; then
        echo "  ✅ 使用 createStore"
    else
        echo "  ❌ 未使用 createStore"
        ERRORS=$((ERRORS + 1))
    fi
    
    echo ""
}

# 检查所有文件
check_file "src/main/themes/theme-config.ts" "theme-config.ts"
check_file "src/main/themes/system-setting.ts" "system-setting.ts"
check_file "src/main/settings/editor-setting.ts" "editor-setting.ts"
check_file "src/main/settings/quick-link-config.ts" "quick-link-config.ts"

# 检查工具文件
echo "检查工具文件..."
if [ -f "src/main/utils/app-paths.ts" ]; then
    echo "  ✅ app-paths.ts 存在"
else
    echo "  ❌ app-paths.ts 不存在"
    ERRORS=$((ERRORS + 1))
fi

if [ -f "src/main/utils/store-factory.ts" ]; then
    echo "  ✅ store-factory.ts 存在"
else
    echo "  ❌ store-factory.ts 不存在"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ $ERRORS -eq 0 ]; then
    echo "✅ 所有检查通过！"
    echo ""
    echo "建议下一步操作："
    echo "1. 运行开发测试: npm run dev"
    echo "2. 运行打包测试: npm run build:win"
    echo "3. 运行安装程序测试打包后的应用"
else
    echo "❌ 发现 $ERRORS 个错误，请检查！"
fi

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

