// 字幕搜尋功能模組
export class SubtitleSearch {
    constructor(videoPlayer) {
        this.videoPlayer = videoPlayer;
        this.subtitles = [];
        this.searchResults = [];
        this.currentResultIndex = 0;
    }

    // 載入字幕檔案（支援 SRT、VTT 格式）
    async loadSubtitleFile(file) {
        const text = await file.text();
        const extension = file.name.split('.').pop().toLowerCase();
        
        if (extension === 'srt') {
            this.subtitles = this.parseSRT(text);
        } else if (extension === 'vtt') {
            this.subtitles = this.parseVTT(text);
        } else {
            throw new Error('不支援的字幕格式');
        }
        
        return this.subtitles;
    }

    // 解析 SRT 格式
    parseSRT(text) {
        const subtitles = [];
        const blocks = text.trim().split(/\n\s*\n/);
        
        blocks.forEach(block => {
            const lines = block.split('\n');
            if (lines.length >= 3) {
                const index = parseInt(lines[0]);
                const timeMatch = lines[1].match(/(\d{2}:\d{2}:\d{2},\d{3}) --> (\d{2}:\d{2}:\d{2},\d{3})/);
                
                if (timeMatch) {
                    const startTime = this.timeToSeconds(timeMatch[1].replace(',', '.'));
                    const endTime = this.timeToSeconds(timeMatch[2].replace(',', '.'));
                    const text = lines.slice(2).join(' ');
                    
                    subtitles.push({
                        index,
                        startTime,
                        endTime,
                        text: text.trim()
                    });
                }
            }
        });
        
        return subtitles;
    }

    // 解析 VTT 格式
    parseVTT(text) {
        const subtitles = [];
        const blocks = text.trim().split(/\n\s*\n/);
        let index = 0;
        
        blocks.forEach(block => {
            const lines = block.split('\n');
            const timeMatch = lines[0].match(/(\d{2}:\d{2}:\d{2}.\d{3}) --> (\d{2}:\d{2}:\d{2}.\d{3})/);
            
            if (timeMatch) {
                const startTime = this.timeToSeconds(timeMatch[1]);
                const endTime = this.timeToSeconds(timeMatch[2]);
                const text = lines.slice(1).join(' ');
                
                subtitles.push({
                    index: index++,
                    startTime,
                    endTime,
                    text: text.trim()
                });
            }
        });
        
        return subtitles;
    }

    // 時間轉換為秒數
    timeToSeconds(timeStr) {
        const parts = timeStr.split(':');
        const seconds = parseFloat(parts[2]);
        const minutes = parseInt(parts[1]) * 60;
        const hours = parseInt(parts[0]) * 3600;
        return hours + minutes + seconds;
    }

    // 搜尋字幕
    search(query) {
        if (!query || !this.subtitles.length) {
            this.searchResults = [];
            return [];
        }

        const lowerQuery = query.toLowerCase();
        this.searchResults = this.subtitles.filter(subtitle => 
            subtitle.text.toLowerCase().includes(lowerQuery)
        );
        
        this.currentResultIndex = 0;
        return this.searchResults;
    }

    // 跳到指定時間
    jumpToTime(time) {
        if (this.videoPlayer && this.videoPlayer.video) {
            this.videoPlayer.video.currentTime = time;
            // 只有在影片載入完成且未播放時才自動播放
            if (this.videoPlayer.video.paused && this.videoPlayer.video.readyState >= 2) {
                this.videoPlayer.video.play().catch(error => {
                    console.warn('自動播放失敗:', error);
                });
            }
        }
    }

    // 跳到下一個搜尋結果
    nextResult() {
        if (this.searchResults.length > 0) {
            this.currentResultIndex = (this.currentResultIndex + 1) % this.searchResults.length;
            const result = this.searchResults[this.currentResultIndex];
            this.jumpToTime(result.startTime);
            return result;
        }
        return null;
    }

    // 跳到上一個搜尋結果
    previousResult() {
        if (this.searchResults.length > 0) {
            this.currentResultIndex = (this.currentResultIndex - 1 + this.searchResults.length) % this.searchResults.length;
            const result = this.searchResults[this.currentResultIndex];
            this.jumpToTime(result.startTime);
            return result;
        }
        return null;
    }

    // 解析時間輸入（支援 MM:SS 和 HH:MM:SS 格式）
    parseTimeInput(input) {
        if (!input || typeof input !== 'string') {
            return null;
        }

        // 移除多餘空白
        const timeStr = input.trim();
        
        // 支援兩種格式：MM:SS 和 HH:MM:SS
        const timeRegex = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/;
        const match = timeStr.match(timeRegex);
        
        if (!match) {
            return null;
        }
        
        const part1 = parseInt(match[1], 10);
        const part2 = parseInt(match[2], 10);
        const part3 = match[3] ? parseInt(match[3], 10) : null;
        
        let hours, minutes, seconds;
        
        if (part3 !== null) {
            // HH:MM:SS 格式
            hours = part1;
            minutes = part2;
            seconds = part3;
        } else {
            // MM:SS 格式
            hours = 0;
            minutes = part1;
            seconds = part2;
        }
        
        // 驗證時間範圍
        if (minutes >= 60 || seconds >= 60) {
            return null;
        }
        
        // 計算總秒數
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        
        return totalSeconds;
    }

    // 驗證時間是否在影片範圍內
    validateTimeForVideo(seconds) {
        if (!this.videoPlayer || !this.videoPlayer.video || !this.videoPlayer.video.duration) {
            return {
                valid: false,
                error: '影片尚未載入或無效'
            };
        }
        
        if (seconds < 0) {
            return {
                valid: false,
                error: '時間不能為負數'
            };
        }
        
        if (seconds > this.videoPlayer.video.duration) {
            const maxTime = this.formatTime(this.videoPlayer.video.duration);
            return {
                valid: false,
                error: `時間超出影片長度 (最大: ${maxTime})`
            };
        }
        
        return { valid: true };
    }

    // 處理時間跳轉輸入
    handleTimeJumpInput(input) {
        const seconds = this.parseTimeInput(input);
        
        if (seconds === null) {
            return {
                success: false,
                error: '時間格式無效，請使用 1:30 或 1:23:45 格式'
            };
        }
        
        const validation = this.validateTimeForVideo(seconds);
        if (!validation.valid) {
            return {
                success: false,
                error: validation.error
            };
        }
        
        // 執行跳轉
        this.jumpToTime(seconds);
        
        return {
            success: true,
            time: seconds,
            formattedTime: this.formatTime(seconds)
        };
    }

    // 格式化時間顯示
    formatTime(seconds) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = Math.floor(seconds % 60);
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    // 清除字幕
    clear() {
        this.subtitles = [];
        this.searchResults = [];
        this.currentResultIndex = 0;
    }
}