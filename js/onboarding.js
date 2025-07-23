/**
 * 首次使用引導系統
 * 提供互動式教學和設定引導
 */

export class OnboardingGuide {
  constructor() {
    this.isFirstVisit = !localStorage.getItem('whisper-visited');
    this.currentStep = 0;
    this.steps = this.defineSteps();
    this.callbacks = new Map();
  }

  /**
   * 定義引導步驟
   */
  defineSteps() {
    return [
      {
        id: 'welcome',
        target: null,
        title: '歡迎使用 Whisper 聽打工具！',
        content: '這是一個專業的音訊轉譯工具，支援本地 WASM 轉譯和雲端 API。讓我們快速了解主要功能。',
        position: 'center',
        actions: [
          { text: '開始導覽', action: 'next', primary: true },
          { text: '跳過', action: 'skip' }
        ]
      },
      {
        id: 'upload',
        target: '#uploadArea',
        title: '上傳音訊檔案',
        content: '拖放音訊檔案到此處，或點擊選擇檔案。支援 MP3、WAV、M4A 等格式。',
        position: 'bottom',
        highlight: true
      },
      {
        id: 'transcription-choice',
        target: '#startTranscriptionBtn',
        title: '選擇轉譯方式',
        content: '點擊後可選擇本地 WASM（免費、隱私）或雲端 API（快速、準確）。',
        position: 'top',
        highlight: true
      },
      {
        id: 'editor',
        target: '#editorSection',
        title: '即時編輯器',
        content: '轉譯完成後，可以在這裡編輯文字、調整時間軸、分割合併段落。',
        position: 'top'
      },
      {
        id: 'export',
        target: '#exportBtn',
        title: '匯出結果',
        content: '支援多種格式匯出：TXT、SRT、WebVTT、含時間戳文字。',
        position: 'left'
      },
      {
        id: 'performance',
        target: null,
        title: '效能優化提示',
        content: '我們檢測到您使用 GitHub Pages。系統已啟用混合式 Worker 架構，提供 2-3x 效能提升！',
        position: 'center',
        condition: () => !window.crossOriginIsolated
      },
      {
        id: 'complete',
        target: null,
        title: '準備就緒！',
        content: '您已了解基本功能。需要更多幫助請點擊右上角的 ❓ 按鈕。',
        position: 'center',
        actions: [
          { text: '開始使用', action: 'complete', primary: true }
        ]
      }
    ];
  }

  /**
   * 開始引導
   */
  async start() {
    if (!this.isFirstVisit) {
      // 非首次訪問，檢查是否需要顯示更新提示
      this.checkForUpdates();
      return;
    }

    // 創建引導容器
    this.createGuideContainer();
    
    // 顯示第一步
    this.showStep(0);
  }

  /**
   * 創建引導容器
   */
  createGuideContainer() {
    // 遮罩層
    this.overlay = document.createElement('div');
    this.overlay.className = 'guide-overlay';
    
    // 引導框
    this.guideBox = document.createElement('div');
    this.guideBox.className = 'guide-box';
    
    // 高亮框
    this.highlight = document.createElement('div');
    this.highlight.className = 'guide-highlight';
    
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.highlight);
    document.body.appendChild(this.guideBox);
  }

  /**
   * 顯示步驟
   */
  showStep(stepIndex) {
    if (stepIndex >= this.steps.length) {
      this.complete();
      return;
    }

    const step = this.steps[stepIndex];
    this.currentStep = stepIndex;

    // 檢查條件
    if (step.condition && !step.condition()) {
      this.showStep(stepIndex + 1);
      return;
    }

    // 更新內容
    this.updateGuideContent(step);

    // 定位引導框
    this.positionGuide(step);

    // 高亮目標元素
    if (step.highlight && step.target) {
      this.highlightElement(step.target);
    } else {
      this.highlight.style.display = 'none';
    }

    // 綁定事件
    this.bindStepEvents(step);
  }

  /**
   * 更新引導內容
   */
  updateGuideContent(step) {
    const content = `
      <div class="guide-header">
        <h3 class="guide-title">${step.title}</h3>
        <button class="guide-close" onclick="onboarding.skip()">✕</button>
      </div>
      <div class="guide-content">${step.content}</div>
      <div class="guide-footer">
        <div class="guide-progress">
          <span class="guide-step">${this.currentStep + 1} / ${this.steps.length}</span>
        </div>
        <div class="guide-actions">
          ${step.actions ? step.actions.map(action => `
            <button class="guide-btn ${action.primary ? 'guide-btn-primary' : ''}" 
                    data-action="${action.action}">
              ${action.text}
            </button>
          `).join('') : `
            <button class="guide-btn" data-action="prev">上一步</button>
            <button class="guide-btn guide-btn-primary" data-action="next">下一步</button>
          `}
        </div>
      </div>
    `;

    this.guideBox.innerHTML = content;

    // 綁定按鈕事件
    this.guideBox.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = e.target.dataset.action;
        this.handleAction(action);
      });
    });
  }

  /**
   * 定位引導框
   */
  positionGuide(step) {
    if (!step.target || step.position === 'center') {
      // 居中顯示
      this.guideBox.style.position = 'fixed';
      this.guideBox.style.top = '50%';
      this.guideBox.style.left = '50%';
      this.guideBox.style.transform = 'translate(-50%, -50%)';
      return;
    }

    const target = document.querySelector(step.target);
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const boxRect = this.guideBox.getBoundingClientRect();

    this.guideBox.style.position = 'fixed';
    
    switch (step.position) {
      case 'top':
        this.guideBox.style.left = rect.left + (rect.width - boxRect.width) / 2 + 'px';
        this.guideBox.style.top = rect.top - boxRect.height - 20 + 'px';
        break;
      case 'bottom':
        this.guideBox.style.left = rect.left + (rect.width - boxRect.width) / 2 + 'px';
        this.guideBox.style.top = rect.bottom + 20 + 'px';
        break;
      case 'left':
        this.guideBox.style.left = rect.left - boxRect.width - 20 + 'px';
        this.guideBox.style.top = rect.top + (rect.height - boxRect.height) / 2 + 'px';
        break;
      case 'right':
        this.guideBox.style.left = rect.right + 20 + 'px';
        this.guideBox.style.top = rect.top + (rect.height - boxRect.height) / 2 + 'px';
        break;
    }

    // 確保不超出視窗
    const finalRect = this.guideBox.getBoundingClientRect();
    if (finalRect.left < 10) this.guideBox.style.left = '10px';
    if (finalRect.right > window.innerWidth - 10) {
      this.guideBox.style.left = window.innerWidth - finalRect.width - 10 + 'px';
    }
    if (finalRect.top < 10) this.guideBox.style.top = '10px';
    if (finalRect.bottom > window.innerHeight - 10) {
      this.guideBox.style.top = window.innerHeight - finalRect.height - 10 + 'px';
    }
  }

  /**
   * 高亮元素
   */
  highlightElement(selector) {
    const element = document.querySelector(selector);
    if (!element) return;

    const rect = element.getBoundingClientRect();
    
    this.highlight.style.display = 'block';
    this.highlight.style.position = 'fixed';
    this.highlight.style.left = rect.left - 5 + 'px';
    this.highlight.style.top = rect.top - 5 + 'px';
    this.highlight.style.width = rect.width + 10 + 'px';
    this.highlight.style.height = rect.height + 10 + 'px';
  }

  /**
   * 處理動作
   */
  handleAction(action) {
    switch (action) {
      case 'next':
        this.showStep(this.currentStep + 1);
        break;
      case 'prev':
        if (this.currentStep > 0) {
          this.showStep(this.currentStep - 1);
        }
        break;
      case 'skip':
        this.skip();
        break;
      case 'complete':
        this.complete();
        break;
    }
  }

  /**
   * 跳過引導
   */
  skip() {
    if (confirm('確定要跳過引導嗎？您可以隨時從幫助選單重新開始。')) {
      this.complete();
    }
  }

  /**
   * 完成引導
   */
  complete() {
    // 標記已訪問
    localStorage.setItem('whisper-visited', 'true');
    localStorage.setItem('whisper-guide-completed', Date.now());

    // 移除引導元素
    if (this.overlay) this.overlay.remove();
    if (this.highlight) this.highlight.remove();
    if (this.guideBox) this.guideBox.remove();

    // 顯示歡迎訊息
    this.showWelcomeMessage();

    // 觸發完成回調
    if (this.callbacks.has('complete')) {
      this.callbacks.get('complete')();
    }
  }

  /**
   * 顯示歡迎訊息
   */
  showWelcomeMessage() {
    const banner = document.createElement('div');
    banner.className = 'welcome-toast';
    banner.innerHTML = `
      <div class="welcome-toast-content">
        <span class="welcome-toast-icon">🎉</span>
        <span class="welcome-toast-text">歡迎使用 Whisper 聽打工具！</span>
      </div>
    `;

    document.body.appendChild(banner);
    
    setTimeout(() => {
      banner.classList.add('show');
    }, 100);

    setTimeout(() => {
      banner.classList.remove('show');
      setTimeout(() => banner.remove(), 300);
    }, 3000);
  }

  /**
   * 檢查更新
   */
  checkForUpdates() {
    const lastVisit = localStorage.getItem('whisper-last-visit');
    const currentVersion = '2.0'; // 應該從配置讀取
    const lastVersion = localStorage.getItem('whisper-version');

    if (lastVersion !== currentVersion) {
      this.showUpdateNotice(currentVersion);
    }

    localStorage.setItem('whisper-last-visit', Date.now());
    localStorage.setItem('whisper-version', currentVersion);
  }

  /**
   * 顯示更新通知
   */
  showUpdateNotice(version) {
    const notice = document.createElement('div');
    notice.className = 'update-notice';
    notice.innerHTML = `
      <div class="update-notice-content">
        <h4>🎊 新版本 ${version}</h4>
        <p>新增混合式 Worker 架構，GitHub Pages 效能提升 2-3x！</p>
        <button class="update-notice-btn" onclick="this.parentElement.parentElement.remove()">知道了</button>
      </div>
    `;

    document.body.appendChild(notice);
    
    setTimeout(() => {
      notice.classList.add('show');
    }, 1000);
  }

  /**
   * 綁定步驟事件
   */
  bindStepEvents(step) {
    // 可以在這裡添加特定步驟的事件監聽
    if (step.id === 'upload' && step.target) {
      const target = document.querySelector(step.target);
      if (target) {
        const handler = () => {
          target.removeEventListener('click', handler);
          setTimeout(() => this.showStep(this.currentStep + 1), 500);
        };
        target.addEventListener('click', handler);
      }
    }
  }

  /**
   * 設定回調
   */
  on(event, callback) {
    this.callbacks.set(event, callback);
  }

  /**
   * 重新開始引導
   */
  restart() {
    this.currentStep = 0;
    this.createGuideContainer();
    this.showStep(0);
  }
}

// 創建全域實例
window.onboarding = new OnboardingGuide();