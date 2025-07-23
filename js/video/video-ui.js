// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

// 改進的視訊播放器 UI 控制模組
import VideoConfig from './video-config.js';
import domReadyManager from './dom-ready-manager.js';

export class VideoUI {
  constructor(player) {
    if (!player || !player.video) {
      throw new Error('VideoUI 需要有效的 VideoPlayer 實例');
    }

    this.player = player;
    this.video = player.video;

    // 初始化狀態
    this.state = {
      initialized: false,
      domReady: false,
      controlsVisible: true,
      controlsTimer: null,
      isDragging: false,
      dragStartTime: 0,
      initError: null
    };

    // 元素將在初始化時收集
    this.elements = {};

    // 定義必要的 DOM 元素
    this.requiredElements = [
      // 容器
      { id: 'videoWrapper', optional: false },
      { id: 'videoPlayerContainer', optional: false },
      { id: 'videoUploadArea', optional: false },
      { id: 'videoControls', optional: false },

      // 載入指示器
      { id: 'videoLoading', optional: true },

      // 播放控制
      { id: 'playPauseBtn', optional: false },
      { id: 'skipBackBtn', optional: false },
      { id: 'skipForwardBtn', optional: false },

      // 進度條
      { id: 'progressContainer', optional: false },
      { id: 'progressSlider', optional: false },
      { id: 'progressPlayed', optional: false },
      { id: 'progressBuffered', optional: false },

      // 時間顯示
      { id: 'currentTime', optional: false },
      { id: 'totalTime', optional: false },

      // 音量控制
      { id: 'muteBtn', optional: false },
      { id: 'volumeSlider', optional: false },

      // 播放速度
      { id: 'videoSpeedSlider', optional: false },
      { id: 'videoSpeedValue', optional: false },

      // 全螢幕
      { id: 'fullscreenBtn', optional: false },

      // 資訊面板（可選）
      { id: 'videoFileName', optional: true },
      { id: 'videoFileSize', optional: true },
      { id: 'videoDuration', optional: true },
      { id: 'videoResolution', optional: true }
    ];
  }

  /**
   * 非同步初始化方法
   * @returns {Promise<Object>} 初始化結果
   */
  async initialize() {
    DEBUG && console.log('🚀 開始 VideoUI 初始化...');

    try {
      // 步驟 1: 註冊必要元素
      domReadyManager.requireElements(this.requiredElements);

      // 步驟 2: 等待 DOM 就緒
      DEBUG && console.log('⏳ 等待 DOM 載入...');
      await domReadyManager.waitForReady(5000);
      this.state.domReady = true;

      // 步驟 3: 收集並驗證元素
      DEBUG && console.log('🔍 收集 DOM 元素...');
      const elementResult = await this.collectAndValidateElements();
      if (!elementResult.success) {
        throw new Error(elementResult.error);
      }

      // 步驟 4: 綁定事件
      DEBUG && console.log('🔗 綁定事件處理器...');
      this.bindEvents();
      this.bindPlayerEvents();
      this.bindErrorHandlerEvents();

      // 步驟 5: 設置初始狀態
      DEBUG && console.log('⚙️ 設置初始狀態...');
      this.setupControls();

      // 標記初始化完成
      this.state.initialized = true;
      DEBUG && console.log('✅ VideoUI 初始化完成');

      return {
        success: true,
        message: 'VideoUI 初始化成功'
      };

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('❌ VideoUI 初始化失敗:', error);
      this.state.initError = error;

      return {
        success: false,
        error: error.message,
        canRetry: true,
        details: this.diagnose()
      };
    }
  }

  /**
   * 收集並驗證 DOM 元素
   */
  async collectAndValidateElements() {
    const checkResult = domReadyManager.checkElements();

    if (!checkResult.allFound) {
      const missingRequired = checkResult.missing.join(', ');
      return {
        success: false,
        error: `缺少必要的 DOM 元素: ${missingRequired}`
      };
    }

    // 收集所有元素到 this.elements
    this.elements = domReadyManager.getAllElements();

    // 額外的元素驗證
    const validationErrors = this.validateElementsIntegrity();
    if (validationErrors.length > 0) {
      return {
        success: false,
        error: `元素完整性檢查失敗: ${validationErrors.join('; ')}`
      };
    }

    DEBUG && console.log(`✅ 成功收集 ${Object.keys(this.elements).length} 個元素`);
    return { success: true };
  }

  /**
   * 驗證元素完整性
   */
  validateElementsIntegrity() {
    const errors = [];

    // 檢查播放按鈕內部結構
    const playPauseBtn = this.elements.playPauseBtn;
    if (playPauseBtn) {
      const playIcon = playPauseBtn.querySelector('.icon-play');
      const pauseIcon = playPauseBtn.querySelector('.icon-pause');
      if (!playIcon || !pauseIcon) {
        errors.push('播放按鈕缺少必要的圖標元素');
      }
    }

    // 檢查音量按鈕內部結構
    const muteBtn = this.elements.muteBtn;
    if (muteBtn) {
      const volumeIcon = muteBtn.querySelector('.icon-volume');
      const muteIcon = muteBtn.querySelector('.icon-mute');
      if (!volumeIcon || !muteIcon) {
        errors.push('音量按鈕缺少必要的圖標元素');
      }
    }

    // 檢查全螢幕按鈕內部結構
    const fullscreenBtn = this.elements.fullscreenBtn;
    if (fullscreenBtn) {
      const expandIcon = fullscreenBtn.querySelector('.icon-expand');
      const compressIcon = fullscreenBtn.querySelector('.icon-compress');
      if (!expandIcon || !compressIcon) {
        errors.push('全螢幕按鈕缺少必要的圖標元素');
      }
    }

    return errors;
  }

  /**
   * 綁定事件（使用快取的元素）
   */
  bindEvents() {
    // 播放控制
    this.elements.playPauseBtn?.addEventListener('click', () => this.togglePlayPause());
    this.elements.skipBackBtn?.addEventListener('click', () => this.skipBack());
    this.elements.skipForwardBtn?.addEventListener('click', () => this.skipForward());

    // 進度條控制
    this.setupProgressControl();

    // 音量控制
    this.elements.muteBtn?.addEventListener('click', () => this.toggleMute());
    this.elements.volumeSlider?.addEventListener('input', (e) => this.setVolume(e.target.value / 100));

    // 播放速度
    this.elements.videoSpeedSlider?.addEventListener('input', (e) => this.handleSpeedChange(e));

    // 全螢幕
    this.elements.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());

    // 滑鼠控制
    this.setupMouseControls();

    // 鍵盤控制
    this.setupKeyboardControls();
  }

  /**
   * 診斷當前狀態
   */
  diagnose() {
    return {
      state: this.state,
      domStatus: domReadyManager.diagnose(),
      playerConnected: !!this.player,
      videoElement: !!this.video,
      elementCount: Object.keys(this.elements).length,
      missingElements: this.requiredElements
        .filter(req => !req.optional && !this.elements[req.id])
        .map(req => req.id)
    };
  }

  /**
   * 重試初始化
   */
  async retry() {
    DEBUG && console.log('🔄 重試 VideoUI 初始化...');

    // 重置狀態
    this.state.initialized = false;
    this.state.initError = null;
    this.elements = {};

    // 重新初始化
    return await this.initialize();
  }

  /**
   * 銷毀實例
   */
  destroy() {
    if (this.state.controlsTimer) {
      clearTimeout(this.state.controlsTimer);
    }

    // 清理事件監聽器
    // TODO: 實現完整的事件清理

    this.state.initialized = false;
    DEBUG && console.log('VideoUI 已銷毀');
  }

  // ========== 以下是原有的方法，保持不變 ==========

  setupControls() {
    // 初始化音量滑桿
    if (this.elements.volumeSlider && this.player && this.player.state) {
      this.elements.volumeSlider.value = (this.player.state.volume || 1) * 100;
    }

    // 初始化播放速度
    if (this.elements.videoSpeedSlider) {
      this.elements.videoSpeedSlider.value = this.player.state.playbackRate || 1;
    }
    this.updateSpeedDisplay();
  }

  setupProgressControl() {
    const slider = this.elements.progressSlider;
    if (!slider) return;

    // 滑鼠事件
    slider.addEventListener('mousedown', (e) => this.startProgressDrag(e));
    slider.addEventListener('input', (e) => this.updateProgress(e));

    // 觸控事件
    slider.addEventListener('touchstart', (e) => this.startProgressDrag(e));

    // 進度條容器點擊
    this.elements.progressContainer?.addEventListener('click', (e) => this.clickProgress(e));
  }

  handleSpeedChange(e) {
    const speed = parseFloat(e.target.value);
    this.setPlaybackRate(speed);
    this.updateSpeedDisplay();
  }

  setupMouseControls() {
    const wrapper = this.elements.videoWrapper;
    if (!wrapper) return;

    // 滑鼠移動顯示控制列
    wrapper.addEventListener('mousemove', () => this.showControls());
    wrapper.addEventListener('mouseleave', () => this.hideControls());

    // 雙擊全螢幕
    wrapper.addEventListener('dblclick', () => this.toggleFullscreen());

    // 點擊播放/暫停
    this.video.addEventListener('click', () => this.togglePlayPause());
  }

  setupKeyboardControls() {
    document.addEventListener('keydown', (e) => this.handleKeyDown(e));
  }

  bindPlayerEvents() {
    // 監聽播放器事件
    if (!this.video) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('VideoUI: 無法綁定事件，video 元素不存在');
      return;
    }

    this.video.addEventListener('video:play', () => this.updatePlayPauseButton(true));
    this.video.addEventListener('video:pause', () => this.updatePlayPauseButton(false));
    this.video.addEventListener('video:timeupdate', (e) => this.updateTimeDisplay(e.detail));
    this.video.addEventListener('video:progress', (e) => this.updateBufferedProgress(e.detail));
    this.video.addEventListener('video:volumechange', (e) => this.updateVolumeDisplay(e.detail));
    this.video.addEventListener('video:fullscreenchange', (e) => this.updateFullscreenButton(e.detail));
    this.video.addEventListener('video:loadeddata', (e) => this.updateVideoInfo(e.detail));
    this.video.addEventListener('video:error', (e) => this.handleVideoError(e.detail));
    this.video.addEventListener('video:warning', (e) => this.handleVideoWarning(e.detail));
  }

  bindErrorHandlerEvents() {
    // 監聽錯誤處理器事件
    document.addEventListener('memory:warning', (e) => this.handleMemoryWarning(e.detail));
    document.addEventListener('memory:critical', (e) => this.handleMemoryCritical(e.detail));
    document.addEventListener('error:retry', (e) => this.handleErrorRetry(e.detail));
  }

  // ========== UI 顯示控制 ==========

  showPlayer() {
    this.elements.videoPlayerContainer?.classList.remove('hidden');
    this.elements.videoUploadArea?.classList.add('hidden');
  }

  hidePlayer() {
    this.elements.videoPlayerContainer?.classList.add('hidden');
    this.elements.videoUploadArea?.classList.remove('hidden');
  }

  // ========== 播放控制 ==========

  togglePlayPause() {
    this.player.togglePlayPause();
  }

  skipBack() {
    this.player.skipBack();
  }

  skipForward() {
    this.player.skipForward();
  }

  // ========== 進度控制 ==========

  startProgressDrag(e) {
    this.state.isDragging = true;
    this.state.dragStartTime = this.player.video.currentTime;

    const handleMouseMove = (e) => this.updateProgress(e);
    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      this.state.isDragging = false;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  updateProgress(e) {
    if (!this.state.isDragging) return;

    const slider = this.elements.progressSlider;
    const percent = slider.value / 100;
    const duration = this.player.video.duration;

    if (duration) {
      const newTime = percent * duration;
      this.player.seek(newTime);
    }
  }

  clickProgress(e) {
    const container = this.elements.progressContainer;
    const rect = container.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const duration = this.player.video.duration;

    if (duration) {
      const newTime = percent * duration;
      this.player.seek(newTime);
    }
  }

  // ========== 音量控制 ==========

  toggleMute() {
    this.player.toggleMute();
  }

  setVolume(volume) {
    this.player.setVolume(volume);
  }

  // ========== 播放速度控制 ==========

  setPlaybackRate(rate) {
    this.player.setPlaybackRate(rate);
    // 更新滑桿值（如果不是從滑桿觸發的）
    if (this.elements.videoSpeedSlider && this.elements.videoSpeedSlider.value !== rate.toString()) {
      this.elements.videoSpeedSlider.value = rate;
    }
    this.updateSpeedDisplay();
  }

  // ========== 全螢幕控制 ==========

  toggleFullscreen() {
    this.player.toggleFullscreen();
  }

  // ========== 控制列顯示/隱藏 ==========

  showControls() {
    this.elements.videoControls?.classList.remove('hidden');
    this.elements.videoControls?.style.setProperty('opacity', '1', 'important');
    this.state.controlsVisible = true;

    // 重置自動隱藏計時器
    this.resetControlsTimer();
  }

  hideControls() {
    // 只有在播放中且不在拖動時才隱藏控制欄
    if (this.player.isPlaying && !this.state.isDragging) {
      this.elements.videoControls?.style.setProperty('opacity', '0');
      this.state.controlsVisible = false;
    }
  }

  resetControlsTimer() {
    if (this.state.controlsTimer) {
      clearTimeout(this.state.controlsTimer);
    }

    this.state.controlsTimer = setTimeout(() => {
      this.hideControls();
    }, VideoConfig.ui.controlsHideDelay);
  }

  // ========== 鍵盤事件處理 ==========

  handleKeyDown(e) {
    // 避免在輸入框中觸發
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      return;
    }

    const shortcuts = VideoConfig.shortcuts;

    if (shortcuts.playPause.includes(e.key)) {
      e.preventDefault();
      this.togglePlayPause();
    } else if (shortcuts.skipBack.includes(e.key)) {
      e.preventDefault();
      this.skipBack();
    } else if (shortcuts.skipForward.includes(e.key)) {
      e.preventDefault();
      this.skipForward();
    } else if (shortcuts.volumeUp.includes(e.key)) {
      e.preventDefault();
      this.adjustVolume(0.1);
    } else if (shortcuts.volumeDown.includes(e.key)) {
      e.preventDefault();
      this.adjustVolume(-0.1);
    } else if (shortcuts.mute.includes(e.key)) {
      e.preventDefault();
      this.toggleMute();
    } else if (shortcuts.fullscreen.includes(e.key)) {
      e.preventDefault();
      this.toggleFullscreen();
    }
  }

  adjustVolume(delta) {
    const currentVolume = this.player.state.volume;
    const newVolume = Math.max(0, Math.min(1, currentVolume + delta));
    this.setVolume(newVolume);
  }

  // ========== UI 更新方法 ==========

  updatePlayPauseButton(isPlaying) {
    const btn = this.elements.playPauseBtn;
    if (!btn) return;

    const playIcon = btn.querySelector('.icon-play');
    const pauseIcon = btn.querySelector('.icon-pause');

    if (isPlaying) {
      playIcon?.classList.add('hidden');
      pauseIcon?.classList.remove('hidden');
    } else {
      playIcon?.classList.remove('hidden');
      pauseIcon?.classList.add('hidden');
    }
  }

  updateTimeDisplay({ currentTime, duration }) {
    if (this.elements.currentTime) {
      this.elements.currentTime.textContent = this.formatTime(currentTime);
    }

    if (this.elements.totalTime && duration) {
      this.elements.totalTime.textContent = this.formatTime(duration);
    }

    // 更新進度條
    if (!this.state.isDragging && this.elements.progressSlider && duration) {
      const percent = (currentTime / duration) * 100;
      this.elements.progressSlider.value = percent;

      if (this.elements.progressPlayed) {
        this.elements.progressPlayed.style.width = `${percent}%`;
      }
    }
  }

  updateBufferedProgress({ buffered, duration }) {
    if (this.elements.progressBuffered && duration) {
      const percent = (buffered / duration) * 100;
      this.elements.progressBuffered.style.width = `${percent}%`;
    }
  }

  updateVolumeDisplay({ volume, isMuted }) {
    if (this.elements.volumeSlider) {
      this.elements.volumeSlider.value = volume * 100;
    }

    const btn = this.elements.muteBtn;
    if (btn) {
      const volumeIcon = btn.querySelector('.icon-volume');
      const muteIcon = btn.querySelector('.icon-mute');

      if (isMuted) {
        volumeIcon?.classList.add('hidden');
        muteIcon?.classList.remove('hidden');
      } else {
        volumeIcon?.classList.remove('hidden');
        muteIcon?.classList.add('hidden');
      }
    }
  }

  updateFullscreenButton({ isFullscreen }) {
    const btn = this.elements.fullscreenBtn;
    if (!btn) return;

    const expandIcon = btn.querySelector('.icon-expand');
    const compressIcon = btn.querySelector('.icon-compress');

    if (isFullscreen) {
      expandIcon?.classList.add('hidden');
      compressIcon?.classList.remove('hidden');
    } else {
      expandIcon?.classList.remove('hidden');
      compressIcon?.classList.add('hidden');
    }
  }

  updateSpeedDisplay() {
    const speedValue = this.elements.videoSpeedValue;
    if (speedValue && this.player && this.player.state) {
      const speed = this.player.state.playbackRate || 1;
      speedValue.textContent = `${speed.toFixed(1)}x`;
    }
  }

  updateVideoInfo({ file, info }) {
    if (this.elements.videoFileName) {
      this.elements.videoFileName.textContent = file.name;
    }

    if (this.elements.videoFileSize) {
      this.elements.videoFileSize.textContent = this.formatFileSize(file.size);
    }

    if (this.elements.videoDuration) {
      this.elements.videoDuration.textContent = this.formatTime(info.duration);
    }

    if (this.elements.videoResolution) {
      this.elements.videoResolution.textContent = `${info.width}×${info.height}`;
    }
  }

  // ========== 工具方法 ==========

  formatTime(seconds) {
    if (!seconds || !isFinite(seconds)) return '00:00';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
  }

  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // ========== 載入指示器 ==========

  showLoading() {
    this.elements.videoLoading?.classList.remove('hidden');
  }

  hideLoading() {
    this.elements.videoLoading?.classList.add('hidden');
  }

  // ========== 錯誤處理方法 ==========

  handleVideoError(detail) {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error('視訊錯誤:', detail);

    const message = detail.error || '視訊載入錯誤';
    this.showNotification(message, 'error');

    // 如果有詳細資訊，顯示在控制台
    if (detail.details) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('錯誤詳情:', detail.details);
    }
  }

  handleVideoWarning(detail) {
    DEBUG && console.warn('視訊警告:', detail);
    this.showNotification(detail.message, 'warning');
  }

  handleMemoryWarning(detail) {
    DEBUG && console.warn('記憶體警告:', detail);
    this.showNotification(
      `⚠️ ${detail.message}\n${detail.suggestion}`,
      'warning',
      5000
    );
  }

  handleMemoryCritical(detail) {
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error('記憶體危險:', detail);
    this.showNotification(
      `🚨 ${detail.message}\n${detail.suggestion}`,
      'error',
      0 // 不自動隱藏
    );
  }

  handleErrorRetry(detail) {
    DEBUG && console.log('錯誤重試:', detail);
    this.showNotification(
      `🔄 正在重試 (${detail.attempt}/${detail.maxAttempts})...`,
      'info',
      3000
    );
  }

  // 顯示通知訊息
  showNotification(message, type = 'info', duration = 4000) {
    // 創建通知元素
    const notification = document.createElement('div');
    notification.className = `video-notification video-notification-${type}`;
    notification.textContent = message;

    // 添加樣式
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 15px 20px;
      border-radius: 5px;
      font-size: 14px;
      z-index: 10000;
      max-width: 400px;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      animation: slideIn 0.3s ease-out;
    `;

    // 根據類型設置顏色
    switch (type) {
      case 'error':
        notification.style.background = '#f8d7da';
        notification.style.color = '#721c24';
        notification.style.border = '1px solid #f5c6cb';
        break;
      case 'warning':
        notification.style.background = '#fff3cd';
        notification.style.color = '#856404';
        notification.style.border = '1px solid #ffeeba';
        break;
      case 'success':
        notification.style.background = '#d4edda';
        notification.style.color = '#155724';
        notification.style.border = '1px solid #c3e6cb';
        break;
      default:
        notification.style.background = '#d1ecf1';
        notification.style.color = '#0c5460';
        notification.style.border = '1px solid #bee5eb';
    }

    // 添加關閉按鈕
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 5px;
      right: 10px;
      background: none;
      border: none;
      font-size: 20px;
      cursor: pointer;
      opacity: 0.7;
    `;
    closeBtn.onclick = () => notification.remove();
    notification.appendChild(closeBtn);

    // 添加到頁面
    document.body.appendChild(notification);

    // 自動移除
    if (duration > 0) {
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
  }

  // 診斷方法
  diagnose() {
    const diagnosis = {
      initialized: this.state.initialized,
      domReady: this.state.domReady,
      elementsFound: Object.keys(this.elements).length,
      missingElements: [],
      playerState: this.player?.getState()
    };

    // 檢查缺失的元素
    for (const req of this.requiredElements) {
      if (!req.optional && !this.elements[req.id]) {
        diagnosis.missingElements.push(req.id);
      }
    }

    return diagnosis;
  }
}
