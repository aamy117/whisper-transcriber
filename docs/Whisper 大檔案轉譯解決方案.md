# Whisper 大檔案轉譯解決方案 - 完整執行計劃書

## 專案目標

解決 OpenAI Whisper API 25MB 檔案大小限制，為使用者提供靈活的大檔案轉譯選擇：API 自動分割轉譯或本地 WASM 轉譯。

## 整體策略

### 使用者選擇導向的處理流程
```
檔案上傳
    ↓
使用者選擇：
    ↓
1、本地轉譯（WASM）→ 載入模型 → 本地處理 → 返回結果
或
2、API 轉譯
    ↓
檔案 ≤ 25MB？
    ↓
   是 → 直接使用 OpenAI API
    ↓
   否 → API 轉譯（自動分割）→ 分割檔案 → 批次 API 呼叫 → 合併結果
```

### 核心功能
1. **智能檔案檢測**：自動判斷是否超過 API 限制
2. **使用者友善選擇**：清楚比較兩種方案的優缺點
3. **API 自動分割**：大檔案智能切割，保持時間軸連續性
4. **本地 WASM 轉譯**：完全離線，隱私保護，無大小限制
5. **統一結果格式**：無論哪種方式，都返回一致的轉譯結果

---

## 📋 第二階段：音訊分割系統

### Day 1: 音訊分析與分割核心

#### 1.1 建立音訊分析模組 (`js/audio-analyzer.js`)
```javascript
class AudioAnalyzer {
  constructor() {
    this.audioContext = null;
  }

  async analyzeFile(file) {
    // 分析音訊檔案基本資訊
    const info = {
      duration: 0,
      sampleRate: 0,
      channels: 0,
      size: file.size,
      format: file.type,
      estimatedSegments: 0
    };
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      info.duration = audioBuffer.duration;
      info.sampleRate = audioBuffer.sampleRate;
      info.channels = audioBuffer.numberOfChannels;
      info.estimatedSegments = this.calculateOptimalSegments(file.size, info.duration);
      
    } catch (error) {
      console.warn('無法分析音訊檔案，使用檔案大小估算:', error);
      info.estimatedSegments = this.estimateSegmentsBySize(file.size);
    }
    
    return info;
  }

  calculateOptimalSegments(fileSize, duration) {
    const TARGET_SEGMENT_SIZE = 20 * 1024 * 1024; // 20MB 安全邊界
    const segmentsBySize = Math.ceil(fileSize / TARGET_SEGMENT_SIZE);
    const segmentsByTime = Math.ceil(duration / (15 * 60)); // 15分鐘一段
    
    return Math.max(segmentsBySize, segmentsByTime);
  }
}
```

#### 1.2 建立音訊分割器 (`js/audio-splitter.js`)
```javascript
class AudioSplitter {
  constructor() {
    this.ffmpegLoaded = false;
  }

  async splitAudioFile(file, targetSegments) {
    const chunks = [];
    
    if (this.canUseWebAudio(file)) {
      return await this.splitWithWebAudio(file, targetSegments);
    } else {
      return await this.splitByBytes(file, targetSegments);
    }
  }

  async splitWithWebAudio(file, targetSegments) {
    // 使用 Web Audio API 進行精確分割
    const audioContext = new AudioContext();
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    const segmentDuration = audioBuffer.duration / targetSegments;
    const chunks = [];
    
    for (let i = 0; i < targetSegments; i++) {
      const startTime = i * segmentDuration;
      const endTime = Math.min((i + 1) * segmentDuration, audioBuffer.duration);
      
      const segmentBuffer = this.extractAudioSegment(audioBuffer, startTime, endTime);
      const wavFile = this.audioBufferToWav(segmentBuffer);
      
      chunks.push({
        blob: new Blob([wavFile], { type: 'audio/wav' }),
        startTime: startTime,
        endTime: endTime,
        index: i
      });
    }
    
    return chunks;
  }

  async splitByBytes(file, targetSegments) {
    // 簡單的位元組分割（適用於無法解析的音訊格式）
    const chunkSize = Math.ceil(file.size / targetSegments);
    const chunks = [];
    
    for (let i = 0; i < targetSegments; i++) {
      const start = i * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      
      chunks.push({
        blob: file.slice(start, end),
        startTime: null, // 無法確定精確時間
        endTime: null,
        index: i
      });
    }
    
    return chunks;
  }
}
```

### Day 2: 批次 API 處理系統

#### 2.1 建立批次處理管理器 (`js/batch-transcription.js`)
```javascript
class BatchTranscriptionManager {
  constructor(apiManager) {
    this.apiManager = apiManager;
    this.maxConcurrent = 3; // 同時處理的段落數
    this.retryAttempts = 3;
  }

  async transcribeInBatches(audioChunks, options = {}) {
    const results = [];
    const totalChunks = audioChunks.length;
    
    // 顯示初始進度
    this.updateProgress(0, totalChunks, '準備開始批次轉譯...');
    
    // 分批處理
    for (let i = 0; i < totalChunks; i += this.maxConcurrent) {
      const batch = audioChunks.slice(i, i + this.maxConcurrent);
      const batchPromises = batch.map(chunk => 
        this.transcribeChunkWithRetry(chunk, options)
      );
      
      try {
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 更新進度
        const completed = Math.min(i + this.maxConcurrent, totalChunks);
        this.updateProgress(completed, totalChunks, 
          `已完成 ${completed}/${totalChunks} 段落`);
          
      } catch (error) {
        console.error('批次處理失敗:', error);
        throw new Error(`第 ${i + 1} 批次處理失敗: ${error.message}`);
      }
    }
    
    return this.mergeResults(results);
  }

  async transcribeChunkWithRetry(chunk, options) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryAttempts; attempt++) {
      try {
        const result = await this.apiManager.transcribe(chunk.blob, {
          ...options,
          response_format: 'verbose_json' // 需要時間戳資訊
        });
        
        // 調整時間戳
        if (chunk.startTime !== null) {
          result.segments = result.segments.map(segment => ({
            ...segment,
            start: segment.start + chunk.startTime,
            end: segment.end + chunk.startTime
          }));
        }
        
        return {
          ...result,
          chunkIndex: chunk.index,
          originalStartTime: chunk.startTime
        };
        
      } catch (error) {
        lastError = error;
        if (attempt < this.retryAttempts) {
          console.warn(`段落 ${chunk.index} 第 ${attempt} 次嘗試失敗，重試中...`);
          await this.delay(1000 * attempt); // 指數退避
        }
      }
    }
    
    throw new Error(`段落 ${chunk.index} 轉譯失敗: ${lastError.message}`);
  }

  mergeResults(results) {
    // 按順序排列
    results.sort((a, b) => a.chunkIndex - b.chunkIndex);
    
    // 合併文字
    const fullText = results.map(r => r.text).join(' ');
    
    // 合併段落，確保時間軸連續
    const allSegments = [];
    results.forEach(result => {
      allSegments.push(...result.segments);
    });
    
    return {
      text: fullText,
      segments: allSegments,
      language: results[0]?.language || 'unknown',
      duration: Math.max(...allSegments.map(s => s.end)),
      chunks: results.length
    };
  }
}
```

### Day 3: 使用者選擇介面

#### 3.1 建立選擇對話框 (`js/transcription-choice-modal.js`)


### Day 4: 樣式與整合測試

#### 4.1 建立選擇對話框樣式 (`css/transcription-choice.css`)
```css
/* 轉譯選擇對話框樣式 */
.transcription-choice-modal {
  max-width: 800px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
}

.file-info-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: var(--bg-tertiary);
  border-radius: 8px;
  margin-bottom: 1.5rem;
}

.file-icon {
  font-size: 2rem;
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color);
  border-radius: 50%;
}

.file-details h3 {
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
}

.file-details p {
  margin: 0.25rem 0;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.size-warning {
  color: var(--warning-color) !important;
  font-weight: 500;
}

.choice-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.choice-option {
  border: 2px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  cursor: pointer;
  transition: all 0.3s ease;
  background: var(--bg-primary);
}

.choice-option:hover {
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.choice-option.selected {
  border-color: var(--primary-color);
  background: var(--primary-color-light);
  box-shadow: 0 4px 20px rgba(59, 130, 246, 0.2);
}

.choice-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.choice-icon {
  font-size: 1.5rem;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-secondary);
  border-radius: 8px;
}

.choice-title {
  flex: 1;
}

.choice-title h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.1rem;
}

.recommended-badge, .privacy-badge {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
}

.recommended-badge {
  background: var(--success-color);
  color: white;
}

.privacy-badge {
  background: var(--info-color);
  color: white;
}

.choice-description {
  color: var(--text-secondary);
  font-size: 0.9rem;
  line-height: 1.4;
  margin-bottom: 1rem;
}

.choice-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.metric {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
}

.metric-label {
  color: var(--text-secondary);
}

.metric-value {
  font-weight: 500;
}

.metric-value.excellent {
  color: var(--success-color);
}

.metric-value.good {
  color: var(--info-color);
}

.metric-value.moderate {
  color: var(--warning-color);
}

.choice-features {
  border-top: 1px solid var(--border-color);
  padding-top: 1rem;
}

.feature {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.5rem;
}

.feature:last-child {
  margin-bottom: 0;
}

/* 本地選項 */
.local-options {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border-color);
}

.local-options h4 {
  margin: 0 0 1rem 0;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.model-selection {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.model-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.model-option:hover {
  background: var(--bg-tertiary);
}

.model-option input[type="radio"] {
  margin: 0;
}

.model-info strong {
  display: block;
  font-size: 0.9rem;
}

.model-size {
  color: var(--text-secondary);
  font-size: 0.8rem;
}

.model-desc {
  color: var(--text-secondary);
  font-size: 0.8rem;
  margin-top: 0.25rem;
}

/* 響應式設計 */
@media (max-width: 768px) {
  .choice-container {
    grid-template-columns: 1fr;
  }
  
  .choice-metrics {
    grid-template-columns: 1fr;
  }
  
  .transcription-choice-modal {
    width: 95%;
  }
}
```

---

## 📋 第一階段：WASM 本地轉譯系統

### Day 5: WASM 基礎架構

#### 5.1 下載並整合 WASM 模組
```bash
# 建立 WASM 目錄
mkdir js/wasm models

# 下載預編譯的 WASM 檔案
cd js/wasm
curl -o whisper.wasm https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper.wasm
curl -o whisper.js https://github.com/ggml-org/whisper.cpp/releases/latest/download/whisper.js

# 下載模型檔案
cd ../../models
curl -o ggml-tiny.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin
curl -o ggml-base.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
curl -o ggml-small.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
```

#### 5.2 建立 WASM 管理器 (`js/wasm/whisper-wasm-manager.js`)
```javascript
class WhisperWASMManager {
  constructor() {
    this.isInitialized = false;
    this.wasmModule = null;
    this.currentModel = null;
    this.worker = null;
    
    this.models = {
      tiny: { file: 'ggml-tiny.bin', size: 75 * 1024 * 1024, speed: 3 },
      base: { file: 'ggml-base.bin', size: 142 * 1024 * 1024, speed: 2 },
      small: { file: 'ggml-small.bin', size: 466 * 1024 * 1024, speed: 1.5 }
    };
  }

  async initialize(modelName = 'base') {
    if (this.isInitialized && this.currentModel === modelName) {
      return; // 已經初始化相同模型
    }

    try {
      // 檢查瀏覽器支援
      if (!this.checkWASMSupport()) {
        throw new Error('您的瀏覽器不支援 WebAssembly SIMD，請使用較新版本的 Chrome 或 Firefox');
      }

      // 檢查記憶體
      this.checkMemoryRequirements(modelName);

      // 載入 WASM 模組
      await this.loadWASMModule();

      // 載入模型
      await this.loadModel(modelName);

      this.isInitialized = true;
      this.currentModel = modelName;

    } catch (error) {
      console.error('WASM 初始化失敗:', error);
      throw error;
    }
  }

  checkWASMSupport() {
    // 檢查 WebAssembly 支援
    if (!('WebAssembly' in window)) {
      return false;
    }

    // 檢查 SIMD 支援（簡化檢測）
    try {
      new WebAssembly.Module(new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
      ]));
      return true;
    } catch (e) {
      return false;
    }
  }

  checkMemoryRequirements(modelName) {
    const modelInfo = this.models[modelName];
    const requiredMemory = modelInfo.size + (200 * 1024 * 1024); // 模型 + 200MB 緩衝

    // 檢查可用記憶體（如果瀏覽器支援）
    if ('memory' in performance) {
      const memInfo = performance.memory;
      if (memInfo.usedJSHeapSize + requiredMemory > memInfo.jsHeapSizeLimit) {
        throw new Error(`記憶體不足，建議使用較小的模型或關閉其他標籤頁`);
      }
    }
  }

  async loadWASMModule() {
    return new Promise((resolve, reject) => {
      // 動態載入 WASM 腳本
      const script = document.createElement('script');
      script.src = 'js/wasm/whisper.js';
      script.onload = () => {
        // 初始化 WASM 模組
        window.createWhisperModule().then(module => {
          this.wasmModule = module;
          resolve();
        }).catch(reject);
      };
      script.onerror = () => reject(new Error('無法載入 WASM 模組'));
      document.head.appendChild(script);
    });
  }

  async loadModel(modelName) {
    const modelInfo = this.models[modelName];
    const modelPath = `models/${modelInfo.file}`;

    try {
      // 檢查快取
      const cachedModel = await this.getCachedModel(modelName);
      if (cachedModel) {
        console.log('使用快取的模型');
        await this.wasmModule.loadModel(cachedModel);
        return;
      }

      // 下載模型
      console.log(`下載模型: ${modelName}`);
      const response = await fetch(modelPath);
      if (!response.ok) {
        throw new Error(`無法下載模型: ${response.statusText}`);
      }

      const modelData = await response.arrayBuffer();
      
      // 快取模型
      await this.cacheModel(modelName, modelData);
      
      // 載入到 WASM
      await this.wasmModule.loadModel(new Uint8Array(modelData));

    } catch (error) {
      throw new Error(`載入模型失敗: ${error.message}`);
    }
  }

  async transcribe(audioFile, options = {}) {
    if (!this.isInitialized) {
      throw new Error('WASM 模組尚未初始化');
    }

    return new Promise((resolve, reject) => {
      // 建立 Web Worker 進行轉譯
      this.worker = new Worker('js/workers/whisper-worker.js');

      // 準備音訊資料
      this.prepareAudioData(audioFile).then(audioData => {
        this.worker.postMessage({
          command: 'transcribe',
          audioData: audioData,
          options: {
            language: options.language || 'auto',
            task: options.task || 'transcribe',
            ...options
          }
        });
      }).catch(reject);

      // 監聽 Worker 訊息
      this.worker.onmessage = (event) => {
        const { type, data } = event.data;

        switch (type) {
          case 'progress':
            if (options.onProgress) {
              options.onProgress(data);
            }
            break;

          case 'result':
            this.worker.terminate();
            this.worker = null;
            resolve(data);
            break;

          case 'error':
            this.worker.terminate();
            this.worker = null;
            reject(new Error(data.message));
            break;
        }
      };

      this.worker.onerror = (error) => {
        this.worker.terminate();
        this.worker = null;
        reject(new Error(`Worker 錯誤: ${error.message}`));
      };
    });
  }

  async prepareAudioData(audioFile) {
    // 轉換音訊為 16kHz WAV 格式
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 重採樣到 16kHz
    const targetSampleRate = 16000;
    const resampledBuffer = this.resampleAudio(audioBuffer, targetSampleRate);

    // 轉換為 Float32Array
    return resampledBuffer.getChannelData(0);
  }

  resampleAudio(audioBuffer, targetSampleRate) {
    const sourceSampleRate = audioBuffer.sampleRate;
    const sourceLength = audioBuffer.length;
    const targetLength = Math.round(sourceLength * targetSampleRate / sourceSampleRate);

    const offlineContext = new OfflineAudioContext(1, targetLength, targetSampleRate);
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start();

    return offlineContext.startRendering();
  }

  // 模型快取方法
  async getCachedModel(modelName) {
    try {
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['models'], 'readonly');
      const store = transaction.objectStore('models');
      const request = store.get(modelName);

      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result?.data);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('無法從快取載入模型:', error);
      return null;
    }
  }

  async cacheModel(modelName, modelData) {
    try {
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['models'], 'readwrite');
      const store = transaction.objectStore('models');
      
      await store.put({
        name: modelName,
        data: modelData,
        timestamp: Date.now()
      });
    } catch (error) {
      console.warn('無法快取模型:', error);
    }
  }

  async openIndexedDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('WhisperModels', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('models')) {
          db.createObjectStore('models', { keyPath: 'name' });
        }
      };
    });
  }

  cancel() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  getModelInfo(modelName) {
    return this.models[modelName];
  }

  isModelCached(modelName) {
    return this.getCachedModel(modelName).then(data => !!data);
  }
}
```

### Web Worker 與音訊處理

#### 6.1 建立 Whisper Worker (`js/workers/whisper-worker.js`)
```javascript
// Whisper Web Worker
importScripts('../wasm/whisper.js');

class WhisperWorker {
  constructor() {
    this.wasmModule = null;
    this.isInitialized = false;
  }

  async initialize() {
    try {
      this.wasmModule = await createWhisperModule();
      this.isInitialized = true;
    } catch (error) {
      throw new Error(`Worker 初始化失敗: ${error.message}`);
    }
  }

  async transcribe(audioData, options) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // 回報開始
      this.postProgress(0, '開始轉譯...');

      // 執行轉譯
      const result = await this.wasmModule.transcribe(audioData, {
        language: options.language,
        task: options.task,
        onProgress: (progress) => {
          this.postProgress(progress.percentage, progress.message);
        }
      });

      // 格式化結果
      const formattedResult = this.formatResult(result);

      // 回報完成
      this.postProgress(100, '轉譯完成');
      return formattedResult;

    } catch (error) {
      throw new Error(`轉譯失敗: ${error.message}`);
    }
  }

  formatResult(rawResult) {
    return {
      text: rawResult.text,
      segments: rawResult.segments.map(segment => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text.trim()
      })),
      language: rawResult.language,
      duration: rawResult.duration
    };
  }

  postProgress(percentage, message) {
    self.postMessage({
      type: 'progress',
      data: { percentage, message }
    });
  }
}

// Worker 主邏輯
let worker = null;

self.onmessage = async function(event) {
  const { command, audioData, options } = event.data;

  try {
    switch (command) {
      case 'transcribe':
        if (!worker) {
          worker = new WhisperWorker();
        }
        
        const result = await worker.transcribe(audioData, options);
        
        self.postMessage({
          type: 'result',
          data: result
        });
        break;

      default:
        throw new Error(`未知的命令: ${command}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      data: { message: error.message }
    });
  }
};
```

### Day 8: 統一進度顯示系統

#### 8.1 建立進度管理器 (`js/transcription-progress.js`)
```javascript
class TranscriptionProgressManager {
  constructor() {
    this.currentModal = null;
    this.canCancel = false;
    this.onCancel = null;
  }

  showProgress(title, canCancel = false) {
    this.canCancel = canCancel;
    this.currentModal = this.createProgressModal(title);
    document.body.appendChild(this.currentModal);
  }

  updateProgress(percentage, message, details = '') {
    if (!this.currentModal) return;

    const progressBar = this.currentModal.querySelector('.progress-fill');
    const progressText = this.currentModal.querySelector('.progress-text');
    const progressDetails = this.currentModal.querySelector('.progress-details');

    if (progressBar) {
      progressBar.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
    }

    if (progressText) {
      progressText.textContent = message;
    }

    if (progressDetails && details) {
      progressDetails.textContent = details;
    }

    // 更新百分比顯示
    const percentageEl = this.currentModal.querySelector('.progress-percentage');
    if (percentageEl) {
      percentageEl.textContent = `${Math.round(percentage)}%`;
    }
  }

  hideProgress() {
    if (this.currentModal) {
      this.currentModal.remove();
      this.currentModal = null;
    }
  }

  createProgressModal(title) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-content progress-modal">
        <div class="progress-header">
          <h3>${title}</h3>
          ${this.canCancel ? '<button class="cancel-btn" id="cancelTranscription">取消</button>' : ''}
        </div>
        
        <div class="progress-container">
          <div class="progress-bar">
            <div class="progress-fill"></div>
          </div>
          <div class="progress-info">
            <span class="progress-percentage">0%</span>
            <span class="progress-text">準備中...</span>
          </div>
        </div>
        
        <div class="progress-details"></div>
        
        <div class="progress-tips">
          <p>💡 轉譯過程中請保持網頁開啟</p>
          <p>🔄 大檔案轉譯可能需要較長時間，請耐心等待</p>
        </div>
      </div>
    `;

    // 綁定取消事件
    if (this.canCancel) {
      const cancelBtn = modal.querySelector('#cancelTranscription');
      cancelBtn.addEventListener('click', () => {
        if (this.onCancel) {
          this.onCancel();
        }
        this.hideProgress();
      });
    }

    return modal;
  }

  setOnCancel(callback) {
    this.onCancel = callback;
  }
}
```

---

## 📋 第三階段：主程式整合

### Day 9: 主控制邏輯

#### 9.1 更新主程式 (`js/main.js` 的 handleFileSelect 函數)
```javascript
// 在現有 main.js 中更新 handleFileSelect 函數
async function handleFileSelect(files) {
  if (!files || files.length === 0) return;

  const file = files[0];
  
  // 檢查檔案類型
  if (!isAudioFile(file)) {
    showError('請選擇音訊檔案');
    return;
  }

  try {
    const API_LIMIT = 25 * 1024 * 1024; // 25MB
    
    if (file.size <= API_LIMIT) {
      // 小檔案：直接使用 API
      console.log('檔案大小在限制內，使用 API 轉譯');
      await handleDirectAPITranscription(file);
    } else {
      // 大檔案：顯示選擇對話框
      console.log('檔案超過 API 限制，顯示選擇對話框');
      await handleLargeFileTranscription(file);
    }
    
  } catch (error) {
    console.error('處理檔案時發生錯誤:', error);
    showError(error.message);
  }
}

async function handleLargeFileTranscription(file) {
  // 分析檔案
  const analyzer = new AudioAnalyzer();
  const fileInfo = await analyzer.analyzeFile(file);
  
  // 顯示選擇對話框
  const choiceModal = new TranscriptionChoiceModal();
  const userChoice = await choiceModal.show({
    name: file.name,
    size: file.size,
    duration: fileInfo.duration,
    estimatedSegments: fileInfo.estimatedSegments
  });

  if (!userChoice) {
    return; // 使用者取消
  }

  if (userChoice.method === 'api') {
    await handleBatchAPITranscription(file, fileInfo);
  } else {
    await handleLocalWASMTranscription(file, userChoice);
  }
}

async function handleDirectAPITranscription(file) {
  const progressManager = new TranscriptionProgressManager();
  
  try {
    progressManager.showProgress('API 轉譯中...', false);
    progressManager.updateProgress(10, '正在上傳檔案...');

    // 使用現有的 API 邏輯
    const result = await transcribeWithAPI(file, {
      onProgress: (progress) => {
        progressManager.updateProgress(
          10 + (progress * 0.9), 
          `轉譯中... ${Math.round(progress)}%`
        );
      }
    });

    progressManager.updateProgress(100, '轉譯完成');
    progressManager.hideProgress();

    // 顯示結果
    displayTranscriptionResult(result);

  } catch (error) {
    progressManager.hideProgress();
    throw error;
  }
}

async function handleBatchAPITranscription(file, fileInfo) {
  const progressManager = new TranscriptionProgressManager();
  
  try {
    progressManager.showProgress('批次 API 轉譯中...', true);
    
    // 設定取消回調
    let cancelled = false;
    progressManager.setOnCancel(() => {
      cancelled = true;
    });

    // 分割檔案
    progressManager.updateProgress(5, '正在分析和分割檔案...');
    const splitter = new AudioSplitter();
    const chunks = await splitter.splitAudioFile(file, fileInfo.estimatedSegments);

    if (cancelled) return;

    // 批次轉譯
    const batchManager = new BatchTranscriptionManager(apiManager);
    batchManager.updateProgress = (completed, total, message) => {
      if (cancelled) return;
      const percentage = 5 + ((completed / total) * 90);
      progressManager.updateProgress(percentage, message, 
        `已完成 ${completed}/${total} 段落`);
    };

    const result = await batchManager.transcribeInBatches(chunks);

    if (cancelled) return;

    progressManager.updateProgress(100, '轉譯完成，正在整理結果...');
    progressManager.hideProgress();

    // 顯示結果
    displayTranscriptionResult(result);

  } catch (error) {
    progressManager.hideProgress();
    throw error;
  }
}

async function handleLocalWASMTranscription(file, choice) {
  const progressManager = new TranscriptionProgressManager();
  
  try {
    progressManager.showProgress('本地轉譯中...', true);
    
    // 設定取消回調
    let cancelled = false;
    const wasmManager = new WhisperWASMManager();
    progressManager.setOnCancel(() => {
      cancelled = true;
      wasmManager.cancel();
    });

    // 初始化 WASM
    progressManager.updateProgress(5, '正在載入 WASM 模組...');
    
    if (cancelled) return;
    
    // 檢查模型是否已快取
    const isCached = await wasmManager.isModelCached(choice.model);
    if (!isCached) {
      const modelInfo = wasmManager.getModelInfo(choice.model);
      progressManager.updateProgress(10, 
        `正在下載 ${choice.model} 模型 (${Math.round(modelInfo.size / 1024 / 1024)}MB)...`,
        '首次使用需要下載模型，後續使用會從快取載入'
      );
    }

    await wasmManager.initialize(choice.model);

    if (cancelled) return;

    progressManager.updateProgress(30, '正在處理音訊...');

    // 執行轉譯
    const result = await wasmManager.transcribe(file, {
      onProgress: (progress) => {
        if (cancelled) return;
        const percentage = 30 + (progress.percentage * 0.65);
        progressManager.updateProgress(percentage, progress.message);
      }
    });

    if (cancelled) return;

    progressManager.updateProgress(100, '轉譯完成');
    progressManager.hideProgress();

    // 顯示結果
    displayTranscriptionResult(result);

  } catch (error) {
    progressManager.hideProgress();
    throw error;
  }
}

// 輔助函數
function isAudioFile(file) {
  const audioTypes = [
    'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave',
    'audio/x-wav', 'audio/aac', 'audio/ogg', 'audio/webm',
    'audio/flac', 'audio/x-flac', 'audio/mp4', 'audio/m4a'
  ];
  
  return audioTypes.includes(file.type) || 
         /\.(mp3|wav|aac|ogg|flac|m4a|wma)$/i.test(file.name);
}

function displayTranscriptionResult(result) {
  // 使用現有的結果顯示邏輯
  // 確保格式一致，無論來源是 API 還是 WASM
  
  console.log('轉譯結果:', result);
  
  // 更新編輯器內容
  if (result.segments && result.segments.length > 0) {
    updateEditorWithSegments(result.segments);
  } else {
    updateEditorWithText(result.text);
  }
  
  // 顯示轉譯區域
  const transcriptionSection = document.getElementById('transcriptionSection');
  const editorSection = document.getElementById('editorSection');
  
  if (transcriptionSection) {
    transcriptionSection.style.display = 'block';
  }
  
  if (editorSection) {
    editorSection.style.display = 'block';
  }
  
  // 更新專案資訊
  updateCurrentProject(result);
}

function updateEditorWithSegments(segments) {
  const editorContent = document.getElementById('editorContent');
  if (!editorContent) return;
  
  editorContent.innerHTML = '';
  
  segments.forEach((segment, index) => {
    const segmentDiv = document.createElement('div');
    segmentDiv.className = 'transcription-segment';
    segmentDiv.dataset.startTime = segment.start;
    segmentDiv.dataset.endTime = segment.end;
    
    segmentDiv.innerHTML = `
      <div class="segment-timestamp">
        ${formatTime(segment.start)} - ${formatTime(segment.end)}
      </div>
      <div class="segment-text" contenteditable="true">
        ${segment.text}
      </div>
    `;
    
    editorContent.appendChild(segmentDiv);
  });
}

function updateEditorWithText(text) {
  const editorContent = document.getElementById('editorContent');
  if (!editorContent) return;
  
  editorContent.innerHTML = `
    <div class="transcription-text" contenteditable="true">
      ${text}
    </div>
  `;
}

function updateCurrentProject(result) {
  // 更新當前專案資訊
  if (window.app && window.app.currentProject) {
    window.app.currentProject.transcription = {
      text: result.text,
      segments: result.segments || [],
      language: result.language || 'unknown',
      duration: result.duration || 0,
      method: result.method || 'unknown', // 'api', 'batch-api', 'local-wasm'
      createdAt: new Date().toISOString()
    };
    
    // 儲存專案
    if (window.app.saveProject) {
      window.app.saveProject();
    }
  }
}

function formatTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  } else {
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }
}
```

### Day 10: 錯誤處理與測試

#### 10.1 統一錯誤處理 (`js/error-handler.js`)
```javascript
class TranscriptionErrorHandler {
  static handle(error, context = '') {
    console.error(`轉譯錯誤 [${context}]:`, error);
    
    let userMessage = '轉譯過程中發生錯誤';
    let suggestions = [];
    
    // 根據錯誤類型提供具體建議
    if (error.message.includes('API')) {
      userMessage = 'API 呼叫失敗';
      suggestions = [
        '檢查網路連線',
        '確認 API Key 是否正確',
        '檢查 API 使用額度'
      ];
    } else if (error.message.includes('WASM')) {
      userMessage = '本地轉譯失敗';
      suggestions = [
        '嘗試重新整理頁面',
        '確認瀏覽器支援 WebAssembly',
        '考慮使用較小的模型'
      ];
    } else if (error.message.includes('記憶體')) {
      userMessage = '記憶體不足';
      suggestions = [
        '關閉其他瀏覽器標籤頁',
        '使用較小的模型',
        '嘗試分割音訊檔案'
      ];
    } else if (error.message.includes('檔案')) {
      userMessage = '檔案處理失敗';
      suggestions = [
        '確認檔案格式支援',
        '檢查檔案是否損壞',
        '嘗試轉換檔案格式'
      ];
    }
    
    this.showErrorModal(userMessage, suggestions, error.message);
  }
  
  static showErrorModal(title, suggestions, technicalDetails) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay error-modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header error-header">
          <div class="error-icon">⚠️</div>
          <h2>${title}</h2>
        </div>
        
        <div class="modal-body">
          <div class="error-suggestions">
            <h4>建議解決方案：</h4>
            <ul>
              ${suggestions.map(s => `<li>${s}</li>`).join('')}
            </ul>
          </div>
          
          <details class="technical-details">
            <summary>技術詳情</summary>
            <pre>${technicalDetails}</pre>
          </details>
        </div>
        
        <div class="modal-actions">
          <button class="btn btn-secondary" id="closeErrorModal">關閉</button>
          <button class="btn btn-primary" id="retryAction">重試</button>
        </div>
      </div>
    `;
    
    // 綁定事件
    modal.querySelector('#closeErrorModal').addEventListener('click', () => {
      modal.remove();
    });
    
    modal.querySelector('#retryAction').addEventListener('click', () => {
      modal.remove();
      // 這裡可以加入重試邏輯
    });
    
    document.body.appendChild(modal);
  }
}

// 全域錯誤處理
window.addEventListener('unhandledrejection', (event) => {
  if (event.reason && event.reason.message) {
    if (event.reason.message.includes('transcrib') || 
        event.reason.message.includes('WASM') || 
        event.reason.message.includes('whisper')) {
      TranscriptionErrorHandler.handle(event.reason, 'unhandled');
      event.preventDefault();
    }
  }
});
```

### Day 11: 樣式完善與響應式設計

#### 11.1 完善進度條樣式 (`css/progress-modal.css`)
```css
/* 進度對話框樣式 */
.progress-modal {
  min-width: 400px;
  max-width: 500px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.progress-header h3 {
  margin: 0;
  font-size: 1.2rem;
}

.cancel-btn {
  background: var(--error-color);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
}

.cancel-btn:hover {
  background: var(--error-color-dark);
}

.progress-container {
  margin-bottom: 1rem;
}

.progress-bar {
  width: 100%;
  height: 12px;
  background-color: var(--bg-tertiary);
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 0.75rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--primary-color), var(--primary-color-light));
  border-radius: 6px;
  transition: width 0.3s ease;
  width: 0%;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

.progress-percentage {
  font-weight: 600;
  color: var(--primary-color);
}

.progress-text {
  color: var(--text-secondary);
}

.progress-details {
  font-size: 0.85rem;
  color: var(--text-tertiary);
  text-align: center;
  margin-bottom: 1rem;
  min-height: 1.2em;
}

.progress-tips {
  background: var(--bg-tertiary);
  padding: 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
}

.progress-tips p {
  margin: 0.5rem 0;
  color: var(--text-secondary);
}

.progress-tips p:first-child {
  margin-top: 0;
}

.progress-tips p:last-child {
  margin-bottom: 0;
}

/* 錯誤對話框樣式 */
.error-modal .modal-content {
  max-width: 500px;
}

.error-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  color: var(--error-color);
}

.error-icon {
  font-size: 2rem;
}

.error-suggestions ul {
  list-style: none;
  padding: 0;
}

.error-suggestions li {
  padding: 0.5rem 0;
  position: relative;
  padding-left: 1.5rem;
}

.error-suggestions li::before {
  content: '💡';
  position: absolute;
  left: 0;
}

.technical-details {
  margin-top: 1rem;
  border: 1px solid var(--border-color);
  border-radius: 4px;
}

.technical-details summary {
  padding: 0.75rem;
  cursor: pointer;
  background: var(--bg-tertiary);
  font-weight: 500;
}

.technical-details pre {
  padding: 1rem;
  margin: 0;
  background: var(--bg-primary);
  font-size: 0.8rem;
  overflow-x: auto;
  color: var(--text-secondary);
}

/* 響應式設計 */
@media (max-width: 768px) {
  .progress-modal {
    min-width: 90%;
    max-width: 95%;
  }
  
  .progress-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
  
  .progress-info {
    flex-direction: column;
    gap: 0.5rem;
    text-align: center;
  }
  
  .progress-tips {
    font-size: 0.8rem;
  }
}
```

---

## 📋 第四階段：整合測試與部署（2-3 天）

### Day 12: 整合測試

#### 12.1 建立測試套件 (`tests/integration-test.js`)
```javascript
class TranscriptionIntegrationTest {
  constructor() {
    this.testResults = [];
    this.testAudioFiles = [];
  }

  async runAllTests() {
    console.log('🧪 開始整合測試...');
    
    try {
      await this.setupTestEnvironment();
      await this.testAPITranscription();
      await this.testBatchTranscription();
      await this.testWASMTranscription();
      await this.testErrorHandling();
      
      this.generateTestReport();
      
    } catch (error) {
      console.error('測試過程中發生錯誤:', error);
    }
  }

  async setupTestEnvironment() {
    console.log('📁 準備測試檔案...');
    
    // 建立不同大小的測試音訊檔案
    this.testAudioFiles = {
      small: await this.createTestAudio(10 * 1024 * 1024, 300), // 10MB, 5分鐘
      large: await this.createTestAudio(50 * 1024 * 1024, 1800), // 50MB, 30分鐘
      huge: await this.createTestAudio(100 * 1024 * 1024, 3600) // 100MB, 60分鐘
    };
  }

  async createTestAudio(targetSize, duration) {
    // 建立測試用的音訊檔案（實際實作中可能需要真實檔案）
    const audioContext = new AudioContext();
    const sampleRate = 44100;
    const length = sampleRate * duration;
    const buffer = audioContext.createBuffer(1, length, sampleRate);
    
    // 生成測試音訊（白噪音）
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    // 轉換為檔案格式
    const wavData = this.audioBufferToWav(buffer);
    return new File([wavData], `test_${duration}s.wav`, { type: 'audio/wav' });
  }

  async testAPITranscription() {
    console.log('🔗 測試 API 轉譯...');
    
    const startTime = Date.now();
    
    try {
      const result = await handleDirectAPITranscription(this.testAudioFiles.small);
      
      this.testResults.push({
        test: 'API 轉譯',
        status: 'pass',
        duration: Date.now() - startTime,
        result: result
      });
      
    } catch (error) {
      this.testResults.push({
        test: 'API 轉譯',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  async testBatchTranscription() {
    console.log('📦 測試批次轉譯...');
    
    const startTime = Date.now();
    
    try {
      const analyzer = new AudioAnalyzer();
      const fileInfo = await analyzer.analyzeFile(this.testAudioFiles.large);
      
      const result = await handleBatchAPITranscription(this.testAudioFiles.large, fileInfo);
      
      this.testResults.push({
        test: '批次 API 轉譯',
        status: 'pass',
        duration: Date.now() - startTime,
        segments: result.chunks,
        result: result
      });
      
    } catch (error) {
      this.testResults.push({
        test: '批次 API 轉譯',
        status: 'fail',
        duration: Date.now() - startTime,
        error: error.message
      });
    }
  }

  async testWASMTranscription() {
    console.log('🔧 測試 WASM 轉譯...');
    
    const models = ['tiny', 'base'];
    
    for (const model of models) {
      const startTime = Date.now();
      
      try {
        const choice = { method: 'local', model: model };
        const result = await handleLocalWASMTranscription(this.testAudioFiles.small, choice);
        
        this.testResults.push({
          test: `WASM 轉譯 (${model})`,
          status: 'pass',
          duration: Date.now() - startTime,
          model: model,
          result: result
        });
        
      } catch (error) {
        this.testResults.push({
          test: `WASM 轉譯 (${model})`,
          status: 'fail',
          duration: Date.now() - startTime,
          model: model,
          error: error.message
        });
      }
    }
  }

  async testErrorHandling() {
    console.log('❌ 測試錯誤處理...');
    
    const errorTests = [
      {
        name: '無效檔案格式',
        file: new File(['invalid'], 'test.txt', { type: 'text/plain' }),
        expectedError: '檔案格式'
      },
      {
        name: '空檔案',
        file: new File([], 'empty.wav', { type: 'audio/wav' }),
        expectedError: '檔案大小'
      }
    ];

    for (const errorTest of errorTests) {
      try {
        await handleFileSelect([errorTest.file]);
        
        this.testResults.push({
          test: `錯誤處理: ${errorTest.name}`,
          status: 'fail',
          error: '應該拋出錯誤但沒有'
        });
        
      } catch (error) {
        const isExpectedError = error.message.includes(errorTest.expectedError);
        
        this.testResults.push({
          test: `錯誤處理: ${errorTest.name}`,
          status: isExpectedError ? 'pass' : 'fail',
          error: error.message,
          expected: errorTest.expectedError
        });
      }
    }
  }

  generateTestReport() {
    console.log('\n📊 測試報告');
    console.log('='.repeat(50));
    
    const passed = this.testResults.filter(r => r.status === 'pass').length;
    const failed = this.testResults.filter(r => r.status === 'fail').length;
    
    console.log(`總測試數: ${this.testResults.length}`);
    console.log(`通過: ${passed} ✅`);
    console.log(`失敗: ${failed} ❌`);
    console.log(`成功率: ${Math.round((passed / this.testResults.length) * 100)}%`);
    
    console.log('\n詳細結果:');
    this.testResults.forEach(result => {
      const status = result.status === 'pass' ? '✅' : '❌';
      const duration = result.duration ? ` (${Math.round(result.duration / 1000)}s)` : '';
      console.log(`${status} ${result.test}${duration}`);
      
      if (result.status === 'fail') {
        console.log(`   錯誤: ${result.error}`);
      }
    });
  }

  // 輔助方法
  audioBufferToWav(buffer) {
    const length = buffer.length;
    const arrayBuffer = new ArrayBuffer(44 + length * 2);
    const view = new DataView(arrayBuffer);
    
    // WAV 標頭
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + length * 2, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, buffer.sampleRate, true);
    view.setUint32(28, buffer.sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, length * 2, true);
    
    // 音訊資料
    const channelData = buffer.getChannelData(0);
    let offset = 44;
    for (let i = 0; i < length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }
    
    return arrayBuffer;
  }
}

// 執行測試
window.runIntegrationTests = async function() {
  const tester = new TranscriptionIntegrationTest();
  await tester.runAllTests();
};
```

#### 12.2 建立設定檢查工具 (`js/system-check.js`)
```javascript
class SystemCompatibilityChecker {
  static async checkAll() {
    const results = {
      browser: this.checkBrowser(),
      webAssembly: this.checkWebAssembly(),
      audio: await this.checkAudioSupport(),
      storage: this.checkStorage(),
      memory: this.checkMemory(),
      network: await this.checkNetwork()
    };

    this.displayResults(results);
    return results;
  }

  static checkBrowser() {
    const userAgent = navigator.userAgent;
    const isChrome = /Chrome/.test(userAgent) && !/Edge/.test(userAgent);
    const isFirefox = /Firefox/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    const isEdge = /Edge/.test(userAgent);

    return {
      name: isChrome ? 'Chrome' : isFirefox ? 'Firefox' : isSafari ? 'Safari' : isEdge ? 'Edge' : 'Unknown',
      supported: isChrome || isFirefox || (isSafari && this.checkSafariVersion()),
      version: this.getBrowserVersion(),
      recommendations: isChrome || isFirefox ? [] : ['建議使用 Chrome 或 Firefox 以獲得最佳體驗']
    };
  }

  static checkWebAssembly() {
    const hasWASM = 'WebAssembly' in window;
    let hasSIMD = false;

    if (hasWASM) {
      try {
        // 簡化的 SIMD 檢測
        const module = new WebAssembly.Module(new Uint8Array([
          0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
        ]));
        hasSIMD = true;
      } catch (e) {
        // SIMD 可能不支援，但基本 WASM 支援
      }
    }

    return {
      basic: hasWASM,
      simd: hasSIMD,
      supported: hasWASM,
      recommendations: hasWASM ? 
        (hasSIMD ? [] : ['您的瀏覽器支援 WebAssembly，但 SIMD 指令可能受限，本地轉譯速度會較慢']) :
        ['您的瀏覽器不支援 WebAssembly，無法使用本地轉譯功能']
    };
  }

  static async checkAudioSupport() {
    const formats = {
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      ogg: 'audio/ogg',
      m4a: 'audio/mp4',
      webm: 'audio/webm'
    };

    const support = {};
    const audio = document.createElement('audio');

    for (const [format, mimeType] of Object.entries(formats)) {
      support[format] = audio.canPlayType(mimeType) !== '';
    }

    const hasWebAudio = 'AudioContext' in window || 'webkitAudioContext' in window;

    return {
      formats: support,
      webAudio: hasWebAudio,
      supported: hasWebAudio && Object.values(support).some(s => s),
      recommendations: hasWebAudio ? [] : ['您的瀏覽器不支援 Web Audio API，音訊處理功能受限']
    };
  }

  static checkStorage() {
    const hasIndexedDB = 'indexedDB' in window;
    const hasLocalStorage = 'localStorage' in window;

    let quota = null;
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      navigator.storage.estimate().then(estimate => {
        quota = estimate.quota;
      });
    }

    return {
      indexedDB: hasIndexedDB,
      localStorage: hasLocalStorage,
      quota: quota,
      supported: hasIndexedDB && hasLocalStorage,
      recommendations: hasIndexedDB ? [] : ['瀏覽器不支援 IndexedDB，無法快取模型檔案']
    };
  }

  static checkMemory() {
    let available = null;
    let used = null;
    let limit = null;

    if ('memory' in performance) {
      const mem = performance.memory;
      available = mem.jsHeapSizeLimit - mem.usedJSHeapSize;
      used = mem.usedJSHeapSize;
      limit = mem.jsHeapSizeLimit;
    }

    const recommendations = [];
    if (available && available < 500 * 1024 * 1024) {
      recommendations.push('可用記憶體較少，建議關閉其他標籤頁或使用較小的模型');
    }

    return {
      available: available,
      used: used,
      limit: limit,
      supported: !available || available > 200 * 1024 * 1024,
      recommendations: recommendations
    };
  }

  static async checkNetwork() {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    
    let speed = null;
    let type = null;
    
    if (connection) {
      speed = connection.downlink;
      type = connection.effectiveType;
    }

    // 測試網路延遲
    let latency = null;
    try {
      const start = performance.now();
      await fetch('/favicon.ico', { method: 'HEAD', cache: 'no-cache' });
      latency = performance.now() - start;
    } catch (e) {
      // 無法測試延遲
    }

    const recommendations = [];
    if (speed && speed < 1) {
      recommendations.push('網路速度較慢，首次下載模型可能需要較長時間');
    }

    return {
      speed: speed,
      type: type,
      latency: latency,
      supported: true,
      recommendations: recommendations
    };
  }

  static displayResults(results) {
    console.log('\n🔍 系統相容性檢查報告');
    console.log('='.repeat(50));

    for (const [category, result] of Object.entries(results)) {
      const status = result.supported ? '✅' : '❌';
      console.log(`${status} ${category.toUpperCase()}`);
      
      if (result.recommendations && result.recommendations.length > 0) {
        result.recommendations.forEach(rec => {
          console.log(`   💡 ${rec}`);
        });
      }
    }

    const overallSupported = Object.values(results).every(r => r.supported);
    console.log(`\n總體評估: ${overallSupported ? '✅ 完全相容' : '⚠️ 部分功能受限'}`);
  }

  static getBrowserVersion() {
    const userAgent = navigator.userAgent;
    const match = userAgent.match(/(Chrome|Firefox|Safari|Edge)\/(\d+)/);
    return match ? match[2] : 'Unknown';
  }

  static checkSafariVersion() {
    const match = navigator.userAgent.match(/Version\/(\d+)/);
    return match && parseInt(match[1]) >= 14; // Safari 14+ 較好支援
  }
}
```

### Day 13: 文件撰寫與部署準備

#### 13.1 使用者指南 (`docs/user-guide.md`)
```markdown
# Whisper 轉譯工具使用指南

## 功能概覽

本工具提供了靈活的音訊轉譯解決方案：
- **小檔案 (≤25MB)**：自動使用 OpenAI API，快速高精度
- **大檔案 (>25MB)**：選擇 API 自動分割或本地轉譯

## 快速開始

### 1. 設定 API Key
首次使用需要設定 OpenAI API Key：
1. 點擊右上角設定按鈕 ⚙️
2. 輸入您的 API Key
3. 點擊「儲存設定」

### 2. 上傳音訊檔案
- 拖放檔案到上傳區域
- 或點擊「選擇檔案」按鈕
- 支援格式：MP3、WAV、M4A、FLAC、OGG 等

### 3. 選擇轉譯方式
如果檔案超過 25MB，系統會顯示選擇對話框：

#### API 雲端轉譯 (推薦)
- ✅ 速度快 (2-5分鐘)
- ✅ 精度最高
- ✅ 支援所有格式
- 💰 成本：$0.006/分鐘

#### 本地轉譯
- ✅ 完全私密
- ✅ 免費使用
- ✅ 離線可用
- ⏱️ 速度較慢 (30-60分鐘)

### 4. 等待轉譯完成
- API 轉譯：顯示批次處理進度
- 本地轉譯：首次使用需下載模型

### 5. 編輯與匯出
- 點擊段落可跳轉播放
- 直接編輯文字內容
- 支援多種匯出格式

## 詳細功能說明

### 本地轉譯模型選擇

| 模型 | 大小 | 速度 | 精度 | 建議使用場景 |
|------|------|------|------|-------------|
| Tiny | 75MB | 快 | 基本 | 快速預覽、測試 |
| Base | 142MB | 中 | 良好 | 日常使用推薦 |
| Small | 466MB | 慢 | 高 | 高品質要求 |

### 快捷鍵

| 功能 | 快捷鍵 |
|------|--------|
| 播放/暫停 | 空白鍵 |
| 快退/快進 | Ctrl + ←/→ |
| 速度調整 | Ctrl + ↑/↓ |
| 儲存 | Ctrl + S |
| 搜尋 | Ctrl + F |
| 匯出 | Ctrl + E |

## 常見問題

### Q: 本地轉譯為什麼比較慢？
A: 本地轉譯使用您電腦的 CPU 處理，速度取決於硬體效能。雲端 API 使用專用的 GPU 叢集，因此速度較快。

### Q: 模型檔案會一直佔用空間嗎？
A: 模型會快取在瀏覽器中，可以在設定中清除快取。快取的模型讓後續使用更快速。

### Q: 哪種方式比較適合我？
A: 
- **追求速度和精度**：選擇 API 轉譯
- **重視隱私和成本**：選擇本地轉譯
- **檔案不大**：系統會自動使用 API

### Q: 本地轉譯需要網路嗎？
A: 首次使用需要下載模型，之後可以完全離線使用。

### Q: 支援哪些音訊格式？
A: 支援大部分常見格式：MP3、WAV、M4A、FLAC、OGG、AAC 等。

## 故障排除

### 本地轉譯失敗
1. 確認瀏覽器版本夠新 (Chrome 88+, Firefox 89+)
2. 關閉其他佔用記憶體的標籤頁
3. 嘗試使用較小的模型
4. 重新整理頁面重試

### API 轉譯失敗
1. 檢查網路連線
2. 確認 API Key 正確
3. 檢查 OpenAI 帳戶額度
4. 確認檔案格式支援

### 音訊播放問題
1. 確認檔案沒有損壞
2. 嘗試轉換為 MP3 格式
3. 檢查瀏覽器音訊權限

## 技術支援

如果遇到問題：
1. 按 F12 開啟開發者工具查看錯誤訊息
2. 嘗試使用無痕模式
3. 確認系統相容性 (執行 `SystemCompatibilityChecker.checkAll()`)
```

#### 13.2 部署檢查清單 (`deployment-checklist.md`)
```markdown
# 部署檢查清單

## 檔案結構確認
- [ ] `js/wasm/` 目錄包含 WASM 檔案
- [ ] `models/` 目錄包含模型檔案
- [ ] `css/` 包含所有樣式檔案
- [ ] `docs/` 包含使用說明

## 功能測試
- [ ] 小檔案 API 轉譯正常
- [ ] 大檔案選擇對話框顯示正常
- [ ] API 批次轉譯功能正常
- [ ] WASM 本地轉譯功能正常
- [ ] 進度顯示準確
- [ ] 錯誤處理適當
- [ ] 快捷鍵功能正常

## 相容性測試
- [ ] Chrome 88+ 測試通過
- [ ] Firefox 89+ 測試通過
- [ ] Safari 14+ 測試通過 (基本功能)
- [ ] 移動端瀏覽器測試

## 效能測試
- [ ] 不同大小檔案測試
- [ ] 記憶體使用量監控
- [ ] 長時間運行穩定性測試

## 安全性檢查
- [ ] API Key 安全儲存
- [ ] 無敏感資訊洩漏
- [ ] CORS 設定正確

## 使用者體驗
- [ ] 介面響應式設計
- [ ] 載入狀態明確
- [ ] 錯誤訊息友善
- [ ] 幫助文件完整

## 部署設定
- [ ] GitHub Pages 設定
- [ ] HTTPS 憑證
- [ ] 快取策略設定
- [ ] 監控設定
```

---

## 🎯 驗收標準

### 核心功能要求
- [ ] **智能檔案處理**：提供選擇
- [ ] **使用者選擇**：清楚的比較和推薦
- [ ] **API 批次轉譯**：自動分割、合併、進度顯示
- [ ] **本地 WASM 轉譯**：模型快取、進度追蹤、錯誤處理
- [ ] **統一結果格式**：無論哪種方式都返回一致格式

### 效能要求
- [ ] **API 轉譯**：60 秒音訊 ≤ 30 秒處理
- [ ] **批次轉譯**：每段 ≤ 5 秒處理時間
- [ ] **本地轉譯**：tiny 模型 60 秒音訊 ≤ 30 秒
- [ ] **模型載入**：首次下載 ≤ 2 分鐘
- [ ] **記憶體使用**：peak ≤ 2GB

### 使用者體驗要求
- [ ] **選擇介面**：直觀、資訊完整、推薦明確
- [ ] **進度顯示**：準確、有意義的狀態訊息
- [ ] **錯誤處理**：友善訊息、具體建議、技術詳情
- [ ] **取消功能**：任何階段都可取消

---

## 🚨 風險管控

### 技術風險與對策

1. **WASM 相容性問題**
   - 風險：舊瀏覽器不支援
   - 對策：相容性檢查 + 降級提示

2. **記憶體不足**
   - 風險：大模型 + 大檔案
   - 對策：動態模型推薦 + 記憶體監控

3. **網路不穩定影響下載**
   - 風險：模型下載中斷
   - 對策：斷點續傳 + 重試機制

### 使用風險與對策

1. **使用者選擇困惑**
   - 風險：不知道選哪個
   - 對策：明確推薦 + 詳細說明

2. **期望管理**
   - 風險：本地轉譯速度期望過高
   - 對策：準確的時間估算 + 清楚說明

---

## 📊 成功指標

### 技術指標
- 轉譯成功率 > 95%
- 系統穩定性 > 99%
- 無檔案大小限制
- 跨瀏覽器相容性

### 使用指標
- 大檔案處理滿意度 > 85%
- 本地轉譯使用率 > 30%
- 支援請求減少 > 50%
- 使用者留存率提升

---

## 🔄 後續發展規劃

### Phase 2 (1個月後)
1. **音質優化**：Web Audio API 音質增強
2. **串流轉譯**：即時處理功能
3. **批次管理**：多檔案佇列處理
4. **進階設定**：自訂參數調整

