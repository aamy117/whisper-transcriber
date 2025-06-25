# 音訊格式支援指南

## 概述

Whisper 轉譯器使用 Web Audio API 進行音訊處理。由於瀏覽器的限制，並非所有音訊格式都能正常處理。本指南說明哪些格式可以使用，以及如何處理不支援的格式。

## 支援的音訊格式

### 🟢 完全支援（建議使用）

1. **MP3 (.mp3)**
   - MIME Type: `audio/mpeg`, `audio/mp3`
   - 優點：廣泛支援、檔案較小
   - 缺點：有損壓縮
   - 建議：最推薦的格式，所有瀏覽器都支援

2. **WAV (.wav)**
   - MIME Type: `audio/wav`, `audio/wave`
   - 優點：無損音質、相容性極佳
   - 缺點：檔案較大
   - 建議：高品質需求時使用

3. **WebM (.webm)**
   - MIME Type: `audio/webm`
   - 優點：現代格式、壓縮效率高
   - 缺點：較舊瀏覽器可能不支援
   - 建議：適合網路應用

### 🟡 部分支援（可能有問題）

1. **OGG Vorbis (.ogg, .oga)**
   - MIME Type: `audio/ogg`
   - 問題：Safari 不支援
   - 建議：避免在需要跨瀏覽器相容的情況下使用

2. **M4A/AAC (.m4a, .aac)**
   - MIME Type: `audio/mp4`, `audio/aac`
   - 問題：某些編碼器產生的檔案可能無法解碼
   - 建議：測試後使用

3. **FLAC (.flac)**
   - MIME Type: `audio/flac`
   - 問題：舊版瀏覽器不支援
   - 建議：確認目標瀏覽器支援後使用

### 🔴 不支援（需要轉換）

1. **WMA (.wma)** - Windows Media Audio
2. **AMR (.amr)** - 手機錄音格式
3. **APE (.ape)** - Monkey's Audio
4. **AC3 (.ac3)** - Dolby Digital
5. **DTS (.dts)** - DTS 音訊

## 為什麼會出現解碼錯誤？

當您看到 `EncodingError: Unable to decode audio data` 錯誤時，通常是因為：

1. **格式不支援** - 使用了瀏覽器無法解碼的音訊格式
2. **編碼問題** - 檔案使用了特殊的編碼參數
3. **檔案損壞** - 音訊檔案本身有問題
4. **DRM 保護** - 檔案有數位版權保護

## 解決方案

### 方案一：轉換音訊格式（推薦）

使用音訊轉換工具將檔案轉換為 MP3 或 WAV：

**線上工具：**
- CloudConvert (https://cloudconvert.com/audio-converter)
- Online Audio Converter (https://online-audio-converter.com/)
- Convertio (https://convertio.co/zh/audio-converter/)

**桌面軟體：**
- Audacity（免費開源）
- VLC Media Player（免費）
- Adobe Audition（專業工具）

**轉換建議設定：**
- 格式：MP3
- 位元率：128-192 kbps（語音）或 256-320 kbps（音樂）
- 取樣率：44.1 kHz 或 48 kHz

### 方案二：使用備用分割方法

如果無法轉換格式，系統會自動使用備用分割方法：

- **優點**：可以處理任何檔案格式
- **缺點**：
  - 無法進行靜音檢測
  - 可能在句子中間分割
  - 時間軸可能不準確

### 方案三：使用本地轉譯

選擇本地 WASM 轉譯可以避免檔案格式限制：

- 支援更多格式
- 不需要分割檔案
- 完全在本地處理

## 最佳實踐

1. **預先測試** - 使用測試工具檢查檔案是否支援
2. **統一格式** - 團隊內統一使用 MP3 或 WAV
3. **保留原檔** - 轉換前保留原始檔案
4. **檢查品質** - 轉換後確認音質符合需求

## 常見問題

**Q: 為什麼 MP3 最推薦？**
A: MP3 有最好的相容性，所有瀏覽器都支援，且檔案大小適中。

**Q: WAV 和 MP3 該選哪個？**
A: 如果重視音質選 WAV，如果重視檔案大小選 MP3。

**Q: 手機錄音檔案無法使用怎麼辦？**
A: 手機錄音常用 AMR 或 M4A 格式，建議轉換為 MP3。

**Q: 轉換會影響轉譯品質嗎？**
A: 只要保持合理的位元率（128kbps 以上），對語音轉譯影響很小。

## 技術細節

Web Audio API 使用 `decodeAudioData` 方法解碼音訊，支援的格式取決於：

1. 瀏覽器實作
2. 作業系統編解碼器
3. 音訊編碼參數

當解碼失敗時，系統會：

1. 捕獲 `EncodingError`
2. 切換到 `fallbackSplitMethod`
3. 使用位元組分割而非音訊分析

這確保了即使格式不支援，檔案仍可處理，只是功能受限。