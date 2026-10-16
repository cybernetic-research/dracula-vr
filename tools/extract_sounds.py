#!/usr/bin/env python3
"""The game's sound bank (SOUNDS.DTA: u32 rate, u32 0, 8-bit unsigned mono) from your own disc, as sound/s<id>.m4a in
the media folder (ids as the program asks for them). Optionally also as WAV into another folder (for checking).
usage: extract_sounds.py <disc.bin> <media_dir> [wav_dir]"""
import os, struct, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dta, iso

disc, media = sys.argv[1], sys.argv[2]
wavdir = sys.argv[3] if len(sys.argv) > 3 else None
items, ids = dta.read_bytes(iso.Image(disc).read('SOUNDS.DTA'))
out = os.path.join(media, 'sound'); os.makedirs(out, exist_ok=True)
if wavdir: os.makedirs(wavdir, exist_ok=True)
for sid, i in enumerate(ids):
    if i == 0xffff: continue
    b = items[i]; rate = struct.unpack('>I', b[:4])[0]; pcm = b[8:]
    dst = os.path.join(out, f's{sid}.m4a')
    with tempfile.NamedTemporaryFile(suffix='.u8') as t:
        t.write(pcm); t.flush()
        if not os.path.exists(dst):
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'u8', '-ar', str(rate), '-ac', '1', '-i', t.name, '-c:a', 'aac', '-b:a', '64k', dst], check=True)
        if wavdir:
            subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'u8', '-ar', str(rate), '-ac', '1', '-i', t.name, '-ar', '16000', os.path.join(wavdir, f's{sid}.wav')], check=True)
print(len(ids), 'sounds')
