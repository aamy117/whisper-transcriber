# Web Audio API 音質優化技術規格

## 需求概述

**目標：** 在播放速度 ≥ 1.5x 時自動啟用音質優化，改善演說音頻的清晰度
**觸發條件：** 1.5x 倍速開始啟用優化
**回退機制：** Web Audio API 不可用時自動回退到原生播放
**音頻類型：** 主要針對演說、講座、會議錄音等人聲內容

## 技術架構

### 音頻處理鏈路
```
Audio Element → MediaElementSource → BiquadFilter → GainNode → AudioDestination
     ↑                ↑                    ↑            ↑            ↑
   原始音源        Web Audio接入點      低通濾波器    音量控制     揚聲器輸出
```

### 雙模式播放系統
```
播放速度判斷
├── < 1.5x → 原生播放模式 (Native Audio)
└── ≥ 1.5x → 優化播放模式 (Web Audio API)
```

## 詳細技術規格

### 1. Web Audio API 組件配置

#### AudioContext 設定
```javascript
// 音頻上下文配置
const audioContextConfig = {
  latencyHint: 'interactive',  // 低延遲優先
  sampleRate: 44100           // 標準採樣率
};
```

#### BiquadFilterNode 參數
```javascript
// 針對演說音頻的濾波器設定
const filterConfig = {
  type: 'lowpass',           // 低通濾波器
  frequency: 3500,           // 截止頻率 3.5kHz (保留語音清晰度)
  Q: 0.7,                    // Q值 (避免共振)
  gain: 0                    // 增益
};
```

#### 動態參數調整
```javascript
// 根據播放速度動態調整濾波器
const getFilterFrequency = (playbackRate) => {
  if (playbackRate < 1.5) return null;  // 不啟用濾波
  if (playbackRate <= 2.0) return 3500; // 1.5x-2.0x: 3.5kHz
  if (playbackRate <= 2.5) return 3200; // 2.0x-2.5x: 3.2kHz
  return 3000;                           // >2.5x: 3.0kHz
};
```

### 2. 播放模式切換邏輯

#### 模式判斷
```javascript
class AudioPlaybackManager {
  constructor() {
    this.currentMode = 'native';    // 'native' | 'webaudio'
    this.audioContext = null;
    this.sourceNode = null;
    this.filterNode = null;
    this.gainNode = null;
  }
  
  shouldUseWebAudio(playbackRate) {
    return playbackRate >= 1.5 && this.isWebAudioSupported();
  }
  
  isWebAudioSupported() {
    return !!(window.AudioContext || window.webkitAudioContext);
  }
}
```

#### 無縫切換機制
```javascript
switchPlaybackMode(targetMode) {
  const currentTime = this.audioElement.currentTime;
  const isPlaying = !this.audioElement.paused;
  
  // 切換到目標模式
  if (targetMode === 'webaudio') {
    this.initWebAudio();
  } else {
    this.disconnectWebAudio();
  }
  
  // 恢復播放狀態
  this.audioElement.currentTime = currentTime;
  if (isPlaying) {
    this.audioElement.play();
  }
}
```

### 3. 錯誤處理與回退機制

#### Web Audio API 支援檢測
```javascript
detectWebAudioSupport() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const testContext = new AudioContextClass();
    testContext.close();
    return true;
  } catch (error) {
    console.warn('Web Audio API not supported:', error);
    return false;
  }
}
```

#### 初始化錯誤處理
```javascript
initWebAudio() {
  try {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
    this.filterNode = this.audioContext.createBiquadFilter();
    this.gainNode = this.audioContext.createGain();
    
    // 建立音頻鏈路
    this.sourceNode.connect(this.filterNode);
    this.filterNode.connect(this.gainNode);
    this.gainNode.connect(this.audioContext.destination);
    
    return true;
  } catch (error) {
    console.error('Web Audio API initialization failed:', error);
    this.fallbackToNative();
    return false;
  }
}
```

#### 回退邏輯
```javascript
fallbackToNative() {
  this.disconnectWebAudio();
  this.currentMode = 'native';
  console.log('Fallback to native audio playback');
}
```

## 實作位置與修改範圍

### player.js 修改內容

#### 新增屬性 (constructor)
```javascript
// Web Audio API 相關
this.webAudioSupported = this.detectWebAudioSupport();
this.audioContext = null;
this.sourceNode = null;
this.filterNode = null;
this.gainNode = null;
this.currentPlaybackMode = 'native';
```

#### 新增方法
```javascript
// Web Audio API 檢測
detectWebAudioSupport()

// Web Audio API 初始化
initWebAudio()

// Web Audio 斷開
disconnectWebAudio()

// 播放模式切換
switchPlaybackMode(mode)

// 濾波器參數更新
updateFilterSettings(playbackRate)

// 模式判斷
shouldUseWebAudio(playbackRate)

// 錯誤回退
fallbackToNative()
```

#### 修改現有方法
```javascript
// handleSpeedChange() - 加入模式切換邏輯
// handleVolumeChange() - 支援 Web Audio 音量控制
// play() / pause() - 處理 AudioContext 狀態
```

### 程式碼行數預估
- **新增程式碼：** 約 120-150 行
- **修改現有程式碼：** 約 20-30 行
- **總變更量：** 約 140-180 行

## 效能與相容性


### 功能測試
1. **基礎功能：** 播放、暫停、進度控制
2. **速度切換：** 各種速度間的無縫切換
3. **音量控制：** 兩種模式的音量一致性
4. **錯誤處理：** 強制 Web Audio 失敗的回退測試

### 音質測試
1. **1.5x 速度：** 確認優化效果不過度
2. **2.0x 速度：** 驗證清晰度改善
3. **2.5x+ 速度：** 確認最大改善效果
4. **頻繁切換：** 避免音頻干擾或延遲


## 實作風險評估

### 高風險項目
- **音頻同步問題：** Web Audio 可能造成音視頻不同步
- **記憶體洩漏：** AudioContext 未正確釋放

### 中風險項目
- **切換時音頻中斷：** 模式切換時可能有短暫停頓
- **音量不一致：** 兩種模式音量可能有差異

### 低風險項目
- **瀏覽器相容性：** 有完整回退機制
- **使用者體驗：** 自動切換，使用者無感知


## 後續優化可能性

1. **更進階的音頻處理：** 動態範圍壓縮、等化器
2. **使用者自訂：** 允許手動調整濾波器參數
3. **音頻分析：** 自動偵測音頻類型並調整參數
4. **效能優化：** AudioWorklet 實作更高效的處理