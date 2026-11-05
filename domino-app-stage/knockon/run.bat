@echo off
cd /d "%~dp0"
echo Starting DOMINO on http://localhost:8000  (close this window to stop)
start "" http://localhost:8000
python -m uvicorn api.main:app --port 8000
pause
