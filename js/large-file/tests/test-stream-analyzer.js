/**
 * StreamAnalyzer 測試
 * 
 * 測試音訊格式檢測和分析功能
 */

import { StreamAnalyzer } from '../stream-analyzer.js';

// 建立模擬的音訊檔案
function createMockAudioFile(name, size, type) {
  // 建立不同格式的模擬檔案頭部
  const headers = {
    'audio.mp3': new Uint8Array([
      0x49, 0x44, 0x33, 0x04, 0x00, 0x00, // ID3v2.4
      0x00, 0x00, 0x00, 0x00, // ID3 大小
      // MP3 frame header (MPEG-1 Layer 3, 128kbps, 44.1kHz, stereo)
      0xFF, 0xFB, 0x90, 0x00
    ]),
    'audio.wav': new Uint8Array([
      0x52, 0x49, 0x46, 0x46, // 'RIFF'
      0x24, 0x08, 0x00, 0x00, // 檔案大小
      0x57, 0x41, 0x56, 0x45, // 'WAVE'
      0x66, 0x6D, 0x74, 0x20, // 'fmt '
      0x10, 0x00, 0x00, 0x00, // fmt chunk 大小
      0x01, 0x00,             // PCM
      0x02, 0x00,             // 2 聲道
      0x44, 0xAC, 0x00, 0x00, // 44100 Hz
      0x10, 0xB1, 0x02, 0x00, // byte rate
      0x04, 0x00,             // block align
      0x10, 0x00              // 16 bits per sample
    ]),
    'audio.flac': new Uint8Array([
      0x66, 0x4C, 0x61, 0x43, // 'fLaC'
      0x00,                   // STREAMINFO block
      0x00, 0x00, 0x22,       // block size
      // STREAMINFO data (簡化版)
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0xAC, 0x44, 0x00,       // 44100 Hz
      0x0F,                   // 2 channels, 16 bits
      0x00, 0x00, 0x00, 0x00  // total samples
    ])
  };

  const header = headers[name] || new Uint8Array(0);
  const buffer = new ArrayBuffer(Math.max(size, header.length));
  const view = new Uint8Array(buffer);
  
  // 複製頭部數據
  for (let i = 0; i < header.length; i++) {
    view[i] = header[i];
  }
  
  // 建立 Blob 並設置屬性
  const blob = new Blob([buffer], { type: type || 'audio/mpeg' });
  Object.defineProperty(blob, 'name', { value: name });
  
  return blob;
}

// 執行測試
async function runTests() {
  console.log('🧪 開始測試 StreamAnalyzer...\n');
  
  const analyzer = new StreamAnalyzer();
  const tests = [
    {
      name: 'MP3 格式檢測',
      file: createMockAudioFile('audio.mp3', 1024 * 1024, 'audio/mpeg'),
      expected: { format: 'mp3', codec: 'mp3' }
    },
    {
      name: 'WAV 格式檢測',
      file: createMockAudioFile('audio.wav', 2 * 1024 * 1024, 'audio/wav'),
      expected: { format: 'wav', codec: 'pcm' }
    },
    {
      name: 'FLAC 格式檢測',
      file: createMockAudioFile('audio.flac', 5 * 1024 * 1024, 'audio/flac'),
      expected: { format: 'flac', codec: 'flac' }
    },
    {
      name: '未知格式處理',
      file: createMockAudioFile('audio.xyz', 1024 * 1024, 'audio/unknown'),
      expected: { format: 'unknown' }
    },
    {
      name: '大檔案串流能力',
      file: createMockAudioFile('large.mp3', 600 * 1024 * 1024, 'audio/mpeg'),
      expected: { format: 'mp3', canStream: false }
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      console.log(`📋 測試: ${test.name}`);
      const result = await analyzer.analyze(test.file);
      
      // 驗證結果
      let success = true;
      for (const [key, value] of Object.entries(test.expected)) {
        if (result[key] !== value) {
          console.log(`  ❌ ${key}: 期望 ${value}, 實際 ${result[key]}`);
          success = false;
        }
      }
      
      if (success) {
        console.log(`  ✅ 通過`);
        console.log(`  📊 分析結果:`, {
          格式: result.format,
          編碼: result.codec,
          比特率: `${(result.bitrate / 1000).toFixed(0)} kbps`,
          採樣率: `${result.sampleRate} Hz`,
          聲道: result.channels,
          時長: `${result.estimatedDuration} 秒`
        });
        passed++;
      } else {
        failed++;
      }
      
    } catch (error) {
      console.log(`  ❌ 錯誤: ${error.message}`);
      failed++;
    }
    
    console.log('');
  }
  
  // 測試串流讀取器
  console.log('📋 測試: 串流讀取器');
  try {
    const file = createMockAudioFile('stream.mp3', 10 * 1024 * 1024, 'audio/mpeg');
    const reader = await analyzer.createStreamReader(file, { chunkSize: 1024 * 1024 });
    
    let chunks = 0;
    while (true) {
      const { done, value, progress } = await reader.read();
      if (done) break;
      chunks++;
      console.log(`  📦 讀取 chunk ${chunks}, 進度: ${(progress * 100).toFixed(1)}%`);
    }
    
    console.log(`  ✅ 成功讀取 ${chunks} 個 chunks`);
    passed++;
  } catch (error) {
    console.log(`  ❌ 錯誤: ${error.message}`);
    failed++;
  }
  
  // 總結
  console.log('\n📊 測試總結:');
  console.log(`  ✅ 通過: ${passed}`);
  console.log(`  ❌ 失敗: ${failed}`);
  console.log(`  📈 成功率: ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
}

// 執行測試
runTests().catch(console.error);