/**
 * MP3 框架解析器
 * 
 * 負責解析 MP3 檔案格式，包括：
 * - ID3 標籤解析
 * - MPEG 框架解析
 * - VBR/CBR 檢測
 * - 精確的時間計算
 */

import { AudioFormatStrategy } from './audio-format-strategy.js';

export class MP3FrameParser extends AudioFormatStrategy {
  constructor() {
    super('mp3');
    
    // MPEG 版本
    this.mpegVersions = {
      0: 'MPEG 2.5',
      1: 'reserved',
      2: 'MPEG 2',
      3: 'MPEG 1'
    };
    
    // Layer
    this.layers = {
      0: 'reserved',
      1: 'Layer III',
      2: 'Layer II',
      3: 'Layer I'
    };
    
    // 比特率表 (kbps) - [版本][layer][index]
    this.bitrateTable = {
      // MPEG 1
      3: {
        1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // Layer 3
        2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],   // Layer 2
        3: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448]  // Layer 1
      },
      // MPEG 2
      2: {
        1: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],  // Layer 3
        2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],  // Layer 2
        3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256] // Layer 1
      },
      // MPEG 2.5
      0: {
        1: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],  // Layer 3
        2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],  // Layer 2
        3: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256] // Layer 1
      }
    };
    
    // 採樣率表 (Hz)
    this.sampleRateTable = {
      3: [44100, 48000, 32000], // MPEG 1
      2: [22050, 24000, 16000], // MPEG 2
      0: [11025, 12000, 8000]   // MPEG 2.5
    };
    
    // 每框架樣本數
    this.samplesPerFrame = {
      1: { // Layer 3
        3: 1152, // MPEG 1
        2: 576,  // MPEG 2
        0: 576   // MPEG 2.5
      },
      2: { // Layer 2
        3: 1152,
        2: 1152,
        0: 1152
      },
      3: { // Layer 1
        3: 384,
        2: 384,
        0: 384
      }
    };
  }
  
  /**
   * 驗證檔案是否為 MP3 格式
   */
  validate(dataView) {
    if (dataView.byteLength < 4) return false;
    
    // 檢查 ID3v2 標籤
    if (dataView.getUint8(0) === 0x49 && 
        dataView.getUint8(1) === 0x44 && 
        dataView.getUint8(2) === 0x33) {
      return true;
    }
    
    // 檢查 MPEG 同步字
    const sync = (dataView.getUint8(0) << 8) | dataView.getUint8(1);
    return (sync & 0xFFE0) === 0xFFE0;
  }
  
  /**
   * 解析 MP3 元數據
   */
  async parseMetadata(file, dataView) {
    try {
      let offset = 0;
      let id3Size = 0;
      const metadata = {
        format: 'mp3',
        id3: null,
        vbr: false,
        frames: []
      };
      
      // 解析 ID3v2 標籤
      if (this.hasID3v2(dataView)) {
        const id3Info = this.parseID3v2(dataView);
        metadata.id3 = id3Info;
        offset = id3Info.size + 10;
        id3Size = offset;
      }
      
      // 尋找第一個有效的 MPEG 框架
      const frameInfo = await this.findFirstFrame(file, offset);
      if (!frameInfo) {
        throw new Error('找不到有效的 MP3 框架');
      }
      
      // 解析框架頭部
      const header = this.parseFrameHeader(frameInfo.header);
      Object.assign(metadata, header);
      
      // 檢測 VBR
      const vbrInfo = await this.detectVBR(file, frameInfo.position + 4, header);
      if (vbrInfo) {
        metadata.vbr = true;
        metadata.vbrInfo = vbrInfo;
        
        // 如果是 VBR，使用 VBR 資訊計算時長
        if (vbrInfo.frames && header.sampleRate) {
          const samplesPerFrame = this.samplesPerFrame[header.layer]?.[header.version] || 1152;
          metadata.duration = (vbrInfo.frames * samplesPerFrame) / header.sampleRate;
        }
      }
      
      // 如果不是 VBR 或無法從 VBR 獲取時長，使用檔案大小估算
      if (!metadata.duration && metadata.bitrate > 0) {
        const audioSize = file.size - id3Size;
        metadata.duration = (audioSize * 8) / (metadata.bitrate * 1000);
      }
      
      metadata.estimatedDuration = Math.floor(metadata.duration || 0);
      
      return metadata;
      
    } catch (error) {
      return this.handleParseError(error, file);
    }
  }
  
  /**
   * 檢查是否有 ID3v2 標籤
   */
  hasID3v2(dataView) {
    return dataView.byteLength >= 3 &&
           dataView.getUint8(0) === 0x49 && // 'I'
           dataView.getUint8(1) === 0x44 && // 'D'
           dataView.getUint8(2) === 0x33;   // '3'
  }
  
  /**
   * 解析 ID3v2 標籤
   */
  parseID3v2(dataView) {
    if (!this.hasID3v2(dataView)) return null;
    
    const version = `2.${dataView.getUint8(3)}.${dataView.getUint8(4)}`;
    const flags = dataView.getUint8(5);
    
    // ID3 大小（同步安全整數）
    const size = ((dataView.getUint8(6) & 0x7F) << 21) |
                 ((dataView.getUint8(7) & 0x7F) << 14) |
                 ((dataView.getUint8(8) & 0x7F) << 7) |
                 (dataView.getUint8(9) & 0x7F);
    
    return {
      version,
      flags,
      size,
      hasExtendedHeader: (flags & 0x40) !== 0,
      hasFooter: (flags & 0x10) !== 0
    };
  }
  
  /**
   * 尋找第一個有效的 MP3 框架
   */
  async findFirstFrame(file, startOffset) {
    const searchSize = Math.min(file.size - startOffset, 65536); // 搜尋前 64KB
    const buffer = await this.readFileSlice(file, startOffset, startOffset + searchSize);
    const view = new DataView(buffer);
    
    for (let i = 0; i < view.byteLength - 4; i++) {
      const header = view.getUint32(i, false);
      
      if (this.isValidFrameHeader(header)) {
        return {
          position: startOffset + i,
          header: header
        };
      }
    }
    
    return null;
  }
  
  /**
   * 檢查是否為有效的框架頭部
   */
  isValidFrameHeader(header) {
    // 同步字 (11 bits)
    if ((header & 0xFFE00000) !== 0xFFE00000) return false;
    
    // MPEG 版本
    const version = (header >> 19) & 0x3;
    if (version === 1) return false; // reserved
    
    // Layer
    const layer = (header >> 17) & 0x3;
    if (layer === 0) return false; // reserved
    
    // 比特率
    const bitrateIndex = (header >> 12) & 0xF;
    if (bitrateIndex === 0xF) return false; // bad
    
    // 採樣率
    const sampleRateIndex = (header >> 10) & 0x3;
    if (sampleRateIndex === 3) return false; // reserved
    
    return true;
  }
  
  /**
   * 解析框架頭部
   */
  parseFrameHeader(header) {
    const version = (header >> 19) & 0x3;
    const layer = (header >> 17) & 0x3;
    const protection = ((header >> 16) & 0x1) === 0;
    const bitrateIndex = (header >> 12) & 0xF;
    const sampleRateIndex = (header >> 10) & 0x3;
    const padding = (header >> 9) & 0x1;
    const channelMode = (header >> 6) & 0x3;
    
    const bitrate = this.bitrateTable[version]?.[layer]?.[bitrateIndex] || 0;
    const sampleRate = this.sampleRateTable[version]?.[sampleRateIndex] || 0;
    
    return {
      version,
      versionName: this.mpegVersions[version],
      layer,
      layerName: this.layers[layer],
      protection,
      bitrate: bitrate * 1000, // 轉換為 bps
      sampleRate,
      padding,
      channelMode,
      channels: channelMode === 3 ? 1 : 2,
      frameSize: this.calculateFrameSize(version, layer, bitrate, sampleRate, padding)
    };
  }
  
  /**
   * 計算框架大小
   */
  calculateFrameSize(version, layer, bitrate, sampleRate, padding) {
    if (!bitrate || !sampleRate) return 0;
    
    const samplesPerFrame = this.samplesPerFrame[layer]?.[version] || 0;
    
    if (layer === 1) { // Layer 3
      if (version === 3) { // MPEG 1
        return Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
      } else { // MPEG 2/2.5
        return Math.floor((72 * bitrate * 1000) / sampleRate) + padding;
      }
    } else if (layer === 2) { // Layer 2
      return Math.floor((144 * bitrate * 1000) / sampleRate) + padding;
    } else if (layer === 3) { // Layer 1
      return Math.floor((12 * bitrate * 1000) / sampleRate) * 4 + padding * 4;
    }
    
    return 0;
  }
  
  /**
   * 檢測 VBR (Variable Bit Rate)
   */
  async detectVBR(file, position, frameInfo) {
    // VBR 標籤通常在第一個音訊框架之後
    const vbrOffset = frameInfo.channels === 1 ? 17 : 32;
    const vbrPosition = position + vbrOffset;
    
    if (vbrPosition + 12 > file.size) return null;
    
    const buffer = await this.readFileSlice(file, vbrPosition, vbrPosition + 12);
    const view = new DataView(buffer);
    
    // 檢查 Xing/Info 標籤
    const tag = String.fromCharCode(
      view.getUint8(0),
      view.getUint8(1),
      view.getUint8(2),
      view.getUint8(3)
    );
    
    if (tag === 'Xing' || tag === 'Info') {
      const flags = view.getUint32(4, false);
      let offset = 8;
      const vbrInfo = { tag };
      
      // 框架數
      if (flags & 0x01) {
        vbrInfo.frames = view.getUint32(offset, false);
        offset += 4;
      }
      
      // 檔案大小
      if (flags & 0x02) {
        vbrInfo.bytes = view.getUint32(offset, false);
        offset += 4;
      }
      
      return vbrInfo;
    }
    
    // 檢查 VBRI 標籤
    const vbriPosition = position + 32;
    if (vbriPosition + 26 <= file.size) {
      const vbriBuffer = await this.readFileSlice(file, vbriPosition, vbriPosition + 26);
      const vbriView = new DataView(vbriBuffer);
      
      const vbriTag = String.fromCharCode(
        vbriView.getUint8(0),
        vbriView.getUint8(1),
        vbriView.getUint8(2),
        vbriView.getUint8(3)
      );
      
      if (vbriTag === 'VBRI') {
        return {
          tag: 'VBRI',
          version: vbriView.getUint16(4, false),
          delay: vbriView.getUint16(6, false),
          quality: vbriView.getUint16(8, false),
          bytes: vbriView.getUint32(10, false),
          frames: vbriView.getUint32(14, false)
        };
      }
    }
    
    return null;
  }
  
  /**
   * 尋找框架邊界
   */
  findFrameBoundary(buffer, targetPosition, options = {}) {
    const view = new DataView(buffer);
    const searchRange = options.searchRange || buffer.byteLength;
    const start = Math.max(0, targetPosition - searchRange / 2);
    const end = Math.min(buffer.byteLength - 4, targetPosition + searchRange / 2);
    
    let bestPosition = targetPosition;
    let minDistance = Infinity;
    
    for (let i = start; i <= end; i++) {
      const header = view.getUint32(i, false);
      
      if (this.isValidFrameHeader(header)) {
        const distance = Math.abs(i - targetPosition);
        if (distance < minDistance) {
          minDistance = distance;
          bestPosition = i;
        }
      }
    }
    
    return bestPosition;
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
   * 計算精確的時間位置
   */
  getTimeFromPosition(bytePosition, metadata) {
    if (metadata.vbr && metadata.vbrInfo) {
      // VBR 需要更複雜的計算
      // 這裡使用簡化版本
      const progress = bytePosition / metadata.size;
      return progress * metadata.duration;
    }
    
    // CBR 計算
    return super.getTimeFromPosition(bytePosition, metadata);
  }
}