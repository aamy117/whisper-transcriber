/**
 * 轉譯預處理模組
 * 只在使用者按下"開始轉譯"按鈕後執行
 * 不影響純播放功能
 */

// 調試模式開關
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

import Config from './config.js';
import { dialog } from './dialog.js';
import { notify } from './notification.js';
import { audioSplitter } from './audio-splitter.js';
import { audioCompressor } from './audio-compressor.js';
import { WhisperWASMManager } from './wasm/whisper-wasm-manager.js';
import { progressManager } from './progress-manager.js';
import { largeFileIntegration } from './large-file/large-file-integration.js';

export class TranscriptionPreprocessor {
  constructor() {
    this.maxFileSize = Config.api.maxFileSize; // 25MB
    this.audioContext = null;
    // 功能開關：是否啟用 WASM 本地轉譯
    this.ENABLE_WASM = true; // 設為 true 以啟用 WASM 選項

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

    // 不再將 WASM 作為處理選項，而是作為獨立的轉譯方式

    // WASM 管理器實例
    this.wasmManager = null;
  }

  /**
   * 準備檔案進行轉譯
   * 這是主要入口，只在使用者要求轉譯時調用
   * @param {File} file - 要處理的音訊檔案
   * @param {Object} options - 選項
   * @param {CancellationToken} options.cancellationToken - 取消令牌
   */
  async prepareForTranscription(file, options = {}) {
    const { cancellationToken } = options;
    
    DEBUG && console.log('prepareForTranscription 開始, 檔案:', file.name, '大小:', file.size);
    
    // 檢查是否已取消
    if (cancellationToken) {
      cancellationToken.throwIfCancelled();
    }
    
    // 第一步：讓使用者選擇轉譯方式（本地 or API）
    DEBUG && console.log('顯示轉譯方式選擇對話框...');
    const transcriptionMethod = await this.showTranscriptionMethodChoice(file, cancellationToken);
    DEBUG && console.log('使用者選擇:', transcriptionMethod);

    if (!transcriptionMethod) {
      // 使用者取消
      throw new Error('使用者取消選擇');
    }

    // 根據選擇的方式處理
    if (transcriptionMethod === 'local') {
      // 本地轉譯流程
      notify.info('準備使用本地轉譯...');
      return await this.processWithWASM(file);

    } else if (transcriptionMethod === 'api') {
      // API 轉譯流程

      // 首先檢查是否應該使用新的大檔案處理系統
      if (largeFileIntegration.shouldUseLargeFileSystem(file)) {
        DEBUG && console.log('使用新的大檔案處理系統');
        
        // 取得處理建議
        const recommendation = largeFileIntegration.getProcessingRecommendation(file);
        
        // 顯示建議給使用者
        const useNewSystem = await this.showLargeFileSystemChoice(file, recommendation, cancellationToken);
        
        if (useNewSystem) {
          // 使用新的大檔案處理系統
          return {
            strategy: 'large-file-system',
            file: file,
            recommendation: recommendation
          };
        }
      }

      // 檢查檔案大小
      if (file.size <= this.maxFileSize) {
        // 檔案大小符合限制，直接使用 API
        return {
          strategy: 'direct',
          files: [file],
          totalDuration: null,
          estimatedCost: this.estimateCost(file.size, 1)
        };
      }

      // 檔案超過限制，顯示處理選項（分割/壓縮/混合）
      const fileInfo = {
        name: file.name,
        size: file.size,
        sizeMB: (file.size / 1024 / 1024).toFixed(2),
        exceedBy: ((file.size - this.maxFileSize) / 1024 / 1024).toFixed(2)
      };

      // 讓使用者選擇處理策略
      const strategy = await this.showProcessingOptions(fileInfo, cancellationToken);

      if (!strategy) {
        // 使用者取消
        throw new Error('使用者取消處理');
      }

      // 根據選擇的策略處理檔案
      notify.info(`正在使用${this.processingOptions[strategy].name}處理檔案...`);

      try {
        const result = await this.processFile(file, strategy, cancellationToken);
        return result;
      } catch (error) {
        if (error.name === 'CancellationError') {
          throw error;  // 重新拋出取消錯誤
        }
        notify.error(`檔案處理失敗：${error.message}`);
        throw error;
      }
    }
  }

  /**
   * 顯示轉譯方式選擇對話框（第一層選擇）
   * @param {File} file - 音訊檔案
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async showTranscriptionMethodChoice(file, cancellationToken) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    const estimatedDuration = this.estimateAudioDuration(file.size);
    const apiCost = this.estimateCost(file.size, 1);

    const content = `
      <div class="method-choice-container">
        <div class="file-summary">
          <div class="file-icon">🎵</div>
          <div class="file-details">
            <h4>${file.name}</h4>
            <p>大小：${fileSizeMB} MB | 預估長度：${Math.round(estimatedDuration)} 分鐘</p>
          </div>
        </div>

        <p class="choice-prompt">請選擇轉譯方式：</p>

        <div class="method-options">
          <div class="method-card" data-method="local">
            <div class="method-header">
              <div class="method-icon">🖥️</div>
              <div class="method-title">
                <h3>本地轉譯</h3>
                <span class="badge badge-privacy">隱私保護</span>
              </div>
            </div>
            <div class="method-features">
              <div class="feature-item">✅ 完全離線，100% 隱私</div>
              <div class="feature-item">✅ 無需上傳檔案</div>
              <div class="feature-item">✅ 免費使用</div>
              <div class="feature-item">⏱️ 處理時間較長</div>
              <div class="feature-item">💾 需要下載模型（首次）</div>
            </div>
            <div class="method-footer">
              <span class="cost">費用：免費</span>
              <span class="time">預估：${Math.round(estimatedDuration * 2)}-${Math.round(estimatedDuration * 3)} 分鐘</span>
            </div>
          </div>

          <div class="method-card" data-method="api">
            <div class="method-header">
              <div class="method-icon">☁️</div>
              <div class="method-title">
                <h3>雲端 API 轉譯</h3>
                <span class="badge badge-fast">高速高精度</span>
              </div>
            </div>
            <div class="method-features">
              <div class="feature-item">✅ 轉譯速度快</div>
              <div class="feature-item">✅ 精度最高</div>
              <div class="feature-item">✅ 支援所有格式</div>
              <div class="feature-item">💰 需要付費</div>
              <div class="feature-item">🌐 需要網路連線</div>
            </div>
            <div class="method-footer">
              <span class="cost">費用：$${apiCost.toFixed(3)} USD</span>
              <span class="time">預估：${Math.round(estimatedDuration / 5)}-${Math.round(estimatedDuration / 3)} 分鐘</span>
            </div>
          </div>
        </div>

        <div class="remember-choice">
          <label>
            <input type="checkbox" id="rememberChoice">
            <span>記住我的選擇</span>
          </label>
        </div>
      </div>
    `;

    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      // 設定更高的 z-index 以確保顯示在進度模態框之上
      overlay.style.zIndex = '10010';
      overlay.innerHTML = `
        <div class="dialog method-choice-dialog">
          <div class="dialog-header">
            <h3>選擇轉譯方式</h3>
          </div>
          <div class="dialog-content">
            ${content}
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" id="cancelBtn">取消</button>
            <button class="btn btn-primary" id="confirmBtn" disabled>開始轉譯</button>
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
          if (overlay.parentNode) {
            document.body.removeChild(overlay);
          }
        }, 300);
      };

      // 如果有取消令牌，監聽取消事件
      let cancelHandler = null;
      if (cancellationToken) {
        cancelHandler = () => {
          closeModal();
          reject(new Error('操作已取消'));
        };
        cancellationToken.onCancelled(cancelHandler);
      }

      let selectedMethod = null;
      const confirmBtn = overlay.querySelector('#confirmBtn');

      // 檢查是否有記住的選擇
      const savedChoice = localStorage.getItem('preferredTranscriptionMethod');
      if (savedChoice && this.ENABLE_WASM) {
        // 如果有保存的選擇且 WASM 啟用，自動選擇
        const savedCard = overlay.querySelector(`[data-method="${savedChoice}"]`);
        if (savedCard) {
          savedCard.click();
          // 可選：自動開始
          // setTimeout(() => confirmBtn.click(), 500);
        }
      }

      // 綁定選項點擊事件
      overlay.querySelectorAll('.method-card').forEach(card => {
        // 如果是本地轉譯但 WASM 未啟用，則禁用
        if (card.dataset.method === 'local' && !this.ENABLE_WASM) {
          card.classList.add('disabled');
          card.innerHTML += '<div class="disabled-notice">⚠️ 本地轉譯功能未啟用</div>';
          return;
        }

        card.addEventListener('click', () => {
          // 移除其他選中狀態
          overlay.querySelectorAll('.method-card').forEach(c => {
            c.classList.remove('selected');
          });

          // 設定選中狀態
          card.classList.add('selected');
          selectedMethod = card.dataset.method;
          confirmBtn.disabled = false;
        });
      });

      // 綁定按鈕事件
      overlay.querySelector('#cancelBtn').addEventListener('click', () => {
        closeModal();
        resolve(null);
      });

      confirmBtn.addEventListener('click', () => {
        // 檢查是否要記住選擇
        const rememberCheckbox = overlay.querySelector('#rememberChoice');
        if (rememberCheckbox && rememberCheckbox.checked && selectedMethod) {
          localStorage.setItem('preferredTranscriptionMethod', selectedMethod);
        }

        closeModal();
        resolve(selectedMethod);
      });
    });
  }

  /**
   * 顯示大檔案處理系統選擇對話框
   * @param {File} file - 檔案
   * @param {Object} recommendation - 處理建議
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async showLargeFileSystemChoice(file, recommendation, cancellationToken) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    
    const content = `
      <div class="large-file-system-choice">
        <p class="info-message">
          檔案 <strong>${file.name}</strong> 大小為 ${fileSizeMB} MB，
          建議使用新的大檔案處理系統。
        </p>

        <div class="system-comparison">
          <div class="system-option new-system">
            <h4>🚀 新的大檔案處理系統</h4>
            <ul class="benefits-list">
              ${recommendation.benefits.map(benefit => `<li>✓ ${benefit}</li>`).join('')}
            </ul>
            <p class="estimate">預估處理時間：約 ${recommendation.estimatedTime} 秒</p>
          </div>
          
          <div class="system-option old-system">
            <h4>📋 傳統處理方式</h4>
            <ul class="benefits-list">
              <li>✓ 簡單的分割或壓縮</li>
              <li>✓ 適合較小的檔案</li>
              <li>• 可能需要手動管理進度</li>
              <li>• 無法暫停和恢復</li>
            </ul>
          </div>
        </div>

        <div class="recommendation-note">
          <p><strong>建議：</strong>使用新系統以獲得最佳體驗</p>
        </div>
      </div>
    `;

    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      overlay.style.zIndex = '10010';
      overlay.innerHTML = `
        <div class="dialog" style="max-width: 700px;">
          <div class="dialog-header">
            <h3>選擇處理方式</h3>
          </div>
          <div class="dialog-content">
            ${content}
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" id="useOldSystem">使用傳統方式</button>
            <button class="btn btn-primary" id="useNewSystem">使用新系統（推薦）</button>
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
          if (overlay.parentNode) {
            document.body.removeChild(overlay);
          }
        }, 300);
      };

      // 如果有取消令牌，監聽取消事件
      let cancelHandler = null;
      if (cancellationToken) {
        cancelHandler = () => {
          closeModal();
          reject(new Error('使用者取消'));
        };
        cancellationToken.onCancel(cancelHandler);
      }

      // 綁定按鈕事件
      overlay.querySelector('#useOldSystem').addEventListener('click', () => {
        if (cancelHandler && cancellationToken) {
          cancellationToken.offCancel(cancelHandler);
        }
        closeModal();
        resolve(false);
      });

      overlay.querySelector('#useNewSystem').addEventListener('click', () => {
        if (cancelHandler && cancellationToken) {
          cancellationToken.offCancel(cancelHandler);
        }
        closeModal();
        resolve(true);
      });
    });
  }

  /**
   * 顯示處理選項對話框（第二層選擇 - 僅限 API 大檔案）
   * @param {Object} fileInfo - 檔案資訊
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async showProcessingOptions(fileInfo, cancellationToken) {
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

    return new Promise((resolve, reject) => {
      // 建立自訂對話框
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      // 設定更高的 z-index 以確保顯示在進度模態框之上
      overlay.style.zIndex = '10010';
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
          if (overlay.parentNode) {
            document.body.removeChild(overlay);
          }
        }, 300);
      };

      // 如果有取消令牌，監聽取消事件
      let cancelHandler = null;
      if (cancellationToken) {
        cancelHandler = () => {
          closeModal();
          reject(new Error('操作已取消'));
        };
        cancellationToken.onCancelled(cancelHandler);
      }

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
      `,
      wasm: `
        <h4>本地轉譯說明</h4>
        <ul>
          <li>使用瀏覽器內建的 WebAssembly 技術</li>
          <li>完全在您的電腦上處理，無需上傳檔案</li>
          <li>100% 隱私保護，適合敏感內容</li>
          <li>支援離線使用（模型下載後）</li>
          <li>處理速度取決於您的電腦效能</li>
          <li>預計處理時間：音訊長度的 1-3 倍</li>
        </ul>
        <p class="warning-note">⚠️ 首次使用需要下載模型檔案（75-466MB）</p>
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

    // 如果啟用了 WASM，添加其成本（免費）
    if (this.ENABLE_WASM) {
      estimates.wasm = 0;
    }

    // 更新顯示
    Object.entries(estimates).forEach(([strategy, cost]) => {
      const el = overlay.querySelector(`.option-item[data-strategy="${strategy}"] .cost-estimate`);
      if (el) {
        if (strategy === 'wasm') {
          el.textContent = '預估費用：免費（本地處理）';
        } else {
          el.textContent = `預估費用：$${cost.toFixed(3)} USD`;
        }
      }
    });
  }

  /**
   * 根據策略處理檔案
   * @param {File} file - 要處理的檔案
   * @param {string} strategy - 處理策略
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async processFile(file, strategy, cancellationToken) {
    // 檢查是否已取消
    if (cancellationToken) {
      cancellationToken.throwIfCancelled();
    }
    
    switch (strategy) {
      case 'split':
        return await this.splitAudio(file, cancellationToken);

      case 'compress':
        return await this.compressAudio(file, cancellationToken);

      case 'hybrid':
        return await this.hybridProcess(file, cancellationToken);

      case 'wasm':
        return await this.processWithWASM(file, cancellationToken);

      default:
        throw new Error(`未知的處理策略：${strategy}`);
    }
  }

  /**
   * 分割音訊
   * @param {File} file - 要分割的檔案
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async splitAudio(file, cancellationToken) {
    let progressControl = null;
    
    try {
      // 使用增強版進度管理器
      progressControl = progressManager.showProgress({
        title: '音訊分割處理',
        message: '正在智能分割音訊檔案...',
        stages: ['分析音訊', '尋找分割點', '分割檔案', '驗證結果'],
        cancellable: true,
        onCancel: () => {
          if (cancellationToken) {
            cancellationToken.cancel('使用者取消分割操作');
          }
        },
        showDetails: true,
        icon: '✂️'
      });

      // 設定初始階段
      progressControl.setStage(0); // 分析音訊
      progressControl.addDetail('檔案大小', `${(file.size / 1024 / 1024).toFixed(2)} MB`);
      progressControl.addDetail('目標段落大小', '20 MB');

      // 調用音訊分割模組
      const result = await audioSplitter.splitAudioFile(file, {
        maxSize: 20 * 1024 * 1024, // 20MB per segment
        overlap: 5, // 5秒重疊
        cancellationToken: cancellationToken,
        onProgress: (progress) => {
          // 根據進度更新階段
          if (progress.percentage < 30) {
            progressControl.setStage(0); // 分析音訊
          } else if (progress.percentage < 60) {
            progressControl.setStage(1); // 尋找分割點
          } else if (progress.percentage < 90) {
            progressControl.setStage(2); // 分割檔案
          } else {
            progressControl.setStage(3); // 驗證結果
          }
          
          progressControl.update(progress.percentage, progress.stage || '處理中...');
          
          if (progress.current && progress.total) {
            progressControl.addDetail('處理進度', `${progress.current}/${progress.total} 段`);
          }
        }
      });

      progressControl.addDetail('分割段數', result.totalSegments);
      progressControl.addDetail('總時長', `${Math.round(result.originalDuration / 60)} 分鐘`);
      progressControl.complete();

      // 返回分割結果
      return {
        strategy: 'split',
        files: result.segments.map(seg => seg.file),
        segments: result.segments,
        totalDuration: result.originalDuration,
        estimatedCost: this.estimateCost(file.size, result.totalSegments)
      };

    } catch (error) {
      if (progressControl) {
        if (error.name === 'CancellationError') {
          progressControl.close();
        } else {
          progressControl.error(`分割失敗：${error.message}`);
        }
      }
      
      if (error.name === 'CancellationError') {
        throw error;  // 重新拋出取消錯誤
      }
      
      notify.error(`音訊分割失敗：${error.message}`);
      throw error;
    } finally {
      audioSplitter.cleanup();
    }
  }

  /**
   * 壓縮音訊
   * @param {File} file - 要壓縮的檔案
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async compressAudio(file, cancellationToken) {
    let progressControl = null;
    
    try {
      // 使用增強版進度管理器
      progressControl = progressManager.showProgress({
        title: '音訊壓縮處理',
        message: '正在智能壓縮音訊檔案...',
        stages: ['分析音訊品質', '計算壓縮參數', '執行壓縮', '驗證品質'],
        cancellable: true,
        onCancel: () => {
          if (cancellationToken) {
            cancellationToken.cancel('使用者取消壓縮操作');
          }
        },
        showDetails: true,
        icon: '🗜️'
      });

      // 設定初始階段
      progressControl.setStage(0); // 分析音訊品質
      progressControl.addDetail('原始大小', `${(file.size / 1024 / 1024).toFixed(2)} MB`);
      progressControl.addDetail('目標大小', `${(this.maxFileSize / 1024 / 1024).toFixed(2)} MB`);

      // 調用音訊壓縮模組
      const result = await audioCompressor.compressAudioFile(file, {
        targetSize: this.maxFileSize,
        profile: 'auto',
        cancellationToken: cancellationToken,
        onProgress: (progress) => {
          // 根據進度更新階段
          if (progress.percentage < 25) {
            progressControl.setStage(0); // 分析音訊品質
          } else if (progress.percentage < 50) {
            progressControl.setStage(1); // 計算壓縮參數
          } else if (progress.percentage < 85) {
            progressControl.setStage(2); // 執行壓縮
          } else {
            progressControl.setStage(3); // 驗證品質
          }
          
          progressControl.update(progress.percentage, progress.stage || '處理中...');
          
          if (progress.compressionRatio) {
            progressControl.addDetail('壓縮比', `${(progress.compressionRatio * 100).toFixed(0)}%`);
          }
        }
      });

      progressControl.addDetail('壓縮後大小', `${(result.compressedSize / 1024 / 1024).toFixed(2)} MB`);
      progressControl.addDetail('壓縮比率', `${(result.compressionRatio * 100).toFixed(0)}%`);
      progressControl.complete();

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
      if (progressControl) {
        if (error.name === 'CancellationError') {
          progressControl.close();
        } else {
          progressControl.error(`壓縮失敗：${error.message}`);
        }
      }
      
      if (error.name === 'CancellationError') {
        throw error;  // 重新拋出取消錯誤
      }
      
      notify.error(`音訊壓縮失敗：${error.message}`);
      throw error;
    } finally {
      audioCompressor.cleanup();
    }
  }

  /**
   * 混合處理
   * @param {File} file - 要處理的檔案
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async hybridProcess(file, cancellationToken) {
    try {
      notify.info('正在執行混合處理策略...');
      
      // 檢查是否已取消
      if (cancellationToken) {
        cancellationToken.throwIfCancelled();
      }

      // 先嘗試壓縮
      const compressed = await this.compressAudio(file, cancellationToken);

      // 檢查壓縮後的大小
      if (compressed.files[0].size <= this.maxFileSize) {
        notify.success('壓縮成功，檔案符合大小限制');
        return compressed;
      }

      // 如果還是太大，再分割
      notify.info('壓縮後仍超過限制，正在分割檔案...');
      const splitResult = await this.splitAudio(compressed.files[0], cancellationToken);

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
   * 使用 WASM 本地處理
   * @param {File} file - 要處理的檔案
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async processWithWASM(file, cancellationToken) {
    try {
      // 使用全域的 WASM 管理器（如果存在）
      if (!this.wasmManager) {
        // 嘗試使用主程式的 WASM 管理器
        if (window.whisperApp && window.whisperApp.wasmManager) {
          this.wasmManager = window.whisperApp.wasmManager;
          DEBUG && console.log('使用主程式的 WASM 管理器');
        } else {
          // 如果沒有，才創建新的
          this.wasmManager = new WhisperWASMManager();
          DEBUG && console.log('創建新的 WASM 管理器');
        }
      }

      // 顯示模型選擇對話框
      const modelChoice = await this.showModelSelectionDialog(cancellationToken);
      if (!modelChoice) {
        throw new Error('使用者取消選擇模型');
      }

      // 使用增強版進度管理器
      const modelInfo = this.wasmManager.getModelInfo(modelChoice);
      const isCached = await this.wasmManager.isModelCached(modelChoice);
      
      const stages = isCached 
        ? ['初始化引擎', '載入模型', '準備轉譯']
        : ['下載模型', '初始化引擎', '載入模型', '準備轉譯'];
      
      const progressControl = progressManager.showProgress({
        title: '本地轉譯準備',
        message: '正在準備本地轉譯環境...',
        stages: stages,
        cancellable: true,
        onCancel: () => {
          if (cancellationToken) {
            cancellationToken.cancel('使用者取消 WASM 準備');
          }
        },
        showDetails: true,
        icon: '🖥️'
      });

      try {
        let currentStage = 0;
        
        // 檢查模型是否已快取
        if (!isCached) {
          progressControl.setStage(currentStage++); // 下載模型
          progressControl.update(10, `正在下載 ${modelChoice} 模型...`);
          progressControl.addDetail('模型名稱', modelChoice);
          progressControl.addDetail('模型大小', `${Math.round(modelInfo.size / 1024 / 1024)} MB`);
        }

        // 初始化 WASM 和載入模型
        progressControl.setStage(currentStage++); // 初始化引擎
        progressControl.update(40, '正在初始化 WebAssembly 引擎...');
        
        await this.wasmManager.initialize(modelChoice, {
          onProgress: (progress) => {
            // 檢查是否已取消
            if (cancellationToken && cancellationToken.isCancelled) {
              throw new Error('操作已取消');
            }
            
            if (progress.stage === 'download') {
              progressControl.update(10 + progress.percentage * 0.3, progress.message);
              progressControl.addDetail('下載進度', `${progress.percentage}%`);
            } else if (progress.stage === 'load') {
              progressControl.setStage(currentStage); // 載入模型
              progressControl.update(50 + progress.percentage * 0.3, progress.message);
            }
          },
          cancellationToken: cancellationToken
        });
        
        progressControl.setStage(currentStage++); // 準備轉譯
        progressControl.update(90, '轉譯環境準備完成');
        progressControl.addDetail('狀態', '就緒');
        progressControl.complete();

        return {
          strategy: 'wasm',
          files: [file], // WASM 不需要分割檔案
          model: modelChoice,
          wasmManager: this.wasmManager,
          totalDuration: null,
          estimatedCost: 0, // 本地處理無費用
          note: '使用本地 WASM 處理，無需上傳檔案'
        };

      } catch (error) {
        progressControl.error(`準備失敗：${error.message}`);
        throw error;
      }

    } catch (error) {
      notify.error(`本地處理失敗：${error.message}`);
      throw error;
    }
  }

  /**
   * 顯示模型選擇對話框
   * @param {CancellationToken} cancellationToken - 取消令牌
   */
  async showModelSelectionDialog(cancellationToken) {
    const models = [
      { id: 'tiny', name: 'Tiny', size: '75MB', speed: '快', accuracy: '基本', description: '最快速度，適合快速預覽' },
      { id: 'base', name: 'Base', size: '142MB', speed: '中', accuracy: '良好', description: '平衡速度與品質（推薦）' },
      { id: 'small', name: 'Small', size: '466MB', speed: '慢', accuracy: '高', description: '最佳品質，速度較慢' }
    ];

    // 檢查每個模型是否已快取
    const modelCacheStatus = {};
    if (this.wasmManager) {
      for (const model of models) {
        modelCacheStatus[model.id] = await this.wasmManager.isModelCached(model.id);
      }
    }

    const content = `
      <div class="model-selection">
        <p>請選擇轉譯模型：</p>
        <div class="model-list">
          ${models.map(model => {
            const isCached = modelCacheStatus[model.id];
            return `
            <div class="model-item ${isCached ? 'cached' : ''}" data-model="${model.id}">
              <div class="model-header">
                <h4>${model.name}</h4>
                <span class="model-size">${model.size}</span>
                ${isCached ? '<span class="model-cached-badge">已下載</span>' : '<span class="model-download-badge">需下載</span>'}
              </div>
              <div class="model-info">
                <span class="model-speed">速度：${model.speed}</span>
                <span class="model-accuracy">準確度：${model.accuracy}</span>
              </div>
              <p class="model-desc">${model.description}</p>
              ${!isCached ? '<p class="model-download-note">⬇️ 首次使用需要下載模型檔案</p>' : ''}
            </div>
          `}).join('')}
        </div>
        <p class="model-note">
          <strong>提示：</strong>已下載的模型可以立即使用，未下載的模型會在選擇後自動下載。
        </p>
      </div>
    `;

    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      // 設定更高的 z-index 以確保顯示在進度模態框之上
      overlay.style.zIndex = '10010';
      overlay.innerHTML = `
        <div class="dialog" style="max-width: 500px;">
          <div class="dialog-header">
            <h3>選擇轉譯模型</h3>
          </div>
          <div class="dialog-content">
            ${content}
          </div>
          <div class="dialog-footer">
            <button class="btn btn-secondary" id="cancelBtn">取消</button>
            <button class="btn btn-primary" id="confirmBtn" disabled>確認</button>
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
          if (overlay.parentNode) {
            document.body.removeChild(overlay);
          }
        }, 300);
      };

      // 如果有取消令牌，監聽取消事件
      let cancelHandler = null;
      if (cancellationToken) {
        cancelHandler = () => {
          closeModal();
          reject(new Error('操作已取消'));
        };
        cancellationToken.onCancelled(cancelHandler);
      }

      let selectedModel = null;
      const confirmBtn = overlay.querySelector('#confirmBtn');

      // 綁定模型選擇事件
      overlay.querySelectorAll('.model-item').forEach(item => {
        item.addEventListener('click', () => {
          overlay.querySelectorAll('.model-item').forEach(i => {
            i.classList.remove('selected');
          });
          item.classList.add('selected');
          selectedModel = item.dataset.model;
          confirmBtn.disabled = false;
        });
      });

      // 綁定按鈕事件
      overlay.querySelector('#cancelBtn').addEventListener('click', () => {
        // 移除取消處理器
        if (cancelHandler && cancellationToken) {
          cancellationToken.offCancelled(cancelHandler);
        }
        closeModal();
        resolve(null);
      });

      confirmBtn.addEventListener('click', () => {
        // 移除取消處理器
        if (cancelHandler && cancellationToken) {
          cancellationToken.offCancelled(cancelHandler);
        }
        closeModal();
        resolve(selectedModel);
      });

      // 預設選擇 base 模型
      const baseModel = overlay.querySelector('[data-model="base"]');
      if (baseModel) {
        baseModel.click();
      }
    });
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
   * @param {string} title - 對話框標題
   * @param {Object} options - 選項
   * @param {boolean} options.cancellable - 是否可取消
   * @param {Function} options.onCancel - 取消回調
   */
  showProgressModal(title, options = {}) {
    const { cancellable = false, onCancel = null } = options;
    
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
        ${cancellable ? `
          <div class="dialog-footer">
            <button class="btn btn-secondary cancel-progress-btn">取消</button>
          </div>
        ` : ''}
      </div>
    `;

    document.body.appendChild(overlay);

    // 添加顯示動畫
    requestAnimationFrame(() => {
      overlay.classList.add('show');
    });
    
    // 綁定取消按鈕事件
    if (cancellable && onCancel) {
      const cancelBtn = overlay.querySelector('.cancel-progress-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
          onCancel();
          modalInstance.close();
        });
      }
    }

    const modalInstance = {
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
      updateMessage: (message) => {
        const stageEl = overlay.querySelector('.progress-stage');
        if (stageEl) {
          stageEl.textContent = message;
        }
      },
      close: () => {
        overlay.classList.remove('show');
        setTimeout(() => {
          document.body.removeChild(overlay);
        }, 300);
      }
    };
    
    return modalInstance;
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
