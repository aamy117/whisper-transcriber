# 視訊字幕提取替代方案

## 🎯 問題分析
目前字幕搜尋功能需要使用者另外上傳字幕檔案（.srt/.vtt），無法直接從影片中提取內嵌字幕。

## 📊 影片字幕類型

### 1. **內嵌字幕（Embedded Subtitles）**
- 存在於影片容器中（如 MP4、MKV）
- 可以開關的字幕軌道
- **問題**：瀏覽器 WebAPI 無法直接存取

### 2. **燒錄字幕（Burned-in Subtitles）**
- 直接渲染在影片畫面上
- 無法關閉
- **問題**：需要 OCR 技術提取

### 3. **外掛字幕（External Subtitles）**
- 獨立的 .srt/.vtt 檔案
- 目前方案支援此類型

## 🔧 替代方案

### 方案一：使用 Whisper API 自動生成字幕 ⭐推薦
```javascript
// 整合到現有系統
async function generateSubtitlesFromVideo(videoFile) {
    // 1. 從影片提取音訊
    const audioData = await extractAudioFromVideo(videoFile);
    
    // 2. 使用 Whisper API 轉錄
    const transcription = await whisperAPI.transcribe(audioData, {
        response_format: 'srt',  // 直接生成 SRT 格式
        language: 'zh'          // 或自動偵測
    });
    
    // 3. 自動載入到字幕搜尋系統
    subtitleSearch.loadSubtitle(transcription);
}
```

**優點**：
- 完全自動化，無需額外字幕檔案
- 支援任何語言的影片
- 可以生成高品質的時間軸字幕
- 與現有 Whisper 工具整合

**實作步驟**：
1. 在字幕面板添加「自動生成字幕」按鈕
2. 提取影片音訊（使用 Web Audio API）
3. 呼叫 Whisper API（已有現成的 API 模組）
4. 將結果自動載入到字幕搜尋

### 方案二：使用 WebVTT API（有限支援）
```javascript
// 檢測影片的 TextTrack
function detectVideoSubtitles(videoElement) {
    const tracks = videoElement.textTracks;
    const subtitles = [];
    
    for (let i = 0; i < tracks.length; i++) {
        if (tracks[i].kind === 'subtitles' || tracks[i].kind === 'captions') {
            subtitles.push({
                label: tracks[i].label,
                language: tracks[i].language,
                cues: Array.from(tracks[i].cues || [])
            });
        }
    }
    
    return subtitles;
}
```

**限制**：
- 只能讀取 HTML5 `<track>` 元素載入的字幕
- 無法存取影片檔案內的字幕軌道
- 需要 CORS 支援

### 方案三：使用 FFmpeg.wasm 提取內嵌字幕
```javascript
// 使用 FFmpeg.wasm 在瀏覽器中提取字幕
async function extractEmbeddedSubtitles(videoFile) {
    const ffmpeg = createFFmpeg({ log: true });
    await ffmpeg.load();
    
    // 寫入影片檔案
    ffmpeg.FS('writeFile', 'input.mp4', await fetchFile(videoFile));
    
    // 提取字幕軌道
    await ffmpeg.run(
        '-i', 'input.mp4',
        '-map', '0:s:0',  // 提取第一個字幕軌道
        '-c:s', 'srt',
        'output.srt'
    );
    
    // 讀取結果
    const data = ffmpeg.FS('readFile', 'output.srt');
    return new TextDecoder().decode(data);
}
```

**缺點**：
- FFmpeg.wasm 檔案很大（~25MB）
- 處理速度較慢
- 記憶體使用量大

### 方案四：伺服器端處理
```javascript
// 上傳影片到伺服器提取字幕
async function serverSideSubtitleExtraction(videoFile) {
    const formData = new FormData();
    formData.append('video', videoFile);
    
    const response = await fetch('/api/extract-subtitles', {
        method: 'POST',
        body: formData
    });
    
    return await response.json();
}
```

**需要**：
- 後端服務支援
- 可使用完整版 FFmpeg
- 更好的效能和功能

## 💡 建議實作順序

### 第一階段：Whisper 自動生成（最實用）
1. 在現有介面加入「自動生成字幕」功能
2. 複用現有的 Whisper API 整合
3. 提供進度顯示（因為可能需要時間）
4. 生成後自動載入到搜尋系統

### 第二階段：改善使用體驗
1. 記住已生成的字幕（避免重複生成）
2. 提供字幕編輯功能
3. 支援多語言選擇
4. 匯出生成的字幕

### 第三階段：進階功能
1. 支援 WebVTT 軌道偵測
2. 提供字幕合併功能
3. 自動偵測語言

## 🚀 快速實作範例

```javascript
// 在 subtitle-search.js 中新增
class SubtitleAutoGenerator {
    constructor(whisperAPI) {
        this.whisperAPI = whisperAPI;
        this.cache = new Map();
    }
    
    async generateFromVideo(videoFile) {
        // 檢查快取
        const cacheKey = `${videoFile.name}_${videoFile.size}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        try {
            // 顯示生成中的提示
            this.showGeneratingUI();
            
            // 提取音訊並轉錄
            const audioBlob = await this.extractAudio(videoFile);
            const srtContent = await this.whisperAPI.transcribe(audioBlob, {
                response_format: 'srt',
                task: 'transcribe'
            });
            
            // 快取結果
            this.cache.set(cacheKey, srtContent);
            
            // 自動載入到字幕搜尋
            this.loadGeneratedSubtitle(srtContent);
            
            return srtContent;
            
        } catch (error) {
            console.error('字幕生成失敗:', error);
            this.showError('無法生成字幕，請手動上傳字幕檔案');
        } finally {
            this.hideGeneratingUI();
        }
    }
    
    async extractAudio(videoFile) {
        // 使用現有的音訊提取邏輯
        // 可以複用 audio-processor.js 的程式碼
    }
}
```

## 📋 使用者介面更新

```html
<!-- 更新字幕面板 -->
<div class="subtitle-upload">
    <h3>字幕來源</h3>
    <div class="subtitle-options">
        <!-- 自動生成選項 -->
        <button class="btn btn-primary" id="autoGenerateSubtitleBtn">
            <span class="icon">🤖</span> 自動生成字幕
        </button>
        
        <!-- 手動上傳選項 -->
        <button class="btn btn-secondary" id="uploadSubtitleBtn">
            <span class="icon">📄</span> 上傳字幕檔案
        </button>
    </div>
    
    <!-- 生成進度 -->
    <div class="generation-progress hidden" id="subtitleGenProgress">
        <div class="progress-bar">
            <div class="progress-fill"></div>
        </div>
        <p class="progress-text">正在生成字幕...</p>
    </div>
</div>
```

## 🎯 總結

最實用的方案是**整合 Whisper API 自動生成字幕**，因為：
1. 技術上可行（已有 Whisper 整合）
2. 使用者體驗最好（全自動）
3. 支援所有影片（不限於有字幕的）
4. 可以選擇語言和品質

這樣使用者就可以選擇：
- 🤖 自動生成（使用 Whisper）
- 📄 手動上傳（現有功能）
- 🔍 兩者結合（生成後編輯）