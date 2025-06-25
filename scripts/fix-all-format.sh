#!/bin/bash

# 代碼格式自動修復腳本
# 使用方法: bash fix-all-format.sh

echo "🔧 開始自動修復代碼格式問題..."
echo "================================"

# 計數器
total_files=0
fixed_files=0

# 顏色定義
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 修復單個檔案的函數
fix_file() {
    local file=$1
    local temp_file="${file}.tmp"
    local changed=false
    
    # 複製原始檔案到臨時檔案
    cp "$file" "$temp_file"
    
    # 1. 移除行尾空格
    if sed -i 's/[[:space:]]*$//' "$temp_file"; then
        if ! cmp -s "$file" "$temp_file"; then
            changed=true
            echo -e "  ${GREEN}✓${NC} 移除行尾空格: $file"
        fi
    fi
    
    # 2. 修復多個連續空行 (最多保留2個)
    if awk 'BEGIN{bl=0}/^$/{bl++;if(bl<=2)print;next}{bl=0;print}' "$temp_file" > "${temp_file}.2"; then
        mv "${temp_file}.2" "$temp_file"
        if ! cmp -s "$file" "$temp_file"; then
            changed=true
            echo -e "  ${GREEN}✓${NC} 修復多餘空行: $file"
        fi
    fi
    
    # 3. 確保檔案結尾有換行
    if [ -s "$temp_file" ] && [ "$(tail -c 1 "$temp_file" | wc -l)" -eq 0 ]; then
        echo >> "$temp_file"
        changed=true
        echo -e "  ${GREEN}✓${NC} 添加結尾換行: $file"
    fi
    
    # 4. 條件化 console 語句 (可選)
    # 注意：這個比較複雜，建議使用 Node.js 腳本處理
    
    # 如果有變更，替換原始檔案
    if [ "$changed" = true ]; then
        # 備份原始檔案
        cp "$file" "${file}.backup"
        # 替換檔案
        mv "$temp_file" "$file"
        ((fixed_files++))
    else
        # 刪除臨時檔案
        rm "$temp_file"
    fi
    
    ((total_files++))
}

# 處理所有 JavaScript 檔案
echo "📂 掃描 JavaScript 檔案..."
echo ""

# 使用 find 找出所有 .js 檔案
while IFS= read -r -d '' file; do
    # 跳過 node_modules 和其他不需要處理的目錄
    if [[ "$file" == *"node_modules"* ]] || \
       [[ "$file" == *".git"* ]] || \
       [[ "$file" == *"dist"* ]] || \
       [[ "$file" == *"build"* ]] || \
       [[ "$file" == *".min.js" ]]; then
        continue
    fi
    
    echo "處理: $file"
    fix_file "$file"
    
done < <(find . -name "*.js" -type f -print0)

echo ""
echo "================================"
echo -e "${GREEN}✨ 處理完成！${NC}"
echo ""
echo "📊 統計資訊："
echo "  • 掃描檔案數: $total_files"
echo "  • 修復檔案數: $fixed_files"
echo ""

if [ $fixed_files -gt 0 ]; then
    echo -e "${YELLOW}💡 提示：${NC}"
    echo "  • 已建立 .backup 備份檔案"
    echo "  • 請檢查修改是否正確"
    echo "  • 如需還原: mv file.js.backup file.js"
fi

echo ""
echo "🎯 下一步建議："
echo "  1. 執行 git diff 查看所有變更"
echo "  2. 測試程式是否正常運作"
echo "  3. 提交變更到版本控制"
echo ""