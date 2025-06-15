// MP4 播放問題診斷工具
class MP4DiagnosticTool {
  static async diagnoseMP4Support() {
    console.log('=== MP4 播放診斷 ===');
    
    // 1. 檢查瀏覽器基本支援
    const video = document.createElement('video');
    const mp4Support = {
      'MP4 基本支援': video.canPlayType('video/mp4'),
      'MP4 + H.264': video.canPlayType('video/mp4; codecs="avc1.42E01E"'),
      'MP4 + H.264 (高品質)': video.canPlayType('video/mp4; codecs="avc1.64001E"'),
      'MP4 + AAC': video.canPlayType('video/mp4; codecs="mp4a.40.2"'),
      'MP4 + H.264 + AAC': video.canPlayType('video/mp4; codecs="avc1.42E01E, mp4a.40.2"')
    };
    
    console.log('瀏覽器 MP4 支援情況:');
    for (const [format, support] of Object.entries(mp4Support)) {
      const status = support === 'probably' ? '✅ 完全支援' :
                    support === 'maybe' ? '⚠️ 可能支援' : '❌ 不支援';
      console.log(`${format}: ${status} (${support})`);
    }
    
    // 2. 檢查 Media Source Extensions 支援
    const mseSupport = {
      'MSE 基本支援': 'MediaSource' in window,
      'MSE MP4 支援': 'MediaSource' in window && MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E"'),
      'MSE WebM 支援': 'MediaSource' in window && MediaSource.isTypeSupported('video/webm; codecs="vp9"')
    };
    
    console.log('\nMedia Source Extensions 支援:');
    for (const [feature, supported] of Object.entries(mseSupport)) {
      console.log(`${feature}: ${supported ? '✅' : '❌'}`);
    }
    
    // 3. 檢查檔案系統 API
    const fileSupport = {
      'File API': 'File' in window,
      'FileReader API': 'FileReader' in window,
      'Blob URL': 'URL' in window && 'createObjectURL' in URL
    };
    
    console.log('\n檔案處理 API 支援:');
    for (const [api, supported] of Object.entries(fileSupport)) {
      console.log(`${api}: ${supported ? '✅' : '❌'}`);
    }
    
    return {
      mp4Support,
      mseSupport,
      fileSupport
    };
  }
  
  static async testMP4File(file) {
    console.log('\n=== MP4 檔案分析 ===');
    console.log(`檔案名稱: ${file.name}`);
    console.log(`檔案大小: ${(file.size / 1024 / 1024).toFixed(2)} MB`);
    console.log(`MIME 類型: ${file.type || '未知'}`);
    
    // 檢查檔案副檔名
    const extension = file.name.split('.').pop().toLowerCase();
    console.log(`副檔名: .${extension}`);
    
    if (extension !== 'mp4') {
      console.warn('⚠️ 檔案副檔名不是 .mp4');
    }
    
    if (!file.type || file.type === '') {
      console.warn('⚠️ 檔案沒有 MIME 類型，可能是瀏覽器無法識別');
    }
    
    // 嘗試讀取檔案頭部
    try {
      const header = await this.readFileHeader(file);
      console.log('\n檔案頭部分析:');
      console.log('前 32 bytes:', Array.from(header).map(b => b.toString(16).padStart(2, '0')).join(' '));
      
      // 檢查 MP4 檔案簽名
      if (this.isValidMP4Header(header)) {
        console.log('✅ 檔案具有有效的 MP4 簽名');
      } else {
        console.warn('❌ 檔案不具有有效的 MP4 簽名');
      }
    } catch (error) {
      console.error('讀取檔案頭部失敗:', error);
    }
  }
  
  static readFileHeader(file, size = 32) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(new Uint8Array(reader.result));
      reader.onerror = reject;
      reader.readAsArrayBuffer(file.slice(0, size));
    });
  }
  
  static isValidMP4Header(header) {
    // MP4 檔案通常以 ftyp box 開始
    // 前 4 bytes 是 box 大小，第 5-8 bytes 是 'ftyp'
    const ftypSignature = [0x66, 0x74, 0x79, 0x70]; // 'ftyp'
    
    for (let i = 0; i <= header.length - 4; i++) {
      if (header[i] === ftypSignature[0] &&
          header[i + 1] === ftypSignature[1] &&
          header[i + 2] === ftypSignature[2] &&
          header[i + 3] === ftypSignature[3]) {
        return true;
      }
    }
    
    return false;
  }
  
  static async createTestVideo() {
    console.log('\n=== 建立測試視訊 ===');
    
    const video = document.createElement('video');
    video.style.cssText = `
      width: 300px;
      height: 200px;
      border: 2px solid #ccc;
      margin: 10px;
    `;
    video.controls = true;
    
    // 測試不同的 MP4 來源
    const testSources = [
      {
        name: '線上測試 MP4',
        src: 'https://sample-videos.com/zip/10/mp4/SampleVideo_1280x720_1mb.mp4'
      },
      {
        name: 'Big Buck Bunny (短片)',
        src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'
      }
    ];
    
    for (const source of testSources) {
      console.log(`測試: ${source.name}`);
      try {
        const testResult = await this.testVideoSource(source.src);
        console.log(`結果: ${testResult ? '✅ 可播放' : '❌ 無法播放'}`);
      } catch (error) {
        console.log(`結果: ❌ 錯誤 - ${error.message}`);
      }
    }
    
    return video;
  }
  
  static testVideoSource(src) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onLoad);
        video.removeEventListener('error', onError);
      };
      
      const onLoad = () => {
        cleanup();
        resolve(true);
      };
      
      const onError = () => {
        cleanup();
        resolve(false);
      };
      
      video.addEventListener('loadedmetadata', onLoad);
      video.addEventListener('error', onError);
      video.src = src;
    });
  }
}

// 匯出診斷工具
window.MP4DiagnosticTool = MP4DiagnosticTool;
