#!/bin/bash
DATE=$(date +%Y-%m-%d)

echo "🌙 準備結束今日工作..."

# === 新增：整理檔案 ===
echo ""
echo "🧹 整理工作檔案..."
# 檢查根目錄是否有散亂檔案
ROOT_FILES=$(ls -1 test*.js *.log *.tmp 2>/dev/null | wc -l)
if [ $ROOT_FILES -gt 0 ]; then
    echo "發現 $ROOT_FILES 個需要整理的檔案"
    read -p "是否要自動整理？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        ./scripts/organize-files.sh
    fi
fi

# 更新快照
echo "📸 更新專案快照..."
# 注意：/edit 是 Claude Code 的指令，在 bash 中需要用其他方式
echo "請手動執行: /edit SNAPSHOT.json"

# === 新增：更新工作區索引 ===
echo ""
echo "📋 更新工作區索引..."
if [ -d "_workspace" ]; then
    # 自動更新最近修改的檔案到索引
    echo "## 📅 最近更新 (自動產生於 $DATE)" > _workspace/INDEX_NEW.md
    echo "" >> _workspace/INDEX_NEW.md
    
    # 找出今天修改的檔案
    find _workspace -type f -name "*.js" -o -name "*.md" -mtime -1 | while read file; do
        echo "- $(date +%Y-%m-%d): $(basename $file)" >> _workspace/INDEX_NEW.md
    done
    
    # 保留原有內容
    if [ -f "_workspace/INDEX.md" ]; then
        echo "" >> _workspace/INDEX_NEW.md
        tail -n +10 _workspace/INDEX.md >> _workspace/INDEX_NEW.md
    fi
    
    mv _workspace/INDEX_NEW.md _workspace/INDEX.md
    echo "✅ 工作區索引已更新"
fi

# Git 提交
echo ""
echo "💾 提交程式碼..."
git add .
git commit -m "Day progress: $DATE"

# 產生摘要
echo ""
echo "📊 今日工作摘要："
echo "- 完成項目："
grep "✅" daily/$DATE.md | wc -l
echo "- 遇到問題："
grep "🐛" daily/$DATE.md | wc -l
echo "- 明日待辦："
grep -A 10 "明日計劃" daily/$DATE.md

# === 新增：清理提醒 ===
echo ""
# 計算工作區大小
if [ -d "_workspace" ]; then
    WORKSPACE_SIZE=$(du -sh _workspace | cut -f1)
    echo "💾 工作區大小: $WORKSPACE_SIZE"
    
    # 計算超過30天的檔案數量
    OLD_FILES=$(find _workspace -type f -mtime +30 | wc -l)
    if [ $OLD_FILES -gt 0 ]; then
        echo "⚠️ 有 $OLD_FILES 個超過30天的檔案，建議執行清理："
        echo "   ./scripts/cleanup.sh"
    fi
fi

echo ""
echo "✅ 完成！記得："
echo "  1. 更新 PROJECT_PLAN.md"
echo "  2. 在程式碼中標記明天的 RESUME-POINT"
echo "  3. 更新 CLAUDE.md 的專案進度"