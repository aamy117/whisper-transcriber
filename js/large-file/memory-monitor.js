/**
 * 記憶體監控器（模擬實現）
 * 
 * 這是一個臨時的模擬實現，用於測試控制器
 * 真實實現將在後續階段完成
 */

export class MemoryMonitor {
  constructor() {
    this.initialized = true;
    this.monitoring = false;
  }
  
  /**
   * 獲取記憶體狀態（模擬實現）
   */
  async getStatus() {
    // 檢查是否支援 performance.memory
    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const total = performance.memory.jsHeapSizeLimit;
      const available = total - used;
      
      return {
        available: available > 100 * 1024 * 1024, // 可用記憶體大於 100MB
        usedMB: Math.round(used / 1024 / 1024),
        totalMB: Math.round(total / 1024 / 1024),
        availableMB: Math.round(available / 1024 / 1024),
        percentage: Math.round((used / total) * 100)
      };
    }
    
    // 降級返回模擬資料
    return {
      available: true,
      usedMB: 200,
      totalMB: 4096,
      availableMB: 3896,
      percentage: 5
    };
  }
  
  /**
   * 開始監控
   */
  startMonitoring(interval = 1000) {
    if (this.monitoring) return;
    
    this.monitoring = true;
    this.monitorInterval = setInterval(async () => {
      const status = await this.getStatus();
      
      // 如果記憶體使用超過 80%，觸發警告
      if (status.percentage > 80) {
        console.warn('記憶體使用率過高:', status);
      }
    }, interval);
  }
  
  /**
   * 停止監控
   */
  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
      this.monitoring = false;
    }
  }
}