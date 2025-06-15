// 視訊播放器主程式
import VideoConfig from './video-config.js';
import { VideoPlayer } from './video-player.js';
import { VideoUI } from './video-ui.js';

class VideoApp {
  constructor() {
    this.player = null;
    this.ui = null;
    this.currentProject = null;
    this.isInitialized = false;
    
    this.init();
  }
  
  async init() {
    // 等待 DOM 載入完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      await this.setup();
    }
  }
  
  async setup() {
    console.log('開始 setup...');
    
    try {
      // 初始化播放器
      const videoElement = document.getElementById('videoPlayer');
      console.log('視訊元素:', !!videoElement);
      
      if (!videoElement) {
        throw new Error('找不到視訊元素');
      }
      
      console.log('建立 VideoPlayer...');
      this.player = new VideoPlayer(videoElement);
      
      console.log('建立 VideoUI...');
      this.ui = new VideoUI(this.player);
      
      // 綁定事件
      console.log('綁定事件...');
      this.bindEvents();
      
      // 設定主題
      this.setupTheme();
        // 載入上次的專案（如果有）
      this.loadLastProject();
      
      // 啟用除錯模式（開發階段）
      this.enableDebugMode();
      
      this.isInitialized = true;
      console.log('✅ 視訊播放器初始化完成');
      
    } catch (error) {
      console.error('視訊播放器初始化失敗:', error);
      console.error('錯誤堆疊:', error.stack);
      // 暫時註解掉 showError 以避免額外錯誤
      // this.showError('播放器初始化失敗');
      alert(`初始化失敗: ${error.message}`);
    }
  }
  
  bindEvents() {
    console.log('開始綁定事件...');
    
    // 檔案選擇
    const fileInput = document.getElementById('videoInput');
    const selectBtn = document.getElementById('selectVideoBtn');
    const uploadArea = document.getElementById('videoUploadArea');
    
    console.log('元素檢查:', {
      fileInput: !!fileInput,
      selectBtn: !!selectBtn,
      uploadArea: !!uploadArea
    });
    
    if (!fileInput || !selectBtn || !uploadArea) {
      console.error('找不到必要的 DOM 元素');
      return;
    }
    
    selectBtn.addEventListener('click', () => {
      console.log('選擇按鈕被點擊');
      fileInput.click();
    });
    
    fileInput.addEventListener('change', (e) => {
      console.log('檔案選擇變更:', e.target.files);
      this.handleFileSelect(e.target.files);
    });
    
    // 拖放處理
    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.add('drag-over');
    });
    
    uploadArea.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.remove('drag-over');
    });
    
    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      uploadArea.classList.remove('drag-over');
      this.handleFileSelect(e.dataTransfer.files);
    });
    
    // 防止視窗拖放
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
    
    // 標籤切換
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
    
    // 主題切換
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => this.toggleTheme());
    }
    
    // 設定按鈕
    const settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.showSettings());
    }
    
    // 使用說明按鈕
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
      helpBtn.addEventListener('click', () => this.showHelp());
    }
    
    // 視窗大小變化
    window.addEventListener('resize', () => this.handleResize());
    
    // 頁面關閉前儲存狀態
    window.addEventListener('beforeunload', () => this.saveState());
    
    // 監聽播放器事件
    const video = this.player.video;
    video.addEventListener('video:loadeddata', () => this.handleVideoLoaded());
    video.addEventListener('video:error', (e) => this.handleVideoError(e.detail));
    video.addEventListener('video:warning', (e) => this.showWarning(e.detail.message));
  }
  
  async handleFileSelect(files) {
    if (!files || files.length === 0) return;
    
    const file = files[0];
    
    // 檢查是否為視訊檔案
    const extension = file.name.split('.').pop().toLowerCase();
    const videoExtensions = ['mp4', 'webm', 'ogg', 'ogv', 'mov', 'avi', 'mkv', 'm4v'];
    
    if (!file.type.startsWith('video/') && !videoExtensions.includes(extension)) {
      this.showError('請選擇視訊檔案');
      return;
    }
    
    try {
      // 載入視訊
      const info = await this.player.loadFile(file);
      
      // 顯示播放器
      this.ui.showPlayer();
      
      // 建立/更新專案
      this.currentProject = {
        id: `video_${Date.now()}`,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        duration: info.duration,
        resolution: `${info.width}×${info.height}`,
        lastModified: new Date().toISOString()
      };
      
      // 儲存專案
      this.saveProject();
      
      console.log('視訊載入成功:', info);
      
    } catch (error) {
      console.error('視訊載入失敗:', error);
      this.showError(error.message || '視訊載入失敗');
    }
  }
  
  handleVideoLoaded() {
    // 視訊載入完成後的處理
    console.log('視訊已載入');
  }
  
  handleVideoError(error) {
    console.error('視訊錯誤:', error);
    this.showError(error.error || '播放錯誤');
  }
  
  switchTab(tabName) {
    // 更新標籤按鈕狀態
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    
    // 切換面板內容
    document.querySelectorAll('.panel-content').forEach(panel => {
      panel.classList.add('hidden');
    });
    
    const targetPanel = document.getElementById(`${tabName}Panel`);
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
    }
  }
  
  // 主題管理
  setupTheme() {
    const savedTheme = localStorage.getItem('whisper_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
  }
  
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('whisper_theme', newTheme);
  }
  
  // 顯示設定對話框
  showSettings() {
    const modal = this.createModal('設定', `
      <div class="settings-content" style="padding: 20px;">
        <h3 style="margin-bottom: 20px;">播放器設定</h3>
        
        <div class="setting-item" style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">預設播放速度</label>
          <select id="defaultSpeed" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px;">
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1" selected>1x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
            <option value="2">2x</option>
          </select>
        </div>
        
        <div class="setting-item" style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">自動播放</label>
          <input type="checkbox" id="autoPlay" style="margin-right: 10px;">
          <span>載入影片後自動播放</span>
        </div>
        
        <div class="setting-item" style="margin-bottom: 15px;">
          <label style="display: block; margin-bottom: 5px;">鍵盤快捷鍵</label>
          <input type="checkbox" id="enableShortcuts" checked style="margin-right: 10px;">
          <span>啟用鍵盤快捷鍵</span>
        </div>
        
        <div class="button-group" style="margin-top: 20px; text-align: right;">
          <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">取消</button>
          <button class="btn btn-primary" style="margin-left: 10px;" onclick="window.videoApp.saveSettings()">儲存</button>
        </div>
      </div>
    `);
    
    document.body.appendChild(modal);
    
    // 載入設定值
    const settings = this.loadSettings();
    if (settings) {
      document.getElementById('defaultSpeed').value = settings.defaultSpeed || '1';
      document.getElementById('autoPlay').checked = settings.autoPlay || false;
      document.getElementById('enableShortcuts').checked = settings.enableShortcuts !== false;
    }
  }
  
  // 顯示使用說明
  showHelp() {
    // 檢查瀏覽器支援
    const browserSupport = VideoPlayer.checkBrowserSupport ? VideoPlayer.checkBrowserSupport() : {};
    let supportInfo = '<ul style="margin-left: 20px;">';
    for (const [format, support] of Object.entries(browserSupport)) {
      const icon = support === 'probably' ? '✅' : support === 'maybe' ? '⚠️' : '❌';
      supportInfo += `<li>${icon} ${format}: ${support}</li>`;
    }
    supportInfo += '</ul>';
    
    const modal = this.createModal('使用說明', `
      <div class="help-content" style="padding: 20px; max-height: 60vh; overflow-y: auto;">
        <h3 style="margin-bottom: 20px;">視訊播放器使用說明</h3>
        
        <section style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 10px;">🎬 基本操作</h4>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li>拖放影片檔案或點擊選擇檔案按鈕上傳</li>
            <li>支援 MP4、WebM、OGG/OGV 格式</li>
            <li>點擊播放按鈕或按空白鍵播放/暫停</li>
            <li>拖動進度條跳轉到指定時間</li>
          </ul>
        </section>
        
        <section style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 10px;">📹 支援的視訊格式</h4>
          <p style="margin-bottom: 10px;">您的瀏覽器支援以下格式：</p>
          ${supportInfo}
          <p style="margin-top: 10px; font-size: 14px; color: #666;">
            <strong>建議：</strong>使用 MP4 (H.264) 格式以獲得最佳相容性
          </p>
        </section>
        
        <section style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 10px;">⌨️ 鍵盤快捷鍵</h4>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><kbd>空白鍵</kbd> - 播放/暫停</li>
            <li><kbd>←</kbd> / <kbd>→</kbd> - 快退/快進 5 秒</li>
            <li><kbd>↑</kbd> / <kbd>↓</kbd> - 增加/減少音量</li>
            <li><kbd>M</kbd> - 靜音/取消靜音</li>
            <li><kbd>F</kbd> - 全螢幕/退出全螢幕</li>
            <li><kbd>0-9</kbd> - 跳轉到相應百分比位置</li>
          </ul>
        </section>
        
        <section style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 10px;">🎛️ 進階功能</h4>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><strong>播放速度調整</strong> - 點擊速度按鈕選擇 0.5x 到 2x</li>
            <li><strong>音量控制</strong> - 拖動音量滑桿或使用鍵盤調整</li>
            <li><strong>全螢幕模式</strong> - 雙擊影片或按 F 鍵進入全螢幕</li>
            <li><strong>影片資訊</strong> - 右側面板顯示檔案資訊</li>
          </ul>
        </section>
        
        <section style="margin-bottom: 20px;">
          <h4 style="margin-bottom: 10px;">💡 提示</h4>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li>瀏覽器會自動記住音量設定</li>
            <li>支援拖放多個檔案，但只會載入第一個</li>
            <li>在全螢幕模式下，移動滑鼠顯示控制列</li>
          </ul>
        </section>
        
        <div style="margin-top: 30px; text-align: center;">
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">關閉</button>
        </div>
      </div>
    `);
    
    document.body.appendChild(modal);
  }
  
  // 建立 Modal
  createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease-out;
    `;
    
    const modalContent = document.createElement('div');
    modalContent.className = 'modal-content';
    modalContent.style.cssText = `
      background: var(--bg-primary, white);
      color: var(--text-primary, #333);
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      animation: slideUp 0.3s ease-out;
    `;
    
    modalContent.innerHTML = `
      <div class="modal-header" style="padding: 20px; border-bottom: 1px solid var(--border-color, #eee);">
        <h2 style="margin: 0; font-size: 24px;">${title}</h2>
        <button class="modal-close" style="position: absolute; top: 20px; right: 20px; background: none; border: none; font-size: 24px; cursor: pointer; color: var(--text-secondary, #666);" onclick="this.closest('.modal-overlay').remove()">×</button>
      </div>
      <div class="modal-body">
        ${content}
      </div>
    `;
    
    modal.appendChild(modalContent);
    
    // 點擊背景關閉
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.remove();
      }
    });
    
    return modal;
  }
  
  // 儲存設定
  saveSettings() {
    const settings = {
      defaultSpeed: document.getElementById('defaultSpeed').value,
      autoPlay: document.getElementById('autoPlay').checked,
      enableShortcuts: document.getElementById('enableShortcuts').checked
    };
    
    localStorage.setItem('video_player_settings', JSON.stringify(settings));
    this.showNotification(this.createNotification('設定已儲存', 'info'));
    
    // 關閉 Modal
    document.querySelector('.modal-overlay').remove();
  }
  
  // 載入設定
  loadSettings() {
    const settingsStr = localStorage.getItem('video_player_settings');
    if (settingsStr) {
      try {
        return JSON.parse(settingsStr);
      } catch (error) {
        console.error('載入設定失敗:', error);
      }
    }
    return null;
  }
  
  // 響應式處理
  handleResize() {
    // 可以在這裡處理視窗大小變化的邏輯
    const width = window.innerWidth;
    
    if (width < VideoConfig.ui.breakpoints.tablet) {
      // 移動端調整
      document.querySelector('.video-layout').classList.add('mobile');
    } else {
      document.querySelector('.video-layout').classList.remove('mobile');
    }
  }
  
  // 專案管理
  saveProject() {
    if (!this.currentProject) return;
    
    const key = `${VideoConfig.storage.prefix}${this.currentProject.id}`;
    localStorage.setItem(key, JSON.stringify(this.currentProject));
    
    // 儲存為最後的專案
    localStorage.setItem(`${VideoConfig.storage.prefix}lastProjectId`, this.currentProject.id);
  }
    loadLastProject() {
    const lastProjectId = localStorage.getItem(`${VideoConfig.storage.prefix}lastProjectId`);
    if (!lastProjectId) return;
    
    const key = `${VideoConfig.storage.prefix}${lastProjectId}`;
    const projectData = localStorage.getItem(key);
    
    if (projectData) {
      try {
        this.currentProject = JSON.parse(projectData);
        console.log('載入上次的專案:', this.currentProject);
        
        // 更新 UI 顯示專案資訊
        // this.updateProjectInfo(); // TODO: 實作此函數或移除
        
        // 顯示提示訊息
        const notification = this.createNotification(
          `發現上次的專案：${this.currentProject.fileName}。請重新選擇檔案開始播放。`, 
          'info'
        );
        
        // 延遲顯示，確保 DOM 已載入
        setTimeout(() => {
          this.showNotification(notification);
        }, 1000);
        
      } catch (error) {
        console.error('載入專案失敗:', error);
        // 清除無效的專案資料
        localStorage.removeItem(key);
        localStorage.removeItem(`${VideoConfig.storage.prefix}lastProjectId`);
      }
    }
  }
  
  saveState() {
    // 儲存當前播放狀態
    if (this.player && this.currentProject) {
      const state = this.player.getState();
      this.currentProject.lastState = state;
      this.saveProject();
    }
  }
  
  // 錯誤和警告處理
  showError(message) {
    console.error(message);
    // TODO: 實作更好的錯誤提示 UI
    const notification = this.createNotification(message, 'error');
    this.showNotification(notification);
  }
  
  showWarning(message) {
    console.warn(message);
    const notification = this.createNotification(message, 'warning');
    this.showNotification(notification);
  }
  
  createNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6'};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    return notification;
  }
  
  showNotification(notification) {
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
  // 格式化檔案大小
  formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
  }

    // 除錯模式
  enableDebugMode() {
    window.videoDebug = {
      app: this,
      player: this.player,
      ui: this.ui,
      config: VideoConfig,
      
      // 測試方法
      loadTestVideo: async () => {
        // 使用線上測試視訊
        const testVideoUrl = 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4';
        console.log('載入測試視訊:', testVideoUrl);
        
        try {
          // 建立測試檔案物件
          const response = await fetch(testVideoUrl);
          const blob = await response.blob();
          const file = new File([blob], 'test-video.mp4', { type: 'video/mp4' });
          await this.handleFileSelect([file]);
        } catch (error) {
          console.error('載入測試視訊失敗:', error);
        }
      },
      
      // 檢查瀏覽器支援
      checkSupport: () => {
        return VideoPlayer.checkBrowserSupport();
      },
        // 診斷視訊狀態
      diagnose: () => {
        if (!this.player || !this.player.video) {
          console.error('播放器未初始化');
          return;
        }
        
        const video = this.player.video;
        console.log('=== 視訊診斷資訊 ===');
        console.log('視訊元素:', video);
        console.log('視訊源:', video.src);
        console.log('當前時間:', video.currentTime);
        console.log('總時長:', video.duration);
        console.log('視訊寬度:', video.videoWidth);
        console.log('視訊高度:', video.videoHeight);
        console.log('客戶端寬度:', video.clientWidth);
        console.log('客戶端高度:', video.clientHeight);
        console.log('就緒狀態:', video.readyState);
        console.log('網路狀態:', video.networkState);
        console.log('是否暫停:', video.paused);
        console.log('音量:', video.volume);
        console.log('是否靜音:', video.muted);
        console.log('播放速率:', video.playbackRate);
        console.log('錯誤:', video.error);
        
        // 檢查緩衝區
        if (video.buffered.length > 0) {
          console.log('緩衝區:');
          for (let i = 0; i < video.buffered.length; i++) {
            console.log(`  區段 ${i}: ${video.buffered.start(i).toFixed(2)}s - ${video.buffered.end(i).toFixed(2)}s`);
          }
        }
        
        // 檢查計算樣式
        const computedStyle = window.getComputedStyle(video);
        console.log('顯示樣式:', computedStyle.display);
        console.log('可見性:', computedStyle.visibility);
        console.log('透明度:', computedStyle.opacity);
        console.log('位置:', computedStyle.position);
        
        // 檢查父元素
        const wrapper = video.parentElement;
        if (wrapper) {
          const wrapperStyle = window.getComputedStyle(wrapper);
          console.log('容器尺寸:', wrapper.clientWidth + 'x' + wrapper.clientHeight);
          console.log('容器顯示:', wrapperStyle.display);
        }
        
        return {
          ready: video.readyState >= 2,
          hasVideo: video.videoWidth > 0 && video.videoHeight > 0,
          visible: computedStyle.display !== 'none' && computedStyle.visibility !== 'hidden'
        };
      },
      
      // 測試檔案
      testFile: (file) => {
        console.log('=== 檔案測試 ===');
        console.log('檔案名稱:', file.name);
        console.log('檔案大小:', app.formatFileSize(file.size));
        console.log('MIME 類型:', file.type);
        
        // 檢查檔案大小分類
        const sizeCategory = 
          file.size > 5 * 1024 * 1024 * 1024 ? '超大檔案 (>5GB)' :
          file.size > 2 * 1024 * 1024 * 1024 ? '大檔案 (>2GB)' :
          file.size > 500 * 1024 * 1024 ? '中型檔案 (>500MB)' :
          '小檔案 (<500MB)';
        
        console.log('檔案分類:', sizeCategory);
        
        // 檢查是否會使用串流
        const willUseStreaming = VideoConfig.streaming.enabled && (
          file.size >= VideoConfig.streaming.threshold ||
          file.size > VideoConfig.file.warnSize
        );
        
        console.log('載入策略:', willUseStreaming ? '串流模式' : '傳統模式');
        
        // 檢查支援
        const video = document.createElement('video');
        const support = video.canPlayType(file.type);
        console.log('瀏覽器支援:', support || '不支援');
        
        // 記憶體估算
        const estimatedMemory = file.size / (1024 * 1024); // MB
        const memoryWarning = estimatedMemory > 1024 ? 
          `⚠️ 可能使用超過 ${Math.round(estimatedMemory)}MB 記憶體` : 
          `✅ 預估記憶體使用: ${Math.round(estimatedMemory)}MB`;
        
        console.log('記憶體評估:', memoryWarning);
        
        return {
          name: file.name,
          size: file.size,
          sizeFormatted: app.formatFileSize(file.size),
          type: file.type,
          category: sizeCategory,
          support: support,
          willUseStreaming: willUseStreaming,
          estimatedMemoryMB: Math.round(estimatedMemory)
        };
      },
      
      // 清除專案
      clearProjects: () => {
        const keys = Object.keys(localStorage).filter(key => 
          key.startsWith(VideoConfig.storage.prefix)
        );
        keys.forEach(key => localStorage.removeItem(key));
        console.log(`清除了 ${keys.length} 個專案`);
        window.location.reload();
      },
      
      getState: () => {
        return {
          app: this.currentProject,
          player: this.player?.getState(),
          ui: this.ui?.state
        };
      }
    };
    
    console.log('🔧 除錯模式已啟用');
    console.log('📝 可用方法:');
    console.log('  videoDebug.checkSupport() - 檢查瀏覽器支援');
    console.log('  videoDebug.testFile(file) - 測試檔案類型檢測');
    console.log('  videoDebug.loadTestVideo() - 載入線上測試視訊');
    console.log('  videoDebug.clearProjects() - 清除所有專案');
    console.log('  videoDebug.getState() - 獲取當前狀態');
  }
}

// 加入動畫樣式
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
  
  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  
  @keyframes slideUp {
    from {
      transform: translateY(20px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  
  /* Modal 按鈕樣式 */
  .btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover {
    background: #2563eb;
  }
  
  .btn-secondary {
    background: #e5e7eb;
    color: #374151;
  }
  
  .btn-secondary:hover {
    background: #d1d5db;
  }
  
  /* 深色模式下的 Modal 樣式 */
  [data-theme="dark"] .modal-content {
    background: #1f2937;
    color: #f3f4f6;
  }
  
  [data-theme="dark"] .modal-header {
    border-color: #374151;
  }
  
  [data-theme="dark"] .btn-secondary {
    background: #374151;
    color: #f3f4f6;
  }
  
  [data-theme="dark"] .btn-secondary:hover {
    background: #4b5563;
  }
  
  [data-theme="dark"] select,
  [data-theme="dark"] input[type="checkbox"] {
    background: #374151;
    color: #f3f4f6;
    border-color: #4b5563;
  }
  
  /* kbd 樣式 */
  kbd {
    display: inline-block;
    padding: 2px 6px;
    font-size: 12px;
    font-family: monospace;
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
  }
  
  [data-theme="dark"] kbd {
    background: #374151;
    border-color: #4b5563;
    color: #f3f4f6;
  }
  
  /* 移動端樣式調整 */
  .video-layout.mobile {
    grid-template-columns: 1fr;
  }
  
  .video-layout.mobile .side-panel {
    height: 300px;
  }
`;
document.head.appendChild(style);

// 初始化應用程式
const app = new VideoApp();

// 匯出給全域使用
window.videoApp = app;

export default app;