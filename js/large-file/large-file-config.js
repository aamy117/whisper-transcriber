/**
 * 大檔案處理系統配置管理
 * 
 * 這個模組管理所有的功能開關和配置參數
 * 支援運行時動態調整和 localStorage 持久化
 */

// 預設配置
const defaultConfig = {
  // 主功能開關
  enabled: false,  // 預設關閉，需要明確啟用
  
  // 檔案大小閾值
  thresholdMB: 100,  // 超過此大小的檔案使用新系統處理
  maxFileSizeMB: 2048,  // 最大支援 2GB
  
  // 功能開關
  features: {
    streaming: true,           // 串流處理
    parallelProcessing: true,  // 並行處理
    checkpoints: true,         // 檢查點恢復
    smartCache: true,          // 智慧快取
    memoryMonitoring: true,    // 記憶體監控
    autoOptimization: true     // 自動效能優化
  },
  
  // 並行處理配置
  parallel: {
    maxWorkers: navigator.hardwareConcurrency || 4,  // 最大 Worker 數量
    workerTimeout: 300000,     // Worker 超時時間 (5分鐘)
    taskQueueSize: 100,        // 任務佇列大小
    retryAttempts: 3,          // 重試次數
    concurrentSegments: 4      // 同時處理的分段數
  },
  
  // 並行處理進階配置
  parallelProcessing: {
    maxWorkers: navigator.hardwareConcurrency || 4,
    minWorkers: 2,             // 最小 Worker 數量
    taskTimeout: 300000,       // 任務超時時間 (5分鐘)
    idleTimeout: 60000,        // Worker 閒置超時 (1分鐘)
    autoScale: true,           // 自動擴縮容
    loadBalancing: 'roundRobin', // 負載平衡策略: 'roundRobin', 'leastBusy', 'random'
    workerType: 'auto'         // Worker 類型: 'auto', 'wasm', 'api'
  },
  
  // 錯誤處理配置
  errorHandling: {
    retryConfig: {
      maxRetries: 3,
      retryDelay: 1000,        // 重試延遲 (ms)
      backoffMultiplier: 2     // 退避乘數
    },
    fallbackStrategy: 'skip', // 'skip', 'retry', 'manual'
    errorThreshold: 0.1        // 錯誤率閾值 (10%)
  },
  
  // 記憶體管理配置
  memory: {
    maxMemoryUsageMB: 200,     // 最大記憶體使用量
    memoryCheckInterval: 1000, // 記憶體檢查間隔 (ms)
    gcThresholdMB: 150,        // 觸發垃圾回收的閾值
    bufferSizeMB: 50          // 緩衝區大小
  },
  
  // 分割策略配置
  splitting: {
    defaultChunkSizeMB: 25,    // 預設分段大小
    minChunkSizeMB: 10,        // 最小分段大小
    maxChunkSizeMB: 50,        // 最大分段大小
    overlapDuration: 2,        // 重疊時長 (秒)
    silenceThreshold: -50,     // 靜音閾值 (dB)
    minSilenceDuration: 0.5    // 最小靜音時長 (秒)
  },
  
  // 快取配置
  cache: {
    enabled: true,
    strategy: 'lru',           // 快取策略: 'lru', 'fifo', 'lfu'
    maxSizeMB: 500,           // 最大快取大小
    ttl: 86400000,            // 快取過期時間 (24小時)
    compressionEnabled: true   // 啟用壓縮
  },
  
  // 效能優化配置
  optimization: {
    adaptiveChunkSize: true,   // 自適應分段大小
    dynamicWorkerCount: true,  // 動態調整 Worker 數量
    priorityQueue: true,       // 優先級佇列
    prefetch: true            // 預取下一段
  },
  
  // A/B 測試配置
  rollout: {
    percentage: 0,            // 啟用百分比 (0-100)
    userGroups: [],           // 特定用戶群組
    betaUsers: []            // Beta 測試用戶列表
  },
  
  // 監控和日誌配置
  monitoring: {
    enabled: true,
    logLevel: 'info',         // 'debug', 'info', 'warn', 'error'
    metricsEnabled: true,
    errorReporting: true,
    performanceTracking: true
  }
};

/**
 * 配置管理器類別
 */
export class LargeFileConfig {
  constructor() {
    this.config = { ...defaultConfig };
    this.storageKey = 'largeFileProcessingConfig';
    this.listeners = new Map();
    
    // 載入已儲存的配置
    this.loadConfig();
    
    // 監聽 storage 事件（跨標籤同步）
    window.addEventListener('storage', this.handleStorageChange.bind(this));
  }
  
  /**
   * 載入配置
   */
  loadConfig() {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.config = this.mergeConfig(this.config, parsed);
      }
    } catch (error) {
      console.warn('載入配置失敗，使用預設配置', error);
    }
  }
  
  /**
   * 儲存配置
   */
  saveConfig() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.config));
      this.notifyListeners('save', this.config);
    } catch (error) {
      console.error('儲存配置失敗', error);
    }
  }
  
  /**
   * 合併配置（深度合併）
   */
  mergeConfig(target, source) {
    const merged = { ...target };
    
    for (const key in source) {
      if (source.hasOwnProperty(key)) {
        if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
          merged[key] = this.mergeConfig(target[key] || {}, source[key]);
        } else {
          merged[key] = source[key];
        }
      }
    }
    
    return merged;
  }
  
  /**
   * 獲取配置值
   */
  get(path) {
    const keys = path.split('.');
    let value = this.config;
    
    for (const key of keys) {
      if (value && typeof value === 'object' && key in value) {
        value = value[key];
      } else {
        return undefined;
      }
    }
    
    return value;
  }
  
  /**
   * 設定配置值
   */
  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    let target = this.config;
    
    for (const key of keys) {
      if (!(key in target) || typeof target[key] !== 'object') {
        target[key] = {};
      }
      target = target[key];
    }
    
    const oldValue = target[lastKey];
    target[lastKey] = value;
    
    this.saveConfig();
    this.notifyListeners('change', { path, oldValue, newValue: value });
  }
  
  /**
   * 重置配置
   */
  reset(path = null) {
    if (path) {
      const keys = path.split('.');
      const defaultValue = keys.reduce((obj, key) => obj?.[key], defaultConfig);
      this.set(path, defaultValue);
    } else {
      this.config = { ...defaultConfig };
      this.saveConfig();
      this.notifyListeners('reset', this.config);
    }
  }
  
  /**
   * 檢查是否應該使用新系統
   */
  shouldUseLargeFileSystem(file) {
    // 檢查主開關
    if (!this.config.enabled) {
      return false;
    }
    
    // 檢查檔案大小
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB < this.config.thresholdMB) {
      return false;
    }
    
    // 檢查 A/B 測試
    if (this.config.rollout.percentage > 0) {
      const randomValue = Math.random() * 100;
      if (randomValue > this.config.rollout.percentage) {
        return false;
      }
    }
    
    // 檢查用戶群組
    const userId = this.getUserId();
    if (this.config.rollout.betaUsers.includes(userId)) {
      return true;
    }
    
    return true;
  }
  
  /**
   * 獲取用戶 ID（用於 A/B 測試）
   */
  getUserId() {
    let userId = localStorage.getItem('userId');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('userId', userId);
    }
    return userId;
  }
  
  /**
   * 監聽配置變更
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    
    // 返回取消監聽的函數
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }
  
  /**
   * 通知監聽器
   */
  notifyListeners(event, data) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('配置監聽器執行錯誤', error);
        }
      });
    }
  }
  
  /**
   * 處理 storage 變更（跨標籤同步）
   */
  handleStorageChange(event) {
    if (event.key === this.storageKey && event.newValue) {
      try {
        const newConfig = JSON.parse(event.newValue);
        this.config = newConfig;
        this.notifyListeners('sync', this.config);
      } catch (error) {
        console.error('同步配置失敗', error);
      }
    }
  }
  
  /**
   * 獲取配置摘要（用於除錯）
   */
  getSummary() {
    return {
      enabled: this.config.enabled,
      thresholdMB: this.config.thresholdMB,
      features: Object.entries(this.config.features)
        .filter(([_, enabled]) => enabled)
        .map(([feature]) => feature),
      parallel: {
        maxWorkers: this.config.parallel.maxWorkers,
        concurrentSegments: this.config.parallel.concurrentSegments
      },
      memory: {
        maxUsageMB: this.config.memory.maxMemoryUsageMB
      },
      rollout: {
        percentage: this.config.rollout.percentage,
        betaUsers: this.config.rollout.betaUsers.length
      }
    };
  }
  
  /**
   * 匯出配置（用於備份）
   */
  export() {
    return JSON.stringify(this.config, null, 2);
  }
  
  /**
   * 匯入配置（從備份恢復）
   */
  import(configJson) {
    try {
      const imported = JSON.parse(configJson);
      this.config = this.mergeConfig(defaultConfig, imported);
      this.saveConfig();
      this.notifyListeners('import', this.config);
      return true;
    } catch (error) {
      console.error('匯入配置失敗', error);
      return false;
    }
  }
}

// 建立單例實例
let instance = null;

export const largeFileConfig = new LargeFileConfig();

// 獲取單例實例的方法
export function getInstance() {
  if (!instance) {
    instance = new LargeFileConfig();
  }
  return instance;
}

// 為了相容性，同時匯出類別的靜態方法
LargeFileConfig.getInstance = getInstance;

// 匯出預設配置供參考
export { defaultConfig };

// 開發模式下將配置暴露到全域（方便調試）
if (typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost') {
  window.largeFileConfig = largeFileConfig;
}