# 效能優化實作指南

## 1. 虛擬滾動（Virtual Scrolling）

### 問題背景
當轉譯結果有數百個段落時，渲染所有 DOM 元素會導致：
- 初始載入緩慢
- 滾動卡頓
- 記憶體佔用過高

### 實作原理
只渲染視窗內可見的元素，透過計算滾動位置動態更新顯示內容。

### 具體實作程式碼

```javascript
// virtual-scroll-editor.js
class VirtualScrollEditor {
  constructor(container, segments) {
    this.container = container;
    this.segments = segments;
    
    // 配置參數
    this.itemHeight = 80; // 每個段落的高度
    this.bufferSize = 5;  // 緩衝區大小（上下各顯示額外5個）
    this.visibleCount = 0; // 可見項目數量
    
    this.setupVirtualScroll();
  }

  setupVirtualScroll() {
    // 建立滾動容器結構
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'virtual-scroll-container';
    this.scrollContainer.style.position = 'relative';
    this.scrollContainer.style.overflow = 'auto';
    this.scrollContainer.style.height = '600px'; // 固定高度
    
    // 建立內容區域（撐開滾動高度）
    this.contentArea = document.createElement('div');
    this.contentArea.style.height = `${this.segments.length * this.itemHeight}px`;
    this.contentArea.style.position = 'relative';
    
    // 建立可見項目容器
    this.visibleArea = document.createElement('div');
    this.visibleArea.style.position = 'absolute';
    this.visibleArea.style.top = '0';
    this.visibleArea.style.left = '0';
    this.visibleArea.style.right = '0';
    
    this.contentArea.appendChild(this.visibleArea);
    this.scrollContainer.appendChild(this.contentArea);
    this.container.appendChild(this.scrollContainer);
    
    // 計算可見項目數量
    this.visibleCount = Math.ceil(600 / this.itemHeight);
    
    // 綁定滾動事件
    this.scrollContainer.addEventListener('scroll', () => this.handleScroll());
    
    // 初始渲染
    this.render();
  }

  handleScroll() {
    // 使用 requestAnimationFrame 優化滾動效能
    if (this.scrollFrame) {
      cancelAnimationFrame(this.scrollFrame);
    }
    
    this.scrollFrame = requestAnimationFrame(() => {
      this.render();
    });
  }

  render() {
    const scrollTop = this.scrollContainer.scrollTop;
    
    // 計算可見範圍
    const startIndex = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferSize);
    const endIndex = Math.min(
      this.segments.length,
      startIndex + this.visibleCount + (this.bufferSize * 2)
    );
    
    // 清空可見區域
    this.visibleArea.innerHTML = '';
    
    // 設定可見區域的偏移
    this.visibleArea.style.transform = `translateY(${startIndex * this.itemHeight}px)`;
    
    // 只渲染可見範圍內的項目
    for (let i = startIndex; i < endIndex; i++) {
      const segment = this.segments[i];
      const element = this.createSegmentElement(segment, i);
      this.visibleArea.appendChild(element);
    }
    
    // 觸發渲染完成事件
    this.container.dispatchEvent(new CustomEvent('renderComplete', {
      detail: { startIndex, endIndex }
    }));
  }

  createSegmentElement(segment, index) {
    const div = document.createElement('div');
    div.className = 'segment-item';
    div.style.height = `${this.itemHeight}px`;
    div.style.padding = '10px';
    div.style.borderBottom = '1px solid #eee';
    div.dataset.index = index;
    
    // 時間戳
    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = this.formatTime(segment.start);
    
    // 文字內容
    const textDiv = document.createElement('div');
    textDiv.className = 'text';
    textDiv.contentEditable = true;
    textDiv.textContent = segment.edited || segment.text;
    
    // 編輯事件
    textDiv.addEventListener('input', () => {
      segment.edited = textDiv.textContent;
      this.onSegmentEdit(segment, index);
    });
    
    div.appendChild(timeSpan);
    div.appendChild(textDiv);
    
    return div;
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  onSegmentEdit(segment, index) {
    // 處理編輯事件
    console.log('Segment edited:', index, segment);
  }

  // 跳到特定段落
  scrollToSegment(index) {
    const scrollTop = index * this.itemHeight;
    this.scrollContainer.scrollTop = scrollTop;
  }
}

// 使用範例
const editor = new VirtualScrollEditor(
  document.getElementById('editor-container'),
  transcriptionSegments
);
```

## 2. DocumentFragment 批次更新 DOM

### 問題背景
逐個插入 DOM 元素會觸發多次重排（reflow）和重繪（repaint），嚴重影響效能。

### 實作原理
使用 DocumentFragment 作為臨時容器，在記憶體中建立 DOM 結構，最後一次性插入。

### 具體實作程式碼

```javascript
// batch-dom-update.js
class BatchDOMUpdater {
  constructor() {
    this.pendingUpdates = [];
    this.updateScheduled = false;
  }

  // 原始低效方法（避免使用）
  inefficientRender(container, segments) {
    segments.forEach(segment => {
      const element = this.createSegmentElement(segment);
      container.appendChild(element); // 每次都觸發重排！
    });
  }

  // 優化後的批次更新方法
  batchRender(container, segments) {
    // 建立 DocumentFragment
    const fragment = document.createDocumentFragment();
    
    // 在記憶體中建立所有元素
    segments.forEach(segment => {
      const element = this.createSegmentElement(segment);
      fragment.appendChild(element); // 不會觸發重排
    });
    
    // 清空容器
    container.innerHTML = '';
    
    // 一次性插入所有元素（只觸發一次重排）
    container.appendChild(fragment);
  }

  // 批次更新特定元素
  batchUpdate(updates) {
    const fragment = document.createDocumentFragment();
    
    updates.forEach(update => {
      if (update.type === 'add') {
        const element = this.createSegmentElement(update.segment);
        fragment.appendChild(element);
      }
    });
    
    // 使用 requestAnimationFrame 確保在最佳時機更新
    requestAnimationFrame(() => {
      const container = document.getElementById('segments-container');
      container.appendChild(fragment);
    });
  }

  // 智慧批次更新（收集多個更新請求）
  scheduleUpdate(updateFn) {
    this.pendingUpdates.push(updateFn);
    
    if (!this.updateScheduled) {
      this.updateScheduled = true;
      
      requestAnimationFrame(() => {
        const fragment = document.createDocumentFragment();
        
        // 執行所有待處理的更新
        this.pendingUpdates.forEach(fn => fn(fragment));
        
        // 一次性更新 DOM
        document.getElementById('segments-container').appendChild(fragment);
        
        // 清空待處理隊列
        this.pendingUpdates = [];
        this.updateScheduled = false;
      });
    }
  }

  createSegmentElement(segment) {
    const div = document.createElement('div');
    div.className = 'segment';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = this.formatTime(segment.start);
    
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.textContent = segment.text;
    
    div.appendChild(timeSpan);
    div.appendChild(textSpan);
    
    return div;
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// 使用範例
const updater = new BatchDOMUpdater();

// 批次渲染所有段落
updater.batchRender(container, segments);

// 智慧批次更新
updater.scheduleUpdate((fragment) => {
  const element = document.createElement('div');
  element.textContent = 'New segment';
  fragment.appendChild(element);
});
```

## 3. Debounce 優化搜尋功能

### 問題背景
使用者每輸入一個字元就執行搜尋會造成：
- 大量不必要的計算
- UI 反應遲鈍
- 搜尋結果閃爍

### 實作原理
延遲執行搜尋，直到使用者停止輸入一段時間後才執行。

### 具體實作程式碼

```javascript
// debounce-search.js

// Debounce 函數實作
function debounce(func, delay) {
  let timeoutId;
  
  return function debounced(...args) {
    // 清除之前的計時器
    clearTimeout(timeoutId);
    
    // 設定新的計時器
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}

// Throttle 函數實作（另一種優化方式）
function throttle(func, limit) {
  let inThrottle;
  let lastResult;
  
  return function throttled(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

// 搜尋功能實作
class OptimizedSearch {
  constructor(editor) {
    this.editor = editor;
    this.searchInput = document.getElementById('search-input');
    this.searchResults = document.getElementById('search-results');
    this.segments = editor.segments;
    
    // 建立 debounced 搜尋函數
    this.debouncedSearch = debounce(this.performSearch.bind(this), 300);
    
    // 建立 throttled 高亮更新函數
    this.throttledHighlight = throttle(this.updateHighlight.bind(this), 100);
    
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 使用 debounced 函數處理輸入事件
    this.searchInput.addEventListener('input', (e) => {
      const searchTerm = e.target.value;
      
      // 立即顯示載入狀態
      this.showLoadingState();
      
      // 延遲執行搜尋
      this.debouncedSearch(searchTerm);
    });
    
    // 即時顯示輸入回饋（不延遲）
    this.searchInput.addEventListener('input', (e) => {
      const length = e.target.value.length;
      this.updateCharCount(length);
    });
  }

  showLoadingState() {
    this.searchResults.innerHTML = '<div class="loading">搜尋中...</div>';
  }

  updateCharCount(length) {
    document.getElementById('char-count').textContent = `${length} 個字元`;
  }

  performSearch(searchTerm) {
    if (!searchTerm || searchTerm.length < 2) {
      this.clearResults();
      return;
    }

    console.log('執行搜尋:', searchTerm);
    
    // 使用 Web Worker 進行搜尋（避免阻塞主線程）
    if (this.searchWorker) {
      this.searchWorker.terminate();
    }
    
    this.searchWorker = new Worker('search-worker.js');
    
    this.searchWorker.postMessage({
      segments: this.segments,
      searchTerm: searchTerm
    });
    
    this.searchWorker.onmessage = (e) => {
      this.displayResults(e.data.results);
      this.throttledHighlight(e.data.results);
    };
  }

  displayResults(results) {
    if (results.length === 0) {
      this.searchResults.innerHTML = '<div class="no-results">沒有找到結果</div>';
      return;
    }

    const fragment = document.createDocumentFragment();
    
    results.forEach((result, index) => {
      // 延遲渲染大量結果
      if (index < 20) {
        const element = this.createResultElement(result);
        fragment.appendChild(element);
      }
    });
    
    this.searchResults.innerHTML = '';
    this.searchResults.appendChild(fragment);
    
    if (results.length > 20) {
      const moreDiv = document.createElement('div');
      moreDiv.className = 'more-results';
      moreDiv.textContent = `還有 ${results.length - 20} 個結果...`;
      this.searchResults.appendChild(moreDiv);
    }
  }

  createResultElement(result) {
    const div = document.createElement('div');
    div.className = 'search-result';
    
    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = this.formatTime(result.segment.start);
    
    const textSpan = document.createElement('span');
    textSpan.className = 'text';
    textSpan.innerHTML = this.highlightText(result.segment.text, result.matches);
    
    div.appendChild(timeSpan);
    div.appendChild(textSpan);
    
    // 點擊跳轉
    div.addEventListener('click', () => {
      this.editor.scrollToSegment(result.index);
    });
    
    return div;
  }

  highlightText(text, matches) {
    // 安全的高亮處理
    let highlighted = text;
    matches.forEach(match => {
      const escapedText = this.escapeHtml(match);
      highlighted = highlighted.replace(
        new RegExp(escapedText, 'gi'),
        `<mark>${escapedText}</mark>`
      );
    });
    return highlighted;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  updateHighlight(results) {
    // Throttled 高亮更新
    console.log('更新高亮:', results.length, '個結果');
  }

  clearResults() {
    this.searchResults.innerHTML = '';
  }

  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// search-worker.js (Web Worker)
self.addEventListener('message', (e) => {
  const { segments, searchTerm } = e.data;
  const results = [];
  
  const regex = new RegExp(searchTerm, 'gi');
  
  segments.forEach((segment, index) => {
    const text = segment.edited || segment.text;
    const matches = text.match(regex);
    
    if (matches) {
      results.push({
        segment: segment,
        index: index,
        matches: matches
      });
    }
  });
  
  self.postMessage({ results });
});

// 使用範例
const search = new OptimizedSearch(editor);
```

## 效能優化總結

### 優化前後對比

| 優化項目 | 優化前 | 優化後 | 效能提升 |
|---------|--------|--------|---------|
| 虛擬滾動 | 渲染 1000 個段落 | 只渲染 20-30 個可見段落 | 減少 97% DOM 元素 |
| 批次 DOM 更新 | 1000 次重排 | 1 次重排 | 減少 99.9% 重排次數 |
| Debounce 搜尋 | 每個字元觸發搜尋 | 停止輸入 300ms 後搜尋 | 減少 80% 搜尋次數 |

### 實作建議

1. **虛擬滾動**：適用於超過 100 個項目的列表
2. **DocumentFragment**：任何需要插入多個 DOM 元素的場景
3. **Debounce**：所有即時搜尋、自動儲存等頻繁觸發的功能

### 進階優化

1. **Intersection Observer**：更精確的可見性檢測
2. **Web Worker**：將搜尋等計算密集任務移至背景執行
3. **離屏渲染**：使用 Canvas 或 WebGL 處理超大數據集

這些優化技術可以顯著提升應用程式的效能和使用者體驗。