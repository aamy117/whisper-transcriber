#!/bin/bash

# 視訊播放器本地伺服器啟動腳本

PORT=8000

echo "啟動本地伺服器..."
echo "伺服器將在 http://localhost:${PORT} 運行"
echo ""

# 檢查 Python 3
if command -v python3 &> /dev/null; then
    echo "使用 Python 3 啟動伺服器..."
    python3 -m http.server ${PORT}
# 檢查 Python 2
elif command -v python &> /dev/null; then
    echo "使用 Python 2 啟動伺服器..."
    python -m SimpleHTTPServer ${PORT}
# 檢查 PHP
elif command -v php &> /dev/null; then
    echo "使用 PHP 啟動伺服器..."
    php -S localhost:${PORT}
else
    echo "錯誤：找不到 Python 或 PHP"
    echo "請安裝 Python 或 PHP，或使用 npx http-server"
    exit 1
fi