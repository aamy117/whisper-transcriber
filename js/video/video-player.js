// 視訊播放器核心模組
import VideoConfig from './video-config.js';
import { StreamingLoader } from './video-streaming.js';

// 檢查 MSE (Media Source Extensions) 支援
function isMSESupported() {
  return 'MediaSource' in window && typeof MediaSource.isTypeSupported === 'function';
}

// 檢查瀏覽器對特定格式的支援
function checkVideoSupport(format) {
  const video = document.createElement('video');
  return video.canPlayType(format);
}

// 改善的檔案類型檢測
function improvedFileTypeDetection(file) {
  console.log('=== 檔案類型檢測 ===');
  console.log(`檔案名稱: ${file.name}`);
  console.log(`原始 MIME 類型: ${file.type || '未知'}`);
  
  // 1. 檢查原始 MIME 類型
  if (file.type && VideoConfig.file.allowedTypes.includes(file.type)) {
    console.log(`✅ 使用原始 MIME 類型: ${file.type}`);
    return file.type;
  }
  
  // 2. 根據副檔名推斷
  const extension = file.name.split('.').pop().toLowerCase();
  console.log(`檔案副檔名: .${extension}`);
  
  const extensionMap = {
    'mp4': 'video/mp4',
    'm4v': 'video/mp4',
    'mov': 'video/quicktime',
    'webm': 'video/webm',
    'ogg': 'video/ogg',
    'ogv': 'video/ogg',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
    '3gp': 'video/3gpp',
    '3g2': 'video/3gpp2',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv'
  };
  
  const inferredType = extensionMap[extension];
  if (inferredType) {
    console.log(`✅ 根據副檔名推斷類型: ${inferredType}`);
    
    // 檢查瀏覽器是否支援
    const support = checkVideoSupport(inferredType);
    console.log(`瀏覽器支援程度: ${support || '不支援'}`);
    
    return inferredType;
  }
  
  // 3. 預設為 MP4（最通用的格式）
  console.log(`⚠️ 無法確定類型，預設為 video/mp4`);
  return 'video/mp4';
}

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
    
    // 使用改善的檔案類型檢測
    const detectedType = improvedFileTypeDetection(file);
    
    // 檢查檔案類型是否在允許清單中
    if (!VideoConfig.file.allowedTypes.includes(detectedType)) {
      const supportedFormats = VideoConfig.file.allowedTypes.join(', ');
      throw new Error(`不支援的檔案格式。\n檔案: ${file.name}\n檢測到的類型: ${detectedType}\n支援的格式: ${supportedFormats}`);
    }
    
    console.log(`✅ 檔案類型檢查通過: ${detectedType}`);
    
    // 檢查檔案大小並顯示警告（但不阻止載入）
    if (file.size > VideoConfig.file.warnSize) {
      const fileSizeGB = (file.size / 1024 / 1024 / 1024).toFixed(2);
      const warnSizeGB = (VideoConfig.file.warnSize / 1024 / 1024 / 1024).toFixed(0);
      
      console.warn(`⚠️ 大檔案警告: ${fileSizeGB}GB > ${warnSizeGB}GB`);
      
      const shouldContinue = confirm(
        `檔案大小為 ${fileSizeGB}GB，超過建議的 ${warnSizeGB}GB。\n\n` +
        `大檔案可能會：\n` +
        `• 載入時間較長\n` +
        `• 使用較多記憶體\n` +
        `• 影響播放效能\n\n` +
        `系統將自動使用串流模式來優化播放。\n\n` +
        `是否繼續載入？`
      );
      
      if (!shouldContinue) {
        throw new Error('使用者取消載入大檔案');
      }
      
      console.log('✅ 使用者確認載入大檔案');
    }
    
    // 清理先前的資源
    if (this.streamingLoader) {
      this.streamingLoader.destroy();
      this.streamingLoader = null;
    }
    
    try {
      this.isLoading = true;
      this.currentFile = file;      // 決定載入策略 - 大檔案強制使用串流
      const shouldUseStreaming = VideoConfig.streaming.enabled && (
        file.size >= VideoConfig.streaming.threshold ||
        file.size > VideoConfig.file.warnSize // 超過警告大小的檔案強制串流
      ) && isMSESupported() && this.isMSESupportedFormat(detectedType);
      
      console.log(`載入策略決定:`, {
        fileSize: this.formatFileSize(file.size),
        threshold: this.formatFileSize(VideoConfig.streaming.threshold),
        warnSize: this.formatFileSize(VideoConfig.file.warnSize),
        mseSupported: isMSESupported(),
        formatSupported: this.isMSESupportedFormat(detectedType),
        willUseStreaming: shouldUseStreaming
      });
        if (shouldUseStreaming) {
        console.log(`🎬 使用串流載入 (檔案大小: ${this.formatFileSize(file.size)})`);
        this.useStreaming = true;
        this.state.isStreaming = true;
        
        // 使用串流載入
        this.streamingLoader = new StreamingLoader(this.video);
        
        // 監聽串流進度
        this.video.addEventListener('video:streaming:progress', this.handleStreamingProgress.bind(this));
        
        // 監聽串流錯誤
        this.video.addEventListener('video:streaming:error', (e) => {
          console.error('串流載入錯誤:', e.detail);
          this.handleStreamingError(e.detail);
        });
        
        try {
          const info = await this.streamingLoader.loadFile(file);
          
          // 等待視訊 metadata 載入
          await this.waitForMetadata();
          
          // 取得視訊資訊
          const videoInfo = await this.getVideoInfo();
          
          this.isLoading = false;
          
          console.log('✅ 串流載入成功:', videoInfo);
          
          // 發送載入完成事件
          this.dispatchCustomEvent('video:loadeddata', { file, info: videoInfo });
          
          return videoInfo;
          
        } catch (streamError) {
          console.warn('串流載入失敗，嘗試傳統載入:', streamError);
          
          // 清理串流載入器
          if (this.streamingLoader) {
            this.streamingLoader.destroy();
            this.streamingLoader = null;
          }
          
          this.useStreaming = false;
          this.state.isStreaming = false;
          
          // 重置視訊元素
          this.video.src = '';
          this.video.load();
          
          // 根據檔案大小決定是否嘗試傳統載入
          const maxTraditionalSize = 2 * 1024 * 1024 * 1024; // 2GB
          
          if (file.size <= maxTraditionalSize) {
            // 嘗試傳統載入
            console.log('🔄 回退到傳統載入模式');
            
            const fileURL = URL.createObjectURL(file);
            await this.loadVideoSource(fileURL);
            await this.waitForMetadata();
            const info = await this.getVideoInfo();
            
            this.isLoading = false;
            this.dispatchCustomEvent('video:loadeddata', { file, info });
            
            // 顯示警告訊息
            this.dispatchCustomEvent('video:warning', { 
              message: '串流載入失敗，已切換為傳統載入模式。大檔案可能需要較長載入時間。' 
            });
            
            return info;
          } else {
            // 檔案太大，建議使用其他方式
            const errorMsg = `檔案過大 (${this.formatFileSize(file.size)})，串流載入失敗。\n\n可能的原因：\n1. 視訊檔案編碼格式不適合串流播放\n2. 檔案的 moov atom 不在檔案開頭\n\n建議：\n1. 使用較小的視訊檔案\n2. 使用 FFmpeg 重新編碼視訊：\n   ffmpeg -i input.mp4 -movflags faststart -c copy output.mp4`;
            
            throw new Error(errorMsg);
          }
        }
        
      } else {
        // 使用傳統載入方式
        console.log(`使用傳統載入 (檔案大小: ${this.formatFileSize(file.size)})`);
        this.useStreaming = false;
        this.state.isStreaming = false;
        
        // 建立檔案 URL
        const fileURL = URL.createObjectURL(file);
        
        // 載入視訊
        await this.loadVideoSource(fileURL);
        
        // 等待視訊 metadata 載入
        await this.waitForMetadata();
        
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
    console.log(`視訊尺寸: ${this.video.videoWidth}x${this.video.videoHeight}`);
    console.log(`視訊時長: ${this.video.duration}秒`);
    
    // 確保視訊元素可見
    if (this.video.videoWidth === 0 || this.video.videoHeight === 0) {
      console.warn('視訊尺寸為 0，可能載入有問題');
    }
  }
  
  handleLoadedData() {
    console.log('視訊數據載入完成');
    console.log(`ReadyState: ${this.video.readyState}`);
    console.log(`NetworkState: ${this.video.networkState}`);
    
    // 檢查視訊是否正確載入
    if (this.video.readyState >= 2) {
      console.log('✅ 視訊已準備好播放');
      
      // 確保視訊元素正確渲染
      this.video.style.display = 'block';
      this.video.style.visibility = 'visible';
      
      // 嘗試獲取第一幀
      if (this.video.paused && this.video.currentTime === 0) {
        this.video.currentTime = 0.1;
        setTimeout(() => {
          this.video.currentTime = 0;
        }, 100);
      }
    }
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

  // 檢查 MSE 支援的格式
  isMSESupportedFormat(mimeType) {
    if (!('MediaSource' in window)) {
      return false;
    }
    
    // 常見的 MSE 支援格式
    const supportedFormats = [
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4; codecs="avc1.64001E"', 
      'video/webm; codecs="vp8"',
      'video/webm; codecs="vp9"'
    ];
    
    // 檢查基本格式
    if (MediaSource.isTypeSupported(mimeType)) {
      return true;
    }
    
    // 檢查帶編碼的格式
    const baseType = mimeType.split(';')[0];
    return supportedFormats.some(format => {
      if (format.startsWith(baseType)) {
        return MediaSource.isTypeSupported(format);
      }
      return false;
    });
  }

  // 等待視訊元數據載入
  waitForMetadata() {
    return new Promise((resolve, reject) => {
      if (this.video.readyState >= 1) {
        // 元數據已載入
        resolve();
        return;
      }
      
      const handleMetadata = () => {
        this.video.removeEventListener('loadedmetadata', handleMetadata);
        this.video.removeEventListener('error', handleError);
        resolve();
      };
      
      const handleError = (e) => {
        this.video.removeEventListener('loadedmetadata', handleMetadata);
        this.video.removeEventListener('error', handleError);
        reject(new Error('載入視訊元數據失敗'));
      };
      
      this.video.addEventListener('loadedmetadata', handleMetadata);
      this.video.addEventListener('error', handleError);
    });
  }

  // 處理串流進度
  handleStreamingProgress(event) {
    const { loaded, total, percentage } = event.detail;
    // loaded 和 total 是分塊數量，不是位元組
    console.log(`串流進度: ${percentage.toFixed(1)}% (${loaded}/${total} 分塊)`);
    
    // 如果需要顯示位元組進度
    if (this.streamingLoader && this.currentFile) {
      const bytesLoaded = loaded * this.streamingLoader.chunkSize;
      const bytesTotal = this.currentFile.size;
      console.log(`已載入: ${this.formatFileSize(Math.min(bytesLoaded, bytesTotal))}/${this.formatFileSize(bytesTotal)}`);
    }
    
    // 事件已經是 video:streaming:progress，不需要再次發送
  }

  // 處理串流錯誤
  handleStreamingError(error) {
    console.error('串流錯誤:', error);
    
    // 根據錯誤類型提供不同的處理
    let errorMessage = '串流播放錯誤';
    
    if (error.message) {
      if (error.message.includes('MediaSource')) {
        errorMessage = '瀏覽器不支援此視訊格式的串流播放';
      } else if (error.message.includes('memory') || error.message.includes('Memory')) {
        errorMessage = '記憶體不足，請嘗試使用較小的檔案';
      } else if (error.message.includes('format') || error.message.includes('codec')) {
        errorMessage = '視訊編碼格式不支援串流播放';
      } else {
        errorMessage = `串流錯誤: ${error.message}`;
      }
    }
    
    this.dispatchCustomEvent('video:error', { error: errorMessage });
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
      
      // 檢查瀏覽器支援
      checkSupport: () => {
        return VideoPlayer.checkBrowserSupport();
      },
      
      // 測試檔案
      testFile: (file) => {
        return improvedFileTypeDetection(file);
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
    console.log('可用方法:');
    console.log('- videoDebug.checkSupport() - 檢查瀏覽器支援');
    console.log('- videoDebug.testFile(file) - 測試檔案類型檢測');
    console.log('- videoDebug.getState() - 獲取當前狀態');
  }
}
