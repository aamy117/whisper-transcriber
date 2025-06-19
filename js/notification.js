// 通知系統模組
export class NotificationSystem {
  constructor() {
    this.container = null;
    this.notifications = new Map();
    this.notificationId = 0;
    this.init();
  }
  
  init() {
    // 建立通知容器
    this.container = document.createElement('div');
    this.container.className = 'notification-container';
    this.container.setAttribute('aria-live', 'polite');
    this.container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(this.container);
    
    // 加入必要的樣式
    this.injectStyles();
  }
  
  injectStyles() {
    if (document.getElementById('notification-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'notification-styles';
    style.textContent = `
      .notification-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 9999;
        pointer-events: none;
      }
      
      .notification {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        margin-bottom: 10px;
        min-width: 300px;
        max-width: 500px;
        opacity: 0;
        transform: translateX(100%);
        transition: all 0.3s ease-out;
        pointer-events: all;
      }
      
      .notification.show {
        opacity: 1;
        transform: translateX(0);
      }
      
      .notification.hide {
        opacity: 0;
        transform: translateX(100%);
      }
      
      .notification-content {
        display: flex;
        align-items: flex-start;
        padding: 16px;
        gap: 12px;
      }
      
      .notification-icon {
        flex-shrink: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        font-size: 14px;
      }
      
      .notification-body {
        flex: 1;
        min-width: 0;
      }
      
      .notification-title {
        font-weight: 600;
        margin-bottom: 4px;
        color: #212529;
      }
      
      .notification-message {
        font-size: 14px;
        line-height: 1.5;
        color: #495057;
        word-wrap: break-word;
      }
      
      .notification-close {
        flex-shrink: 0;
        background: none;
        border: none;
        padding: 4px;
        cursor: pointer;
        color: #6c757d;
        font-size: 20px;
        line-height: 1;
        opacity: 0.5;
        transition: opacity 0.2s;
      }
      
      .notification-close:hover {
        opacity: 1;
      }
      
      /* 不同類型的樣式 */
      .notification-success {
        border-left: 4px solid #28a745;
      }
      
      .notification-success .notification-icon {
        background: #d4edda;
        color: #155724;
      }
      
      .notification-error {
        border-left: 4px solid #dc3545;
      }
      
      .notification-error .notification-icon {
        background: #f8d7da;
        color: #721c24;
      }
      
      .notification-warning {
        border-left: 4px solid #ffc107;
      }
      
      .notification-warning .notification-icon {
        background: #fff3cd;
        color: #856404;
      }
      
      .notification-info {
        border-left: 4px solid #17a2b8;
      }
      
      .notification-info .notification-icon {
        background: #d1ecf1;
        color: #0c5460;
      }
      
      /* 進度條 */
      .notification-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 3px;
        background: rgba(0, 0, 0, 0.1);
        overflow: hidden;
      }
      
      .notification-progress-bar {
        height: 100%;
        background: currentColor;
        transform-origin: left;
        animation: progress-countdown linear forwards;
      }
      
      @keyframes progress-countdown {
        from { transform: scaleX(1); }
        to { transform: scaleX(0); }
      }
      
      /* 響應式設計 */
      @media (max-width: 768px) {
        .notification-container {
          left: 10px;
          right: 10px;
          top: 10px;
        }
        
        .notification {
          min-width: auto;
          max-width: none;
        }
      }
      
      /* 深色模式支援 */
      [data-theme="dark"] .notification {
        background: #2b2b2b;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
      }
      
      [data-theme="dark"] .notification-title {
        color: #f8f9fa;
      }
      
      [data-theme="dark"] .notification-message {
        color: #adb5bd;
      }
      
      [data-theme="dark"] .notification-close {
        color: #adb5bd;
      }
    `;
    
    document.head.appendChild(style);
  }
  
  show(message, type = 'info', options = {}) {
    const {
      title = this.getDefaultTitle(type),
      duration = 5000,
      closable = true,
      progress = true
    } = options;
    
    const id = ++this.notificationId;
    const notification = this.createNotification({
      id,
      message,
      title,
      type,
      closable,
      progress: progress && duration > 0
    });
    
    // 加入容器
    this.container.appendChild(notification);
    this.notifications.set(id, { element: notification, timer: null });
    
    // 觸發顯示動畫
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    
    // 設定進度條動畫時間
    if (progress && duration > 0) {
      const progressBar = notification.querySelector('.notification-progress-bar');
      if (progressBar) {
        progressBar.style.animationDuration = `${duration}ms`;
      }
    }
    
    // 自動關閉
    if (duration > 0) {
      const timer = setTimeout(() => {
        this.close(id);
      }, duration);
      
      this.notifications.get(id).timer = timer;
    }
    
    return id;
  }
  
  createNotification({ id, message, title, type, closable, progress }) {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.setAttribute('role', 'alert');
    notification.dataset.notificationId = id;
    
    const icon = this.getIcon(type);
    
    notification.innerHTML = `
      <div class="notification-content">
        <div class="notification-icon">${icon}</div>
        <div class="notification-body">
          ${title ? `<div class="notification-title">${this.escapeHtml(title)}</div>` : ''}
          <div class="notification-message">${this.escapeHtml(message)}</div>
        </div>
        ${closable ? '<button class="notification-close" aria-label="關閉通知">&times;</button>' : ''}
      </div>
      ${progress ? '<div class="notification-progress"><div class="notification-progress-bar"></div></div>' : ''}
    `;
    
    // 綁定關閉按鈕
    if (closable) {
      const closeBtn = notification.querySelector('.notification-close');
      closeBtn.addEventListener('click', () => this.close(id));
    }
    
    return notification;
  }
  
  close(id) {
    const notification = this.notifications.get(id);
    if (!notification) return;
    
    const { element, timer } = notification;
    
    // 清除計時器
    if (timer) {
      clearTimeout(timer);
    }
    
    // 觸發隱藏動畫
    element.classList.remove('show');
    element.classList.add('hide');
    
    // 動畫結束後移除元素
    element.addEventListener('transitionend', () => {
      element.remove();
      this.notifications.delete(id);
    }, { once: true });
  }
  
  closeAll() {
    this.notifications.forEach((_, id) => {
      this.close(id);
    });
  }
  
  success(message, options = {}) {
    return this.show(message, 'success', options);
  }
  
  error(message, options = {}) {
    return this.show(message, 'error', { duration: 0, ...options });
  }
  
  warning(message, options = {}) {
    return this.show(message, 'warning', options);
  }
  
  info(message, options = {}) {
    return this.show(message, 'info', options);
  }
  
  getDefaultTitle(type) {
    const titles = {
      success: '成功',
      error: '錯誤',
      warning: '警告',
      info: '提示'
    };
    return titles[type] || '';
  }
  
  getIcon(type) {
    const icons = {
      success: '✓',
      error: '✕',
      warning: '!',
      info: 'i'
    };
    return icons[type] || 'i';
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 建立全域實例
export const notificationSystem = new NotificationSystem();

// 提供簡易 API
export const notify = {
  show: (message, type, options) => notificationSystem.show(message, type, options),
  success: (message, options) => notificationSystem.success(message, options),
  error: (message, options) => notificationSystem.error(message, options),
  warning: (message, options) => notificationSystem.warning(message, options),
  info: (message, options) => notificationSystem.info(message, options),
  closeAll: () => notificationSystem.closeAll()
};