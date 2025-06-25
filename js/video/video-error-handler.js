// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

// 視訊錯誤處理和回復策略模組
import VideoConfig from './video-config.js';

export class VideoErrorHandler {
  constructor() {
    this.retryAttempts = new Map();
    this.memoryMonitor = null;
    this.errorHistory = [];
    this.maxRetries = 3;
    this.baseRetryDelay = 1000; // 1秒
    this.memoryCheckInterval = 5000; // 5秒
    this.memoryWarningThreshold = 0.85; // 85% 記憶體使用率警告
    this.memoryCriticalThreshold = 0.95; // 95% 記憶體使用率危險
  }

  // 開始記憶體監控
  startMemoryMonitoring() {
    if (!performance.memory) {
      DEBUG && console.warn('記憶體監控不可用（需要 Chrome 並啟用 --enable-precise-memory-info）');
      return;
    }

    this.stopMemoryMonitoring();

    this.memoryMonitor = setInterval(() => {
      const memInfo = this.getMemoryInfo();
      if (memInfo.usage > this.memoryCriticalThreshold) {
        this.handleCriticalMemory(memInfo);
      } else if (memInfo.usage > this.memoryWarningThreshold) {
        this.handleHighMemory(memInfo);
      }
    }, this.memoryCheckInterval);
  }

  // 停止記憶體監控
  stopMemoryMonitoring() {
    if (this.memoryMonitor) {
      clearInterval(this.memoryMonitor);
      this.memoryMonitor = null;
    }
  }

  // 取得記憶體資訊
  getMemoryInfo() {
    if (!performance.memory) {
      return { available: false };
    }

    const used = performance.memory.usedJSHeapSize;
    const total = performance.memory.jsHeapSizeLimit;
    const usage = used / total;

    return {
      available: true,
      used: used,
      total: total,
      usage: usage,
      usedMB: (used / 1024 / 1024).toFixed(2),
      totalMB: (total / 1024 / 1024).toFixed(2),
      usagePercent: (usage * 100).toFixed(1)
    };
  }

  // 處理高記憶體使用
  handleHighMemory(memInfo) {
    DEBUG && console.warn(`⚠️ 記憶體使用率高: ${memInfo.usagePercent}%`);
    this.dispatchEvent('memory:warning', {
      message: `記憶體使用率達到 ${memInfo.usagePercent}%`,
      memoryInfo: memInfo,
      suggestion: '建議關閉其他分頁或應用程式'
    });
  }

  // 處理危險記憶體使用
  handleCriticalMemory(memInfo) {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error(`🚨 記憶體使用率危險: ${memInfo.usagePercent}%`);
    this.dispatchEvent('memory:critical', {
      message: `記憶體使用率達到 ${memInfo.usagePercent}%，可能導致崩潰`,
      memoryInfo: memInfo,
      suggestion: '立即釋放記憶體或使用較小的檔案'
    });
  }

  // 處理串流載入錯誤
  async handleStreamingError(error, file, options = {}) {
    const errorId = `streaming_${file.name}_${Date.now()}`;

    // 記錄錯誤
    this.recordError({
      id: errorId,
      type: 'streaming',
      error: error,
      file: {
        name: file.name,
        size: file.size,
        type: file.type
      },
      timestamp: new Date().toISOString(),
      memoryInfo: this.getMemoryInfo()
    });

    // 取得重試次數
    const retryCount = this.retryAttempts.get(file.name) || 0;

    // 分析錯誤類型
    const errorAnalysis = this.analyzeError(error);

    DEBUG && console.log('錯誤分析:', errorAnalysis);

    // 根據錯誤類型決定策略
    if (errorAnalysis.isRetryable && retryCount < this.maxRetries) {
      // 可重試的錯誤
      return await this.retryWithBackoff(file, retryCount, options);
    } else if (errorAnalysis.isFallbackable) {
      // 可回退的錯誤
      return await this.suggestFallbackStrategy(file, errorAnalysis);
    } else {
      // 無法處理的錯誤
      return this.handleFatalError(file, error, errorAnalysis);
    }
  }

  // 分析錯誤類型
  analyzeError(error) {
    const errorMessage = error.message || error.toString();

    return {
      isNetworkError: errorMessage.includes('network') || errorMessage.includes('fetch'),
      isMemoryError: errorMessage.includes('memory') || errorMessage.includes('Memory'),
      isFormatError: errorMessage.includes('format') || errorMessage.includes('codec'),
      isTimeoutError: errorMessage.includes('timeout') || errorMessage.includes('Timeout'),
      isQuotaError: errorMessage.includes('quota') || errorMessage.includes('QuotaExceeded'),
      isRetryable: this.isRetryableError(errorMessage),
      isFallbackable: this.isFallbackableError(errorMessage),
      originalError: error
    };
  }

  // 判斷是否可重試
  isRetryableError(errorMessage) {
    const retryablePatterns = [
      'network',
      'timeout',
      'fetch',
      'abort',
      'ECONNRESET',
      'ETIMEDOUT'
    ];

    return retryablePatterns.some(pattern =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  // 判斷是否可回退
  isFallbackableError(errorMessage) {
    const fallbackablePatterns = [
      'memory',
      'quota',
      'format',
      'codec',
      'MediaSource'
    ];

    return fallbackablePatterns.some(pattern =>
      errorMessage.toLowerCase().includes(pattern.toLowerCase())
    );
  }

  // 使用指數退避重試
  async retryWithBackoff(file, retryCount, options) {
    const delay = this.baseRetryDelay * Math.pow(2, retryCount);

    DEBUG && console.log(`🔄 重試第 ${retryCount + 1} 次，延遲 ${delay}ms`);

    // 更新重試次數
    this.retryAttempts.set(file.name, retryCount + 1);

    // 發送重試事件
    this.dispatchEvent('error:retry', {
      file: file.name,
      attempt: retryCount + 1,
      maxAttempts: this.maxRetries,
      delay: delay
    });

    // 等待延遲
    await new Promise(resolve => setTimeout(resolve, delay));

    // 返回重試建議
    return {
      action: 'retry',
      attempt: retryCount + 1,
      options: {
        ...options,
        // 可能的優化選項
        chunkSize: this.getReducedChunkSize(options.chunkSize, retryCount),
        timeout: this.getIncreasedTimeout(options.timeout, retryCount)
      }
    };
  }

  // 建議回退策略
  async suggestFallbackStrategy(file, errorAnalysis) {
    const strategies = [];

    // 根據錯誤類型建議不同策略
    if (errorAnalysis.isMemoryError || errorAnalysis.isQuotaError) {
      strategies.push({
        name: 'reducedChunkSize',
        description: '減少串流分塊大小',
        options: { chunkSize: 256 * 1024 } // 256KB
      });

      strategies.push({
        name: 'partialLoading',
        description: '只載入部分視訊',
        options: {
          partial: true,
          startTime: 0,
          duration: 60 // 只載入前60秒
        }
      });
    }

    if (errorAnalysis.isFormatError) {
      strategies.push({
        name: 'transcoding',
        description: '建議轉換視訊格式',
        instructions: this.getTranscodingInstructions(file)
      });
    }

    // 如果檔案小於2GB，建議傳統載入
    if (file.size <= 2 * 1024 * 1024 * 1024) {
      strategies.push({
        name: 'traditional',
        description: '使用傳統載入方式',
        options: { useStreaming: false }
      });
    }

    return {
      action: 'fallback',
      strategies: strategies,
      recommendation: strategies[0] // 推薦第一個策略
    };
  }

  // 處理致命錯誤
  handleFatalError(file, error, errorAnalysis) {
    const suggestions = [];

    // 根據檔案大小提供建議
    if (file.size > 4 * 1024 * 1024 * 1024) { // >4GB
      suggestions.push('檔案過大，建議分割成較小的片段');
      suggestions.push('使用視訊編輯軟體減少解析度或位元率');
    }

    // 根據錯誤類型提供建議
    if (errorAnalysis.isFormatError) {
      suggestions.push('視訊格式可能不受支援');
      suggestions.push(this.getTranscodingInstructions(file));
    }

    if (errorAnalysis.isMemoryError) {
      suggestions.push('關閉其他應用程式釋放記憶體');
      suggestions.push('嘗試使用其他瀏覽器');
      suggestions.push('重新啟動瀏覽器');
    }

    return {
      action: 'fatal',
      error: error.message,
      suggestions: suggestions,
      diagnostics: this.collectDiagnostics()
    };
  }

  // 取得轉碼指令
  getTranscodingInstructions(file) {
    const extension = file.name.split('.').pop().toLowerCase();

    return `使用 FFmpeg 轉換視訊格式：
ffmpeg -i "${file.name}" -movflags faststart -c:v libx264 -crf 23 -c:a aac -b:a 128k output.mp4

參數說明：
-movflags faststart: 優化串流播放
-c:v libx264: 使用 H.264 編碼（相容性最佳）
-crf 23: 品質設定（0-51，越低品質越好）
-c:a aac: 音訊使用 AAC 編碼
-b:a 128k: 音訊位元率`;
  }

  // 取得減少的分塊大小
  getReducedChunkSize(currentSize, retryCount) {
    const defaultSize = VideoConfig.streaming?.chunkSize || 1024 * 1024;
    const minSize = 64 * 1024; // 最小 64KB

    const reducedSize = Math.max(
      minSize,
      Math.floor(currentSize || defaultSize / Math.pow(2, retryCount + 1))
    );

    DEBUG && console.log(`減少分塊大小: ${this.formatBytes(currentSize || defaultSize)} → ${this.formatBytes(reducedSize)}`);

    return reducedSize;
  }

  // 取得增加的超時時間
  getIncreasedTimeout(currentTimeout, retryCount) {
    const defaultTimeout = 30000; // 30秒
    const maxTimeout = 300000; // 5分鐘

    const increasedTimeout = Math.min(
      maxTimeout,
      (currentTimeout || defaultTimeout) * (retryCount + 2)
    );

    DEBUG && console.log(`增加超時時間: ${(currentTimeout || defaultTimeout) / 1000}秒 → ${increasedTimeout / 1000}秒`);

    return increasedTimeout;
  }

  // 收集診斷資訊
  collectDiagnostics() {
    return {
      browser: navigator.userAgent,
      memory: this.getMemoryInfo(),
      errorHistory: this.errorHistory.slice(-5), // 最近5個錯誤
      supportedFormats: this.checkSupportedFormats(),
      timestamp: new Date().toISOString()
    };
  }

  // 檢查支援的格式
  checkSupportedFormats() {
    const video = document.createElement('video');
    const formats = {
      'MP4': video.canPlayType('video/mp4'),
      'WebM': video.canPlayType('video/webm'),
      'Ogg': video.canPlayType('video/ogg'),
      'MSE': 'MediaSource' in window
    };

    return formats;
  }

  // 記錄錯誤
  recordError(errorInfo) {
    this.errorHistory.push(errorInfo);

    // 保持歷史記錄在合理範圍
    if (this.errorHistory.length > 20) {
      this.errorHistory = this.errorHistory.slice(-20);
    }
  }

  // 清除重試記錄
  clearRetryAttempts(fileName) {
    this.retryAttempts.delete(fileName);
  }

  // 格式化位元組
  formatBytes(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
  }

  // 發送自定義事件
  dispatchEvent(type, detail) {
    const event = new CustomEvent(type, { detail });
    document.dispatchEvent(event);
  }

  // 生成錯誤報告
  generateErrorReport() {
    return {
      timestamp: new Date().toISOString(),
      diagnostics: this.collectDiagnostics(),
      errorHistory: this.errorHistory,
      retryAttempts: Array.from(this.retryAttempts.entries())
    };
  }

  // 清理
  destroy() {
    this.stopMemoryMonitoring();
    this.retryAttempts.clear();
    this.errorHistory = [];
  }
}

// 創建單例
const videoErrorHandler = new VideoErrorHandler();
export default videoErrorHandler;
