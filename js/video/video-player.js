// 視訊播放器核心模組
import VideoConfig from './video-config.js';
import { StreamingLoader, isMSESupported, getMSESupport } from './video-streaming.js';

export class VideoPlayer {
  constructor(videoElement) {
    this.video = videoElement;
    this.container = videoElement.parentElement;
    this.currentFile = null;
    this.isPlaying = false;
    this.isLoading = false;
    
    // 串流載入器
    this.streamingLoader = null;
    this.useStreaming = false;
    
    // 狀態管理
    this.state = {
      currentTime: 0,
      duration: 0,
      buffered: 0,
      volume: 1,
      playbackRate: 1,
      isFullscreen: false,
      isMuted: false,
      isStreaming: false
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
    console.log('檔案資訊:', {
      name: file.name,
      type: file.type,
      size: this.formatFileSize(file.size)
    });
    
    // 如果 file.type 為空，嘗試從檔案名稱推斷
    let fileType = file.type;
    if (!fileType) {
      const extension = file.name.split('.').pop().toLowerCase();
      const typeMap = {
        'mp4': 'video/mp4',
        'webm': 'video/webm',
        'ogg': 'video/ogg',
        'ogv': 'video/ogg'
      };
      fileType = typeMap[extension] || '';
    }
    
    if (!fileType || !VideoConfig.file.allowedTypes.includes(fileType)) {
      const supportedFormats = 'MP4, WebM, OGG/OGV';
      throw new Error(`不支援的檔案格式。\n目前檔案: ${file.name}\n檔案類型: ${fileType || '未知'}\n支援的格式: ${supportedFormats}`);
    }
    
    // 清理先前的資源
    if (this.streamingLoader) {
      this.streamingLoader.destroy();
      this.streamingLoader = null;
    }
    
    try {
      this.isLoading = true;
      this.currentFile = file;
      
      // 決定載入策略
      const shouldUseStreaming = VideoConfig.streaming.enabled && 
                                 file.size >= VideoConfig.streaming.threshold &&
                                 isMSESupported() &&
                                 this.isMSESupportedFormat(file.type);
      
      if (shouldUseStreaming) {
        console.log(`使用串流載入 (檔案大小: ${this.formatFileSize(file.size)})`);
        this.useStreaming = true;
        this.state.isStreaming = true;
        
        // 使用串流載入
        this.streamingLoader = new StreamingLoader(this.video);
        
        // 監聽串流進度
        this.video.addEventListener('streaming:progress', this.handleStreamingProgress.bind(this));
        
        const info = await this.streamingLoader.loadFile(file);
        
        // 等待視訊 metadata 載入
        await this.waitForMetadata();
        
        // 取得視訊資訊
        const videoInfo = await this.getVideoInfo();
        
        this.isLoading = false;
        
        // 發送載入完成事件
        this.dispatchCustomEvent('video:loadeddata', { file, info: videoInfo });
        
        return videoInfo;
        
      } else {
        console.log(`使用直接載入 (檔案大小: ${this.formatFileSize(file.size)})`);
        this.useStreaming = false;
        this.state.isStreaming = false;
        
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
      }
      
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
  
  // MSE 支援檢查
  isMSESupportedFormat(mimeType) {
    const baseType = mimeType.split(';')[0];
    return baseType === 'video/mp4' || baseType === 'video/webm';
  }
  
  // 等待 metadata 載入
  waitForMetadata() {
    return new Promise((resolve) => {
      if (this.video.readyState >= 1) {
        resolve();
      } else {
        this.video.addEventListener('loadedmetadata', resolve, { once: true });
      }
    });
  }
  
  // 處理串流進度
  handleStreamingProgress(event) {
    const { loaded, total, percentage } = event.detail;
    if (VideoConfig.streaming.debug) {
      console.log(`串流進度: ${loaded}/${total} (${percentage.toFixed(1)}%)`);
    }
    
    this.dispatchCustomEvent('video:streamingprogress', {
      loaded,
      total,
      percentage
    });
  }
  
  // 格式化檔案大小
  formatFileSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
  }
  
  // 檢查瀏覽器支援的視訊格式
  static checkBrowserSupport() {
    const video = document.createElement('video');
    const formats = {
      'MP4 (H.264)': 'video/mp4; codecs="avc1.42E01E"',
      'WebM (VP8)': 'video/webm; codecs="vp8"',
      'WebM (VP9)': 'video/webm; codecs="vp9"',
      'Ogg (Theora)': 'video/ogg; codecs="theora"'
    };
    
    const support = {};
    for (const [name, type] of Object.entries(formats)) {
      support[name] = video.canPlayType(type) || 'no';
    }
    
    return support;
  }
  
  // 清理資源
  destroy() {
    // 清理串流載入器
    if (this.streamingLoader) {
      this.streamingLoader.destroy();
      this.streamingLoader = null;
    }
    
    // 清理視訊資源
    if (this.currentFile && !this.useStreaming) {
      URL.revokeObjectURL(this.video.src);
    }
    
    this.video.src = '';
    this.video.load();
    
    // 重置狀態
    this.currentFile = null;
    this.useStreaming = false;
    this.state.isStreaming = false;
  }
}
