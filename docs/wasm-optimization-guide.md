# WASM 轉譯優化指南

## 概述

本指南說明如何使用和配置優化版 WASM 轉譯引擎，大幅提升轉譯速度。

## 優化技術

### 1. 多執行緒 Worker 池
- 根據 CPU 核心數自動創建多個 Worker
- 並行處理多個音訊段
- 預期提升：2-8倍（取決於 CPU 核心數）

### 2. SIMD 指令集加速
- 利用 WebAssembly SIMD 進行向量運算
- 加速音訊重採樣和處理
- 預期提升：2-4倍

### 3. 智慧音訊分段
- 使用簡化的 VAD（語音活動檢測）
- 在靜音處分割，避免截斷語音
- 重疊處理，確保不遺漏內容

### 4. 串流處理
- 邊處理邊返回結果
- 提升使用者體驗
- 減少等待時間

### 5. 模型快取
- 使用 IndexedDB 快取模型
- 避免重複下載
- 加快初始化速度

## 使用方法

### 基本使用

優化版引擎預設啟用，無需額外設定：

```javascript
// 自動使用優化版
const wasmManager = new WhisperWASMManager();
await wasmManager.initialize('base');
const result = await wasmManager.transcribe(audioFile);
```

### 配置選項

可以通過 `WASMConfig` 調整優化參數：

```javascript
import WASMConfig from './js/wasm/wasm-config.js';

// 調整 Worker 池大小
WASMConfig.optimization.workerPoolSize = 8; // 0 = 自動

// 啟用/停用 SIMD
WASMConfig.optimization.enableSIMD = true;

// 調整分段大小
WASMConfig.performance.chunkDuration = 30; // 秒

// 儲存偏好設定
WASMConfig.saveUserPreferences();
```

### 進階配置

```javascript
// 完整配置範例
WASMConfig.optimization = {
  enableWorkerPool: true,        // 啟用 Worker 池
  workerPoolSize: 0,            // 0 = 自動根據 CPU
  enableSIMD: true,             // SIMD 加速
  enablePreloading: true,       // 模型預載入
  enableStreaming: true,        // 串流結果
  enableParallelProcessing: true, // 並行處理
  useQuantizedModels: true      // 量化模型（更快）
};

WASMConfig.performance = {
  chunkDuration: 30,           // 分段大小（秒）
  overlapDuration: 0.5,        // 重疊時間（秒）
  maxConcurrentChunks: 4,      // 最大並發數
  memoryLimit: 2048,          // 記憶體限制（MB）
  cacheStrategy: 'aggressive'  // 快取策略
};
```

## 效能優化建議

### 1. 硬體要求
- **CPU**：至少 4 核心，建議 8 核心以上
- **RAM**：至少 4GB，建議 8GB 以上
- **瀏覽器**：Chrome 88+、Firefox 89+、Safari 15+

### 2. 瀏覽器設定
需要啟用以下功能：
- WebAssembly
- SharedArrayBuffer（需要 HTTPS 或特殊 headers）
- SIMD（實驗性功能）

### 3. 伺服器設定
為了啟用 SharedArrayBuffer，需要設定以下 HTTP headers：
```
Cross-Origin-Embedder-Policy: require-corp
Cross-Origin-Opener-Policy: same-origin
```

#### Live Server (VSCode) 設定
如果使用 VSCode 的 Live Server 擴充功能，可以在專案根目錄創建 `.vscode/settings.json`：
```json
{
  "liveServer.settings.AdvanceCustomBrowserCmdLine": "chrome",
  "liveServer.settings.CustomBrowser": "chrome",
  "liveServer.settings.host": "localhost",
  "liveServer.settings.https": {
    "enable": true,
    "cert": "cert.pem",
    "key": "key.pem",
    "passphrase": ""
  }
}
```

#### GitHub Pages 設定
GitHub Pages 目前不支援自訂 HTTP headers，因此優化版引擎會自動降級到標準版。

### 4. 模型選擇
- **Tiny**：最快，適合快速預覽（75MB）
- **Base**：平衡速度和品質（142MB）
- **Small**：最高品質，速度較慢（466MB）

## 效能測試

使用測試頁面比較優化版和標準版：

1. 開啟 `/test/test-wasm-optimized.html`
2. 選擇音訊檔案
3. 點擊「效能對比」查看提升幅度

### 預期效能提升

| 硬體配置 | 標準版 | 優化版 | 提升倍數 |
|---------|--------|--------|----------|
| 2核 CPU | 1.0x | 2-3x | 2-3倍 |
| 4核 CPU | 1.0x | 4-6x | 4-6倍 |
| 8核 CPU | 1.0x | 8-12x | 8-12倍 |
| 16核 CPU | 1.0x | 12-16x | 12-16倍 |

## 故障排除

### 1. SIMD 不支援
錯誤訊息：`SIMD is not supported`

解決方法：
- 更新瀏覽器到最新版本
- Chrome：chrome://flags 啟用 WebAssembly SIMD
- 或自動降級到非 SIMD 版本

### 2. SharedArrayBuffer 不可用
錯誤訊息：`SharedArrayBuffer is not defined`

解決方法：
- 使用 HTTPS 連線
- 設定正確的 COEP/COOP headers
- 或降級到單執行緒模式

### 3. 記憶體不足
錯誤訊息：`Out of memory`

解決方法：
- 減少 Worker 池大小
- 使用較小的模型（tiny）
- 減小分段大小

### 4. Worker 載入失敗
錯誤訊息：`Failed to load worker`

解決方法：
- 檢查 Worker 檔案路徑
- 確保伺服器支援正確的 MIME type
- 檢查 CSP 政策

## 最佳實踐

1. **自動配置**：讓系統根據硬體自動調整參數
2. **漸進式載入**：先使用 tiny 模型測試，再升級到更大模型
3. **監控記憶體**：注意記憶體使用，避免 OOM
4. **錯誤處理**：實現降級機制，確保相容性
5. **使用者反饋**：顯示進度和預估時間

## API 參考

### WASMConfig
```javascript
// 自動優化配置
WASMConfig.autoOptimize();

// 獲取效能預估
const estimate = WASMConfig.getPerformanceEstimate(fileSizeMB);
console.log(estimate.speedMultiplier); // "4.5x"

// 載入/儲存偏好
WASMConfig.loadUserPreferences();
WASMConfig.saveUserPreferences();
```

### OptimizedWhisperWASM
```javascript
// 初始化
await optimizedWhisperWASM.initialize('base');

// 轉譯
const result = await optimizedWhisperWASM.transcribe(audioFile, {
  onProgress: (percent) => console.log(`${percent}%`),
  onPartialResult: (partial) => console.log(partial.text)
});

// 清理資源
optimizedWhisperWASM.cleanup();
```

## 更新日誌

### v1.0.0 (2025-01-25)
- 初始版本發布
- 實現多執行緒 Worker 池
- 加入 SIMD 支援
- 智慧音訊分段
- 串流結果輸出
- 自動硬體優化

## 聯絡與支援

如有問題或建議，請在 GitHub 提出 issue。