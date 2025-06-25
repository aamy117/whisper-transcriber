// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

// 優化版轉譯編輯器模組
import Config from './config.js';
import { notify } from './notification.js';
import { dialog } from './dialog.js';
import { VirtualScrollEditor } from './virtual-scroll.js';
import { EditorBatchUpdater } from './dom-batch-update.js';
import { SearchOptimizer, debounce } from './utils/debounce.js';

export class TranscriptionEditor {
  constructor(containerElement) {
    this.container = containerElement;
    this.segments = [];
    this.currentSegmentIndex = -1;
    this.autoSaveTimer = null;
    this.searchTerm = '';
    this.isEditable = true;

    // 編輯歷史（用於復原功能）
    this.editHistory = [];
    this.historyIndex = -1;
    this.maxHistorySize = 50;

    // 事件監聽器
    this.eventHandlers = {
      save: [],
      segmentClick: [],
      edit: []
    };

    // 優化工具
    this.virtualScrollEditor = null;
    this.batchUpdater = new EditorBatchUpdater();
    this.searchOptimizer = null;
    this.useVirtualScroll = true; // 可配置是否使用虛擬滾動

    // Debounced 函數
    this.debouncedSave = debounce(this.save.bind(this), Config.storage.autoSaveInterval);
    this.debouncedSearch = null;

    this.init();
  }

  init() {
    // 設定容器基本屬性
    this.container.classList.add('editor-container');

    // 初始化搜尋優化器
    this.searchOptimizer = new SearchOptimizer({
      delay: 300,
      maxWait: 1000,
      minSearchLength: 2,
      onSearch: this.performSearch.bind(this),
      onSearchStart: () => {
        this.showNotification('搜尋中...', 'info');
      },
      onSearchEnd: (results, error, fromCache) => {
        if (error) {
          this.showNotification('搜尋失敗', 'error');
        } else if (results.length === 0) {
          this.showNotification('沒有找到結果', 'warning');
        } else {
          this.showNotification(
            `找到 ${results.length} 個結果${fromCache ? ' (快取)' : ''}`,
            'success'
          );
        }
      }
    });

    // 綁定鍵盤事件
    this.bindKeyboardEvents();
  }

  // 載入轉譯結果
  loadTranscription(transcription) {
    if (!transcription || !transcription.segments) {
      if (typeof DEBUG !== 'undefined' && DEBUG) console.error('Invalid transcription data');
      return;
    }

    // 轉換段落格式
    this.segments = transcription.segments.map((seg, index) => ({
      ...seg,
      id: seg.id || index,
      edited: seg.edited !== undefined ? seg.edited : seg.text,
      isEdited: seg.isEdited || false,
      isHighlighted: false
    }));

    // 儲存到歷史
    this.addToHistory();

    // 根據段落數量決定是否使用虛擬滾動
    const shouldUseVirtualScroll = this.useVirtualScroll && this.segments.length > 50;

    if (shouldUseVirtualScroll) {
      this.renderWithVirtualScroll();
    } else {
      this.renderWithBatchUpdate();
    }
  }

  // 使用虛擬滾動渲染
  renderWithVirtualScroll() {
    this.container.innerHTML = '';

    if (this.segments.length === 0) {
      this.container.innerHTML = '<div class="editor-empty">暫無轉譯內容</div>';
      return;
    }

    // 銷毀舊的虛擬滾動實例
    if (this.virtualScrollEditor) {
      this.virtualScrollEditor.destroy();
    }

    // 建立虛擬滾動編輯器
    this.virtualScrollEditor = new VirtualScrollEditor(this.container, this.segments);

    // 監聽事件
    this.container.addEventListener('segmentEdit', (e) => {
      const { segment, index } = e.detail;
      this.handleEdit(index, segment.edited);
    });

    this.container.addEventListener('timeClick', (e) => {
      this.handleTimeClick(e.detail.time);
    });
  }

  // 使用批次更新渲染
  renderWithBatchUpdate() {
    if (this.segments.length === 0) {
      this.container.innerHTML = '<div class="editor-empty">暫無轉譯內容</div>';
      return;
    }

    // 使用批次更新器渲染段落
    this.batchUpdater.renderSegments(this.container, this.segments, {
      highlightTerm: this.searchTerm,
      selectedIndexes: [this.currentSegmentIndex],
      onSegmentClick: (segment, index) => {
        this.setCurrentSegment(index);
        this.handleTimeClick(segment.start);
      },
      onSegmentEdit: (text, segment, index) => {
        this.handleEdit(index, text);
      }
    });
  }

  // 統一的渲染方法
  render() {
    if (this.virtualScrollEditor) {
      this.virtualScrollEditor.refresh();
    } else {
      this.renderWithBatchUpdate();
    }
  }

  // 建立段落元素（保留用於非虛擬滾動模式）
  createSegmentElement(segment, index) {
    return this.batchUpdater.createSegmentElement(segment, index, {
      highlightTerm: this.searchTerm,
      isSelected: index === this.currentSegmentIndex,
      onSegmentClick: (seg, idx) => {
        this.setCurrentSegment(idx);
        this.handleTimeClick(seg.start);
      },
      onSegmentEdit: (text, seg, idx) => {
        this.handleEdit(idx, text);
      }
    });
  }

  // 處理編輯（優化版）
  handleEdit(index, newText) {
    const segment = this.segments[index];
    if (!segment || segment.edited === newText) return;

    // 更新文字
    segment.edited = newText;
    segment.isEdited = segment.edited !== segment.text;

    // 觸發編輯事件
    this.emit('edit', { segment, index });

    // 如果使用虛擬滾動，更新單個項目
    if (this.virtualScrollEditor) {
      this.virtualScrollEditor.updateSegment(index, segment);
    } else {
      // 批次更新單個段落的樣式
      const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
      if (segmentEl) {
        this.batchUpdater.batchUpdateAttributes([{
          element: segmentEl,
          updates: {
            classList: {
              add: segment.isEdited ? ['segment-edited'] : [],
              remove: segment.isEdited ? [] : ['segment-edited']
            }
          }
        }]);
      }
    }

    // 使用 debounced 自動儲存
    this.debouncedSave();
  }

  // 搜尋功能（優化版）
  search(term) {
    this.searchTerm = term;
    this.searchOptimizer.handleSearchInput(term);
  }

  // 執行搜尋（由 SearchOptimizer 調用）
  async performSearch(term) {
    const searchTerm = term.toLowerCase();
    const matches = [];

    // 使用 Promise 模擬異步搜尋，可在 Web Worker 中執行
    return new Promise((resolve) => {
      this.segments.forEach((segment, index) => {
        const text = (segment.edited || segment.text).toLowerCase();
        if (text.includes(searchTerm)) {
          matches.push({ segment, index });
        }
      });

      // 更新高亮
      if (this.virtualScrollEditor) {
        // 虛擬滾動模式下，只更新可見項目
        this.virtualScrollEditor.refresh();
      } else {
        // 批次更新高亮
        const visibleIndexes = matches.map(m => m.index);
        this.batchUpdater.batchUpdateHighlight(
          this.container,
          visibleIndexes,
          term
        );
      }

      resolve(matches);
    });
  }

  // 清除搜尋
  clearSearch() {
    this.searchTerm = '';
    this.searchOptimizer.clearSearch();
    this.render();
  }

  // 跳轉到下一個搜尋結果
  nextSearchResult() {
    if (!this.searchTerm) return;

    // 從快取獲取搜尋結果
    const matches = this.searchOptimizer.searchCache.get(this.searchTerm) || [];
    if (matches.length === 0) return;

    // 找到當前位置之後的下一個匹配
    let nextIndex = 0;
    for (let i = 0; i < matches.length; i++) {
      if (matches[i].index > this.currentSegmentIndex) {
        nextIndex = matches[i].index;
        break;
      }
    }

    // 如果沒有找到，從頭開始
    if (nextIndex === 0 && matches[0].index <= this.currentSegmentIndex) {
      nextIndex = matches[0].index;
    }

    this.setCurrentSegment(nextIndex);
  }

  // 設定當前段落（優化版）
  setCurrentSegment(index) {
    if (index === this.currentSegmentIndex) return;

    const oldIndex = this.currentSegmentIndex;
    this.currentSegmentIndex = index;

    if (this.virtualScrollEditor) {
      // 虛擬滾動模式
      this.virtualScrollEditor.scrollToSegment(index);
    } else {
      // 批次更新樣式
      const updates = [];

      // 移除舊的高亮
      if (oldIndex >= 0) {
        const oldEl = this.container.querySelector(`[data-index="${oldIndex}"]`);
        if (oldEl) {
          updates.push({
            element: oldEl,
            updates: { classList: { remove: ['segment-active'] } }
          });
        }
      }

      // 添加新的高亮
      const newEl = this.container.querySelector(`[data-index="${index}"]`);
      if (newEl) {
        updates.push({
          element: newEl,
          updates: { classList: { add: ['segment-active'] } }
        });

        // 滾動到視圖中
        newEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }

      this.batchUpdater.batchUpdateAttributes(updates);
    }
  }

  // 取代所有匹配（優化版）
  replaceAll(replaceText) {
    if (!this.searchTerm) return 0;

    let replaceCount = 0;
    const regex = new RegExp(this.escapeRegExp(this.searchTerm), 'gi');
    const modifiedIndexes = [];

    this.segments.forEach((segment, index) => {
      const text = segment.edited || segment.text;

      // 檢查是否包含搜尋詞
      if (regex.test(text)) {
        segment.edited = text.replace(regex, replaceText);
        segment.isEdited = true;
        replaceCount++;
        modifiedIndexes.push(index);
      }
    });

    if (replaceCount > 0) {
      // 使用批次更新
      if (this.virtualScrollEditor) {
        // 虛擬滾動模式，只更新修改的項目
        modifiedIndexes.forEach(index => {
          this.virtualScrollEditor.updateSegment(index, this.segments[index]);
        });
      } else {
        // 重新渲染所有內容
        this.renderWithBatchUpdate();
      }

      // 觸發編輯事件
      this.emit('edit', { type: 'replaceAll', count: replaceCount });
      this.debouncedSave();
    }

    return replaceCount;
  }

  // 分割段落（保持原有邏輯）
  splitSegment(index, position) {
    const segment = this.segments[index];
    if (!segment) return;

    const text = segment.edited || segment.text;
    if (position < 1 || position >= text.length) return;

    // 計算新的時間點
    const duration = segment.end - segment.start;
    const splitRatio = position / text.length;
    const splitTime = segment.start + (duration * splitRatio);

    // 建立兩個新段落
    const firstSegment = {
      start: segment.start,
      end: splitTime,
      text: segment.text.substring(0, position).trim(),
      edited: text.substring(0, position).trim(),
      isEdited: true
    };

    const secondSegment = {
      start: splitTime,
      end: segment.end,
      text: segment.text.substring(position).trim(),
      edited: text.substring(position).trim(),
      isEdited: true
    };

    // 替換原段落
    this.segments.splice(index, 1, firstSegment, secondSegment);

    // 重新渲染
    if (this.virtualScrollEditor) {
      this.virtualScrollEditor.setSegments(this.segments);
    } else {
      this.renderWithBatchUpdate();
    }

    // 觸發編輯事件
    this.emit('edit', { type: 'split', index });
    this.debouncedSave();

    this.showNotification('段落已分割', 'success');
  }

  // 與下一段合併（保持原有邏輯）
  mergeWithNext(index) {
    if (index >= this.segments.length - 1) return;

    const currentSegment = this.segments[index];
    const nextSegment = this.segments[index + 1];

    // 合併文字
    const currentText = currentSegment.edited || currentSegment.text;
    const nextText = nextSegment.edited || nextSegment.text;

    // 建立合併後的段落
    const mergedSegment = {
      start: currentSegment.start,
      end: nextSegment.end,
      text: currentSegment.text + ' ' + nextSegment.text,
      edited: currentText + ' ' + nextText,
      isEdited: true
    };

    // 替換段落
    this.segments.splice(index, 2, mergedSegment);

    // 重新渲染
    if (this.virtualScrollEditor) {
      this.virtualScrollEditor.setSegments(this.segments);
    } else {
      this.renderWithBatchUpdate();
    }

    // 觸發編輯事件
    this.emit('edit', { type: 'merge', index });
    this.debouncedSave();

    this.showNotification('段落已合併', 'success');
  }

  // 其他方法保持不變...
  showNotification(message, type = 'info') {
    notify[type](message);
  }

  save() {
    // 添加到歷史
    this.addToHistory();

    // 觸發儲存事件
    this.emit('save', { segments: this.segments });
  }

  addToHistory() {
    // 移除當前位置之後的歷史
    this.editHistory = this.editHistory.slice(0, this.historyIndex + 1);

    // 添加當前狀態
    const state = JSON.stringify(this.segments);
    this.editHistory.push(state);

    // 限制歷史大小
    if (this.editHistory.length > this.maxHistorySize) {
      this.editHistory.shift();
    } else {
      this.historyIndex++;
    }
  }

  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.segments = JSON.parse(this.editHistory[this.historyIndex]);

      if (this.virtualScrollEditor) {
        this.virtualScrollEditor.setSegments(this.segments);
      } else {
        this.renderWithBatchUpdate();
      }

      this.emit('edit', { type: 'undo' });
    }
  }

  redo() {
    if (this.historyIndex < this.editHistory.length - 1) {
      this.historyIndex++;
      this.segments = JSON.parse(this.editHistory[this.historyIndex]);

      if (this.virtualScrollEditor) {
        this.virtualScrollEditor.setSegments(this.segments);
      } else {
        this.renderWithBatchUpdate();
      }

      this.emit('edit', { type: 'redo' });
    }
  }

  getEditedContent() {
    return {
      segments: this.segments,
      text: this.segments.map(s => s.edited || s.text).join('\n\n'),
      hasEdits: this.segments.some(s => s.isEdited)
    };
  }

  getPlainText() {
    return this.segments.map(s => s.edited || s.text).join('\n\n');
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  bindKeyboardEvents() {
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Z: 復原
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
      }

      // Ctrl/Cmd + Shift + Z 或 Ctrl/Cmd + Y: 重做
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        this.redo();
      }

      // F3 或 Ctrl/Cmd + G: 下一個搜尋結果
      if (e.key === 'F3' || ((e.ctrlKey || e.metaKey) && e.key === 'g')) {
        e.preventDefault();
        this.nextSearchResult();
      }
    });
  }

  on(event, handler) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].push(handler);
    }
  }

  off(event, handler) {
    if (this.eventHandlers[event]) {
      const index = this.eventHandlers[event].indexOf(handler);
      if (index > -1) {
        this.eventHandlers[event].splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.eventHandlers[event]) {
      this.eventHandlers[event].forEach(handler => handler(data));
    }
  }

  setEditable(editable) {
    this.isEditable = editable;

    if (this.virtualScrollEditor) {
      // 虛擬滾動模式需要重新渲染
      this.virtualScrollEditor.refresh();
    } else {
      this.container.querySelectorAll('.segment-text').forEach(el => {
        el.contentEditable = editable;
      });
    }
  }

  clear() {
    this.segments = [];
    this.currentSegmentIndex = -1;
    this.searchTerm = '';
    this.editHistory = [];
    this.historyIndex = -1;

    // 清理優化器
    if (this.virtualScrollEditor) {
      this.virtualScrollEditor.destroy();
      this.virtualScrollEditor = null;
    }

    this.searchOptimizer.destroy();
    this.batchUpdater.clearCache();

    // 取消 debounced 函數
    this.debouncedSave.cancel();

    this.render();
  }

  // 設定是否使用虛擬滾動
  setUseVirtualScroll(use) {
    if (this.useVirtualScroll !== use) {
      this.useVirtualScroll = use;

      // 如果有內容，重新渲染
      if (this.segments.length > 0) {
        if (use && this.segments.length > 50) {
          this.renderWithVirtualScroll();
        } else {
          if (this.virtualScrollEditor) {
            this.virtualScrollEditor.destroy();
            this.virtualScrollEditor = null;
          }
          this.renderWithBatchUpdate();
        }
      }
    }
  }

  // 取得效能統計
  getPerformanceStats() {
    return {
      totalSegments: this.segments.length,
      editedSegments: this.segments.filter(s => s.isEdited).length,
      useVirtualScroll: this.useVirtualScroll && this.virtualScrollEditor !== null,
      searchCacheSize: this.searchOptimizer.searchCache.size,
      historySize: this.editHistory.length
    };
  }
}
