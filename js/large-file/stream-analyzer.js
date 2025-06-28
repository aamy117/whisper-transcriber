/**
 * 串流分析器
 * 
 * 負責分析音訊檔案的格式、結構和元數據
 * 支援 MP3、WAV、M4A、FLAC 等常見格式
 */

export class StreamAnalyzer {
  constructor() {
    this.initialized = true;
    
    // 音訊格式簽名（魔術數字）
    this.formatSignatures = {
      // MP3: 'ID3' 或 0xFFFB (同步字)
      mp3: [
        { bytes: [0x49, 0x44, 0x33], offset: 0 }, // 'ID3'
        { bytes: [0xFF, 0xFB], offset: 0 },       // MPEG-1 Layer 3
        { bytes: [0xFF, 0xF3], offset: 0 },       // MPEG-2 Layer 3
        { bytes: [0xFF, 0xF2], offset: 0 }        // MPEG-2.5 Layer 3
      ],
      // WAV: 'RIFF' + 'WAVE'
      wav: [
        { bytes: [0x52, 0x49, 0x46, 0x46], offset: 0 },  // 'RIFF'
        { bytes: [0x57, 0x41, 0x56, 0x45], offset: 8 }   // 'WAVE'
      ],
      // M4A: 'ftyp' box
      m4a: [
        { bytes: [0x66, 0x74, 0x79, 0x70], offset: 4 }   // 'ftyp'
      ],
      // FLAC: 'fLaC'
      flac: [
        { bytes: [0x66, 0x4C, 0x61, 0x43], offset: 0 }   // 'fLaC'
      ],
      // OGG: 'OggS'
      ogg: [
        { bytes: [0x4F, 0x67, 0x67, 0x53], offset: 0 }   // 'OggS'
      ]
    };
    
    // MP3 比特率表 (kbps)
    this.mp3BitrateTable = {
      // MPEG-1 Layer 3
      1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
      // MPEG-2 Layer 3
      2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
    };
    
    // MP3 採樣率表 (Hz)
    this.mp3SampleRateTable = {
      0: [44100, 48000, 32000],  // MPEG-1
      2: [22050, 24000, 16000],  // MPEG-2
      3: [11025, 12000, 8000]    // MPEG-2.5
    };
  }
  
  /**
   * 分析檔案
   */
  async analyze(file) {
    try {
      // 讀取檔案頭部（前 64KB 足以分析大部分格式）
      const headerSize = Math.min(65536, file.size);
      const headerBuffer = await this.readFileSlice(file, 0, headerSize);
      const dataView = new DataView(headerBuffer);
      
      // 檢測檔案格式
      const format = await this.detectFormatFromHeader(dataView, file);
      
      // 根據格式進行詳細分析
      let analysis;
      switch (format) {
        case 'mp3':
          analysis = await this.analyzeMP3(file, dataView);
          break;
        case 'wav':
          analysis = await this.analyzeWAV(file, dataView);
          break;
        case 'm4a':
          analysis = await this.analyzeM4A(file, dataView);
          break;
        case 'flac':
          analysis = await this.analyzeFLAC(file, dataView);
          break;
        default:
          analysis = this.getBasicAnalysis(file, format);
      }
      
      // 添加通用資訊
      return {
        ...analysis,
        size: file.size,
        name: file.name,
        type: file.type || `audio/${format}`,
        format: format,
        canStream: file.size < 500 * 1024 * 1024,
        metadata: {
          ...analysis.metadata,
          analyzed: true,
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      console.error('音訊分析失敗:', error);
      // 返回基本資訊
      return this.getBasicAnalysis(file, 'unknown');
    }
  }
  
  /**
   * 讀取檔案片段
   */
  async readFileSlice(file, start, end) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file.slice(start, end));
    });
  }
  
  /**
   * 從檔案頭部檢測格式
   */
  async detectFormatFromHeader(dataView, file) {
    // 檢查每種格式的簽名
    for (const [format, signatures] of Object.entries(this.formatSignatures)) {
      for (const signature of signatures) {
        if (this.checkSignature(dataView, signature)) {
          // WAV 需要額外檢查 'WAVE' 標記
          if (format === 'wav') {
            const waveSignature = signatures.find(s => s.offset === 8);
            if (!this.checkSignature(dataView, waveSignature)) {
              continue;
            }
          }
          return format;
        }
      }
    }
    
    // 如果無法從頭部檢測，使用檔案副檔名
    return this.detectFormatFromFileName(file.name);
  }
  
  /**
   * 檢查簽名是否匹配
   */
  checkSignature(dataView, signature) {
    if (signature.offset + signature.bytes.length > dataView.byteLength) {
      return false;
    }
    
    for (let i = 0; i < signature.bytes.length; i++) {
      if (dataView.getUint8(signature.offset + i) !== signature.bytes[i]) {
        return false;
      }
    }
    return true;
  }
  
  /**
   * 從檔案名檢測格式
   */
  detectFormatFromFileName(fileName) {
    const name = fileName || '';
    const ext = name.split('.').pop().toLowerCase();
    
    const formatMap = {
      'mp3': 'mp3',
      'wav': 'wav',
      'm4a': 'm4a',
      'flac': 'flac',
      'ogg': 'ogg',
      'opus': 'opus',
      'webm': 'webm'
    };
    
    return formatMap[ext] || 'unknown';
  }
  
  /**
   * 分析 MP3 檔案
   */
  async analyzeMP3(file, dataView) {
    let offset = 0;
    let bitrate = 0;
    let sampleRate = 0;
    let channels = 2;
    let frames = 0;
    let duration = 0;
    
    // 跳過 ID3v2 標籤
    if (dataView.getUint8(0) === 0x49 && dataView.getUint8(1) === 0x44 && dataView.getUint8(2) === 0x33) {
      // ID3v2 標籤大小
      const size = ((dataView.getUint8(6) & 0x7F) << 21) |
                   ((dataView.getUint8(7) & 0x7F) << 14) |
                   ((dataView.getUint8(8) & 0x7F) << 7) |
                   (dataView.getUint8(9) & 0x7F);
      offset = 10 + size;
    }
    
    // 尋找第一個有效的 MP3 框架
    while (offset < dataView.byteLength - 4) {
      const header = dataView.getUint32(offset, false);
      
      // 檢查同步字 (11 bits 都是 1)
      if ((header & 0xFFE00000) === 0xFFE00000) {
        // 解析 MPEG 版本
        const mpegVersion = (header >> 19) & 0x3;
        const layer = (header >> 17) & 0x3;
        
        // 只處理 Layer 3 (MP3)
        if (layer === 1) {
          // 解析比特率
          const bitrateIndex = (header >> 12) & 0xF;
          const mpegType = mpegVersion === 3 ? 1 : 2; // MPEG-1 or MPEG-2
          bitrate = this.mp3BitrateTable[mpegType][bitrateIndex] * 1000;
          
          // 解析採樣率
          const sampleRateIndex = (header >> 10) & 0x3;
          const sampleRateTable = this.mp3SampleRateTable[mpegVersion === 3 ? 0 : mpegVersion];
          sampleRate = sampleRateTable[sampleRateIndex];
          
          // 解析聲道模式
          const channelMode = (header >> 6) & 0x3;
          channels = channelMode === 3 ? 1 : 2;
          
          frames++;
          break;
        }
      }
      offset++;
    }
    
    // 估算時長
    if (bitrate > 0) {
      duration = Math.floor((file.size * 8) / bitrate);
    }
    
    return {
      bitrate,
      sampleRate,
      channels,
      duration,
      estimatedDuration: duration,
      codec: 'mp3',
      metadata: {
        frames: frames > 0 ? 'found' : 'not found',
        headerOffset: offset
      }
    };
  }
  
  /**
   * 分析 WAV 檔案
   */
  async analyzeWAV(file, dataView) {
    let offset = 12; // 跳過 'RIFF' + size + 'WAVE'
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let bitrate = 0;
    let duration = 0;
    let dataSize = 0;
    
    // 解析 WAV chunks
    while (offset < dataView.byteLength - 8) {
      const chunkId = String.fromCharCode(
        dataView.getUint8(offset),
        dataView.getUint8(offset + 1),
        dataView.getUint8(offset + 2),
        dataView.getUint8(offset + 3)
      );
      const chunkSize = dataView.getUint32(offset + 4, true);
      
      if (chunkId === 'fmt ') {
        // 解析格式資訊
        const audioFormat = dataView.getUint16(offset + 8, true);
        channels = dataView.getUint16(offset + 10, true);
        sampleRate = dataView.getUint32(offset + 12, true);
        const byteRate = dataView.getUint32(offset + 16, true);
        bitsPerSample = dataView.getUint16(offset + 22, true);
        bitrate = byteRate * 8;
      } else if (chunkId === 'data') {
        dataSize = chunkSize;
      }
      
      offset += 8 + chunkSize;
      // 確保偶數對齊
      if (chunkSize % 2 !== 0) offset++;
    }
    
    // 計算時長
    if (sampleRate > 0 && channels > 0 && bitsPerSample > 0) {
      duration = dataSize / (sampleRate * channels * (bitsPerSample / 8));
    }
    
    return {
      bitrate,
      sampleRate,
      channels,
      bitsPerSample,
      duration,
      estimatedDuration: Math.floor(duration),
      codec: 'pcm',
      metadata: {
        audioFormat: 'PCM',
        dataSize
      }
    };
  }
  
  /**
   * 分析 M4A 檔案（簡化版）
   */
  async analyzeM4A(file, dataView) {
    // M4A (MP4 容器) 分析較複雜，這裡提供簡化版本
    // 實際應用中可能需要完整的 MP4 box 解析
    return {
      bitrate: 128000, // 預設值
      sampleRate: 44100,
      channels: 2,
      duration: 0,
      estimatedDuration: Math.round(file.size / (128 * 1024 / 8)),
      codec: 'aac',
      metadata: {
        container: 'mp4',
        note: '簡化分析，完整實現需要 MP4 box 解析器'
      }
    };
  }
  
  /**
   * 分析 FLAC 檔案
   */
  async analyzeFLAC(file, dataView) {
    let offset = 4; // 跳過 'fLaC'
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;
    let totalSamples = 0;
    
    // 讀取 STREAMINFO metadata block
    const blockType = dataView.getUint8(offset) & 0x7F;
    const blockSize = (dataView.getUint8(offset + 1) << 16) |
                     (dataView.getUint8(offset + 2) << 8) |
                     dataView.getUint8(offset + 3);
    
    if (blockType === 0) { // STREAMINFO
      offset += 4;
      
      // 跳過 min/max block size, min/max frame size
      offset += 10;
      
      // 採樣率 (20 bits)
      sampleRate = (dataView.getUint8(offset) << 12) |
                   (dataView.getUint8(offset + 1) << 4) |
                   ((dataView.getUint8(offset + 2) >> 4) & 0x0F);
      
      // 聲道數 (3 bits) + 1
      channels = ((dataView.getUint8(offset + 2) >> 1) & 0x07) + 1;
      
      // 每個樣本的位數 (5 bits) + 1
      bitsPerSample = ((dataView.getUint8(offset + 2) & 0x01) << 4) |
                      ((dataView.getUint8(offset + 3) >> 4) & 0x0F) + 1;
      
      // 總樣本數 (36 bits)
      totalSamples = ((dataView.getUint8(offset + 3) & 0x0F) << 32) |
                     (dataView.getUint32(offset + 4, false));
    }
    
    const duration = totalSamples > 0 ? totalSamples / sampleRate : 0;
    const bitrate = file.size * 8 / duration;
    
    return {
      bitrate: Math.floor(bitrate),
      sampleRate,
      channels,
      bitsPerSample,
      duration,
      estimatedDuration: Math.floor(duration),
      codec: 'flac',
      metadata: {
        totalSamples,
        compression: 'lossless'
      }
    };
  }
  
  /**
   * 獲取基本分析結果
   */
  getBasicAnalysis(file, format) {
    return {
      size: file.size,
      type: file.type || 'audio/unknown',
      name: file.name || 'unknown',
      format: format,
      estimatedDuration: Math.round(file.size / (128 * 1024 / 8)),
      bitrate: 128000,
      sampleRate: 44100,
      channels: 2,
      canStream: file.size < 500 * 1024 * 1024,
      metadata: {
        analyzed: false,
        reason: 'fallback to basic analysis'
      }
    };
  }
  
  /**
   * 創建串流讀取器
   */
  async createStreamReader(file, options = {}) {
    const chunkSize = options.chunkSize || 1024 * 1024; // 預設 1MB
    let position = 0;
    
    return {
      file,
      chunkSize,
      position,
      
      async read() {
        if (position >= file.size) {
          return { done: true };
        }
        
        const end = Math.min(position + chunkSize, file.size);
        const chunk = await this.readFileSlice(file, position, end);
        position = end;
        
        return {
          done: false,
          value: chunk,
          progress: position / file.size
        };
      },
      
      seek(newPosition) {
        position = Math.max(0, Math.min(newPosition, file.size));
      },
      
      get progress() {
        return position / file.size;
      }
    };
  }
}