/**
 * 音訊格式策略基類
 * 
 * 定義音訊格式處理的通用介面
 * 所有格式特定的解析器都應該繼承此類
 */

export class AudioFormatStrategy {
  constructor(format) {
    this.format = format;
  }
  
  /**
   * 驗證檔案是否為此格式
   * @param {DataView} dataView - 檔案頭部數據
   * @returns {boolean}
   */
  validate(dataView) {
    throw new Error('子類必須實現 validate 方法');
  }
  
  /**
   * 解析檔案元數據
   * @param {File} file - 音訊檔案
   * @param {DataView} dataView - 檔案頭部數據
   * @returns {Promise<Object>} 元數據物件
   */
  async parseMetadata(file, dataView) {
    throw new Error('子類必須實現 parseMetadata 方法');
  }
  
  /**
   * 尋找框架邊界
   * @param {ArrayBuffer} buffer - 數據緩衝區
   * @param {number} targetPosition - 目標位置
   * @param {Object} options - 選項
   * @returns {number} 最近的框架邊界位置
   */
  findFrameBoundary(buffer, targetPosition, options = {}) {
    throw new Error('子類必須實現 findFrameBoundary 方法');
  }
  
  /**
   * 計算框架大小
   * @param {Object} metadata - 音訊元數據
   * @returns {number} 框架大小（bytes）
   */
  getFrameSize(metadata) {
    throw new Error('子類必須實現 getFrameSize 方法');
  }
  
  /**
   * 提取時間資訊
   * @param {number} bytePosition - 位元組位置
   * @param {Object} metadata - 音訊元數據
   * @returns {number} 時間（秒）
   */
  getTimeFromPosition(bytePosition, metadata) {
    if (metadata.bitrate > 0) {
      return bytePosition * 8 / metadata.bitrate;
    }
    return 0;
  }
  
  /**
   * 計算位元組位置
   * @param {number} time - 時間（秒）
   * @param {Object} metadata - 音訊元數據
   * @returns {number} 位元組位置
   */
  getPositionFromTime(time, metadata) {
    if (metadata.bitrate > 0) {
      return Math.floor(time * metadata.bitrate / 8);
    }
    return 0;
  }
  
  /**
   * 建立分段
   * @param {File} file - 原始檔案
   * @param {number} start - 開始位置
   * @param {number} end - 結束位置
   * @param {Object} metadata - 音訊元數據
   * @returns {Promise<Blob>} 分段檔案
   */
  async createSegment(file, start, end, metadata) {
    // 預設實現：直接切片
    return file.slice(start, end);
  }
  
  /**
   * 解析錯誤恢復
   * @param {Error} error - 錯誤物件
   * @param {File} file - 音訊檔案
   * @returns {Object} 基本元數據
   */
  handleParseError(error, file) {
    console.warn(`${this.format} 解析失敗:`, error);
    return {
      format: this.format,
      error: error.message,
      fallback: true
    };
  }
}