/**
 * 智慧分割器
 * 
 * 負責將大型音訊檔案智慧地分割成適合處理的片段
 * 支援基於靜音檢測、音訊框架邊界的精確分割
 */

import { StreamAnalyzer } from './stream-analyzer.js';

export class SmartSplitter {
  constructor() {
    this.initialized = true;
    this.streamAnalyzer = new StreamAnalyzer();
    
    // 分割策略配置
    this.config = {
      // 目標分段大小（MB）
      targetSizeMB: 25,
      // 最小分段大小（MB）
      minSizeMB: 10,
      // 最大分段大小（MB）
      maxSizeMB: 50,
      // 重疊時長（秒）
      overlapSeconds: 2,
      // 靜音檢測閾值（dB）
      silenceThreshold: -40,
      // 最小靜音長度（毫秒）
      minSilenceDuration: 500,
      // 分割點搜尋範圍（佔目標大小的百分比）
      searchRange: 0.1,
      // 是否啟用智慧分割
      enableSmartSplit: true
    };
    
    // 音訊格式特定的框架大小
    this.frameSizes = {
      mp3: {
        getFrameSize: (bitrate, sampleRate) => {
          // MP3 框架大小 = 144 * bitrate / sampleRate + padding
          return Math.floor(144 * bitrate / sampleRate);
        }
      },
      wav: {
        getFrameSize: (channels, bitsPerSample) => {
          // WAV 框架大小 = channels * bitsPerSample / 8
          return channels * bitsPerSample / 8;
        }
      }
    };
  }
  
  /**
   * 分割檔案
   */
  async split(file, options = {}) {
    const config = { ...this.config, ...options };
    const targetSize = config.targetSize || (config.targetSizeMB * 1024 * 1024);
    const onProgress = config.onProgress || (() => {});
    
    try {
      // 分析檔案
      const analysis = await this.streamAnalyzer.analyze(file);
      
      // 決定分割策略
      if (!config.enableSmartSplit || !this.isSmartSplitSupported(analysis.format)) {
        // 使用簡單的固定大小分割
        return await this.simpleSplit(file, targetSize, config, onProgress);
      }
      
      // 使用智慧分割
      return await this.smartSplit(file, analysis, targetSize, config, onProgress);
      
    } catch (error) {
      console.error('分割失敗，降級到簡單分割:', error);
      return await this.simpleSplit(file, targetSize, config, onProgress);
    }
  }
  
  /**
   * 檢查是否支援智慧分割
   */
  isSmartSplitSupported(format) {
    return ['mp3', 'wav', 'flac'].includes(format);
  }
  
  /**
   * 簡單分割（固定大小）
   */
  async simpleSplit(file, targetSize, config, onProgress) {
    const segments = [];
    const fileSize = file.size;
    const segmentCount = Math.ceil(fileSize / targetSize);
    
    for (let i = 0; i < segmentCount; i++) {
      const start = i * targetSize;
      const end = Math.min(start + targetSize, fileSize);
      
      // 添加重疊（除了最後一段）
      const overlapBytes = i < segmentCount - 1 ? 
        Math.floor(targetSize * 0.02) : // 2% 重疊
        0;
      
      const actualEnd = Math.min(end + overlapBytes, fileSize);
      
      segments.push({
        index: i,
        start: start,
        end: actualEnd,
        size: actualEnd - start,
        startTime: (start / fileSize) * 3600, // 估算時間（假設 1 小時）
        endTime: (actualEnd / fileSize) * 3600,
        duration: ((actualEnd - start) / fileSize) * 3600,
        file: file.slice(start, actualEnd),
        metadata: {
          method: 'simple',
          overlap: overlapBytes
        }
      });
      
      onProgress((i + 1) / segmentCount);
    }
    
    return segments;
  }
  
  /**
   * 智慧分割（基於音訊特性）
   */
  async smartSplit(file, analysis, targetSize, config, onProgress) {
    const segments = [];
    const fileSize = file.size;
    
    // 計算理想的分段數量
    const idealSegmentCount = Math.ceil(fileSize / targetSize);
    const minSize = config.minSizeMB * 1024 * 1024;
    const maxSize = config.maxSizeMB * 1024 * 1024;
    
    // 根據格式選擇分割策略
    switch (analysis.format) {
      case 'mp3':
        return await this.splitMP3(file, analysis, targetSize, config, onProgress);
      case 'wav':
        return await this.splitWAV(file, analysis, targetSize, config, onProgress);
      default:
        return await this.splitWithSilenceDetection(file, analysis, targetSize, config, onProgress);
    }
  }
  
  /**
   * 分割 MP3 檔案
   */
  async splitMP3(file, analysis, targetSize, config, onProgress) {
    const segments = [];
    let currentPosition = 0;
    let segmentIndex = 0;
    
    // 如果有 ID3v2 標籤，跳過它
    const headerSize = await this.findMP3DataStart(file);
    currentPosition = headerSize;
    
    while (currentPosition < file.size) {
      // 計算目標結束位置
      let targetEnd = currentPosition + targetSize;
      
      // 如果接近檔案結尾，直接到結尾
      if (file.size - targetEnd < targetSize * 0.1) {
        targetEnd = file.size;
      } else {
        // 尋找最近的 MP3 框架邊界
        targetEnd = await this.findMP3FrameBoundary(file, targetEnd, config);
      }
      
      // 建立分段
      const segment = {
        index: segmentIndex++,
        start: currentPosition,
        end: targetEnd,
        size: targetEnd - currentPosition,
        file: file.slice(currentPosition, targetEnd),
        metadata: {
          method: 'mp3-frame-aligned',
          format: 'mp3'
        }
      };
      
      // 估算時間資訊
      if (analysis.bitrate > 0) {
        const bytesPerSecond = analysis.bitrate / 8;
        segment.startTime = currentPosition / bytesPerSecond;
        segment.endTime = targetEnd / bytesPerSecond;
        segment.duration = segment.endTime - segment.startTime;
      }
      
      segments.push(segment);
      
      // 添加重疊
      currentPosition = targetEnd - Math.floor(config.overlapSeconds * (analysis.bitrate / 8));
      
      // 更新進度
      onProgress(Math.min(currentPosition / file.size, 1));
    }
    
    return segments;
  }
  
  /**
   * 尋找 MP3 數據開始位置（跳過 ID3 標籤）
   */
  async findMP3DataStart(file) {
    const headerBuffer = await this.streamAnalyzer.readFileSlice(file, 0, 10);
    const view = new DataView(headerBuffer);
    
    // 檢查 ID3v2 標籤
    if (view.getUint8(0) === 0x49 && view.getUint8(1) === 0x44 && view.getUint8(2) === 0x33) {
      // 計算 ID3 標籤大小
      const size = ((view.getUint8(6) & 0x7F) << 21) |
                   ((view.getUint8(7) & 0x7F) << 14) |
                   ((view.getUint8(8) & 0x7F) << 7) |
                   (view.getUint8(9) & 0x7F);
      return 10 + size;
    }
    
    return 0;
  }
  
  /**
   * 尋找最近的 MP3 框架邊界
   */
  async findMP3FrameBoundary(file, targetPosition, config) {
    const targetSize = config.targetSize || (config.targetSizeMB * 1024 * 1024);
    const searchRange = Math.floor(targetSize * config.searchRange);
    const searchStart = Math.max(0, targetPosition - searchRange);
    const searchEnd = Math.min(file.size, targetPosition + searchRange);
    
    // 讀取搜尋範圍的數據
    const buffer = await this.streamAnalyzer.readFileSlice(file, searchStart, searchEnd);
    const view = new DataView(buffer);
    
    let bestPosition = targetPosition;
    let minDistance = Infinity;
    
    // 尋找同步字
    for (let i = 0; i < view.byteLength - 4; i++) {
      const byte1 = view.getUint8(i);
      const byte2 = view.getUint8(i + 1);
      
      // 檢查 MP3 同步字 (11 bits 都是 1)
      if (byte1 === 0xFF && (byte2 & 0xE0) === 0xE0) {
        const position = searchStart + i;
        const distance = Math.abs(position - targetPosition);
        
        if (distance < minDistance) {
          minDistance = distance;
          bestPosition = position;
        }
      }
    }
    
    return bestPosition;
  }
  
  /**
   * 分割 WAV 檔案
   */
  async splitWAV(file, analysis, targetSize, config, onProgress) {
    const segments = [];
    let currentPosition = 44; // WAV 頭部通常是 44 bytes
    let segmentIndex = 0;
    
    // 計算每個樣本的大小
    const bytesPerSample = analysis.channels * (analysis.bitsPerSample / 8);
    const bytesPerSecond = analysis.sampleRate * bytesPerSample;
    
    while (currentPosition < file.size) {
      // 計算目標結束位置（對齊到樣本邊界）
      let targetEnd = currentPosition + targetSize;
      targetEnd = Math.floor(targetEnd / bytesPerSample) * bytesPerSample;
      
      // 如果接近檔案結尾，直接到結尾
      if (file.size - targetEnd < targetSize * 0.1) {
        targetEnd = file.size;
      }
      
      // 建立分段
      const segment = {
        index: segmentIndex++,
        start: currentPosition,
        end: targetEnd,
        size: targetEnd - currentPosition,
        startTime: (currentPosition - 44) / bytesPerSecond,
        endTime: (targetEnd - 44) / bytesPerSecond,
        file: await this.createWAVSegment(file, currentPosition, targetEnd, analysis),
        metadata: {
          method: 'wav-sample-aligned',
          format: 'wav'
        }
      };
      
      segment.duration = segment.endTime - segment.startTime;
      segments.push(segment);
      
      // 添加重疊
      const overlapBytes = Math.floor(config.overlapSeconds * bytesPerSecond);
      currentPosition = targetEnd - overlapBytes;
      
      // 更新進度
      onProgress(Math.min(currentPosition / file.size, 1));
    }
    
    return segments;
  }
  
  /**
   * 建立 WAV 分段（包含正確的頭部）
   */
  async createWAVSegment(file, start, end, analysis) {
    // 讀取原始 WAV 頭部
    const headerBuffer = await this.streamAnalyzer.readFileSlice(file, 0, 44);
    const header = new Uint8Array(headerBuffer);
    
    // 讀取數據部分
    const dataBuffer = await this.streamAnalyzer.readFileSlice(file, start, end);
    const dataSize = dataBuffer.byteLength;
    
    // 更新頭部中的大小資訊
    const view = new DataView(header.buffer);
    view.setUint32(4, 36 + dataSize, true); // 檔案大小 - 8
    view.setUint32(40, dataSize, true); // 數據大小
    
    // 組合頭部和數據
    const segmentBuffer = new ArrayBuffer(44 + dataSize);
    const segmentView = new Uint8Array(segmentBuffer);
    segmentView.set(header, 0);
    segmentView.set(new Uint8Array(dataBuffer), 44);
    
    return new Blob([segmentBuffer], { type: 'audio/wav' });
  }
  
  /**
   * 基於靜音檢測的分割
   */
  async splitWithSilenceDetection(file, analysis, targetSize, config, onProgress) {
    // 這是一個簡化版本，實際應用中需要更複雜的音訊分析
    console.log('使用靜音檢測分割（簡化版）');
    return await this.simpleSplit(file, targetSize, config, onProgress);
  }
  
  /**
   * 建立串流分割器
   */
  async createStreamer(file, options = {}) {
    const chunkSize = options.chunkSize || 10 * 1024 * 1024;
    const analysis = await this.streamAnalyzer.analyze(file);
    const self = this; // 保存 this 引用
    
    let position = 0;
    let chunkIndex = 0;
    
    // 如果是 MP3，跳過 ID3 標籤
    if (analysis.format === 'mp3') {
      position = await this.findMP3DataStart(file);
    }
    
    return {
      file: file,
      analysis: analysis,
      chunkSize: chunkSize,
      position: position,
      
      async *getChunks() {
        while (this.position < this.file.size) {
          const start = this.position;
          let end = Math.min(this.position + this.chunkSize, this.file.size);
          
          // 對齊到格式邊界
          if (this.analysis.format === 'mp3' && end < this.file.size) {
            end = await self.findMP3FrameBoundary(this.file, end, { searchRange: 0.05 });
          }
          
          const chunk = {
            index: chunkIndex++,
            start: start,
            end: end,
            size: end - start,
            data: this.file.slice(start, end),
            progress: end / this.file.size
          };
          
          this.position = end;
          yield chunk;
        }
      },
      
      async read() {
        if (position >= file.size) {
          return { done: true };
        }
        
        const start = position;
        let end = Math.min(position + chunkSize, file.size);
        
        // 對齊到格式邊界
        if (analysis.format === 'mp3' && end < file.size) {
          end = await self.findMP3FrameBoundary(file, end, { searchRange: 0.05 });
        }
        
        const chunk = file.slice(start, end);
        position = end;
        
        return {
          done: false,
          value: chunk,
          progress: position / file.size,
          metadata: {
            start,
            end,
            size: end - start
          }
        };
      }
    };
  }
  
  /**
   * 估算分割結果
   */
  async estimateSplitResult(file, options = {}) {
    const config = { ...this.config, ...options };
    const targetSize = config.targetSize || (config.targetSizeMB * 1024 * 1024);
    
    const analysis = await this.streamAnalyzer.analyze(file);
    const segmentCount = Math.ceil(file.size / targetSize);
    
    return {
      fileSize: file.size,
      format: analysis.format,
      estimatedSegments: segmentCount,
      segmentSize: targetSize,
      totalDuration: analysis.estimatedDuration,
      segmentDuration: analysis.estimatedDuration / segmentCount,
      method: this.isSmartSplitSupported(analysis.format) ? 'smart' : 'simple'
    };
  }
}