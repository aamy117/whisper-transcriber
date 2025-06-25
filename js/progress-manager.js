/**
 * 進度管理器
 * 用於顯示和管理各種長時間操作的進度
 */

export class ProgressManager {
  constructor() {
    this.currentModal = null;
    this.stages = [];
    this.currentStage = 0;
    this.startTime = null;
    this.cancelCallback = null;
    this.container = null;
  }

  /**
   * 顯示進度模態框
   * @param {Object} options - 配置選項
   * @returns {Object} 進度控制物件
   */
  showProgress(options = {}) {
    const {
      title = '處理中',
      message = '請稍候...',
      stages = [],
      cancellable = false,
      onCancel = null,
      showDetails = true,
      icon = '⚡'
    } = options;

    // 創建模態框
    this.createModal({
      title,
      message,
      stages,
      cancellable,
      showDetails,
      icon
    });

    this.stages = stages;
    this.currentStage = 0;
    this.startTime = Date.now();
    this.cancelCallback = onCancel;

    // 返回控制介面
    return {
      update: (progress, message) => this.updateProgress(progress, message),
      setStage: (stageIndex) => this.setStage(stageIndex),
      setMessage: (message) => this.setMessage(message),
      addDetail: (label, value) => this.addDetail(label, value),
      complete: () => this.complete(),
      error: (message) => this.error(message),
      close: () => this.close()
    };
  }

  /**
   * 創建模態框
   */
  createModal(options) {
    // 移除現有模態框
    this.close();

    // 創建 HTML 結構
    const modalHtml = `
      <div class="progress-modal" id="progressModal">
        <div class="progress-content">
          <div class="progress-header">
            <div class="progress-icon">${options.icon}</div>
            <div class="progress-title">
              <h3>${options.title}</h3>
              <p class="progress-message">${options.message}</p>
            </div>
          </div>

          <div class="progress-bar-container">
            <div class="progress-bar">
              <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="progress-text">
              <span class="progress-percentage">0%</span>
              <span class="progress-status">準備中...</span>
            </div>
          </div>

          ${options.stages.length > 0 ? this.createStagesHtml(options.stages) : ''}

          ${options.showDetails ? `
            <div class="progress-details" style="display: none;">
              <div class="detail-rows"></div>
            </div>
          ` : ''}

          ${options.cancellable ? `
            <div class="progress-actions">
              <button class="progress-cancel-btn" id="progressCancelBtn">取消</button>
            </div>
          ` : ''}
        </div>
      </div>
    `;

    // 插入到頁面
    const modalElement = document.createElement('div');
    modalElement.innerHTML = modalHtml;
    document.body.appendChild(modalElement.firstElementChild);

    // 保存引用
    this.currentModal = document.getElementById('progressModal');

    // 綁定取消按鈕
    if (options.cancellable) {
      const cancelBtn = document.getElementById('progressCancelBtn');
      cancelBtn.addEventListener('click', () => this.handleCancel());
    }

    // 顯示模態框
    requestAnimationFrame(() => {
      this.currentModal.classList.add('show');
    });
  }

  /**
   * 創建階段列表 HTML
   */
  createStagesHtml(stages) {
    const stageItems = stages.map((stage, index) => `
      <div class="stage-item" data-stage="${index}">
        <div class="stage-indicator">${index + 1}</div>
        <div class="stage-label">${stage}</div>
        <div class="stage-time"></div>
      </div>
    `).join('');

    return `
      <div class="progress-stages">
        <div class="stage-list">
          ${stageItems}
        </div>
      </div>
    `;
  }

  /**
   * 更新進度
   */
  updateProgress(progress, message) {
    if (!this.currentModal) return;

    // 更新進度條
    const progressFill = this.currentModal.querySelector('.progress-fill');
    const progressPercentage = this.currentModal.querySelector('.progress-percentage');
    const progressStatus = this.currentModal.querySelector('.progress-status');

    progressFill.style.width = `${progress}%`;
    progressPercentage.textContent = `${Math.round(progress)}%`;

    if (message) {
      progressStatus.textContent = message;
    }

    // 估算剩餘時間
    this.updateTimeEstimate(progress);
  }

  /**
   * 設定當前階段
   */
  setStage(stageIndex) {
    if (!this.currentModal || !this.stages.length) return;

    this.currentStage = stageIndex;

    // 更新階段視覺狀態
    const stageItems = this.currentModal.querySelectorAll('.stage-item');
    stageItems.forEach((item, index) => {
      if (index < stageIndex) {
        item.classList.add('completed');
        item.classList.remove('active');
        const indicator = item.querySelector('.stage-indicator');
        indicator.innerHTML = '✓';
      } else if (index === stageIndex) {
        item.classList.add('active');
        item.classList.remove('completed');
      } else {
        item.classList.remove('active', 'completed');
      }
    });

    // 更新時間
    if (stageIndex > 0) {
      const prevStageItem = stageItems[stageIndex - 1];
      const stageTime = prevStageItem.querySelector('.stage-time');
      const elapsed = Date.now() - this.startTime;
      stageTime.textContent = this.formatTime(elapsed);
    }
  }

  /**
   * 設定訊息
   */
  setMessage(message) {
    if (!this.currentModal) return;

    const messageEl = this.currentModal.querySelector('.progress-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }

  /**
   * 添加詳細資訊
   */
  addDetail(label, value) {
    if (!this.currentModal) return;

    const detailsContainer = this.currentModal.querySelector('.progress-details');
    const detailRows = detailsContainer.querySelector('.detail-rows');

    // 顯示詳細資訊區域
    detailsContainer.style.display = 'block';

    // 檢查是否已存在
    let detailRow = detailRows.querySelector(`[data-label="${label}"]`);
    if (!detailRow) {
      detailRow = document.createElement('div');
      detailRow.className = 'detail-row';
      detailRow.setAttribute('data-label', label);
      detailRow.innerHTML = `
        <span class="detail-label">${label}:</span>
        <span class="detail-value">${value}</span>
      `;
      detailRows.appendChild(detailRow);
    } else {
      detailRow.querySelector('.detail-value').textContent = value;
    }
  }

  /**
   * 更新時間估算
   */
  updateTimeEstimate(progress) {
    if (!this.startTime || progress === 0) return;

    const elapsed = Date.now() - this.startTime;
    const estimatedTotal = elapsed / (progress / 100);
    const remaining = estimatedTotal - elapsed;

    this.addDetail('已用時間', this.formatTime(elapsed));

    if (progress < 100) {
      this.addDetail('預估剩餘', this.formatTime(remaining));
    }
  }

  /**
   * 格式化時間
   */
  formatTime(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}小時 ${minutes % 60}分`;
    } else if (minutes > 0) {
      return `${minutes}分 ${seconds % 60}秒`;
    } else {
      return `${seconds}秒`;
    }
  }

  /**
   * 處理取消
   */
  handleCancel() {
    if (this.cancelCallback) {
      this.cancelCallback();
    }
    this.close();
  }

  /**
   * 完成進度
   */
  complete() {
    this.updateProgress(100, '完成');

    // 延遲關閉
    setTimeout(() => {
      this.close();
    }, 1000);
  }

  /**
   * 顯示錯誤
   */
  error(message) {
    if (!this.currentModal) return;

    const progressBar = this.currentModal.querySelector('.progress-bar');
    const progressFill = this.currentModal.querySelector('.progress-fill');
    const progressStatus = this.currentModal.querySelector('.progress-status');
    const progressIcon = this.currentModal.querySelector('.progress-icon');

    progressBar.style.background = 'rgba(239, 68, 68, 0.1)';
    progressFill.style.background = 'var(--danger-color)';
    progressStatus.textContent = message || '發生錯誤';
    progressIcon.innerHTML = '❌';

    // 延遲關閉
    setTimeout(() => {
      this.close();
    }, 3000);
  }

  /**
   * 關閉進度模態框
   */
  close() {
    if (this.currentModal) {
      this.currentModal.classList.remove('show');
      setTimeout(() => {
        this.currentModal.remove();
        this.currentModal = null;
      }, 300);
    }

    this.stages = [];
    this.currentStage = 0;
    this.startTime = null;
    this.cancelCallback = null;
  }

  /**
   * 創建內聯進度條
   */
  createInlineProgress(container, options = {}) {
    const {
      label = '進度',
      showPercentage = true
    } = options;

    const progressHtml = `
      <div class="inline-progress">
        <div class="inline-progress-bar">
          <div class="inline-progress-fill" style="width: 0%"></div>
        </div>
        ${showPercentage ? '<div class="inline-progress-text">0%</div>' : ''}
      </div>
    `;

    container.innerHTML = progressHtml;

    return {
      update: (progress) => {
        const fill = container.querySelector('.inline-progress-fill');
        const text = container.querySelector('.inline-progress-text');

        fill.style.width = `${progress}%`;
        if (text) {
          text.textContent = `${Math.round(progress)}%`;
        }
      }
    };
  }

  /**
   * 顯示分段進度（用於音訊分割）
   */
  showSegmentProgress(totalSegments) {
    const container = this.currentModal?.querySelector('.progress-bar-container');
    if (!container) return;

    const segmentHtml = `
      <div class="segment-progress">
        <div class="segment-progress-header">
          <span>處理段落</span>
          <span class="segment-counter">0 / ${totalSegments}</span>
        </div>
        <div class="segment-progress-grid">
          ${Array(totalSegments).fill().map(() =>
            '<div class="segment-block"></div>'
          ).join('')}
        </div>
      </div>
    `;

    const segmentDiv = document.createElement('div');
    segmentDiv.innerHTML = segmentHtml;
    container.appendChild(segmentDiv.firstElementChild);

    return {
      setSegmentStatus: (index, status) => {
        const blocks = container.querySelectorAll('.segment-block');
        const counter = container.querySelector('.segment-counter');

        if (blocks[index]) {
          blocks[index].className = `segment-block ${status}`;
        }

        // 更新計數器
        const completed = container.querySelectorAll('.segment-block.completed').length;
        counter.textContent = `${completed} / ${totalSegments}`;
      }
    };
  }
}

// 創建全域實例
export const progressManager = new ProgressManager();

// 簡化的快捷方法
export function showProgress(options) {
  return progressManager.showProgress(options);
}

export function showSimpleProgress(title, message) {
  return progressManager.showProgress({
    title,
    message,
    cancellable: false,
    showDetails: false
  });
}

export function showProcessingProgress(title, stages, onCancel) {
  return progressManager.showProgress({
    title,
    message: '正在處理...',
    stages,
    cancellable: true,
    onCancel,
    showDetails: true,
    icon: '⚙️'
  });
}
