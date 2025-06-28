#!/bin/bash
# MCP Servers 診斷腳本

echo "=== MCP Servers 診斷 ==="
echo ""

# 檢查 Node.js 版本
echo "Node.js 版本："
node --version
echo ""

# 檢查 npm 版本
echo "npm 版本："
npm --version
echo ""

# 測試每個 server
echo "測試 MCP servers..."
echo ""

# Memory
echo "1. 測試 Memory Server："
timeout 5 npx -y @modelcontextprotocol/server-memory --help 2>&1 | head -5
echo ""

# Puppeteer
echo "2. 測試 Puppeteer Server："
timeout 5 npx -y @modelcontextprotocol/server-puppeteer --help 2>&1 | head -5
echo ""

# Thinking
echo "3. 測試 Thinking Server："
timeout 5 npx -y @modelcontextprotocol/server-sequential-thinking --help 2>&1 | head -5
echo ""

# 檢查 npm cache
echo "npm 快取位置："
npm config get cache
echo ""

# 列出當前 MCP 設定
echo "當前 MCP servers 設定："
claude mcp list
echo ""

echo "提示："
echo "1. 如果看到 timeout，可能是首次下載需要較長時間"
echo "2. 可以嘗試手動執行: npx -y @modelcontextprotocol/server-[name]"
echo "3. 確保網路連線正常"