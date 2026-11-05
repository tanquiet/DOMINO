#!/usr/bin/env bash
cd "$(dirname "$0")"
echo "Starting DOMINO on http://localhost:8000  (Ctrl+C to stop)"
( sleep 2; (open http://localhost:8000 2>/dev/null || xdg-open http://localhost:8000 2>/dev/null) ) &
python3 -m uvicorn api.main:app --port 8000
