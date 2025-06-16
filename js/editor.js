// 轉譯編輯器模組
import Config from './config.js';

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
    
    this.init();
  }
  
  init() {
    // 設定容器基本屬性
    this.container.classList.add('editor-container');
    
    // 綁定鍵盤事件
    this.bindKeyboardEvents();
  }
  
  // 載入轉譯結果
  loadTranscription(transcription) {
    if (!transcription || !transcription.segments) {
      console.error('Invalid transcription data');
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
    
    // 渲染
    this.render();
  }
  
  // 渲染編輯器
  render() {
    this.container.innerHTML = '';
    
    if (this.segments.length === 0) {
      this.container.innerHTML = '<div class="editor-empty">暫無轉譯內容</div>';
      return;
    }
    
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
    textEl.textContent = segment.edited || segment.text;
    
    // 操作按鈕
    const actionsEl = document.createElement('div');
    actionsEl.className = 'segment-actions';
    
    // 復原按鈕（只在已編輯時顯示）
    if (segment.isEdited) {
      const revertBtn = document.createElement('button');
      revertBtn.className = 'segment-action-btn';
      revertBtn.innerHTML = '↩️';
      revertBtn.title = '復原到原始文字';
      revertBtn.onclick = () => this.revertSegment(index);
      actionsEl.appendChild(revertBtn);
    }
    
    // 組合元素
    div.appendChild(timeEl);
    div.appendChild(textEl);
    div.appendChild(actionsEl);
    
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
    element.addEventListener('click', () => {
      this.setCurrentSegment(index);
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
    
    if (segment.isEdited) {
      const revertBtn = document.createElement('button');
      revertBtn.className = 'segment-action-btn';
      revertBtn.innerHTML = '↩️';
      revertBtn.title = '復原到原始文字';
      revertBtn.onclick = () => this.revertSegment(index);
      actionsEl.appendChild(revertBtn);
    }
  }
  
  // 復原段落
  revertSegment(index) {
    const segment = this.segments[index];
    if (!segment) return;
    
    segment.edited = segment.text;
    segment.isEdited = false;
    
    // 重新渲染該段落
    const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
    if (segmentEl) {
      const newEl = this.createSegmentElement(segment, index);
      segmentEl.replaceWith(newEl);
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
    const segmentEl = this.container.querySelector(`[data-index="${index}"]`);
    if (segmentEl) {
      segmentEl.classList.add('segment-active');
      
      // 如果需要，滾動到視圖中
      segmentEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
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
    
    this.container.querySelectorAll('.segment-text').forEach((textEl, index) => {
      const segment = this.segments[index];
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
    this.render();
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
  
  // 清除內容
  clear() {
    this.segments = [];
    this.currentSegmentIndex = -1;
    this.searchTerm = '';
    this.editHistory = [];
    this.historyIndex = -1;
    clearTimeout(this.autoSaveTimer);
    this.render();
  }
}