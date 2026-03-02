@echo off
setlocal
chcp 65001 > nul

:: ========================================================
::   LinguistFlow AI 一键启动助手 (One-Click Starter)
:: ========================================================

echo.
echo  [1/3] 检查运行环境...
echo.

:: 检查 .env
if not exist .env (
    echo [!] 未检测到 .env 配置文件，正在为你创建模板...
    echo GEMINI_API_KEY=your_key_here > .env
    echo PORT=3001 >> .env
    echo [OK] 已生成 .env 文件，请务必在其中填入你的 API Key。
) else (
    echo [OK] .env 配置文件已就绪。
)

:: 检查 node_modules
if not exist node_modules\ (
    echo [!] 正在安装必要的组件，这可能需要一两分钟...
    call npm install
    echo [OK] 组件安装完成。
) else (
    echo [OK] 组件依赖已就绪。
)

echo.
echo  [2/3] 正在启动全量服务 (Proxy + Vite)...
echo.

:: 启动主程序
:: 使用 npm start (调用 concurrently 同时启动后端代理和前端)
call npm start

echo.
echo  [3/3] 服务运行中...
echo.
echo [提示] 
echo - 若浏览器未自动打开，请手动访问: http://localhost:3000
echo - 后端代理端口已设为 3001
echo - 退出请直接关闭此窗口。
echo.

pause
