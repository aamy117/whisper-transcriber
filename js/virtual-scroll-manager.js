// 虛擬滾動管理器 - 優化大量段落的渲染效能
// 只渲染可見區域的段落，大幅減少 DOM 節點數量

const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

export class VirtualScrollManager {
  constructor(options = {}) {
    // 配置選項
    this.options = {
      containerHeight: options.containerHeight || 600,          // 容器高度
      itemHeight: options.itemHeight || 80,                     // 預估每個項目高度
      bufferSize: options.bufferSize || 5,                      // 緩衝區大小（上下各渲染額外的項目數）
      scrollDebounce: options.scrollDebounce || 16,             // 滾動防抖時間（毫秒）
      enableVirtualScroll: options.enableVirtualScroll !== false, // 是否啟用虛擬滾動
      threshold: options.threshold || 100                        // 啟用虛擬滾動的項目數閾值
    };

    // 狀態
    this.items = [];                    // 所有項目數據
    this.itemHeights = new Map();       // 實際項目高度快取
    this.visibleRange = { start: 0, end: 0 };  // 可見範圍
    this.scrollTop = 0;                 // 當前滾動位置
    this.totalHeight = 0;               // 總高度
    this.isVirtualMode = false;         // 是否在虛擬滾動模式
    
    // DOM 元素
    this.container = null;              // 滾動容器
    this.viewport = null;               // 視口元素
    this.spacer = null;                 // 佔位元素
    
    // 渲染相關
    this.renderCallback = null;         // 渲染回調函數
    this.scrollTimer = null;            // 滾動計時器
    this.measurementQueue = [];         // 高度測量隊列
    
    // 性能監控
    this.stats = {
      renderCount: 0,
      lastRenderTime: 0,
      averageRenderTime: 0
    };
    
    // 防止無限遞迴的標記
    this.isMeasuring = false;
  }

  /**
   * 初始化虛擬滾動
   * @param {HTMLElement} container - 滾動容器
   * @param {Function} renderCallback - 渲染項目的回調函數
   */
  init(container, renderCallback) {
    if (!container || !renderCallback) {
      throw new Error('VirtualScrollManager: 容器和渲染回調函數是必需的');
    }

    this.container = container;
    this.renderCallback = renderCallback;
    
    // 設置容器樣式
    this.setupContainer();
    
    // 綁定滾動事件
    this.bindScrollEvent();
    
    // 監聽容器大小變化
    this.observeResize();
    
    DEBUG && console.log('VirtualScrollManager 初始化完成');
  }

  /**
   * 設置容器結構
   */
  setupContainer() {
    // 確保容器有正確的樣式
    this.container.style.position = 'relative';
    this.container.style.overflow = 'auto';
    this.container.style.height = this.options.containerHeight + 'px';
    
    // 創建視口元素（用於放置可見的項目）
    this.viewport = document.createElement('div');
    this.viewport.style.position = 'relative';
    this.viewport.style.willChange = 'transform'; // 優化渲染性能
    this.viewport.style.width = '100%'; // 確保視口寬度正確
    this.viewport.style.minHeight = '100%'; // 確保視口有最小高度
    
    // 創建佔位元素（用於維持滾動條高度）
    this.spacer = document.createElement('div');
    this.spacer.style.position = 'absolute';
    this.spacer.style.top = '0';
    this.spacer.style.left = '0';
    this.spacer.style.width = '1px';
    this.spacer.style.visibility = 'hidden';
    this.spacer.style.pointerEvents = 'none';
    this.spacer.style.zIndex = '-1'; // 確保佔位元素在最底層
    
    // 清空容器並添加新結構
    this.container.innerHTML = '';
    this.container.appendChild(this.viewport);
    this.container.appendChild(this.spacer);
  }

  /**
   * 設置項目數據
   * @param {Array} items - 項目數據數組
   */
  setItems(items) {
    this.items = items || [];
    this.itemHeights.clear();
    
    // 決定是否啟用虛擬滾動
    this.isVirtualMode = this.options.enableVirtualScroll && 
                        this.items.length > this.options.threshold;
    
    if (this.isVirtualMode) {
      DEBUG && console.log(`啟用虛擬滾動模式，共 ${this.items.length} 個項目`);
      this.calculateInitialLayout();
      this.render();
    } else {
      DEBUG && console.log(`項目數量 ${this.items.length} 低於閾值，使用普通渲染`);
      this.renderAllItems();
    }
  }

  /**
   * 計算初始佈局
   */
  calculateInitialLayout() {
    // 預估總高度
    this.totalHeight = this.items.length * this.options.itemHeight;
    this.updateSpacerHeight();
    
    // 計算初始可見範圍
    this.calculateVisibleRange();
  }

  /**
   * 計算可見範圍
   */
  calculateVisibleRange() {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.clientHeight;
    
    // 計算第一個和最後一個可見項目的索引
    let startIndex = Math.floor(scrollTop / this.options.itemHeight);
    let endIndex = Math.ceil((scrollTop + containerHeight) / this.options.itemHeight);
    
    // 添加緩衝區
    startIndex = Math.max(0, startIndex - this.options.bufferSize);
    endIndex = Math.min(this.items.length - 1, endIndex + this.options.bufferSize);
    
    // 使用實際高度進行更精確的計算（如果有的話）
    if (this.itemHeights.size > 0) {
      startIndex = this.findIndexAtOffset(scrollTop);
      endIndex = this.findIndexAtOffset(scrollTop + containerHeight) + 1;
      
      // 添加緩衝區
      startIndex = Math.max(0, startIndex - this.options.bufferSize);
      endIndex = Math.min(this.items.length - 1, endIndex + this.options.bufferSize);
    }
    
    this.visibleRange = { start: startIndex, end: endIndex };
    this.scrollTop = scrollTop;
  }

  /**
   * 根據偏移量找到對應的項目索引
   * @param {number} offset - 垂直偏移量
   * @returns {number} 項目索引
   */
  findIndexAtOffset(offset) {
    // 如果所有項目高度相同，使用簡單計算
    if (this.itemHeights.size === 0) {
      return Math.min(
        Math.floor(offset / this.options.itemHeight),
        this.items.length - 1
      );
    }
    
    // 二分搜尋優化版本
    let left = 0;
    let right = this.items.length - 1;
    let lastValidIndex = 0;
    
    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midOffset = this.getItemOffset(mid);
      const midHeight = this.itemHeights.get(mid) || this.options.itemHeight;
      
      if (offset >= midOffset && offset < midOffset + midHeight) {
        return mid;
      } else if (offset < midOffset) {
        right = mid - 1;
      } else {
        lastValidIndex = mid;
        left = mid + 1;
      }
    }
    
    return Math.min(lastValidIndex + 1, this.items.length - 1);
  }

  /**
   * 獲取項目的垂直偏移量
   * @param {number} index - 項目索引
   * @returns {number} 垂直偏移量
   */
  getItemOffset(index) {
    let offset = 0;
    
    for (let i = 0; i < index; i++) {
      offset += this.itemHeights.get(i) || this.options.itemHeight;
    }
    
    return offset;
  }

  /**
   * 渲染可見項目
   */
  render() {
    if (!this.isVirtualMode) {
      this.renderAllItems();
      return;
    }
    
    const startTime = performance.now();
    const { start, end } = this.visibleRange;
    
    // 清空視口
    this.viewport.innerHTML = '';
    
    // 創建文檔片段以提高性能
    const fragment = document.createDocumentFragment();
    
    // 計算第一個可見項目的偏移量
    const firstItemOffset = this.getItemOffset(start);
    
    // 渲染可見項目
    for (let i = start; i <= end; i++) {
      const item = this.items[i];
      if (!item) continue;
      
      // 創建項目容器
      const itemElement = document.createElement('div');
      itemElement.dataset.index = i;
      itemElement.style.position = 'absolute';
      // 計算相對於視口的位置（減去第一個項目的偏移量）
      itemElement.style.top = (this.getItemOffset(i) - firstItemOffset) + 'px';
      itemElement.style.left = '0';
      itemElement.style.right = '0';
      
      // 使用回調函數渲染項目內容
      const content = this.renderCallback(item, i);
      if (content instanceof HTMLElement) {
        itemElement.appendChild(content);
      } else {
        itemElement.innerHTML = content;
      }
      
      fragment.appendChild(itemElement);
      
      // 標記需要測量高度
      if (!this.itemHeights.has(i)) {
        this.measurementQueue.push({ index: i, element: itemElement });
      }
    }
    
    // 一次性添加所有項目
    this.viewport.appendChild(fragment);
    
    // 設置視口的 transform 以正確定位
    this.viewport.style.transform = `translateY(${firstItemOffset}px)`;
    
    // 異步測量新項目的高度
    if (this.measurementQueue.length > 0) {
      requestAnimationFrame(() => this.measureItemHeights());
    }
    
    // 更新性能統計
    const renderTime = performance.now() - startTime;
    this.updateStats(renderTime);
    
    DEBUG && console.log(`渲染項目 ${start}-${end}，耗時 ${renderTime.toFixed(2)}ms`);
  }

  /**
   * 渲染所有項目（非虛擬模式）
   */
  renderAllItems() {
    const fragment = document.createDocumentFragment();
    
    this.items.forEach((item, index) => {
      const content = this.renderCallback(item, index);
      if (content instanceof HTMLElement) {
        fragment.appendChild(content);
      } else {
        const div = document.createElement('div');
        div.innerHTML = content;
        fragment.appendChild(div.firstElementChild);
      }
    });
    
    this.viewport.innerHTML = '';
    this.viewport.appendChild(fragment);
    this.viewport.style.transform = '';
  }

  /**
   * 測量項目高度
   */
  measureItemHeights() {
    let heightChanged = false;
    
    this.measurementQueue.forEach(({ index, element }) => {
      const height = element.offsetHeight;
      const previousHeight = this.itemHeights.get(index) || this.options.itemHeight;
      
      if (height !== previousHeight) {
        this.itemHeights.set(index, height);
        heightChanged = true;
      }
    });
    
    this.measurementQueue = [];
    
    // 如果高度有變化，需要重新渲染以更新位置
    if (heightChanged) {
      this.recalculateTotalHeight();
      // 避免無限遞迴：只有當容器未在測量狀態時才重新渲染
      if (!this.isMeasuring) {
        this.isMeasuring = true;
        requestAnimationFrame(() => {
          this.render();
          this.isMeasuring = false;
        });
      }
    }
  }

  /**
   * 重新計算總高度
   */
  recalculateTotalHeight() {
    let totalHeight = 0;
    
    for (let i = 0; i < this.items.length; i++) {
      totalHeight += this.itemHeights.get(i) || this.options.itemHeight;
    }
    
    this.totalHeight = totalHeight;
    this.updateSpacerHeight();
  }

  /**
   * 更新佔位元素高度
   */
  updateSpacerHeight() {
    if (this.spacer) {
      this.spacer.style.height = this.totalHeight + 'px';
    }
  }

  /**
   * 綁定滾動事件
   */
  bindScrollEvent() {
    const handleScroll = () => {
      if (!this.isVirtualMode) return;
      
      // 使用防抖處理滾動
      clearTimeout(this.scrollTimer);
      this.scrollTimer = setTimeout(() => {
        const oldRange = { ...this.visibleRange };
        this.calculateVisibleRange();
        
        // 只有當可見範圍改變時才重新渲染
        if (oldRange.start !== this.visibleRange.start || 
            oldRange.end !== this.visibleRange.end) {
          this.render();
        }
      }, this.options.scrollDebounce);
    };
    
    this.container.addEventListener('scroll', handleScroll, { passive: true });
  }

  /**
   * 監聽容器大小變化
   */
  observeResize() {
    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() => {
        if (this.isVirtualMode) {
          this.calculateVisibleRange();
          this.render();
        }
      });
      
      resizeObserver.observe(this.container);
    }
  }

  /**
   * 滾動到指定索引
   * @param {number} index - 項目索引
   * @param {string} position - 滾動位置：'start', 'center', 'end'
   */
  scrollToIndex(index, position = 'start') {
    if (index < 0 || index >= this.items.length) return;
    
    const offset = this.getItemOffset(index);
    const itemHeight = this.itemHeights.get(index) || this.options.itemHeight;
    const containerHeight = this.container.clientHeight;
    
    let scrollTop = offset;
    
    if (position === 'center') {
      scrollTop = offset - (containerHeight - itemHeight) / 2;
    } else if (position === 'end') {
      scrollTop = offset - containerHeight + itemHeight;
    }
    
    this.container.scrollTop = Math.max(0, scrollTop);
    
    // 確保滾動後立即更新可見範圍並渲染
    if (!this.isMeasuring) {
      requestAnimationFrame(() => {
        this.calculateVisibleRange();
        this.render();
      });
    }
  }

  /**
   * 更新單個項目
   * @param {number} index - 項目索引
   * @param {Object} newData - 新數據
   */
  updateItem(index, newData) {
    if (index < 0 || index >= this.items.length) return;
    
    this.items[index] = newData;
    
    // 如果項目在可見範圍內，立即更新
    if (index >= this.visibleRange.start && index <= this.visibleRange.end) {
      this.render();
    }
  }

  /**
   * 插入項目
   * @param {number} index - 插入位置
   * @param {Object} item - 項目數據
   */
  insertItem(index, item) {
    this.items.splice(index, 0, item);
    
    // 更新後續項目的高度映射
    const newHeights = new Map();
    this.itemHeights.forEach((height, i) => {
      if (i >= index) {
        newHeights.set(i + 1, height);
      } else {
        newHeights.set(i, height);
      }
    });
    this.itemHeights = newHeights;
    
    // 重新計算並渲染
    if (this.isVirtualMode) {
      this.recalculateTotalHeight();
      this.calculateVisibleRange();
      this.render();
    } else {
      this.renderAllItems();
    }
  }

  /**
   * 刪除項目
   * @param {number} index - 項目索引
   */
  removeItem(index) {
    if (index < 0 || index >= this.items.length) return;
    
    this.items.splice(index, 1);
    
    // 更新後續項目的高度映射
    const newHeights = new Map();
    this.itemHeights.forEach((height, i) => {
      if (i > index) {
        newHeights.set(i - 1, height);
      } else if (i < index) {
        newHeights.set(i, height);
      }
    });
    this.itemHeights = newHeights;
    
    // 重新計算並渲染
    if (this.isVirtualMode) {
      this.recalculateTotalHeight();
      this.calculateVisibleRange();
      this.render();
    } else {
      this.renderAllItems();
    }
  }

  /**
   * 更新性能統計
   * @param {number} renderTime - 渲染時間
   */
  updateStats(renderTime) {
    this.stats.renderCount++;
    this.stats.lastRenderTime = renderTime;
    this.stats.averageRenderTime = 
      (this.stats.averageRenderTime * (this.stats.renderCount - 1) + renderTime) / 
      this.stats.renderCount;
  }

  /**
   * 獲取性能統計
   * @returns {Object} 性能統計數據
   */
  getStats() {
    return {
      ...this.stats,
      itemCount: this.items.length,
      visibleCount: this.visibleRange.end - this.visibleRange.start + 1,
      isVirtualMode: this.isVirtualMode
    };
  }

  /**
   * 強制重新渲染
   */
  forceRender() {
    if (this.isVirtualMode) {
      this.calculateVisibleRange();
      this.render();
    } else {
      this.renderAllItems();
    }
  }

  /**
   * 清理資源
   */
  destroy() {
    clearTimeout(this.scrollTimer);
    this.container.removeEventListener('scroll', this.handleScroll);
    this.container.innerHTML = '';
    this.items = [];
    this.itemHeights.clear();
  }
}

// 導出供外部使用
export default VirtualScrollManager;