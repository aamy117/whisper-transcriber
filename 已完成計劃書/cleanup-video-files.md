# Video 資料夾檔案清理計劃

## 目前檔案分析

### ✅ 保留的檔案（目前使用中）：
1. **video-config.js** - 配置檔案（所有版本都在使用）
2. **video-player.js** - 核心播放器類別
3. **video-streaming.js** - 串流功能模組
4. **dom-ready-manager.js** - DOM 管理器（新架構核心）
5. **video-ui-v2.js** - 改進的 UI 類別（使用非同步初始化）
6. **video-main-v2.js** - 改進的主程式（使用新初始化流程）

### ❌ 可以移除的舊檔案：
1. **video-ui.js** - 原始版本，有 DOM 初始化問題
2. **video-ui-new.js** - 中間測試版本，已被 v2 取代
3. **video-main.js** - 原始版本，已被 v2 取代
4. **mp4-diagnostic.js** - 診斷工具，已整合到其他模組

### ⚠️ 特殊情況：
1. **video-ui-improved.js** - 剛創建的改進版，用於展示概念
   - 如果要使用 video-ui-v2.js，這個可以移除
   - 如果要保留作為參考，可以移到文檔資料夾

## 最終的檔案結構：
```
js/video/
├── video-config.js          # 配置
├── video-player.js          # 播放器核心
├── video-streaming.js       # 串流功能
├── dom-ready-manager.js     # DOM 管理
├── video-ui.js             # UI 控制（改進版）
└── video-main.js           # 主程式（改進版）
```

## 執行清理命令：
```bash
# 移除舊版檔案
rm video-ui.js
rm video-ui-new.js
rm video-main.js
rm mp4-diagnostic.js

# 可選：移除展示用檔案
rm video-ui-improved.js
```