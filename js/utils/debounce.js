// 調試模式開關（生產環境設為 false）
const DEBUG = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : location.hostname === 'localhost';

/**
 * Debounce 和 Throttle 工具函數
 * 用於優化高頻事件處理，減少不必要的計算
 */

/**
 * Debounce 函數 - 延遲執行
 * 在連續觸發停止後的指定時間才執行
 * @param {Function} func - 要執行的函數
 * @param {number} delay - 延遲時間（毫秒）
 * @param {Object} options - 選項
 * @returns {Function} - 包裝後的函數
 */
export function debounce(func, delay, options = {}) {
    const { leading = false, trailing = true, maxWait = null } = options;

    let timeoutId = null;
    let lastCallTime = null;
    let lastInvokeTime = null;
    let lastArgs = null;
    let lastThis = null;
    let result = null;

    // 檢查是否應該調用函數
    function shouldInvoke(time) {
        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;

        return lastCallTime === null ||
            timeSinceLastCall >= delay ||
            timeSinceLastCall < 0 ||
            (maxWait && timeSinceLastInvoke >= maxWait);
    }

    // 執行函數
    function invokeFunc(time) {
        const args = lastArgs;
        const thisArg = lastThis;

        lastArgs = lastThis = null;
        lastInvokeTime = time;
        result = func.apply(thisArg, args);
        return result;
    }

    // 啟動計時器
    function startTimer(pendingFunc, wait) {
        return setTimeout(pendingFunc, wait);
    }

    // 取消計時器
    function cancelTimer(id) {
        clearTimeout(id);
    }

    // 前緣執行
    function leadingEdge(time) {
        lastInvokeTime = time;
        timeoutId = startTimer(timerExpired, delay);
        return leading ? invokeFunc(time) : result;
    }

    // 計時器到期
    function timerExpired() {
        const time = Date.now();

        if (shouldInvoke(time)) {
            return trailingEdge(time);
        }

        // 重新計算剩餘時間
        const timeSinceLastCall = time - lastCallTime;
        const timeSinceLastInvoke = time - lastInvokeTime;
        const timeWaiting = delay - timeSinceLastCall;
        const maxTimeWaiting = maxWait ? Math.min(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting;

        timeoutId = startTimer(timerExpired, maxTimeWaiting);
    }

    // 後緣執行
    function trailingEdge(time) {
        timeoutId = null;

        if (trailing && lastArgs) {
            return invokeFunc(time);
        }

        lastArgs = lastThis = null;
        return result;
    }

    // 取消 debounce
    function cancel() {
        if (timeoutId !== null) {
            cancelTimer(timeoutId);
        }

        lastInvokeTime = 0;
        lastArgs = lastCallTime = lastThis = timeoutId = null;
    }

    // 立即執行
    function flush() {
        return timeoutId === null ? result : trailingEdge(Date.now());
    }

    // 是否正在等待
    function pending() {
        return timeoutId !== null;
    }

    // debounced 函數
    function debounced(...args) {
        const time = Date.now();
        const isInvoking = shouldInvoke(time);

        lastArgs = args;
        lastThis = this;
        lastCallTime = time;

        if (isInvoking) {
            if (timeoutId === null) {
                return leadingEdge(lastCallTime);
            }

            if (maxWait) {
                timeoutId = startTimer(timerExpired, delay);
                return invokeFunc(lastCallTime);
            }
        }

        if (timeoutId === null) {
            timeoutId = startTimer(timerExpired, delay);
        }

        return result;
    }

    // 附加方法
    debounced.cancel = cancel;
    debounced.flush = flush;
    debounced.pending = pending;

    return debounced;
}

/**
 * Throttle 函數 - 節流執行
 * 在指定時間內最多執行一次
 * @param {Function} func - 要執行的函數
 * @param {number} wait - 間隔時間（毫秒）
 * @param {Object} options - 選項
 * @returns {Function} - 包裝後的函數
 */
export function throttle(func, wait, options = {}) {
    const { leading = true, trailing = true } = options;

    return debounce(func, wait, {
        leading,
        trailing,
        maxWait: wait
    });
}

/**
 * 建立可取消的 Promise
 */
export function createCancelablePromise(promise) {
    let isCanceled = false;

    const wrappedPromise = new Promise((resolve, reject) => {
        promise
            .then(value => isCanceled ? reject({ isCanceled: true }) : resolve(value))
            .catch(error => isCanceled ? reject({ isCanceled: true }) : reject(error));
    });

    return {
        promise: wrappedPromise,
        cancel() {
            isCanceled = true;
        }
    };
}

/**
 * 搜尋優化器類別
 */
export class SearchOptimizer {
    constructor(options = {}) {
        const {
            delay = 300,
            maxWait = 1000,
            onSearch = null,
            onSearchStart = null,
            onSearchEnd = null,
            minSearchLength = 2
        } = options;

        this.delay = delay;
        this.maxWait = maxWait;
        this.onSearch = onSearch;
        this.onSearchStart = onSearchStart;
        this.onSearchEnd = onSearchEnd;
        this.minSearchLength = minSearchLength;

        this.currentSearch = null;
        this.searchHistory = [];
        this.searchCache = new Map();

        // 建立 debounced 搜尋函數
        this.debouncedSearch = debounce(
            this.performSearch.bind(this),
            this.delay,
            { maxWait: this.maxWait }
        );
    }

    /**
     * 處理搜尋輸入
     */
    handleSearchInput(searchTerm) {
        // 清理搜尋詞
        const trimmedTerm = searchTerm.trim();

        // 檢查最小長度
        if (trimmedTerm.length < this.minSearchLength) {
            this.clearSearch();
            return;
        }

        // 檢查快取
        if (this.searchCache.has(trimmedTerm)) {
            const cachedResult = this.searchCache.get(trimmedTerm);
            this.handleSearchResult(cachedResult, true);
            return;
        }

        // 顯示載入狀態
        if (this.onSearchStart) {
            this.onSearchStart(trimmedTerm);
        }

        // 執行 debounced 搜尋
        this.debouncedSearch(trimmedTerm);
    }

    /**
     * 執行搜尋
     */
    async performSearch(searchTerm) {
        // 取消之前的搜尋
        if (this.currentSearch) {
            this.currentSearch.cancel();
        }

        try {
            // 建立可取消的搜尋
            this.currentSearch = createCancelablePromise(
                this.onSearch(searchTerm)
            );

            const result = await this.currentSearch.promise;

            // 快取結果
            this.cacheSearchResult(searchTerm, result);

            // 處理結果
            this.handleSearchResult(result, false);

            // 記錄搜尋歷史
            this.addToHistory(searchTerm);

        } catch (error) {
            if (!error.isCanceled) {
                if (typeof DEBUG !== 'undefined' && DEBUG) console.error('搜尋錯誤:', error);
                if (this.onSearchEnd) {
                    this.onSearchEnd(null, error);
                }
            }
        } finally {
            this.currentSearch = null;
        }
    }

    /**
     * 處理搜尋結果
     */
    handleSearchResult(result, fromCache) {
        if (this.onSearchEnd) {
            this.onSearchEnd(result, null, fromCache);
        }
    }

    /**
     * 清除搜尋
     */
    clearSearch() {
        this.debouncedSearch.cancel();

        if (this.currentSearch) {
            this.currentSearch.cancel();
            this.currentSearch = null;
        }

        if (this.onSearchEnd) {
            this.onSearchEnd([], null);
        }
    }

    /**
     * 快取搜尋結果
     */
    cacheSearchResult(term, result) {
        // 限制快取大小
        if (this.searchCache.size > 100) {
            const firstKey = this.searchCache.keys().next().value;
            this.searchCache.delete(firstKey);
        }

        this.searchCache.set(term, result);
    }

    /**
     * 加入搜尋歷史
     */
    addToHistory(term) {
        // 移除重複項
        this.searchHistory = this.searchHistory.filter(t => t !== term);

        // 加到開頭
        this.searchHistory.unshift(term);

        // 限制歷史大小
        if (this.searchHistory.length > 50) {
            this.searchHistory.pop();
        }
    }

    /**
     * 取得搜尋建議
     */
    getSuggestions(prefix) {
        return this.searchHistory
            .filter(term => term.startsWith(prefix))
            .slice(0, 10);
    }

    /**
     * 清除快取
     */
    clearCache() {
        this.searchCache.clear();
    }

    /**
     * 銷毀
     */
    destroy() {
        this.clearSearch();
        this.clearCache();
        this.searchHistory = [];
    }
}

/**
 * 輸入優化器 - 用於表單輸入
 */
export class InputOptimizer {
    constructor(inputElement, options = {}) {
        this.input = inputElement;
        this.options = {
            delay: 300,
            onInput: null,
            validator: null,
            formatter: null,
            ...options
        };

        this.lastValue = '';
        this.debouncedHandler = debounce(
            this.handleInput.bind(this),
            this.options.delay
        );

        this.init();
    }

    init() {
        // 監聽輸入事件
        this.input.addEventListener('input', this.onInput.bind(this));

        // 監聽貼上事件
        this.input.addEventListener('paste', this.onPaste.bind(this));
    }

    onInput(event) {
        const value = this.input.value;

        // 格式化
        if (this.options.formatter) {
            const formatted = this.options.formatter(value);
            if (formatted !== value) {
                this.input.value = formatted;
            }
        }

        // 驗證
        if (this.options.validator) {
            const isValid = this.options.validator(value);
            this.input.classList.toggle('invalid', !isValid);
        }

        // Debounced 處理
        this.debouncedHandler(value);
    }

    onPaste(event) {
        // 立即處理貼上
        setTimeout(() => {
            this.debouncedHandler.flush();
        }, 0);
    }

    handleInput(value) {
        if (value !== this.lastValue) {
            this.lastValue = value;

            if (this.options.onInput) {
                this.options.onInput(value);
            }
        }
    }

    setValue(value) {
        this.input.value = value;
        this.lastValue = value;
    }

    destroy() {
        this.debouncedHandler.cancel();
        this.input.removeEventListener('input', this.onInput);
        this.input.removeEventListener('paste', this.onPaste);
    }
}
