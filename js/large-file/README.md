# 大檔案處理系統 (Large File Processing System)

這個目錄包含了新的大檔案處理系統的所有模組。這是一個並行開發的系統，不會影響現有的轉譯功能。

## 📁 目錄結構

```
large-file/
├── large-file-controller.js      # 主控制器 - 統一的處理介面
├── large-file-config.js         # 配置管理 - 功能開關和參數設定
├── stream-analyzer.js           # 串流分析器 - 無記憶體佔用的檔案分析
├── smart-splitter.js           # 智慧分割器 - 基於結構的檔案分割
├── parallel-processor.js       # 並行處理器 - Web Worker 管理
├── progress-checkpoint.js      # 進度檢查點 - 中斷恢復機制
├── cache-manager.js           # 快取管理器 - 智慧快取策略
├── memory-monitor.js          # 記憶體監控 - 實時監控和優化
├── performance-optimizer.js    # 效能優化器 - 動態調整處理策略
├── workers/                   # Web Workers 目錄
│   ├── audio-analysis-worker.js
│   ├── audio-split-worker.js
│   ├── audio-encode-worker.js
│   └── worker-pool-manager.js
├── utils/                     # 工具函數目錄
│   ├── file-format-detector.js
│   ├── byte-range-reader.js
│   └── audio-metadata-parser.js
└── strategies/               # 格式特定策略目錄
    ├── mp3-split-strategy.js
    ├── wav-split-strategy.js
    └── generic-split-strategy.js
```

## 🚀 快速開始

### 1. 功能開關

預設情況下，新系統是關閉的。要啟用它，請在 `large-file-config.js` 中設定：

```javascript
export const config = {
  enabled: true,  // 啟用新系統
  thresholdMB: 100  // 檔案大小閾值
};
```

### 2. 整合方式

新系統透過最小化的整合點與現有系統連接：

```javascript
// 在 transcription-preprocessor.js 中
if (shouldUseLargeFileSystem(file)) {
  return await largeFileController.process(file, options);
}
```

### 3. 測試

使用專門的測試頁面進行測試：
- `test/test-large-file-v2.html` - 功能測試
- `test/test-large-file-performance.html` - 效能測試

## 📊 系統特點

1. **零記憶體佔用**：使用串流處理，記憶體使用從 O(n) 降到 O(1)
2. **並行處理**：多個 Web Workers 同時處理，速度提升 3-5 倍
3. **中斷恢復**：支援處理中斷後從檢查點恢復
4. **自動降級**：遇到錯誤自動降級到舊系統
5. **透明監控**：實時效能監控和統計

## 🔧 開發指南

### 添加新功能

1. 所有新功能都應該在這個目錄下開發
2. 不要修改現有系統的核心檔案
3. 使用功能開關控制新功能的啟用

### 錯誤處理

所有模組都應該實現優雅的錯誤處理：

```javascript
try {
  // 新系統處理邏輯
} catch (error) {
  console.warn('新系統處理失敗，降級到舊系統', error);
  return fallbackToLegacySystem();
}
```

### 效能監控

使用內建的效能監控器追蹤處理效能：

```javascript
performanceMonitor.track('split', {
  duration: endTime - startTime,
  memoryUsed: performance.memory.usedJSHeapSize,
  segmentsCreated: segments.length
});
```

## 📈 開發進度

- [x] 建立目錄結構
- [ ] 實現配置管理系統
- [ ] 實現主控制器
- [ ] 實現串流分析器
- [ ] 實現智慧分割器
- [ ] 實現並行處理器
- [ ] 實現進度檢查點
- [ ] 實現快取管理
- [ ] 整合測試
- [ ] 效能優化
- [ ] 生產環境部署

## 🤝 貢獻指南

1. 所有程式碼都應該遵循現有的編碼風格
2. 添加適當的註釋和文檔
3. 確保所有測試通過
4. 提交前進行程式碼審查

## 📞 聯絡方式

如有問題或建議，請在專案的 GitHub Issues 中提出。