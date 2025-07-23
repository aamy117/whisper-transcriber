# 專案檔案結構

## 根目錄
```
whisper-transcriber/
├── index.html          # 主應用程式入口
├── batch.html          # 批次處理介面
├── video.html          # 視訊轉譯介面
├── help.html           # 使用說明頁面
├── diagnose.html       # 診斷工具
├── quick-start.html    # 快速開始指南
├── test-stream-analyzer.html  # 音訊分析測試 ✨
├── test-smart-splitter.html   # 智慧分割測試 ✨
├── README.md           # 專案說明
├── README-DEPENDENCIES.md  # 依賴說明
├── PROJECT_PLAN.md     # 專案計劃 ✨
├── LICENSE             # 授權文件
├── .gitignore          # Git 忽略清單
└── .eslintrc.json      # ESLint 設定
```

## 主要資料夾結構

### `/js` - JavaScript 程式碼
```
js/
├── api.js              # Whisper API 整合
├── main.js             # 主程式邏輯
├── player.js           # 音訊播放器
├── editor.js           # 文字編輯器
├── export.js           # 匯出功能
├── config.js           # 設定管理
├── notification.js     # 通知系統
├── dialog.js           # 對話框系統
├── batch-processor.js  # 批次處理
├── audio-compressor.js # 音訊壓縮
├── audio-splitter.js   # 音訊分割
├── transcription-preprocessor.js  # 轉譯預處理
├── virtual-scroll.js   # 虛擬滾動
├── dom-batch-update.js # DOM 批次更新
├── progress-manager.js # 進度管理器
├── large-file/         # 大檔案處理系統 ✨
│   ├── large-file-config.js        # 配置管理系統 ✅
│   ├── large-file-controller.js    # 主控制器 ✅
│   ├── stream-analyzer.js          # 串流分析器 ✅
│   ├── smart-splitter.js           # 智慧分割器 ✅
│   ├── parallel-processor.js       # 並行處理器 ⏳
│   ├── worker-pool-manager.js      # Worker 池管理 ⏳
│   ├── progress-checkpoint.js      # 進度檢查點 ⏳
│   ├── cache-manager.js            # 快取管理器 ⏳
│   ├── memory-monitor.js           # 記憶體監控 ⏳
│   ├── performance-optimizer.js    # 效能優化器 ⏳
│   ├── strategies/                 # 音訊格式策略 ✅
│   │   ├── audio-format-strategy.js
│   │   ├── mp3-frame-parser.js
│   │   ├── wav-chunk-parser.js
│   │   ├── format-strategy-manager.js
│   │   └── index.js
│   └── tests/                      # 測試檔案
│       └── test-stream-analyzer.js
├── utils/              # 工具函數
│   ├── debounce.js    # 防抖工具
│   ├── text-converter.js   # 文字轉換
│   └── opencc-lite.js      # 簡繁轉換
├── wasm/               # WASM 相關
│   ├── whisper-wasm-manager.js
│   ├── whisper-transformers.js
│   └── whisper-wasm-real.js
├── workers/            # Web Workers
│   └── whisper-worker.js
└── video/              # 視訊相關
    ├── video-player.js
    ├── video-ui.js
    └── ...
```

### `/css` - 樣式檔案
```
css/
├── style.css           # 主樣式
├── editor.css          # 編輯器樣式
├── batch.css           # 批次處理樣式
├── help.css            # 說明頁樣式
├── video.css           # 視訊頁樣式
└── themes/             # 主題樣式
    ├── light.css
    └── dark.css
```

### `/docs` - 專案文檔
```
docs/
├── API設定指南.md
├── 使用者指南.md
├── 功能說明.md
├── 疑難排解.md
├── 專案深度分析總結.md
├── 大檔案轉譯解決方案.md
├── 標點符號切換功能測試報告.md
└── ...
```

### `/daily` - 每日進度 ✨
```
daily/
├── 2025-06-27.md      # 第一階段完成
├── 2025-01-28.md      # 第二階段完成
└── template.md        # 進度模板
```

### `/_workspace` - 工作區 ✨
```
_workspace/
├── INDEX.md           # 工作區索引
├── tests/            # 測試檔案
├── experiments/      # 實驗性程式碼
└── logs/             # 工作記錄
```

### `/scripts` - 執行腳本
```
scripts/
├── start-server.sh     # Linux/Mac 啟動腳本
├── start-server.bat    # Windows 批次檔
├── start-server.ps1    # PowerShell 腳本
├── fix-all-format.sh   # 格式修復腳本
├── fix-all-format.bat
├── start-day.sh        # 開始每日工作 ✨
├── end-day.sh          # 結束每日工作 ✨
├── organize-files.sh   # 檔案整理 ✨
├── quick-create.sh     # 快速建立檔案 ✨
├── cleanup.sh          # 清理舊檔案 ✨
├── diagnose-mcp.sh     # MCP 診斷 ✨
├── fix-mcp-servers.sh  # 修復 MCP ✨
└── setup-mcp-global.sh # 設置 MCP ✨
```

### `/test` - 測試檔案
```
test/
├── README.md           # 測試索引
├── test-*.html         # 各種測試檔案
└── WASM測試報告.md
```

### `/tools` - 開發工具
```
tools/
├── auto-fix-code.js    # 程式碼自動修復
├── auto-fix-browser.html
├── code-check.js       # 程式碼檢查
├── code-quality-check.html
└── browser-ffmpeg-solution.html
```

### `/assets` - 資源檔案
```
assets/
├── favicon.ico
└── icons/
    └── ...
```

### `/.claude` - Claude 設定 ✨
```
.claude/
├── settings.local.json # 本地設定
└── CLAUDE.md          # 使用者偏好（已移至.claude）
```

### `/已完成計劃書` - 歸檔文件 ✨
```
已完成計劃書/
├── PROJECT_PLAN-完成.md
├── PROJECT_LOG.md
└── 大檔案處理完整重構計劃.md
```

## 檔案命名規範

1. **HTML 檔案**：使用小寫字母和連字符（kebab-case）
2. **JavaScript**：使用小寫字母和連字符
3. **CSS 檔案**：使用小寫字母和連字符
4. **文檔檔案**：使用中文名稱方便識別
5. **測試檔案**：`test-{功能名稱}.{ext}`
6. **日誌檔案**：`log-{主題}-{日期}.md`

## 開發注意事項

1. 新增測試檔案請放入 `/_workspace/tests/` 資料夾
2. 工具類程式請放入 `/tools` 資料夾
3. 專案文檔請放入 `/docs` 資料夾
4. 執行腳本請放入 `/scripts` 資料夾
5. 每日進度記錄在 `/daily` 資料夾
6. 實驗性程式碼放入 `/_workspace/experiments/`

## 本地開發

使用 Live Server 在 VSCode 中開發：
- 預設端口：5500
- 訪問地址：http://localhost:5500

使用 Python HTTP Server：
```bash
python3 -m http.server 5500
```

## Git 檢查點

- 第一階段完成：`9c87c29` (2025-06-27)
- 第二階段完成：`6a47c7b` (2025-01-28)

## 符號說明

- ✅ 已完成
- ⏳ 開發中
- ✨ 新增項目

---
最後更新：2025-01-28