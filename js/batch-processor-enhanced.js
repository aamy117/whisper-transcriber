/**
 * 增強版批次處理管理器
 * 支援多檔案並行處理、批次編輯、進階匯出等功能
 */

import { notify } from './notification.js';
import { transcriptionPreprocessor } from './transcription-preprocessor.js';
import CancellationToken from './utils/cancellation-token.js';
import { progressManager, showProcessingProgress } from './progress-manager.js';

export class EnhancedBatchProcessor {
  constructor(whisperAPI) {
    this.whisperAPI = whisperAPI;
    this.queue = [];
    this.results = new Map(); // 使用 Map 存儲結果，便於查詢
    this.isProcessing = false;
    this.isPaused = false;
    this.cancellationTokens = new Map(); // 每個任務的取消令牌

    // 批次處理選項
    this.options = {
      language: 'zh',
      prompt: '以下是普通話的對話內容。',
      continueOnError: true,
      autoSaveResults: true,
      maxConcurrent: 3, // 最大並行處理數
      retryCount: 2, // 失敗重試次數
      retryDelay: 5000, // 重試延遲（毫秒）
    };

    // 並行處理控制
    this.activeWorkers = new Set();
    this.workerPool = [];
    
    // 事件監聽器
    this.listeners = {
      progress: [],
      complete: [],
      error: [],
      itemComplete: [],
      itemStart: [],
      batchStart: [],
      batchEnd: []
    };

    // 統計資訊
    this.stats = {
      startTime: null,
      endTime: null,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      successRate: 0
    };
  }

  /**
   * 添加檔案到佇列
   */
  addFiles(files, options = {}) {
    const newItems = Array.from(files).map(file => ({
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file: file,
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      retryCount: 0,
      startTime: null,
      endTime: null,
      metadata: options.metadata || {}, // 支援自定義元數據
      priority: options.priority || 0 // 優先級
    }));

    // 根據優先級插入佇列
    if (options.priority > 0) {
      // 高優先級的插入到前面
      const insertIndex = this.queue.findIndex(item => 
        item.status === 'pending' && item.priority < options.priority
      );
      if (insertIndex === -1) {
        this.queue.push(...newItems);
      } else {
        this.queue.splice(insertIndex, 0, ...newItems);
      }
    } else {
      this.queue.push(...newItems);
    }

    this.emit('progress', this.getProgress());
    return newItems.length;
  }

  /**
   * 開始批次處理
   */
  async start() {
    if (this.isProcessing && !this.isPaused) {
      notify.warning('批次處理已在進行中');
      return;
    }

    const pendingItems = this.queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) {
      notify.warning('沒有待處理的檔案');
      return;
    }

    this.isProcessing = true;
    this.isPaused = false;
    this.stats.startTime = new Date();
    
    this.emit('batchStart', { 
      totalItems: this.queue.length,
      pendingItems: pendingItems.length 
    });

    // 啟動並行處理
    this.startWorkers();
  }

  /**
   * 啟動工作執行緒
   */
  async startWorkers() {
    const workerCount = Math.min(this.options.maxConcurrent, this.queue.length);
    
    for (let i = 0; i < workerCount; i++) {
      if (!this.isPaused && this.isProcessing) {
        this.startWorker(i);
      }
    }
  }

  /**
   * 啟動單個工作執行緒
   */
  async startWorker(workerId) {
    const worker = {
      id: workerId,
      isActive: true
    };
    
    this.activeWorkers.add(worker);

    while (this.isProcessing && !this.isPaused) {
      const item = this.getNextPendingItem();
      
      if (!item) {
        // 沒有更多待處理項目
        break;
      }

      await this.processItem(item, worker);
      
      // 短暫延遲，避免過度請求 API
      await this.delay(1000);
    }

    this.activeWorkers.delete(worker);
    
    // 檢查是否所有工作都完成
    if (this.activeWorkers.size === 0 && this.isProcessing) {
      this.onBatchComplete();
    }
  }

  /**
   * 獲取下一個待處理項目
   */
  getNextPendingItem() {
    return this.queue.find(item => item.status === 'pending');
  }

  /**
   * 處理單個項目
   */
  async processItem(item, worker) {
    const cancellationToken = new CancellationToken();
    this.cancellationTokens.set(item.id, cancellationToken);

    try {
      item.status = 'processing';
      item.startTime = new Date();
      this.emit('itemStart', { item, workerId: worker.id });
      this.emit('progress', this.getProgress());

      // 顯示進度
      const progressControl = showProcessingProgress(
        `處理 ${item.file.name}`,
        ['準備檔案', '執行轉譯', '處理結果'],
        () => cancellationToken.cancel('使用者取消')
      );

      // 預處理檔案
      const preprocessResult = await transcriptionPreprocessor.prepareForTranscription(
        item.file, 
        { cancellationToken }
      );

      progressControl.setStage(1); // 執行轉譯
      progressControl.update(50, '正在轉譯...');

      let finalResult = null;

      if (preprocessResult.strategy === 'direct') {
        // 直接轉譯
        finalResult = await this.whisperAPI.transcribe(item.file, {
          ...this.options,
          skipSizeCheck: false,
          signal: cancellationToken.signal
        });
      } else if (preprocessResult.strategy === 'wasm') {
        // WASM 本地轉譯
        finalResult = await this.processWithWASM(preprocessResult, item, cancellationToken);
      } else {
        // 處理分段
        finalResult = await this.processSegments(preprocessResult, item, cancellationToken);
      }

      progressControl.setStage(2); // 處理結果
      progressControl.update(90, '保存結果...');

      // 保存結果
      item.status = 'completed';
      item.endTime = new Date();
      item.result = {
        ...finalResult,
        fileName: item.file.name,
        fileSize: item.file.size,
        processingTime: item.endTime - item.startTime,
        processingStrategy: preprocessResult.strategy,
        metadata: item.metadata
      };

      this.results.set(item.id, item.result);
      progressControl.complete();
      
      this.emit('itemComplete', { item, workerId: worker.id });

      // 自動保存結果
      if (this.options.autoSaveResults) {
        this.saveItemResult(item);
      }

    } catch (error) {
      if (error.name === 'CancellationError') {
        item.status = 'cancelled';
        item.error = '使用者取消';
      } else {
        item.status = 'error';
        item.error = error.message;
        
        // 檢查是否需要重試
        if (item.retryCount < this.options.retryCount) {
          item.retryCount++;
          item.status = 'pending';
          notify.warning(`檔案 ${item.file.name} 處理失敗，將在 ${this.options.retryDelay / 1000} 秒後重試`);
          await this.delay(this.options.retryDelay);
          return;
        }
      }

      item.endTime = new Date();
      this.emit('error', { item, error, workerId: worker.id });

      if (!this.options.continueOnError && error.name !== 'CancellationError') {
        this.stop();
      }
    } finally {
      this.cancellationTokens.delete(item.id);
      this.emit('progress', this.getProgress());
    }
  }

  /**
   * 使用 WASM 處理
   */
  async processWithWASM(preprocessResult, item, cancellationToken) {
    const wasmManager = preprocessResult.wasmManager;
    
    return await wasmManager.transcribe(item.file, {
      cancellationToken,
      onProgress: (progress) => {
        item.progress = progress.percentage;
        this.emit('progress', this.getProgress());
      }
    });
  }

  /**
   * 處理分段檔案
   */
  async processSegments(preprocessResult, item, cancellationToken) {
    const allSegments = [];
    let allText = '';
    const totalFiles = preprocessResult.files.length;

    for (let i = 0; i < totalFiles; i++) {
      cancellationToken.throwIfCancelled();
      
      const segmentFile = preprocessResult.files[i];
      const segmentInfo = preprocessResult.segments ? preprocessResult.segments[i] : null;

      // 更新進度
      item.progress = (i / totalFiles) * 100;
      this.emit('progress', this.getProgress());

      const segmentResult = await this.whisperAPI.transcribe(segmentFile, {
        ...this.options,
        skipSizeCheck: true,
        signal: cancellationToken.signal
      });

      // 調整時間戳
      if (segmentInfo && segmentResult.segments) {
        const timeOffset = segmentInfo.startTime;
        segmentResult.segments.forEach(seg => {
          seg.start += timeOffset;
          seg.end += timeOffset;
        });
      }

      allSegments.push(...(segmentResult.segments || []));
      allText += (allText ? ' ' : '') + segmentResult.text;
    }

    return {
      text: allText,
      segments: allSegments,
      language: this.options.language,
      duration: preprocessResult.totalDuration || 0
    };
  }

  /**
   * 批次處理完成
   */
  onBatchComplete() {
    this.isProcessing = false;
    this.stats.endTime = new Date();
    this.stats.totalProcessingTime = this.stats.endTime - this.stats.startTime;
    
    // 計算統計資訊
    const completedItems = this.queue.filter(item => item.status === 'completed');
    const failedItems = this.queue.filter(item => item.status === 'error');
    
    this.stats.successRate = (completedItems.length / this.queue.length) * 100;
    this.stats.averageProcessingTime = completedItems.length > 0
      ? completedItems.reduce((sum, item) => sum + (item.endTime - item.startTime), 0) / completedItems.length
      : 0;

    this.emit('batchEnd', this.stats);
    this.emit('complete', Array.from(this.results.values()));
    
    notify.success(`批次處理完成！成功: ${completedItems.length}, 失敗: ${failedItems.length}`);
  }

  /**
   * 暫停批次處理
   */
  pause() {
    if (this.isProcessing && !this.isPaused) {
      this.isPaused = true;
      notify.info('批次處理已暫停');
    }
  }

  /**
   * 繼續批次處理
   */
  resume() {
    if (this.isProcessing && this.isPaused) {
      this.isPaused = false;
      this.startWorkers();
      notify.info('批次處理已繼續');
    }
  }

  /**
   * 停止批次處理
   */
  stop() {
    this.isProcessing = false;
    this.isPaused = false;
    
    // 取消所有進行中的任務
    this.cancellationTokens.forEach(token => token.cancel('批次處理已停止'));
    this.cancellationTokens.clear();
    
    notify.info('批次處理已停止');
  }

  /**
   * 取消特定項目
   */
  cancelItem(itemId) {
    const token = this.cancellationTokens.get(itemId);
    if (token) {
      token.cancel('使用者取消項目');
    }
  }

  /**
   * 清空佇列
   */
  clear() {
    this.stop();
    this.queue = [];
    this.results.clear();
    this.emit('progress', this.getProgress());
  }

  /**
   * 移除特定項目
   */
  removeItem(itemId) {
    const index = this.queue.findIndex(item => item.id === itemId);
    if (index !== -1) {
      const item = this.queue[index];
      
      // 如果正在處理，先取消
      if (item.status === 'processing') {
        this.cancelItem(itemId);
      }
      
      this.queue.splice(index, 1);
      this.results.delete(itemId);
      this.emit('progress', this.getProgress());
    }
  }

  /**
   * 重新處理失敗的項目
   */
  retryFailed() {
    const failedItems = this.queue.filter(item => item.status === 'error');
    
    failedItems.forEach(item => {
      item.status = 'pending';
      item.error = null;
      item.retryCount = 0;
    });
    
    if (failedItems.length > 0) {
      notify.info(`重新處理 ${failedItems.length} 個失敗的項目`);
      if (!this.isProcessing) {
        this.start();
      }
    }
  }

  /**
   * 取得進度資訊
   */
  getProgress() {
    const total = this.queue.length;
    const completed = this.queue.filter(item => item.status === 'completed').length;
    const failed = this.queue.filter(item => item.status === 'error').length;
    const processing = this.queue.filter(item => item.status === 'processing').length;
    const pending = this.queue.filter(item => item.status === 'pending').length;
    const cancelled = this.queue.filter(item => item.status === 'cancelled').length;

    return {
      total,
      completed,
      failed,
      processing,
      pending,
      cancelled,
      percentage: total > 0 ? (completed / total) * 100 : 0,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused,
      activeWorkers: this.activeWorkers.size,
      stats: this.stats
    };
  }

  /**
   * 保存單個項目結果
   */
  saveItemResult(item) {
    const projectId = `project_${Date.now()}`;
    const projectData = {
      id: projectId,
      fileName: item.file.name,
      fileSize: item.file.size,
      createdAt: item.startTime.toISOString(),
      lastModified: item.endTime.toISOString(),
      transcription: item.result,
      batchProcessed: true,
      metadata: item.metadata
    };

    const key = `whisper_${projectId}`;
    localStorage.setItem(key, JSON.stringify(projectData));
  }

  /**
   * 匯出批次結果（增強版）
   */
  exportResults(options = {}) {
    const format = options.format || 'json';
    const mode = options.mode || 'single'; // single: 單一檔案, separate: 分開匯出
    const includeMetadata = options.includeMetadata !== false;
    
    const results = Array.from(this.results.values());
    
    if (results.length === 0) {
      notify.warning('沒有可匯出的結果');
      return;
    }

    if (mode === 'separate') {
      // 分開匯出每個檔案
      results.forEach(result => {
        this.exportSingleResult(result, format, includeMetadata);
      });
      notify.success(`已匯出 ${results.length} 個檔案`);
    } else {
      // 匯出為單一檔案
      let content;
      let mimeType;
      let fileName;

      switch (format) {
        case 'json':
          content = JSON.stringify(results, null, 2);
          mimeType = 'application/json';
          fileName = `batch_results_${new Date().toISOString().slice(0, 10)}.json`;
          break;

        case 'csv':
          content = this.resultsToCSV(results, includeMetadata);
          mimeType = 'text/csv;charset=utf-8';
          fileName = `batch_results_${new Date().toISOString().slice(0, 10)}.csv`;
          break;

        case 'txt':
          content = this.resultsToText(results, includeMetadata);
          mimeType = 'text/plain;charset=utf-8';
          fileName = `batch_results_${new Date().toISOString().slice(0, 10)}.txt`;
          break;

        case 'srt':
          content = this.resultsToSRT(results);
          mimeType = 'text/plain;charset=utf-8';
          fileName = `batch_results_${new Date().toISOString().slice(0, 10)}.srt`;
          break;

        default:
          throw new Error(`不支援的匯出格式：${format}`);
      }

      this.downloadFile(content, fileName, mimeType);
      notify.success('批次結果已匯出');
    }
  }

  /**
   * 匯出單個結果
   */
  exportSingleResult(result, format, includeMetadata) {
    const baseName = result.fileName.replace(/\.[^/.]+$/, '');
    let content;
    let extension;

    switch (format) {
      case 'txt':
        content = includeMetadata 
          ? `檔案: ${result.fileName}\n處理時間: ${new Date().toISOString()}\n\n${result.text}`
          : result.text;
        extension = 'txt';
        break;

      case 'srt':
        content = this.segmentsToSRT(result.segments);
        extension = 'srt';
        break;

      case 'json':
        content = JSON.stringify(includeMetadata ? result : { text: result.text, segments: result.segments }, null, 2);
        extension = 'json';
        break;

      default:
        return;
    }

    const fileName = `${baseName}_transcription.${extension}`;
    this.downloadFile(content, fileName, 'text/plain;charset=utf-8');
  }

  /**
   * 轉換結果為 CSV（增強版）
   */
  resultsToCSV(results, includeMetadata) {
    const headers = ['檔案名稱', '檔案大小', '處理時間(秒)', '音訊時長(秒)', '處理策略', '字數', '轉譯文字'];
    
    if (includeMetadata) {
      headers.push('元數據');
    }

    const rows = [headers];

    results.forEach(result => {
      const row = [
        result.fileName,
        result.fileSize,
        (result.processingTime / 1000).toFixed(2),
        result.duration.toFixed(2),
        result.processingStrategy,
        result.text.length,
        `"${result.text.replace(/"/g, '""')}"`
      ];

      if (includeMetadata) {
        row.push(JSON.stringify(result.metadata || {}));
      }

      rows.push(row);
    });

    // 添加 BOM 以支援 Excel 正確顯示中文
    const BOM = '\uFEFF';
    return BOM + rows.map(row => row.join(',')).join('\n');
  }

  /**
   * 轉換結果為純文字（增強版）
   */
  resultsToText(results, includeMetadata) {
    let text = '批次轉譯結果\n';
    text += '=' .repeat(50) + '\n';
    text += `生成時間: ${new Date().toLocaleString()}\n`;
    text += `總檔案數: ${results.length}\n`;
    text += '=' .repeat(50) + '\n\n';

    results.forEach((result, index) => {
      text += `【檔案 ${index + 1}】${result.fileName}\n`;
      text += '-'.repeat(30) + '\n';
      
      if (includeMetadata) {
        text += `檔案大小: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB\n`;
        text += `音訊時長: ${(result.duration / 60).toFixed(2)} 分鐘\n`;
        text += `處理時間: ${(result.processingTime / 1000).toFixed(2)} 秒\n`;
        text += `處理策略: ${result.processingStrategy}\n`;
        text += '-'.repeat(30) + '\n';
      }
      
      text += result.text + '\n\n';
      text += '=' .repeat(50) + '\n\n';
    });

    return text;
  }

  /**
   * 轉換結果為 SRT 格式
   */
  resultsToSRT(results) {
    let srtContent = '';
    let globalIndex = 1;

    results.forEach(result => {
      if (result.segments && result.segments.length > 0) {
        srtContent += `=== ${result.fileName} ===\n\n`;
        
        result.segments.forEach(segment => {
          srtContent += `${globalIndex}\n`;
          srtContent += `${this.formatSRTTime(segment.start)} --> ${this.formatSRTTime(segment.end)}\n`;
          srtContent += `${segment.text}\n\n`;
          globalIndex++;
        });
      }
    });

    return srtContent;
  }

  /**
   * 將段落轉換為 SRT 格式
   */
  segmentsToSRT(segments) {
    let srtContent = '';
    
    segments.forEach((segment, index) => {
      srtContent += `${index + 1}\n`;
      srtContent += `${this.formatSRTTime(segment.start)} --> ${this.formatSRTTime(segment.end)}\n`;
      srtContent += `${segment.text}\n\n`;
    });

    return srtContent;
  }

  /**
   * 格式化 SRT 時間
   */
  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  /**
   * 下載檔案
   */
  downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * 延遲函數
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 事件處理
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }
}

// 匯出工廠函數
export const createEnhancedBatchProcessor = (whisperAPI) => new EnhancedBatchProcessor(whisperAPI);