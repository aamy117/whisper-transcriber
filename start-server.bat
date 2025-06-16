@echo off
chcp 65001 >nul
echo Starting local server...
echo.

REM Try Python 3
python --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Python to start server...
    echo Server will run at http://localhost:8000
    echo Press Ctrl+C to stop server
    echo.
    python -m http.server 8000
    goto end
)

REM Try Python 2
python2 --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using Python 2 to start server...
    echo Server will run at http://localhost:8000
    echo Press Ctrl+C to stop server
    echo.
    python2 -m SimpleHTTPServer 8000
    goto end
)

REM Try PHP
php --version >nul 2>&1
if %errorlevel% == 0 (
    echo Using PHP to start server...
    echo Server will run at http://localhost:8000
    echo Press Ctrl+C to stop server
    echo.
    php -S localhost:8000
    goto end
)

REM If none found, show error
echo ERROR: Python or PHP not found
echo.
echo Please install one of the following:
echo 1. Python: https://www.python.org/downloads/
echo 2. PHP: https://www.php.net/downloads
echo.
echo Or use Node.js:
echo   npm install -g http-server
echo   http-server -p 8000
echo.
pause

:end