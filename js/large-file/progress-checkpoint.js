/**
 * 進度檢查點系統
 * 負責管理處理進度的保存和恢復，支援斷點續傳
 */

import { LargeFileConfig } from './large-file-config.js';

export class ProgressCheckpoint {
  constructor() {
    this.config = LargeFileConfig.getInstance();
    this.dbName = 'WhisperProgressDB';
    this.dbVersion = 1;
    this.storeName = 'checkpoints';
    this.db = null;
    this.autoSaveInterval = 5000; // 5秒自動保存
    this.autoSaveTimer = null;
    this.currentSession = null;
  }

  /**
   * 初始化 IndexedDB
   */
  async initialize() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('IndexedDB 開啟失敗:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('進度檢查點系統初始化完成');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // 建立檢查點儲存
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' });
          
          // 建立索引
          store.createIndex('fileHash', 'fileHash', { unique: false });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
          store.createIndex('updatedAt', 'updatedAt', { unique: false });
        }
      };
    });
  }

  /**
   * 建立新的處理會話
   */
  async createSession(file, options = {}) {
    const fileHash = await this.calculateFileHash(file);
    
    // 檢查是否有未完成的會話
    const existingSession = await this.findUnfinishedSession(fileHash);
    if (existingSession && options.resumeIfExists) {
      console.log('找到未完成的會話，準備恢復');
      this.currentSession = existingSession;
      return existingSession;
    }

    // 建立新會話
    const session = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileHash: fileHash,
      fileName: file.name,
      fileSize: file.size,
      fileMimeType: file.type,
      status: 'initialized',
      progress: {
        overall: 0,
        segments: [],
        completedSegments: [],
        failedSegments: [],
        currentSegment: null
      },
      options: options,
      metadata: {
        totalSegments: 0,
        processedSegments: 0,
        totalDuration: 0,
        processedDuration: 0,
        startTime: null,
        endTime: null,
        pausedTime: 0
      },
      results: {
        transcripts: [],
        mergedTranscript: null
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.saveSession(session);
    this.currentSession = session;
    
    // 啟動自動保存
    this.startAutoSave();
    
    return session;
  }

  /**
   * 計算檔案雜湊值（用於識別相同檔案）
   */
  async calculateFileHash(file) {
    const chunkSize = 1024 * 1024; // 1MB
    const chunks = Math.min(5, Math.ceil(file.size / chunkSize)); // 最多讀取5個chunks
    const positions = [];
    
    // 選擇要讀取的位置（開頭、結尾、中間幾個點）
    for (let i = 0; i < chunks; i++) {
      const position = Math.floor((file.size - chunkSize) * (i / (chunks - 1)));
      positions.push(Math.max(0, position));
    }

    // 讀取並合併這些chunks
    const buffers = await Promise.all(
      positions.map(pos => this.readFileChunk(file, pos, chunkSize))
    );

    // 合併所有buffer
    const combinedBuffer = new Uint8Array(
      buffers.reduce((total, buf) => total + buf.byteLength, 0)
    );
    let offset = 0;
    for (const buffer of buffers) {
      combinedBuffer.set(new Uint8Array(buffer), offset);
      offset += buffer.byteLength;
    }

    // 計算雜湊
    const hashBuffer = await crypto.subtle.digest('SHA-256', combinedBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // 加入檔案大小和名稱以增加唯一性
    return `${hashHex}-${file.size}-${file.name}`;
  }

  /**
   * 讀取檔案片段
   */
  readFileChunk(file, start, length) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      const blob = file.slice(start, Math.min(start + length, file.size));
      
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
  }

  /**
   * 查找未完成的會話
   */
  async findUnfinishedSession(fileHash) {
    // 確保資料庫已初始化
    if (!this.db) {
      await this.initialize();
    }
    
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const index = store.index('fileHash');
      const request = index.getAll(fileHash);

      request.onsuccess = () => {
        const sessions = request.result;
        // 找到最新的未完成會話
        const unfinished = sessions
          .filter(s => s.status !== 'completed' && s.status !== 'failed')
          .sort((a, b) => b.updatedAt - a.updatedAt)[0];
        
        resolve(unfinished || null);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 保存會話
   */
  async saveSession(session) {
    // 確保資料庫已初始化
    if (!this.db) {
      await this.initialize();
    }
    
    return new Promise((resolve, reject) => {
      session.updatedAt = Date.now();
      
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put(session);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 更新進度
   */
  async updateProgress(progressData) {
    if (!this.currentSession) {
      throw new Error('沒有活動的會話');
    }

    // 更新進度資訊
    Object.assign(this.currentSession.progress, progressData);
    
    // 更新元資料
    if (progressData.processedSegments !== undefined) {
      this.currentSession.metadata.processedSegments = progressData.processedSegments;
    }
    
    if (progressData.processedDuration !== undefined) {
      this.currentSession.metadata.processedDuration = progressData.processedDuration;
    }

    // 如果有新的完成片段，加入結果
    if (progressData.newCompletedSegment) {
      this.currentSession.results.transcripts.push(progressData.newCompletedSegment);
    }

    // 保存（自動保存會處理）
    this.markSessionDirty();
  }

  /**
   * 標記會話需要保存
   */
  markSessionDirty() {
    if (!this.autoSaveTimer) {
      this.startAutoSave();
    }
  }

  /**
   * 啟動自動保存
   */
  startAutoSave() {
    this.stopAutoSave();
    
    this.autoSaveTimer = setInterval(async () => {
      if (this.currentSession) {
        try {
          await this.saveSession(this.currentSession);
          console.log('自動保存進度完成');
        } catch (error) {
          console.error('自動保存失敗:', error);
        }
      }
    }, this.autoSaveInterval);
  }

  /**
   * 停止自動保存
   */
  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * 暫停處理
   */
  async pauseSession() {
    if (!this.currentSession) return;

    this.currentSession.status = 'paused';
    this.currentSession.metadata.pausedAt = Date.now();
    
    await this.saveSession(this.currentSession);
    this.stopAutoSave();
  }

  /**
   * 恢復處理
   */
  async resumeSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('會話不存在');
    }

    if (session.status === 'completed' || session.status === 'failed') {
      throw new Error('會話已結束');
    }

    // 計算暫停時間
    if (session.metadata.pausedAt) {
      session.metadata.pausedTime += Date.now() - session.metadata.pausedAt;
      session.metadata.pausedAt = null;
    }

    session.status = 'processing';
    this.currentSession = session;
    
    await this.saveSession(session);
    this.startAutoSave();
    
    return session;
  }

  /**
   * 完成會話
   */
  async completeSession(finalResult) {
    if (!this.currentSession) return;

    this.currentSession.status = 'completed';
    this.currentSession.metadata.endTime = Date.now();
    this.currentSession.results.mergedTranscript = finalResult;
    this.currentSession.progress.overall = 100;

    await this.saveSession(this.currentSession);
    this.stopAutoSave();
    
    const completedSession = this.currentSession;
    this.currentSession = null;
    
    return completedSession;
  }

  /**
   * 失敗會話
   */
  async failSession(error) {
    if (!this.currentSession) return;

    this.currentSession.status = 'failed';
    this.currentSession.metadata.endTime = Date.now();
    this.currentSession.error = {
      message: error.message,
      stack: error.stack,
      timestamp: Date.now()
    };

    await this.saveSession(this.currentSession);
    this.stopAutoSave();
    
    this.currentSession = null;
  }

  /**
   * 獲取會話
   */
  async getSession(sessionId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.get(sessionId);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 獲取所有會話
   */
  async getAllSessions(filter = {}) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      
      let request;
      if (filter.status) {
        const index = store.index('status');
        request = index.getAll(filter.status);
      } else {
        request = store.getAll();
      }

      request.onsuccess = () => {
        let sessions = request.result;
        
        // 應用其他過濾條件
        if (filter.fileHash) {
          sessions = sessions.filter(s => s.fileHash === filter.fileHash);
        }
        
        if (filter.since) {
          sessions = sessions.filter(s => s.updatedAt >= filter.since);
        }
        
        // 排序
        sessions.sort((a, b) => b.updatedAt - a.updatedAt);
        
        resolve(sessions);
      };

      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 刪除會話
   */
  async deleteSession(sessionId) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(sessionId);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 清理舊會話
   */
  async cleanupOldSessions(daysToKeep = 7) {
    const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const sessions = await this.getAllSessions();
    
    const toDelete = sessions.filter(s => 
      s.updatedAt < cutoffTime && 
      (s.status === 'completed' || s.status === 'failed')
    );

    for (const session of toDelete) {
      await this.deleteSession(session.id);
    }

    console.log(`清理了 ${toDelete.length} 個舊會話`);
    return toDelete.length;
  }

  /**
   * 匯出會話資料
   */
  async exportSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('會話不存在');
    }

    return {
      session: session,
      exportedAt: Date.now(),
      version: this.dbVersion
    };
  }

  /**
   * 匯入會話資料
   */
  async importSession(exportData) {
    if (exportData.version !== this.dbVersion) {
      console.warn('版本不匹配，可能需要資料遷移');
    }

    const session = exportData.session;
    session.importedAt = Date.now();
    
    await this.saveSession(session);
    return session;
  }

  /**
   * 獲取統計資訊
   */
  async getStatistics() {
    const sessions = await this.getAllSessions();
    
    const stats = {
      total: sessions.length,
      completed: sessions.filter(s => s.status === 'completed').length,
      failed: sessions.filter(s => s.status === 'failed').length,
      paused: sessions.filter(s => s.status === 'paused').length,
      processing: sessions.filter(s => s.status === 'processing').length,
      totalFileSize: sessions.reduce((sum, s) => sum + s.fileSize, 0),
      totalProcessingTime: sessions
        .filter(s => s.metadata.endTime)
        .reduce((sum, s) => {
          const duration = s.metadata.endTime - s.createdAt - s.metadata.pausedTime;
          return sum + duration;
        }, 0)
    };

    return stats;
  }

  /**
   * 清理資源
   */
  async cleanup() {
    this.stopAutoSave();
    
    if (this.currentSession) {
      await this.pauseSession();
    }
    
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

// 匯出單例
let instance = null;

export function getProgressCheckpoint() {
  if (!instance) {
    instance = new ProgressCheckpoint();
  }
  return instance;
}