/**
 * PWA 管理器
 * 處理 Service Worker 註冊、安裝提示、更新通知等
 */

class PWAManager {
  constructor() {
    this.swRegistration = null;
    this.deferredPrompt = null;
    this.isInstalled = false;
    this.isOnline = navigator.onLine;
    
    this.init();
  }

  /**
   * 初始化 PWA 功能
   */
  async init() {
    // 檢查 Service Worker 支援
    if ('serviceWorker' in navigator) {
      await this.registerServiceWorker();
    }
    
    // 監聽安裝提示
    this.setupInstallPrompt();
    
    // 監聽網路狀態
    this.setupNetworkListener();
    
    // 檢查是否已安裝
    this.checkInstallStatus();
    
    // 設置更新檢查
    this.setupUpdateCheck();
  }

  /**
   * 註冊 Service Worker
   */
  async registerServiceWorker() {
    try {
      this.swRegistration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('[PWA] Service Worker 註冊成功:', this.swRegistration.scope);
      
      // 監聽更新
      this.swRegistration.addEventListener('updatefound', () => {
        this.handleServiceWorkerUpdate();
      });
      
      // 監聽控制器變更
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[PWA] Service Worker 控制器已變更');
        this.showUpdateNotification();
      });
      
    } catch (error) {
      console.error('[PWA] Service Worker 註冊失敗:', error);
    }
  }

  /**
   * 處理 Service Worker 更新
   */
  handleServiceWorkerUpdate() {
    const newWorker = this.swRegistration.installing;
    
    newWorker.addEventListener('statechange', () => {
      if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
        // 有新版本可用
        this.showUpdateAvailableNotification();
      }
    });
  }

  /**
   * 設置安裝提示
   */
  setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      // 阻止預設的安裝提示
      e.preventDefault();
      
      // 保存事件以供後續使用
      this.deferredPrompt = e;
      
      // 顯示自訂安裝按鈕
      this.showInstallButton();
      
      console.log('[PWA] 安裝提示已準備好');
    });
    
    // 監聽應用安裝
    window.addEventListener('appinstalled', () => {
      console.log('[PWA] 應用已安裝');
      this.isInstalled = true;
      this.hideInstallButton();
      this.showInstalledNotification();
    });
  }

  /**
   * 設置網路狀態監聽
   */
  setupNetworkListener() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.showNetworkStatusNotification('已連線', 'success');
      console.log('[PWA] 網路已連線');
    });
    
    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.showNetworkStatusNotification('離線模式', 'warning');
      console.log('[PWA] 網路已離線');
    });
  }

  /**
   * 檢查安裝狀態
   */
  checkInstallStatus() {
    // 檢查是否在獨立模式運行（已安裝）
    if (window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true) {
      this.isInstalled = true;
      console.log('[PWA] 應用以獨立模式運行');
    }
  }

  /**
   * 設置更新檢查
   */
  setupUpdateCheck() {
    // 每 30 分鐘檢查一次更新
    setInterval(() => {
      this.checkForUpdates();
    }, 30 * 60 * 1000);
    
    // 頁面可見時檢查更新
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        this.checkForUpdates();
      }
    });
  }

  /**
   * 檢查應用更新
   */
  async checkForUpdates() {
    if (this.swRegistration) {
      try {
        await this.swRegistration.update();
        console.log('[PWA] 已檢查更新');
      } catch (error) {
        console.error('[PWA] 更新檢查失敗:', error);
      }
    }
  }

  /**
   * 顯示安裝按鈕
   */
  showInstallButton() {
    // 檢查是否已存在安裝按鈕
    if (document.getElementById('pwaInstallButton')) {
      return;
    }
    
    const installButton = document.createElement('button');
    installButton.id = 'pwaInstallButton';
    installButton.className = 'pwa-install-button';
    installButton.innerHTML = `
      <span class="pwa-install-icon">📱</span>
      <span class="pwa-install-text">安裝應用</span>
    `;
    
    installButton.addEventListener('click', () => {
      this.promptInstall();
    });
    
    // 添加到導航列
    const nav = document.querySelector('.app-nav');
    if (nav) {
      nav.appendChild(installButton);
    }
    
    // 顯示安裝橫幅
    setTimeout(() => {
      this.showInstallBanner();
    }, 3000);
  }

  /**
   * 隱藏安裝按鈕
   */
  hideInstallButton() {
    const installButton = document.getElementById('pwaInstallButton');
    if (installButton) {
      installButton.remove();
    }
    
    const installBanner = document.querySelector('.pwa-install-banner');
    if (installBanner) {
      installBanner.remove();
    }
  }

  /**
   * 顯示安裝橫幅
   */
  showInstallBanner() {
    if (this.isInstalled || document.querySelector('.pwa-install-banner')) {
      return;
    }
    
    const banner = document.createElement('div');
    banner.className = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pwa-banner-content">
        <div class="pwa-banner-info">
          <h3>安裝到桌面</h3>
          <p>享受更好的使用體驗，支援離線使用</p>
        </div>
        <div class="pwa-banner-actions">
          <button onclick="window.pwaManager.promptInstall()">安裝</button>
          <button onclick="this.parentElement.parentElement.remove()">關閉</button>
        </div>
      </div>
    `;
    
    const main = document.querySelector('.app-main');
    if (main) {
      main.insertBefore(banner, main.firstChild);
      
      // 3 秒後顯示動畫
      setTimeout(() => banner.classList.add('show'), 100);
    }
  }

  /**
   * 提示安裝
   */
  async promptInstall() {
    if (this.deferredPrompt) {
      // 顯示安裝提示
      this.deferredPrompt.prompt();
      
      // 等待使用者回應
      const result = await this.deferredPrompt.userChoice;
      
      if (result.outcome === 'accepted') {
        console.log('[PWA] 使用者接受安裝');
      } else {
        console.log('[PWA] 使用者拒絕安裝');
      }
      
      // 清理事件
      this.deferredPrompt = null;
      this.hideInstallButton();
    }
  }

  /**
   * 顯示更新可用通知
   */
  showUpdateAvailableNotification() {
    const notification = document.createElement('div');
    notification.className = 'pwa-update-notification show';
    notification.innerHTML = `
      <div class="pwa-notification-content">
        <h4>🎉 新版本可用</h4>
        <p>發現新版本，點擊更新以獲得最新功能</p>
        <div class="pwa-notification-actions">
          <button onclick="window.pwaManager.applyUpdate()">立即更新</button>
          <button onclick="this.parentElement.parentElement.remove()">稍後</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(notification);
    
    // 10 秒後自動隱藏
    setTimeout(() => {
      notification.remove();
    }, 10000);
  }

  /**
   * 顯示更新通知
   */
  showUpdateNotification() {
    if (window.notification) {
      window.notification.show('✅ 應用已更新', '新版本已安裝完成！', 'success');
    }
  }

  /**
   * 顯示安裝成功通知
   */
  showInstalledNotification() {
    if (window.notification) {
      window.notification.show('🎉 安裝成功', '應用已成功安裝到您的設備！', 'success');
    }
  }

  /**
   * 顯示網路狀態通知
   */
  showNetworkStatusNotification(message, type) {
    if (window.notification) {
      const icon = type === 'success' ? '🌐' : '📡';
      window.notification.show(`${icon} ${message}`, '', type, 2000);
    }
  }

  /**
   * 應用更新
   */
  async applyUpdate() {
    if (this.swRegistration && this.swRegistration.waiting) {
      // 向等待的 Service Worker 發送訊息
      this.swRegistration.waiting.postMessage({ type: 'SKIP_WAITING' });
    }
    
    // 移除通知
    const notification = document.querySelector('.pwa-update-notification');
    if (notification) {
      notification.remove();
    }
    
    // 重新載入頁面
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  /**
   * 獲取快取資訊
   */
  async getCacheInfo() {
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      const cacheInfo = {};
      
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        cacheInfo[name] = keys.length;
      }
      
      return cacheInfo;
    }
    return {};
  }

  /**
   * 清理快取
   */
  async clearCache() {
    if (this.swRegistration) {
      // 向 Service Worker 發送清理快取訊息
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data.success);
        };
        
        this.swRegistration.active.postMessage(
          { type: 'CLEAR_CACHE' },
          [messageChannel.port2]
        );
      });
    }
  }

  /**
   * 預快取資源
   */
  async precacheResources(urls) {
    if (this.swRegistration) {
      const messageChannel = new MessageChannel();
      
      return new Promise((resolve) => {
        messageChannel.port1.onmessage = (event) => {
          resolve(event.data.success);
        };
        
        this.swRegistration.active.postMessage(
          { type: 'CACHE_URLS', payload: { urls } },
          [messageChannel.port2]
        );
      });
    }
  }

  /**
   * 獲取應用狀態
   */
  getStatus() {
    return {
      isInstalled: this.isInstalled,
      isOnline: this.isOnline,
      hasServiceWorker: !!this.swRegistration,
      canInstall: !!this.deferredPrompt
    };
  }
}

// 創建全域實例
window.pwaManager = new PWAManager();

// 匯出供其他模組使用
if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWAManager;
}