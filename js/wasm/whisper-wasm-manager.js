/**
 * Whisper WASM Manager
 * 管理 WebAssembly 模組的載入、初始化和轉譯功能
 */

import { WhisperTransformers } from './whisper-transformers.js';

class WhisperWASMManager {
  constructor() {
    this.isInitialized = false;
    this.wasmModule = null;
    this.currentModel = null;
    this.worker = null;
    
    // 模型配置
    this.models = {
      tiny: { 
        file: 'ggml-tiny.bin', 
        size: 75 * 1024 * 1024, 
        speed: 3,
        accuracy: '基本',
        description: '最快速度，適合快速預覽'
      },
      base: { 
        file: 'ggml-base.bin', 
        size: 142 * 1024 * 1024, 
        speed: 2,
        accuracy: '良好',
        description: '平衡速度與品質'
      },
      small: { 
        file: 'ggml-small.bin', 
        size: 466 * 1024 * 1024, 
        speed: 1.5,
        accuracy: '高',
        description: '最佳品質，速度較慢'
      }
    };

    // 功能開關
    this.ENABLE_REAL_WASM = true; // 預設啟用真實 WASM
    
    // 真實 WASM 實現
    this.realWASM = null;
  }

  /**
   * 初始化 WASM 模組
   * @param {string} modelName - 模型名稱 (tiny/base/small)
   */
  async initialize(modelName = 'base') {
    if (this.isInitialized && this.currentModel === modelName) {
      return; // 已經初始化相同模型
    }
    
    // 如果啟用真實 WASM，使用 Transformers.js
    if (this.ENABLE_REAL_WASM) {
      try {
        console.log('初始化真實 WASM (Transformers.js)...');
        
        if (!this.realWASM) {
          this.realWASM = new WhisperTransformers();
          
          // 設定進度回調
          this.realWASM.setProgressCallback((progress) => {
            console.log('WASM 進度:', progress);
            // 可以轉發給 UI
          });
        }
        
        await this.realWASM.initialize(modelName);
        this.isInitialized = true;
        this.currentModel = modelName;
        
        console.log('真實 WASM 初始化完成');
        return;
        
      } catch (error) {
        console.error('真實 WASM 初始化失敗:', error);
        // 可以選擇回退到模擬模式
        this.ENABLE_REAL_WASM = false;
      }
    }

    try {
      // 檢查瀏覽器支援
      if (!this.checkWASMSupport()) {
        throw new Error('您的瀏覽器不支援 WebAssembly，請使用較新版本的 Chrome、Firefox 或 Safari');
      }

      // 檢查記憶體需求
      this.checkMemoryRequirements(modelName);

      if (this.ENABLE_REAL_WASM) {
        // 載入真實 WASM 模組
        await this.loadWASMModule();
        await this.loadModel(modelName);
      } else {
        // 開發模式：模擬載入
        console.log(`[開發模式] 模擬載入 ${modelName} 模型`);
        await this.simulateLoading(2000); // 模擬 2 秒載入時間
      }

      this.isInitialized = true;
      this.currentModel = modelName;

    } catch (error) {
      console.error('WASM 初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 檢查 WebAssembly 支援
   */
  checkWASMSupport() {
    // 檢查基本 WebAssembly 支援
    if (!('WebAssembly' in window)) {
      return false;
    }

    // 檢查是否支援必要的功能
    try {
      // 測試創建簡單的 WebAssembly 模組
      const testModule = new WebAssembly.Module(new Uint8Array([
        0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00
      ]));
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * 檢查記憶體需求
   */
  checkMemoryRequirements(modelName) {
    const modelInfo = this.models[modelName];
    if (!modelInfo) {
      throw new Error(`未知的模型：${modelName}`);
    }

    const requiredMemory = modelInfo.size + (200 * 1024 * 1024); // 模型 + 200MB 緩衝

    // 檢查可用記憶體（如果瀏覽器支援）
    if ('memory' in performance) {
      const memInfo = performance.memory;
      const availableMemory = memInfo.jsHeapSizeLimit - memInfo.usedJSHeapSize;
      
      if (availableMemory < requiredMemory) {
        throw new Error(`記憶體不足。需要：${Math.round(requiredMemory / 1024 / 1024)}MB，可用：${Math.round(availableMemory / 1024 / 1024)}MB。建議關閉其他標籤頁或使用較小的模型。`);
      }
    }
  }

  /**
   * 載入 WASM 模組（真實實作）
   */
  async loadWASMModule() {
    // TODO: 實際載入 whisper.wasm
    throw new Error('WASM 模組載入尚未實作，請使用開發模式');
  }

  /**
   * 載入模型檔案
   */
  async loadModel(modelName) {
    const modelInfo = this.models[modelName];
    const modelPath = `models/${modelInfo.file}`;

    try {
      // 檢查快取
      const cachedModel = await this.getCachedModel(modelName);
      if (cachedModel) {
        console.log('使用快取的模型');
        return;
      }

      // TODO: 實際下載和載入模型
      console.log(`需要下載模型: ${modelName} (${Math.round(modelInfo.size / 1024 / 1024)}MB)`);
      
    } catch (error) {
      throw new Error(`載入模型失敗: ${error.message}`);
    }
  }

  /**
   * 執行轉譯
   * @param {File} audioFile - 音訊檔案
   * @param {Object} options - 轉譯選項
   */
  async transcribe(audioFile, options = {}) {
    if (!this.isInitialized) {
      throw new Error('WASM 模組尚未初始化');
    }

    if (this.ENABLE_REAL_WASM) {
      // 真實 WASM 轉譯
      return await this.transcribeWithWASM(audioFile, options);
    } else {
      // 開發模式：模擬轉譯
      return await this.simulateTranscription(audioFile, options);
    }
  }

  /**
   * 使用 WASM 進行轉譯（真實實作）
   */
  async transcribeWithWASM(audioFile, options) {
    // 如果使用真實 WASM，直接調用 WhisperTransformers
    if (this.realWASM) {
      try {
        console.log('使用 Transformers.js 進行轉譯...');
        const result = await this.realWASM.transcribe(audioFile, options);
        return result;
      } catch (error) {
        console.error('Transformers.js 轉譯失敗:', error);
        throw error;
      }
    }
    
    // 否則使用 Worker 方式
    return new Promise((resolve, reject) => {
      // 建立 Web Worker
      // 使用動態路徑，根據當前頁面位置調整
      const workerPath = this.getWorkerPath();
      this.worker = new Worker(workerPath);

      // 準備音訊資料
      this.prepareAudioData(audioFile).then(audioData => {
        // 不傳遞函數，只傳遞可序列化的資料
        const messageData = {
          command: 'transcribe',
          audioData: audioData,
          options: {
            language: options.language || 'auto',
            task: options.task || 'transcribe'
            // 移除所有函數類型的選項
          }
        };
        
        // 過濾掉函數類型的屬性
        Object.keys(options).forEach(key => {
          if (typeof options[key] !== 'function') {
            messageData.options[key] = options[key];
          }
        });
        
        this.worker.postMessage(messageData);
      }).catch(reject);

      // 監聽 Worker 訊息
      this.worker.onmessage = (event) => {
        const { type, data } = event.data;

        switch (type) {
          case 'progress':
            // 使用事件發送進度，而不是回調函數
            if (window.dispatchEvent) {
              window.dispatchEvent(new CustomEvent('whisper-progress', {
                detail: data
              }));
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

  /**
   * 模擬轉譯（開發模式）
   */
  async simulateTranscription(audioFile, options) {
    console.log('[開發模式] 模擬轉譯:', audioFile.name);
    
    // 取得音訊長度
    const duration = await this.getAudioDuration(audioFile);
    const modelSpeed = this.models[this.currentModel].speed;
    const processingTime = (duration / modelSpeed) * 1000; // 毫秒

    // 模擬進度
    const progressInterval = 100; // 每 100ms 更新一次
    const totalSteps = Math.ceil(processingTime / progressInterval);
    let currentStep = 0;

    return new Promise((resolve) => {
      const timer = setInterval(() => {
        currentStep++;
        const progress = (currentStep / totalSteps) * 100;
        
        if (options.onProgress) {
          options.onProgress({
            percentage: Math.min(progress, 100),
            message: `處理中... ${Math.round(progress)}%`
          });
        }

        if (currentStep >= totalSteps) {
          clearInterval(timer);
          
          // 返回模擬結果（繁體中文、無標點）
          resolve({
            text: `[開發模式] 這是 ${audioFile.name} 的模擬轉譯結果 音訊長度 ${Math.round(duration)}秒 使用模型 ${this.currentModel} 處理時間 ${Math.round(processingTime / 1000)}秒`,
            segments: [
              {
                id: 0,
                start: 0,
                end: duration,
                text: `[開發模式] 模擬轉譯段落`
              }
            ],
            language: 'zh-TW',
            duration: duration,
            method: 'local-wasm-simulated'
          });
        }
      }, progressInterval);
    });
  }

  /**
   * 準備音訊資料
   */
  async prepareAudioData(audioFile) {
    // 轉換音訊為 16kHz WAV 格式
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 重採樣到 16kHz
    const targetSampleRate = 16000;
    const resampledBuffer = await this.resampleAudio(audioBuffer, targetSampleRate);

    // 轉換為 Float32Array
    return resampledBuffer.getChannelData(0);
  }

  /**
   * 重採樣音訊
   */
  async resampleAudio(audioBuffer, targetSampleRate) {
    const sourceSampleRate = audioBuffer.sampleRate;
    const sourceLength = audioBuffer.length;
    const targetLength = Math.round(sourceLength * targetSampleRate / sourceSampleRate);

    const offlineContext = new OfflineAudioContext(1, targetLength, targetSampleRate);
    const bufferSource = offlineContext.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineContext.destination);
    bufferSource.start();

    return await offlineContext.startRendering();
  }

  /**
   * 取得音訊長度
   */
  async getAudioDuration(audioFile) {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await audioFile.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      return audioBuffer.duration;
    } catch (error) {
      console.warn('無法取得音訊長度，使用估計值');
      // 根據檔案大小估計（假設 128kbps）
      return (audioFile.size * 8) / (128 * 1000);
    }
  }

  /**
   * 模型快取相關方法
   */
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

  /**
   * 取消轉譯
   */
  cancel() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }

  /**
   * 取得模型資訊
   */
  getModelInfo(modelName) {
    return this.models[modelName];
  }

  /**
   * 檢查模型是否已快取
   */
  async isModelCached(modelName) {
    const cached = await this.getCachedModel(modelName);
    return !!cached;
  }

  /**
   * 清除所有快取的模型
   */
  async clearCache() {
    try {
      const db = await this.openIndexedDB();
      const transaction = db.transaction(['models'], 'readwrite');
      const store = transaction.objectStore('models');
      await store.clear();
      console.log('模型快取已清除');
    } catch (error) {
      console.error('清除快取失敗:', error);
    }
  }

  /**
   * 模擬載入延遲（開發用）
   */
  async simulateLoading(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 取得支援的模型列表
   */
  getAvailableModels() {
    return Object.entries(this.models).map(([key, info]) => ({
      id: key,
      name: key.charAt(0).toUpperCase() + key.slice(1),
      ...info
    }));
  }

  /**
   * 估算處理時間
   */
  estimateProcessingTime(duration, modelName) {
    const modelInfo = this.models[modelName];
    if (!modelInfo) return null;
    
    return duration / modelInfo.speed;
  }

  /**
   * 取得 Worker 的正確路徑
   */
  getWorkerPath() {
    // 取得當前頁面的路徑
    const currentPath = window.location.pathname;
    const pathSegments = currentPath.split('/').filter(Boolean);
    
    // 如果在 test 目錄或其他子目錄中
    if (pathSegments.length > 1 || (pathSegments.length === 1 && pathSegments[0].includes('test'))) {
      return '../js/workers/whisper-worker.js';
    }
    
    // 如果在根目錄
    return 'js/workers/whisper-worker.js';
  }
}

// 匯出模組
export { WhisperWASMManager };