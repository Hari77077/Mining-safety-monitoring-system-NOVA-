@echo off
echo ============================================
echo   NOVA - Ollama Model Service Setup
echo ============================================
echo.

:: Check if Docker is running
docker info >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Docker is not running. Please start Docker Desktop first.
    pause
    exit /b 1
)

echo [1/3] Starting Ollama container...
docker-compose up -d ollama
if %errorlevel% neq 0 (
    echo [ERROR] Failed to start Ollama container.
    pause
    exit /b 1
)

echo [2/3] Waiting for Ollama to be ready...
:wait_loop
timeout /t 2 /nobreak >nul
docker exec ollama ollama list >nul 2>&1
if %errorlevel% neq 0 (
    echo        Still starting up...
    goto wait_loop
)
echo        Ollama is ready!

echo [3/3] Pulling Llama 3.2 model (this may take a while on first run)...
docker exec ollama ollama pull llama3.2
if %errorlevel% neq 0 (
    echo [ERROR] Failed to pull Llama 3.2 model.
    pause
    exit /b 1
)

echo.
echo ============================================
echo   SUCCESS! Llama 3.2 is ready to use.
echo   Ollama API running at http://localhost:11434
echo ============================================
echo.
echo You can now start the Go backend:
echo   go run main.go
echo.
pause
