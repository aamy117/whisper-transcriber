/**
 * 記憶體管理器
 * 用於檢查可用記憶體和預防記憶體溢出
 */

export class MemoryManager {
  /**
   * 檢查可用記憶體（MB）
   */
  static checkAvailableMemory() {
    if ('memory' in performance) {
      const memory = performance.memory;
      const available = memory.jsHeapSizeLimit - memory.usedJSHeapSize;
      return Math.floor(available / 1024 / 1024); // 轉換為 MB
    }
    
    // 瀏覽器不支援時，根據 deviceMemory 估算
    if ('deviceMemory' in navigator) {
      const deviceMemory = navigator.deviceMemory * 1024; // GB 轉 MB
      const estimatedUsed = 512; // 假設已使用 512MB
      return Math.max(deviceMemory - estimatedUsed, 1024); // 至少回傳 1GB
    }
    
    // 完全無法檢測時，保守估計
    return 2048; // 2GB
  }

  /**
   * 估算音訊檔案解碼後的記憶體需求（MB）
   */
  static estimateAudioMemory(fileSizeMB, format = 'unknown') {
    let multiplier;
    
    switch (format.toLowerCase()) {
      case 'mp3':
        multiplier = 10; // MP3 壓縮率約 1:10
        break;
      case 'wav':
        multiplier = 1.2; // WAV 基本無壓縮
        break;
      case 'm4a':
      case 'aac':
        multiplier = 8; // AAC 壓縮率約 1:8
        break;
      case 'flac':
        multiplier = 2; // FLAC 無損壓縮
        break;
      case 'ogg':
        multiplier = 9; // OGG 壓縮率約 1:9
        break;
      default:
        multiplier = 12; // 保守估計
    }
    
    // 加上處理過程中的額外記憶體需求
    const decodedSize = fileSizeMB * multiplier;
    const processingOverhead = decodedSize * 0.5; // 50% 處理開銷
    
    return Math.ceil(decodedSize + processingOverhead);
  }

  /**
   * 檢查是否可以安全處理檔案
   */
  static canProcessFile(fileSizeMB, format = 'unknown') {
    const available = this.checkAvailableMemory();
    const required = this.estimateAudioMemory(fileSizeMB, format);
    const safetyBuffer = 500; // 500MB 安全緩衝
    
    const result = {
      canProcess: available > (required + safetyBuffer),
      available: available,
      required: required,
      safetyBuffer: safetyBuffer,
      recommendation: ''
    };
    
    if (result.canProcess) {
      result.recommendation = '可以安全處理';
    } else if (available > required) {
      result.recommendation = '記憶體緊張，建議關閉其他頁面';
    } else {
      result.recommendation = '記憶體不足，建議使用 API 轉譯或分割檔案';
    }
    
    return result;
  }

  /**
   * 計算最佳分段大小（MB）
   */
  static calculateOptimalChunkSize(fileSizeMB, format = 'unknown') {
    const available = this.checkAvailableMemory();
    const safetyBuffer = 500;
    const usableMemory = available - safetyBuffer;
    
    // 單個分段不應超過可用記憶體的 30%
    const maxChunkMemory = usableMemory * 0.3;
    
    // 根據格式反推檔案大小
    const multiplier = this.getFormatMultiplier(format);
    const maxChunkFileSize = Math.floor(maxChunkMemory / multiplier);
    
    // 確保分段大小在合理範圍內
    return Math.max(Math.min(maxChunkFileSize, 50), 10); // 10-50MB
  }

  /**
   * 獲取格式壓縮倍數
   */
  static getFormatMultiplier(format) {
    const multipliers = {
      'mp3': 10,
      'wav': 1.2,
      'm4a': 8,
      'aac': 8,
      'flac': 2,
      'ogg': 9
    };
    
    return multipliers[format.toLowerCase()] || 12;
  }

  /**
   * 監控記憶體使用情況
   */
  static startMemoryMonitoring(callback, interval = 5000) {
    const monitor = setInterval(() => {
      const available = this.checkAvailableMemory();
      const usage = this.getMemoryUsage();
      
      callback({
        available: available,
        used: usage.used,
        total: usage.total,
        percentage: Math.round((usage.used / usage.total) * 100),
        timestamp: new Date().toISOString()
      });
      
      // 記憶體不足警告
      if (available < 300) {
        console.warn('記憶體不足警告:', available + 'MB');
      }
    }, interval);
    
    return monitor; // 返回 interval ID 用於清理
  }

  /**
   * 停止記憶體監控
   */
  static stopMemoryMonitoring(monitorId) {
    if (monitorId) {
      clearInterval(monitorId);
    }
  }

  /**
   * 獲取詳細記憶體使用資訊
   */
  static getMemoryUsage() {
    if ('memory' in performance) {
      const memory = performance.memory;
      return {
        used: Math.floor(memory.usedJSHeapSize / 1024 / 1024),
        total: Math.floor(memory.jsHeapSizeLimit / 1024 / 1024),
        peak: Math.floor(memory.totalJSHeapSize / 1024 / 1024)
      };
    }
    
    return {
      used: 0,
      total: this.checkAvailableMemory() + 500, // 估算
      peak: 0
    };
  }

  /**
   * 強制垃圾回收（如果可用）
   */
  static forceGarbageCollection() {
    // 嘗試觸發垃圾回收
    if (window.gc) {
      window.gc(); // Chrome with --enable-precise-memory-info
    } else {
      // 創建和釋放大量物件來觸發 GC
      const temp = new Array(1000000).fill(0);
      temp.length = 0;
    }
  }

  /**
   * 記憶體警告回調
   */
  static onMemoryWarning(callback) {
    // 監聽記憶體壓力事件（如果支援）
    if ('onmemorywarning' in window) {
      window.addEventListener('memorywarning', callback);
    }
    
    // 定期檢查記憶體狀況
    const checker = setInterval(() => {
      const available = this.checkAvailableMemory();
      if (available < 200) {
        callback({
          type: 'low-memory',
          available: available,
          timestamp: Date.now()
        });
      }
    }, 10000); // 每 10 秒檢查一次
    
    return checker;
  }

  /**
   * 獲取記憶體資訊摘要
   */
  static getMemorySummary() {
    const usage = this.getMemoryUsage();
    const available = this.checkAvailableMemory();
    
    return {
      available: available + 'MB',
      used: usage.used + 'MB',
      total: usage.total + 'MB',
      percentage: Math.round((usage.used / usage.total) * 100) + '%',
      status: available > 1000 ? 'good' : available > 500 ? 'warning' : 'critical',
      deviceMemory: navigator.deviceMemory ? navigator.deviceMemory + 'GB' : 'unknown'
    };
  }
}

// 全域匯出
if (typeof window !== 'undefined') {
  window.MemoryManager = MemoryManager;
}