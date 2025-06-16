@echo off
echo 🎬 創建測試視訊檔案...

REM 檢查 ffmpeg 是否安裝
where ffmpeg >nul 2>&1
if errorlevel 1 (
    echo ❌ 需要安裝 ffmpeg
    echo 請從 https://ffmpeg.org/download.html 下載並添加到 PATH
    pause
    exit /b 1
)

REM 創建測試檔案目錄
if not exist test-videos mkdir test-videos

REM 1. 創建小型測試視訊 (10秒, ~5MB)
echo 1. 創建小型測試視訊...
ffmpeg -f lavfi -i testsrc=duration=10:size=640x480:rate=30 ^
       -f lavfi -i sine=frequency=1000:duration=10 ^
       -c:v libx264 -c:a aac -movflags +faststart ^
       -y test-videos\test-small.mp4

REM 2. 創建中型測試視訊 (30秒, ~15MB)
echo 2. 創建中型測試視訊...
ffmpeg -f lavfi -i testsrc=duration=30:size=1280x720:rate=30 ^
       -f lavfi -i sine=frequency=1000:duration=30 ^
       -c:v libx264 -c:a aac -movflags +faststart ^
       -y test-videos\test-medium.mp4

REM 3. 創建大型測試視訊 (60秒, ~30MB)
echo 3. 創建大型測試視訊...
ffmpeg -f lavfi -i testsrc=duration=60:size=1920x1080:rate=30 ^
       -f lavfi -i sine=frequency=1000:duration=60 ^
       -c:v libx264 -c:a aac -movflags +faststart ^
       -y test-videos\test-large.mp4

REM 4. 創建 WebM 格式測試視訊
echo 4. 創建 WebM 測試視訊...
ffmpeg -f lavfi -i testsrc=duration=10:size=640x480:rate=30 ^
       -f lavfi -i sine=frequency=1000:duration=10 ^
       -c:v libvpx -c:a libvorbis ^
       -y test-videos\test-webm.webm

REM 5. 創建無 faststart 的 MP4（測試串流問題）
echo 5. 創建無 faststart 的視訊...
ffmpeg -f lavfi -i testsrc=duration=10:size=640x480:rate=30 ^
       -f lavfi -i sine=frequency=1000:duration=10 ^
       -c:v libx264 -c:a aac ^
       -y test-videos\test-no-faststart.mp4

echo ✅ 測試視訊創建完成！
echo.
echo 測試檔案列表：
dir test-videos
echo.
echo 使用方法：
echo 1. 在測試頁面選擇 test-videos 目錄中的檔案
echo 2. test-small.mp4 和 test-medium.mp4 應該可以正常播放
echo 3. test-no-faststart.mp4 可能會觸發串流載入問題
pause