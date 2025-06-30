/**
 * 並行處理器 - 第三階段核心模組
 * 負責協調多個 Worker 並行處理音訊片段
 */

import { LargeFileConfig } from './large-file-config.js';
import { WorkerPoolManager } from './worker-pool-manager.js';

export class ParallelProcessor {
  constructor() {
    this.config = LargeFileConfig.getInstance();
    this.workerPool = null;
    this.processingTasks = new Map();
    this.results = new Map();
    this.progressCallbacks = new Set();
    this.isProcessing = false;
  }

  /**
   * 初始化處理器
   */
  async initialize() {
    try {
      // 獲取並行處理配置
      const parallelConfig = this.config.get('parallelProcessing');
      
      // 初始化 Worker 池
      this.workerPool = new WorkerPoolManager({
        maxWorkers: parallelConfig.maxWorkers,
        workerPath: '/js/workers/transcription-worker.js',
        taskTimeout: parallelConfig.taskTimeout
      });

      await this.workerPool.initialize();
      console.log('並行處理器初始化完成');
      return true;
    } catch (error) {
      console.error('並行處理器初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 處理音訊片段陣列
   * @param {Array} segments - 音訊片段陣列
   * @param {Object} options - 處理選項
   * @returns {Promise<Object>} 合併後的結果
   */
  async processSegments(segments, options = {}) {
    if (this.isProcessing) {
      throw new Error('已有處理任務進行中');
    }

    this.isProcessing = true;
    this.results.clear();
    this.processingTasks.clear();

    const {
      model = 'whisper-1',
      language = 'zh',
      apiKey = null,
      useWASM = false,
      onProgress = null
    } = options;

    if (onProgress) {
      this.progressCallbacks.add(onProgress);
    }

    try {
      // 建立處理任務
      const tasks = segments.map((segment, index) => ({
        id: `segment-${index}`,
        type: 'transcribe',
        data: {
          audio: segment.data,
          format: segment.format,
          startTime: segment.startTime,
          endTime: segment.endTime,
          index: index
        },
        options: {
          model,
          language,
          apiKey,
          useWASM
        }
      }));

      // 提交任務到 Worker 池
      const promises = tasks.map(task => 
        this.submitTask(task)
      );

      // 等待所有任務完成
      await Promise.all(promises);

      // 合併結果
      const mergedResult = this.mergeResults(segments.length);
      
      return mergedResult;
    } finally {
      this.isProcessing = false;
      this.progressCallbacks.clear();
    }
  }

  /**
   * 提交單個任務
   */
  async submitTask(task) {
    try {
      this.processingTasks.set(task.id, {
        status: 'pending',
        startTime: Date.now()
      });

      const result = await this.workerPool.executeTask(task, {
        onProgress: (progress) => {
          this.handleTaskProgress(task.id, progress);
        }
      });

      this.processingTasks.set(task.id, {
        status: 'completed',
        endTime: Date.now()
      });

      this.results.set(task.id, result);
      this.updateOverallProgress();

      return result;
    } catch (error) {
      this.processingTasks.set(task.id, {
        status: 'failed',
        error: error.message
      });
      
      // 根據配置決定是否重試
      const retryConfig = this.config.get('errorHandling.retryConfig');
      if (retryConfig.maxRetries > 0) {
        console.log(`任務 ${task.id} 失敗，準備重試`);
        // 這裡可以實作重試邏輯
      }
      
      throw error;
    }
  }

  /**
   * 處理任務進度
   */
  handleTaskProgress(taskId, progress) {
    const task = this.processingTasks.get(taskId);
    if (task) {
      task.progress = progress;
      this.updateOverallProgress();
    }
  }

  /**
   * 更新整體進度
   */
  updateOverallProgress() {
    const tasks = Array.from(this.processingTasks.values());
    const totalProgress = tasks.reduce((sum, task) => {
      if (task.status === 'completed') return sum + 100;
      if (task.status === 'failed') return sum + 0;
      return sum + (task.progress || 0);
    }, 0);

    const overallProgress = totalProgress / tasks.length;

    // 通知所有進度回調
    this.progressCallbacks.forEach(callback => {
      try {
        callback({
          overall: overallProgress,
          completed: tasks.filter(t => t.status === 'completed').length,
          total: tasks.length,
          tasks: new Map(this.processingTasks)
        });
      } catch (error) {
        console.error('進度回調錯誤:', error);
      }
    });
  }

  /**
   * 合併處理結果
   */
  mergeResults(totalSegments) {
    const orderedResults = [];
    
    // 按順序收集結果
    for (let i = 0; i < totalSegments; i++) {
      const taskId = `segment-${i}`;
      const result = this.results.get(taskId);
      
      if (!result) {
        console.warn(`片段 ${i} 的結果缺失`);
        continue;
      }
      
      orderedResults.push(result);
    }

    // 合併轉錄文本和時間戳
    const mergedTranscript = this.mergeTranscripts(orderedResults);
    
    // 計算統計資訊
    const stats = this.calculateStats(orderedResults);

    return {
      transcript: mergedTranscript,
      segments: orderedResults,
      stats: stats,
      metadata: {
        totalSegments: totalSegments,
        successfulSegments: orderedResults.length,
        processingTime: this.calculateProcessingTime()
      }
    };
  }

  /**
   * 合併轉錄文本
   */
  mergeTranscripts(results) {
    let fullText = '';
    const segments = [];

    results.forEach((result, index) => {
      if (result.text) {
        // 添加文本
        if (fullText && !fullText.endsWith(' ')) {
          fullText += ' ';
        }
        fullText += result.text;

        // 收集帶時間戳的片段
        if (result.segments) {
          segments.push(...result.segments.map(seg => ({
            ...seg,
            start: seg.start + result.startTime,
            end: seg.end + result.startTime
          })));
        }
      }
    });

    return {
      text: fullText.trim(),
      segments: segments
    };
  }

  /**
   * 計算統計資訊
   */
  calculateStats(results) {
    const stats = {
      totalDuration: 0,
      totalWords: 0,
      averageConfidence: 0,
      processingSpeed: 0
    };

    let confidenceSum = 0;
    let confidenceCount = 0;

    results.forEach(result => {
      if (result.duration) {
        stats.totalDuration += result.duration;
      }
      
      if (result.words) {
        stats.totalWords += result.words;
      }
      
      if (result.confidence !== undefined) {
        confidenceSum += result.confidence;
        confidenceCount++;
      }
    });

    if (confidenceCount > 0) {
      stats.averageConfidence = confidenceSum / confidenceCount;
    }

    // 計算處理速度（音訊時長 / 處理時間）
    const processingTime = this.calculateProcessingTime() / 1000; // 轉換為秒
    if (processingTime > 0) {
      stats.processingSpeed = stats.totalDuration / processingTime;
    }

    return stats;
  }

  /**
   * 計算總處理時間
   */
  calculateProcessingTime() {
    let minStart = Infinity;
    let maxEnd = 0;

    this.processingTasks.forEach(task => {
      if (task.startTime) {
        minStart = Math.min(minStart, task.startTime);
      }
      if (task.endTime) {
        maxEnd = Math.max(maxEnd, task.endTime);
      }
    });

    return maxEnd - minStart;
  }

  /**
   * 取消處理
   */
  async cancel() {
    if (!this.isProcessing) {
      return;
    }

    console.log('取消並行處理');
    
    // 取消所有進行中的任務
    if (this.workerPool) {
      await this.workerPool.cancelAllTasks();
    }

    this.isProcessing = false;
    this.processingTasks.clear();
    this.results.clear();
  }

  /**
   * 清理資源
   */
  async cleanup() {
    await this.cancel();
    
    if (this.workerPool) {
      await this.workerPool.terminate();
      this.workerPool = null;
    }

    this.progressCallbacks.clear();
  }

  /**
   * 獲取處理狀態
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      totalTasks: this.processingTasks.size,
      completedTasks: Array.from(this.processingTasks.values())
        .filter(t => t.status === 'completed').length,
      failedTasks: Array.from(this.processingTasks.values())
        .filter(t => t.status === 'failed').length,
      workerPoolStatus: this.workerPool ? this.workerPool.getStatus() : null
    };
  }
}

// 匯出單例
let instance = null;

export function getParallelProcessor() {
  if (!instance) {
    instance = new ParallelProcessor();
  }
  return instance;
}