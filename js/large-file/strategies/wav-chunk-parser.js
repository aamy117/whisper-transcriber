/**
 * WAV Chunk 解析器
 * 
 * 負責解析 WAV 檔案格式，包括：
 * - RIFF 頭部解析
 * - fmt chunk 解析
 * - data chunk 定位
 * - 其他 chunks 處理（LIST, fact 等）
 */

import { AudioFormatStrategy } from './audio-format-strategy.js';

export class WAVChunkParser extends AudioFormatStrategy {
  constructor() {
    super('wav');
    
    // WAV 格式編碼
    this.audioFormats = {
      1: 'PCM',
      3: 'IEEE Float',
      6: 'A-law',
      7: 'μ-law',
      0xFFFE: 'Extensible'
    };
  }
  
  /**
   * 驗證檔案是否為 WAV 格式
   */
  validate(dataView) {
    if (dataView.byteLength < 12) return false;
    
    // 檢查 'RIFF' 標記
    const riff = String.fromCharCode(
      dataView.getUint8(0),
      dataView.getUint8(1),
      dataView.getUint8(2),
      dataView.getUint8(3)
    );
    
    // 檢查 'WAVE' 標記
    const wave = String.fromCharCode(
      dataView.getUint8(8),
      dataView.getUint8(9),
      dataView.getUint8(10),
      dataView.getUint8(11)
    );
    
    return riff === 'RIFF' && wave === 'WAVE';
  }
  
  /**
   * 解析 WAV 元數據
   */
  async parseMetadata(file, dataView) {
    try {
      const metadata = {
        format: 'wav',
        chunks: [],
        dataChunkOffset: 0,
        dataChunkSize: 0
      };
      
      // 解析 RIFF 頭部
      const riffSize = dataView.getUint32(4, true);
      metadata.riffSize = riffSize;
      
      // 解析所有 chunks
      let offset = 12; // 跳過 'RIFF' + size + 'WAVE'
      
      while (offset < dataView.byteLength - 8 && offset < 1024 * 1024) { // 限制搜尋範圍
        const chunk = await this.parseChunk(file, offset);
        if (!chunk) break;
        
        metadata.chunks.push(chunk);
        
        // 處理特定的 chunks
        switch (chunk.id) {
          case 'fmt ':
            Object.assign(metadata, this.parseFmtChunk(chunk.data));
            break;
            
          case 'data':
            metadata.dataChunkOffset = chunk.offset + 8; // 跳過 chunk id 和 size
            metadata.dataChunkSize = chunk.size;
            break;
            
          case 'fact':
            metadata.factChunk = this.parseFactChunk(chunk.data);
            break;
            
          case 'LIST':
            metadata.listInfo = this.parseListChunk(chunk.data);
            break;
        }
        
        // 移動到下一個 chunk
        offset = chunk.offset + 8 + chunk.size;
        
        // 確保偶數對齊
        if (chunk.size % 2 !== 0) offset++;
      }
      
      // 計算音訊時長
      if (metadata.sampleRate && metadata.channels && metadata.bitsPerSample) {
        const bytesPerSecond = metadata.sampleRate * metadata.channels * (metadata.bitsPerSample / 8);
        metadata.duration = metadata.dataChunkSize / bytesPerSecond;
        metadata.estimatedDuration = Math.floor(metadata.duration);
        metadata.bitrate = bytesPerSecond * 8;
      }
      
      return metadata;
      
    } catch (error) {
      return this.handleParseError(error, file);
    }
  }
  
  /**
   * 解析單個 chunk
   */
  async parseChunk(file, offset) {
    const headerSize = 8;
    if (offset + headerSize > file.size) return null;
    
    // 讀取 chunk 頭部
    const headerBuffer = await this.readFileSlice(file, offset, offset + headerSize);
    const headerView = new DataView(headerBuffer);
    
    const id = String.fromCharCode(
      headerView.getUint8(0),
      headerView.getUint8(1),
      headerView.getUint8(2),
      headerView.getUint8(3)
    );
    
    const size = headerView.getUint32(4, true);
    
    // 讀取 chunk 數據（限制大小以避免記憶體問題）
    const dataSize = Math.min(size, 1024); // 最多讀取 1KB
    let data = null;
    
    if (dataSize > 0 && offset + headerSize + dataSize <= file.size) {
      const dataBuffer = await this.readFileSlice(
        file, 
        offset + headerSize, 
        offset + headerSize + dataSize
      );
      data = new DataView(dataBuffer);
    }
    
    return {
      id,
      size,
      offset,
      data
    };
  }
  
  /**
   * 解析 fmt chunk
   */
  parseFmtChunk(dataView) {
    if (!dataView || dataView.byteLength < 16) {
      throw new Error('無效的 fmt chunk');
    }
    
    const audioFormat = dataView.getUint16(0, true);
    const channels = dataView.getUint16(2, true);
    const sampleRate = dataView.getUint32(4, true);
    const byteRate = dataView.getUint32(8, true);
    const blockAlign = dataView.getUint16(12, true);
    const bitsPerSample = dataView.getUint16(14, true);
    
    const result = {
      audioFormat,
      audioFormatName: this.audioFormats[audioFormat] || `Unknown (${audioFormat})`,
      channels,
      sampleRate,
      byteRate,
      blockAlign,
      bitsPerSample,
      codec: audioFormat === 1 ? 'pcm' : 'unknown'
    };
    
    // 擴展格式
    if (dataView.byteLength >= 18) {
      const cbSize = dataView.getUint16(16, true);
      result.cbSize = cbSize;
      
      // 如果是擴展格式，解析額外資訊
      if (audioFormat === 0xFFFE && dataView.byteLength >= 40) {
        result.validBitsPerSample = dataView.getUint16(18, true);
        result.channelMask = dataView.getUint32(20, true);
        // SubFormat GUID (16 bytes)
      }
    }
    
    return result;
  }
  
  /**
   * 解析 fact chunk
   */
  parseFactChunk(dataView) {
    if (!dataView || dataView.byteLength < 4) return null;
    
    return {
      sampleLength: dataView.getUint32(0, true)
    };
  }
  
  /**
   * 解析 LIST chunk
   */
  parseListChunk(dataView) {
    if (!dataView || dataView.byteLength < 4) return null;
    
    const listType = String.fromCharCode(
      dataView.getUint8(0),
      dataView.getUint8(1),
      dataView.getUint8(2),
      dataView.getUint8(3)
    );
    
    const info = { type: listType };
    
    if (listType === 'INFO') {
      // 解析 INFO 子 chunks
      let offset = 4;
      while (offset < dataView.byteLength - 8) {
        const subChunkId = String.fromCharCode(
          dataView.getUint8(offset),
          dataView.getUint8(offset + 1),
          dataView.getUint8(offset + 2),
          dataView.getUint8(offset + 3)
        );
        
        const subChunkSize = dataView.getUint32(offset + 4, true);
        
        // 讀取字串數據
        if (subChunkSize > 0 && offset + 8 + subChunkSize <= dataView.byteLength) {
          const bytes = [];
          for (let i = 0; i < subChunkSize - 1; i++) { // -1 去掉結尾的 null
            const byte = dataView.getUint8(offset + 8 + i);
            if (byte === 0) break;
            bytes.push(byte);
          }
          info[subChunkId] = new TextDecoder().decode(new Uint8Array(bytes));
        }
        
        offset += 8 + subChunkSize;
        if (subChunkSize % 2 !== 0) offset++; // 對齊
      }
    }
    
    return info;
  }
  
  /**
   * 尋找框架邊界（WAV 使用樣本邊界）
   */
  findFrameBoundary(buffer, targetPosition, options = {}) {
    const metadata = options.metadata || {};
    const blockAlign = metadata.blockAlign || 1;
    
    // 對齊到最近的樣本邊界
    return Math.floor(targetPosition / blockAlign) * blockAlign;
  }
  
  /**
   * 計算框架大小
   */
  getFrameSize(metadata) {
    return metadata.blockAlign || (metadata.channels * metadata.bitsPerSample / 8);
  }
  
  /**
   * 建立 WAV 分段
   */
  async createSegment(file, start, end, metadata) {
    // 如果是從數據開始處分割，需要建立新的 WAV 頭部
    if (start < metadata.dataChunkOffset) {
      // 直接使用原始檔案（包含頭部）
      return file.slice(start, end);
    }
    
    // 建立新的 WAV 檔案
    const dataSize = end - start;
    const header = this.createWAVHeader(metadata, dataSize);
    
    // 讀取音訊數據
    const audioData = await this.readFileSlice(file, start, end);
    
    // 組合頭部和數據
    const blob = new Blob([header, audioData], { type: 'audio/wav' });
    return blob;
  }
  
  /**
   * 建立 WAV 頭部
   */
  createWAVHeader(metadata, dataSize) {
    const headerSize = 44;
    const buffer = new ArrayBuffer(headerSize);
    const view = new DataView(buffer);
    
    // RIFF chunk
    view.setUint8(0, 0x52); // 'R'
    view.setUint8(1, 0x49); // 'I'
    view.setUint8(2, 0x46); // 'F'
    view.setUint8(3, 0x46); // 'F'
    view.setUint32(4, 36 + dataSize, true); // file size - 8
    
    // WAVE
    view.setUint8(8, 0x57);  // 'W'
    view.setUint8(9, 0x41);  // 'A'
    view.setUint8(10, 0x56); // 'V'
    view.setUint8(11, 0x45); // 'E'
    
    // fmt chunk
    view.setUint8(12, 0x66); // 'f'
    view.setUint8(13, 0x6D); // 'm'
    view.setUint8(14, 0x74); // 't'
    view.setUint8(15, 0x20); // ' '
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, metadata.audioFormat || 1, true); // audio format (PCM)
    view.setUint16(22, metadata.channels || 2, true);
    view.setUint32(24, metadata.sampleRate || 44100, true);
    view.setUint32(28, metadata.byteRate || 176400, true);
    view.setUint16(32, metadata.blockAlign || 4, true);
    view.setUint16(34, metadata.bitsPerSample || 16, true);
    
    // data chunk
    view.setUint8(36, 0x64); // 'd'
    view.setUint8(37, 0x61); // 'a'
    view.setUint8(38, 0x74); // 't'
    view.setUint8(39, 0x61); // 'a'
    view.setUint32(40, dataSize, true);
    
    return buffer;
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
   * 計算時間位置
   */
  getTimeFromPosition(bytePosition, metadata) {
    if (!metadata.dataChunkOffset || bytePosition < metadata.dataChunkOffset) {
      return 0;
    }
    
    const dataPosition = bytePosition - metadata.dataChunkOffset;
    const bytesPerSecond = metadata.sampleRate * metadata.channels * (metadata.bitsPerSample / 8);
    
    return dataPosition / bytesPerSecond;
  }
  
  /**
   * 計算位元組位置
   */
  getPositionFromTime(time, metadata) {
    const bytesPerSecond = metadata.sampleRate * metadata.channels * (metadata.bitsPerSample / 8);
    const dataPosition = Math.floor(time * bytesPerSecond);
    
    // 對齊到 block boundary
    const alignedPosition = Math.floor(dataPosition / metadata.blockAlign) * metadata.blockAlign;
    
    return metadata.dataChunkOffset + alignedPosition;
  }
}