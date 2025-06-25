@echo off
REM 代碼格式自動修復腳本 (Windows 版本)
REM 使用方法: fix-all-format.bat

echo ====================================
echo 代碼格式自動修復工具 (Windows)
echo ====================================
echo.

REM 檢查是否安裝了 Node.js
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [錯誤] 未找到 Node.js，請先安裝 Node.js
    echo 下載地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [資訊] 找到 Node.js: 
node --version
echo.

REM 檢查是否存在修復腳本
if not exist "auto-fix-code.js" (
    echo [錯誤] 找不到 auto-fix-code.js 腳本
    echo 請確保在正確的目錄中執行此批次檔
    pause
    exit /b 1
)

echo [開始] 執行代碼格式修復...
echo.

REM 執行 Node.js 腳本
node auto-fix-code.js %*

echo.
echo ====================================
echo 處理完成！
echo ====================================
echo.
echo 提示：
echo - 檢查 .backup 檔案確認修改正確
echo - 使用 git diff 查看所有變更
echo - 測試程式功能是否正常
echo.

pause