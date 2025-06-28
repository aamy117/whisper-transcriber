#!/bin/bash
DATE=$(date +%Y-%m-%d)

echo "🌟 開始新的一天工作！"
echo "📅 日期：$DATE"
echo ""

# 顯示總計劃
echo "📋 專案總進度："
cat PROJECT_PLAN.md | grep -E "Day [0-9]|\\[x\\]|\\[ \\]" | head -20
echo ""

# 顯示昨日進度
echo "📝 昨日工作摘要："
YESTERDAY=$(date -d "yesterday" +%Y-%m-%d)
if [ -f "daily/$YESTERDAY.md" ]; then
    grep -A 5 "未完成項目" daily/$YESTERDAY.md
fi
echo ""

# 顯示快照
echo "📸 目前狀態："
cat SNAPSHOT.json | jq '.currentFocus'
echo ""

# 建立今日檔案
cp daily/template.md daily/$DATE.md
echo "✅ 已建立今日進度檔案：daily/$DATE.md"

# 顯示 TODO
echo ""
echo "⚠️ 程式碼中的 TODO："
grep -r "TODO-Day\|RESUME-POINT" src/ | head -10

# === 新增：工作區管理功能 ===

# 檢查工作區
echo ""
echo "📁 工作區狀態："
if [ -f "_workspace/INDEX.md" ]; then
    echo "最近更新的檔案："
    head -n 10 _workspace/INDEX.md | grep "2024"
fi

# 顯示可用的快速建立指令
echo ""
echo "🛠️ 快速建立檔案："
echo "  - 測試檔: ./scripts/quick-create.sh test <名稱>"
echo "  - 記錄檔: ./scripts/quick-create.sh log <主題>"
echo "  - 實驗檔: ./scripts/quick-create.sh exp <功能>"

# 檢查是否需要整理
echo ""
echo "🗂️ 根目錄檔案數量："
ROOT_FILES=$(ls -1 *.md *.js 2>/dev/null | wc -l)
if [ $ROOT_FILES -gt 10 ]; then
    echo "⚠️ 根目錄有 $ROOT_FILES 個散亂檔案，建議執行整理："
    echo "   ./scripts/organize-files.sh"
else
    echo "✅ 根目錄整潔 ($ROOT_FILES 個檔案)"
fi

# 提醒檢視
echo ""
echo "💡 建議執行："
echo "  1. 查看工作區索引: cat _workspace/INDEX.md"
echo "  2. 查看 Claude 記憶: cat ~/CLAUDE.md"
echo "  3. 從 RESUME-POINT 繼續工作"