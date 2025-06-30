/**
 * 記憶體監控器
 * 負責監控和管理記憶體使用，防止記憶體溢出
 */

import { LargeFileConfig } from './large-file-config.js';

export class MemoryMonitor {
  constructor() {
    this.config = LargeFileConfig.getInstance();
    
    // 記憶體限制配置
    this.maxMemoryUsageMB = this.config.get('memory.maxMemoryUsageMB') || 200;
    this.gcThresholdMB = this.config.get('memory.gcThresholdMB') || 150;
    this.checkInterval = this.config.get('memory.memoryCheckInterval') || 1000;
    
    // 監控狀態
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.callbacks = new Set();
    
    // 記憶體使用追蹤
    this.memoryUsage = {
      current: 0,
      peak: 0,
      average: 0,
      samples: [],
      allocations: new Map(),
      warnings: 0,
      gcTriggered: 0
    };
    
    // 效能觀察器
    this.performanceObserver = null;
    this.supportsMemoryAPI = 'memory' in performance;
    
    // 相容性
    this.initialized = true;
    this.monitoring = false;
  }

  /**
   * 開始監控
   */
  startMonitoring(interval) {
    if (interval) {
      this.checkInterval = interval;
    }
    
    if (this.isMonitoring) {
      return;
    }

    this.isMonitoring = true;
    this.monitoring = true;
    console.log('記憶體監控器已啟動');

    // 設置效能觀察器（如果支援）
    if (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes.includes('measure')) {
      this.setupPerformanceObserver();
    }

    // 開始定期檢查
    this.monitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, this.checkInterval);

    // 立即執行一次檢查
    this.checkMemoryUsage();
  }

  /**
   * 停止監控
   */
  stopMonitoring() {
    if (!this.isMonitoring) {
      return;
    }

    this.isMonitoring = false;
    this.monitoring = false;
    
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }

    console.log('記憶體監控器已停止');
  }

  /**
   * 設置效能觀察器
   */
  setupPerformanceObserver() {
    try {
      this.performanceObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'measure') {
            console.log(`效能測量: ${entry.name} - ${entry.duration.toFixed(2)}ms`);
          }
        }
      });
      
      this.performanceObserver.observe({ entryTypes: ['measure'] });
    } catch (error) {
      console.warn('效能觀察器設置失敗:', error);
    }
  }

  /**
   * 檢查記憶體使用情況
   */
  async checkMemoryUsage() {
    const usage = await this.getMemoryUsage();
    
    // 更新使用記錄
    this.updateUsageRecord(usage);
    
    // 檢查是否超過閾值
    if (usage.usedMB > this.maxMemoryUsageMB) {
      this.handleMemoryExceeded(usage);
    } else if (usage.usedMB > this.gcThresholdMB) {
      this.handleMemoryWarning(usage);
    }
    
    // 通知監聽器
    this.notifyListeners({
      type: 'update',
      usage: usage,
      stats: this.getStatistics()
    });
  }

  /**
   * 獲取記憶體使用情況（相容舊介面）
   */
  async getStatus() {
    const usage = await this.getMemoryUsage();
    return {
      available: usage.usedMB < this.gcThresholdMB,
      usedMB: Math.round(usage.usedMB),
      totalMB: Math.round(usage.totalMB || this.maxMemoryUsageMB),
      availableMB: Math.round((usage.totalMB || this.maxMemoryUsageMB) - usage.usedMB),
      percentage: Math.round(usage.percentUsed)
    };
  }

  /**
   * 獲取記憶體使用情況
   */
  async getMemoryUsage() {
    const usage = {
      timestamp: Date.now(),
      usedMB: 0,
      totalMB: 0,
      percentUsed: 0,
      jsHeapUsed: 0,
      jsHeapTotal: 0
    };

    // 使用 Performance Memory API（如果可用）
    if (this.supportsMemoryAPI && performance.memory) {
      usage.jsHeapUsed = performance.memory.usedJSHeapSize;
      usage.jsHeapTotal = performance.memory.totalJSHeapSize;
      usage.usedMB = usage.jsHeapUsed / (1024 * 1024);
      usage.totalMB = usage.jsHeapTotal / (1024 * 1024);
      
      if (performance.memory.jsHeapSizeLimit) {
        usage.limitMB = performance.memory.jsHeapSizeLimit / (1024 * 1024);
        usage.percentUsed = (usage.usedMB / usage.limitMB) * 100;
      }
    } else {
      // 降級方案：估算記憶體使用
      usage.usedMB = this.estimateMemoryUsage();
      usage.totalMB = this.maxMemoryUsageMB;
      usage.percentUsed = (usage.usedMB / usage.totalMB) * 100;
    }

    return usage;
  }

  /**
   * 估算記憶體使用（降級方案）
   */
  estimateMemoryUsage() {
    let totalSize = 0;

    // 計算已追蹤的分配
    for (const [, allocation] of this.memoryUsage.allocations) {
      totalSize += allocation.size;
    }

    // 加上基礎使用量（估算）
    const baseUsage = 50; // 基礎 50MB
    
    return (totalSize / (1024 * 1024)) + baseUsage;
  }

  /**
   * 更新使用記錄
   */
  updateUsageRecord(usage) {
    this.memoryUsage.current = usage.usedMB;
    
    // 更新峰值
    if (usage.usedMB > this.memoryUsage.peak) {
      this.memoryUsage.peak = usage.usedMB;
    }
    
    // 保存樣本（保留最近100個）
    this.memoryUsage.samples.push(usage);
    if (this.memoryUsage.samples.length > 100) {
      this.memoryUsage.samples.shift();
    }
    
    // 計算平均值
    const sum = this.memoryUsage.samples.reduce((acc, s) => acc + s.usedMB, 0);
    this.memoryUsage.average = sum / this.memoryUsage.samples.length;
  }

  /**
   * 處理記憶體超限
   */
  handleMemoryExceeded(usage) {
    console.error(`記憶體使用超限: ${usage.usedMB.toFixed(2)}MB / ${this.maxMemoryUsageMB}MB`);
    
    this.memoryUsage.warnings++;
    
    // 觸發緊急垃圾回收
    this.triggerGarbageCollection();
    
    // 通知監聽器
    this.notifyListeners({
      type: 'exceeded',
      usage: usage,
      action: 'gc_triggered'
    });
    
    // 如果還是超限，可能需要更激進的措施
    setTimeout(async () => {
      const newUsage = await this.getMemoryUsage();
      if (newUsage.usedMB > this.maxMemoryUsageMB) {
        this.notifyListeners({
          type: 'critical',
          usage: newUsage,
          action: 'need_cleanup'
        });
      }
    }, 1000);
  }

  /**
   * 處理記憶體警告
   */
  handleMemoryWarning(usage) {
    console.warn(`記憶體使用接近閾值: ${usage.usedMB.toFixed(2)}MB / ${this.gcThresholdMB}MB`);
    
    this.memoryUsage.warnings++;
    
    // 建議進行垃圾回收
    if (this.memoryUsage.warnings % 3 === 0) { // 每3次警告觸發一次
      this.triggerGarbageCollection();
    }
    
    // 通知監聽器
    this.notifyListeners({
      type: 'warning',
      usage: usage
    });
  }

  /**
   * 觸發垃圾回收（如果可能）
   */
  triggerGarbageCollection() {
    this.memoryUsage.gcTriggered++;
    
    // 瀏覽器中無法直接觸發 GC，但可以做一些操作來幫助
    // 1. 清理未使用的引用
    this.cleanupAllocations();
    
    // 2. 建議瀏覽器進行 GC（透過創建和釋放大物件）
    if (this.memoryUsage.gcTriggered % 5 === 0) { // 每5次執行一次
      this.forceMemoryPressure();
    }
    
    console.log('已嘗試觸發垃圾回收');
  }

  /**
   * 清理未使用的分配
   */
  cleanupAllocations() {
    const now = Date.now();
    const timeout = 60000; // 60秒未使用
    
    for (const [id, allocation] of this.memoryUsage.allocations) {
      if (now - allocation.lastAccess > timeout && !allocation.persistent) {
        this.memoryUsage.allocations.delete(id);
      }
    }
  }

  /**
   * 強制記憶體壓力（幫助觸發 GC）
   */
  forceMemoryPressure() {
    try {
      // 創建臨時大陣列
      const tempArrays = [];
      for (let i = 0; i < 10; i++) {
        tempArrays.push(new ArrayBuffer(1024 * 1024)); // 1MB
      }
      
      // 立即釋放
      tempArrays.length = 0;
    } catch (e) {
      // 忽略錯誤
    }
  }

  /**
   * 註冊記憶體分配
   */
  registerAllocation(id, size, options = {}) {
    const allocation = {
      id: id,
      size: size,
      createdAt: Date.now(),
      lastAccess: Date.now(),
      persistent: options.persistent || false,
      type: options.type || 'generic',
      metadata: options.metadata || {}
    };
    
    this.memoryUsage.allocations.set(id, allocation);
    
    // 立即檢查記憶體
    if (size > 10 * 1024 * 1024) { // 大於10MB
      this.checkMemoryUsage();
    }
    
    return id;
  }

  /**
   * 更新分配存取時間
   */
  touchAllocation(id) {
    const allocation = this.memoryUsage.allocations.get(id);
    if (allocation) {
      allocation.lastAccess = Date.now();
    }
  }

  /**
   * 註銷記憶體分配
   */
  unregisterAllocation(id) {
    const allocation = this.memoryUsage.allocations.get(id);
    if (allocation) {
      this.memoryUsage.allocations.delete(id);
      
      // 如果是大分配，建議進行檢查
      if (allocation.size > 10 * 1024 * 1024) {
        setTimeout(() => this.checkMemoryUsage(), 100);
      }
    }
  }

  /**
   * 添加監聽器
   */
  addListener(callback) {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * 通知監聽器
   */
  notifyListeners(event) {
    for (const callback of this.callbacks) {
      try {
        callback(event);
      } catch (error) {
        console.error('記憶體監控回調錯誤:', error);
      }
    }
  }

  /**
   * 獲取記憶體統計資訊
   */
  getStatistics() {
    const samples = this.memoryUsage.samples;
    const recentSamples = samples.slice(-10);
    
    return {
      current: this.memoryUsage.current,
      peak: this.memoryUsage.peak,
      average: this.memoryUsage.average,
      trend: this.calculateTrend(recentSamples),
      allocations: {
        count: this.memoryUsage.allocations.size,
        totalSize: Array.from(this.memoryUsage.allocations.values())
          .reduce((sum, a) => sum + a.size, 0)
      },
      warnings: this.memoryUsage.warnings,
      gcTriggered: this.memoryUsage.gcTriggered,
      health: this.getMemoryHealth()
    };
  }

  /**
   * 計算記憶體使用趨勢
   */
  calculateTrend(samples) {
    if (samples.length < 2) {
      return 'stable';
    }
    
    const firstHalf = samples.slice(0, Math.floor(samples.length / 2));
    const secondHalf = samples.slice(Math.floor(samples.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, s) => sum + s.usedMB, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, s) => sum + s.usedMB, 0) / secondHalf.length;
    
    const change = ((secondAvg - firstAvg) / firstAvg) * 100;
    
    if (change > 10) return 'increasing';
    if (change < -10) return 'decreasing';
    return 'stable';
  }

  /**
   * 獲取記憶體健康狀態
   */
  getMemoryHealth() {
    const usage = this.memoryUsage.current;
    const threshold = this.gcThresholdMB;
    const max = this.maxMemoryUsageMB;
    
    if (usage < threshold * 0.5) return 'excellent';
    if (usage < threshold * 0.8) return 'good';
    if (usage < threshold) return 'fair';
    if (usage < max) return 'poor';
    return 'critical';
  }

  /**
   * 產生記憶體報告
   */
  generateReport() {
    const stats = this.getStatistics();
    const allocations = Array.from(this.memoryUsage.allocations.values())
      .sort((a, b) => b.size - a.size)
      .slice(0, 10); // 前10大分配
    
    return {
      timestamp: Date.now(),
      summary: {
        currentUsage: `${stats.current.toFixed(2)} MB`,
        peakUsage: `${stats.peak.toFixed(2)} MB`,
        averageUsage: `${stats.average.toFixed(2)} MB`,
        health: stats.health,
        trend: stats.trend
      },
      allocations: {
        total: stats.allocations.count,
        totalSizeMB: (stats.allocations.totalSize / (1024 * 1024)).toFixed(2),
        top10: allocations.map(a => ({
          id: a.id,
          type: a.type,
          sizeMB: (a.size / (1024 * 1024)).toFixed(2),
          age: Date.now() - a.createdAt,
          lastAccess: Date.now() - a.lastAccess
        }))
      },
      performance: {
        warnings: stats.warnings,
        gcTriggered: stats.gcTriggered,
        monitoringDuration: this.memoryUsage.samples.length * this.checkInterval
      }
    };
  }

  /**
   * 清理資源
   */
  cleanup() {
    this.stopMonitoring();
    this.callbacks.clear();
    this.memoryUsage.allocations.clear();
    this.memoryUsage.samples = [];
  }
}

// 匯出單例
let instance = null;

export function getMemoryMonitor() {
  if (!instance) {
    instance = new MemoryMonitor();
  }
  return instance;
}