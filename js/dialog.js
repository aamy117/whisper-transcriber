// 對話框系統模組
export class DialogSystem {
  constructor() {
    this.dialogs = new Map();
    this.dialogId = 0;
    this.init();
  }

  init() {
    this.injectStyles();
  }

  injectStyles() {
    if (document.getElementById('dialog-styles')) return;

    const style = document.createElement('style');
    style.id = 'dialog-styles';
    style.textContent = `
      .dialog-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        z-index: 9990;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.3s ease-out;
      }

      .dialog-overlay.show {
        opacity: 1;
      }

      .dialog {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        max-width: 500px;
        width: 90%;
        max-height: 90vh;
        overflow: hidden;
        transform: scale(0.9);
        transition: transform 0.3s ease-out;
      }

      .dialog-overlay.show .dialog {
        transform: scale(1);
      }

      .dialog-header {
        padding: 20px;
        border-bottom: 1px solid #e9ecef;
      }

      .dialog-title {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: #212529;
      }

      .dialog-body {
        padding: 20px;
        overflow-y: auto;
        max-height: calc(90vh - 140px);
      }

      .dialog-footer {
        padding: 20px;
        border-top: 1px solid #e9ecef;
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }

      .dialog-btn {
        padding: 8px 16px;
        border: none;
        border-radius: 4px;
        font-size: 14px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .dialog-btn-primary {
        background: #007bff;
        color: white;
      }

      .dialog-btn-primary:hover {
        background: #0056b3;
      }

      .dialog-btn-secondary {
        background: #6c757d;
        color: white;
      }

      .dialog-btn-secondary:hover {
        background: #545b62;
      }

      .dialog-input {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid #ced4da;
        border-radius: 4px;
        font-size: 14px;
        margin-top: 10px;
      }

      .dialog-input:focus {
        outline: none;
        border-color: #80bdff;
        box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
      }

      .dialog-label {
        display: block;
        margin-bottom: 5px;
        font-weight: 500;
        color: #495057;
      }

      .dialog-hint {
        font-size: 12px;
        color: #6c757d;
        margin-top: 5px;
      }

      /* 深色模式 */
      [data-theme="dark"] .dialog {
        background: #2b2b2b;
      }

      [data-theme="dark"] .dialog-header,
      [data-theme="dark"] .dialog-footer {
        border-color: #404040;
      }

      [data-theme="dark"] .dialog-title {
        color: #f8f9fa;
      }

      [data-theme="dark"] .dialog-input {
        background: #1a1a1a;
        border-color: #404040;
        color: #f8f9fa;
      }

      [data-theme="dark"] .dialog-label {
        color: #adb5bd;
      }
    `;

    document.head.appendChild(style);
  }

  async prompt(options = {}) {
    const {
      title = '請輸入',
      message = '',
      defaultValue = '',
      placeholder = '',
      hint = '',
      okText = '確定',
      cancelText = '取消',
      validate = null
    } = options;

    return new Promise((resolve) => {
      const id = ++this.dialogId;

      // 建立對話框
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = `
        <div class="dialog">
          <div class="dialog-header">
            <h3 class="dialog-title">${this.escapeHtml(title)}</h3>
          </div>
          <div class="dialog-body">
            ${message ? `<p>${this.escapeHtml(message)}</p>` : ''}
            <input type="text"
                   class="dialog-input"
                   id="dialog-input-${id}"
                   value="${this.escapeHtml(defaultValue)}"
                   placeholder="${this.escapeHtml(placeholder)}"
                   autofocus>
            ${hint ? `<div class="dialog-hint">${this.escapeHtml(hint)}</div>` : ''}
          </div>
          <div class="dialog-footer">
            <button class="dialog-btn dialog-btn-secondary" data-action="cancel">
              ${this.escapeHtml(cancelText)}
            </button>
            <button class="dialog-btn dialog-btn-primary" data-action="ok">
              ${this.escapeHtml(okText)}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      // 取得元素
      const input = overlay.querySelector(`#dialog-input-${id}`);
      const dialog = overlay.querySelector('.dialog');

      // 聚焦並選擇文字
      setTimeout(() => {
        overlay.classList.add('show');
        input.focus();
        input.select();
      }, 10);

      // 處理確定
      const handleOk = async () => {
        const value = input.value;

        // 驗證
        if (validate) {
          const error = await validate(value);
          if (error) {
            input.setCustomValidity(error);
            input.reportValidity();
            return;
          }
        }

        close();
        resolve(value);
      };

      // 處理取消
      const handleCancel = () => {
        close();
        resolve(null);
      };

      // 關閉對話框
      const close = () => {
        overlay.classList.remove('show');
        setTimeout(() => {
          overlay.remove();
        }, 300);
      };

      // 事件監聽
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          handleCancel();
        }

        const action = e.target.dataset.action;
        if (action === 'ok') {
          handleOk();
        } else if (action === 'cancel') {
          handleCancel();
        }
      });

      // 鍵盤事件
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleOk();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });

      dialog.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancel();
        }
      });
    });
  }

  async confirm(options = {}) {
    const {
      title = '確認',
      message = '確定要執行此操作嗎？',
      okText = '確定',
      cancelText = '取消',
      type = 'info'
    } = options;

    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'dialog-overlay';
      overlay.innerHTML = `
        <div class="dialog">
          <div class="dialog-header">
            <h3 class="dialog-title">${this.escapeHtml(title)}</h3>
          </div>
          <div class="dialog-body">
            <p>${this.escapeHtml(message)}</p>
          </div>
          <div class="dialog-footer">
            <button class="dialog-btn dialog-btn-secondary" data-action="cancel">
              ${this.escapeHtml(cancelText)}
            </button>
            <button class="dialog-btn dialog-btn-primary" data-action="ok">
              ${this.escapeHtml(okText)}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      setTimeout(() => {
        overlay.classList.add('show');
      }, 10);

      const close = (result) => {
        overlay.classList.remove('show');
        setTimeout(() => {
          overlay.remove();
          resolve(result);
        }, 300);
      };

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          close(false);
        }

        const action = e.target.dataset.action;
        if (action === 'ok') {
          close(true);
        } else if (action === 'cancel') {
          close(false);
        }
      });

      overlay.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          close(false);
        }
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// 建立全域實例
export const dialogSystem = new DialogSystem();

// 提供簡易 API
export const dialog = {
  prompt: (options) => dialogSystem.prompt(options),
  confirm: (options) => dialogSystem.confirm(options)
};
