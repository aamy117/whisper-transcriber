/**
 * 大檔案處理主控制器
 * 
 * 這是新系統的統一入口，提供與現有系統相同的介面
 * 確保向後相容性，同時提供增強的大檔案處理能力
 */

import { largeFileConfig } from './large-file-config.js';
import { StreamAnalyzer } from './stream-analyzer.js';
import { SmartSplitter } from './smart-splitter.js';
import { ParallelProcessor } from './parallel-processor.js';
import { ProgressCheckpoint } from './progress-checkpoint.js';
import { CacheManager } from './cache-manager.js';
import { MemoryMonitor } from './memory-monitor.js';
import { PerformanceOptimizer } from './performance-optimizer.js';

// 調試模式
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

/**
 * 大檔案處理控制器
 */
export class LargeFileController {
  constructor() {
    this.config = largeFileConfig;
    this.activeProcesses = new Map();
    this.performanceMetrics = new Map();
    
    // 初始化子系統（延遲載入）
    this.streamAnalyzer = null;
    this.smartSplitter = null;
    this.parallelProcessor = null;
    this.progressCheckpoint = null;
    this.cacheManager = null;
    this.memoryMonitor = null;
    this.performanceOptimizer = null;
    
    // 監聽配置變更
    this.config.on('change', this.handleConfigChange.bind(this));
  }
  
  /**
   * 初始化子系統（延遲載入以提升效能）
   */
  async initializeSubsystems() {
    if (this.isInitialized) return;
    
    try {
      // 依序初始化各子系統
      if (this.config.get('features.memoryMonitoring')) {
        const { MemoryMonitor } = await import('./memory-monitor.js');
        this.memoryMonitor = new MemoryMonitor();
      }
      
      if (this.config.get('features.streaming')) {
        const { StreamAnalyzer } = await import('./stream-analyzer.js');
        this.streamAnalyzer = new StreamAnalyzer();
      }
      
      if (this.config.get('features.smartCache')) {
        const { CacheManager } = await import('./cache-manager.js');
        this.cacheManager = new CacheManager();
      }
      
      if (this.config.get('features.checkpoints')) {
        const { ProgressCheckpoint } = await import('./progress-checkpoint.js');
        this.progressCheckpoint = new ProgressCheckpoint();
      }
      
      if (this.config.get('features.parallelProcessing')) {
        const { ParallelProcessor } = await import('./parallel-processor.js');
        this.parallelProcessor = new ParallelProcessor();
      }
      
      const { SmartSplitter } = await import('./smart-splitter.js');
      this.smartSplitter = new SmartSplitter();
      
      if (this.config.get('features.autoOptimization')) {
        const { PerformanceOptimizer } = await import('./performance-optimizer.js');
        this.performanceOptimizer = new PerformanceOptimizer();
      }
      
      this.isInitialized = true;
      DEBUG && console.log('大檔案處理子系統初始化完成');
      
    } catch (error) {
      console.error('初始化子系統失敗', error);
      throw new Error('大檔案處理系統初始化失敗');
    }
  }
  
  /**
   * 處理檔案（主要介面）
   * 與現有 transcriptionPreprocessor.prepareForTranscription 相容
   */
  async process(file, options = {}) {
    const processId = this.generateProcessId();
    const startTime = performance.now();
    
    try {
      // 記錄處理開始
      this.activeProcesses.set(processId, {
        file,
        options,
        startTime,
        status: 'processing'
      });
      
      // 初始化子系統（如果還沒有）
      await this.initializeSubsystems();
      
      // 檢查是否有可恢復的檢查點
      if (this.progressCheckpoint && options.resumeFromCheckpoint) {
        const checkpoint = await this.progressCheckpoint.find(file);
        if (checkpoint) {
          DEBUG && console.log('找到檢查點，恢復處理', checkpoint);
          return await this.resumeFromCheckpoint(checkpoint, file, options);
        }
      }
      
      // 分析檔案
      const analysis = await this.analyzeFile(file);
      DEBUG && console.log('檔案分析結果', analysis);
      
      // 決定處理策略
      const strategy = await this.determineStrategy(file, analysis, options);
      DEBUG && console.log('選擇的處理策略', strategy);
      
      // 執行處理
      const result = await this.executeStrategy(processId, file, strategy, options);
      
      // 記錄效能指標
      const endTime = performance.now();
      this.recordPerformance(processId, {
        duration: endTime - startTime,
        fileSize: file.size,
        strategy: strategy.type,
        success: true
      });
      
      // 清理
      this.activeProcesses.delete(processId);
      
      return result;
      
    } catch (error) {
      // 記錄錯誤
      const endTime = performance.now();
      this.recordPerformance(processId, {
        duration: endTime - startTime,
        fileSize: file.size,
        error: error.message,
        success: false
      });
      
      // 清理
      this.activeProcesses.delete(processId);
      
      // 重新拋出錯誤，讓上層處理降級邏輯
      throw error;
    }
  }
  
  /**
   * 分析檔案
   */
  async analyzeFile(file) {
    if (!this.streamAnalyzer) {
      // 降級到基本分析
      return {
        size: file.size,
        type: file.type,
        name: file.name,
        estimatedDuration: file.size / (128 * 1024 / 8), // 估算（基於 128kbps）
        canStream: false
      };
    }
    
    return await this.streamAnalyzer.analyze(file);
  }
  
  /**
   * 決定處理策略
   */
  async determineStrategy(file, analysis, options) {
    // 檢查記憶體狀況
    const memoryStatus = this.memoryMonitor ? 
      await this.memoryMonitor.getStatus() : 
      { available: true };
    
    // 根據各種因素決定策略
    const strategy = {
      type: 'unknown',
      params: {}
    };
    
    // 如果記憶體不足，強制使用串流分割
    if (!memoryStatus.available) {
      strategy.type = 'streaming-split';
      strategy.params = {
        chunkSize: Math.min(10, this.config.get('splitting.minChunkSizeMB')),
        reason: 'low-memory'
      };
      return strategy;
    }
    
    // 根據檔案大小決定
    const fileSizeMB = file.size / (1024 * 1024);
    
    if (fileSizeMB < 200) {
      // 小於 200MB：智慧分割
      strategy.type = 'smart-split';
      strategy.params = {
        chunkSize: this.config.get('splitting.defaultChunkSizeMB'),
        overlap: this.config.get('splitting.overlapDuration')
      };
    } else if (fileSizeMB < 500) {
      // 200-500MB：串流分割 + 並行處理
      strategy.type = 'streaming-parallel';
      strategy.params = {
        chunkSize: this.config.get('splitting.defaultChunkSizeMB'),
        workers: Math.min(4, this.config.get('parallel.maxWorkers'))
      };
    } else {
      // 超過 500MB：完全串流處理
      strategy.type = 'full-streaming';
      strategy.params = {
        chunkSize: this.config.get('splitting.minChunkSizeMB'),
        workers: this.config.get('parallel.maxWorkers'),
        enableCheckpoints: true
      };
    }
    
    // 根據用戶選項覆蓋
    if (options.forceStrategy) {
      strategy.type = options.forceStrategy;
    }
    
    return strategy;
  }
  
  /**
   * 執行處理策略
   */
  async executeStrategy(processId, file, strategy, options) {
    const progressCallback = options.onProgress || (() => {});
    
    switch (strategy.type) {
      case 'smart-split':
        return await this.executeSmartSplit(processId, file, strategy.params, progressCallback);
        
      case 'streaming-parallel':
        return await this.executeStreamingParallel(processId, file, strategy.params, progressCallback);
        
      case 'full-streaming':
        return await this.executeFullStreaming(processId, file, strategy.params, progressCallback);
        
      default:
        throw new Error(`未知的處理策略: ${strategy.type}`);
    }
  }
  
  /**
   * 執行智慧分割策略
   */
  async executeSmartSplit(processId, file, params, onProgress) {
    // 建立檢查點會話（如果啟用）
    if (this.progressCheckpoint && this.config.get('features.checkpoints')) {
      await this.progressCheckpoint.createSession(file, {
        strategy: 'smart-split',
        metadata: {
          processId: processId,
          chunkSize: params.chunkSize,
          overlap: params.overlap
        }
      });
    }
    
    // 使用智慧分割器分割檔案
    const segments = await this.smartSplitter.split(file, {
      targetSize: params.chunkSize * 1024 * 1024,
      overlap: params.overlap,
      onProgress: (progress) => {
        onProgress({
          stage: 'splitting',
          progress: progress * 0.3 // 分割佔 30%
        });
      }
    });
    
    // 處理分段
    const results = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // 檢查是否已取消
      if (this.isCancelled(processId)) {
        throw new Error('處理已取消');
      }
      
      // 儲存檢查點
      if (this.progressCheckpoint && this.progressCheckpoint.currentSession) {
        await this.progressCheckpoint.updateProgress({
          overall: (i / segments.length) * 100,
          processedSegments: i,
          totalSegments: segments.length,
          currentSegment: `segment_${i}`,
          metadata: {
            fileId: file.name,
            processId: processId
          }
        });
      }
      
      // 處理單個分段（這裡應該呼叫實際的轉譯邏輯）
      const result = await this.processSegment(segment, {
        index: i,
        total: segments.length
      });
      
      results.push(result);
      
      // 更新進度
      onProgress({
        stage: 'processing',
        progress: 0.3 + (0.7 * (i + 1) / segments.length)
      });
    }
    
    // 完成檢查點會話
    if (this.progressCheckpoint && this.progressCheckpoint.currentSession) {
      await this.progressCheckpoint.completeSession({
        results: results,
        segments: segments.length,
        processingTime: performance.now() - this.activeProcesses.get(processId).startTime
      });
    }
    
    // 返回結果（格式與現有系統相容）
    return {
      strategy: 'smart-split',
      files: segments,
      results: results,
      metadata: {
        originalSize: file.size,
        segments: segments.length,
        processingTime: performance.now() - this.activeProcesses.get(processId).startTime
      }
    };
  }
  
  /**
   * 執行串流並行策略
   */
  async executeStreamingParallel(processId, file, params, onProgress) {
    // 初始化並行處理器
    await this.parallelProcessor.initialize({
      workers: params.workers
    });
    
    // 使用串流分割
    const streamer = await this.smartSplitter.createStreamer(file, {
      chunkSize: params.chunkSize * 1024 * 1024
    });
    
    // 並行處理串流分段
    const results = await this.parallelProcessor.processStream(streamer, {
      onProgress: (progress) => {
        onProgress({
          stage: 'parallel-processing',
          progress: progress
        });
      },
      onSegmentComplete: async (index, result) => {
        // 儲存部分結果到快取
        if (this.cacheManager) {
          await this.cacheManager.saveSegment(processId, index, result);
        }
      }
    });
    
    return {
      strategy: 'streaming-parallel',
      files: [], // 串流處理不產生檔案
      results: results,
      metadata: {
        originalSize: file.size,
        workers: params.workers,
        processingTime: performance.now() - this.activeProcesses.get(processId).startTime
      }
    };
  }
  
  /**
   * 執行完全串流策略
   */
  async executeFullStreaming(processId, file, params, onProgress) {
    // 這是最複雜的策略，用於超大檔案
    // 實作細節將在後續階段完成
    throw new Error('完全串流策略尚未實作');
  }
  
  /**
   * 處理單個分段（模擬）
   */
  async processSegment(segment, context) {
    // 這裡應該呼叫實際的轉譯邏輯
    // 目前返回模擬結果
    return {
      index: context.index,
      text: `分段 ${context.index + 1}/${context.total} 的轉譯結果`,
      startTime: segment.startTime || 0,
      endTime: segment.endTime || 0,
      duration: segment.duration || 0
    };
  }
  
  /**
   * 從檢查點恢復處理
   */
  async resumeFromCheckpoint(checkpoint, file, options) {
    DEBUG && console.log('從檢查點恢復處理', checkpoint);
    // 實作細節將在後續階段完成
    throw new Error('檢查點恢復功能尚未實作');
  }
  
  /**
   * 取消處理
   */
  async cancel(processId) {
    const process = this.activeProcesses.get(processId);
    if (process) {
      process.status = 'cancelled';
      
      // 通知各子系統取消
      if (this.parallelProcessor) {
        await this.parallelProcessor.cancelAll();
      }
      
      // 清理資源
      this.activeProcesses.delete(processId);
      
      DEBUG && console.log('處理已取消', processId);
    }
  }
  
  /**
   * 檢查是否已取消
   */
  isCancelled(processId) {
    const process = this.activeProcesses.get(processId);
    return process && process.status === 'cancelled';
  }
  
  /**
   * 記錄效能指標
   */
  recordPerformance(processId, metrics) {
    this.performanceMetrics.set(processId, metrics);
    
    // 通知效能優化器
    if (this.performanceOptimizer && metrics.success) {
      // 只在成功時記錄處理效能
      this.performanceOptimizer.recordProcessingPerformance({
        fileSize: metrics.fileSize,
        duration: metrics.duration,
        chunkCount: metrics.chunkCount || 1, // 預設為1如果沒有提供
      });
    }
    
    // 在開發模式下輸出
    if (DEBUG) {
      console.log('效能指標', {
        processId,
        ...metrics,
        throughput: metrics.fileSize / metrics.duration / 1024 + ' KB/ms'
      });
    }
  }
  
  /**
   * 生成處理 ID
   */
  generateProcessId() {
    return `process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 處理配置變更
   */
  handleConfigChange(change) {
    DEBUG && console.log('配置變更', change);
    
    // 根據變更重新初始化相關子系統
    if (change.path.startsWith('features.')) {
      this.isInitialized = false;
    }
  }
  
  /**
   * 獲取狀態摘要
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      activeProcesses: this.activeProcesses.size,
      config: this.config.getSummary(),
      subsystems: {
        streamAnalyzer: !!this.streamAnalyzer,
        smartSplitter: !!this.smartSplitter,
        parallelProcessor: !!this.parallelProcessor,
        progressCheckpoint: !!this.progressCheckpoint,
        cacheManager: !!this.cacheManager,
        memoryMonitor: !!this.memoryMonitor,
        performanceOptimizer: !!this.performanceOptimizer
      }
    };
  }
  
  /**
   * 清理資源
   */
  async cleanup() {
    // 取消所有活動處理
    for (const [processId] of this.activeProcesses) {
      await this.cancel(processId);
    }
    
    // 清理子系統
    if (this.parallelProcessor) {
      await this.parallelProcessor.terminate();
    }
    
    if (this.cacheManager) {
      await this.cacheManager.cleanup();
    }
    
    DEBUG && console.log('大檔案處理控制器已清理');
  }
}

// 建立單例實例
export const largeFileController = new LargeFileController();

// 開發模式下暴露到全域
if (DEBUG) {
  window.largeFileController = largeFileController;
}