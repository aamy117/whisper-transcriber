/**
 * 批次編輯器模組
 * 為 TranscriptionEditor 提供批次編輯功能
 * 支援多選、批次操作、時間調整、正則替換等
 */

import { notify } from './notification.js';
import { dialog } from './dialog.js';

export class BatchEditor {
  constructor(editor) {
    this.editor = editor;
    this.selectedSegments = new Set(); // 選中的段落索引
    this.isSelectionMode = false; // 是否在選擇模式
    this.lastSelectedIndex = -1; // 最後選中的索引（用於 Shift 選擇）
    
    // 批次操作歷史（用於撤銷）
    this.batchHistory = [];
    this.maxBatchHistory = 20;
    
    // 綁定鍵盤事件
    this.bindKeyboardEvents();
  }

  /**
   * 啟用/禁用選擇模式
   */
  toggleSelectionMode() {
    this.isSelectionMode = !this.isSelectionMode;
    
    if (!this.isSelectionMode) {
      this.clearSelection();
    }
    
    // 更新 UI 狀態
    this.updateUI();
    
    return this.isSelectionMode;
  }

  /**
   * 選擇/取消選擇段落
   */
  toggleSegmentSelection(index, event) {
    if (!this.isSelectionMode) return;
    
    if (event.shiftKey && this.lastSelectedIndex !== -1) {
      // Shift + 點擊：範圍選擇
      this.selectRange(this.lastSelectedIndex, index);
    } else if (event.ctrlKey || event.metaKey) {
      // Ctrl/Cmd + 點擊：切換選擇
      if (this.selectedSegments.has(index)) {
        this.selectedSegments.delete(index);
      } else {
        this.selectedSegments.add(index);
      }
    } else {
      // 普通點擊：單選
      this.selectedSegments.clear();
      this.selectedSegments.add(index);
    }
    
    this.lastSelectedIndex = index;
    this.updateUI();
  }

  /**
   * 選擇範圍
   */
  selectRange(start, end) {
    const min = Math.min(start, end);
    const max = Math.max(start, end);
    
    for (let i = min; i <= max; i++) {
      this.selectedSegments.add(i);
    }
  }

  /**
   * 全選
   */
  selectAll() {
    if (!this.isSelectionMode) return;
    
    for (let i = 0; i < this.editor.segments.length; i++) {
      this.selectedSegments.add(i);
    }
    
    this.updateUI();
    notify.info(`已選擇全部 ${this.editor.segments.length} 個段落`);
  }

  /**
   * 清除選擇
   */
  clearSelection() {
    this.selectedSegments.clear();
    this.lastSelectedIndex = -1;
    this.updateUI();
  }

  /**
   * 反選
   */
  invertSelection() {
    if (!this.isSelectionMode) return;
    
    for (let i = 0; i < this.editor.segments.length; i++) {
      if (this.selectedSegments.has(i)) {
        this.selectedSegments.delete(i);
      } else {
        this.selectedSegments.add(i);
      }
    }
    
    this.updateUI();
  }

  /**
   * 根據條件選擇
   */
  selectByCondition(condition) {
    if (!this.isSelectionMode) return;
    
    this.selectedSegments.clear();
    
    this.editor.segments.forEach((segment, index) => {
      if (condition(segment, index)) {
        this.selectedSegments.add(index);
      }
    });
    
    this.updateUI();
    notify.info(`已選擇 ${this.selectedSegments.size} 個符合條件的段落`);
  }

  /**
   * 批次刪除
   */
  async batchDelete() {
    if (this.selectedSegments.size === 0) {
      notify.warning('請先選擇要刪除的段落');
      return;
    }
    
    const confirmed = await dialog.confirm({
      title: '批次刪除',
      message: `確定要刪除選中的 ${this.selectedSegments.size} 個段落嗎？`,
      type: 'warning'
    });
    
    if (!confirmed) return;
    
    // 保存操作歷史
    this.saveBatchHistory('delete', Array.from(this.selectedSegments));
    
    // 從後往前刪除，避免索引變化
    const indices = Array.from(this.selectedSegments).sort((a, b) => b - a);
    
    indices.forEach(index => {
      this.editor.segments.splice(index, 1);
    });
    
    this.clearSelection();
    this.editor.render();
    this.editor.triggerAutoSave();
    
    notify.success(`已刪除 ${indices.length} 個段落`);
  }

  /**
   * 批次合併
   */
  async batchMerge() {
    if (this.selectedSegments.size < 2) {
      notify.warning('請選擇至少 2 個段落進行合併');
      return;
    }
    
    const confirmed = await dialog.confirm({
      title: '批次合併',
      message: `確定要合併選中的 ${this.selectedSegments.size} 個段落嗎？`,
      type: 'info'
    });
    
    if (!confirmed) return;
    
    // 保存操作歷史
    this.saveBatchHistory('merge', Array.from(this.selectedSegments));
    
    // 按索引排序
    const indices = Array.from(this.selectedSegments).sort((a, b) => a - b);
    const segments = indices.map(i => this.editor.segments[i]);
    
    // 合併文字和時間
    const mergedText = segments.map(s => s.edited || s.text).join(' ');
    const mergedSegment = {
      id: segments[0].id,
      start: segments[0].start,
      end: segments[segments.length - 1].end,
      text: segments.map(s => s.text).join(' '),
      edited: mergedText,
      isEdited: true,
      textWithPunctuation: segments.map(s => s.textWithPunctuation || s.text).join(' '),
      textWithoutPunctuation: segments.map(s => s.textWithoutPunctuation || s.text).join(' ')
    };
    
    // 替換段落
    this.editor.segments.splice(indices[0], indices.length, mergedSegment);
    
    this.clearSelection();
    this.editor.render();
    this.editor.triggerAutoSave();
    
    notify.success(`已合併 ${indices.length} 個段落`);
  }

  /**
   * 批次分割
   */
  async batchSplit(splitPattern = '\n') {
    if (this.selectedSegments.size === 0) {
      notify.warning('請先選擇要分割的段落');
      return;
    }
    
    const pattern = await dialog.prompt({
      title: '批次分割',
      message: '請輸入分割標記（支援正則表達式）：',
      defaultValue: splitPattern,
      placeholder: '例如：\\n 或 。 或 [。！？]'
    });
    
    if (!pattern) return;
    
    // 保存操作歷史
    this.saveBatchHistory('split', Array.from(this.selectedSegments));
    
    const indices = Array.from(this.selectedSegments).sort((a, b) => b - a);
    let totalSplits = 0;
    
    indices.forEach(index => {
      const segment = this.editor.segments[index];
      const text = segment.edited || segment.text;
      
      // 使用正則表達式分割
      let parts;
      try {
        const regex = new RegExp(pattern, 'g');
        parts = text.split(regex).filter(p => p.trim());
      } catch (e) {
        // 如果正則無效，使用普通分割
        parts = text.split(pattern).filter(p => p.trim());
      }
      
      if (parts.length > 1) {
        const duration = segment.end - segment.start;
        const partDuration = duration / parts.length;
        
        const newSegments = parts.map((part, i) => ({
          id: `${segment.id}_${i}`,
          start: segment.start + (i * partDuration),
          end: segment.start + ((i + 1) * partDuration),
          text: part.trim(),
          edited: part.trim(),
          isEdited: true
        }));
        
        this.editor.segments.splice(index, 1, ...newSegments);
        totalSplits += newSegments.length - 1;
      }
    });
    
    this.clearSelection();
    this.editor.render();
    this.editor.triggerAutoSave();
    
    notify.success(`已分割為 ${totalSplits + indices.length} 個段落`);
  }

  /**
   * 批次尋找取代
   */
  async batchFindReplace() {
    if (this.selectedSegments.size === 0) {
      notify.warning('請先選擇要處理的段落');
      return;
    }
    
    const result = await dialog.custom({
      title: '批次尋找取代',
      content: `
        <div class="batch-find-replace">
          <div class="form-group">
            <label>尋找內容：</label>
            <input type="text" id="findText" placeholder="支援正則表達式">
          </div>
          <div class="form-group">
            <label>取代為：</label>
            <input type="text" id="replaceText" placeholder="取代文字">
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="useRegex" checked>
              使用正則表達式
            </label>
          </div>
          <div class="form-group">
            <label>
              <input type="checkbox" id="caseSensitive">
              區分大小寫
            </label>
          </div>
        </div>
      `,
      buttons: [
        { text: '取消', value: false },
        { text: '預覽', value: 'preview', className: 'btn-secondary' },
        { text: '取代', value: true, className: 'btn-primary' }
      ]
    });
    
    if (!result) return;
    
    const findText = document.getElementById('findText').value;
    const replaceText = document.getElementById('replaceText').value;
    const useRegex = document.getElementById('useRegex').checked;
    const caseSensitive = document.getElementById('caseSensitive').checked;
    
    if (!findText) {
      notify.warning('請輸入要尋找的內容');
      return;
    }
    
    // 建立查找模式
    let pattern;
    try {
      if (useRegex) {
        pattern = new RegExp(findText, caseSensitive ? 'g' : 'gi');
      } else {
        const escapedFind = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        pattern = new RegExp(escapedFind, caseSensitive ? 'g' : 'gi');
      }
    } catch (e) {
      notify.error('無效的正則表達式');
      return;
    }
    
    if (result === 'preview') {
      // 預覽模式
      this.previewReplace(pattern, replaceText);
      return;
    }
    
    // 保存操作歷史
    this.saveBatchHistory('replace', Array.from(this.selectedSegments));
    
    // 執行取代
    let replaceCount = 0;
    
    this.selectedSegments.forEach(index => {
      const segment = this.editor.segments[index];
      const originalText = segment.edited || segment.text;
      const newText = originalText.replace(pattern, replaceText);
      
      if (originalText !== newText) {
        segment.edited = newText;
        segment.isEdited = true;
        replaceCount++;
      }
    });
    
    this.editor.render();
    this.editor.triggerAutoSave();
    
    notify.success(`已在 ${replaceCount} 個段落中完成取代`);
  }

  /**
   * 預覽取代結果
   */
  async previewReplace(pattern, replaceText) {
    const previews = [];
    
    this.selectedSegments.forEach(index => {
      const segment = this.editor.segments[index];
      const originalText = segment.edited || segment.text;
      const newText = originalText.replace(pattern, replaceText);
      
      if (originalText !== newText) {
        previews.push({
          index,
          original: originalText,
          new: newText
        });
      }
    });
    
    if (previews.length === 0) {
      notify.info('沒有找到匹配的內容');
      return;
    }
    
    // 顯示預覽對話框
    const previewHtml = previews.slice(0, 5).map(p => `
      <div class="preview-item">
        <div class="preview-original">${this.highlightDiff(p.original, pattern)}</div>
        <div class="preview-arrow">→</div>
        <div class="preview-new">${p.new}</div>
      </div>
    `).join('');
    
    const moreText = previews.length > 5 ? `<p>...還有 ${previews.length - 5} 個變更</p>` : '';
    
    await dialog.alert({
      title: '取代預覽',
      message: `
        <div class="replace-preview">
          ${previewHtml}
          ${moreText}
          <p>共找到 ${previews.length} 處需要取代</p>
        </div>
      `
    });
  }

  /**
   * 高亮差異
   */
  highlightDiff(text, pattern) {
    return text.replace(pattern, match => `<mark>${match}</mark>`);
  }

  /**
   * 批次調整時間
   */
  async batchAdjustTime() {
    if (this.selectedSegments.size === 0) {
      notify.warning('請先選擇要調整的段落');
      return;
    }
    
    const result = await dialog.custom({
      title: '批次調整時間',
      content: `
        <div class="batch-time-adjust">
          <div class="form-group">
            <label>調整方式：</label>
            <select id="adjustMode">
              <option value="offset">偏移時間</option>
              <option value="scale">縮放時間</option>
              <option value="redistribute">重新分配</option>
            </select>
          </div>
          <div id="offsetOptions">
            <div class="form-group">
              <label>偏移秒數：</label>
              <input type="number" id="offsetSeconds" value="0" step="0.1">
              <small>正數向後移動，負數向前移動</small>
            </div>
          </div>
          <div id="scaleOptions" style="display: none;">
            <div class="form-group">
              <label>縮放比例：</label>
              <input type="number" id="scaleRatio" value="1.0" step="0.1" min="0.1" max="10">
              <small>1.0 = 不變，2.0 = 放慢一倍，0.5 = 加快一倍</small>
            </div>
          </div>
          <div id="redistributeOptions" style="display: none;">
            <div class="form-group">
              <label>開始時間（秒）：</label>
              <input type="number" id="redistStart" value="0" step="0.1">
            </div>
            <div class="form-group">
              <label>結束時間（秒）：</label>
              <input type="number" id="redistEnd" value="60" step="0.1">
            </div>
          </div>
        </div>
      `,
      buttons: [
        { text: '取消', value: false },
        { text: '確定', value: true, className: 'btn-primary' }
      ],
      onRender: () => {
        // 切換選項顯示
        const adjustMode = document.getElementById('adjustMode');
        const offsetOptions = document.getElementById('offsetOptions');
        const scaleOptions = document.getElementById('scaleOptions');
        const redistributeOptions = document.getElementById('redistributeOptions');
        
        adjustMode.addEventListener('change', () => {
          offsetOptions.style.display = adjustMode.value === 'offset' ? 'block' : 'none';
          scaleOptions.style.display = adjustMode.value === 'scale' ? 'block' : 'none';
          redistributeOptions.style.display = adjustMode.value === 'redistribute' ? 'block' : 'none';
        });
      }
    });
    
    if (!result) return;
    
    const adjustMode = document.getElementById('adjustMode').value;
    
    // 保存操作歷史
    this.saveBatchHistory('adjustTime', Array.from(this.selectedSegments));
    
    switch (adjustMode) {
      case 'offset':
        this.applyTimeOffset();
        break;
      case 'scale':
        this.applyTimeScale();
        break;
      case 'redistribute':
        this.redistributeTime();
        break;
    }
    
    this.editor.render();
    this.editor.triggerAutoSave();
  }

  /**
   * 應用時間偏移
   */
  applyTimeOffset() {
    const offset = parseFloat(document.getElementById('offsetSeconds').value);
    if (offset === 0) return;
    
    this.selectedSegments.forEach(index => {
      const segment = this.editor.segments[index];
      segment.start += offset;
      segment.end += offset;
      
      // 確保時間不為負數
      if (segment.start < 0) {
        segment.end -= segment.start;
        segment.start = 0;
      }
    });
    
    notify.success(`已調整 ${this.selectedSegments.size} 個段落的時間`);
  }

  /**
   * 應用時間縮放
   */
  applyTimeScale() {
    const scale = parseFloat(document.getElementById('scaleRatio').value);
    if (scale === 1) return;
    
    // 找出選中段落的時間範圍
    const indices = Array.from(this.selectedSegments).sort((a, b) => a - b);
    const firstSegment = this.editor.segments[indices[0]];
    const baseTime = firstSegment.start;
    
    indices.forEach(index => {
      const segment = this.editor.segments[index];
      const relativeStart = segment.start - baseTime;
      const relativeEnd = segment.end - baseTime;
      
      segment.start = baseTime + (relativeStart * scale);
      segment.end = baseTime + (relativeEnd * scale);
    });
    
    notify.success(`已縮放 ${this.selectedSegments.size} 個段落的時間`);
  }

  /**
   * 重新分配時間
   */
  redistributeTime() {
    const startTime = parseFloat(document.getElementById('redistStart').value);
    const endTime = parseFloat(document.getElementById('redistEnd').value);
    
    if (endTime <= startTime) {
      notify.error('結束時間必須大於開始時間');
      return;
    }
    
    const indices = Array.from(this.selectedSegments).sort((a, b) => a - b);
    const totalDuration = endTime - startTime;
    const segmentDuration = totalDuration / indices.length;
    
    indices.forEach((index, i) => {
      const segment = this.editor.segments[index];
      segment.start = startTime + (i * segmentDuration);
      segment.end = startTime + ((i + 1) * segmentDuration);
    });
    
    notify.success(`已重新分配 ${indices.length} 個段落的時間`);
  }

  /**
   * 批次添加前綴/後綴
   */
  async batchAddPrefixSuffix() {
    if (this.selectedSegments.size === 0) {
      notify.warning('請先選擇要處理的段落');
      return;
    }
    
    const result = await dialog.custom({
      title: '批次添加前綴/後綴',
      content: `
        <div class="batch-prefix-suffix">
          <div class="form-group">
            <label>前綴：</label>
            <input type="text" id="prefixText" placeholder="要添加在開頭的文字">
          </div>
          <div class="form-group">
            <label>後綴：</label>
            <input type="text" id="suffixText" placeholder="要添加在結尾的文字">
          </div>
        </div>
      `,
      buttons: [
        { text: '取消', value: false },
        { text: '確定', value: true, className: 'btn-primary' }
      ]
    });
    
    if (!result) return;
    
    const prefix = document.getElementById('prefixText').value;
    const suffix = document.getElementById('suffixText').value;
    
    if (!prefix && !suffix) {
      notify.warning('請至少輸入前綴或後綴');
      return;
    }
    
    // 保存操作歷史
    this.saveBatchHistory('prefixSuffix', Array.from(this.selectedSegments));
    
    this.selectedSegments.forEach(index => {
      const segment = this.editor.segments[index];
      const text = segment.edited || segment.text;
      segment.edited = prefix + text + suffix;
      segment.isEdited = true;
    });
    
    this.editor.render();
    this.editor.triggerAutoSave();
    
    notify.success(`已為 ${this.selectedSegments.size} 個段落添加前綴/後綴`);
  }

  /**
   * 批次大小寫轉換
   */
  async batchChangeCase() {
    if (this.selectedSegments.size === 0) {
      notify.warning('請先選擇要處理的段落');
      return;
    }
    
    const caseType = await dialog.select({
      title: '批次大小寫轉換',
      message: '請選擇轉換方式：',
      options: [
        { value: 'upper', text: '全部大寫' },
        { value: 'lower', text: '全部小寫' },
        { value: 'title', text: '首字母大寫' },
        { value: 'sentence', text: '句首大寫' }
      ]
    });
    
    if (!caseType) return;
    
    // 保存操作歷史
    this.saveBatchHistory('changeCase', Array.from(this.selectedSegments));
    
    this.selectedSegments.forEach(index => {
      const segment = this.editor.segments[index];
      const text = segment.edited || segment.text;
      
      switch (caseType) {
        case 'upper':
          segment.edited = text.toUpperCase();
          break;
        case 'lower':
          segment.edited = text.toLowerCase();
          break;
        case 'title':
          segment.edited = text.replace(/\b\w/g, l => l.toUpperCase());
          break;
        case 'sentence':
          segment.edited = text.replace(/(^\w|[.!?]\s+\w)/g, l => l.toUpperCase());
          break;
      }
      
      segment.isEdited = true;
    });
    
    this.editor.render();
    this.editor.triggerAutoSave();
    
    notify.success(`已轉換 ${this.selectedSegments.size} 個段落的大小寫`);
  }

  /**
   * 保存批次操作歷史
   */
  saveBatchHistory(operation, indices) {
    const history = {
      operation,
      indices,
      segments: indices.map(i => ({ ...this.editor.segments[i] })),
      timestamp: Date.now()
    };
    
    this.batchHistory.push(history);
    
    if (this.batchHistory.length > this.maxBatchHistory) {
      this.batchHistory.shift();
    }
  }

  /**
   * 撤銷批次操作
   */
  undoBatchOperation() {
    if (this.batchHistory.length === 0) {
      notify.warning('沒有可撤銷的批次操作');
      return;
    }
    
    const lastOperation = this.batchHistory.pop();
    
    // 根據操作類型撤銷
    switch (lastOperation.operation) {
      case 'delete':
        // 恢復刪除的段落
        lastOperation.segments.forEach((segment, i) => {
          this.editor.segments.splice(lastOperation.indices[i], 0, segment);
        });
        break;
        
      case 'merge':
      case 'split':
      case 'replace':
      case 'adjustTime':
      case 'prefixSuffix':
      case 'changeCase':
        // 恢復原始段落
        lastOperation.indices.forEach((index, i) => {
          if (this.editor.segments[index]) {
            this.editor.segments[index] = { ...lastOperation.segments[i] };
          }
        });
        break;
    }
    
    this.editor.render();
    this.editor.triggerAutoSave();
    
    notify.success('已撤銷批次操作');
  }

  /**
   * 更新 UI
   */
  updateUI() {
    // 更新選中狀態的視覺效果
    const container = this.editor.container;
    if (!container) return;
    
    // 移除所有選中樣式
    container.querySelectorAll('.segment').forEach(el => {
      el.classList.remove('batch-selected');
    });
    
    // 添加選中樣式
    this.selectedSegments.forEach(index => {
      const segmentEl = container.querySelector(`[data-index="${index}"]`);
      if (segmentEl) {
        segmentEl.classList.add('batch-selected');
      }
    });
    
    // 更新選擇模式指示器
    if (this.isSelectionMode) {
      container.classList.add('batch-selection-mode');
    } else {
      container.classList.remove('batch-selection-mode');
    }
    
    // 觸發事件
    this.editor.emit('batchSelectionChange', {
      selectedCount: this.selectedSegments.size,
      isSelectionMode: this.isSelectionMode
    });
  }

  /**
   * 綁定鍵盤事件
   */
  bindKeyboardEvents() {
    document.addEventListener('keydown', (e) => {
      if (!this.isSelectionMode) return;
      
      // Ctrl/Cmd + A: 全選
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        this.selectAll();
      }
      
      // Escape: 退出選擇模式
      if (e.key === 'Escape') {
        this.toggleSelectionMode();
      }
      
      // Delete: 批次刪除
      if (e.key === 'Delete' && this.selectedSegments.size > 0) {
        e.preventDefault();
        this.batchDelete();
      }
    });
  }

  /**
   * 導出選中的段落
   */
  exportSelected(format = 'txt') {
    if (this.selectedSegments.size === 0) {
      notify.warning('請先選擇要導出的段落');
      return;
    }
    
    const indices = Array.from(this.selectedSegments).sort((a, b) => a - b);
    const segments = indices.map(i => this.editor.segments[i]);
    
    let content;
    let fileName;
    let mimeType;
    
    switch (format) {
      case 'txt':
        content = segments.map(s => s.edited || s.text).join('\n\n');
        fileName = `selected_segments_${Date.now()}.txt`;
        mimeType = 'text/plain;charset=utf-8';
        break;
        
      case 'srt':
        content = segments.map((s, i) => {
          const start = this.formatSRTTime(s.start);
          const end = this.formatSRTTime(s.end);
          return `${i + 1}\n${start} --> ${end}\n${s.edited || s.text}\n`;
        }).join('\n');
        fileName = `selected_segments_${Date.now()}.srt`;
        mimeType = 'text/plain;charset=utf-8';
        break;
        
      case 'json':
        content = JSON.stringify(segments, null, 2);
        fileName = `selected_segments_${Date.now()}.json`;
        mimeType = 'application/json';
        break;
    }
    
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    
    notify.success(`已導出 ${segments.length} 個選中的段落`);
  }

  /**
   * 格式化 SRT 時間
   */
  formatSRTTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);

    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  }

  /**
   * 更新 UI 狀態
   */
  updateUI() {
    // 通知編輯器更新批次選擇 UI
    if (this.editor.updateBatchSelectionUI) {
      this.editor.updateBatchSelectionUI();
    }
    
    // 發出自定義事件，讓其他組件可以監聽
    const event = new CustomEvent('batchSelectionChanged', {
      detail: {
        isSelectionMode: this.isSelectionMode,
        selectedCount: this.selectedSegments.size,
        totalCount: this.editor.segments.length
      }
    });
    document.dispatchEvent(event);
  }
}

// 導出批次編輯器
export default BatchEditor;