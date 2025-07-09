// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

// 改進的視訊播放器主程式
import VideoConfig from './video-config.js';
import { VideoPlayer } from './video-player.js';
import { VideoUI } from './video-ui.js';
import domReadyManager from './dom-ready-manager.js';
import { VideoFeaturesIntegration } from './video-features-integration.js';

class VideoApp {
  constructor() {
    this.player = null;
    this.ui = null;
    this.features = null;
    this.currentProject = null;
    this.isInitialized = false;
    this.initPromise = null;

    // 初始化階段追蹤
    this.initStages = {
      domReady: false,
      playerCreated: false,
      uiCreated: false,
      uiInitialized: false,
      eventsBinding: false,
      completed: false
    };

    // 開始初始化
    this.init();
  }

  async init() {
    // 確保只初始化一次
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this.performInit();
    return this.initPromise;
  }

  async performInit() {
    DEBUG && console.log('🚀 開始 VideoApp 初始化流程...');
    const startTime = Date.now();

    try {
      // 階段 1: 等待 DOM 載入
      await this.waitForDOM();

      // 階段 2: 創建播放器和 UI
      await this.createComponents();

      // 階段 3: 初始化 UI
      await this.initializeUI();

      // 階段 4: 綁定應用程式事件
      await this.bindAppEvents();

      // 階段 5: 完成初始化
      await this.completeInitialization();

      const totalTime = Date.now() - startTime;
      DEBUG && console.log(`✅ VideoApp 初始化完成！總耗時: ${totalTime}ms`);

      return { success: true, time: totalTime };

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('❌ VideoApp 初始化失敗:', error);
      this.handleInitError(error);
      return { success: false, error };
    }
  }

  /**
   * 階段 1: 等待 DOM 載入
   */
  async waitForDOM() {
    DEBUG && console.log('📄 階段 1: 等待 DOM 載入...');

    try {
      await domReadyManager.waitForReady(10000);
      this.initStages.domReady = true;
      DEBUG && console.log('✅ DOM 載入完成');
    } catch (error) {
      throw new Error(`DOM 載入失敗: ${error.message}`);
    }
  }

  /**
   * 階段 2: 創建核心組件
   */
  async createComponents() {
    DEBUG && console.log('🔧 階段 2: 創建核心組件...');

    // 獲取視訊元素
    const videoElement = document.getElementById('videoPlayer');
    if (!videoElement) {
      throw new Error('找不到視訊元素 #videoPlayer');
    }

    try {
      // 創建播放器
      DEBUG && console.log('  創建 VideoPlayer...');
      this.player = new VideoPlayer(videoElement);
      this.initStages.playerCreated = true;

      // 創建 UI（但還不初始化）
      DEBUG && console.log('  創建 VideoUI...');
      this.ui = new VideoUI(this.player);
      this.initStages.uiCreated = true;

      // 創建新功能整合（字幕搜尋和時間標記）
      DEBUG && console.log('  創建 VideoFeaturesIntegration...');
      this.features = new VideoFeaturesIntegration(videoElement);
      
      DEBUG && console.log('✅ 核心組件創建完成');
    } catch (error) {
      throw new Error(`組件創建失敗: ${error.message}`);
    }
  }

  /**
   * 階段 3: 初始化 UI
   */
  async initializeUI() {
    DEBUG && console.log('🎨 階段 3: 初始化 UI...');

    if (!this.ui) {
      throw new Error('UI 組件未創建');
    }

    const uiResult = await this.ui.initialize();

    if (!uiResult.success) {
      // UI 初始化失敗，但可能可以重試
      if (uiResult.canRetry) {
        DEBUG && console.warn('⚠️ UI 初始化失敗，嘗試重試...');
        const retryResult = await this.ui.retry();
        if (!retryResult.success) {
          throw new Error(`UI 初始化失敗: ${retryResult.error}`);
        }
      } else {
        throw new Error(`UI 初始化失敗: ${uiResult.error}`);
      }
    }

    this.initStages.uiInitialized = true;
    DEBUG && console.log('✅ UI 初始化完成');
  }

  /**
   * 階段 4: 綁定應用程式級事件
   */
  async bindAppEvents() {
    DEBUG && console.log('🔗 階段 4: 綁定應用程式事件...');

    try {
      // 檔案選擇
      this.bindFileHandlers();

      // 標籤切換
      this.bindTabHandlers();

      // 主題和設定
      this.bindUIHandlers();

      // 視窗事件
      this.bindWindowHandlers();

      // 播放器事件
      this.bindPlayerHandlers();

      this.initStages.eventsBinding = true;
      DEBUG && console.log('✅ 事件綁定完成');
    } catch (error) {
      throw new Error(`事件綁定失敗: ${error.message}`);
    }
  }

  /**
   * 階段 5: 完成初始化
   */
  async completeInitialization() {
    DEBUG && console.log('🏁 階段 5: 完成初始化...');

    // 設定主題
    this.setupTheme();

    // 載入上次的專案
    this.loadLastProject();

    // 啟用除錯模式
    this.enableDebugMode();

    // 標記完成
    this.isInitialized = true;
    this.initStages.completed = true;

    // 發送初始化完成事件
    window.dispatchEvent(new CustomEvent('videoapp:initialized', {
      detail: { stages: this.initStages }
    }));

    DEBUG && console.log('✅ 所有初始化階段完成');
  }

  /**
   * 處理初始化錯誤
   */
  handleInitError(error) {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error('初始化錯誤詳情:', {
      message: error.message,
      stack: error.stack,
      stages: this.initStages
    });

    // 顯示錯誤訊息給用戶
    this.showInitError(error);

    // 提供診斷資訊
    DEBUG && console.log('診斷資訊:');
    DEBUG && console.log('- DOM 狀態:', domReadyManager.diagnose());
    DEBUG && console.log('- 初始化階段:', this.initStages);

    if (this.ui) {
      DEBUG && console.log('- UI 診斷:', this.ui.diagnose());
    }
  }

  /**
   * 顯示初始化錯誤
   */
  showInitError(error) {
    // 創建錯誤提示元素
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #fff;
      padding: 30px;
      border-radius: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.2);
      max-width: 500px;
      z-index: 10000;
      text-align: center;
    `;

    errorDiv.innerHTML = `
      <h2 style="color: #e74c3c; margin-bottom: 20px;">初始化錯誤</h2>
      <p style="margin-bottom: 20px;">${error.message}</p>
      <details style="text-align: left; margin-bottom: 20px;">
        <summary style="cursor: pointer; margin-bottom: 10px;">詳細資訊</summary>
        <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow-x: auto; font-size: 12px;">
初始化階段:
${JSON.stringify(this.initStages, null, 2)}

錯誤堆疊:
${error.stack}
        </pre>
      </details>
      <button onclick="location.reload()" style="
        background: #3b82f6;
        color: white;
        border: none;
        padding: 10px 20px;
        border-radius: 5px;
        cursor: pointer;
        font-size: 16px;
      ">重新載入</button>
    `;

    document.body.appendChild(errorDiv);
  }

  // ========== 事件綁定方法 ==========

  bindFileHandlers() {
    const fileInput = document.getElementById('videoInput');
    const selectBtn = document.getElementById('selectVideoBtn');
    const uploadArea = document.getElementById('videoUploadArea');

    if (!fileInput || !selectBtn || !uploadArea) {
      DEBUG && console.warn('部分檔案處理元素不存在');
      return;
    }

    selectBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e.target.files));

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
  }

  bindTabHandlers() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));
    });
  }

  bindUIHandlers() {
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    const settingsBtn = document.getElementById('settingsBtn');
    const helpBtn = document.getElementById('helpBtn');

    themeToggleBtn?.addEventListener('click', () => this.toggleTheme());
    settingsBtn?.addEventListener('click', () => this.showSettings());
    helpBtn?.addEventListener('click', () => this.showHelp());
  }

  bindWindowHandlers() {
    window.addEventListener('resize', () => this.handleResize());
    window.addEventListener('beforeunload', () => this.saveState());

    // 防止視窗拖放
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => e.preventDefault());
  }

  bindPlayerHandlers() {
    if (!this.player || !this.player.video) return;

    const video = this.player.video;
    video.addEventListener('video:loadeddata', () => this.handleVideoLoaded());
    video.addEventListener('video:error', (e) => this.handleVideoError(e.detail));
    video.addEventListener('video:warning', (e) => this.showWarning(e.detail.message));
  }

  // ========== 檔案處理 ==========

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

      DEBUG && console.log('視訊載入成功:', info);

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('視訊載入失敗:', error);
      this.showError(error.message || '視訊載入失敗');
    }
  }

  handleVideoLoaded() {
    // 視訊載入完成後的處理
    DEBUG && console.log('視訊已載入');
  }

  handleVideoError(error) {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error('視訊錯誤:', error);
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

  // ========== 主題管理 ==========

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

  // ========== 設定和說明 ==========

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

  showHelp() {
    // 檢查瀏覽器支援
    const browserSupport = this.player?.constructor.checkBrowserSupport ? this.player.constructor.checkBrowserSupport() : {};
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
          <h4 style="margin-bottom: 10px;">⌨️ 鍵盤快捷鍵</h4>
          <ul style="margin-left: 20px; line-height: 1.8;">
            <li><kbd>空白鍵</kbd> - 播放/暫停</li>
            <li><kbd>←</kbd> / <kbd>→</kbd> - 快退/快進 5 秒</li>
            <li><kbd>↑</kbd> / <kbd>↓</kbd> - 增加/減少音量</li>
            <li><kbd>M</kbd> - 靜音/取消靜音</li>
            <li><kbd>F</kbd> - 全螢幕/退出全螢幕</li>
          </ul>
        </section>

        <div style="margin-top: 30px; text-align: center;">
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">關閉</button>
        </div>
      </div>
    `);

    document.body.appendChild(modal);
  }

  // ========== Modal 相關 ==========

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

  // ========== 設定管理 ==========

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

  loadSettings() {
    const settingsStr = localStorage.getItem('video_player_settings');
    if (settingsStr) {
      try {
        return JSON.parse(settingsStr);
      } catch (error) {
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('載入設定失敗:', error);
      }
    }
    return null;
  }

  // ========== 響應式處理 ==========

  handleResize() {
    // 可以在這裡處理視窗大小變化的邏輯
    const width = window.innerWidth;

    if (width < VideoConfig.ui.breakpoints.tablet) {
      // 移動端調整
      document.querySelector('.video-layout')?.classList.add('mobile');
    } else {
      document.querySelector('.video-layout')?.classList.remove('mobile');
    }
  }

  // ========== 專案管理 ==========

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
        DEBUG && console.log('載入上次的專案:', this.currentProject);

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
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('載入專案失敗:', error);
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

  // ========== 錯誤和通知處理 ==========

  showError(message) {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error(message);
    const notification = this.createNotification(message, 'error');
    this.showNotification(notification);
  }

  showWarning(message) {
    DEBUG && console.warn(message);
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

  // ========== 除錯模式 ==========

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
        DEBUG && console.log('載入測試視訊:', testVideoUrl);

        try {
          // 建立測試檔案物件
          const response = await fetch(testVideoUrl);
          const blob = await response.blob();
          const file = new File([blob], 'test-video.mp4', { type: 'video/mp4' });
          await this.handleFileSelect([file]);
        } catch (error) {
          if (typeof DEBUG !== 'undefined' && DEBUG) console.error('載入測試視訊失敗:', error);
        }
      },

      // 檢查瀏覽器支援
      checkSupport: () => {
        return this.player?.constructor.checkBrowserSupport ? this.player.constructor.checkBrowserSupport() : null;
      },

      // 診斷視訊狀態
      diagnose: () => {
        if (!this.player || !this.player.video) {
          if (typeof DEBUG !== 'undefined' && DEBUG) console.error('播放器未初始化');
          return;
        }

        const video = this.player.video;
        DEBUG && console.log('=== 視訊診斷資訊 ===');
        DEBUG && console.log('視訊元素:', video);
        DEBUG && console.log('視訊源:', video.src);
        DEBUG && console.log('當前時間:', video.currentTime);
        DEBUG && console.log('總時長:', video.duration);
        DEBUG && console.log('視訊寬度:', video.videoWidth);
        DEBUG && console.log('視訊高度:', video.videoHeight);
        DEBUG && console.log('就緒狀態:', video.readyState);
        DEBUG && console.log('網路狀態:', video.networkState);
        DEBUG && console.log('是否暫停:', video.paused);
        DEBUG && console.log('音量:', video.volume);
        DEBUG && console.log('是否靜音:', video.muted);
        DEBUG && console.log('播放速率:', video.playbackRate);
        DEBUG && console.log('錯誤:', video.error);
      },

      getState: () => {
        return {
          app: this.currentProject,
          player: this.player?.getState(),
          ui: this.ui?.state,
          initStages: this.initStages
        };
      }
    };

    DEBUG && console.log('🔧 除錯模式已啟用');
    DEBUG && console.log('📝 可用方法:');
    DEBUG && console.log('  videoDebug.checkSupport() - 檢查瀏覽器支援');
    DEBUG && console.log('  videoDebug.loadTestVideo() - 載入線上測試視訊');
    DEBUG && console.log('  videoDebug.diagnose() - 診斷視訊狀態');
    DEBUG && console.log('  videoDebug.getState() - 獲取當前狀態');
  }

  /**
   * 獲取初始化狀態
   */
  getInitStatus() {
    return {
      initialized: this.isInitialized,
      stages: this.initStages,
      diagnostics: {
        dom: domReadyManager.diagnose(),
        ui: this.ui?.diagnose(),
        player: this.player ? 'ready' : 'not created'
      }
    };
  }
}

// 創建全域實例
const app = new VideoApp();

// 匯出給全域使用
window.videoApp = app;
window.videoAppStatus = () => app.getInitStatus();

// 導出類和實例
export { VideoApp };
export default app;
