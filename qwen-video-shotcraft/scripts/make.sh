#!/usr/bin/env bash
# Render content.json into a 1920x1080 explainer MP4. Layout is automatic (scripts/layout.cjs);
# content problems exit 4 with one "FIX: ..." line.
set -euo pipefail
if [[ $# -ne 2 ]]; then echo 'usage: scripts/make.sh <content.json> <out-dir>' >&2; exit 2; fi
skill=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
content=$(realpath "$1"); out=$(realpath -m "$2")
[[ -f "$content" ]] || { echo "FIX: content JSON missing: $1" >&2; exit 2; }
[[ -x "$skill/node_modules/.bin/remotion" ]] || { echo 'run scripts/setup.sh first' >&2; exit 3; }
[[ -n $(fc-list 'DejaVu Sans' family) ]] || { echo 'DejaVu Sans font missing (install fonts-dejavu-core)' >&2; exit 3; }
mkdir -p "$out/src" "$out/exports"
node "$skill/scripts/layout.cjs" "$content" "$out/src/layout.json"
cp "$skill/templates/video.tsx" "$out/src/video.tsx"
printf "import {registerRoot} from 'remotion';\nimport {Root} from './video';\nregisterRoot(Root);\n" > "$out/src/index.ts"
ln -sfn "$skill/node_modules" "$out/node_modules"
video="$out/exports/video.mp4"
(cd "$out" && env -u DISPLAY -u WAYLAND_DISPLAY "$skill/node_modules/.bin/remotion" render src/index.ts Explainer exports/video.mp4 --log=error)
ffmpeg -v error -i "$video" -f null -
times=$(node -e 'const l=require(process.argv[1]); console.log(l.posterSec, ...l.sheetSec)' "$out/src/layout.json")
read -r poster_s sheet_s <<<"$times"
ffmpeg -y -v error -ss "$poster_s" -i "$video" -frames:v 1 "$out/poster.png"
# Phone check: every slide (title, each scene, system map, closing) at 640 px wide in one image.
rm -f "$out"/.sheet-*.png; i=0
for t in $sheet_s; do i=$((i+1)); ffmpeg -y -v error -ss "$t" -i "$video" -frames:v 1 -vf scale=640:-1 "$out/.sheet-$i.png"; done
ffmpeg -y -v error -i "$out/.sheet-%d.png" -vf "tile=2x$(( (i + 1) / 2 )):padding=8:color=white" -frames:v 1 "$out/phone-sheet.png"
rm -f "$out"/.sheet-*.png
probe=$(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,codec_name -show_entries format=duration -of json "$video")
PROBE="$probe" OUT="$out" node -e 'const fs=require("fs"),p=JSON.parse(process.env.PROBE),s=p.streams[0],f=p.format,o=process.env.OUT; if(!s||s.width!==1920||s.height!==1080||!(Number(f.duration)>10)||fs.statSync(o+"/exports/video.mp4").size<10000){console.error("render produced an invalid video: rerun make.sh");process.exit(1)} console.log(JSON.stringify({status:"rendered",path:o+"/exports/video.mp4",poster:o+"/poster.png",phone_sheet:o+"/phone-sheet.png",width:s.width,height:s.height,fps:s.r_frame_rate,codec:s.codec_name,duration_s:Number(f.duration)}))'
