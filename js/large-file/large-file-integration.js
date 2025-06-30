// large-file-integration.js - 大檔案處理系統整合模組
// 將新的大檔案處理系統整合到現有的轉譯流程中

import { LargeFileController } from './large-file-controller.js';
import { largeFileConfig } from './large-file-config.js';
import { performanceOptimizer } from './performance-optimizer.js';
import { notify } from '../notification.js';
import { progressManager } from '../progress-manager.js';

export class LargeFileIntegration {
  constructor() {
    this.controller = new LargeFileController();
    this.isEnabled = false;
    this.progressControl = null;
  }

  // 初始化整合
  async initialize() {
    try {
      // 檢查功能開關
      this.isEnabled = await largeFileConfig.get('enabled');
      
      if (this.isEnabled) {
        // 初始化控制器的子系統
        await this.controller.initializeSubsystems();
        
        // 啟動效能監控
        await performanceOptimizer.startMonitoring();
        
        console.log('大檔案處理系統已啟用');
      } else {
        console.log('大檔案處理系統已停用');
      }
      
      return this.isEnabled;
    } catch (error) {
      console.error('大檔案處理系統初始化失敗:', error);
      this.isEnabled = false;
      return false;
    }
  }

  // 檢查是否應該使用大檔案處理系統
  shouldUseLargeFileSystem(file) {
    if (!this.isEnabled) return false;
    
    // 檢查檔案大小閾值
    const threshold = largeFileConfig.get('sizeThreshold');
    if (file.size < threshold) return false;
    
    // 檢查檔案格式
    const extension = file.name.split('.').pop().toLowerCase();
    const supportedFormats = ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'webm'];
    if (!supportedFormats.includes(extension)) return false;
    
    return true;
  }

  // 處理大檔案
  async processLargeFile(file, options = {}) {
    if (!this.shouldUseLargeFileSystem(file)) {
      throw new Error('檔案不適合使用大檔案處理系統');
    }

    const { cancellationToken, transcribeCallback } = options;

    try {
      // 顯示進度控制
      this.progressControl = progressManager.showProgress({
        title: '處理大檔案',
        message: `正在處理 ${file.name}...`,
        cancellable: true,
        onCancel: () => {
          if (cancellationToken) {
            cancellationToken.cancel();
          }
        }
      });

      // 建立處理選項
      const processOptions = {
        strategy: 'automatic', // 自動選擇最佳策略
        onProgress: (progress) => {
          this.updateProgress(progress);
        },
        onSegmentComplete: async (segment) => {
          // 當一個片段完成時，呼叫轉譯回調
          if (transcribeCallback) {
            return await transcribeCallback(segment);
          }
        },
        cancellationToken,
        transcribeCallback // 傳遞轉譯回調
      };

      // 執行處理
      const result = await this.controller.process(file, processOptions);

      // 處理完成
      notify.success('大檔案處理完成');
      
      return result;

    } catch (error) {
      console.error('大檔案處理失敗:', error);
      notify.error(`處理失敗: ${error.message}`);
      throw error;
    } finally {
      // 隱藏進度控制
      if (this.progressControl) {
        this.progressControl.close();
        this.progressControl = null;
      }
    }
  }

  // 更新進度
  updateProgress(progress) {
    if (!this.progressControl) return;

    const { phase, current, total, message } = progress;
    
    // 計算整體進度
    let overallProgress = 0;
    let statusMessage = message || '處理中...';

    switch (phase) {
      case 'analyzing':
        overallProgress = 10;
        statusMessage = '分析音訊格式...';
        break;
      case 'splitting':
        overallProgress = 10 + (current / total) * 20;
        statusMessage = `分割音訊: ${current}/${total}`;
        break;
      case 'processing':
        overallProgress = 30 + (current / total) * 60;
        statusMessage = `處理片段: ${current}/${total}`;
        break;
      case 'merging':
        overallProgress = 90 + (current / total) * 10;
        statusMessage = '合併結果...';
        break;
      case 'complete':
        overallProgress = 100;
        statusMessage = '處理完成';
        break;
    }

    this.progressControl.update(overallProgress, statusMessage);
  }

  // 取得處理統計
  async getStatistics() {
    if (!this.isEnabled) {
      return null;
    }

    const stats = {
      performance: performanceOptimizer.getMetricsSummary(),
      config: {
        enabled: largeFileConfig.get('enabled'),
        sizeThreshold: largeFileConfig.get('sizeThreshold'),
        workerCount: largeFileConfig.get('workerCount'),
        chunkSize: largeFileConfig.get('chunkSize'),
      },
      capabilities: {
        hasWASM: typeof WebAssembly !== 'undefined',
        hasWorker: typeof Worker !== 'undefined',
        hasIndexedDB: 'indexedDB' in window,
        hasPerformanceMemory: 'memory' in performance,
      }
    };

    return stats;
  }

  // 配置設定
  async configure(settings) {
    if (!settings) return;

    // 更新配置
    for (const [key, value] of Object.entries(settings)) {
      await largeFileConfig.set(key, value);
    }

    // 如果啟用狀態改變，重新初始化
    if ('enabled' in settings && settings.enabled !== this.isEnabled) {
      await this.initialize();
    }
  }

  // 清理資源
  async cleanup() {
    if (this.controller) {
      await this.controller.cleanup();
    }
    
    if (this.isEnabled) {
      performanceOptimizer.stopMonitoring();
    }
    
    this.progressControl = null;
  }

  // 取得處理建議
  getProcessingRecommendation(file) {
    if (!this.shouldUseLargeFileSystem(file)) {
      return {
        useNewSystem: false,
        reason: '檔案大小未達到使用新系統的閾值'
      };
    }

    const fileSizeMB = file.size / 1024 / 1024;
    const recommendation = {
      useNewSystem: true,
      estimatedTime: Math.ceil(fileSizeMB * 2), // 粗略估計：每 MB 2 秒
      estimatedSegments: Math.ceil(fileSizeMB / 5), // 假設每 5MB 一個片段
      benefits: []
    };

    // 列出使用新系統的好處
    if (fileSizeMB > 100) {
      recommendation.benefits.push('自動記憶體管理，避免瀏覽器崩潰');
      recommendation.benefits.push('斷點續傳，可暫停和恢復');
    }
    
    if (fileSizeMB > 50) {
      recommendation.benefits.push('並行處理，加快轉譯速度');
      recommendation.benefits.push('智慧快取，避免重複處理');
    }
    
    recommendation.benefits.push('進度追蹤，隨時了解處理狀態');
    recommendation.benefits.push('效能優化，自動調整處理參數');

    return recommendation;
  }
}

// 匯出單例
export const largeFileIntegration = new LargeFileIntegration();