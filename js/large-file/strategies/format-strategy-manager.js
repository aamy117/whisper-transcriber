/**
 * 音訊格式策略管理器
 * 
 * 統一管理所有音訊格式解析器
 * 提供格式自動檢測和策略選擇
 */

import { MP3FrameParser } from './mp3-frame-parser.js';
import { WAVChunkParser } from './wav-chunk-parser.js';

export class FormatStrategyManager {
  constructor() {
    // 註冊所有支援的格式解析器
    this.strategies = new Map([
      ['mp3', new MP3FrameParser()],
      ['wav', new WAVChunkParser()]
    ]);
    
    // 格式檢測優先順序
    this.detectionOrder = ['wav', 'mp3'];
  }
  
  /**
   * 獲取格式策略
   * @param {string} format - 格式名稱
   * @returns {AudioFormatStrategy|null}
   */
  getStrategy(format) {
    return this.strategies.get(format.toLowerCase());
  }
  
  /**
   * 自動檢測格式並返回對應策略
   * @param {File} file - 音訊檔案
   * @param {DataView} dataView - 檔案頭部數據
   * @returns {Promise<AudioFormatStrategy|null>}
   */
  async detectStrategy(file, dataView) {
    // 按優先順序檢測格式
    for (const format of this.detectionOrder) {
      const strategy = this.strategies.get(format);
      if (strategy && strategy.validate(dataView)) {
        return strategy;
      }
    }
    
    // 如果無法從內容檢測，嘗試從檔案名檢測
    return this.detectFromFileName(file.name);
  }
  
  /**
   * 從檔案名檢測格式
   * @param {string} fileName - 檔案名
   * @returns {AudioFormatStrategy|null}
   */
  detectFromFileName(fileName) {
    if (!fileName) return null;
    
    const ext = fileName.split('.').pop().toLowerCase();
    return this.strategies.get(ext);
  }
  
  /**
   * 解析音訊檔案元數據
   * @param {File} file - 音訊檔案
   * @returns {Promise<Object>}
   */
  async parseFile(file) {
    try {
      // 讀取檔案頭部
      const headerSize = Math.min(65536, file.size);
      const headerBuffer = await this.readFileSlice(file, 0, headerSize);
      const dataView = new DataView(headerBuffer);
      
      // 檢測格式並獲取策略
      const strategy = await this.detectStrategy(file, dataView);
      if (!strategy) {
        throw new Error(`不支援的音訊格式: ${file.name}`);
      }
      
      // 使用策略解析元數據
      const metadata = await strategy.parseMetadata(file, dataView);
      
      // 添加策略資訊
      metadata.strategy = strategy.format;
      metadata.parser = strategy.constructor.name;
      
      return metadata;
      
    } catch (error) {
      console.error('音訊檔案解析失敗:', error);
      throw error;
    }
  }
  
  /**
   * 尋找最佳分割點
   * @param {File} file - 音訊檔案
   * @param {number} targetPosition - 目標位置
   * @param {Object} metadata - 音訊元數據
   * @returns {Promise<number>}
   */
  async findBestSplitPoint(file, targetPosition, metadata) {
    const strategy = this.getStrategy(metadata.format);
    if (!strategy) {
      return targetPosition;
    }
    
    // 讀取目標位置附近的數據
    const searchRange = 1024 * 1024; // 1MB 搜尋範圍
    const start = Math.max(0, targetPosition - searchRange / 2);
    const end = Math.min(file.size, targetPosition + searchRange / 2);
    
    const buffer = await this.readFileSlice(file, start, end);
    const relativePosition = targetPosition - start;
    
    // 使用格式特定的策略尋找邊界
    const bestRelativePosition = strategy.findFrameBoundary(buffer, relativePosition, {
      searchRange: searchRange / 2,
      metadata
    });
    
    return start + bestRelativePosition;
  }
  
  /**
   * 建立音訊分段
   * @param {File} file - 原始檔案
   * @param {number} start - 開始位置
   * @param {number} end - 結束位置
   * @param {Object} metadata - 音訊元數據
   * @returns {Promise<Blob>}
   */
  async createSegment(file, start, end, metadata) {
    const strategy = this.getStrategy(metadata.format);
    if (!strategy) {
      // 預設：直接切片
      return file.slice(start, end);
    }
    
    return await strategy.createSegment(file, start, end, metadata);
  }
  
  /**
   * 計算時間位置
   * @param {number} bytePosition - 位元組位置
   * @param {Object} metadata - 音訊元數據
   * @returns {number} 時間（秒）
   */
  getTimeFromPosition(bytePosition, metadata) {
    const strategy = this.getStrategy(metadata.format);
    if (!strategy) {
      // 預設計算
      if (metadata.bitrate > 0) {
        return bytePosition * 8 / metadata.bitrate;
      }
      return 0;
    }
    
    return strategy.getTimeFromPosition(bytePosition, metadata);
  }
  
  /**
   * 計算位元組位置
   * @param {number} time - 時間（秒）
   * @param {Object} metadata - 音訊元數據
   * @returns {number} 位元組位置
   */
  getPositionFromTime(time, metadata) {
    const strategy = this.getStrategy(metadata.format);
    if (!strategy) {
      // 預設計算
      if (metadata.bitrate > 0) {
        return Math.floor(time * metadata.bitrate / 8);
      }
      return 0;
    }
    
    return strategy.getPositionFromTime(time, metadata);
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
   * 獲取支援的格式列表
   */
  getSupportedFormats() {
    return Array.from(this.strategies.keys());
  }
  
  /**
   * 註冊新的格式策略
   * @param {string} format - 格式名稱
   * @param {AudioFormatStrategy} strategy - 策略實例
   */
  registerStrategy(format, strategy) {
    this.strategies.set(format.toLowerCase(), strategy);
    
    // 更新檢測順序（新格式優先）
    if (!this.detectionOrder.includes(format)) {
      this.detectionOrder.unshift(format);
    }
  }
}

// 建立全域實例
export const formatStrategyManager = new FormatStrategyManager();