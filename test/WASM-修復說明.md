# WASM 本地轉譯錯誤修復說明

## 錯誤分析

### 1. 原始錯誤
```
Failed to load resource: the server responded with a status of 404 (Not Found)
TypeError: progressModal.updateMessage is not a function
```

### 2. 錯誤原因

#### 問題 1：`updateMessage` 方法不存在
- **位置**：`transcription-preprocessor.js` 第 443 行
- **原因**：`showProgressModal` 方法返回的對象只有 `updateProgress` 和 `close` 方法，但沒有 `updateMessage`
- **修復**：在返回對象中添加了 `updateMessage` 方法

#### 問題 2：Worker 路徑 404 錯誤
- **位置**：`whisper-wasm-manager.js` 第 178 行
- **原因**：使用了絕對路徑 `/js/workers/whisper-worker.js`
- **修復**：實現動態路徑計算，根據當前頁面位置調整路徑

## 修復內容

### 1. 修復 updateMessage 方法
```javascript
// transcription-preprocessor.js 第 666-671 行
updateMessage: (message) => {
  const stageEl = overlay.querySelector('.progress-stage');
  if (stageEl) {
    stageEl.textContent = message;
  }
},
```

### 2. 修復 Worker 路徑
```javascript
// whisper-wasm-manager.js 第 452-464 行
getWorkerPath() {
  const currentPath = window.location.pathname;
  const pathSegments = currentPath.split('/').filter(Boolean);
  
  // 如果在 test 目錄或其他子目錄中
  if (pathSegments.length > 1 || (pathSegments.length === 1 && pathSegments[0].includes('test'))) {
    return '../js/workers/whisper-worker.js';
  }
  
  // 如果在根目錄
  return 'js/workers/whisper-worker.js';
}
```

## 測試步驟

### 1. 基本功能測試
1. 開啟 `index.html`
2. 上傳一個大於 25MB 的音訊檔案
3. 選擇「本地轉譯」選項
4. 選擇模型（建議選 Base）
5. 確認沒有錯誤訊息

### 2. 使用測試頁面
- **簡單測試**：開啟 `test-wasm-fix.html`
- **完整測試**：開啟 `test/test-wasm-integration.html`

### 3. 驗證修復
- 不應該再出現 `updateMessage is not a function` 錯誤
- 不應該再出現 404 錯誤

## 開發模式說明

目前 WASM 功能處於**開發模式**：
- `ENABLE_WASM = true`：啟用 WASM 選項
- `ENABLE_REAL_WASM = false`：使用模擬轉譯（不需要真實 WASM 檔案）

這允許在沒有實際 WASM 檔案的情況下測試完整流程。

## 後續步驟

### 1. 生產環境準備
如果要啟用真實的 WASM 轉譯：
1. 下載 whisper.wasm 和模型檔案
2. 放置在正確的目錄
3. 設定 `ENABLE_REAL_WASM = true`

### 2. 進一步優化
- 考慮使用 Blob URL 創建 Worker，避免路徑問題
- 實現更智能的路徑解析
- 添加錯誤回退機制

## 故障排除

### 如果仍有 404 錯誤
1. 檢查瀏覽器開發者工具的 Network 標籤
2. 查看具體是哪個資源 404
3. 確認檔案路徑是否正確

### 如果功能仍不正常
1. 清除瀏覽器快取
2. 重新載入頁面
3. 檢查控制台是否有其他錯誤

## 聯絡支援
如有問題，請提供：
- 瀏覽器版本
- 錯誤訊息截圖
- 控制台完整錯誤堆疊