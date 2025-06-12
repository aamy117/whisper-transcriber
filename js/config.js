// 配置管理
const Config = {
  // 應用模式
  mode: 'personal', // 'personal' | 'team'
  
  // API 設定
  api: {
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    maxFileSize: 50 * 1024 * 1024, // 50MB
  },
  
  // 儲存設定
  storage: {
    prefix: 'whisper_',
    autoSaveInterval: 3000, // 3 秒
  },
  
  // 播放器設定
  player: {
    skipSeconds: 3,
    speedStep: 0.1,
    minSpeed: 0.5,
    maxSpeed: 3.0,
  },
  
  // 支援的音訊格式
  supportedFormats: ['mp3', 'wav', 'm4a', 'flac', 'ogg', 'webm', 'mp4'],
  
  // 主題設定
  theme: {
    default: 'light',
    options: ['light', 'dark', 'auto']
  },
  
  // 快捷鍵設定
  hotkeys: {
    playPause: ' ', // 空白鍵
    backward: 'ArrowLeft',
    forward: 'ArrowRight',
    speedUp: 'ArrowUp',
    speedDown: 'ArrowDown',
    insertTimestamp: 't',
    save: 's',
    search: 'f',
    export: 'e'
  }
};

// 匯出配置
export default Config;