/**
 * Model Preloader for WASM
 * 模型預載入管理器 - 優化 WASM 載入效能
 */

const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

export class ModelPreloader {
  constructor() {
    this.preloadQueue = [];
    this.loadedModels = new Map();
    this.currentPreload = null;
    this.preloadProgress = new Map();
    this.subscribers = new Set();
    this.isPreloading = false;
    
    // 預載入策略配置
    this.config = {
      autoPreload: true,              // 自動預載入
      preloadOnIdle: true,           // 空閒時預載入
      preloadPriority: ['tiny', 'base', 'small'], // 預載入優先順序
      maxConcurrent: 1,              // 最大並行載入數
      cacheExpiry: 7 * 24 * 60 * 60 * 1000, // 快取過期時間 (7天)
      memoryThreshold: 0.8           // 記憶體使用閾值
    };
    
    // IndexedDB 配置
    this.dbName = 'WhisperModelsCache';
    this.dbVersion = 1;
    this.storeName = 'models';
    this.db = null;
    
    // 延遲初始化
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      // 使用 setTimeout 確保其他模組先初始化
      setTimeout(() => this.init(), 0);
    }
  }
  
  /**
   * 初始化預載入管理器
   */
  async init() {
    try {
      // 初始化 IndexedDB
      await this.initDatabase();
      
      // 檢查快取的模型
      await this.checkCachedModels();
      
      // 設定空閒時預載入
      if (this.config.autoPreload && this.config.preloadOnIdle) {
        this.setupIdlePreload();
      }
      
      // 監聽網路狀態
      this.setupNetworkListener();
      
      DEBUG && console.log('ModelPreloader 初始化完成');
    } catch (error) {
      DEBUG && console.error('ModelPreloader 初始化失敗:', error);
    }
  }
  
  /**
   * 初始化 IndexedDB
   */
  async initDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'name' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  /**
   * 檢查已快取的模型
   */
  async checkCachedModels() {
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const request = store.getAll();
    
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const models = request.result;
        const now = Date.now();
        
        models.forEach(model => {
          // 檢查是否過期
          if (now - model.timestamp < this.config.cacheExpiry) {
            this.loadedModels.set(model.name, {
              data: model.data,
              size: model.size,
              timestamp: model.timestamp,
              cached: true
            });
            DEBUG && console.log(`從快取載入模型: ${model.name}`);
          }
        });
        resolve();
      };
    });
  }
  
  /**
   * 設定空閒時預載入
   */
  setupIdlePreload() {
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        if (this.config.autoPreload && !this.isPreloading) {
          this.startAutoPreload();
        }
      }, { timeout: 5000 });
    } else {
      // 降級方案：延遲 5 秒開始
      setTimeout(() => {
        if (this.config.autoPreload && !this.isPreloading) {
          this.startAutoPreload();
        }
      }, 5000);
    }
  }
  
  /**
   * 設定網路狀態監聽
   */
  setupNetworkListener() {
    window.addEventListener('online', () => {
      DEBUG && console.log('網路已連線，恢復預載入');
      if (this.currentPreload && this.currentPreload.paused) {
        this.resumePreload();
      }
    });
    
    window.addEventListener('offline', () => {
      DEBUG && console.log('網路已斷線，暫停預載入');
      if (this.currentPreload) {
        this.pausePreload();
      }
    });
  }
  
  /**
   * 開始自動預載入
   */
  async startAutoPreload() {
    DEBUG && console.log('開始自動預載入模型');
    
    for (const modelName of this.config.preloadPriority) {
      if (!this.loadedModels.has(modelName)) {
        await this.preloadModel(modelName, { priority: 'low' });
      }
    }
  }
  
  /**
   * 預載入指定模型
   * @param {string} modelName - 模型名稱
   * @param {Object} options - 預載入選項
   */
  async preloadModel(modelName, options = {}) {
    const { priority = 'normal', onProgress, onComplete, onError } = options;
    
    // 檢查是否已載入
    if (this.loadedModels.has(modelName)) {
      DEBUG && console.log(`模型 ${modelName} 已載入`);
      onComplete && onComplete(this.loadedModels.get(modelName));
      return this.loadedModels.get(modelName);
    }
    
    // 檢查記憶體
    if (!this.checkMemoryAvailable()) {
      const error = new Error('記憶體不足，無法預載入模型');
      onError && onError(error);
      throw error;
    }
    
    // 加入預載入佇列
    const preloadTask = {
      modelName,
      priority,
      onProgress,
      onComplete,
      onError,
      status: 'pending'
    };
    
    if (priority === 'high') {
      this.preloadQueue.unshift(preloadTask);
    } else {
      this.preloadQueue.push(preloadTask);
    }
    
    // 開始處理佇列
    this.processQueue();
    
    // 返回 Promise
    return new Promise((resolve, reject) => {
      preloadTask.promise = { resolve, reject };
    });
  }
  
  /**
   * 處理預載入佇列
   */
  async processQueue() {
    if (this.isPreloading || this.preloadQueue.length === 0) {
      return;
    }
    
    this.isPreloading = true;
    const task = this.preloadQueue.shift();
    this.currentPreload = task;
    
    try {
      task.status = 'loading';
      const modelData = await this.loadModelData(task.modelName, task.onProgress);
      
      // 儲存到記憶體和 IndexedDB
      await this.saveModel(task.modelName, modelData);
      
      task.status = 'completed';
      task.onComplete && task.onComplete(modelData);
      task.promise && task.promise.resolve(modelData);
      
    } catch (error) {
      task.status = 'error';
      task.onError && task.onError(error);
      task.promise && task.promise.reject(error);
      DEBUG && console.error(`預載入模型 ${task.modelName} 失敗:`, error);
      
    } finally {
      this.currentPreload = null;
      this.isPreloading = false;
      
      // 繼續處理下一個
      if (this.preloadQueue.length > 0) {
        this.processQueue();
      }
    }
  }
  
  /**
   * 載入模型資料
   * @param {string} modelName - 模型名稱
   * @param {Function} onProgress - 進度回調
   */
  async loadModelData(modelName, onProgress) {
    // 這裡應該調用實際的模型載入邏輯
    // 現在使用模擬載入
    DEBUG && console.log(`開始載入模型: ${modelName}`);
    
    // 模擬載入進度
    const totalSize = this.getModelSize(modelName);
    let loaded = 0;
    
    return new Promise((resolve) => {
      const interval = setInterval(() => {
        loaded += totalSize / 20; // 模擬 20 步載入
        const progress = Math.min(loaded / totalSize * 100, 100);
        
        this.updateProgress(modelName, progress);
        onProgress && onProgress({ 
          percent: progress, 
          loaded, 
          total: totalSize 
        });
        
        if (progress >= 100) {
          clearInterval(interval);
          resolve({
            name: modelName,
            data: new ArrayBuffer(totalSize), // 模擬資料
            size: totalSize,
            timestamp: Date.now()
          });
        }
      }, 100);
    });
  }
  
  /**
   * 儲存模型到快取
   */
  async saveModel(modelName, modelData) {
    // 儲存到記憶體
    this.loadedModels.set(modelName, modelData);
    
    // 儲存到 IndexedDB
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.put(modelData);
      request.onsuccess = () => {
        DEBUG && console.log(`模型 ${modelName} 已儲存到快取`);
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  /**
   * 檢查記憶體是否充足
   */
  checkMemoryAvailable() {
    if (!('memory' in performance)) {
      return true; // 無法檢查，假設可用
    }
    
    const memory = performance.memory;
    const usageRatio = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    
    return usageRatio < this.config.memoryThreshold;
  }
  
  /**
   * 獲取模型大小
   */
  getModelSize(modelName) {
    const sizes = {
      tiny: 75 * 1024 * 1024,
      base: 142 * 1024 * 1024,
      small: 466 * 1024 * 1024
    };
    return sizes[modelName] || 100 * 1024 * 1024;
  }
  
  /**
   * 更新進度
   */
  updateProgress(modelName, progress) {
    this.preloadProgress.set(modelName, progress);
    this.notifySubscribers('progress', { modelName, progress });
  }
  
  /**
   * 暫停預載入
   */
  pausePreload() {
    if (this.currentPreload) {
      this.currentPreload.paused = true;
      this.notifySubscribers('paused', this.currentPreload);
    }
  }
  
  /**
   * 恢復預載入
   */
  resumePreload() {
    if (this.currentPreload && this.currentPreload.paused) {
      this.currentPreload.paused = false;
      this.notifySubscribers('resumed', this.currentPreload);
      this.processQueue();
    }
  }
  
  /**
   * 取消預載入
   */
  cancelPreload(modelName) {
    // 從佇列中移除
    this.preloadQueue = this.preloadQueue.filter(task => task.modelName !== modelName);
    
    // 如果正在載入，標記為取消
    if (this.currentPreload && this.currentPreload.modelName === modelName) {
      this.currentPreload.cancelled = true;
    }
    
    this.notifySubscribers('cancelled', { modelName });
  }
  
  /**
   * 清理快取
   */
  async clearCache() {
    // 清理記憶體
    this.loadedModels.clear();
    
    // 清理 IndexedDB
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve) => {
      const request = store.clear();
      request.onsuccess = () => {
        DEBUG && console.log('模型快取已清理');
        resolve();
      };
    });
  }
  
  /**
   * 訂閱預載入事件
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }
  
  /**
   * 通知訂閱者
   */
  notifySubscribers(event, data) {
    this.subscribers.forEach(callback => {
      callback({ event, data });
    });
  }
  
  /**
   * 獲取預載入狀態
   */
  getStatus() {
    return {
      isPreloading: this.isPreloading,
      currentPreload: this.currentPreload,
      queueLength: this.preloadQueue.length,
      loadedModels: Array.from(this.loadedModels.keys()),
      progress: Object.fromEntries(this.preloadProgress)
    };
  }
  
  /**
   * 設定配置
   */
  setConfig(config) {
    this.config = { ...this.config, ...config };
  }
}

// 創建單例
export const modelPreloader = new ModelPreloader();