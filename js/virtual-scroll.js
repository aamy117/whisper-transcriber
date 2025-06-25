/**
 * 虛擬滾動實作
 * 只渲染視窗內可見的元素，大幅提升大量資料的渲染效能
 */

export class VirtualScroll {
    constructor(options) {
        this.container = options.container;
        this.itemHeight = options.itemHeight || 80;
        this.bufferSize = options.bufferSize || 5;
        this.renderItem = options.renderItem;
        this.items = [];

        // 狀態管理
        this.visibleRange = { start: 0, end: 0 };
        this.scrollTop = 0;
        this.containerHeight = 600;

        // DOM 元素
        this.scrollContainer = null;
        this.contentWrapper = null;
        this.visibleContent = null;

        // 效能優化
        this.scrollFrame = null;
        this.resizeObserver = null;

        this.init();
    }

    init() {
        this.setupDOM();
        this.setupEventListeners();
        this.setupResizeObserver();
    }

    setupDOM() {
        // 清空容器
        this.container.innerHTML = '';

        // 建立滾動容器
        this.scrollContainer = document.createElement('div');
        this.scrollContainer.className = 'virtual-scroll-container';
        this.scrollContainer.style.cssText = `
            position: relative;
            overflow-y: auto;
            height: 100%;
            max-height: ${this.containerHeight}px;
        `;

        // 建立內容包裝器（撐開高度）
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.className = 'virtual-scroll-wrapper';
        this.contentWrapper.style.cssText = `
            position: relative;
            width: 100%;
        `;

        // 建立可見內容容器
        this.visibleContent = document.createElement('div');
        this.visibleContent.className = 'virtual-scroll-visible';
        this.visibleContent.style.cssText = `
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
        `;

        // 組裝 DOM
        this.contentWrapper.appendChild(this.visibleContent);
        this.scrollContainer.appendChild(this.contentWrapper);
        this.container.appendChild(this.scrollContainer);
    }

    setupEventListeners() {
        // 滾動事件處理
        this.scrollContainer.addEventListener('scroll', this.handleScroll.bind(this));

        // 滑鼠滾輪事件（平滑滾動）
        this.scrollContainer.addEventListener('wheel', (e) => {
            if (e.ctrlKey) {
                e.preventDefault(); // 防止縮放
            }
        }, { passive: false });
    }

    setupResizeObserver() {
        // 監聽容器大小變化
        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const height = entry.contentRect.height;
                if (height !== this.containerHeight) {
                    this.containerHeight = height;
                    this.render();
                }
            }
        });

        this.resizeObserver.observe(this.scrollContainer);
    }

    handleScroll() {
        // 使用 requestAnimationFrame 優化滾動效能
        if (this.scrollFrame) {
            cancelAnimationFrame(this.scrollFrame);
        }

        this.scrollFrame = requestAnimationFrame(() => {
            this.scrollTop = this.scrollContainer.scrollTop;
            this.render();
        });
    }

    setItems(items) {
        this.items = items;
        this.updateContentHeight();
        this.render();
    }

    updateContentHeight() {
        // 更新內容總高度
        const totalHeight = this.items.length * this.itemHeight;
        this.contentWrapper.style.height = `${totalHeight}px`;
    }

    calculateVisibleRange() {
        const visibleCount = Math.ceil(this.containerHeight / this.itemHeight);

        // 計算可見範圍（包含緩衝區）
        const startIndex = Math.max(0,
            Math.floor(this.scrollTop / this.itemHeight) - this.bufferSize
        );

        const endIndex = Math.min(this.items.length,
            startIndex + visibleCount + (this.bufferSize * 2)
        );

        return { start: startIndex, end: endIndex };
    }

    render() {
        const newRange = this.calculateVisibleRange();

        // 只在範圍變化時重新渲染
        if (newRange.start === this.visibleRange.start &&
            newRange.end === this.visibleRange.end) {
            return;
        }

        this.visibleRange = newRange;

        // 清空可見內容
        this.visibleContent.innerHTML = '';

        // 設定可見內容的偏移
        const offsetY = this.visibleRange.start * this.itemHeight;
        this.visibleContent.style.transform = `translateY(${offsetY}px)`;

        // 使用 DocumentFragment 批次渲染
        const fragment = document.createDocumentFragment();

        for (let i = this.visibleRange.start; i < this.visibleRange.end; i++) {
            const item = this.items[i];
            if (item) {
                const element = this.renderItem(item, i);
                element.style.height = `${this.itemHeight}px`;
                element.dataset.index = i;
                fragment.appendChild(element);
            }
        }

        this.visibleContent.appendChild(fragment);

        // 觸發渲染完成事件
        this.container.dispatchEvent(new CustomEvent('renderComplete', {
            detail: {
                visibleRange: this.visibleRange,
                totalItems: this.items.length
            }
        }));
    }

    scrollToIndex(index) {
        if (index < 0 || index >= this.items.length) {
            return;
        }

        const scrollTop = index * this.itemHeight;
        this.scrollContainer.scrollTop = scrollTop;
    }

    refresh() {
        this.render();
    }

    destroy() {
        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
        }

        if (this.scrollFrame) {
            cancelAnimationFrame(this.scrollFrame);
        }

        this.container.innerHTML = '';
    }

    // 取得當前可見的項目索引
    getVisibleIndexes() {
        return {
            first: this.visibleRange.start,
            last: this.visibleRange.end - 1
        };
    }

    // 更新單一項目
    updateItem(index, newItem) {
        if (index >= 0 && index < this.items.length) {
            this.items[index] = newItem;

            // 如果項目在可見範圍內，更新它
            if (index >= this.visibleRange.start && index < this.visibleRange.end) {
                const elements = this.visibleContent.children;
                const elementIndex = index - this.visibleRange.start;

                if (elements[elementIndex]) {
                    const newElement = this.renderItem(newItem, index);
                    newElement.style.height = `${this.itemHeight}px`;
                    newElement.dataset.index = index;
                    elements[elementIndex].replaceWith(newElement);
                }
            }
        }
    }
}

// 虛擬滾動編輯器擴展
export class VirtualScrollEditor {
    constructor(container, segments) {
        this.container = container;
        this.segments = segments || [];
        this.virtualScroll = null;

        this.init();
    }

    init() {
        this.virtualScroll = new VirtualScroll({
            container: this.container,
            itemHeight: 80,
            bufferSize: 5,
            renderItem: this.renderSegment.bind(this)
        });

        this.virtualScroll.setItems(this.segments);
    }

    renderSegment(segment, index) {
        const div = document.createElement('div');
        div.className = 'segment-item virtual-item';
        div.style.cssText = `
            padding: 10px 15px;
            border-bottom: 1px solid var(--border-color, #e0e0e0);
            display: flex;
            align-items: flex-start;
            gap: 15px;
            cursor: pointer;
            transition: background-color 0.2s;
        `;

        // 時間戳
        const timeDiv = document.createElement('div');
        timeDiv.className = 'segment-time';
        timeDiv.style.cssText = `
            flex-shrink: 0;
            font-size: 0.9em;
            color: var(--primary-color, #1976d2);
            font-weight: 500;
            min-width: 60px;
        `;
        timeDiv.textContent = this.formatTime(segment.start);

        // 文字內容
        const textDiv = document.createElement('div');
        textDiv.className = 'segment-text';
        textDiv.style.cssText = `
            flex-grow: 1;
            line-height: 1.5;
            outline: none;
        `;
        textDiv.contentEditable = true;
        textDiv.textContent = segment.edited || segment.text;

        // 編輯狀態標記
        if (segment.isEdited) {
            const editBadge = document.createElement('span');
            editBadge.className = 'edit-badge';
            editBadge.style.cssText = `
                font-size: 0.8em;
                color: var(--success-color, #4caf50);
                margin-left: 10px;
            `;
            editBadge.textContent = '已編輯';
            timeDiv.appendChild(editBadge);
        }

        // 事件處理
        textDiv.addEventListener('input', () => {
            segment.edited = textDiv.textContent;
            segment.isEdited = true;
            this.onSegmentEdit(segment, index);
        });

        textDiv.addEventListener('focus', () => {
            div.style.backgroundColor = 'var(--hover-bg, #f5f5f5)';
        });

        textDiv.addEventListener('blur', () => {
            div.style.backgroundColor = '';
        });

        // 時間點擊跳轉
        timeDiv.addEventListener('click', () => {
            this.onTimeClick(segment.start);
        });

        div.appendChild(timeDiv);
        div.appendChild(textDiv);

        return div;
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    onSegmentEdit(segment, index) {
        // 觸發編輯事件
        this.container.dispatchEvent(new CustomEvent('segmentEdit', {
            detail: { segment, index }
        }));
    }

    onTimeClick(time) {
        // 觸發時間點擊事件
        this.container.dispatchEvent(new CustomEvent('timeClick', {
            detail: { time }
        }));
    }

    setSegments(segments) {
        this.segments = segments;
        this.virtualScroll.setItems(segments);
    }

    updateSegment(index, segment) {
        this.segments[index] = segment;
        this.virtualScroll.updateItem(index, segment);
    }

    scrollToSegment(index) {
        this.virtualScroll.scrollToIndex(index);
    }

    refresh() {
        this.virtualScroll.refresh();
    }

    destroy() {
        this.virtualScroll.destroy();
    }
}
