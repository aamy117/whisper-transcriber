// 視訊播放器核心模組
import VideoConfig from './video-config.js';

export class VideoPlayer {
  constructor(videoElement) {
    this.video = videoElement;
    this.container = videoElement.parentElement;
    this.currentFile = null;
    this.isPlaying = false;
    this.isLoading = false;
    
    // 狀態管理
    this.state = {
      currentTime: 0,
      duration: 0,
      buffered: 0,
      volume: 1,
      playbackRate: 1,
      isFullscreen: false,
      isMuted: false
    };
    
    // 效能優化
    this.lastProgressUpdate = 0;
    this.progressUpdateThrottle = VideoConfig.player.progressUpdateInterval;
    
    this.init();
  }
  
  init() {
    this.bindVideoEvents();
    this.setupVideoProperties();
    console.log('VideoPlayer 初始化完成');
  }
  
  bindVideoEvents() {
    const video = this.video;
    
    // 基本播放事件
    video.addEventListener('loadstart', () => this.handleLoadStart());
    video.addEventListener('loadedmetadata', () => this.handleLoadedMetadata());
    video.addEventListener('loadeddata', () => this.handleLoadedData());
    video.addEventListener('canplay', () => this.handleCanPlay());
    video.addEventListener('canplaythrough', () => this.handleCanPlayThrough());
    
    // 播放狀態事件
    video.addEventListener('play', () => this.handlePlay());
    video.addEventListener('pause', () => this.handlePause());
    video.addEventListener('ended', () => this.handleEnded());
    
    // 進度事件
    video.addEventListener('timeupdate', () => this.handleTimeUpdate());
    video.addEventListener('progress', () => this.handleProgress());
    video.addEventListener('seeking', () => this.handleSeeking());
    video.addEventListener('seeked', () => this.handleSeeked());
    
    // 音量事件
    video.addEventListener('volumechange', () => this.handleVolumeChange());
    
    // 錯誤事件
    video.addEventListener('error', (e) => this.handleError(e));
    video.addEventListener('stalled', () => this.handleStalled());
    video.addEventListener('waiting', () => this.handleWaiting());
    
    // 全螢幕事件
    document.addEventListener('fullscreenchange', () => this.handleFullscreenChange());
    document.addEventListener('webkitfullscreenchange', () => this.handleFullscreenChange());
  }
  
  setupVideoProperties() {
    this.video.volume = this.state.volume;
    this.video.playbackRate = this.state.playbackRate;
  }
  
  // 檔案載入
  async loadFile(file) {
    if (!file) {
      throw new Error('沒有選擇檔案');
    }
    
    // 檢查檔案類型
    if (!VideoConfig.file.allowedTypes.includes(file.type)) {
      throw new Error(`不支援的檔案格式: ${file.type}`);
    }
    
    // 檢查檔案大小
    if (file.size > VideoConfig.file.maxSize) {
      throw new Error(`檔案過大: ${(file.size / 1024 / 1024 / 1024).toFixed(2)}GB，最大支援 2GB`);
    }
    
    try {
      this.isLoading = true;
      this.currentFile = file;
      
      // 建立檔案 URL
      const fileURL = URL.createObjectURL(file);
      
      // 載入視訊
      await this.loadVideoSource(fileURL);
      
      // 取得視訊資訊
      const info = await this.getVideoInfo();
      
      this.isLoading = false;
      
      // 發送載入完成事件
      this.dispatchCustomEvent('video:loadeddata', { file, info });
      
      return info;
      
    } catch (error) {
      this.isLoading = false;
      this.dispatchCustomEvent('video:error', { error: error.message });
      throw error;
    }
  }
  
  loadVideoSource(src) {
    return new Promise((resolve, reject) => {
      const handleLoad = () => {
        this.video.removeEventListener('loadeddata', handleLoad);
        this.video.removeEventListener('error', handleError);
        resolve();
      };
      
      const handleError = (e) => {
        this.video.removeEventListener('loadeddata', handleLoad);
        this.video.removeEventListener('error', handleError);
        reject(new Error('視訊載入失敗'));
      };
      
      this.video.addEventListener('loadeddata', handleLoad);
      this.video.addEventListener('error', handleError);
      
      this.video.src = src;
      this.video.load();
    });
  }
  
  async getVideoInfo() {
    const video = this.video;
    
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
      fileName: this.currentFile?.name || '',
      fileSize: this.currentFile?.size || 0,
      fileType: this.currentFile?.type || ''
    };
  }
  
  // 播放控制
  async play() {
    try {
      await this.video.play();
      this.isPlaying = true;
    } catch (error) {
      console.error('播放失敗:', error);
      this.dispatchCustomEvent('video:error', { error: '播放失敗' });
    }
  }
  
  pause() {
    this.video.pause();
    this.isPlaying = false;
  }
  
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }
  
  // 時間控制
  seek(time) {
    if (this.video.duration && time >= 0 && time <= this.video.duration) {
      this.video.currentTime = time;
    }
  }
  
  skipBack(seconds = VideoConfig.player.seekStep) {
    this.seek(this.video.currentTime - seconds);
  }
  
  skipForward(seconds = VideoConfig.player.seekStep) {
    this.seek(this.video.currentTime + seconds);
  }
  
  // 音量控制
  setVolume(volume) {
    volume = Math.max(0, Math.min(1, volume));
    this.video.volume = volume;
    this.state.volume = volume;
    this.state.isMuted = volume === 0;
  }
  
  toggleMute() {
    if (this.state.isMuted) {
      this.setVolume(this.state.volume || 0.5);
    } else {
      this.state.volume = this.video.volume;
      this.setVolume(0);
    }
  }
  
  // 播放速度
  setPlaybackRate(rate) {
    this.video.playbackRate = rate;
    this.state.playbackRate = rate;
  }
  
  // 全螢幕控制
  toggleFullscreen() {
    if (!this.state.isFullscreen) {
      this.enterFullscreen();
    } else {
      this.exitFullscreen();
    }
  }
  
  enterFullscreen() {
    const element = this.container;
    
    if (element.requestFullscreen) {
      element.requestFullscreen();
    } else if (element.webkitRequestFullscreen) {
      element.webkitRequestFullscreen();
    } else if (element.mozRequestFullScreen) {
      element.mozRequestFullScreen();
    } else if (element.msRequestFullscreen) {
      element.msRequestFullscreen();
    }
  }
  
  exitFullscreen() {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }
  
  // 事件處理
  handleLoadStart() {
    console.log('開始載入視訊');
  }
  
  handleLoadedMetadata() {
    this.state.duration = this.video.duration;
    console.log('視訊元數據載入完成');
  }
  
  handleLoadedData() {
    console.log('視訊數據載入完成');
  }
  
  handleCanPlay() {
    console.log('視訊可以開始播放');
  }
  
  handleCanPlayThrough() {
    console.log('視訊可以流暢播放');
  }
  
  handlePlay() {
    this.isPlaying = true;
    this.dispatchCustomEvent('video:play');
  }
  
  handlePause() {
    this.isPlaying = false;
    this.dispatchCustomEvent('video:pause');
  }
  
  handleEnded() {
    this.isPlaying = false;
    this.dispatchCustomEvent('video:ended');
  }
  
  handleTimeUpdate() {
    const now = Date.now();
    if (now - this.lastProgressUpdate >= this.progressUpdateThrottle) {
      this.state.currentTime = this.video.currentTime;
      this.dispatchCustomEvent('video:timeupdate', {
        currentTime: this.video.currentTime,
        duration: this.video.duration
      });
      this.lastProgressUpdate = now;
    }
  }
  
  handleProgress() {
    if (this.video.buffered.length > 0) {
      this.state.buffered = this.video.buffered.end(this.video.buffered.length - 1);
      this.dispatchCustomEvent('video:progress', {
        buffered: this.state.buffered,
        duration: this.video.duration
      });
    }
  }
  
  handleSeeking() {
    this.dispatchCustomEvent('video:seeking');
  }
  
  handleSeeked() {
    this.dispatchCustomEvent('video:seeked');
  }
  
  handleVolumeChange() {
    this.state.volume = this.video.volume;
    this.state.isMuted = this.video.muted || this.video.volume === 0;
    this.dispatchCustomEvent('video:volumechange', {
      volume: this.state.volume,
      isMuted: this.state.isMuted
    });
  }
  
  handleError(e) {
    const error = this.video.error;
    let message = '播放錯誤';
    
    if (error) {
      switch (error.code) {
        case error.MEDIA_ERR_ABORTED:
          message = '播放被中止';
          break;
        case error.MEDIA_ERR_NETWORK:
          message = '網路錯誤';
          break;
        case error.MEDIA_ERR_DECODE:
          message = '解碼錯誤';
          break;
        case error.MEDIA_ERR_SRC_NOT_SUPPORTED:
          message = '不支援的視訊格式';
          break;
      }
    }
    
    console.error('視訊錯誤:', message, error);
    this.dispatchCustomEvent('video:error', { error: message });
  }
  
  handleStalled() {
    console.warn('視訊載入停滯');
    this.dispatchCustomEvent('video:warning', { message: '載入速度較慢' });
  }
  
  handleWaiting() {
    console.log('等待更多數據');
  }
  
  handleFullscreenChange() {
    this.state.isFullscreen = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    );
    
    this.dispatchCustomEvent('video:fullscreenchange', {
      isFullscreen: this.state.isFullscreen
    });
  }
  
  // 狀態管理
  getState() {
    return {
      ...this.state,
      currentTime: this.video.currentTime,
      duration: this.video.duration,
      isPlaying: this.isPlaying,
      isLoading: this.isLoading
    };
  }
  
  // 工具方法
  dispatchCustomEvent(type, detail = {}) {
    const event = new CustomEvent(type, { detail });
    this.video.dispatchEvent(event);
  }
  
  // 清理資源
  destroy() {
    if (this.currentFile) {
      URL.revokeObjectURL(this.video.src);
    }
    this.video.src = '';
    this.video.load();
  }
}
