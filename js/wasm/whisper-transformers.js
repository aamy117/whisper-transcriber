// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

/**
 * 使用 Transformers.js 的 Whisper 實現
 * 這是一個真實可用的 WebAssembly 語音識別方案
 */

import { textConverter } from '../utils/text-converter.js';
import { MemoryManager } from '../utils/memory-manager.js';

export class WhisperTransformers {
  constructor() {
    this.pipeline = null;
    this.isInitialized = false;
    this.currentModel = null;

    // 支援的模型
    this.models = {
      'tiny': 'Xenova/whisper-tiny',
      'base': 'Xenova/whisper-base',
      'small': 'Xenova/whisper-small'
    };
    
    // 分段處理配置 - 修復大檔案問題
    this.maxSafeFileSize = 50; // MB - 超過此大小使用分段處理
    this.maxFileSize = 100; // MB - 絕對最大檔案大小
    this.optimalChunkSize = 25; // MB - 最佳分段大小
    
    // 記憶體監控
    this.memoryMonitor = null;
    this.onProgress = null;
  }

  /**
   * 初始化 Transformers.js
   */
  async initialize(modelName = 'tiny') {
    if (this.isInitialized && this.currentModel === modelName) {
      return;
    }

    try {
      DEBUG && console.log('載入 Transformers.js...');

      // 動態載入 Transformers.js
      if (!window.transformers) {
        const script = document.createElement('script');
        script.type = 'module';
        script.textContent = `
          import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0';
          window.transformers = { pipeline, env };
        `;
        document.head.appendChild(script);

        // 等待載入
        await new Promise((resolve) => {
          const checkInterval = setInterval(() => {
            if (window.transformers) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);

          // 30秒超時
          setTimeout(() => {
            clearInterval(checkInterval);
            resolve();
          }, 30000);
        });
      }

      if (!window.transformers) {
        throw new Error('無法載入 Transformers.js');
      }

      const { pipeline, env } = window.transformers;

      // 設定模型載入路徑
      env.allowRemoteModels = true;
      env.remoteURL = 'https://huggingface.co/';

      // 建立語音識別 pipeline
      DEBUG && console.log(`載入 Whisper ${modelName} 模型...`);
      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        this.models[modelName],
        {
          quantized: true, // 使用量化模型以減少大小
          progress_callback: (progress) => {
            if (this.onProgress) {
              this.onProgress({
                type: 'download',
                progress: progress.progress || 0,
                message: `下載模型中... ${Math.round(progress.progress || 0)}%`
              });
            }
          }
        }
      );

      this.isInitialized = true;
      this.currentModel = modelName;
      DEBUG && console.log('Whisper 模型載入完成');

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 轉譯音訊 - 修復版本
   */
  async transcribe(audioFile, options = {}) {
    if (!this.isInitialized || !this.pipeline) {
      throw new Error('模型尚未初始化');
    }

    try {
      const fileSizeMB = audioFile.size / 1024 / 1024;
      DEBUG && console.log(`開始轉譯檔案: ${fileSizeMB.toFixed(1)}MB`);

      // 1. 記憶體安全檢查
      const memoryCheck = this.checkMemorySafety(audioFile);
      if (!memoryCheck.safe) {
        throw new Error(memoryCheck.reason);
      }

      // 2. 根據檔案大小選擇處理策略
      let audioData;
      if (fileSizeMB <= this.maxSafeFileSize) {
        // 小檔案直接處理
        audioData = await this.prepareAudio(audioFile);
      } else {
        // 大檔案分段處理
        audioData = await this.prepareAudioInChunks(audioFile, options);
      }

      // 3. 執行轉譯
      const result = await this.pipeline(audioData, {
        task: options.task || 'transcribe',
        chunk_length_s: 30,
        return_timestamps: true,
        language: options.language || 'chinese',
        callback_function: (beams) => {
          if (this.onProgress) {
            this.onProgress({
              type: 'transcription',
              message: '正在轉譯...',
              percentage: 50 // 轉譯階段
            });
          }
        }
      });

      return this.formatResult(result);

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('轉譯失敗:', error);
      
      // 提供更有用的錯誤訊息
      if (error.message.includes('memory') || error.message.includes('heap')) {
        throw new Error(`記憶體不足：檔案過大（${(audioFile.size / 1024 / 1024).toFixed(1)}MB），建議使用 API 轉譯`);
      } else if (error.message.includes('network') || error.message.includes('fetch')) {
        throw new Error('模型下載失敗：請檢查網路連線或使用 API 轉譯');
      } else {
        throw new Error(`本地轉譯失敗：${error.message}`);
      }
    }
  }

  /**
   * 檢查記憶體安全性
   */
  checkMemorySafety(audioFile) {
    const fileSizeMB = audioFile.size / 1024 / 1024;
    
    // 檔案大小硬限制
    if (fileSizeMB > this.maxFileSize) {
      return {
        safe: false,
        reason: `檔案過大（${fileSizeMB.toFixed(1)}MB），超過最大限制（${this.maxFileSize}MB）。建議使用 API 轉譯。`
      };
    }
    
    // 記憶體可用性檢查
    const fileExtension = audioFile.name.split('.').pop().toLowerCase();
    const memoryCheck = MemoryManager.canProcessFile(fileSizeMB, fileExtension);
    
    if (!memoryCheck.canProcess) {
      return {
        safe: false,
        reason: `記憶體不足：需要 ${memoryCheck.required}MB，可用 ${memoryCheck.available}MB。${memoryCheck.recommendation}`
      };
    }
    
    return { safe: true };
  }

  /**
   * 準備音訊資料
   */
  async prepareAudio(audioFile) {
    // 讀取音訊檔案
    const arrayBuffer = await audioFile.arrayBuffer();

    // 建立音訊上下文
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 16000 // Whisper 需要 16kHz
    });

    // 解碼音訊
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

    // 取得單聲道資料
    let audioData;
    if (audioBuffer.numberOfChannels > 1) {
      // 混合多聲道為單聲道
      const length = audioBuffer.length;
      audioData = new Float32Array(length);

      for (let i = 0; i < length; i++) {
        let sum = 0;
        for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
          sum += audioBuffer.getChannelData(channel)[i];
        }
        audioData[i] = sum / audioBuffer.numberOfChannels;
      }
    } else {
      audioData = audioBuffer.getChannelData(0);
    }

    audioContext.close();

    return audioData;
  }

  /**
   * 分段處理大檔案音訊
   */
  async prepareAudioInChunks(audioFile, options = {}) {
    const fileSizeMB = audioFile.size / 1024 / 1024;
    const fileExtension = audioFile.name.split('.').pop().toLowerCase();
    
    // 計算最佳分段大小
    const chunkSizeMB = MemoryManager.calculateOptimalChunkSize(fileSizeMB, fileExtension);
    const chunkSizeBytes = Math.min(chunkSizeMB * 1024 * 1024, this.optimalChunkSize * 1024 * 1024);
    
    DEBUG && console.log(`分段處理: 檔案 ${fileSizeMB.toFixed(1)}MB，分段大小 ${chunkSizeMB}MB`);
    
    const chunks = [];
    let processedSize = 0;
    let chunkIndex = 0;
    
    // 開始記憶體監控
    this.startMemoryMonitoring();
    
    try {
      // 分段處理檔案
      while (processedSize < audioFile.size) {
        const end = Math.min(processedSize + chunkSizeBytes, audioFile.size);
        const chunk = audioFile.slice(processedSize, end);
        
        // 更新進度
        if (this.onProgress) {
          const progress = (processedSize / audioFile.size) * 30; // 音訊處理佔 30%
          this.onProgress({
            type: 'audio-processing',
            percentage: progress,
            message: `處理音訊分段 ${chunkIndex + 1}/${Math.ceil(audioFile.size / chunkSizeBytes)}`
          });
        }
        
        try {
          // 處理單個分段
          const audioData = await this.prepareAudio(chunk);
          chunks.push(audioData);
          
          // 檢查記憶體使用
          const memoryInfo = MemoryManager.getMemoryUsage();
          if (memoryInfo.used > memoryInfo.total * 0.8) {
            DEBUG && console.warn('記憶體使用率過高，觸發垃圾回收');
            MemoryManager.forceGarbageCollection();
          }
          
        } catch (error) {
          console.error(`處理分段 ${chunkIndex} 失敗:`, error);
          throw new Error(`分段處理失敗: ${error.message}`);
        }
        
        processedSize = end;
        chunkIndex++;
        
        // 短暫暫停，讓瀏覽器有時間處理其他任務
        await this.sleep(100);
      }
      
      // 合併音訊分段
      const mergedAudio = this.mergeAudioChunks(chunks);
      
      // 清理分段資料釋放記憶體
      chunks.length = 0;
      MemoryManager.forceGarbageCollection();
      
      return mergedAudio;
      
    } finally {
      this.stopMemoryMonitoring();
    }
  }
  
  /**
   * 合併音訊分段
   */
  mergeAudioChunks(chunks) {
    if (chunks.length === 0) {
      throw new Error('沒有音訊分段可合併');
    }
    
    if (chunks.length === 1) {
      return chunks[0];
    }
    
    // 計算總長度
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const merged = new Float32Array(totalLength);
    
    // 合併分段
    let offset = 0;
    for (let i = 0; i < chunks.length; i++) {
      merged.set(chunks[i], offset);
      offset += chunks[i].length;
      
      // 釋放已處理的分段
      chunks[i] = null;
    }
    
    DEBUG && console.log(`合併完成: ${chunks.length} 個分段，總長度 ${totalLength}`);
    
    return merged;
  }
  
  /**
   * 開始記憶體監控
   */
  startMemoryMonitoring() {
    if (this.memoryMonitor) {
      this.stopMemoryMonitoring();
    }
    
    this.memoryMonitor = MemoryManager.startMemoryMonitoring((info) => {
      if (info.percentage > 85) {
        console.warn(`記憶體使用率過高: ${info.percentage}%`);
      }
    }, 2000); // 每 2 秒檢查一次
  }
  
  /**
   * 停止記憶體監控
   */
  stopMemoryMonitoring() {
    if (this.memoryMonitor) {
      MemoryManager.stopMemoryMonitoring(this.memoryMonitor);
      this.memoryMonitor = null;
    }
  }
  
  /**
   * 休眠函數
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 格式化結果
   */
  formatResult(result) {
    // Transformers.js 的結果格式
    let text = '';
    let segments = [];

    if (result.text) {
      // 處理文字：簡轉繁、移除標點
      text = textConverter.processTranscriptionText(result.text);
    }

    if (result.chunks) {
      segments = result.chunks.map(chunk => ({
        start: chunk.timestamp[0],
        end: chunk.timestamp[1],
        text: textConverter.processTranscriptionText(chunk.text)
      }));
    }

    return {
      text: text,
      segments: segments,
      language: 'zh-TW', // 標記為繁體中文
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
  async cleanup() {
    if (this.pipeline) {
      // Transformers.js 會自動管理資源
      this.pipeline = null;
    }
    this.isInitialized = false;
  }
}

// 使用示範
export async function demonstrateWhisperTransformers() {
  const whisper = new WhisperTransformers();

  // 設定進度回調
  whisper.setProgressCallback((progress) => {
    DEBUG && console.log('進度:', progress);
  });

  try {
    // 初始化（會下載模型）
    await whisper.initialize('tiny');

    // 準備音訊檔案
    const audioFile = new File([''], 'test.wav', { type: 'audio/wav' });

    // 執行轉譯
    const result = await whisper.transcribe(audioFile, {
      language: 'zh'
    });

    DEBUG && console.log('轉譯結果:', result);

  } catch (error) {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error('錯誤:', error);
  } finally {
    await whisper.cleanup();
  }
}
