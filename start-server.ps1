# PowerShell script to start local server

Write-Host "Starting local server..." -ForegroundColor Green
Write-Host ""

# Check if Python is installed
try {
    $pythonVersion = python --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Using Python to start server..." -ForegroundColor Yellow
        Write-Host "Server will run at http://localhost:8000" -ForegroundColor Cyan
        Write-Host "Press Ctrl+C to stop server" -ForegroundColor Gray
        Write-Host ""
        python -m http.server 8000
        exit
    }
}
catch { }

# Check if Node.js is installed
try {
    $nodeVersion = node --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Node.js detected. Checking for http-server..." -ForegroundColor Yellow
        
        # Check if http-server is installed
        $httpServerInstalled = npm list -g http-server 2>&1
        if ($httpServerInstalled -like "*http-server*") {
            Write-Host "Using http-server..." -ForegroundColor Yellow
            Write-Host "Server will run at http://localhost:8000" -ForegroundColor Cyan
            Write-Host "Press Ctrl+C to stop server" -ForegroundColor Gray
            Write-Host ""
            http-server -p 8000
            exit
        }
        else {
            Write-Host "http-server not installed. Installing..." -ForegroundColor Yellow
            npm install -g http-server
            Write-Host "Starting server..." -ForegroundColor Yellow
            http-server -p 8000
            exit
        }
    }
}
catch { }

# If nothing is installed, show instructions
Write-Host "ERROR: No suitable server found!" -ForegroundColor Red
Write-Host ""
Write-Host "Please install one of the following:" -ForegroundColor Yellow
Write-Host "1. Python: https://www.python.org/downloads/" -ForegroundColor White
Write-Host "   - Download and install Python 3.x"
Write-Host "   - Make sure to check 'Add Python to PATH' during installation"
Write-Host ""
Write-Host "2. Node.js: https://nodejs.org/" -ForegroundColor White
Write-Host "   - Download and install Node.js LTS version"
Write-Host ""
Write-Host "After installation, run this script again." -ForegroundColor Green
Write-Host ""
Write-Host "Press any key to exit..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")