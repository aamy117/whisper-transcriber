import Config from './config.js';
import { AudioPlayer } from './player.js';
import { WhisperAPI } from './api.js';
import { TranscriptionEditor } from './editor.js';
import { exportManager } from './export.js';

// 主應用程式類別
class WhisperApp {
  constructor() {
    this.player = null;
    this.apiKey = null;
    this.currentProject = null;
    this.whisperAPI = null;
    this.editor = null;
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
    
    // 初始化編輯器
    const editorContainer = document.getElementById('editorContent');
    if (editorContainer) {
      try {
        this.editor = new TranscriptionEditor(editorContainer);
        
        // 監聽編輯器事件
        this.editor.on('save', (data) => {
          this.handleEditorSave(data);
        });
        
        this.editor.on('segmentClick', (data) => {
          if (this.player) {
            this.player.seekTo(data.time);
          }
        });
      } catch (error) {
        console.error('編輯器初始化失敗:', error);
      }
    }
    
    // 綁定 UI 事件
    this.bindUIEvents();
    
    // 檢查 API Key（這會在需要時顯示設定視窗）
    this.checkApiKey();
    
    // 不再自動載入上次的專案
    // this.loadLastProject();
  }
  
  bindUIEvents() {
    // 最近專案按鈕
    const recentProjectsBtn = document.getElementById('recentProjectsBtn');
    const recentProjectsModal = document.getElementById('recentProjectsModal');
    const recentProjectsCloseBtn = document.getElementById('recentProjectsCloseBtn');
    
    if (recentProjectsBtn) {
      recentProjectsBtn.addEventListener('click', () => {
        this.showRecentProjects();
      });
    }
    
    if (recentProjectsCloseBtn) {
      recentProjectsCloseBtn.addEventListener('click', () => {
        this.hideModal(recentProjectsModal);
      });
    }
    
    // 主題切換按鈕
    const themeToggleBtn = document.getElementById('themeToggleBtn');
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        this.toggleTheme();
      });
    }
    
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
    
    // 搜尋功能
    const searchBtn = document.getElementById('searchBtn');
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    const searchCloseBtn = document.getElementById('searchCloseBtn');
    
    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        this.toggleSearch();
      });
    }
    
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });
      
      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeSearch();
        }
      });
    }
    
    if (searchCloseBtn) {
      searchCloseBtn.addEventListener('click', () => {
        this.closeSearch();
      });
    }
    
    // 儲存按鈕
    const saveBtn = document.getElementById('saveBtn');
    if (saveBtn) {
      saveBtn.addEventListener('click', () => {
        this.saveProject();
        this.showNotification('專案已儲存', 'success');
      });
    }
    
    // 全域快捷鍵
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + F: 搜尋
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this.toggleSearch();
      }
      
      // Ctrl/Cmd + S: 儲存
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.saveProject();
        this.showNotification('專案已儲存', 'success');
      }
      
      // Ctrl/Cmd + E: 匯出
      if ((e.ctrlKey || e.metaKey) && e.key === 'e') {
        e.preventDefault();
        const exportModal = document.getElementById('exportModal');
        if (exportModal) {
          this.showModal(exportModal);
        }
      }
    });
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
  
  // 切換主題
  toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    
    // 更新 DOM
    document.documentElement.setAttribute('data-theme', newTheme);
    
    // 儲存到 localStorage
    localStorage.setItem(Config.storage.prefix + 'theme', newTheme);
    
    // 更新設定頁面的選擇器（如果開啟的話）
    const themeSelect = document.getElementById('themeSelect');
    if (themeSelect) {
      themeSelect.value = newTheme;
    }
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
    const lastProjectId = localStorage.getItem(Config.storage.prefix + 'lastProjectId');
    if (!lastProjectId) return;
    
    const projectKey = Config.storage.prefix + lastProjectId;
    const projectData = localStorage.getItem(projectKey);
    
    if (projectData) {
      try {
        this.currentProject = JSON.parse(projectData);
        
        // 如果有轉譯結果，顯示在編輯器中
        if (this.currentProject.transcription) {
          this.displayTranscription();
        }
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
      this.showNotification('請選擇匯出格式', 'error');
      return;
    }
    
    // 檢查是否有轉譯內容
    if (!this.editor || !this.currentProject?.transcription) {
      this.showNotification('沒有可匯出的內容', 'error');
      return;
    }
    
    try {
      // 取得編輯後的段落
      const editedContent = this.editor.getEditedContent();
      const segments = editedContent.segments;
      
      // 產生檔案名稱（使用原始音訊檔名或專案 ID）
      const baseFilename = this.currentProject.fileName ? 
        this.currentProject.fileName.replace(/\.[^/.]+$/, '') : // 移除副檔名
        `轉譯_${new Date().toISOString().slice(0, 10)}`;
      
      // 執行匯出
      exportManager.export(segments, format, baseFilename);
      
      // 顯示成功訊息
      this.showNotification('檔案匯出成功！', 'success');
      
      // 關閉匯出對話框
      const exportModal = document.getElementById('exportModal');
      if (exportModal) {
        this.hideModal(exportModal);
      }
      
    } catch (error) {
      console.error('匯出失敗:', error);
      this.showNotification(`匯出失敗：${error.message}`, 'error');
    }
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
    
    if (!this.currentProject?.transcription) {
      return;
    }
    
    // 顯示編輯器區域
    if (editorSection) {
      editorSection.style.display = 'block';
    }
    
    // 使用編輯器模組顯示結果
    if (this.editor) {
      this.editor.loadTranscription(this.currentProject.transcription);
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
    
    // 如果有編輯器，取得編輯後的內容
    if (this.editor && this.currentProject.transcription) {
      const editedContent = this.editor.getEditedContent();
      this.currentProject.transcription.segments = editedContent.segments;
      this.currentProject.hasEdits = editedContent.hasEdits;
    }
    
    // 更新最後修改時間
    this.currentProject.lastModified = new Date().toISOString();
    
    const key = `${Config.storage.prefix}${this.currentProject.id}`;
    localStorage.setItem(key, JSON.stringify(this.currentProject));
    
    // 更新最後專案 ID
    localStorage.setItem(`${Config.storage.prefix}lastProjectId`, this.currentProject.id);
  }
  
  // 處理編輯器儲存事件
  handleEditorSave(data) {
    if (!this.currentProject) return;
    
    // 更新專案中的段落
    if (this.currentProject.transcription) {
      this.currentProject.transcription.segments = data.segments;
    }
    
    // 儲存專案
    this.saveProject();
  }
  
  // 搜尋功能
  toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    
    if (!searchBar) return;
    
    const isVisible = searchBar.style.display === 'block';
    
    if (isVisible) {
      this.closeSearch();
    } else {
      searchBar.style.display = 'block';
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  }
  
  closeSearch() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    
    if (searchBar) {
      searchBar.style.display = 'none';
    }
    
    if (searchInput) {
      searchInput.value = '';
    }
    
    // 清除編輯器中的搜尋高亮
    if (this.editor) {
      this.editor.clearSearch();
    }
  }
  
  handleSearch(term) {
    if (!this.editor) return;
    
    const results = this.editor.search(term);
    
    if (term && results.length === 0) {
      this.showNotification('未找到匹配的內容', 'warning');
    } else if (term && results.length > 0) {
      this.showNotification(`找到 ${results.length} 個匹配項`, 'info');
    }
  }
  
  // 顯示最近專案
  showRecentProjects() {
    const modal = document.getElementById('recentProjectsModal');
    const listContainer = document.getElementById('recentProjectsList');
    const noProjectsMsg = document.getElementById('noRecentProjects');
    
    // 取得所有專案
    const projects = this.getRecentProjects();
    
    if (projects.length === 0) {
      listContainer.style.display = 'none';
      noProjectsMsg.style.display = 'block';
    } else {
      listContainer.style.display = 'block';
      noProjectsMsg.style.display = 'none';
      
      // 建立專案列表
      listContainer.innerHTML = projects.map(project => `
        <div class="project-item" data-project-id="${project.id}">
          <div class="project-info">
            <h3 class="project-name">${project.fileName || '未命名專案'}</h3>
            <div class="project-meta">
              <span class="project-date">${this.formatDate(project.lastModified)}</span>
              <span class="project-size">${project.fileSize ? this.formatFileSize(project.fileSize) : ''}</span>
            </div>
          </div>
          <div class="project-actions">
            <button class="btn-load-project" data-project-id="${project.id}">載入</button>
            <button class="btn-delete-project" data-project-id="${project.id}" title="刪除專案">🗑️</button>
          </div>
        </div>
      `).join('');
      
      // 綁定事件
      listContainer.querySelectorAll('.btn-load-project').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const projectId = e.target.dataset.projectId;
          this.loadProject(projectId);
          this.hideModal(modal);
        });
      });
      
      listContainer.querySelectorAll('.btn-delete-project').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const projectId = e.target.dataset.projectId;
          if (confirm('確定要刪除此專案嗎？')) {
            this.deleteProject(projectId);
            this.showRecentProjects(); // 重新整理列表
          }
        });
      });
    }
    
    this.showModal(modal);
  }
  
  // 取得最近專案列表
  getRecentProjects() {
    const projects = [];
    const prefix = Config.storage.prefix;
    
    // 從 localStorage 取得所有專案
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key.startsWith(prefix + 'project_')) {
        try {
          const projectData = JSON.parse(localStorage.getItem(key));
          projects.push(projectData);
        } catch (e) {
          console.error('無法載入專案:', key, e);
        }
      }
    }
    
    // 按最後修改時間排序
    projects.sort((a, b) => {
      const dateA = new Date(a.lastModified || a.createdAt);
      const dateB = new Date(b.lastModified || b.createdAt);
      return dateB - dateA;
    });
    
    return projects;
  }
  
  // 載入專案
  loadProject(projectId) {
    const projectKey = Config.storage.prefix + projectId;
    const projectData = localStorage.getItem(projectKey);
    
    if (projectData) {
      try {
        this.currentProject = JSON.parse(projectData);
        
        // 如果有轉譯結果，顯示在編輯器中
        if (this.currentProject.transcription) {
          this.displayTranscription();
        }
        
        this.showNotification('專案載入成功', 'success');
      } catch (e) {
        console.error('載入專案失敗:', e);
        this.showNotification('載入專案失敗', 'error');
      }
    }
  }
  
  // 刪除專案
  deleteProject(projectId) {
    const projectKey = Config.storage.prefix + projectId;
    localStorage.removeItem(projectKey);
    
    // 如果刪除的是當前專案，清空編輯器
    if (this.currentProject && this.currentProject.id === projectId) {
      this.currentProject = null;
      if (this.editor) {
        this.editor.clear();
      }
    }
    
    this.showNotification('專案已刪除', 'info');
  }
  
  // 格式化日期
  formatDate(dateString) {
    if (!dateString) return '未知日期';
    
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    // 小於 1 小時
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return minutes <= 1 ? '剛剛' : `${minutes} 分鐘前`;
    }
    
    // 小於 24 小時
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours} 小時前`;
    }
    
    // 小於 7 天
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return days === 1 ? '昨天' : `${days} 天前`;
    }
    
    // 顯示日期
    return date.toLocaleDateString('zh-TW');
  }
  
  // 格式化檔案大小
  formatFileSize(bytes) {
    if (!bytes) return '';
    
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
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