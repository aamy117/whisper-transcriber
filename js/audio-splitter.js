// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

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
   * @param {File} file - 要分割的音訊檔案
   * @param {Object} options - 選項
   * @param {number} options.maxSize - 每個分段的最大大小
   * @param {number} options.overlap - 重疊時間（秒）
   * @param {Function} options.onProgress - 進度回調
   * @param {CancellationToken} options.cancellationToken - 取消令牌
   */
  async splitAudioFile(file, options = {}) {
    const {
      maxSize = this.maxSegmentSize,
      overlap = this.overlapDuration,
      onProgress = null,
      cancellationToken = null
    } = options;

    try {
      // 初始化 Audio Context
      this.initAudioContext();

      // 讀取音訊檔案
      // 檢查是否已取消
      if (cancellationToken) {
        cancellationToken.throwIfCancelled();
      }
      
      const arrayBuffer = await this.readFileAsArrayBuffer(file);

      // 解碼音訊
      notify.info('正在解碼音訊...');
      
      // 檢查是否已取消
      if (cancellationToken) {
        cancellationToken.throwIfCancelled();
      }
      
      let audioBuffer;

      try {
        // 嘗試解碼音訊（直接使用原始 ArrayBuffer，不創建副本）
        audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      } catch (decodeError) {
        if (typeof DEBUG !== 'undefined' && DEBUG) console.error('音訊解碼失敗:', decodeError);

        // 如果解碼失敗，嘗試其他方法
        if (decodeError.name === 'EncodingError' || decodeError.message.includes('Unable to decode')) {
          notify.warning('音訊格式可能不受支援，嘗試轉換格式...');

          // 嘗試使用替代方法處理
          return await this.fallbackSplitMethod(file, maxSize, overlap, onProgress);
        }

        throw decodeError;
      }

      // 分析音訊並找到分割點
      const splitPoints = await this.findSplitPoints(audioBuffer, file.size, maxSize);

      // 根據分割點切割音訊
      const segments = await this.createSegments(audioBuffer, splitPoints, file, overlap, onProgress, cancellationToken);

      return {
        success: true,
        segments: segments,
        originalDuration: audioBuffer.duration,
        totalSegments: segments.length
      };

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('音訊分割失敗:', error);

      // 提供更詳細的錯誤訊息
      if (error.name === 'EncodingError') {
        throw new Error(`音訊格式不支援: ${file.type || '未知格式'}。請嘗試將檔案轉換為 MP3 或 WAV 格式。`);
      }

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
    let maxDurationPerSegment = maxSize / bytesPerSecond;

    // 限制每段最長時間為 10 分鐘（600秒），避免記憶體問題
    const MAX_SEGMENT_DURATION = 600; // 10 分鐘
    if (maxDurationPerSegment > MAX_SEGMENT_DURATION) {
      maxDurationPerSegment = MAX_SEGMENT_DURATION;
      DEBUG && console.log(`限制分段時長為 ${MAX_SEGMENT_DURATION} 秒以避免記憶體問題`);
    }

    const splitPoints = [];
    let currentTime = 0;

    // 如果使用靜音檢測（僅用於較短的音訊）
    const useSilenceDetection = duration < 1800; // 小於30分鐘使用靜音檢測

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
   * @param {AudioBuffer} audioBuffer - 音訊緩衝區
   * @param {Array} splitPoints - 分割點
   * @param {File} originalFile - 原始檔案
   * @param {number} overlap - 重疊時間
   * @param {Function} onProgress - 進度回調
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async createSegments(audioBuffer, splitPoints, originalFile, overlap, onProgress, cancellationToken) {
    const segments = [];
    const totalSegments = splitPoints.length;

    for (let i = 0; i < splitPoints.length; i++) {
      // 檢查是否已取消
      if (cancellationToken) {
        cancellationToken.throwIfCancelled();
      }
      const point = splitPoints[i];

      // 計算實際的開始和結束時間（包含重疊）
      const startTime = i > 0 ? Math.max(0, point.start - overlap / 2) : point.start;
      const endTime = i < splitPoints.length - 1 ? point.end + overlap / 2 : point.end;

      // 提取片段
      const segmentBuffer = this.extractSegment(audioBuffer, startTime, endTime);

      // 編碼為檔案
      const segmentBlob = await this.encodeAudioBuffer(segmentBuffer, originalFile.type);

      // 建立檔案物件（使用 WAV 格式）
      const segmentFile = new File(
        [segmentBlob],
        `${originalFile.name.replace(/\.[^/.]+$/, '')}_segment_${i + 1}.wav`,
        { type: 'audio/wav' }
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
    try {
      // 檢查音訊緩衝大小
      const totalSamples = audioBuffer.length * audioBuffer.numberOfChannels;
      const estimatedSize = totalSamples * 2; // 16-bit samples

      // 如果預估大小超過 100MB，警告並使用較低品質
      if (estimatedSize > 100 * 1024 * 1024) {
        DEBUG && console.warn(`音訊段落過大 (約 ${Math.round(estimatedSize / 1024 / 1024)}MB)，可能導致記憶體問題`);

        // 嘗試降低取樣率
        if (audioBuffer.sampleRate > 22050) {
          DEBUG && console.log('嘗試降低取樣率以減少記憶體使用');
          return await this.encodeWithLowerSampleRate(audioBuffer);
        }
      }

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

      // 始終使用 WAV 格式，因為瀏覽器對其他格式的支援不一致
      // WAV 格式雖然較大，但相容性最好
      return this.audioBufferToWav(renderedBuffer);

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('編碼失敗，嘗試使用備用方法:', error);

      // 如果標準方法失敗，嘗試直接編碼
      return this.audioBufferToWav(audioBuffer);
    }
  }

  /**
   * 使用較低取樣率編碼
   */
  async encodeWithLowerSampleRate(audioBuffer) {
    const targetSampleRate = 22050;
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      Math.floor(audioBuffer.length * targetSampleRate / audioBuffer.sampleRate),
      targetSampleRate
    );

    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();

    const renderedBuffer = await offlineContext.startRendering();
    return this.audioBufferToWav(renderedBuffer);
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

    // 計算總樣本數
    const totalSamples = audioBuffer.length * numberOfChannels;
    const dataSize = totalSamples * bytesPerSample;

    // 直接建立正確大小的 ArrayBuffer，避免使用陣列
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    // WAV 檔頭
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
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
    view.setUint32(40, dataSize, true);

    // 直接寫入音訊資料到 ArrayBuffer，避免中間陣列
    let offset = 44;
    for (let i = 0; i < audioBuffer.length; i++) {
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const sample = audioBuffer.getChannelData(channel)[i];
        const value = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
        view.setInt16(offset, value, true);
        offset += 2;
      }
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * 備用分割方法（當音訊解碼失敗時使用）
   */
  async fallbackSplitMethod(file, maxSize, overlap, onProgress) {
    notify.info('使用備用方法分割音訊...');

    const fileSize = file.size;
    const segmentSize = maxSize * 0.9; // 留 10% 緩衝
    const totalSegments = Math.ceil(fileSize / segmentSize);
    const segments = [];

    for (let i = 0; i < totalSegments; i++) {
      const start = i * segmentSize;
      const end = Math.min(start + segmentSize, fileSize);

      // 創建分段檔案
      const segmentBlob = file.slice(start, end, file.type);
      const segmentFile = new File([segmentBlob], `segment_${i + 1}_${file.name}`, {
        type: file.type
      });

      segments.push({
        file: segmentFile,
        index: i,
        startTime: null, // 無法確定精確時間
        endTime: null,
        startByte: start,
        endByte: end
      });

      // 更新進度
      if (onProgress) {
        onProgress({
          stage: `分割段落 ${i + 1}/${totalSegments}`,
          percentage: ((i + 1) / totalSegments) * 100,
          current: i + 1,
          total: totalSegments
        });
      }
    }

    notify.warning('由於音訊格式限制，使用了簡單的檔案分割方式。轉譯結果可能需要手動調整時間軸。');

    return {
      success: true,
      segments: segments,
      originalDuration: null, // 無法確定
      totalSegments: segments.length,
      warning: '使用備用分割方法，無法保證精確的時間對齊'
    };
  }

  /**
   * 嘗試轉換音訊格式
   */
  async tryConvertAudio(file) {
    try {
      // 創建一個新的 AudioContext 嘗試不同的採樣率
      const tempContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 44100 // 標準採樣率
      });

      // 使用 FileReader 讀取檔案
      const arrayBuffer = await this.readFileAsArrayBuffer(file);

      // 嘗試使用 createMediaElementSource
      const audio = new Audio();
      const objectUrl = URL.createObjectURL(file);
      audio.src = objectUrl;

      // 等待 metadata 載入
      await new Promise((resolve, reject) => {
        audio.addEventListener('loadedmetadata', resolve);
        audio.addEventListener('error', reject);
      });

      // 清理
      URL.revokeObjectURL(objectUrl);
      tempContext.close();

      return audio.duration;

    } catch (error) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('音訊轉換失敗:', error);
      return null;
    }
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
