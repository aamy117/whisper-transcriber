# 測試檔案索引

## 測試檔案分類

### 核心功能測試
- `test-whisper-api.html` - Whisper API 基礎測試
- `test-audio-processing.html` - 音訊處理測試
- `test-audio-processing-fixed.html` - 音訊處理修復版測試
- `test-integration.html` - 整合測試
- `test-full-integration.html` - 完整整合測試
- `test-automated.html` - 自動化測試套件

### 大檔案處理測試
- `test-large-file-handling.html` - 大檔案處理測試
- `test-large-file-simple.html` - 簡單大檔案測試
- `test-large-file-processing.html` - 大檔案處理流程測試
- `test-large-file-diagnosis.html` - 大檔案診斷測試
- `test-audio-splitting-fix.html` - 音訊分割修復測試

### WASM 本地轉譯測試
- `test-wasm-transcription.html` - WASM 轉譯基礎測試
- `test-wasm-integration.html` - WASM 整合測試
- `test-simple-wasm.html` - 簡單 WASM 測試
- `test-real-wasm.html` - 真實 WASM 測試
- `test-wasm-fix.html` - WASM 修復測試

### UI/UX 功能測試
- `test-dialog.html` - 對話框系統測試
- `test-notification.html` - 通知系統測試
- `test-find-replace.html` - 尋找取代功能測試
- `test-split-merge.html` - 段落分割合併測試
- `test-progress-ui.html` - 進度 UI 測試

### 新功能測試
- `test-punctuation-toggle.html` - 標點符號切換測試
- `test-text-conversion.html` - 文字轉換測試
- `test-new-flow.html` - 新轉譯流程測試
- `test-cancellation.html` - 取消操作功能測試
- `test-large-file-cancel.html` - 大檔案取消功能測試
- `test-enhanced-progress.html` - 增強版進度管理器測試 🆕

### 效能優化測試
- `test-performance-optimization.html` - 效能優化測試
- `test-virtual-scroll-performance.html` - 虛擬滾動效能測試 🆕

### 批次操作測試
- `test-batch-editing.html` - 批次編輯功能測試 🆕

### 其他測試
- `test-audio-formats.html` - 音訊格式支援測試
- `test-recorder-mp3.html` - MP3 錄音測試
- `quick-test.html` - 快速測試頁面

## 相關文檔
- `WASM-修復說明.md` - WASM 功能修復詳細說明
- `WASM本地轉譯功能測試報告.md` - WASM 功能測試報告

## 使用方式

1. 在瀏覽器中開啟測試檔案
2. 或使用 Live Server：
   ```bash
   # 在 VSCode 中右鍵點擊測試檔案
   # 選擇 "Open with Live Server"
   ```

## 測試順序建議

1. **基礎測試**：從 `test-whisper-api.html` 開始
2. **整合測試**：執行 `test-automated.html` 自動化測試套件
3. **效能測試**：使用 `test-virtual-scroll-performance.html` 測試大量數據處理
4. **特定功能**：根據需要測試特定功能

## 注意事項

- 某些測試需要有效的 API Key
- WASM 測試在開發模式下使用模擬功能
- 大檔案測試可能需要較長時間