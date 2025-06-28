#!/bin/bash

# 快速建立各種檔案的函數

# 建立測試檔
new-test() {
    local name=$1
    local date=$(date +%Y%m%d)
    local file="_workspace/tests/test-${name}-${date}.js"
    
    cat > "$file" << EOF
// 測試: ${name}
// 日期: $(date +%Y-%m-%d)
// 狀態: 進行中

describe('${name}', () => {
    test('應該要...', () => {
        // 測試程式碼
    });
});
EOF
    
    echo "✅ 建立測試檔: $file"
}

# 建立記錄檔
new-log() {
    local topic=$1
    local date=$(date +%Y%m%d)
    local file="_workspace/logs/log-${topic}-${date}.md"
    
    cat > "$file" << EOF
# ${topic} 記錄

**日期**: $(date +%Y-%m-%d)
**狀態**: 進行中

## 問題描述

## 解決過程

## 結論

EOF
    
    echo "✅ 建立記錄檔: $file"
}

# 建立實驗檔
new-exp() {
    local name=$1
    local file="_workspace/experiments/exp-${name}.js"
    
    cat > "$file" << EOF
/**
 * 實驗: ${name}
 * 開始日期: $(date +%Y-%m-%d)
 * 目的: 
 */

// 實驗程式碼

EOF
    
    echo "✅ 建立實驗檔: $file"
}

# 根據參數執行
case "$1" in
    test) new-test "$2" ;;
    log) new-log "$2" ;;
    exp) new-exp "$2" ;;
    *) echo "用法: $0 {test|log|exp} <名稱>" ;;
esac