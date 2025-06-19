# 通知系統文件

## 概述

新的通知系統取代了原本的 `alert()` 和簡單的 DOM 通知，提供更優雅的使用者體驗。

## 特色

### 通知系統 (notification.js)
- **四種類型**：success、error、warning、info
- **自動關閉**：預設 5 秒後自動消失
- **進度條**：視覺化顯示剩餘時間
- **可關閉**：使用者可手動關閉
- **響應式**：適應不同螢幕大小
- **深色模式**：自動適應主題
- **堆疊顯示**：多個通知垂直排列

### 對話框系統 (dialog.js)
- **Prompt 對話框**：取代 `window.prompt()`
- **Confirm 對話框**：取代 `window.confirm()`
- **輸入驗證**：支援自訂驗證函數
- **鍵盤支援**：Enter 確認、Escape 取消
- **動畫效果**：平滑的顯示/隱藏動畫

## 使用方式

### 通知系統

```javascript
import { notify } from './notification.js';

// 基本使用
notify.success('操作成功！');
notify.error('發生錯誤');
notify.warning('請注意');
notify.info('提示訊息');

// 進階選項
notify.show('自訂訊息', 'info', {
  title: '自訂標題',
  duration: 10000,  // 10 秒
  closable: true,   // 可關閉
  progress: true    // 顯示進度條
});

// 持續通知（不自動關閉）
notify.error('嚴重錯誤', {
  duration: 0
});

// 關閉所有通知
notify.closeAll();
```

### 對話框系統

```javascript
import { dialog } from './dialog.js';

// 輸入對話框
const name = await dialog.prompt({
  title: '請輸入名稱',
  message: '這將用於顯示',
  defaultValue: '預設值',
  placeholder: '提示文字',
  hint: '額外說明',
  validate: (value) => {
    if (!value) return '此欄位必填';
    return null;
  }
});

// 確認對話框
const confirmed = await dialog.confirm({
  title: '確認刪除',
  message: '此操作無法復原',
  okText: '刪除',
  cancelText: '取消',
  type: 'warning'
});
```

## 整合變更

### 已更新的檔案
1. **main.js**
   - 匯入通知和對話框系統
   - `showNotification()` 改用 `notify`
   - `confirm()` 改用 `dialog.confirm()`

2. **player.js**
   - `showError()` 改用 `notify.error()`

3. **editor.js**
   - `showNotification()` 改用 `notify`
   - `prompt()` 改用 `dialog.prompt()`

## 測試頁面

- `test-notification.html` - 測試通知系統
- `test-dialog.html` - 測試對話框系統

## 樣式自訂

通知和對話框的樣式都內嵌在各自的模組中，並支援深色模式。如需自訂樣式，可以覆寫以下 CSS 類別：

### 通知樣式
- `.notification-container` - 通知容器
- `.notification` - 通知主體
- `.notification-success/error/warning/info` - 不同類型樣式

### 對話框樣式
- `.dialog-overlay` - 背景遮罩
- `.dialog` - 對話框主體
- `.dialog-btn-primary/secondary` - 按鈕樣式

## 優點

1. **更好的使用者體驗**
   - 不會中斷使用者操作
   - 視覺回饋更清晰
   - 支援鍵盤操作

2. **更靈活的配置**
   - 可自訂顯示時間
   - 可自訂樣式和內容
   - 支援驗證功能

3. **更好的可訪問性**
   - ARIA 屬性支援
   - 鍵盤導航
   - 清晰的視覺層級