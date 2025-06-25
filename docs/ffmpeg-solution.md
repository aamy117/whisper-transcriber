# 使用 FFmpeg 處理錄音筆檔案

## 為什麼使用 FFmpeg？

FFmpeg 是強大的音視訊處理工具，可以：
- 轉換幾乎所有音訊格式
- 標準化編碼參數
- 分割大檔案
- 修復有問題的音訊檔案

## 安裝 FFmpeg

### Windows
1. 下載：https://www.gyan.dev/ffmpeg/builds/
2. 解壓縮到 `C:\ffmpeg`
3. 添加到系統 PATH

### Mac
```bash
brew install ffmpeg
```

### Linux
```bash
sudo apt update
sudo apt install ffmpeg
```

## 錄音筆 MP3 轉換方案

### 1. 基本轉換（推薦）
將錄音筆 MP3 轉換為標準格式：

```bash
ffmpeg -i 錄音檔案.mp3 -acodec mp3 -ar 44100 -ab 128k 輸出檔案.mp3
```

參數說明：
- `-i`: 輸入檔案
- `-acodec mp3`: 使用 MP3 編碼器
- `-ar 44100`: 設定取樣率為 44.1kHz
- `-ab 128k`: 設定位元率為 128kbps

### 2. 修復並轉換
如果檔案有錯誤，使用修復模式：

```bash
ffmpeg -err_detect ignore_err -i 錄音檔案.mp3 -c:a mp3 -ar 44100 -ab 128k 輸出檔案.mp3
```

### 3. 轉換為 WAV（最佳相容性）
```bash
ffmpeg -i 錄音檔案.mp3 -acodec pcm_s16le -ar 44100 輸出檔案.wav
```

## 大檔案分割方案

### 方案一：按時間分割
每 30 分鐘分割一次：

```bash
ffmpeg -i 輸入檔案.mp3 -f segment -segment_time 1800 -c copy 輸出_%03d.mp3
```

### 方案二：按檔案大小分割
每 20MB 分割一次：

```bash
ffmpeg -i 輸入檔案.mp3 -f segment -segment_size 20M -c copy 輸出_%03d.mp3
```

### 方案三：智能分割（在靜音處）
使用靜音檢測分割：

```bash
ffmpeg -i 輸入檔案.mp3 -af silencedetect=n=-30dB:d=0.5 -f null - 2>&1 | grep silence_end
```

## 批次處理腳本

### Windows 批次檔 (convert_all.bat)
```batch
@echo off
mkdir converted
for %%f in (*.mp3) do (
    echo 處理: %%f
    ffmpeg -i "%%f" -acodec mp3 -ar 44100 -ab 128k "converted\%%f"
)
echo 完成！
pause
```

### Mac/Linux Shell 腳本 (convert_all.sh)
```bash
#!/bin/bash
mkdir -p converted
for file in *.mp3; do
    echo "處理: $file"
    ffmpeg -i "$file" -acodec mp3 -ar 44100 -ab 128k "converted/$file"
done
echo "完成！"
```

## 整合工作流程

### 步驟 1：診斷問題
使用 FFmpeg 檢查檔案資訊：
```bash
ffmpeg -i 錄音檔案.mp3
```

### 步驟 2：轉換格式
根據診斷結果選擇適當的轉換參數

### 步驟 3：分割檔案（如需要）
如果檔案超過 25MB，使用分割命令

### 步驟 4：上傳至 Whisper
使用轉換後的檔案進行轉譯

## 常用 FFmpeg 命令

### 查看檔案資訊
```bash
ffprobe -v quiet -print_format json -show_format -show_streams 檔案.mp3
```

### 提取音訊片段
```bash
# 從第 30 秒開始，提取 60 秒
ffmpeg -ss 00:00:30 -i 輸入.mp3 -t 60 -c copy 輸出.mp3
```

### 合併多個檔案
```bash
# 建立檔案列表
echo "file '檔案1.mp3'" > list.txt
echo "file '檔案2.mp3'" >> list.txt

# 合併
ffmpeg -f concat -safe 0 -i list.txt -c copy 合併檔案.mp3
```

### 降噪處理
```bash
ffmpeg -i 輸入.mp3 -af "highpass=f=200, lowpass=f=3000" 輸出.mp3
```

## 錄音筆特定問題解決

### Sony 錄音筆
```bash
# Sony 錄音筆常用 LPEC 格式，需要特殊處理
ffmpeg -i 錄音.mp3 -acodec libmp3lame -ar 44100 -ab 128k 輸出.mp3
```

### Olympus 錄音筆
```bash
# Olympus 可能使用 WMA 格式
ffmpeg -i 錄音.wma -acodec mp3 -ar 44100 -ab 128k 輸出.mp3
```

### 低取樣率錄音
```bash
# 8kHz 或 16kHz 錄音提升品質
ffmpeg -i 錄音.mp3 -af "aresample=44100" -acodec mp3 -ab 128k 輸出.mp3
```

## 進階技巧

### 1. 自動檢測並修復
```bash
#!/bin/bash
for file in *.mp3; do
    # 檢查取樣率
    sr=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "$file")
    
    if [ "$sr" -lt "22050" ]; then
        echo "修復低取樣率檔案: $file (${sr}Hz)"
        ffmpeg -i "$file" -ar 44100 -ab 128k "fixed_$file"
    fi
done
```

### 2. 保持 metadata
```bash
ffmpeg -i 輸入.mp3 -map_metadata 0 -c:a mp3 -ar 44100 -ab 128k 輸出.mp3
```

### 3. 多執行緒處理
```bash
ffmpeg -threads 4 -i 輸入.mp3 -acodec mp3 -ar 44100 -ab 128k 輸出.mp3
```

## 注意事項

1. **備份原始檔案** - 轉換前務必保留原檔
2. **測試小片段** - 先用小檔案測試參數
3. **檢查輸出** - 確認轉換後的品質
4. **批次處理** - 大量檔案使用腳本自動化

## 推薦工作流程

1. **錄音時**：設定錄音筆為 MP3 128kbps 以上
2. **傳輸後**：使用 FFmpeg 標準化格式
3. **大檔案**：先轉換再分割
4. **上傳前**：使用測試工具確認相容性