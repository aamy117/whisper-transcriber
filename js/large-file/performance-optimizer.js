// performance-optimizer.js - 效能優化器
// 自動監控和優化大檔案處理系統的效能

export class PerformanceOptimizer {
  constructor() {
    // 效能指標收集
    this.metrics = {
      workerPerformance: new Map(), // Worker 效能資料
      processingTimes: [],          // 處理時間記錄
      memoryUsage: [],              // 記憶體使用記錄
      apiLatency: [],               // API 延遲記錄
      throughput: [],               // 吞吐量記錄
    };

    // 優化建議
    this.recommendations = {
      workerCount: null,
      chunkSize: null,
      bufferSize: null,
      cacheStrategy: null,
    };

    // 效能閾值
    this.thresholds = {
      maxMemoryUsage: 0.8,        // 最大記憶體使用率 80%
      minThroughput: 1024 * 1024, // 最小吞吐量 1MB/s
      maxApiLatency: 5000,        // 最大 API 延遲 5秒
      workerEfficiency: 0.7,      // Worker 效率閾值 70%
    };

    // 配置參數
    this.config = {
      samplingInterval: 1000,     // 採樣間隔 1秒
      analysisWindow: 60,         // 分析視窗 60秒
      adaptiveMode: true,         // 自適應模式
    };

    // 內部狀態
    this.isMonitoring = false;
    this.samplingTimer = null;
    this.analysisTimer = null;
    this.startTime = null;
  }

  // 開始監控
  async startMonitoring() {
    if (this.isMonitoring) return;

    this.isMonitoring = true;
    this.startTime = Date.now();

    // 定期採樣
    this.samplingTimer = setInterval(() => {
      this.collectMetrics();
    }, this.config.samplingInterval);

    // 定期分析和優化
    this.analysisTimer = setInterval(() => {
      this.analyzeAndOptimize();
    }, this.config.analysisWindow * 1000);

    // 監聽效能事件
    this.setupEventListeners();

    console.log('Performance monitoring started');
  }

  // 停止監控
  stopMonitoring() {
    if (!this.isMonitoring) return;

    this.isMonitoring = false;

    if (this.samplingTimer) {
      clearInterval(this.samplingTimer);
      this.samplingTimer = null;
    }

    if (this.analysisTimer) {
      clearInterval(this.analysisTimer);
      this.analysisTimer = null;
    }

    this.removeEventListeners();

    console.log('Performance monitoring stopped');
  }

  // 收集效能指標
  collectMetrics() {
    try {
      // 收集記憶體使用情況
      if (performance.memory) {
        const memoryUsage = {
          timestamp: Date.now(),
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize,
          jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
          usage: performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit,
        };
        this.metrics.memoryUsage.push(memoryUsage);
      }

      // 收集導航計時資料
      const navTiming = performance.getEntriesByType('navigation')[0];
      if (navTiming) {
        this.metrics.pageLoadTime = navTiming.loadEventEnd - navTiming.fetchStart;
      }

      // 收集資源計時資料
      const resources = performance.getEntriesByType('resource');
      const apiCalls = resources.filter(r => r.name.includes('/v1/audio/transcriptions'));
      
      if (apiCalls.length > 0) {
        const latestCall = apiCalls[apiCalls.length - 1];
        this.metrics.apiLatency.push({
          timestamp: Date.now(),
          duration: latestCall.duration,
          transferSize: latestCall.transferSize,
        });
      }

      // 清理舊資料（保留最近 5 分鐘）
      this.cleanupOldMetrics();

    } catch (error) {
      console.error('Error collecting metrics:', error);
    }
  }

  // 記錄 Worker 效能
  recordWorkerPerformance(workerId, metric) {
    if (!this.metrics.workerPerformance.has(workerId)) {
      this.metrics.workerPerformance.set(workerId, {
        tasksCompleted: 0,
        totalProcessingTime: 0,
        errors: 0,
        efficiency: 1.0,
      });
    }

    const workerMetrics = this.metrics.workerPerformance.get(workerId);
    
    if (metric.type === 'task_complete') {
      workerMetrics.tasksCompleted++;
      workerMetrics.totalProcessingTime += metric.duration;
      workerMetrics.efficiency = workerMetrics.tasksCompleted / 
        (workerMetrics.tasksCompleted + workerMetrics.errors);
    } else if (metric.type === 'error') {
      workerMetrics.errors++;
      workerMetrics.efficiency = workerMetrics.tasksCompleted / 
        (workerMetrics.tasksCompleted + workerMetrics.errors);
    }
  }

  // 記錄處理效能
  recordProcessingPerformance(metric) {
    this.metrics.processingTimes.push({
      timestamp: Date.now(),
      fileSize: metric.fileSize,
      duration: metric.duration,
      chunkCount: metric.chunkCount,
      throughput: metric.fileSize / (metric.duration / 1000), // bytes/second
    });

    // 更新吞吐量記錄
    this.metrics.throughput.push({
      timestamp: Date.now(),
      value: metric.fileSize / (metric.duration / 1000),
    });
  }

  // 分析並優化
  analyzeAndOptimize() {
    if (!this.config.adaptiveMode) return;

    try {
      // 分析記憶體使用
      const memoryAnalysis = this.analyzeMemoryUsage();
      
      // 分析 Worker 效能
      const workerAnalysis = this.analyzeWorkerPerformance();
      
      // 分析吞吐量
      const throughputAnalysis = this.analyzeThroughput();
      
      // 分析 API 延遲
      const apiAnalysis = this.analyzeApiLatency();

      // 生成優化建議
      this.generateOptimizations({
        memory: memoryAnalysis,
        worker: workerAnalysis,
        throughput: throughputAnalysis,
        api: apiAnalysis,
      });

      // 應用優化
      this.applyOptimizations();

      // 發送優化事件
      this.dispatchOptimizationEvent();

    } catch (error) {
      console.error('Error during analysis:', error);
    }
  }

  // 分析記憶體使用
  analyzeMemoryUsage() {
    if (this.metrics.memoryUsage.length === 0) {
      return { status: 'unknown', avgUsage: 0, trend: 'stable' };
    }

    const recentMetrics = this.metrics.memoryUsage.slice(-60); // 最近 60 個樣本
    const avgUsage = recentMetrics.reduce((sum, m) => sum + m.usage, 0) / recentMetrics.length;
    
    // 計算趨勢
    let trend = 'stable';
    if (recentMetrics.length > 10) {
      const firstHalf = recentMetrics.slice(0, recentMetrics.length / 2);
      const secondHalf = recentMetrics.slice(recentMetrics.length / 2);
      
      const firstAvg = firstHalf.reduce((sum, m) => sum + m.usage, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, m) => sum + m.usage, 0) / secondHalf.length;
      
      if (secondAvg > firstAvg * 1.1) trend = 'increasing';
      else if (secondAvg < firstAvg * 0.9) trend = 'decreasing';
    }

    const status = avgUsage > this.thresholds.maxMemoryUsage ? 'critical' : 
                   avgUsage > 0.6 ? 'warning' : 'good';

    return { status, avgUsage, trend };
  }

  // 分析 Worker 效能
  analyzeWorkerPerformance() {
    const workerStats = [];
    let totalEfficiency = 0;
    let workerCount = 0;

    this.metrics.workerPerformance.forEach((metrics, workerId) => {
      const avgProcessingTime = metrics.tasksCompleted > 0 ? 
        metrics.totalProcessingTime / metrics.tasksCompleted : 0;
      
      workerStats.push({
        workerId,
        efficiency: metrics.efficiency,
        avgProcessingTime,
        tasksCompleted: metrics.tasksCompleted,
        errors: metrics.errors,
      });

      totalEfficiency += metrics.efficiency;
      workerCount++;
    });

    const avgEfficiency = workerCount > 0 ? totalEfficiency / workerCount : 1;
    const status = avgEfficiency < this.thresholds.workerEfficiency ? 'poor' : 'good';

    return {
      status,
      avgEfficiency,
      workerStats,
      optimalWorkerCount: this.calculateOptimalWorkerCount(workerStats),
    };
  }

  // 分析吞吐量
  analyzeThroughput() {
    if (this.metrics.throughput.length === 0) {
      return { status: 'unknown', avgThroughput: 0, trend: 'stable' };
    }

    const recentMetrics = this.metrics.throughput.slice(-60);
    const avgThroughput = recentMetrics.reduce((sum, m) => sum + m.value, 0) / recentMetrics.length;
    
    const status = avgThroughput < this.thresholds.minThroughput ? 'poor' : 'good';

    return { status, avgThroughput };
  }

  // 分析 API 延遲
  analyzeApiLatency() {
    if (this.metrics.apiLatency.length === 0) {
      return { status: 'unknown', avgLatency: 0 };
    }

    const recentMetrics = this.metrics.apiLatency.slice(-20);
    const avgLatency = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    
    const status = avgLatency > this.thresholds.maxApiLatency ? 'poor' : 'good';

    return { status, avgLatency };
  }

  // 計算最佳 Worker 數量
  calculateOptimalWorkerCount(workerStats) {
    // 基於 CPU 核心數
    const cpuCores = navigator.hardwareConcurrency || 4;
    
    // 基於記憶體使用
    const memoryFactor = this.metrics.memoryUsage.length > 0 ? 
      1 - this.metrics.memoryUsage[this.metrics.memoryUsage.length - 1].usage : 1;
    
    // 基於當前 Worker 效率
    const efficiencyFactor = workerStats.length > 0 ?
      workerStats.reduce((sum, w) => sum + w.efficiency, 0) / workerStats.length : 1;
    
    // 計算建議值
    const optimal = Math.max(2, Math.min(
      cpuCores,
      Math.floor(cpuCores * memoryFactor * efficiencyFactor)
    ));

    return optimal;
  }

  // 生成優化建議
  generateOptimizations(analysis) {
    // Worker 數量優化
    if (analysis.worker.status === 'poor' || analysis.memory.status === 'critical') {
      this.recommendations.workerCount = analysis.worker.optimalWorkerCount;
    }

    // 區塊大小優化
    if (analysis.throughput.status === 'poor') {
      // 如果吞吐量低，增加區塊大小
      this.recommendations.chunkSize = 10 * 1024 * 1024; // 10MB
    } else if (analysis.memory.status === 'critical') {
      // 如果記憶體壓力大，減小區塊大小
      this.recommendations.chunkSize = 2 * 1024 * 1024; // 2MB
    }

    // 緩衝區大小優化
    if (analysis.memory.trend === 'increasing') {
      this.recommendations.bufferSize = 'reduce';
    } else if (analysis.memory.usage < 0.5) {
      this.recommendations.bufferSize = 'increase';
    }

    // 快取策略優化
    if (analysis.memory.status === 'critical') {
      this.recommendations.cacheStrategy = 'aggressive'; // 更積極的清理
    } else {
      this.recommendations.cacheStrategy = 'balanced';
    }
  }

  // 應用優化
  applyOptimizations() {
    // 這裡會發送優化建議給其他模組
    // 實際的優化應用由各模組自行處理
    console.log('Optimization recommendations:', this.recommendations);
  }

  // 設置事件監聽器
  setupEventListeners() {
    // 監聽各種效能相關事件
    window.addEventListener('worker-performance', this.handleWorkerPerformance.bind(this));
    window.addEventListener('processing-complete', this.handleProcessingComplete.bind(this));
  }

  // 移除事件監聽器
  removeEventListeners() {
    window.removeEventListener('worker-performance', this.handleWorkerPerformance.bind(this));
    window.removeEventListener('processing-complete', this.handleProcessingComplete.bind(this));
  }

  // 處理 Worker 效能事件
  handleWorkerPerformance(event) {
    const { workerId, metric } = event.detail;
    this.recordWorkerPerformance(workerId, metric);
  }

  // 處理處理完成事件
  handleProcessingComplete(event) {
    const { metric } = event.detail;
    this.recordProcessingPerformance(metric);
  }

  // 發送優化事件
  dispatchOptimizationEvent() {
    window.dispatchEvent(new CustomEvent('performance-optimization', {
      detail: {
        recommendations: this.recommendations,
        metrics: this.getMetricsSummary(),
      }
    }));
  }

  // 清理舊指標
  cleanupOldMetrics() {
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    // 清理各種指標陣列
    this.metrics.memoryUsage = this.metrics.memoryUsage.filter(m => m.timestamp > fiveMinutesAgo);
    this.metrics.processingTimes = this.metrics.processingTimes.filter(m => m.timestamp > fiveMinutesAgo);
    this.metrics.apiLatency = this.metrics.apiLatency.filter(m => m.timestamp > fiveMinutesAgo);
    this.metrics.throughput = this.metrics.throughput.filter(m => m.timestamp > fiveMinutesAgo);
  }

  // 獲取指標摘要
  getMetricsSummary() {
    const summary = {
      uptime: Date.now() - this.startTime,
      memoryUsage: this.analyzeMemoryUsage(),
      workerPerformance: this.analyzeWorkerPerformance(),
      throughput: this.analyzeThroughput(),
      apiLatency: this.analyzeApiLatency(),
      recommendations: this.recommendations,
    };

    return summary;
  }

  // 生成效能報告
  generateReport() {
    const summary = this.getMetricsSummary();
    
    const report = {
      timestamp: new Date().toISOString(),
      duration: summary.uptime,
      metrics: {
        memory: {
          status: summary.memoryUsage.status,
          averageUsage: `${(summary.memoryUsage.avgUsage * 100).toFixed(1)}%`,
          trend: summary.memoryUsage.trend,
        },
        workers: {
          status: summary.workerPerformance.status,
          averageEfficiency: `${(summary.workerPerformance.avgEfficiency * 100).toFixed(1)}%`,
          optimalCount: summary.workerPerformance.optimalWorkerCount,
          currentStats: summary.workerPerformance.workerStats,
        },
        throughput: {
          status: summary.throughput.status,
          average: `${(summary.throughput.avgThroughput / 1024 / 1024).toFixed(2)} MB/s`,
        },
        api: {
          status: summary.apiLatency.status,
          averageLatency: `${summary.apiLatency.avgLatency.toFixed(0)} ms`,
        },
      },
      optimizations: this.recommendations,
    };

    return report;
  }

  // 重置指標
  resetMetrics() {
    this.metrics = {
      workerPerformance: new Map(),
      processingTimes: [],
      memoryUsage: [],
      apiLatency: [],
      throughput: [],
    };

    this.recommendations = {
      workerCount: null,
      chunkSize: null,
      bufferSize: null,
      cacheStrategy: null,
    };

    console.log('Performance metrics reset');
  }
}

// 匯出單例
export const performanceOptimizer = new PerformanceOptimizer();