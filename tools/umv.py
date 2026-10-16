#!/usr/bin/env python3
"""Dracula Unleashed .UMV decoder (format per wiki.multimedia.cx/index.php?title=UMV).
usage: umv.py in.UMV out_prefix   -> out_prefix.rgb (raw rgb24 frames), out_prefix.u8 (audio), prints w h fps rate
As a module: decode(bytes) -> dict(w, h, fps, rate, frames=[rgb24 bytes], audio=bytes of 8-bit unsigned mono)"""
import struct, sys
try:
    import numpy as np
except ImportError:
    np = None


def decode(b):
    s = {'W': 0, 'H': 0, 'fps': 15, 'rate': 22050, 'per': 1470}
    pal = [(0, 0, 0)] * 256
    pix = bytearray()
    frames = []
    audio = bytearray()

    def set_pal(data):
        start, count = struct.unpack('>II', data[:8])
        count = 256 if count == 255 else count
        for i in range(count):
            if start + i < 256 and 8 + i * 3 + 3 <= len(data):
                pal[start + i] = tuple(data[8 + i * 3: 11 + i * 3])

    def emit(num, g, aoff):
        per = s['per']
        # unchanged frames are left out of the file: repeat the previous picture for them
        rgb = np.array(pal, np.uint8)[np.frombuffer(bytes(pix), np.uint8)].tobytes() if np else bytes(c for p in pix for c in pal[p])
        while len(frames) < num:
            k = num - len(frames)  # frames until this one; their audio sits just before this frame's
            audio.extend(b[g + aoff - k * per: g + aoff - (k - 1) * per])
            frames.append(frames[-1] if frames else rgb)
        frames.append(rgb)
        # each frame's audio: `per` bytes at its offset from the start of its group
        audio.extend(b[g + aoff:g + aoff + per])

    def delta(data):
        i = 0; pos = 0; n = s['W'] * s['H']
        while i < len(data) and pos < n:
            m = data[i]; i += 1
            if m == 5 and i < len(data) and data[i] != 0:
                pos += (data[i + 1] * 256 + data[i + 2]) * 8; i += 3; continue
            if m == 5: i += 1  # "05 00": an ordinary mask of 0x05
            for bit in range(8):
                if m & (0x80 >> bit):
                    if pos + bit < n and i < len(data): pix[pos + bit] = data[i]
                    i += 1
            pos += 8

    g = 0
    while g < len(b):
        size, prev, typ = struct.unpack('>III', b[g:g + 12])
        assert typ == 2, hex(typ)
        nxt = struct.unpack('>I', b[g + 12:g + 16])[0]
        end = nxt if nxt > g else len(b)
        off = g + size
        while off + 12 <= end:
            size, prev, typ = struct.unpack('>III', b[off:off + 12])
            d = b[off + 12: off + size] if size else b[off + 12:end]
            if typ == 1:
                _, _, W, H, fps, rate = struct.unpack('>6I', d[:24])
                s.update(W=W, H=H, fps=fps, rate=rate, per=rate // fps); pix = bytearray(W * H)
            elif typ == 0x40: set_pal(d)
            elif typ in (0x20, 0x10):
                num, aoff, palOff = struct.unpack('>III', d[:12])
                hdr = 12 if typ == 0x20 else 24
                pix[:] = d[hdr:hdr + s['W'] * s['H']]
                if palOff: set_pal(b[off + palOff: off + size])
                emit(num, g, aoff)
            elif typ == 0x04:
                num, aoff = struct.unpack('>II', d[:8])
                delta(d[8:]); emit(num, g, aoff)
            if size == 0: break
            off += size
        if nxt <= g: break
        g = nxt
    return {'w': s['W'], 'h': s['H'], 'fps': s['fps'], 'rate': s['rate'], 'frames': frames, 'audio': bytes(audio)}


if __name__ == '__main__':
    v = decode(open(sys.argv[1], 'rb').read()); out = sys.argv[2]
    open(out + '.rgb', 'wb').write(b''.join(v['frames'])); open(out + '.u8', 'wb').write(v['audio'])
    n = len(v['frames'])
    print(v['w'], v['h'], v['fps'], v['rate'], n, 'frames', len(v['audio']), 'audio bytes',
          f"{n / v['fps']:.1f}s video {len(v['audio']) / v['rate']:.1f}s audio")
