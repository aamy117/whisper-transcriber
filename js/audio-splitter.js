/**
 * 音訊分割模組
 * 使用 Web Audio API 實現客戶端音訊分割
 */

import { notify } from './notification.js';

export class AudioSplitter {
  constructor() {
    this.audioContext = null;
    this.maxSegmentSize = 20 * 1024 * 1024; // 20MB per segment
    this.overlapDuration = 5; // 5秒重疊，避免邊界遺漏
  }
  
  /**
   * 分割音訊檔案
   */
  async splitAudioFile(file, options = {}) {
    const {
      maxSize = this.maxSegmentSize,
      overlap = this.overlapDuration,
      onProgress = null
    } = options;
    
    try {
      // 初始化 Audio Context
      this.initAudioContext();
      
      // 讀取音訊檔案
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // 解碼音訊
      notify.info('正在解碼音訊...');
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // 分析音訊並找到分割點
      const splitPoints = await this.findSplitPoints(audioBuffer, file.size, maxSize);
      
      // 根據分割點切割音訊
      const segments = await this.createSegments(audioBuffer, splitPoints, file, overlap, onProgress);
      
      return {
        success: true,
        segments: segments,
        originalDuration: audioBuffer.duration,
        totalSegments: segments.length
      };
      
    } catch (error) {
      console.error('音訊分割失敗:', error);
      throw new Error(`音訊分割失敗: ${error.message}`);
    }
  }
  
  /**
   * 初始化 Audio Context
   */
  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
  }
  
  /**
   * 讀取檔案為 ArrayBuffer
   */
  readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(file);
    });
  }
  
  /**
   * 找到最佳分割點
   */
  async findSplitPoints(audioBuffer, fileSize, maxSize) {
    const duration = audioBuffer.duration;
    const bytesPerSecond = fileSize / duration;
    const maxDurationPerSegment = maxSize / bytesPerSecond;
    
    const splitPoints = [];
    let currentTime = 0;
    
    // 如果使用靜音檢測
    const useSilenceDetection = duration < 3600; // 小於1小時使用靜音檢測
    
    if (useSilenceDetection) {
      // 檢測靜音位置作為分割點
      const silencePoints = await this.detectSilence(audioBuffer);
      
      while (currentTime < duration) {
        const targetTime = currentTime + maxDurationPerSegment;
        
        // 找到最接近目標時間的靜音點
        const nearestSilence = this.findNearestSilence(silencePoints, targetTime, maxDurationPerSegment * 0.2);
        
        if (nearestSilence && nearestSilence > currentTime) {
          splitPoints.push({
            start: currentTime,
            end: nearestSilence,
            duration: nearestSilence - currentTime
          });
          currentTime = nearestSilence;
        } else {
          // 沒有找到合適的靜音點，使用固定時長
          const endTime = Math.min(targetTime, duration);
          splitPoints.push({
            start: currentTime,
            end: endTime,
            duration: endTime - currentTime
          });
          currentTime = endTime;
        }
      }
    } else {
      // 對於長音訊，使用固定時長分割
      while (currentTime < duration) {
        const endTime = Math.min(currentTime + maxDurationPerSegment, duration);
        splitPoints.push({
          start: currentTime,
          end: endTime,
          duration: endTime - currentTime
        });
        currentTime = endTime;
      }
    }
    
    return splitPoints;
  }
  
  /**
   * 檢測靜音位置
   */
  async detectSilence(audioBuffer, threshold = 0.01, minSilenceDuration = 0.5) {
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const minSilenceSamples = minSilenceDuration * sampleRate;
    
    const silencePoints = [];
    let silenceStart = null;
    let consecutiveSilentSamples = 0;
    
    // 使用滑動窗口檢測靜音
    const windowSize = Math.floor(sampleRate * 0.1); // 100ms窗口
    
    for (let i = 0; i < channelData.length; i += windowSize) {
      const windowEnd = Math.min(i + windowSize, channelData.length);
      let windowMax = 0;
      
      // 計算窗口內的最大振幅
      for (let j = i; j < windowEnd; j++) {
        windowMax = Math.max(windowMax, Math.abs(channelData[j]));
      }
      
      if (windowMax < threshold) {
        // 靜音
        if (silenceStart === null) {
          silenceStart = i / sampleRate;
        }
        consecutiveSilentSamples += windowSize;
      } else {
        // 非靜音
        if (silenceStart !== null && consecutiveSilentSamples >= minSilenceSamples) {
          const silenceEnd = i / sampleRate;
          const silenceCenter = (silenceStart + silenceEnd) / 2;
          silencePoints.push(silenceCenter);
        }
        silenceStart = null;
        consecutiveSilentSamples = 0;
      }
    }
    
    return silencePoints;
  }
  
  /**
   * 找到最接近目標時間的靜音點
   */
  findNearestSilence(silencePoints, targetTime, tolerance) {
    let nearest = null;
    let minDistance = Infinity;
    
    for (const point of silencePoints) {
      const distance = Math.abs(point - targetTime);
      if (distance < tolerance && distance < minDistance) {
        nearest = point;
        minDistance = distance;
      }
    }
    
    return nearest;
  }
  
  /**
   * 建立音訊片段
   */
  async createSegments(audioBuffer, splitPoints, originalFile, overlap, onProgress) {
    const segments = [];
    const totalSegments = splitPoints.length;
    
    for (let i = 0; i < splitPoints.length; i++) {
      const point = splitPoints[i];
      
      // 計算實際的開始和結束時間（包含重疊）
      const startTime = i > 0 ? Math.max(0, point.start - overlap / 2) : point.start;
      const endTime = i < splitPoints.length - 1 ? point.end + overlap / 2 : point.end;
      
      // 提取片段
      const segmentBuffer = this.extractSegment(audioBuffer, startTime, endTime);
      
      // 編碼為檔案
      const segmentBlob = await this.encodeAudioBuffer(segmentBuffer, originalFile.type);
      
      // 建立檔案物件
      const segmentFile = new File(
        [segmentBlob],
        `${originalFile.name.replace(/\.[^/.]+$/, '')}_segment_${i + 1}.${this.getFileExtension(originalFile.type)}`,
        { type: originalFile.type }
      );
      
      segments.push({
        file: segmentFile,
        index: i,
        startTime: point.start, // 原始時間（不含重疊）
        endTime: point.end,     // 原始時間（不含重疊）
        actualStartTime: startTime, // 實際時間（含重疊）
        actualEndTime: endTime,     // 實際時間（含重疊）
        duration: point.duration,
        size: segmentBlob.size
      });
      
      // 更新進度
      if (onProgress) {
        onProgress({
          current: i + 1,
          total: totalSegments,
          percentage: ((i + 1) / totalSegments) * 100
        });
      }
    }
    
    return segments;
  }
  
  /**
   * 提取音訊片段
   */
  extractSegment(audioBuffer, startTime, endTime) {
    const sampleRate = audioBuffer.sampleRate;
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.ceil(endTime * sampleRate);
    const length = endSample - startSample;
    
    // 建立新的音訊緩衝
    const segmentBuffer = this.audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      length,
      sampleRate
    );
    
    // 複製每個聲道的資料
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const sourceData = audioBuffer.getChannelData(channel);
      const targetData = segmentBuffer.getChannelData(channel);
      
      for (let i = 0; i < length; i++) {
        const sourceIndex = startSample + i;
        if (sourceIndex < sourceData.length) {
          targetData[i] = sourceData[sourceIndex];
        }
      }
    }
    
    return segmentBuffer;
  }
  
  /**
   * 編碼音訊緩衝為 Blob
   */
  async encodeAudioBuffer(audioBuffer, mimeType) {
    // 使用 OfflineAudioContext 進行渲染
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    const renderedBuffer = await offlineContext.startRendering();
    
    // 轉換為 WAV 格式（瀏覽器支援最好）
    if (mimeType.includes('wav') || !window.MediaRecorder) {
      return this.audioBufferToWav(renderedBuffer);
    }
    
    // 使用 MediaRecorder 編碼其他格式
    return await this.encodeWithMediaRecorder(renderedBuffer, mimeType);
  }
  
  /**
   * 將 AudioBuffer 轉換為 WAV
   */
  audioBufferToWav(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;
    
    const data = [];
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = audioBuffer.getChannelData(channel)[i];
        const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        data.push(value);
      }
    }
    
    const buffer = new ArrayBuffer(44 + data.length * bytesPerSample);
    const view = new DataView(buffer);
    
    // WAV 檔頭
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + data.length * bytesPerSample, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, data.length * bytesPerSample, true);
    
    // 寫入音訊資料
    let offset = 44;
    for (const sample of data) {
      view.setInt16(offset, sample, true);
      offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
  }
  
  /**
   * 使用 MediaRecorder 編碼
   */
  async encodeWithMediaRecorder(audioBuffer, mimeType) {
    // 建立 MediaStream
    const audioContext = new AudioContext();
    const source = audioContext.createBufferSource();
    const destination = audioContext.createMediaStreamDestination();
    
    source.buffer = audioBuffer;
    source.connect(destination);
    
    // 錄製
    const chunks = [];
    const recorder = new MediaRecorder(destination.stream, {
      mimeType: mimeType
    });
    
    return new Promise((resolve, reject) => {
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType });
        resolve(blob);
      };
      recorder.onerror = reject;
      
      recorder.start();
      source.start();
      
      // 等待錄製完成
      setTimeout(() => {
        recorder.stop();
        source.stop();
        audioContext.close();
      }, audioBuffer.duration * 1000 + 100);
    });
  }
  
  /**
   * 取得檔案副檔名
   */
  getFileExtension(mimeType) {
    const extensions = {
      'audio/wav': 'wav',
      'audio/mp3': 'mp3',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/webm': 'webm',
      'audio/flac': 'flac'
    };
    
    return extensions[mimeType] || 'wav';
  }
  
  /**
   * 清理資源
   */
  cleanup() {
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// 匯出單例
export const audioSplitter = new AudioSplitter();