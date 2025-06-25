/**
 * DOM 批次更新工具
 * 使用 DocumentFragment 和 requestAnimationFrame 優化 DOM 操作效能
 */

export class DOMBatchUpdater {
    constructor() {
        this.pendingUpdates = [];
        this.updateScheduled = false;
        this.updateCallbacks = [];
    }

    /**
     * 批次渲染元素
     * @param {HTMLElement} container - 容器元素
     * @param {Array} items - 要渲染的項目
     * @param {Function} createElementFn - 建立元素的函數
     * @param {Object} options - 選項
     */
    batchRender(container, items, createElementFn, options = {}) {
        const {
            clearContainer = true,
            insertPosition = 'append',
            beforeRender = null,
            afterRender = null
        } = options;

        // 執行渲染前回調
        if (beforeRender) {
            beforeRender();
        }

        // 建立 DocumentFragment
        const fragment = document.createDocumentFragment();

        // 批次建立元素
        items.forEach((item, index) => {
            const element = createElementFn(item, index);
            if (element) {
                fragment.appendChild(element);
            }
        });

        // 使用 requestAnimationFrame 確保在最佳時機更新
        requestAnimationFrame(() => {
            // 清空容器
            if (clearContainer) {
                container.innerHTML = '';
            }

            // 插入元素
            switch (insertPosition) {
                case 'prepend':
                    container.prepend(fragment);
                    break;
                case 'before':
                    container.parentNode.insertBefore(fragment, container);
                    break;
                case 'after':
                    container.parentNode.insertBefore(fragment, container.nextSibling);
                    break;
                default:
                    container.appendChild(fragment);
            }

            // 執行渲染後回調
            if (afterRender) {
                afterRender();
            }
        });
    }

    /**
     * 批次更新元素屬性
     * @param {Array<{element: HTMLElement, updates: Object}>} updates
     */
    batchUpdateAttributes(updates) {
        requestAnimationFrame(() => {
            updates.forEach(({ element, updates }) => {
                Object.entries(updates).forEach(([key, value]) => {
                    if (key === 'style') {
                        Object.assign(element.style, value);
                    } else if (key === 'classList') {
                        if (value.add) {
                            element.classList.add(...value.add);
                        }
                        if (value.remove) {
                            element.classList.remove(...value.remove);
                        }
                    } else if (key === 'textContent' || key === 'innerHTML') {
                        element[key] = value;
                    } else {
                        element.setAttribute(key, value);
                    }
                });
            });
        });
    }

    /**
     * 智慧批次更新
     * 收集多個更新請求，在一個 frame 中執行
     * @param {Function} updateFn - 更新函數
     */
    scheduleUpdate(updateFn) {
        this.pendingUpdates.push(updateFn);

        if (!this.updateScheduled) {
            this.updateScheduled = true;

            requestAnimationFrame(() => {
                // 建立共用的 fragment
                const fragment = document.createDocumentFragment();

                // 執行所有待處理的更新
                this.pendingUpdates.forEach(fn => {
                    fn(fragment);
                });

                // 清理
                this.pendingUpdates = [];
                this.updateScheduled = false;

                // 執行回調
                this.updateCallbacks.forEach(callback => callback());
                this.updateCallbacks = [];
            });
        }
    }

    /**
     * 批次移除元素
     * @param {Array<HTMLElement>} elements
     */
    batchRemove(elements) {
        requestAnimationFrame(() => {
            elements.forEach(element => {
                if (element && element.parentNode) {
                    element.parentNode.removeChild(element);
                }
            });
        });
    }

    /**
     * 批次替換元素
     * @param {Array<{oldElement: HTMLElement, newElement: HTMLElement}>} replacements
     */
    batchReplace(replacements) {
        requestAnimationFrame(() => {
            replacements.forEach(({ oldElement, newElement }) => {
                if (oldElement && oldElement.parentNode) {
                    oldElement.parentNode.replaceChild(newElement, oldElement);
                }
            });
        });
    }

    /**
     * 註冊更新完成回調
     * @param {Function} callback
     */
    onUpdateComplete(callback) {
        this.updateCallbacks.push(callback);
    }
}

/**
 * 編輯器專用的批次更新器
 */
export class EditorBatchUpdater extends DOMBatchUpdater {
    constructor() {
        super();
        this.segmentCache = new Map();
    }

    /**
     * 批次渲染段落
     * @param {HTMLElement} container
     * @param {Array} segments
     * @param {Object} options
     */
    renderSegments(container, segments, options = {}) {
        const {
            highlightTerm = null,
            selectedIndexes = [],
            onSegmentClick = null,
            onSegmentEdit = null
        } = options;

        this.batchRender(container, segments, (segment, index) => {
            // 檢查快取
            const cacheKey = this.getSegmentCacheKey(segment, index);
            if (this.segmentCache.has(cacheKey) && !highlightTerm) {
                return this.segmentCache.get(cacheKey).cloneNode(true);
            }

            // 建立新元素
            const element = this.createSegmentElement(segment, index, {
                highlightTerm,
                isSelected: selectedIndexes.includes(index),
                onSegmentClick,
                onSegmentEdit
            });

            // 快取元素
            if (!highlightTerm) {
                this.segmentCache.set(cacheKey, element.cloneNode(true));
            }

            return element;
        });
    }

    /**
     * 建立段落元素
     */
    createSegmentElement(segment, index, options) {
        const div = document.createElement('div');
        div.className = 'segment-item';
        div.dataset.index = index;

        if (options.isSelected) {
            div.classList.add('selected');
        }

        // 時間戳
        const timeSpan = document.createElement('span');
        timeSpan.className = 'segment-time';
        timeSpan.textContent = this.formatTime(segment.start);

        // 文字內容
        const textDiv = document.createElement('div');
        textDiv.className = 'segment-text';
        textDiv.contentEditable = true;

        // 處理高亮
        if (options.highlightTerm) {
            textDiv.innerHTML = this.highlightText(
                segment.edited || segment.text,
                options.highlightTerm
            );
        } else {
            textDiv.textContent = segment.edited || segment.text;
        }

        // 編輯標記
        if (segment.isEdited) {
            const badge = document.createElement('span');
            badge.className = 'edit-badge';
            badge.textContent = '已編輯';
            div.appendChild(badge);
        }

        // 事件處理
        if (options.onSegmentClick) {
            timeSpan.addEventListener('click', () => {
                options.onSegmentClick(segment, index);
            });
        }

        if (options.onSegmentEdit) {
            textDiv.addEventListener('input', () => {
                options.onSegmentEdit(textDiv.textContent, segment, index);
            });
        }

        div.appendChild(timeSpan);
        div.appendChild(textDiv);

        return div;
    }

    /**
     * 批次更新段落高亮
     */
    batchUpdateHighlight(container, indexes, searchTerm) {
        const updates = indexes.map(index => {
            const element = container.querySelector(`[data-index="${index}"]`);
            if (element) {
                const textDiv = element.querySelector('.segment-text');
                const segment = this.getSegmentByIndex(index);

                return {
                    element: textDiv,
                    updates: {
                        innerHTML: this.highlightText(
                            segment.edited || segment.text,
                            searchTerm
                        )
                    }
                };
            }
            return null;
        }).filter(Boolean);

        this.batchUpdateAttributes(updates);
    }

    /**
     * 高亮文字
     */
    highlightText(text, term) {
        if (!term) return this.escapeHtml(text);

        const escaped = this.escapeHtml(text);
        const regex = new RegExp(`(${this.escapeRegex(term)})`, 'gi');
        return escaped.replace(regex, '<mark>$1</mark>');
    }

    /**
     * 工具函數
     */
    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    escapeRegex(string) {
        return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    getSegmentCacheKey(segment, index) {
        return `${index}_${segment.text}_${segment.edited || ''}_${segment.isEdited}`;
    }

    clearCache() {
        this.segmentCache.clear();
    }

    // 假設的方法，實際使用時需要傳入或設定
    getSegmentByIndex(index) {
        // 這裡需要存取到實際的 segments 陣列
        return { text: '', edited: '' };
    }
}

// 匯出單例實例
export const domBatchUpdater = new DOMBatchUpdater();
export const editorBatchUpdater = new EditorBatchUpdater();
