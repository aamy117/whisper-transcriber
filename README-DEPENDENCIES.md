# Whisper Transcriber 專案依賴說明

## 專案類型
這是一個**純前端 JavaScript 網頁應用程式**，不需要安裝任何套件或依賴。

## 運行環境需求

### 瀏覽器需求
- 現代瀏覽器（支援 ES6+ 和 Web Audio API）
  - Chrome 90+
  - Firefox 88+
  - Safari 14+
  - Edge 90+

### 開發環境
- 任何支援靜態檔案的 HTTP 伺服器
- Python 3.x（用於啟動本地伺服器）或任何其他 HTTP 伺服器

## API 需求
- **OpenAI API Key**：用於 Whisper 語音轉文字功能
  - 申請地址：https://platform.openai.com/api-keys
  - 使用模型：whisper-1

## 技術棧
- **前端框架**：原生 JavaScript（ES6+ 模組）
- **樣式**：原生 CSS（支援 CSS Variables）
- **儲存**：瀏覽器 LocalStorage
- **音訊處理**：Web Audio API
- **檔案處理**：File API、Blob API

## 檔案結構
```
whisper-transcriber/
├── index.html              # 主頁面
├── help.html              # 說明頁面
├── css/
│   └── styles.css         # 主樣式檔
├── js/
│   ├── main.js            # 主程式入口
│   ├── api.js             # Whisper API 整合
│   ├── audio.js           # 音訊播放控制
│   ├── editor.js          # 文字編輯器
│   ├── storage.js         # 本地儲存管理
│   ├── ui.js              # UI 控制
│   ├── virtual-scroll.js  # 虛擬滾動
│   ├── audio-compressor.js     # 音訊壓縮
│   ├── audio-splitter.js       # 音訊分割
│   └── transcription-preprocessor.js  # 轉譯預處理
└── docs/                  # 使用文件

```

## 如何運行

### 方法一：使用 Python（推薦）
```bash
# Python 3
python3 -m http.server 8080

# Python 2
python -m SimpleHTTPServer 8080
```

### 方法二：使用 Node.js
```bash
# 安裝 http-server
npm install -g http-server

# 啟動伺服器
http-server -p 8080
```

### 方法三：使用專案提供的啟動腳本
- Windows：雙擊 `start-server.bat`
- macOS/Linux：執行 `./start-server.sh`

## 部署需求
- 任何支援靜態網站的主機服務
- 建議使用 HTTPS（某些瀏覽器 API 需要）
- 無需後端伺服器或資料庫

## 注意事項
1. **API Key 安全**：請勿將 API Key 提交到版本控制
2. **CORS 限制**：某些功能可能需要從 HTTP 伺服器運行（不能直接開啟 HTML 檔案）
3. **檔案大小限制**：Whisper API 限制單次上傳檔案不超過 25MB

## 相容性測試
專案包含多個測試頁面用於驗證功能：
- `test-automated.html` - 自動化測試套件
- `test-audio-processing-fixed.html` - 音訊處理測試
- 其他測試檔案在專案根目錄

## 更新日期
2025-06-20