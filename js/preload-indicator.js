/**
 * Preload Indicator
 * 模型預載入進度指示器
 */

export class PreloadIndicator {
  constructor() {
    this.container = null;
    this.progressBars = new Map();
    this.isVisible = false;
    this.initialized = false;
    
    // 延遲初始化，等待 DOM 載入
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.init());
    } else {
      // DOM 已載入，可以初始化
      this.init();
    }
  }
  
  /**
   * 初始化指示器
   */
  init() {
    if (this.initialized) return;
    this.initialized = true;
    
    // 創建容器
    this.container = document.createElement('div');
    this.container.className = 'preload-indicator';
    this.container.innerHTML = `
      <div class="preload-header">
        <span class="preload-title">模型預載入</span>
        <button class="preload-toggle" title="顯示/隱藏">
          <span class="icon">⏬</span>
        </button>
      </div>
      <div class="preload-content">
        <div class="preload-list"></div>
        <div class="preload-actions">
          <button class="preload-pause-all" style="display: none;">暫停全部</button>
          <button class="preload-clear-cache">清除快取</button>
        </div>
      </div>
    `;
    
    // 添加樣式
    this.addStyles();
    
    // 綁定事件
    this.bindEvents();
    
    // 添加到頁面
    document.body.appendChild(this.container);
    
    // 預設隱藏
    this.hide();
  }
  
  /**
   * 添加樣式
   */
  addStyles() {
    const style = document.createElement('style');
    style.textContent = `
      .preload-indicator {
        position: fixed;
        bottom: 20px;
        right: 20px;
        width: 320px;
        background: var(--bg-secondary);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 1000;
        transition: all 0.3s ease;
      }
      
      .preload-indicator.minimized {
        height: 40px;
        overflow: hidden;
      }
      
      .preload-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 16px;
        border-bottom: 1px solid var(--border-color);
        cursor: pointer;
      }
      
      .preload-title {
        font-weight: 600;
        color: var(--text-primary);
      }
      
      .preload-toggle {
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: var(--text-secondary);
        transition: transform 0.3s ease;
      }
      
      .preload-indicator.minimized .preload-toggle .icon {
        transform: rotate(180deg);
      }
      
      .preload-content {
        padding: 12px 16px;
      }
      
      .preload-list {
        margin-bottom: 12px;
      }
      
      .preload-item {
        margin-bottom: 12px;
      }
      
      .preload-item:last-child {
        margin-bottom: 0;
      }
      
      .preload-item-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }
      
      .preload-model-name {
        font-weight: 500;
        color: var(--text-primary);
        text-transform: capitalize;
      }
      
      .preload-status {
        font-size: 0.85rem;
        color: var(--text-secondary);
      }
      
      .preload-progress {
        position: relative;
        height: 6px;
        background: var(--bg-tertiary);
        border-radius: 3px;
        overflow: hidden;
      }
      
      .preload-progress-bar {
        position: absolute;
        top: 0;
        left: 0;
        height: 100%;
        background: var(--primary-color);
        border-radius: 3px;
        transition: width 0.3s ease;
      }
      
      .preload-progress-bar.complete {
        background: var(--success-color);
      }
      
      .preload-progress-bar.error {
        background: var(--error-color);
      }
      
      .preload-actions {
        display: flex;
        gap: 8px;
        margin-top: 12px;
      }
      
      .preload-actions button {
        flex: 1;
        padding: 6px 12px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
      }
      
      .preload-actions button:hover {
        background: var(--bg-hover);
      }
      
      .preload-indicator.hidden {
        display: none;
      }
      
      .preload-shimmer {
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent,
          rgba(255, 255, 255, 0.2),
          transparent
        );
        animation: preload-shimmer 2s infinite;
      }
      
      @keyframes preload-shimmer {
        0% { left: -100%; }
        100% { left: 100%; }
      }
      
      .preload-size-info {
        font-size: 0.75rem;
        color: var(--text-secondary);
        margin-left: 8px;
      }
      
      .preload-cancel {
        padding: 2px 8px;
        background: none;
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 0.75rem;
        cursor: pointer;
        color: var(--text-secondary);
      }
      
      .preload-cancel:hover {
        background: var(--bg-tertiary);
        color: var(--error-color);
      }
      
      @media (max-width: 768px) {
        .preload-indicator {
          width: calc(100% - 40px);
          right: 20px;
          left: 20px;
        }
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * 綁定事件
   */
  bindEvents() {
    // 切換顯示/隱藏
    const header = this.container.querySelector('.preload-header');
    const toggle = this.container.querySelector('.preload-toggle');
    
    header.addEventListener('click', (e) => {
      if (e.target !== toggle && !toggle.contains(e.target)) {
        this.toggle();
      }
    });
    
    toggle.addEventListener('click', () => {
      this.toggle();
    });
    
    // 清除快取
    const clearCache = this.container.querySelector('.preload-clear-cache');
    clearCache.addEventListener('click', () => {
      this.onClearCache && this.onClearCache();
    });
    
    // 暫停全部
    const pauseAll = this.container.querySelector('.preload-pause-all');
    pauseAll.addEventListener('click', () => {
      this.onPauseAll && this.onPauseAll();
    });
  }
  
  /**
   * 切換顯示狀態
   */
  toggle() {
    this.container.classList.toggle('minimized');
  }
  
  /**
   * 更新預載入項目
   */
  updatePreloadItem(modelName, status, progress = 0, size = null) {
    let item = this.progressBars.get(modelName);
    
    if (!item) {
      // 創建新項目
      item = this.createPreloadItem(modelName, size);
      this.progressBars.set(modelName, item);
      
      const list = this.container.querySelector('.preload-list');
      list.appendChild(item.element);
    }
    
    // 更新進度
    item.progressBar.style.width = `${progress}%`;
    
    // 更新狀態
    const statusText = item.element.querySelector('.preload-status');
    switch (status) {
      case 'loading':
        statusText.textContent = `載入中 ${Math.round(progress)}%`;
        item.progressBar.className = 'preload-progress-bar';
        item.shimmer.style.display = 'block';
        break;
      case 'complete':
        statusText.textContent = '已完成';
        item.progressBar.className = 'preload-progress-bar complete';
        item.shimmer.style.display = 'none';
        item.cancelBtn.style.display = 'none';
        break;
      case 'error':
        statusText.textContent = '載入失敗';
        item.progressBar.className = 'preload-progress-bar error';
        item.shimmer.style.display = 'none';
        break;
      case 'cancelled':
        statusText.textContent = '已取消';
        item.shimmer.style.display = 'none';
        break;
    }
    
    // 顯示指示器
    this.show();
  }
  
  /**
   * 創建預載入項目
   */
  createPreloadItem(modelName, size) {
    const element = document.createElement('div');
    element.className = 'preload-item';
    element.innerHTML = `
      <div class="preload-item-header">
        <div>
          <span class="preload-model-name">${modelName}</span>
          ${size ? `<span class="preload-size-info">(${this.formatSize(size)})</span>` : ''}
        </div>
        <div>
          <span class="preload-status">準備中</span>
          <button class="preload-cancel" data-model="${modelName}">取消</button>
        </div>
      </div>
      <div class="preload-progress">
        <div class="preload-progress-bar"></div>
        <div class="preload-shimmer"></div>
      </div>
    `;
    
    const progressBar = element.querySelector('.preload-progress-bar');
    const shimmer = element.querySelector('.preload-shimmer');
    const cancelBtn = element.querySelector('.preload-cancel');
    
    // 綁定取消事件
    cancelBtn.addEventListener('click', () => {
      this.onCancelPreload && this.onCancelPreload(modelName);
    });
    
    return { element, progressBar, shimmer, cancelBtn };
  }
  
  /**
   * 格式化檔案大小
   */
  formatSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
  
  /**
   * 顯示指示器
   */
  show() {
    this.container.classList.remove('hidden');
    this.isVisible = true;
  }
  
  /**
   * 隱藏指示器
   */
  hide() {
    this.container.classList.add('hidden');
    this.isVisible = false;
  }
  
  /**
   * 清除所有項目
   */
  clear() {
    const list = this.container.querySelector('.preload-list');
    list.innerHTML = '';
    this.progressBars.clear();
  }
  
  /**
   * 設定事件處理器
   */
  setEventHandlers(handlers) {
    this.onClearCache = handlers.onClearCache;
    this.onPauseAll = handlers.onPauseAll;
    this.onCancelPreload = handlers.onCancelPreload;
  }
}

// 創建單例
export const preloadIndicator = new PreloadIndicator();