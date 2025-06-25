/**
 * 浮動取消按鈕
 * 在處理大檔案時提供隨時可見的取消選項
 */

class FloatingCancelButton {
  constructor() {
    this.button = null;
    this.cancellationCallback = null;
  }

  /**
   * 顯示浮動取消按鈕
   * @param {Function} onCancel - 取消時的回調函數
   */
  show(onCancel) {
    // 如果已經有按鈕，先移除
    this.hide();

    // 創建按鈕容器
    const container = document.createElement('div');
    container.className = 'floating-cancel-container';
    container.style.cssText = `
      position: fixed;
      bottom: 30px;
      right: 30px;
      z-index: 10000;
      background: var(--bg-primary, #ffffff);
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      padding: 10px;
      display: flex;
      align-items: center;
      gap: 10px;
      animation: slideIn 0.3s ease-out;
    `;

    // 添加動畫
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideIn {
        from {
          transform: translateY(100px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }
      
      @keyframes pulse {
        0% { transform: scale(1); }
        50% { transform: scale(1.05); }
        100% { transform: scale(1); }
      }
      
      .floating-cancel-btn {
        background: #dc3545 !important;
        color: white !important;
        border: none !important;
        padding: 10px 20px !important;
        border-radius: 4px !important;
        cursor: pointer !important;
        font-weight: bold !important;
        transition: all 0.2s !important;
      }
      
      .floating-cancel-btn:hover {
        background: #c82333 !important;
        transform: scale(1.05);
      }
      
      .floating-cancel-btn:active {
        transform: scale(0.95);
      }
      
      .floating-status {
        color: var(--text-primary, #333);
        font-size: 14px;
        max-width: 200px;
      }
    `;
    document.head.appendChild(style);

    // 創建狀態文字
    const status = document.createElement('div');
    status.className = 'floating-status';
    status.textContent = '正在處理中...';

    // 創建取消按鈕
    const button = document.createElement('button');
    button.className = 'floating-cancel-btn';
    button.innerHTML = '🛑 取消操作';
    button.onclick = () => {
      if (onCancel) {
        onCancel();
      }
      this.hide();
    };

    // 組裝元素
    container.appendChild(status);
    container.appendChild(button);
    document.body.appendChild(container);

    // 保存引用
    this.button = container;
    this.cancellationCallback = onCancel;

    // 添加脈動效果提醒使用者
    setTimeout(() => {
      button.style.animation = 'pulse 1s ease-in-out 3';
    }, 1000);
  }

  /**
   * 更新狀態文字
   * @param {string} text - 新的狀態文字
   */
  updateStatus(text) {
    if (this.button) {
      const status = this.button.querySelector('.floating-status');
      if (status) {
        status.textContent = text;
      }
    }
  }

  /**
   * 隱藏浮動取消按鈕
   */
  hide() {
    if (this.button) {
      // 添加消失動畫
      this.button.style.animation = 'slideIn 0.3s ease-out reverse';
      setTimeout(() => {
        if (this.button && this.button.parentNode) {
          this.button.parentNode.removeChild(this.button);
        }
        this.button = null;
        this.cancellationCallback = null;
      }, 300);
    }
  }

  /**
   * 檢查是否正在顯示
   */
  isVisible() {
    return this.button !== null;
  }
}

// 導出單例
export const floatingCancelButton = new FloatingCancelButton();