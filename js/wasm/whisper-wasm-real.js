/**
 * 真實的 Whisper WASM 實現
 * 使用 whisper.cpp 的 WebAssembly 版本
 */

export class WhisperWASMReal {
  constructor() {
    this.isInitialized = false;
    this.module = null;
    this.model = null;
    this.instance = null;
    
    // 模型配置
    this.modelConfigs = {
      tiny: {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin',
        size: 39,  // MB
        name: 'tiny'
      },
      base: {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin',
        size: 74,  // MB
        name: 'base'
      },
      small: {
        url: 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin',
        size: 244, // MB
        name: 'small'
      }
    };
    
    // 支援的語言
    this.languages = {
      'en': 'english',
      'zh': 'chinese',
      'ja': 'japanese',
      'ko': 'korean',
      'es': 'spanish',
      'fr': 'french',
      'de': 'german',
      'it': 'italian',
      'pt': 'portuguese',
      'ru': 'russian'
    };
  }
  
  /**
   * 初始化 WASM 模組
   */
  async initialize(modelName = 'tiny') {
    if (this.isInitialized && this.model === modelName) {
      return;
    }
    
    try {
      console.log('開始載入 Whisper WASM...');
      
      // 載入 whisper.wasm
      if (!this.module) {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/whisper-wasm@latest/dist/whisper.js';
        document.head.appendChild(script);
        
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
        });
        
        // 等待 Module 載入
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (window.Module && window.Module.calledRun) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
        });
        
        this.module = window.Module;
      }
      
      // 載入模型
      await this.loadModel(modelName);
      
      this.isInitialized = true;
      console.log('Whisper WASM 初始化完成');
      
    } catch (error) {
      console.error('Whisper WASM 初始化失敗:', error);
      throw error;
    }
  }
  
  /**
   * 載入模型檔案
   */
  async loadModel(modelName) {
    const config = this.modelConfigs[modelName];
    if (!config) {
      throw new Error(`不支援的模型: ${modelName}`);
    }
    
    console.log(`開始下載 ${modelName} 模型 (${config.size}MB)...`);
    
    try {
      // 檢查快取
      const cachedModel = await this.getModelFromCache(modelName);
      if (cachedModel) {
        console.log('使用快取的模型');
        this.model = cachedModel;
        return;
      }
      
      // 下載模型
      const response = await fetch(config.url);
      if (!response.ok) {
        throw new Error(`下載失敗: ${response.status}`);
      }
      
      // 顯示下載進度
      const reader = response.body.getReader();
      const contentLength = +response.headers.get('Content-Length');
      const chunks = [];
      let receivedLength = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;
        
        const progress = (receivedLength / contentLength) * 100;
        console.log(`下載進度: ${progress.toFixed(1)}%`);
        
        if (this.onProgress) {
          this.onProgress({
            type: 'download',
            progress: progress,
            message: `下載模型中... ${progress.toFixed(1)}%`
          });
        }
      }
      
      // 合併資料
      const modelData = new Uint8Array(receivedLength);
      let position = 0;
      for (const chunk of chunks) {
        modelData.set(chunk, position);
        position += chunk.length;
      }
      
      // 快取模型
      await this.cacheModel(modelName, modelData);
      
      this.model = modelData;
      console.log('模型載入完成');
      
    } catch (error) {
      console.error('模型載入失敗:', error);
      throw error;
    }
  }
  
  /**
   * 從 IndexedDB 取得快取的模型
   */
  async getModelFromCache(modelName) {
    try {
      const db = await this.openDB();
      const tx = db.transaction(['models'], 'readonly');
      const store = tx.objectStore('models');
      const request = store.get(modelName);
      
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result?.data);
        request.onerror = () => reject(request.error);
      });
    } catch (error) {
      console.warn('無法讀取快取:', error);
      return null;
    }
  }
  
  /**
   * 快取模型到 IndexedDB
   */
  async cacheModel(modelName, modelData) {
    try {
      const db = await this.openDB();
      const tx = db.transaction(['models'], 'readwrite');
      const store = tx.objectStore('models');
      
      await store.put({
        name: modelName,
        data: modelData,
        timestamp: Date.now()
      });
      
      console.log('模型已快取');
    } catch (error) {
      console.warn('快取失敗:', error);
    }
  }
  
  /**
   * 開啟 IndexedDB
   */
  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('WhisperWASM', 1);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('models')) {
          const store = db.createObjectStore('models', { keyPath: 'name' });
          store.createIndex('timestamp', 'timestamp');
        }
      };
      
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * 轉譯音訊
   */
  async transcribe(audioFile, options = {}) {
    if (!this.isInitialized) {
      throw new Error('WASM 尚未初始化');
    }
    
    try {
      console.log('開始轉譯...');
      
      // 轉換音訊格式
      const audioData = await this.prepareAudio(audioFile);
      
      // 設定轉譯參數
      const params = {
        language: this.languages[options.language] || 'chinese',
        translate: false,
        no_timestamps: false,
        ...options
      };
      
      // 執行轉譯
      const result = await this.runTranscription(audioData, params);
      
      return this.formatResult(result);
      
    } catch (error) {
      console.error('轉譯失敗:', error);
      throw error;
    }
  }
  
  /**
   * 準備音訊資料
   */
  async prepareAudio(audioFile) {
    // 讀取檔案
    const arrayBuffer = await audioFile.arrayBuffer();
    
    // 解碼音訊
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000 // Whisper 需要 16kHz
    });
    
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    
    // 轉換為單聲道 16kHz
    let pcmData;
    if (audioBuffer.numberOfChannels > 1) {
      // 混合多聲道為單聲道
      const channelData = [];
      for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
        channelData.push(audioBuffer.getChannelData(i));
      }
      
      pcmData = new Float32Array(audioBuffer.length);
      for (let i = 0; i < audioBuffer.length; i++) {
        let sum = 0;
        for (let channel = 0; channel < channelData.length; channel++) {
          sum += channelData[channel][i];
        }
        pcmData[i] = sum / channelData.length;
      }
    } else {
      pcmData = audioBuffer.getChannelData(0);
    }
    
    audioContext.close();
    
    return pcmData;
  }
  
  /**
   * 執行轉譯
   */
  async runTranscription(audioData, params) {
    if (!this.module) {
      throw new Error('WASM 模組未載入');
    }
    
    // 分配記憶體
    const nSamples = audioData.length;
    const heapSize = nSamples * 4; // Float32
    const heapPtr = this.module._malloc(heapSize);
    
    // 複製音訊資料到 WASM 記憶體
    this.module.HEAPF32.set(audioData, heapPtr / 4);
    
    try {
      // 建立 Whisper 實例
      const whisper = this.module._whisper_init_from_buffer(
        this.model.buffer,
        this.model.byteLength
      );
      
      if (!whisper) {
        throw new Error('無法初始化 Whisper');
      }
      
      // 設定參數
      const paramsPtr = this.module._whisper_full_default_params();
      
      // 設定語言
      if (params.language) {
        const langId = this.module._whisper_lang_id(params.language);
        this.module._whisper_full_params_set_language(paramsPtr, langId);
      }
      
      // 執行轉譯
      const ret = this.module._whisper_full(
        whisper,
        paramsPtr,
        heapPtr,
        nSamples
      );
      
      if (ret !== 0) {
        throw new Error('轉譯失敗');
      }
      
      // 獲取結果
      const nSegments = this.module._whisper_full_n_segments(whisper);
      const segments = [];
      
      for (let i = 0; i < nSegments; i++) {
        const text = this.module.UTF8ToString(
          this.module._whisper_full_get_segment_text(whisper, i)
        );
        
        const t0 = this.module._whisper_full_get_segment_t0(whisper, i);
        const t1 = this.module._whisper_full_get_segment_t1(whisper, i);
        
        segments.push({
          start: t0 / 100.0, // 轉換為秒
          end: t1 / 100.0,
          text: text.trim()
        });
      }
      
      // 釋放 Whisper 實例
      this.module._whisper_free(whisper);
      
      return { segments };
      
    } finally {
      // 釋放記憶體
      this.module._free(heapPtr);
    }
  }
  
  /**
   * 格式化結果
   */
  formatResult(result) {
    const segments = result.segments || [];
    const fullText = segments.map(s => s.text).join(' ');
    
    return {
      text: fullText,
      segments: segments,
      language: 'zh',
      duration: segments.length > 0 ? segments[segments.length - 1].end : 0
    };
  }
  
  /**
   * 設定進度回調
   */
  setProgressCallback(callback) {
    this.onProgress = callback;
  }
  
  /**
   * 清理資源
   */
  cleanup() {
    if (this.module && this.instance) {
      // 釋放 WASM 資源
      this.instance = null;
    }
    this.isInitialized = false;
  }
}