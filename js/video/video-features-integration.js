// 視訊功能整合模組
import { SubtitleSearch } from './subtitle-search.js';
import { TimeBookmarks } from './time-bookmarks.js';

export class VideoFeaturesIntegration {
    constructor(videoPlayer) {
        this.videoPlayer = videoPlayer;
        this.subtitleSearch = new SubtitleSearch(videoPlayer);
        this.timeBookmarks = new TimeBookmarks(videoPlayer);
        
        this.init();
    }

    init() {
        // 初始化時間標記
        this.timeBookmarks.init();
        
        // 設定事件監聽器
        this.setupSubtitleEvents();
        this.setupTimeJumpEvents();
        this.setupBookmarkEvents();
        this.setupVideoEvents();
        
        // 初始化 UI
        this.updateBookmarkList();
    }

    // === 字幕搜尋事件 ===
    setupSubtitleEvents() {
        // 上傳字幕
        const uploadBtn = document.getElementById('uploadSubtitleBtn');
        const subtitleInput = document.getElementById('subtitleInput');
        
        uploadBtn?.addEventListener('click', () => subtitleInput?.click());
        
        subtitleInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    await this.subtitleSearch.loadSubtitleFile(file);
                    document.getElementById('subtitleFileName').textContent = file.name;
                    this.showMessage('字幕載入成功', 'success');
                } catch (error) {
                    this.showMessage('字幕載入失敗: ' + error.message, 'error');
                }
            }
        });

        // 搜尋功能
        const searchInput = document.getElementById('subtitleSearchInput');
        const searchBtn = document.getElementById('subtitleSearchBtn');
        
        const performSearch = () => {
            const query = searchInput?.value.trim();
            if (query) {
                const results = this.subtitleSearch.search(query);
                this.displaySearchResults(results, query);
            }
        };
        
        searchBtn?.addEventListener('click', performSearch);
        searchInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') performSearch();
        });

        // 搜尋導航
        document.getElementById('prevResultBtn')?.addEventListener('click', () => {
            const result = this.subtitleSearch.previousResult();
            if (result) this.highlightSearchResult(result);
        });
        
        document.getElementById('nextResultBtn')?.addEventListener('click', () => {
            const result = this.subtitleSearch.nextResult();
            if (result) this.highlightSearchResult(result);
        });
    }

    // === 時間跳轉事件 ===
    setupTimeJumpEvents() {
        const timeJumpInput = document.getElementById('timeJumpInput');
        const timeJumpBtn = document.getElementById('timeJumpBtn');
        
        const performTimeJump = () => {
            const input = timeJumpInput?.value.trim();
            if (!input) {
                this.showTimeJumpError('請輸入時間');
                return;
            }
            
            const result = this.subtitleSearch.handleTimeJumpInput(input);
            
            if (result.success) {
                this.showMessage(`已跳轉到 ${result.formattedTime}`, 'success');
                this.clearTimeJumpError();
                // 清空輸入框（可選）
                // timeJumpInput.value = '';
            } else {
                this.showTimeJumpError(result.error);
                this.showMessage(result.error, 'error');
            }
        };
        
        // 按鈕點擊事件
        timeJumpBtn?.addEventListener('click', performTimeJump);
        
        // 輸入框 Enter 鍵事件
        timeJumpInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performTimeJump();
            }
        });
        
        // 即時驗證（輸入時清除錯誤狀態）
        timeJumpInput?.addEventListener('input', () => {
            this.clearTimeJumpError();
        });
        
        // 失焦時進行格式預檢查
        timeJumpInput?.addEventListener('blur', (e) => {
            const input = e.target.value.trim();
            if (input) {
                const seconds = this.subtitleSearch.parseTimeInput(input);
                if (seconds === null) {
                    this.showTimeJumpError('時間格式無效');
                } else {
                    // 檢查是否超出影片長度
                    const validation = this.subtitleSearch.validateTimeForVideo(seconds);
                    if (!validation.valid) {
                        this.showTimeJumpError(validation.error);
                    }
                }
            }
        });
    }
    
    // 顯示時間跳轉錯誤
    showTimeJumpError(message) {
        const input = document.getElementById('timeJumpInput');
        if (input) {
            input.classList.add('error');
            input.title = message;
        }
    }
    
    // 清除時間跳轉錯誤
    clearTimeJumpError() {
        const input = document.getElementById('timeJumpInput');
        if (input) {
            input.classList.remove('error');
            input.title = '';
        }
    }

    // === 時間標記事件 ===
    setupBookmarkEvents() {
        // 新增標記
        const addBtn = document.getElementById('addBookmarkBtn');
        const noteInput = document.getElementById('bookmarkNote');
        
        const addBookmark = () => {
            const note = noteInput?.value.trim() || '';
            const bookmark = this.timeBookmarks.addBookmark(note);
            if (bookmark) {
                this.updateBookmarkList();
                noteInput.value = '';
                this.showMessage('已新增時間標記', 'success');
            }
        };
        
        addBtn?.addEventListener('click', addBookmark);
        noteInput?.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') addBookmark();
        });

        // 匯出下拉選單
        const exportBtn = document.getElementById('exportBookmarksBtn');
        const exportMenu = document.getElementById('exportMenu');
        const exportDropdown = exportBtn?.closest('.export-dropdown');
        
        exportBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            exportDropdown?.classList.toggle('active');
            exportMenu?.classList.toggle('hidden');
        });

        // 點擊外部關閉選單
        document.addEventListener('click', () => {
            exportDropdown?.classList.remove('active');
            exportMenu?.classList.add('hidden');
        });

        // 匯出選項
        document.querySelectorAll('.export-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = option.dataset.format;
                this.timeBookmarks.exportBookmarks(format);
                
                // 關閉選單
                exportDropdown?.classList.remove('active');
                exportMenu?.classList.add('hidden');
            });
        });
        
        const importInput = document.getElementById('importBookmarkInput');
        document.getElementById('importBookmarksBtn')?.addEventListener('click', () => {
            importInput?.click();
        });
        
        importInput?.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (file) {
                try {
                    const count = await this.timeBookmarks.importBookmarks(file);
                    this.updateBookmarkList();
                    this.showMessage(`已匯入 ${count} 個標記`, 'success');
                } catch (error) {
                    this.showMessage('匯入失敗: ' + error.message, 'error');
                }
            }
        });

        // 清除標記
        document.getElementById('clearBookmarksBtn')?.addEventListener('click', () => {
            if (confirm('確定要清除所有標記嗎？')) {
                this.timeBookmarks.clearCurrentVideo();
                this.updateBookmarkList();
                this.showMessage('已清除標記', 'info');
            }
        });
    }

    // === 視訊事件 ===
    setupVideoEvents() {
        // 確保 videoPlayer 和 video 元素存在
        if (!this.videoPlayer || !this.videoPlayer.video) {
            console.warn('VideoPlayer 或 video 元素不存在，跳過視訊事件設定');
            return;
        }

        const videoElement = this.videoPlayer.video;

        // 更新當前時間顯示
        videoElement.addEventListener('timeupdate', () => {
            const currentTime = videoElement.currentTime;
            const display = document.getElementById('currentTimeDisplay');
            if (display) {
                display.textContent = this.timeBookmarks.formatTime(currentTime);
            }
        });

        // 載入新視訊時設定名稱
        videoElement.addEventListener('loadedmetadata', () => {
            const videoName = videoElement.getAttribute('data-filename') || 
                           videoElement.src.split('/').pop();
            this.timeBookmarks.setVideoName(videoName);
            this.updateBookmarkList();
        });
    }

    // === UI 更新方法 ===
    displaySearchResults(results, query) {
        const container = document.getElementById('searchResults');
        const controls = document.getElementById('searchControls');
        const info = document.getElementById('searchInfo');
        
        if (!container) return;
        
        container.innerHTML = '';
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🔍</div>
                    <p>找不到「${query}」的相關結果</p>
                </div>
            `;
            controls?.classList.add('hidden');
            return;
        }
        
        // 顯示搜尋控制
        controls?.classList.remove('hidden');
        if (info) {
            info.textContent = `1 / ${results.length}`;
        }
        
        // 顯示結果
        results.forEach((result, index) => {
            const div = document.createElement('div');
            div.className = 'search-result-item';
            div.dataset.index = index;
            
            // 高亮搜尋關鍵字
            const highlightedText = result.text.replace(
                new RegExp(query, 'gi'),
                match => `<span class="result-highlight">${match}</span>`
            );
            
            div.innerHTML = `
                <div class="result-time">${this.subtitleSearch.formatTime(result.startTime)}</div>
                <div class="result-text">${highlightedText}</div>
            `;
            
            div.addEventListener('click', () => {
                this.subtitleSearch.currentResultIndex = index;
                this.subtitleSearch.jumpToTime(result.startTime);
                this.highlightSearchResult(result);
            });
            
            container.appendChild(div);
        });
        
        // 高亮第一個結果
        if (results.length > 0) {
            this.highlightSearchResult(results[0]);
        }
    }

    highlightSearchResult(result) {
        // 更新高亮
        document.querySelectorAll('.search-result-item').forEach((item, index) => {
            item.classList.toggle('active', index === this.subtitleSearch.currentResultIndex);
        });
        
        // 更新計數器
        const info = document.getElementById('searchInfo');
        if (info) {
            info.textContent = `${this.subtitleSearch.currentResultIndex + 1} / ${this.subtitleSearch.searchResults.length}`;
        }
    }

    updateBookmarkList() {
        const container = document.getElementById('bookmarkList');
        if (!container) return;
        
        const bookmarks = this.timeBookmarks.getBookmarksForCurrentVideo();
        
        if (bookmarks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">🔖</div>
                    <p>尚無時間標記</p>
                </div>
            `;
            return;
        }
        
        container.innerHTML = '';
        
        bookmarks.forEach(bookmark => {
            const div = document.createElement('div');
            div.className = 'bookmark-item';
            
            div.innerHTML = `
                <div class="bookmark-time" data-id="${bookmark.id}">
                    ${this.timeBookmarks.formatTime(bookmark.time)}
                </div>
                <div class="bookmark-content">
                    <div class="bookmark-note-wrapper">
                        ${bookmark.note ? 
                            `<div class="bookmark-note" data-id="${bookmark.id}">${bookmark.note}</div>` : 
                            `<div class="bookmark-note bookmark-note-empty" data-id="${bookmark.id}">點擊新增備註</div>`
                        }
                        <button class="bookmark-edit" data-id="${bookmark.id}" title="編輯">
                            <span class="icon">✏️</span>
                        </button>
                    </div>
                    <div class="bookmark-date">${new Date(bookmark.timestamp).toLocaleString()}</div>
                </div>
                <button class="bookmark-delete" data-id="${bookmark.id}" title="刪除">
                    <span class="icon">❌</span>
                </button>
            `;
            
            // 點擊時間跳轉
            div.querySelector('.bookmark-time').addEventListener('click', () => {
                this.timeBookmarks.jumpToBookmark(bookmark.id);
            });
            
            // 編輯功能
            const noteElement = div.querySelector('.bookmark-note');
            const editBtn = div.querySelector('.bookmark-edit');
            
            // 點擊編輯按鈕或空白備註
            const startEdit = () => {
                const currentText = bookmark.note || '';
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'bookmark-edit-input';
                input.value = currentText;
                input.placeholder = '輸入備註...';
                
                // 替換顯示元素為輸入框
                noteElement.style.display = 'none';
                editBtn.style.display = 'none';
                noteElement.parentNode.insertBefore(input, noteElement);
                input.focus();
                input.select();
                
                // 儲存編輯
                const saveEdit = () => {
                    const newNote = input.value.trim();
                    this.timeBookmarks.updateBookmark(bookmark.id, newNote);
                    this.updateBookmarkList();
                };
                
                // 取消編輯
                const cancelEdit = () => {
                    input.remove();
                    noteElement.style.display = '';
                    editBtn.style.display = '';
                };
                
                // 事件處理
                input.addEventListener('blur', saveEdit);
                input.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit();
                    }
                });
                input.addEventListener('keydown', (e) => {
                    if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEdit();
                    }
                });
            };
            
            editBtn.addEventListener('click', startEdit);
            if (noteElement.classList.contains('bookmark-note-empty')) {
                noteElement.addEventListener('click', startEdit);
            }
            
            // 刪除按鈕
            div.querySelector('.bookmark-delete').addEventListener('click', () => {
                if (confirm('確定要刪除這個標記嗎？')) {
                    this.timeBookmarks.deleteBookmark(bookmark.id);
                    this.updateBookmarkList();
                }
            });
            
            container.appendChild(div);
        });
    }

    // 顯示訊息
    showMessage(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // 實作簡單的 toast 通知
        const toast = document.createElement('div');
        toast.className = `video-toast video-toast-${type}`;
        toast.textContent = message;
        
        // 樣式設定
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            transform: translateX(100%);
            transition: transform 0.3s ease;
            ${type === 'success' ? 'background-color: #10b981;' : 
              type === 'error' ? 'background-color: #ef4444;' : 
              type === 'warning' ? 'background-color: #f59e0b;' : 
              'background-color: #3b82f6;'}
        `;
        
        document.body.appendChild(toast);
        
        // 動畫進入
        requestAnimationFrame(() => {
            toast.style.transform = 'translateX(0)';
        });
        
        // 3秒後自動移除
        setTimeout(() => {
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }, 3000);
    }
}