// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

/**
 * Whisper WASM Manager
 * 管理 WebAssembly 模組的載入、初始化和轉譯功能
 */

import { WhisperTransformers } from './whisper-transformers.js';
import { modelPreloader } from './model-preloader.js';
import { optimizedWhisperWASM } from './whisper-wasm-optimized.js';
import { createOptimizedWorkerPool } from './whisper-hybrid-worker.js';
import WASMConfig from './wasm-config.js';

class WhisperWASMManager {
  constructor() {
    this.isInitialized = false;
    this.wasmModule = null;
    this.currentModel = null;
    this.worker = null;
    
    // 根據配置選擇實現
    this.useOptimized = WASMConfig.useOptimized;
    this.optimizedEngine = null;
    this.hybridWorkerPool = null; // 混合式 Worker 池

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
    
    // 進度回調
    this.progressCallback = null;
  }

  /**
   * 初始化 WASM 模組
   * @param {string} modelName - 模型名稱 (tiny/base/small)
   */
  async initialize(modelName = 'base') {
    if (this.isInitialized && this.currentModel === modelName) {
      return; // 已經初始化相同模型
    }

    try {
      // 檢查是否有預載入的模型
      const preloadedModel = modelPreloader.loadedModels.get(modelName);
      if (preloadedModel) {
        DEBUG && console.log(`使用預載入的模型: ${modelName}`);
      }

      // 優先使用 Transformers.js（穩定可靠）
      DEBUG && console.log('初始化 WASM (Transformers.js)...');

      if (!this.realWASM) {
        this.realWASM = new WhisperTransformers();

        // 設定進度回調
        this.realWASM.setProgressCallback((progress) => {
          DEBUG && console.log('WASM 進度:', progress);
          // 可以轉發給 UI
          if (this.progressCallback) {
            this.progressCallback(progress);
          }
        });
      }

      await this.realWASM.initialize(modelName);
      this.isInitialized = true;
      this.currentModel = modelName;
      this.ENABLE_REAL_WASM = true; // 確保標記為啟用

      DEBUG && console.log('WASM 初始化完成 (Transformers.js)');
      return;

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) {
        console.error('WASM 初始化失敗:', error);
      }
      
      // 如果 Transformers.js 失敗，嘗試混合式架構作為備份
      if (this.useOptimized) {
        try {
          DEBUG && console.log('嘗試混合式 Worker 架構作為備份...');
          
          // 獲取 Worker 路徑
          const workerPath = this.getWorkerPath();
          this.hybridWorkerPool = await createOptimizedWorkerPool(workerPath);
          
          if (this.hybridWorkerPool && !(this.hybridWorkerPool instanceof Promise)) {
            await this.hybridWorkerPool.initialize(modelName);
            this.isInitialized = true;
            this.currentModel = modelName;
            DEBUG && console.log('使用混合式 Worker 池');
            return;
          }
        } catch (hybridError) {
          DEBUG && console.error('混合式架構也失敗:', hybridError);
        }
      }
      
      // 所有方案都失敗，拋出錯誤
      throw new Error(`無法初始化 WASM: ${error.message}`);
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
    // 這個方法現在已經不需要，因為我們直接使用 Transformers.js
    DEBUG && console.log('loadWASMModule 方法已棄用');
    return;
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
        DEBUG && console.log('使用快取的模型');
        return;
      }

      // TODO: 實際下載和載入模型
      DEBUG && console.log(`需要下載模型: ${modelName} (${Math.round(modelInfo.size / 1024 / 1024)}MB)`);

    } catch (error) {
      throw new Error(`載入模型失敗: ${error.message}`);
    }
  }

  /**
   * 執行轉譯
   * @param {File} audioFile - 音訊檔案
   * @param {Object} options - 轉譯選項
   * @param {CancellationToken} options.cancellationToken - 取消令牌
   * @param {Function} options.onProgress - 進度回調
   */
  async transcribe(audioFile, options = {}) {
    if (!this.isInitialized) {
      throw new Error('WASM 模組尚未初始化');
    }

    // 檢查是否已取消
    if (options.cancellationToken) {
      options.cancellationToken.throwIfCancelled();
    }

    // 保存進度回調
    this.progressCallback = options.onProgress;

    try {
      // 優先使用 Transformers.js
      if (this.realWASM) {
        DEBUG && console.log('使用 Transformers.js 進行轉譯...');
        const result = await this.realWASM.transcribe(audioFile, options);
        return {
          ...result,
          method: 'local-wasm-transformers'
        };
      }
      
      // 備用：混合式 Worker 池
      if (this.hybridWorkerPool) {
        DEBUG && console.log('使用混合式 Worker 池進行轉譯...');
        
        // 準備音訊資料
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        
        // 使用混合式架構處理
        const result = await this.hybridWorkerPool.processAudio(audioBuffer, {
          onProgress: options.onProgress,
          cancellationToken: options.cancellationToken,
          language: options.language || 'zh',
          task: options.task || 'transcribe'
        });
        
        // 格式化結果以符合統一介面
        return {
          ...result,
          language: 'zh-TW',
          duration: audioBuffer.duration,
          method: 'local-wasm-hybrid'
        };
      }

      // 如果都不可用，使用模擬模式（僅限開發）
      if (DEBUG) {
        return await this.simulateTranscription(audioFile, options);
      }

      throw new Error('沒有可用的轉譯引擎');

    } catch (error) {
      if (options.cancellationToken && options.cancellationToken.isCancelled) {
        throw new Error('操作已取消');
      }
      throw error;
    }
  }

  /**
   * 使用 WASM 進行轉譯（真實實作）
   */
  async transcribeWithWASM(audioFile, options) {
    // 如果使用真實 WASM，直接調用 WhisperTransformers
    if (this.realWASM) {
      try {
        DEBUG && console.log('使用 Transformers.js 進行轉譯...');
        const result = await this.realWASM.transcribe(audioFile, options);
        return result;
      } catch (error) {
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('Transformers.js 轉譯失敗:', error);
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

      // 如果有取消令牌，註冊取消回調
      if (options.cancellationToken) {
        options.cancellationToken.onCancelled(() => {
          if (this.worker) {
            this.worker.postMessage({ command: 'cancel' });
            this.worker.terminate();
            this.worker = null;
          }
        });
      }
      
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
            // 同時調用 onProgress 回調
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
            
          case 'cancelled':
            this.worker.terminate();
            this.worker = null;
            reject(new Error('操作已取消'));
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
    DEBUG && console.log('[開發模式] 模擬轉譯:', audioFile.name);

    // 取得音訊長度
    const duration = await this.getAudioDuration(audioFile);
    const modelSpeed = this.models[this.currentModel].speed;
    const processingTime = (duration / modelSpeed) * 1000; // 毫秒

    // 模擬進度
    const progressInterval = 100; // 每 100ms 更新一次
    const totalSteps = Math.ceil(processingTime / progressInterval);
    let currentStep = 0;

    return new Promise((resolve, reject) => {
      const timer = setInterval(() => {
        // 檢查是否已取消
        if (options.cancellationToken && options.cancellationToken.isCancelled) {
          clearInterval(timer);
          reject(new Error('操作已取消'));
          return;
        }
        
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
      DEBUG && console.warn('無法取得音訊長度，使用估計值');
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
      DEBUG && console.warn('無法從快取載入模型:', error);
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
      DEBUG && console.warn('無法快取模型:', error);
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
      DEBUG && console.log('模型快取已清除');
    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('清除快取失敗:', error);
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
   * 預載入模型
   * @param {string} modelName - 模型名稱
   * @param {Object} options - 預載入選項
   */
  async preloadModel(modelName, options = {}) {
    return modelPreloader.preloadModel(modelName, options);
  }
  
  /**
   * 開始自動預載入
   */
  startAutoPreload() {
    modelPreloader.startAutoPreload();
  }
  
  /**
   * 獲取預載入狀態
   */
  getPreloadStatus() {
    return modelPreloader.getStatus();
  }
  
  /**
   * 訂閱預載入事件
   */
  subscribeToPreload(callback) {
    return modelPreloader.subscribe(callback);
  }
  
  /**
   * 取消預載入
   */
  cancelPreload(modelName) {
    modelPreloader.cancelPreload(modelName);
  }
  
  /**
   * 設定預載入配置
   */
  setPreloadConfig(config) {
    modelPreloader.setConfig(config);
  }

  /**
   * 設定進度回調
   */
  setProgressCallback(callback) {
    this.progressCallback = callback;
    if (this.realWASM) {
      this.realWASM.setProgressCallback(callback);
    }
  }

  /**
   * 取得 Worker 的正確路徑
   */
  getWorkerPath() {
    // 使用絕對路徑，避免相對路徑問題
    const origin = window.location.origin;
    const pathname = window.location.pathname;
    
    // 找到專案根目錄
    let basePath = pathname;
    if (pathname.includes('/test/')) {
      basePath = pathname.substring(0, pathname.indexOf('/test/'));
    } else if (pathname.includes('.html')) {
      basePath = pathname.substring(0, pathname.lastIndexOf('/'));
    }
    
    // 確保路徑以 / 結尾
    if (!basePath.endsWith('/')) {
      basePath += '/';
    }
    
    const workerPath = `${origin}${basePath}js/workers/whisper-worker.js`;
    DEBUG && console.log('Worker 路徑:', workerPath);
    
    return workerPath;
  }
}

// 匯出模組
export { WhisperWASMManager };
