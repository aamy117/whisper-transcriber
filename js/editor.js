// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

// 轉譯編輯器模組
import Config from './config.js';
import { notify } from './notification.js';
import { dialog } from './dialog.js';
import VirtualScrollManager from './virtual-scroll-manager.js';
import { BatchEditor } from './batch-editor.js';

export class TranscriptionEditor {
  constructor(containerElement) {
    this.container = containerElement;
    this.segments = [];
    this.currentSegmentIndex = -1;
    this.autoSaveTimer = null;
    this.searchTerm = '';
    this.isEditable = true;
    this.showPunctuation = true; // 預設顯示標點符號

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

    // 虛擬滾動管理器
    this.virtualScrollManager = null;
    this.useVirtualScroll = true; // 預設啟用虛擬滾動
    this.virtualScrollThreshold = 100; // 超過100個段落時啟用虛擬滾動

    // 批次編輯器
    this.batchEditor = null;

    this.init();
  }

  init() {
    // 設定容器基本屬性
    this.container.classList.add('editor-container');

    // 初始化虛擬滾動管理器
    this.virtualScrollManager = new VirtualScrollManager({
      containerHeight: this.container.clientHeight || 600, // 使用實際容器高度，否則預設600
      itemHeight: 80,       // 預估每個段落高度
      bufferSize: 5,        // 緩衝區大小
      threshold: this.virtualScrollThreshold
    });

    // 初始化批次編輯器
    this.batchEditor = new BatchEditor(this);

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
      // 保存原始文字（含標點）和無標點版本
      originalText: seg.text, // 原始文字（含標點）
      textWithPunctuation: seg.text,
      textWithoutPunctuation: seg.textWithoutPunctuation || this.removePunctuation(seg.text),
      edited: seg.edited !== undefined ? seg.edited : seg.text,
      isEdited: seg.isEdited || false,
      isHighlighted: false
    }));

    // 儲存到歷史
    this.addToHistory();

    // 渲染
    this.render();
  }

  // 渲染編輯器
  render() {
    if (this.segments.length === 0) {
      this.container.innerHTML = '<div class="editor-empty">暫無轉譯內容</div>';
      return;
    }

    // 決定是否使用虛擬滾動
    const shouldUseVirtualScroll = this.useVirtualScroll && 
                                   this.segments.length > this.virtualScrollThreshold;

    if (shouldUseVirtualScroll) {
      // 使用虛擬滾動渲染
      this.renderWithVirtualScroll();
    } else {
      // 使用傳統渲染方式
      this.renderTraditional();
    }
  }

  // 傳統渲染方式（適用於少量段落）
  renderTraditional() {
    this.container.innerHTML = '';

    // 建立段落元素
    this.segments.forEach((segment, index) => {
      const segmentEl = this.createSegmentElement(segment, index);
      this.container.appendChild(segmentEl);
    });

    // 如果有搜尋詞，高亮顯示
    if (this.searchTerm) {
      this.highlightSearchResults();
    }
  }

  // 使用虛擬滾動渲染
  renderWithVirtualScroll() {
    // 確保虛擬滾動已經初始化到容器
    // 每次都重新初始化，確保容器正確設置
    this.virtualScrollManager.init(this.container, (segment, index) => {
      return this.createSegmentElement(segment, index);
    });

    // 設置段落數據
    this.virtualScrollManager.setItems(this.segments);

    // 如果有搜尋詞，延遲高亮顯示
    if (this.searchTerm) {
      requestAnimationFrame(() => {
        this.highlightSearchResults();
      });
    }

    DEBUG && console.log(`使用虛擬滾動渲染 ${this.segments.length} 個段落`);
  }

  // 建立段落元素
  createSegmentElement(segment, index) {
    const div = document.createElement('div');
    div.className = 'segment';
    div.dataset.segmentId = segment.id;
    div.dataset.index = index;

    // 如果是當前段落，加上高亮
    if (index === this.currentSegmentIndex) {
      div.classList.add('segment-active');
    }

    // 如果已編輯，加上標記
    if (segment.isEdited) {
      div.classList.add('segment-edited');
    }

    // 如果在批次選擇中，加上標記
    if (this.batchEditor && this.batchEditor.selectedSegments.has(index)) {
      div.classList.add('batch-selected');
    }

    // 時間標籤
    const timeEl = document.createElement('div');
    timeEl.className = 'segment-time';
    timeEl.dataset.time = segment.start;
    timeEl.textContent = this.formatTime(segment.start);
    timeEl.title = '點擊跳轉到此時間';

    // 文字內容
    const textEl = document.createElement('div');
    textEl.className = 'segment-text';
    textEl.contentEditable = this.isEditable;

    // 根據標點符號顯示設定選擇文字
    let displayText = segment.edited || segment.text;
    if (!this.showPunctuation && !segment.isEdited) {
      // 如果隱藏標點且未編輯，顯示無標點版本
      displayText = segment.textWithoutPunctuation || this.removePunctuation(displayText);
    }
    textEl.textContent = displayText;

    // 操作按鈕
    const actionsEl = document.createElement('div');
    actionsEl.className = 'segment-actions';

    // 組合元素
    div.appendChild(timeEl);
    div.appendChild(textEl);
    div.appendChild(actionsEl);

    // 更新操作按鈕
    this.updateSegmentActions(div, segment, index);

    // 綁定事件
    this.bindSegmentEvents(div, segment, index);

    return div;
  }

  // 綁定段落事件
  bindSegmentEvents(element, segment, index) {
    const textEl = element.querySelector('.segment-text');
    const timeEl = element.querySelector('.segment-time');

    // 文字編輯事件
    textEl.addEventListener('input', () => {
      this.handleEdit(index, textEl.textContent);
    });

    textEl.addEventListener('focus', () => {
      this.setCurrentSegment(index);
    });

    textEl.addEventListener('blur', () => {
      // 觸發自動儲存
      this.triggerAutoSave();
    });

    // 時間點擊事件
    timeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      this.handleTimeClick(segment.start);
    });

    // 段落點擊事件
    element.addEventListener('click', (e) => {
      // 如果在批次選擇模式，處理選擇邏輯
      if (this.batchEditor && this.batchEditor.isSelectionMode) {
        this.batchEditor.toggleSegmentSelection(index, e);
      } else {
        this.setCurrentSegment(index);
      }
    });
  }

  // 處理編輯
  handleEdit(index, newText) {
    const segment = this.segments[index];
    if (!segment || segment.edited === newText) return;

    // 更新文字
    segment.edited = newText;
    segment.isEdited = segment.edited !== segment.text;

    // 觸發編輯事件
    this.emit('edit', { segment, index });

    // 更新樣式
    const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
    if (segmentEl) {
      if (segment.isEdited) {
        segmentEl.classList.add('segment-edited');
      } else {
        segmentEl.classList.remove('segment-edited');
      }

      // 更新操作按鈕
      this.updateSegmentActions(segmentEl, segment, index);
    }

    // 觸發自動儲存
    this.triggerAutoSave();
  }

  // 更新段落操作按鈕
  updateSegmentActions(segmentEl, segment, index) {
    const actionsEl = segmentEl.querySelector('.segment-actions');
    actionsEl.innerHTML = '';

    // 分割按鈕
    const splitBtn = document.createElement('button');
    splitBtn.className = 'segment-action-btn';
    splitBtn.innerHTML = '✂️';
    splitBtn.title = '分割段落';
    splitBtn.onclick = (e) => {
      e.stopPropagation();
      this.showSplitDialog(index);
    };
    actionsEl.appendChild(splitBtn);

    // 合併按鈕（如果不是最後一個段落）
    if (index < this.segments.length - 1) {
      const mergeBtn = document.createElement('button');
      mergeBtn.className = 'segment-action-btn';
      mergeBtn.innerHTML = '🔗';
      mergeBtn.title = '與下一段合併';
      mergeBtn.onclick = (e) => {
        e.stopPropagation();
        this.mergeWithNext(index);
      };
      actionsEl.appendChild(mergeBtn);
    }

    // 復原按鈕
    if (segment.isEdited) {
      const revertBtn = document.createElement('button');
      revertBtn.className = 'segment-action-btn';
      revertBtn.innerHTML = '↩️';
      revertBtn.title = '復原到原始文字';
      revertBtn.onclick = (e) => {
        e.stopPropagation();
        this.revertSegment(index);
      };
      actionsEl.appendChild(revertBtn);
    }
  }

  // 復原段落
  revertSegment(index) {
    const segment = this.segments[index];
    if (!segment) return;

    segment.edited = segment.text;
    segment.isEdited = false;

    // 使用虛擬滾動管理器更新（如果可用）
    if (this.virtualScrollManager && this.virtualScrollManager.isVirtualMode) {
      this.virtualScrollManager.updateItem(index, segment);
    } else {
      // 重新渲染該段落
      const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
      if (segmentEl) {
        const newEl = this.createSegmentElement(segment, index);
        segmentEl.replaceWith(newEl);
      }
    }

    // 觸發編輯事件
    this.emit('edit', { segment, index });
    this.triggerAutoSave();
  }

  // 設定當前段落
  setCurrentSegment(index) {
    // 移除之前的高亮
    this.container.querySelectorAll('.segment-active').forEach(el => {
      el.classList.remove('segment-active');
    });

    // 設定新的當前段落
    this.currentSegmentIndex = index;
    
    // 檢查是否在虛擬滾動模式
    if (this.virtualScrollManager && this.virtualScrollManager.isVirtualMode) {
      // 使用虛擬滾動的方法滾動到指定位置
      this.virtualScrollManager.scrollToIndex(index, 'center');
      
      // 延遲添加高亮，確保元素已渲染
      requestAnimationFrame(() => {
        const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
        if (segmentEl) {
          segmentEl.classList.add('segment-active');
        }
      });
    } else {
      // 傳統模式
      const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
      if (segmentEl) {
        segmentEl.classList.add('segment-active');
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }
  }

  // 處理時間點擊
  handleTimeClick(time) {
    this.emit('segmentClick', { time });
  }

  // 搜尋功能
  search(term) {
    this.searchTerm = term.toLowerCase();

    if (!this.searchTerm) {
      this.clearSearch();
      return [];
    }

    // 找出匹配的段落
    const matches = [];
    this.segments.forEach((segment, index) => {
      const text = (segment.edited || segment.text).toLowerCase();
      if (text.includes(this.searchTerm)) {
        matches.push({ segment, index });
      }
    });

    // 高亮顯示結果
    this.highlightSearchResults();

    return matches;
  }

  // 高亮搜尋結果
  highlightSearchResults() {
    if (!this.searchTerm) return;

    // 獲取容器中所有可見的段落文字元素
    const visibleTextElements = this.container.querySelectorAll('.segment-text');
    
    visibleTextElements.forEach((textEl) => {
      const index = parseInt(textEl.parentElement.dataset.index);
      if (isNaN(index)) return;
      
      const segment = this.segments[index];
      if (!segment) return;
      
      const text = segment.edited || segment.text;

      // 使用正則表達式進行不區分大小寫的替換
      const regex = new RegExp(`(${this.escapeRegExp(this.searchTerm)})`, 'gi');
      const highlighted = text.replace(regex, '<mark>$1</mark>');

      textEl.innerHTML = highlighted;
    });
  }

  // 清除搜尋
  clearSearch() {
    this.searchTerm = '';
    
    // 如果在虛擬滾動模式，強制重新渲染
    if (this.virtualScrollManager && this.virtualScrollManager.isVirtualMode) {
      this.virtualScrollManager.forceRender();
    } else {
      this.render();
    }
  }

  // 跳轉到下一個搜尋結果
  nextSearchResult() {
    if (!this.searchTerm) return;

    const matches = this.search(this.searchTerm);
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

  // 跳轉到上一個搜尋結果
  prevSearchResult() {
    if (!this.searchTerm) return;

    const matches = this.search(this.searchTerm);
    if (matches.length === 0) return;

    // 找到當前位置之前的匹配
    let prevIndex = matches[matches.length - 1].index;
    for (let i = matches.length - 1; i >= 0; i--) {
      if (matches[i].index < this.currentSegmentIndex) {
        prevIndex = matches[i].index;
        break;
      }
    }

    this.setCurrentSegment(prevIndex);
  }

  // 取代當前匹配
  replaceCurrent(replaceText) {
    if (!this.searchTerm || this.currentSegmentIndex === null) return false;

    const segment = this.segments[this.currentSegmentIndex];
    if (!segment) return false;

    const text = segment.edited || segment.text;
    const regex = new RegExp(this.escapeRegExp(this.searchTerm), 'gi');

    // 檢查當前段落是否包含搜尋詞
    if (!regex.test(text)) return false;

    // 執行取代
    segment.edited = text.replace(regex, replaceText);
    segment.isEdited = true;

    // 重新渲染該段落
    const segmentEl = this.container.querySelector(`[data-index="${this.currentSegmentIndex}"]`);
    if (segmentEl) {
      const newEl = this.createSegmentElement(segment, this.currentSegmentIndex);
      segmentEl.replaceWith(newEl);
    }

    // 觸發編輯事件
    this.emit('edit', { segment, index: this.currentSegmentIndex });
    this.triggerAutoSave();

    // 移動到下一個搜尋結果
    this.nextSearchResult();

    return true;
  }

  // 取代所有匹配
  replaceAll(replaceText) {
    if (!this.searchTerm) return 0;

    let replaceCount = 0;
    const regex = new RegExp(this.escapeRegExp(this.searchTerm), 'gi');

    this.segments.forEach((segment, index) => {
      const text = segment.edited || segment.text;

      // 檢查是否包含搜尋詞
      if (regex.test(text)) {
        segment.edited = text.replace(regex, replaceText);
        segment.isEdited = true;
        replaceCount++;
      }
    });

    if (replaceCount > 0) {
      // 重新渲染所有內容
      this.render();

      // 觸發編輯事件
      this.emit('edit', { type: 'replaceAll', count: replaceCount });
      this.triggerAutoSave();
    }

    return replaceCount;
  }

  // 顯示分割對話框
  async showSplitDialog(index) {
    const segment = this.segments[index];
    if (!segment) return;

    const text = segment.edited || segment.text;
    const selection = window.getSelection();
    let splitPosition = -1;

    // 檢查是否有選擇文字
    if (selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const segmentEl = this.container.querySelector(`[data-index="${index}"] .segment-text`);

      if (segmentEl && segmentEl.contains(range.commonAncestorContainer)) {
        // 計算分割位置
        const preRange = document.createRange();
        preRange.selectNodeContents(segmentEl);
        preRange.setEnd(range.startContainer, range.startOffset);
        splitPosition = preRange.toString().length;
      }
    }

    // 如果沒有選擇，使用對話框
    if (splitPosition === -1) {
      const position = await dialog.prompt({
        title: '分割段落',
        message: `請輸入分割位置：`,
        defaultValue: Math.floor(text.length / 2).toString(),
        placeholder: `1-${text.length}`,
        hint: `段落長度：${text.length} 字`,
        validate: (value) => {
          const num = parseInt(value);
          if (isNaN(num) || num < 1 || num >= text.length) {
            return `請輸入 1 到 ${text.length - 1} 之間的數字`;
          }
          return null;
        }
      });

      if (!position) return;
      splitPosition = parseInt(position);
    }

    this.splitSegment(index, splitPosition);
  }

  // 分割段落
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
      isEdited: true,
      id: segment.id + '_1'
    };

    const secondSegment = {
      start: splitTime,
      end: segment.end,
      text: segment.text.substring(position).trim(),
      edited: text.substring(position).trim(),
      isEdited: true,
      id: segment.id + '_2'
    };

    // 使用虛擬滾動管理器的方法（如果可用）
    if (this.virtualScrollManager && this.virtualScrollManager.isVirtualMode) {
      // 先更新數據
      this.segments.splice(index, 1, firstSegment, secondSegment);
      // 使用虛擬滾動的插入方法
      this.virtualScrollManager.setItems(this.segments);
    } else {
      // 替換原段落
      this.segments.splice(index, 1, firstSegment, secondSegment);
      // 重新渲染
      this.render();
    }

    // 觸發編輯事件
    this.emit('edit', { type: 'split', index });
    this.triggerAutoSave();

    this.showNotification('段落已分割', 'success');
  }

  // 與下一段合併
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
      isEdited: true,
      id: currentSegment.id
    };

    // 使用虛擬滾動管理器的方法（如果可用）
    if (this.virtualScrollManager && this.virtualScrollManager.isVirtualMode) {
      // 先更新數據
      this.segments.splice(index, 2, mergedSegment);
      // 重新設置項目
      this.virtualScrollManager.setItems(this.segments);
    } else {
      // 替換段落
      this.segments.splice(index, 2, mergedSegment);
      // 重新渲染
      this.render();
    }

    // 觸發編輯事件
    this.emit('edit', { type: 'merge', index });
    this.triggerAutoSave();

    this.showNotification('段落已合併', 'success');
  }

  // 顯示通知
  showNotification(message, type = 'info') {
    notify[type](message);
  }

  // 觸發自動儲存
  triggerAutoSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      this.save();
    }, Config.storage.autoSaveInterval);
  }

  // 儲存
  save() {
    // 添加到歷史
    this.addToHistory();

    // 觸發儲存事件
    this.emit('save', { segments: this.segments });
  }

  // 歷史管理
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

  // 復原
  undo() {
    if (this.historyIndex > 0) {
      this.historyIndex--;
      this.segments = JSON.parse(this.editHistory[this.historyIndex]);
      this.render();
      this.emit('edit', { type: 'undo' });
    }
  }

  // 重做
  redo() {
    if (this.historyIndex < this.editHistory.length - 1) {
      this.historyIndex++;
      this.segments = JSON.parse(this.editHistory[this.historyIndex]);
      this.render();
      this.emit('edit', { type: 'redo' });
    }
  }

  // 取得編輯後的內容
  getEditedContent() {
    return {
      segments: this.segments,
      text: this.segments.map(s => s.edited || s.text).join('\n\n'),
      hasEdits: this.segments.some(s => s.isEdited)
    };
  }

  // 取得純文字
  getPlainText() {
    return this.segments.map(s => s.edited || s.text).join('\n\n');
  }

  // 格式化時間
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  // 正則表達式轉義
  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 鍵盤事件
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

  // 事件管理
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

  // 設定編輯狀態
  setEditable(editable) {
    this.isEditable = editable;
    this.container.querySelectorAll('.segment-text').forEach(el => {
      el.contentEditable = editable;
    });
  }

  // 移除標點符號
  removePunctuation(text) {
    if (!text) return text;

    // 定義要移除的標點符號（中英文）
    const punctuationRegex = /[，。！？；：、,\.!?;:'"'"（）\[\]{}【】]/g;

    // 移除標點符號，但保留空格
    return text.replace(punctuationRegex, ' ').replace(/\s+/g, ' ').trim();
  }

  // 設定標點符號顯示
  setShowPunctuation(show) {
    this.showPunctuation = show;

    // 如果在虛擬滾動模式，強制重新渲染
    if (this.virtualScrollManager && this.virtualScrollManager.isVirtualMode) {
      this.virtualScrollManager.forceRender();
    } else {
      // 重新渲染所有段落
      this.render();
    }
  }

  // 清除內容
  clear() {
    this.segments = [];
    this.currentSegmentIndex = -1;
    this.searchTerm = '';
    this.editHistory = [];
    this.historyIndex = -1;
    clearTimeout(this.autoSaveTimer);
    
    // 清理虛擬滾動管理器
    if (this.virtualScrollManager) {
      this.virtualScrollManager.setItems([]);
    }
    
    this.render();
  }

  // 設定是否使用虛擬滾動
  setUseVirtualScroll(enable) {
    this.useVirtualScroll = enable;
    this.render();
  }

  // 獲取虛擬滾動統計資訊
  getVirtualScrollStats() {
    if (this.virtualScrollManager) {
      return this.virtualScrollManager.getStats();
    }
    return null;
  }

  // ========== 批次編輯相關方法 ==========
  
  /**
   * 啟用/禁用批次選擇模式
   */
  toggleBatchSelectionMode() {
    if (!this.batchEditor) return false;
    
    const isEnabled = this.batchEditor.toggleSelectionMode();
    
    // 更新容器樣式
    if (isEnabled) {
      this.container.classList.add('batch-selection-mode');
    } else {
      this.container.classList.remove('batch-selection-mode');
    }
    
    // 重新渲染以更新選擇狀態
    this.render();
    
    return isEnabled;
  }

  /**
   * 獲取批次選擇狀態
   */
  getBatchSelectionStatus() {
    if (!this.batchEditor) return { enabled: false, count: 0 };
    
    return {
      enabled: this.batchEditor.isSelectionMode,
      count: this.batchEditor.selectedSegments.size,
      total: this.segments.length
    };
  }

  /**
   * 更新批次選擇 UI
   */
  updateBatchSelectionUI() {
    // 更新所有段落的選擇狀態
    this.segments.forEach((segment, index) => {
      const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
      if (segmentEl) {
        if (this.batchEditor && this.batchEditor.selectedSegments.has(index)) {
          segmentEl.classList.add('batch-selected');
        } else {
          segmentEl.classList.remove('batch-selected');
        }
      }
    });
  }

  /**
   * 執行批次操作
   */
  async executeBatchOperation(operation) {
    if (!this.batchEditor) return;
    
    switch (operation) {
      case 'delete':
        await this.batchEditor.batchDelete();
        break;
      case 'merge':
        await this.batchEditor.batchMerge();
        break;
      case 'split':
        await this.batchEditor.batchSplit();
        break;
      case 'findReplace':
        await this.batchEditor.batchFindReplace();
        break;
      case 'adjustTime':
        await this.batchEditor.batchAdjustTime();
        break;
      case 'export':
        await this.batchEditor.batchExport();
        break;
      default:
        notify.warning('未知的批次操作');
    }
  }

  /**
   * 批次選擇快捷操作
   */
  batchSelectAll() {
    if (this.batchEditor) {
      this.batchEditor.selectAll();
    }
  }

  batchSelectNone() {
    if (this.batchEditor) {
      this.batchEditor.clearSelection();
    }
  }

  batchSelectInvert() {
    if (this.batchEditor) {
      this.batchEditor.invertSelection();
    }
  }

  batchSelectByCondition(condition) {
    if (this.batchEditor) {
      this.batchEditor.selectByCondition(condition);
    }
  }
}
