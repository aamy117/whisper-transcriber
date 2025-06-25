/**
 * 混合式 Worker 池 - 不依賴 SharedArrayBuffer
 * 使用 postMessage + Transferable Objects 實現並行處理
 * 預期效能提升 2-3x，完全相容 GitHub Pages
 */

export class HybridWorkerPool {
  constructor(workerScript, poolSize = navigator.hardwareConcurrency || 4) {
    this.poolSize = Math.min(poolSize, 8); // 最多 8 個 workers
    this.workers = [];
    this.taskQueue = [];
    this.busyWorkers = new Set();
    this.workerScript = workerScript;
    this.isInitialized = false;
    this.currentModel = null;
  }
  
  /**
   * 初始化 Worker 池和模型
   */
  async initialize(modelName = 'base') {
    if (this.isInitialized && this.currentModel === modelName) {
      return;
    }
    
    console.log(`初始化混合式 Worker 池，使用 ${this.poolSize} 個 Workers`);
    
    // 初始化所有 Workers
    const initPromises = [];
    
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(this.workerScript);
      worker.id = i;
      
      const initPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`Worker ${i} 初始化超時`));
        }, 30000); // 30秒超時
        
        const messageHandler = (event) => {
          if (event.data.type === 'initialized') {
            clearTimeout(timeout);
            worker.removeEventListener('message', messageHandler);
            resolve();
          } else if (event.data.type === 'error') {
            clearTimeout(timeout);
            worker.removeEventListener('message', messageHandler);
            reject(new Error(event.data.data));
          }
        };
        
        worker.addEventListener('message', messageHandler);
        
        // 初始化 Worker
        worker.postMessage({
          cmd: 'initialize',
          options: { model: modelName }
        });
      });
      
      worker.onmessage = (event) => {
        this.handleWorkerMessage(worker, event);
      };
      
      worker.onerror = (error) => {
        console.error(`Worker ${worker.id} 錯誤:`, error);
        this.busyWorkers.delete(worker.id);
        this.processNextTask();
      };
      
      this.workers.push(worker);
      initPromises.push(initPromise);
    }
    
    // 等待所有 Workers 初始化
    await Promise.all(initPromises);
    
    this.isInitialized = true;
    this.currentModel = modelName;
    
    console.log('混合式 Worker 池初始化完成');
  }
  
  /**
   * 處理音訊 - 使用 Transferable Objects
   */
  async processAudio(audioBuffer, options = {}) {
    // 智慧分段
    const segments = this.createOptimalSegments(audioBuffer);
    const results = new Array(segments.length);
    let completed = 0;
    
    return new Promise((resolve, reject) => {
      const onSegmentComplete = (index, result) => {
        results[index] = result;
        completed++;
        
        if (options.onProgress) {
          options.onProgress(completed / segments.length);
        }
        
        if (completed === segments.length) {
          resolve(this.mergeResults(results));
        }
      };
      
      // 排程所有任務
      segments.forEach((segment, index) => {
        this.scheduleTask({
          segment,
          index,
          options,
          callback: onSegmentComplete
        });
      });
      
      // 開始處理
      this.processNextTask();
    });
  }
  
  /**
   * 創建優化的音訊段落
   */
  createOptimalSegments(audioBuffer) {
    const segments = [];
    const optimalSize = 30 * audioBuffer.sampleRate; // 30 秒
    const overlap = 0.5 * audioBuffer.sampleRate; // 0.5 秒重疊
    
    let position = 0;
    while (position < audioBuffer.length) {
      const start = position;
      const end = Math.min(position + optimalSize, audioBuffer.length);
      
      // 創建新的 ArrayBuffer（可轉移）
      const segmentData = new Float32Array(end - start);
      segmentData.set(audioBuffer.getChannelData(0).slice(start, end));
      
      segments.push({
        data: segmentData.buffer, // ArrayBuffer 可以轉移
        start: start / audioBuffer.sampleRate,
        end: end / audioBuffer.sampleRate,
        sampleRate: audioBuffer.sampleRate
      });
      
      position += optimalSize - overlap;
    }
    
    return segments;
  }
  
  /**
   * 排程任務
   */
  scheduleTask(task) {
    this.taskQueue.push(task);
  }
  
  /**
   * 處理下一個任務
   */
  processNextTask() {
    if (this.taskQueue.length === 0) return;
    
    // 找到空閒的 Worker
    const availableWorker = this.workers.find(w => !this.busyWorkers.has(w.id));
    if (!availableWorker) return;
    
    const task = this.taskQueue.shift();
    this.busyWorkers.add(availableWorker.id);
    
    // 儲存回調
    availableWorker.currentTask = task;
    
    // 使用 Transferable Objects 發送資料
    availableWorker.postMessage({
      cmd: 'transcribe',
      segment: {
        data: task.segment.data,
        start: task.segment.start,
        end: task.segment.end,
        sampleRate: task.segment.sampleRate
      },
      index: task.index,
      options: task.options
    }, [task.segment.data]); // 關鍵：轉移 ArrayBuffer 所有權
  }
  
  /**
   * 處理 Worker 回應
   */
  handleWorkerMessage(worker, event) {
    const { type, data } = event.data;
    
    if (type === 'result') {
      const task = worker.currentTask;
      if (task && task.callback) {
        task.callback(data.index, data.result);
      }
      
      // 標記 Worker 為空閒
      this.busyWorkers.delete(worker.id);
      worker.currentTask = null;
      
      // 處理下一個任務
      this.processNextTask();
    }
  }
  
  /**
   * 合併結果
   */
  mergeResults(results) {
    const segments = [];
    
    results.forEach(result => {
      if (result && result.segments) {
        segments.push(...result.segments);
      }
    });
    
    // 排序並去重
    segments.sort((a, b) => a.start - b.start);
    
    return {
      segments: this.removeDuplicates(segments),
      text: segments.map(s => s.text).join(' ')
    };
  }
  
  /**
   * 移除重複段落
   */
  removeDuplicates(segments) {
    const filtered = [];
    let lastEnd = -1;
    
    for (const segment of segments) {
      if (segment.start >= lastEnd) {
        filtered.push(segment);
        lastEnd = segment.end;
      }
    }
    
    return filtered;
  }
  
  /**
   * 清理資源
   */
  dispose() {
    this.workers.forEach(worker => worker.terminate());
    this.workers = [];
    this.taskQueue = [];
    this.busyWorkers.clear();
  }
  
  /**
   * 獲取統計資訊
   */
  getStats() {
    return {
      poolSize: this.poolSize,
      busyWorkers: this.busyWorkers.size,
      queuedTasks: this.taskQueue.length,
      idleWorkers: this.poolSize - this.busyWorkers.size
    };
  }
}

/**
 * 工廠函數 - 自動選擇最佳實現
 */
export function createOptimizedWorkerPool(workerScript) {
  // 檢查環境支援
  const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
  const hasWorkers = 'Worker' in window;
  
  if (!hasWorkers) {
    throw new Error('瀏覽器不支援 Web Workers');
  }
  
  if (hasSharedArrayBuffer) {
    console.log('使用完整優化版 Worker 池（SharedArrayBuffer）');
    // 返回完整優化版（如果可用）
    return import('./whisper-wasm-optimized.js').then(module => {
      return new module.OptimizedWhisperWASM();
    });
  } else {
    console.log('使用混合式 Worker 池（無 SharedArrayBuffer）');
    
    // 計算混合式 Worker 的路徑
    const currentPath = window.location.pathname;
    let hybridWorkerPath;
    
    if (currentPath.includes('/test/')) {
      hybridWorkerPath = '../js/workers/whisper-hybrid-worker.js';
    } else {
      hybridWorkerPath = './js/workers/whisper-hybrid-worker.js';
    }
    
    // 返回混合版
    return new HybridWorkerPool(hybridWorkerPath);
  }
}