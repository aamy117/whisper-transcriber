import Config from './config.js';

// 音訊播放器類別
export class AudioPlayer {
  constructor() {
    this.audioElement = null;
    this.currentFile = null;
    this.isPlaying = false;
    this.duration = 0;
    this.currentTime = 0;
    
    // 標註點資料
    this.bookmarks = {
      point1: null,
      point2: null
    };
    
    // Web Audio API 相關
    this.webAudioSupported = this.detectWebAudioSupport();
    this.audioContext = null;
    this.sourceNode = null;
    this.filterNode = null;
    this.gainNode = null;
    this.currentPlaybackMode = 'native'; // 'native' | 'webaudio'
    this.isWebAudioConnected = false;
    
    // DOM 元素
    this.elements = {
      audioPlayer: null,
      uploadArea: null,
      playerControls: null,
      audioInput: null,
      selectFileBtn: null,
      restartBtn: null,
      playBtn: null,
      backwardBtn: null,
      forwardBtn: null,
      progressBar: null,
      currentTimeEl: null,
      totalTimeEl: null,
      audioName: null,
      audioDuration: null,
      speedSlider: null,
      speedValue: null,
      volumeSlider: null,
      transcriptionSection: null,
      bookmark1Btn: null,
      bookmark2Btn: null,
      gotoBookmark1Btn: null,
      gotoBookmark2Btn: null,
      audioOptimizationStatus: null
    };
    
    this.init();
  }
  
  init() {
    this.cacheElements();
    this.bindEvents();
  }
  
  cacheElements() {
    // 快取 DOM 元素
    this.elements.audioPlayer = document.getElementById('audioPlayer');
    this.elements.uploadArea = document.getElementById('uploadArea');
    this.elements.playerControls = document.getElementById('playerControls');
    this.elements.audioInput = document.getElementById('audioInput');
    this.elements.selectFileBtn = document.getElementById('selectFileBtn');
    this.elements.restartBtn = document.getElementById('restartBtn');
    this.elements.playBtn = document.getElementById('playBtn');
    this.elements.backwardBtn = document.getElementById('backwardBtn');
    this.elements.forwardBtn = document.getElementById('forwardBtn');
    this.elements.progressBar = document.getElementById('progressBar');
    this.elements.currentTimeEl = document.getElementById('currentTime');
    this.elements.totalTimeEl = document.getElementById('totalTime');
    this.elements.audioName = document.getElementById('audioName');
    this.elements.audioDuration = document.getElementById('audioDuration');
    this.elements.speedSlider = document.getElementById('speedSlider');
    this.elements.speedValue = document.getElementById('speedValue');
    this.elements.volumeSlider = document.getElementById('volumeSlider');
    this.elements.transcriptionSection = document.getElementById('transcriptionSection');
    this.elements.bookmark1Btn = document.getElementById('bookmark1Btn');
    this.elements.bookmark2Btn = document.getElementById('bookmark2Btn');
    this.elements.gotoBookmark1Btn = document.getElementById('gotoBookmark1Btn');
    this.elements.gotoBookmark2Btn = document.getElementById('gotoBookmark2Btn');
    this.elements.audioOptimizationStatus = document.getElementById('audioOptimizationStatus');
    
    this.audioElement = this.elements.audioPlayer;
  }
  
  bindEvents() {
    // 檔案選擇事件
    this.elements.selectFileBtn.addEventListener('click', () => {
      this.elements.audioInput.click();
    });
    
    this.elements.audioInput.addEventListener('change', (e) => {
      this.handleFileSelect(e.target.files);
    });
    
    // 拖放事件
    this.elements.uploadArea.addEventListener('dragover', this.handleDragOver.bind(this));
    this.elements.uploadArea.addEventListener('dragleave', this.handleDragLeave.bind(this));
    this.elements.uploadArea.addEventListener('drop', this.handleDrop.bind(this));
    
    // 播放控制事件
    this.elements.restartBtn.addEventListener('click', this.restart.bind(this));
    this.elements.playBtn.addEventListener('click', this.togglePlayPause.bind(this));
    this.elements.backwardBtn.addEventListener('click', () => this.skip(-Config.player.skipSeconds));
    this.elements.forwardBtn.addEventListener('click', () => this.skip(Config.player.skipSeconds));
    
    // 進度條事件
    this.elements.progressBar.addEventListener('input', this.handleProgressChange.bind(this));
    
    // 速度控制
    this.elements.speedSlider.addEventListener('input', this.handleSpeedChange.bind(this));
    
    // 音量控制
    this.elements.volumeSlider.addEventListener('input', this.handleVolumeChange.bind(this));
    
    // 標註點事件
    this.elements.bookmark1Btn.addEventListener('click', () => this.setBookmark(1));
    this.elements.bookmark2Btn.addEventListener('click', () => this.setBookmark(2));
    this.elements.gotoBookmark1Btn.addEventListener('click', () => this.gotoBookmark(1));
    this.elements.gotoBookmark2Btn.addEventListener('click', () => this.gotoBookmark(2));
    
    // 音訊事件
    this.audioElement.addEventListener('loadedmetadata', this.handleLoadedMetadata.bind(this));
    this.audioElement.addEventListener('timeupdate', this.handleTimeUpdate.bind(this));
    this.audioElement.addEventListener('ended', this.handleEnded.bind(this));
    this.audioElement.addEventListener('error', this.handleError.bind(this));
    
    // 鍵盤快捷鍵
    document.addEventListener('keydown', this.handleKeyboard.bind(this));
  }
  
  // 檔案處理
  handleFileSelect(files) {
    if (files.length === 0) return;
    
    const file = files[0];
    if (!this.validateFile(file)) return;
    
    this.loadAudioFile(file);
  }
  
  validateFile(file) {
    // 檢查檔案類型
    const fileExtension = file.name.split('.').pop().toLowerCase();
    if (!Config.supportedFormats.includes(fileExtension)) {
      this.showError(`不支援的檔案格式。請使用：${Config.supportedFormats.join(', ')}`);
      return false;
    }
    
    // 檢查檔案大小
    if (file.size > Config.api.maxFileSize) {
      const maxSizeMB = Config.api.maxFileSize / (1024 * 1024);
      this.showError(`檔案大小超過限制。最大允許：${maxSizeMB}MB`);
      return false;
    }
    
    return true;
  }
  
  loadAudioFile(file) {
    // 斷開現有的 Web Audio 連接
    if (this.isWebAudioConnected) {
      this.disconnectWebAudio();
    }
    
    this.currentFile = file;
    const url = URL.createObjectURL(file);
    
    this.audioElement.src = url;
    this.audioElement.load();
    
    // 重置播放速度到預設值
    this.audioElement.playbackRate = 1.0;
    this.elements.speedSlider.value = 1.0;
    this.updateSpeedDisplay(1.0);
    
    // 更新 UI
    this.elements.audioName.textContent = file.name;
    this.elements.uploadArea.classList.add('hidden');
    this.elements.playerControls.classList.add('show');
    this.elements.transcriptionSection.classList.add('show');
    
    // 儲存到 localStorage
    this.saveCurrentProject();
    
    // 載入標註點
    this.loadBookmarks();
  }
  
  // 拖放處理
  handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.uploadArea.classList.add('drag-over');
  }
  
  handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.uploadArea.classList.remove('drag-over');
  }
  
  handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    this.elements.uploadArea.classList.remove('drag-over');
    
    const files = e.dataTransfer.files;
    this.handleFileSelect(files);
  }
  
  // 播放控制
  togglePlayPause() {
    if (this.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }
  
  play() {
    // 如果有 AudioContext 且處於暫停狀態，恢復它
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    
    this.audioElement.play();
    this.isPlaying = true;
    this.updatePlayButton();
  }
  
  pause() {
    this.audioElement.pause();
    this.isPlaying = false;
    this.updatePlayButton();
    
    // 不需要暫停 AudioContext，保持其活躍以便快速恢復
  }
  
  skip(seconds) {
    const newTime = this.audioElement.currentTime + seconds;
    this.audioElement.currentTime = Math.max(0, Math.min(newTime, this.duration));
  }
  
  restart() {
    this.audioElement.currentTime = 0;
    if (!this.isPlaying) {
      this.play();
    }
  }
  
  updatePlayButton() {
    if (!this.elements.playBtn) return;
    
    const playIcon = this.elements.playBtn.querySelector('.icon-play');
    const pauseIcon = this.elements.playBtn.querySelector('.icon-pause');
    
    if (this.isPlaying) {
        if (playIcon) playIcon.classList.add('hidden');
        if (pauseIcon) pauseIcon.classList.remove('hidden');
        this.elements.playBtn.title = '暫停 (空白鍵)';
    } else {
        if (playIcon) playIcon.classList.remove('hidden');
        if (pauseIcon) pauseIcon.classList.add('hidden');
        this.elements.playBtn.title = '播放 (空白鍵)';
    }
  }
  
  // 進度控制
  handleProgressChange(e) {
    const progress = e.target.value;
    const time = (progress / 100) * this.duration;
    this.audioElement.currentTime = time;
  }
  
  // 速度控制
  handleSpeedChange(e) {
    const speed = parseFloat(e.target.value);
    this.setPlaybackRate(speed);
    this.updateSpeedDisplay(speed);
  }
  
  setPlaybackRate(speed) {
    // 先設定播放速度
    this.audioElement.playbackRate = speed;
    
    // 判斷是否需要切換播放模式
    if (this.shouldUseWebAudio(speed)) {
      if (this.currentPlaybackMode !== 'webaudio') {
        this.switchPlaybackMode('webaudio');
      }
      // 更新濾波器設定
      this.updateFilterSettings(speed);
    } else {
      if (this.currentPlaybackMode !== 'native') {
        this.switchPlaybackMode('native');
      }
    }
  }
  
  updateSpeedDisplay(speed) {
    if (this.elements.speedValue) {
      this.elements.speedValue.textContent = speed.toFixed(1) + 'x';
    }
    
    // 更新音質優化狀態顯示
    this.updateOptimizationStatus();
  }
  
  updateOptimizationStatus() {
    if (!this.elements.audioOptimizationStatus) return;
    
    if (this.currentPlaybackMode === 'webaudio' && this.isWebAudioConnected) {
      this.elements.audioOptimizationStatus.textContent = '音質優化中';
      this.elements.audioOptimizationStatus.classList.add('active');
      this.elements.audioOptimizationStatus.title = '已啟用 Web Audio API 音質優化';
    } else {
      this.elements.audioOptimizationStatus.textContent = '';
      this.elements.audioOptimizationStatus.classList.remove('active');
      this.elements.audioOptimizationStatus.title = '音質優化未啟用（速度 < 1.5x）';
    }
  }
  
  // 音量控制
  handleVolumeChange(e) {
    const volume = e.target.value / 100;
    this.setVolume(volume);
  }
  
  setVolume(volume) {
    this.audioElement.volume = volume;
    
    // 如果使用 Web Audio，同時調整 gainNode
    if (this.gainNode && this.isWebAudioConnected) {
      this.gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    }
  }
  
  // 音訊事件處理
  handleLoadedMetadata() {
    this.duration = this.audioElement.duration;
    this.elements.totalTimeEl.textContent = this.formatTime(this.duration);
    this.elements.audioDuration.textContent = this.formatTime(this.duration);
  }
  
  handleTimeUpdate() {
    this.currentTime = this.audioElement.currentTime;
    this.elements.currentTimeEl.textContent = this.formatTime(this.currentTime);
    
    // 更新進度條
    const progress = (this.currentTime / this.duration) * 100;
    this.elements.progressBar.value = progress;
  }
  
  handleEnded() {
    this.isPlaying = false;
    this.updatePlayButton();
    this.audioElement.currentTime = 0;
  }
  
  handleError(e) {
    console.error('音訊錯誤:', e);
    this.showError('音訊檔案載入失敗。請檢查檔案是否損壞。');
  }
  
  // 鍵盤快捷鍵
  handleKeyboard(e) {
    // 忽略在輸入框中的按鍵
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    
    switch(e.key) {
      case ' ':
        e.preventDefault();
        this.togglePlayPause();
        break;
      case 'Home':
        e.preventDefault();
        this.restart();
        break;
      case 'ArrowLeft':
        if (e.ctrlKey) {
          e.preventDefault();
          this.skip(-Config.player.skipSeconds);
        }
        break;
      case 'ArrowRight':
        if (e.ctrlKey) {
          e.preventDefault();
          this.skip(Config.player.skipSeconds);
        }
        break;
      case 'ArrowUp':
        if (e.ctrlKey) {
          e.preventDefault();
          this.changeSpeed(Config.player.speedStep);
        }
        break;
      case 'ArrowDown':
        if (e.ctrlKey) {
          e.preventDefault();
          this.changeSpeed(-Config.player.speedStep);
        }
        break;
      case '1':
        if (!e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          this.setBookmark(1);
        }
        break;
      case '2':
        if (!e.shiftKey && !e.ctrlKey) {
          e.preventDefault();
          this.setBookmark(2);
        }
        break;
      case '!':
        e.preventDefault();
        this.gotoBookmark(1);
        break;
      case '@':
        e.preventDefault();
        this.gotoBookmark(2);
        break;
    }
  }
  
  changeSpeed(delta) {
    const currentSpeed = this.audioElement.playbackRate;
    const newSpeed = Math.max(0.75, 
                              Math.min(3.0, currentSpeed + delta));
    this.setPlaybackRate(newSpeed);
    this.elements.speedSlider.value = newSpeed;
    this.updateSpeedDisplay(newSpeed);
  }
  
  // 工具函數
  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  
  showError(message) {
    // TODO: 實作更好的錯誤提示 UI
    alert(message);
  }
  
  saveCurrentProject() {
    if (!this.currentFile) return;
    
    const project = {
      fileName: this.currentFile.name,
      fileSize: this.currentFile.size,
      lastModified: new Date().toISOString()
    };
    
    localStorage.setItem(Config.storage.prefix + 'currentProject', JSON.stringify(project));
  }
  
  // 公開方法
  getCurrentTime() {
    return this.audioElement.currentTime;
  }
  
  getDuration() {
    return this.duration;
  }
  
  seekTo(time) {
    this.audioElement.currentTime = time;
  }
  
  getCurrentFile() {
    return this.currentFile;
  }
  
  // 標註點功能
  setBookmark(pointNumber) {
    const currentTime = this.audioElement.currentTime;
    const bookmarkKey = `point${pointNumber}`;
    
    // 如果已經設定過，再次點擊就清除
    if (this.bookmarks[bookmarkKey] !== null) {
      this.bookmarks[bookmarkKey] = null;
    } else {
      this.bookmarks[bookmarkKey] = currentTime;
    }
    
    this.updateBookmarkButtons();
    this.saveBookmarks();
  }
  
  gotoBookmark(pointNumber) {
    const time = this.bookmarks[`point${pointNumber}`];
    if (time !== null) {
      this.audioElement.currentTime = time;
    }
  }
  
  updateBookmarkButtons() {
    // 更新標記按鈕 1
    if (this.bookmarks.point1 !== null) {
      this.elements.bookmark1Btn.classList.add('bookmark-set');
      this.elements.bookmark1Btn.title = `清除標記點 1 (${this.formatTime(this.bookmarks.point1)})`;
      this.elements.gotoBookmark1Btn.disabled = false;
      this.elements.gotoBookmark1Btn.title = `跳轉到標記點 1 (${this.formatTime(this.bookmarks.point1)})`;
    } else {
      this.elements.bookmark1Btn.classList.remove('bookmark-set');
      this.elements.bookmark1Btn.title = '設定標記點 1';
      this.elements.gotoBookmark1Btn.disabled = true;
      this.elements.gotoBookmark1Btn.title = '跳轉到標記點 1';
    }
    
    // 更新標記按鈕 2
    if (this.bookmarks.point2 !== null) {
      this.elements.bookmark2Btn.classList.add('bookmark-set');
      this.elements.bookmark2Btn.title = `清除標記點 2 (${this.formatTime(this.bookmarks.point2)})`;
      this.elements.gotoBookmark2Btn.disabled = false;
      this.elements.gotoBookmark2Btn.title = `跳轉到標記點 2 (${this.formatTime(this.bookmarks.point2)})`;
    } else {
      this.elements.bookmark2Btn.classList.remove('bookmark-set');
      this.elements.bookmark2Btn.title = '設定標記點 2';
      this.elements.gotoBookmark2Btn.disabled = true;
      this.elements.gotoBookmark2Btn.title = '跳轉到標記點 2';
    }
  }
  
  saveBookmarks() {
    if (!this.currentFile) return;
    
    const bookmarksData = {
      fileName: this.currentFile.name,
      bookmarks: this.bookmarks,
      lastModified: new Date().toISOString()
    };
    
    localStorage.setItem(Config.storage.prefix + 'bookmarks', JSON.stringify(bookmarksData));
  }
  
  loadBookmarks() {
    if (!this.currentFile) return;
    
    const storedData = localStorage.getItem(Config.storage.prefix + 'bookmarks');
    if (storedData) {
      const bookmarksData = JSON.parse(storedData);
      // 只有當檔案名稱相同時才載入標記點
      if (bookmarksData.fileName === this.currentFile.name) {
        this.bookmarks = bookmarksData.bookmarks;
        this.updateBookmarkButtons();
      }
    }
  }
  
  // Web Audio API 方法
  detectWebAudioSupport() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return false;
      
      const testContext = new AudioContextClass();
      testContext.close();
      return true;
    } catch (error) {
      console.warn('Web Audio API not supported:', error);
      return false;
    }
  }
  
  shouldUseWebAudio(playbackRate) {
    return playbackRate >= 1.5 && this.webAudioSupported;
  }
  
  initWebAudio() {
    if (!this.webAudioSupported || this.isWebAudioConnected) return false;
    
    try {
      // 建立音頻上下文
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      this.audioContext = new AudioContextClass({
        latencyHint: 'interactive',
        sampleRate: 44100
      });
      
      // 建立音頻節點
      this.sourceNode = this.audioContext.createMediaElementSource(this.audioElement);
      this.filterNode = this.audioContext.createBiquadFilter();
      this.gainNode = this.audioContext.createGain();
      
      // 設定濾波器初始參數
      this.filterNode.type = 'lowpass';
      this.filterNode.frequency.value = 3500;
      this.filterNode.Q.value = 0.7;
      
      // 設定增益節點初始音量（與音頻元素同步）
      this.gainNode.gain.value = this.audioElement.volume;
      
      // 連接音頻節點
      this.sourceNode.connect(this.filterNode);
      this.filterNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);
      
      this.isWebAudioConnected = true;
      this.currentPlaybackMode = 'webaudio';
      console.log('Web Audio API initialized successfully');
      
      // 更新狀態顯示
      this.updateOptimizationStatus();
      
      return true;
    } catch (error) {
      console.error('Web Audio API initialization failed:', error);
      this.fallbackToNative();
      return false;
    }
  }
  
  disconnectWebAudio() {
    if (!this.isWebAudioConnected) return;
    
    try {
      // 斷開所有連接
      if (this.sourceNode) {
        this.sourceNode.disconnect();
      }
      if (this.filterNode) {
        this.filterNode.disconnect();
      }
      if (this.gainNode) {
        this.gainNode.disconnect();
      }
      
      // 關閉音頻上下文
      if (this.audioContext && this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
      
      // 重設變數
      this.audioContext = null;
      this.sourceNode = null;
      this.filterNode = null;
      this.gainNode = null;
      this.isWebAudioConnected = false;
      this.currentPlaybackMode = 'native';
      
      // 重要：當斷開 Web Audio 後，音頻元素會自動恢復直接輸出到揚聲器
      // 這是因為 createMediaElementSource 只是暫時改變音頻路由
      
      console.log('Web Audio API disconnected');
      
      // 更新狀態顯示
      this.updateOptimizationStatus();
    } catch (error) {
      console.error('Error disconnecting Web Audio:', error);
    }
  }
  
  switchPlaybackMode(targetMode) {
    if (this.currentPlaybackMode === targetMode) return;
    
    const currentTime = this.audioElement.currentTime;
    const isPlaying = !this.audioElement.paused;
    const volume = this.audioElement.volume;
    
    // 暫停播放以避免切換時的雜音
    if (isPlaying) {
      this.audioElement.pause();
    }
    
    // 切換模式
    if (targetMode === 'webaudio' && this.shouldUseWebAudio(this.audioElement.playbackRate)) {
      this.initWebAudio();
    } else {
      this.disconnectWebAudio();
    }
    
    // 恢復播放狀態
    this.audioElement.currentTime = currentTime;
    this.audioElement.volume = volume;
    
    if (isPlaying) {
      // 延遲一點恢復播放，確保切換完成
      setTimeout(() => {
        this.audioElement.play().catch(e => console.warn('Resume playback failed:', e));
      }, 50);
    }
  }
  
  updateFilterSettings(playbackRate) {
    if (!this.filterNode || !this.isWebAudioConnected) return;
    
    // 根據播放速度動態調整濾波器頻率
    let frequency;
    if (playbackRate < 1.5) {
      frequency = null; // 不應該在這個速度使用 Web Audio
    } else if (playbackRate <= 2.0) {
      frequency = 3500; // 1.5x-2.0x: 3.5kHz
    } else if (playbackRate <= 2.5) {
      frequency = 3200; // 2.0x-2.5x: 3.2kHz  
    } else {
      frequency = 3000; // >2.5x: 3.0kHz
    }
    
    if (frequency) {
      this.filterNode.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    }
  }
  
  fallbackToNative() {
    console.log('Falling back to native audio playback');
    this.disconnectWebAudio();
    this.webAudioSupported = false; // 標記為不支援，避免重複嘗試
  }
}