import Config from './config.js';
import { AudioPlayer } from './player.js';
import { WhisperAPI } from './api.js';

// 主應用程式類別
class WhisperApp {
  constructor() {
    this.player = null;
    this.apiKey = null;
    this.currentProject = null;
    this.whisperAPI = null;
    this.isTranscribing = false;
    
    this.init();
  }
  
  init() {
    // 確保 DOM 載入完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }
  
  setup() {
    // 確保所有 modal 在初始化時都是關閉狀態
    document.querySelectorAll('.modal').forEach(modal => {
      modal.classList.remove('show');
      modal.style.display = '';
    });
    
    // 重置 body overflow
    document.body.style.overflow = '';
    
    // 初始化播放器
    this.player = new AudioPlayer();
    
    // 載入設定
    this.loadSettings();
    
    // 初始化 API
    if (this.apiKey) {
      this.whisperAPI = new WhisperAPI();
    }
    
    // 綁定 UI 事件
    this.bindUIEvents();
    
    // 檢查 API Key（這會在需要時顯示設定視窗）
    this.checkApiKey();
    
    // 載入上次的專案（如果有）
    this.loadLastProject();
  }
  
  bindUIEvents() {
    // 設定按鈕
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const settingsCloseBtn = document.getElementById('settingsCloseBtn');
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    
    settingsBtn.addEventListener('click', () => {
      this.showModal(settingsModal);
    });
    
    settingsCloseBtn.addEventListener('click', () => {
      this.hideModal(settingsModal);
    });
    
    saveSettingsBtn.addEventListener('click', () => {
      this.saveSettings();
      this.hideModal(settingsModal);
    });
    
    // 說明按鈕
    const helpBtn = document.getElementById('helpBtn');
    const helpModal = document.getElementById('helpModal');
    const helpCloseBtn = document.getElementById('helpCloseBtn');
    
    helpBtn.addEventListener('click', () => {
      this.showModal(helpModal);
    });
    
    helpCloseBtn.addEventListener('click', () => {
      this.hideModal(helpModal);
    });
    
    // 匯出按鈕
    const exportBtn = document.getElementById('exportBtn');
    const exportModal = document.getElementById('exportModal');
    const exportCloseBtn = document.getElementById('exportCloseBtn');
    const confirmExportBtn = document.getElementById('confirmExportBtn');
    
    if (exportBtn && exportModal) {
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Export button clicked');
        this.showModal(exportModal);
      });
    }
    
    if (exportCloseBtn && exportModal) {
      exportCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.hideModal(exportModal);
      });
    }
    
    if (confirmExportBtn && exportModal) {
      confirmExportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleExport();
        this.hideModal(exportModal);
      });
    }
    
    // 轉譯按鈕
    const transcribeBtn = document.getElementById('transcribeBtn');
    if (transcribeBtn) {
      transcribeBtn.addEventListener('click', () => {
        this.startTranscription();
      });
    }
    
    // Modal 外部點擊關閉
    document.querySelectorAll('.modal').forEach(modal => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideModal(modal);
        }
      });
    });
    
    // 主題切換
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.addEventListener('change', (e) => {
        this.setTheme(e.target.value);
      });
    }
  }
  
  // Modal 控制
  showModal(modal) {
    if (!modal) return;
    
    // 先關閉所有其他 modal
    document.querySelectorAll('.modal.show').forEach(m => {
      if (m !== modal) {
        m.classList.remove('show');
        m.style.display = '';  // 恢復到 CSS 控制
      }
    });
    
    modal.style.display = '';  // 確保移除內聯樣式
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
  
  hideModal(modal) {
    if (!modal) return;
    
    modal.classList.remove('show');
    modal.style.display = '';  // 恢復到 CSS 控制
    
    // 檢查是否還有其他 modal 開啟
    const hasOpenModal = document.querySelector('.modal.show');
    if (!hasOpenModal) {
      document.body.style.overflow = '';
    }
  }
  
  // 設定管理
  loadSettings() {
    // 載入 API Key
    this.apiKey = localStorage.getItem(Config.storage.prefix + 'apiKey');
    if (this.apiKey) {
      const apiKeyInput = document.getElementById('apiKeyInput');
      if (apiKeyInput) {
        apiKeyInput.value = this.apiKey;
      }
    }
    
    // 載入主題
    const savedTheme = localStorage.getItem(Config.storage.prefix + 'theme') || Config.theme.default;
    this.setTheme(savedTheme);
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = savedTheme;
    }
    
    // 載入自動儲存設定
    const autoSave = localStorage.getItem(Config.storage.prefix + 'autoSave') !== 'false';
    const autoSaveCheck = document.getElementById('autoSaveCheck');
    if (autoSaveCheck) {
      autoSaveCheck.checked = autoSave;
    }
  }
  
  saveSettings() {
    // 儲存 API Key
    const apiKeyInput = document.getElementById('apiKeyInput');
    if (apiKeyInput && apiKeyInput.value) {
      this.apiKey = apiKeyInput.value;
      localStorage.setItem(Config.storage.prefix + 'apiKey', this.apiKey);
      
      // 更新或初始化 WhisperAPI
      if (this.whisperAPI) {
        this.whisperAPI.setApiKey(this.apiKey);
      } else {
        this.whisperAPI = new WhisperAPI();
      }
    }
    
    // 儲存主題
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      localStorage.setItem(Config.storage.prefix + 'theme', themeSelect.value);
      this.setTheme(themeSelect.value);
    }
    
    // 儲存自動儲存設定
    const autoSaveCheck = document.getElementById('autoSaveCheck');
    if (autoSaveCheck) {
      localStorage.setItem(Config.storage.prefix + 'autoSave', autoSaveCheck.checked);
    }
    
    this.showNotification('設定已儲存');
  }
  
  // 主題管理
  setTheme(theme) {
    if (theme === 'auto') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      theme = prefersDark ? 'dark' : 'light';
    }
    
    document.documentElement.setAttribute('data-theme', theme);
  }
  
  // API Key 檢查
  checkApiKey() {
    if (!this.apiKey) {
      // 延遲顯示設定視窗，讓使用者先看到介面
      setTimeout(() => {
        // 確保關閉所有其他 modal
        document.querySelectorAll('.modal').forEach(modal => {
          modal.classList.remove('show');
          modal.style.display = '';
        });
        
        this.showNotification('請先設定您的 OpenAI API Key', 'warning');
        const settingsModal = document.getElementById('settingsModal');
        if (settingsModal) {
          console.log('Opening settings modal for API key setup');
          this.showModal(settingsModal);
        }
      }, 1000);
    }
  }
  
  // 專案管理
  loadLastProject() {
    const projectData = localStorage.getItem(Config.storage.prefix + 'currentProject');
    if (projectData) {
      try {
        this.currentProject = JSON.parse(projectData);
        // TODO: 恢復上次的專案狀態
      } catch (e) {
        console.error('載入專案失敗:', e);
      }
    }
  }
  
  // 轉譯功能
  async startTranscription() {
    if (!this.apiKey) {
      this.showNotification('請先設定 API Key', 'error');
      this.showModal(document.getElementById('settingsModal'));
      return;
    }
    
    const file = this.player.getCurrentFile();
    if (!file) {
      this.showNotification('請先上傳音訊檔案', 'error');
      return;
    }
    
    // 檢查是否正在轉譯
    if (this.isTranscribing) {
      this.showNotification('正在轉譯中，請稍候', 'warning');
      return;
    }
    
    // 初始化 API（如果還沒有）
    if (!this.whisperAPI) {
      this.whisperAPI = new WhisperAPI();
    }
    
    try {
      this.isTranscribing = true;
      
      // 更新按鈕狀態
      const transcribeBtn = document.getElementById('transcribeBtn');
      if (transcribeBtn) {
        transcribeBtn.disabled = true;
        transcribeBtn.textContent = '轉譯中...';
      }
      
      // 顯示進度
      this.showTranscriptionStatus('準備轉譯...');
      
      // 估算時間
      const estimate = this.whisperAPI.estimateTranscriptionTime(file.size);
      this.showTranscriptionStatus(`正在轉譯... (預估 ${estimate.average} 秒)`);
      
      // 建立專案（如果還沒有）
      if (!this.currentProject) {
        this.currentProject = {
          id: `project_${Date.now()}`,
          fileName: file.name,
          fileSize: file.size,
          createdAt: new Date().toISOString(),
          lastModified: new Date().toISOString()
        };
      }
      
      // 呼叫 API
      const result = await this.whisperAPI.transcribe(file, {
        language: 'zh', // 預設中文，後續可以讓使用者選擇
        prompt: '以下是普通話的對話內容。' // 幫助提高中文識別準確度
      });
      
      // 儲存結果
      this.currentProject.transcription = {
        text: result.text,
        segments: result.segments,
        language: result.language,
        duration: result.duration,
        createdAt: new Date().toISOString()
      };
      
      // 顯示結果
      this.displayTranscription();
      
      // 儲存專案
      this.saveProject();
      
      this.showNotification('轉譯完成！', 'success');
      
    } catch (error) {
      this.showNotification(`轉譯失敗：${error.message}`, 'error');
      console.error('Transcription error:', error);
    } finally {
      this.isTranscribing = false;
      
      // 恢復按鈕狀態
      const transcribeBtn = document.getElementById('transcribeBtn');
      if (transcribeBtn) {
        transcribeBtn.disabled = false;
        transcribeBtn.textContent = '開始轉譯';
      }
      
      // 隱藏狀態
      this.hideTranscriptionStatus();
    }
  }
  
  // 匯出功能
  handleExport() {
    const format = document.querySelector('input[name="exportFormat"]:checked')?.value;
    if (!format) {
      alert('請選擇匯出格式');
      return;
    }
    
    // TODO: 實作匯出功能
    this.showNotification(`匯出功能 (${format}) 將在後續階段實作`, 'info');
  }
  
  // 通知功能
  showNotification(message, type = 'success') {
    // TODO: 實作更好的通知 UI
    console.log(`[${type}] ${message}`);
    
    // 暫時使用簡單的提示
    const bgColor = {
      success: '#10b981',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6'
    }[type] || '#64748b';
    
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: ${bgColor};
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      z-index: 2000;
      animation: slideIn 0.3s ease-out;
    `;
    notification.textContent = message;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease-out';
      setTimeout(() => {
        document.body.removeChild(notification);
      }, 300);
    }, 3000);
  }
  
  // 顯示轉譯狀態
  showTranscriptionStatus(message, showProgress = true) {
    const statusSection = document.getElementById('transcriptionStatus');
    const statusMessage = document.getElementById('statusMessage');
    const progressIndicator = document.getElementById('progressIndicator');
    
    if (statusSection) {
      statusSection.style.display = 'block';
    }
    if (statusMessage) {
      statusMessage.textContent = message;
    }
    if (progressIndicator) {
      progressIndicator.style.display = showProgress ? 'block' : 'none';
    }
  }
  
  // 隱藏轉譯狀態
  hideTranscriptionStatus() {
    const statusSection = document.getElementById('transcriptionStatus');
    if (statusSection) {
      statusSection.style.display = 'none';
    }
  }
  
  // 顯示轉譯結果
  displayTranscription() {
    const editorSection = document.getElementById('editorSection');
    const editorContent = document.getElementById('editorContent');
    
    if (!this.currentProject?.transcription) {
      return;
    }
    
    // 顯示編輯器區域
    if (editorSection) {
      editorSection.style.display = 'block';
    }
    
    // 暫時顯示簡單的文字結果（後續會整合編輯器模組）
    if (editorContent) {
      const segments = this.currentProject.transcription.segments;
      editorContent.innerHTML = segments.map((seg, index) => `
        <div class="segment" data-segment-id="${index}">
          <div class="segment-time" data-time="${seg.start}">
            ${this.formatTime(seg.start)}
          </div>
          <div class="segment-text">
            ${seg.text}
          </div>
        </div>
      `).join('');
      
      // 綁定點擊事件
      editorContent.querySelectorAll('.segment-time').forEach(timeEl => {
        timeEl.addEventListener('click', () => {
          const time = parseFloat(timeEl.dataset.time);
          this.player.seekTo(time);
        });
      });
    }
  }
  
  // 格式化時間
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  // 儲存專案
  saveProject() {
    if (!this.currentProject) return;
    
    const key = `${Config.storage.prefix}${this.currentProject.id}`;
    localStorage.setItem(key, JSON.stringify(this.currentProject));
    
    // 更新最後專案 ID
    localStorage.setItem(`${Config.storage.prefix}lastProjectId`, this.currentProject.id);
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
`;
document.head.appendChild(style);

// 初始化應用程式
const app = new WhisperApp();

// 匯出給全域使用（如果需要）
window.whisperApp = app;