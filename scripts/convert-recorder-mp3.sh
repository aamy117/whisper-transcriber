#!/bin/bash
# 錄音筆 MP3 轉換腳本
# 用於修復錄音筆產生的非標準 MP3 檔案

# 顏色定義
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 檢查 ffmpeg 是否安裝
if ! command -v ffmpeg &> /dev/null; then
    echo -e "${RED}錯誤：未安裝 ffmpeg${NC}"
    echo "請先安裝 ffmpeg："
    echo "  Mac: brew install ffmpeg"
    echo "  Ubuntu: sudo apt install ffmpeg"
    echo "  Windows: 下載 https://www.gyan.dev/ffmpeg/builds/"
    exit 1
fi

# 顯示使用說明
show_help() {
    echo "錄音筆 MP3 轉換工具"
    echo ""
    echo "使用方法："
    echo "  $0 [選項] <輸入檔案>"
    echo ""
    echo "選項："
    echo "  -o <輸出檔案>  指定輸出檔名（預設：converted_原檔名）"
    echo "  -b <位元率>    設定位元率（預設：128k）"
    echo "  -s             分割大檔案（每 20MB）"
    echo "  -w             轉換為 WAV 格式"
    echo "  -i             顯示檔案資訊後退出"
    echo "  -h             顯示此說明"
    echo ""
    echo "範例："
    echo "  $0 錄音.mp3                    # 基本轉換"
    echo "  $0 -w 錄音.mp3                 # 轉換為 WAV"
    echo "  $0 -s 大檔案.mp3               # 轉換並分割"
    echo "  $0 -b 192k 錄音.mp3            # 使用 192kbps"
}

# 預設值
BITRATE="128k"
SPLIT=false
TO_WAV=false
INFO_ONLY=false
OUTPUT=""

# 解析參數
while getopts "o:b:swih" opt; do
    case $opt in
        o)
            OUTPUT="$OPTARG"
            ;;
        b)
            BITRATE="$OPTARG"
            ;;
        s)
            SPLIT=true
            ;;
        w)
            TO_WAV=true
            ;;
        i)
            INFO_ONLY=true
            ;;
        h)
            show_help
            exit 0
            ;;
        \?)
            echo "無效選項: -$OPTARG" >&2
            show_help
            exit 1
            ;;
    esac
done

shift $((OPTIND-1))

# 檢查輸入檔案
if [ $# -eq 0 ]; then
    echo -e "${RED}錯誤：請指定輸入檔案${NC}"
    show_help
    exit 1
fi

INPUT="$1"

if [ ! -f "$INPUT" ]; then
    echo -e "${RED}錯誤：檔案不存在：$INPUT${NC}"
    exit 1
fi

# 顯示檔案資訊
echo -e "${YELLOW}分析檔案：$INPUT${NC}"
echo "----------------------------------------"

# 使用 ffprobe 獲取詳細資訊
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null)
BITRATE_INFO=$(ffprobe -v error -show_entries format=bit_rate -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null)
SAMPLE_RATE=$(ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null)
CHANNELS=$(ffprobe -v error -select_streams a:0 -show_entries stream=channels -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null)
CODEC=$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "$INPUT" 2>/dev/null)

# 計算檔案大小
FILESIZE=$(stat -f%z "$INPUT" 2>/dev/null || stat -c%s "$INPUT" 2>/dev/null)
FILESIZE_MB=$((FILESIZE / 1024 / 1024))

# 顯示資訊
echo "編碼格式: $CODEC"
echo "取樣率: ${SAMPLE_RATE} Hz"
echo "聲道數: $CHANNELS"
echo "位元率: $((BITRATE_INFO / 1000)) kbps"
echo "時長: $(printf "%.2f" $DURATION) 秒"
echo "檔案大小: ${FILESIZE_MB} MB"
echo "----------------------------------------"

# 如果只是顯示資訊，則退出
if [ "$INFO_ONLY" = true ]; then
    exit 0
fi

# 檢查是否需要處理
NEEDS_CONVERSION=false
REASONS=""

if [ "$SAMPLE_RATE" -lt "22050" ]; then
    NEEDS_CONVERSION=true
    REASONS="${REASONS}\n  - 取樣率過低 (${SAMPLE_RATE}Hz < 22050Hz)"
fi

if [ "$BITRATE_INFO" -lt "64000" ]; then
    NEEDS_CONVERSION=true
    REASONS="${REASONS}\n  - 位元率過低 ($((BITRATE_INFO / 1000))kbps < 64kbps)"
fi

if [ "$CODEC" != "mp3" ] && [ "$TO_WAV" = false ]; then
    NEEDS_CONVERSION=true
    REASONS="${REASONS}\n  - 非標準 MP3 編碼 ($CODEC)"
fi

if [ "$FILESIZE_MB" -gt "25" ]; then
    echo -e "${YELLOW}警告：檔案大於 25MB，建議使用 -s 選項分割${NC}"
fi

# 設定輸出檔名
if [ -z "$OUTPUT" ]; then
    if [ "$TO_WAV" = true ]; then
        OUTPUT="converted_${INPUT%.mp3}.wav"
    else
        OUTPUT="converted_${INPUT}"
    fi
fi

# 執行轉換
echo -e "${GREEN}開始轉換...${NC}"

if [ "$TO_WAV" = true ]; then
    # 轉換為 WAV
    echo "轉換為 WAV 格式..."
    ffmpeg -i "$INPUT" -acodec pcm_s16le -ar 44100 "$OUTPUT" -y
else
    # 轉換為標準 MP3
    echo "轉換為標準 MP3 格式..."
    ffmpeg -err_detect ignore_err -i "$INPUT" -acodec mp3 -ar 44100 -ab "$BITRATE" "$OUTPUT" -y
fi

# 檢查轉換是否成功
if [ $? -eq 0 ]; then
    echo -e "${GREEN}轉換成功！${NC}"
    echo "輸出檔案：$OUTPUT"
    
    # 如果需要分割
    if [ "$SPLIT" = true ] && [ "$FILESIZE_MB" -gt "25" ]; then
        echo -e "${YELLOW}開始分割檔案...${NC}"
        
        # 建立輸出目錄
        SPLIT_DIR="${OUTPUT%.mp3}_segments"
        mkdir -p "$SPLIT_DIR"
        
        # 分割檔案（每 20MB）
        if [ "$TO_WAV" = true ]; then
            ffmpeg -i "$OUTPUT" -f segment -segment_size 20M -c copy "$SPLIT_DIR/segment_%03d.wav" -y
        else
            ffmpeg -i "$OUTPUT" -f segment -segment_size 20M -c copy "$SPLIT_DIR/segment_%03d.mp3" -y
        fi
        
        if [ $? -eq 0 ]; then
            echo -e "${GREEN}分割完成！${NC}"
            echo "分割檔案位於：$SPLIT_DIR"
            
            # 顯示分割結果
            echo ""
            echo "分割結果："
            ls -lh "$SPLIT_DIR"
        else
            echo -e "${RED}分割失敗！${NC}"
        fi
    fi
else
    echo -e "${RED}轉換失敗！${NC}"
    exit 1
fi

# 顯示建議
echo ""
echo -e "${YELLOW}建議：${NC}"
echo "1. 未來錄音時，請在錄音筆設定中選擇："
echo "   - 格式：MP3"
echo "   - 品質：高（128kbps 以上）"
echo "   - 取樣率：44.1kHz（如果有此選項）"
echo ""
echo "2. 如果轉換後仍有問題，請嘗試："
echo "   - 使用 -w 選項轉換為 WAV 格式"
echo "   - 使用 -b 192k 提高位元率"