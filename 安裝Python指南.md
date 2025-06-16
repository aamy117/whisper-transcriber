# 安裝 Python 指南（Windows）

你需要安裝 Python 才能啟動本地伺服器。以下是簡單的安裝步驟：

## 步驟 1：下載 Python

1. 前往 Python 官網：https://www.python.org/downloads/
2. 點擊黃色的 "Download Python 3.x.x" 按鈕（會自動偵測 Windows 版本）

## 步驟 2：安裝 Python

1. 執行下載的安裝檔（例如：python-3.12.0-amd64.exe）

2. **重要！** 在安裝畫面底部，勾選：
   - ✅ **Add Python to PATH**（這很重要！）

3. 點擊 "Install Now"

4. 等待安裝完成

## 步驟 3：驗證安裝

1. 開啟新的命令提示字元（Win+R，輸入 cmd）
2. 輸入以下命令：
   ```
   python --version
   ```
3. 如果顯示版本號（如 Python 3.12.0），表示安裝成功

## 步驟 4：啟動伺服器

1. 在命令提示字元中，進入專案目錄：
   ```
   cd C:\codeuser\whisper-transcriber
   ```

2. 啟動伺服器：
   ```
   python -m http.server 8000
   ```

3. 開啟瀏覽器，訪問：http://localhost:8000/video.html

## 替代方案：使用 PowerShell

如果你不想安裝 Python，可以試試 PowerShell 腳本：

1. 在專案資料夾按右鍵
2. 選擇「在終端機中開啟」或「Open in Terminal」
3. 輸入：
   ```
   .\start-server.ps1
   ```

如果出現執行政策錯誤，先執行：
```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

## 最簡單的替代方案

使用線上 IDE 或程式碼編輯器：

1. **Visual Studio Code**
   - 安裝 VS Code
   - 安裝 "Live Server" 擴充功能
   - 開啟 video.html，按右鍵選擇 "Open with Live Server"

2. **WebStorm / PhpStorm**
   - 這些 IDE 內建網頁伺服器
   - 直接在 IDE 中開啟並執行 HTML 檔案

## 常見問題

**Q: 安裝 Python 後仍然顯示找不到？**
A: 可能需要重新啟動電腦，或確保安裝時有勾選 "Add Python to PATH"

**Q: 可以用其他埠號嗎？**
A: 可以，例如使用 8080：
```
python -m http.server 8080
```
然後訪問：http://localhost:8080/video.html

**Q: 如何停止伺服器？**
A: 按 Ctrl+C