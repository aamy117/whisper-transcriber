#!/bin/bash
# 自動整理散亂的檔案

echo "🧹 開始整理檔案..."

# 建立必要資料夾
mkdir -p _workspace/{tests,drafts,logs,experiments}
mkdir -p docs/{daily,meeting-notes}

# 移動測試檔案
echo "📋 整理測試檔案..."
mv test*.js _workspace/tests/ 2>/dev/null
mv *test.js _workspace/tests/ 2>/dev/null
mv *Test.js _workspace/tests/ 2>/dev/null

# 移動記錄檔
echo "📝 整理記錄檔..."
mv *log*.md _workspace/logs/ 2>/dev/null
mv *紀錄*.md _workspace/logs/ 2>/dev/null
mv *筆記*.md _workspace/logs/ 2>/dev/null

# 移動日期檔案
echo "📅 整理每日記錄..."
mv 2024-*.md docs/daily/ 2>/dev/null
mv daily-*.md docs/daily/ 2>/dev/null

# 移動草稿
echo "✏️ 整理草稿..."
mv draft*.* _workspace/drafts/ 2>/dev/null
mv temp*.* _workspace/drafts/ 2>/dev/null
mv tmp*.* _workspace/drafts/ 2>/dev/null

echo "✅ 整理完成！"
echo "📊 檔案統計："
echo "- 測試檔案: $(ls _workspace/tests | wc -l) 個"
echo "- 記錄檔案: $(ls _workspace/logs | wc -l) 個"
echo "- 每日記錄: $(ls docs/daily | wc -l) 個"