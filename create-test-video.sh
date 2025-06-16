#!/bin/bash

# 創建測試視訊檔案的腳本

echo "🎬 創建測試視訊檔案..."

# 檢查 ffmpeg 是否安裝
if ! command -v ffmpeg &> /dev/null; then
    echo "❌ 需要安裝 ffmpeg"
    echo "請執行: sudo apt-get install ffmpeg (Linux) 或 brew install ffmpeg (macOS)"
    exit 1
fi

# 創建測試檔案目錄
mkdir -p test-videos

# 1. 創建小型測試視訊 (10秒, ~5MB)
echo "1. 創建小型測試視訊..."
ffmpeg -f lavfi -i testsrc=duration=10:size=640x480:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=10 \
       -c:v libx264 -c:a aac -movflags +faststart \
       -y test-videos/test-small.mp4

# 2. 創建中型測試視訊 (30秒, ~15MB)
echo "2. 創建中型測試視訊..."
ffmpeg -f lavfi -i testsrc=duration=30:size=1280x720:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=30 \
       -c:v libx264 -c:a aac -movflags +faststart \
       -y test-videos/test-medium.mp4

# 3. 創建大型測試視訊 (60秒, ~30MB)
echo "3. 創建大型測試視訊..."
ffmpeg -f lavfi -i testsrc=duration=60:size=1920x1080:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=60 \
       -c:v libx264 -c:a aac -movflags +faststart \
       -y test-videos/test-large.mp4

# 4. 創建 WebM 格式測試視訊
echo "4. 創建 WebM 測試視訊..."
ffmpeg -f lavfi -i testsrc=duration=10:size=640x480:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=10 \
       -c:v libvpx -c:a libvorbis \
       -y test-videos/test-webm.webm

# 5. 創建無 faststart 的 MP4（測試串流問題）
echo "5. 創建無 faststart 的視訊..."
ffmpeg -f lavfi -i testsrc=duration=10:size=640x480:rate=30 \
       -f lavfi -i sine=frequency=1000:duration=10 \
       -c:v libx264 -c:a aac \
       -y test-videos/test-no-faststart.mp4

echo "✅ 測試視訊創建完成！"
echo ""
echo "測試檔案列表："
ls -lh test-videos/
echo ""
echo "使用方法："
echo "1. 在測試頁面選擇 test-videos/ 目錄中的檔案"
echo "2. test-small.mp4 和 test-medium.mp4 應該可以正常播放"
echo "3. test-no-faststart.mp4 可能會觸發串流載入問題"