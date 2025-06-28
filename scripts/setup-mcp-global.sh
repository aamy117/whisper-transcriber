#!/bin/bash
# 設定全域 MCP servers with API keys

echo "設定全域 MCP servers..."

# GitHub
claude mcp remove github -s user 2>/dev/null
claude mcp add-json github -s user '{"command":"npx","args":["-y","@modelcontextprotocol/server-github"],"env":{"GITHUB_PERSONAL_ACCESS_TOKEN":"'$GITHUB_PERSONAL_ACCESS_TOKEN'"}}'

# Brave Search
claude mcp remove web-search -s user 2>/dev/null
claude mcp add-json web-search -s user '{"command":"npx","args":["-y","@modelcontextprotocol/server-brave-search"],"env":{"BRAVE_API_KEY":"'$BRAVE_API_KEY'"}}'

# Memory
claude mcp remove memory -s user 2>/dev/null
claude mcp add memory -s user "npx -y @modelcontextprotocol/server-memory"

# Puppeteer
claude mcp remove puppeteer -s user 2>/dev/null
claude mcp add puppeteer -s user "npx -y @modelcontextprotocol/server-puppeteer"

# Sequential Thinking
claude mcp remove thinking -s user 2>/dev/null
claude mcp add thinking -s user "npx -y @modelcontextprotocol/server-sequential-thinking"

echo "完成！已設定以下全域 MCP servers："
claude mcp list

echo ""
echo "提示：請確保以下環境變數已設定："
echo "- GITHUB_PERSONAL_ACCESS_TOKEN"
echo "- BRAVE_API_KEY"