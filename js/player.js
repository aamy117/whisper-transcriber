import Config from './config.js';

// 音訊播放器類別
export class AudioPlayer {
  constructor() {
    this.audioElement = null;
    this.currentFile = null;
    this.isPlaying = false;
    this.duration = 0;
    this.currentTime = 0;
    
    // DOM 元素
    this.elements = {
      audioPlayer: null,
      uploadArea: null,
      playerControls: null,
      audioInput: null,
      selectFileBtn: null,
      playBtn: null,
      backwardBtn: null,
      forwardBtn: null,
      progressBar: null,
      currentTimeEl: null,
      totalTimeEl: null,
      audioName: null,
      audioDuration: null,
      speedSelect: null,
      volumeSlider: null,
      transcriptionSection: null
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
    this.elements.playBtn = document.getElementById('playBtn');
    this.elements.backwardBtn = document.getElementById('backwardBtn');
    this.elements.forwardBtn = document.getElementById('forwardBtn');
    this.elements.progressBar = document.getElementById('progressBar');
    this.elements.currentTimeEl = document.getElementById('currentTime');
    this.elements.totalTimeEl = document.getElementById('totalTime');
    this.elements.audioName = document.getElementById('audioName');
    this.elements.audioDuration = document.getElementById('audioDuration');
    this.elements.speedSelect = document.getElementById('speedSelect');
    this.elements.volumeSlider = document.getElementById('volumeSlider');
    this.elements.transcriptionSection = document.getElementById('transcriptionSection');
    
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
    this.elements.playBtn.addEventListener('click', this.togglePlayPause.bind(this));
    this.elements.backwardBtn.addEventListener('click', () => this.skip(-Config.player.skipSeconds));
    this.elements.forwardBtn.addEventListener('click', () => this.skip(Config.player.skipSeconds));
    
    // 進度條事件
    this.elements.progressBar.addEventListener('input', this.handleProgressChange.bind(this));
    
    // 速度控制
    this.elements.speedSelect.addEventListener('change', this.handleSpeedChange.bind(this));
    
    // 音量控制
    this.elements.volumeSlider.addEventListener('input', this.handleVolumeChange.bind(this));
    
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
    this.currentFile = file;
    const url = URL.createObjectURL(file);
    
    this.audioElement.src = url;
    this.audioElement.load();
    
    // 更新 UI
    this.elements.audioName.textContent = file.name;
    this.elements.uploadArea.style.display = 'none';
    this.elements.playerControls.style.display = 'block';
    this.elements.transcriptionSection.style.display = 'block';
    
    // 儲存到 localStorage
    this.saveCurrentProject();
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
    this.audioElement.play();
    this.isPlaying = true;
    this.updatePlayButton();
  }
  
  pause() {
    this.audioElement.pause();
    this.isPlaying = false;
    this.updatePlayButton();
  }
  
  skip(seconds) {
    const newTime = this.audioElement.currentTime + seconds;
    this.audioElement.currentTime = Math.max(0, Math.min(newTime, this.duration));
  }
  
  updatePlayButton() {
    const icon = this.elements.playBtn.querySelector('.icon');
    icon.textContent = this.isPlaying ? '⏸️' : '▶️';
    this.elements.playBtn.title = this.isPlaying ? '暫停 (空白鍵)' : '播放 (空白鍵)';
  }
  
  // 進度控制
  handleProgressChange(e) {
    const progress = e.target.value;
    const time = (progress / 100) * this.duration;
    this.audioElement.currentTime = time;
  }
  
  // 速度控制
  handleSpeedChange(e) {
    this.audioElement.playbackRate = parseFloat(e.target.value);
  }
  
  // 音量控制
  handleVolumeChange(e) {
    this.audioElement.volume = e.target.value / 100;
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
    }
  }
  
  changeSpeed(delta) {
    const currentSpeed = this.audioElement.playbackRate;
    const newSpeed = Math.max(Config.player.minSpeed, 
                              Math.min(Config.player.maxSpeed, currentSpeed + delta));
    this.audioElement.playbackRate = newSpeed;
    this.elements.speedSelect.value = newSpeed;
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
}