# 支援的視訊格式指南

## 最佳相容性格式（強烈推薦）

### 1. MP4 (H.264 + AAC)
```bash
# 使用 FFmpeg 轉換為相容格式
ffmpeg -i input.video -c:v libx264 -c:a aac -movflags +faststart output.mp4
```

**參數說明**：
- `-c:v libx264`：使用 H.264 視訊編碼
- `-c:a aac`：使用 AAC 音訊編碼
- `-movflags +faststart`：將 moov atom 移到檔案開頭，支援串流播放

### 2. WebM (VP8/VP9)
```bash
# 轉換為 WebM 格式
ffmpeg -i input.video -c:v libvpx -c:a libvorbis output.webm
```

## 檔案大小與播放策略

| 檔案大小 | 播放方式 | 建議 |
|---------|---------|------|
| < 100MB | 傳統載入 | 所有格式都可以 |
| 100MB - 1GB | 傳統載入 | 建議使用 MP4 |
| 1GB - 2GB | 串流載入（自動） | 必須使用 MP4 (H.264) 或 WebM |
| > 2GB | 僅串流載入 | 必須使用 MP4 (H.264) 並優化 |

## 常見問題與解決方案

### 問題 1：串流載入無進展
**原因**：視訊編碼不支援 MSE
**解決**：
```bash
# 重新編碼為串流相容格式
ffmpeg -i problematic.mp4 \
  -c:v libx264 \
  -preset fast \
  -crf 23 \
  -c:a aac \
  -b:a 128k \
  -movflags +faststart \
  -f mp4 \
  output.mp4
```

### 問題 2：大檔案無法播放
**原因**：檔案結構不適合串流
**解決**：
```bash
# 優化大檔案串流
ffmpeg -i large.mp4 \
  -c copy \
  -movflags +faststart \
  optimized.mp4
```

### 問題 3：特殊格式（如 MKV、AVI）
**原因**：瀏覽器不直接支援
**解決**：
```bash
# MKV 轉 MP4
ffmpeg -i input.mkv -c copy -f mp4 output.mp4

# AVI 轉 MP4
ffmpeg -i input.avi -c:v libx264 -c:a aac output.mp4
```

## 測試你的視訊檔案

### 1. 檢查視訊資訊
```bash
ffprobe -v quiet -print_format json -show_format -show_streams input.mp4
```

### 2. 檢查編碼格式
```bash
ffmpeg -i input.mp4 2>&1 | grep Stream
```

### 3. 檢查 moov atom 位置
```bash
# 安裝 AtomicParsley
AtomicParsley input.mp4 -T
```

## 瀏覽器相容性

| 格式 | Chrome | Firefox | Safari | Edge |
|-----|--------|---------|--------|------|
| MP4 (H.264) | ✅ | ✅ | ✅ | ✅ |
| WebM (VP8/VP9) | ✅ | ✅ | ❌ | ✅ |
| Ogg | ✅ | ✅ | ❌ | ❌ |
| MOV | ✅ | ✅ | ✅ | ✅ |
| MKV | ❌ | ❌ | ❌ | ❌ |
| AVI | ❌ | ❌ | ❌ | ❌ |

## 建議工作流程

1. **小檔案（< 1GB）**：
   - 任何支援的格式都可以
   - 建議使用 MP4 以獲得最佳相容性

2. **大檔案（> 1GB）**：
   - 必須使用 MP4 (H.264 + AAC)
   - 必須添加 faststart flag
   - 考慮降低位元率以減少檔案大小

3. **超大檔案（> 2GB）**：
   - 使用以下命令優化：
   ```bash
   ffmpeg -i huge.mp4 \
     -c:v libx264 \
     -preset slow \
     -crf 25 \
     -maxrate 3M \
     -bufsize 6M \
     -c:a aac \
     -b:a 128k \
     -movflags +faststart \
     streaming-optimized.mp4
   ```

## 快速檢查清單

- [ ] 檔案格式是 MP4 或 WebM？
- [ ] 視訊編碼是 H.264 (MP4) 或 VP8/VP9 (WebM)？
- [ ] 音訊編碼是 AAC (MP4) 或 Vorbis/Opus (WebM)？
- [ ] 大檔案是否有 faststart flag？
- [ ] 檔案是否損壞或不完整？