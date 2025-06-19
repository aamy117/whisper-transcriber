/**
 * 轉譯預處理模組
 * 只在使用者按下"開始轉譯"按鈕後執行
 * 不影響純播放功能
 */

import Config from './config.js';
import { dialog } from './dialog.js';
import { notify } from './notification.js';
import { audioSplitter } from './audio-splitter.js';
import { audioCompressor } from './audio-compressor.js';

export class TranscriptionPreprocessor {
  constructor() {
    this.maxFileSize = Config.api.maxFileSize; // 25MB
    this.audioContext = null;
    this.processingOptions = {
      split: {
        name: '智能分割',
        description: '保持最佳品質，但需要多次 API 調用',
        icon: '✂️'
      },
      compress: {
        name: '智能壓縮',
        description: '單次處理，可能略微影響品質',
        icon: '🗜️'
      },
      hybrid: {
        name: '混合模式',
        description: '先壓縮後分割，平衡品質與成本',
        icon: '🔄'
      }
    };
  }
  
  /**
   * 準備檔案進行轉譯
   * 這是主要入口，只在使用者要求轉譯時調用
   */
  async prepareForTranscription(file) {
    // 檢查檔案大小
    if (file.size <= this.maxFileSize) {
      // 檔案大小符合限制，直接返回
      return {
        strategy: 'direct',
        files: [file],
        totalDuration: null,
        estimatedCost: this.estimateCost(file.size, 1)
      };
    }
    
    // 檔案超過限制，顯示處理選項
    const fileInfo = {
      name: file.name,
      size: file.size,
      sizeMB: (file.size / 1024 / 1024).toFixed(2),
      exceedBy: ((file.size - this.maxFileSize) / 1024 / 1024).toFixed(2)
    };
    
    // 讓使用者選擇處理策略
    const strategy = await this.showProcessingOptions(fileInfo);
    
    if (!strategy) {
      // 使用者取消
      throw new Error('使用者取消處理');
    }
    
    // 根據選擇的策略處理檔案
    notify.info(`正在使用${this.processingOptions[strategy].name}處理檔案...`);
    
    try {
      const result = await this.processFile(file, strategy);
      return result;
    } catch (error) {
      notify.error(`檔案處理失敗：${error.message}`);
      throw error;
    }
  }
  
  /**
   * 顯示處理選項對話框
   */
  async showProcessingOptions(fileInfo) {
    const content = `
      <div class="processing-options">
        <p class="warning-message">
          檔案 <strong>${fileInfo.name}</strong> 大小為 ${fileInfo.sizeMB} MB，
          超過 API 限制 ${fileInfo.exceedBy} MB。
        </p>
        
        <p>請選擇處理方式：</p>
        
        <div class="option-list">
          ${Object.entries(this.processingOptions).map(([key, option]) => `
            <div class="option-item" data-strategy="${key}">
              <div class="option-icon">${option.icon}</div>
              <div class="option-content">
                <h4>${option.name}</h4>
                <p>${option.description}</p>
                <p class="cost-estimate">預估費用：計算中...</p>
              </div>
            </div>
          `).join('')}
        </div>
        
        <div class="option-details" id="strategy-details">
          <p class="hint">點擊選項查看詳細說明</p>
        </div>
      </div>
    `;
    
    return new Promise((resolve) => {
      // 建立自訂對話框
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = `
        <div class="dialog" style="max-width: 600px;">
          <div class="dialog-header">
            <h3>大檔案處理選項</h3>
          </div>
          <div class="dialog-content">
            ${content}
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" id="cancelBtn">取消</button>
            <button class="btn btn-primary" id="confirmBtn">確認處理</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(overlay);
      
      // 添加顯示動畫
      requestAnimationFrame(() => {
        overlay.classList.add('show');
      });
      
      const closeModal = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 300);
      };
      
      // 綁定按鈕事件
      overlay.querySelector('#cancelBtn').addEventListener('click', () => {
        closeModal();
        resolve(null);
      });
      
      overlay.querySelector('#confirmBtn').addEventListener('click', () => {
        const selected = overlay.querySelector('.option-item.selected');
        if (selected) {
          const strategy = selected.dataset.strategy;
          closeModal();
          resolve(strategy);
        } else {
          notify.warning('請選擇一個處理方式');
        }
      });
      
      // 綁定選項點擊事件
      overlay.querySelectorAll('.option-item').forEach(item => {
        item.addEventListener('click', () => {
          // 移除其他選中狀態
          overlay.querySelectorAll('.option-item').forEach(i => {
            i.classList.remove('selected');
          });
          
          // 設定選中狀態
          item.classList.add('selected');
          
          // 顯示詳細說明
          const strategy = item.dataset.strategy;
          const detailsEl = overlay.querySelector('#strategy-details');
          if (detailsEl) {
            detailsEl.innerHTML = this.getStrategyDetailsHTML(strategy, fileInfo);
          }
        });
      });
      
      // 計算並顯示預估費用
      this.updateCostEstimatesInModal(overlay, fileInfo);
    });
  }
  
  /**
   * 取得策略詳細說明 HTML
   */
  getStrategyDetailsHTML(strategy, fileInfo) {
    const details = {
      split: `
        <h4>智能分割說明</h4>
        <ul>
          <li>將音訊分割成多個 20MB 以內的片段</li>
          <li>基於靜音檢測找到自然分割點</li>
          <li>保留原始音質，轉譯準確度最高</li>
          <li>預計分割成 ${Math.ceil(fileInfo.size / (20 * 1024 * 1024))} 個片段</li>
          <li>每個片段單獨調用 API，總成本較高</li>
        </ul>
      `,
      compress: `
        <h4>智能壓縮說明</h4>
        <ul>
          <li>降低音訊品質以減小檔案大小</li>
          <li>取樣率降至 16kHz（語音優化）</li>
          <li>轉換為單聲道，使用高效編碼</li>
          <li>預計壓縮至 ${(fileInfo.size * 0.3 / 1024 / 1024).toFixed(2)} MB</li>
          <li>只需一次 API 調用，成本最低</li>
        </ul>
      `,
      hybrid: `
        <h4>混合模式說明</h4>
        <ul>
          <li>先嘗試壓縮音訊至 24MB 以內</li>
          <li>如果壓縮後仍超過限制，再進行分割</li>
          <li>在品質和成本間取得平衡</li>
          <li>預計需要 ${this.estimateHybridSegments(fileInfo.size)} 次 API 調用</li>
          <li>適合大多數使用場景</li>
        </ul>
      `
    };
    
    return details[strategy] || '<p class="hint">點擊選項查看詳細說明</p>';
  }
  
  /**
   * 更新成本預估
   */
  updateCostEstimatesInModal(overlay, fileInfo) {
    // Whisper API 費用：$0.006 per minute
    const costPerMinute = 0.006;
    const estimatedDuration = this.estimateAudioDuration(fileInfo.size);
    
    const estimates = {
      split: Math.ceil(fileInfo.size / (20 * 1024 * 1024)) * estimatedDuration * costPerMinute,
      compress: estimatedDuration * costPerMinute,
      hybrid: this.estimateHybridSegments(fileInfo.size) * estimatedDuration * costPerMinute
    };
    
    // 更新顯示
    Object.entries(estimates).forEach(([strategy, cost]) => {
      const el = overlay.querySelector(`.option-item[data-strategy="${strategy}"] .cost-estimate`);
      if (el) {
        el.textContent = `預估費用：$${cost.toFixed(3)} USD`;
      }
    });
  }
  
  /**
   * 根據策略處理檔案
   */
  async processFile(file, strategy) {
    switch (strategy) {
      case 'split':
        return await this.splitAudio(file);
      
      case 'compress':
        return await this.compressAudio(file);
      
      case 'hybrid':
        return await this.hybridProcess(file);
      
      default:
        throw new Error(`未知的處理策略：${strategy}`);
    }
  }
  
  /**
   * 分割音訊
   */
  async splitAudio(file) {
    try {
      // 顯示進度
      const progressModal = this.showProgressModal('正在分割音訊檔案...');
      
      // 調用音訊分割模組
      const result = await audioSplitter.splitAudioFile(file, {
        maxSize: 20 * 1024 * 1024, // 20MB per segment
        overlap: 5, // 5秒重疊
        onProgress: (progress) => {
          progressModal.updateProgress(progress);
        }
      });
      
      progressModal.close();
      
      // 返回分割結果
      return {
        strategy: 'split',
        files: result.segments.map(seg => seg.file),
        segments: result.segments,
        totalDuration: result.originalDuration,
        estimatedCost: this.estimateCost(file.size, result.totalSegments)
      };
      
    } catch (error) {
      notify.error(`音訊分割失敗：${error.message}`);
      throw error;
    } finally {
      audioSplitter.cleanup();
    }
  }
  
  /**
   * 壓縮音訊
   */
  async compressAudio(file) {
    try {
      // 顯示進度
      const progressModal = this.showProgressModal('正在壓縮音訊檔案...');
      
      // 調用音訊壓縮模組
      const result = await audioCompressor.compressAudioFile(file, {
        targetSize: this.maxFileSize,
        profile: 'auto',
        onProgress: (progress) => {
          progressModal.updateProgress(progress);
        }
      });
      
      progressModal.close();
      
      // 返回壓縮結果
      return {
        strategy: 'compress',
        files: [result.file],
        compressionRatio: result.compressionRatio,
        totalDuration: result.duration,
        estimatedCost: this.estimateCost(result.compressedSize, 1),
        warning: result.warning
      };
      
    } catch (error) {
      notify.error(`音訊壓縮失敗：${error.message}`);
      throw error;
    } finally {
      audioCompressor.cleanup();
    }
  }
  
  /**
   * 混合處理
   */
  async hybridProcess(file) {
    try {
      notify.info('正在執行混合處理策略...');
      
      // 先嘗試壓縮
      const compressed = await this.compressAudio(file);
      
      // 檢查壓縮後的大小
      if (compressed.files[0].size <= this.maxFileSize) {
        notify.success('壓縮成功，檔案符合大小限制');
        return compressed;
      }
      
      // 如果還是太大，再分割
      notify.info('壓縮後仍超過限制，正在分割檔案...');
      const splitResult = await this.splitAudio(compressed.files[0]);
      
      // 合併結果
      return {
        strategy: 'hybrid',
        files: splitResult.files,
        segments: splitResult.segments,
        totalDuration: splitResult.totalDuration,
        estimatedCost: splitResult.estimatedCost,
        compressionRatio: compressed.compressionRatio,
        note: '先壓縮後分割'
      };
      
    } catch (error) {
      notify.error(`混合處理失敗：${error.message}`);
      throw error;
    }
  }
  
  /**
   * 估算音訊時長（基於檔案大小）
   */
  estimateAudioDuration(fileSize) {
    // 假設 128kbps 的 MP3
    // 128kbps = 16KB/s = 960KB/min
    const bytesPerMinute = 960 * 1024;
    return fileSize / bytesPerMinute;
  }
  
  /**
   * 估算混合模式需要的片段數
   */
  estimateHybridSegments(fileSize) {
    const compressedSize = fileSize * 0.3;
    if (compressedSize <= this.maxFileSize) {
      return 1;
    }
    return Math.ceil(compressedSize / (20 * 1024 * 1024));
  }
  
  /**
   * 估算成本
   */
  estimateCost(fileSize, segments) {
    const duration = this.estimateAudioDuration(fileSize);
    const costPerMinute = 0.006;
    return duration * costPerMinute * segments;
  }
  
  /**
   * 初始化 Audio Context（需要時才建立）
   */
  initAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }
    return this.audioContext;
  }
  
  /**
   * 顯示進度對話框
   */
  showProgressModal(title) {
    const overlay = document.createElement('div');
    overlay.className = 'dialog-overlay';
    overlay.innerHTML = `
      <div class="dialog" style="max-width: 400px;">
        <div class="dialog-header">
          <h3>${title}</h3>
        </div>
        <div class="dialog-content">
          <div class="progress-container">
            <div class="progress-info">
              <span class="progress-stage">準備中...</span>
              <span class="progress-percentage">0%</span>
            </div>
            <div class="progress-bar">
              <div class="progress-fill" style="width: 0%"></div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);
    
    // 添加顯示動畫
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
    
    return {
      updateProgress: (progress) => {
        const stageEl = overlay.querySelector('.progress-stage');
        const percentageEl = overlay.querySelector('.progress-percentage');
        const fillEl = overlay.querySelector('.progress-fill');
        
        if (progress.stage) {
          stageEl.textContent = progress.stage;
        }
        
        if (progress.percentage !== undefined) {
          const percentage = Math.round(progress.percentage);
          percentageEl.textContent = `${percentage}%`;
          fillEl.style.width = `${percentage}%`;
        }
        
        if (progress.current && progress.total) {
          stageEl.textContent = `處理中 (${progress.current}/${progress.total})`;
        }
      },
      close: () => {
        overlay.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 300);
      }
    };
  }
  
  /**
   * 清理資源
   */
  cleanup() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// 匯出單例
export const transcriptionPreprocessor = new TranscriptionPreprocessor();