#!/bin/sh
# Packs the media folder you prepared from your own disc into zips to copy to a headset (then "Add media" on the
# game's page there). Only what the game reads goes in: game.json, img/, sound/, video/. No compression (-0): the
# videos and sounds are already compressed, and a stored zip is read fastest in the browser.
#
# The media is split into parts of about 1 GB, because one multi-gigabyte file tends to fail near the end when copied
# to a Quest (SideQuest, adb, USB). Each zip carries a marker (parts/part-<i>-of-<n>), so the page can tell which
# parts are still missing. Add them all, in any order, one at a time or together.
#
#   tools/pack-media.sh [media-folder] [--flat] [--size <MB>]
#     media-folder   default ~/Movies/dracula-vr-media (or $DRACULA_MEDIA)
#     --flat         leave out the 3D versions of the scenes (about half the size; the game plays them flat)
#     --size <MB>    size of each part (default 1000)
#
# Writes dracula-media-<i>-of-<n>.zip in the current folder. Never share or upload them: they are the game's own
# footage, from your disc.
set -e
media="${DRACULA_MEDIA:-$HOME/Movies/dracula-vr-media}"
flat=
size=1000
while [ $# -gt 0 ]; do
	case "$1" in
	--flat) flat=1 ;;
	--size) size="$2"; shift ;;
	*) media="$1" ;;
	esac
	shift
done
[ -f "$media/game.json" ] || { echo "No game.json in $media: prepare the media first (tools/prepare.sh)." >&2; exit 1; }
outdir="$PWD"
limit=$((size * 1000000))
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cd "$media"

# every file, game.json first (it lands in part 1)
echo game.json > "$tmp/all"
if [ -n "$flat" ]; then
	find img sound video -type f ! -name '.DS_Store' ! -name '*.3d.mp4' | sort >> "$tmp/all"
else
	find img sound video -type f ! -name '.DS_Store' | sort >> "$tmp/all"
fi

# share them out into parts of at most $limit bytes (a file bigger than that gets a part of its own)
n=1
used=0
: > "$tmp/list1"
while IFS= read -r f; do
	s=$(wc -c < "$f" | tr -d ' ')
	if [ "$used" -gt 0 ] && [ $((used + s)) -gt "$limit" ]; then
		n=$((n + 1))
		used=0
		: > "$tmp/list$n"
	fi
	echo "$f" >> "$tmp/list$n"
	used=$((used + s))
done < "$tmp/all"

rm -f "$outdir"/dracula-media-*-of-*.zip
mkdir -p "$tmp/parts"
i=1
while [ "$i" -le "$n" ]; do
	out="$outdir/dracula-media-$i-of-$n.zip"
	echo "part $i of $n" > "$tmp/parts/part-$i-of-$n"
	(cd "$tmp" && zip -0 -q "$out" "parts/part-$i-of-$n")
	zip -0 -q "$out" -@ < "$tmp/list$i"
	echo "Wrote $out ($(du -h "$out" | cut -f1))."
	i=$((i + 1))
done
echo
echo "Copy all $n zips to the headset (Quest: its Download folder), open the game's page there, press \"Add media\""
echo "and choose them (all at once, or one at a time: the page says which parts are still missing)."
