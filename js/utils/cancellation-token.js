/**
 * 取消令牌類別 - 用於管理可取消的操作
 */
class CancellationToken {
  constructor() {
    this.isCancelled = false;
    this.cancellationReason = null;
    this.callbacks = new Set();
    this.abortController = new AbortController();
  }

  /**
   * 取消操作
   * @param {string} reason - 取消原因
   */
  cancel(reason = 'User cancelled operation') {
    if (this.isCancelled) return;

    this.isCancelled = true;
    this.cancellationReason = reason;
    this.abortController.abort();

    // 執行所有取消回調
    this.callbacks.forEach(callback => {
      try {
        callback(reason);
      } catch (error) {
        if (typeof DEBUG !== 'undefined' && DEBUG) {
          console.error('Error in cancellation callback:', error);
        }
      }
    });
  }

  /**
   * 註冊取消回調
   * @param {Function} callback - 取消時執行的回調
   * @returns {Function} - 用於取消註冊的函數
   */
  onCancelled(callback) {
    this.callbacks.add(callback);
    
    // 如果已經取消，立即執行回調
    if (this.isCancelled) {
      callback(this.cancellationReason);
    }

    // 返回取消註冊函數
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * 檢查是否已取消，如果已取消則拋出錯誤
   * @throws {Error} - 如果已取消
   */
  throwIfCancelled() {
    if (this.isCancelled) {
      const error = new Error(this.cancellationReason);
      error.name = 'CancellationError';
      throw error;
    }
  }

  /**
   * 獲取 AbortSignal 用於 fetch 等 API
   * @returns {AbortSignal}
   */
  get signal() {
    return this.abortController.signal;
  }

  /**
   * 創建子令牌 - 當父令牌取消時，子令牌也會被取消
   * @returns {CancellationToken}
   */
  createChild() {
    const child = new CancellationToken();
    
    this.onCancelled(reason => {
      child.cancel(`Parent cancelled: ${reason}`);
    });

    return child;
  }

  /**
   * 靜態方法：合併多個令牌
   * @param {...CancellationToken} tokens - 要合併的令牌
   * @returns {CancellationToken} - 新的令牌，當任一源令牌取消時會被取消
   */
  static merge(...tokens) {
    const merged = new CancellationToken();

    tokens.forEach(token => {
      if (token) {
        token.onCancelled(reason => {
          merged.cancel(reason);
        });
      }
    });

    return merged;
  }
}

// ES6 模組導出
export default CancellationToken;