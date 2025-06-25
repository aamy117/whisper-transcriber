# 真正的本地化部署實現計劃書

## 🎯 專案目標

實現 Whisper 聽打工具的完全本地化部署，達成：
- **零網路依賴**：所有資源本地儲存，完全離線可用
- **快速啟動**：無需等待外部資源載入
- **可預測效能**：不受網路狀況影響
- **資料隱私**：所有處理完全在本地進行

## 🏗️ 整體架構

### 1. 資源分層管理

```
┌─────────────────────────────────────┐
│         使用者介面層               │
├─────────────────────────────────────┤
│      資源管理器 (Resource Manager)  │
├─────────────────────────────────────┤
│   Cache API  │  IndexedDB  │  FS   │
├─────────────────────────────────────┤
│        Service Worker              │
└─────────────────────────────────────┘
```

### 2. 資源分類與儲存策略

| 資源類型 | 大小 | 儲存方式 | 更新頻率 | 優先級 |
|----------|------|----------|----------|--------|
| 核心程式碼 | ~2MB | Cache API | 經常 | 最高 |
| UI 資源 | ~1MB | Cache API | 經常 | 高 |
| Transformers.js | ~5MB | Cache API | 偶爾 | 高 |
| Whisper Tiny | 75MB | IndexedDB | 很少 | 中 |
| Whisper Base | 142MB | IndexedDB | 很少 | 低 |
| Whisper Small | 466MB | IndexedDB | 很少 | 最低 |

## 📦 實現方案

### 方案一：漸進式資源管理系統

#### 1. 資源管理器實現

```javascript
// js/local/resource-manager.js
class ResourceManager {
  constructor() {
    this.resources = new Map();
    this.storage = {
      cache: new CacheStorageManager(),
      indexedDB: new IndexedDBManager(),
      filesystem: new FileSystemManager() // 未來支援
    };
    
    // 資源配置
    this.resourceConfig = {
      'transformers.js': {
        url: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0/dist/transformers.min.js',
        localPath: '/local/libs/transformers.min.js',
        size: 5 * 1024 * 1024, // 5MB
        storage: 'cache',
        version: '2.6.0',
        critical: true
      },
      'whisper-tiny': {
        url: 'https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx',
        localPath: '/local/models/whisper-tiny.onnx',
        size: 75 * 1024 * 1024, // 75MB
        storage: 'indexedDB',
        version: '1.0.0',
        critical: false
      }
      // ... 其他資源
    };
  }
  
  /**
   * 檢查資源是否已本地化
   */
  async checkLocalResources() {
    const status = {};
    
    for (const [name, config] of Object.entries(this.resourceConfig)) {
      const storage = this.storage[config.storage];
      const exists = await storage.exists(config.localPath);
      const version = await storage.getVersion(config.localPath);
      
      status[name] = {
        exists,
        version,
        isLatest: version === config.version,
        size: config.size
      };
    }
    
    return status;
  }
  
  /**
   * 下載並儲存資源
   */
  async downloadResource(name, onProgress) {
    const config = this.resourceConfig[name];
    if (!config) throw new Error(`未知資源: ${name}`);
    
    try {
      // 下載資源
      const response = await fetch(config.url);
      const contentLength = response.headers.get('content-length');
      const total = parseInt(contentLength, 10);
      
      // 讀取資料流並追蹤進度
      const reader = response.body.getReader();
      const chunks = [];
      let received = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        received += value.length;
        
        if (onProgress) {
          onProgress({
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
        timestamp: Date.now()
      });
      
      return { success: true, size: received };
      
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
      return await this.loadLocalResource(name);
    } catch (localError) {
      console.log(`本地資源 ${name} 不可用，嘗試下載...`);
      
      // 如果允許下載，則下載資源
      if (options.allowDownload !== false) {
        await this.downloadResource(name, options.onProgress);
        return await this.loadLocalResource(name);
      } else {
        throw new Error(`資源 ${name} 不可用且不允許下載`);
      }
    }
  }
}
```

#### 2. IndexedDB 管理器

```javascript
// js/local/indexeddb-manager.js
class IndexedDBManager {
  constructor() {
    this.dbName = 'WhisperLocalResources';
    this.version = 1;
    this.storeName = 'resources';
  }
  
  async openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'path' });
          store.createIndex('version', 'version', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }
  
  async save(path, blob, metadata = {}) {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    
    const data = {
      path,
      blob,
      version: metadata.version,
      timestamp: metadata.timestamp || Date.now(),
      size: blob.size
    };
    
    return new Promise((resolve, reject) => {
      const request = store.put(data);
      request.onsuccess = () => resolve(true);
      request.onerror = () => reject(request.error);
    });
  }
  
  async load(path) {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.get(path);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.blob : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async exists(path) {
    const data = await this.load(path);
    return data !== null;
  }
  
  async getVersion(path) {
    const db = await this.openDB();
    const transaction = db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    
    return new Promise((resolve, reject) => {
      const request = store.get(path);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.version : null);
      };
      request.onerror = () => reject(request.error);
    });
  }
  
  async getStorageUsage() {
    if ('storage' in navigator && 'estimate' in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      return {
        usage: estimate.usage,
        quota: estimate.quota,
        percentage: (estimate.usage / estimate.quota) * 100
      };
    }
    return null;
  }
  
  async requestPersistentStorage() {
    if ('storage' in navigator && 'persist' in navigator.storage) {
      const isPersisted = await navigator.storage.persist();
      console.log(`持久儲存${isPersisted ? '已' : '未'}授權`);
      return isPersisted;
    }
    return false;
  }
}
```

#### 3. 本地化 Transformers.js 載入器

```javascript
// js/local/local-transformers-loader.js
class LocalTransformersLoader {
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
    this.isLoaded = false;
  }
  
  async load() {
    if (this.isLoaded) return true;
    
    try {
      // 嘗試載入本地版本
      const blob = await this.resourceManager.loadLocalResource('transformers.js');
      
      // 創建 Blob URL 並載入
      const url = URL.createObjectURL(blob);
      const script = document.createElement('script');
      script.type = 'module';
      
      // 包裝成模組格式
      const moduleScript = `
        import * as transformers from '${url}';
        window.transformers = transformers;
      `;
      
      script.textContent = moduleScript;
      document.head.appendChild(script);
      
      // 等待載入完成
      await this.waitForTransformers();
      
      // 清理 Blob URL
      URL.revokeObjectURL(url);
      
      this.isLoaded = true;
      return true;
      
    } catch (error) {
      console.error('載入本地 Transformers.js 失敗:', error);
      
      // 降級到 CDN
      return await this.loadFromCDN();
    }
  }
  
  async loadFromCDN() {
    console.log('降級到 CDN 載入 Transformers.js...');
    
    const script = document.createElement('script');
    script.type = 'module';
    script.textContent = `
      import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0';
      window.transformers = { pipeline, env };
    `;
    document.head.appendChild(script);
    
    await this.waitForTransformers();
    this.isLoaded = true;
    return true;
  }
  
  async waitForTransformers(timeout = 30000) {
    const startTime = Date.now();
    
    while (!window.transformers) {
      if (Date.now() - startTime > timeout) {
        throw new Error('載入 Transformers.js 超時');
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}
```

#### 4. 資源下載管理介面

```javascript
// js/local/resource-download-ui.js
class ResourceDownloadUI {
  constructor(resourceManager) {
    this.resourceManager = resourceManager;
  }
  
  async show() {
    const status = await this.resourceManager.checkLocalResources();
    const storage = await this.getStorageInfo();
    
    const dialog = document.createElement('div');
    dialog.className = 'resource-download-dialog';
    dialog.innerHTML = `
      <div class="dialog-content">
        <h2>本地化資源管理</h2>
        
        <div class="storage-info">
          <h3>儲存空間</h3>
          <div class="storage-bar">
            <div class="storage-used" style="width: ${storage.percentage}%"></div>
          </div>
          <p>已使用 ${this.formatBytes(storage.usage)} / ${this.formatBytes(storage.quota)}</p>
          <button onclick="resourceDownloadUI.requestPersistent()">請求持久儲存</button>
        </div>
        
        <div class="resource-list">
          <h3>資源狀態</h3>
          ${this.renderResourceList(status)}
        </div>
        
        <div class="actions">
          <button onclick="resourceDownloadUI.downloadAll()">下載所有必要資源</button>
          <button onclick="resourceDownloadUI.close()">關閉</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
  }
  
  renderResourceList(status) {
    let html = '<table class="resource-table">';
    html += '<tr><th>資源</th><th>大小</th><th>狀態</th><th>操作</th></tr>';
    
    for (const [name, info] of Object.entries(status)) {
      const config = this.resourceManager.resourceConfig[name];
      const statusText = info.exists ? 
        (info.isLatest ? '✅ 最新' : '⚠️ 需要更新') : 
        '❌ 未下載';
      
      html += `
        <tr>
          <td>${this.getResourceDisplayName(name)}</td>
          <td>${this.formatBytes(config.size)}</td>
          <td>${statusText}</td>
          <td>
            ${!info.exists || !info.isLatest ? 
              `<button onclick="resourceDownloadUI.download('${name}')">
                ${info.exists ? '更新' : '下載'}
              </button>` : 
              ''
            }
          </td>
        </tr>
      `;
    }
    
    html += '</table>';
    return html;
  }
  
  getResourceDisplayName(name) {
    const names = {
      'transformers.js': 'Transformers.js 函式庫',
      'whisper-tiny': 'Whisper Tiny 模型 (75MB)',
      'whisper-base': 'Whisper Base 模型 (142MB)',
      'whisper-small': 'Whisper Small 模型 (466MB)'
    };
    return names[name] || name;
  }
  
  async download(resourceName) {
    const progressBar = document.createElement('div');
    progressBar.className = 'download-progress';
    progressBar.innerHTML = `
      <div class="progress-info">
        <span>下載 ${this.getResourceDisplayName(resourceName)}...</span>
        <span class="progress-percentage">0%</span>
      </div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
    `;
    
    // 添加到對話框
    const dialog = document.querySelector('.resource-download-dialog');
    dialog.appendChild(progressBar);
    
    try {
      await this.resourceManager.downloadResource(resourceName, (progress) => {
        const percentage = Math.round(progress.percentage);
        progressBar.querySelector('.progress-percentage').textContent = `${percentage}%`;
        progressBar.querySelector('.progress-fill').style.width = `${percentage}%`;
      });
      
      progressBar.innerHTML = '<div class="success">✅ 下載完成！</div>';
      
      // 重新整理資源列表
      setTimeout(() => this.refresh(), 1000);
      
    } catch (error) {
      progressBar.innerHTML = `<div class="error">❌ 下載失敗: ${error.message}</div>`;
    }
  }
  
  async downloadAll() {
    const status = await this.resourceManager.checkLocalResources();
    
    for (const [name, info] of Object.entries(status)) {
      const config = this.resourceManager.resourceConfig[name];
      
      // 只下載關鍵資源和未下載的資源
      if (config.critical && (!info.exists || !info.isLatest)) {
        await this.download(name);
      }
    }
  }
  
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
  
  async getStorageInfo() {
    const usage = await this.resourceManager.storage.indexedDB.getStorageUsage();
    return usage || { usage: 0, quota: 0, percentage: 0 };
  }
  
  async requestPersistent() {
    const granted = await this.resourceManager.storage.indexedDB.requestPersistentStorage();
    alert(granted ? '持久儲存已授權！' : '持久儲存請求被拒絕');
  }
  
  close() {
    document.querySelector('.resource-download-dialog')?.remove();
  }
  
  async refresh() {
    this.close();
    await this.show();
  }
}
```

### 方案二：打包式部署

#### 1. 構建時下載所有資源

```bash
# scripts/download-resources.sh
#!/bin/bash

echo "下載本地化資源..."

# 創建目錄
mkdir -p local/libs
mkdir -p local/models

# 下載 Transformers.js
echo "下載 Transformers.js..."
curl -L https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0/dist/transformers.min.js \
  -o local/libs/transformers.min.js

# 下載 Whisper 模型（ONNX 格式）
echo "下載 Whisper Tiny 模型..."
curl -L https://huggingface.co/Xenova/whisper-tiny/resolve/main/onnx/model.onnx \
  -o local/models/whisper-tiny.onnx

echo "完成！"
```

#### 2. 更新 Service Worker

```javascript
// sw.js 添加本地資源快取
const LOCAL_RESOURCES = [
  '/local/libs/transformers.min.js',
  '/local/models/whisper-tiny.onnx',
  // ... 其他本地資源
];

// 安裝時快取所有本地資源
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then(cache => cache.addAll([...CORE_FILES, ...LOCAL_RESOURCES]))
  );
});
```

## 🚀 部署流程

### 1. 開發環境設置

```bash
# 1. 安裝依賴
npm install

# 2. 下載本地資源
npm run download-resources

# 3. 建構專案
npm run build

# 4. 本地測試
npm run serve
```

### 2. 生產部署

```javascript
// package.json
{
  "scripts": {
    "download-resources": "node scripts/download-resources.js",
    "build": "npm run download-resources && webpack --mode production",
    "deploy": "npm run build && gh-pages -d dist"
  }
}
```

### 3. GitHub Actions 自動化

```yaml
# .github/workflows/deploy.yml
name: Deploy with Local Resources

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '16'
    
    - name: Cache local resources
      uses: actions/cache@v2
      with:
        path: local/
        key: local-resources-${{ hashFiles('scripts/resource-versions.json') }}
    
    - name: Download resources if needed
      run: |
        if [ ! -d "local" ]; then
          npm run download-resources
        fi
    
    - name: Build and deploy
      run: |
        npm install
        npm run build
        npm run deploy
```

## 📊 效能對比

| 指標 | 線上版本 | 本地化版本 | 改善 |
|------|----------|------------|------|
| 首次載入 | 10-30秒 | 2-3秒 | 90% |
| 模型載入 | 5-60秒 | <1秒 | 98% |
| 離線可用 | ❌ | ✅ | 100% |
| 網路依賴 | 必需 | 可選 | 100% |
| 載入預測性 | 低 | 高 | 顯著 |

## 🔧 配置選項

```javascript
// config/local-deployment.js
export const LocalDeploymentConfig = {
  // 資源載入策略
  resourceStrategy: 'progressive', // 'progressive' | 'preload-all' | 'on-demand'
  
  // 儲存配額管理
  storage: {
    maxSize: 1024 * 1024 * 1024, // 1GB
    autoCleanup: true,
    cleanupThreshold: 0.9 // 90% 時清理
  },
  
  // 模型配置
  models: {
    default: 'tiny',
    autoDownload: ['tiny'], // 自動下載的模型
    optional: ['base', 'small'] // 可選模型
  },
  
  // 更新策略
  updates: {
    checkInterval: 24 * 60 * 60 * 1000, // 24小時
    autoUpdate: true,
    notifyUser: true
  },
  
  // 降級選項
  fallback: {
    allowCDN: true, // 本地失敗時允許使用 CDN
    showWarning: true // 顯示降級警告
  }
};
```

## 🎯 最佳實踐

### 1. 漸進增強
- 核心功能優先
- 按需載入大資源
- 提供降級方案

### 2. 使用者控制
- 讓使用者選擇下載的模型
- 提供儲存空間管理介面
- 清晰的進度反饋

### 3. 效能優化
- 使用 Web Worker 載入資源
- 實現資源預載入
- 智慧快取策略

### 4. 錯誤處理
- 完整的錯誤恢復機制
- 明確的錯誤提示
- 自動重試機制

## 📝 實施檢查清單

- [ ] 實現資源管理器
- [ ] 實現 IndexedDB 儲存層
- [ ] 實現 Cache API 儲存層
- [ ] 創建本地化載入器
- [ ] 實現資源下載 UI
- [ ] 更新 Service Worker
- [ ] 創建資源下載腳本
- [ ] 設置自動化部署
- [ ] 測試離線功能
- [ ] 優化載入效能
- [ ] 撰寫使用文檔
- [ ] 發布新版本

## 💡 結論

真正的本地化部署需要：

1. **完整的資源管理系統** - 處理下載、儲存、版本控制
2. **智慧的載入策略** - 平衡效能和儲存空間
3. **良好的使用者體驗** - 清晰的狀態和控制
4. **可靠的降級機制** - 確保功能可用性

透過實施這個方案，Whisper 聽打工具將真正實現：
- ✅ **完全離線可用**
- ✅ **快速穩定的效能**
- ✅ **可預測的使用體驗**
- ✅ **真正的本地化部署**