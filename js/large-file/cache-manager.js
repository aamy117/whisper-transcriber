/**
 * 快取管理器
 * 負責管理音訊片段和轉譯結果的智慧快取
 */

import { LargeFileConfig } from './large-file-config.js';

export class CacheManager {
  constructor() {
    this.config = LargeFileConfig.getInstance();
    this.dbName = 'WhisperCacheDB';
    this.dbVersion = 1;
    this.audioStore = 'audioCache';
    this.resultStore = 'resultCache';
    this.metaStore = 'cacheMetadata';
    this.db = null;
    
    // 快取策略
    this.strategy = this.config.get('cache.strategy') || 'lru'; // lru, fifo, lfu
    this.maxSizeMB = this.config.get('cache.maxSizeMB') || 500;
    this.ttl = this.config.get('cache.ttl') || 86400000; // 24小時
    
    // 記憶體快取（用於熱資料）
    this.memoryCache = new Map();
    this.memoryCacheMaxSize = 50 * 1024 * 1024; // 50MB
    this.currentMemoryUsage = 0;
    
    // 統計資訊
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      writes: 0
    };
  }

  /**
   * 初始化 IndexedDB
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('快取資料庫開啟失敗:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('快取管理器初始化完成');
        this.startMaintenanceTask();
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 音訊快取儲存
        if (!db.objectStoreNames.contains(this.audioStore)) {
          const audioStore = db.createObjectStore(this.audioStore, { keyPath: 'id' });
          audioStore.createIndex('hash', 'hash', { unique: false });
          audioStore.createIndex('accessTime', 'accessTime', { unique: false });
          audioStore.createIndex('accessCount', 'accessCount', { unique: false });
          audioStore.createIndex('size', 'size', { unique: false });
          audioStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 結果快取儲存
        if (!db.objectStoreNames.contains(this.resultStore)) {
          const resultStore = db.createObjectStore(this.resultStore, { keyPath: 'id' });
          resultStore.createIndex('audioHash', 'audioHash', { unique: false });
          resultStore.createIndex('model', 'model', { unique: false });
          resultStore.createIndex('language', 'language', { unique: false });
          resultStore.createIndex('accessTime', 'accessTime', { unique: false });
          resultStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 快取元資料儲存
        if (!db.objectStoreNames.contains(this.metaStore)) {
          const metaStore = db.createObjectStore(this.metaStore, { keyPath: 'key' });
        }
      };
    });
  }

  /**
   * 產生快取鍵值
   */
  generateCacheKey(data, prefix = '') {
    const str = typeof data === 'string' ? data : JSON.stringify(data);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return `${prefix}${Math.abs(hash).toString(36)}`;
  }

  /**
   * 計算資料雜湊值
   */
  async calculateHash(data) {
    let buffer;
    if (data instanceof ArrayBuffer) {
      buffer = data;
    } else if (typeof data === 'string') {
      buffer = new TextEncoder().encode(data);
    } else {
      buffer = new TextEncoder().encode(JSON.stringify(data));
    }

    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * 儲存音訊片段到快取
   */
  async cacheAudioSegment(segmentId, audioData, metadata = {}) {
    const hash = await this.calculateHash(audioData);
    const size = audioData.byteLength;
    
    // 檢查容量
    if (!(await this.ensureCapacity(size))) {
      console.warn('快取空間不足，跳過儲存');
      return null;
    }

    const cacheEntry = {
      id: segmentId,
      hash: hash,
      data: audioData,
      size: size,
      metadata: metadata,
      accessTime: Date.now(),
      accessCount: 0,
      createdAt: Date.now()
    };

    // 先加入記憶體快取
    if (size < this.memoryCacheMaxSize / 10) { // 小於記憶體快取的10%
      this.addToMemoryCache(segmentId, cacheEntry);
    }

    // 儲存到 IndexedDB
    await this.saveToStore(this.audioStore, cacheEntry);
    this.stats.writes++;

    return segmentId;
  }

  /**
   * 從快取獲取音訊片段
   */
  async getAudioSegment(segmentId) {
    // 先檢查記憶體快取
    const memoryCached = this.memoryCache.get(segmentId);
    if (memoryCached) {
      this.stats.hits++;
      memoryCached.accessTime = Date.now();
      memoryCached.accessCount++;
      return memoryCached.data;
    }

    // 從 IndexedDB 獲取
    const cached = await this.getFromStore(this.audioStore, segmentId);
    if (cached) {
      this.stats.hits++;
      
      // 更新存取時間和次數
      cached.accessTime = Date.now();
      cached.accessCount++;
      await this.updateInStore(this.audioStore, cached);
      
      // 如果是熱資料，加入記憶體快取
      if (cached.accessCount > 2) {
        this.addToMemoryCache(segmentId, cached);
      }
      
      return cached.data;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * 儲存轉譯結果到快取
   */
  async cacheTranscriptionResult(audioHash, result, options = {}) {
    const { model = 'whisper-1', language = 'zh' } = options;
    const cacheId = `${audioHash}-${model}-${language}`;
    
    const cacheEntry = {
      id: cacheId,
      audioHash: audioHash,
      model: model,
      language: language,
      result: result,
      size: new Blob([JSON.stringify(result)]).size,
      accessTime: Date.now(),
      accessCount: 0,
      createdAt: Date.now()
    };

    // 檢查容量
    if (!(await this.ensureCapacity(cacheEntry.size))) {
      return null;
    }

    await this.saveToStore(this.resultStore, cacheEntry);
    this.stats.writes++;

    return cacheId;
  }

  /**
   * 從快取獲取轉譯結果
   */
  async getTranscriptionResult(audioHash, options = {}) {
    const { model = 'whisper-1', language = 'zh' } = options;
    const cacheId = `${audioHash}-${model}-${language}`;

    const cached = await this.getFromStore(this.resultStore, cacheId);
    if (cached) {
      this.stats.hits++;
      
      // 更新存取資訊
      cached.accessTime = Date.now();
      cached.accessCount++;
      await this.updateInStore(this.resultStore, cached);
      
      return cached.result;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * 加入記憶體快取
   */
  addToMemoryCache(key, entry) {
    // 檢查記憶體使用量
    if (this.currentMemoryUsage + entry.size > this.memoryCacheMaxSize) {
      this.evictFromMemoryCache(entry.size);
    }

    this.memoryCache.set(key, entry);
    this.currentMemoryUsage += entry.size;
  }

  /**
   * 從記憶體快取移除
   */
  evictFromMemoryCache(requiredSize) {
    const entries = Array.from(this.memoryCache.entries());
    
    // 根據策略排序
    switch (this.strategy) {
      case 'lru':
        entries.sort((a, b) => a[1].accessTime - b[1].accessTime);
        break;
      case 'lfu':
        entries.sort((a, b) => a[1].accessCount - b[1].accessCount);
        break;
      case 'fifo':
      default:
        entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
    }

    // 移除直到有足夠空間
    let freedSize = 0;
    for (const [key, entry] of entries) {
      this.memoryCache.delete(key);
      freedSize += entry.size;
      this.currentMemoryUsage -= entry.size;
      
      if (freedSize >= requiredSize) {
        break;
      }
    }
  }

  /**
   * 確保有足夠的儲存空間
   */
  async ensureCapacity(requiredSize) {
    const currentSize = await this.getCurrentCacheSize();
    const maxSize = this.maxSizeMB * 1024 * 1024;
    
    if (currentSize + requiredSize <= maxSize) {
      return true;
    }

    // 需要清理空間
    const sizeToFree = currentSize + requiredSize - maxSize;
    const freed = await this.evictEntries(sizeToFree);
    
    return freed >= sizeToFree;
  }

  /**
   * 根據策略移除項目
   */
  async evictEntries(sizeToFree) {
    let freedSize = 0;
    
    // 獲取所有項目並根據策略排序
    const audioEntries = await this.getAllFromStore(this.audioStore);
    const resultEntries = await this.getAllFromStore(this.resultStore);
    const allEntries = [...audioEntries, ...resultEntries];
    
    // 根據策略排序
    switch (this.strategy) {
      case 'lru':
        allEntries.sort((a, b) => a.accessTime - b.accessTime);
        break;
      case 'lfu':
        allEntries.sort((a, b) => a.accessCount - b.accessCount);
        break;
      case 'fifo':
      default:
        allEntries.sort((a, b) => a.createdAt - b.createdAt);
    }

    // 移除項目直到釋放足夠空間
    for (const entry of allEntries) {
      const store = entry.data ? this.audioStore : this.resultStore;
      await this.deleteFromStore(store, entry.id);
      freedSize += entry.size;
      this.stats.evictions++;
      
      if (freedSize >= sizeToFree) {
        break;
      }
    }

    return freedSize;
  }

  /**
   * 獲取當前快取大小
   */
  async getCurrentCacheSize() {
    if (!this.db) {
      return 0;
    }

    try {
      const metadata = await this.getFromStore(this.metaStore, 'totalSize');
      return metadata?.value || 0;
    } catch (error) {
      console.debug('獲取快取大小時發生錯誤:', error);
      return 0;
    }
  }

  /**
   * 更新快取大小元資料
   */
  async updateCacheSize(delta) {
    if (!this.db) {
      // 資料庫已關閉，忽略更新
      return;
    }

    try {
      const metadata = await this.getFromStore(this.metaStore, 'totalSize') || { key: 'totalSize', value: 0 };
      metadata.value += delta;
      await this.saveToStore(this.metaStore, metadata);
    } catch (error) {
      // 忽略錯誤，可能是資料庫已關閉
      console.debug('更新快取大小時發生錯誤:', error);
    }
  }

  /**
   * 清理過期項目
   */
  async cleanupExpiredEntries() {
    const now = Date.now();
    const expiredTime = now - this.ttl;
    
    // 清理音訊快取
    const audioEntries = await this.getAllFromStore(this.audioStore);
    for (const entry of audioEntries) {
      if (entry.accessTime < expiredTime) {
        await this.deleteFromStore(this.audioStore, entry.id);
        this.stats.evictions++;
      }
    }

    // 清理結果快取
    const resultEntries = await this.getAllFromStore(this.resultStore);
    for (const entry of resultEntries) {
      if (entry.accessTime < expiredTime) {
        await this.deleteFromStore(this.resultStore, entry.id);
        this.stats.evictions++;
      }
    }
  }

  /**
   * 啟動維護任務
   */
  startMaintenanceTask() {
    // 每小時執行一次清理
    setInterval(() => {
      this.cleanupExpiredEntries().catch(console.error);
    }, 3600000);
  }

  // IndexedDB 操作輔助方法

  async saveToStore(storeName, data) {
    if (!this.db) {
      console.warn('資料庫未初始化或已關閉');
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const request = store.put(data);
        
        request.onsuccess = () => {
          this.updateCacheSize(data.size).then(resolve).catch(reject);
        };
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getFromStore(storeName, key) {
    if (!this.db) {
      console.warn('資料庫未初始化或已關閉');
      return null;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.get(key);
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async updateInStore(storeName, data) {
    return this.saveToStore(storeName, data);
  }

  async deleteFromStore(storeName, key) {
    if (!this.db) {
      console.warn('資料庫未初始化或已關閉');
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readwrite');
        const store = transaction.objectStore(storeName);
        const getRequest = store.get(key);
        
        getRequest.onsuccess = () => {
          const entry = getRequest.result;
          if (entry) {
            const deleteRequest = store.delete(key);
            deleteRequest.onsuccess = () => {
              this.updateCacheSize(-entry.size).then(resolve).catch(resolve);
            };
            deleteRequest.onerror = () => reject(deleteRequest.error);
          } else {
            resolve();
          }
        };
        getRequest.onerror = () => reject(getRequest.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  async getAllFromStore(storeName) {
    if (!this.db) {
      console.warn('資料庫未初始化或已關閉');
      return [];
    }

    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * 獲取快取統計資訊
   */
  getStatistics() {
    const hitRate = this.stats.hits + this.stats.misses > 0
      ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
      : 0;

    return {
      ...this.stats,
      hitRate: `${hitRate}%`,
      memoryCacheSize: this.memoryCache.size,
      memoryUsage: this.currentMemoryUsage,
      memoryUsageMB: (this.currentMemoryUsage / 1024 / 1024).toFixed(2)
    };
  }

  /**
   * 清空快取
   */
  async clearCache() {
    // 清空記憶體快取
    this.memoryCache.clear();
    this.currentMemoryUsage = 0;

    // 檢查資料庫是否可用
    if (!this.db) {
      console.warn('資料庫未初始化或已關閉');
      return;
    }

    try {
      // 清空 IndexedDB
      const transaction = this.db.transaction([this.audioStore, this.resultStore, this.metaStore], 'readwrite');
      
      await new Promise((resolve, reject) => {
        transaction.objectStore(this.audioStore).clear();
        transaction.objectStore(this.resultStore).clear();
        transaction.objectStore(this.metaStore).clear();
        
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
      });

      // 重置統計
      this.stats = {
        hits: 0,
        misses: 0,
        evictions: 0,
        writes: 0
      };

      console.log('快取已清空');
    } catch (error) {
      console.error('清空快取時發生錯誤:', error);
    }
  }

  /**
   * 清理資源
   */
  cleanup() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
    
    this.memoryCache.clear();
    this.currentMemoryUsage = 0;
  }
}

// 匯出單例
let instance = null;

export function getCacheManager() {
  if (!instance) {
    instance = new CacheManager();
  }
  return instance;
}