#!/bin/bash
DATE=$(date +%Y-%m-%d)

echo "🌙 準備結束今日工作..."

# 更新快照
echo "📸 更新專案快照..."
/edit SNAPSHOT.json

# Git 提交
echo "💾 提交程式碼..."
git add .
git commit -m "Day progress: $DATE"

# 產生摘要
echo "📊 今日工作摘要："
echo "- 完成項目："
grep "✅" daily/$DATE.md | wc -l
echo "- 遇到問題："
grep "🐛" daily/$DATE.md | wc -l
echo "- 明日待辦："
grep -A 10 "明日計劃" daily/$DATE.md

echo "✅ 完成！記得更新 PROJECT_PLAN.md"