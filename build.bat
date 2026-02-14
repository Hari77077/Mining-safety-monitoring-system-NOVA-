@echo off
setlocal
echo ==========================================
echo   NOVA Mining Safety Monitor - Builder
echo ==========================================

REM Check for Go
where go >nul 2>nul
if %errorlevel% neq 0 (
    echo Error: Go is not installed or not in PATH.
    exit /b 1
)

echo.
echo [1/2] Downloading dependencies...
go mod download

echo.
echo [2/2] Building executable...
go build -o nova_monitor.exe main.go

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed.
    exit /b 1
)

echo.
echo [SUCCESS] Build complete! 
echo Run 'nova_monitor.exe' to start the server.
echo.
