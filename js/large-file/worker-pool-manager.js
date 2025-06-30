/**
 * Worker 池管理器
 * 負責管理 Web Worker 的生命週期、任務分配和負載平衡
 */

export class WorkerPoolManager {
  constructor(options = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || navigator.hardwareConcurrency || 4,
      workerPath: options.workerPath || '/js/workers/transcription-worker.js',
      taskTimeout: options.taskTimeout || 300000, // 5分鐘超時
      idleTimeout: options.idleTimeout || 60000,  // 1分鐘閒置超時
      ...options
    };

    this.workers = [];
    this.availableWorkers = [];
    this.taskQueue = [];
    this.activeTasks = new Map();
    this.workerStats = new Map();
    this.isInitialized = false;
    this.isTerminating = false;
  }

  /**
   * 初始化 Worker 池
   */
  async initialize() {
    if (this.isInitialized) {
      return;
    }

    console.log(`初始化 Worker 池，最大 Worker 數：${this.options.maxWorkers}`);

    // 創建初始 Worker
    const initialWorkers = Math.min(2, this.options.maxWorkers); // 初始創建2個
    for (let i = 0; i < initialWorkers; i++) {
      await this.createWorker();
    }

    this.isInitialized = true;
    console.log(`Worker 池初始化完成，當前 Worker 數：${this.workers.length}`);
  }

  /**
   * 創建新的 Worker
   */
  async createWorker() {
    if (this.workers.length >= this.options.maxWorkers) {
      return null;
    }

    try {
      const worker = new Worker(this.options.workerPath, { type: 'module' });
      const workerId = `worker-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Worker 狀態
      const workerInfo = {
        id: workerId,
        worker: worker,
        status: 'idle',
        currentTask: null,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
        taskCount: 0,
        errorCount: 0
      };

      // 設置 Worker 消息處理
      worker.onmessage = (event) => {
        this.handleWorkerMessage(workerId, event.data);
      };

      worker.onerror = (error) => {
        this.handleWorkerError(workerId, error);
      };

      // 初始化 Worker
      await this.sendToWorker(worker, {
        type: 'init',
        id: workerId,
        options: {
          timeout: this.options.taskTimeout
        }
      });

      this.workers.push(workerInfo);
      this.availableWorkers.push(workerInfo);
      this.workerStats.set(workerId, {
        totalTasks: 0,
        successfulTasks: 0,
        failedTasks: 0,
        totalProcessingTime: 0
      });

      console.log(`創建 Worker：${workerId}`);
      return workerInfo;
    } catch (error) {
      console.error('創建 Worker 失敗:', error);
      throw error;
    }
  }

  /**
   * 執行任務
   */
  async executeTask(task, options = {}) {
    if (this.isTerminating) {
      throw new Error('Worker 池正在終止');
    }

    // 創建任務包裝
    const taskWrapper = {
      id: task.id || `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      task: task,
      options: options,
      promise: null,
      resolve: null,
      reject: null,
      startTime: Date.now(),
      timeoutId: null
    };

    // 創建任務 Promise
    taskWrapper.promise = new Promise((resolve, reject) => {
      taskWrapper.resolve = resolve;
      taskWrapper.reject = reject;
    });

    // 加入任務隊列
    this.taskQueue.push(taskWrapper);
    this.processTaskQueue();

    return taskWrapper.promise;
  }

  /**
   * 處理任務隊列
   */
  async processTaskQueue() {
    while (this.taskQueue.length > 0 && !this.isTerminating) {
      // 獲取可用的 Worker
      let worker = this.availableWorkers.shift();

      // 如果沒有可用 Worker，嘗試創建新的
      if (!worker && this.workers.length < this.options.maxWorkers) {
        worker = await this.createWorker();
        if (worker) {
          this.availableWorkers.shift(); // 從可用列表中移除（已經分配）
        }
      }

      // 如果還是沒有 Worker，等待
      if (!worker) {
        // 等待有 Worker 變為可用
        await new Promise(resolve => setTimeout(resolve, 100));
        continue;
      }

      // 分配任務
      const taskWrapper = this.taskQueue.shift();
      if (!taskWrapper) {
        // 任務已被取消或處理
        this.availableWorkers.push(worker);
        continue;
      }

      this.assignTaskToWorker(worker, taskWrapper);
    }
  }

  /**
   * 分配任務給 Worker
   */
  assignTaskToWorker(workerInfo, taskWrapper) {
    workerInfo.status = 'busy';
    workerInfo.currentTask = taskWrapper.id;
    workerInfo.lastActiveAt = Date.now();
    workerInfo.taskCount++;

    this.activeTasks.set(taskWrapper.id, {
      workerId: workerInfo.id,
      taskWrapper: taskWrapper
    });

    // 設置超時
    if (this.options.taskTimeout > 0) {
      taskWrapper.timeoutId = setTimeout(() => {
        this.handleTaskTimeout(taskWrapper.id);
      }, this.options.taskTimeout);
    }

    // 發送任務到 Worker
    this.sendToWorker(workerInfo.worker, {
      type: 'execute',
      taskId: taskWrapper.id,
      task: taskWrapper.task
    });

    console.log(`任務 ${taskWrapper.id} 分配給 Worker ${workerInfo.id}`);
  }

  /**
   * 處理 Worker 消息
   */
  handleWorkerMessage(workerId, message) {
    const workerInfo = this.workers.find(w => w.id === workerId);
    if (!workerInfo) {
      return;
    }

    switch (message.type) {
      case 'ready':
        console.log(`Worker ${workerId} 已就緒`);
        break;

      case 'progress':
        this.handleTaskProgress(message.taskId, message.progress);
        break;

      case 'result':
        this.handleTaskComplete(message.taskId, message.result);
        break;

      case 'error':
        this.handleTaskError(message.taskId, new Error(message.error));
        break;

      case 'log':
        console.log(`[Worker ${workerId}]`, message.message);
        break;

      default:
        console.warn(`未知的 Worker 消息類型：${message.type}`);
    }
  }

  /**
   * 處理任務進度
   */
  handleTaskProgress(taskId, progress) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return;
    }

    const { taskWrapper } = activeTask;
    if (taskWrapper.options.onProgress) {
      try {
        taskWrapper.options.onProgress(progress);
      } catch (error) {
        console.error('進度回調錯誤:', error);
      }
    }
  }

  /**
   * 處理任務完成
   */
  handleTaskComplete(taskId, result) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return;
    }

    const { workerId, taskWrapper } = activeTask;
    const workerInfo = this.workers.find(w => w.id === workerId);

    // 清理超時
    if (taskWrapper.timeoutId) {
      clearTimeout(taskWrapper.timeoutId);
    }

    // 更新統計
    const stats = this.workerStats.get(workerId);
    if (stats) {
      stats.totalTasks++;
      stats.successfulTasks++;
      stats.totalProcessingTime += Date.now() - taskWrapper.startTime;
    }

    // 解決 Promise
    taskWrapper.resolve(result);

    // 清理任務
    this.activeTasks.delete(taskId);
    
    // 釋放 Worker
    if (workerInfo) {
      workerInfo.status = 'idle';
      workerInfo.currentTask = null;
      workerInfo.lastActiveAt = Date.now();
      this.availableWorkers.push(workerInfo);
    }

    // 繼續處理隊列
    this.processTaskQueue();
  }

  /**
   * 處理任務錯誤
   */
  handleTaskError(taskId, error) {
    const activeTask = this.activeTasks.get(taskId);
    if (!activeTask) {
      return;
    }

    const { workerId, taskWrapper } = activeTask;
    const workerInfo = this.workers.find(w => w.id === workerId);

    // 清理超時
    if (taskWrapper.timeoutId) {
      clearTimeout(taskWrapper.timeoutId);
    }

    // 更新統計
    if (workerInfo) {
      workerInfo.errorCount++;
      const stats = this.workerStats.get(workerId);
      if (stats) {
        stats.totalTasks++;
        stats.failedTasks++;
      }
    }

    // 拒絕 Promise
    taskWrapper.reject(error);

    // 清理任務
    this.activeTasks.delete(taskId);

    // 釋放 Worker
    if (workerInfo) {
      workerInfo.status = 'idle';
      workerInfo.currentTask = null;
      this.availableWorkers.push(workerInfo);
    }

    // 繼續處理隊列
    this.processTaskQueue();
  }

  /**
   * 處理任務超時
   */
  handleTaskTimeout(taskId) {
    console.warn(`任務 ${taskId} 超時`);
    this.handleTaskError(taskId, new Error('任務執行超時'));
  }

  /**
   * 處理 Worker 錯誤
   */
  handleWorkerError(workerId, error) {
    console.error(`Worker ${workerId} 錯誤:`, error);
    
    const workerInfo = this.workers.find(w => w.id === workerId);
    if (!workerInfo) {
      return;
    }

    // 如果 Worker 有當前任務，標記為失敗
    if (workerInfo.currentTask) {
      this.handleTaskError(workerInfo.currentTask, error);
    }

    // 移除錯誤的 Worker
    this.removeWorker(workerId);

    // 創建替代 Worker
    if (this.workers.length < this.options.maxWorkers && !this.isTerminating) {
      this.createWorker().catch(console.error);
    }
  }

  /**
   * 移除 Worker
   */
  removeWorker(workerId) {
    const index = this.workers.findIndex(w => w.id === workerId);
    if (index === -1) {
      return;
    }

    const workerInfo = this.workers[index];
    
    // 終止 Worker
    try {
      workerInfo.worker.terminate();
    } catch (error) {
      console.error(`終止 Worker ${workerId} 失敗:`, error);
    }

    // 從列表中移除
    this.workers.splice(index, 1);
    this.availableWorkers = this.availableWorkers.filter(w => w.id !== workerId);
    this.workerStats.delete(workerId);

    console.log(`移除 Worker：${workerId}`);
  }

  /**
   * 發送消息到 Worker
   */
  async sendToWorker(worker, message) {
    return new Promise((resolve, reject) => {
      const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const handler = (event) => {
        if (event.data.messageId === messageId) {
          worker.removeEventListener('message', handler);
          resolve(event.data);
        }
      };

      worker.addEventListener('message', handler);
      worker.postMessage({ ...message, messageId });

      // 設置超時
      setTimeout(() => {
        worker.removeEventListener('message', handler);
        reject(new Error('Worker 響應超時'));
      }, 5000);
    });
  }

  /**
   * 取消所有任務
   */
  async cancelAllTasks() {
    // 清空任務隊列
    while (this.taskQueue.length > 0) {
      const taskWrapper = this.taskQueue.shift();
      if (taskWrapper.timeoutId) {
        clearTimeout(taskWrapper.timeoutId);
      }
      taskWrapper.reject(new Error('任務已取消'));
    }

    // 取消活動任務
    for (const [taskId, activeTask] of this.activeTasks) {
      const { taskWrapper } = activeTask;
      if (taskWrapper.timeoutId) {
        clearTimeout(taskWrapper.timeoutId);
      }
      taskWrapper.reject(new Error('任務已取消'));
    }

    this.activeTasks.clear();

    // 重置所有 Worker 狀態
    this.workers.forEach(workerInfo => {
      workerInfo.status = 'idle';
      workerInfo.currentTask = null;
    });

    this.availableWorkers = [...this.workers];
  }

  /**
   * 終止 Worker 池
   */
  async terminate() {
    this.isTerminating = true;

    // 取消所有任務
    await this.cancelAllTasks();

    // 終止所有 Worker
    for (const workerInfo of this.workers) {
      try {
        workerInfo.worker.terminate();
      } catch (error) {
        console.error(`終止 Worker ${workerInfo.id} 失敗:`, error);
      }
    }

    // 清理
    this.workers = [];
    this.availableWorkers = [];
    this.workerStats.clear();
    this.isInitialized = false;
    this.isTerminating = false;

    console.log('Worker 池已終止');
  }

  /**
   * 獲取狀態
   */
  getStatus() {
    const workerStatuses = this.workers.map(w => ({
      id: w.id,
      status: w.status,
      taskCount: w.taskCount,
      errorCount: w.errorCount,
      uptime: Date.now() - w.createdAt
    }));

    return {
      initialized: this.isInitialized,
      terminating: this.isTerminating,
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      busyWorkers: this.workers.length - this.availableWorkers.length,
      queuedTasks: this.taskQueue.length,
      activeTasks: this.activeTasks.size,
      workers: workerStatuses,
      stats: Object.fromEntries(this.workerStats)
    };
  }

  /**
   * 動態調整 Worker 數量
   */
  async autoScale() {
    if (this.isTerminating) {
      return;
    }

    const status = this.getStatus();

    // 如果隊列太長且還有容量，增加 Worker
    if (status.queuedTasks > status.availableWorkers * 2 && 
        status.totalWorkers < this.options.maxWorkers) {
      await this.createWorker();
    }

    // 如果有閒置太久的 Worker，移除它們
    const now = Date.now();
    const idleWorkers = this.workers.filter(w => 
      w.status === 'idle' && 
      now - w.lastActiveAt > this.options.idleTimeout
    );

    // 保留至少2個 Worker
    const workersToRemove = idleWorkers.slice(0, Math.max(0, this.workers.length - 2));
    workersToRemove.forEach(w => this.removeWorker(w.id));
  }
}