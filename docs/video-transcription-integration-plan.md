# 視訊轉譯整合方案 - 解決無字幕檔搜尋問題

## 🎯 核心問題
使用者只有影片檔案，沒有字幕檔案，無法使用字幕搜尋功能。

## 💡 關鍵洞察
這個專案是 **Whisper 轉譯工具**，音訊工具已有完整轉譯功能，視訊工具應該具備相同能力！

## 🚀 解決方案：視訊轉譯整合

### 方案架構
```
使用者上傳影片 → 轉譯成字幕 → 自動載入搜尋 → 可搜尋內容
```

### 實作流程

#### 1. 在視訊頁面加入轉譯按鈕
```javascript
// 在視訊播放器下方或側邊面板
<button class="btn btn-primary" id="transcribeVideoBtn">
    <span class="icon">🎙️</span> 轉譯影片內容
</button>
```

#### 2. 複用現有轉譯邏輯
```javascript
// video-transcription.js
import { WhisperAPI } from '../api.js';
import { AudioProcessor } from '../audio-processor.js';

class VideoTranscription {
    constructor() {
        this.whisperAPI = new WhisperAPI();
        this.audioProcessor = new AudioProcessor();
    }
    
    async transcribeVideo(videoFile) {
        try {
            // 1. 從影片提取音訊
            const audioBlob = await this.extractAudioFromVideo(videoFile);
            
            // 2. 使用現有的 Whisper API 轉譯
            const result = await this.whisperAPI.transcribe(audioBlob, {
                language: 'zh',
                response_format: 'verbose_json',  // 包含時間戳
                timestamp_granularities: ['segment']
            });
            
            // 3. 轉換為 SRT 格式
            const srtContent = this.convertToSRT(result);
            
            // 4. 自動載入到字幕搜尋
            this.loadToSubtitleSearch(srtContent);
            
            // 5. 同時顯示在編輯器（如音訊工具）
            this.displayInEditor(result);
            
            return { srt: srtContent, json: result };
            
        } catch (error) {
            console.error('轉譯失敗:', error);
            throw error;
        }
    }
    
    async extractAudioFromVideo(videoFile) {
        // 使用 Web Audio API 或現有的 audio-processor.js
        return await this.audioProcessor.extractAudioFromVideo(videoFile);
    }
    
    convertToSRT(transcriptionResult) {
        let srt = '';
        let index = 1;
        
        transcriptionResult.segments.forEach(segment => {
            srt += `${index}\n`;
            srt += `${this.formatSRTTime(segment.start)} --> ${this.formatSRTTime(segment.end)}\n`;
            srt += `${segment.text.trim()}\n\n`;
            index++;
        });
        
        return srt;
    }
}
```

#### 3. 整合到視訊工具界面
```html
<!-- 更新視訊工具的字幕面板 -->
<div class="panel-content hidden" id="subtitlesPanel">
    <div class="subtitle-section">
        <!-- 轉譯選項 -->
        <div class="transcribe-options">
            <h3>取得字幕</h3>
            
            <!-- 主要選項：轉譯影片 -->
            <button class="btn btn-primary btn-large" id="transcribeVideoBtn">
                <span class="icon">🎙️</span>
                <span>
                    <strong>轉譯影片內容</strong>
                    <small>使用 Whisper AI 自動生成字幕</small>
                </span>
            </button>
            
            <!-- 次要選項：上傳現有字幕 -->
            <div class="divider">或</div>
            
            <button class="btn btn-secondary" id="uploadSubtitleBtn">
                <span class="icon">📄</span> 上傳現有字幕檔案
            </button>
        </div>
        
        <!-- 轉譯進度 -->
        <div class="transcribe-progress hidden" id="transcribeProgress">
            <h4>正在轉譯影片...</h4>
            <div class="progress-bar">
                <div class="progress-fill"></div>
            </div>
            <p class="progress-text">預估時間：影片長度的 1/3</p>
            <button class="btn btn-sm btn-danger" id="cancelTranscribeBtn">取消</button>
        </div>
        
        <!-- 轉譯結果 -->
        <div class="transcribe-result hidden" id="transcribeResult">
            <div class="result-header">
                <h3>轉譯完成</h3>
                <div class="result-actions">
                    <button class="btn btn-sm" id="editTranscriptBtn">
                        <span class="icon">✏️</span> 編輯
                    </button>
                    <button class="btn btn-sm" id="downloadSRTBtn">
                        <span class="icon">💾</span> 下載 SRT
                    </button>
                </div>
            </div>
            
            <!-- 搜尋功能（自動啟用） -->
            <div class="search-section">
                <h3>搜尋字幕</h3>
                <div class="search-box">
                    <input type="text" id="subtitleSearchInput" 
                           placeholder="搜尋轉譯內容..." 
                           class="search-input">
                    <button class="btn btn-primary" id="subtitleSearchBtn">
                        <span class="icon">🔍</span> 搜尋
                    </button>
                </div>
            </div>
        </div>
    </div>
</div>
```

## 🔄 工作流程

### 使用者體驗流程
1. 使用者上傳影片
2. 點擊「字幕搜尋」標籤
3. 看到「轉譯影片內容」按鈕（明顯提示）
4. 點擊開始轉譯
5. 顯示進度（可取消）
6. 完成後自動啟用搜尋功能
7. 可立即搜尋影片內容

### 技術實作流程
1. **提取音訊**：從 video 元素提取音訊流
2. **分段處理**：如果影片很長，分段送到 API
3. **即時顯示**：邊轉譯邊顯示結果
4. **自動儲存**：儲存到 localStorage/IndexedDB
5. **載入搜尋**：自動載入到搜尋系統

## 💾 資料管理

### 快取策略
```javascript
// 使用 IndexedDB 儲存轉譯結果
class TranscriptionCache {
    async saveTranscription(videoId, transcription) {
        const db = await this.openDB();
        const tx = db.transaction(['transcriptions'], 'readwrite');
        await tx.objectStore('transcriptions').put({
            id: videoId,
            filename: transcription.filename,
            result: transcription.result,
            srt: transcription.srt,
            timestamp: Date.now()
        });
    }
    
    async getTranscription(videoId) {
        const db = await this.openDB();
        const tx = db.transaction(['transcriptions'], 'readonly');
        return await tx.objectStore('transcriptions').get(videoId);
    }
}
```

### 自動偵測已轉譯
```javascript
// 載入影片時檢查是否有快取的轉譯
async function checkExistingTranscription(videoFile) {
    const videoId = generateVideoId(videoFile);
    const cached = await transcriptionCache.getTranscription(videoId);
    
    if (cached) {
        // 直接載入快取的轉譯結果
        loadToSubtitleSearch(cached.srt);
        showTranscriptionExists();
    } else {
        // 顯示轉譯按鈕
        showTranscribeButton();
    }
}
```

## 🎨 UI/UX 優化

### 1. 智慧提示
- 首次使用時顯示提示：「點擊轉譯按鈕來搜尋影片內容」
- 轉譯過的影片顯示：「已有轉譯結果，可直接搜尋」

### 2. 進度回饋
- 顯示預估時間（基於影片長度）
- 即時顯示已轉譯的內容
- 可以取消並保留部分結果

### 3. 整合編輯器
- 轉譯完成後可以編輯校正
- 支援時間軸調整
- 可匯出為標準字幕格式

## 🚀 快速實作步驟

### 第一步：基礎整合（1-2 天）
1. 複製音訊工具的轉譯邏輯
2. 加入視訊音訊提取功能  
3. 整合到字幕搜尋系統
4. 基本 UI 實作

### 第二步：體驗優化（1 天）
1. 加入進度顯示
2. 實作快取功能
3. 優化搜尋體驗
4. 錯誤處理

### 第三步：進階功能（選做）
1. 分段轉譯（長影片）
2. 多語言支援
3. 編輯器整合
4. 批次處理

## 📊 預期效果

### Before（現在）
- 使用者上傳影片 ❌ 無法搜尋內容
- 需要另外準備字幕檔案
- 功能使用率低

### After（整合後）
- 使用者上傳影片 ✅ 一鍵轉譯 ✅ 立即搜尋
- 自動生成可搜尋的字幕
- 大幅提升功能使用率

## 🎯 核心價值
1. **解決實際問題**：大部分使用者沒有字幕檔
2. **善用現有資源**：Whisper API 已經整合好
3. **提升產品價值**：從「字幕搜尋」升級為「影片內容搜尋」
4. **統一體驗**：音訊和視訊工具功能一致