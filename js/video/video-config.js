// 視訊播放器配置
const VideoConfig = {
  // 播放器設定
  player: {
    // 進度更新間隔 (毫秒)
    progressUpdateInterval: 100,
    
    // 尋找間隔 (秒)
    seekStep: 5,
    
    // 音量步階
    volumeStep: 0.1,
    
    // 支援的視訊格式
    supportedFormats: [
      'video/mp4',
      'video/webm',
      'video/ogg'
    ],
    
    // 品質設定
    quality: {
      auto: true,
      levels: ['1080p', '720p', '480p', '360p']
    }
  },
  
  // UI 設定
  ui: {
    // 控制列自動隱藏時間 (毫秒)
    controlsHideDelay: 3000,
    
    // 響應式斷點
    breakpoints: {
      mobile: 768,
      tablet: 1024,
      desktop: 1200
    },
    
    // 動畫持續時間
    animations: {
      fade: 200,
      slide: 300,
      scale: 250
    }
  },
  
  // 儲存設定
  storage: {
    prefix: 'whisper_video_',
    maxProjects: 10
  },
  
  // 檔案設定
  file: {
    maxSize: 2 * 1024 * 1024 * 1024, // 2GB (將被移除)
    chunkSize: 1024 * 1024, // 1MB chunks for processing
    allowedTypes: ['video/mp4', 'video/webm', 'video/ogg', 'video/ogv']
  },
  
  // 串流設定
  streaming: {
    enabled: true,
    chunkSize: 2 * 1024 * 1024, // 2MB per chunk
    bufferSize: 20 * 1024 * 1024, // 20MB buffer
    threshold: 100 * 1024 * 1024, // 100MB 以上使用串流
    preloadSize: 5 * 1024 * 1024, // 預載 5MB
    bufferTime: 10, // 保持 10 秒緩衝
    debug: true // 顯示串流除錯資訊
  },
  
  // 快捷鍵設定
  shortcuts: {
    playPause: [' ', 'k'],
    skipBack: ['ArrowLeft', 'j'],
    skipForward: ['ArrowRight', 'l'],
    volumeUp: ['ArrowUp'],
    volumeDown: ['ArrowDown'],
    mute: ['m'],
    fullscreen: ['f'],
    seekBackward: ['a'],
    seekForward: ['d']
  },
  
  // 偵錯設定
  debug: {
    enabled: false,
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    showPerformance: false
  }
};

export default VideoConfig;
