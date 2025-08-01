// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

import Config from './config.js';
import { notify } from './notification.js';

// 音訊播放器類別
export class AudioPlayer {
  constructor() {
    this.audioElement = null;
    this.currentFile = null;
    this.currentBlobUrl = null; // 追蹤當前的 Blob URL
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
    // Web Audio 連接狀態
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
    this.setupTimeJump();
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

    // 檢查檔案大小（播放限制）
    if (file.size > Config.file.maxPlaybackSize) {
      const maxSizeGB = Config.file.maxPlaybackSize / (1024 * 1024 * 1024);
      this.showError(`檔案大小超過限制。最大允許：${maxSizeGB}GB`);
      return false;
    }

    return true;
  }

  loadAudioFile(file) {
    // 釋放之前的 Blob URL
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    this.currentFile = file;
    this.currentBlobUrl = URL.createObjectURL(file);

    this.audioElement.src = this.currentBlobUrl;
    this.audioElement.load();

    // 重置播放速度到預設值
    this.audioElement.playbackRate = 1.0;
    this.elements.speedSlider.value = 1.0;
    this.updateSpeedDisplay(1.0);

    // 初始化 Web Audio API（如果支援）
    if (this.webAudioSupported && !this.isWebAudioConnected) {
      // 等待音訊元素準備好
      this.audioElement.addEventListener('loadedmetadata', () => {
        this.initWebAudio();
      }, { once: true });
    }

    // 更新 UI
    this.elements.audioName.textContent = file.name;
    this.elements.uploadArea.classList.add('hidden');
    this.elements.playerControls.classList.add('show');
    this.elements.transcriptionSection.classList.add('show');

    // 儲存到 localStorage
    this.saveCurrentProject();

    // 載入標註點
    this.loadBookmarks();

    // 如果支援 Web Audio，立即初始化（保持永遠連接）
    if (this.webAudioSupported && !this.isWebAudioConnected) {
      this.initWebAudio();
    }
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

    // 更新音質優化狀態顯示
    this.updateOptimizationStatus(speed);
  }

  setPlaybackRate(speed) {
    // 設定播放速度
    this.audioElement.playbackRate = speed;

    // 決定是否需要 Web Audio 優化
    const shouldUseWebAudio = this.shouldUseWebAudio(speed);

    if (shouldUseWebAudio && !this.isWebAudioConnected) {
      // 需要但尚未初始化，嘗試初始化
      this.initWebAudio();
    }

    // 如果 Web Audio 已連接，更新音訊路由
    if (this.isWebAudioConnected) {
      this.updateAudioRouting(speed);
      this.updateFilterSettings(speed);
    }
  }

  updateAudioRouting(playbackRate) {
    if (!this.isWebAudioConnected) return;

    try {
      // 先斷開所有連接
      this.sourceNode.disconnect();
      this.filterNode.disconnect();

      if (playbackRate >= 1.5) {
        // 高速播放：使用濾波器
        this.sourceNode.connect(this.filterNode);
        this.filterNode.connect(this.gainNode);
        DEBUG && console.log('Audio routing: Using filter for high-speed playback');
      } else {
        // 低速播放：繞過濾波器
        this.sourceNode.connect(this.gainNode);
        DEBUG && console.log('Audio routing: Bypassing filter for normal-speed playback');
      }

      // 更新狀態顯示
      this.updateOptimizationStatus();
    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('Error updating audio routing:', error);
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

    if (this.isWebAudioConnected && this.audioElement.playbackRate >= 1.5) {
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
    if (typeof DEBUG !== 'undefined' && DEBUG) console.error('音訊錯誤:', e);
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
        if (e.shiftKey) {
          // Shift+1: 跳轉到標記點 1
          e.preventDefault();
          this.gotoBookmark(1);
        } else if (!e.ctrlKey) {
          // 單獨按 1: 設定標記點 1
          e.preventDefault();
          this.setBookmark(1);
        }
        break;
      case '2':
        if (e.shiftKey) {
          // Shift+2: 跳轉到標記點 2
          e.preventDefault();
          this.gotoBookmark(2);
        } else if (!e.ctrlKey) {
          // 單獨按 2: 設定標記點 2
          e.preventDefault();
          this.setBookmark(2);
        }
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

  // 格式化簡短時間（用於按鈕顯示）
  formatShortTime(seconds) {
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    
    // 如果超過一小時，顯示 h:mm 格式
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}`;
    }
    // 如果分鐘數是個位數，顯示 m:ss 格式
    else if (minutes < 10) {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
    // 否則只顯示分鐘數
    else {
      return `${minutes}m`;
    }
  }

  showError(message) {
    notify.error(message);
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
      
      // 更新跳轉按鈕顯示的文字 - 使用簡短時間格式
      const btnText1 = this.elements.gotoBookmark1Btn.querySelector('.icon-text');
      if (btnText1) {
        btnText1.textContent = this.formatShortTime(this.bookmarks.point1);
      }
    } else {
      this.elements.bookmark1Btn.classList.remove('bookmark-set');
      this.elements.bookmark1Btn.title = '設定標記點 1';
      this.elements.gotoBookmark1Btn.disabled = true;
      this.elements.gotoBookmark1Btn.title = '跳轉到標記點 1';
      
      // 恢復顯示數字
      const btnText1 = this.elements.gotoBookmark1Btn.querySelector('.icon-text');
      if (btnText1) {
        btnText1.textContent = '1';
      }
    }

    // 更新標記按鈕 2
    if (this.bookmarks.point2 !== null) {
      this.elements.bookmark2Btn.classList.add('bookmark-set');
      this.elements.bookmark2Btn.title = `清除標記點 2 (${this.formatTime(this.bookmarks.point2)})`;
      this.elements.gotoBookmark2Btn.disabled = false;
      this.elements.gotoBookmark2Btn.title = `跳轉到標記點 2 (${this.formatTime(this.bookmarks.point2)})`;
      
      // 更新跳轉按鈕顯示的文字 - 使用簡短時間格式
      const btnText2 = this.elements.gotoBookmark2Btn.querySelector('.icon-text');
      if (btnText2) {
        btnText2.textContent = this.formatShortTime(this.bookmarks.point2);
      }
    } else {
      this.elements.bookmark2Btn.classList.remove('bookmark-set');
      this.elements.bookmark2Btn.title = '設定標記點 2';
      this.elements.gotoBookmark2Btn.disabled = true;
      this.elements.gotoBookmark2Btn.title = '跳轉到標記點 2';
      
      // 恢復顯示數字
      const btnText2 = this.elements.gotoBookmark2Btn.querySelector('.icon-text');
      if (btnText2) {
        btnText2.textContent = '2';
      }
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
      DEBUG && console.warn('Web Audio API not supported:', error);
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

      // 某些瀏覽器可能需要不同的選項
      const contextOptions = {};
      try {
        contextOptions.latencyHint = 'interactive';
        contextOptions.sampleRate = 44100;
      } catch (e) {
        // 忽略不支援的選項
      }

      this.audioContext = new AudioContextClass(contextOptions);

      // 處理 Safari 的自動播放限制
      if (this.audioContext.state === 'suspended') {
        document.addEventListener('click', () => {
          this.audioContext.resume();
        }, { once: true });
      }

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

      // 初始連接：如果速度 < 1.5x，繞過濾波器
      if (this.audioElement.playbackRate < 1.5) {
        this.sourceNode.connect(this.gainNode);
      } else {
        this.sourceNode.connect(this.filterNode);
        this.filterNode.connect(this.gainNode);
      }
      this.gainNode.connect(this.audioContext.destination);

      this.isWebAudioConnected = true;
      // Web Audio 已成功初始化
      DEBUG && console.log('Web Audio API initialized successfully');

      // 更新狀態顯示
      this.updateOptimizationStatus();

      return true;
    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('Web Audio API initialization failed:', error);
      this.fallbackToNative();
      return false;
    }
  }

  // 保留 disconnectWebAudio 方法，但只在必要時使用（如切換音訊檔案時）
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
      // Web Audio 已斷開連接

      DEBUG && console.log('Web Audio API disconnected');

      // 更新狀態顯示
      this.updateOptimizationStatus();
    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('Error disconnecting Web Audio:', error);
    }
  }

  // switchPlaybackMode 已棄用 - Web Audio 現在保持永遠連接
  // 如果需要切換音訊處理模式，請使用 updateAudioRouting() 方法

  updateFilterSettings(playbackRate) {
    if (!this.filterNode || !this.isWebAudioConnected) return;

    // 根據播放速度動態調整濾波器參數
    let frequency, qValue;

    if (playbackRate < 1.5) {
      // 不應該在這個速度使用濾波器
      return;
    } else if (playbackRate <= 2.0) {
      frequency = 3500; // 1.5x-2.0x: 3.5kHz
      qValue = 0.7;     // 較低的 Q 值，更自然的聲音
    } else if (playbackRate <= 2.5) {
      frequency = 3200; // 2.0x-2.5x: 3.2kHz
      qValue = 0.8;     // 稍微提高 Q 值
    } else if (playbackRate <= 3.0) {
      frequency = 3000; // 2.5x-3.0x: 3.0kHz
      qValue = 0.9;     // 更高的 Q 值，補償高頻損失
    } else {
      frequency = 2800; // >3.0x: 2.8kHz
      qValue = 1.0;     // 最高 Q 值
    }

    // 使用平滑的參數變化避免爆音
    const currentTime = this.audioContext.currentTime;
    this.filterNode.frequency.linearRampToValueAtTime(frequency, currentTime + 0.1);
    this.filterNode.Q.linearRampToValueAtTime(qValue, currentTime + 0.1);

    DEBUG && console.log(`Filter updated: ${frequency}Hz, Q=${qValue} for ${playbackRate}x speed`);
  }

  fallbackToNative() {
    DEBUG && console.log('Falling back to native audio playback');
    this.disconnectWebAudio();
    this.webAudioSupported = false; // 標記為不支援，避免重複嘗試
  }

  // 更新音質優化狀態顯示
  updateOptimizationStatus(speed = null) {
    if (!this.elements.audioOptimizationStatus) return;

    const currentSpeed = speed || this.audioElement.playbackRate;
    const isOptimized = this.isWebAudioConnected && currentSpeed >= 1.5;

    if (isOptimized) {
      this.elements.audioOptimizationStatus.textContent = '🎵';
      this.elements.audioOptimizationStatus.title = '音質優化已啟用';
      this.elements.audioOptimizationStatus.style.color = 'var(--success-color)';
    } else if (this.webAudioSupported && currentSpeed >= 1.5) {
      this.elements.audioOptimizationStatus.textContent = '⚠️';
      this.elements.audioOptimizationStatus.title = '音質優化未啟用';
      this.elements.audioOptimizationStatus.style.color = 'var(--warning-color)';
    } else {
      this.elements.audioOptimizationStatus.textContent = '';
      this.elements.audioOptimizationStatus.title = '';
    }
  }

  // 取得當前載入的檔案
  getCurrentFile() {
    return this.currentFile;
  }

  // 跳轉到指定時間
  seekTo(seconds) {
    if (this.audioElement && !isNaN(seconds)) {
      this.audioElement.currentTime = Math.max(0, Math.min(seconds, this.duration));
    }
  }

  // 清理資源
  cleanup() {
    // 釋放 Blob URL
    if (this.currentBlobUrl) {
      URL.revokeObjectURL(this.currentBlobUrl);
      this.currentBlobUrl = null;
    }

    // 斷開 Web Audio 連接
    if (this.isWebAudioConnected) {
      this.disconnectWebAudio();
    }

    // 清理音訊元素
    if (this.audioElement) {
      this.audioElement.pause();
      this.audioElement.src = '';
      this.audioElement.load();
    }

    // 重置狀態
    this.currentFile = null;
    this.isPlaying = false;
  }

  // 時間跳轉功能
  setupTimeJump() {
    const timeJumpInput = document.getElementById('timeJumpInput');
    const historyBtn = document.getElementById('timeJumpHistoryBtn');
    const historyPanel = document.getElementById('timeJumpHistory');
    
    if (!timeJumpInput) return;

    // 跳轉歷史記錄
    this.jumpHistory = [];
    const maxHistory = 5;

    // 處理 Enter 鍵事件
    timeJumpInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleTimeJump(timeJumpInput.value);
      }
    });

    // 處理輸入事件（移除錯誤狀態）
    timeJumpInput.addEventListener('input', () => {
      timeJumpInput.classList.remove('error');
    });

    // 設置歷史按鈕點擊事件
    if (historyBtn && historyPanel) {
      historyBtn.addEventListener('click', () => {
        const isVisible = historyPanel.style.display !== 'none';
        if (isVisible) {
          historyPanel.style.display = 'none';
        } else {
          this.showJumpHistory();
        }
      });

      // 點擊外部關閉歷史面板
      document.addEventListener('click', (e) => {
        if (!historyBtn.contains(e.target) && !historyPanel.contains(e.target)) {
          historyPanel.style.display = 'none';
        }
      });
    }
  }

  // 處理時間跳轉
  handleTimeJump(input) {
    const timeJumpInput = document.getElementById('timeJumpInput');
    if (!input || !this.audioElement || !this.duration) {
      return;
    }

    // 解析時間格式
    const seconds = this.parseTimeInput(input);
    
    if (seconds === null) {
      // 無效輸入
      this.showTimeJumpError();
      return;
    }

    // 檢查時間範圍
    if (seconds < 0 || seconds > this.duration) {
      this.showTimeJumpError();
      return;
    }

    // 執行跳轉
    this.seekTo(seconds);
    
    // 記錄跳轉歷史
    this.addToJumpHistory(seconds);
    
    // 清空輸入框
    timeJumpInput.value = '';
  }

  // 解析時間輸入（支援純數字格式）
  parseTimeInput(input) {
    // 移除空格
    input = input.trim();
    
    if (!input) return null;
    
    // 只允許數字
    if (!/^\d+$/.test(input)) {
      return null;
    }

    const len = input.length;
    let hours = 0, minutes = 0, seconds = 0;

    if (len <= 2) {
      // 52 -> 0:52
      seconds = parseInt(input);
    } else if (len <= 4) {
      // 352 -> 3:52
      // 2352 -> 23:52
      minutes = parseInt(input.slice(0, -2));
      seconds = parseInt(input.slice(-2));
    } else if (len <= 6) {
      // 12352 -> 1:23:52
      // 012352 -> 01:23:52
      hours = parseInt(input.slice(0, -4));
      minutes = parseInt(input.slice(-4, -2));
      seconds = parseInt(input.slice(-2));
    } else {
      return null;
    }

    // 驗證範圍
    if (minutes >= 60 || seconds >= 60) {
      return null;
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  // 顯示錯誤提示
  showTimeJumpError() {
    const timeJumpInput = document.getElementById('timeJumpInput');
    timeJumpInput.classList.add('error');
    
    // 3秒後自動移除錯誤狀態
    setTimeout(() => {
      timeJumpInput.classList.remove('error');
    }, 3000);
  }

  // 加入跳轉歷史
  addToJumpHistory(seconds) {
    // 避免重複
    const lastJump = this.jumpHistory[this.jumpHistory.length - 1];
    if (lastJump && Math.abs(lastJump - seconds) < 1) {
      return;
    }

    this.jumpHistory.push(seconds);
    
    // 保持最多5筆記錄
    if (this.jumpHistory.length > 5) {
      this.jumpHistory.shift();
    }
  }

  // 顯示跳轉歷史
  showJumpHistory() {
    const historyPanel = document.getElementById('timeJumpHistory');
    const historyList = document.getElementById('historyList');
    
    if (!historyPanel || !historyList) return;

    // 清空列表
    historyList.innerHTML = '';

    if (this.jumpHistory.length === 0) {
      historyList.innerHTML = '<div class="history-empty">尚無跳轉記錄</div>';
    } else {
      // 反向顯示（最新的在最上面）
      const reversedHistory = [...this.jumpHistory].reverse();
      
      reversedHistory.forEach((seconds) => {
        const item = document.createElement('div');
        item.className = 'history-item';
        
        // 格式化時間顯示
        const formatted = this.formatTime(seconds);
        const shortFormatted = this.formatShortTime(seconds);
        
        item.innerHTML = `
          <span class="history-time">${shortFormatted}</span>
          <span class="history-formatted">${formatted}</span>
        `;
        
        // 點擊跳轉
        item.addEventListener('click', () => {
          this.seekTo(seconds);
          historyPanel.style.display = 'none';
        });
        
        historyList.appendChild(item);
      });
    }

    // 顯示面板
    historyPanel.style.display = 'block';
  }
}
