# 大檔案本地轉譯修復方案

## 🔴 問題根本原因

經過深入分析，大檔案本地轉譯失敗的根本原因是：

### 1. **記憶體管理災難性問題**
**檔案位置**: `js/wasm/whisper-transformers.js:148`
```javascript
async prepareAudio(audioFile) {
  const arrayBuffer = await audioFile.arrayBuffer(); // 🚨 大檔案一次性載入
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer); // 🚨 記憶體爆炸
}
```

**問題**: 
- 100MB 音訊檔案解碼後需要 ~1.6GB 記憶體
- 瀏覽器記憶體限制通常為 2-4GB
- 沒有分段處理機制

### 2. **外部依賴不可靠**
**檔案位置**: `js/wasm/whisper-transformers.js:71`
```javascript
env.remoteURL = 'https://huggingface.co/'; // 🚨 需要網路下載大模型
```

**問題**:
- 模型檔案 142MB-466MB，下載可能失敗
- 網路問題導致轉譯中斷
- 首次使用需要等待數分鐘

### 3. **真實 WASM 實現缺失**
**檔案位置**: `js/wasm/whisper-wasm-manager.js:238`
```javascript
async loadWASMModule() {
  throw new Error('WASM 模組載入尚未實作，請使用開發模式'); // 🚨 完全沒有實現
}
```

## ⚡ 立即修復方案

### 修復 1: 分段音訊處理
```javascript
// 新增到 whisper-transformers.js
async prepareAudioInChunks(audioFile, chunkSizeMB = 25) {
  const fileSize = audioFile.size;
  const chunkSize = chunkSizeMB * 1024 * 1024;
  
  if (fileSize <= chunkSize) {
    return await this.prepareAudio(audioFile); // 小檔案直接處理
  }
  
  // 大檔案分段處理
  const chunks = [];
  let offset = 0;
  
  while (offset < fileSize) {
    const end = Math.min(offset + chunkSize, fileSize);
    const chunk = audioFile.slice(offset, end);
    
    // 處理音訊區塊
    const audioData = await this.prepareAudio(chunk);
    chunks.push(audioData);
    
    offset = end;
    
    // 釋放記憶體
    if (typeof chunk.close === 'function') {
      chunk.close();
    }
  }
  
  // 合併音訊資料
  return this.mergeAudioChunks(chunks);
}
```

### 修復 2: 離線模型支援
```javascript
// 修改 whisper-transformers.js 初始化
async initialize(modelName) {
  // 優先使用本地模型
  const localModelPath = `./models/${this.models[modelName]}`;
  
  try {
    // 檢查本地模型是否存在
    const response = await fetch(localModelPath, { method: 'HEAD' });
    if (response.ok) {
      env.localModelPath = './models/';
      env.allowRemoteModels = false; // 禁用遠端下載
      console.log('使用本地模型:', localModelPath);
    } else {
      throw new Error('本地模型不存在');
    }
  } catch (error) {
    // 降級到遠端模型
    console.log('本地模型不可用，使用遠端模型');
    env.allowRemoteModels = true;
    env.remoteURL = 'https://huggingface.co/';
  }
  
  // 建立 pipeline
  this.pipeline = await pipeline(
    'automatic-speech-recognition',
    this.models[modelName],
    { quantized: true }
  );
}
```

### 修復 3: 記憶體監控和保護
```javascript
// 新增記憶體檢查功能
class MemoryManager {
  static checkAvailableMemory() {
    if ('memory' in performance) {
      const memory = performance.memory;
      const available = memory.jsHeapSizeLimit - memory.usedJSHeapSize;
      return available / 1024 / 1024; // 轉換為 MB
    }
    return null; // 瀏覽器不支援
  }
  
  static estimateAudioMemory(fileSizeMB) {
    // 音訊解碼後大約是原檔案的 16 倍（取決於格式和採樣率）
    return fileSizeMB * 16;
  }
  
  static canProcessFile(fileSizeMB) {
    const available = this.checkAvailableMemory();
    if (!available) return true; // 無法檢測時假設可以處理
    
    const required = this.estimateAudioMemory(fileSizeMB);
    const safety = 500; // 500MB 安全緩衝
    
    return available > (required + safety);
  }
}

// 在轉譯前檢查記憶體
async transcribe(audioFile, options = {}) {
  const fileSizeMB = audioFile.size / 1024 / 1024;
  
  if (!MemoryManager.canProcessFile(fileSizeMB)) {
    throw new Error(
      `檔案過大（${fileSizeMB.toFixed(1)}MB），可能導致記憶體不足。` +
      `建議使用 API 轉譯或分割檔案。`
    );
  }
  
  // 繼續處理...
}
```

## 🛠️ 實際修復檔案

### 1. 修復 WhisperTransformers 類別
```javascript
// 完整的修復版本
class WhisperTransformers {
  constructor() {
    this.pipeline = null;
    this.models = {
      'tiny': 'Xenova/whisper-tiny',
      'base': 'Xenova/whisper-base', 
      'small': 'Xenova/whisper-small'
    };
    this.maxChunkSize = 25 * 1024 * 1024; // 25MB 分段
  }
  
  async transcribe(audioFile, options = {}) {
    try {
      // 記憶體檢查
      const fileSizeMB = audioFile.size / 1024 / 1024;
      if (fileSizeMB > 100) {
        throw new Error(`檔案過大（${fileSizeMB.toFixed(1)}MB），建議使用 API 轉譯`);
      }
      
      // 分段處理大檔案
      const audioData = await this.prepareAudioSafely(audioFile, options);
      
      // 執行轉譯
      const result = await this.pipeline(audioData, {
        task: 'transcribe',
        language: options.language || 'chinese',
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5
      });
      
      return this.formatResult(result);
      
    } catch (error) {
      console.error('轉譯失敗:', error);
      throw new Error(`本地轉譯失敗: ${error.message}`);
    }
  }
  
  async prepareAudioSafely(audioFile, options = {}) {
    const fileSizeMB = audioFile.size / 1024 / 1024;
    
    if (fileSizeMB <= 25) {
      // 小檔案直接處理
      return await this.prepareAudio(audioFile);
    } else {
      // 大檔案分段處理
      return await this.prepareAudioInChunks(audioFile);
    }
  }
  
  async prepareAudioInChunks(audioFile) {
    const chunks = [];
    const chunkSize = this.maxChunkSize;
    let offset = 0;
    
    while (offset < audioFile.size) {
      const end = Math.min(offset + chunkSize, audioFile.size);
      const chunk = audioFile.slice(offset, end);
      
      try {
        const audioData = await this.prepareAudio(chunk);
        chunks.push(audioData);
        
        // 進度回調
        if (this.onProgress) {
          const progress = (end / audioFile.size) * 50; // 音訊處理佔 50%
          this.onProgress({ percentage: progress, message: `處理音訊區塊 ${chunks.length}` });
        }
        
      } catch (error) {
        console.error(`處理區塊 ${chunks.length} 失敗:`, error);
        throw error;
      }
      
      offset = end;
    }
    
    // 合併音訊資料
    return this.mergeAudioChunks(chunks);
  }
  
  mergeAudioChunks(chunks) {
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);
    
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    
    return merged;
  }
}
```

## 🚀 部署步驟

### 1. 立即修復（緊急）
1. **更新記憶體檢查邏輯** - 防止瀏覽器崩潰
2. **添加檔案大小限制** - 大於 100MB 強制使用 API
3. **改善錯誤訊息** - 提供明確的解決建議

### 2. 短期改進（1週內）
1. **實現分段處理** - 支援 25-100MB 檔案
2. **本地化模型** - 下載模型到本地，減少網路依賴  
3. **進度優化** - 準確的進度顯示和時間估算

### 3. 長期解決（1個月內）
1. **真實 WASM 實現** - 使用 whisper.cpp WASM 版本
2. **串流處理** - 實現真正的串流音訊處理
3. **硬體加速** - 支援 WebGPU 加速

## 📊 修復效果預期

| 檔案大小 | 修復前 | 修復後 |
|----------|---------|---------|
| < 25MB | ❌ 外部依賴失敗 | ✅ 穩定可用 |
| 25-50MB | ❌ 記憶體溢出 | ✅ 分段處理 |
| 50-100MB | ❌ 瀏覽器崩潰 | ⚠️ 降級到 API |
| > 100MB | ❌ 完全失敗 | ⚠️ 強制使用 API |

## 🔧 測試驗證

建立測試檔案 `test-large-file-fix.html`：
```html
<!-- 測試大檔案轉譯修復 -->
<script>
  async function testLargeFileTranscription() {
    // 測試記憶體檢查
    console.log('可用記憶體:', MemoryManager.checkAvailableMemory());
    
    // 測試分段處理
    const file = document.getElementById('audioInput').files[0];
    if (file) {
      try {
        const result = await whisperTransformers.transcribe(file);
        console.log('轉譯成功:', result);
      } catch (error) {
        console.error('轉譯失敗:', error.message);
      }
    }
  }
</script>
```

這個修復方案將大幅改善大檔案本地轉譯的穩定性和成功率。