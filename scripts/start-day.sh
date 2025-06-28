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