#!/usr/bin/env bash
set -euo pipefail
skill=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
command -v node >/dev/null && command -v npm >/dev/null || { echo 'Node.js and npm are required' >&2; exit 1; }
command -v ffmpeg >/dev/null && command -v ffprobe >/dev/null || { echo 'ffmpeg and ffprobe are required' >&2; exit 1; }
command -v fc-list >/dev/null && fc-list 'DejaVu Sans' family | grep -q . || { echo 'DejaVu Sans font missing (install fonts-dejavu-core)' >&2; exit 1; }
npm install --prefix "$skill" --no-audit --no-fund
