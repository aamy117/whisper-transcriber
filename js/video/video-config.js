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
    maxSize: Infinity, // 移除檔案大小限制
    warnSize: 2 * 1024 * 1024 * 1024, // 2GB 時顯示警告
    chunkSize: 1024 * 1024, // 1MB chunks for processing
    allowedTypes: [
      'video/mp4', 
      'video/webm', 
      'video/ogg', 
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'video/3gpp',
      'video/3gpp2',
      'video/x-ms-wmv',
      'video/x-flv'
    ]
  },
    // 串流設定
  streaming: {
    enabled: true,
    chunkSize: 5 * 1024 * 1024, // 5MB per chunk (增加以處理大檔案)
    bufferSize: 50 * 1024 * 1024, // 50MB buffer (增加緩衝)
    threshold: 1024 * 1024 * 1024, // 1GB 以上才使用串流 (提高閾值，避免不必要的複雜性)
    preloadSize: 10 * 1024 * 1024, // 預載 10MB
    bufferTime: 15, // 保持 15 秒緩衝
    maxBufferTime: 60, // 最大緩衝 60 秒
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
