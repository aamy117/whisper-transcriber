#!/usr/bin/env node

/**
 * 驗證修復的自動化測試腳本
 * 使用 Node.js 檢查程式碼修改
 */

const fs = require('fs');
const path = require('path');

// 定義顏色輸出
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function readFile(filePath) {
  try {
    return fs.readFileSync(path.join(__dirname, '..', filePath), 'utf8');
  } catch (error) {
    return null;
  }
}

// 測試結果統計
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(testName, testFunction) {
  totalTests++;
  log(`\n運行測試: ${testName}`, 'blue');
  
  try {
    const result = testFunction();
    if (result.passed) {
      passedTests++;
      log(`✅ 通過: ${result.message}`, 'green');
    } else {
      failedTests++;
      log(`❌ 失敗: ${result.message}`, 'red');
    }
    
    if (result.details) {
      result.details.forEach(detail => {
        log(`   ${detail}`);
      });
    }
  } catch (error) {
    failedTests++;
    log(`❌ 測試異常: ${error.message}`, 'red');
  }
}

// 測試 1: 檢查 player.js 記憶體洩漏修復
runTest('AudioPlayer 記憶體洩漏修復', () => {
  const playerCode = readFile('js/player.js');
  if (!playerCode) {
    return { passed: false, message: '無法讀取 player.js' };
  }
  
  const checks = [];
  const results = [];
  
  // 檢查 currentBlobUrl 屬性
  checks.push({
    name: 'currentBlobUrl 屬性',
    test: playerCode.includes('this.currentBlobUrl = null;'),
    detail: 'AudioPlayer 建構函數中應該有 currentBlobUrl 屬性'
  });
  
  // 檢查 loadAudioFile 中的 URL 釋放
  checks.push({
    name: 'URL 釋放邏輯',
    test: playerCode.includes('URL.revokeObjectURL(this.currentBlobUrl)'),
    detail: 'loadAudioFile 應該釋放舊的 Blob URL'
  });
  
  // 檢查 cleanup 方法
  checks.push({
    name: 'cleanup 方法',
    test: playerCode.includes('cleanup()') && playerCode.includes('this.currentBlobUrl = null;'),
    detail: '應該有 cleanup 方法來清理資源'
  });
  
  const allPassed = checks.every(check => check.test);
  const details = checks.map(check => 
    `${check.test ? '✓' : '✗'} ${check.name}: ${check.detail}`
  );
  
  return {
    passed: allPassed,
    message: allPassed ? '所有記憶體洩漏修復檢查通過' : '部分檢查未通過',
    details
  };
});

// 測試 2: 檢查 audio-splitter.js 記憶體效率
runTest('音訊分割記憶體效率', () => {
  const splitterCode = readFile('js/audio-splitter.js');
  if (!splitterCode) {
    return { passed: false, message: '無法讀取 audio-splitter.js' };
  }
  
  // 檢查是否移除了 slice(0)
  const hasSliceZero = splitterCode.includes('arrayBuffer.slice(0)');
  const hasDirectDecode = splitterCode.includes('decodeAudioData(arrayBuffer)');
  
  return {
    passed: !hasSliceZero && hasDirectDecode,
    message: !hasSliceZero ? '已移除不必要的 ArrayBuffer 複製' : '仍包含 arrayBuffer.slice(0)',
    details: [
      `${!hasSliceZero ? '✓' : '✗'} 移除 arrayBuffer.slice(0)`,
      `${hasDirectDecode ? '✓' : '✗'} 直接解碼 ArrayBuffer`
    ]
  };
});

// 測試 3: 檢查 WASM 降級實現
runTest('WASM 降級功能', () => {
  const wasmCode = readFile('js/wasm/whisper-wasm-manager.js');
  if (!wasmCode) {
    return { passed: false, message: '無法讀取 whisper-wasm-manager.js' };
  }
  
  // 檢查 loadWASMModule 方法
  const hasThrowError = wasmCode.includes('throw new Error(\'WASM 模組載入尚未實作');
  const hasWarning = wasmCode.includes('console.warn(\'真實 WASM (whisper.cpp) 尚未實現');
  const hasFallback = wasmCode.includes('this.ENABLE_REAL_WASM = false');
  
  return {
    passed: !hasThrowError && hasWarning && hasFallback,
    message: !hasThrowError ? '已實現優雅降級' : '仍在拋出錯誤',
    details: [
      `${!hasThrowError ? '✓' : '✗'} 移除錯誤拋出`,
      `${hasWarning ? '✓' : '✗'} 添加警告訊息`,
      `${hasFallback ? '✓' : '✗'} 降級到 Transformers.js`
    ]
  };
});

// 測試 4: 檢查虛擬滾動優化
runTest('虛擬滾動效能優化', () => {
  const vsCode = readFile('js/virtual-scroll-manager.js');
  if (!vsCode) {
    return { passed: false, message: '無法讀取 virtual-scroll-manager.js' };
  }
  
  // 檢查是否包含二分搜尋
  const hasBinarySearch = vsCode.includes('while (left <= right)') && 
                         vsCode.includes('Math.floor((left + right) / 2)');
  
  // 檢查是否有固定高度優化
  const hasFixedHeightOptimization = vsCode.includes('this.itemHeights.size === 0');
  
  return {
    passed: hasBinarySearch && hasFixedHeightOptimization,
    message: hasBinarySearch ? '已實現二分搜尋優化' : '未找到二分搜尋實現',
    details: [
      `${hasBinarySearch ? '✓' : '✗'} 二分搜尋算法`,
      `${hasFixedHeightOptimization ? '✓' : '✗'} 固定高度優化路徑`
    ]
  };
});

// 測試 5: 檢查其他 createObjectURL 使用
runTest('其他模組 URL 管理', () => {
  const modulesToCheck = [
    { file: 'js/export.js', name: 'Export Manager' },
    { file: 'js/batch-processor.js', name: 'Batch Processor' },
    { file: 'js/batch-editor.js', name: 'Batch Editor' }
  ];
  
  const results = modulesToCheck.map(module => {
    const code = readFile(module.file);
    if (!code) {
      return { name: module.name, hasCreate: false, hasRevoke: false };
    }
    
    const hasCreate = code.includes('URL.createObjectURL');
    const hasRevoke = code.includes('URL.revokeObjectURL');
    
    return { name: module.name, hasCreate, hasRevoke };
  });
  
  const allCorrect = results.every(r => !r.hasCreate || r.hasRevoke);
  
  return {
    passed: allCorrect,
    message: allCorrect ? '所有模組都正確管理 URL' : '某些模組缺少 URL 釋放',
    details: results.map(r => 
      `${r.hasCreate && r.hasRevoke ? '✓' : r.hasCreate ? '✗' : '○'} ${r.name}: ` +
      `${r.hasCreate ? '使用 createObjectURL' : '未使用 URL'} ` +
      `${r.hasCreate && r.hasRevoke ? '並正確釋放' : r.hasCreate ? '但未釋放!' : ''}`
    )
  };
});

// 測試 6: 程式碼品質檢查
runTest('程式碼品質', () => {
  const checks = [];
  
  // 檢查是否有 console.log 未加保護
  const filesToCheck = ['js/player.js', 'js/audio-splitter.js', 'js/wasm/whisper-wasm-manager.js'];
  
  filesToCheck.forEach(file => {
    const code = readFile(file);
    if (code) {
      const lines = code.split('\n');
      const unprotectedLogs = lines.filter(line => 
        line.includes('console.') && 
        !line.includes('DEBUG') && 
        !line.includes('typeof DEBUG') &&
        !line.trim().startsWith('//')
      );
      
      checks.push({
        file,
        unprotectedLogs: unprotectedLogs.length,
        passed: unprotectedLogs.length === 0
      });
    }
  });
  
  const allPassed = checks.every(check => check.passed);
  
  return {
    passed: allPassed,
    message: allPassed ? '所有 console 語句都已保護' : '發現未保護的 console 語句',
    details: checks.map(check => 
      `${check.passed ? '✓' : '✗'} ${check.file}: ${check.unprotectedLogs} 個未保護的 console 語句`
    )
  };
});

// 顯示測試總結
console.log('\n' + '='.repeat(50));
log('測試總結', 'blue');
console.log('='.repeat(50));
log(`總測試數: ${totalTests}`);
log(`通過: ${passedTests}`, 'green');
log(`失敗: ${failedTests}`, 'red');
log(`成功率: ${((passedTests / totalTests) * 100).toFixed(1)}%`);

// 檢查關鍵檔案是否存在
console.log('\n檔案完整性檢查:');
const criticalFiles = [
  'js/player.js',
  'js/audio-splitter.js',
  'js/wasm/whisper-wasm-manager.js',
  'js/virtual-scroll-manager.js',
  'js/main.js'
];

criticalFiles.forEach(file => {
  const exists = fs.existsSync(path.join(__dirname, '..', file));
  log(`${exists ? '✓' : '✗'} ${file}`, exists ? 'green' : 'red');
});

// 退出碼
process.exit(failedTests > 0 ? 1 : 0);