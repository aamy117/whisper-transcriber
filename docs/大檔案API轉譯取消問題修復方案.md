# 大檔案 API 轉譯取消問題修復方案

## 修復方案實現

### 1. 修改 `transcription-preprocessor.js`

需要修改以下方法來支援取消令牌：

#### A. 修改 `prepareForTranscription` 方法簽名

```javascript
// 第 61 行，修改方法調用，傳遞取消令牌
const transcriptionMethod = await this.showTranscriptionMethodChoice(file, cancellationToken);
```

#### B. 修改 `showTranscriptionMethodChoice` 方法

```javascript
async showTranscriptionMethodChoice(file, cancellationToken) {
    // ... 原有代碼 ...
    
    return new Promise((resolve, reject) => {
        // ... 創建對話框代碼 ...
        
        // 添加取消令牌監聽
        let unsubscribe = null;
        if (cancellationToken) {
            unsubscribe = cancellationToken.onCancelled((reason) => {
                closeModal();
                reject(new Error(reason));
            });
        }
        
        const closeModal = () => {
            // 清理取消監聽器
            if (unsubscribe) {
                unsubscribe();
            }
            overlay.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 300);
        };
        
        // ... 其餘代碼保持不變 ...
    });
}
```

#### C. 修改 `showProcessingOptions` 方法

```javascript
// 第 97 行，修改方法調用，傳遞取消令牌
const strategy = await this.showProcessingOptions(fileInfo, cancellationToken);

// 修改方法定義（第 284 行）
async showProcessingOptions(fileInfo, cancellationToken) {
    // ... 原有代碼 ...
    
    return new Promise((resolve, reject) => {
        // ... 創建對話框代碼 ...
        
        // 添加取消令牌監聽
        let unsubscribe = null;
        if (cancellationToken) {
            unsubscribe = cancellationToken.onCancelled((reason) => {
                closeModal();
                reject(new Error(reason));
            });
        }
        
        const closeModal = () => {
            // 清理取消監聽器
            if (unsubscribe) {
                unsubscribe();
            }
            overlay.classList.remove('show');
            setTimeout(() => {
                document.body.removeChild(overlay);
            }, 300);
        };
        
        // ... 其餘代碼保持不變 ...
    });
}
```

### 2. 增強對話框內的取消支援（可選）

在對話框內部添加額外的取消按鈕：

```javascript
// 在 showTranscriptionMethodChoice 的對話框 footer 中
<div class="dialog-footer">
    <button class="btn btn-secondary" id="cancelBtn">取消</button>
    <button class="btn btn-danger" id="abortBtn" style="margin-right: auto;">停止轉譯</button>
    <button class="btn btn-primary" id="confirmBtn" disabled>開始轉譯</button>
</div>

// 綁定停止轉譯按鈕
overlay.querySelector('#abortBtn').addEventListener('click', () => {
    if (cancellationToken) {
        cancellationToken.cancel('使用者在選擇轉譯方式時取消');
    }
    closeModal();
    reject(new Error('使用者取消操作'));
});
```

### 3. 確保錯誤正確傳播

修改 `main.js` 中的錯誤處理，確保取消錯誤被正確識別：

```javascript
// main.js 第 747 行附近
} catch (error) {
    // 判斷是否為取消操作
    if (error.name === 'CancellationError' || 
        error.message.includes('取消') || 
        error.message.includes('使用者取消')) {
        this.showNotification('轉譯已取消', 'info');
    } else {
        this.showNotification(`轉譯失敗：${error.message}`, 'error');
    }
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error('Transcription error:', error);
}
```

## 完整的修復檔案差異

### `transcription-preprocessor.js` 修改

```diff
- async showTranscriptionMethodChoice(file) {
+ async showTranscriptionMethodChoice(file, cancellationToken) {
    // ... 省略內容生成代碼 ...
    
-   return new Promise((resolve) => {
+   return new Promise((resolve, reject) => {
      const overlay = document.createElement('div');
      // ... 省略對話框創建代碼 ...
      
+     // 添加取消令牌監聽
+     let unsubscribe = null;
+     if (cancellationToken) {
+       unsubscribe = cancellationToken.onCancelled((reason) => {
+         closeModal();
+         reject(new Error(reason));
+       });
+     }
      
      const closeModal = () => {
+       if (unsubscribe) {
+         unsubscribe();
+       }
        overlay.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 300);
      };

- async showProcessingOptions(fileInfo) {
+ async showProcessingOptions(fileInfo, cancellationToken) {
    // 相同的修改模式
```

## 測試方案

1. **測試場景 A**：在選擇轉譯方式時取消
   - 上傳大於 25MB 的檔案
   - 點擊"開始轉譯"
   - 在第一個對話框出現時，點擊主介面的"取消"按鈕
   - 驗證：對話框關閉，顯示"轉譯已取消"通知

2. **測試場景 B**：在選擇處理方式時取消
   - 上傳大於 25MB 的檔案
   - 選擇"雲端 API 轉譯"
   - 在第二個對話框出現時，點擊主介面的"取消"按鈕
   - 驗證：對話框關閉，顯示"轉譯已取消"通知

3. **測試場景 C**：在檔案處理過程中取消
   - 完成選擇，開始實際處理（分割/壓縮）
   - 在進度條顯示時點擊"取消"
   - 驗證：處理停止，顯示"轉譯已取消"通知

## 預期效果

修復後，使用者應該能夠在以下任何階段取消轉譯：
1. ✅ 選擇轉譯方式時
2. ✅ 選擇處理策略時
3. ✅ 檔案處理過程中
4. ✅ API 請求過程中

所有取消操作都應該立即響應，並正確清理資源。