#!/bin/bash
# 清理舊檔案

echo "🗑️ 準備清理舊檔案..."

# 設定保留天數
KEEP_DAYS=30

# 顯示將被刪除的檔案
echo "以下檔案超過 ${KEEP_DAYS} 天將被刪除："
find _workspace -type f -mtime +${KEEP_DAYS} -name "*.md" -o -name "*.js"

# 確認刪除
read -p "確定要刪除這些檔案嗎？(y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    # 刪除舊檔案
    find _workspace -type f -mtime +${KEEP_DAYS} -delete
    echo "✅ 清理完成"
else
    echo "❌ 取消清理"
fi

# 壓縮保存重要記錄
echo "📦 壓縮保存重要記錄..."
tar -czf "backup/logs-$(date +%Y%m%d).tar.gz" _workspace/logs/*.md