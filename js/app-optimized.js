/**
 * 優化的應用程式入口
 * 實現漸進式載入和效能優化
 */

// 效能監控
const performanceMonitor = {
  marks: new Map(),
  measures: new Map(),
  
  mark(name) {
    performance.mark(name);
    this.marks.set(name, performance.now());
  },
  
  measure(name, startMark, endMark) {
    performance.measure(name, startMark, endMark);
    const measure = performance.getEntriesByName(name, 'measure')[0];
    this.measures.set(name, measure.duration);
    console.log(`[Performance] ${name}: ${measure.duration.toFixed(2)}ms`);
  },
  
  getStats() {
    return {
      marks: Object.fromEntries(this.marks),
      measures: Object.fromEntries(this.measures)
    };
  }
};

// 標記開始
performanceMonitor.mark('app-start');

// 啟動類別
class OptimizedApp {
  constructor() {
    this.modules = new Map();
    this.initialized = false;
  }

  /**
   * 初始化應用程式
   */
  async initialize() {
    try {
      // 顯示啟動畫面
      this.showSplashScreen();
      
      // 載入核心樣式
      await this.loadCoreStyles();
      
      // 載入核心模組
      await this.loadCoreModules();
      
      // 初始化基礎功能
      await this.initializeCore();
      
      // 檢查首次使用
      this.checkFirstVisit();
      
      // 隱藏啟動畫面
      this.hideSplashScreen();
      
      // 標記應用程式準備完成
      performanceMonitor.mark('app-ready');
      performanceMonitor.measure('total-init-time', 'app-start', 'app-ready');
      
      // 預載入其他模組（不阻塞）
      this.preloadModules();
      
      // 顯示效能提示
      this.showPerformanceTips();
      
    } catch (error) {
      console.error('應用程式初始化失敗:', error);
      this.showErrorScreen(error);
    }
  }

  /**
   * 顯示啟動畫面
   */
  showSplashScreen() {
    const splash = document.createElement('div');
    splash.className = 'splash-screen';
    splash.id = 'splashScreen';
    splash.innerHTML = `
      <div class="splash-logo">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="50" fill="var(--primary-color, #0066cc)" opacity="0.1"/>
          <path d="M40 60 L50 45 L60 75 L70 35 L80 60" 
                stroke="var(--primary-color, #0066cc)" 
                stroke-width="4" 
                fill="none" 
                stroke-linecap="round" 
                stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="splash-progress">
        <div class="splash-progress-bar">
          <div class="splash-progress-fill" id="splashProgress"></div>
        </div>
      </div>
      <div class="splash-status" id="splashStatus">正在載入...</div>
    `;
    document.body.appendChild(splash);
  }

  /**
   * 更新啟動進度
   */
  updateSplashProgress(percent, status) {
    const progressBar = document.getElementById('splashProgress');
    const statusText = document.getElementById('splashStatus');
    
    if (progressBar) {
      progressBar.style.width = percent + '%';
    }
    
    if (statusText) {
      statusText.textContent = status;
    }
  }

  /**
   * 隱藏啟動畫面
   */
  hideSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if (splash) {
      splash.classList.add('fade-out');
      setTimeout(() => splash.remove(), 300);
    }
  }

  /**
   * 載入核心樣式
   */
  async loadCoreStyles() {
    performanceMonitor.mark('styles-start');
    
    // 關鍵 CSS 已內聯在 HTML 中
    // 延遲載入非關鍵樣式
    const nonCriticalStyles = [
      'css/preprocessing.css',
      'css/progress.css',
      'css/onboarding.css'
    ];
    
    // 使用 requestIdleCallback 載入非關鍵樣式
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => {
        nonCriticalStyles.forEach(href => {
          const link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          document.head.appendChild(link);
        });
      });
    }
    
    performanceMonitor.mark('styles-end');
    performanceMonitor.measure('styles-load', 'styles-start', 'styles-end');
  }

  /**
   * 載入核心模組
   */
  async loadCoreModules() {
    performanceMonitor.mark('modules-start');
    this.updateSplashProgress(20, '載入核心模組...');
    
    // 動態載入核心載入器
    const { coreLoader } = await import('./core-loader.js');
    this.coreLoader = coreLoader;
    
    // 載入必要模組
    const [notification, dialog, debounce] = await coreLoader.loadCoreModules();
    
    this.modules.set('notification', notification);
    this.modules.set('dialog', dialog);
    this.modules.set('debounce', debounce);
    
    performanceMonitor.mark('modules-end');
    performanceMonitor.measure('modules-load', 'modules-start', 'modules-end');
    
    this.updateSplashProgress(40, '初始化介面...');
  }

  /**
   * 初始化核心功能
   */
  async initializeCore() {
    performanceMonitor.mark('core-init-start');
    
    // 初始化主題
    this.initializeTheme();
    
    // 初始化基本 UI
    this.initializeBasicUI();
    
    // 載入使用者設定
    this.loadUserSettings();
    
    // 綁定基本事件
    this.bindCoreEvents();
    
    performanceMonitor.mark('core-init-end');
    performanceMonitor.measure('core-init', 'core-init-start', 'core-init-end');
    
    this.updateSplashProgress(70, '準備就緒...');
  }

  /**
   * 初始化主題
   */
  initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'auto';
    if (savedTheme === 'dark' || (savedTheme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      document.documentElement.setAttribute('data-theme', 'dark');
    }
  }

  /**
   * 初始化基本 UI
   */
  initializeBasicUI() {
    // 移除骨架屏
    document.querySelectorAll('.skeleton-loader').forEach(el => {
      el.classList.remove('skeleton-loader');
    });
    
    // 顯示主要內容
    const app = document.getElementById('app');
    if (app) {
      app.style.opacity = '1';
    }
  }

  /**
   * 載入使用者設定
   */
  loadUserSettings() {
    const settings = {
      apiKey: localStorage.getItem('whisperApiKey'),
      defaultModel: localStorage.getItem('defaultModel') || 'base',
      autoSave: localStorage.getItem('autoSave') === 'true',
      showPunctuation: localStorage.getItem('showPunctuation') !== 'false'
    };
    
    window.userSettings = settings;
  }

  /**
   * 綁定核心事件
   */
  bindCoreEvents() {
    // 檔案上傳
    const uploadArea = document.getElementById('uploadArea');
    const audioInput = document.getElementById('audioInput');
    const selectFileBtn = document.getElementById('selectFileBtn');
    
    if (uploadArea && audioInput) {
      // 點擊上傳
      uploadArea.addEventListener('click', () => audioInput.click());
      selectFileBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        audioInput.click();
      });
      
      // 拖放上傳
      uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
      });
      
      uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
      });
      
      uploadArea.addEventListener('drop', async (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        
        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('audio/')) {
          // 延遲載入處理模組
          const { handleAudioFile } = await this.loadModule('audioHandler');
          handleAudioFile(file);
        }
      });
      
      // 檔案選擇
      audioInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
          const { handleAudioFile } = await this.loadModule('audioHandler');
          handleAudioFile(file);
        }
      });
    }
    
    // 主題切換
    const themeToggle = document.getElementById('themeToggleBtn');
    if (themeToggle) {
      themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
      });
    }
    
    // 幫助按鈕
    const helpBtn = document.getElementById('helpBtn');
    if (helpBtn) {
      helpBtn.addEventListener('click', async () => {
        // 延遲載入引導模組
        await this.loadModule('onboarding');
        window.onboarding.restart();
      });
    }
  }

  /**
   * 檢查首次訪問
   */
  checkFirstVisit() {
    const isFirstVisit = !localStorage.getItem('whisper-visited');
    
    if (isFirstVisit) {
      // 顯示首次使用橫幅
      setTimeout(() => {
        this.showFirstUseBanner();
      }, 1000);
    }
  }

  /**
   * 顯示首次使用橫幅
   */
  showFirstUseBanner() {
    const banner = document.createElement('div');
    banner.className = 'first-use-banner show';
    banner.innerHTML = `
      <h2>歡迎使用 Whisper 聽打工具！👋</h2>
      <p>這是您第一次使用，需要快速導覽嗎？</p>
      <div class="first-use-actions">
        <button onclick="app.startOnboarding()">開始導覽</button>
        <button onclick="this.parentElement.parentElement.remove()">稍後再說</button>
      </div>
    `;
    
    const main = document.querySelector('.app-main');
    if (main) {
      main.insertBefore(banner, main.firstChild);
    }
  }

  /**
   * 開始引導
   */
  async startOnboarding() {
    // 移除橫幅
    document.querySelector('.first-use-banner')?.remove();
    
    // 載入並啟動引導
    await this.loadModule('onboarding');
    window.onboarding.start();
  }

  /**
   * 預載入模組
   */
  preloadModules() {
    // 使用 requestIdleCallback 預載入
    const modulesToPreload = [
      'player',
      'editor',
      'api',
      'export'
    ];
    
    modulesToPreload.forEach((module, index) => {
      setTimeout(() => {
        this.coreLoader.preloadModule(module);
      }, 1000 + index * 500); // 錯開載入時間
    });
  }

  /**
   * 載入模組
   */
  async loadModule(moduleName) {
    if (!this.modules.has(moduleName)) {
      // 顯示載入提示
      this.showLoadingHint(`載入${moduleName}模組...`);
      
      const module = await this.coreLoader.loadModule(moduleName);
      this.modules.set(moduleName, module);
      
      // 隱藏載入提示
      this.hideLoadingHint();
    }
    
    return this.modules.get(moduleName);
  }

  /**
   * 顯示載入提示
   */
  showLoadingHint(message) {
    let hint = document.getElementById('loadingHint');
    if (!hint) {
      hint = document.createElement('div');
      hint.id = 'loadingHint';
      hint.className = 'loading-hint';
      hint.innerHTML = `
        <div class="loading-hint-spinner"></div>
        <span class="loading-hint-text">${message}</span>
      `;
      document.body.appendChild(hint);
    } else {
      hint.querySelector('.loading-hint-text').textContent = message;
    }
    
    setTimeout(() => hint.classList.add('show'), 10);
  }

  /**
   * 隱藏載入提示
   */
  hideLoadingHint() {
    const hint = document.getElementById('loadingHint');
    if (hint) {
      hint.classList.remove('show');
      setTimeout(() => hint.remove(), 300);
    }
  }

  /**
   * 顯示效能提示
   */
  showPerformanceTips() {
    // 檢查是否在 GitHub Pages
    if (!window.crossOriginIsolated && location.hostname.includes('github.io')) {
      setTimeout(() => {
        const tip = document.createElement('div');
        tip.className = 'performance-tip show';
        tip.innerHTML = `
          <div class="performance-tip-header">
            <span class="performance-tip-title">💡 效能提示</span>
            <button class="performance-tip-close" onclick="this.parentElement.parentElement.remove()">×</button>
          </div>
          <div class="performance-tip-content">
            檢測到您使用 GitHub Pages。系統已自動啟用混合式 Worker 架構，提供 2-3x 效能提升！
          </div>
        `;
        document.body.appendChild(tip);
        
        // 5秒後自動關閉
        setTimeout(() => tip.remove(), 5000);
      }, 2000);
    }
    
    // 顯示載入統計
    const stats = performanceMonitor.getStats();
    console.log('載入效能統計:', stats);
  }

  /**
   * 顯示錯誤畫面
   */
  showErrorScreen(error) {
    this.hideSplashScreen();
    
    const errorScreen = document.createElement('div');
    errorScreen.className = 'error-screen';
    errorScreen.innerHTML = `
      <div class="error-content">
        <h1>😔 載入失敗</h1>
        <p>${error.message}</p>
        <button onclick="location.reload()">重新載入</button>
      </div>
    `;
    document.body.appendChild(errorScreen);
  }
}

// 創建應用程式實例
window.app = new OptimizedApp();

// DOM 載入完成後初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.initialize());
} else {
  app.initialize();
}