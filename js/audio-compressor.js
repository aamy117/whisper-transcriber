/**
 * 音訊壓縮模組
 * 使用 Web Audio API 實現客戶端音訊壓縮
 * 針對語音優化，在保持可理解度的同時減小檔案大小
 */

import { notify } from './notification.js';

export class AudioCompressor {
  constructor() {
    this.audioContext = null;
    this.targetFileSize = 24 * 1024 * 1024; // 目標大小：24MB (留 1MB 餘量)
    
    // 語音優化的壓縮參數
    this.compressionProfiles = {
      light: {
        sampleRate: 22050,
        bitRate: 96,
        channels: 1,
        quality: 0.8,
        description: '輕度壓縮，品質優先'
      },
      moderate: {
        sampleRate: 16000,
        bitRate: 64,
        channels: 1,
        quality: 0.6,
        description: '中度壓縮，平衡品質與大小'
      },
      aggressive: {
        sampleRate: 8000,
        bitRate: 32,
        channels: 1,
        quality: 0.4,
        description: '高度壓縮，大小優先'
      }
    };
  }
  
  /**
   * 壓縮音訊檔案
   */
  async compressAudioFile(file, options = {}) {
    const {
      targetSize = this.targetFileSize,
      profile = 'auto',
      onProgress = null
    } = options;
    
    try {
      // 初始化 Audio Context
      this.initAudioContext();
      
      // 讀取音訊檔案
      notify.info('正在讀取音訊檔案...');
      const arrayBuffer = await this.readFileAsArrayBuffer(file);
      
      // 解碼音訊
      notify.info('正在解碼音訊...');
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // 選擇壓縮配置
      const compressionProfile = this.selectCompressionProfile(file.size, targetSize, profile);
      notify.info(`使用${compressionProfile.description}`);
      
      // 執行壓縮
      const compressedBuffer = await this.processAudio(audioBuffer, compressionProfile, onProgress);
      
      // 編碼為檔案（使用 WAV 格式）
      const compressedBlob = await this.encodeAudioBuffer(compressedBuffer, 'audio/wav', compressionProfile);
      
      // 檢查壓縮結果
      if (compressedBlob.size > targetSize) {
        // 如果還是太大，嘗試更激進的壓縮
        notify.warning('檔案仍然過大，嘗試更高壓縮率...');
        return await this.compressWithFallback(audioBuffer, targetSize, onProgress);
      }
      
      // 建立檔案物件
      const compressedFile = new File(
        [compressedBlob],
        file.name.replace(/\.[^/.]+$/, '_compressed.wav'),
        { type: 'audio/wav' }
      );
      
      return {
        success: true,
        file: compressedFile,
        originalSize: file.size,
        compressedSize: compressedBlob.size,
        compressionRatio: (compressedBlob.size / file.size),
        profile: compressionProfile,
        duration: audioBuffer.duration
      };
      
    } catch (error) {
      console.error('音訊壓縮失敗:', error);
      throw new Error(`音訊壓縮失敗: ${error.message}`);
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
   * 選擇壓縮配置
   */
  selectCompressionProfile(originalSize, targetSize, profile) {
    if (profile !== 'auto' && this.compressionProfiles[profile]) {
      return this.compressionProfiles[profile];
    }
    
    // 自動選擇基於壓縮比
    const requiredRatio = targetSize / originalSize;
    
    if (requiredRatio > 0.7) {
      return this.compressionProfiles.light;
    } else if (requiredRatio > 0.3) {
      return this.compressionProfiles.moderate;
    } else {
      return this.compressionProfiles.aggressive;
    }
  }
  
  /**
   * 處理音訊（重採樣、降噪、單聲道轉換）
   */
  async processAudio(audioBuffer, profile, onProgress) {
    const steps = [
      { name: '轉換為單聲道', weight: 0.2 },
      { name: '重新採樣', weight: 0.5 },
      { name: '應用語音優化', weight: 0.3 }
    ];
    
    let currentProgress = 0;
    
    // Step 1: 轉換為單聲道
    if (onProgress) {
      onProgress({ stage: steps[0].name, percentage: currentProgress });
    }
    
    const monoBuffer = this.convertToMono(audioBuffer);
    currentProgress += steps[0].weight * 100;
    
    // Step 2: 重新採樣
    if (onProgress) {
      onProgress({ stage: steps[1].name, percentage: currentProgress });
    }
    
    const resampledBuffer = await this.resample(monoBuffer, profile.sampleRate);
    currentProgress += steps[1].weight * 100;
    
    // Step 3: 應用語音優化
    if (onProgress) {
      onProgress({ stage: steps[2].name, percentage: currentProgress });
    }
    
    const optimizedBuffer = this.applyVoiceOptimization(resampledBuffer, profile);
    currentProgress += steps[2].weight * 100;
    
    if (onProgress) {
      onProgress({ stage: '完成', percentage: 100 });
    }
    
    return optimizedBuffer;
  }
  
  /**
   * 轉換為單聲道
   */
  convertToMono(audioBuffer) {
    if (audioBuffer.numberOfChannels === 1) {
      return audioBuffer;
    }
    
    const monoBuffer = this.audioContext.createBuffer(
      1,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    
    const monoData = monoBuffer.getChannelData(0);
    
    // 混合所有聲道
    for (let i = 0; i < audioBuffer.length; i++) {
      let sum = 0;
      for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
        sum += audioBuffer.getChannelData(channel)[i];
      }
      monoData[i] = sum / audioBuffer.numberOfChannels;
    }
    
    return monoBuffer;
  }
  
  /**
   * 重新採樣
   */
  async resample(audioBuffer, targetSampleRate) {
    if (audioBuffer.sampleRate === targetSampleRate) {
      return audioBuffer;
    }
    
    // 使用 OfflineAudioContext 進行高品質重採樣
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.duration * targetSampleRate,
      targetSampleRate
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start();
    
    return await offlineContext.startRendering();
  }
  
  /**
   * 應用語音優化
   */
  applyVoiceOptimization(audioBuffer, profile) {
    // 建立離線音訊上下文
    const offlineContext = new OfflineAudioContext(
      audioBuffer.numberOfChannels,
      audioBuffer.length,
      audioBuffer.sampleRate
    );
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    
    // 高通濾波器（移除低頻噪音）
    const highpass = offlineContext.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80; // 80Hz 以下對語音不重要
    
    // 低通濾波器（移除高頻噪音）
    const lowpass = offlineContext.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = Math.min(3400, audioBuffer.sampleRate / 2 - 100); // 語音範圍
    
    // 動態壓縮（提高語音清晰度）
    const compressor = offlineContext.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;
    
    // 連接音訊節點
    source.connect(highpass);
    highpass.connect(lowpass);
    lowpass.connect(compressor);
    compressor.connect(offlineContext.destination);
    
    source.start();
    
    return offlineContext.startRendering();
  }
  
  /**
   * 編碼音訊緩衝
   */
  async encodeAudioBuffer(audioBuffer, mimeType, profile) {
    // 直接使用 WAV 格式
    // WAV 是無損格式，瀏覽器支援最好
    // 壓縮主要通過降低取樣率和轉換為單聲道來實現
    return await this.audioBufferToWav(audioBuffer);
  }
  
  /**
   * AudioBuffer 轉 WAV
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
   * 使用更激進的壓縮作為後備方案
   */
  async compressWithFallback(audioBuffer, targetSize, onProgress) {
    // 使用最激進的設定
    const aggressiveProfile = {
      sampleRate: 8000,
      bitRate: 24,
      channels: 1,
      quality: 0.3,
      description: '極限壓縮'
    };
    
    const compressedBuffer = await this.processAudio(audioBuffer, aggressiveProfile, onProgress);
    const compressedBlob = await this.encodeAudioBuffer(compressedBuffer, 'audio/wav', aggressiveProfile);
    
    const compressedFile = new File(
      [compressedBlob],
      'compressed_extreme.wav',
      { type: 'audio/wav' }
    );
    
    return {
      success: true,
      file: compressedFile,
      originalSize: audioBuffer.length * 2, // 估算
      compressedSize: compressedBlob.size,
      compressionRatio: 0.1, // 估算
      profile: aggressiveProfile,
      duration: audioBuffer.duration,
      warning: '使用極限壓縮，音質可能明顯下降'
    };
  }
  
  /**
   * 估算壓縮後的檔案大小
   */
  estimateCompressedSize(originalSize, profile) {
    // 基於經驗公式估算
    const sampleRateRatio = profile.sampleRate / 44100;
    const channelRatio = profile.channels / 2;
    const bitRateRatio = profile.bitRate / 128;
    
    return originalSize * sampleRateRatio * channelRatio * bitRateRatio;
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
export const audioCompressor = new AudioCompressor();