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

        // 匯入/匯出
        document.getElementById('exportBookmarksBtn')?.addEventListener('click', () => {
            this.timeBookmarks.exportBookmarks();
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
        // 更新當前時間顯示
        this.videoPlayer.addEventListener('timeupdate', () => {
            const currentTime = this.videoPlayer.currentTime;
            const display = document.getElementById('currentTimeDisplay');
            if (display) {
                display.textContent = this.timeBookmarks.formatTime(currentTime);
            }
        });

        // 載入新視訊時設定名稱
        this.videoPlayer.addEventListener('loadedmetadata', () => {
            const videoName = this.videoPlayer.getAttribute('data-filename') || 
                           this.videoPlayer.src.split('/').pop();
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
                    ${bookmark.note ? `<div class="bookmark-note">${bookmark.note}</div>` : ''}
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
        // 簡單的訊息顯示，可以後續改進
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        // TODO: 實作更好的 UI 訊息提示
        // 例如：toast notification
    }
}