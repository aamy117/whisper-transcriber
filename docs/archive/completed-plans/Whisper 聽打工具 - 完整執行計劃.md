# Whisper 聽打工具 - 完整執行計劃

## 專案概覽

### 目標
建立一個基於 OpenAI Whisper API 的網頁聽打工具，支援音訊自動轉譯、編輯校對、時間軸同步等功能。

### 核心原則
1. **漸進式開發**：從 MVP 開始，逐步增加功能
2. **個人優先**：先滿足個人使用，保留團隊擴展性
3. **快速上線**：使用 GitHub Pages，當天可用
4. **模組化設計**：便於未來維護和擴展

## 專案架構

```
whisper-transcriber/
├── index.html          # 主頁面
├── css/
│   └── style.css      # 樣式檔案
├── js/
│   ├── config.js      # 配置管理
│   ├── api.js         # API 呼叫封裝
│   ├── player.js      # 音訊播放控制
│   ├── editor.js      # 編輯器功能
│   └── main.js        # 主程式入口
├── assets/
│   └── icons/         # 圖示資源
├── docs/
│   └── usage.md       # 使用說明
├── .gitignore
├── README.md
└── LICENSE
```

## 五天開發時程

### Day 1: 基礎架構與播放器（4小時）

#### 上午（2小時）- 專案設置
1. **建立 GitHub 倉庫**
   ```bash
   mkdir whisper-transcriber
   cd whisper-transcriber
   git init
   ```

2. **建立基本檔案結構**
   ```bash
   mkdir css js assets docs
   touch index.html css/style.css js/main.js README.md .gitignore
   ```

3. **設定 .gitignore**
   ```
   # API Keys
   .env
   config.local.js
   
   # OS files
   .DS_Store
   Thumbs.db
   
   # Editor files
   .vscode/
   .idea/
   
   # Test files
   test-audio/
   *.mp3
   *.wav
   ```

4. **初始化 HTML 結構**
   - 響應式 viewport
   - 基本 SEO meta tags
   - 模組化 script 載入

#### 下午（2小時）- 音訊播放器
1. **實作播放控制**
   - 檔案選擇（支援拖放）
   - 播放/暫停
   - 進度條與時間顯示
   - 速度控制（0.5x - 2.0x）
   - 音量控制

2. **錯誤處理**
   - 檔案格式驗證
   - 檔案大小檢查（< 25MB）
   - 載入失敗提示

3. **Git commit**
   ```bash
   git add .
   git commit -m "feat: 基礎音訊播放器功能"
   ```

### Day 2: API 整合與轉譯功能（4小時）

#### 上午（2小時）- API 設置
1. **API Key 管理**
   ```javascript
   // 實作安全的 key 儲存
   // 首次使用設定流程
   // Key 驗證功能
   ```

2. **API 呼叫封裝**
   - 錯誤重試機制
   - 進度回調
   - 取消功能

3. **測試 API 連接**
   - 使用小檔案測試
   - 確認回應格式

#### 下午（2小時）- 轉譯介面
1. **轉譯流程**
   - 上傳進度顯示
   - 轉譯狀態指示
   - 結果解析處理

2. **基本結果顯示**
   - 時間戳格式化
   - 文字段落呈現
   - 暫存結果

3. **Git commit**
   ```bash
   git commit -m "feat: OpenAI Whisper API 整合"
   ```

### Day 3: 編輯器與時間軸同步（4小時）

#### 上午（2小時）- 編輯器核心
1. **段落編輯功能**
   - 即時編輯
   - 自動儲存（debounce）
   - 編輯狀態標記

2. **時間戳管理**
   - 顯示格式切換
   - 時間戳編輯
   - 插入新時間戳

#### 下午（2小時）- 播放同步
1. **時間軸同步**
   - 點擊段落跳轉
   - 播放時自動捲動
   - 當前段落高亮

2. **搜尋功能**
   - 全文搜尋
   - 搜尋高亮
   - 快速定位

3. **Git commit**
   ```bash
   git commit -m "feat: 編輯器與時間軸同步功能"
   ```

### Day 4: 熱鍵系統與資料管理（3小時）

#### 上午（1.5小時）- 熱鍵實作
1. **熱鍵配置**
   ```
   Space: 播放/暫停
   Ctrl+←/→: 快退/快進 3秒
   Ctrl+↑/↓: 速度調整
   Ctrl+T: 插入時間戳
   Ctrl+S: 手動儲存
   Ctrl+F: 搜尋
   Ctrl+E: 匯出
   ```

2. **熱鍵提示介面**
   - 快捷鍵列表
   - 視覺提示

#### 下午（1.5小時）- 資料管理
1. **專案管理**
   - 音檔與轉譯配對
   - 專案列表
   - 刪除與重新命名

2. **匯出功能**
   - 純文字（TXT）
   - 字幕檔（SRT）
   - WebVTT 格式
   - 含時間戳文字

3. **Git commit**
   ```bash
   git commit -m "feat: 熱鍵系統與資料管理"
   ```

### Day 5: UI 優化與部署（3小時）

#### 上午（1.5小時）- UI/UX 優化
1. **視覺優化**
   - 深色模式
   - 響應式設計
   - 載入動畫
   - 過渡效果

2. **使用體驗**
   - 工具提示
   - 操作引導
   - 錯誤訊息優化

#### 下午（1.5小時）- 部署上線
1. **部署準備**
   - 壓縮資源
   - 效能優化
   - 瀏覽器相容性測試

2. **GitHub Pages 部署**
   ```bash
   git add .
   git commit -m "feat: UI 優化與部署準備"
   git push origin main
   
   # GitHub Settings > Pages > Deploy from main branch
   ```

3. **撰寫文件**
   - README.md 使用說明
   - 快速開始指南
   - FAQ 常見問題

## 技術實作細節

### 1. 配置管理（config.js）
```javascript
const Config = {
  // 應用模式
  mode: 'personal', // 'personal' | 'team'
  
  // API 設定
  api: {
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    maxFileSize: 25 * 1024 * 1024, // 25MB
  },
  
  // 儲存設定
  storage: {
    prefix: 'whisper_',
    autoSaveInterval: 3000, // 3 秒
  },
  
  // 播放器設定
  player: {
    skipSeconds: 3,
    speedStep: 0.1,
    minSpeed: 0.5,
    maxSpeed: 2.0,
  }
};
```

### 2. API 呼叫封裝（api.js）
```javascript
class WhisperAPI {
  constructor() {
    this.apiKey = this.getApiKey();
  }
  
  async transcribe(audioFile, options = {}) {
    // 1. 驗證檔案
    // 2. 建立 FormData
    // 3. 顯示進度
    // 4. 呼叫 API
    // 5. 解析結果
    // 6. 錯誤處理
  }
  
  getApiKey() {
    // 從 localStorage 取得
    // 若無則顯示設定介面
  }
}
```

### 3. 專案資料結構
```javascript
// 專案格式
{
  id: 'project_1234567890',
  name: '訪談錄音 2024-12-20',
  audioFile: {
    name: 'interview.mp3',
    size: 15728640,
    duration: 1820,
    blob: null, // 可選，用於離線播放
  },
  transcription: {
    segments: [
      {
        id: 0,
        start: 0.0,
        end: 5.2,
        text: '原始轉譯文字',
        edited: '編輯後文字',
        isEdited: true
      }
    ],
    language: 'zh',
    createdAt: '2024-12-20T10:00:00Z',
    lastModified: '2024-12-20T11:30:00Z'
  }
}
```

## 未來擴展計劃

### 第二階段：團隊功能（1-2個月後）
1. **Cloudflare Workers 代理**
   - 隱藏 API key
   - 使用量統計
   - 用戶識別

2. **協作功能**
   - 專案分享
   - 評論系統
   - 版本歷史

### 第三階段：進階功能（3-6個月後）
1. **AI 輔助編輯**
   - 標點符號優化
   - 段落重組建議
   - 專有名詞識別

2. **多語言支援**
   - 介面多語言
   - 跨語言轉譯
   - 翻譯功能

## 成功指標

### 技術指標
- 頁面載入時間 < 2秒
- 轉譯準確率 > 90%
- 編輯器無延遲
- 所有功能可離線使用（除轉譯）

### 使用指標
- 每週使用 5+ 次
- 平均編輯時間減少 50%
- 零資料遺失
- 同事願意使用

## 風險管理

### 技術風險
1. **API 限制**
   - 對策：實作請求隊列
   - 備案：錯誤提示與重試

2. **瀏覽器相容性**
   - 對策：使用標準 API
   - 備案：功能降級提示

3. **資料遺失**
   - 對策：多重備份機制
   - 備案：復原功能

### 使用風險
1. **API 成本控制**
   - 對策：使用量預警
   - 備案：每日限額

2. **隱私保護**
   - 對策：本地儲存優先
   - 備案：資料加密選項

## 每日檢查清單

### 開發期間
- [ ] 完成計劃功能
- [ ] 測試新功能
- [ ] 提交 Git commit
- [ ] 更新文件
- [ ] 記錄問題

### 上線後
- [ ] 檢查錯誤日誌
- [ ] 監控 API 使用量
- [ ] 收集使用反饋
- [ ] 規劃下次更新

## 資源連結

- [OpenAI API 文件](https://platform.openai.com/docs/api-reference/audio)
- [GitHub Pages 文件](https://docs.github.com/pages)
- [Web Audio API](https://developer.mozilla.org/docs/Web/API/Web_Audio_API)
- [Cloudflare Workers](https://workers.cloudflare.com/)

