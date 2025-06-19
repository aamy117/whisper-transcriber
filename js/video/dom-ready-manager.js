// DOM 載入狀態管理器
export class DOMReadyManager {
  constructor() {
    this.isReady = false;
    this.readyCallbacks = [];
    this.requiredElements = new Map();
    this.elementCache = new Map();
    this.initTime = Date.now();
    
    // 監聽 DOM 狀態變化
    this.setupDOMListeners();
  }
  
  /**
   * 設置 DOM 監聽器
   */
  setupDOMListeners() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.checkReadyState());
    }
    
    if (document.readyState !== 'complete') {
      window.addEventListener('load', () => this.checkReadyState());
    } else {
      // DOM 已經載入完成
      this.checkReadyState();
    }
  }
  
  /**
   * 檢查 DOM 就緒狀態
   */
  checkReadyState() {
    if (document.readyState === 'complete') {
      this.markAsReady();
    }
  }
  
  /**
   * 標記為就緒狀態
   */
  markAsReady() {
    if (this.isReady) return;
    
    this.isReady = true;
    const loadTime = Date.now() - this.initTime;
    console.log(`✅ DOM 載入完成，耗時: ${loadTime}ms`);
    
    // 執行所有等待中的回調
    this.readyCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('執行 DOM ready 回調時發生錯誤:', error);
      }
    });
    
    this.readyCallbacks = [];
  }
  
  /**
   * 註冊必要的 DOM 元素
   * @param {Array} elements - 元素配置陣列
   * @example
   * requireElements([
   *   { id: 'videoPlayer', optional: false },
   *   { id: 'playButton', optional: false },
   *   { id: 'debugPanel', optional: true }
   * ])
   */
  requireElements(elements) {
    elements.forEach(({ id, optional = false, selector = null }) => {
      this.requiredElements.set(id, { 
        id,
        selector: selector || `#${id}`,
        found: false, 
        optional,
        element: null
      });
    });
  }
  
  /**
   * 檢查所有必要元素是否存在
   * @returns {Object} 檢查結果
   */
  checkElements() {
    const results = {
      allFound: true,
      missing: [],
      found: [],
      optional: []
    };
    
    for (const [id, info] of this.requiredElements) {
      const element = document.querySelector(info.selector);
      info.found = !!element;
      info.element = element;
      
      if (element) {
        this.elementCache.set(id, element);
        results.found.push(id);
      } else if (info.optional) {
        results.optional.push(id);
      } else {
        results.allFound = false;
        results.missing.push(id);
      }
    }
    
    return results;
  }
  
  /**
   * 等待 DOM 就緒
   * @param {number} timeout - 超時時間（毫秒）
   * @returns {Promise<boolean>}
   */
  async waitForReady(timeout = 10000) {
    if (this.isReady) {
      return Promise.resolve(true);
    }
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`DOM 載入超時 (${timeout}ms)`));
      }, timeout);
      
      this.onReady(() => {
        clearTimeout(timeoutId);
        resolve(true);
      });
    });
  }
  
  /**
   * 註冊 DOM 就緒回調
   * @param {Function} callback - 回調函數
   */
  onReady(callback) {
    if (typeof callback !== 'function') {
      throw new Error('回調必須是函數');
    }
    
    if (this.isReady) {
      // DOM 已就緒，立即執行
      callback();
    } else {
      // 加入等待隊列
      this.readyCallbacks.push(callback);
    }
  }
  
  /**
   * 等待特定元素出現
   * @param {string} selector - 元素選擇器
   * @param {number} timeout - 超時時間
   * @returns {Promise<Element>}
   */
  async waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();
    
    return new Promise((resolve, reject) => {
      // 先檢查元素是否已存在
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }
      
      // 使用 MutationObserver 監聽 DOM 變化
      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        } else if (Date.now() - startTime > timeout) {
          obs.disconnect();
          reject(new Error(`等待元素 "${selector}" 超時`));
        }
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      // 設置超時
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`等待元素 "${selector}" 超時`));
      }, timeout);
    });
  }
  
  /**
   * 批量等待多個元素
   * @param {Array<string>} selectors - 選擇器陣列
   * @param {number} timeout - 超時時間
   * @returns {Promise<Map<string, Element>>}
   */
  async waitForElements(selectors, timeout = 5000) {
    const promises = selectors.map(selector => 
      this.waitForElement(selector, timeout)
        .then(element => ({ selector, element }))
        .catch(error => ({ selector, error }))
    );
    
    const results = await Promise.all(promises);
    const elementMap = new Map();
    
    results.forEach(({ selector, element, error }) => {
      if (element) {
        elementMap.set(selector, element);
      } else {
        console.warn(`無法找到元素: ${selector}`, error);
      }
    });
    
    return elementMap;
  }
  
  /**
   * 獲取快取的元素
   * @param {string} id - 元素 ID
   * @returns {Element|null}
   */
  getElement(id) {
    return this.elementCache.get(id) || null;
  }
  
  /**
   * 獲取所有快取的元素
   * @returns {Object} 元素映射對象
   */
  getAllElements() {
    const elements = {};
    for (const [id, element] of this.elementCache) {
      elements[id] = element;
    }
    return elements;
  }
  
  /**
   * 診斷 DOM 狀態
   * @returns {Object} 診斷資訊
   */
  diagnose() {
    const checkResult = this.checkElements();
    
    return {
      domReady: this.isReady,
      readyState: document.readyState,
      loadTime: this.isReady ? Date.now() - this.initTime : null,
      elements: {
        required: Array.from(this.requiredElements.keys()),
        found: checkResult.found,
        missing: checkResult.missing,
        optional: checkResult.optional,
        cached: Array.from(this.elementCache.keys())
      },
      callbacks: {
        pending: this.readyCallbacks.length
      }
    };
  }
  
  /**
   * 重置管理器狀態
   */
  reset() {
    this.isReady = false;
    this.readyCallbacks = [];
    this.requiredElements.clear();
    this.elementCache.clear();
    this.initTime = Date.now();
  }
}

// 創建單例實例
const domReadyManager = new DOMReadyManager();
export default domReadyManager;