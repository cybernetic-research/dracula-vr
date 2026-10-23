#!/bin/sh
# Double-click to play (macOS). Starts the game server and opens the game in your browser.
# The media folder is the one tools/prepare.sh made from your disc; set DRACULA_MEDIA to use another one.
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  for d in /opt/homebrew/bin /usr/local/bin; do [ -x "$d/node" ] && PATH="$d:$PATH"; done
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is needed: install it from https://nodejs.org (or: brew install node), then double-click this again."
  read -r -p "Press Return to close." _; exit 1
fi
MEDIA="${DRACULA_MEDIA:-}"
for d in "$HOME/Movies/dracula-vr-media" "$HOME/Videos/dracula-vr-media"; do
  [ -z "$MEDIA" ] && [ -f "$d/game.json" ] && MEDIA="$d"
done
if [ -z "$MEDIA" ] || [ ! -f "$MEDIA/game.json" ]; then
  echo "No prepared media folder found (looked in ~/Movies/dracula-vr-media)."
  echo "Prepare it once from your own disc:  tools/prepare.sh /path/to/Dracula_Unleashed.bin"
  read -r -p "Press Return to close." _; exit 1
fi
echo "Dracula Unleashed VR. Close this window (or press Ctrl+C) to stop the game server."
echo
# a Quest plugged in by USB (developer mode, adb installed): it reaches this computer over the cable, no network needed
if command -v adb >/dev/null 2>&1 && [ "$(adb get-state 2>/dev/null)" = device ] && adb reverse tcp:8080 tcp:8080 >/dev/null 2>&1; then
  echo "Quest connected by USB: open  http://localhost:8080  in the Quest Browser (works with no Wi-Fi)."
  echo
fi
exec node tools/serve.mjs --https --open --media "$MEDIA"
