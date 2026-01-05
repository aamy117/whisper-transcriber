#!/bin/bash
# 一鍵設定每日工作流程

echo "🚀 設定每日工作流程..."

# 建立必要的目錄結構
echo "📁 建立目錄結構..."
mkdir -p scripts
mkdir -p _workspace/{tests,drafts,logs,experiments}
mkdir -p docs/{daily,meeting-notes}
mkdir -p daily

# 建立 .gitignore
echo "📝 設定 Git 忽略規則..."
cat >> .gitignore << 'EOF'

# 工作區檔案
_workspace/
!_workspace/INDEX.md

# 臨時檔案
*.tmp
*.temp
draft-*
test-*.js

# 個人筆記
*個人筆記*
*私人*
EOF

# 建立工作區索引
echo "📋 建立工作區索引..."
cat > _workspace/INDEX.md << 'EOF'
# 工作區檔案索引

## 📅 最近更新

## 🗂️ 分類索引

### 測試檔案 (tests/)
| 檔案 | 用途 | 狀態 | 日期 |
|------|------|------|------|

### 實驗檔案 (experiments/)
| 檔案 | 實驗內容 | 結果 | 是否採用 |
|------|----------|------|----------|

### 記錄檔案 (logs/)
| 檔案 | 主題 | 重要性 |
|------|------|--------|
EOF

echo "✅ 設定完成！"
echo ""
echo "📚 使用說明："
echo "1. 每天開始：./scripts/start-day.sh"
echo "2. 每天結束：./scripts/end-day.sh"
echo "3. 整理檔案：./scripts/organize-files.sh"
echo "4. 快速建檔：./scripts/quick-create.sh {test|log|exp} <名稱>"