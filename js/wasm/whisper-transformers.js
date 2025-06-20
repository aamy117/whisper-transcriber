/**
 * 使用 Transformers.js 的 Whisper 實現
 * 這是一個真實可用的 WebAssembly 語音識別方案
 */

import { textConverter } from '../utils/text-converter.js';

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
  }
  
  /**
   * 初始化 Transformers.js
   */
  async initialize(modelName = 'tiny') {
    if (this.isInitialized && this.currentModel === modelName) {
      return;
    }
    
    try {
      console.log('載入 Transformers.js...');
      
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
      console.log(`載入 Whisper ${modelName} 模型...`);
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
      console.log('Whisper 模型載入完成');
      
    } catch (error) {
      console.error('初始化失敗:', error);
      throw error;
    }
  }
  
  /**
   * 轉譯音訊
   */
  async transcribe(audioFile, options = {}) {
    if (!this.isInitialized || !this.pipeline) {
      throw new Error('模型尚未初始化');
    }
    
    try {
      console.log('開始轉譯...');
      
      // 轉換音訊為合適的格式
      const audioData = await this.prepareAudio(audioFile);
      
      // 執行轉譯
      const result = await this.pipeline(audioData, {
        task: options.task || 'transcribe',
        chunk_length_s: 30, // 每30秒一個chunk
        return_timestamps: true,
        // 使用 language 參數而不是 forced_decoder_ids
        language: options.language || 'chinese',
        // 移除會造成衝突的參數
        callback_function: (beams) => {
          // 進度回調
          if (this.onProgress) {
            this.onProgress({
              type: 'transcription',
              message: '正在轉譯...'
            });
          }
        }
      });
      
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
    console.log('進度:', progress);
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
    
    console.log('轉譯結果:', result);
    
  } catch (error) {
    console.error('錯誤:', error);
  } finally {
    await whisper.cleanup();
  }
}