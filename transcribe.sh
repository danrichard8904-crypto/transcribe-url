#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

if [[ -x ".venv/bin/python" ]]; then
  PY=".venv/bin/python"
elif [[ -x "../supoclip/backend/.venv/bin/python" ]]; then
  PY="../supoclip/backend/.venv/bin/python"
else
  echo "No usable Python virtualenv found (need yt-dlp + openai-whisper installed)." >&2
  echo "Set one up with: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt" >&2
  exit 1
fi

exec "$PY" transcribe_url.py "$@"
