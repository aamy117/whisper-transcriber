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
    try {
      // 初始化播放器
      const videoElement = document.getElementById('videoPlayer');
      if (!videoElement) {
        throw new Error('找不到視訊元素');
      }
      
      this.player = new VideoPlayer(videoElement);
      this.ui = new VideoUI(this.player);
      
      // 綁定事件
      this.bindEvents();
      
      // 設定主題
      this.setupTheme();
      
      // 載入上次的專案（如果有）
      this.loadLastProject();
      
      this.isInitialized = true;
      console.log('視訊播放器初始化完成');
      
    } catch (error) {
      console.error('視訊播放器初始化失敗:', error);
      this.showError('播放器初始化失敗');
    }
  }
  
  bindEvents() {
    // 檔案選擇
    const fileInput = document.getElementById('videoInput');
    const selectBtn = document.getElementById('selectVideoBtn');
    const uploadArea = document.getElementById('videoUploadArea');
    
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
    if (!file.type.startsWith('video/')) {
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
        // 這裡可以顯示專案資訊，但不自動載入檔案
      } catch (error) {
        console.error('載入專案失敗:', error);
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
  
  // 除錯模式
  enableDebugMode() {
    window.videoDebug = {
      app: this,
      player: this.player,
      ui: this.ui,
      config: VideoConfig,
      
      // 測試方法
      loadTestVideo: async () => {
        // 建立測試檔案
        const response = await fetch('data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAAIZnJlZQAA...');
        const blob = await response.blob();
        const file = new File([blob], 'test.mp4', { type: 'video/mp4' });
        await this.handleFileSelect([file]);
      },
      
      getState: () => {
        return {
          app: this.currentProject,
          player: this.player?.getState(),
          ui: this.ui?.state
        };
      }
    };
    
    console.log('除錯模式已啟用。使用 window.videoDebug 存取除錯功能。');
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