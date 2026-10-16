#!/bin/sh
# Prepares everything the game needs from YOUR OWN Dracula Unleashed disc (DOS CD image), once, on this computer.
# Nothing it makes goes into the repository or anywhere online.
#
#   tools/prepare.sh /path/to/Dracula_Unleashed.bin [media folder, default ~/Movies/dracula-vr-media]
#
# Makes, in the media folder: game.json (rules, texts, map data), img/loc*.jpg (the 13 street views, upscaled),
# sound/s*.m4a (the sound bank), video/*.mp4 (every scene, upscaled 4x with Real-ESRGAN x4plus on the Neural Engine;
# about 3 hours on an Apple Silicon Mac) and video/*.3d.mp4 (the same with a depth map, for 3D; about 4 hours, on the
# GPU: run it alongside, see NOTES.md).
# Re-running skips videos that already exist. Then: node tools/serve.mjs --https --media <media folder>
set -e
DISC=${1:?usage: tools/prepare.sh <disc image .bin> [media folder]}
MEDIA=${2:-$HOME/Movies/dracula-vr-media}
HERE=$(cd "$(dirname "$0")" && pwd)
VENV="$MEDIA/venv"
mkdir -p "$MEDIA/models"

if [ ! -x "$VENV/bin/python" ]; then
	echo "Creating a Python environment in $VENV (torch, numpy, pillow, capstone, transformers, coremltools)..."
	python3 -m venv "$VENV"
	"$VENV/bin/pip" install -q --upgrade pip
	"$VENV/bin/pip" install -q torch numpy pillow capstone transformers coremltools
fi
MODEL="$MEDIA/models/RealESRGAN_x4plus.pth"
if [ ! -f "$MODEL" ]; then
	echo "Downloading the Real-ESRGAN x4plus weights (BSD-3-Clause, xinntao/Real-ESRGAN)..."
	curl -L -o "$MODEL" https://github.com/xinntao/Real-ESRGAN/releases/download/v0.1.0/RealESRGAN_x4plus.pth
fi
command -v ffmpeg >/dev/null || { echo "ffmpeg is needed (brew install ffmpeg)"; exit 1; }

"$VENV/bin/python" -I "$HERE/extract_game.py" "$DISC" "$MEDIA"
"$VENV/bin/python" -I "$HERE/upscale.py" "$DISC" "$MEDIA" PICTURES
"$VENV/bin/python" -I "$HERE/extract_sounds.py" "$DISC" "$MEDIA"
"$VENV/bin/python" -I "$HERE/upscale.py" "$DISC" "$MEDIA"
"$VENV/bin/python" -I "$HERE/depth3d.py" "$MEDIA"   # 3D versions (Depth Anything V2 Small, downloaded once)
node "$HERE/solve.mjs" "$MEDIA/game.json"
echo "Done. Start the game with: node tools/serve.mjs --https --media \"$MEDIA\""
