# Whisper 多媒體工具 - 整合實踐計劃書（修訂版）

*修訂說明：保持現有 index.html 作為音訊工具主頁，避免破壞使用者體驗*

## 專案概覽

### 專案願景
建立一個完整的多媒體處理工具套件，支援音訊轉譯和視訊字幕搜尋，提供專業的聽打與影片勘誤功能。

### 核心功能模組
1. **音訊聽打工具**（已完成基礎功能）
   - OpenAI Whisper API 轉譯
   - 時間軸同步編輯
   - 多格式匯出

2. **視訊播放器**（待開發）
   - MP4 字幕搜尋定位
   - 時間標記與筆記
   - 影片勘誤功能

3. **音質優化系統**（待整合）
   - Web Audio API 優化
   - 高倍速播放音質改善
   - 自動回退機制

### 技術原則
- **本地優先**：所有資料處理在瀏覽器完成
- **漸進增強**：功能模組化，逐步擴展
- **無縫整合**：共享組件與統一介面
- **效能優先**：大檔案處理與記憶體優化
- **向後相容**：保持現有 URL 和功能不變

## 專案架構設計

```
whisper-transcriber/
├── index.html              # 音訊工具主頁面（保持現有）
├── video.html              # 視訊播放器頁面（新增）
├── home.html               # 導航入口頁面（新增，可選）
├── css/
│   ├── style.css          # 音訊工具樣式（現有）
│   ├── video.css          # 視訊播放器樣式（新增）
│   └── shared.css         # 共用樣式組件（新增）
├── js/
│   ├── config.js          # 共用配置（現有）
│   ├── main.js            # 音訊工具主程式（現有）
│   ├── player.js          # 音訊播放器（現有，將整合 Web Audio）
│   ├── api.js             # Whisper API（待實作）
│   ├── editor.js          # 編輯器功能（待實作）
│   ├── storage.js         # 統一儲存管理（新增）
│   ├── video/
│   │   ├── video-main.js        # 視訊主程式（新增）
│   │   ├── video-player.js      # 視訊播放控制（新增）
│   │   ├── subtitle-manager.js  # 字幕管理（新增）
│   │   └── bookmark-manager.js  # 標記管理（新增）
│   └── shared/
│       ├── web-audio.js         # Web Audio API 模組（新增）
│       ├── hotkeys.js           # 快捷鍵管理（新增）
│       ├── export.js            # 匯出功能（新增）
│       └── navigation.js        # 導航列組件（新增）
├── assets/
│   └── icons/             # 圖示資源
├── docs/
│   ├── audio-guide.md     # 音訊工具使用指南
│   └── video-guide.md     # 視訊工具使用指南
├── README.md
└── LICENSE
```

## 開發現狀與規劃

### 已完成功能（音訊播放器）
✅ 基礎架構建立
✅ 音訊檔案載入（拖放支援）
✅ 播放控制（播放/暫停/進度）
✅ 速度控制（0.5x - 3.0x）
✅ 音量控制
✅ 快捷鍵系統
✅ 主題切換（深色/淺色）
✅ 基本設定管理

### 導航系統整合方案
為了保持現有使用者體驗，採用漸進式導航整合：

1. **第一階段**：在 index.html 和 video.html 頂部加入導航列
   ```html
   <nav class="app-navigation">
     <a href="index.html" class="nav-link active">音訊工具</a>
     <a href="video.html" class="nav-link">視訊工具</a>
   </nav>
   ```

2. **第二階段**：建立可選的 home.html 作為專案總覽頁面
   - 顯示所有工具入口
   - 最近使用的專案
   - 使用統計資訊

### 待開發功能清單

#### 第一階段：音訊工具完善（1週）
1. **Whisper API 整合**
   - API 呼叫封裝
   - 轉譯進度顯示
   - 錯誤處理機制

2. **編輯器功能**
   - 時間軸同步
   - 段落編輯
   - 搜尋功能

3. **資料管理**
   - 專案儲存/載入
   - 匯出功能（TXT/SRT/VTT）

#### 第二階段：Web Audio API 整合（3天）
1. **音質優化實作**
   - 整合至現有 player.js
   - 1.5x+ 自動啟用
   - 動態濾波器調整

2. **相容性處理**
   - 功能檢測
   - 自動回退
   - 效能監控

#### 第三階段：視訊播放器開發（2週）
1. **基礎播放功能**
   - 視訊載入與控制
   - 全螢幕支援
   - 控制介面設計

2. **字幕功能**
   - 內嵌字幕提取
   - 搜尋索引建立
   - 即時搜尋定位

3. **勘誤系統**
   - 時間標記功能
   - 勘誤表管理
   - 匯出報告

#### 第四階段：整合優化（1週）
1. **統一儲存系統**
   - IndexedDB 架構
   - 跨頁面資料共享
   - 備份/還原功能

2. **介面統一**
   - 導航系統
   - 共用組件
   - 一致性設計

## 詳細技術規格

### 1. Web Audio API 整合規格

#### 音訊播放器修改（player.js）
```javascript
// 新增屬性
class AudioPlayer {
  constructor() {
    // 現有屬性...
    
    // Web Audio API 相關
    this.webAudioEnabled = false;
    this.audioContext = null;
    this.sourceNode = null;
    this.filterNode = null;
    this.gainNode = null;
  }
  
  // 新增方法
  initWebAudio() {
    if (!this.detectWebAudioSupport()) return false;
    
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      this.setupAudioNodes();
      return true;
    } catch (error) {
      console.warn('Web Audio initialization failed:', error);
      return false;
    }
  }
  
  // 速度變更時自動切換
  handleSpeedChange(e) {
    const speed = parseFloat(e.target.value);
    this.audioElement.playbackRate = speed;
    
    // 1.5x 以上啟用優化
    if (speed >= 1.5 && !this.webAudioEnabled) {
      this.enableWebAudio();
    } else if (speed < 1.5 && this.webAudioEnabled) {
      this.disableWebAudio();
    }
    
    // 更新濾波器參數
    if (this.webAudioEnabled) {
      this.updateFilterSettings(speed);
    }
  }
}
```

### 2. 視訊播放器架構

#### 資料結構設計
```javascript
// 影片專案
{
  id: 'video_1234567890',
  fileName: 'lecture_2024.mp4',
  fileSize: 524288000,
  duration: 3600,
  lastPlayed: '2024-12-20T10:00:00Z',
  subtitles: {
    tracks: ['zh-TW', 'en'],
    extracted: true,
    indexed: true
  },
  bookmarks: [
    {
      id: 'bm_001',
      timestamp: 125.5,
      title: '重要概念',
      note: '講師提到的核心觀點',
      category: 'important',
      createdAt: '2024-12-20T10:30:00Z'
    }
  ],
  corrections: [
    {
      id: 'err_001',
      timestamp: 321.0,
      type: 'subtitle',
      description: '字幕錯誤：應為"演算法"而非"運算法"',
      status: 'pending'
    }
  ]
}
```

#### 字幕搜尋引擎
```javascript
class SubtitleSearchEngine {
  constructor() {
    this.index = new Map();
    this.subtitles = [];
  }
  
  buildIndex(subtitleTrack) {
    // 建立倒排索引
    subtitleTrack.cues.forEach(cue => {
      const words = this.tokenize(cue.text);
      words.forEach(word => {
        if (!this.index.has(word)) {
          this.index.set(word, []);
        }
        this.index.get(word).push({
          cueId: cue.id,
          startTime: cue.startTime,
          endTime: cue.endTime,
          text: cue.text
        });
      });
    });
  }
  
  search(query) {
    const results = [];
    const queryWords = this.tokenize(query.toLowerCase());
    
    // 搜尋匹配
    queryWords.forEach(word => {
      const matches = this.index.get(word) || [];
      results.push(...matches);
    });
    
    // 去重並排序
    return this.deduplicateAndSort(results);
  }
}
```

### 3. 統一儲存管理

#### IndexedDB 架構
```javascript
const DB_CONFIG = {
  name: 'WhisperMultimediaDB',
  version: 1,
  stores: {
    // 音訊專案
    audioProjects: {
      keyPath: 'id',
      indexes: ['fileName', 'createdAt', 'lastModified']
    },
    // 視訊專案
    videoProjects: {
      keyPath: 'id',
      indexes: ['fileName', 'lastPlayed']
    },
    // 字幕快取
    subtitleCache: {
      keyPath: 'videoId',
      indexes: ['language']
    },
    // 共用設定
    settings: {
      keyPath: 'key'
    }
  }
};

class StorageManager {
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_CONFIG.name, DB_CONFIG.version);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        this.createStores(db);
      };
    });
  }
}
```

### 4. 導航系統實作

#### navigation.js 共用組件
```javascript
class NavigationManager {
  constructor() {
    this.currentPage = this.detectCurrentPage();
  }
  
  detectCurrentPage() {
    const path = window.location.pathname;
    if (path.includes('video.html')) return 'video';
    if (path.includes('home.html')) return 'home';
    return 'audio'; // index.html 預設為音訊工具
  }
  
  render() {
    const nav = document.createElement('nav');
    nav.className = 'app-navigation';
    nav.innerHTML = `
      <div class="nav-container">
        <div class="nav-brand">Whisper 工具</div>
        <div class="nav-links">
          <a href="index.html" class="nav-link ${this.currentPage === 'audio' ? 'active' : ''}">
            <span class="nav-icon">🎵</span> 音訊工具
          </a>
          <a href="video.html" class="nav-link ${this.currentPage === 'video' ? 'active' : ''}">
            <span class="nav-icon">🎬</span> 視訊工具
          </a>
        </div>
      </div>
    `;
    return nav;
  }
  
  inject() {
    const firstChild = document.body.firstElementChild;
    const nav = this.render();
    document.body.insertBefore(nav, firstChild);
  }
}

// 自動注入導航列
document.addEventListener('DOMContentLoaded', () => {
  const nav = new NavigationManager();
  nav.inject();
});
```

### 5. 共用樣式 (shared.css)
```css
/* 導航列樣式 */
.app-navigation {
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.nav-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
}

.nav-brand {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.nav-links {
  display: flex;
  gap: var(--spacing-md);
}

.nav-link {
  display: flex;
  align-items: center;
  gap: var(--spacing-xs);
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--text-secondary);
  text-decoration: none;
  border-radius: var(--radius-md);
  transition: all 0.2s;
}

.nav-link:hover {
  background-color: var(--bg-tertiary);
  color: var(--text-primary);
}

.nav-link.active {
  background-color: var(--primary-color);
  color: white;
}

.nav-icon {
  font-size: 1.25rem;
}
```

## 實作時程安排

### 第1-2週：音訊工具完善
- **Day 1**: 導航系統整合 + Whisper API 開始
- **Day 2-3**: Whisper API 完成 + Web Audio API 整合
- **Day 4-5**: 編輯器核心功能
- **Day 6-7**: 資料管理與匯出

### 第3-4週：視訊播放器
- **Day 8-9**: 基礎播放器架構
- **Day 10-11**: 字幕提取與索引
- **Day 12-13**: 搜尋功能實作
- **Day 14-15**: 勘誤系統開發

### 第5週：整合與優化
- **Day 16-17**: 統一儲存系統
- **Day 18-19**: UI/UX 優化
- **Day 20-21**: 測試與部署

## 效能指標

### 音訊工具
- 檔案載入：< 2秒（50MB）
- 轉譯回應：< 5秒開始
- 編輯延遲：< 50ms
- Web Audio 切換：< 100ms

### 視訊播放器
- 視訊載入：< 3秒開始播放
- 字幕索引：< 5秒（10,000條）
- 搜尋回應：< 100ms
- 記憶體使用：< 500MB

### 導航系統
- 頁面切換：< 200ms
- 導航列載入：< 50ms
- 狀態同步：即時

## 風險評估與對策

### 技術風險
1. **Web Audio 音視頻同步**
   - 風險：可能造成延遲
   - 對策：精確時間戳同步

2. **大檔案處理**
   - 風險：記憶體溢出
   - 對策：串流處理、分片載入

3. **字幕格式相容性**
   - 風險：非標準格式
   - 對策：多格式解析器

### 使用風險
1. **儲存空間限制**
   - 風險：IndexedDB 配額
   - 對策：空間監控、清理機制

2. **瀏覽器相容性**
   - 風險：功能不支援
   - 對策：功能檢測、優雅降級

### 部署風險
1. **URL 結構保持**
   - 風險：破壞現有書籤和 SEO
   - 對策：保持 index.html 作為音訊工具主頁
   - 監控：使用 Google Analytics 追蹤 404 錯誤

## 成功標準

### 功能完整性
- [ ] 音訊轉譯準確率 > 95%
- [ ] 視訊字幕搜尋覆蓋率 100%
- [ ] 所有核心功能離線可用
- [ ] 跨瀏覽器相容性
- [ ] 保持現有 URL 結構不變

### 使用體驗
- [ ] 首次使用 < 3分鐘上手
- [ ] 工作效率提升 > 50%
- [ ] 零資料遺失
- [ ] 回應時間符合指標
- [ ] 無縫導航切換體驗

## 後續發展方向

### 短期（3個月）
1. 批次處理功能
2. 雲端備份選項
3. 瀏覽器擴充功能
4. 完整的首頁儀表板（home.html）

### 中期（6個月）
1. AI 輔助功能
2. 協作編輯
3. 行動裝置支援
4. PWA 離線應用

### 長期（1年）
1. 桌面應用程式
2. 企業版本
3. API 開放平台
4. 考慮重構 URL 結構（需要完整的遷移計劃）