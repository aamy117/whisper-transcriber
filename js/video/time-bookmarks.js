// 時間標記功能模組
export class TimeBookmarks {
    constructor(videoPlayer) {
        // 支援傳入 VideoPlayer 實例或原生 video 元素
        // 如果傳入的是 VideoPlayer 實例，取其 .video 屬性
        this.videoPlayer = videoPlayer?.video || videoPlayer;
        this.bookmarks = [];
        this.storageKey = 'video-bookmarks';
    }

    // 初始化
    init() {
        this.loadFromStorage();
    }

    // 新增書籤
    addBookmark(note = '') {
        if (!this.videoPlayer) return null;
        
        const currentTime = this.videoPlayer.currentTime;
        const bookmark = {
            id: Date.now().toString(),
            time: currentTime,
            note: note.trim(),
            timestamp: new Date().toISOString(),
            videoName: this.getVideoName()
        };
        
        this.bookmarks.push(bookmark);
        this.sortBookmarks();
        this.saveToStorage();
        
        return bookmark;
    }

    // 更新書籤備註
    updateBookmark(id, note) {
        const bookmark = this.bookmarks.find(b => b.id === id);
        if (bookmark) {
            bookmark.note = note.trim();
            this.saveToStorage();
            return bookmark;
        }
        return null;
    }

    // 刪除書籤
    deleteBookmark(id) {
        const index = this.bookmarks.findIndex(b => b.id === id);
        if (index !== -1) {
            const deleted = this.bookmarks.splice(index, 1)[0];
            this.saveToStorage();
            return deleted;
        }
        return null;
    }

    // 跳到書籤時間
    jumpToBookmark(id) {
        const bookmark = this.bookmarks.find(b => b.id === id);
        if (bookmark && this.videoPlayer) {
            this.videoPlayer.currentTime = bookmark.time;
            this.videoPlayer.play();
            return bookmark;
        }
        return null;
    }

    // 取得當前影片的書籤
    getBookmarksForCurrentVideo() {
        const videoName = this.getVideoName();
        return this.bookmarks.filter(b => b.videoName === videoName);
    }

    // 取得所有書籤
    getAllBookmarks() {
        return [...this.bookmarks];
    }

    // 排序書籤（按時間降序，時間後面的排在上面）
    sortBookmarks() {
        this.bookmarks.sort((a, b) => b.time - a.time);
    }

    // 格式化時間
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m}:${s.toString().padStart(2, '0')}`;
    }

    // 取得影片名稱
    getVideoName() {
        // 從 video 元素的 src 或自定義屬性取得
        if (this.videoPlayer) {
            const src = this.videoPlayer.src || '';
            const filename = src.split('/').pop().split('?')[0];
            return filename || '未知影片';
        }
        return '未知影片';
    }

    // 設定影片名稱（用於本地檔案）
    setVideoName(name) {
        this.currentVideoName = name;
    }

    // 儲存到 localStorage
    saveToStorage() {
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(this.bookmarks));
        } catch (e) {
            console.error('儲存書籤失敗:', e);
        }
    }

    // 從 localStorage 載入
    loadFromStorage() {
        try {
            const saved = localStorage.getItem(this.storageKey);
            if (saved) {
                this.bookmarks = JSON.parse(saved);
                this.sortBookmarks();
            }
        } catch (e) {
            console.error('載入書籤失敗:', e);
            this.bookmarks = [];
        }
    }

    // 匯出書籤（支援多種格式）
    exportBookmarks(format = 'json') {
        switch (format) {
            case 'youtube':
                return this.exportAsYouTubeChapters();
            case 'json':
            default:
                return this.exportAsJSON();
        }
    }

    // 匯出為 JSON 格式
    exportAsJSON() {
        const data = {
            version: '1.0',
            exportDate: new Date().toISOString(),
            bookmarks: this.bookmarks
        };
        
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `video-bookmarks-${new Date().getTime()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
    }

    // 匯出為 YouTube 章節格式
    exportAsYouTubeChapters() {
        const videoBookmarks = this.getBookmarksForCurrentVideo();
        
        if (videoBookmarks.length === 0) {
            alert('沒有可匯出的時間標記');
            return;
        }

        // YouTube 章節格式要求必須從 00:00 開始
        let chapters = [];
        
        // 檢查是否有 00:00 的標記
        const hasStartChapter = videoBookmarks.some(b => b.time === 0);
        if (!hasStartChapter) {
            chapters.push('00:00 開始');
        }

        // 加入所有標記，按時間排序
        videoBookmarks.forEach(bookmark => {
            const timeStr = this.formatTimeForYouTube(bookmark.time);
            const title = bookmark.note || '未命名章節';
            chapters.push(`${timeStr} ${title}`);
        });

        // 建立文字內容
        const content = chapters.join('\n');
        
        // 建立下載
        const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `youtube-chapters-${this.getVideoName()}-${new Date().getTime()}.txt`;
        a.click();
        
        URL.revokeObjectURL(url);

        // 同時複製到剪貼簿（如果瀏覽器支援）
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(content).then(() => {
                alert('YouTube 章節已複製到剪貼簿！\n您可以直接貼到 YouTube 影片描述中。');
            }).catch(() => {
                // 如果複製失敗，不顯示錯誤，因為檔案已經下載
            });
        }
    }

    // 格式化時間為 YouTube 格式（不顯示小時如果是 0）
    formatTimeForYouTube(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        
        if (h > 0) {
            return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        }
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // 匯入書籤
    async importBookmarks(file) {
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (data.bookmarks && Array.isArray(data.bookmarks)) {
                // 合併匯入的書籤
                data.bookmarks.forEach(bookmark => {
                    // 避免重複 ID
                    bookmark.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
                    this.bookmarks.push(bookmark);
                });
                
                this.sortBookmarks();
                this.saveToStorage();
                
                return data.bookmarks.length;
            }
            
            throw new Error('無效的書籤檔案格式');
        } catch (e) {
            console.error('匯入書籤失敗:', e);
            throw e;
        }
    }

    // 清除所有書籤
    clearAll() {
        this.bookmarks = [];
        this.saveToStorage();
    }

    // 清除當前影片的書籤
    clearCurrentVideo() {
        const videoName = this.getVideoName();
        this.bookmarks = this.bookmarks.filter(b => b.videoName !== videoName);
        this.saveToStorage();
    }
}