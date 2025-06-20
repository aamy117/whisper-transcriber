@echo off
REM 錄音筆 MP3 轉換腳本 (Windows 版本)
REM 用於修復錄音筆產生的非標準 MP3 檔案

setlocal enabledelayedexpansion

REM 檢查 ffmpeg 是否在 PATH 中
where ffmpeg >nul 2>nul
if %errorlevel% neq 0 (
    echo [錯誤] 未找到 ffmpeg
    echo.
    echo 請先安裝 ffmpeg：
    echo 1. 下載：https://www.gyan.dev/ffmpeg/builds/
    echo 2. 解壓縮到 C:\ffmpeg
    echo 3. 將 C:\ffmpeg\bin 加入系統 PATH
    echo.
    pause
    exit /b 1
)

REM 檢查參數
if "%~1"=="" goto :show_help
if "%~1"=="/?" goto :show_help
if "%~1"=="-h" goto :show_help
if "%~1"=="--help" goto :show_help

REM 設定變數
set INPUT=%~1
set OUTPUT=converted_%~n1.mp3
set BITRATE=128k
set SPLIT=0
set TO_WAV=0

REM 檢查檔案是否存在
if not exist "%INPUT%" (
    echo [錯誤] 檔案不存在：%INPUT%
    pause
    exit /b 1
)

echo ========================================
echo 錄音筆 MP3 轉換工具
echo ========================================
echo.
echo 分析檔案：%INPUT%
echo ----------------------------------------

REM 獲取檔案資訊
for /f "tokens=*" %%i in ('ffprobe -v error -show_entries format^=duration -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set DURATION=%%i
for /f "tokens=*" %%i in ('ffprobe -v error -show_entries format^=bit_rate -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set BITRATE_INFO=%%i
for /f "tokens=*" %%i in ('ffprobe -v error -select_streams a:0 -show_entries stream^=sample_rate -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set SAMPLE_RATE=%%i
for /f "tokens=*" %%i in ('ffprobe -v error -select_streams a:0 -show_entries stream^=channels -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set CHANNELS=%%i
for /f "tokens=*" %%i in ('ffprobe -v error -select_streams a:0 -show_entries stream^=codec_name -of default^=noprint_wrappers^=1:nokey^=1 "%INPUT%" 2^>nul') do set CODEC=%%i

REM 計算檔案大小 (MB)
for %%A in ("%INPUT%") do set FILESIZE=%%~zA
set /a FILESIZE_MB=%FILESIZE%/1024/1024

REM 顯示資訊
echo 編碼格式: %CODEC%
echo 取樣率: %SAMPLE_RATE% Hz
echo 聲道數: %CHANNELS%
if defined BITRATE_INFO (
    set /a BITRATE_KBPS=%BITRATE_INFO%/1000
    echo 位元率: !BITRATE_KBPS! kbps
)
echo 時長: %DURATION% 秒
echo 檔案大小: %FILESIZE_MB% MB
echo ----------------------------------------

REM 詢問使用者選擇
echo.
echo 請選擇轉換選項：
echo [1] 轉換為標準 MP3 (128kbps)
echo [2] 轉換為高品質 MP3 (192kbps)
echo [3] 轉換為 WAV 格式
echo [4] 轉換並分割大檔案
echo [5] 只顯示資訊
echo [Q] 退出
echo.
choice /c 12345Q /n /m "請選擇 (1-5, Q): "

if %errorlevel%==6 goto :end
if %errorlevel%==5 goto :end
if %errorlevel%==4 (
    set SPLIT=1
    goto :convert_mp3
)
if %errorlevel%==3 (
    set TO_WAV=1
    set OUTPUT=converted_%~n1.wav
    goto :convert_wav
)
if %errorlevel%==2 (
    set BITRATE=192k
    goto :convert_mp3
)
if %errorlevel%==1 goto :convert_mp3

:convert_mp3
echo.
echo [開始] 轉換為標準 MP3 格式 (%BITRATE%)...
ffmpeg -err_detect ignore_err -i "%INPUT%" -acodec mp3 -ar 44100 -ab %BITRATE% "%OUTPUT%" -y
if %errorlevel%==0 (
    echo [成功] 轉換完成！
    echo 輸出檔案：%OUTPUT%
    if %SPLIT%==1 if %FILESIZE_MB% GTR 25 goto :split_file
) else (
    echo [錯誤] 轉換失敗！
    pause
    exit /b 1
)
goto :show_tips

:convert_wav
echo.
echo [開始] 轉換為 WAV 格式...
ffmpeg -i "%INPUT%" -acodec pcm_s16le -ar 44100 "%OUTPUT%" -y
if %errorlevel%==0 (
    echo [成功] 轉換完成！
    echo 輸出檔案：%OUTPUT%
) else (
    echo [錯誤] 轉換失敗！
    pause
    exit /b 1
)
goto :show_tips

:split_file
echo.
echo [開始] 分割大檔案...
set SPLIT_DIR=%~n1_segments
if not exist "%SPLIT_DIR%" mkdir "%SPLIT_DIR%"

ffmpeg -i "%OUTPUT%" -f segment -segment_size 20M -c copy "%SPLIT_DIR%\segment_%%03d.mp3" -y
if %errorlevel%==0 (
    echo [成功] 分割完成！
    echo 分割檔案位於：%SPLIT_DIR%
    echo.
    echo 分割結果：
    dir /b "%SPLIT_DIR%"
) else (
    echo [錯誤] 分割失敗！
)
goto :show_tips

:show_tips
echo.
echo ========================================
echo 建議：
echo ========================================
echo 1. 未來錄音時，請在錄音筆設定中選擇：
echo    - 格式：MP3
echo    - 品質：高（128kbps 以上）
echo    - 取樣率：44.1kHz（如果有此選項）
echo.
echo 2. 如果轉換後仍有問題：
echo    - 嘗試轉換為 WAV 格式
echo    - 使用更高的位元率
echo ========================================
echo.
pause
goto :end

:show_help
echo 錄音筆 MP3 轉換工具
echo.
echo 使用方法：
echo   %~n0 ^<輸入檔案^>
echo.
echo 範例：
echo   %~n0 錄音.mp3
echo   %~n0 "我的錄音 001.mp3"
echo.
echo 功能：
echo   - 自動檢測錄音檔案問題
echo   - 轉換為標準 MP3 格式
echo   - 支援轉換為 WAV 格式
echo   - 自動分割大檔案
echo.
pause

:end
endlocal