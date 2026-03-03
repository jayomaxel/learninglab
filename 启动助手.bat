@echo off
setlocal
chcp 65001 > nul

REM ========================================================
REM   LinguistFlow AI One-Click Starter (Windows)
REM ========================================================

echo.
echo [1/3] Checking environment...
echo.

if not exist .env (
    echo [!] .env not found, creating a template...
    echo GEMINI_API_KEY=your_key_here > .env
    echo PROXY_AUTH_TOKEN=change_me >> .env
    echo RATE_LIMIT_WINDOW_MS=60000 >> .env
    echo RATE_LIMIT_MAX_REQUESTS=60 >> .env
    echo PORT=3001 >> .env
    echo [OK] .env created. Please update GEMINI_API_KEY and PROXY_AUTH_TOKEN.
) else (
    echo [OK] .env already exists.
)

if not exist node_modules\ (
    echo [!] Installing dependencies...
    call npm install
    echo [OK] Dependencies installed.
) else (
    echo [OK] Dependencies ready.
)

echo.
echo [2/3] Starting services (Proxy + Vite)...
echo.
call npm start

echo.
echo [3/3] Running...
echo [INFO] Frontend: http://localhost:3000
echo [INFO] Proxy: http://localhost:3001
echo.
pause
