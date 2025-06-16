/**
 * 視訊串流載入器 - 使用 Media Source Extensions (MSE)
 * 用於處理大型視訊檔案的串流播放
 */

export class StreamingLoader {
  constructor(videoElement) {
    this.video = videoElement;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.file = null;
    this.reader = new FileReader();
    
    // 串流設定
    this.chunkSize = 2 * 1024 * 1024; // 2MB per chunk
    this.currentChunk = 0;
    this.totalChunks = 0;
    this.isLoading = false;
    this.isSourceOpen = false;
    this.pendingSegments = [];
    
    // 緩衝管理
    this.bufferSize = 20 * 1024 * 1024; // 20MB buffer
    this.preloadSize = 5 * 1024 * 1024; // 5MB preload
    
    // 支援的 MIME 類型
    this.mimeTypes = {
      'video/mp4': [
        'video/mp4; codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4; codecs="avc1.42E01E"',
        'video/mp4; codecs="avc1.4D401E, mp4a.40.2"',
        'video/mp4; codecs="avc1.4D401E"',
        'video/mp4'
      ],
      'video/webm': [
        'video/webm; codecs="vorbis,vp8"',
        'video/webm; codecs="vorbis,vp9"',
        'video/webm; codecs="opus,vp9"',
        'video/webm; codecs="vp8"',
        'video/webm; codecs="vp9"',
        'video/webm'
      ]
    };
    
    this.setupEventHandlers();
  }
  
  /**
   * 載入視訊檔案
   * @param {File} file - 視訊檔案
   * @returns {Promise} 載入完成的 Promise
   */
  async loadFile(file) {
    this.file = file;
    this.totalChunks = Math.ceil(file.size / this.chunkSize);
    
    console.log(`開始串流載入: ${file.name}, 大小: ${this.formatSize(file.size)}, 分塊數: ${this.totalChunks}`);
    
    // 檢查 MSE 支援
    if (!window.MediaSource) {
      throw new Error('瀏覽器不支援 Media Source Extensions');
    }
    
    // 取得支援的 MIME 類型
    const mimeType = await this.getSupportedMimeType(file);
    if (!mimeType) {
      throw new Error(`不支援的視訊格式: ${file.type}`);
    }
    
    console.log(`使用 MIME 類型: ${mimeType}`);
    
    // 建立 MediaSource
    this.mediaSource = new MediaSource();
    this.video.src = URL.createObjectURL(this.mediaSource);
    
    // 等待 MediaSource 開啟
    await this.waitForSourceOpen();
    
    // 建立 SourceBuffer
    try {
      this.sourceBuffer = this.mediaSource.addSourceBuffer(mimeType);
      this.setupSourceBufferHandlers();
    } catch (error) {
      console.error('建立 SourceBuffer 失敗:', error);
      
      // 觸發錯誤事件
      this.video.dispatchEvent(new CustomEvent('video:streaming:error', {
        detail: {
          error: `無法建立 SourceBuffer: ${error.message}`,
          mimeType: mimeType
        }
      }));
      
      throw new Error(`無法建立 SourceBuffer: ${error.message}`);
    }
    
    // 開始載入第一個分塊
    try {
      await this.loadNextChunk();
      
      // 等待一段時間確認載入是否成功
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // 檢查是否有載入進度
      if (this.currentChunk <= 1 && this.video.buffered.length === 0) {
        throw new Error('串流載入無進展，可能是檔案格式不相容');
      }
      
    } catch (error) {
      console.error('串流載入初始化失敗:', error);
      throw error;
    }
    
    return {
      duration: this.video.duration,
      width: this.video.videoWidth,
      height: this.video.videoHeight
    };
  }
  
  /**
   * 取得支援的 MIME 類型
   * @param {File} file - 視訊檔案
   * @returns {Promise<string|null>} 支援的 MIME 類型
   */
  async getSupportedMimeType(file) {
    const baseType = file.type.split(';')[0];
    const possibleTypes = this.mimeTypes[baseType] || [file.type];
    
    // 測試每個可能的 MIME 類型
    for (const mimeType of possibleTypes) {
      if (MediaSource.isTypeSupported(mimeType)) {
        return mimeType;
      }
    }
    
    // 如果都不支援，嘗試讀取檔案頭部來檢測
    const header = await this.readFileHeader(file);
    const detectedType = this.detectCodecFromHeader(header, baseType);
    
    if (detectedType && MediaSource.isTypeSupported(detectedType)) {
      return detectedType;
    }
    
    return null;
  }
  
  /**
   * 讀取檔案頭部
   * @param {File} file - 視訊檔案
   * @returns {Promise<ArrayBuffer>} 檔案頭部資料
   */
  readFileHeader(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const headerSize = Math.min(1024, file.size); // 讀取前 1KB
      
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file.slice(0, headerSize));
    });
  }
  
  /**
   * 從檔案頭部檢測編碼
   * @param {ArrayBuffer} header - 檔案頭部資料
   * @param {string} baseType - 基本 MIME 類型
   * @returns {string|null} 檢測到的 MIME 類型
   */
  detectCodecFromHeader(header, baseType) {
    // 這是簡化版本，實際應用可能需要更複雜的檢測
    const view = new DataView(header);
    
    if (baseType === 'video/mp4') {
      // 檢查 MP4 ftyp box
      if (view.getUint32(4) === 0x66747970) { // 'ftyp'
        return 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"';
      }
    } else if (baseType === 'video/webm') {
      // 檢查 WebM 標識
      if (view.getUint32(0) === 0x1a45dfa3) { // EBML header
        return 'video/webm; codecs="vorbis,vp8"';
      }
    }
    
    return null;
  }
  
  /**
   * 等待 MediaSource 開啟
   * @returns {Promise} 開啟完成的 Promise
   */
  waitForSourceOpen() {
    return new Promise((resolve, reject) => {
      if (this.mediaSource.readyState === 'open') {
        this.isSourceOpen = true;
        resolve();
      } else {
        this.mediaSource.addEventListener('sourceopen', () => {
          this.isSourceOpen = true;
          resolve();
        }, { once: true });
        
        this.mediaSource.addEventListener('sourceerror', reject, { once: true });
      }
    });
  }
  
  /**
   * 載入下一個分塊
   * @returns {Promise} 載入完成的 Promise
   */
  async loadNextChunk() {
    if (this.isLoading || this.currentChunk >= this.totalChunks) {
      return;
    }
    
    this.isLoading = true;
    
    const start = this.currentChunk * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    const chunk = this.file.slice(start, end);
    
    console.log(`載入分塊 ${this.currentChunk + 1}/${this.totalChunks} (${this.formatSize(start)}-${this.formatSize(end)})`);
    
    try {
      const buffer = await this.readChunk(chunk);
      await this.appendBuffer(buffer);
      
      this.currentChunk++;
      this.isLoading = false;
      
      // 觸發進度事件
      this.video.dispatchEvent(new CustomEvent('video:streaming:progress', {
        detail: {
          loaded: this.currentChunk,
          total: this.totalChunks,
          percentage: (this.currentChunk / this.totalChunks) * 100
        }
      }));
      
      // 檢查是否需要載入更多
      this.checkBufferAndLoad();
      
    } catch (error) {
      this.isLoading = false;
      console.error('載入分塊失敗:', error);
      
      // 觸發錯誤事件
      this.video.dispatchEvent(new CustomEvent('video:streaming:error', {
        detail: {
          error: error.message || '串流載入失敗',
          chunk: this.currentChunk,
          total: this.totalChunks
        }
      }));
      
      throw error;
    }
  }
  
  /**
   * 讀取檔案分塊
   * @param {Blob} chunk - 檔案分塊
   * @returns {Promise<ArrayBuffer>} 分塊資料
   */
  readChunk(chunk) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(chunk);
    });
  }
  
  /**
   * 附加緩衝區資料
   * @param {ArrayBuffer} buffer - 要附加的資料
   * @returns {Promise} 附加完成的 Promise
   */
  appendBuffer(buffer) {
    return new Promise((resolve, reject) => {
      if (!this.sourceBuffer || this.sourceBuffer.updating) {
        console.log('SourceBuffer 正在更新，加入待處理隊列');
        // 如果 SourceBuffer 正在更新，將資料加入待處理隊列
        this.pendingSegments.push({ buffer, resolve, reject });
        return;
      }
      
      try {
        console.log(`準備附加緩衝區，大小: ${this.formatSize(buffer.byteLength)}`);
        this.sourceBuffer.appendBuffer(buffer);
        
        const onUpdateEnd = () => {
          console.log('緩衝區附加成功');
          this.sourceBuffer.removeEventListener('updateend', onUpdateEnd);
          this.sourceBuffer.removeEventListener('error', onError);
          resolve();
          
          // 處理待處理的片段
          this.processPendingSegments();
        };
        
        const onError = (e) => {
          console.error('SourceBuffer 錯誤:', e);
          this.sourceBuffer.removeEventListener('updateend', onUpdateEnd);
          this.sourceBuffer.removeEventListener('error', onError);
          reject(new Error('附加緩衝區失敗'));
        };
        
        this.sourceBuffer.addEventListener('updateend', onUpdateEnd);
        this.sourceBuffer.addEventListener('error', onError);
        
      } catch (error) {
        console.error('appendBuffer 異常:', error);
        reject(error);
      }
    });
  }
  
  /**
   * 處理待處理的片段
   */
  processPendingSegments() {
    if (this.pendingSegments.length === 0 || this.sourceBuffer.updating) {
      return;
    }
    
    const { buffer, resolve, reject } = this.pendingSegments.shift();
    this.appendBuffer(buffer).then(resolve).catch(reject);
  }
  
  /**
   * 檢查緩衝區並載入更多資料
   */
  checkBufferAndLoad() {
    console.log(`檢查緩衝區 - 當前分塊: ${this.currentChunk}/${this.totalChunks}, 正在載入: ${this.isLoading}`);
    
    if (this.currentChunk >= this.totalChunks) {
      console.log('所有分塊已載入完成');
      return;
    }
    
    // 如果視訊還沒有 duration，可能是第一個分塊還沒處理完
    if (!this.video.duration || isNaN(this.video.duration)) {
      console.log('視訊 duration 尚未就緒，稍後重試');
      // 稍後重試
      setTimeout(() => this.checkBufferAndLoad(), 1000);
      return;
    }
    
    const currentTime = this.video.currentTime;
    const buffered = this.video.buffered;
    
    console.log(`當前播放時間: ${currentTime.toFixed(2)}s, 緩衝區段數: ${buffered.length}`);
    
    // 計算已緩衝的時間
    let bufferedEnd = currentTime;
    for (let i = 0; i < buffered.length; i++) {
      if (buffered.start(i) <= currentTime && currentTime <= buffered.end(i)) {
        bufferedEnd = buffered.end(i);
        break;
      }
    }
    
    // 如果緩衝時間少於預設值，載入更多
    const bufferedTime = bufferedEnd - currentTime;
    const needMoreBuffer = bufferedTime < 10; // 保持 10 秒緩衝
    
    console.log(`緩衝時間: ${bufferedTime.toFixed(2)}s, 需要更多緩衝: ${needMoreBuffer}`);
    
    if (needMoreBuffer && !this.isLoading) {
      console.log('開始載入下一個分塊');
      this.loadNextChunk();
    }
  }
  
  /**
   * 設定事件處理器
   */
  setupEventHandlers() {
    // 監聽播放進度，動態載入資料
    this.video.addEventListener('timeupdate', () => {
      this.checkBufferAndLoad();
    });
    
    // 監聽 seeking，可能需要載入新位置的資料
    this.video.addEventListener('seeking', () => {
      // 未來可以實作智慧 seeking
      console.log('Seeking to:', this.video.currentTime);
    });
  }
  
  /**
   * 設定 SourceBuffer 事件處理器
   */
  setupSourceBufferHandlers() {
    this.sourceBuffer.addEventListener('updateend', () => {
      // 檢查是否所有資料都已載入
      if (this.currentChunk >= this.totalChunks && !this.sourceBuffer.updating) {
        // 檢查 MediaSource 狀態
        if (this.mediaSource.readyState === 'open') {
          this.mediaSource.endOfStream();
          console.log('串流載入完成');
        }
      }
    });
    
    this.sourceBuffer.addEventListener('error', (e) => {
      console.error('SourceBuffer 錯誤:', e);
    });
  }
  
  /**
   * 格式化檔案大小
   * @param {number} bytes - 位元組數
   * @returns {string} 格式化的大小
   */
  formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
  }
  
  /**
   * 清理資源
   */
  destroy() {
    if (this.video.src) {
      URL.revokeObjectURL(this.video.src);
    }
    
    if (this.sourceBuffer) {
      try {
        if (this.mediaSource.readyState === 'open') {
          this.mediaSource.removeSourceBuffer(this.sourceBuffer);
        }
      } catch (error) {
        console.error('移除 SourceBuffer 時發生錯誤:', error);
      }
    }
    
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.file = null;
    this.pendingSegments = [];
  }
}

/**
 * 檢查瀏覽器是否支援 MSE
 * @returns {boolean} 是否支援
 */
export function isMSESupported() {
  return !!(window.MediaSource && MediaSource.isTypeSupported);
}

/**
 * 取得 MSE 支援資訊
 * @returns {Object} 支援資訊
 */
export function getMSESupport() {
  if (!isMSESupported()) {
    return { supported: false };
  }
  
  const support = {
    supported: true,
    formats: {
      mp4: {
        h264: MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E, mp4a.40.2"'),
        h265: MediaSource.isTypeSupported('video/mp4; codecs="hev1.1.6.L93.90, mp4a.40.2"')
      },
      webm: {
        vp8: MediaSource.isTypeSupported('video/webm; codecs="vorbis,vp8"'),
        vp9: MediaSource.isTypeSupported('video/webm; codecs="opus,vp9"'),
        av1: MediaSource.isTypeSupported('video/webm; codecs="opus,av1"')
      }
    }
  };
  
  return support;
}