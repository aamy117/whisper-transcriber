#!/bin/bash
# 修復 MCP Servers 設定腳本

echo "=== 修復 MCP Servers ==="
echo ""

# 顏色定義
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 檢查環境
echo -e "${YELLOW}1. 檢查環境...${NC}"
echo "Node.js: $(node --version)"
echo "npm: $(npm --version)"
echo ""

# 2. 移除所有現有的 user scope servers
echo -e "${YELLOW}2. 清理現有設定...${NC}"
claude mcp remove github -s user 2>/dev/null
claude mcp remove web-search -s user 2>/dev/null
claude mcp remove memory -s user 2>/dev/null
claude mcp remove puppeteer -s user 2>/dev/null
claude mcp remove thinking -s user 2>/dev/null
echo "清理完成"
echo ""

# 3. 重新設定所有 servers
echo -e "${YELLOW}3. 重新設定 MCP servers...${NC}"

# GitHub (with token)
if [ -n "$GITHUB_PERSONAL_ACCESS_TOKEN" ]; then
    echo -e "設定 ${GREEN}github${NC} (含 token)..."
    claude mcp add-json github -s user "{\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-github\"],\"env\":{\"GITHUB_PERSONAL_ACCESS_TOKEN\":\"$GITHUB_PERSONAL_ACCESS_TOKEN\"}}"
else
    echo -e "${RED}警告：GITHUB_PERSONAL_ACCESS_TOKEN 未設定${NC}"
fi

# Brave Search (with API key)
if [ -n "$BRAVE_API_KEY" ]; then
    echo -e "設定 ${GREEN}web-search${NC} (含 API key)..."
    claude mcp add-json web-search -s user "{\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-brave-search\"],\"env\":{\"BRAVE_API_KEY\":\"$BRAVE_API_KEY\"}}"
else
    echo -e "${RED}警告：BRAVE_API_KEY 未設定${NC}"
fi

# Memory (no special config needed)
echo -e "設定 ${GREEN}memory${NC}..."
claude mcp add-json memory -s user "{\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-memory\"]}"

# Puppeteer (警告需要 Chrome)
echo -e "設定 ${GREEN}puppeteer${NC}..."
claude mcp add-json puppeteer -s user "{\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-puppeteer\"]}"
echo -e "${YELLOW}注意：Puppeteer 需要安裝 Chrome/Chromium${NC}"

# Sequential Thinking
echo -e "設定 ${GREEN}thinking${NC}..."
claude mcp add-json thinking -s user "{\"command\":\"npx\",\"args\":[\"-y\",\"@modelcontextprotocol/server-sequential-thinking\"]}"

echo ""
echo -e "${YELLOW}4. 預先下載 packages (可選)...${NC}"
echo "這可能需要幾分鐘..."

# 預先下載所有 packages
npx -y @modelcontextprotocol/server-github --help > /dev/null 2>&1 &
npx -y @modelcontextprotocol/server-brave-search --help > /dev/null 2>&1 &
npx -y @modelcontextprotocol/server-memory --help > /dev/null 2>&1 &
npx -y @modelcontextprotocol/server-sequential-thinking --help > /dev/null 2>&1 &

# 等待所有背景任務
wait

echo ""
echo -e "${GREEN}5. 完成！${NC}"
echo ""
echo "當前設定的 MCP servers："
claude mcp list

echo ""
echo -e "${YELLOW}提示：${NC}"
echo "1. 請重新啟動 Claude Code 讓設定生效"
echo "2. 如果 puppeteer 仍然失敗，可能需要安裝 Chrome"
echo "3. 確保環境變數已設定："
echo "   - GITHUB_PERSONAL_ACCESS_TOKEN"
echo "   - BRAVE_API_KEY"