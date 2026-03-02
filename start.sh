#!/bin/bash

# ========================================================
#   LinguistFlow AI One-Click Starter (Bash)
# ========================================================

echo "--- [1/3] Checking environment ---"

# Check .env
if [ ! -f .env ]; then
    echo "[!] .env not found, creating a default template..."
    echo "GEMINI_API_KEY=your_key_here" > .env
    echo "PORT=3001" >> .env
    echo "[OK] .env file created. Please fill in your API Key."
else
    echo "[OK] .env file ready."
fi

# Check node_modules
if [ ! -d "node_modules" ]; then
    echo "[!] Installing dependencies, this may take a moment..."
    npm install
    echo "[OK] Dependencies installed."
else
    echo "[OK] Dependencies ready."
fi

echo ""
echo "--- [2/3] Starting all services ---"
echo ""

# Run npm start
npm start

echo ""
echo "--- [3/3] Running... ---"
echo ""
echo "[INFO] If your browser did not open automatically, visit: http://localhost:3000"
echo "[INFO] Backend Proxy is on port 3001"
echo ""
