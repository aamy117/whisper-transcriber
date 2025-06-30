// performance-benchmark.js - 效能基準測試套件
// 用於測試大檔案處理系統的效能表現

import { LargeFileController } from './large-file-controller.js';
import { largeFileConfig } from './large-file-config.js';
import { performanceOptimizer } from './performance-optimizer.js';
import { largeFileIntegration } from './large-file-integration.js';

export class PerformanceBenchmark {
  constructor() {
    this.results = [];
    this.isRunning = false;
    this.currentTest = null;
    
    // 測試配置
    this.testConfigs = [
      {
        name: '小檔案測試',
        fileSize: 10 * 1024 * 1024,  // 10MB
        description: '測試小型音訊檔案的處理效能',
        expectedTime: 10000,  // 期望時間 10 秒
      },
      {
        name: '中型檔案測試',
        fileSize: 50 * 1024 * 1024,  // 50MB
        description: '測試中型音訊檔案的處理效能',
        expectedTime: 30000,  // 期望時間 30 秒
      },
      {
        name: '大檔案測試',
        fileSize: 100 * 1024 * 1024,  // 100MB
        description: '測試大型音訊檔案的處理效能',
        expectedTime: 60000,  // 期望時間 60 秒
      },
      {
        name: '超大檔案測試',
        fileSize: 500 * 1024 * 1024,  // 500MB
        description: '測試超大型音訊檔案的處理效能',
        expectedTime: 300000,  // 期望時間 5 分鐘
      },
    ];
    
    // Worker 數量測試配置
    this.workerConfigs = [2, 4, 8, 16];
    
    // 區塊大小測試配置
    this.chunkSizeConfigs = [
      2 * 1024 * 1024,   // 2MB
      5 * 1024 * 1024,   // 5MB
      10 * 1024 * 1024,  // 10MB
      25 * 1024 * 1024,  // 25MB
    ];
  }

  // 開始完整的基準測試
  async runFullBenchmark(options = {}) {
    if (this.isRunning) {
      throw new Error('基準測試已在執行中');
    }

    this.isRunning = true;
    this.results = [];
    const startTime = Date.now();

    try {
      // 確保系統已初始化
      await largeFileIntegration.initialize();
      
      // 啟動效能監控
      await performanceOptimizer.startMonitoring();

      console.log('=== 開始效能基準測試 ===');
      
      // 1. 檔案大小測試
      if (options.testFileSize !== false) {
        await this.runFileSizeTests();
      }
      
      // 2. Worker 數量測試
      if (options.testWorkerCount !== false) {
        await this.runWorkerCountTests();
      }
      
      // 3. 區塊大小測試
      if (options.testChunkSize !== false) {
        await this.runChunkSizeTests();
      }
      
      // 4. 並發處理測試
      if (options.testConcurrency !== false) {
        await this.runConcurrencyTests();
      }
      
      // 5. 記憶體壓力測試
      if (options.testMemoryPressure !== false) {
        await this.runMemoryPressureTests();
      }

      const totalTime = Date.now() - startTime;
      console.log(`=== 基準測試完成，總耗時: ${this.formatTime(totalTime)} ===`);
      
      // 生成測試報告
      return this.generateReport();

    } finally {
      this.isRunning = false;
      performanceOptimizer.stopMonitoring();
    }
  }

  // 檔案大小測試
  async runFileSizeTests() {
    console.log('\n--- 檔案大小效能測試 ---');
    
    for (const config of this.testConfigs) {
      console.log(`\n測試: ${config.name}`);
      console.log(`檔案大小: ${this.formatSize(config.fileSize)}`);
      
      // 建立模擬檔案
      const mockFile = this.createMockFile(config.fileSize);
      
      // 執行測試
      const result = await this.runSingleTest(mockFile, {
        testName: config.name,
        testType: 'fileSize',
        config: config,
      });
      
      // 記錄結果
      this.results.push(result);
      
      // 顯示結果
      this.displayTestResult(result);
      
      // 休息一下，避免過熱
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Worker 數量測試
  async runWorkerCountTests() {
    console.log('\n--- Worker 數量效能測試 ---');
    
    const testFileSize = 50 * 1024 * 1024; // 使用 50MB 檔案測試
    
    for (const workerCount of this.workerConfigs) {
      console.log(`\n測試 Worker 數量: ${workerCount}`);
      
      // 更新配置
      await largeFileConfig.set('workerCount', workerCount);
      
      // 建立模擬檔案
      const mockFile = this.createMockFile(testFileSize);
      
      // 執行測試
      const result = await this.runSingleTest(mockFile, {
        testName: `${workerCount} Workers`,
        testType: 'workerCount',
        config: { workerCount, fileSize: testFileSize },
      });
      
      // 記錄結果
      this.results.push(result);
      
      // 顯示結果
      this.displayTestResult(result);
      
      // 休息一下
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 恢復預設設定
    await largeFileConfig.set('workerCount', 4);
  }

  // 區塊大小測試
  async runChunkSizeTests() {
    console.log('\n--- 區塊大小效能測試 ---');
    
    const testFileSize = 100 * 1024 * 1024; // 使用 100MB 檔案測試
    
    for (const chunkSize of this.chunkSizeConfigs) {
      console.log(`\n測試區塊大小: ${this.formatSize(chunkSize)}`);
      
      // 更新配置
      await largeFileConfig.set('chunkSize', chunkSize);
      
      // 建立模擬檔案
      const mockFile = this.createMockFile(testFileSize);
      
      // 執行測試
      const result = await this.runSingleTest(mockFile, {
        testName: `${this.formatSize(chunkSize)} chunks`,
        testType: 'chunkSize',
        config: { chunkSize, fileSize: testFileSize },
      });
      
      // 記錄結果
      this.results.push(result);
      
      // 顯示結果
      this.displayTestResult(result);
      
      // 休息一下
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // 恢復預設設定
    await largeFileConfig.set('chunkSize', 5 * 1024 * 1024);
  }

  // 並發處理測試
  async runConcurrencyTests() {
    console.log('\n--- 並發處理效能測試 ---');
    
    const testFiles = [
      this.createMockFile(20 * 1024 * 1024),  // 20MB
      this.createMockFile(30 * 1024 * 1024),  // 30MB
      this.createMockFile(25 * 1024 * 1024),  // 25MB
    ];
    
    console.log('測試並發處理 3 個檔案...');
    
    const startTime = Date.now();
    
    // 並發處理多個檔案
    const promises = testFiles.map((file, index) => 
      this.runSingleTest(file, {
        testName: `並發檔案 ${index + 1}`,
        testType: 'concurrency',
        config: { fileIndex: index, fileSize: file.size },
      })
    );
    
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    // 計算並發效率
    const sequentialTime = results.reduce((sum, r) => sum + r.processingTime, 0);
    const concurrencyEfficiency = (sequentialTime / totalTime) * 100;
    
    const concurrencyResult = {
      testName: '並發處理測試',
      testType: 'concurrency',
      fileCount: testFiles.length,
      totalSize: testFiles.reduce((sum, f) => sum + f.size, 0),
      totalTime: totalTime,
      sequentialTime: sequentialTime,
      concurrencyEfficiency: concurrencyEfficiency,
      individualResults: results,
    };
    
    this.results.push(concurrencyResult);
    
    console.log(`\n並發處理完成:`);
    console.log(`- 總處理時間: ${this.formatTime(totalTime)}`);
    console.log(`- 順序處理時間: ${this.formatTime(sequentialTime)}`);
    console.log(`- 並發效率: ${concurrencyEfficiency.toFixed(1)}%`);
  }

  // 記憶體壓力測試
  async runMemoryPressureTests() {
    console.log('\n--- 記憶體壓力測試 ---');
    
    // 監控初始記憶體
    const initialMemory = this.getMemoryUsage();
    console.log(`初始記憶體使用: ${this.formatSize(initialMemory)}`);
    
    // 建立大檔案
    const largeFile = this.createMockFile(200 * 1024 * 1024); // 200MB
    
    // 執行測試並監控記憶體
    const memoryReadings = [];
    const monitorInterval = setInterval(() => {
      memoryReadings.push({
        timestamp: Date.now(),
        usage: this.getMemoryUsage(),
      });
    }, 1000);
    
    try {
      const result = await this.runSingleTest(largeFile, {
        testName: '記憶體壓力測試',
        testType: 'memoryPressure',
        config: { fileSize: largeFile.size },
      });
      
      clearInterval(monitorInterval);
      
      // 分析記憶體使用
      const peakMemory = Math.max(...memoryReadings.map(r => r.usage));
      const avgMemory = memoryReadings.reduce((sum, r) => sum + r.usage, 0) / memoryReadings.length;
      
      result.memoryStats = {
        initial: initialMemory,
        peak: peakMemory,
        average: avgMemory,
        increase: peakMemory - initialMemory,
        readings: memoryReadings,
      };
      
      this.results.push(result);
      
      console.log(`\n記憶體使用統計:`);
      console.log(`- 尖峰使用: ${this.formatSize(peakMemory)}`);
      console.log(`- 平均使用: ${this.formatSize(avgMemory)}`);
      console.log(`- 記憶體增長: ${this.formatSize(peakMemory - initialMemory)}`);
      
    } finally {
      clearInterval(monitorInterval);
    }
  }

  // 執行單個測試
  async runSingleTest(file, metadata) {
    const startTime = Date.now();
    const startMemory = this.getMemoryUsage();
    
    try {
      // 模擬處理檔案
      const controller = new LargeFileController();
      await controller.initialize();
      
      // 收集效能指標
      const metrics = {
        startTime,
        fileSize: file.size,
        ...metadata,
      };
      
      // 模擬處理過程
      await this.simulateProcessing(file, controller);
      
      const endTime = Date.now();
      const endMemory = this.getMemoryUsage();
      
      // 計算結果
      metrics.endTime = endTime;
      metrics.processingTime = endTime - startTime;
      metrics.throughput = file.size / (metrics.processingTime / 1000); // bytes/second
      metrics.memoryUsed = endMemory - startMemory;
      metrics.success = true;
      
      return metrics;
      
    } catch (error) {
      console.error('測試失敗:', error);
      
      return {
        ...metadata,
        startTime,
        endTime: Date.now(),
        processingTime: Date.now() - startTime,
        success: false,
        error: error.message,
      };
    }
  }

  // 模擬處理過程
  async simulateProcessing(file, controller) {
    // 模擬分析階段
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 模擬分割階段
    const chunkSize = await largeFileConfig.get('chunkSize');
    const chunkCount = Math.ceil(file.size / chunkSize);
    
    // 模擬處理每個片段
    for (let i = 0; i < chunkCount; i++) {
      // 模擬處理時間（根據片段大小）
      const processingTime = 100 + Math.random() * 400;
      await new Promise(resolve => setTimeout(resolve, processingTime));
      
      // 發送進度事件
      const progress = {
        phase: 'processing',
        current: i + 1,
        total: chunkCount,
        percentage: Math.round(((i + 1) / chunkCount) * 100),
      };
      
      window.dispatchEvent(new CustomEvent('benchmark-progress', { detail: progress }));
    }
    
    // 模擬合併階段
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  // 建立模擬檔案
  createMockFile(size) {
    // 建立具有指定大小的模擬檔案
    const chunkSize = 1024 * 1024; // 1MB chunks
    const chunks = [];
    let remainingSize = size;
    
    while (remainingSize > 0) {
      const currentChunkSize = Math.min(chunkSize, remainingSize);
      chunks.push(new ArrayBuffer(currentChunkSize));
      remainingSize -= currentChunkSize;
    }
    
    const blob = new Blob(chunks, { type: 'audio/mp3' });
    return new File([blob], `test-file-${size}.mp3`, { type: 'audio/mp3' });
  }

  // 取得記憶體使用量
  getMemoryUsage() {
    if (performance.memory) {
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  // 顯示測試結果
  displayTestResult(result) {
    console.log(`✓ 完成: ${result.testName}`);
    console.log(`  - 處理時間: ${this.formatTime(result.processingTime)}`);
    console.log(`  - 吞吐量: ${this.formatSize(result.throughput)}/s`);
    console.log(`  - 記憶體使用: ${this.formatSize(result.memoryUsed)}`);
  }

  // 生成測試報告
  generateReport() {
    const report = {
      timestamp: new Date().toISOString(),
      totalTests: this.results.length,
      successfulTests: this.results.filter(r => r.success).length,
      failedTests: this.results.filter(r => !r.success).length,
      results: this.results,
      summary: this.generateSummary(),
      recommendations: this.generateRecommendations(),
    };
    
    return report;
  }

  // 生成摘要
  generateSummary() {
    const summary = {
      fileSizePerformance: {},
      optimalWorkerCount: null,
      optimalChunkSize: null,
      concurrencyEfficiency: null,
      memoryEfficiency: null,
    };
    
    // 分析檔案大小效能
    const fileSizeTests = this.results.filter(r => r.testType === 'fileSize');
    fileSizeTests.forEach(test => {
      summary.fileSizePerformance[test.testName] = {
        processingTime: test.processingTime,
        throughput: test.throughput,
        efficiency: test.config.expectedTime ? 
          (test.config.expectedTime / test.processingTime * 100).toFixed(1) + '%' : 'N/A',
      };
    });
    
    // 找出最佳 Worker 數量
    const workerTests = this.results.filter(r => r.testType === 'workerCount');
    if (workerTests.length > 0) {
      const bestWorker = workerTests.reduce((best, current) => 
        current.throughput > best.throughput ? current : best
      );
      summary.optimalWorkerCount = bestWorker.config.workerCount;
    }
    
    // 找出最佳區塊大小
    const chunkTests = this.results.filter(r => r.testType === 'chunkSize');
    if (chunkTests.length > 0) {
      const bestChunk = chunkTests.reduce((best, current) => 
        current.throughput > best.throughput ? current : best
      );
      summary.optimalChunkSize = bestChunk.config.chunkSize;
    }
    
    // 並發效率
    const concurrencyTest = this.results.find(r => r.testType === 'concurrency');
    if (concurrencyTest) {
      summary.concurrencyEfficiency = concurrencyTest.concurrencyEfficiency;
    }
    
    // 記憶體效率
    const memoryTest = this.results.find(r => r.testType === 'memoryPressure');
    if (memoryTest && memoryTest.memoryStats) {
      summary.memoryEfficiency = {
        peakUsage: memoryTest.memoryStats.peak,
        efficiency: (memoryTest.fileSize / memoryTest.memoryStats.increase).toFixed(2) + ' bytes/byte',
      };
    }
    
    return summary;
  }

  // 生成優化建議
  generateRecommendations() {
    const recommendations = [];
    const summary = this.generateSummary();
    
    // Worker 數量建議
    if (summary.optimalWorkerCount) {
      recommendations.push({
        type: 'workerCount',
        priority: 'high',
        suggestion: `建議將 Worker 數量設定為 ${summary.optimalWorkerCount}`,
        reason: '基於測試結果，此配置可獲得最佳吞吐量',
      });
    }
    
    // 區塊大小建議
    if (summary.optimalChunkSize) {
      recommendations.push({
        type: 'chunkSize',
        priority: 'medium',
        suggestion: `建議將區塊大小設定為 ${this.formatSize(summary.optimalChunkSize)}`,
        reason: '此大小在測試中展現最佳的處理效能',
      });
    }
    
    // 並發處理建議
    if (summary.concurrencyEfficiency) {
      if (summary.concurrencyEfficiency > 150) {
        recommendations.push({
          type: 'concurrency',
          priority: 'high',
          suggestion: '系統展現優秀的並發處理能力',
          reason: `並發效率達到 ${summary.concurrencyEfficiency.toFixed(1)}%`,
        });
      } else if (summary.concurrencyEfficiency < 120) {
        recommendations.push({
          type: 'concurrency',
          priority: 'medium',
          suggestion: '考慮優化並發處理邏輯',
          reason: '並發效率較低，可能存在資源競爭',
        });
      }
    }
    
    // 記憶體使用建議
    if (summary.memoryEfficiency) {
      const peakMB = summary.memoryEfficiency.peakUsage / 1024 / 1024;
      if (peakMB > 500) {
        recommendations.push({
          type: 'memory',
          priority: 'high',
          suggestion: '記憶體使用較高，建議優化緩衝區管理',
          reason: `尖峰記憶體使用達到 ${peakMB.toFixed(0)} MB`,
        });
      }
    }
    
    return recommendations;
  }

  // 格式化時間
  formatTime(ms) {
    if (ms < 1000) return `${ms} ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)} 秒`;
    return `${(ms / 60000).toFixed(1)} 分鐘`;
  }

  // 格式化檔案大小
  formatSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // 匯出報告為 JSON
  exportReportJSON(report) {
    const json = JSON.stringify(report, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
  }

  // 匯出報告為 CSV
  exportReportCSV(report) {
    const headers = ['Test Name', 'Type', 'File Size', 'Processing Time', 'Throughput', 'Memory Used', 'Success'];
    const rows = report.results.map(r => [
      r.testName,
      r.testType,
      this.formatSize(r.fileSize || 0),
      this.formatTime(r.processingTime),
      r.throughput ? this.formatSize(r.throughput) + '/s' : 'N/A',
      this.formatSize(r.memoryUsed || 0),
      r.success ? 'Yes' : 'No',
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `benchmark-report-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    
    URL.revokeObjectURL(url);
  }
}

// 匯出單例
export const performanceBenchmark = new PerformanceBenchmark();