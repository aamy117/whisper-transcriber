/**
 * WASM 配置管理
 * 控制使用優化版或標準版 WASM 實現
 */

export const WASMConfig = {
  // 是否使用優化版（預設啟用）
  useOptimized: true,
  
  // 優化選項
  optimization: {
    // 啟用多執行緒 Worker 池
    enableWorkerPool: true,
    // Worker 池大小（0 = 自動根據 CPU 核心數）
    workerPoolSize: 0,
    // 啟用 SIMD 指令集
    enableSIMD: true,
    // 啟用模型預載入
    enablePreloading: true,
    // 啟用串流結果
    enableStreaming: true,
    // 音訊分段並行處理
    enableParallelProcessing: true,
    // 使用量化模型（更快但準確度略低）
    useQuantizedModels: true,
    // 智慧分段（VAD）
    enableVAD: false, // 暫時關閉，需要額外實現
    // 硬體加速
    preferWebGPU: false // 未來功能
  },
  
  // 效能配置
  performance: {
    // 音訊分段大小（秒）
    chunkDuration: 30,
    // 分段重疊時間（秒）
    overlapDuration: 0.5,
    // 最大並發處理數
    maxConcurrentChunks: 4,
    // 記憶體限制（MB）
    memoryLimit: 2048,
    // 快取策略
    cacheStrategy: 'aggressive' // 'aggressive' | 'moderate' | 'minimal'
  },
  
  // 模型配置
  models: {
    // 預設模型
    default: 'base',
    // 可用模型列表
    available: ['tiny', 'base', 'small'],
    // 模型來源
    source: 'huggingface', // 'huggingface' | 'local' | 'cdn'
    // 本地模型路徑
    localPath: '/models/',
    // CDN 路徑
    cdnPath: 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.6.0/models/'
  },
  
  // 相容性設定
  compatibility: {
    // 降級到單執行緒（當 SharedArrayBuffer 不可用時）
    fallbackToSingleThread: true,
    // 降級到非 SIMD（當 SIMD 不支援時）
    fallbackToNonSIMD: true,
    // 最低瀏覽器要求
    minChromeVersion: 88,
    minFirefoxVersion: 89,
    minSafariVersion: 15
  },
  
  // 除錯設定
  debug: {
    // 顯示效能統計
    showPerformanceStats: true,
    // 顯示記憶體使用
    showMemoryUsage: true,
    // 記錄 Worker 活動
    logWorkerActivity: false,
    // 效能分析
    enableProfiling: false
  },
  
  /**
   * 根據環境自動調整配置
   */
  autoOptimize() {
    const cores = navigator.hardwareConcurrency || 4;
    const memory = navigator.deviceMemory || 4; // GB
    
    // 根據硬體調整 Worker 池大小
    if (this.optimization.workerPoolSize === 0) {
      this.optimization.workerPoolSize = Math.min(cores, 8);
    }
    
    // 低端設備調整
    if (cores <= 2 || memory <= 2) {
      console.log('檢測到低端設備，調整配置...');
      this.optimization.workerPoolSize = Math.min(cores, 2);
      this.performance.maxConcurrentChunks = 2;
      this.performance.chunkDuration = 20;
      this.optimization.useQuantizedModels = true;
    }
    
    // 高端設備優化
    if (cores >= 8 && memory >= 8) {
      console.log('檢測到高端設備，啟用進階優化...');
      this.optimization.workerPoolSize = Math.min(cores, 12);
      this.performance.maxConcurrentChunks = 6;
      this.performance.memoryLimit = 4096;
    }
    
    // 檢查 SIMD 支援
    try {
      if (!WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,5,1,96,0,1,123,3,2,1,0,10,10,1,8,0,65,0,253,17,253,98,11]))) {
        this.optimization.enableSIMD = false;
        console.log('SIMD 不支援，已停用');
      }
    } catch (e) {
      this.optimization.enableSIMD = false;
    }
    
    // 檢查 SharedArrayBuffer
    if (typeof SharedArrayBuffer === 'undefined') {
      console.log('SharedArrayBuffer 不可用，降級到單執行緒');
      this.optimization.enableWorkerPool = false;
      this.optimization.workerPoolSize = 1;
      this.optimization.enableSIMD = false; // SIMD 也需要特殊的環境支援
      // 暫時停用優化版，直到環境支援
      this.useOptimized = false;
    }
  },
  
  /**
   * 獲取效能預估
   */
  getPerformanceEstimate(audioFileSizeMB) {
    const baseSpeed = this.optimization.enableSIMD ? 2.0 : 1.0;
    const workerBoost = this.optimization.workerPoolSize / 2;
    const quantizedBoost = this.optimization.useQuantizedModels ? 1.3 : 1.0;
    
    const totalSpeedMultiplier = baseSpeed * (1 + workerBoost) * quantizedBoost;
    
    // 估算處理時間（相對於音訊長度）
    const processingRatio = 1 / totalSpeedMultiplier;
    
    return {
      speedMultiplier: totalSpeedMultiplier.toFixed(1) + 'x',
      estimatedRatio: processingRatio.toFixed(2),
      recommendation: totalSpeedMultiplier >= 2 ? '高速模式' : '標準模式'
    };
  },
  
  /**
   * 載入使用者偏好設定
   */
  loadUserPreferences() {
    try {
      const saved = localStorage.getItem('whisper-wasm-config');
      if (saved) {
        const prefs = JSON.parse(saved);
        Object.assign(this.optimization, prefs.optimization || {});
        Object.assign(this.performance, prefs.performance || {});
      }
    } catch (e) {
      console.error('載入偏好設定失敗:', e);
    }
  },
  
  /**
   * 儲存使用者偏好設定
   */
  saveUserPreferences() {
    try {
      localStorage.setItem('whisper-wasm-config', JSON.stringify({
        optimization: this.optimization,
        performance: this.performance
      }));
    } catch (e) {
      console.error('儲存偏好設定失敗:', e);
    }
  }
};

// 初始化時自動優化
WASMConfig.autoOptimize();
WASMConfig.loadUserPreferences();

export default WASMConfig;