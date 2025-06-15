// 視訊播放器 UI 控制模組
import VideoConfig from './video-config.js';

export class VideoUI {
  constructor(player) {
    this.player = player;
    this.video = player.video;
    
    // DOM 元素
    this.elements = {
      // 容器
      wrapper: document.getElementById('videoWrapper'),
      container: document.getElementById('videoPlayerContainer'),
      uploadArea: document.getElementById('videoUploadArea'),
      controls: document.getElementById('videoControls'),
      
      // 載入指示器
      loading: document.getElementById('videoLoading'),
      
      // 播放控制
      playPauseBtn: document.getElementById('playPauseBtn'),
      skipBackBtn: document.getElementById('skipBackBtn'),
      skipForwardBtn: document.getElementById('skipForwardBtn'),
      
      // 進度條
      progressContainer: document.getElementById('progressContainer'),
      progressSlider: document.getElementById('progressSlider'),
      progressPlayed: document.getElementById('progressPlayed'),
      progressBuffered: document.getElementById('progressBuffered'),
      progressThumb: document.getElementById('progressThumb'),
      
      // 時間顯示
      currentTime: document.getElementById('currentTime'),
      totalTime: document.getElementById('totalTime'),
      
      // 音量控制
      muteBtn: document.getElementById('muteBtn'),
      volumeSlider: document.getElementById('volumeSlider'),
      
      // 播放速度
      speedBtn: document.getElementById('speedBtn'),
      speedMenu: document.getElementById('speedMenu'),
      
      // 全螢幕
      fullscreenBtn: document.getElementById('fullscreenBtn'),
      
      // 資訊面板
      videoFileName: document.getElementById('videoFileName'),
      videoFileSize: document.getElementById('videoFileSize'),
      videoDuration: document.getElementById('videoDuration'),
      videoResolution: document.getElementById('videoResolution')
    };
    
    // UI 狀態
    this.state = {
      controlsVisible: true,
      controlsTimer: null,
      isDragging: false,
      dragStartTime: 0
    };
    
    this.init();
  }
  
  init() {
    this.bindEvents();
    this.setupControls();
    this.bindPlayerEvents();
    console.log('VideoUI 初始化完成');
  }
  
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
    this.elements.speedBtn?.addEventListener('click', () => this.toggleSpeedMenu());
    this.setupSpeedMenu();
    
    // 全螢幕
    this.elements.fullscreenBtn?.addEventListener('click', () => this.toggleFullscreen());
    
    // 滑鼠控制
    this.setupMouseControls();
    
    // 鍵盤控制
    this.setupKeyboardControls();
  }
  
  setupControls() {
    // 初始化音量滑桿
    if (this.elements.volumeSlider) {
      this.elements.volumeSlider.value = this.player.state.volume * 100;
    }
    
    // 初始化播放速度
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
  
  setupSpeedMenu() {
    const speedOptions = document.querySelectorAll('.speed-option');
    speedOptions.forEach(option => {
      option.addEventListener('click', () => {
        const speed = parseFloat(option.dataset.speed);
        this.setPlaybackRate(speed);
        this.hideSpeedMenu();
      });
    });
    
    // 點擊外部隱藏選單
    document.addEventListener('click', (e) => {
      if (!this.elements.speedBtn?.contains(e.target) && !this.elements.speedMenu?.contains(e.target)) {
        this.hideSpeedMenu();
      }
    });
  }
  
  setupMouseControls() {
    const wrapper = this.elements.wrapper;
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
    this.video.addEventListener('video:play', () => this.updatePlayPauseButton(true));
    this.video.addEventListener('video:pause', () => this.updatePlayPauseButton(false));
    this.video.addEventListener('video:timeupdate', (e) => this.updateTimeDisplay(e.detail));
    this.video.addEventListener('video:progress', (e) => this.updateBufferedProgress(e.detail));
    this.video.addEventListener('video:volumechange', (e) => this.updateVolumeDisplay(e.detail));
    this.video.addEventListener('video:fullscreenchange', (e) => this.updateFullscreenButton(e.detail));
    this.video.addEventListener('video:loadeddata', (e) => this.updateVideoInfo(e.detail));
  }
  
  // 顯示/隱藏播放器
  showPlayer() {
    this.elements.container?.classList.remove('hidden');
    this.elements.uploadArea?.classList.add('hidden');
  }
  
  hidePlayer() {
    this.elements.container?.classList.add('hidden');
    this.elements.uploadArea?.classList.remove('hidden');
  }
  
  // 播放控制
  togglePlayPause() {
    this.player.togglePlayPause();
  }
  
  skipBack() {
    this.player.skipBack();
  }
  
  skipForward() {
    this.player.skipForward();
  }
  
  // 進度控制
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
  
  // 音量控制
  toggleMute() {
    this.player.toggleMute();
  }
  
  setVolume(volume) {
    this.player.setVolume(volume);
  }
  
  // 播放速度控制
  toggleSpeedMenu() {
    const menu = this.elements.speedMenu;
    if (menu) {
      menu.classList.toggle('hidden');
    }
  }
  
  hideSpeedMenu() {
    this.elements.speedMenu?.classList.add('hidden');
  }
  
  setPlaybackRate(rate) {
    this.player.setPlaybackRate(rate);
    this.updateSpeedDisplay();
    this.updateSpeedOptions(rate);
  }
  
  // 全螢幕控制
  toggleFullscreen() {
    this.player.toggleFullscreen();
  }
  
  // 控制列顯示/隱藏
  showControls() {
    this.elements.controls?.classList.remove('hidden');
    this.elements.controls?.style.setProperty('opacity', '1', 'important');
    this.state.controlsVisible = true;
    
    // 重置自動隱藏計時器
    this.resetControlsTimer();
  }
  
  hideControls() {
    // 只有在播放中且不在拖動時才隱藏控制欄
    if (this.player.isPlaying && !this.state.isDragging) {
      this.elements.controls?.style.setProperty('opacity', '0');
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
  
  // 鍵盤事件處理
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
  
  // UI 更新方法
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
    const btn = this.elements.speedBtn;
    if (btn) {
      const speedText = btn.querySelector('.speed-text');
      if (speedText) {
        speedText.textContent = `${this.player.state.playbackRate}x`;
      }
    }
  }
  
  updateSpeedOptions(activeSpeed) {
    const options = document.querySelectorAll('.speed-option');
    options.forEach(option => {
      const speed = parseFloat(option.dataset.speed);
      option.classList.toggle('active', speed === activeSpeed);
    });
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
  
  // 工具方法
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
  
  // 載入指示器
  showLoading() {
    this.elements.loading?.classList.remove('hidden');
  }
  
  hideLoading() {
    this.elements.loading?.classList.add('hidden');
  }
  
  // 清理
  destroy() {
    if (this.state.controlsTimer) {
      clearTimeout(this.state.controlsTimer);
    }
  }
}
