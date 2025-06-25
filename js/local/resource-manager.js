/**
 * 資源管理器
 * 負責管理本地資源的下載、儲存、載入和版本控制
 */

import { IndexedDBManager } from './indexeddb-manager.js';
import { CacheStorageManager } from './cache-storage-manager.js';

export class ResourceManager {
  constructor() {
    this.resources = new Map();
    this.storage = {
      cache: new CacheStorageManager(),
      indexedDB: new IndexedDBManager()
    };
    
    // 資源配置
    this.resourceConfig = {
      'transformers.js': {
        url: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0/dist/transformers.min.js',
        localPath: '/local/libs/transformers.min.js',
        size: 5 * 1024 * 1024, // 5MB
        storage: 'cache',
        version: '2.6.0',
        critical: true,
        type: 'library'
      },
      'whisper-tiny': {
        url: 'https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx',
        localPath: '/local/models/whisper-tiny.onnx',
        size: 75 * 1024 * 1024, // 75MB
        storage: 'indexedDB',
        version: '1.0.0',
        critical: false,
        type: 'model'
      },
      'whisper-base': {
        url: 'https://huggingface.co/Xenova/whisper-base/resolve/main/onnx/model.onnx',
        localPath: '/local/models/whisper-base.onnx',
        size: 142 * 1024 * 1024, // 142MB
        storage: 'indexedDB',
        version: '1.0.0',
        critical: false,
        type: 'model'
      },
      'whisper-small': {
        url: 'https://huggingface.co/Xenova/whisper-small/resolve/main/onnx/model.onnx',
        localPath: '/local/models/whisper-small.onnx',
        size: 466 * 1024 * 1024, // 466MB
        storage: 'indexedDB',
        version: '1.0.0',
        critical: false,
        type: 'model'
      }
    };
    
    // 下載管理
    this.activeDownloads = new Map();
  }
  
  /**
   * 初始化資源管理器
   */
  async initialize() {
    // 請求持久儲存權限
    if ('storage' in navigator && 'persist' in navigator.storage) {
      const isPersisted = await navigator.storage.persist();
      console.log(`持久儲存${isPersisted ? '已' : '未'}授權`);
    }
    
    // 檢查儲存空間
    const storageInfo = await this.getStorageInfo();
    console.log('儲存空間資訊:', storageInfo);
    
    return true;
  }
  
  /**
   * 檢查資源是否已本地化
   */
  async checkLocalResources() {
    const status = {};
    
    for (const [name, config] of Object.entries(this.resourceConfig)) {
      const storage = this.storage[config.storage];
      const exists = await storage.exists(config.localPath);
      const metadata = exists ? await storage.getMetadata(config.localPath) : null;
      
      status[name] = {
        exists,
        version: metadata?.version || null,
        isLatest: metadata?.version === config.version,
        size: config.size,
        type: config.type,
        lastUpdated: metadata?.timestamp ? new Date(metadata.timestamp) : null
      };
    }
    
    return status;
  }
  
  /**
   * 下載並儲存資源
   */
  async downloadResource(name, options = {}) {
    const config = this.resourceConfig[name];
    if (!config) throw new Error(`未知資源: ${name}`);
    
    // 檢查是否已在下載
    if (this.activeDownloads.has(name)) {
      return this.activeDownloads.get(name);
    }
    
    // 創建下載任務
    const downloadPromise = this._performDownload(name, config, options);
    this.activeDownloads.set(name, downloadPromise);
    
    try {
      const result = await downloadPromise;
      return result;
    } finally {
      this.activeDownloads.delete(name);
    }
  }
  
  /**
   * 執行下載
   */
  async _performDownload(name, config, options) {
    const { onProgress, signal } = options;
    
    try {
      console.log(`開始下載 ${name}...`);
      
      // 檢查儲存空間
      const hasSpace = await this.checkStorageSpace(config.size);
      if (!hasSpace) {
        throw new Error('儲存空間不足');
      }
      
      // 下載資源
      const response = await fetch(config.url, { signal });
      
      if (!response.ok) {
        throw new Error(`下載失敗: ${response.status} ${response.statusText}`);
      }
      
      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10) || config.size;
      
      // 讀取資料流並追蹤進度
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        // 檢查取消
        if (signal?.aborted) {
          throw new Error('下載已取消');
        }
        
        chunks.push(value);
        received += value.length;
        
        if (onProgress) {
          onProgress({
            name,
            received,
            total,
            percentage: (received / total) * 100
          });
        }
      }
      
      // 合併資料
      const blob = new Blob(chunks);
      
      // 儲存到適當的儲存
      const storage = this.storage[config.storage];
      await storage.save(config.localPath, blob, {
        version: config.version,
        timestamp: Date.now(),
        size: blob.size
      });
      
      console.log(`${name} 下載完成，大小: ${this.formatBytes(blob.size)}`);
      
      return { 
        success: true, 
        size: received,
        path: config.localPath
      };
      
    } catch (error) {
      console.error(`下載 ${name} 失敗:`, error);
      throw error;
    }
  }
  
  /**
   * 載入本地資源
   */
  async loadLocalResource(name) {
    const config = this.resourceConfig[name];
    if (!config) throw new Error(`未知資源: ${name}`);
    
    const storage = this.storage[config.storage];
    const data = await storage.load(config.localPath);
    
    if (!data) {
      throw new Error(`本地資源不存在: ${name}`);
    }
    
    return data;
  }
  
  /**
   * 智慧載入（優先本地，降級遠端）
   */
  async smartLoad(name, options = {}) {
    try {
      // 嘗試載入本地資源
      const localData = await this.loadLocalResource(name);
      console.log(`從本地載入 ${name}`);
      return localData;
      
    } catch (localError) {
      console.log(`本地資源 ${name} 不可用: ${localError.message}`);
      
      // 如果允許下載，則下載資源
      if (options.allowDownload !== false) {
        console.log(`開始下載 ${name}...`);
        await this.downloadResource(name, options);
        return await this.loadLocalResource(name);
      } else {
        throw new Error(`資源 ${name} 不可用且不允許下載`);
      }
    }
  }
  
  /**
   * 刪除資源
   */
  async deleteResource(name) {
    const config = this.resourceConfig[name];
    if (!config) throw new Error(`未知資源: ${name}`);
    
    const storage = this.storage[config.storage];
    await storage.delete(config.localPath);
    
    console.log(`已刪除資源: ${name}`);
  }
  
  /**
   * 檢查儲存空間
   */
  async checkStorageSpace(requiredBytes) {
    const info = await this.getStorageInfo();
    if (!info) return true; // 無法檢查時假設有空間
    
    const available = info.quota - info.usage;
    const buffer = 100 * 1024 * 1024; // 100MB 緩衝
    
    return available > (requiredBytes + buffer);
  }
  
  /**
   * 獲取儲存資訊
   */
  async getStorageInfo() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage || 0,
        quota: estimate.quota || 0,
        percentage: estimate.quota ? (estimate.usage / estimate.quota) * 100 : 0,
        persistent: await navigator.storage.persisted()
      };
    }
    return null;
  }
  
  /**
   * 清理舊資源
   */
  async cleanupOldResources() {
    const status = await this.checkLocalResources();
    let freedSpace = 0;
    
    for (const [name, info] of Object.entries(status)) {
      // 清理過期的非關鍵資源
      if (info.exists && !info.isLatest && !this.resourceConfig[name].critical) {
        await this.deleteResource(name);
        freedSpace += this.resourceConfig[name].size;
      }
    }
    
    console.log(`清理完成，釋放空間: ${this.formatBytes(freedSpace)}`);
    return freedSpace;
  }
  
  /**
   * 格式化位元組大小
   */
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  /**
   * 獲取資源總大小
   */
  getTotalResourceSize() {
    let total = 0;
    for (const config of Object.values(this.resourceConfig)) {
      total += config.size;
    }
    return total;
  }
  
  /**
   * 獲取已下載資源大小
   */
  async getDownloadedSize() {
    const status = await this.checkLocalResources();
    let total = 0;
    
    for (const [name, info] of Object.entries(status)) {
      if (info.exists) {
        total += this.resourceConfig[name].size;
      }
    }
    
    return total;
  }
  
  /**
   * 匯出資源狀態報告
   */
  async getStatusReport() {
    const status = await this.checkLocalResources();
    const storageInfo = await this.getStorageInfo();
    const totalSize = this.getTotalResourceSize();
    const downloadedSize = await this.getDownloadedSize();
    
    return {
      resources: status,
      storage: storageInfo,
      summary: {
        totalResources: Object.keys(this.resourceConfig).length,
        downloadedResources: Object.values(status).filter(s => s.exists).length,
        totalSize: this.formatBytes(totalSize),
        downloadedSize: this.formatBytes(downloadedSize),
        percentage: totalSize ? (downloadedSize / totalSize) * 100 : 0
      }
    };
  }
}

// 建立單例
export const resourceManager = new ResourceManager();