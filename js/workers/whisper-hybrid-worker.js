/**
 * 混合式 Whisper Worker
 * 不依賴 SharedArrayBuffer，使用 postMessage + Transferable Objects
 * 適用於 GitHub Pages 等無法設定特殊 headers 的環境
 */

// 動態載入 Transformers.js
importScripts('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0/dist/transformers.min.js');

class HybridWhisperWorker {
  constructor() {
    this.pipeline = null;
    this.isInitialized = false;
    this.currentModel = null;
  }

  async initialize(modelName = 'base') {
    try {
      const { pipeline, env } = self.transformers;
      
      // 配置環境
      env.allowLocalModels = false;
      env.backends.onnx.wasm.numThreads = 1; // 單執行緒模式
      
      // 模型對應
      const modelMap = {
        'tiny': 'Xenova/whisper-tiny',
        'base': 'Xenova/whisper-base',
        'small': 'Xenova/whisper-small'
      };
      
      const modelId = modelMap[modelName] || modelMap['base'];
      
      // 建立 pipeline
      this.pipeline = await pipeline(
        'automatic-speech-recognition',
        modelId,
        {
          quantized: true, // 使用量化模型以提升速度
          progress_callback: (progress) => {
            self.postMessage({
              type: 'progress',
              data: {
                stage: 'model_loading',
                progress: progress.progress || 0
              }
            });
          }
        }
      );
      
      this.isInitialized = true;
      this.currentModel = modelName;
      
      self.postMessage({ type: 'initialized' });
      
    } catch (error) {
      self.postMessage({ 
        type: 'error', 
        data: `初始化失敗: ${error.message}` 
      });
    }
  }

  async transcribe(segment, options = {}) {
    if (!this.isInitialized) {
      throw new Error('Worker 尚未初始化');
    }
    
    try {
      const { data, sampleRate, start, end } = segment;
      
      // 重建 Float32Array（因為是從 ArrayBuffer 轉移過來的）
      const audioData = new Float32Array(data);
      
      // 執行轉譯
      const result = await this.pipeline(audioData, {
        sampling_rate: sampleRate,
        return_timestamps: true,
        chunk_length_s: 30,
        language: options.language || 'chinese',
        task: options.task || 'transcribe'
      });
      
      // 調整時間戳記
      const adjustedChunks = result.chunks ? result.chunks.map(chunk => ({
        timestamp: [chunk.timestamp[0] + start, chunk.timestamp[1] + start],
        text: chunk.text
      })) : [];
      
      return {
        text: result.text,
        segments: adjustedChunks.map((chunk, idx) => ({
          id: idx,
          start: chunk.timestamp[0],
          end: chunk.timestamp[1],
          text: chunk.text.trim()
        }))
      };
      
    } catch (error) {
      throw new Error(`轉譯失敗: ${error.message}`);
    }
  }
}

// Worker 實例
const worker = new HybridWhisperWorker();

// 訊息處理
self.addEventListener('message', async (event) => {
  const { cmd, segment, index, options } = event.data;
  
  try {
    switch (cmd) {
      case 'initialize':
        await worker.initialize(options.model);
        break;
        
      case 'transcribe':
        const result = await worker.transcribe(segment, options);
        self.postMessage({
          type: 'result',
          data: { index, result }
        });
        break;
        
      default:
        self.postMessage({
          type: 'error',
          data: `未知命令: ${cmd}`
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      data: error.message
    });
  }
});

// 錯誤處理
self.addEventListener('error', (error) => {
  self.postMessage({
    type: 'error',
    data: `Worker 錯誤: ${error.message}`
  });
});