<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/18ehn3Gjpyo05awaMIVIn3jY2qkSjOdtt

## Run Locally

**Prerequisites:**  Node.js


1. **一键启动 (Windows):**  
   双击根目录下的 `启动助手.bat` 即可自动完成安装依赖、配置环境与同时开启前后端服务。

2. **Run Locally (Manual):**
   - Install dependencies: `npm install`
   - Set your `GEMINI_API_KEY` in `.env`. (端口默认设为 3001 为后端代理，3000 为前端)。
   - Run the app (Proxy + Frontend): `npm start`
   - Only Frontend: `npm run dev`
   - Only AI Proxy: `npm run proxy`
