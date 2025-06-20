/**
 * 批次處理管理器
 * 處理多個音訊檔案的轉譯任務
 */

import { notify } from './notification.js';
import { transcriptionPreprocessor } from './transcription-preprocessor.js';

export class BatchProcessor {
  constructor(whisperAPI) {
    this.whisperAPI = whisperAPI;
    this.queue = [];
    this.currentIndex = -1;
    this.isProcessing = false;
    this.isPaused = false;
    this.results = [];
    
    // 批次處理選項
    this.options = {
      language: 'zh',
      prompt: '以下是普通話的對話內容。',
      continueOnError: true,
      autoSaveResults: true
    };
    
    // 事件監聽器
    this.listeners = {
      progress: [],
      complete: [],
      error: [],
      itemComplete: []
    };
  }
  
  /**
   * 添加檔案到佇列
   */
  addFiles(files) {
    const newItems = Array.from(files).map(file => ({
      id: `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file: file,
      status: 'pending',
      progress: 0,
      result: null,
      error: null,
      startTime: null,
      endTime: null
    }));
    
    this.queue.push(...newItems);
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
    
    if (this.queue.length === 0) {
      notify.warning('沒有待處理的檔案');
      return;
    }
    
    this.isProcessing = true;
    this.isPaused = false;
    
    // 從上次停止的位置繼續，或從頭開始
    if (this.currentIndex === -1 || this.currentIndex >= this.queue.length - 1) {
      this.currentIndex = -1;
    }
    
    await this.processNext();
  }
  
  /**
   * 處理下一個檔案
   */
  async processNext() {
    if (this.isPaused || !this.isProcessing) {
      return;
    }
    
    this.currentIndex++;
    
    if (this.currentIndex >= this.queue.length) {
      // 批次處理完成
      this.isProcessing = false;
      this.emit('complete', this.results);
      notify.success('批次處理完成！');
      return;
    }
    
    const item = this.queue[this.currentIndex];
    
    try {
      item.status = 'processing';
      item.startTime = new Date();
      this.emit('progress', this.getProgress());
      
      // 預處理檔案
      const preprocessResult = await transcriptionPreprocessor.prepareForTranscription(item.file);
      
      let finalResult = null;
      
      if (preprocessResult.strategy === 'direct') {
        // 直接轉譯
        finalResult = await this.whisperAPI.transcribe(item.file, {
          ...this.options,
          skipSizeCheck: false
        });
      } else {
        // 處理分段
        finalResult = await this.processSegments(preprocessResult, item);
      }
      
      // 保存結果
      item.status = 'completed';
      item.endTime = new Date();
      item.result = {
        ...finalResult,
        fileName: item.file.name,
        fileSize: item.file.size,
        processingTime: item.endTime - item.startTime,
        processingStrategy: preprocessResult.strategy
      };
      
      this.results.push(item.result);
      this.emit('itemComplete', item);
      
      // 自動保存結果
      if (this.options.autoSaveResults) {
        this.saveItemResult(item);
      }
      
    } catch (error) {
      item.status = 'error';
      item.error = error.message;
      item.endTime = new Date();
      
      this.emit('error', { item, error });
      
      if (!this.options.continueOnError) {
        this.isProcessing = false;
        notify.error(`批次處理失敗：${error.message}`);
        return;
      }
    }
    
    // 處理下一個
    setTimeout(() => this.processNext(), 1000); // 延遲1秒避免API限制
  }
  
  /**
   * 處理分段檔案
   */
  async processSegments(preprocessResult, item) {
    const allSegments = [];
    let allText = '';
    const totalFiles = preprocessResult.files.length;
    
    for (let i = 0; i < totalFiles; i++) {
      const segmentFile = preprocessResult.files[i];
      const segmentInfo = preprocessResult.segments ? preprocessResult.segments[i] : null;
      
      // 更新進度
      item.progress = (i / totalFiles) * 100;
      this.emit('progress', this.getProgress());
      
      const segmentResult = await this.whisperAPI.transcribe(segmentFile, {
        ...this.options,
        skipSizeCheck: true
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
      this.processNext();
      notify.info('批次處理已繼續');
    }
  }
  
  /**
   * 停止批次處理
   */
  stop() {
    this.isProcessing = false;
    this.isPaused = false;
    notify.info('批次處理已停止');
  }
  
  /**
   * 清空佇列
   */
  clear() {
    this.queue = [];
    this.currentIndex = -1;
    this.results = [];
    this.emit('progress', this.getProgress());
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
    
    return {
      total,
      completed,
      failed,
      processing,
      pending,
      currentIndex: this.currentIndex,
      percentage: total > 0 ? (completed / total) * 100 : 0,
      isProcessing: this.isProcessing,
      isPaused: this.isPaused
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
      batchProcessed: true
    };
    
    const key = `whisper_${projectId}`;
    localStorage.setItem(key, JSON.stringify(projectData));
  }
  
  /**
   * 匯出批次結果
   */
  exportResults(format = 'json') {
    if (this.results.length === 0) {
      notify.warning('沒有可匯出的結果');
      return;
    }
    
    let content;
    let mimeType;
    let fileName;
    
    switch (format) {
      case 'json':
        content = JSON.stringify(this.results, null, 2);
        mimeType = 'application/json';
        fileName = `batch_results_${new Date().toISOString().slice(0, 10)}.json`;
        break;
        
      case 'csv':
        content = this.resultsToCSV();
        mimeType = 'text/csv';
        fileName = `batch_results_${new Date().toISOString().slice(0, 10)}.csv`;
        break;
        
      case 'txt':
        content = this.resultsToText();
        mimeType = 'text/plain';
        fileName = `batch_results_${new Date().toISOString().slice(0, 10)}.txt`;
        break;
        
      default:
        throw new Error(`不支援的匯出格式：${format}`);
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    
    notify.success('批次結果已匯出');
  }
  
  /**
   * 轉換結果為 CSV
   */
  resultsToCSV() {
    const headers = ['檔案名稱', '檔案大小', '處理時間(秒)', '音訊時長(秒)', '處理策略', '轉譯文字'];
    const rows = [headers];
    
    this.results.forEach(result => {
      rows.push([
        result.fileName,
        result.fileSize,
        (result.processingTime / 1000).toFixed(2),
        result.duration.toFixed(2),
        result.processingStrategy,
        `"${result.text.replace(/"/g, '""')}"`
      ]);
    });
    
    return rows.map(row => row.join(',')).join('\n');
  }
  
  /**
   * 轉換結果為純文字
   */
  resultsToText() {
    let text = '批次轉譯結果\n';
    text += '=' .repeat(50) + '\n\n';
    
    this.results.forEach((result, index) => {
      text += `檔案 ${index + 1}: ${result.fileName}\n`;
      text += '-'.repeat(30) + '\n';
      text += result.text + '\n\n';
      text += '=' .repeat(50) + '\n\n';
    });
    
    return text;
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

// 匯出單例
export const createBatchProcessor = (whisperAPI) => new BatchProcessor(whisperAPI);