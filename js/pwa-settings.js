/**
 * PWA 設定組件
 * 顯示 PWA 狀態、快取管理、安裝選項等
 */

class PWASettings {
  constructor() {
    this.pwaManager = window.pwaManager;
  }

  /**
   * 顯示 PWA 設定對話框
   */
  async show() {
    const status = this.pwaManager.getStatus();
    const cacheInfo = await this.pwaManager.getCacheInfo();
    
    const dialog = document.createElement('div');
    dialog.className = 'dialog-overlay';
    dialog.innerHTML = `
      <div class="dialog-content pwa-settings-dialog">
        <div class="dialog-header">
          <h2>PWA 設定</h2>
          <button class="dialog-close" onclick="this.closest('.dialog-overlay').remove()">×</button>
        </div>
        <div class="dialog-body">
          ${this.renderStatusPanel(status)}
          ${this.renderCachePanel(cacheInfo)}
          ${this.renderControlPanel(status)}
        </div>
      </div>
    `;
    
    document.body.appendChild(dialog);
    
    // 綁定事件
    this.bindEvents(dialog);
  }

  /**
   * 渲染狀態面板
   */
  renderStatusPanel(status) {
    return `
      <div class="pwa-status-panel">
        <h3 class="pwa-status-title">📱 應用狀態</h3>
        <div class="pwa-status-grid">
          <div class="pwa-status-item">
            <span class="pwa-status-icon">📲</span>
            <span class="pwa-status-label">安裝狀態：</span>
            <span class="pwa-status-value ${status.isInstalled ? 'success' : 'warning'}">
              ${status.isInstalled ? '已安裝' : '未安裝'}
            </span>
          </div>
          <div class="pwa-status-item">
            <span class="pwa-status-icon">🌐</span>
            <span class="pwa-status-label">網路狀態：</span>
            <span class="pwa-status-value ${status.isOnline ? 'success' : 'error'}">
              ${status.isOnline ? '已連線' : '離線'}
            </span>
          </div>
          <div class="pwa-status-item">
            <span class="pwa-status-icon">⚙️</span>
            <span class="pwa-status-label">Service Worker：</span>
            <span class="pwa-status-value ${status.hasServiceWorker ? 'success' : 'error'}">
              ${status.hasServiceWorker ? '已啟用' : '未啟用'}
            </span>
          </div>
          <div class="pwa-status-item">
            <span class="pwa-status-icon">💾</span>
            <span class="pwa-status-label">可安裝：</span>
            <span class="pwa-status-value ${status.canInstall ? 'success' : 'warning'}">
              ${status.canInstall ? '是' : '否'}
            </span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * 渲染快取面板
   */
  renderCachePanel(cacheInfo) {
    const cacheEntries = Object.entries(cacheInfo);
    const totalFiles = Object.values(cacheInfo).reduce((sum, count) => sum + count, 0);
    
    return `
      <div class="pwa-status-panel">
        <h3 class="pwa-status-title">💾 快取管理</h3>
        <div class="pwa-status-item">
          <span class="pwa-status-icon">📊</span>
          <span class="pwa-status-label">已快取檔案：</span>
          <span class="pwa-status-value">${totalFiles} 個</span>
        </div>
        ${cacheEntries.length > 0 ? `
          <table class="pwa-cache-table">
            <thead>
              <tr>
                <th>快取名稱</th>
                <th>檔案數量</th>
              </tr>
            </thead>
            <tbody>
              ${cacheEntries.map(([name, count]) => `
                <tr>
                  <td>${name}</td>
                  <td>${count}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        ` : '<p style="margin: 12px 0; color: var(--text-secondary);">沒有快取資料</p>'}
      </div>
    `;
  }

  /**
   * 渲染控制面板
   */
  renderControlPanel(status) {
    const installButton = status.canInstall ? 
      '<button class="pwa-control-btn primary" data-action="install">📱 安裝應用</button>' : '';
    
    const installHint = status.isInstalled ? 
      '<p style="margin: 8px 0; color: var(--text-secondary); font-size: 14px;">💡 應用已安裝，您可以從桌面或應用選單啟動</p>' : 
      !status.canInstall ? '<p style="margin: 8px 0; color: var(--text-secondary); font-size: 14px;">💡 瀏覽器不支援安裝或已安裝</p>' : '';
    
    return `
      <div class="pwa-status-panel">
        <h3 class="pwa-status-title">🔧 控制選項</h3>
        <div class="pwa-controls">
          ${installButton}
          <button class="pwa-control-btn" data-action="update">🔄 檢查更新</button>
          <button class="pwa-control-btn" data-action="refresh">♻️ 重新載入</button>
          <button class="pwa-control-btn danger" data-action="clear-cache">🗑️ 清除快取</button>
        </div>
        ${installHint}
      </div>
    `;
  }

  /**
   * 綁定事件
   */
  bindEvents(dialog) {
    const buttons = dialog.querySelectorAll('[data-action]');
    
    buttons.forEach(button => {
      button.addEventListener('click', async (e) => {
        const action = e.target.dataset.action;
        await this.handleAction(action, dialog);
      });
    });
  }

  /**
   * 處理操作
   */
  async handleAction(action, dialog) {
    switch (action) {
      case 'install':
        await this.pwaManager.promptInstall();
        dialog.remove();
        break;
        
      case 'update':
        await this.pwaManager.checkForUpdates();
        if (window.notification) {
          window.notification.show('✅ 檢查完成', '已檢查最新版本', 'success');
        }
        break;
        
      case 'refresh':
        window.location.reload();
        break;
        
      case 'clear-cache':
        if (await this.confirmClearCache()) {
          await this.pwaManager.clearCache();
          if (window.notification) {
            window.notification.show('✅ 清除完成', '快取已清除，建議重新載入', 'success');
          }
          // 重新渲染快取面板
          setTimeout(() => this.refreshCachePanel(dialog), 500);
        }
        break;
    }
  }

  /**
   * 確認清除快取
   */
  async confirmClearCache() {
    return new Promise((resolve) => {
      if (window.dialog) {
        window.dialog.confirm(
          '確認清除快取？',
          '這將清除所有已快取的檔案，下次載入可能需要更多時間。',
          (confirmed) => resolve(confirmed)
        );
      } else {
        resolve(confirm('確認清除所有快取檔案嗎？'));
      }
    });
  }

  /**
   * 重新整理快取面板
   */
  async refreshCachePanel(dialog) {
    const cacheInfo = await this.pwaManager.getCacheInfo();
    const cachePanel = dialog.querySelector('.pwa-status-panel:nth-child(2)');
    if (cachePanel) {
      cachePanel.innerHTML = this.renderCachePanel(cacheInfo).match(/<div class="pwa-status-panel">([\s\S]*)<\/div>/)[1];
    }
  }
}

// 匯出供其他模組使用
window.PWASettings = PWASettings;

if (typeof module !== 'undefined' && module.exports) {
  module.exports = PWASettings;
}