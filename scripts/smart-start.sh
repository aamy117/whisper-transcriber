#!/bin/bash
# 智能工作啟動腳本

echo "🤖 Claude 智能工作助手"
echo "===================="
echo ""

# 檢查是否在專案目錄
if [ ! -f "PROJECT_PLAN.md" ]; then
    echo "⚠️ 未在專案目錄中！"
    echo "請先進入專案目錄或建立新專案。"
    echo ""
    read -p "是否要建立新專案？(y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        bash C:/codeuser/new/new-project.sh
    else
        echo "請先 cd 到你的專案目錄"
    fi
    exit 1
fi

# 顯示專案資訊
echo "📁 當前專案：$(basename $(pwd))"
echo ""

# 選擇動作
echo "請選擇動作："
echo "1) 開始今日工作"
echo "2) 查看專案進度"
echo "3) 建立新檔案"
echo "4) 結束今日工作"
echo "5) 整理檔案"
echo ""

read -p "選擇 (1-5): " ACTION

case $ACTION in
    1)
        echo "🌟 開始工作..."
        if [ -f "./scripts/start-day.sh" ]; then
            bash ./scripts/start-day.sh
        else
            echo "找不到 start-day.sh，顯示基本資訊："
            echo ""
            if [ -f "PROJECT_PLAN.md" ]; then
                echo "📋 專案計劃："
                head -20 PROJECT_PLAN.md
            fi
            if [ -f "SNAPSHOT.json" ]; then
                echo ""
                echo "📸 專案狀態："
                cat SNAPSHOT.json | jq '.currentFocus'
            fi
        fi
        
        # 搜尋 RESUME-POINT
        echo ""
        echo "🔍 尋找繼續點..."
        if [ -d "src" ]; then
            grep -r "RESUME-POINT" src/ 2>/dev/null | head -5
        fi
        ;;
        
    2)
        echo "📊 專案進度..."
        if [ -f "PROJECT_PLAN.md" ]; then
            cat PROJECT_PLAN.md
        fi
        if [ -f "SNAPSHOT.json" ]; then
            echo ""
            echo "目前狀態："
            cat SNAPSHOT.json | jq '.'
        fi
        ;;
        
    3)
        echo ""
        echo "建立什麼類型的檔案？"
        echo "1) 測試檔案"
        echo "2) 記錄檔案"
        echo "3) 實驗檔案"
        read -p "選擇 (1-3): " FILE_TYPE
        
        read -p "請輸入名稱: " FILE_NAME
        
        case $FILE_TYPE in
            1)
                if [ -f "./scripts/quick-create.sh" ]; then
                    bash ./scripts/quick-create.sh test "$FILE_NAME"
                else
                    echo "建立測試檔案：_workspace/tests/test-${FILE_NAME}-$(date +%Y%m%d).js"
                    mkdir -p _workspace/tests
                    touch "_workspace/tests/test-${FILE_NAME}-$(date +%Y%m%d).js"
                fi
                ;;
            2)
                if [ -f "./scripts/quick-create.sh" ]; then
                    bash ./scripts/quick-create.sh log "$FILE_NAME"
                else
                    echo "建立記錄檔案：_workspace/logs/log-${FILE_NAME}-$(date +%Y%m%d).md"
                    mkdir -p _workspace/logs
                    touch "_workspace/logs/log-${FILE_NAME}-$(date +%Y%m%d).md"
                fi
                ;;
            3)
                if [ -f "./scripts/quick-create.sh" ]; then
                    bash ./scripts/quick-create.sh exp "$FILE_NAME"
                else
                    echo "建立實驗檔案：_workspace/experiments/exp-${FILE_NAME}.js"
                    mkdir -p _workspace/experiments
                    touch "_workspace/experiments/exp-${FILE_NAME}.js"
                fi
                ;;
        esac
        ;;
        
    4)
        echo "🌙 結束工作..."
        if [ -f "./scripts/end-day.sh" ]; then
            bash ./scripts/end-day.sh
        else
            echo "提醒事項："
            echo "1. 更新 PROJECT_PLAN.md"
            echo "2. 在程式碼中標記 RESUME-POINT"
            echo "3. 建立檢查點,提交 Git 變更"
            echo "4. 更新 SNAPSHOT.json"
        fi
        ;;
        
    5)
        echo "🧹 整理檔案..."
        if [ -f "./scripts/organize-files.sh" ]; then
            bash ./scripts/organize-files.sh
        else
            echo "請手動整理散亂的檔案到 _workspace 資料夾"
        fi
        ;;
esac

echo ""
echo "✅ 完成！"