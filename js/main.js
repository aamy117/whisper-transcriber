// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

import Config from './config.js';
import { AudioPlayer } from './player.js';
import { WhisperAPI } from './api.js';
import { TranscriptionEditor } from './editor.js';
import { exportManager } from './export.js';
import { notify } from './notification.js';
import { dialog } from './dialog.js';
import { transcriptionPreprocessor } from './transcription-preprocessor.js';
import CancellationToken from './utils/cancellation-token.js';
import { floatingCancelButton } from './floating-cancel-button.js';
import { progressManager, showProcessingProgress } from './progress-manager.js';
import { WhisperWASMManager } from './wasm/whisper-wasm-manager.js';
import { preloadIndicator } from './preload-indicator.js';
import { largeFileIntegration } from './large-file/large-file-integration.js';

// 主應用程式類別
class WhisperApp {
  constructor() {
    this.player = null;
    this.apiKey = null;
    this.currentProject = null;
    this.whisperAPI = null;
    this.editor = null;
    this.isTranscribing = false;
    this.showPunctuation = true; // 預設顯示標點符號
    this.transcriptionCancellationToken = null; // 取消令牌
    this.progressControl = null; // 進度管理器控制實例
    this.wasmManager = null; // WASM 管理器

    // 初始化全域編輯器參考
    window.transcriptionEditor = null;

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
    
    // 初始化 WASM 管理器和預載入
    this.initializeWASM();
    
    // 初始化大檔案處理系統
    this.initializeLargeFileSystem();

    // 初始化編輯器
    const editorContainer = document.getElementById('editorContent');
    if (editorContainer) {
      try {
        this.editor = new TranscriptionEditor(editorContainer);
        
        // 將編輯器設為全域變數，讓批次工具欄按鈕可以存取
        window.transcriptionEditor = this.editor;

        // 監聽編輯器事件
        this.editor.on('save', (data) => {
          this.handleEditorSave(data);
        });

        this.editor.on('segmentClick', (data) => {
          if (this.player) {
            this.player.seekTo(data.time);
          }
        });

        this.editor.on('notification', (data) => {
          this.showNotification(data.message, data.type);
        });
      } catch (error) {
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('編輯器初始化失敗:', error);
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

    // 標點符號切換按鈕
    const punctuationToggleBtn = document.getElementById('punctuationToggleBtn');
    if (punctuationToggleBtn) {
      punctuationToggleBtn.addEventListener('click', () => {
        this.togglePunctuation();
      });
    }

    // 批次編輯按鈕
    const batchEditBtn = document.getElementById('batchEditBtn');
    if (batchEditBtn) {
      batchEditBtn.addEventListener('click', () => {
        this.toggleBatchEditMode();
      });
    }

    // 匯出按鈕
    const exportBtn = document.getElementById('exportBtn');
    const exportModal = document.getElementById('exportModal');
    const exportCloseBtn = document.getElementById('exportCloseBtn');
    const confirmExportBtn = document.getElementById('confirmExportBtn');

    if (exportBtn && exportModal) {
      exportBtn.addEventListener('click', (e) => {
        e.preventDefault();
        DEBUG && console.log('Export button clicked');
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
    const replaceToolbarBtn = document.getElementById('replaceToolbarBtn');
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    const searchCloseBtn = document.getElementById('searchCloseBtn');
    const searchNextBtn = document.getElementById('searchNextBtn');
    const searchPrevBtn = document.getElementById('searchPrevBtn');
    const replaceInput = document.getElementById('replaceInput');
    const replaceBtnAction = document.getElementById('replaceBtn');
    const replaceAllBtn = document.getElementById('replaceAllBtn');
    const replaceRow = document.getElementById('replaceRow');

    if (searchBtn) {
      searchBtn.addEventListener('click', () => {
        this.toggleSearch(false);
      });
    }

    if (replaceToolbarBtn) {
      replaceToolbarBtn.addEventListener('click', () => {
        this.toggleSearch(true);
      });
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.handleSearch(e.target.value);
      });

      searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          this.closeSearch();
        } else if (e.key === 'Enter') {
          e.preventDefault();
          if (this.editor) {
            this.editor.nextSearchResult();
          }
        }
      });
    }

    if (searchNextBtn) {
      searchNextBtn.addEventListener('click', () => {
        if (this.editor) {
          this.editor.nextSearchResult();
        }
      });
    }

    if (searchPrevBtn) {
      searchPrevBtn.addEventListener('click', () => {
        if (this.editor) {
          this.editor.prevSearchResult();
        }
      });
    }

    if (replaceBtnAction) {
      replaceBtnAction.addEventListener('click', () => {
        this.handleReplace();
      });
    }

    if (replaceAllBtn) {
      replaceAllBtn.addEventListener('click', () => {
        this.handleReplaceAll();
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
        this.toggleSearch(false);
      }

      // Ctrl/Cmd + H: 尋找和取代
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault();
        this.toggleSearch(true);
      }

      // F3 或 Ctrl/Cmd + G: 下一個搜尋結果
      if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key === 'g')) {
        e.preventDefault();
        if (this.editor) {
          if (e.shiftKey) {
            this.editor.prevSearchResult();
          } else {
            this.editor.nextSearchResult();
          }
        }
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

    // 載入標點符號顯示設定
    const savedShowPunctuation = localStorage.getItem(Config.storage.prefix + 'showPunctuation');
    this.showPunctuation = savedShowPunctuation === null ? true : savedShowPunctuation === 'true';

    // 更新標點符號按鈕狀態
    const punctuationBtn = document.getElementById('punctuationToggleBtn');
    if (punctuationBtn) {
      if (!this.showPunctuation) {
        punctuationBtn.classList.add('punctuation-hidden');
        punctuationBtn.title = '標點符號已隱藏';
      }
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
  
  // 初始化 WASM 和預載入
  async initializeWASM() {
    try {
      // 延遲初始化，避免與其他模組衝突
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // 創建 WASM 管理器實例
      this.wasmManager = new WhisperWASMManager();
      
      // 設定預載入配置 - 改為手動載入模式
      this.wasmManager.setPreloadConfig({
        autoPreload: false,      // 停用自動預載入
        preloadOnIdle: false,    // 停用空閒時預載入
        preloadPriority: ['tiny', 'base', 'small']  // 保留優先順序供手動使用
      });
      
      // 訂閱預載入事件（安全地）
      try {
        this.wasmManager.subscribeToPreload((event) => {
          const { event: eventType, data } = event;
          
          // 確保 preloadIndicator 可用
          if (!preloadIndicator || !preloadIndicator.updatePreloadItem) {
            return;
          }
          
          switch (eventType) {
            case 'progress':
              preloadIndicator.updatePreloadItem(
                data.modelName,
                'loading',
                data.progress,
                this.wasmManager.getModelInfo(data.modelName)?.size
              );
              break;
            case 'completed':
              preloadIndicator.updatePreloadItem(data.modelName, 'complete', 100);
              break;
            case 'error':
              preloadIndicator.updatePreloadItem(data.modelName, 'error');
              break;
            case 'cancelled':
              preloadIndicator.updatePreloadItem(data.modelName, 'cancelled');
              break;
          }
        });
      } catch (error) {
        DEBUG && console.warn('無法訂閱預載入事件:', error);
      }
      
      // 設定預載入指示器事件處理器（如果可用）
      if (preloadIndicator && preloadIndicator.setEventHandlers) {
        preloadIndicator.setEventHandlers({
          onClearCache: async () => {
            try {
              await this.wasmManager.clearCache();
              preloadIndicator.clear();
              notify('模型快取已清除');
            } catch (error) {
              DEBUG && console.error('清除快取失敗:', error);
              notify('清除快取失敗', 'error');
            }
          },
          onCancelPreload: (modelName) => {
            this.wasmManager.cancelPreload(modelName);
          }
        });
      }
      
      DEBUG && console.log('WASM 管理器初始化完成');
      
    } catch (error) {
      DEBUG && console.error('WASM 初始化失敗:', error);
    }
  }
  
  // 初始化大檔案處理系統
  async initializeLargeFileSystem() {
    try {
      const isEnabled = await largeFileIntegration.initialize();
      if (isEnabled) {
        DEBUG && console.log('大檔案處理系統已初始化');
      }
    } catch (error) {
      DEBUG && console.error('大檔案處理系統初始化失敗:', error);
    }
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

  // 切換標點符號顯示
  togglePunctuation() {
    this.showPunctuation = !this.showPunctuation;

    // 更新按鈕狀態
    const btn = document.getElementById('punctuationToggleBtn');
    const icon = document.getElementById('punctuationIcon');

    if (btn) {
      if (this.showPunctuation) {
        btn.classList.remove('punctuation-hidden');
        btn.title = '切換標點符號顯示';
        if (icon) icon.textContent = '。';
      } else {
        btn.classList.add('punctuation-hidden');
        btn.title = '標點符號已隱藏';
        if (icon) icon.textContent = '。';
      }
    }

    // 儲存偏好設定
    localStorage.setItem(Config.storage.prefix + 'showPunctuation', this.showPunctuation);

    // 更新編輯器顯示
    if (this.editor) {
      this.editor.setShowPunctuation(this.showPunctuation);
    }

    // 顯示通知
    notify.info(this.showPunctuation ? '顯示標點符號' : '隱藏標點符號');
  }

  // 切換批次編輯模式
  toggleBatchEditMode() {
    if (!this.editor) {
      notify.warning('請先載入轉譯內容');
      return;
    }

    // 切換批次選擇模式
    const isEnabled = this.editor.toggleBatchSelectionMode();

    // 更新按鈕狀態
    const btn = document.getElementById('batchEditBtn');
    if (btn) {
      if (isEnabled) {
        btn.classList.add('active');
        btn.title = '退出批次編輯模式';
      } else {
        btn.classList.remove('active');
        btn.title = '批次編輯模式';
      }
    }

    // 更新批次工具欄顯示
    const toolbar = document.getElementById('batchToolbar');
    if (toolbar) {
      toolbar.style.display = isEnabled ? 'flex' : 'none';
    }

    // 監聽批次選擇變化
    if (isEnabled && !this.batchSelectionListener) {
      this.batchSelectionListener = (e) => {
        const countEl = document.getElementById('selectedCount');
        if (countEl) {
          countEl.textContent = e.detail.selectedCount;
        }
      };
      document.addEventListener('batchSelectionChanged', this.batchSelectionListener);
    } else if (!isEnabled && this.batchSelectionListener) {
      document.removeEventListener('batchSelectionChanged', this.batchSelectionListener);
      this.batchSelectionListener = null;
    }

    // 顯示通知
    notify.info(isEnabled ? '已進入批次編輯模式' : '已退出批次編輯模式');
  }

  // API Key 檢查
  checkApiKey() {
    if (!this.apiKey) {
      // 暫時關閉自動提示，避免干擾使用者體驗
      // setTimeout(() => {
      //   this.showNotification('提示：可以使用本地 WASM 轉譯（免費）或設定 API Key 使用雲端轉譯', 'info');
      // }, 1500);
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
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('載入專案失敗:', e);
      }
    }
  }

  // 轉譯功能
  async startTranscription() {
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

    try {
      this.isTranscribing = true;
      
      // 創建新的取消令牌
      this.transcriptionCancellationToken = new CancellationToken();

      // 更新按鈕狀態
      const transcribeBtn = document.getElementById('transcribeBtn');
      if (transcribeBtn) {
        transcribeBtn.disabled = true;
        transcribeBtn.textContent = '處理中...';
      }

      // 先使用預處理器準備檔案（這會顯示選擇對話框）
      DEBUG && console.log('開始預處理檔案...');
      const preprocessResult = await transcriptionPreprocessor.prepareForTranscription(file, {
        cancellationToken: this.transcriptionCancellationToken
      });
      DEBUG && console.log('預處理結果:', preprocessResult);
      
      // 使用者選擇後才顯示進度管理器
      const stages = [];
      let totalStages = 0;
      
      // 根據處理策略設定階段
      if (preprocessResult.strategy === 'split' || preprocessResult.strategy === 'hybrid') {
        stages.push('準備檔案', '分割音訊', '執行轉譯', '合併結果');
        totalStages = 4;
      } else if (preprocessResult.strategy === 'compress') {
        stages.push('準備檔案', '壓縮音訊', '執行轉譯', '處理結果');
        totalStages = 4;
      } else if (preprocessResult.strategy === 'wasm') {
        stages.push('準備環境', '載入模型', '執行轉譯', '處理結果');
        totalStages = 4;
      } else if (preprocessResult.strategy === 'large-file-system') {
        stages.push('分析檔案', '智慧分割', '並行處理', '合併結果');
        totalStages = 4;
      } else {
        stages.push('準備檔案', '執行轉譯', '處理結果');
        totalStages = 3;
      }
      
      // 現在顯示進度管理器
      this.progressControl = showProcessingProgress(
        '音訊轉譯處理',
        stages,
        () => {
          this.cancelTranscription();
        }
      );
      
      // 同時顯示浮動取消按鈕（作為備份）
      floatingCancelButton.show(() => {
        this.cancelTranscription();
      });

      // 開始第一個階段
      let currentStage = 0;
      this.progressControl.setStage(currentStage); // 準備檔案或準備環境
      this.progressControl.update(10, '開始處理...');
      
      // 顯示處理詳情
      this.progressControl.addDetail('檔案名稱', file.name);
      this.progressControl.addDetail('檔案大小', `${(file.size / 1024 / 1024).toFixed(2)} MB`);
      this.progressControl.addDetail('處理策略', preprocessResult.strategy);

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

      // 根據預處理結果處理
      let finalResult = null;

      if (preprocessResult.strategy === 'direct') {
        // 直接轉譯 - 需要檢查 API Key
        if (!this.apiKey) {
          this.showNotification('使用雲端 API 需要設定 API Key', 'error');
          this.showModal(document.getElementById('settingsModal'));
          throw new Error('缺少 API Key');
        }
        
        // 初始化 API（如果還沒有）
        if (!this.whisperAPI) {
          this.whisperAPI = new WhisperAPI();
        }
        
        this.progressControl.setStage(currentStage++); // 執行轉譯
        this.progressControl.update(50, '正在進行 API 轉譯...');
        this.progressControl.addDetail('轉譯方式', '雲端 API');
        
        floatingCancelButton.updateStatus('正在轉譯...');
        
        // 檢查是否已取消
        this.transcriptionCancellationToken.throwIfCancelled();
        
        finalResult = await this.whisperAPI.transcribe(file, {
          language: 'zh',
          prompt: '以下是普通話的對話內容。',
          skipSizeCheck: false,  // 原始檔案需要檢查大小
          signal: this.transcriptionCancellationToken.signal  // 傳遞取消信號
        });
        
        this.progressControl.update(90, '轉譯完成，處理結果中...');
      } else if (preprocessResult.strategy === 'wasm') {
        // 使用 WASM 本地轉譯
        this.progressControl.setStage(currentStage++); // 執行轉譯
        this.progressControl.update(50, '正在進行本地轉譯...');
        this.progressControl.addDetail('轉譯方式', 'WebAssembly 本地');
        this.progressControl.addDetail('模型', preprocessResult.model);

        try {
          // 檢查是否已取消
          this.transcriptionCancellationToken.throwIfCancelled();
          
          // 使用預處理器返回的 WASM 管理器
          const wasmManager = preprocessResult.wasmManager;

          // 執行本地轉譯，傳入取消令牌
          finalResult = await wasmManager.transcribe(file, {
            cancellationToken: this.transcriptionCancellationToken,
            onProgress: (progress) => {
              // 在進度回調中檢查取消狀態
              if (this.transcriptionCancellationToken.isCancelled) {
                throw new Error('操作已取消');
              }
              // 更新進度管理器
              const overallProgress = 50 + (progress.percentage * 0.4); // 50-90%
              this.progressControl.update(overallProgress, progress.message);
              this.progressControl.addDetail('處理速度', `${progress.speed || 'N/A'}x`);
            }
          });

          // 標記為 WASM 處理
          finalResult.method = 'wasm';
          finalResult.model = preprocessResult.model;
          
          this.progressControl.update(90, '轉譯完成，處理結果中...');

        } catch (error) {
          if (error.name === 'CancellationError') {
            throw error;  // 重新拋出取消錯誤
          }
          if (typeof DEBUG !== 'undefined' && DEBUG) console.error('WASM 轉譯失敗:', error);
          throw new Error(`本地轉譯失敗: ${error.message}`);
        }
      } else if (preprocessResult.strategy === 'large-file-system') {
        // 使用新的大檔案處理系統
        this.progressControl.setStage(currentStage++); // 分析檔案
        this.progressControl.update(10, '分析音訊檔案...');
        this.progressControl.addDetail('轉譯方式', '大檔案處理系統');
        
        floatingCancelButton.updateStatus('處理大檔案...');
        
        try {
          // 檢查 API Key（大檔案系統需要 API）
          if (!this.apiKey) {
            this.showNotification('大檔案處理需要設定 API Key', 'error');
            this.showModal(document.getElementById('settingsModal'));
            throw new Error('缺少 API Key');
          }
          
          // 初始化 API（如果還沒有）
          if (!this.whisperAPI) {
            this.whisperAPI = new WhisperAPI();
          }
          
          // 關閉當前的進度控制（大檔案系統有自己的進度管理）
          if (this.progressControl) {
            this.progressControl.close();
            this.progressControl = null;
          }
          
          // 使用大檔案處理系統
          const result = await largeFileIntegration.processLargeFile(preprocessResult.file, {
            cancellationToken: this.transcriptionCancellationToken,
            transcribeCallback: async (segment) => {
              // 對每個片段調用 API 轉譯
              return await this.whisperAPI.transcribe(segment.file, {
                language: 'zh',
                prompt: '以下是普通話的對話內容。',
                skipSizeCheck: true,
                signal: this.transcriptionCancellationToken.signal
              });
            }
          });
          
          // 將結果格式化為標準格式
          finalResult = {
            text: result.text,
            segments: result.segments,
            language: 'zh',
            duration: result.duration || 0,
            method: 'large-file-system',
            processingInfo: result.processingInfo
          };
          
        } catch (error) {
          if (error.name === 'CancellationError') {
            throw error;
          }
          if (typeof DEBUG !== 'undefined' && DEBUG) console.error('大檔案處理失敗:', error);
          throw new Error(`大檔案處理失敗: ${error.message}`);
        }
      } else {
        // 需要分段或壓縮處理 - 這些都需要 API
        if (!this.apiKey) {
          this.showNotification('使用雲端 API 需要設定 API Key', 'error');
          this.showModal(document.getElementById('settingsModal'));
          throw new Error('缺少 API Key');
        }
        
        // 初始化 API（如果還沒有）
        if (!this.whisperAPI) {
          this.whisperAPI = new WhisperAPI();
        }
        
        this.progressControl.setStage(currentStage++); // 執行轉譯
        this.progressControl.update(50, `使用${preprocessResult.strategy}策略處理...`);
        this.progressControl.addDetail('處理策略', preprocessResult.strategy);

        const allSegments = [];
        let allText = '';
        const totalFiles = preprocessResult.files.length;
        
        // 如果有多個分段，顯示分段進度
        let segmentProgress = null;
        if (totalFiles > 1) {
          segmentProgress = progressManager.showSegmentProgress(totalFiles);
          this.progressControl.addDetail('總段數', totalFiles);
        }

        // 處理每個分段
        for (let i = 0; i < totalFiles; i++) {
          // 檢查是否已取消
          this.transcriptionCancellationToken.throwIfCancelled();
          
          const segmentFile = preprocessResult.files[i];
          const segmentInfo = preprocessResult.segments ? preprocessResult.segments[i] : null;

          const segmentPercentage = 50 + ((i / totalFiles) * 40); // 50-90%
          this.progressControl.update(
            segmentPercentage,
            `正在轉譯第 ${i + 1}/${totalFiles} 段...`
          );
          
          if (segmentProgress) {
            segmentProgress.setSegmentStatus(i, 'processing');
          }
          
          floatingCancelButton.updateStatus(`轉譯第 ${i + 1}/${totalFiles} 段`);

          try {
            const segmentResult = await this.whisperAPI.transcribe(segmentFile, {
              language: 'zh',
              prompt: '以下是普通話的對話內容。',
              skipSizeCheck: true,  // 已處理的檔案跳過大小檢查
              signal: this.transcriptionCancellationToken.signal  // 傳遞取消信號
            });

            // 如果有分段資訊，調整時間戳
            if (segmentInfo && segmentResult.segments) {
              const timeOffset = segmentInfo.startTime;
              segmentResult.segments.forEach(seg => {
                seg.start += timeOffset;
                seg.end += timeOffset;
              });
            }

            allSegments.push(...(segmentResult.segments || []));
            allText += (allText ? ' ' : '') + segmentResult.text;
            
            if (segmentProgress) {
              segmentProgress.setSegmentStatus(i, 'completed');
            }

          } catch (error) {
            if (typeof DEBUG !== 'undefined' && DEBUG) console.error(`分段 ${i + 1} 轉譯失敗:`, error);
            throw new Error(`分段 ${i + 1} 轉譯失敗: ${error.message}`);
          }
        }
        
        this.progressControl.update(90, '所有分段轉譯完成，合併結果中...');

        // 合併結果
        finalResult = {
          text: allText,
          segments: allSegments,
          language: 'zh',
          duration: preprocessResult.totalDuration || 0
        };

        // 顯示處理資訊
        if (preprocessResult.compressionRatio) {
          this.showNotification(
            `檔案已壓縮至 ${(preprocessResult.compressionRatio * 100).toFixed(0)}% 大小`,
            'info'
          );
        }
      }

      // 更新進度：處理結果
      this.progressControl.setStage(currentStage++); // 處理結果
      this.progressControl.update(95, '儲存轉譯結果...');
      
      // 儲存結果
      this.currentProject.transcription = {
        text: finalResult.text,
        segments: finalResult.segments,
        language: finalResult.language,
        duration: finalResult.duration,
        createdAt: new Date().toISOString(),
        processingStrategy: preprocessResult.strategy,
        processingInfo: {
          originalSize: file.size,
          processedFiles: preprocessResult.files.length,
          compressionRatio: preprocessResult.compressionRatio
        }
      };

      // 顯示結果
      this.displayTranscription();

      // 儲存專案
      this.saveProject();
      
      // 完成進度
      this.progressControl.addDetail('轉譯段落數', finalResult.segments.length);
      this.progressControl.addDetail('總時長', `${Math.round(finalResult.duration / 60)} 分鐘`);
      this.progressControl.complete();

      this.showNotification('轉譯完成！', 'success');

    } catch (error) {
      // 判斷是否為取消操作
      if (error.name === 'CancellationError' || error.message.includes('取消')) {
        this.showNotification('轉譯已取消', 'info');
        if (this.progressControl) {
          this.progressControl.close();
        }
      } else {
        this.showNotification(`轉譯失敗：${error.message}`, 'error');
        if (this.progressControl) {
          this.progressControl.error(`轉譯失敗：${error.message}`);
        }
      }
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('Transcription error:', error);
    } finally {
      this.isTranscribing = false;
      this.transcriptionCancellationToken = null;  // 清理取消令牌
      this.progressControl = null;  // 清理進度控制

      // 恢復按鈕狀態
      const transcribeBtn = document.getElementById('transcribeBtn');
      if (transcribeBtn) {
        transcribeBtn.disabled = false;
        transcribeBtn.textContent = '開始轉譯';
      }

      // 隱藏狀態
      this.hideTranscriptionStatus();
      
      // 隱藏浮動取消按鈕
      floatingCancelButton.hide();

      // 清理預處理器資源
      transcriptionPreprocessor.cleanup();
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
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('匯出失敗:', error);
      this.showNotification(`匯出失敗：${error.message}`, 'error');
    }
  }

  // 通知功能
  showNotification(message, type = 'success') {
    notify[type](message);
  }

  // 顯示轉譯狀態
  showTranscriptionStatus(message, showProgress = true, showCancel = false) {
    const statusSection = document.getElementById('transcriptionStatus');
    const statusMessage = document.getElementById('statusMessage');
    const progressIndicator = document.getElementById('progressIndicator');

    if (statusSection) {
      statusSection.style.display = 'block';
      
      // 如果需要顯示取消按鈕
      if (showCancel && this.transcriptionCancellationToken) {
        // 檢查是否已有取消按鈕
        let cancelBtn = statusSection.querySelector('.cancel-btn');
        if (!cancelBtn) {
          // 創建取消按鈕
          cancelBtn = document.createElement('button');
          cancelBtn.className = 'btn btn-secondary cancel-btn';
          cancelBtn.style.marginLeft = '10px';
          cancelBtn.textContent = '取消';
          cancelBtn.onclick = () => this.cancelTranscription();
          
          // 將按鈕添加到狀態訊息旁邊
          if (statusMessage && statusMessage.parentNode) {
            statusMessage.parentNode.appendChild(cancelBtn);
          }
        }
      } else {
        // 移除取消按鈕（如果存在）
        const cancelBtn = statusSection.querySelector('.cancel-btn');
        if (cancelBtn) {
          cancelBtn.remove();
        }
      }
    }
    
    if (statusMessage) {
      statusMessage.textContent = message;
    }
    if (progressIndicator) {
      progressIndicator.style.display = showProgress ? 'block' : 'none';
    }
  }
  
  // 取消轉譯
  cancelTranscription() {
    if (this.transcriptionCancellationToken && !this.transcriptionCancellationToken.isCancelled) {
      this.transcriptionCancellationToken.cancel('使用者取消操作');
      
      // 如果有 API 請求，也取消它
      if (this.whisperAPI) {
        this.whisperAPI.cancel();
      }
      
      // 關閉進度管理器
      if (this.progressControl) {
        this.progressControl.close();
        this.progressControl = null;
      }
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
  toggleSearch(showReplace = false) {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    const replaceRow = document.getElementById('replaceRow');

    if (!searchBar) return;

    const isVisible = searchBar.style.display === 'block';

    if (isVisible && !showReplace) {
      this.closeSearch();
    } else {
      searchBar.style.display = 'block';

      // 顯示或隱藏取代列
      if (replaceRow) {
        replaceRow.style.display = showReplace ? 'flex' : 'none';
      }

      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }
  }

  closeSearch() {
    const searchBar = document.getElementById('searchBar');
    const searchInput = document.getElementById('searchInput');
    const replaceInput = document.getElementById('replaceInput');
    const replaceRow = document.getElementById('replaceRow');

    if (searchBar) {
      searchBar.style.display = 'none';
    }

    if (searchInput) {
      searchInput.value = '';
    }

    if (replaceInput) {
      replaceInput.value = '';
    }

    if (replaceRow) {
      replaceRow.style.display = 'none';
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

  handleReplace() {
    const replaceInput = document.getElementById('replaceInput');
    if (!this.editor || !replaceInput) return;

    const replaced = this.editor.replaceCurrent(replaceInput.value);
    if (replaced) {
      this.showNotification('已取代一個匹配項', 'success');
    } else {
      this.showNotification('目前位置沒有可取代的內容', 'warning');
    }
  }

  handleReplaceAll() {
    const replaceInput = document.getElementById('replaceInput');
    if (!this.editor || !replaceInput) return;

    const count = this.editor.replaceAll(replaceInput.value);
    if (count > 0) {
      this.showNotification(`已取代 ${count} 個匹配項`, 'success');
    } else {
      this.showNotification('沒有找到可取代的內容', 'warning');
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
      listContainer.classList.add('hidden');
      noProjectsMsg.classList.remove('hidden');
    } else {
      listContainer.classList.remove('hidden');
      noProjectsMsg.classList.add('hidden');

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
        btn.addEventListener('click', async (e) => {
          const projectId = e.target.dataset.projectId;
          const confirmed = await dialog.confirm({
            title: '刪除專案',
            message: '確定要刪除此專案嗎？此操作無法復原。',
            type: 'warning'
          });

          if (confirmed) {
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
          if (typeof DEBUG !== 'undefined' && DEBUG) console.error('無法載入專案:', key, e);
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
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('載入專案失敗:', e);
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
