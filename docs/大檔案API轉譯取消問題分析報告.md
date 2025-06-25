# 大檔案 API 轉譯取消問題分析報告

## 問題描述
當使用 API 轉譯大於 25MB 的檔案時，使用者無法取消正在進行的轉譯操作。這個問題特別發生在選擇處理選項（分割/壓縮/混合）的對話框階段。

## 問題根源分析

### 1. 對話框阻塞問題

在 `transcription-preprocessor.js` 中，當檔案大於 25MB 時，會顯示兩層對話框：

1. **第一層**：選擇轉譯方式（本地 vs API）- `showTranscriptionMethodChoice()`
2. **第二層**：選擇處理方式（分割/壓縮/混合）- `showProcessingOptions()`

問題出現在第二層對話框：

```javascript
// transcription-preprocessor.js:96-102
const strategy = await this.showProcessingOptions(fileInfo);

if (!strategy) {
    // 使用者取消
    throw new Error('使用者取消處理');
}
```

**問題**：`showProcessingOptions()` 是一個阻塞式的 Promise，在對話框顯示期間，主執行緒的取消按鈕無法被點擊，因為：

1. 對話框使用 `z-index: 9990` 覆蓋在頁面上方
2. 對話框是模態的，阻止了與底層 UI 的互動
3. 取消令牌雖然已傳遞，但在等待使用者選擇期間無法被觸發

### 2. 取消令牌傳遞不完整

雖然取消令牌被正確創建和傳遞到各個處理步驟，但在關鍵的對話框顯示階段沒有處理取消事件：

```javascript
// main.js:589-591
const preprocessResult = await transcriptionPreprocessor.prepareForTranscription(file, {
    cancellationToken: this.transcriptionCancellationToken
});
```

取消令牌傳遞路徑：
- ✅ `main.js` → `prepareForTranscription()`
- ✅ `prepareForTranscription()` → `processFile()`
- ✅ `processFile()` → `splitAudio()` / `compressAudio()` / `hybridProcess()`
- ❌ 但在 `showProcessingOptions()` 期間沒有監聽取消事件

### 3. 進度對話框的取消按鈕問題

在音訊處理期間（分割/壓縮），雖然顯示了可取消的進度對話框：

```javascript
// transcription-preprocessor.js:509-516
progressModal = this.showProgressModal('正在分割音訊檔案...', {
    cancellable: true,
    onCancel: () => {
        if (cancellationToken) {
            cancellationToken.cancel('使用者取消分割操作');
        }
    }
});
```

但這個進度對話框只在實際處理檔案時顯示，而不是在選擇處理方式時顯示。

## 解決方案

### 方案 1：在對話框中添加取消監聽（推薦）

修改 `showProcessingOptions()` 方法，添加取消令牌監聽：

```javascript
async showProcessingOptions(fileInfo, cancellationToken) {
    return new Promise((resolve, reject) => {
        // ... 創建對話框 ...
        
        // 監聽取消令牌
        let unsubscribe = null;
        if (cancellationToken) {
            unsubscribe = cancellationToken.onCancelled((reason) => {
                closeModal();
                reject(new Error(reason));
            });
        }
        
        // 在關閉對話框時清理監聽器
        const closeModal = () => {
            if (unsubscribe) {
                unsubscribe();
            }
            // ... 原有的關閉邏輯 ...
        };
    });
}
```

### 方案 2：改變 UI 流程

將處理選項選擇整合到狀態顯示中，而不是使用模態對話框：

1. 在轉譯狀態區域顯示處理選項
2. 保持取消按鈕始終可見和可點擊
3. 使用非阻塞的 UI 更新方式

### 方案 3：添加對話框內的取消按鈕

在每個對話框內部添加取消按鈕，直接觸發取消令牌：

```javascript
// 在對話框 footer 中添加
<button class="btn btn-danger" id="cancelTranscriptionBtn">取消轉譯</button>

// 綁定事件
overlay.querySelector('#cancelTranscriptionBtn').addEventListener('click', () => {
    if (cancellationToken) {
        cancellationToken.cancel('使用者在選擇處理方式時取消');
    }
    closeModal();
    resolve(null);
});
```

## 建議的修復步驟

1. **立即修復**：在 `showProcessingOptions()` 和 `showTranscriptionMethodChoice()` 中添加取消令牌監聽
2. **改進 UI**：確保取消按鈕在所有階段都可見和可點擊
3. **優化流程**：考慮將對話框改為非模態形式，或整合到主 UI 中
4. **測試驗證**：
   - 測試在對話框顯示時點擊取消
   - 測試在檔案處理時點擊取消
   - 測試在 API 請求時點擊取消

## 相關程式碼位置

- `js/main.js:589-591` - 取消令牌傳遞
- `js/transcription-preprocessor.js:96-102` - 問題對話框調用
- `js/transcription-preprocessor.js:284-386` - `showProcessingOptions()` 實現
- `js/utils/cancellation-token.js` - 取消令牌實現

## 結論

問題的核心是模態對話框阻塞了 UI 互動，使得取消按鈕無法被點擊。雖然取消令牌機制已經實現，但在關鍵的使用者選擇階段沒有正確處理取消事件。建議採用方案 1，在對話框中添加取消令牌監聽，這是最小改動且最有效的解決方案。