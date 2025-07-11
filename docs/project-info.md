# Whisper Transcriber 專案資訊

## 專案概述

### 基本資訊
- **專案名稱**：Whisper Transcriber
- **專案類型**：音訊/視訊轉譯工具
- **架構**：純前端專案
- **更新日期**：2025-07-11

### 技術棧
- **前端架構**：純前端、無需後端伺服器
- **模組系統**：ES6 模組化開發
- **離線支援**：PWA (Progressive Web App)
- **背景處理**：Web Workers
- **本地儲存**：IndexedDB
- **依賴管理**：CDN 載入，無需 npm install

### 核心功能
1. **音訊/視訊轉譯**
   - 使用 OpenAI Whisper API
   - 支援多種音訊格式
   - 視訊音軌提取與轉譯

2. **大檔案處理**
   - 自動切割大檔案（API 限制 25MB）
   - Web Workers 並行處理
   - 斷點續傳機制

3. **最新功能（2025-07-11）**
   - 視訊工具完整支援
   - 音訊/視訊同步播放
   - 時間標記功能增強

## 開發環境

### 本地伺服器
```bash
# 標準啟動方式（端口 8080）
python3 -m http.server 8080

# 或使用專案腳本
./scripts/temp/start-server.sh
```

### 版本控制
- 使用 Git 檢查點機制
- 每完成一個開發階段建立檢查點
- 主分支：main

## API 整合

### OpenAI Whisper API
- **金鑰儲存**：localStorage
- **呼叫限制**：單次最大 25MB
- **處理策略**：大檔案自動切割
- **錯誤處理**：自動重試機制

## 已知問題（2025-07-11）

### 文檔問題
1. **端口號不一致**
   - user-guide.md 中提到端口 8000
   - 實際使用端口 8080
   - 需要統一修正

2. **缺少文檔**
   - 視訊功能說明文檔缺失
   - GitHub 專案連結未提供
   - 時間標記編輯功能說明不完整

### 待解決事項
- [ ] 修正 user-guide.md 端口號
- [ ] 補充視訊功能使用說明
- [ ] 添加 GitHub 專案連結
- [ ] 完善時間標記功能文檔

## 專案結構

### 核心模組
- **js/api/** - API 整合層
- **js/player/** - 播放器功能
- **js/editor/** - 編輯器功能
- **js/large-file/** - 大檔案處理
- **js/workers/** - Web Workers
- **js/wasm/** - WebAssembly 整合

### 測試頁面
- `test.html` - 基礎功能測試
- `test-large-file.html` - 大檔案處理測試
- `test-video.html` - 視訊轉譯測試

## 開發指南

### 程式碼規範
- 檔案命名：kebab-case
- 註解語言：繁體中文
- 模組化開發：ES6 modules
- 事件驅動：CustomEvent

### 工作流程
1. 開始工作：`./scripts/start-day.sh`
2. 程式碼檢查：`node tools/code-check.js`
3. 建立檢查點：`git commit -m "階段性進度: [描述]"`
4. 結束工作：`./scripts/end-day.sh`